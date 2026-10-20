// Existing generic transaction contracts; projection eligibility is tested through the broker.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as productionStore from '../lib/easyt/durable-recovery-store.ts';
import {pathToFileURL} from 'node:url';
const candidateModule=process.env.MORROVIA_IDB_PROJECTION_CANDIDATE_MODULE;
const {createRecoveryDomainStore,openIndexedDbRecoveryDriver}=candidateModule
 ?await import(new URL('./durable-recovery-store.ts',pathToFileURL(candidateModule))):productionStore;
import {createRecoveryEntryStore} from '../lib/easyt/durable-entry-store.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {IndexedDbModel} from './helpers/recovery-indexeddb-model.ts';
import {envelope} from './helpers/durable-recovery-fixture.ts';
import {entryHeadKey,entryGenerationKey} from '../lib/easyt/durable-entry-protocol.ts';
import {RecoveryDomainError} from '../lib/easyt/durable-recovery-error.ts';
import {browserRecoveryGuard,invalidateBrowserRecoveryScope} from '../lib/easyt/browser-recovery-persistence.ts';
const ownerId='isolated-owner',tripId='synthetic-trip';
const context=isCurrent=>({ownerId,isCurrent});
const inputScope={ownerId,tripId,kind:'builder-input'};
const commitInput=(body,entry)=>({raw:JSON.stringify(body),expectedHead:body.parent,admission:body.parent?'existing-domain':'native-setter-quota',entries:entry?[entry]:[]});
function entryWrite(value){return {raw:JSON.stringify(value),expectedHead:value.parent,admission:value.parent?'existing-domain':'native-setter-quota'};}
function nextBody(source,id){const next=structuredClone(source);next.parent=source.handle;next.handle={...source.handle,writeId:id};next.entry.pointer=next.handle;
 const record=JSON.parse(source.rawRecovery);record.writeId=id;record.trip.legs[0].durationMinutes=37;next.rawRecovery=JSON.stringify(record);return next;}
