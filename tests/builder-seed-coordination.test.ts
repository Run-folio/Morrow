import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { homeRecoveryFixture } from './helpers/home-recovery-fixture.ts';
import { builderClosure } from './helpers/qa-persistence-source-fixture.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { canUseHydratedTripScope, sameRecoveryDocument } from '../lib/easyt/storage.ts';

const source=()=>readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
function effect(kind:'seed'|'autosave',scope:Record<string,unknown>) {
  const text=source(),tree=ts.createSourceFile('builder.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let expression='';
  function visit(node:ts.Node){
    if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect') {
      const body=node.arguments[0]?.getText(tree)??'';
      if(kind==='seed'?body.includes('const openedRecovery='):body.includes('lastAcknowledgedCanonicalRef.current = null;'))expression=body;
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);assert.ok(expression);
  expression=expression.replace('void start();','__work.push(start());');
  const js=ts.transpileModule(`const callback=${expression};return callback();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const work:Promise<unknown>[]=[];
  return {cleanup:new Function('scope','__work',`with(scope){${js}}`)(scope,work) as (()=>void)|undefined,work};
}
function gate<T>() {let resolve!:(value:T)=>void;return {promise:new Promise<T>(yes=>{resolve=yes;}),resolve:(value:T)=>resolve(value)};}
function fixture() {
  const trip=homeRecoveryFixture(null).trip,write=gate<any>(),read=gate<any>();let seeded:any=null;
  const feedback:unknown[]=[],timers:Array<()=>Promise<void>>=[];
  const scope:any={builderSeed:null,hydrated:true,pendingInterpretation:null,resolvingLocations:false,tripUnavailable:false,
    canUseHydratedTripScope,hydratedOwnerScopeRef:{current:null},activeBrowserOwnerId:null,origin:'',tripBrief:'Selected stops',activePlaceMentions:[],stops:trip.stops,
    hydratedCanonicalTripRef:{current:null},activeTripDocument:trip,requireReadableTripDocument,recoveryHandleRef:{current:null},
    receiptAcknowledgementRef:{current:null},builderSeedPendingRef:{current:false},builderEditSessionRef:{current:null},handoffLookupSessionRef:{current:null},
    builderSearchParams:new URLSearchParams(),reportQaPersistenceBoundary(){},reportPersistenceOutcome(){},language:'en',
    setDevicePersistenceOutcome(v:unknown){feedback.push(v);},setDeviceStorageBlocked(v:unknown){feedback.push(v);},setSaveState(v:unknown){feedback.push(v);},setCloudSaveError(v:unknown){feedback.push(v);},setDeviceRecoveryBlocked(v:unknown){feedback.push(v);},setDeviceRecoveryDurable(v:unknown){feedback.push(v);},
    setBuilderSeed(v:unknown){seeded=v;},persistDeviceRecovery:()=>write.promise,loadTripRecovery:()=>read.promise,sameRecoveryDocument,
    arrivedFromHomepage:false,cloudConflictTrip:null,deviceRecoveryBlocked:false,deviceStorageBlocked:false,lastAcknowledgedCanonicalRef:{current:null},planningAttemptIdRef:{current:null},
    window:{setTimeout(fn:()=>Promise<void>){timers.push(fn);return timers.length;},clearTimeout(){}},
    recoveryPersistenceOutcome:(v:any)=>v.stored?'device-confirmed':'protected-conflict',recoveryFailureMessage:()=> 'Protected recovery',tripDocumentsCanonicalEquivalent:()=>false};
  const handle={ownerId:null,tripId:trip.id,writeId:'seed-write'};
  return {trip,scope,write,read,handle,feedback,timers,seeded:()=>seeded};
}

test('actual seed reserves the existing lookup queue before native write/readback, and autosave cannot start a second writer',async()=>{
  const f=fixture();let rawMutations=0;
  const lookupSession={statuses:new Map(),handled:new Set()};
  const outcomeScope={isCurrent:()=>true,handoffLookupSessionRef:{current:lookupSession},lookupSession,
    builderEditSessionRef:f.scope.builderEditSessionRef,activeBrowserOwnerIdRef:{current:null},lookupOwnerId:null,lookupTripId:f.trip.id,
    builderSeedPendingRef:f.scope.builderSeedPendingRef,pendingHandoffOutcomes:[] as unknown[],
    handoffOutcomeIsCurrent:()=>true,removedPlaceMentionIdsRef:{current:[]},placeSelectionsRef:{current:[]},intakeSelectionKeys:new Set(),authoredContentKey:JSON.stringify,
    referenceGeographicAcceptanceMatches:()=>true,preferredHandoffLocationChoice:()=>({name:'Resolved place'}),
    setHandoffResolutionStatuses(){},isOriginMention:()=>false,seedById:new Map(),handoffStopOccurrenceId:()=> 'synthetic-stop',handoffOccurrenceMentionIdsRef:{current:{}},
    setStops(){rawMutations++;},setLocationChoices(){}};
  const text=source(),body=text.slice(text.indexOf('      const onOutcome ='),text.indexOf('      const runLookups ='));
  const js=ts.transpileModule(body+'\nreturn onOutcome;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const outcome=new Function('scope',`with(scope){${js}}`)(outcomeScope);
  const seed=effect('seed',f.scope);
  await outcome({item:{mentionId:'synthetic-mention',status:'resolved'},value:[],status:'resolved'});
  effect('autosave',f.scope);
  assert.equal(rawMutations,0,'enrichment during a canonical reservation must not mutate the guarded source');
  assert.equal(outcomeScope.pendingHandoffOutcomes.length,1);
  assert.equal(f.timers.length,0,'the seed owns initial persistence until its readback finishes');
  f.write.resolve({stored:true,handle:f.handle});
  f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  assert.equal(f.seeded().initialTrip.id,f.trip.id);
  assert.equal(f.scope.builderSeedPendingRef.current,true,'queued outcomes remain held until the editor mounts');
});

test('retired actual seed cannot report another readback as a competing recovery or mount a stale editor',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);
  f.write.resolve({stored:true,handle:f.handle});await Promise.resolve();await Promise.resolve();
  seed.cleanup?.();
  f.read.resolve({...f.handle,writeId:'newer-write',trip:f.trip});await Promise.all(seed.work);
  assert.equal(f.seeded(),null);assert.deepEqual(f.feedback,[],'a retired attempt cannot publish protected feedback');
});

test('seed failure releases the reservation and reports refusal without a false device acknowledgement',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);
  f.write.resolve({stored:false,blockedByExistingRecovery:true,recoveryDurable:true,failureReason:'protected-recovery'});await Promise.all(seed.work);
  assert.equal(f.seeded(),null);assert.equal(f.scope.builderSeedPendingRef.current,false);
  assert.ok(f.feedback.includes('protected-conflict'));assert.ok(f.feedback.includes('error'));
});

test('actual recovery callback cannot acknowledge an editor snapshot for a retired seed',async()=>{
  const f=fixture(),bindings={useCallback:(callback:unknown)=>callback,builderSeed:null,activeBrowserOwnerId:null,
    builderEditSessionRef:{current:{getSnapshot:()=>({trip:f.trip,browserOwnerId:null,saveState:'local',canonicalSaveState:'local',recovery:f.handle})}},
    builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:null},sameRecoveryDocument};
  const result=await builderClosure('persistDeviceRecovery')(bindings,[f.trip,'seed',()=>false]) as {stored:boolean};
  assert.equal(result.stored,false);
});

test('current unsuccessful seed drains queued lookup failures so their existing retry status is reachable',async()=>{
  const f=fixture(),lookupSession={statuses:new Map([['synthetic-mention','pending']]),handled:new Set(),replayPending:undefined as (()=>Promise<void>)|undefined};
  const queued:unknown[]=[];
  const scope={isCurrent:()=>true,handoffLookupSessionRef:{current:lookupSession},lookupSession,builderEditSessionRef:f.scope.builderEditSessionRef,
    activeBrowserOwnerIdRef:{current:null},lookupOwnerId:null,lookupTripId:f.trip.id,builderSeedPendingRef:f.scope.builderSeedPendingRef,pendingHandoffOutcomes:queued,
    handoffOutcomeIsCurrent:()=>true,removedPlaceMentionIdsRef:{current:[]},placeSelectionsRef:{current:[]},intakeSelectionKeys:new Set(),authoredContentKey:JSON.stringify,setHandoffResolutionStatuses(){}};
  f.scope.handoffLookupSessionRef=scope.handoffLookupSessionRef;
  const text=source(),body=text.slice(text.indexOf('      const onOutcome ='),text.indexOf('      const runLookups ='));
  const js=ts.transpileModule(body+'\nreturn onOutcome;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const outcome=new Function('scope',`with(scope){${js}}`)(scope);
  const seed=effect('seed',f.scope);
  await outcome({item:{mentionId:'synthetic-mention'},status:'failed'});
  assert.equal(lookupSession.statuses.get('synthetic-mention'),'pending');assert.equal(queued.length,1);
  f.write.resolve({stored:false,blockedByExistingRecovery:true,recoveryDurable:true,failureReason:'protected-recovery'});await Promise.all(seed.work);
  assert.equal(queued.length,0);assert.equal(lookupSession.statuses.get('synthetic-mention'),'failed');assert.equal(f.seeded(),null);
});
