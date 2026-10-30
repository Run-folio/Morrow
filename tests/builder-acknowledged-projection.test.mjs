// Regression derived from the deferred-projection investigation. All storage is isolated.
// IndexedDbModel executes the real native API adapter; it is not a browser engine.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
const load=p=>import(pathToFileURL(repo+'/'+p));
const {default:ts}=await load('node_modules/typescript/lib/typescript.js');
const {completedTransferResolutionLeg}=await load('lib/easyt/transfer-resolution-client.ts');
const {createAsyncBuilderEditSession}=await load('lib/easyt/trip-builder-async-edit-session.ts');
const {createTwoStoreTripPersistence}=await load('lib/easyt/two-store-trip-persistence.ts');
const {createDurableBuilderInputPersistence}=await load('lib/easyt/builder-input-persistence.ts');
const {openIndexedDbRecoveryDriver,createRecoveryDomainStore}=await load('lib/easyt/durable-recovery-store.ts');
const {IndexedDbModel}=await load('tests/helpers/recovery-indexeddb-model.ts');
const {requireReadableTripDocument}=await load('lib/easyt/trip-document.ts');
const {createBuilderInputDraft,updateBuilderInputDraft,builderInputDraftKey}=await load('lib/easyt/trip-builder-input-draft.ts');
const {publicRouteDetailFor}=await load('lib/easyt/public-route.ts');
const {routePlannerPayload}=await load('lib/easyt/public-route-handoff.ts');
const {tripFromBuilder}=await load('lib/easyt/trip.ts');
const {acceptedGeographicPlace,geographicallyReady,stopGeographicPlace,guardTripRoutingGeometry}=await load('lib/easyt/geographic-binding.ts');
const {projectBuilderCalendar}=await load('lib/easyt/trip-builder-calendar.ts');
const {assessCanonicalTransferJourneys}=await load('lib/easyt/multimodal-transfer-resolution.ts');
const {RoadRoutingError}=await load('lib/easyt/road-routing.ts');
const {builderDetailsStatus}=await load('lib/easyt/builder-planning-status.ts');
const {reconcileBuilderDependencies,mergeBuilderProjectionResponse}=await load('lib/easyt/trip-builder-reconciliation.ts');
const {transferAssessmentForLeg}=await load('lib/easyt/planning-evidence-presentation.ts');
const source=fs.readFileSync(repo+'/app/journey/new/trip-builder.tsx','utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
class Storage {
 values=new Map(); blockedKey=null;
 get length(){return this.values.size;} key(i){return [...this.values.keys()][i]??null;}
 getItem(k){return this.values.get(k)??null;}
 setItem(k,v){if(k===this.blockedKey||this.failRecoveries&&k.includes('trip-recovery'))throw new DOMException('Isolated input quota','QuotaExceededError');this.values.set(k,v);}
 removeItem(k){this.values.delete(k);}
}
function differences(a,b,p=''){
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return [p];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],p?p+'.'+k:k));
}
function fixture(){
 const verify=(name,country,coordinates,role='stop')=>{const p={name,country,coordinates,providerId:'synthetic:'+name};const v=acceptedGeographicPlace(p,{...p,placeType:role==='stop'?'city':'transport_gateway',routability:'direct_destination'},role);assert.ok(v,name+' must meet production geography contract');return v;};
 const origin=verify('London Gatwick Airport','United Kingdom',[-0.1821,51.1537],'endpoint');
 const stops=[['Barcelona','Spain',[2.1734,41.3851],8],['Granada','Spain',[-3.5986,37.1773],4],['Paris','France',[2.3522,48.8566],5],['Madrid','Spain',[-3.7038,40.4168],4]].map(([name,country,coordinates,nights],i)=>({id:'stop-'+i,...verify(name,country,coordinates),nights}));
 const t=tripFromBuilder({id:'synthetic-difficult-connection',origin:origin.name,originCountry:origin.country,originProviderId:origin.providerId,originCoordinates:origin.coordinates,journeyEnd:{mode:'same_as_start'},stops,startDate:'2027-01-06',endDate:'2027-01-27',nightAllocations:Object.fromEntries(stops.map(s=>[s.id,s.nights])),picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],createdAt:'2026-10-26T00:00:00.000Z'});t.brief.intent.route.origin=origin;
 return requireReadableTripDocument({...projectBuilderCalendar(t,t).trip,ownerId:'owner-a'});
}
function actualReconciler(trace,control){
 const snippet=source.slice(source.indexOf('async function reconcileAcceptedBuilderRequest('),source.indexOf('\nfunction TripBuilderDocument()'));
 const scope={reconcileBuilderDependencies,transferAssessmentForLeg,completedTransferResolutionLeg,
  geographicallyReady,stopGeographicPlace,guardTripRoutingGeometry,
  resolveBuilderRecommendation:()=>{throw Error('Optional recommendation must not be dispatched');},
  requestCanonicalTransferResolution:async legs=>{trace.providerCalls++;if(control.transferGate)await control.transferGate;
 const payload={legs:legs.map(leg=>({...structuredClone(leg),mode:'unknown',durationMinutes:null,headlineMinutes:null,doorToDoorMinutes:null})),assessments:legs.map(leg=>({legId:leg.id,state:{retrieval:'completed',evidence:'insufficient',retryable:false,diagnostics:{stage:'evidence',attemptedSources:[],elapsedMs:1,cacheOutcome:'not-used'}}}))};
 trace.assessments=payload.assessments.map(x=>x.state);
 if(control.scenario==='invalid-endpoint')payload.legs[0].fromEndpoint.coordinates=[0,0];
 return {ok:true,...payload,failedLegIds:[]};}};
 return new Function('scope',`with(scope){${ts.transpileModule(snippet+'\nreturn reconcileAcceptedBuilderRequest;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
}
function assessment(session,componentSource){
 const effects=[];
 const scope={builderMountedRef:{current:true},builderEditSessionRef:{current:session},activeBrowserOwnerIdRef:{current:session.getSnapshot().browserOwnerId},
  pendingBuildAssessmentRef:{current:null},setBuildAssessmentRequestId(){},buildAssessmentRequestId:0,
  activeTripDocument:session.getSnapshot().trip,buildInvariant:{canBuildTrip:true},
  sameRecoveryDocument:(a,b)=>JSON.stringify(a)===JSON.stringify(b),useEffect:fn=>effects.push(fn)};
 const snippet=componentSource.slice(componentSource.indexOf('  const requestBuildAssessment ='),componentSource.indexOf('  const recordGeneratedTrip ='));
 const request=new Function('scope',`with(scope){${ts.transpileModule(snippet+'\nreturn requestBuildAssessment;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
 let settled=false,value,unsubscribe=()=>{};
 const render=()=>{scope.activeTripDocument=session.getSnapshot().trip;effects[0]();};
 const outcome=request(session,session.captureCommandBarrier().isCurrent).then(v=>{settled=true;value=v;unsubscribe();});
 // React observes session snapshots and reruns this effect. A single manually
 // rendered effect plus one event-loop turn does not model that lifecycle.
 unsubscribe=session.subscribe(render);effects[0]();
 const state=()=>({settled,returnedTrip:Boolean(value?.trip)});
 const wait=async(timeoutMs=10000)=>{
  if(settled)return state();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{unsubscribe();reject(new Error('Build assessment did not settle within the test deadline'));},timeoutMs);
   outcome.then(()=>{clearTimeout(timer);resolve(state());},error=>{clearTimeout(timer);unsubscribe();reject(error);});
  });
 };
 return {render,state,wait};
}
async function harness(mode,browserOwner=null){
 const storage=new Storage(),model=new IndexedDbModel(),driver=await openIndexedDbRecoveryDriver(model.factory());
 const initial=fixture(),ownerId=browserOwner;let owner=ownerId;
 const control={gate:null,providerError:false,storageError:false,noResults:false};
 const context=isCurrent=>({ownerId,isCurrent,overflowEnabled:true,accountOverflowQualified:true});
 const broker=guard=>createTwoStoreTripPersistence(storage,driver,context(guard));
 if(mode==='indexeddb-body'){
  const handle={version:1,backend:'indexeddb',ownerId,tripId:initial.id,writeId:'seed'};
  const envelope={version:1,handle,parent:null,legacySources:[],rawRecovery:JSON.stringify({version:2,ownerId,tripId:initial.id,writeId:'seed',state:'pending',savedAt:'2026-10-19T00:00:00.000Z',trip:initial}),entry:{pointer:handle,input:null,receipt:null}};
  const committed=await createRecoveryDomainStore(driver,context(()=>true)).commit({raw:JSON.stringify(envelope),expectedHead:null,admission:'native-setter-quota'});
  assert.equal(committed.kind,'verified',JSON.stringify(committed));
 }else assert.equal((await broker(()=>true).save(initial,{newTripOrClone:true,writeId:'seed'})).stored,true);
 const input=(trip,guard)=>createDurableBuilderInputPersistence(storage,driver,{trip,...context(guard)});
 let draft=createBuilderInputDraft(initial,0,ownerId);
 assert.equal((await input(initial,()=>true).write(draft)).ok,true);
 if(mode==='indexeddb-input'){
  draft=updateBuilderInputDraft(draft,initial,{kind:'destination-add'},'  retained synthetic input  ',ownerId);
  storage.blockedKey=builderInputDraftKey(ownerId,initial.id);
  assert.equal((await input(initial,()=>true).write(draft)).ok,true);
  storage.blockedKey=null;
 }
 let read=await broker(()=>true).read(initial.id);assert.equal(read.kind,'found');const canonical={...read.trip,updatedAt:'2026-10-26T00:00:01.000Z'};const ack=await broker(()=>true).acknowledge(read.trip,canonical,{ownerId,tripId:read.trip.id,writeId:read.recovery.writeId,...(read.recovery.backend?{backend:read.recovery.backend}:{})});assert.equal(ack.outcome,'acknowledged');read=await broker(()=>true).read(initial.id);assert.equal(read.kind,'found');assert.equal(read.recovery,null);
 const trace={providerCalls:0,reconcileCalls:0,merges:[],writes:[],timers:[],accountWrites:0};let writeId=0;
 const reconcile=actualReconciler(trace,control);
 const session=await createAsyncBuilderEditSession({initialTrip:read.trip,initialRecovery:read.recovery,getOwnerId:()=>owner,
  readDraft:(trip)=>input(trip,()=>true).read(),
  writeDraft:(trip,draft,_owner,guard)=>input(trip,guard?.isCurrent??(()=>true)).write(draft),
  saveRecovery:async(trip,meta)=>{
   let projection=structuredClone(meta.projectionOnly);
   if(projection&&control.proof==='missing')projection={acceptedRevision:projection.acceptedRevision,inputRevision:projection.inputRevision};
   if(projection&&control.proof==='foreign')projection.acknowledged.ownerId='owner-b';
   if(meta.projectionOnly&&control.storageError)return {stored:false,handle:meta.replace,writeAttempted:false,blockedByExistingRecovery:false,failureReason:'device-unavailable'};
   const id='write-'+(++writeId),prepared=await input(trip,meta.isCurrent).prepare(meta.draft,id+':input');
   if(!prepared.ok){const result={stored:false,projectionDeferred:Boolean(meta.projectionOnly),writeAttempted:false,handle:meta.replace,blockedByExistingRecovery:prepared.reason==='protected'};trace.writes.push({projection:Boolean(meta.projectionOnly),preparation:prepared,result});return result;}
   if(meta.projectionOnly)trace.lastProjection={trip:structuredClone(trip),options:{state:meta.state,replace:meta.replace,canonicalBase:meta.canonicalBase,expectedRecoverySource:meta.expectedRecoverySource,projectionOnly:projection,writeId:id,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId:trip.id,writeId:id},input:prepared.input,receipt:null}}};
   const result=await broker(meta.isCurrent).save(trip,{state:meta.state,replace:meta.replace,canonicalBase:meta.canonicalBase,expectedRecoverySource:meta.expectedRecoverySource,
    projectionOnly:projection,writeId:id,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId:trip.id,writeId:id},input:prepared.input,receipt:null}});
   const comparable=structuredClone(trip),before=meta.expectedRecoverySource;
   if(before){comparable.legs=before.legs;comparable.brief.routeAssessment=before.brief.routeAssessment;
    if(comparable.brief.cascadeStatus&&before.brief.cascadeStatus)comparable.brief.cascadeStatus.routeReconciliation=before.brief.cascadeStatus.routeReconciliation;
    comparable.brief.intent.route.projectionInputKey=before.brief.intent.route.projectionInputKey;}
   trace.writes.push({projection:Boolean(meta.projectionOnly),result,hasReplace:Boolean(meta.replace),hasExpectedSource:Boolean(meta.expectedRecoverySource),sourceBackend:meta.replace?.backend??'native',inputParent:JSON.parse(prepared.entry.raw).parent,authoredWhitelistDifferences:before?differences(before,comparable):[]});
   return result;
  },
  reconcile:async(request,signal)=>{trace.reconcileCalls++;if(control.gate)await control.gate;if(control.providerError)throw Error('Synthetic provider unavailable');if(control.noResults)return {...request,results:[],legs:[]};const response=await reconcile(request,signal);const merge=mergeBuilderProjectionResponse(request.trip,response,request);trace.merges.push({ok:merge.ok,reason:merge.reason,changes:merge.ok?differences(request.trip,merge.trip):[]});return response;},
  persistAccount:async trip=>{trace.accountWrites++;return {...structuredClone(trip),updatedAt:'2026-10-26T00:02:00.000Z'};},
  acknowledgeRecovery:async(reviewed,canonical,handle,guard)=>{const result=await broker(guard.isCurrent).acknowledge(reviewed,canonical,handle);trace.ack=result.outcome;return result;},
  now:()=> '2026-10-19T00:01:00.000Z',schedule:(callback,delay)=>{const timer={callback,delay,active:true};trace.timers.push(timer);return ()=>{timer.active=false;};}});
 return {session,trace,storage,driver,model,broker,input,control,rotate:()=>{owner='other-owner';},
  run:async()=>{for(const timer of [...trace.timers])if(timer.active&&timer.delay===0){timer.active=false;timer.callback();}for(let i=0;i<100;i++)await turn();},
  close(){session.dispose();driver.close?.();}};
}


