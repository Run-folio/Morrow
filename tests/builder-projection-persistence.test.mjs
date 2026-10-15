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
import { buildCanonicalTripLegs } from '../lib/easyt/trip-legs.ts';
import { routeProjectionInputKey } from '../lib/easyt/trip-route-intent.ts';
const base=requireReadableTripDocument({...normalizeLegacyGeneratedDayContext(canonicalRouteFixture()),ownerId:null});
const prepared=prepareBuilderNecessaryProjection(base,base,{legIds:base.legs.map(l=>l.id),scheduleStopIds:[],recommendationStopIds:[],endpointChanged:false,routeAssessment:true});
assert.equal(prepared.ok,true);
const initial={version:2,ownerId:null,tripId:base.id,writeId:'initial-projection-source',state:'pending',savedAt:'2026-10-13T00:00:00.000Z',trip:prepared.trip};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class MemoryStorage {
 values=new Map(); get length(){return this.values.size;} key(i){return [...this.values.keys()][i]??null;}
 getItem(k){return this.values.get(k)??null;} setItem(k,v){this.values.set(k,v);} removeItem(k){this.values.delete(k);}
}
async function harness(boundary='before-body', configuration={}) {
 const recovery=structuredClone(initial);
 if(configuration.complete){
  const source=structuredClone(base);
  source.legs=buildCanonicalTripLegs({tripId:source.id,origin:{...source.brief.intent.route.origin,coordinates:null},journeyEnd:source.brief.intent.route.journeyEnd,stops:source.stops});
  source.brief.intent.route.projectionInputKey='prior-stale-marker';
  const pending=prepareBuilderNecessaryProjection(source,source,{legIds:source.legs.map(l=>l.id),scheduleStopIds:[],recommendationStopIds:[],endpointChanged:false,routeAssessment:true});assert.equal(pending.ok,true);recovery.trip=pending.trip;
 }
 const storage=new MemoryStorage(),driver=new MemoryRecoveryDriver(),trip=requireReadableTripDocument(structuredClone(recovery.trip));
 const priorKey=tripRecoveryStorageKey(null,trip.id,initial.writeId),priorRaw=JSON.stringify(recovery),targetId='synthetic-projection-target',targetKey=tripRecoveryStorageKey(null,trip.id,targetId),inputKey=builderInputDraftKey(null,trip.id);
 storage.setItem(priorKey,priorRaw);storage.setItem(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:trip.id}));
 let owner=null,armed=false,held=false,inputWrites=0,callbackCalls=0,reconcileCalls=0,candidate,metadata;
 const entered=deferred(),release=deferred(),done=deferred(),timers=[];
 const context=isCurrent=>({ownerId:null,isCurrent,overflowEnabled:false,accountOverflowQualified:false});
 let draft=updateBuilderInputDraft(createBuilderInputDraft(trip),trip,{kind:'destination-add'},'  preserved raw  ');
 const input=()=>createDurableBuilderInputPersistence(storage,driver,{trip,...context(()=>true)});
 assert.equal((await input().write(draft)).ok,true);const inputRaw=storage.getItem(inputKey);
 const pause=async()=>{if(held)return;held=true;entered.resolve();await release.promise;};
 const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(armed&&k===inputKey)inputWrites++;set(k,v);};
 const run=driver.run.bind(driver);
 driver.run=async(...args)=>{
  if(armed&&storage.values.has(targetKey)&&args[0].tripId===trip.id&&
    (boundary==='after-body'||boundary==='after-input'&&inputWrites>0))await pause();
  return run(...args);
 };
 const options={initialTrip:trip,initialRecovery:recovery,getOwnerId:()=>owner,
  readDraft:()=>input().read(),writeDraft:(t,d,o,g)=>createDurableBuilderInputPersistence(storage,driver,{trip:t,...context(g.isCurrent)}).write(d),
  saveRecovery:async(t,m)=>{
   t=structuredClone(t);callbackCalls++;candidate=structuredClone(t);metadata=structuredClone({...m,isCurrent:undefined});
   try {
    if(boundary==='before-body')await pause();
    const prepared=await createDurableBuilderInputPersistence(storage,driver,{trip:t,...context(m.isCurrent)}).prepare(m.draft,targetId+':input');
    if(!prepared.ok){const value={stored:false,handle:{ownerId:null,tripId:t.id,writeId:targetId}};done.resolve(value);return value;}
    if(configuration.beforeSave)configuration.beforeSave({storage,driver,prepared,t,m});
    const value=await createTwoStoreTripPersistence(storage,driver,context(m.isCurrent)).save(t,{state:m.state,replace:m.replace,canonicalBase:m.canonicalBase,expectedRecoverySource:m.expectedRecoverySource,projectionOnly:configuration.projectionOnly??m.projectionOnly,writeId:targetId,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:t.id,writeId:targetId},input:prepared.input,receipt:null}});
    done.resolve(value);return value;
   }catch(error){done.resolve({error:String(error)});throw error;}
  },
  reconcile:async request=>{
   reconcileCalls++;
   if(configuration.complete)return {...request,results:request.dispatched.map(u=>({...u,phase:'complete'})),legs:request.trip.legs.map(l=>({...l,routeMetadata:{source:'missing-evidence'}}))};
   return {...request,results:request.dispatched.map(u=>({...u,phase:'failed',reason:'unavailable'})),legs:[]};
  },
  persistAccount:()=>{throw Error('Unexpected account write');},now:()=> '2026-10-13T18:21:55.963Z',schedule:(callback,delay)=>{const t={callback,delay,active:true};timers.push(t);return ()=>{t.active=false;};},
 };
 const session=await createAsyncBuilderEditSession(options);
 // A fresh reader uses copied persisted maps, never the old connection/queue/guard.
 async function reopen(){
  const copy=new MemoryStorage();copy.values=new Map(storage.values);const fresh=new MemoryRecoveryDriver();
  for(const k of ['generations','heads','acknowledgements'])fresh[k]=new Map(driver[k]);
  return createTwoStoreTripPersistence(copy,fresh,context(()=>true)).read(trip.id);
 }
 return {session,storage,driver,trip,priorKey,priorRaw,targetKey,inputKey,inputRaw,entered,release,done,reopen,
  start(){armed=true;const t=timers.find(t=>t.active&&t.delay===0);assert.ok(t,'hydration schedules real optional work');t.active=false;t.callback();},
  rotate(){owner='foreign-owner';},get counts(){return {callbackCalls,reconcileCalls,inputWrites};},get candidate(){return candidate;},get metadata(){return metadata;}};
}
for(const change of ['forged-marker','cleared-marker','changed-input-key','pending','failed','conflict','invalid-adjacency'])test(`completion admission rejects ${change}`,{timeout:4000},async()=>{
 const h=await harness('before-body',{complete:true,beforeSave({t}){
  assert.equal(t.brief.intent.route.projectionInputKey,routeProjectionInputKey(t),'real merge completed the batch');
  if(change==='forged-marker')t.brief.intent.route.projectionInputKey='forged';
  if(change==='cleared-marker')t.brief.intent.route.projectionInputKey=null;
  if(change==='changed-input-key'){t.brief.intent.preferences.transportModes=['drive'];t.brief.intent.route.projectionInputKey=routeProjectionInputKey(t);}
  if(['pending','failed','conflict'].includes(change))t.brief.cascadeStatus.routeReconciliation={...structuredClone(h.trip.brief.cascadeStatus.routeReconciliation),residual:[{...h.trip.brief.cascadeStatus.routeReconciliation.residual[0],phase:change}]};
  if(change==='invalid-adjacency')t.legs.reverse();
 }});
 try{
  h.start();await h.entered.promise;h.release.resolve();const saved=await h.done.promise;
  assert.equal(saved.stored,false,JSON.stringify(saved));assert.equal(saved.projectionDeferred,true);assert.equal(saved.writeAttempted,false);
  assert.equal(h.storage.getItem(h.targetKey),null);assert.equal(h.storage.getItem(h.priorKey),h.priorRaw);assert.equal(h.storage.getItem(h.inputKey),h.inputRaw);
  const reopened=await h.reopen();assert.equal(reopened.kind,'found');assert.deepEqual(reopened.trip,JSON.parse(JSON.stringify(h.trip)));
 }finally{h.session.dispose();}
});
for(const boundary of ['after-body'])test(`document abandonment ${boundary} keeps one readable projection`,{timeout:4000},async t=>{
 const h=await harness(boundary);h.start();await h.entered.promise;
 assert.equal(h.counts.reconcileCalls,1);assert.equal(h.counts.callbackCalls,1);
 assert.deepEqual(h.candidate.brief.intent,h.trip.brief.intent);assert.deepEqual(h.candidate.stops,h.trip.stops);
 assert.notDeepEqual(h.candidate.brief.cascadeStatus.routeReconciliation,h.trip.brief.cascadeStatus.routeReconciliation);
 assert.equal(h.storage.getItem(h.priorKey),null);assert.ok(h.storage.getItem(h.targetKey));
 const result=await h.reopen();assert.equal(result.kind,'found');
 assert.equal(h.storage.getItem(h.inputKey),h.inputRaw,'unchanged authored input bytes');
 h.session.dispose(); // Never release the suspended writer; its continuation cannot finish.
 assert.equal((await h.reopen()).kind,'found');
 t.diagnostic(JSON.stringify({boundary,...h.counts,reader:result.kind,authoredIntentIdentical:true,stopsIdentical:true,predecessorRetired:true,inputRawUnchanged:true,oldWriterReleased:false}));
});
test('control: uninterrupted optional commit produces one readable generation',{timeout:4000},async t=>{
 const h=await harness();h.start();await h.entered.promise;h.release.resolve();const saved=await h.done.promise;assert.equal(saved.stored,true,JSON.stringify(saved));
 const result=await h.reopen();assert.equal(result.kind,'found');assert.equal(result.recovery.writeId,'synthetic-projection-target');assert.equal(h.storage.getItem(h.priorKey),null);assert.equal(h.storage.getItem(h.inputKey),h.inputRaw);
 assert.deepEqual(result.trip.brief.intent,h.trip.brief.intent);h.session.dispose();t.diagnostic('one generation; compatible raw input retained; found');
});
for(const change of ['owner','foreign-body','newer-raw'])test(`negative: ${change} before setter`,{timeout:4000},async t=>{
 const h=await harness();h.start();await h.entered.promise;let foreignRaw,rawSave;
 if(change==='owner')h.rotate();
 if(change==='foreign-body'){const v=JSON.parse(h.priorRaw);v.trip.title='Foreign authored title';foreignRaw=JSON.stringify(v);h.storage.setItem(h.priorKey,foreignRaw);}
 if(change==='newer-raw')rawSave=h.session.updateDraft({binding:{kind:'destination-add'},raw:'  newer unaccepted input  '});
 h.release.resolve();const saved=await h.done.promise;if(rawSave)assert.equal(await rawSave,true);
 if(change==='newer-raw'){assert.equal(saved.stored,true,JSON.stringify(saved));assert.match(h.storage.getItem(h.inputKey),/newer unaccepted input/);}
 else{assert.equal(saved.stored,false);assert.equal(h.storage.getItem(h.targetKey),null);assert.equal(h.storage.getItem(h.priorKey),foreignRaw??h.priorRaw);}
 assert.equal((await h.reopen()).kind,'found');h.session.dispose();t.diagnostic(JSON.stringify({change,stored:saved.stored,preserved:true}));
});

