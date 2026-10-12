import assert from 'node:assert/strict';
import test from 'node:test';
import {createDurableHomepagePersistence} from '../lib/easyt/homepage-persistence.ts';
import {createPendingIntakeReceipt,HOME_TRIP_DRAFT_KEY,pendingReceiptStillCurrent,reservePendingDescribeHandoff,resolveHandoffIncrementally} from '../lib/easyt/home-trip-handoff.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';

/** Fault model only; no native browser capacity/durability or live user state. */
class NativeHomeModel {
  values=new Map<string,string>();failKey:string|null=null;failure='QuotaExceededError';writeCount=0;
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,raw:string){this.writeCount++;if(key===this.failKey)throw new DOMException('Synthetic only',this.failure);this.values.set(key,raw);}
  removeItem(key:string){this.values.delete(key);}
}
const context=(active=()=>true)=>({ownerId:null,isCurrent:active,overflowEnabled:true,accountOverflowQualified:false});
function bundle(prompt=' Tokyo → Kyoto  ',handoffId='handoff-a') {
  const snapshot={...emptyHomepageInput(),mode:'describe' as const,prompt};
  const receipt=createPendingIntakeReceipt(snapshot,{handoffId,tripId:'trip-'+handoffId});
  return {version:1 as const,inputRaw:JSON.stringify({snapshot,receipt}),draftRaw:JSON.stringify({version:2,phase:'pending-interpretation',receipt})};
}
test('second-key setter quota admits one durable bundle and cold reopen retains exact frozen input/receipt without LS locator',async()=>{
  const ls=new NativeHomeModel(),driver=new MemoryRecoveryDriver(),value=bundle();ls.failKey=HOME_TRIP_DRAFT_KEY;
  const result=await createDurableHomepagePersistence(ls,driver,context()).write(JSON.stringify(value),{allowInitialOverflow:true,writeId:'first'});
  assert.equal(result.kind,'verified');assert.equal(driver.generations.size,1);
  assert.equal(ls.getItem(homepageInputStorageKey(null)),null);assert.equal(ls.getItem(HOME_TRIP_DRAFT_KEY),null);
  const cold=await createDurableHomepagePersistence(ls,driver,context()).read();assert.equal(cold.kind,'ready');
  if(cold.kind==='ready'){assert.equal(cold.inputRaw,value.inputRaw);assert.equal(cold.draftRaw,value.draftRaw);assert.equal(cold.storedInput?.snapshot.prompt,' Tokyo → Kyoto  ');}
});
test('unexplained old raw input divergence is preserved and blocks even a successful native setter',async()=>{
  const ls=new NativeHomeModel(),driver=new MemoryRecoveryDriver();ls.failKey=homepageInputStorageKey(null);
  await createDurableHomepagePersistence(ls,driver,context()).write(JSON.stringify(bundle()),{allowInitialOverflow:true,writeId:'first'});
  const changed=bundle('Madrid','old-tab');ls.values.set(homepageInputStorageKey(null),changed.inputRaw);ls.failKey=null;
  const before=[...ls.values],writes=ls.writeCount,store=createDurableHomepagePersistence(ls,driver,context());
  assert.equal((await store.read()).kind,'protected');assert.equal((await store.write(JSON.stringify(bundle('Paris')))).kind,'protected');
  assert.deepEqual([...ls.values],before);assert.equal(ls.writeCount,writes);assert.equal(driver.generations.size,1);
});
test('schema/scope corruption, unavailable DB and actual security refusal never authorize overflow or absence',async()=>{
  const ls=new NativeHomeModel(),driver=new MemoryRecoveryDriver();driver.fail=new DOMException('Synthetic only','SecurityError');
  assert.equal((await createDurableHomepagePersistence(ls,driver,context()).read()).kind,'unavailable');assert.equal(ls.writeCount,0);
  driver.fail=null;ls.failKey=homepageInputStorageKey(null);ls.failure='SecurityError';
  const refused=await createDurableHomepagePersistence(ls,driver,context()).write(JSON.stringify(bundle()),{allowInitialOverflow:true});
  assert.equal(refused.kind,'failure');if(refused.kind==='failure')assert.equal(refused.nativeFailure,'security');assert.equal(driver.generations.size,0);
  const foreign={...bundle(),inputRaw:JSON.stringify({snapshot:emptyHomepageInput('owner-b')})};
  assert.equal((await createDurableHomepagePersistence(ls,driver,context()).write(JSON.stringify(foreign),{allowInitialOverflow:true})).kind,'protected');
});
test('Homepage outcome evidence distinguishes held native quota from an established domain transaction refusal',async()=>{
  const ls=new NativeHomeModel(),driver=new MemoryRecoveryDriver();ls.failKey=homepageInputStorageKey(null);
  const held=await createDurableHomepagePersistence(ls,driver,{...context(),overflowEnabled:false}).write(JSON.stringify(bundle()),{allowInitialOverflow:true});
  assert.equal(held.kind,'failure');if(held.kind==='failure')assert.equal(held.nativeFailure,'quota');assert.equal(driver.generations.size,0);
  await createDurableHomepagePersistence(ls,driver,context()).write(JSON.stringify(bundle()),{allowInitialOverflow:true,writeId:'initial'});
  const run=driver.run.bind(driver);driver.run=(scope,writeId,mode,decide,entries)=>mode==='readwrite'?Promise.reject(new DOMException('Synthetic domain quota','QuotaExceededError')):run(scope,writeId,mode,decide,entries);
  const refused=await createDurableHomepagePersistence(ls,driver,context()).write(JSON.stringify(bundle('Madrid')),{});
  assert.equal(refused.kind,'failure');if(refused.kind==='failure')assert.equal(refused.nativeFailure,undefined);
});
test('preparation is codec work only and does not write; frozen identity/raw binds the exact home entry transaction',async()=>{
  const ls=new NativeHomeModel(),driver=new MemoryRecoveryDriver(),value=bundle();
  const prepared=await createDurableHomepagePersistence(ls,driver,context()).prepare(async stage=>{
    stage.setItem(homepageInputStorageKey(null),value.inputRaw);stage.setItem(HOME_TRIP_DRAFT_KEY,value.draftRaw);
    assert.equal(pendingReceiptStillCurrent(stage,JSON.parse(value.inputRaw).receipt,true),true);return {ok:true};
  },'prepared');
  assert.equal(prepared.kind,'prepared');assert.equal(ls.writeCount,0);assert.equal(driver.generations.size,0);
  if(prepared.kind==='prepared'){assert.equal(prepared.raw,JSON.stringify(value));assert.equal(JSON.parse(prepared.entry.raw).retainedPreviousRaw,JSON.stringify({version:1,inputRaw:null,draftRaw:null}));}
});
test('scope change after domain commit preserves bytes but refuses accepted completion',async()=>{
  const ls=new NativeHomeModel(),driver=new MemoryRecoveryDriver();let active=true;ls.failKey=homepageInputStorageKey(null);driver.afterCommit=()=>{active=false};
  const result=await createDurableHomepagePersistence(ls,driver,context(()=>active)).write(JSON.stringify(bundle()),{allowInitialOverflow:true});
  assert.equal(result.kind,'protected');assert.equal(driver.generations.size,1);
});
test('async preservation must finish before a Homepage reservation can report success',async()=>{
  const ls=new NativeHomeModel(),snapshot={...emptyHomepageInput(),mode:'describe' as const,prompt:'Tokyo'};
  let resolve!:(value:boolean)=>void;const gate=new Promise<boolean>(done=>{resolve=done});let completed=false;
  const reservation=reservePendingDescribeHandoff({storage:ls,snapshot,isCurrent:()=>true,createIds:()=>({tripId:'trip',handoffId:'handoff'}),
    preserveAndBegin:(()=>gate) as unknown as ()=>boolean,lock:async(_key,work)=>work()}).then(result=>{completed=true;return result});
  await new Promise<void>(done=>setImmediate(done));assert.equal(completed,false);resolve(false);
  assert.deepEqual(await reservation,{ok:false,reason:'preservation'});
});
test('next occurrence work cannot outrun awaited canonical outcome acceptance',async()=>{
  let release!:()=>void;const gate=new Promise<void>(done=>{release=done});const dispatched:number[]=[];
  const pending=resolveHandoffIncrementally([1,2],async value=>{dispatched.push(value);return value},{concurrency:1,
    onOutcome:async()=>{await gate}});
  await new Promise<void>(done=>setImmediate(done));assert.deepEqual(dispatched,[1]);release();await pending;assert.deepEqual(dispatched,[1,2]);
});
test('a scope change during asynchronous preservation cannot accept the staged handoff',async()=>{
  const ls=new NativeHomeModel(),snapshot={...emptyHomepageInput(),mode:'describe' as const,prompt:'Tokyo'};
  let active=true,resolve!:(value:boolean)=>void;const gate=new Promise<boolean>(done=>{resolve=done});
  const reservation=reservePendingDescribeHandoff({storage:ls,snapshot,isCurrent:()=>active,createIds:()=>({tripId:'trip',handoffId:'handoff'}),
    preserveAndBegin:()=>gate,lock:async(_key,work)=>work()});
  await new Promise<void>(done=>setImmediate(done));active=false;resolve(true);
  const result=await reservation;assert.equal(result.ok,false);
});
