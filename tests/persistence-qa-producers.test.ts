import assert from 'node:assert/strict';
import test from 'node:test';
import { reportQaPersistenceBoundary, qaNativeFailureCategory, reportPersistenceOutcome, recoveryPersistenceOutcome, recoveryFailureMessage } from '../lib/easyt/persistence-outcome.ts';
import { persistEditableHomepageInputInStorage as persistEditableHomepageInput, projectHomepageInput, homepageReceiptForProjection, readHomepageInput, createPendingIntakeReceipt, homepageHandoffMatchesTrip, acknowledgePendingIntakeReceiptInStorage, type HomeTripDraft, type HomepageInputSnapshot } from '../lib/easyt/home-trip-handoff.ts';
import { saveTripRecovery, saveTripRecoveryToStorage, canUseHydratedTripScope, loadCurrentDraftRecoveryFromStorage, loadTripRecoveryFromStorage, EASYT_TRIP_RECOVERY_PREFIX, EASYT_TRIP_CACHE_PREFIX } from '../lib/easyt/storage.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { homepageInputStorageKey } from '../lib/easyt/private-browser-context.ts';
import { tripFromBuilder } from '../lib/easyt/trip.ts';
import { selectedStopsHomepageInput, emptyHomepageInput } from './fixtures/homepage-dual-entry.ts';
import { resumableNewTripSnapshot } from '../app/journey/new/new-trip-entry-state.ts';
import { authoredContentKey } from '../lib/easyt/trip-retained-authored-content.ts';
import { durableBuilderRecoveryUrl } from '../lib/easyt/builder-durable-url.ts';
import { builderClosure } from './helpers/qa-persistence-source-fixture.ts';

const prefix='[morrovia-persistence-qa] ';
type Mode='ok'|'denied'|'mismatch'|'recovery-denied';
function memory(mode:Mode='ok') {
  const values=new Map<string,string>(); let writes=0;
  return {values,get writes(){return writes;},get length(){return values.size;},key(i:number){return [...values.keys()][i]??null;},
    getItem(k:string){const v=values.get(k)??null;return mode==='mismatch'&&v!==null?'PRIVATE-MISMATCH':v;},
    setItem(k:string,v:string){writes++;if(mode==='denied'||mode==='recovery-denied'&&k.startsWith(EASYT_TRIP_RECOVERY_PREFIX))throw new DOMException('PRIVATE-MESSAGE','SecurityError');values.set(k,v);},
    removeItem(k:string){values.delete(k);}};
}
async function capture(run:(records:any[],storage:ReturnType<typeof memory>)=>Promise<void>,mode:Mode='ok') {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'), oldInfo=console.info, oldFetch=globalThis.fetch, oldFlag=process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
  const records:any[]=[],storage=memory(mode);let requests=0;
  Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{localStorage:storage,location:{origin:'https://staging.morrovia.com',search:'',href:'https://staging.morrovia.com/journey/new'}})});
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='1';
  console.info=(message:unknown)=>{assert.equal(typeof message,'string');assert.ok((message as string).startsWith(prefix));records.push(JSON.parse((message as string).slice(prefix.length)));};
  globalThis.fetch=()=>{requests++;throw new Error('Synthetic network forbidden');};
  try {await run(records,storage);assert.equal(requests,0);assert.doesNotMatch(JSON.stringify(records),/PRIVATE|ownerId|tripId|writeId|payload|message|stack|cookie/);
    for(let i=1;i<records.length;i++)assert.equal(records[i].sequence,records[i-1].sequence+1);
  } finally {console.info=oldInfo;globalThis.fetch=oldFetch;if(oldFlag===undefined)delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS=oldFlag;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
}
function trip() {return tripFromBuilder({id:'PRIVATE-TRIP',origin:'London',journeyEnd:{mode:'same_as_start'},stops:[{id:'PRIVATE-STOP',name:'Rome',country:'Italy',canonicalPlaceId:'rome'}],startDate:'2026-10-20',endDate:'2026-10-27',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[]});}

test('editable preparation/native acceptance/readback precede successful intake completion',async()=>capture(async(records,storage)=>{
  const snapshot=selectedStopsHomepageInput('PRIVATE-OWNER');
  const result=await persistEditableHomepageInput({storage,snapshot,lock:async(_key,run)=>run()});
  assert.equal(result.ok,true);assert.equal(storage.writes,1);
  assert.deepEqual(records.map(v=>[v.boundary,v.accepted]),[['editable-prepare',true],['editable-write',true],['editable-readback',true]]);
  assert.equal(records[1].writeAccepted,true);assert.equal(records[1].readbackConfirmed,null);
  assert.equal(records[2].readbackConfirmed,true);assert.equal(records[2].readbackKind,'editable-input');
  assert.equal(records[2].receiptAcknowledged,null);
}));

test('editable native rejection preserves no-write-readback and classified error without values',async()=>capture(async(records,storage)=>{
  const result=await persistEditableHomepageInput({storage,snapshot:selectedStopsHomepageInput('PRIVATE-OWNER'),lock:async(_key,run)=>run()});
  assert.deepEqual(result,{ok:false,reason:'storage'});assert.equal(storage.values.size,0);
  const failed=records.find(v=>v.accepted===false);assert.equal(failed.boundary,'editable-write');assert.equal(failed.writeAccepted,false);assert.equal(failed.readbackConfirmed,null);assert.equal(failed.nativeFailure,'security');
},'denied'));