async function prepare(h){
 for(const endDate of ['2027-01-28','2027-01-27'])assert.equal((await h.session.accept({kind:'dates',startDate:'2027-01-06',endDate},h.session.getSnapshot().inputRevision)).ok,true);
 assert.equal(h.session.getSnapshot().trip.legs.length,5);assert.equal(h.session.getSnapshot().trip.endDate,'2027-01-27');
 assert.deepEqual(h.session.getSnapshot().trip.stops.map(s=>[s.name,s.nights]),[['Barcelona',8],['Granada',4],['Paris',5],['Madrid',4]]);
}


async function accountAck(h){for(const timer of [...h.trace.timers])if(timer.active&&timer.delay===450){timer.active=false;timer.callback();}for(let i=0;i<150;i++)await turn();await h.session.waitForDeviceWrites();}
async function releaseWork(h,release){release();for(let i=0;i<150;i++)await turn();await h.session.waitForDeviceWrites();}
test('account ACK before transfer completion admits only the acknowledged projection and survives save/reopen',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try {
  await prepare(h);await h.run();assert.equal(h.trace.providerCalls,1);const preAck={reviewed:structuredClone(h.session.getSnapshot().trip),handle:structuredClone(h.session.getSnapshot().recovery),native:[...h.storage.values],domain:[...h.model.data].map(([name,map])=>[name,[...map]])};await accountAck(h);
  const acknowledged=h.session.getSnapshot();assert.equal(h.trace.ack,'acknowledged');assert.equal(acknowledged.saveState,'cloud');assert.equal(acknowledged.recovery,null);
  await releaseWork(h,release);const snap=h.session.getSnapshot();
  assert.equal(snap.routeWorkBlocked,false,'verified ACK predecessor must allow current generated projection');
  assert.equal(snap.pendingUnits.some(u=>u.kind!=='recommendation'),false);assert.equal(builderDetailsStatus(snap.trip,'en',snap.transferAssessments).state,'saved');
  assert.deepEqual(snap.trip.stops,acknowledged.trip.stops);assert.equal(snap.trip.startDate,acknowledged.trip.startDate);assert.equal(snap.trip.endDate,acknowledged.trip.endDate);
  if(process.env.MORROVIA_ACK_FIXTURE_OUT)fs.writeFileSync(process.env.MORROVIA_ACK_FIXTURE_OUT,JSON.stringify({...preAck,canonical:acknowledged.trip,projection:h.trace.lastProjection}));
  assert.equal(h.trace.writes.at(-1).result.stored,true);assert.equal(snap.saveState,'local','device projection is not yet an account save');
  await accountAck(h);assert.equal(h.session.getSnapshot().saveState,'cloud');assert.equal(h.trace.accountWrites,2);
  const reopened=await h.broker(()=>true).read(snap.trip.id);assert.equal(reopened.kind,'found');assert.equal(reopened.recovery,null);
  assert.deepEqual(reopened.trip,h.session.getSnapshot().trip);assert.equal(builderDetailsStatus(reopened.trip,'en').state,'saved');
  const count=h.trace.providerCalls;await h.session.resumeNecessaryWork();await h.run();assert.equal(h.trace.providerCalls,count,'no repeat request after completion');
 } finally {release();h.close();}
});
test('deferred route work is presented as terminal review without changing pending records',async()=>{
 const h=await harness('native','owner-a');try{await prepare(h);const before=structuredClone(h.session.getSnapshot().trip);const status=builderDetailsStatus(before,'en',[],true);assert.notEqual(status.state,'saving');assert.deepEqual(h.session.getSnapshot().trip,before);}finally{h.close();}
});