for(const change of ['missing-input','changed-input','revision','missing-bound-metadata','domain-input','authored-change'])test(`ineligible optional projection defers: ${change}`,{timeout:4000},async()=>{
 const h=await harness('before-body',{...(change==='revision'?{projectionOnly:{acceptedRevision:0,inputRevision:99}}:{}),beforeSave({storage,prepared,t}){
  if(change==='missing-input')storage.removeItem(h.inputKey);
  if(change==='changed-input')storage.setItem(h.inputKey,h.inputRaw+' ');
  if(change==='authored-change')t.title='Not a projection';
  if(change==='domain-input'){const e=JSON.parse(prepared.entry.raw);e.parent={...e.handle,writeId:'prior-domain'};prepared.entry.raw=JSON.stringify(e);prepared.entry.expectedHead=e.parent;prepared.entry.admission='existing-domain';}
  if(change==='missing-bound-metadata')prepared.input=null;
 }});
 const before=h.session.getSnapshot();h.start();await h.entered.promise;h.release.resolve();const saved=await h.done.promise;
 assert.equal(saved.stored,false);assert.equal(saved.projectionDeferred,true);assert.equal(saved.writeAttempted,false);assert.equal(h.storage.getItem(h.targetKey),null);assert.equal(h.storage.getItem(h.priorKey),h.priorRaw);
 await h.session.flush();const after=h.session.getSnapshot();assert.deepEqual(after.trip,before.trip);assert.deepEqual(after.recovery,before.recovery);assert.equal(after.acceptedRevision,before.acceptedRevision);assert.equal(after.error,null);h.session.dispose();
});

