import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {builderClosure} from './helpers/qa-persistence-source-fixture.ts';
import {createBuilderEntrySession} from '../lib/easyt/trip-builder-entry-session.ts';
import {durableBuilderRecoveryUrl} from '../lib/easyt/builder-durable-url.ts';
import * as storageApi from '../lib/easyt/storage.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {createBuilderEditSession} from '../lib/easyt/trip-builder-edit-session.ts';
import {readBuilderInputDraft,writeBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {tripSyncRecoveryPath,tripSyncSignInPath} from '../lib/easyt/trip-continuity.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/batch14-guest-bootstrap.json',import.meta.url),'utf8'));
class Memory {values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}}
const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function actualArrow(name:string,scope:Record<string,unknown>){
 let expression:string|undefined;
 const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)expression=node.initializer?.getText(ast);ts.forEachChild(node,visit);};
 visit(ast);assert.ok(expression,name);
 const js=ts.transpileModule(`const callback = ${expression};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('scope',`with(scope){${js}return callback;}`)(scope);
}
async function bootstrap(options:{prior?:any;candidate?:any;owner?:string|null;source?:boolean;loaded?:(record:any,storage:Memory)=>any}={}){
 const memory=new Memory(),prior=options.prior??structuredClone(fixture.trip),candidate=options.candidate??{...structuredClone(fixture.trip),updatedAt:fixture.renderedUpdatedAt},owner=options.owner??null;
 storageApi.saveTripRecoveryToStorage(memory,prior,{ownerId:prior.ownerId,writeId:'original-write'});
 const state={seed:null as any,blocked:false,error:'',stored:null as any};
 const scope:Record<string,unknown>={useCallback:(cb:unknown)=>cb,hydrated:true,builderSeed:null,pendingInterpretation:false,tripUnavailable:false,origin:candidate.brief.intent.route.origin.name,tripBrief:'',activePlaceMentions:[],stops:candidate.stops,language:'en',
  activeBrowserOwnerId:owner,activeBrowserOwnerIdRef:{current:owner},hydratedOwnerScopeRef:{current:owner},activeTripDocument:candidate,builderCurrentDocumentRef:{current:candidate},builderMountedRef:{current:true},
  builderCreationTokenRef:{current:null},builderCreationReplayScopeRef:{current:null},entryKind:'explicit-trip',builderEditSessionRef:{current:null},
  builderEntrySessionRef:{current:null},builderEntryInputRevisionRef:{current:0},builderEntryHydrationRevisionRef:{current:0},builderEntrySequenceRef:{current:0},builderEntryFeedbackRef:{current:null},
  builderEntrySourceReceiptRef:{current:null},pendingNewTripReceiptRef:{current:null},builderSeedPendingRef:{current:false},builderInitialOverflowRef:{current:false},handoffLookupSessionRef:{current:null},
  hydratedCanonicalTripRef:{current:options.source?candidate:null},recoveryHandleRef:{current:options.source?storageApi.loadTripRecoveryFromStorage(memory,prior.id,prior.ownerId):null},
  builderSearchParams:new URLSearchParams(),requireReadableTripDocument,createBuilderEntrySession,durableBuilderRecoveryUrl,
  window:{location:{href:'https://synthetic.test/journey/new'},history:{replaceState(){}}},
  canUseHydratedTripScope:storageApi.canUseHydratedTripScope,sameRecoveryDocument:storageApi.sameRecoveryDocument,
  saveTripRecovery:async(trip:any,options:Parameters<typeof storageApi.saveTripRecoveryToStorage>[2])=>{state.stored=storageApi.saveTripRecoveryToStorage(memory,trip,options);return state.stored;},
  loadTripRecovery:async(id:string,scopeOwner:string|null)=>{const record=storageApi.loadTripRecoveryFromStorage(memory,id,scopeOwner);return options.loaded?options.loaded(record,memory):record;},
  reportQaPersistenceBoundary(){},reportPersistenceOutcome(){},recoveryPersistenceOutcome:()=> 'unknown',recoveryFailureMessage:()=> 'Recovery refused',
  setDevicePersistenceOutcome(){},setDeviceRecoveryDurable(){},setDeviceRecoveryBlocked:(blocked:boolean)=>state.blocked=blocked,setDeviceStorageBlocked:()=>{},setSaveState:()=>{},setCloudSaveError:(message:string)=>state.error=message,setBuilderSeed:(seed:any)=>state.seed=seed};
 scope.ensureBuilderEntry=actualArrow('ensureBuilderEntry',scope);
 scope.persistDeviceRecovery=(...args:unknown[])=>builderClosure('persistDeviceRecovery')(scope,args);
 let effect:string|undefined;
 const select=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('const start=async()=>{')){assert.equal(effect,undefined);effect=node.arguments[0].getText(ast);}ts.forEachChild(node,select);};
 select(ast);assert.ok(effect?.includes('void start();'));
 const js=ts.transpileModule(`const run = ${effect!.replace('void start();','return start();')};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 await new Function('scope',`with(scope){${js}return run();}`)(scope);
 return {memory,state,candidate};
}
test('timestamp-only guest reconstruction seeds the acknowledged document and exact original handle',async()=>{
 const h=await bootstrap();assert.equal(h.state.blocked,false);assert(h.state.seed,'The accepted durable document must mount');assert.equal(h.state.seed.initialTrip.updatedAt,fixture.trip.updatedAt);assert.equal(h.state.seed.initialRecovery.writeId,'original-write');assert.equal(h.state.stored.handle.writeId,'original-write');assert.equal(h.state.seed.allowRecoverySync,true);
 const session=createBuilderEditSession({...h.state.seed,getOwnerId:()=>null,readDraft:(trip,owner)=>readBuilderInputDraft(h.memory,trip,owner),writeDraft:(trip,draft,owner)=>writeBuilderInputDraft(h.memory,trip,draft,owner),saveRecovery:(trip,options)=>storageApi.saveTripRecoveryToStorage(h.memory,trip,options),acknowledgeRecovery:()=>{throw Error('Guest must not acknowledge cloud');},persistAccount:async()=>{throw Error('Guest must not write cloud');},reconcile:async()=>{throw Error('No requested projection');},now:()=>fixture.trip.updatedAt,schedule:()=>()=>{}});
 try{assert.equal(session.getSnapshot().error,null);assert.equal(session.getSnapshot().recovery!.writeId,'original-write');assert.deepEqual(session.getSnapshot().trip,h.state.seed.initialTrip);}finally{session.dispose();}
});
for(const change of ['authored','generation','retained-content','identity'] as const)test(`a real ${change} difference cannot mount through existing guest recovery`,async()=>{
 const candidate={...structuredClone(fixture.trip),updatedAt:fixture.renderedUpdatedAt};
 if(change==='authored')candidate.brief.mustDo='A traveller changed this';
 if(change==='generation')candidate.brief.builderCalendarGeneration=17;
 if(change==='retained-content')candidate.brief.retainedAuthoredContent={version:1,entries:[{id:'retained',sourceStop:{id:'old',name:'Old stay',country:'Nicaragua'},sourceIntentIds:[],days:[],itineraryIdeas:[],mapPins:[]}]};
 if(change==='identity')candidate.brief.intent.route.origin.providerId='another-geographic-identity';
 const h=await bootstrap({candidate});assert.equal(h.state.seed,null);assert.equal(h.state.stored.blockedByExistingRecovery,true);assert.equal(storageApi.loadTripRecoveryFromStorage(h.memory,fixture.trip.id,null)!.writeId,'original-write');
});
test('a cloud-owned revision difference is never treated as a guest render',async()=>{
 const prior={...structuredClone(fixture.trip),ownerId:'owner-a'},candidate={...structuredClone(prior),updatedAt:fixture.renderedUpdatedAt};const h=await bootstrap({prior,candidate,owner:'owner-a'});assert.equal(h.state.seed,null);assert.equal(h.state.stored.blockedByExistingRecovery,true);
});
for(const foreign of ['owner','trip','missing','later-write'] as const)test(`bootstrap cannot seed a ${foreign} recovery after its acknowledged write`,async()=>{
 const h=await bootstrap({loaded:(record,memory)=>{
  if(foreign==='owner')return {...record,ownerId:'owner-b'};
  if(foreign==='trip')return {...record,tripId:'other-trip'};
  if(foreign==='missing')return null;
  const later={...record,writeId:'later-write',savedAt:new Date(Date.parse(record.savedAt)+1).toISOString()};memory.setItem(`easyt:trip-recovery:v2:guest:${record.tripId}:later-write`,JSON.stringify(later));return storageApi.loadTripRecoveryFromStorage(memory,record.tripId,null);
 }});assert.equal(h.state.seed,null);assert.equal(h.state.blocked,true);
});
test('Builder device recovery keeps the same draft and owner context in its editable surface',async()=>{
 for(const mounted of [false,true]){let target='';await actualArrow('recoverFromSaveError',{builderEditSessionRef:{current:mounted?{}:null},mountedBuilder:{snapshot:{historicalRecovery:false}},syncAction:'open-device',activeTripDocument:fixture.trip,tripSyncRecoveryPath,window:{location:{assign:(url:string)=>target=url}}})();assert.equal(target,`/journey/new?trip=${fixture.trip.id}&recover=1`);}
});
test('completed planner recovery and sign-in retain their existing protected routing',()=>{
 const id='completed trip';assert.equal(tripSyncRecoveryPath(id),'/journey/new?trip=completed%20trip&recover=1');assert.equal(tripSyncSignInPath(id),`/journey/login?next=${encodeURIComponent(tripSyncRecoveryPath(id))}`);
});

for(const change of ['missing','later-write'] as const)test(`an opened recovery cannot mount a ${change} version after hydration`,async()=>{
 const h=await bootstrap({source:true,candidate:structuredClone(fixture.trip),loaded:record=>change==='missing'?null:{...record,writeId:'later-write'}});assert.equal(h.state.seed,null);assert.equal(h.state.blocked,true);
});
