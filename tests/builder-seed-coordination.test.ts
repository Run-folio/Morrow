import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { homeRecoveryFixture } from './helpers/home-recovery-fixture.ts';
import { builderClosure } from './helpers/qa-persistence-source-fixture.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { canUseHydratedTripScope, sameRecoveryDocument, deferNewTripNavigation, shouldAllowNewTripNavigation, EASYT_BEFORE_NEW_TRIP_EVENT } from '../lib/easyt/storage.ts';
import { createAbortableEffectScope } from '../lib/easyt/abortable-effect.ts';
import { createBuilderEntrySession } from '../lib/easyt/trip-builder-entry-session.ts';
import { rebalanceTripNights } from '../lib/easyt/night-allocation.ts';
import { validateBuilderStopOrder, routeIntentForAcceptedBuilderOrder } from '../lib/easyt/trip-builder-order.ts';
import { routeIntentFromHandoff } from '../lib/easyt/trip-route-intent.ts';
import { builderDiscoveryInputKey } from '../lib/easyt/trip-builder-recommendations.ts';

const source=()=>readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
function effect(kind:'seed'|'autosave'|'discovery'|'transfer'|'preservation'|'handoff',scope:Record<string,unknown>) {
  const text=source(),tree=ts.createSourceFile('builder.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let expression='';
  function visit(node:ts.Node){
    if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect') {
      const body=node.arguments[0]?.getText(tree)??'';
      if(kind==='seed'?body.includes('const seed=entry.claimSeed()'):kind==='autosave'?body.includes('lastAcknowledgedCanonicalRef.current = null;')
        :kind==='preservation'?body.includes('const preserveBeforeNewTrip'):kind==='handoff'?body.includes('const entry=builderEntrySessionRef.current')&&body.includes('mountedBuilder.snapshot.recovery'):kind==='discovery'?body.includes('Builder preview discovery'):body.includes('void fetch("/api/journey-transfer-resolution"'))expression=body;
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
    useCallback:(fn:any)=>fn,builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:null},builderCurrentDocumentRef:{current:trip},
    builderEntrySessionRef:{current:null},builderEntryHydrationRevisionRef:{current:1},builderEntryInputRevisionRef:{current:0},builderEntrySequenceRef:{current:0},builderEntryFeedbackRef:{current:null},builderEntrySourceReceiptRef:{current:null},pendingNewTripReceiptRef:{current:null},
    createBuilderEntrySession,structuredClone,authoredContentKey:JSON.stringify,builderInitialOverflowRef:{current:false},durableBuilderRecoveryUrl:()=>null,
    receiptAcknowledgementRef:{current:null},builderSeedPendingRef:{current:false},builderEditSessionRef:{current:null},handoffLookupSessionRef:{current:null},
    builderSearchParams:new URLSearchParams(),reportQaPersistenceBoundary(){},reportPersistenceOutcome(){},language:'en',
    setDevicePersistenceOutcome(v:unknown){feedback.push(v);},setDeviceStorageBlocked(v:unknown){feedback.push(v);},setSaveState(v:unknown){feedback.push(v);},setCloudSaveError(v:unknown){feedback.push(v);},setDeviceRecoveryBlocked(v:unknown){feedback.push(v);},setDeviceRecoveryDurable(v:unknown){feedback.push(v);},
    setBuilderSeed(v:unknown){seeded=v;},saveTripRecovery:()=>write.promise,loadTripRecovery:()=>read.promise,sameRecoveryDocument,
    arrivedFromHomepage:false,cloudConflictTrip:null,deviceRecoveryBlocked:false,deviceStorageBlocked:false,lastAcknowledgedCanonicalRef:{current:null},planningAttemptIdRef:{current:null},
    window:{location:{href:'http://synthetic.invalid/journey/new'},history:{replaceState(){}},setTimeout(fn:()=>Promise<void>){timers.push(fn);return timers.length;},clearTimeout(){}},
    recoveryPersistenceOutcome:(v:any)=>v.stored?'device-confirmed':'protected-conflict',recoveryFailureMessage:()=> 'Protected recovery',tripDocumentsCanonicalEquivalent:()=>false};
  const tree=ts.createSourceFile('builder.tsx',source(),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let entryExpression='';
  function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='ensureBuilderEntry')entryExpression=node.initializer!.getText(tree);ts.forEachChild(node,visit)}visit(tree);
  scope.ensureBuilderEntry=new Function('scope',`with(scope){return ${ts.transpileModule('const entry='+entryExpression+';entry;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText.replace('const entry =','').replace(/;\s*entry;\s*$/,'')};}`)(scope);
  scope.persistDeviceRecovery=(...args:any[])=>builderClosure('persistDeviceRecovery')(scope,args);
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
  seed.cleanup?.();f.scope.builderMountedRef.current=false;
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

for (const producer of ['discovery','transfer'] as const) test(`actual ${producer} functional update cannot replace a seed across native write, readback and editor-ready handoff`,async()=>{
  const f=fixture(),response=gate<any>(),submitted:any[]=[],cache:any={};let writes=0;
  const initial=structuredClone(f.trip);
  f.scope.saveTripRecovery=async(candidate:any,options:any)=>{
    writes++;submitted.push(structuredClone(candidate));const result=await f.write.promise;
    return options.isCurrent()?result:{...result,stored:false};
  };
  const first=effect('seed',f.scope);
  const providerScope:any={...f.scope,createAbortableEffectScope,builderDiscoveryInputKey,tripId:f.trip.id,activeBrowserOwnerIdRef:{current:null},
    canonicalBuilder:null,previewDiscovery:cache,previewDiscoveryKey:'source-a',baselineBuilderCanonicalLegs:f.trip.legs,transferResolutionKey:'source-a',
    loadBuilderDiscoveryPlaces:()=>response.promise,fetch:()=>response.promise,
    setPreviewDiscovery(update:(current:any)=>any){
      const next=update(cache);Object.assign(cache,next);
      f.scope.activeTripDocument={...f.trip,updatedAt:'2026-10-14T01:00:00.000Z',recommendations:[{id:'preview-context',kind:'place',title:'Optional preview',reason:'Optional context',stopId:f.trip.stops[0]?.id}]};
    },
    setResolvedBuilderLegs(result:any){f.scope.activeTripDocument={...f.trip,updatedAt:'2026-10-14T01:00:00.000Z',legs:result?.legs??f.trip.legs};}};
  const optional=effect(producer,providerScope);
  response.resolve(producer==='discovery'?[]:{ok:true,json:async()=>({legs:f.trip.legs.map(leg=>({...leg,provider:'Optional transfer response'})),assessments:[]})});
  await new Promise<void>(resolve=>setImmediate(resolve));
  first.cleanup?.();const rerender=effect('seed',f.scope);
  assert.equal(writes,1,'optional recomputation must join the existing frozen writer, not create a competing native write');
  f.write.resolve({stored:true,handle:f.handle,pointerAcknowledged:true});
  f.read.resolve({...f.handle,trip:initial});await Promise.all([...first.work,...rerender.work]);
  assert.deepEqual(submitted,[initial]);assert.deepEqual(f.seeded().initialTrip,initial);
  assert.equal(f.scope.builderSeedPendingRef.current,true,'the accepted seed remains reserved while the async editor is not ready');
  optional.cleanup?.();
});

