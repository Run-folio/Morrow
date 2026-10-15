import assert from 'node:assert/strict';
import test from 'node:test';
import {createDurableHomepagePersistence,prepareIntakeAcknowledgement} from '../lib/easyt/homepage-persistence.ts';
import {createPendingIntakeReceipt,HOME_TRIP_DRAFT_KEY,pendingHomepageSubmissionForOwner,
  persistEditableHomepageInputInStorage,reservePendingDescribeHandoffInStorage} from '../lib/easyt/home-trip-handoff.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';

/** Disposable persistence model: no live browser, account, provider, or native quota claim. */
class HomeStorage {
  values=new Map<string,string>();writes=0;failKey:string|null=null;
  get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,raw:string){this.writes++;if(key===this.failKey)throw new DOMException('Synthetic only','QuotaExceededError');this.values.set(key,raw);}
  removeItem(key:string){this.writes++;this.values.delete(key);}
}
const lock=async<T,>(_key:string,work:()=>Promise<T>)=>work();
const draftKey=(owner:string|null)=>homepageInputStorageKey(owner).replace(/homepage-input$/,'homepage-draft');
function pending(ownerId:string|null,name:string) {
  const snapshot={...emptyHomepageInput(ownerId),mode:'describe' as const,prompt:name};
  const receipt=createPendingIntakeReceipt(snapshot,{handoffId:'handoff-'+name,tripId:'trip-'+name});
  return {snapshot,receipt,inputRaw:JSON.stringify({snapshot,receipt}),draftRaw:JSON.stringify({version:2,phase:'pending-interpretation',receipt})};
}
function fixture(ownerId:string|null,foreignOwner:string|null) {
  const storage=new HomeStorage(),driver=new MemoryRecoveryDriver(),foreign=pending(foreignOwner,'foreign');
  storage.values.set(homepageInputStorageKey(foreignOwner),foreign.inputRaw);storage.values.set(HOME_TRIP_DRAFT_KEY,foreign.draftRaw);
  const store=(isCurrent=()=>true)=>createDurableHomepagePersistence(storage,driver,{ownerId,isCurrent,overflowEnabled:false,accountOverflowQualified:false});
  const assertForeign=()=>{assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY),foreign.draftRaw);assert.equal(storage.getItem(homepageInputStorageKey(foreignOwner)),foreign.inputRaw);};
  return {storage,driver,foreign,store,assertForeign};
}
for(const [owner,foreignOwner] of [[null,'owner-a'],['owner-a',null],['owner-b','owner-a']] as const) {
  test(`fresh ${owner??'guest'} intake can edit, submit and reopen while preserving ${foreignOwner??'guest'} pending intake`,async()=>{
    const {storage,driver,store,foreign,assertForeign}=fixture(owner,foreignOwner),before=[...storage.values];
    const initial=await store().read();
    assert.equal(initial.kind,'ready','a foreign legacy pending envelope must not disable fresh current-owner entry');
    if(initial.kind!=='ready')return;
    assert.equal(initial.storedInput,null);assert.equal(initial.draft,null);assert.equal(storage.writes,0);assert.deepEqual([...storage.values],before);
    const snapshot={...emptyHomepageInput(owner),mode:'describe' as const,prompt:'new journey'};
    const editable=await store().prepare(stage=>persistEditableHomepageInputInStorage({storage:stage,snapshot,lock}),'edit');
    assert.equal(editable.kind,'prepared');if(editable.kind!=='prepared')return;assert.equal(editable.value.ok,true);
    assert.equal((await store().write(editable.raw,{expected:editable.entry})).kind,'verified');assertForeign();
    const reserved=await store().prepare(stage=>reservePendingDescribeHandoffInStorage({storage:stage,snapshot,isCurrent:()=>true,
      createIds:()=>({handoffId:'new-handoff',tripId:'new-trip'}),preserveAndBegin:()=>true,lock}),'reserve');
    assert.equal(reserved.kind,'prepared');if(reserved.kind!=='prepared')return;assert.equal(reserved.value.ok,true);
    assert.equal((await store().write(reserved.raw,{expected:reserved.entry})).kind,'verified');assertForeign();
    const cold=await store().read();assert.equal(cold.kind,'ready');if(cold.kind!=='ready')return;
    assert.equal(cold.storedInput?.snapshot.prompt,'new journey');assert.equal(pendingHomepageSubmissionForOwner(cold.storedInput,cold.draft,owner)?.tripId,'new-trip');
    const foreignState=await createDurableHomepagePersistence(storage,driver,{ownerId:foreignOwner,isCurrent:()=>true,overflowEnabled:false,accountOverflowQualified:false}).read();
    assert.equal(foreignState.kind,'ready');if(foreignState.kind==='ready')assert.equal(pendingHomepageSubmissionForOwner(foreignState.storedInput,foreignState.draft,foreignOwner)?.tripId,foreign.receipt.tripId);
    const blockedEdit=await store().prepare(stage=>persistEditableHomepageInputInStorage({storage:stage,snapshot:{...snapshot,prompt:'replace pending'},lock}),'blocked');
    assert.equal(blockedEdit.kind,'prepared');if(blockedEdit.kind==='prepared')assert.deepEqual(blockedEdit.value,{ok:false,reason:'reserved'});
    assertForeign();assert.equal(driver.generations.size,0,'no overflow or account claim is activated');
  });
}
test('scope changes during preparation cannot write current or foreign input',async()=>{
  const {storage,store,assertForeign}=fixture(null,'owner-a');let active=true;
  const result=await store(()=>active).prepare(async stage=>{
    const value=await persistEditableHomepageInputInStorage({storage:stage,snapshot:emptyHomepageInput(null),lock});active=false;return value;
  },'stale');
  assert.equal(result.kind,'protected');assert.equal(storage.writes,0);assertForeign();
});
test('writes and preparation cannot introduce another owner draft into an empty current scope',async()=>{
  const storage=new HomeStorage(),driver=new MemoryRecoveryDriver(),foreign=pending('owner-a','foreign');
  const store=createDurableHomepagePersistence(storage,driver,{ownerId:null,isCurrent:()=>true,overflowEnabled:false,accountOverflowQualified:false});
  const raw=JSON.stringify({version:1,inputRaw:JSON.stringify({snapshot:emptyHomepageInput(null)}),draftRaw:foreign.draftRaw});
  assert.equal((await store.write(raw)).kind,'protected');assert.equal(storage.writes,0);assert.equal(storage.values.size,0);
  const prepared=await store.prepare(async stage=>{stage.setItem(HOME_TRIP_DRAFT_KEY,foreign.draftRaw);return true;},'foreign');
  assert.equal(prepared.kind,'protected');assert.equal(storage.writes,0);assert.equal(storage.values.size,0);
});
test('a scoped draft quota failure preserves both the foreign reservation and prior current-owner bytes',async()=>{
  const {storage,store,assertForeign}=fixture(null,'owner-a'),value=pending(null,'guest');storage.failKey=draftKey(null);
  const before=[...storage.values];
  const result=await store().write(JSON.stringify({version:1,inputRaw:value.inputRaw,draftRaw:value.draftRaw}),{allowInitialOverflow:true});
  assert.equal(result.kind,'failure');assert.deepEqual([...storage.values],before);assertForeign();
});
test('competing owned legacy and scoped drafts stay protected without selecting a winner',async()=>{
  const {storage,store}=fixture(null,'owner-a');storage.values.set(HOME_TRIP_DRAFT_KEY,pending(null,'legacy-guest').draftRaw);
  storage.values.set(draftKey(null),pending(null,'scoped-guest').draftRaw);const before=[...storage.values];
  assert.equal((await store().read()).kind,'protected');assert.equal(storage.writes,0);assert.deepEqual([...storage.values],before);
});
test('corrupt or foreign data in a current-owner scoped slot remains protected without changing any copy',async()=>{
  for(const raw of ['{',pending('owner-other','other').draftRaw]) {
    const {storage,store,assertForeign}=fixture(null,'owner-a');storage.values.set(draftKey(null),raw);const before=[...storage.values];
    assert.equal((await store().read()).kind,'protected');assert.equal(storage.writes,0);assert.deepEqual([...storage.values],before);assertForeign();
  }
});
test('an owned pending input is still reserved when the shared envelope belongs to another owner',async()=>{
  const {storage,store,assertForeign}=fixture(null,'owner-a'),owned=pending(null,'guest');storage.values.set(homepageInputStorageKey(null),owned.inputRaw);
  const state=await store().read();assert.equal(state.kind,'ready');if(state.kind!=='ready')return;
  assert.equal(pendingHomepageSubmissionForOwner(state.storedInput,state.draft,null)?.tripId,owned.receipt.tripId);
  const attempted=await store().prepare(stage=>persistEditableHomepageInputInStorage({storage:stage,snapshot:emptyHomepageInput(null),lock}),'replace');
  assert.equal(attempted.kind,'prepared');if(attempted.kind==='prepared')assert.deepEqual(attempted.value,{ok:false,reason:'reserved'});
  assert.equal(storage.getItem(homepageInputStorageKey(null)),owned.inputRaw);assert.equal(storage.writes,0);assertForeign();
});
test('retiring an owned scoped handoff cannot reveal or delete the retained foreign handoff',async()=>{
  const {storage,store,assertForeign}=fixture(null,'owner-a'),value=pending(null,'guest');
  assert.equal((await store().write(JSON.stringify({version:1,inputRaw:value.inputRaw,draftRaw:value.draftRaw}))).kind,'verified');
  const cleanup=await store().prepare(async stage=>{stage.removeItem(HOME_TRIP_DRAFT_KEY);return true;},'retire');
  assert.equal(cleanup.kind,'prepared');if(cleanup.kind!=='prepared')return;
  assert.equal((await store().write(cleanup.raw,{expected:cleanup.entry})).kind,'verified');assertForeign();
  const cold=await store().read();assert.equal(cold.kind,'ready');if(cold.kind==='ready')assert.equal(cold.draft,null);
});
test('canonical receipt acknowledgement includes the scoped handoff and preserves the foreign pending copy',async()=>{
  const {storage,driver,store,assertForeign}=fixture(null,'owner-a'),home=homeRecoveryFixture();
  const receipt=createPendingIntakeReceipt(home.snapshot,{handoffId:home.intake.completed.handoffId,tripId:home.trip.id});
  assert.equal((await store().write(JSON.stringify({version:1,inputRaw:JSON.stringify({snapshot:home.snapshot,receipt}),
    draftRaw:JSON.stringify({version:2,phase:'pending-interpretation',receipt})}))).kind,'verified');
  const context={ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:false};
  const prepared=await prepareIntakeAcknowledgement(storage,driver,context,{...home.intake,pending:receipt},home.trip,'canonical-home');
  assert.equal(prepared.ok,true);if(!prepared.ok)return;
  const before=[...storage.values];storage.failKey='easyt:trip-recovery:v2:guest:'+encodeURIComponent(home.trip.id)+':canonical';
  // Fault injection is confined to the canonical native setter in this model.
  const set=storage.setItem.bind(storage);storage.setItem=(key,raw)=>{if(key.startsWith('easyt:trip-recovery:'))throw new DOMException('Synthetic only','QuotaExceededError');set(key,raw);};
  const result=await createTwoStoreTripPersistence(storage,driver,context).save(home.trip,{newTripOrClone:true,writeId:'canonical',entries:[prepared.entry],
    entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:home.trip.id,writeId:'canonical'},input:null,receipt:prepared.receipt}});
  assert.equal(result.stored,true);assert.equal(result.receiptAcknowledged,true);assert.equal(result.pointerAcknowledged,true);
  const cold=await store().read();assert.equal(cold.kind,'ready');if(cold.kind==='ready')assert.deepEqual(cold.storedInput?.receipt,home.intake.completed);
  assertForeign();assert.deepEqual([...storage.values],before,'the model transaction does not mutate native copies');
});