test('editable accepted write with failed readback remains different from native refusal',async()=>capture(async(records,storage)=>{
  const result=await persistEditableHomepageInput({storage,snapshot:selectedStopsHomepageInput('PRIVATE-OWNER'),lock:async(_key,run)=>run()});
  assert.deepEqual(result,{ok:false,reason:'storage'});
  const failed=records.find(v=>v.accepted===false);assert.equal(failed.boundary,'editable-readback');assert.equal(failed.writeAccepted,true);assert.equal(failed.readbackConfirmed,false);assert.equal(failed.nativeFailure,null);
},'mismatch'));

test('stale editable token stops before any native write and reports refusal rather than fabricated storage failure',async()=>capture(async(records,storage)=>{
  const result=await persistEditableHomepageInput({storage,snapshot:selectedStopsHomepageInput('PRIVATE-OWNER'),isCurrent:()=>false,lock:async(_key,run)=>run()});
  assert.deepEqual(result,{ok:false,reason:'stale'});assert.equal(storage.writes,0);assert.equal(records[0].accepted,false);assert.equal(records[0].writeAttempted,false);assert.equal(records[0].nativeFailure,null);
}));

test('reserved editable receipt is distinct from stale token and never overwritten',async()=>capture(async(records,storage)=>{
  const snapshot=selectedStopsHomepageInput('PRIVATE-OWNER');
  const receipt=createPendingIntakeReceipt(snapshot,{handoffId:'PRIVATE-HANDOFF',tripId:'PRIVATE-TRIP'});
  const bytes=JSON.stringify({snapshot,receipt});storage.values.set(homepageInputStorageKey(snapshot.ownerId),bytes);
  const result=await persistEditableHomepageInput({storage,snapshot,lock:async(_key,run)=>run()});
  assert.deepEqual(result,{ok:false,reason:'reserved'});assert.equal(storage.writes,0);assert.equal(storage.values.get(homepageInputStorageKey(snapshot.ownerId)),bytes);
  assert.equal(records[0].boundary,'editable-reserved');assert.equal(records[0].accepted,false);
}));

test('native recovery acceptance follows prepared scope/replacement and precedes exact recovery readback',async()=>capture(async(records,storage)=>{
  const result=saveTripRecoveryToStorage(storage,trip(),{ownerId:'PRIVATE-OWNER',writeId:'PRIVATE-WRITE',now:'2026-10-12T00:00:00.000Z'});
  assert.equal(result.stored,true);
  const results=records.filter(v=>v.phase==='result');
  assert.deepEqual(results.map(v=>v.boundary),['recovery-candidate','recovery-scope','recovery-replacement','recovery-write','recovery-readback']);
  assert.ok(records.every(v=>v.accepted===true));assert.equal(results[3].writeAccepted,true);assert.equal(results[3].readbackConfirmed,null);assert.equal(results[4].readbackConfirmed,true);assert.equal(results[4].readbackKind,'recovery');
}));

test('native recovery refusal has an immediately prior accepted replacement prerequisite and unknown readback',async()=>capture(async(records,storage)=>{
  const result=saveTripRecoveryToStorage(storage,trip(),{ownerId:'PRIVATE-OWNER',writeId:'PRIVATE-WRITE'});
  assert.equal(result.stored,false);assert.equal(result.nativeFailure,'security');
  const failed=records.findIndex(v=>v.accepted===false);assert.equal(records[failed-1].boundary,'recovery-replacement');assert.equal(records[failed-1].accepted,true);assert.equal(records[failed].boundary,'recovery-write');assert.equal(records[failed].writeAccepted,false);assert.equal(records[failed].readbackConfirmed,null);
},'denied'));

test('wrong-owner recovery preparation refuses without a native call',async()=>capture(async(records,storage)=>{
  const owned={...trip(),ownerId:'PRIVATE-OTHER'};const result=saveTripRecoveryToStorage(storage,owned,{ownerId:'PRIVATE-OWNER'});
  assert.equal(result.stored,false);assert.equal(storage.writes,0);assert.equal(records.at(-1).boundary,'recovery-scope');assert.equal(records.at(-1).accepted,false);assert.equal(records.at(-1).writeAttempted,false);
}));

test('unavailable recovery storage remains a no-write unknown rather than fabricated native rejection',async()=>capture(async(records,storage)=>{
  Object.defineProperty(window,'localStorage',{get(){throw new DOMException('PRIVATE-ACCESS','SecurityError');}});
  const result=await saveTripRecovery(trip(),{ownerId:'PRIVATE-OWNER'});assert.equal(result.stored,false);assert.equal(storage.writes,0);
  assert.equal(records[0].boundary,'recovery-storage-access');assert.equal(records[0].accepted,false);assert.equal(records[0].nativeFailure,null);assert.equal(records[0].writeAccepted,null);assert.equal(records[0].writeAttempted,false);
}));

test('divergent recovery stays protected and exact reuse never invents a new native record write',async()=>capture(async(records,storage)=>{
  const document=trip();const first=saveTripRecoveryToStorage(storage,document,{ownerId:'PRIVATE-OWNER',writeId:'PRIVATE-FIRST'});assert.equal(first.stored,true);
  records.length=0;const before=storage.writes;
  const reused=saveTripRecoveryToStorage(storage,document,{ownerId:'PRIVATE-OWNER',writeId:'PRIVATE-SECOND'});assert.equal(reused.stored,true);assert.equal(storage.writes-before,1);
  assert.equal(records.at(-1).writeBranch,'exact-reuse');assert.equal(records.at(-1).writeAccepted,null);
  assert.ok(!records.some(v=>v.stage==='native-write'));
  records.length=0;const beforeRefusal=storage.writes;
  const refused=saveTripRecoveryToStorage(storage,{...document,brief:{...document.brief,mustDo:'PRIVATE-CHANGE'}},{ownerId:'PRIVATE-OWNER'});
  assert.equal(refused.blockedByExistingRecovery,true);assert.equal(storage.writes,beforeRefusal);assert.equal(records.at(-1).boundary,'recovery-replacement');assert.equal(records.at(-1).accepted,false);
}));

