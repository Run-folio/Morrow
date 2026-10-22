import assert from 'node:assert/strict';
import test from 'node:test';
import { createTwoStoreTripPersistence } from '../lib/easyt/two-store-trip-persistence.ts';
import { createDurableBuilderInputPersistence } from '../lib/easyt/builder-input-persistence.ts';
import { createRecoveryDomainStore } from '../lib/easyt/durable-recovery-store.ts';
import { createBuilderInputDraft, builderInputDraftKey } from '../lib/easyt/trip-builder-input-draft.ts';
import { saveTripRecoveryToStorage, tripRecoveryStorageKey, type EasyTBrowserStorage } from '../lib/easyt/storage.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { envelope } from './helpers/durable-recovery-fixture.ts';

class Storage implements EasyTBrowserStorage {
  values = new Map<string,string>(); writes = 0;
  get length(){return this.values.size;} key(i:number){return [...this.values.keys()][i]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.writes++;this.values.set(key,value);}
  removeItem(key:string){this.writes++;this.values.delete(key);}
}
const context = () => ({ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
const trip = () => requireReadableTripDocument(JSON.parse(envelope('private-trip-source',null).rawRecovery).trip);
const prefix = '[morrovia-persistence-qa] ';
async function capture(run:(packets:any[])=>Promise<void>){
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'), previousFlag=process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS, previousInfo=console.info;
  const packets:any[]=[];
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://staging.morrovia.com',search:''}}});
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='1';
  console.info=(line:unknown)=>{assert.equal(typeof line,'string');if(String(line).startsWith(prefix))packets.push(JSON.parse(String(line).slice(prefix.length)));};
  try{await run(packets);assert.doesNotMatch(JSON.stringify(packets),/private-trip-source|PRIVATE/);}
  finally{console.info=previousInfo;if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');if(previousFlag===undefined)delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS=previousFlag;}
}

test('actual protected body read exposes its finite reason without changing copies or decision',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),value=envelope('private-trip-source',null);
  assert.equal((await createRecoveryDomainStore(driver,context()).commit({raw:JSON.stringify(value),expectedHead:null,admission:'native-setter-quota'})).kind,'verified');
  saveTripRecoveryToStorage(storage,{...trip(),title:'PRIVATE competing branch'},{ownerId:null,writeId:'private-native'});
  const before=structuredClone([...storage.values]),generations=structuredClone([...driver.generations]),writes=storage.writes;
  const broker=createTwoStoreTripPersistence(storage,driver,context());const read=await broker.read(trip().id);assert.equal(read.kind,'protected');
  const result=await broker.save(trip(),{newTripOrClone:true});
  assert.equal(result.blockedByExistingRecovery,true);assert.equal(result.stored,false);
  assert.deepEqual([...storage.values],before);assert.deepEqual([...driver.generations],generations);assert.equal(storage.writes,writes);
  const observed=packets.find(p=>p.protectedWriteCheck==='body-inspect');assert.ok(observed,'body refusal must identify inspection');assert.equal(observed.protectedReadReason,read.kind==='protected'?read.reason:null);assert.equal(observed.writeAttempted,false);
}));

test('actual frozen-source mismatch is distinct from protected read and performs no write',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),broker=createTwoStoreTripPersistence(storage,driver,context()),initial=trip();
  const seeded=await broker.save(initial,{newTripOrClone:true,writeId:'private-seed'});assert.equal(seeded.stored,true);
  const before=structuredClone([...storage.values]),writes=storage.writes;
  const result=await broker.save({...initial,title:'candidate'},{replace:seeded.handle,expectedRecoverySource:{...initial,title:'PRIVATE wrong frozen source'}});
  assert.equal(result.blockedByExistingRecovery,true);assert.equal(result.stored,false);assert.deepEqual([...storage.values],before);assert.equal(storage.writes,writes);
  assert.ok(packets.some(p=>p.protectedWriteCheck==='body-replacement'&&p.writeAttempted===false));
}));

