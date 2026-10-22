// Regression derived from the deferred-projection investigation. All storage is isolated.
// IndexedDbModel executes the real native API adapter; it is not a browser engine.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
const load=p=>import(pathToFileURL(repo+'/'+p));
const {default:ts}=await load('node_modules/typescript/lib/typescript.js');
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
const {reconcileBuilderDependencies,mergeBuilderProjectionResponse}=await load('lib/easyt/trip-builder-reconciliation.ts');
const {transferAssessmentForLeg}=await load('lib/easyt/planning-evidence-presentation.ts');
const source=fs.readFileSync(repo+'/app/journey/new/trip-builder.tsx','utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
class Storage {
 values=new Map(); blockedKey=null;
 get length(){return this.values.size;} key(i){return [...this.values.keys()][i]??null;}
 getItem(k){return this.values.get(k)??null;}
 setItem(k,v){if(k===this.blockedKey)throw new DOMException('Isolated input quota','QuotaExceededError');this.values.set(k,v);}
 removeItem(k){this.values.delete(k);}
}
function differences(a,b,p=''){
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return [p];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],p?p+'.'+k:k));
}
function fixture(){
 const payload=routePlannerPayload(publicRouteDetailFor('japan-slow').planDraft,new Date(2026,9,19,12));
 return requireReadableTripDocument(tripFromBuilder({...payload,id:'isolated-japan-liveness',stops:payload.destinations,
  picks:{},mustDo:payload.brief,pace:'slow',hotels:'few',budget:'value',draft:[],createdAt:'2026-10-19T00:00:00.000Z'}));
}
function actualReconciler(trace){
 const snippet=source.slice(source.indexOf('async function reconcileAcceptedBuilderRequest('),source.indexOf('\nfunction TripBuilderDocument()'));
 const scope={reconcileBuilderDependencies,transferAssessmentForLeg,
  geographicallyReady:()=>true,stopGeographicPlace:stop=>stop,guardTripRoutingGeometry:trip=>trip,
  resolveBuilderRecommendation:()=>{throw Error('Optional recommendation must not be dispatched');},
  requestCanonicalTransferResolution:async legs=>{trace.providerCalls++;return {ok:true,legs,assessments:[],failedLegIds:[]};}};
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
 let settled=false,value;
 const render=()=>{scope.activeTripDocument=session.getSnapshot().trip;effects[0]();};
 request(session,session.captureCommandBarrier().isCurrent).then(v=>{settled=true;value=v;});effects[0]();
 return {render,state:()=>({settled,returnedTrip:Boolean(value?.trip)})};
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
 const read=await broker(()=>true).read(initial.id);assert.equal(read.kind,'found');
 const trace={providerCalls:0,reconcileCalls:0,merges:[],writes:[],timers:[],accountWrites:0};let writeId=0;
 const reconcile=actualReconciler(trace);
 const session=await createAsyncBuilderEditSession({initialTrip:read.trip,initialRecovery:read.recovery,getOwnerId:()=>owner,
  readDraft:(trip)=>input(trip,()=>true).read(),
  writeDraft:(trip,draft,_owner,guard)=>input(trip,guard?.isCurrent??(()=>true)).write(draft),
  saveRecovery:async(trip,meta)=>{
   if(meta.projectionOnly&&control.storageError)return {stored:false,handle:meta.replace,writeAttempted:false,blockedByExistingRecovery:false,failureReason:'device-unavailable'};
   const id='write-'+(++writeId),prepared=await input(trip,meta.isCurrent).prepare(meta.draft,id+':input');
   if(!prepared.ok){const result={stored:false,projectionDeferred:Boolean(meta.projectionOnly),writeAttempted:false,handle:meta.replace,blockedByExistingRecovery:prepared.reason==='protected'};trace.writes.push({projection:Boolean(meta.projectionOnly),preparation:prepared,result});return result;}
   const result=await broker(meta.isCurrent).save(trip,{state:meta.state,replace:meta.replace,canonicalBase:meta.canonicalBase,expectedRecoverySource:meta.expectedRecoverySource,
    projectionOnly:meta.projectionOnly,writeId:id,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId:trip.id,writeId:id},input:prepared.input,receipt:null}});
   const comparable=structuredClone(trip),before=meta.expectedRecoverySource;
   if(before){comparable.legs=before.legs;comparable.brief.routeAssessment=before.brief.routeAssessment;
    if(comparable.brief.cascadeStatus&&before.brief.cascadeStatus)comparable.brief.cascadeStatus.routeReconciliation=before.brief.cascadeStatus.routeReconciliation;
    comparable.brief.intent.route.projectionInputKey=before.brief.intent.route.projectionInputKey;}
   trace.writes.push({projection:Boolean(meta.projectionOnly),result,sourceBackend:meta.replace?.backend??'native',inputParent:JSON.parse(prepared.entry.raw).parent,authoredWhitelistDifferences:before?differences(before,comparable):[]});
   return result;
  },
  reconcile:async(request,signal)=>{trace.reconcileCalls++;if(control.gate)await control.gate;if(control.providerError)throw Error('Synthetic provider unavailable');if(control.noResults)return {...request,results:[],legs:[]};const response=await reconcile(request,signal);const merge=mergeBuilderProjectionResponse(request.trip,response,request);trace.merges.push({ok:merge.ok,reason:merge.reason,changes:merge.ok?differences(request.trip,merge.trip):[]});return response;},
  persistAccount:async()=>{trace.accountWrites++;throw Error('No external account writes permitted in isolated repro');},
  acknowledgeRecovery:async()=>{throw Error('Unexpected account acknowledgement');},
  now:()=> '2026-10-19T00:01:00.000Z',schedule:(callback,delay)=>{const timer={callback,delay,active:true};trace.timers.push(timer);return ()=>{timer.active=false;};}});
 return {session,trace,storage,driver,model,broker,control,rotate:()=>{owner='other-owner';},
  run:async()=>{for(const timer of [...trace.timers])if(timer.active&&timer.delay===0){timer.active=false;timer.callback();}for(let i=0;i<100;i++)await turn();},
  close(){session.dispose();driver.close?.();}};
}

