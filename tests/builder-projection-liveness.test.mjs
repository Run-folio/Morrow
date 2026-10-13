import assert from 'node:assert/strict';
import test from 'node:test';
import { createAsyncBuilderEditSession } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { createTwoStoreTripPersistence } from '../lib/easyt/two-store-trip-persistence.ts';
import { createDurableBuilderInputPersistence } from '../lib/easyt/builder-input-persistence.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { createBuilderInputDraft, updateBuilderInputDraft, builderInputDraftKey } from '../lib/easyt/trip-builder-input-draft.ts';
import { tripRecoveryStorageKey, currentTripStorageKey } from '../lib/easyt/storage.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { normalizeLegacyGeneratedDayContext } from '../lib/easyt/itinerary-generated-context.ts';
import { prepareBuilderNecessaryProjection } from '../lib/easyt/trip-builder-reconciliation.ts';
const base=requireReadableTripDocument({...normalizeLegacyGeneratedDayContext(canonicalRouteFixture()),ownerId:null});
const recStop=base.planItems[0].stopId;
const prep=prepareBuilderNecessaryProjection(base,base,{legIds:base.legs.map(l=>l.id),scheduleStopIds:[],recommendationStopIds:[recStop],endpointChanged:false,routeAssessment:true});assert.equal(prep.ok,true);
const initial={version:2,ownerId:null,tripId:base.id,writeId:'source',state:'pending',savedAt:'2026-10-13T00:00:00.000Z',trip:prep.trip};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class MemoryStorage {values=new Map();get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}removeItem(k){this.values.delete(k);}}
async function harness({newTripOrClone,mixed,overflowEnabled=false}){
 const storage=new MemoryStorage(),driver=new MemoryRecoveryDriver(),trip=structuredClone(initial.trip),timers=[],writes=[];let request,candidate,sequence=0;const completed=deferred();
 const key=tripRecoveryStorageKey(null,trip.id,initial.writeId),raw=JSON.stringify(initial);storage.setItem(key,raw);storage.setItem(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:trip.id}));
 const ctx=isCurrent=>({ownerId:null,isCurrent,overflowEnabled,accountOverflowQualified:false});
 const draft=updateBuilderInputDraft(createBuilderInputDraft(trip),trip,{kind:'destination-add'},'  retained raw  ');
 assert.equal((await createDurableBuilderInputPersistence(storage,driver,{trip,...ctx(()=>true)}).write(draft)).ok,true);
 const inputKey=builderInputDraftKey(null,trip.id),inputRaw=storage.getItem(inputKey);
 const session=await createAsyncBuilderEditSession({initialTrip:trip,initialRecovery:structuredClone(initial),getOwnerId:()=>null,
 readDraft:()=>createDurableBuilderInputPersistence(storage,driver,{trip,...ctx(()=>true)}).read(),
 writeDraft:(t,d,o,g)=>createDurableBuilderInputPersistence(storage,driver,{trip:t,...ctx(g.isCurrent)}).write(d),
 saveRecovery:async(t,m)=>{
  const id='candidate-'+ ++sequence,p=await createDurableBuilderInputPersistence(storage,driver,{trip:t,...ctx(m.isCurrent)}).prepare(m.draft,id+':input');assert.equal(p.ok,true);
  const result=await createTwoStoreTripPersistence(storage,driver,ctx(m.isCurrent)).save(t,{state:m.state,replace:m.replace,canonicalBase:m.canonicalBase,expectedRecoverySource:m.expectedRecoverySource,projectionOnly:m.projectionOnly,newTripOrClone,writeId:id,entries:[p.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:t.id,writeId:id},input:p.input,receipt:null}});
  writes.push({optional:!!m.projectionOnly,result});if(m.projectionOnly)completed.resolve(result);return result;
 },
 reconcile:async req=>{
  request=req;const leg=req.dispatched.find(u=>u.kind==='leg'),rec=req.dispatched.find(u=>u.kind==='recommendation');assert.ok(leg);assert.ok(rec);
  const response={...req,results:[{...leg,phase:'complete'},...(mixed?[{...rec,phase:'complete'}]:[])],legs:req.trip.legs.filter(l=>l.id===leg.targetId),
   recommendationProjections:mixed?[{stopId:rec.targetId,days:req.trip.planItems.filter(d=>d.stopId===rec.targetId).map(d=>({id:d.id,contextNotes:['New generated guidance for this occurrence']}))}]:[]};
  return response;
 },persistAccount:()=>{throw Error('guest account write');},now:()=>initial.savedAt,
 schedule:(callback,delay)=>{const t={callback,delay,active:true};timers.push(t);return()=>{t.active=false;};}});
 return {session,storage,key,raw,inputKey,inputRaw,writes,trip,
  async run(){const t=timers.find(t=>t.active&&t.delay===0);assert.ok(t);t.active=false;t.callback();const result=await completed.promise;await session.captureCommandBarrier().wait();await new Promise(resolve=>setImmediate(resolve));return result;},
  read:()=>createTwoStoreTripPersistence(storage,driver,ctx(()=>true)).read(trip.id),
  pendingTimers:()=>timers.filter(t=>t.active&&t.delay===0).length,
  get legId(){return request.dispatched.find(u=>u.kind==='leg').targetId;}};
}
test('fresh capability permits exact native route replacement and preserves authored saves',{timeout:4000},async t=>{
 const h=await harness({newTripOrClone:true,mixed:false}),before=h.session.getSnapshot(),result=await h.run();
 assert.equal(result.stored,true);assert.equal(h.storage.getItem(h.key),null);assert.equal(h.storage.getItem(h.inputKey),h.inputRaw);
 assert.equal(h.session.getSnapshot().pendingUnits.some(u=>u.kind==='leg'&&u.targetId===h.legId),false);
 const edit=await h.session.accept({kind:'budget',budget:'high'},h.session.getSnapshot().inputRevision);assert.equal(edit.ok,true);const read=await h.read();assert.equal(read.kind,'found');assert.equal(read.trip.brief.budgetBand,'high');assert.equal(h.writes.at(-1).optional,false);assert.equal(h.writes.at(-1).result.stored,true);assert.deepEqual(JSON.parse(h.storage.getItem(h.inputKey)).fields,JSON.parse(h.inputRaw).fields);assert.ok(JSON.parse(h.storage.getItem(h.inputKey)).inputRevision>JSON.parse(h.inputRaw).inputRevision);h.session.dispose();
 const control=await harness({newTripOrClone:false,mixed:false});assert.equal((await control.run()).stored,true);assert.equal(control.session.getSnapshot().pendingUnits.some(u=>u.kind==='leg'&&u.targetId===control.legId),false);assert.equal((await control.read()).kind,'found');control.session.dispose();
 t.diagnostic(JSON.stringify({freshOptional:'durable-native-replacement',authoredBudget:'durable',rawPreserved:true,recoveredStyleSameResponse:'durable-completed-leg',universalCompletionImpossible:false}));
});
test('mixed response persists eligible route only and preserves generated-context fallback',{timeout:4000},async t=>{
 const h=await harness({newTripOrClone:false,mixed:true}),before=h.session.getSnapshot(),result=await h.run();
 assert.equal(result.stored,true);assert.equal(h.storage.getItem(h.key),null);assert.equal(h.storage.getItem(h.inputKey),h.inputRaw);assert.deepEqual(h.session.getSnapshot().trip.planItems,before.trip.planItems);assert.equal(h.session.getSnapshot().pendingUnits.some(u=>u.kind==='leg'&&u.targetId===h.legId),false);assert.ok(h.session.getSnapshot().pendingUnits.some(u=>u.kind==='recommendation'));
 assert.equal((await h.session.accept({kind:'budget',budget:'high'},h.session.getSnapshot().inputRevision)).ok,true);const read=await h.read();assert.equal(read.kind,'found');assert.equal(read.trip.brief.budgetBand,'high');assert.deepEqual(read.trip.planItems,before.trip.planItems);h.session.dispose();
 const control=await harness({newTripOrClone:false,mixed:false});assert.equal((await control.run()).stored,true);assert.equal(control.session.getSnapshot().pendingUnits.some(u=>u.kind==='leg'&&u.targetId===control.legId),false);assert.ok(control.session.getSnapshot().pendingUnits.some(u=>u.kind==='recommendation'));control.session.dispose();
 t.diagnostic(JSON.stringify({mixed:'route-only-persisted',completedRouteLegAlsoDeferred:false,generatedContextNotAdopted:true,authoredBudget:'durable',routeOnlyControl:'durable-completed-leg',dataLoss:false}));
});