test('recovery byte-readback refusal follows accepted native write without a native-error claim',async()=>capture(async(records,storage)=>{
  const result=saveTripRecoveryToStorage(storage,trip(),{ownerId:'PRIVATE-OWNER',writeId:'PRIVATE-WRITE'});assert.equal(result.stored,false);assert.equal(result.nativeFailure,undefined);
  const failed=records.at(-1);assert.equal(failed.boundary,'recovery-readback');assert.equal(failed.accepted,false);assert.equal(failed.readbackConfirmed,false);assert.equal(failed.readbackKind,'recovery');assert.equal(failed.nativeFailure,null);assert.equal(records.at(-2).writeAccepted,true);
},'mismatch'));

function intakeBindings(storage:ReturnType<typeof memory>,scope='PRIVATE-OWNER') {
  return {hydrated:true,canUseHydratedTripScope,hydratedOwnerScopeRef:{current:scope},activeBrowserOwnerId:'PRIVATE-OWNER',activeBrowserOwnerIdRef:{current:'PRIVATE-OWNER'},hasRouteSkeleton:false,hasPromptContext:false,tripId:'PRIVATE-TRIP',projectHomepageInput,homepageReceiptForProjection,persistEditableHomepageInput,hasSavedTravelProfile:false,travelProfile:null,markPlanningMilestone(){},planningAttemptIdRef:{current:null},planningModeRef:{current:null},pendingNewTripReceiptRef:{current:null as {snapshot:HomepageInputSnapshot;receipt:ReturnType<typeof homepageReceiptForProjection>;draft:HomeTripDraft}|null},reportQaPersistenceBoundary,qaNativeFailureCategory,applyNewTripIntake(){}};
}
test('actual direct intake closure reports guard/projection/frozen acceptance around the actual native helper',async()=>capture(async(records,storage)=>{
  const bindings=intakeBindings(storage);let applied=false;bindings.applyNewTripIntake=()=>{applied=true;assert.equal(records.at(-1).boundary,'intake-frozen');assert.equal(records.at(-1).accepted,true);};
  await builderClosure('submitNewTripIntake')(bindings,selectedStopsHomepageInput('PRIVATE-OWNER'));
  assert.equal(applied,true);assert.equal(storage.writes,1);
  assert.deepEqual(records.map(v=>v.boundary),['intake-guard','intake-projection','intake-storage-access','editable-prepare','editable-write','editable-readback','intake-frozen']);
}));

test('actual direct wrong-scope guard refuses before input write or projection',async()=>capture(async(records,storage)=>{
  const bindings=intakeBindings(storage,'PRIVATE-OTHER');
  await assert.rejects(async()=>builderClosure('submitNewTripIntake')(bindings,selectedStopsHomepageInput('PRIVATE-OWNER')),/New trip intake is no longer current/);
  assert.equal(storage.writes,0);assert.equal(records.length,1);assert.equal(records[0].accepted,false);assert.equal(records[0].scopeMatches,false);
}));

test('actual direct storage getter refusal is captured before the helper can start',async()=>capture(async(records,storage)=>{
  Object.defineProperty(window,'localStorage',{get(){throw new DOMException('PRIVATE-ACCESS','SecurityError');}});
  await assert.rejects(async()=>builderClosure('submitNewTripIntake')(intakeBindings(storage),selectedStopsHomepageInput('PRIVATE-OWNER')));
  assert.equal(storage.writes,0);const failed=records.at(-1);assert.equal(failed.boundary,'intake-storage-access');assert.equal(failed.nativeFailure,'security');assert.equal(failed.writeAttempted,false);assert.equal(failed.writeAccepted,null);
}));

function hydrationBindings() {
  const values:Record<string,unknown>={sessionPending:false,browserContextReady:true,canUseHydratedTripScope,activeBrowserOwnerId:'PRIVATE-OWNER',authenticatedOwnerId:'PRIVATE-OWNER',sessionUnavailable:false,
    activeBrowserOwnerIdRef:{current:'PRIVATE-OWNER'},builderMountedRef:{current:true},builderInitialOverflowRef:{current:false},
    readDurableHomepageState:async()=>({kind:'ready',storedInput:readHomepageInput(JSON.parse(window.localStorage.getItem(homepageInputStorageKey('PRIVATE-OWNER'))??'null'),'PRIVATE-OWNER'),draft:null,inputRaw:null,draftRaw:null}),
    hydratedOwnerScopeRef:{current:undefined},builderSeedPendingRef:{current:false},pendingNewTripReceiptRef:{current:null},receiptAcknowledgementRef:{current:null},pendingInterpretationRef:{current:null},planningAttemptIdRef:{current:null},activeProjectionTokenRef:{current:null},handoffLookupSessionRef:{current:null},captureRequestGateRef:{current:null},recoveryHandleRef:{current:null},hydratedCanonicalTripRef:{current:null},legacyFocusRef:{current:null},tripId:'PRIVATE-TRIP',
    loadCurrentDraftRecovery:async()=>loadCurrentDraftRecoveryFromStorage(window.localStorage,'PRIVATE-OWNER'),loadRememberedOwner:()=>null,claimGuestTripRecoveryForOwner:async()=>null,travelProfileStorageKey:()=> 'PRIVATE-PROFILE-KEY',travelProfileFromUnknown:()=>null,homepageInputStorageKey,readHomepageInput,publicRouteDetailFor:()=>null,inspirationByKey:{},reportQaPersistenceBoundary,applyAcceptedBuilderDocument(){}};
  return new Proxy(values,{has:(target,key)=>Reflect.has(target,key)||typeof key==='string'&&key.startsWith('set'),get:(target,key)=>Reflect.has(target,key)?target[key as string]:typeof key==='string'&&key.startsWith('set')?()=>{}:undefined});
}
test('actual fresh hydration closure emits resolved readiness before accepted owned fresh entry',async()=>capture(async(records)=>{
  const bindings=hydrationBindings();await builderClosure('hydrate-effect')(bindings);
  assert.deepEqual(records.map(v=>[v.boundary,v.accepted]),[['hydration-ready',true],['hydration-complete',true]]);
  assert.equal(records[1].sessionClass,'signed-in');assert.equal(records[1].entryKind,'fresh');assert.equal(records[1].scopeMatches,true);
}));

