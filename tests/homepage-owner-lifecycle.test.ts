import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {createDurableHomepagePersistence} from '../lib/easyt/homepage-persistence.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {createPendingIntakeReceipt,HOME_TRIP_DRAFT_KEY,discardPendingIntakeForEditInStorage,reservePendingDescribeHandoffInStorage,
  type PendingIntakeReceipt} from '../lib/easyt/home-trip-handoff.ts';
import {homepageInputStorageKey,homepageDraftStorageKey} from '../lib/easyt/private-browser-context.ts';

// Pinned older persistence code, evaluated only in memory. Its dependencies are
// current; the handoff codecs are unchanged by this candidate. Not an old app bundle.
const base='db146abef3a0de83e8ce8f04bd205a37fccca075';
function baselineModule(file:string,replace:Record<string,string>={}) {
  let source=execFileSync('git',['show',base+':lib/easyt/'+file],{encoding:'utf8',cwd:new URL('..',import.meta.url)});
  source=source.replace(/(['"])(\.\/[^'"]+)\1/g,(_match,q,p)=>q+(replace[p]??new URL('../lib/easyt/'+p.slice(2),import.meta.url).href)+q);
  return 'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64');
}
const oldHomeUrl=baselineModule('homepage-persistence.ts');
const oldHome=await import(oldHomeUrl) as typeof import('../lib/easyt/homepage-persistence.ts');
const oldTrip=await import(baselineModule('two-store-trip-persistence.ts',{'./homepage-persistence.ts':oldHomeUrl})) as typeof import('../lib/easyt/two-store-trip-persistence.ts');
const oldPersistence=oldHome.createDurableHomepagePersistence;

class MemoryStorage {
  values=new Map<string,string>();failKey:string|null=null;quotaRecovery=false;
  get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,raw:string){if(key===this.failKey||this.quotaRecovery&&key.startsWith('easyt:trip-recovery:'))throw new DOMException('Synthetic quota only','QuotaExceededError');this.values.set(key,raw);}
  removeItem(key:string){this.values.delete(key);}
}
const context=(ownerId:string|null)=>({ownerId,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
const lock=async<T,>(_key:string,run:()=>Promise<T>)=>run();
function pending(ownerId:string|null,name:string){
  const snapshot={...emptyHomepageInput(ownerId),mode:'describe' as const,prompt:name};
  const receipt=createPendingIntakeReceipt(snapshot,{handoffId:name,tripId:name});
  return {snapshot,receipt,bundle:{version:1 as const,inputRaw:JSON.stringify({snapshot,receipt}),draftRaw:JSON.stringify({version:2,phase:'pending-interpretation',receipt})}};
}
function fixture(){
  const storage=new MemoryStorage(),driver=new MemoryRecoveryDriver(),foreign=pending('foreign-owner','foreign-trip'),guest=pending(null,'guest-trip');
  storage.setItem(homepageInputStorageKey('foreign-owner'),foreign.bundle.inputRaw);storage.setItem(HOME_TRIP_DRAFT_KEY,foreign.bundle.draftRaw);
  const store=(ownerId:string|null)=>createDurableHomepagePersistence(storage,driver,context(ownerId));
  return {storage,driver,foreign,guest,store};
}
async function discard(store:ReturnType<typeof createDurableHomepagePersistence>,receipt:PendingIntakeReceipt,id:string){
  const prepared=await store.prepare(stage=>discardPendingIntakeForEditInStorage({storage:stage,receipt,fromHomepage:true,isCurrent:()=>true,lock}),id);
  assert.equal(prepared.kind,'prepared');if(prepared.kind!=='prepared')throw new Error('Discard was not prepared');assert.equal(prepared.value.ok,true);
  assert.equal((await store.write(prepared.raw,{expected:prepared.entry})).kind,'verified');
}
test('an empty scoped tombstone cannot strand a successful old-client submission or its later current-client discard',async()=>{
  const {storage,driver,foreign,guest,store}=fixture(),modern=store(null);
  assert.equal((await modern.write(JSON.stringify(guest.bundle))).kind,'verified');
  await discard(modern,guest.receipt,'guest-discard');assert.equal(storage.getItem(homepageDraftStorageKey(null)),'null');
  await discard(store('foreign-owner'),foreign.receipt,'foreign-discard');
  const foreignBytes=storage.getItem(homepageInputStorageKey('foreign-owner'));
  const older=oldPersistence(storage,driver,context(null));
  const prepared=await older.prepare(stage=>reservePendingDescribeHandoffInStorage({storage:stage,snapshot:guest.snapshot,isCurrent:()=>true,preserveAndBegin:()=>true,
    createIds:()=>({handoffId:'second-handoff',tripId:'second-trip'}),lock}),'old-submit');
  assert.equal(prepared.kind,'prepared');if(prepared.kind!=='prepared')return;assert.equal(prepared.value.ok,true);if(!prepared.value.ok)return;
  assert.equal((await older.write(prepared.raw,{expected:prepared.entry})).kind,'verified');
  const before=[...storage.values],read=await modern.read();assert.equal(read.kind,'ready');if(read.kind!=='ready')return;
  assert.deepEqual(read.storedInput?.receipt,prepared.value.receipt);assert.deepEqual(read.draft,{version:2,phase:'pending-interpretation',receipt:prepared.value.receipt});
  assert.deepEqual([...storage.values],before,'read never reconciles or mutates copies');
  await discard(modern,prepared.value.receipt,'modern-discard-old');
  assert.equal((await older.read()).kind,'ready');assert.equal(storage.getItem(homepageDraftStorageKey(null)),'null');
  assert.equal(storage.getItem(homepageInputStorageKey('foreign-owner')),foreignBytes);
});
test('accepted IndexedDB intake remains ready and editable after legitimate foreign shared retirement',async()=>{
  const {storage,foreign,guest,store}=fixture();storage.failKey=homepageDraftStorageKey(null);const modern=store(null);
  assert.deepEqual(await modern.write(JSON.stringify(guest.bundle),{allowInitialOverflow:true}),{kind:'verified',backend:'indexeddb-entry'});
  await discard(store('foreign-owner'),foreign.receipt,'foreign-discard');
  const before=[...storage.values],read=await modern.read();assert.equal(read.kind,'ready');if(read.kind!=='ready')return;
  assert.deepEqual(read.storedInput?.receipt,guest.receipt);assert.deepEqual(read.draft,{version:2,phase:'pending-interpretation',receipt:guest.receipt});
  assert.deepEqual([...storage.values],before);
  await discard(modern,guest.receipt,'guest-discard-after-foreign');assert.equal((await modern.read()).kind,'ready');
});
test('an older client can complete its sole shared handoff beside a scoped tombstone through native or quota-backed canonical save',async()=>{
  for(const quotaRecovery of [false,true]){
    const {storage,driver,foreign,guest,store}=fixture(),modern=store(null),home=homeRecoveryFixture();
    assert.equal((await modern.write(JSON.stringify(guest.bundle))).kind,'verified');
    await discard(modern,guest.receipt,'discard-guest');await discard(store('foreign-owner'),foreign.receipt,'discard-foreign');
    const older=oldPersistence(storage,driver,context(null));
    const reservation=await older.prepare(stage=>reservePendingDescribeHandoffInStorage({storage:stage,snapshot:home.snapshot,isCurrent:()=>true,preserveAndBegin:()=>true,
      createIds:()=>({handoffId:home.intake.completed.handoffId,tripId:home.trip.id}),lock}),'old-reserve');
    assert.equal(reservation.kind,'prepared');if(reservation.kind!=='prepared')return;assert.equal(reservation.value.ok,true);if(!reservation.value.ok)return;
    assert.equal((await older.write(reservation.raw,{expected:reservation.entry})).kind,'verified');
    const prepared=await oldHome.prepareIntakeAcknowledgement(storage,driver,context(null),{...home.intake,pending:reservation.value.receipt},home.trip,'old-home-ack');
    assert.equal(prepared.ok,true);if(!prepared.ok)return;
    storage.quotaRecovery=quotaRecovery;const writeId='old-canonical';
    const saved=await oldTrip.createTwoStoreTripPersistence(storage,driver,context(null)).save(home.trip,{newTripOrClone:true,writeId,entries:[prepared.entry],
      entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:home.trip.id,writeId},input:null,receipt:prepared.receipt}});
    assert.equal(saved.stored,true);assert.equal(saved.receiptAcknowledged,true);assert.equal(saved.pointerAcknowledged,true);
    const before=[...storage.values],read=await modern.read();assert.equal(read.kind,'ready');if(read.kind!=='ready')return;
    assert.deepEqual(read.storedInput?.receipt,home.intake.completed);assert.deepEqual(read.draft,home.draft);
    assert.deepEqual([...storage.values],before);assert.equal(storage.getItem(homepageDraftStorageKey(null)),'null');
  }
});
test('foreign replacement cannot revoke accepted overflow but malformed or newly owned shared bytes remain protected',async()=>{
  for(const replacement of [null,pending('another-owner','another-trip').bundle.draftRaw,'{',pending(null,'competing-guest').bundle.draftRaw]){
    const {storage,guest,store}=fixture();storage.failKey=homepageDraftStorageKey(null);const modern=store(null);
    assert.equal((await modern.write(JSON.stringify(guest.bundle),{allowInitialOverflow:true})).kind,'verified');
    if(replacement===null)storage.removeItem(HOME_TRIP_DRAFT_KEY);else storage.setItem(HOME_TRIP_DRAFT_KEY,replacement);
    const before=[...storage.values],read=await modern.read();
    assert.equal(read.kind,replacement===null||replacement===pending('another-owner','another-trip').bundle.draftRaw?'ready':'protected');
    assert.deepEqual([...storage.values],before);
  }
});
test('foreign-independent overflow comparison still protects a changed current-owner input',async()=>{
  const {storage,guest,store}=fixture();storage.failKey=homepageDraftStorageKey(null);const modern=store(null);
  assert.equal((await modern.write(JSON.stringify(guest.bundle),{allowInitialOverflow:true})).kind,'verified');
  storage.setItem(homepageInputStorageKey(null),JSON.stringify({snapshot:{...guest.snapshot,prompt:'new concurrent owner input'}}));
  const before=[...storage.values];assert.equal((await modern.read()).kind,'protected');assert.deepEqual([...storage.values],before);
});
test('old canonical quota ACK remains readable when its native input-only witness has an exact scoped pending duplicate',async()=>{
  const {storage,driver,foreign,store}=fixture(),home=homeRecoveryFixture(),modern=store(null);
  const receipt=createPendingIntakeReceipt(home.snapshot,{tripId:home.trip.id,handoffId:home.intake.completed.handoffId});
  const inputRaw=JSON.stringify({snapshot:home.snapshot,receipt}),draftRaw=JSON.stringify({version:2,phase:'pending-interpretation',receipt});
  assert.equal((await modern.write(JSON.stringify({version:1,inputRaw,draftRaw}))).kind,'verified');
  // Retained pre-fence representation remains readable; new writes are fenced
  // in the separate regression below. This models an interrupted older format.
  storage.setItem(homepageInputStorageKey(null),inputRaw);
  await discard(store('foreign-owner'),foreign.receipt,'foreign-discard');
  const oldState=await oldPersistence(storage,driver,context(null)).read();assert.equal(oldState.kind,'ready');if(oldState.kind!=='ready')return;assert.equal(oldState.draft,null);
  const prepared=await oldHome.prepareIntakeAcknowledgement(storage,driver,context(null),{...home.intake,pending:receipt,fromHomepage:false},home.trip,'old-home-ack');
  assert.equal(prepared.ok,true);if(!prepared.ok)return;
  storage.quotaRecovery=true;const before=[...storage.values],writeId='old-canonical';
  const saved=await oldTrip.createTwoStoreTripPersistence(storage,driver,context(null)).save(home.trip,{newTripOrClone:true,writeId,entries:[prepared.entry],
    entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:home.trip.id,writeId},input:null,receipt:prepared.receipt}});
  assert.equal(saved.stored,true);assert.equal(saved.receiptAcknowledged,true);assert.equal(saved.pointerAcknowledged,true);
  const read=await modern.read();assert.equal(read.kind,'ready');if(read.kind!=='ready')return;
  assert.deepEqual(read.storedInput?.receipt,home.intake.completed);assert.equal(read.draft,null);
  assert.deepEqual([...storage.values],before,'current read preserves the original pending physical pair and canonical entry');
  const canonical=await createTwoStoreTripPersistence(storage,driver,context(null)).read(home.trip.id);assert.equal(canonical.kind,'found');
  if(canonical.kind==='found')assert.deepEqual(canonical.trip,JSON.parse(JSON.stringify(home.trip)),'canonical JSON body is preserved exactly');
  storage.setItem(homepageDraftStorageKey(null),JSON.stringify({...JSON.parse(draftRaw),concurrentOwnerField:'retained-current-owner-data'}));
  assert.equal((await modern.read()).kind,'protected','owned envelope bytes with extra data are not an exact pending duplicate');
  storage.setItem(homepageDraftStorageKey(null),pending(null,'different-pending-receipt').bundle.draftRaw);
  assert.equal((await modern.read()).kind,'protected','a different scoped pending receipt is not equivalent');
  storage.setItem(homepageDraftStorageKey(null),JSON.stringify(home.draft));
  assert.equal((await modern.read()).kind,'protected','a full completed draft is not discarded as redundant pending input');
});
test('active scoped input fences old direct abandonment before it can strand a replacement handoff',async()=>{
  const {storage,driver,foreign,guest,store}=fixture(),modern=store(null);
  assert.equal((await modern.write(JSON.stringify(guest.bundle))).kind,'verified');
  await discard(store('foreign-owner'),foreign.receipt,'foreign-discard');
  const before=[...storage.values],older=oldPersistence(storage,driver,context(null));
  assert.equal((await older.read()).kind,'protected','an old reader cannot mutate an intake whose scoped envelope it cannot read');
  const attempted=await older.prepare(stage=>discardPendingIntakeForEditInStorage({storage:stage,receipt:guest.receipt,fromHomepage:false,isCurrent:()=>true,lock}),'old-abandon');
  assert.equal(attempted.kind,'protected');assert.deepEqual([...storage.values],before);
  const read=await modern.read();assert.equal(read.kind,'ready');if(read.kind!=='ready')return;
  assert.equal(read.inputRaw,guest.bundle.inputRaw);assert.deepEqual(read.storedInput?.receipt,guest.receipt);
  await discard(modern,guest.receipt,'current-abandon');
  assert.equal((await older.read()).kind,'ready','an old client can edit again after current retirement removes the fence');
  const next=await older.prepare(stage=>reservePendingDescribeHandoffInStorage({storage:stage,snapshot:{...guest.snapshot,revision:1,prompt:'new trip'},isCurrent:()=>true,preserveAndBegin:()=>true,
    createIds:()=>({handoffId:'new-handoff',tripId:'new-trip'}),lock}),'old-new');
  assert.equal(next.kind,'prepared');if(next.kind!=='prepared')return;assert.equal(next.value.ok,true);if(!next.value.ok)return;
  assert.equal((await older.write(next.raw,{expected:next.entry})).kind,'verified');
  const reopened=await modern.read();assert.equal(reopened.kind,'ready');if(reopened.kind==='ready')assert.deepEqual(reopened.storedInput?.receipt,next.value.receipt);
});
test('every native creation and retirement boundary keeps live scoped data fenced, including failed compensation',async()=>{
  for(const fault of ['none','retirement-input','retirement-input-and-compensation'] as const){
    const {storage,guest,store}=fixture(),modern=store(null),states:Array<Map<string,string>>=[];
    const inputKey=homepageInputStorageKey(null),draftKey=homepageDraftStorageKey(null),set=storage.setItem.bind(storage),remove=storage.removeItem.bind(storage);
    let retiring=false;
    storage.setItem=(key,raw)=>{
      if(retiring&&(key===inputKey||key===draftKey&&raw!=='null'&&fault==='retirement-input-and-compensation')&&fault!=='none')throw new DOMException('Synthetic refusal','SecurityError');
      set(key,raw);states.push(new Map(storage.values));
    };
    storage.removeItem=key=>{remove(key);states.push(new Map(storage.values));};
    assert.equal((await modern.write(JSON.stringify(guest.bundle))).kind,'verified');
    const prepared=await modern.prepare(stage=>discardPendingIntakeForEditInStorage({storage:stage,receipt:guest.receipt,fromHomepage:true,isCurrent:()=>true,lock}),'retire');
    assert.equal(prepared.kind,'prepared');if(prepared.kind!=='prepared')return;retiring=true;
    const result=await modern.write(prepared.raw,{expected:prepared.entry});assert.equal(result.kind,fault==='none'?'verified':'failure');
    for(const state of states){
      const draft=state.get(draftKey);
      if(draft!==undefined&&draft!=='null')assert.ok('ownerScopedHomepageInput' in JSON.parse(state.get(inputKey)??'null'),'no interruption exposes a live scoped draft to an old writer');
    }
    if(fault!=='none'){
      assert.equal(JSON.parse(storage.getItem(inputKey)!).ownerScopedHomepageInput,guest.bundle.inputRaw,'failed retirement preserves exact frozen input');
      assert.equal((await oldPersistence(storage,new MemoryRecoveryDriver(),context(null)).read()).kind,'protected');
    }
  }
});
test('a native no-op fences retained unwrapped pending state and a null logical input still fences a live scoped draft',async()=>{
  for(const inputRaw of [null,pending(null,'guest-trip').bundle.inputRaw]){
    const {storage,driver,guest,store}=fixture(),modern=store(null);
    // A synthetic retained pre-fence native representation, never user data.
    if(inputRaw!==null)storage.setItem(homepageInputStorageKey(null),inputRaw);
    storage.setItem(homepageDraftStorageKey(null),guest.bundle.draftRaw);
    const read=await modern.read();assert.equal(read.kind,'ready');if(read.kind!=='ready')return;
    assert.equal((await modern.write(read.raw)).kind,'verified');
    assert.equal(JSON.parse(storage.getItem(homepageInputStorageKey(null))!).ownerScopedHomepageInput,inputRaw);
    assert.equal((await oldPersistence(storage,driver,context(null)).read()).kind,'protected');
    const current=await modern.read();assert.equal(current.kind,'ready');if(current.kind==='ready')assert.equal(current.inputRaw,inputRaw);
  }
});
test('malformed capability wrappers never bypass owner-input validation or alter any copy',async()=>{
  for(const raw of [JSON.stringify({version:2,ownerScopedHomepageInput:null}),JSON.stringify({version:1,ownerScopedHomepageInput:'{'}),
    JSON.stringify({version:1,ownerScopedHomepageInput:pending('another-owner','another').bundle.inputRaw}),
    JSON.stringify({version:1,ownerScopedHomepageInput:null,extra:'unrecognized'})]){
    const {storage,guest,store}=fixture();storage.setItem(homepageInputStorageKey(null),raw);storage.setItem(homepageDraftStorageKey(null),guest.bundle.draftRaw);
    const before=[...storage.values];assert.equal((await store(null).read()).kind,'protected');assert.deepEqual([...storage.values],before);
  }
});
test('new quota-only scoped intake cannot be abandoned by an older reader after foreign retirement',async()=>{
  const {storage,driver,foreign,guest,store}=fixture();storage.failKey=homepageDraftStorageKey(null);const modern=store(null);
  assert.equal((await modern.write(JSON.stringify(guest.bundle),{allowInitialOverflow:true})).kind,'verified');
  await discard(store('foreign-owner'),foreign.receipt,'foreign-retire');
  const before=[...storage.values],older=oldPersistence(storage,driver,context(null));
  assert.equal((await older.read()).kind,'protected');assert.deepEqual([...storage.values],before);
  const current=await modern.read();assert.equal(current.kind,'ready');if(current.kind==='ready')assert.deepEqual(current.storedInput?.receipt,guest.receipt);
});
test('failed creation compensation cannot release the input fence while its scoped draft remains live',async()=>{
  const {storage,driver,guest,store}=fixture(),draftKey=homepageDraftStorageKey(null),inputKey=homepageInputStorageKey(null);
  const get=storage.getItem.bind(storage),set=storage.setItem.bind(storage),remove=storage.removeItem.bind(storage);let failRead=false,failRemove=false;
  storage.getItem=key=>{if(key===draftKey&&failRead){failRead=false;throw new DOMException('Synthetic readback refusal','SecurityError');}return get(key);};
  storage.setItem=(key,raw)=>{set(key,raw);if(key===draftKey){failRead=true;failRemove=true;}};
  storage.removeItem=key=>{if(key===draftKey&&failRemove)throw new DOMException('Synthetic compensation refusal','SecurityError');remove(key);};
  const result=await store(null).write(JSON.stringify(guest.bundle));assert.equal(result.kind,'failure');
  assert.equal(storage.values.get(draftKey),guest.bundle.draftRaw);
  assert.equal(JSON.parse(storage.values.get(inputKey)??'null')?.ownerScopedHomepageInput,guest.bundle.inputRaw,'a failed scoped restoration must retain the exact input fence');
  assert.equal((await oldPersistence(storage,driver,context(null)).read()).kind,'protected');
});