test('optional replacement with creation capability cannot create without its predecessor',{timeout:4000},async()=>{
 const h=await harness({newTripOrClone:true,mixed:false,overflowEnabled:true});h.storage.removeItem(h.key);const result=await h.run();
 assert.equal(result.stored,false);assert.equal(result.projectionDeferred,true);assert.equal(result.writeAttempted,false);assert.equal((await h.read()).kind,'missing');assert.equal(h.storage.getItem(h.inputKey),h.inputRaw);h.session.dispose();
});
test('optional replacement quota failure cannot enter overflow despite creation capability',{timeout:4000},async()=>{
 const h=await harness({newTripOrClone:true,mixed:false,overflowEnabled:true});const set=h.storage.setItem.bind(h.storage);
 h.storage.setItem=(key,value)=>{if(key.startsWith('easyt:trip-recovery:')&&key!==h.key)throw new DOMException('synthetic full native store','QuotaExceededError');set(key,value);};
 const result=await h.run();assert.equal(result.stored,false);assert.equal(result.nativeFailure,'quota');assert.equal(result.handle.backend,undefined);assert.equal(h.storage.getItem(h.key),h.raw);assert.equal(h.storage.getItem(h.inputKey),h.inputRaw);const read=await h.read();assert.equal(read.kind,'found');assert.equal(read.recovery.writeId,'source');assert.equal(read.domain,null);h.session.dispose();
});
