import assert from 'node:assert/strict';
import test from 'node:test';
import { createTwoStoreEntryPersistence } from '../lib/easyt/two-store-entry-persistence.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { createRecoveryEntryStore } from '../lib/easyt/durable-entry-store.ts';
import type { EasyTBrowserStorage } from '../lib/easyt/storage.ts';

class NativeModel implements EasyTBrowserStorage {
  values = new Map<string, string>(); refusal: string | null = null; writes = 0;
  get length() { return this.values.size; } key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes++; if(this.refusal) throw new DOMException('Synthetic only', this.refusal); this.values.set(k,v); }
  removeItem(k: string) { throw new Error('No deletion in the fallback'); }
}
const scope = {ownerId:null,kind:'builder-input' as const,tripId:'trip-a'};
const factory = (ls:NativeModel,driver:MemoryRecoveryDriver, isCurrent=()=>true) => createTwoStoreEntryPersistence(ls,driver,{
  scope,key:'input-a',isCurrent,overflowEnabled:true,accountOverflowQualified:false,
  validate:raw=>raw===null||raw.startsWith('valid:'),
});
test('actual setter quota retains prior raw input and awaits independent domain readback for no-locator reopen',async()=>{
  const ls=new NativeModel(),driver=new MemoryRecoveryDriver();ls.values.set('input-a','valid:prior');ls.refusal='QuotaExceededError';
  const result=await factory(ls,driver).save('valid:  exact input  ',{allowInitialOverflow:true,writeId:'first'});
  assert.equal(result.kind,'verified');assert.equal(ls.values.get('input-a'),'valid:prior');
  const read=await factory(ls,driver).read();assert.equal(read.kind,'ready');
  if(read.kind==='ready'){assert.equal(read.raw,'valid:  exact input  ');assert.equal(read.envelope?.retainedPreviousRaw,'valid:prior');}
});
test('divergent old raw writer cannot be overwritten even when the native setter has space',async()=>{
  const ls=new NativeModel(),driver=new MemoryRecoveryDriver();ls.refusal='QuotaExceededError';
  assert.equal((await factory(ls,driver).save('valid:domain',{allowInitialOverflow:true,writeId:'first'})).kind,'verified');
  ls.refusal=null;ls.values.set('input-a','valid:old-tab');const before=[...ls.values],writes=ls.writes;
  assert.equal((await factory(ls,driver).read()).kind,'protected');
  assert.equal((await factory(ls,driver).save('valid:next')).kind,'protected');
  assert.deepEqual([...ls.values],before);assert.equal(ls.writes,writes);assert.equal(driver.generations.size,1);
});
test('security, unknown and unqualified initial scopes refuse overflow without changing retained bytes',async()=>{
  for(const refusal of ['SecurityError','Error','QuotaExceededError']){
    const ls=new NativeModel(),driver=new MemoryRecoveryDriver();ls.refusal=refusal;
    assert.equal((await factory(ls,driver).save('valid:input',{allowInitialOverflow:false})).kind,'failure');assert.equal(driver.generations.size,0);
  }
});
test('domain unavailable and invalid raw input cannot authorize a native write or authoritative absence',async()=>{
  const ls=new NativeModel(),driver=new MemoryRecoveryDriver();driver.fail=new DOMException('Synthetic only','SecurityError');
  assert.equal((await factory(ls,driver).read()).kind,'unavailable');assert.equal((await factory(ls,driver).save('valid:input')).kind,'unavailable');
  driver.fail=null;assert.equal((await factory(ls,driver).save('corrupt')).kind,'protected');assert.equal(ls.writes,0);
});
test('scope change after commit preserves bytes but does not return accepted completion',async()=>{
  const ls=new NativeModel(),driver=new MemoryRecoveryDriver();ls.refusal='QuotaExceededError';let active=true;
  driver.afterCommit=()=>{active=false};const result=await factory(ls,driver,()=>active).save('valid:input',{allowInitialOverflow:true});
  assert.equal(result.kind,'protected');assert.equal(driver.generations.size,1);
});
test('new domain preparations retain source bytes and permit exact atomic canonical+input commit without a fake trip',async()=>{
  const ls=new NativeModel(),driver=new MemoryRecoveryDriver();ls.values.set('input-a','valid:prior');
  const staged=await factory(ls,driver).prepareForDomain('valid:next','atomic');assert.ok('raw' in staged);
  if(!('raw' in staged))return;
  assert.equal(JSON.parse(staged.raw).retainedPreviousRaw,'valid:prior');assert.equal(driver.generations.size,0);assert.equal(ls.writes,0);
  assert.equal((await createRecoveryEntryStore(driver,{ownerId:null,isCurrent:()=>true}).commit(staged)).kind,'verified');
  assert.equal((await factory(ls,driver).read()).kind,'ready');assert.equal(ls.values.get('input-a'),'valid:prior');
});