test('Build barrier and account flush retain durable source after projection deferral',{timeout:4000},async()=>{
 const trip=requireReadableTripDocument({...structuredClone(initial.trip),ownerId:'owner-a'}),timers=[],writes=[],done=deferred();
 const recovery={...structuredClone(initial),ownerId:'owner-a',trip};
 const session=await createAsyncBuilderEditSession({initialTrip:trip,initialRecovery:recovery,allowRecoverySync:true,getOwnerId:()=> 'owner-a',
  readDraft:()=>({kind:'empty'}),writeDraft:()=>({ok:true}),
  saveRecovery:async(t,m)=>{assert.ok(m.projectionOnly);done.resolve();return {stored:false,projectionDeferred:true,writeAttempted:false,handle:m.replace,blockedByExistingRecovery:false};},
  reconcile:async request=>({...request,results:request.dispatched.map(u=>({...u,phase:'failed',reason:'unavailable'})),legs:[]}),
  persistAccount:async value=>{writes.push(structuredClone(value));return value;},
  acknowledgeRecovery:async()=>({outcome:'acknowledged',remainingRecovery:null,accountAcknowledged:true,cacheStored:true}),
  now:()=>initial.savedAt,schedule:(callback,delay)=>{const t={callback,delay,active:true};timers.push(t);return()=>{t.active=false;};}});
 const task=timers.find(t=>t.delay===0);assert.ok(task);task.callback();await done.promise;
 const barrier=await session.captureCommandBarrier().wait();assert.equal(barrier.ok,true);assert.deepEqual(barrier.trip,trip);assert.equal(barrier.acceptedRevision,0);
 assert.equal(await session.flush(),true);assert.equal(writes.length,1);assert.deepEqual(writes[0],trip);assert.deepEqual(session.getSnapshot().trip,trip);session.dispose();
});