function copies(h){return {native:[...h.storage.values],domain:structuredClone(h.model.data)};}
for(const change of ['recovery','cache','input','navigation','owner','dispose'])test(`ACK predecessor rejects later ${change} without touching retained copies`,{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);const acknowledged=structuredClone(h.session.getSnapshot().trip);
  if(change==='recovery'||change==='cache'){
   const other={...structuredClone(acknowledged),title:'Later explicit traveller edit'};
   const saved=await h.broker(()=>true).save(other,{canonicalBase:acknowledged,writeId:'later-authored'});assert.equal(saved.stored,true);
   if(change==='cache'){const ack=await h.broker(()=>true).acknowledge(other,{...other,updatedAt:'2026-10-26T00:04:00.000Z'},saved.handle);assert.equal(ack.outcome,'acknowledged');}
  }
  if(change==='input'){
   const read=await h.input(acknowledged,()=>true).read();assert.equal(read.kind,'readable');
   const draft=updateBuilderInputDraft(read.draft,acknowledged,{kind:'destination-add'},'retained new input','owner-a');
   assert.equal((await h.input(acknowledged,()=>true).write(draft)).ok,true);
  }
  if(change==='navigation')assert.equal(await h.broker(()=>true).clearCurrent(),true);
  if(change==='owner')h.rotate();if(change==='dispose')h.session.dispose();
  const before=copies(h);await releaseWork(h,release);assert.deepEqual(copies(h),before);
  assert.deepEqual(h.session.getSnapshot().trip,acknowledged);assert.equal(h.trace.accountWrites,1);
  if(change!=='owner'&&change!=='dispose'){
   assert.equal(h.session.getSnapshot().routeWorkBlocked,true);assert.equal(h.trace.writes.at(-1).result.stored,false);
   assert.notEqual(builderDetailsStatus(acknowledged,'en',[],true).state,'saving');
   if(h.trace.lastProjection){const replay=await h.broker(()=>true).save(h.trace.lastProjection.trip,h.trace.lastProjection.options);assert.equal(replay.stored,false);assert.deepEqual(copies(h),before);}
  }
 }finally{release();h.close();}
});
test('new date command invalidates the late response and its old acknowledged authority',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);
  assert.equal((await h.session.accept({kind:'dates',startDate:'2027-01-07',endDate:'2027-01-28'},h.session.getSnapshot().inputRevision)).ok,true);
  const latest=structuredClone(h.session.getSnapshot().trip),before=copies(h);await releaseWork(h,release);
  assert.deepEqual(h.session.getSnapshot().trip,latest);assert.deepEqual(copies(h),before);
  assert.equal(h.trace.writes.filter(w=>w.projection).length,0);
  await accountAck(h);h.control.transferGate=null;await h.run();await h.session.waitForDeviceWrites();await accountAck(h);
  assert.equal(h.session.getSnapshot().trip.startDate,'2027-01-07');assert.equal(h.session.getSnapshot().trip.endDate,'2027-01-28');
  const reopened=await h.broker(()=>true).read(latest.id);assert.equal(reopened.kind,'found');assert.deepEqual(reopened.trip,h.session.getSnapshot().trip);
 }finally{release();h.close();}
});
test('replaying an acknowledged projection cannot replace its successful generation',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);await releaseWork(h,release);assert.equal(h.trace.writes.at(-1).result.stored,true);
  const before=copies(h);const replay=await h.broker(()=>true).save(h.trace.lastProjection.trip,h.trace.lastProjection.options);
  assert.equal(replay.stored,false);assert.deepEqual(copies(h),before);
 }finally{release();h.close();}
});

