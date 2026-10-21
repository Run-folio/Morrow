// Actual production browser facade and IndexedDB adapter; only synthetic storage.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexedDbModel } from './helpers/recovery-indexeddb-model.ts';
import { createAsyncBuilderEditSession } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { createBuilderEntrySession } from '../lib/easyt/trip-builder-entry-session.ts';
import { createBuilderInputDraft, builderInputDraftKey } from '../lib/easyt/trip-builder-input-draft.ts';
import { readDurableBuilderInputDraft, writeDurableBuilderInputDraft } from '../lib/easyt/builder-input-persistence.ts';
import { saveTripRecovery, loadTripRecovery, loadTripWorkspaceDocument, saveTripRecoveryToStorage, cacheCanonicalTripWithRecoveryToStorage } from '../lib/easyt/storage.ts';
import { publicRouteDetailFor } from '../lib/easyt/public-route.ts';
import { routePlannerPayload } from '../lib/easyt/public-route-handoff.ts';
import { tripFromBuilder } from '../lib/easyt/trip.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
class Storage {
 values=new Map(); blockedKey=null; beforeSet=null;
 get length(){return this.values.size;} key(i){return [...this.values.keys()][i]??null;}
 getItem(key){return this.values.get(key)??null;}
 setItem(key,raw){this.beforeSet?.(key,raw);if(key===this.blockedKey)throw new DOMException('Synthetic paired-input quota','QuotaExceededError');this.values.set(key,raw);}
 removeItem(key){this.values.delete(key);}
}
const storage=new Storage(),model=new IndexedDbModel();
globalThis.window={localStorage:storage,indexedDB:model.factory(),addEventListener(){},dispatchEvent(){return true;}};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
globalThis.fetch=async()=>{throw Error('No network permitted in isolated save regression');};
let sequence=0;
function fixture(){
 const payload=routePlannerPayload(publicRouteDetailFor('japan-slow').planDraft,new Date(2026,9,21,12));
 return requireReadableTripDocument(tripFromBuilder({...payload,id:'synthetic-paired-input-'+(++sequence),stops:payload.destinations,
 picks:{},mustDo:payload.brief,pace:'slow',hotels:'few',budget:'value',draft:[],createdAt:'2026-10-21T00:00:00.000Z'}));
}
async function editor(record){
 let active=true;
 const entry=createBuilderEntrySession({key:'synthetic-entry-'+sequence,ownerId:null,candidate:record.trip,receipt:null,
 initialCanonical:record.trip,openedRecovery:record.writeId?record:null,isCurrent:()=>active});
 assert.equal(await entry.verifyReadback((id,owner)=>loadTripRecovery(id,owner)),true);
 const seed=entry.claimSeed();assert.ok(seed);
 const session=await createAsyncBuilderEditSession({...seed,getOwnerId:()=>null,
 readDraft:(trip,owner)=>readDurableBuilderInputDraft(trip,owner,()=>active),
 writeDraft:(trip,draft,owner,guard)=>writeDurableBuilderInputDraft(trip,draft,owner,guard.isCurrent,false),
 saveRecovery:(trip,metadata)=>saveTripRecovery(trip,{...metadata,newTripOrClone:false}),
 acknowledgeRecovery:()=>{throw Error('No account ACK permitted');},persistAccount:()=>{throw Error('No account write permitted');},
 reconcile:()=>{throw Error('No provider work permitted');},now:()=> '2026-10-21T00:01:00.000Z',schedule:()=>()=>{}});
 return {session,close(){active=false;session.dispose();}};
}
async function createdBuiltReopened(){
 const trip=fixture(),draft=createBuilderInputDraft(trip);
 const created=await saveTripRecovery(trip,{newTripOrClone:true,draft});assert.equal(created.stored,true);
 let h=await editor(await loadTripRecovery(trip.id,null));
 assert.equal((await h.session.accept({kind:'build-status'},h.session.getSnapshot().inputRevision)).ok,true);
 assert.equal(await h.session.flush(),true);h.close();
 const built=await loadTripRecovery(trip.id,null);assert.equal(built.trip.status,'planned');
 h=await editor(built);return {h,trip:built.trip};
}
test('created → built → edit → reorder can overflow paired input, then reload and edit again',async()=>{
 const {h,trip}=await createdBuiltReopened();let reopened;
 try{
  assert.equal(await h.session.updateDraft({binding:{kind:'destination-add'},raw:'  Retain this unfinished synthetic input  '}),true);
  const ids=trip.stops.map(s=>s.id).reverse();storage.blockedKey=builderInputDraftKey(null,trip.id);
  const accepted=await h.session.accept({kind:'order',stopIds:ids,source:'move-menu'},h.session.getSnapshot().inputRevision);
  assert.equal(accepted.ok,true,'exact owned replacement must use permitted paired-input overflow');
  assert.equal(h.session.getSnapshot().error,null);
  const cold=await loadTripWorkspaceDocument(trip.id,null);assert.deepEqual(cold.trip.stops.map(s=>s.id),ids);
  assert.deepEqual(cold.trip,h.session.getSnapshot().trip);assert.ok(cold.recovery);
  const raw=await readDurableBuilderInputDraft(cold.trip,null);assert.equal(raw.kind,'readable');
  assert.equal(raw.draft.inputRevision,h.session.getSnapshot().inputRevision);
  assert.equal(raw.draft.fields.find(f=>f.binding.kind==='destination-add').raw,'  Retain this unfinished synthetic input  ');
  h.close();storage.blockedKey=null;reopened=await editor(cold.recovery);
  const edit=await reopened.session.accept({kind:'budget',budget:'high'},reopened.session.getSnapshot().inputRevision);
  assert.equal(edit.ok,true);const again=await loadTripWorkspaceDocument(trip.id,null);
  assert.deepEqual(again.trip.stops.map(s=>s.id),ids);assert.equal(again.trip.brief.budgetBand,'high');
  const retained=await readDurableBuilderInputDraft(again.trip,null);
  assert.equal(retained.draft.fields.find(f=>f.binding.kind==='destination-add').raw,'  Retain this unfinished synthetic input  ');
  assert.equal([...storage.values.keys()].filter(k=>k.startsWith('easyt:trip-recovery:v2:')&&k.includes(trip.id)).length,1);
 }finally{storage.blockedKey=null;h.close();reopened?.close();}
});
test('an independent recovery remains protected even when paired input would need overflow',async()=>{
 const {h,trip}=await createdBuiltReopened();try{
  const current=await loadTripRecovery(trip.id,null),foreign=structuredClone(current.trip);foreign.title='Independent synthetic branch';
  assert.equal(saveTripRecoveryToStorage(storage,foreign,{replace:current,writeId:'independent-'+sequence,deferRetirement:true}).stored,true);
  storage.blockedKey=builderInputDraftKey(null,trip.id);
  const before=structuredClone(storage.values),domainBefore=structuredClone(model.data),snapshot=h.session.getSnapshot();
  const accepted=await h.session.accept({kind:'order',stopIds:trip.stops.map(s=>s.id).reverse(),source:'move-menu'},snapshot.inputRevision);
  assert.equal(accepted.ok,false);assert.equal(h.session.getSnapshot().error.category,'protected');
  assert.deepEqual(storage.values,before);assert.deepEqual(model.data,domainBefore);assert.deepEqual(h.session.getSnapshot().trip,snapshot.trip);
 }finally{storage.blockedKey=null;h.close();}
});
test('an exact guest cache source admits paired input overflow without a recovery handle',async()=>{
 const trip={...fixture(),status:'planned'};assert.equal(cacheCanonicalTripWithRecoveryToStorage(storage,trip).stored,true);
 const cold=await loadTripWorkspaceDocument(trip.id,null);assert.equal(cold.recovery,null);
 const h=await editor({trip:cold.trip});try{
  storage.blockedKey=builderInputDraftKey(null,trip.id);const ids=trip.stops.map(s=>s.id).reverse();
  assert.equal((await h.session.accept({kind:'order',stopIds:ids,source:'move-menu'},h.session.getSnapshot().inputRevision)).ok,true);
  const saved=await loadTripWorkspaceDocument(trip.id,null);assert.deepEqual(saved.trip.stops.map(s=>s.id),ids);
  assert.equal((await readDurableBuilderInputDraft(saved.trip,null)).kind,'readable');
 }finally{storage.blockedKey=null;h.close();}
});
test('a concurrent branch during paired input quota is preserved and cannot be accepted',async()=>{
 const {h,trip}=await createdBuiltReopened();let foreignRaw,foreignKey;
 try{
  const prior=structuredClone(storage.values),inputKey=builderInputDraftKey(null,trip.id);
  storage.blockedKey=inputKey;storage.beforeSet=(key)=>{
   if(key!==inputKey)return;storage.beforeSet=null;
   const foreign={...structuredClone(trip),title:'Concurrent independent synthetic branch'};
   const record={version:2,ownerId:null,tripId:trip.id,trip:foreign,state:'pending',writeId:'concurrent-'+sequence,savedAt:'2026-10-21T00:02:00.000Z'};
   foreignKey='easyt:trip-recovery:v2:guest:'+encodeURIComponent(trip.id)+':'+encodeURIComponent(record.writeId);
   foreignRaw=JSON.stringify(record);storage.setItem(foreignKey,foreignRaw);
  };
  const before=h.session.getSnapshot().trip;
  const accepted=await h.session.accept({kind:'order',stopIds:trip.stops.map(s=>s.id).reverse(),source:'move-menu'},h.session.getSnapshot().inputRevision);
  assert.equal(accepted.ok,false);assert.ok(foreignRaw);assert.equal(storage.getItem(foreignKey),foreignRaw);
  for(const [key,raw] of prior)if(key.startsWith('easyt:trip-recovery:v2:'))assert.equal(storage.getItem(key),raw);
  assert.deepEqual(h.session.getSnapshot().trip,before);
 }finally{storage.beforeSet=null;storage.blockedKey=null;h.close();}
});
