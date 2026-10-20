// Regression derived from the deferred-projection investigation. All storage is isolated.
// IndexedDbModel executes the real native API adapter; it is not a browser engine.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const load=p=>import(pathToFileURL(repo+'/'+p));
const {default:ts}=await load('node_modules/typescript/lib/typescript.js');
const {createAsyncBuilderEditSession}=await load('lib/easyt/trip-builder-async-edit-session.ts');
const candidateModule=process.env.MORROVIA_IDB_PROJECTION_CANDIDATE_MODULE;
const {createTwoStoreTripPersistence}=await (candidateModule?import(pathToFileURL(candidateModule)):load('lib/easyt/two-store-trip-persistence.ts'));
const {browserRecoveryGuard}=await load('lib/easyt/browser-recovery-persistence.ts');
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
async function harness(mode,browserOwner=null){
 const storage=new Storage(),model=new IndexedDbModel(),driver=await openIndexedDbRecoveryDriver(model.factory());
 const initial=fixture(),ownerId=browserOwner;initial.ownerId=ownerId;let owner=ownerId;
 const control={gate:null,providerError:false,storageError:false,noResults:false,beforeProjectionSave:null};
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
 const trace={providerCalls:0,reconcileCalls:0,merges:[],writes:[],candidates:[],timers:[],accountWrites:0};let writeId=0;
 const reconcile=actualReconciler(trace);
 const session=await createAsyncBuilderEditSession({initialTrip:read.trip,initialRecovery:read.recovery,getOwnerId:()=>owner,allowRecoverySync:ownerId!==null,
  readDraft:(trip)=>input(trip,()=>true).read(),
  writeDraft:(trip,draft,_owner,guard)=>input(trip,guard?.isCurrent??(()=>true)).write(draft),
  saveRecovery:async(trip,meta)=>{
   trip=structuredClone(trip);
   const saveGuard=browserRecoveryGuard(meta.isCurrent),writer=broker(saveGuard);
   if(meta.projectionOnly&&control.storageError)return {stored:false,handle:meta.replace,writeAttempted:false,blockedByExistingRecovery:false,failureReason:'device-unavailable'};
   const id='write-'+(++writeId),prepared=await input(trip,saveGuard).prepare(meta.draft,id+':input');
   if(!prepared.ok){const result={stored:false,projectionDeferred:Boolean(meta.projectionOnly),writeAttempted:false,handle:meta.replace,blockedByExistingRecovery:prepared.reason==='protected'};trace.writes.push({projection:Boolean(meta.projectionOnly),preparation:prepared,result});return result;}
   const saveOptions={state:meta.state,replace:structuredClone(meta.replace),canonicalBase:structuredClone(meta.canonicalBase),expectedRecoverySource:structuredClone(meta.expectedRecoverySource),
    projectionOnly:structuredClone(meta.projectionOnly),writeId:id,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId:trip.id,writeId:id},input:prepared.input,receipt:null}};
   if(meta.projectionOnly){trace.candidates.push({trip:structuredClone(trip),options:structuredClone(saveOptions)});await control.beforeProjectionSave?.({trip,options:saveOptions,meta,prepared,storage,model,driver,broker});}
   const result=await writer.save(trip,saveOptions);
   const comparable=structuredClone(trip),before=meta.expectedRecoverySource;
   if(before){comparable.legs=before.legs;comparable.brief.routeAssessment=before.brief.routeAssessment;
    if(comparable.brief.cascadeStatus&&before.brief.cascadeStatus)comparable.brief.cascadeStatus.routeReconciliation=before.brief.cascadeStatus.routeReconciliation;
    comparable.brief.intent.route.projectionInputKey=before.brief.intent.route.projectionInputKey;}
   let inputParent=null;try{inputParent=JSON.parse(prepared.entry.raw).parent;}catch{/* Preserve malformed-envelope refusal for assertions. */}
   trace.writes.push({projection:Boolean(meta.projectionOnly),result,sourceBackend:meta.replace?.backend??'native',inputParent,authoredWhitelistDifferences:before?differences(before,comparable):[]});
   return result;
  },
  reconcile:async(request,signal)=>{trace.reconcileCalls++;if(control.gate)await control.gate;if(control.providerError)throw Error('Synthetic provider unavailable');if(control.noResults)return {...request,results:[],legs:[]};const response=await reconcile(request,signal);const merge=mergeBuilderProjectionResponse(request.trip,response,request);trace.merges.push({ok:merge.ok,reason:merge.reason,changes:merge.ok?differences(request.trip,merge.trip):[]});return response;},
  persistAccount:async()=>{trace.accountWrites++;throw Error('No external account writes permitted in isolated repro');},
  acknowledgeRecovery:async()=>{throw Error('Unexpected account acknowledgement');},
  now:()=> '2026-10-19T00:01:00.000Z',schedule:(callback,delay)=>{const timer={callback,delay,active:true};trace.timers.push(timer);return ()=>{timer.active=false;};}});
 return {session,trace,storage,driver,model,broker,control,rotate:()=>{owner='other-owner';},setOwner:value=>{owner=value;},
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

async function coldRead(h){
 const storage=new Storage();storage.values=structuredClone(h.storage.values);
 const model=new IndexedDbModel();model.data=structuredClone(h.model.data);
 const driver=await openIndexedDbRecoveryDriver(model.factory()),trip=h.session.getSnapshot().trip;
 try{return await createTwoStoreTripPersistence(storage,driver,{ownerId:trip.ownerId,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true}).read(trip.id);}
 finally{driver.close?.();}
}
export {harness,accepted,copies,retained,turn,coldRead};