test('actual unresolved hydration is a waiting probe, not a false first failure',async()=>capture(async(records)=>{
  const bindings=hydrationBindings();bindings.sessionPending=true;await builderClosure('hydrate-effect')(bindings);
  assert.equal(records.length,1);assert.equal(records[0].phase,'probe');assert.equal(records[0].accepted,null);assert.equal(records[0].sessionClass,'pending');
}));

test('actual missing explicit trip hydration does not falsely acknowledge an accepted entry',async()=>capture(async(records)=>{
  window.location.search='?trip=PRIVATE-MISSING';
  const bindings=hydrationBindings();bindings.loadRequestedTrip=async()=>null;bindings.loadTripRecovery=()=>null;
  await builderClosure('hydrate-effect')(bindings);
  assert.equal(records.at(-1).boundary,'hydration-complete');assert.equal(records.at(-1).accepted,false);assert.equal(records.at(-1).entryKind,'unavailable');
}));

test('actual starter restore records acceptance or access refusal before editing is possible',async()=>{
  for(const denied of [false,true])await capture(async(records,storage)=>{
    if(denied)Object.defineProperty(window,'localStorage',{get(){throw new DOMException('PRIVATE-ACCESS','SecurityError');}});
    let errorShown=false;
    const bindings={ownerId:'PRIVATE-OWNER',language:'en',submitInFlightRef:{current:false},emptyInput:emptyHomepageInput,readHomepageInput,homepageInputStorageKey,resumableNewTripSnapshot,nextEntryId:{current:0},snapshotRef:{current:null},setSnapshot(){},setStartInput(){},setEndInput(){},setReady(){},setError(){errorShown=true;},reportQaPersistenceBoundary,qaNativeFailureCategory};
    await builderClosure('starter-restore')(bindings);
    assert.equal(records[0].boundary,'intake-restore');assert.equal(records[0].accepted,!denied);assert.equal(records[0].writeAttempted,false);assert.equal(records[0].readbackConfirmed,null);assert.equal(errorShown,denied);assert.equal(storage.writes,0);
  });
});

function recoveryBindings(scope='PRIVATE-OWNER') {
  return {useCallback:(callback:unknown)=>callback,builderSeed:null,builderMountedRef:{current:true},builderInitialOverflowRef:{current:false},builderCurrentDocumentRef:{current:trip()},
    builderEditSessionRef:{current:null},activeBrowserOwnerId:'PRIVATE-OWNER',activeBrowserOwnerIdRef:{current:'PRIVATE-OWNER'},language:'en',hydratedOwnerScopeRef:{current:scope},pendingNewTripReceiptRef:{current:null},recoveryHandleRef:{current:null},receiptAcknowledgementRef:{current:null},hydratedCanonicalTripRef:{current:null},
    canUseHydratedTripScope,authoredContentKey,durableBuilderRecoveryUrl,homepageHandoffMatchesTrip,reportPersistenceOutcome,reportQaPersistenceBoundary,
    saveTripRecovery:async(document:Parameters<typeof saveTripRecovery>[0],options:Parameters<typeof saveTripRecovery>[1])=>{
      const recovery=saveTripRecoveryToStorage(window.localStorage,document,options);
      if(!recovery.stored||!options?.intake)return recovery;
      const receipt=await acknowledgePendingIntakeReceiptInStorage({storage:window.localStorage,...options.intake,isCurrent:options.isCurrent,lock:async(_key,run)=>run()});
      return {...recovery,stored:receipt.ok,receiptAcknowledged:receipt.ok};
    },
    loadCurrentDraftRecovery:async()=>loadCurrentDraftRecoveryFromStorage(window.localStorage,'PRIVATE-OWNER')};
}
test('actual Builder recovery scope refuses before invoking the native writer',async()=>capture(async(records,storage)=>{
  const result=await builderClosure('persistDeviceRecovery')(recoveryBindings('PRIVATE-OTHER'),[trip(),'seed']) as any;
  assert.equal(result.stored,false);assert.equal(storage.writes,0);assert.equal(records.at(-1).boundary,'recovery-scope');assert.equal(records.at(-1).accepted,false);assert.equal(records.at(-1).caller,'seed');
}));