test('actual input preparation identifies trip barrier rather than reporting a body write',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip(),value=envelope('private-trip-source',null);
  await createRecoveryDomainStore(driver,context()).commit({raw:JSON.stringify(value),expectedHead:null,admission:'native-setter-quota'});
  saveTripRecoveryToStorage(storage,{...initial,title:'PRIVATE competing branch'},{ownerId:null,writeId:'private-native'});
  const before=structuredClone([...storage.values]),writes=storage.writes;
  const result=await createDurableBuilderInputPersistence(storage,driver,{trip:initial,...context()}).prepare(createBuilderInputDraft(initial,0,null),'private-input');
  assert.equal(result.ok,false);assert.deepEqual([...storage.values],before);assert.equal(storage.writes,writes);
  assert.ok(packets.some(p=>p.protectedWriteCheck==='input-trip-read'&&p.writeAttempted===false));
  assert.equal(packets.some(p=>p.protectedWriteCheck==='body-inspect'),false);
}));

test('actual malformed input entry reports its own read refusal without exporting bytes',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip();
  await createTwoStoreTripPersistence(storage,driver,context()).save(initial,{newTripOrClone:true,writeId:'private-seed'});
  storage.values.set(builderInputDraftKey(null,initial.id),'PRIVATE invalid input');
  const writes=storage.writes;
  const result=await createDurableBuilderInputPersistence(storage,driver,{trip:initial,...context()}).prepare(createBuilderInputDraft(initial,0,null),'private-input');
  assert.equal(result.ok,false);assert.equal(storage.writes,writes);
  assert.ok(packets.some(p=>p.protectedWriteCheck==='input-entry-read'&&p.protectedReadReason==='payload'));
}));

test('postcommit protection reports an attempted write while preserving both resulting branches',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip();
  storage.setItem=()=>{throw new DOMException('PRIVATE quota','QuotaExceededError');};
  let injected=false;
  driver.afterCommit=()=>{
    if(injected||driver.generations.size===0)return;
    injected=true;
    const value=envelope('private-concurrent-native',null);
    storage.values.set(tripRecoveryStorageKey(null,initial.id,'private-concurrent-native'),JSON.stringify({...JSON.parse(value.rawRecovery),trip:{...initial,title:'PRIVATE concurrent edit'}}));
  };
  const result=await createTwoStoreTripPersistence(storage,driver,context()).save(initial,{newTripOrClone:true,writeId:'private-domain'});
  assert.equal(injected,true);assert.equal(driver.generations.size,1,'committed generation stays preserved');
  assert.equal(result.stored,false);assert.equal(result.blockedByExistingRecovery,true);
  const captured=packets.find(p=>p.protectedWriteCheck==='body-domain-readback');assert.ok(captured);
  assert.equal(captured.writeAttempted,true,'postcommit refusal must not be logged as a prewrite refusal');
  assert.equal(storage.values.size,1,'competing native copy is not removed');
}));

test('healthy paired input/body save emits no refusal and keeps existing result contract',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip(),broker=createTwoStoreTripPersistence(storage,driver,context());
  const seeded=await broker.save(initial,{newTripOrClone:true,writeId:'private-seed'});assert.equal(seeded.stored,true);
  const candidate=requireReadableTripDocument({...initial,title:'synthetic edit'}),input=createDurableBuilderInputPersistence(storage,driver,{trip:candidate,...context()});
  const prepared=await input.prepare(createBuilderInputDraft(candidate,0,null),'private-input');assert.equal(prepared.ok,true);if(!prepared.ok)return;
  const result=await broker.save(candidate,{replace:seeded.handle,expectedRecoverySource:initial,writeId:'private-next',entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:initial.id,writeId:'private-next'},input:prepared.input,receipt:null}});
  assert.equal(result.stored,true);assert.equal(result.blockedByExistingRecovery,false);assert.equal(packets.some(p=>p.protectedWriteCheck),false);
}));

test('retired body operation is refused without publishing an old-scope diagnostic',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip();
  const result=await createTwoStoreTripPersistence(storage,driver,{...context(),isCurrent:()=>false}).save(initial,{newTripOrClone:true});
  assert.equal(result.stored,false);assert.equal(storage.writes,0);assert.equal(packets.length,0);
}));

