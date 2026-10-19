// Focused variant of the existing actual Build harness; only external I/O and scheduling are controlled.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { builderRecommendationProjection } from '../lib/easyt/trip-builder-recommendations.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { readBuilderInputDraft, writeBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';
import { saveTripRecoveryToStorage, loadTripRecoveryFromStorage, acknowledgeTripBuildSaveInStorage, markTripRecoveryStateInStorage } from '../lib/easyt/storage.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';
import type { BuilderProjectionResponse } from '../lib/easyt/trip-builder-reconciliation.ts';
import type { BuilderReconciliationRequest } from '../lib/easyt/trip-builder-edit-session.ts';
import type { AsyncBuilderEditSessionOptions } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { reconcileBuilderDependencies } from '../lib/easyt/trip-builder-reconciliation.ts';
import { tripNightsBetween, allocateTripNights } from '../lib/easyt/night-allocation.ts';
import { canBuildTrip } from '../lib/easyt/can-build-trip.ts';
import { acceptedGeographicPlace } from '../lib/easyt/geographic-binding.ts';
import {tripFromBuilder,type JourneyEndpointPlace} from '../lib/easyt/trip.ts';
import {projectBuilderCalendar} from '../lib/easyt/trip-builder-calendar.ts';

const loaded = import('../lib/easyt/trip-builder-async-edit-session.ts').catch((cause: NodeJS.ErrnoException) => {
  if (cause.code === 'ERR_MODULE_NOT_FOUND') return null; throw cause;
});
async function api() { const result = await loaded; assert.ok(result, 'Async Builder edit session must be implemented'); return result; }
class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function verifiedFixturePlace(place:JourneyEndpointPlace) {
 const verified=acceptedGeographicPlace(place,{...place,providerId:`fixture:${place.name}`,placeType:'city',routability:'direct_destination'},'endpoint');
 assert.ok(verified,'fixture geography must satisfy the unchanged production verifier');return verified;
}
function fixture() {
  const origin = verifiedFixturePlace({name:'London',country:'United Kingdom',canonicalPlaceId:'place:london',coordinates:[-0.1276,51.5072]});
  const stops = [
    {id:'destination-1',name:'Paris',country:'France',canonicalPlaceId:'place:paris',coordinates:[2.35,48.85] as [number,number]},
    {id:'destination-2',name:'Berlin',country:'Germany',canonicalPlaceId:'place:berlin',coordinates:[13.405,52.52] as [number,number]},
    {id:'destination-3',name:'Amsterdam',country:'Netherlands',canonicalPlaceId:'place:amsterdam',coordinates:[4.9041,52.3676] as [number,number]},
  ].map(stop=>({...stop,...verifiedFixturePlace(stop)}));
  const trip=tripFromBuilder({id:'build-pending-fresh',origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,
    originProviderId:origin.providerId,originCoordinates:origin.coordinates,journeyEnd:{mode:'unknown'},stops,
    startDate:'2026-10-26',endDate:'2026-11-02',nightAllocations:{'destination-1':3,'destination-2':2,'destination-3':2},
    picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],createdAt:'2026-10-19T18:48:07.484Z'});
  trip.brief.intent.route.origin=origin;
  return requireReadableTripDocument({...projectBuilderCalendar(trip,trip).trip,ownerId:'owner-a'});
}
const budget = { kind: 'budget', budget: 'high' } as const;
function response(request: BuilderReconciliationRequest): BuilderProjectionResponse {
  return { scope: request.scope, inputKey: request.inputKey, requestId: request.requestId, dispatched: request.dispatched,
    results: request.dispatched.map(unit => ({ ...unit, phase: 'complete' })),
    legs: reconcileBuilderDependencies(request.trip,request.dispatched).trip.legs.filter(leg => request.dispatched.some(unit => unit.kind === 'leg' && unit.targetId === leg.id)),
    recommendationProjections: request.dispatched.filter(unit => unit.kind === 'recommendation').map(unit => builderRecommendationProjection(request.trip, unit.targetId, [])) };
}
async function harness(input: { initialTrip?: CanonicalEasyTTrip; owner?: string | null; storage?: MemoryStorage } = {}) {
  const initialTrip = input.initialTrip ?? fixture(), ownerId = input.owner === undefined ? initialTrip.ownerId : input.owner;
  const storage = input.storage ?? new MemoryStorage(); let owner = ownerId;
  let recoveryGate: ReturnType<typeof deferred<void>> | null = null, draftGate: ReturnType<typeof deferred<void>> | null = null;
  let ackGate: ReturnType<typeof deferred<void>> | null = null, failRecovery = false, failDraft = false, cacheFails = false;
  const timers: { callback: () => void; delay: number; active: boolean }[] = [];
  const writes: { trip: CanonicalEasyTTrip; result: ReturnType<typeof deferred<CanonicalEasyTTrip>> }[] = [];
  const projections: { request: BuilderReconciliationRequest; signal: AbortSignal; result: ReturnType<typeof deferred<BuilderProjectionResponse>> }[] = [];
  const deviceWrites: { trip: CanonicalEasyTTrip; options: Parameters<AsyncBuilderEditSessionOptions['saveRecovery']>[1] }[] = [];
  const options: AsyncBuilderEditSessionOptions = {
    initialTrip, initialRecovery: loadTripRecoveryFromStorage(storage, initialTrip.id, ownerId), getOwnerId: () => owner,
    readDraft: async (trip, scope) => readBuilderInputDraft(storage, trip, scope),
    writeDraft: async (trip, draft, scope, guard) => {
      const gate = draftGate; if (gate) await gate.promise;
      if (guard && !guard.isCurrent()) return { ok: false, reason: 'stale' };
      if (failDraft) return { ok: false, reason: 'storage' };
      return writeBuilderInputDraft(storage, trip, draft, scope);
    },
    saveRecovery: async (trip, metadata) => {
      deviceWrites.push({ trip, options: metadata }); const gate = recoveryGate; if (gate) await gate.promise;
      if (!metadata.isCurrent() || failRecovery || failDraft) return { stored: false, handle: metadata.replace ?? { ownerId: metadata.ownerId, tripId: trip.id, writeId: 'refused' }, blockedByExistingRecovery: false, failureReason: 'device-unavailable' };
      // Synthetic atomic callback: no fault or guard can occur between these synchronous writes.
      const result = saveTripRecoveryToStorage(storage, trip, metadata);
      if (result.stored) assert.equal(writeBuilderInputDraft(storage, trip, metadata.draft, metadata.ownerId).ok, true);
      return result;
    },
    acknowledgeRecovery: async (reviewed, canonical, handle) => {
      const gate = ackGate; if (gate) await gate.promise;
      if (cacheFails) return { outcome: 'storage-failed', remainingRecovery: loadTripRecoveryFromStorage(storage, initialTrip.id, ownerId), accountAcknowledged: true, cacheStored: false };
      return { ...acknowledgeTripBuildSaveInStorage(storage, reviewed, canonical, handle), accountAcknowledged: true, cacheStored: true };
    },
    markRecoveryState: async (handle, state) => markTripRecoveryStateInStorage(storage, handle, state),
    persistAccount: (trip) => { const result = deferred<CanonicalEasyTTrip>(); writes.push({ trip: requireReadableTripDocument(trip), result }); return result.promise; },
    reconcile: (request, signal) => { const result = deferred<BuilderProjectionResponse>(); projections.push({ request, signal, result }); return result.promise; },
    now: () => '2026-10-19T18:48:17.909Z',
    schedule: (callback, delay) => { const timer = { callback, delay, active: true }; timers.push(timer); return () => { timer.active = false; }; },
  };
  const session = await (await api()).createAsyncBuilderEditSession(options);
  return { session, options, storage, deviceWrites, writes, projections,
    holdRecovery() { recoveryGate = deferred<void>(); return recoveryGate; }, holdDraft() { draftGate = deferred<void>(); return draftGate; }, holdAck() { ackGate = deferred<void>(); return ackGate; },
    failRecovery() { failRecovery = true; }, failDraft() { failDraft = true; }, failCache() { cacheFails = true; }, rotate(value: string | null) { owner = value; },
    recovery: () => loadTripRecoveryFromStorage(storage, initialTrip.id, ownerId),
    run: async (delay: number) => { for (const timer of [...timers]) if (timer.active && timer.delay === delay) { timer.active = false; timer.callback(); } await tick(); },
    ack: async (index: number) => { const write = writes[index]!; write.result.resolve(write.trip.ownerId === null ? requireReadableTripDocument(canonicalTripForOwner(ownerId!, write.trip, nextTripUpdatedAt(write.trip.updatedAt))) : { ...write.trip, updatedAt: nextTripUpdatedAt(write.trip.updatedAt) }); await tick(); },
  };
}
async function accept(h: Awaited<ReturnType<typeof harness>>, edit = budget as Parameters<typeof h.session.accept>[0]) {
  const result = await h.session.accept(edit, h.session.getSnapshot().inputRevision); assert.ok(result.ok); return h.session.getSnapshot();
}
function builderDispatch(h: Awaited<ReturnType<typeof harness>>) {
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const dispatchAcceptedBuilderEdits =');
  const end = source.indexOf('  const updateDiscoveryPlanningState =', start);
  const changes: unknown[] = [], applied: unknown[] = [], errors: string[] = [];
  const ref = { current: h.session }, mounted = { current: true };
  const scope = { builderEditSessionRef: ref, builderMountedRef: mounted, activeBrowserOwnerIdRef: { current: h.session.getSnapshot().browserOwnerId },
    builderStructuralFeedback: () => ({ summary: 'remove_stop' }), captureStructuralChange: (summary: string, canonical: unknown) => ({ summary, canonical }),
    publishStructuralChange: (frame: unknown) => changes.push(frame), applyAcceptedBuilderDocument: (trip: unknown) => applied.push(trip),
    setCloudSaveError: (message: string) => errors.push(message), setSaveState: () => {},setEditNeedsReview(){} };
  const script = ts.transpileModule(source.slice(start, end) + '\nreturn dispatchAcceptedBuilderEdit;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dispatch = new Function('scope', `with(scope){${script}}`)(scope) as (edit: Parameters<typeof h.session.accept>[0]) => Promise<boolean>;
  return { dispatch, changes, applied, errors, mounted, ref };
}
function buildPersistence(h: Awaited<ReturnType<typeof harness>>, onAssessment?: (ordinal:number)=>Promise<void>) {
  const view = builderDispatch(h);
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const persistGeneratedTrip ='), source.indexOf('  const settleUnacknowledgedBuild ='));
  const effects:Array<()=>void>=[];let assessmentCount=0;
  const scope = { builderEditSessionRef: view.ref, builderMountedRef: view.mounted,
    activeBrowserOwnerIdRef: { current: h.session.getSnapshot().browserOwnerId },
    buildInvariant: { canBuildTrip: true }, dispatchAcceptedBuilderEdit: view.dispatch,
    sameRecoveryDocument: (a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),
    pendingBuildAssessmentRef:{current:null},buildAssessmentRequestId:0,setBuildAssessmentRequestId(){},
    useEffect(effect:()=>void){effects.push(effect)},activeTripDocument:h.session.getSnapshot().trip,
    requestBuildAssessment: async (editor:typeof h.session,isCurrent?:()=>boolean)=>{
      const pending=requestAssessment(editor,isCurrent);if(onAssessment)await onAssessment(++assessmentCount);
      renderAssessment(editor);return pending;
    },
    builderBuildNavigationRef:{current:null},
    recordGeneratedTrip() {}, surfaceBuildConflict() {}, setCloudSaveError() {}, trackEvent() {}, analyticsTripSource: 'builder' };
  function renderAssessment(editor:typeof h.session){
      const trip=editor.getSnapshot().trip,nightAllocation=trip.brief.nightAllocation??allocateTripNights({totalNights:tripNightsBetween(trip.startDate,trip.endDate),stops:trip.stops});
      scope.activeTripDocument=trip;
      scope.buildInvariant=canBuildTrip({origin:trip.brief.intent.route.origin?.name??'',originCoordinates:trip.brief.intent.route.origin?.coordinates,
        journeyEnd:trip.brief.intent.route.journeyEnd,stops:trip.stops.map(s=>({...s,coordinates:[s.longitude!,s.latitude!] as [number,number]})),
        startDate:trip.startDate,endDate:trip.endDate,durationDays:tripNightsBetween(trip.startDate,trip.endDate)+1,
        nightAllocation,allocations:trip.brief.nightAllocations??Object.fromEntries(trip.stops.map(s=>[s.id,s.nights??0])),document:trip});
      effects[0]!();
  }
  h.session.subscribe(()=>queueMicrotask(()=>{if(scope.pendingBuildAssessmentRef.current)renderAssessment(h.session);}));
  const assessmentBody=source.slice(source.indexOf('  const requestBuildAssessment ='),source.indexOf('  const recordGeneratedTrip ='));
  const requestAssessment=new Function('scope',`with(scope){${ts.transpileModule(assessmentBody+'\nreturn requestBuildAssessment;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope) as (editor:typeof h.session,isCurrent?:()=>boolean)=>Promise<unknown>;
  const navStart=source.indexOf('  const canOpenBuiltTrip =');
  const canOpen=navStart<0?()=>true:new Function('scope',`with(scope){${ts.transpileModule(source.slice(navStart,source.indexOf('  const settleUnacknowledgedBuild ='))+'\nreturn canOpenBuiltTrip;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope) as (trip:CanonicalEasyTTrip)=>boolean;
  const script = ts.transpileModule(body + '\nreturn persistGeneratedTrip;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { ...view, canOpen, render:()=>renderAssessment(h.session), persist: new Function('scope', `with(scope){${script}}`)(scope) as (request?: {editor: typeof h.session; barrier: ReturnType<typeof h.session.captureCommandBarrier>}) => Promise<CanonicalEasyTTrip | null> };
}

const reorderedIds=['destination-1','destination-3','destination-2'];
async function heldRoute(owner:'guest'|'account'|'promotion'='guest') {
  const initialTrip=requireReadableTripDocument({...fixture(),ownerId:owner==='account'?'owner-a':null});
  const h=await harness({initialTrip,owner:owner==='guest'?null:'owner-a'});
  await accept(h,{kind:'origin',place:verifiedFixturePlace({name:'London Gatwick Airport',country:'United Kingdom',canonicalPlaceId:'place:gatwick',coordinates:[-0.1821,51.1537]})});
  await accept(h,{kind:'order',stopIds:reorderedIds,source:'drag'});
  await h.run(0);
  const work=h.projections.at(-1)!;
  assert.ok(work,'reordering must dispatch necessary route work');
  assert.equal(h.session.getSnapshot().pendingUnits.filter(unit=>unit.kind==='leg').length,3);
  assert.ok(h.session.getSnapshot().pendingUnits.some(unit=>unit.kind==='recommendation'));
  return {h,work};
}
function observe<T>(promise:Promise<T>) {
  const state:{settled:boolean;value?:T}={settled:false};
  void promise.then(value=>{state.settled=true;state.value=value;});
  return state;
}
async function finishBuild(h:Awaited<ReturnType<typeof harness>>,state:{settled:boolean}) {
  let acknowledged=0;
  for(let turn=0;turn<100&&!state.settled;turn++) {
    await tick();
    while(acknowledged<h.writes.length)await h.ack(acknowledged++);
  }
  assert.equal(state.settled,true,'Build must settle after route work and exact saves complete');
}

// Removing the pending-work assessment gate lets Build save/navigate the safe prefix.
for(const owner of ['guest','account','promotion'] as const)test(`Build waits for the held route worker before ${owner} completion`,{timeout:5000},async()=>{
  const {h,work}=await heldRoute(owner),view=buildPersistence(h);
  try {
    const building=view.persist(),state=observe(building);await tick();
    assert.equal(state.settled,false,'a provider response still pending cannot be treated as a completed Build');
    assert.equal(h.session.getSnapshot().trip.status,'draft','Build must assess completed route work before setting planned');
    assert.equal(h.writes.length,0,'Build must not promote/save the unresolved prefix');
    assert.equal(work.signal.aborted,false,'the mounted worker must remain able to finish');
    work.result.resolve(response(work.request));await finishBuild(h,state);
    const built=await building;assert.ok(built);assert.equal(view.canOpen(built),true);
    assert.equal(built.status,'planned');
    assert.deepEqual(built.stops.map(stop=>stop.name),['Paris','Amsterdam','Berlin']);
    assert.equal(built.legs.some(leg=>leg.routeMetadata.pending===true),false);
    assert.equal(h.session.getSnapshot().pendingUnits.some(unit=>unit.kind!=='recommendation'),false);
    assert.ok(h.session.getSnapshot().pendingUnits.some(unit=>unit.kind==='recommendation'),'deferred suggestions cannot block navigation');
    assert.equal(built.ownerId,owner==='guest'?null:'owner-a');
  } finally {h.session.dispose();}
});

// A terminal failure is honest settled evidence; waiting for every residual would hang.
for(const phase of ['failed','conflict'] as const)test(`Build settles after terminal route ${phase} while preserving unknown timing`,{timeout:5000},async()=>{
  const {h,work}=await heldRoute(),view=buildPersistence(h);
  try {
    const building=view.persist(),state=observe(building);await tick();
    assert.equal(state.settled,false);
    work.result.resolve({...response(work.request),results:work.request.dispatched.map(unit=>({...unit,phase,reason:'unavailable'})),legs:[]});
    await finishBuild(h,state);const built=await building;assert.ok(built);assert.equal(view.canOpen(built),true);
    assert.ok(built.brief.cascadeStatus?.routeReconciliation?.residual.some(unit=>unit.kind==='leg'&&unit.phase===phase));
    assert.ok(built.legs.every(leg=>leg.mode==='unknown'&&leg.durationMinutes===null));
  } finally {h.session.dispose();}
});

for(const interruption of ['input','owner','unmount','editor'] as const)test(`Build waiting for route details refuses ${interruption} retirement`,{timeout:5000},async()=>{
  const {h,work}=await heldRoute(),view=buildPersistence(h);
  try {
    const building=view.persist(),state=observe(building);await tick();
    assert.equal(state.settled,false);
    if(interruption==='input')await h.session.updateDraft({binding:{kind:'origin'},raw:'newer unfinished origin'});
    if(interruption==='owner')h.rotate('other-owner');
    if(interruption==='unmount')view.mounted.current=false;
    if(interruption==='editor')view.ref.current=null as unknown as typeof h.session;
    view.render();await tick();assert.equal(await building,null);
    work.result.resolve(response(work.request));await tick();
    assert.equal(h.session.getSnapshot().trip.status,'draft');assert.equal(h.writes.length,0);
    if(interruption==='input')assert.equal(h.session.getSnapshot().draft.fields[0]?.raw,'newer unfinished origin');
  } finally {h.session.dispose();}
});

// The final guard independently checks route work immediately before navigation.
test('the navigation receipt refuses a durably saved trip with route work still pending',{timeout:5000},async()=>{
  const {h}=await heldRoute();
  try {
    const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
    const start=source.indexOf('      const readyToNavigate ='),end=source.indexOf('      if (!readyToNavigate())',start);
    assert.ok(start>=0&&end>start);
    const finalSnapshot=h.session.getSnapshot();
    assert.equal(finalSnapshot.saveState,'local');assert.equal(finalSnapshot.canonicalSaveState,'local');
    const completion=h.session.captureCommandBarrier();assert.equal(completion.isCurrent(),true);
    const script=ts.transpileModule(source.slice(start,end)+'\nreturn readyToNavigate;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const ready=new Function('scope',`with(scope){${script}}`)({editor:h.session,completion,mounted:()=>true,finalSnapshot,
      sameRecoveryDocument:(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)}) as ()=>boolean;
    assert.equal(ready(),false,'durable saving does not imply completed route details');
  } finally {h.session.dispose();}
});
