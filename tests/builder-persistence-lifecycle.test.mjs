// Source regression gate. Actual session/brokers; synthetic ports, no browser or account access.
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { normalizeLegacyGeneratedDayContext } from '../lib/easyt/itinerary-generated-context.ts';
import { createAsyncBuilderEditSession } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { createTwoStoreTripPersistence } from '../lib/easyt/two-store-trip-persistence.ts';
import { createDurableBuilderInputPersistence } from '../lib/easyt/builder-input-persistence.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { currentTripStorageKey, tripCacheStorageKey, tripRecoveryStorageKey, saveTripRecoveryToStorage } from '../lib/easyt/storage.ts';
import { builderInputDraftKey } from '../lib/easyt/trip-builder-input-draft.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
const initial={version:2,ownerId:null,tripId:'batch14-trip',writeId:'lifecycle-source',state:'pending',savedAt:'2026-10-13T00:00:00.000Z',
 trip:requireReadableTripDocument({...normalizeLegacyGeneratedDayContext(canonicalRouteFixture()),ownerId:null})};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class MemoryStorage {
 values=new Map(); get length(){return this.values.size;} key(i){return [...this.values.keys()][i]??null;}
 getItem(k){return this.values.get(k)??null;} setItem(k,v){this.values.set(k,v);} removeItem(k){this.values.delete(k);}
}
async function harness(boundary) {
 const storage=new MemoryStorage(),driver=new MemoryRecoveryDriver(),trip=requireReadableTripDocument(structuredClone(initial.trip));
 const priorKey=tripRecoveryStorageKey(null,trip.id,initial.writeId),priorRaw=JSON.stringify(initial);
 storage.setItem(priorKey,priorRaw);storage.setItem(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:trip.id}));
 const targetId='lifecycle-target',targetKey=tripRecoveryStorageKey(null,trip.id,targetId),inputKey=builderInputDraftKey(null,trip.id);
 const entered=deferred(),release=deferred();let held=false,owner=null,accountWrites=0,callbackCalls=0,storedResult;
 const pause=async()=>{if(held)return;held=true;entered.resolve();await release.promise;};
 const context=isCurrent=>({ownerId:null,isCurrent,overflowEnabled:false,accountOverflowQualified:false});
 const reader=()=>createTwoStoreTripPersistence(storage,driver,context(()=>true));
 const runEntry=driver.runEntry.bind(driver),run=driver.run.bind(driver),readCurrent=driver.readCurrent.bind(driver);
 driver.runEntry=async(...args)=>{if(boundary==='body-before-input'&&storage.values.has(targetKey)&&args[0].kind==='builder-input')await pause();return runEntry(...args);};
 driver.run=async(...args)=>{if(boundary==='input-before-pointer'&&args[0].tripId===trip.id&&args[2]==='readwrite'&&storage.values.has(targetKey))await pause();return run(...args);};
 driver.readCurrent=async scope=>{if(boundary==='inspection-before-body'&&callbackCalls&& !storage.values.has(targetKey))await pause();if(boundary==='pointer-before-readback'&&driver.heads.get(JSON.stringify([null])))await pause();return readCurrent(scope);};
 const options={initialTrip:trip,initialRecovery:structuredClone(initial),getOwnerId:()=>owner,
  readDraft:()=>({kind:'empty'}),
  writeDraft:(t,d,o,g)=>createDurableBuilderInputPersistence(storage,driver,{trip:t,...context(g.isCurrent)}).write(d),
  saveRecovery:async(t,m)=>{
   callbackCalls++;
   if(boundary==='reserved-before-body')await pause();
   const input=createDurableBuilderInputPersistence(storage,driver,{trip:t,...context(m.isCurrent)});
   const prepared=await input.prepare(m.draft,targetId+':input');
   if(!prepared.ok)return storedResult={stored:false,handle:{ownerId:null,tripId:t.id,writeId:targetId},blockedByExistingRecovery:prepared.reason==='protected',failureReason:'protected-recovery',writeAttempted:false};
   return storedResult=await createTwoStoreTripPersistence(storage,driver,context(m.isCurrent)).save(t,{replace:m.replace,state:m.state,canonicalBase:m.canonicalBase,writeId:targetId,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:t.id,writeId:targetId},input:prepared.input,receipt:null}});
  },acknowledgeRecovery:()=>{throw Error('Unexpected guest account ACK');},persistAccount:()=>{accountWrites++;throw Error('Unexpected account write');},
  reconcile:()=>{throw Error('No optional work in this test');},now:()=> '2026-10-13T00:00:00.000Z',schedule:()=>()=>{},
 };
 const session=await createAsyncBuilderEditSession(options);
 return {session,storage,driver,trip,priorKey,priorRaw,targetKey,inputKey,entered,release,reader,options,
  rotate:()=>{owner='foreign-owner';},get counts(){return {accountWrites,callbackCalls};},get storedResult(){return storedResult;}};
}
for(const boundary of ['reserved-before-body','inspection-before-body','body-before-input','input-before-pointer','pointer-before-readback']) {
 for(const interrupt of ['none','new-raw','owner','foreign-body','foreign-head']) {
  test(`${boundary}: ${interrupt}`,{timeout:5000},async()=>{
   const h=await harness(boundary);let rawSave,foreign;
   const pending=h.session.accept({kind:'budget',budget:'high'},h.session.getSnapshot().inputRevision);
   const reached=await Promise.race([h.entered.promise.then(()=>true),pending.then(()=>false)]);assert.equal(reached,true,'physical boundary reached');
   if(interrupt==='new-raw')rawSave=h.session.updateDraft({binding:{kind:'origin'},raw:'  GUA newer raw  '});
   if(interrupt==='owner')h.rotate();
   if(interrupt==='foreign-body'){
    const key=h.storage.values.has(h.priorKey)?h.priorKey:h.targetKey;
    const record=JSON.parse(h.storage.getItem(key));record.trip.title='A foreign writer changed this body';
    foreign={key,raw:JSON.stringify(record)};h.storage.setItem(key,foreign.raw);
   }
   if(interrupt==='foreign-head'){
    const record=structuredClone(initial);record.writeId='foreign-generation';record.trip.title='Foreign generation must survive';foreign={key:tripRecoveryStorageKey(null,h.trip.id,record.writeId),raw:JSON.stringify(record)};h.storage.setItem(foreign.key,foreign.raw);
   }
   h.release.resolve();const accepted=await pending;if(rawSave)rawSave=await rawSave;
   const final=await h.reader().read(h.trip.id),snapshot=h.session.getSnapshot();
   if(interrupt==='none'||interrupt==='new-raw'){
    assert.equal(accepted.ok,true,'owned reserved commit must finish despite ordinary raw typing');
    assert.equal(final.kind,'found');assert.equal(final.recovery.writeId,'lifecycle-target');
    assert.equal(final.trip.brief.budgetBand,'high');assert.deepEqual(snapshot.recovery,{ownerId:null,tripId:h.trip.id,writeId:'lifecycle-target'});
    assert.equal([...h.storage.values.keys()].filter(k=>k.startsWith('easyt:trip-recovery:v2:')).length,1);
    if(interrupt==='new-raw'){
     assert.equal(rawSave,true,'newer raw draft must persist after exact canonical completion');
     assert.equal(snapshot.draft.fields.find(f=>f.binding.kind==='origin').raw,'  GUA newer raw  ');
     const read=await createDurableBuilderInputPersistence(h.storage,h.driver,{trip:snapshot.trip,ownerId:null,isCurrent:()=>true,overflowEnabled:false,accountOverflowQualified:false}).read();
     assert.equal(read.kind,'readable');assert.equal(read.draft.fields.find(f=>f.binding.kind==='origin').raw,'  GUA newer raw  ');
    }
   }else{
    assert.equal(accepted.ok,false,'scope/foreign changes never acquire acceptance');
    if(['reserved-before-body','inspection-before-body'].includes(boundary)&&foreign){assert.equal(h.storage.values.has(h.targetKey),false,'source mismatch refuses before any candidate setter');assert.equal(h.storage.getItem(h.inputKey),null,'source mismatch refuses before input setter');}
    assert.equal(snapshot.acceptedRevision,0);assert.deepEqual(snapshot.trip,h.trip);
    if(foreign)assert.equal(h.storage.getItem(foreign.key),foreign.raw,'foreign bytes retained exactly');
   }
   assert.equal(h.counts.accountWrites,0);h.session.dispose();
  });
 }
}
// Break caught: raw typing before the queued callback starts must still cancel stale work.
test('unreserved command retires on new raw input without invoking canonical storage',{timeout:5000},async()=>{
 const h=await harness('none');
 const command=h.session.accept({kind:'budget',budget:'high'},h.session.getSnapshot().inputRevision);
 const raw=h.session.updateDraft({binding:{kind:'origin'},raw:'unreserved newer raw'});
 assert.equal((await command).ok,false);assert.equal(await raw,true);assert.equal(h.counts.callbackCalls,0);
 assert.equal(h.storage.getItem(h.priorKey),h.priorRaw);assert.equal((await h.reader().read(h.trip.id)).kind,'found');h.session.dispose();
});

