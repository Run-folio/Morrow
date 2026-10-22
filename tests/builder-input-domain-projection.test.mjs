// Actual adapter/session path; all device stores and provider responses are isolated.
import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,accepted,copies,coldRead} from './helpers/idb-projection-boundary.mjs';
import {createDurableBuilderInputPersistence} from '../lib/easyt/builder-input-persistence.ts';
import {updateBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {saveTripRecoveryToStorage} from '../lib/easyt/storage.ts';
import {RecoveryDomainError} from '../lib/easyt/durable-recovery-error.ts';

function generationsRetained(h,before){
 for(const [key,raw] of before.domain.get('generations'))assert.equal(h.model.data.get('generations').get(key),raw);
}
const projection=h=>h.trace.writes.filter(w=>w.projection).at(-1)?.result;
for(const owner of [null,'isolated-account'])for(const providerError of [false,true])
 test(`native body with existing input domain completes ${providerError?'failed':'healthy'} route work for ${owner??'guest'}`,async()=>{
  const h=await harness('indexeddb-input',owner);
  try{
   await accepted(h);h.control.providerError=providerError;const before=copies(h);
   await h.run();await h.session.waitForDeviceWrites();
   const next=h.session.getSnapshot();
   assert.equal(projection(h)?.stored,true,'same-source input domain must use the existing paired commit');
   assert.equal(next.routeWorkBlocked,false);assert.equal(next.pendingUnits.some(u=>u.kind!=='recommendation'),false);
   assert.equal(Boolean(next.failedUnits.length),providerError);
   assert.deepEqual(next.draft,before.draft,'raw input/revision is unchanged by transport completion');
   generationsRetained(h,before);
   const cold=await coldRead(h);assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,next.trip);
   await h.session.resumeNecessaryWork();await h.session.waitForDeviceWrites();
   assert.equal(h.trace.reconcileCalls,1,'settled route work must not be requested again');
   assert.equal(h.trace.accountWrites,0);
  }finally{h.close();}
 });