for(const proof of ['missing','foreign'])test(`missing or foreign ACK authority stays protected: ${proof}`,{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);h.control.proof=proof;const before=copies(h);await releaseWork(h,release);
  const result=h.trace.writes.at(-1).result;assert.equal(result.stored,false);assert.equal(result.writeAttempted,false);assert.equal(result.projectionDeferred,true);assert.deepEqual(copies(h),before);
 }finally{release();h.close();}
});
test('valid foreign-owner recovery remains untouched by owner A projection',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);
  const foreign=createTwoStoreTripPersistence(h.storage,h.driver,{ownerId:'owner-b',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
  const other={...fixture(),ownerId:'owner-b',title:'Foreign retained trip'};assert.equal((await foreign.save(other,{newTripOrClone:true,writeId:'foreign'})).stored,true);
  const before=await foreign.read(other.id);await releaseWork(h,release);assert.equal(h.trace.writes.at(-1).result.stored,true);assert.deepEqual(await foreign.read(other.id),before);
 }finally{release();h.close();}
});
test('provider failure after ACK reaches retry state without clearing account or input records',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.gate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);h.control.providerError=true;await releaseWork(h,release);
  const snapshot=h.session.getSnapshot();assert.equal(snapshot.routeWorkBlocked,false);assert.ok(snapshot.trip.brief.cascadeStatus.routeReconciliation.residual.some(u=>u.phase==='failed'));
  assert.equal(builderDetailsStatus(snapshot.trip,'en').state,'error');assert.equal(snapshot.trip.stops.length,4);
  await accountAck(h);const reopened=await h.broker(()=>true).read(snapshot.trip.id);assert.equal(reopened.kind,'found');assert.deepEqual(reopened.trip,h.session.getSnapshot().trip);
 }finally{release();h.close();}
});