test('actual first-save source closures record all preceding prerequisites before selective native recovery refusal',async()=>capture(async(records,storage)=>{
  await builderClosure('hydrate-effect')(hydrationBindings());
  const intake=intakeBindings(storage);await builderClosure('submitNewTripIntake')(intake,selectedStopsHomepageInput('PRIVATE-OWNER', [['PRIVATE-STOP','Rome']]));
  const rec={...recoveryBindings(),pendingNewTripReceiptRef:intake.pendingNewTripReceiptRef};
  const persist=(document:unknown,caller:unknown)=>builderClosure('persistDeviceRecovery')(rec,[document,caller]);
  let seeded=false;
  const bindings={builderSeed:null,hydrated:true,pendingInterpretation:null,resolvingLocations:false,tripUnavailable:false,canUseHydratedTripScope,hydratedOwnerScopeRef:rec.hydratedOwnerScopeRef,activeBrowserOwnerId:'PRIVATE-OWNER',origin:'London',tripBrief:'',activePlaceMentions:[],stops:[{}],hydratedCanonicalTripRef:{current:null},activeTripDocument:trip(),requireReadableTripDocument,recoveryHandleRef:rec.recoveryHandleRef,persistDeviceRecovery:persist,receiptAcknowledgementRef:rec.receiptAcknowledgementRef,reportQaPersistenceBoundary,reportPersistenceOutcome,language:'en',setDevicePersistenceOutcome(){},setDeviceRecoveryDurable(){},recoveryPersistenceOutcome,recoveryFailureMessage:()=>'Device write refused',handoffLookupSessionRef:{current:null},setDeviceStorageBlocked(){},setSaveState(){},setCloudSaveError(){},setDeviceRecoveryBlocked(){},setBuilderSeed(){seeded=true;},builderSearchParams:{get:()=>null},builderSeedPendingRef:{current:false},loadTripRecovery:async(id:string,owner:string|null)=>loadTripRecoveryFromStorage(storage,id,owner)};
  await builderClosure('seed-effect')(bindings);
  assert.equal(seeded,false);
  const first=records.findIndex(v=>v.phase==='result'&&v.accepted===false);
  assert.ok(first>0);assert.equal(records[first].boundary,'recovery-write');assert.equal(records[first].nativeFailure,'security');assert.equal(records[first].writeAttempted,true);assert.equal(records[first].writeAccepted,false);assert.equal(records[first].readbackConfirmed,null);
  assert.equal(records.slice(0,first).filter(v=>v.phase==='result'&&v.accepted===true).at(-1).boundary,'recovery-replacement');
  for(const boundary of ['hydration-complete','intake-guard','intake-projection','editable-write','editable-readback','intake-frozen','recovery-candidate','recovery-scope'])assert.ok(records.slice(0,first).some(v=>v.boundary===boundary&&v.accepted===true),boundary);
  assert.ok(records.some(v=>v.boundary==='recovery-candidate'&&v.caller==='seed'));
  assert.equal(records[first].sessionClass,'signed-in');assert.equal(records[first].entryKind,'fresh');
},'recovery-denied'));

test('initial setter quota and cleanup security stay separate without inventing a retry setter call',async()=>capture(async(records,storage)=>{
  storage.values.set(EASYT_TRIP_CACHE_PREFIX+'PRIVATE-CACHE','{}');let setters=0,cleanups=0;
  storage.setItem=()=>{setters++;throw new DOMException('PRIVATE-QUOTA','QuotaExceededError');};
  storage.removeItem=()=>{cleanups++;throw new DOMException('PRIVATE-CLEANUP','SecurityError');};
  const result=saveTripRecoveryToStorage(storage,trip(),{ownerId:'PRIVATE-OWNER',writeId:'PRIVATE-WRITE'});
  assert.equal(result.stored,false);assert.equal(result.nativeFailure,'security'); // existing aggregate contract unchanged
  assert.equal(setters,1);assert.equal(cleanups,1);
  const operations=records.filter(v=>v.phase==='probe'&&v.operation);
  assert.deepEqual(operations.map(v=>[v.operation,v.nativeFailure]),[['setter','quota'],['cleanup','security']]);
  const final=records.find(v=>v.operation==='write-result');assert.equal(final.accepted,false);assert.equal(final.writeAccepted,false);
  assert.equal(final.initialSetterFailure,'quota');assert.equal(final.setterFailure,'quota');assert.equal(final.cleanupFailure,'security');assert.equal(final.failedOperation,'cleanup');assert.equal(final.setterRetried,false);assert.equal(final.readbackConfirmed,null);
}));

test('successful quota retry preserves the transient setter category and final accepted readback',async()=>capture(async(records,storage)=>{
  storage.values.set(EASYT_TRIP_CACHE_PREFIX+'PRIVATE-CACHE','{}');let setters=0,cleanups=0;
  storage.setItem=(key,value)=>{if(++setters===1)throw new DOMException('PRIVATE-QUOTA','QuotaExceededError');storage.values.set(key,value);};
  storage.removeItem=key=>{cleanups++;storage.values.delete(key);};
  const result=saveTripRecoveryToStorage(storage,trip(),{ownerId:'PRIVATE-OWNER',writeId:'PRIVATE-WRITE'});
  assert.equal(result.stored,true);assert.equal(result.nativeFailure,undefined);assert.equal(setters,3);assert.equal(cleanups,1); // recovery retry plus the unchanged pointer acknowledgement
  assert.deepEqual(records.filter(v=>v.phase==='probe'&&v.operation).map(v=>[v.operation,v.accepted]),[['setter',false],['cleanup',true],['setter',true]]);
  const final=records.find(v=>v.operation==='write-result');
  assert.equal(final.accepted,true);assert.equal(final.initialSetterFailure,'quota');assert.equal(final.setterFailure,null);assert.equal(final.cleanupFailure,null);assert.equal(final.failedOperation,null);assert.equal(final.setterRetried,true);assert.equal(final.nativeFailure,null);
  assert.ok(records.some(v=>v.boundary==='recovery-readback'&&v.readbackConfirmed===true));
}));