test('domain-entry refusal after native quota records the prior attempted setter honestly',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip();
  storage.setItem=()=>{throw new DOMException('PRIVATE quota','QuotaExceededError');};
  const result=await createTwoStoreTripPersistence(storage,driver,context()).save(initial,{newTripOrClone:true,writeId:'private-attempt',entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:initial.id,writeId:'private-attempt'},input:null,receipt:null,nativeCacheRaw:'PRIVATE forbidden cache assertion'}});
  assert.equal(result.stored,false);assert.equal(result.blockedByExistingRecovery,true);assert.equal(driver.generations.size,0);
  const captured=packets.find(p=>p.protectedWriteCheck==='body-domain-entry');assert.ok(captured);assert.equal(captured.writeAttempted,true);
}));

test('domain commit scope refusal before any setter is not reported as an attempted write',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip(),value=envelope('private-domain-seed',null);
  await createRecoveryDomainStore(driver,context()).commit({raw:JSON.stringify(value),expectedHead:null,admission:'native-setter-quota'});
  const original=driver.run.bind(driver) as (...args:any[])=>Promise<any>;let writes=0;
  (driver as any).run=async(...args:any[])=>{if(args[2]==='readwrite')writes++;return original(...args);};
  const result=await createTwoStoreTripPersistence(storage,driver,context()).save(initial,{replace:value.handle,writeId:'private-invalid-entry',entry:{pointer:value.handle,input:{ownerId:'PRIVATE foreign owner',tripId:initial.id,inputRevision:0,raw:'PRIVATE input'},receipt:null}});
  assert.equal(result.stored,false);assert.equal(result.blockedByExistingRecovery,true);assert.equal(writes,0);assert.equal(storage.writes,0);assert.equal(driver.generations.size,1);
  const captured=packets.find(p=>p.protectedWriteCheck==='body-domain-commit');assert.ok(captured);assert.equal(captured.writeAttempted,false);
}));

test('actual editable input setter/readback refusal is observed with unknown commit status',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip();
  await createTwoStoreTripPersistence(storage,driver,context()).save(initial,{newTripOrClone:true,writeId:'private-seed'});
  const inputKey=builderInputDraftKey(null,initial.id);let setters=0;
  storage.setItem=(key,value)=>{setters++;storage.values.set(key,key===inputKey?'PRIVATE malformed input':value);};
  const result=await createDurableBuilderInputPersistence(storage,driver,{trip:initial,...context()}).write(createBuilderInputDraft(initial,0,null));
  assert.deepEqual(result,{ok:false,reason:'protected'});assert.equal(setters,1);
  const captured=packets.find(p=>p.protectedWriteCheck==='input-entry-write');assert.ok(captured);assert.equal(captured.protectedReadReason,'payload');assert.equal(captured.writeAttempted,null,'entry result does not prove whether the setter ran');
}));

test('verified input followed by a changed body is observed without replacing either body branch',async()=>capture(async packets=>{
  const storage=new Storage(),driver=new MemoryRecoveryDriver(),initial=trip();
  await createTwoStoreTripPersistence(storage,driver,context()).save(initial,{newTripOrClone:true,writeId:'private-seed'});
  const inputKey=builderInputDraftKey(null,initial.id);let setters=0;
  storage.setItem=(key,value)=>{setters++;storage.values.set(key,value);if(key===inputKey){const raw=envelope('private-other',null);storage.values.set(tripRecoveryStorageKey(null,initial.id,'private-other'),JSON.stringify({...JSON.parse(raw.rawRecovery),trip:{...initial,title:'PRIVATE other body'}}));}};
  const result=await createDurableBuilderInputPersistence(storage,driver,{trip:initial,...context()}).write(createBuilderInputDraft(initial,0,null));
  assert.deepEqual(result,{ok:false,reason:'storage'});assert.equal(setters,1);
  const captured=packets.find(p=>p.protectedWriteCheck==='input-source-readback');assert.ok(captured);assert.equal(captured.writeAttempted,true);assert.equal(captured.protectedReadReason,'ambiguous-legacy');
  assert.equal([...storage.values.keys()].filter(k=>k.startsWith(tripRecoveryStorageKey(null,initial.id))).length,2);
}));