for(const interruption of ['owner','new-input','other-branch','clear-current'])
 test(`mixed input projection refuses ${interruption} without changing the observed competing source`,async()=>{
  const h=await harness('indexeddb-input');let after;
  try{
   await accepted(h);
   h.control.beforeProjectionSave=async({trip})=>{
    if(interruption==='owner')h.rotate();
    if(interruption==='new-input'){
     const next=updateBuilderInputDraft(h.session.getSnapshot().draft,trip,{kind:'destination-add'},'newer retained text',null);
     const input=createDurableBuilderInputPersistence(h.storage,h.driver,{trip,ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
     assert.equal((await input.write(next)).ok,true);
    }
    if(interruption==='other-branch'){
     const snap=h.session.getSnapshot();
     assert.equal(saveTripRecoveryToStorage(h.storage,{...snap.trip,title:'Independent branch'},
      {ownerId:null,replace:snap.recovery,writeId:'independent-source',deferRetirement:true}).stored,true);
    }
    if(interruption==='clear-current')assert.equal(await h.broker(()=>true).clearCurrent(),true);
    after={native:structuredClone([...h.storage.values]),domain:structuredClone(h.model.data)};
   };
   await h.run();await h.session.waitForDeviceWrites();assert.ok(after);
   assert.notEqual(projection(h)?.stored,true);
   assert.deepEqual([...h.storage.values],after.native);assert.deepEqual(h.model.data,after.domain);
   assert.equal(h.trace.accountWrites,0);
  }finally{h.close();}
 });

test('mixed paired input commit with an uncertain acknowledgement preserves source and target generations',async()=>{
 const h=await harness('indexeddb-input');
 try{
  await accepted(h);const before=copies(h),run=h.driver.runEntry.bind(h.driver);let target,committed=false;
  h.control.beforeProjectionSave=async({options})=>{target=JSON.parse(options.entries[0].raw).handle.writeId;};
  h.driver.runEntry=async(scope,id,mode,decide)=>{
   const value=await run(scope,id,mode,decide);
   if(!committed&&scope.kind==='builder-input'&&id===target&&mode==='readwrite'){
    committed=true;throw new RecoveryDomainError('readback','unconfirmed');
   }
   return value;
  };
  await h.run();await h.session.waitForDeviceWrites();assert.equal(committed,true);
  assert.equal(projection(h)?.stored,false);assert.deepEqual(h.session.getSnapshot().trip,before.trip);
  generationsRetained(h,before);
  for(const [key,raw]of before.native)if(key.startsWith('easyt:trip-recovery:'))assert.equal(h.storage.getItem(key),raw);
  assert.ok(h.model.data.get('generations').size>before.domain.get('generations').size);
  assert.equal(h.trace.accountWrites,0);
 }finally{h.close();}
});

test('navigation during mixed input commit preserves the predecessor and never acknowledges the old pointer',async()=>{
 const h=await harness('indexeddb-input');
 try{
  await accepted(h);let target,after,navigation,reached=0;
  h.control.beforeProjectionSave=async({options})=>{target=JSON.parse(options.entries[0].raw).handle.writeId};
  const run=h.driver.runEntry.bind(h.driver);
  h.driver.runEntry=async(scope,id,mode,decide)=>{
   if(id===target&&mode==='readwrite'&&!reached){
    reached++;const trip={...structuredClone(h.session.getSnapshot().trip),id:'other-synthetic-trip'};
    navigation=await h.broker(()=>true).save(trip,{newTripOrClone:true,writeId:'other'});after=copies(h);
   }
   return run(scope,id,mode,decide);
  };
  await h.run();await h.session.waitForDeviceWrites();assert.equal(navigation.stored,true);
  const result=projection(h);assert.equal(result.stored,false);assert.equal(result.pointerAcknowledged,false);
  for(const[key,raw]of after.native)if(key.startsWith('easyt:trip-recovery:'))assert.equal(h.storage.getItem(key),raw);
  const selected=await h.broker(()=>true).current();assert.equal(selected.kind,'found');assert.equal(selected.trip.id,'other-synthetic-trip');
 }finally{h.close();}
});

for(const boundary of ['before-pointer-cas','after-pointer-cas','lost-pointer-readback'])
 test(`mixed projection keeps source when ${boundary}`,async()=>{
 const h=await harness('indexeddb-input');
 try{
  await accepted(h);const before=copies(h),originalRun=h.driver.run.bind(h.driver),originalRead=h.driver.readCurrent.bind(h.driver);
  let armed=false,reached=false,committed=false;
  h.control.beforeProjectionSave=async()=>{armed=true};
  const navigate=async()=>{
   const other={...structuredClone(h.session.getSnapshot().trip),id:'other-at-cas'};
   assert.equal((await h.broker(()=>true).save(other,{newTripOrClone:true,writeId:'other-at-cas'})).stored,true);
  };
  h.driver.run=async(scope,id,mode,...rest)=>{
   if(armed&&!reached&&scope.tripId===before.trip.id&&mode==='readwrite'&&id===null){
    reached=true;
    if(boundary==='before-pointer-cas')await navigate();
    const result=await originalRun(scope,id,mode,...rest);committed=true;
    if(boundary==='after-pointer-cas')await navigate();
    return result;
   }
   return originalRun(scope,id,mode,...rest);
  };
  h.driver.readCurrent=async owner=>{
   if(boundary==='lost-pointer-readback'&&committed){committed=false;throw new RecoveryDomainError('readback','unconfirmed');}
   return originalRead(owner);
  };
  await h.run();await h.session.waitForDeviceWrites();assert.equal(reached,true);
  assert.equal(projection(h).stored,false);assert.equal(projection(h).pointerAcknowledged,false);
  for(const[key,raw]of before.native)if(key.startsWith('easyt:trip-recovery:'))assert.equal(h.storage.getItem(key),raw);
  generationsRetained(h,before);assert.equal(h.trace.accountWrites,0);
 }finally{h.close();}
});
