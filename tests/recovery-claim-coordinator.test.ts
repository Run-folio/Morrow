import assert from 'node:assert/strict';
import test from 'node:test';
import {createRecoveryClaimCoordinator,readRecoveryClaimBarrier} from '../lib/easyt/recovery-domain-claim.ts';
import {createRecoveryDomainStore,openIndexedDbRecoveryDriver} from '../lib/easyt/durable-recovery-store.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {createRecoveryEntryStore} from '../lib/easyt/durable-entry-store.ts';
import {entryHeadKey,type RecoveryEntryEnvelope} from '../lib/easyt/durable-entry-protocol.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {IndexedDbModel} from './helpers/recovery-indexeddb-model.ts';
import {envelope} from './helpers/durable-recovery-fixture.ts';
import {tripRecoveryStorageKey,currentTripStorageKey,saveTripRecoveryToEasyT,type EasyTBrowserStorage} from '../lib/easyt/storage.ts';
import type {RecoveryDomainDriver} from '../lib/easyt/durable-recovery-domain.ts';
import {createRecoveryLifecycle} from '../lib/easyt/recovery-domain-lifecycle.ts';
import {createTwoStoreEntryPersistence} from '../lib/easyt/two-store-entry-persistence.ts';
import {createDurableHomepagePersistence} from '../lib/easyt/homepage-persistence.ts';
import {builderInputDraftKey,createBuilderInputDraft,updateBuilderInputDraft,readBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {homepageReceiptForProjection,homepageHandoffMatchesTrip,HOME_TRIP_DRAFT_KEY,type HomeTripDraft} from '../lib/easyt/home-trip-handoff.ts';
import {decodeHomepageBundle} from '../lib/easyt/homepage-persistence.ts';
class NativeModel implements EasyTBrowserStorage {
  values=new Map<string,string>();attempts=0;failure:string|null='QuotaExceededError';onAttempt:(()=>void)|null=null;
  get length(){return this.values.size} key(i:number){return [...this.values.keys()][i]??null}
  getItem(k:string){return this.values.get(k)??null} removeItem(k:string){this.values.delete(k)}
  setItem(k:string,v:string){this.attempts++;this.onAttempt?.();if(this.failure)throw new DOMException('Synthetic native failure',this.failure);this.values.set(k,v)}
}
const ctx=(ownerId:string|null='owner-a',isCurrent=()=>true)=>({ownerId,isCurrent,overflowEnabled:true,accountOverflowQualified:true});
async function fixture(native=false,inputs=false) {
  const model=native?new IndexedDbModel():null,driver:RecoveryDomainDriver=model?await openIndexedDbRecoveryDriver(model.factory()):new MemoryRecoveryDriver(),storage=new NativeModel();
  const source=envelope('guest-1',null);source.entry.input=null;source.entry.receipt=null;
  if(inputs) {
    const trip=requireReadableTripDocument(JSON.parse(source.rawRecovery).trip),draft=updateBuilderInputDraft(createBuilderInputDraft(trip,7),trip,{kind:'origin'},'  Lond\n');
    const builderRaw=JSON.stringify(draft);source.entry.input={ownerId:null,tripId:trip.id,inputRevision:draft.inputRevision,raw:builderRaw};
    const snapshot={...emptyHomepageInput(),revision:12,prompt:'  raw untouched\n',originInput:'  London  ',entries:trip.stops.map(stop=>({id:stop.id,text:`  ${stop.name}  `,selection:null})),tripType:{state:'selected' as const,value:'one_way' as const}};
    const {version:_version,ownerId:_owner,revision:_revision,mode:_mode,entries:_entries,prompt:_prompt,...choices}=snapshot;
    const home:HomeTripDraft={handoffId:'completed-home',origin:trip.brief.origin,journeyEnd:trip.brief.journeyEnd,brief:trip.brief.mustDo,
      destinations:trip.stops.map(stop=>({id:stop.id,name:stop.name,country:stop.country,canonicalPlaceId:stop.canonicalPlaceId})),
      homepage:{version:1,ownerId:null,revision:snapshot.revision,mode:snapshot.mode,occurrenceMentionIds:{},choices}};
    const receipt=homepageReceiptForProjection(snapshot,home,trip.id);home.homepage!.receipt=receipt;
    const bundle={version:1,inputRaw:JSON.stringify({snapshot,receipt}),draftRaw:JSON.stringify(home)},homeRaw=JSON.stringify(bundle);
    source.entry.receipt={ownerId:null,tripId:trip.id,operationId:receipt.handoffId,raw:homeRaw};
    for(const [kind,raw] of [['builder-input',builderRaw],['homepage',JSON.stringify({...bundle,draftRaw:null})]] as const) {
      const entry:RecoveryEntryEnvelope={version:1,handle:{version:1,backend:'indexeddb-entry',ownerId:null,tripId:kind==='homepage'?null:trip.id,kind,writeId:kind+'-guest'},parent:null,raw,
        legacyRaw:kind==='homepage'?JSON.stringify({version:1,inputRaw:null,draftRaw:null}):null,retainedPreviousRaw:null};
      assert.equal((await createRecoveryEntryStore(driver,ctx(null)).commit({raw:JSON.stringify(entry),expectedHead:null,admission:'native-setter-quota'})).kind,'verified');
    }
  }
  assert.equal((await createRecoveryDomainStore(driver,ctx(null)).commit({raw:JSON.stringify(source),expectedHead:null,admission:'native-setter-quota'})).kind,'verified');
  return {model,driver,storage,source,claim:createRecoveryClaimCoordinator(storage,driver,{ownerId:'owner-a',isCurrent:()=>true,enabled:true})};
}
for(const native of [false,true])test(`${native?'actual adapter':'memory'} claim accepts only completed/readback exact destination and retains guest`,async()=>{
  const {driver,storage,source,claim}=await fixture(native),result=await claim.claim(source.handle.tripId);
  assert.equal(result.kind,'verified');assert.equal(storage.attempts,1);assert.equal(storage.values.size,0);
  if(result.kind!=='verified')return;
  assert.equal(result.guestResolved,false);assert.equal(result.accountAcknowledged,false);
  const guest=await createTwoStoreTripPersistence(storage,driver,ctx(null)).read(source.handle.tripId),owned=await createTwoStoreTripPersistence(storage,driver,ctx()).read(source.handle.tripId);
  assert.equal(guest.kind,'found');assert.equal(owned.kind,'found');
  if(owned.kind==='found'){assert.equal(owned.trip.ownerId,null);assert.equal(owned.recovery?.ownerId,'owner-a');}
  const repeat=await claim.claim(source.handle.tripId);assert.equal(repeat.kind,'verified');assert.equal(storage.attempts,1);
  if(repeat.kind==='verified')assert.deepEqual(repeat.handle,result.handle);
});
test('actual claimed ownerless body dispatches insert-only promotion before any account acknowledgement',async()=>{
  const {driver,storage,source,claim}=await fixture(true);assert.equal((await claim.claim(source.handle.tripId)).kind,'verified');
  const owned=await createTwoStoreTripPersistence(storage,driver,ctx()).read(source.handle.tripId);assert.equal(owned.kind,'found');if(owned.kind!=='found'||!owned.recovery)return;
  const calls:{method:string;url:string}[]=[];
  const request:typeof fetch=async(input,init)=>{calls.push({method:init?.method??'GET',url:String(input)});throw new Error('Synthetic no-network sentinel')};
  await assert.rejects(saveTripRecoveryToEasyT(owned.trip,owned.recovery,request));
  assert.deepEqual(calls,[{method:'POST',url:`/api/easyt/trips/${source.handle.tripId}/promote`}]);
});
test('actual claim atomically rebinds required Builder plus consumed HOME and supports cold input/receipt reopening',async()=>{
  const {driver,storage,source,claim}=await fixture(true,true),before=JSON.stringify(source),result=await claim.claim(source.handle.tripId);assert.equal(result.kind,'verified');
  const owned=await createTwoStoreTripPersistence(storage,driver,ctx()).read(source.handle.tripId);assert.equal(owned.kind,'found');if(owned.kind!=='found')return;
  const builder=await createRecoveryEntryStore(driver,ctx()).read({ownerId:'owner-a',kind:'builder-input',tripId:source.handle.tripId});assert.equal(builder.kind,'ready');if(builder.kind!=='ready'||!builder.envelope?.raw)return;
  const typed=readBuilderInputDraft({getItem:()=>builder.envelope!.raw},requireReadableTripDocument(owned.trip),'owner-a');assert.equal(typed.kind,'readable');if(typed.kind==='readable')assert.equal(typed.draft.fields[0].raw,'  Lond\n');
  const home=await createDurableHomepagePersistence(storage,driver,ctx()).read();assert.equal(home.kind,'ready');if(home.kind==='ready')assert.equal(home.draft,null);
  const supporting=decodeHomepageBundle(owned.domain!.envelope!.entry.receipt!.raw,'owner-a');assert.ok(supporting?.draft);assert.equal(homepageHandoffMatchesTrip(supporting.draft as HomeTripDraft,owned.trip),true);
  assert.equal(JSON.stringify(source),before);assert.equal((await createTwoStoreTripPersistence(storage,driver,ctx(null)).read(source.handle.tripId)).kind,'found');
});
for(const kind of ['builder-input','homepage'])test(`actual ${kind} add failure aborts complete claim and keeps all guest metadata`,async()=>{
  const {model,driver,storage,source,claim}=await fixture(true,true);assert.ok(model);const originals=new Map(model.data.get('generations'));
  storage.onAttempt=()=>{model.failAddKeyPrefix=JSON.stringify(['entry','owner-a',kind]).slice(0,-1)};
  assert.notEqual((await claim.claim(source.handle.tripId)).kind,'verified');
  assert.equal(model.data.get('heads')?.has(JSON.stringify(['owner-a',source.handle.tripId])),false);
  assert.equal(model.data.get('heads')?.has(entryHeadKey({ownerId:null,tripId:source.handle.tripId,kind:'recovery-claim'})),false);
  for(const [key,raw] of originals)assert.equal(model.data.get('generations')?.get(key),raw);
  model.failAddKeyPrefix=null;assert.equal((await createTwoStoreTripPersistence(storage,driver,ctx()).list()).kind,'protected');
});
for(const failure of [null,'SecurityError','Error'])test(`pending fence protects fresh destination after native ${failure??'success'} and retains source`,async()=>{
  const {driver,storage,source,claim}=await fixture(true);storage.failure=failure;
  const result=await claim.claim(source.handle.tripId);assert.notEqual(result.kind,'verified');assert.equal(storage.attempts,1);
  const cold=createTwoStoreTripPersistence(storage,driver,ctx());assert.equal((await cold.read(source.handle.tripId)).kind,'protected');
  assert.equal((await cold.list()).kind,'protected');assert.equal((await cold.current()).kind,'protected');
  assert.equal((await createTwoStoreTripPersistence(storage,driver,ctx(null)).read(source.handle.tripId)).kind,'found');
});
test('claim holds required missing input, owner gate and destination conflicts before native mutation',async()=>{
  for(const reason of ['input','gate','target']) {
    const {driver,storage,source}=await fixture();
    if(reason==='input') {
      const next=envelope('guest-2',null,source.handle);next.entry.receipt=null;
      await createRecoveryDomainStore(driver,ctx(null)).commit({raw:JSON.stringify(next),expectedHead:source.handle,admission:'existing-domain'});
    }
    if(reason==='target')await createRecoveryDomainStore(driver,ctx()).commit({raw:JSON.stringify(envelope()),expectedHead:null,admission:'native-setter-quota'});
    const result=await createRecoveryClaimCoordinator(storage,driver,{ownerId:'owner-a',isCurrent:()=>true,enabled:reason!=='gate'}).claim(source.handle.tripId);
    assert.notEqual(result.kind,'verified');assert.equal(storage.attempts,0);
  }
});
test('old guest divergence after verified claim protects owner promotion but keeps both branches',async()=>{
  const {driver,storage,source,claim}=await fixture(),result=await claim.claim(source.handle.tripId);assert.equal(result.kind,'verified');
  const competing={...JSON.parse(source.rawRecovery),writeId:'old-guest',trip:{...JSON.parse(source.rawRecovery).trip,title:'old raw'}};
  storage.values.set(tripRecoveryStorageKey(null,source.handle.tripId,'old-guest'),JSON.stringify(competing));const before=[...storage.values];
  assert.equal((await createTwoStoreTripPersistence(storage,driver,ctx()).read(source.handle.tripId)).kind,'protected');assert.deepEqual([...storage.values],before);
});
test('generic metadata admission cannot forge lifecycle discard or claim proof using a quota string',async()=>{
  const driver=new MemoryRecoveryDriver();
  for(const kind of ['recovery-lifecycle','recovery-claim'] as const) {
    const value:RecoveryEntryEnvelope={version:1,handle:{version:1,backend:'indexeddb-entry',ownerId:'owner-a',tripId:'synthetic-trip',kind,writeId:'forged'},parent:null,legacyRaw:null,retainedPreviousRaw:null,raw:'{}'};
    const result=await createRecoveryEntryStore(driver,ctx()).commit({raw:JSON.stringify(value),expectedHead:null,admission:'native-setter-quota'});
    assert.equal(result.kind,'protected-conflict');assert.equal(driver.heads.has(entryHeadKey(value.handle)),false);
  }
});
test('pending claim holds input/Home writers and canonical/status/discard/promotion callers',async()=>{
  const {driver,storage,source,claim}=await fixture();storage.failure='SecurityError';await claim.claim(source.handle.tripId);
  const owner=createTwoStoreTripPersistence(storage,driver,ctx()),record=JSON.parse(source.rawRecovery),before=[...storage.values];
  assert.equal((await owner.native(source.handle.tripId,()=>{throw new Error('must not run')})).kind,'protected');
  assert.equal((await owner.save({...record.trip,ownerId:'owner-a'},{newTripOrClone:true})).stored,false);
  const entries=createTwoStoreEntryPersistence(storage,driver,{scope:{ownerId:'owner-a',tripId:source.handle.tripId,kind:'builder-input'},key:builderInputDraftKey('owner-a',source.handle.tripId),isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true,validate:()=>true});
  assert.equal((await entries.save('typed',{allowInitialOverflow:true})).kind,'protected');
  assert.equal((await createDurableHomepagePersistence(storage,driver,ctx()).write(JSON.stringify({version:1,inputRaw:null,draftRaw:null}),{allowInitialOverflow:true})).kind,'protected');
  assert.deepEqual([...storage.values],before);assert.equal(storage.attempts,1);
});
for(const mode of ['owner-before-setter','owner-after-setter','source-head','source-input','source-home','source-lifecycle','target-lifecycle','native-source','native-target'])test(`claim refuses ${mode} race and retains source canonical`,async()=>{
  const {driver,storage,source}=await fixture();const memory=driver as MemoryRecoveryDriver;let current=true;
  if(mode==='owner-before-setter')memory.afterCommit=()=>{current=false};
  storage.onAttempt=()=>{
    if(mode==='owner-after-setter')current=false;
    if(mode==='source-head')memory.heads.set(memory.scopeKey(source.handle),JSON.stringify({...source.handle,writeId:'concurrent'}));
    if(mode.startsWith('source-')&&mode!=='source-head')memory.heads.set(entryHeadKey({ownerId:null,tripId:mode==='source-home'?null:source.handle.tripId,kind:mode==='source-home'?'homepage':mode==='source-input'?'builder-input':'recovery-lifecycle'}),'changed');
    if(mode==='target-lifecycle')memory.heads.set(entryHeadKey({ownerId:'owner-a',tripId:source.handle.tripId,kind:'recovery-lifecycle'}),'changed');
    if(mode==='native-source'||mode==='native-target')storage.values.set(tripRecoveryStorageKey(mode==='native-source'?null:'owner-a',source.handle.tripId,'concurrent'),source.rawRecovery);
  };
  const result=await createRecoveryClaimCoordinator(storage,driver,{ownerId:'owner-a',isCurrent:()=>current,enabled:true}).claim(source.handle.tripId);
  assert.notEqual(result.kind,'verified');assert.equal(memory.generations.get(memory.key(source.handle,source.handle.writeId)),JSON.stringify(source));
  assert.equal(memory.heads.has(memory.scopeKey({ownerId:'owner-a',tripId:source.handle.tripId})),false);assert.equal(memory.acknowledgements.size,0);
});
test('source confirmed discard before claim cannot transfer hidden recovery',async()=>{
  const {driver,storage,source,claim}=await fixture();assert.equal(await createRecoveryLifecycle(driver,ctx(null)).write(source,{discard:true}),true);
  assert.notEqual((await claim.claim(source.handle.tripId)).kind,'verified');assert.equal(storage.attempts,0);
});
test('actual adapter transaction abort leaves pending fence but no partial owner generation or source proof',async()=>{
  for(const prefix of ['["owner-a","synthetic-trip",','["entry",null,"recovery-claim",','["entry","owner-a","recovery-claim","synthetic-trip",']) {
    const {model,driver,storage,source,claim}=await fixture(true);assert.ok(model);
    storage.onAttempt=()=>{model.failAddKeyPrefix=prefix};
    assert.notEqual((await claim.claim(source.handle.tripId)).kind,'verified');
    assert.equal(model.data.get('heads')?.has(JSON.stringify(['owner-a',source.handle.tripId])),false);
    assert.equal(model.data.get('heads')?.has(entryHeadKey({ownerId:null,tripId:source.handle.tripId,kind:'recovery-claim'})),false);
    assert.equal(model.data.get('generations')?.get(JSON.stringify([null,source.handle.tripId,source.handle.writeId])),JSON.stringify(source));
    model.failAddKeyPrefix=null;assert.equal((await createTwoStoreTripPersistence(storage,driver,ctx()).current()).kind,'protected');
  }
});
test('actual adapter accepts claim only after final transaction completion and independent readback',async()=>{
  const {model,storage,source,claim}=await fixture(true);assert.ok(model);let started!:()=>void,settled=false;
  const entered=new Promise<void>(resolve=>{started=resolve});storage.onAttempt=()=>{model.holdCompletion=true;started()};
  const work=claim.claim(source.handle.tripId).then(value=>{settled=true;return value});await entered;await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(settled,false);assert.equal(model.data.get('heads')?.has(JSON.stringify(['owner-a',source.handle.tripId])),false);
  assert.ok(model.pendingCompletion);model.holdCompletion=false;model.pendingCompletion();assert.equal((await work).kind,'verified');
});
test('committed claim readback failure reports unknown and preserves immutable source/target, never account ACK',async()=>{
  const {driver,storage,source,claim}=await fixture();const memory=driver as MemoryRecoveryDriver;let commits=0;
  memory.afterCommit=()=>{if(++commits===2)memory.fail=new DOMException('Synthetic readback','SecurityError')};
  const result=await claim.claim(source.handle.tripId);assert.notEqual(result.kind,'verified');assert.equal(memory.acknowledgements.size,0);
  assert.equal(memory.generations.get(memory.key(source.handle,source.handle.writeId)),JSON.stringify(source));
  assert.equal(memory.heads.has(memory.scopeKey({ownerId:'owner-a',tripId:source.handle.tripId})),true);
});
test('verified claim body survives ordinary guest navigation and unassociated native navigation/draft changes',async()=>{
  const {driver,storage,source,claim}=await fixture(true);assert.equal((await claim.claim(source.handle.tripId)).kind,'verified');
  assert.equal(await createTwoStoreTripPersistence(storage,driver,ctx(null)).clearCurrent(),true);
  storage.values.set(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:'other-trip'}));
  storage.values.set(currentTripStorageKey('owner-a'),JSON.stringify({version:2,ownerId:'owner-a',tripId:source.handle.tripId}));
  storage.values.set(HOME_TRIP_DRAFT_KEY,JSON.stringify({brief:'unassociated fresh draft'}));
  const owner=createTwoStoreTripPersistence(storage,driver,ctx());assert.equal((await owner.read(source.handle.tripId)).kind,'found');assert.equal((await owner.current()).kind,'found');
});
test('repeat claim cannot acknowledge a target replaced during proof verification; current descendant remains readable',async()=>{
  const {driver,storage,source,claim}=await fixture(true),first=await claim.claim(source.handle.tripId);assert.equal(first.kind,'verified');if(first.kind!=='verified')return;
  const initial=await createRecoveryDomainStore(driver,ctx()).read(source.handle.tripId);assert.equal(initial.kind,'ready');if(initial.kind!=='ready'||!initial.envelope)return;
  const next=structuredClone(initial.envelope),handle={...first.handle,writeId:'owned-next'};
  next.handle=handle;next.parent=first.handle;next.entry.pointer=handle;next.rawRecovery=JSON.stringify({...JSON.parse(next.rawRecovery),writeId:handle.writeId,trip:{...JSON.parse(next.rawRecovery).trip,title:'newer owner edit'}});
  const original=driver.runClaim!.bind(driver);let changed=false;
  driver.runClaim=async(request,mode,decide)=>{
    if(!changed&&mode==='readonly') {changed=true;assert.equal((await createRecoveryDomainStore(driver,ctx()).commit({raw:JSON.stringify(next),expectedHead:first.handle,admission:'existing-domain'})).kind,'verified');}
    return original(request,mode,decide);
  };
  assert.notEqual((await claim.claim(source.handle.tripId)).kind,'verified');driver.runClaim=original;
  const read=await createTwoStoreTripPersistence(storage,driver,ctx()).read(source.handle.tripId);assert.equal(read.kind,'found');if(read.kind==='found')assert.equal(read.trip.title,'newer owner edit');
  assert.equal(storage.attempts,1);
});
test('ordinary owned domain edit preserves claim pointer even when caller rebuilds input metadata',async()=>{
  const {driver,storage,source,claim}=await fixture(true),first=await claim.claim(source.handle.tripId);assert.equal(first.kind,'verified');if(first.kind!=='verified')return;
  const owner=createTwoStoreTripPersistence(storage,driver,ctx()),before=await owner.read(source.handle.tripId);assert.equal(before.kind,'found');if(before.kind!=='found')return;
  const write=await owner.save({...before.trip,title:'owned edited'},{replace:first.handle,writeId:'owned-edited',entry:{pointer:{...first.handle,writeId:'owned-edited'},input:null,receipt:null}});assert.equal(write.stored,true);
  const read=await owner.read(source.handle.tripId);assert.equal(read.kind,'found');if(read.kind==='found')assert.deepEqual(read.domain?.envelope?.entry.claim,before.domain?.envelope?.entry.claim);
});
test('generic canonical admission cannot manufacture or remove the dedicated claim pointer',async()=>{
  const {driver,storage,source,claim}=await fixture(true),forged=envelope('forged-owner','owner-a');
  forged.entry.claim={source:source.handle,claimId:'unproved'};
  assert.equal((await createRecoveryDomainStore(driver,ctx()).commit({raw:JSON.stringify(forged),expectedHead:null,admission:'native-setter-quota'})).kind,'protected-conflict');
  const first=await claim.claim(source.handle.tripId);assert.equal(first.kind,'verified');if(first.kind!=='verified')return;
  const read=await createRecoveryDomainStore(driver,ctx()).read(source.handle.tripId);assert.equal(read.kind,'ready');if(read.kind!=='ready'||!read.envelope)return;
  const next=structuredClone(read.envelope);next.parent=first.handle;next.handle={...first.handle,writeId:'drop-proof'};next.entry.pointer=next.handle;delete next.entry.claim;
  next.rawRecovery=JSON.stringify({...JSON.parse(next.rawRecovery),writeId:'drop-proof'});
  assert.equal((await createRecoveryDomainStore(driver,ctx()).commit({raw:JSON.stringify(next),expectedHead:first.handle,admission:'existing-domain'})).kind,'protected-conflict');
});
test('native pending claim stays protected after its IndexedDB fence disappears or the backend is lost',async()=>{
  const {storage,source,claim}=await fixture(true);storage.failure=null;assert.equal((await claim.claim(source.handle.tripId)).kind,'held');
  const emptyDriver=new MemoryRecoveryDriver(),owner=createTwoStoreTripPersistence(storage,emptyDriver,ctx()),before=[...storage.values];
  assert.equal((await owner.read(source.handle.tripId)).kind,'protected');assert.equal((await owner.current()).kind,'protected');assert.equal((await owner.list()).kind,'protected');
  assert.equal((await owner.save({...JSON.parse(source.rawRecovery).trip},{newTripOrClone:true})).stored,false);
  assert.equal((await owner.native(source.handle.tripId,()=>{throw new Error('Must not write')})).kind,'protected');
  assert.equal((await createDurableHomepagePersistence(storage,emptyDriver,ctx()).read()).kind,'protected');
  const entries=createTwoStoreEntryPersistence(storage,emptyDriver,{scope:{ownerId:'owner-a',tripId:source.handle.tripId,kind:'builder-input'},key:builderInputDraftKey('owner-a',source.handle.tripId),isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true,validate:()=>true});
  assert.equal((await entries.save('new',{allowInitialOverflow:true})).kind,'protected');assert.deepEqual([...storage.values],before);assert.equal(storage.attempts,1);
});
for(const kind of ['builder-input','homepage'])test(`${kind} reader cannot return pre-claim empty metadata after awaiting the new paired proof`,async()=>{
  const {driver,storage,source,claim}=await fixture(true,true),original=driver.runEntry.bind(driver);let first=true,arrived!:()=>void,release!:()=>void;
  const entered=new Promise<void>(resolve=>{arrived=resolve}),gate=new Promise<void>(resolve=>{release=resolve});
  driver.runEntry=async(scope,writeId,mode,decide)=>{const result=await original(scope,writeId,mode,decide);
    if(first&&scope.ownerId==='owner-a'&&scope.kind===kind&&mode==='readonly'){first=false;arrived();await gate;}return result;};
  const work=kind==='homepage'?createDurableHomepagePersistence(storage,driver,ctx()).read():createTwoStoreEntryPersistence(storage,driver,{scope:{ownerId:'owner-a',tripId:source.handle.tripId,kind:'builder-input'},key:builderInputDraftKey('owner-a',source.handle.tripId),isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true,validate:()=>true}).read();
  await entered;assert.equal((await claim.claim(source.handle.tripId)).kind,'verified');release();assert.equal((await work).kind,'protected');
});
for(const actual of [false,true])test(`${actual?'actual adapter':'memory'} noncanonical claim namespace key cannot hide a pending fence`,async()=>{
  const {model,driver,storage}=await fixture(actual),alias=' [ "entry", "owner-a", "recovery-claim", "synthetic-trip" ]';
  const raw=JSON.stringify({ownerId:'owner-a',kind:'recovery-claim',tripId:'synthetic-trip',version:1,backend:'indexeddb-entry',writeId:'pending'});
  if(model)model.data.get('heads')!.set(alias,raw);else (driver as MemoryRecoveryDriver).heads.set(alias,raw);
  assert.notEqual((await createTwoStoreTripPersistence(storage,driver,ctx()).current()).kind,'missing');
  assert.equal((await createTwoStoreTripPersistence(storage,driver,ctx()).list()).kind,'unavailable');
});
test('native claim marker introduced during an absent proof read cannot become an accepted recovery',async()=>{
  const {driver,storage,source,claim}=await fixture(true),original=driver.runEntry.bind(driver);let first=true;
  storage.failure=null;
  driver.runEntry=async(scope,writeId,mode,decide)=>{const value=await original(scope,writeId,mode,decide);
    if(first&&scope.ownerId==='owner-a'&&scope.kind==='recovery-claim'&&mode==='readonly') {first=false;assert.equal((await claim.claim(source.handle.tripId)).kind,'held');}return value;};
  const result=await createTwoStoreTripPersistence(storage,driver,ctx()).read(source.handle.tripId);assert.equal(result.kind,'protected');assert.equal(storage.attempts,1);
});
test('native claim introduced in the caller continuation gap is rejected at the accepted native source boundary',async()=>{
  const {storage,source,claim}=await fixture(true);storage.failure=null;assert.equal((await claim.claim(source.handle.tripId)).kind,'held');
  const [candidate]=[...storage.values];assert.ok(candidate);storage.values.clear();let observations=0,introduced=false;
  Object.defineProperty(storage,'length',{get(){if(++observations===8)queueMicrotask(()=>{storage.values.set(candidate[0],candidate[1]);introduced=true});return storage.values.size;}});
  const result=await createTwoStoreTripPersistence(storage,new MemoryRecoveryDriver(),ctx()).read(source.handle.tripId);
  assert.equal(introduced,true);assert.equal(result.kind,'protected');assert.equal(storage.values.get(candidate[0]),candidate[1]);
});