async function fixture(native=false){
 const model=native?new IndexedDbModel():null,driver=native?await openIndexedDbRecoveryDriver(model.factory()):new MemoryRecoveryDriver();
 let live=true;const store=()=>createRecoveryDomainStore(driver,context(()=>live));
 const first=envelope('body-1',ownerId);first.entry.receipt=null;
 const input={version:1,handle:{...inputScope,version:1,backend:'indexeddb-entry',writeId:'input-1'},parent:null,
  raw:first.entry.input.raw,legacyRaw:'retained native ancestor',retainedPreviousRaw:'retained native ancestor'};
 assert.equal((await store().commit(commitInput(first,entryWrite(input)))).kind,'verified');
 const next=nextBody(first,'projection-2'),assertion=entryWrite(input),snap=()=>structuredClone(native?model.data:{generations:driver.generations,heads:driver.heads,acks:driver.acknowledgements});
 return {driver,model,first,input,next,assertion,store,snap,expire:()=>{live=false;},close:()=>driver.close?.()};
}
function preserveAncestors(h,before){
 const generations=h.model?h.model.data.get('generations'):h.driver.generations;
 const prior=before instanceof Map?before.get('generations'):before.generations;
 for(const [key,raw] of prior)assert.equal(generations.get(key),raw,'immutable ancestor retained');
}
async function pointer(h,raw){await h.driver.run({ownerId,tripId},null,'readwrite',()=>({value:true,currentRaw:raw}));}
const otherPointer=JSON.stringify({version:1,backend:'indexeddb',ownerId,tripId:'another-trip',writeId:'other-body'});
test('control: exact idempotent input assertion is atomic with a new body and does not rewrite input',async()=>{
 const h=await fixture();try{const inputHead=h.driver.heads.get(entryHeadKey(inputScope)),inputRaw=h.driver.generations.get(entryGenerationKey(inputScope,'input-1')),before=h.snap();
  assert.equal((await h.store().commit(commitInput(h.next,h.assertion))).kind,'verified');
  assert.equal(h.driver.heads.get(entryHeadKey(inputScope)),inputHead);assert.equal(h.driver.generations.get(entryGenerationKey(inputScope,'input-1')),inputRaw);
  assert.equal(h.driver.generations.size,before.generations.size+1);preserveAncestors(h,before);
  const cold=await h.store().read(tripId);assert.equal(cold.kind,'ready');assert.deepEqual(cold.envelope,h.next);
 }finally{h.close();}
});
for(const kind of ['body','input'])for(const samePayload of [false,true])test(`CAS rejects newer ${kind} generation, even restored payload=${samePayload}`,async()=>{
 const h=await fixture();try{
  if(kind==='body'){const newer=nextBody(h.first,'other-body-generation');assert.equal((await h.store().commit(commitInput(newer,h.assertion))).kind,'verified');
   if(samePayload){const restored=nextBody(newer,'restored-payload-new-body-generation'),r=JSON.parse(restored.rawRecovery);r.trip=JSON.parse(h.first.rawRecovery).trip;restored.rawRecovery=JSON.stringify(r);assert.equal((await h.store().commit(commitInput(restored,h.assertion))).kind,'verified');}}
  else{const newer={...h.input,handle:{...h.input.handle,writeId:'other-input-generation'},parent:h.input.handle,
    raw:'new input',retainedPreviousRaw:h.input.raw};assert.equal((await createRecoveryEntryStore(h.driver,context(()=>true)).commit(entryWrite(newer))).kind,'verified');
   if(samePayload){const restored={...newer,handle:{...newer.handle,writeId:'restored-payload-new-input-generation'},parent:newer.handle,raw:h.input.raw,retainedPreviousRaw:newer.raw};assert.equal((await createRecoveryEntryStore(h.driver,context(()=>true)).commit(entryWrite(restored))).kind,'verified');}}
  const before=h.snap(),result=await h.store().commit(commitInput(h.next,h.assertion));assert.equal(result.kind,'protected-conflict');assert.deepEqual(h.snap(),before);
 }finally{h.close();}
});
test('two independent stores sharing serialized transactions have one replacement winner',async()=>{
 const h=await fixture();try{const other=createRecoveryDomainStore(h.driver,context(()=>true)),third=nextBody(h.first,'projection-3'),before=h.snap();
  const results=await Promise.all([h.store().commit(commitInput(h.next,h.assertion)),other.commit(commitInput(third,h.assertion))]);
  assert.equal(results.filter(r=>r.kind==='verified').length,1);assert.equal(results.filter(r=>r.kind==='protected-conflict').length,1);preserveAncestors(h,before);
 }finally{h.close();}
});
test('replay is idempotent before/after cold reopen and cannot roll back a newer body',async()=>{
 const h=await fixture();try{const operation=commitInput(h.next,h.assertion);assert.equal((await h.store().commit(operation)).kind,'verified');const committed=h.snap();
  assert.equal((await h.store().commit(operation)).kind,'verified');assert.deepEqual(h.snap(),committed);
  assert.equal((await createRecoveryDomainStore(h.driver,context(()=>true)).commit(operation)).kind,'verified');assert.deepEqual(h.snap(),committed);
  const newer=nextBody(h.next,'newer-body');assert.equal((await h.store().commit(commitInput(newer,h.assertion))).kind,'verified');const before=h.snap();
  assert.equal((await h.store().commit(operation)).kind,'protected-conflict');assert.deepEqual(h.snap(),before);
 }finally{h.close();}
});
test('expired mounted operation refuses before transaction; signout/remount lease cannot resume',async()=>{
 const h=await fixture();try{h.expire();const before=h.snap(),transactions=h.driver.transactions;const result=await h.store().commit(commitInput(h.next,h.assertion));
  assert.equal(result.kind,'protected-conflict');assert.equal(result.commitStatus,'not-started');assert.equal(h.driver.transactions,transactions);assert.deepEqual(h.snap(),before);
 }finally{h.close();}
});
for(const fault of ['during-decision','during-add'])test(`started native transaction ${fault} abort retains originals and reports attempted status`,async()=>{
 const h=await fixture(true);try{const before=h.snap(),run=h.driver.run.bind(h.driver);let started=0;
  if(fault==='during-add')h.model.failAddStore='generations';
  h.driver.run=(scope,id,mode,decide,entries)=>{if(id===h.next.handle.writeId&&mode==='readwrite'){started++;if(fault==='during-decision')return run(scope,id,mode,()=>{throw new DOMException('Synthetic decision abort','AbortError');},entries);}return run(scope,id,mode,decide,entries);};
  const result=await h.store().commit(commitInput(h.next,h.assertion));assert.equal(started,1);assert.equal(result.kind,'failure');assert.equal(result.commitStatus,'not-committed');assert.deepEqual(h.snap(),before);
 }finally{h.close();}
});
test('committed native bytes with failed readback remain committed/unverified and retry exactly',async()=>{
 const h=await fixture(true);try{const before=h.snap(),run=h.driver.run.bind(h.driver);let blocked=true;
  h.driver.run=(scope,id,mode,decide,entries)=>id===h.next.handle.writeId&&mode==='readonly'&&blocked?Promise.reject(new RecoveryDomainError('security','not-started')):run(scope,id,mode,decide,entries);
  const operation=commitInput(h.next,h.assertion),result=await h.store().commit(operation);
  assert.equal(result.kind,'failure');assert.equal(result.reason,'readback');assert.equal(result.commitStatus,'committed');preserveAncestors(h,before);
  blocked=false;const after=h.snap();assert.equal((await h.store().commit(operation)).kind,'verified');assert.deepEqual(h.snap(),after);
 }finally{h.close();}
});
test('operation retirement after commit retains exact bytes and reports committed status',async()=>{
 const h=await fixture();try{const run=h.driver.run.bind(h.driver);h.driver.run=async(scope,id,mode,decide,entries)=>{const result=await run(scope,id,mode,decide,entries);if(id===h.next.handle.writeId&&mode==='readwrite')h.expire();return result;};
  const before=h.snap(),result=await h.store().commit(commitInput(h.next,h.assertion));assert.equal(result.kind,'protected-conflict');assert.equal(result.commitStatus,'committed');preserveAncestors(h,before);
 }finally{h.close();}
});
test('stale replay after new navigation does not move that pointer or rewrite any generation',async()=>{
 const h=await fixture();try{const operation=commitInput(h.next,h.assertion);assert.equal((await h.store().commit(operation)).kind,'verified');
  await pointer(h,otherPointer);const before=h.snap(),result=await h.store().commit(operation);assert.notEqual(result.kind,'verified');assert.deepEqual(h.snap(),before);
 }finally{h.close();}
});
test('control: real browser recovery epoch retires an owner change-away/back and signout lease',()=>{
 let currentOwner='isolated-owner';const captured=browserRecoveryGuard(()=>currentOwner==='isolated-owner');
 assert.equal(captured(),true);currentOwner=null;invalidateBrowserRecoveryScope();assert.equal(captured(),false);
 currentOwner='isolated-owner';invalidateBrowserRecoveryScope();assert.equal(captured(),false,'restoring the owner address does not restore the old lease');
 assert.equal(browserRecoveryGuard(()=>currentOwner==='isolated-owner')(),true,'a fresh lease is independently valid');
});