function deferred<T>() { let resolve!: (value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve}; }
for(const name of ['top-removal-confirm','top-type-confirm'] as const) test(`actual ${name} retains its review after held acceptance refuses`,async()=>{
  const gate=deferred<boolean>();let closed=0;
  const bindings={pendingTopRemoval:{intentId:'synthetic-intent',revision:5,stays:['synthetic-stay']},pendingTopType:{type:'return_to_start',revision:5},
    builderEditSessionRef:{current:{getSnapshot:()=>({inputRevision:5})}},rememberStructuralChange(){},dispatchAcceptedBuilderEdit:()=>gate.promise,
    setRoutePreviewStopIds(){},setSelectedRouteStopId(){},setNightEditFeedback(){},setPendingTopRemoval(){closed++;},setPendingTopType(){closed++;}};
  const work=builderClosure(name)(bindings);await Promise.resolve();assert.equal(closed,0,'a pending durable write cannot dismiss review');
  gate.resolve(false);await work;assert.equal(closed,0,'rejected acceptance must keep the reviewed input available');
});
test('actual discovery-state owner returns durable refusal instead of an unspecified success result',async()=>{
  const editor={getSnapshot:()=>({trip:{brief:{structuredBrief:{placeMentions:[{mentionId:'synthetic-mention'}],discoveryDraftByMentionId:{}}}},inputRevision:4,browserOwnerId:'owner-a'})};
  const bindings={builderEditSessionRef:{current:editor},builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:'owner-a'},dispatchAcceptedBuilderEdits:async()=>false,setCapturedStructuredBrief(){}};
  const accepted=await builderClosure('updateDiscoveryPlanningState')(bindings, (current:Record<string,unknown>)=>({...current,discoveryDraftByMentionId:{'synthetic-mention':{version:1}}}));
  assert.equal(accepted,false);
});
test('actual rejected discovery shortlist keeps typed search and selection review open',async()=>{
  let cleared=0;
  const bindings={activeClarificationMention:{mentionId:'synthetic-mention'},discoveryDraft:{},discoverySearchStopSuggestion:()=>true,updateDiscoveryPlanningState:async()=>false,
    setBaseSearchInputs(){cleared++;},setBaseSearchErrors(){cleared++;},setOutsideDiscoveryChoice(){cleared++;},setPendingDiscoveryBase(){cleared++;}};
  await builderClosure('addDiscoverySearchSelection')(bindings,[{name:'synthetic-city'},false]);assert.equal(cleared,0);
});

for(const name of ['route-workspace-commit','top-controls-commit'] as const) test(`actual ${name} propagates final durable acceptance without claiming a pending result`,async()=>{
  for(const outcome of [true,false]) {
    const gate=deferred<boolean>();let settled=false;
    const bindings={commitStopOrder:()=>gate.promise,onReorder:()=>gate.promise};
    const work=builderClosure(name)(bindings,[['a','b'],'drag']).then(result=>{settled=true;return result;});
    await Promise.resolve();assert.equal(settled,false);gate.resolve(outcome);assert.equal(await work,outcome);
  }
});
test('actual reorder gesture cleans up while an async acceptance is held and preserves its final refusal',async()=>{
  const gate=deferred<boolean>(),previews:Array<readonly string[]|null>=[],cleanups:Array<()=>void>=[];
  const bindings={useCallback:(callback:unknown)=>callback,useEffect:(effect:()=>()=>void)=>{cleanups.push(effect());},useRef:(value:unknown)=>({current:value}),useState:(value:unknown)=>[value,()=>{}],
    validateBuilderStopOrder:(current:Array<{id:string}>,ids:readonly string[])=>({ok:ids.length===current.length,ids}),builderStopOrderFingerprint:(ids:readonly string[])=>JSON.stringify(ids),
    moveOccurrenceId:(ids:readonly string[],from:string,index:number)=>{const next=[...ids];next.splice(next.indexOf(from),1);next.splice(index,0,from);return next;}};
  const hook=await builderClosure('reorder-hook')(bindings,{stopIds:['a','b'],lockedStopIds:[],fixedOrder:false,onPreview:(ids:readonly string[]|null)=>previews.push(ids),onCommit:()=>gate.promise}) as {gripProps(id:string):{onDragStart(event:unknown):void};previewActiveAt(index:number):void;drop():Promise<boolean>};
  hook.gripProps('a').onDragStart({preventDefault(){},dataTransfer:{setData(){},effectAllowed:''}});hook.previewActiveAt(1);
  assert.deepEqual(previews.at(-1),['b','a']);const pending=hook.drop();assert.equal(pending instanceof Promise,true);assert.equal(previews.at(-1),null);
  gate.resolve(false);assert.equal(await pending,false);cleanups.forEach(cleanup=>cleanup());assert.equal(previews.at(-1),null);
});
test('actual discovery close cannot use a prior cloud ACK to dismiss a pending device write',async()=>{
  const fixture=discoveryCloseFixture('none'),editor=fixture.bindings.builderEditSessionRef.current,getSnapshot=editor.getSnapshot;
  editor.getSnapshot=()=>({...getSnapshot(),saveState:'device-saving'});
  const bindings={...fixture.bindings,lastAcknowledgedCanonicalRef:{current:fixture.bindings.activeTripDocument},
    tripDocumentsCanonicalEquivalent:()=>true,updateDiscoveryPlanningState:async()=>false};
  await builderClosure('discovery-close')(bindings,'later');assert.deepEqual(fixture.effects,[]);assert.deepEqual(fixture.persisted,[]);
});

