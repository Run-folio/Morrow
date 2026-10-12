import assert from 'node:assert/strict';
import test from 'node:test';
import {createRecoveryDomainStore,openIndexedDbRecoveryDriver} from '../lib/easyt/durable-recovery-store.ts';
import {createRecoveryLifecycle} from '../lib/easyt/recovery-domain-lifecycle.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {envelope} from './helpers/durable-recovery-fixture.ts';
import {tripRecoveryStorageKey,tripCacheStorageKey,type EasyTBrowserStorage} from '../lib/easyt/storage.ts';
import {claimGuestTripRecoveryForOwner} from '../lib/easyt/storage.ts';
import {IndexedDbModel} from './helpers/recovery-indexeddb-model.ts';
class NativeModel implements EasyTBrowserStorage {
  values=new Map<string,string>();get length(){return this.values.size};key(i:number){return [...this.values.keys()][i]??null};
  getItem(k:string){return this.values.get(k)??null};setItem(k:string,v:string){this.values.set(k,v)};removeItem(k:string){this.values.delete(k)};
}
const ctx=(ownerId:string|null='owner-a',isCurrent=()=>true)=>({ownerId,isCurrent,overflowEnabled:false,accountOverflowQualified:false});
async function seed(driver:MemoryRecoveryDriver,value= envelope()) {
  assert.equal((await createRecoveryDomainStore(driver,{ownerId:value.handle.ownerId,isCurrent:()=>true}).commit({raw:JSON.stringify(value),expectedHead:value.parent,admission:'native-setter-quota'})).kind,'verified');return value;
}
test('domain status overlays exact handle while immutable canonical bytes and native records remain unchanged',async()=>{
  const driver=new MemoryRecoveryDriver(),ls=new NativeModel(),value=await seed(driver),raw=driver.generations.get(driver.key(value.handle,value.handle.writeId));
  assert.equal(await createRecoveryLifecycle(driver,ctx()).write(value,{state:'conflict',conflictReason:'cloud-changed'}),true);
  assert.equal(driver.generations.get(driver.key(value.handle,value.handle.writeId)),raw);assert.equal(ls.values.size,0);
  const read=await createRecoveryLifecycle(driver,ctx()).read(value);assert.equal(read.kind,'ready');if(read.kind==='ready')assert.equal(read.lifecycle?.state,'conflict');
});
test('unbound/stale/wrong-owner lifecycle cannot admit a canonical generation or claim successful metadata',async()=>{
  const driver=new MemoryRecoveryDriver(),value=envelope();
  assert.equal(await createRecoveryLifecycle(driver,ctx()).write(value,{state:'auth'}),false);assert.equal(driver.generations.size,0);
  await seed(driver,value);assert.equal(await createRecoveryLifecycle(driver,ctx('owner-b')).write(value,{state:'auth'}),false);
  const next=envelope('next','owner-a',value.handle);await createRecoveryDomainStore(driver,ctx()).commit({raw:JSON.stringify(next),expectedHead:value.handle,admission:'existing-domain'});
  assert.equal(await createRecoveryLifecycle(driver,ctx()).write(value,{state:'auth'}),false);
});
test('domain discard requires confirmation, cold reopen hides only exact discarded recovery and retains every generation',async()=>{
  const driver=new MemoryRecoveryDriver(),ls=new NativeModel(),value=await seed(driver),handle={...value.handle};
  const broker=createTwoStoreTripPersistence(ls,driver,ctx());assert.equal(await broker.discard(handle,false),false);
  assert.equal(await broker.discard(handle,true),true);assert.equal(driver.generations.has(driver.key(handle,handle.writeId)),true);
  const cold=createTwoStoreTripPersistence(ls,driver,ctx());assert.equal((await cold.read(handle.tripId)).kind,'missing');
  const listed=await cold.list();assert.equal(listed.kind,'ready');if(listed.kind==='ready')assert.equal(listed.recoveries.length,0);
  assert.equal((await cold.current()).kind,'missing');assert.equal(await cold.mark(handle,'pending'),false);
});
test('discarded domain cannot be revived by a stale retained handle; unexplained old raw divergence stays protected',async()=>{
  const driver=new MemoryRecoveryDriver(),ls=new NativeModel(),value=await seed(driver),trip=JSON.parse(value.rawRecovery).trip,broker=createTwoStoreTripPersistence(ls,driver,ctx());
  await broker.discard({...value.handle},true);assert.equal((await broker.save(trip,{replace:{...value.handle},writeId:'revive'})).stored,false);
  ls.values.set(tripRecoveryStorageKey('owner-a',trip.id,'old-tab'),JSON.stringify({...JSON.parse(value.rawRecovery),writeId:'old-tab',trip:{...trip,title:'old raw'}}));
  const before=[...ls.values];assert.equal((await broker.read(trip.id)).kind,'protected');assert.equal(await broker.discard({...value.handle},true),false);assert.deepEqual([...ls.values],before);
});
test('post-commit owner change/readback refusal retains metadata but refuses accepted lifecycle result',async()=>{
  for(const failure of ['owner','readback']) {
    const driver=new MemoryRecoveryDriver(),value=await seed(driver);let active=true;
    driver.afterCommit=()=>{if(failure==='owner')active=false;else driver.fail=new DOMException('Synthetic only','SecurityError')};
    assert.equal(await createRecoveryLifecycle(driver,ctx('owner-a',()=>active)).write(value,{state:'network'}),false);assert.equal(driver.generations.size,2);
  }
});
test('actual IndexedDB adapter qualifies lifecycle binding without relaxing generic owner/request fences',async()=>{
  const model=new IndexedDbModel(),driver=await openIndexedDbRecoveryDriver(model.factory()),value=envelope();
  await createRecoveryDomainStore(driver,ctx()).commit({raw:JSON.stringify(value),expectedHead:null,admission:'native-setter-quota'});
  const before=structuredClone(model.data);
  await assert.rejects(driver.run(value.handle,null,'readwrite',()=>({value:true}),[{scope:{ownerId:'owner-b',kind:'recovery-lifecycle',tripId:value.handle.tripId},writeId:null}]),/security/);
  assert.deepEqual(model.data,before);
  assert.equal(await createRecoveryLifecycle(driver,ctx()).write(value,{state:'network'}),true);
  assert.equal(model.data.get('generations')?.get(JSON.stringify(['owner-a',value.handle.tripId,value.handle.writeId])),JSON.stringify(value));
  assert.equal(await createTwoStoreTripPersistence(new NativeModel(),driver,ctx()).discard({...value.handle},true),true);driver.close?.();
});
test('guest domain claim remains a protected explicit hold in the actual browser adapter, retaining input and every branch',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),oldFetch=globalThis.fetch;
  const model=new IndexedDbModel(),driver=await openIndexedDbRecoveryDriver(model.factory()),ls=new NativeModel(),value=envelope('guest',null);
  await createRecoveryDomainStore(driver,ctx(null)).commit({raw:JSON.stringify(value),expectedHead:null,admission:'native-setter-quota'});
  const before=structuredClone(model.data),nativeBefore=[...ls.values];let calls=0;
  Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{localStorage:ls,indexedDB:model.factory()})});
  globalThis.fetch=()=>{calls++;throw new Error('Synthetic only: forbidden network')};
  try {
    const result=await claimGuestTripRecoveryForOwner(value.handle.tripId,'owner-a');
    assert.equal(result?.stored,false);assert.equal(result?.guestResolved,false);assert.equal(result?.blockedByExistingRecovery,true);
    assert.ok(result&&'claimHeldReason' in result);assert.equal(result.claimHeldReason,'claim-activation-held');
    assert.deepEqual(model.data,before);assert.deepEqual([...ls.values],nativeBefore);assert.equal(calls,0);
  }finally{globalThis.fetch=oldFetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');driver.close?.();}
});
test('unreadable or invalid scoped cache cannot manufacture missing/fresh after domain discard',async()=>{
  for(const failure of ['getter','invalid']) {
    const driver=new MemoryRecoveryDriver(),ls=new NativeModel(),value=await seed(driver),broker=createTwoStoreTripPersistence(ls,driver,ctx());
    await broker.discard({...value.handle},true);
    const key=tripCacheStorageKey('owner-a',value.handle.tripId),get=ls.getItem.bind(ls);
    if(failure==='getter')ls.getItem=k=>{if(k===key)throw new DOMException('Synthetic only','SecurityError');return get(k)};
    else ls.values.set(key,'{invalid raw cache');
    assert.equal((await broker.read(value.handle.tripId)).kind,failure==='getter'?'unavailable':'protected');
    assert.equal((await broker.cached(value.handle.tripId)).kind,failure==='getter'?'unavailable':'protected');
  }
});
test('a G1 lifecycle journal neither labels G2 nor permits a delayed G1 discard to hide it',async()=>{
  const driver=new MemoryRecoveryDriver(),ls=new NativeModel(),first=await seed(driver),store=createRecoveryDomainStore(driver,ctx());
  await createRecoveryLifecycle(driver,ctx()).write(first,{state:'auth'});
  const second=envelope('second','owner-a',first.handle);await store.commit({raw:JSON.stringify(second),expectedHead:first.handle,admission:'existing-domain'});
  const broker=createTwoStoreTripPersistence(ls,driver,ctx()),read=await broker.read(second.handle.tripId);
  assert.equal(read.kind,'found');if(read.kind==='found')assert.equal(read.recovery?.state,'pending');
  assert.equal(await broker.discard({...first.handle},true),false);assert.equal((await broker.read(second.handle.tripId)).kind,'found');
});
test('native divergence during the lifecycle read barrier cannot accept a stale domain selection',async()=>{
  const driver=new MemoryRecoveryDriver(),ls=new NativeModel(),value=await seed(driver),run=driver.run.bind(driver);let injected=false;
  driver.run=async(scope,writeId,mode,decide,entries)=>{
    const result=await run(scope,writeId,mode,decide,entries);
    if(!injected&&mode==='readonly'&&entries?.some(item=>item.scope.kind==='recovery-lifecycle')){
      injected=true;const old={...JSON.parse(value.rawRecovery),writeId:'old-tab'};old.trip.title='competing native work';
      ls.values.set(tripRecoveryStorageKey('owner-a',value.handle.tripId,'old-tab'),JSON.stringify(old));
    }
    return result;
  };
  assert.equal((await createTwoStoreTripPersistence(ls,driver,ctx()).read(value.handle.tripId)).kind,'protected');assert.equal(driver.generations.size,1);assert.equal(ls.values.size,1);
});