test('projection quota after ACK never claims an active worker or discards retained inputs',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);const before=copies(h);h.storage.failRecoveries=true;await releaseWork(h,release);
  assert.equal(h.trace.writes.at(-1).result.stored,false);assert.equal(h.session.getSnapshot().routeWorkBlocked,true);
  assert.notEqual(builderDetailsStatus(h.session.getSnapshot().trip,'en',[],h.session.getSnapshot().routeWorkBlocked).state,'saving');assert.deepEqual(copies(h),before);
 }finally{release();h.close();}
});
test('cache change after native projection setter cannot be acknowledged as current',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);const canonical=structuredClone(h.session.getSnapshot().trip);
  const {cacheCanonicalTripWithRecoveryToStorage,tripCacheStorageKey}=await load('lib/easyt/storage.ts');
  const run=h.driver.run.bind(h.driver);let changed=false,cacheRaw;
  h.driver.run=(scope,id,mode,decide,entries)=>{
   if(!changed&&mode==='readwrite'&&[...h.storage.values.keys()].some(k=>k.includes('trip-recovery'))){changed=true;
    assert.equal(cacheCanonicalTripWithRecoveryToStorage(h.storage,{...canonical,title:'A later acknowledged value',updatedAt:'2026-10-26T00:05:00.000Z'}).stored,true);
    cacheRaw=h.storage.getItem(tripCacheStorageKey('owner-a',canonical.id));
   }
   return run(scope,id,mode,decide,entries);
  };
  await releaseWork(h,release);assert.equal(changed,true);assert.equal(h.trace.writes.at(-1).result.stored,false);
  assert.deepEqual(h.session.getSnapshot().trip,canonical);assert.equal(h.storage.getItem(tripCacheStorageKey('owner-a',canonical.id)),cacheRaw);
  assert.ok([...h.storage.values.keys()].some(k=>k.includes('trip-recovery')),'uncertain projection stays retained');
 }finally{release();h.close();}
});
test('navigation cleared after pointer readback cannot become a successful projection',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);const canonical=structuredClone(h.session.getSnapshot().trip);
  const read=h.driver.readCurrent.bind(h.driver);let cleared=false;
  h.driver.readCurrent=async owner=>{const value=await read(owner);
   if(!cleared&&value&&JSON.parse(value).source==='recovery'){cleared=true;assert.equal(await h.broker(()=>true).clearCurrent(),true);}
   return value;
  };
  await releaseWork(h,release);assert.equal(cleared,true);assert.equal(h.trace.writes.at(-1).result.stored,false);
  assert.equal(JSON.parse(await read('owner-a')).backend,'cleared');assert.deepEqual(h.session.getSnapshot().trip,canonical);
  assert.ok([...h.storage.values.keys()].some(k=>k.includes('trip-recovery')));
 }finally{release();h.close();}
});
test('a paired native writer starting during final readback retains both copies and prevents acceptance',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);
  const {saveTripRecoveryToStorage}=await load('lib/easyt/storage.ts'),run=h.driver.run.bind(h.driver);let inserted=false;
  h.driver.run=async(scope,id,mode,decide,entries)=>{if(!inserted&&mode==='readonly'&&entries?.length===3&&entries.some(e=>e.scope.kind==='recovery-claim')){
   const p=h.trace.lastProjection;assert.ok(p);const result=saveTripRecoveryToStorage(h.storage,{...p.trip,title:'Later paired edit'},{ownerId:'owner-a',replace:{ownerId:'owner-a',tripId:p.trip.id,writeId:p.options.writeId},writeId:'later-paired',deferRetirement:true});assert.equal(result.stored,true);inserted=true;
  }return run(scope,id,mode,decide,entries);};
  await releaseWork(h,release);assert.equal(inserted,true);assert.equal(h.trace.writes.at(-1).result.stored,false);
  assert.ok([...h.storage.values.keys()].filter(k=>k.includes('trip-recovery')).length>=2);
 }finally{release();h.close();}
});
test('input overflow during final readback prevents stale projection acceptance',{timeout:15000},async()=>{
 const h=await harness('native','owner-a');let release;h.control.transferGate=new Promise(r=>{release=r});
 try{await prepare(h);await h.run();await accountAck(h);const run=h.driver.run.bind(h.driver);let inserted=false;
  h.driver.run=async(scope,id,mode,decide,entries)=>{if(!inserted&&mode==='readonly'&&entries?.length===3&&entries.some(e=>e.scope.kind==='recovery-claim')){
   inserted=true;const p=h.trace.lastProjection,prior=await h.input(p.trip,()=>true).read();assert.equal(prior.kind,'readable');
   const draft=updateBuilderInputDraft(prior.draft,p.trip,{kind:'destination-add'},'later retained input','owner-a');h.storage.blockedKey=builderInputDraftKey('owner-a',p.trip.id);
   const result=await h.input(p.trip,()=>true).write(draft);assert.equal(result.ok,true);h.storage.blockedKey=null;inserted=true;
  }return run(scope,id,mode,decide,entries);};
  await releaseWork(h,release);assert.equal(inserted,true);assert.equal(h.trace.writes.at(-1).result.stored,false);
  const input=await h.input(h.trace.lastProjection.trip,()=>true).read();assert.equal(input.kind,'readable');assert.ok(input.draft.fields.some(f=>f.raw==='later retained input'));
 }finally{release();h.close();}
});