test('negative: pre-existing divergent generation is preserved and prevents projection write',{timeout:4000},async t=>{
 const h=await harness();h.start();await h.entered.promise;
 const other=JSON.parse(h.priorRaw);other.writeId='foreign-generation';other.trip.title='Independent authored copy';
 const key=tripRecoveryStorageKey(null,h.trip.id,other.writeId),raw=JSON.stringify(other);h.storage.setItem(key,raw);
 h.release.resolve();assert.equal((await h.done.promise).stored,false);assert.equal(h.storage.getItem(h.targetKey),null);assert.equal(h.storage.getItem(key),raw);assert.equal(h.storage.getItem(h.priorKey),h.priorRaw);assert.equal((await h.reopen()).kind,'protected');h.session.dispose();t.diagnostic('foreign generation retained exactly; no projection setter');
});
test('negative: failed native target readback preserves predecessor and refuses acceptance',{timeout:4000},async t=>{
 const h=await harness();h.start();await h.entered.promise;
 const get=h.storage.getItem.bind(h.storage);let failed=false;
 h.storage.getItem=k=>{if(k===h.targetKey&&h.storage.values.has(k)&&!failed){failed=true;throw Error('synthetic target readback failure');}return get(k);};
 h.release.resolve();const saved=await h.done.promise;assert.equal(failed,true);assert.equal(saved.stored,false);assert.equal(h.storage.getItem(h.priorKey),h.priorRaw);assert.ok(h.storage.getItem(h.targetKey));assert.equal((await h.reopen()).kind,'protected');h.session.dispose();t.diagnostic(JSON.stringify(saved));
});

test('unavailable metadata defers before any projection setter',{timeout:4000},async()=>{
 const h=await harness('before-body',{beforeSave({driver}){driver.fail=new Error('synthetic metadata read failure');}});
 h.start();await h.entered.promise;h.release.resolve();const result=await h.done.promise;
 assert.equal(result.stored,false);assert.equal(result.projectionDeferred,true);assert.equal(result.writeAttempted,false);assert.equal(h.storage.getItem(h.targetKey),null);assert.equal(h.storage.getItem(h.priorKey),h.priorRaw);h.session.dispose();
});
test('input change during final pointer preparation defers without replacing recovery',{timeout:4000},async()=>{
 const h=await harness('before-body',{beforeSave({driver,storage}){const read=driver.readCurrent.bind(driver);driver.readCurrent=async owner=>{storage.setItem(h.inputKey,h.inputRaw+' ');return read(owner);};}});
 h.start();await h.entered.promise;h.release.resolve();const result=await h.done.promise;
 assert.equal(result.stored,false);assert.equal(result.projectionDeferred,true);assert.equal(result.writeAttempted,false);assert.equal(h.storage.getItem(h.targetKey),null);assert.equal(h.storage.getItem(h.priorKey),h.priorRaw);assert.equal(h.storage.getItem(h.inputKey),h.inputRaw+' ');h.session.dispose();
});