function discoveryCloseFixture(hold:'planning'|'frame'|'persistence'|'none',stored=true,changed=false) {
  const gate=deferred<void>(),entered=deferred<void>(),effects:string[]=[],persisted:string[]=[];
  const closeDraft={shortlistIds:['choice-a']};
  let document={id:'trip-a',ownerId:null,updatedAt:'2026-10-12T00:00:00.000Z',brief:{structuredBrief:{placeMentions:[{mentionId:'mention-a'}],discoveryDraftByMentionId:{'mention-a':changed?{shortlistIds:[]}:closeDraft}}}};
  let revision=4;
  const editor={getSnapshot:()=>({trip:document,inputRevision:revision,browserOwnerId:'owner-a',saveState:'local'})};
  const persist=async(candidate:{id:string})=>{
    persisted.push(candidate.id);
    if(hold==='persistence'){entered.resolve();await gate.promise;}
    return {stored,blockedByExistingRecovery:false};
  };
  const bindings={discoveryCommitRef:{current:false},builderMountedRef:{current:true},builderEditSessionRef:{current:editor},
    activeBrowserOwnerIdRef:{current:'owner-a'},activeDiscoveryRef:{current:{open:true,mentionId:'mention-a'}},
    activeTripDocument:document,activeClarificationMention:{mentionId:'mention-a'},discoveryDraft:closeDraft,
    lastAcknowledgedCanonicalRef:{current:null},tripDocumentsCanonicalEquivalent:()=>false,discoveryEventKind:'country',language:'en',authoredContentKey,
    discoveryOwnersRef:{current:{trip:document,persistDeviceRecovery:persist}},
    updateDiscoveryPlanningState:async(update:(current:typeof document.brief.structuredBrief)=>typeof document.brief.structuredBrief)=>{
      const source=document,next=update(structuredClone(source.brief.structuredBrief));
      if(hold==='planning'){entered.resolve();await gate.promise;}
      if(document===source && JSON.stringify(next)!==JSON.stringify(source.brief.structuredBrief)){
        document={...source,updatedAt:'2026-10-12T00:00:01.000Z',brief:{structuredBrief:next}};revision++;bindings.discoveryOwnersRef.current.trip=document;
      }
      return true;
    },
    window:{requestAnimationFrame(callback:()=>void){
      if(hold==='frame'){entered.resolve();void gate.promise.then(callback);}else queueMicrotask(callback);
    }},
    setDeviceRecoveryBlocked(){effects.push('recovery-status');},setDeviceStorageBlocked(){effects.push('storage-status');},setSaveState(){effects.push('save-status');},
    setCloudSaveError(){effects.push('error-status');},dismissClarificationSession(){effects.push('dismiss');},
    discoveryDismissedEvent:()=>({action:'later'}),trackEvent(){effects.push('analytics');}};
  return {bindings,gate,entered,effects,persisted,switchScope(change:'editor'|'owner'|'trip'|'mention'|'input'|'mount'){
    if(change==='editor')bindings.builderEditSessionRef.current={getSnapshot:editor.getSnapshot};
    if(change==='owner')bindings.activeBrowserOwnerIdRef.current='owner-b';
    if(change==='trip'){
      document={...document,id:'trip-b'};bindings.discoveryOwnersRef.current={trip:document,persistDeviceRecovery:persist};
    }
    if(change==='mention')bindings.activeDiscoveryRef.current={open:true,mentionId:'mention-b'};
    if(change==='input')revision++;
    if(change==='mount')bindings.builderMountedRef.current=false;
  }};
}
for(const hold of ['planning','frame','persistence'] as const) {
  for(const change of ['editor','owner','trip','mention','input','mount'] as const) {
    test(`actual discovery close preserves the replacement scope after ${change} changes during ${hold}`,async()=>{
      const fixture=discoveryCloseFixture(hold),work=builderClosure('discovery-close')(fixture.bindings,'later');
      await fixture.entered.promise;assert.deepEqual(fixture.effects,[]);
      fixture.switchScope(change);fixture.gate.resolve();await work;
      assert.deepEqual(fixture.persisted,hold==='persistence'?['trip-a']:[],'a stale close must not checkpoint the replacement trip');
      assert.deepEqual(fixture.effects,[],'a stale completion must not alter replacement status, dismiss its clarification, or emit analytics');
    });
  }
}
for(const changed of [false,true]) test(`actual discovery close checkpoints its own ${changed?'newly accepted':'unchanged'} draft and then dismisses`,async()=>{
  const fixture=discoveryCloseFixture('persistence',true,changed),work=builderClosure('discovery-close')(fixture.bindings,'later');
  await fixture.entered.promise;assert.deepEqual(fixture.effects,[]);assert.deepEqual(fixture.persisted,['trip-a']);
  fixture.gate.resolve();await work;assert.deepEqual(fixture.effects,['recovery-status','storage-status','save-status','error-status','dismiss','analytics']);
});
test('actual discovery close cannot checkpoint a new trip and owner installed between animation frames',async()=>{
  const fixture=discoveryCloseFixture('frame'),work=builderClosure('discovery-close')(fixture.bindings,'later');
  await fixture.entered.promise;fixture.switchScope('trip');fixture.switchScope('owner');fixture.gate.resolve();await work;
  assert.deepEqual(fixture.persisted,[]);assert.deepEqual(fixture.effects,[]);
});
for(const changed of [false,true]) test(`actual pre-actor discovery close verifies its own ${changed?'updated':'unchanged'} document before dismissal`,async()=>{
  const fixture=discoveryCloseFixture('persistence',true,changed);
  const bindings={...fixture.bindings,builderEditSessionRef:{current:null}};
  const work=builderClosure('discovery-close')(bindings,'later');await Promise.race([fixture.entered.promise,work]);
  assert.deepEqual(fixture.effects,[]);fixture.gate.resolve();await work;
  assert.deepEqual(fixture.persisted,['trip-a']);assert.deepEqual(fixture.effects,['recovery-status','storage-status','save-status','error-status','dismiss','analytics']);
});
test('actual discovery close preserves its current clarification after a held recovery refuses',async()=>{
  const fixture=discoveryCloseFixture('persistence',false),work=builderClosure('discovery-close')(fixture.bindings,'later');
  await fixture.entered.promise;assert.deepEqual(fixture.effects,[]);fixture.gate.resolve();await work;
  assert.deepEqual(fixture.effects,['recovery-status','storage-status','save-status','error-status']);
});