test('a started actual autosave cannot publish protection after its initial editor generation retires',async()=>{
  const f=fixture(),autosave=effect('autosave',f.scope);
  const save=f.timers[0]();f.feedback.length=0;
  autosave.cleanup?.();f.scope.builderEditSessionRef.current={getSnapshot:()=>({trip:f.trip,browserOwnerId:null,recovery:f.handle,error:null})};
  f.write.resolve({stored:false,blockedByExistingRecovery:true,recoveryDurable:true});await save;
  assert.deepEqual(f.feedback,[],'retired feedback must not poison or close the current editor');
});

function value(name:string,scope:Record<string,unknown>) {
  const tree=ts.createSourceFile('builder.tsx',source(),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
  function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)===name&&node.initializer)expression=node.initializer.getText(tree);ts.forEachChild(node,visit)}visit(tree);assert.ok(expression,name);
  const js=ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function('scope',`with(scope){${js}}`)(scope);
}
function inputHandler(kind:'brief'|'destination-add',scope:Record<string,unknown>) {
  const tree=ts.createSourceFile('builder.tsx',source(),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
  function visit(node:ts.Node){if(ts.isJsxAttribute(node)&&node.initializer&&ts.isJsxExpression(node.initializer)&&node.initializer.expression){
    const text=node.initializer.expression.getText(tree);
    if(kind==='brief'?node.name.getText(tree)==='onValueChange'&&text.includes('setTripBrief(value)'):node.name.getText(tree)==='onChange'&&text.includes('setStopInput(value)'))expression=text;
  }ts.forEachChild(node,visit)}visit(tree);assert.ok(expression);
  return new Function('scope',`with(scope){${ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
}
for(const point of ['write','readback','editor-initializing'] as const) for(const input of ['brief','destination-add','origin','end','dates','fixed-label','fixed-date'] as const) test(`actual ${input} input retires initialization synchronously during ${point}`,async()=>{
  const f=fixture(),seed=effect('seed',f.scope);let visible='';
  const raw=(text:string)=>{assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false,'generation must retire before React can publish input');visible=text};
  Object.assign(f.scope,{retireBuilderEntryForInput:value('retireBuilderEntryForInput',f.scope),setTripBrief:raw,setTripBriefCaptureError(){},cancelCountryAddReview(){},setStopInput:raw,setStopError(){},
    originResolutionVersionRef:{current:0},canonicalJourneyEndpointPlace:(place:any)=>place,setJourneyOrigin:(place:any)=>raw(place.name),journeyEndResolutionVersionRef:{current:0},
    setJourneyEndTouched(){},setJourneyEndInput:raw,setJourneyEndError(){},setJourneyEndResolutionAttempted(){},setJourneyEnd(){},
    startDate:f.trip.startDate,endDate:f.trip.endDate,rememberStructuralChange(){},setStartDate:raw,setEndDate:raw,setDatesManuallyEdited(){},setEndDateStillSuggested(){},
    fixedCommitmentInputRef:{current:{label:'',date:'',generation:0}},setFixedCommitmentLabelState:raw,setFixedCommitmentDateState:raw});
  if(point!=='write'){f.write.resolve({stored:true,handle:f.handle,pointerAcknowledged:true});await new Promise<void>(resolve=>setImmediate(resolve));}
  if(point==='editor-initializing'){f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);assert.ok(f.seeded());}
  const fn=input==='brief'||input==='destination-add'?inputHandler(input,f.scope):value(input==='origin'?'replaceJourneyOrigin':input==='end'?'changeJourneyEndInput':input==='dates'?'updateTravelRange':input==='fixed-label'?'setFixedCommitmentLabel':'setFixedCommitmentDate',f.scope);
  await fn(...(input==='origin'?[{name:'new raw'}]:input==='dates'?['2026-11-01','2026-11-03']:['new raw']));
  assert.ok(visible);assert.equal(f.scope.builderSeedPendingRef.current,false);
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  assert.equal(f.seeded(),null);assert.deepEqual(f.feedback,[]);
});
test('a retired actual recovery consumer cannot install an entry or start a native writer',async()=>{
  const f=fixture();let writes=0;f.scope.saveTripRecovery=async()=>{writes++;return {stored:true,handle:f.handle}};
  const result=await f.scope.persistDeviceRecovery(f.trip,'seed',()=>false);
  assert.equal(result.stored,false);assert.equal(writes,0);assert.equal(f.scope.builderEntrySessionRef.current,null);
});
test('a current entry never acknowledges a foreign incoming trip',async()=>{
  const f=fixture();f.scope.ensureBuilderEntry(f.trip);let writes=0;f.scope.saveTripRecovery=async()=>{writes++;return {stored:true,handle:f.handle}};
  const result=await f.scope.persistDeviceRecovery({...f.trip,id:'foreign-trip'},'other');assert.equal(result.stored,false);assert.equal(writes,0);
  assert.equal(f.scope.builderEntrySessionRef.current.candidate.id,f.trip.id);
});
test('a seed joins the generation writer first started by an autosave whose optional effect cleaned up',async()=>{
  const f=fixture();let writes=0;f.scope.saveTripRecovery=async()=>{writes++;return f.write.promise};
  const autosave=effect('autosave',f.scope),saving=f.timers[0]();autosave.cleanup?.();
  const seed=effect('seed',f.scope);assert.equal(writes,1);
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all([saving,...seed.work]);
  assert.ok(f.seeded());assert.equal(writes,1);assert.ok(!f.feedback.includes('Protected recovery'));
});
test('successful seed and exact handoff cannot relabel or clear protection from another generation',async()=>{
  const f=fixture();f.scope.builderEntryFeedbackRef.current='foreign-generation';
  const seed=effect('seed',f.scope);f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  assert.equal(f.scope.builderEntryFeedbackRef.current,'foreign-generation');
  const entry=f.scope.builderEntrySessionRef.current,session={},snapshot={trip:f.trip,browserOwnerId:null,recovery:f.handle,error:null};
  assert.equal(entry.handoff(session,snapshot),true);
  Object.assign(f.scope,{mountedBuilder:{session,snapshot},currentBuilderEntry:entry,initialCloudSaveError:'Unrelated protection',buildNeedsReview:false,editNeedsReview:false});
  f.scope.builderEntryFeedbackRetired=value('builderEntryFeedbackRetired',f.scope);
  assert.equal(value('cloudSaveError',f.scope),'Unrelated protection');
  f.scope.builderEntryFeedbackRef.current=entry.key;f.scope.builderEntryFeedbackRetired=value('builderEntryFeedbackRetired',f.scope);
  assert.equal(value('cloudSaveError',f.scope),'');
  f.scope.buildNeedsReview=true;assert.equal(value('cloudSaveError',f.scope),'Unrelated protection');f.scope.buildNeedsReview=false;
  f.scope.builderMountedRef.current=false;f.scope.builderEntryFeedbackRetired=value('builderEntryFeedbackRetired',f.scope);
  assert.equal(value('cloudSaveError',f.scope),'Unrelated protection');
});

function preservation(f:ReturnType<typeof fixture>) {
  let listener!:(event:Event)=>void,work!:Promise<any>;
  Object.assign(f.scope,{deferNewTripNavigation,shouldAllowNewTripNavigation,EASYT_BEFORE_NEW_TRIP_EVENT});
  Object.assign(f.scope.window,{addEventListener(_name:string,fn:(event:Event)=>void){listener=fn},removeEventListener(){}});
  const effectScope=effect('preservation',f.scope);
  const event=new Event(EASYT_BEFORE_NEW_TRIP_EVENT);Object.defineProperty(event,'detail',{value:{waitUntil(value:Promise<any>){work=value}}});
  listener(event);return {work,cleanup:effectScope.cleanup};
}
for(const point of ['write','readback'] as const)test(`actual preservation cannot publish feedback or navigation into raw input entered during ${point}`,async()=>{
  const f=fixture(),pending=preservation(f);
  if(point==='readback'){f.write.resolve({stored:true,handle:f.handle,pointerAcknowledged:true});await new Promise<void>(resolve=>setImmediate(resolve));}
  f.scope.retireBuilderEntryForInput=value('retireBuilderEntryForInput',f.scope);let raw='';
  Object.assign(f.scope,{setTripBrief(text:string){raw=text},setTripBriefCaptureError(){}});
  inputHandler('brief',f.scope)('newer raw');
  f.write.resolve({stored:false,handle:f.handle,blockedByExistingRecovery:true});f.read.resolve({...f.handle,trip:f.trip});
  assert.equal(await pending.work,false);assert.equal(raw,'newer raw');assert.deepEqual(f.feedback,[]);
  assert.equal(f.scope.builderEntryFeedbackRef.current,null);pending.cleanup?.();
});
test('actual preservation captures its source and accepts only the exact verified generation',async()=>{
  const f=fixture(),pending=preservation(f);f.write.resolve({stored:true,handle:f.handle,pointerAcknowledged:true});f.read.resolve({...f.handle,trip:f.trip});
  assert.deepEqual(await pending.work,{accepted:true,recoveryNavigation:{sourceHref:'http://synthetic.invalid/journey/new',tripId:f.trip.id}});
  assert.equal(f.scope.builderEntrySessionRef.current.phase,'ready');assert.equal(f.scope.pendingNewTripReceiptRef.current,null);pending.cleanup?.();
});
test('actual ready handoff cannot release a newly installed intake receipt or foreign feedback',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  const entry=f.scope.builderEntrySessionRef.current,session={},snapshot={trip:f.trip,browserOwnerId:null,recovery:f.handle,error:null,canonicalSaveState:'local'};
  assert.equal(entry.handoff(session,snapshot),true);f.scope.builderSeed=f.seeded();f.scope.mountedBuilder={session,snapshot};
  const replacement={replacement:true};f.scope.pendingNewTripReceiptRef.current=replacement;f.scope.builderEntryFeedbackRef.current='foreign-generation';
  effect('handoff',f.scope);
  assert.equal(f.scope.pendingNewTripReceiptRef.current,replacement);assert.equal(f.scope.builderEntryFeedbackRef.current,'foreign-generation');assert.deepEqual(f.feedback,[]);
});
test('actual reviewed device retry starts a fresh guarded writer after native refusal and still waits for editor-ready handoff',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);let writes=1;
  f.write.resolve({stored:false,handle:f.handle,blockedByExistingRecovery:false,nativeFailure:'security'});await Promise.all(seed.work);
  const previous=f.scope.builderEntrySessionRef.current,write=gate<any>();
  Object.assign(f.scope,{mountedBuilder:null,syncAction:'retry',deviceStorageBlocked:true,cloudConflictTrip:null});
  f.scope.saveTripRecovery=async()=>{writes++;return write.promise};f.feedback.length=0;
  const retry=value('recoverFromSaveError',f.scope)();assert.equal(writes,2);assert.notEqual(f.scope.builderEntrySessionRef.current.key,previous.key);
  assert.equal(f.seeded(),null);write.resolve({stored:true,handle:f.handle,pointerAcknowledged:true});
  await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.seeded(),null,'retry cannot seed before exact readback');
  f.read.resolve({...f.handle,trip:f.trip});await retry;assert.ok(f.seeded());assert.equal(f.scope.builderSeedPendingRef.current,true);
  assert.ok(!f.feedback.includes(''),'retry persistence alone cannot clear protected feedback before editor readiness');
});
test('actual reviewed device retry preserves a competing protected recovery and never seeds it',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);f.write.resolve({stored:false,handle:f.handle,blockedByExistingRecovery:false,nativeFailure:'security'});await Promise.all(seed.work);
  Object.assign(f.scope,{mountedBuilder:null,syncAction:'retry',deviceStorageBlocked:true,cloudConflictTrip:null});
  f.scope.saveTripRecovery=async()=>({stored:false,handle:{...f.handle,writeId:'competing'},blockedByExistingRecovery:true,failureReason:'protected-recovery'});
  await value('recoverFromSaveError',f.scope)();assert.equal(f.seeded(),null);assert.equal(f.scope.recoveryHandleRef.current,null);
  assert.equal(f.scope.builderSeedPendingRef.current,false);assert.ok(f.feedback.includes('Protected recovery'));
});

test('actual explicit retry does not duplicate a held writer and preserves a newer raw input on completion',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);f.write.resolve({stored:false,handle:f.handle,blockedByExistingRecovery:false});await Promise.all(seed.work);
  Object.assign(f.scope,{mountedBuilder:null,syncAction:'retry',deviceStorageBlocked:true,cloudConflictTrip:null});
  let writes=0;const retryWrite=gate<any>();f.scope.saveTripRecovery=async()=>{writes++;return retryWrite.promise};
  const first=value('recoverFromSaveError',f.scope)();await value('recoverFromSaveError',f.scope)();assert.equal(writes,1);
  f.scope.retireBuilderEntryForInput=value('retireBuilderEntryForInput',f.scope);let raw='';
  Object.assign(f.scope,{setTripBrief(text:string){raw=text},setTripBriefCaptureError(){}});f.feedback.length=0;
  inputHandler('brief',f.scope)('newer raw');retryWrite.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await first;
  assert.equal(raw,'newer raw');assert.equal(f.seeded(),null);assert.equal(f.scope.recoveryHandleRef.current,null);assert.deepEqual(f.feedback,[]);
});
test('actual explicit retry reports an unknown read/write rejection only into its own current generation',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);f.write.resolve({stored:false,handle:f.handle,blockedByExistingRecovery:false});await Promise.all(seed.work);
  Object.assign(f.scope,{mountedBuilder:null,syncAction:'retry',deviceStorageBlocked:true,cloudConflictTrip:null});
  f.scope.saveTripRecovery=async()=>{throw new Error('synthetic unavailable')};f.feedback.length=0;
  await value('recoverFromSaveError',f.scope)();assert.equal(f.seeded(),null);assert.equal(f.scope.builderSeedPendingRef.current,false);
  assert.equal(f.scope.recoveryHandleRef.current,null);assert.ok(f.feedback.includes('unknown'));assert.ok(f.feedback.includes('error'));
});

test('actual seeded initialization failure retries with a fresh exact entry while its closure still captures the old seed',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  const previous=f.scope.builderEntrySessionRef.current;f.scope.builderSeed=f.seeded();
  const tree=ts.createSourceFile('builder.tsx',source(),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
  function visit(node:ts.Node){if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useBuilderEditSession')expression=node.arguments[2].getText(tree);ts.forEachChild(node,visit)}visit(tree);
  const failed=new Function('scope',`with(scope){${ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(f.scope);
  failed();assert.equal(previous.phase,'failed');assert.ok(f.scope.builderSeed,'actual closure deliberately retains the old React seed');
  Object.assign(f.scope,{mountedBuilder:null,syncAction:'retry',deviceStorageBlocked:true,cloudConflictTrip:null});
  const nextHandle={...f.handle,writeId:'reviewed-retry'},nextRead=gate<any>();let writes=0;
  f.scope.saveTripRecovery=async(_trip:any,options:any)=>{writes++;assert.deepEqual(options.replace,f.handle);return {stored:true,handle:nextHandle}};
  f.scope.loadTripRecovery=()=>nextRead.promise;
  const retry=value('recoverFromSaveError',f.scope)();await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(writes,1,'old nonnull seed may not refuse a newly reviewed generation');
  assert.notEqual(f.scope.builderEntrySessionRef.current.key,previous.key);nextRead.resolve({...nextHandle,trip:f.trip});await retry;
  assert.equal(f.seeded().initialRecovery.writeId,nextHandle.writeId);assert.equal(f.scope.recoveryHandleRef.current.writeId,nextHandle.writeId);
});

function jsxCallback(file:string,tag:string,attribute:string,scope:Record<string,unknown>) {
  const text=readFileSync(new URL(file,import.meta.url),'utf8'),tree=ts.createSourceFile('actual.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression:string|undefined;
  function visit(node:ts.Node){if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(tree)===tag){
    const property=node.attributes.properties.filter(ts.isJsxAttribute).find(item=>item.name.getText(tree)===attribute);
    if(property?.initializer&&ts.isJsxExpression(property.initializer)&&property.initializer.expression)expression=property.initializer.expression.getText(tree);
  }ts.forEachChild(node,visit)}visit(tree);
  if(!expression)return undefined;
  return new Function('scope',`with(scope){${ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
}
for(const name of ['onEndChange','onEndModeChange','onEndSelect','onStartSelect'] as const)test(`actual legacy ${name} retains local input but refuses the old held seed`,async()=>{
  const f=fixture(),seed=effect('seed',f.scope);let draft:any={journeyOrigin:{name:''},journeyEndInput:'',journeyEnd:{mode:'unknown'}};
  Object.assign(f.scope,{retireBuilderEntryForInput:value('retireBuilderEntryForInput',f.scope),setDetailsDraft(update:any){draft=typeof update==='function'?update(draft):update},
    journeyEndpointPlaceFromSuggestion:(value:any)=>value,chooseJourneyEndMode(){throw new Error('unmounted legacy branch expected')}});
  const callback=jsxCallback('../app/journey/new/trip-builder.tsx','JourneyEndpointsEditor',name,f.scope);assert.ok(callback);
  await callback(name==='onEndModeChange'?'same_as_start':name==='onEndChange'?'new raw end':{name:'new chosen endpoint',country:'France',canonicalPlaceId:'paris'});
  assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false,'raw/selected details must retire before the asynchronous checkpoint can return');
  assert.ok(draft.journeyOrigin.name||draft.journeyEndInput||draft.journeyEnd.mode==='same_as_start');
  f.write.resolve({stored:true,handle:f.handle,pointerAcknowledged:true});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  assert.equal(f.seeded(),null);assert.deepEqual(f.feedback,[]);
});
function actualDetailsEditor(scope:Record<string,unknown>,props:Record<string,unknown>) {
  const text=readFileSync(new URL('../app/journey/new/trip-builder-details-editor.tsx',import.meta.url),'utf8');
  const tree=ts.createSourceFile('details.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration='';
  for(const node of tree.statements)if(ts.isFunctionDeclaration(node)&&node.name?.text==='TripBuilderDetailsEditor')declaration=node.getText(tree).replace(/^export /,'');
  assert.ok(declaration);
  const js=ts.transpileModule(declaration+'\nreturn TripBuilderDetailsEditor(props);',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  return new Function('scope','props',`with(scope){${js}}`)(scope,props);
}
function element(tree:any,tag:string):any {if(tree?.type===tag)return tree;for(const child of tree?.props?.children??[]){if(Array.isArray(child)){for(const value of child){const found=element(value,tag);if(found)return found}}else {const found=element(child,tag);if(found)return found}}return null}
for(const field of ['date','travellers','budget'] as const)test(`actual legacy internal ${field} handler retires initialization in the same event stack`,async()=>{
  const f=fixture(),seed=effect('seed',f.scope),timeline:string[]=[],states:any[]=[];let stateIndex=0;
  f.scope.retireBuilderEntryForInput=value('retireBuilderEntryForInput',f.scope);
  const port=field==='date'?'onDatesChange':field==='travellers'?'onTravellersChange':'onBudgetChange';
  const props={language:'en',startPlace:{name:''},endSelection:{mode:'unknown'},startDate:f.trip.startDate,endDate:f.trip.endDate,travellers:2,budget:'mid',sourceFingerprint:'frozen-source',onCommit(){},children:()=>null,
    [port]:jsxCallback('../app/journey/new/trip-builder.tsx','TripBuilderDetailsEditor',port,f.scope)};
  const tree=actualDetailsEditor({React:{createElement(type:any,props:any,...children:any[]){return {type,props:{...props,children}}}},styles:{},EasyTButton:'EasyTButton',EasyTSelect:'EasyTSelect',MorroviaDatePicker:'MorroviaDatePicker',MorroviaQuantitySelector:'MorroviaQuantitySelector',useEffect(){},useRef:(current:any)=>({current}),
    useState(initial:any){const index=stateIndex++;states[index]=initial;return [initial,(update:any)=>{timeline.push('functional-update');states[index]=typeof update==='function'?update(states[index]):update}]}},props);
  const control=element(tree,field==='date'?'MorroviaDatePicker':field==='travellers'?'MorroviaQuantitySelector':'EasyTSelect');assert.ok(control);
  control.props.onChange(field==='date'?{start:'2026-11-02',end:'2026-11-09'}:field==='travellers'?4:{target:{value:'high'}});timeline.push('event-complete');
  assert.ok(timeline.includes('functional-update'));assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false,'held Promise continuations cannot precede synchronous parent retirement');
  assert.equal(field==='date'?states[0].startDate:field==='travellers'?states[0].travellers:states[0].budget,field==='date'?'2026-11-02':field==='travellers'?4:'high');
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  assert.equal(f.seeded(),null);assert.deepEqual(f.feedback,[]);
});
test('actual parent input capture retires before an invalid date picker raw-text handler publishes its unparsed input',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);f.scope.retireBuilderEntryForInput=value('retireBuilderEntryForInput',f.scope);
  const text=source(),ast=ts.createSourceFile('builder.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let captureExpression='';
  function visit(node:ts.Node){if(ts.isJsxOpeningElement(node)&&node.tagName.getText(ast)==='div'&&node.attributes.getText(ast).includes('id="builder-summary"')){
    const capture=node.attributes.properties.filter(ts.isJsxAttribute).find(item=>item.name.getText(ast)==='onInputCapture');if(capture?.initializer&&ts.isJsxExpression(capture.initializer)&&capture.initializer.expression)captureExpression=capture.initializer.expression.getText(ast);
  }ts.forEachChild(node,visit)}visit(ast);
  const capture=captureExpression?new Function('scope',`with(scope){${ts.transpileModule(`return (${captureExpression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(f.scope):undefined;
  let raw='',parsed=0;const event={target:{value:'2026-1x-incomplete'}};
  capture?.(event);
  const change=jsxCallback('../components/easyt/morrovia-date-picker.tsx','input','onChange',{setTypedDate(value:string){raw=value},props:{onTypedDraftChange(){parsed++}},activeBoundary:'start'});assert.ok(change);change(event);
  assert.equal(raw,event.target.value);assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false,'unparsed date text must invalidate the native generation even when valid-date onChange is silent');
  assert.equal(parsed,1,'existing raw-date callback behavior is preserved');
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);assert.equal(f.seeded(),null);assert.deepEqual(f.feedback,[]);
});

for(const change of ['remove','order','night','undo'] as const)test(`actual pre-editor ${change} control preserves its visible change and refuses the old held seed`,async()=>{
  const f=fixture(),seed=effect('seed',f.scope);let visibleStops=structuredClone(f.trip.stops),visibleAllocation=Object.fromEntries(f.trip.stops.map(stop=>[stop.id,stop.nights??0])),visibleIntent=structuredClone(f.trip.brief.intent),published=0;
  const noOp=()=>{};
  Object.assign(f.scope,{retireBuilderEntryForInput:value('retireBuilderEntryForInput',f.scope),useCallback:(fn:any)=>fn,
    captureStructuralChange:(summary:string)=>({summary}),publishStructuralChange(){published++},
    setStops(update:any){visibleStops=typeof update==='function'?update(visibleStops):update;f.scope.builderCurrentDocumentRef.current={...f.trip,stops:visibleStops}},
    setTripIntent(update:any){visibleIntent=typeof update==='function'?update(visibleIntent):update},
    scheduleLocks:{stopIds:[],arrivalDates:{}},stopRemovalSafety:()=>({blocked:false}),setStopRemovalBlocked:noOp,placeSelections:[],capturedStructuredBrief:{placeMentions:[]},handoffOccurrenceMentionIdsRef:{current:{}},
    allocation:visibleAllocation,setShowStopEditor:noOp,setDayAllocations(next:any){visibleAllocation=next},setManualNightStopIds:noOp,setRoutePreviewStopIds:noOp,setSelectedRouteStopId:noOp,setNightEditFeedback:noOp,setScheduleLocks:noOp,setDecisionSelections:noOp,setKeptRouteKey:noOp,
    protectedBuilderStopIds:[],fixedBuilderChronology:false,validateBuilderStopOrder,routeIntentFromHandoff,routeIntentForAcceptedBuilderOrder,
    journeyEnd:f.trip.brief.intent.route.journeyEnd,effectiveStructuredBrief:f.trip.brief.structuredBrief,routeIntelligence:{route:{recommendedStopIds:[]}},
    totalNights:6,manualNightStopIds:[],nightAllocationStops:f.trip.stops.map(stop=>({id:stop.id,name:stop.name,country:stop.country})),effectiveIntent:f.trip.brief.intent,fixedAllocationCommitments:[],sourceRouteKey:undefined,rebalanceTripNights,nightRebalanceFeedback:()=>null,
    lastStructuralChange:{stops:[...f.trip.stops].reverse(),allocations:visibleAllocation,manualNightStopIds:[],startDate:f.trip.startDate,endDate:f.trip.endDate,locks:{stopIds:[],arrivalDates:{}},placeSelections:[],completedPlanningAreaMentionIds:[],removedPlaceMentionIds:[]},
    setStartDate:noOp,setEndDate:noOp,setPlaceSelections:noOp,setCompletedPlanningAreaMentionIds:noOp,setRemovedPlaceMentionIds:noOp,setCapturedStructuredBrief:noOp,setLastStructuralChange:noOp});
  f.scope.rememberStructuralChange=value('rememberStructuralChange',f.scope);
  if(change==='remove'){assert.equal(await value('removeStop',f.scope)(f.trip.stops[0].id),true);assert.ok(!visibleStops.some(stop=>stop.id===f.trip.stops[0].id));}
  if(change==='order'){assert.equal(await value('commitStopOrder',f.scope)(f.trip.stops.map(stop=>stop.id).reverse(),'drag'),true);assert.deepEqual(visibleStops.map(stop=>stop.id),f.trip.stops.map(stop=>stop.id).reverse());}
  if(change==='night'){const before=visibleAllocation[f.trip.stops[0].id];await value('updateAllocatedDays',f.scope)(f.trip.stops[0].id,before+1);assert.notEqual(visibleAllocation[f.trip.stops[0].id],before);}
  if(change==='undo'){await value('undoStructuralChange',f.scope)();assert.deepEqual(visibleStops.map(stop=>stop.id),f.trip.stops.map(stop=>stop.id).reverse());}
  assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false,'canonical source mutation must retire before the held native completion');
  assert.equal(published,change==='undo'?0:1,'existing Undo metadata publication remains intact');
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);assert.equal(f.seeded(),null);assert.deepEqual(f.feedback,[]);
});

test('actual pre-editor provider clarification keeps its selected point and invalidates the original seed',async()=>{
  const f=fixture(),seed=effect('seed',f.scope);let selected:any,advanced=0;
  Object.assign(f.scope,{retireBuilderEntryForInput:value('retireBuilderEntryForInput',f.scope),requiresPhysicalIslandVerification:()=>false,isOriginMention:()=>false,
    handoffLookupSessionRef:{current:{handled:new Set()}},handoffOccurrenceMentionIdsRef:{current:{}},handoffStopOccurrenceId:()=>f.trip.stops[0].id,
    capturedStructuredBrief:{placeMentions:[]},intakeMentions:[],insertHandoffOccurrence:(current:any[],next:any)=>current.map(stop=>stop.id===next.id?{...stop,...next}:stop),
    planningAreaViewRef:{current:{generation:0}},discoverySearchVersionRef:{current:0},
    activeDiscoveryRef:{current:{open:true,mentionId:'selected-mention'}},
    setStops(update:any){selected=update(f.trip.stops)},setLocationChoices(){},advanceClarificationSession(){advanced++;}});
  f.scope.capturePlanningAreaView=value('capturePlanningAreaView',f.scope);
  const choice={name:f.trip.stops[0].name,country:f.trip.stops[0].country,canonicalPlaceId:f.trip.stops[0].canonicalPlaceId,coordinates:[f.trip.stops[0].longitude,f.trip.stops[0].latitude]};
  await value('chooseProviderClarification',f.scope)({mentionId:'selected-mention',canonicalName:choice.name},choice);
  assert.equal(advanced,1,'the current pre-editor chooser still completes normally');
  assert.ok(selected);assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false);
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);assert.equal(f.seeded(),null);assert.deepEqual(f.feedback,[]);
});
for(const current of [false,true])test(`actual accepted brief capture ${current?'retires its replaced source':'preserves its existing stale-response refusal'}`,async()=>{
  const f=fixture(),seed=effect('seed',f.scope),response=gate<any>();let visible='';
  Object.assign(f.scope,{retireBuilderEntryForInput:value('retireBuilderEntryForInput',f.scope),requestJourneyCapture:()=>response.promise,
    setTripBrief(value:string){visible=value},setCapturedStructuredBrief(){},setPlanningSuggestions(){},setIntakeMentions(){},setPlaceSelections(){},setCompletedPlanningAreaMentionIds(){},setRemovedPlaceMentionIds(){},setHasPromptContext(){},setRouteHints(){},
    normalizeTripInterests:(items:any)=>items,newTripCapturedJourneyEnd:(_brief:any,end:any)=>end,journeyEndTouched:false,setJourneyEnd(){},setJourneyEndInput(){},setTripIntent(){},isOriginMention:()=>false,datesManuallyEdited:true});
  const capture=value('applyTripBrief',f.scope)(new AbortController().signal,()=>current,'new accepted source');
  response.resolve({structuredBrief:f.trip.brief.structuredBrief,mentions:[],routeHints:[],journeyEnd:{mode:'unknown'}});await capture;
  assert.equal(visible,current?'new accepted source':'');assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),!current);
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  assert.equal(Boolean(f.seeded()),!current);assert.deepEqual(f.feedback,[]);
});

for(const change of ['planning-area','transport-choice','build-status'] as const)test(`actual pre-editor ${change} source boundary refuses stale initialization`,async()=>{
  const f=fixture(),seed=effect('seed',f.scope);let changed=false;
  f.scope.retireBuilderEntryForInput=value('retireBuilderEntryForInput',f.scope);
  if(change==='planning-area'){
    Object.assign(f.scope,{PLACE_INTELLIGENCE_VERSION:1,PLACE_INTELLIGENCE_PARSER_VERSION:'synthetic',capturedStructuredBrief:f.trip.brief.structuredBrief,intakeMentions:[],
      appendSelectedPlanningAreaMention:()=>({mention:{mentionId:'broad-area',canonicalName:'France'},result:{mentions:[{mentionId:'broad-area'}],issues:[]}}),
      setCapturedStructuredBrief(update:any){const next=update(f.trip.brief.structuredBrief);changed=next.placeMentions.some((m:any)=>m.mentionId==='broad-area')},setIntakeMentions(){},setRemovedPlaceMentionIds(){},setTransientPlanningMentionId(){},setBaseSearchInputs(){},setBaseSearchErrors(){},setStopError(){},setStopChecking(){},setResolvingPlaceMentionId(){},setStopInput(){},setShowStopEditor(){},setSummaryFocus(){},setClarificationSessionIds(){},setClarificationIndex(){},setClarificationAutoOpened(){},setClarificationDismissed(){},setClarificationOpen(){}});
    assert.ok(await value('beginPlanningAreaClarification',f.scope)({name:'France',canonicalPlaceId:'france'},'preferred'));
  }else if(change==='transport-choice'){
    Object.assign(f.scope,{selectTripLegTransportChoice:(trip:any)=>({...trip,brief:{...trip.brief,decisionSelections:{transportByLeg:{leg:'selected-choice'}}}}),setDecisionSelections(next:any){changed=next.transportByLeg.leg==='selected-choice'}});
    const callback=jsxCallback('../app/journey/new/trip-builder.tsx','TripBuilderRouteWorkspace','onTransportChoiceChange',f.scope);assert.ok(callback);await callback('leg','selected-choice');
  }else{
    Object.assign(f.scope,{builderBuildRequestRef:{current:null},setBuildNeedsReview(){},buildInvariant:{canBuildTrip:true},setOpeningTrip(){},acceptCurrentRoute(){},setTripStatus(status:string){changed=status==='planned'},setBuildRequested(){}});
    value('openBuiltTrip',f.scope)();
  }
  assert.equal(changed,true,'explicit source mutation is executed by the production callback');
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);assert.equal(f.seeded(),null,'the held checkpoint/readback must not install its old source after an explicit mutation');assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false);assert.deepEqual(f.feedback,[]);
});

test('actual explicit Discovery clarification source replacement retires before a held add-stop validation continues',async()=>{
  const f=fixture(),seed=effect('seed',f.scope),adding=gate<boolean>();let changed=false;
  const selected={mentionId:'clarification',canonicalPlaceId:f.trip.stops[0].canonicalPlaceId,status:'resolved',provenance:[{id:'synthetic',kind:'builder'}]};
  Object.assign(f.scope,{retireBuilderEntryForInput:value('retireBuilderEntryForInput',f.scope),discoveryEntry:{kind:'clarification'},activeClarificationMention:{mentionId:'clarification'},
    discoveryClarificationSearchCanAdd:()=>true,capturedStructuredBrief:f.trip.brief.structuredBrief,intakeMentions:[],PLACE_INTELLIGENCE_VERSION:1,PLACE_INTELLIGENCE_PARSER_VERSION:'synthetic',
    selectPlaceSearchSuggestion:()=>({mentions:[selected],parserVersion:'synthetic',issues:[]}),handoffLookupSessionRef:{current:{handled:new Set()}},retireHandoffResolutionStatus:(current:any)=>current,
    setHandoffResolutionStatuses(){},setLocationChoices(){},extractStructuredTripBrief:()=>({...f.trip.brief.structuredBrief,placeMentions:[selected]}),
    setCapturedStructuredBrief(next:any){changed=next.placeMentions[0].mentionId==='clarification'},setIntakeMentions(){},fixedTripCommitmentsFromStructuredBrief:()=>[],addStop:()=>adding.promise,advanceClarificationSession(){}});
  const tree=ts.createSourceFile('builder.tsx',source(),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
  function visit(node:ts.Node){if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==='onSelect'&&ts.isArrowFunction(node.initializer)&&node.initializer.getText(tree).includes('discoveryEntry.kind === "clarification"'))expression=node.initializer.getText(tree);ts.forEachChild(node,visit)}visit(tree);assert.ok(expression);
  const callback=new Function('scope',`with(scope){${ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(f.scope);
  await callback({name:f.trip.stops[0].name,country:f.trip.stops[0].country,canonicalPlaceId:f.trip.stops[0].canonicalPlaceId,placeType:'city'});assert.equal(changed,true);
  f.write.resolve({stored:true,handle:f.handle});f.read.resolve({...f.handle,trip:f.trip});await Promise.all(seed.work);
  assert.equal(f.seeded(),null,'confirmed capture metadata cannot be overwritten while its add-stop validation is still held');assert.equal(f.scope.builderEntrySessionRef.current.isCurrent(),false);
  adding.resolve(false);await Promise.resolve();assert.deepEqual(f.feedback,[]);
});

// Execute the actual entry writer/retry with the real two-store broker. Only
// React publication and the native Storage/IDB driver are contract fixtures.
// A pointer failure leaves an exact body; optional render recomputation must
// not turn the deliberate acknowledgement retry into a different document.
for(const [competing,receipt,fault] of [[false,false,'pointer'],[true,false,'pointer'],[false,true,'pointer'],[false,true,'receipt'],[false,true,'pending-pointer'],[false,false,'retired']] as const)test(`partial native entry retry ${competing?'protects a competing body':'reuses its frozen body despite later render recomputation'}${receipt?' with required homepage receipt':''} (${fault})`,async()=>{
 const {createTwoStoreTripPersistence}=await import('../lib/easyt/two-store-trip-persistence.ts');
 const {MemoryRecoveryDriver}=await import('./helpers/durable-recovery-driver.ts');
 const {currentTripStorageKey,tripRecoveryStorageKey}=await import('../lib/easyt/storage.ts');
 const values=new Map<string,string>();let pointerBlocked=fault!=='receipt',receiptBlocked=false,receiptKey='';
 const storage={get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,
  setItem(k:string,v:string){if(receiptBlocked&&k===receiptKey)throw new DOMException('synthetic receipt only','SecurityError');if(pointerBlocked&&k===currentTripStorageKey(null))throw new DOMException('synthetic pointer only','SecurityError');values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const f=fixture(),driver=new MemoryRecoveryDriver();let writes=0;
 const broker=createTwoStoreTripPersistence(storage,driver,{ownerId:null,isCurrent:()=>true,overflowEnabled:false,accountOverflowQualified:false});
 if(receipt){const home=homeRecoveryFixture(null),handoff=await import('../lib/easyt/home-trip-handoff.ts');let pending:any;
  for(const [key,raw] of home.native)values.set(key,raw);
  if(fault==='receipt'||fault==='pending-pointer'){pending=handoff.createPendingIntakeReceipt(home.snapshot,{handoffId:home.intake.completed.handoffId,tripId:home.trip.id});receiptKey=home.native[0][0];values.set(receiptKey,JSON.stringify({snapshot:home.snapshot,receipt:pending}));values.set(handoff.HOME_TRIP_DRAFT_KEY,JSON.stringify({version:2,phase:'pending-interpretation',receipt:pending}));receiptBlocked=fault==='receipt';}
  f.scope.pendingNewTripReceiptRef.current={snapshot:home.snapshot,receipt:home.intake.completed,pending,draft:home.draft,fromHomepage:true};f.scope.homepageHandoffMatchesTrip=handoff.homepageHandoffMatchesTrip;}
 f.scope.saveTripRecovery=async(trip:any,options:any)=>{const {isCurrent,ownerId,intake,...saveOptions}=options;const id='attempt-'+ ++writes;const context={ownerId,isCurrent,overflowEnabled:false,accountOverflowQualified:false};let prepared:any;
  if(intake){prepared=await (await import('../lib/easyt/homepage-persistence.ts')).prepareIntakeAcknowledgement(storage,driver,context,intake,trip,id+':intake');assert.equal(prepared.ok,true);}
  return createTwoStoreTripPersistence(storage,driver,context).save(trip,{...saveOptions,writeId:id,...(prepared?{entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId:trip.id,writeId:id},input:null,receipt:prepared.receipt}}:{})});};
 f.scope.loadTripRecovery=async(id:string)=>{const read=await broker.read(id);return read.kind==='found'?{...read.recovery,trip:read.trip}:null;};
 const partial=await f.scope.persistDeviceRecovery(f.trip,'seed',()=>true);assert.equal(partial.stored,false);assert.equal(partial.failureReason,fault==='receipt'?'receipt-incomplete':'pointer-incomplete');assert.equal(f.scope.builderEntrySessionRef.current.phase,'failed');
 const oldEntry=f.scope.builderEntrySessionRef.current,retained=new Map(values);assert.equal([...retained.keys()].filter(k=>k.startsWith('easyt:trip-recovery:v2:')).length,1,'body exists but pointer does not');assert.equal(values.has(currentTripStorageKey(null)),fault==='receipt');
 // A later advisory result can reconstruct render state without any authored
 // input retirement. The retry must finish the frozen source, not that render.
 const later={...f.trip,brief:{...f.trip.brief,routeAssessment:{summary:'later advisory render'}}};
 Object.assign(f.scope,{mountedBuilder:null,syncAction:'retry',deviceStorageBlocked:true,cloudConflictTrip:null,activeTripDocument:later});f.scope.builderCurrentDocumentRef.current=later;
 pointerBlocked=false;receiptBlocked=false;
 if(competing){values.clear();values.set(tripRecoveryStorageKey(null,f.trip.id,'foreign-write'),JSON.stringify({version:2,ownerId:null,tripId:f.trip.id,writeId:'foreign-write',state:'pending',savedAt:'2026-10-14T00:00:00Z',trip:{...f.trip,title:'Competing retained body'}}));}
 const beforeRetry=new Map(values);const readback=gate<any>(),readStarted=gate<void>();
 if(fault==='retired'){const load=f.scope.loadTripRecovery;f.scope.loadTripRecovery=async(id:string)=>{const retained=await load(id);readStarted.resolve();await readback.promise;return retained;};}
 const retry=value('recoverFromSaveError',f.scope)();
 if(fault==='retired'){await readStarted.promise;f.scope.builderEntryInputRevisionRef.current++;f.scope.builderEntrySessionRef.current.retire();readback.resolve(null);}
 await retry;
 if(fault==='retired'){assert.equal(f.seeded(),null);assert.equal(f.scope.recoveryHandleRef.current,null);for(const [key,raw] of retained)assert.equal(values.get(key),raw);}
 else if(competing){assert.equal(f.seeded(),null);assert.equal(f.scope.recoveryHandleRef.current,null);assert.deepEqual(values,beforeRetry,'competing bytes remain protected');}
 else{assert.ok(f.seeded(),'exact retained body should become an editor seed after fresh pointer verification');assert.ok(sameRecoveryDocument(f.seeded().initialTrip,oldEntry.candidate));assert.equal(f.scope.recoveryHandleRef.current.writeId,'attempt-1');assert.equal(f.scope.builderEntrySessionRef.current.phase,'ready');for(const [key,raw] of retained)if(key.startsWith('easyt:trip-recovery:v2:'))assert.equal(values.get(key),raw,'retry must retain exact original body');if(fault==='receipt'){const input=JSON.parse(values.get(receiptKey)!);assert.equal(input.receipt.version,1);assert.equal(input.receipt.tripId,f.trip.id);}assert.equal(JSON.parse(values.get(currentTripStorageKey(null))!).tripId,f.trip.id);}
});