// Break caught: the supported native writer accepts an explicit reused generation id.
test('same-handle foreign mutation can be produced by the current native writer API',{timeout:5000},async()=>{
 const h=await harness('reserved-before-body');
 const command=h.session.accept({kind:'budget',budget:'high'},h.session.getSnapshot().inputRevision);await h.entered.promise;
 const changed=structuredClone(h.trip);changed.title='Changed through native writer API';
 const result=saveTripRecoveryToStorage(h.storage,changed,{ownerId:null,replace:{ownerId:null,tripId:h.trip.id,writeId:initial.writeId},writeId:initial.writeId});
 assert.equal(result.stored,true);const foreignRaw=h.storage.getItem(h.priorKey);assert.equal(JSON.parse(foreignRaw).trip.title,changed.title);
 h.release.resolve();const accepted=await command;
 assert.equal(accepted.ok,false,'stale hydrated source must not replace the changed body');
 assert.equal(h.storage.getItem(h.priorKey),foreignRaw);h.session.dispose();
});

test('account ACK with optional native cache failure permits the next owned edit',async()=>{
 const storage=new MemoryStorage(),driver=new MemoryRecoveryDriver();
 const trip=requireReadableTripDocument({...structuredClone(initial.trip),ownerId:'owner-a'});
 const context={ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:false,accountOverflowQualified:false};
 const broker=createTwoStoreTripPersistence(storage,driver,context);let sequence=0;
 const session=await createAsyncBuilderEditSession({initialTrip:trip,getOwnerId:()=> 'owner-a',readDraft:()=>({kind:'empty'}),
  writeDraft:(t,d,o,g)=>createDurableBuilderInputPersistence(storage,driver,{...context,trip:t,isCurrent:g.isCurrent}).write(d),
  saveRecovery:async(t,m)=>{
   const id='cache-failure-'+(++sequence),input=createDurableBuilderInputPersistence(storage,driver,{...context,trip:t,isCurrent:m.isCurrent});
   const prepared=await input.prepare(m.draft,id+':input');assert.equal(prepared.ok,true);
   return createTwoStoreTripPersistence(storage,driver,{...context,isCurrent:m.isCurrent}).save(t,{replace:m.replace,canonicalBase:m.canonicalBase,expectedRecoverySource:m.expectedRecoverySource,writeId:id,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:'owner-a',tripId:t.id,writeId:id},input:prepared.input,receipt:null}});
  },
  acknowledgeRecovery:async(reviewed,canonical,handle)=>{
   const cacheKey=tripCacheStorageKey('owner-a',trip.id);
   const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(k===cacheKey||k.includes('trip-cache'))throw Error('synthetic cache failure');set(k,v);};
   try{return await broker.acknowledge(reviewed,canonical,handle);}finally{storage.setItem=set;}
  },
  persistAccount:t=>({...t,updatedAt:'2026-10-14T00:00:00.000Z'}),reconcile:()=>{throw Error('No optional work');},now:()=>initial.savedAt,schedule:()=>()=>{},
 });
 assert.equal((await session.accept({kind:'budget',budget:'high'},session.getSnapshot().inputRevision)).ok,true);
 const before=await broker.read(trip.id);assert.equal(before.kind,'found');
 assert.equal(await session.flush(),true);assert.equal(session.getSnapshot().canonicalSaveState,'cloud');
 assert.ok(session.getSnapshot().recovery,'cache failure retains source');
 assert.notEqual(session.getSnapshot().trip.updatedAt,before.trip.updatedAt);
 assert.equal((await session.accept({kind:'travellers',travellers:4},session.getSnapshot().inputRevision)).ok,true);
 const after=await broker.read(trip.id);assert.equal(after.kind,'found');assert.equal(after.trip.travellers,4);session.dispose();
});