for(const name of ['top-removal-confirm','top-type-confirm'] as const) test(`actual ${name} closes only its own durably accepted review`,async()=>{
  for(const replace of [false,true]) {
    const gate=deferred<boolean>(),original={intentId:'original',revision:5,stays:['stay'],type:'return_to_start'},newer={...original,intentId:'newer',revision:6};let reviewed:unknown=original;
    const setReview=(change:unknown)=>{reviewed=typeof change==='function'?(change as (value:unknown)=>unknown)(reviewed):change;};
    const bindings={pendingTopRemoval:original,pendingTopType:original,builderEditSessionRef:{current:{getSnapshot:()=>({inputRevision:5})}},rememberStructuralChange(){},dispatchAcceptedBuilderEdit:()=>gate.promise,
      setRoutePreviewStopIds(){},setSelectedRouteStopId(){},setNightEditFeedback(){},setPendingTopRemoval:setReview,setPendingTopType:setReview};
    const work=builderClosure(name)(bindings);await Promise.resolve();assert.equal(reviewed,original);
    if(replace){reviewed=newer;bindings.pendingTopRemoval=newer;bindings.pendingTopType=newer;}
    gate.resolve(true);await work;assert.equal(reviewed,replace?newer:null);
  }
});
test('actual discovery acceptance preserves source and owner guards while a write is held',async()=>{
  for(const change of ['none','owner','input'] as const) {
    const gate=deferred<boolean>();let revision=4;
    const document={id:'trip-a',brief:{structuredBrief:{placeMentions:[{mentionId:'mention-a'}],discoveryDraftByMentionId:{}}}};
    const editor={getSnapshot:()=>({trip:document,inputRevision:revision,browserOwnerId:'owner-a',saveState:'local'})};
    const owner={current:'owner-a'};
    const bindings={builderEditSessionRef:{current:editor},builderMountedRef:{current:true},activeBrowserOwnerIdRef:owner,
      dispatchAcceptedBuilderEdits:async(_commands:unknown,options:{expectedInputRevision:number})=>{assert.equal(options.expectedInputRevision,4);await gate.promise;revision++;return true;},setCapturedStructuredBrief(){}};
    const work=builderClosure('updateDiscoveryPlanningState')(bindings,(current:Record<string,unknown>)=>({...current,discoveryDraftByMentionId:{'mention-a':{version:1}}}));await Promise.resolve();
    if(change==='owner')owner.current='owner-b';if(change==='input')revision++;
    gate.resolve(true);assert.equal(await work,change==='none');
  }
});
test('actual Builder intake does not clear pending input before the exact async receipt acknowledgement',async()=>capture(async(_records,storage)=>{
  const snapshot=selectedStopsHomepageInput('PRIVATE-OWNER',[['PRIVATE-STOP','Rome']]),intake=intakeBindings(storage);
  await builderClosure('submitNewTripIntake')(intake,snapshot);const pending=intake.pendingNewTripReceiptRef.current,inputBytes=storage.values.get(homepageInputStorageKey('PRIVATE-OWNER'));
  const bindings={...recoveryBindings(),pendingNewTripReceiptRef:intake.pendingNewTripReceiptRef};
  const gate=deferred<void>();bindings.saveTripRecovery=async(document,options)=>{
    assert.deepEqual(options?.intake?.draft,(pending as {draft:HomeTripDraft}).draft);await gate.promise;
    return {...saveTripRecoveryToStorage(storage,document,options),receiptAcknowledged:false};
  };
  const work=builderClosure('persistDeviceRecovery')(bindings,[trip(),'seed']);await Promise.resolve();
  assert.equal(bindings.pendingNewTripReceiptRef.current,pending);assert.equal(bindings.recoveryHandleRef.current,null);gate.resolve();
  const result=await work as {stored:boolean;failureReason:string};assert.equal(result.stored,false);assert.equal(result.failureReason,'receipt-incomplete');
  assert.equal(bindings.pendingNewTripReceiptRef.current,pending);assert.equal(bindings.recoveryHandleRef.current,null);assert.equal(storage.values.get(homepageInputStorageKey('PRIVATE-OWNER')),inputBytes);
}));

test('actual no-change discovery state cannot acknowledge a protected device source',async()=>{
  const editor={getSnapshot:()=>({trip:{id:'trip-a',brief:{structuredBrief:{placeMentions:[]}}},inputRevision:4,browserOwnerId:'owner-a',saveState:'error',error:{category:'protected'}})};
  const accepted=await builderClosure('updateDiscoveryPlanningState')({builderEditSessionRef:{current:editor},builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:'owner-a'}},(current:unknown)=>current);
  assert.equal(accepted,false);
});