const modes=['native','indexeddb-body','indexeddb-input'];
async function accepted(h){
 assert.equal((await h.session.accept({kind:'type',tripType:'one_way'},h.session.getSnapshot().inputRevision)).ok,true);
 assert.equal((await h.session.accept({kind:'dates',startDate:'2026-10-26',endDate:'2026-11-10'},h.session.getSnapshot().inputRevision)).ok,true);
 assert.ok(h.session.getSnapshot().pendingUnits.some(u=>u.kind==='leg'));
}
function copies(h){return {trip:h.session.getSnapshot().trip,draft:h.session.getSnapshot().draft,handle:h.session.getSnapshot().recovery,
 native:structuredClone([...h.storage.values]),domain:structuredClone(h.model.data)};}
async function retained(h,before){
 assert.deepEqual(copies(h),before,'accepted trip/input/handle and every native/domain copy must remain exact');
 const cold=await h.broker(()=>true).read(before.trip.id);assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,before.trip);
 assert.equal(h.trace.accountWrites,0);
}
for(const mode of modes)for(const providerError of [false,true])test(`Build assessment reaches an honest outcome: ${mode}, provider ${providerError?'error':'response'}`,{timeout:15000},async()=>{
 const h=await harness(mode);
 try{
  await accepted(h);h.control.providerError=providerError;const before=copies(h);
  await h.run();await h.session.waitForDeviceWrites();await turn();
  const after=h.session.getSnapshot(),view=assessment(h.session,source);await turn();
  assert.equal(view.state().settled,true,'a stopped route worker must settle Build');
  assert.equal(view.state().returnedTrip,true);assert.equal(after.pendingUnits.some(u=>u.kind!=='recommendation'),false);
  assert.equal(Boolean(after.routeWorkBlocked),false);
  if(providerError)assert.ok(after.failedUnits.length,'provider failure remains terminal failed evidence');
  assert.deepEqual(after.draft,before.draft);
  for(const [key,raw] of before.domain.get('generations'))assert.equal(h.model.data.get('generations').get(key),raw);

 }finally{h.close();}
});
for(const mode of modes)test(`delayed ${mode} route response stays pending until actual worker outcome`,{timeout:15000},async()=>{
 const h=await harness(mode);let release;h.control.gate=new Promise(resolve=>{release=resolve;});
 try{
  await accepted(h);const view=assessment(h.session,source);await h.run();view.render();await turn();
  assert.equal(view.state().settled,false);assert.equal(Boolean(h.session.getSnapshot().routeWorkBlocked),false);
  release();for(let i=0;i<100;i++)await turn();await h.session.waitForDeviceWrites();view.render();await turn();
  assert.equal(view.state().settled,true);assert.equal(view.state().returnedTrip,true);
 }finally{release();h.close();}
});
test('completed domain input does not start another provider call or write on retry',{timeout:15000},async()=>{
 const h=await harness('indexeddb-input');
 try{
  await accepted(h);await h.run();assert.equal(Boolean(h.session.getSnapshot().routeWorkBlocked),false);
  const completed=copies(h);await h.session.resumeNecessaryWork();await h.session.waitForDeviceWrites();
  const view=assessment(h.session,source);await turn();
  assert.deepEqual(view.state(),{settled:true,returnedTrip:true});assert.equal(h.trace.reconcileCalls,1);await retained(h,completed);
 }finally{h.close();}
});
test('completed IDB body does not start another provider call or write on explicit necessary-work retry',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{await accepted(h);await h.run();assert.equal(Boolean(h.session.getSnapshot().routeWorkBlocked),false);
  assert.equal(h.session.getSnapshot().pendingUnits.some(unit=>unit.kind!=='recommendation'),false);const completed=copies(h);
  await h.session.resumeNecessaryWork();await h.session.waitForDeviceWrites();assert.equal(h.trace.reconcileCalls,1);await retained(h,completed);
 }finally{h.close();}
});
for(const mode of modes)for(const retirement of ['input','owner','dispose'])test(`stale ${mode} worker cannot publish blocked or completed work after ${retirement}`,{timeout:15000},async()=>{
 const h=await harness(mode);let release;h.control.gate=new Promise(resolve=>{release=resolve;});
 try{
  await accepted(h);const view=assessment(h.session,source);await h.run();
  if(retirement==='input')await h.session.updateDraft({binding:{kind:'destination-add'},raw:'newer retained input'});
  if(retirement==='owner')h.rotate();
  if(retirement==='dispose')h.session.dispose();
  const before=copies(h);release();for(let i=0;i<100;i++)await turn();view.render();await turn();
  assert.deepEqual(view.state(),{settled:true,returnedTrip:false});assert.equal(Boolean(h.session.getSnapshot().routeWorkBlocked),false);
  await retained(h,before);
 }finally{release();h.close();}
});
for(const mode of modes)test(`${mode} projection storage refusal settles through the existing error and keeps the accepted document`,{timeout:15000},async()=>{
 const h=await harness(mode);try{
  await accepted(h);const before=copies(h);h.control.storageError=true;await h.run();
  const view=assessment(h.session,source);await turn();assert.deepEqual(view.state(),{settled:true,returnedTrip:false});
  assert.equal(h.session.getSnapshot().error?.category,'storage');await retained(h,before);
 }finally{h.close();}
});
test('a provider response with no usable progress settles for review rather than hanging',{timeout:15000},async()=>{
 const h=await harness('native');try{
  await accepted(h);const before=copies(h);h.control.noResults=true;await h.run();
  const view=assessment(h.session,source);await turn();assert.deepEqual(view.state(),{settled:true,returnedTrip:false});
  assert.equal(h.session.getSnapshot().routeWorkBlocked,true);await retained(h,before);
 }finally{h.close();}
});

for(const mode of modes)for(const providerError of [false,true])test(`historical promotion stays fenced after ${mode} route outcome, provider ${providerError?'error':'response'}`,{timeout:15000},async()=>{
 const h=await harness(mode,'owner-a');try{
  await accepted(h);const before=copies(h);h.control.providerError=providerError;await h.run();
  const view=assessment(h.session,source);await turn();
  assert.equal(h.session.getSnapshot().historicalRecovery,true);assert.equal(h.session.getSnapshot().error?.category,'pending');
  assert.equal(await h.session.flush(),false,'route assessment is not permission to promote a historical recovery');
  assert.equal(h.trace.accountWrites,0);assert.equal(h.session.getSnapshot().trip.ownerId,null);
  assert.deepEqual(view.state(),{settled:true,returnedTrip:true});assert.equal(Boolean(h.session.getSnapshot().routeWorkBlocked),false);
  assert.deepEqual(h.session.getSnapshot().draft,before.draft);
  for(const [key,raw] of before.domain.get('generations'))assert.equal(h.model.data.get('generations').get(key),raw);
  const cold=await h.broker(()=>true).read(before.trip.id);assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,h.session.getSnapshot().trip);

 }finally{h.close();}
});
