import type { CanonicalEasyTTrip, EasyTTrip, TripRouteReconciliation } from './trip.ts';
import { requireReadableTripDocument, prepareTripDocumentForWrite } from './trip-document.ts';
import { builderStructuralSnapshot, type BuilderAcceptedEdit, type BuilderStructuralSnapshot } from './trip-builder-edit.ts';
import { builderDocumentFingerprint } from './trip-builder-document-commit.ts';
import { prepareBuilderHandlerEdits } from './trip-builder-handler-contract.ts';
import { createBuilderInputDraft, updateBuilderInputDraft, rebindBuilderInputDraft, consumeBuilderInputDraft, remapBuilderInputDraftIdentity, discardBuilderInputDraftField,
  type BuilderInputBinding, type BuilderInputDraft, type BuilderInputReadResult, type writeBuilderInputDraft } from './trip-builder-input-draft.ts';
import { pendingBuilderReconciliationUnits, mergeBuilderProjectionResponse, retryBuilderReconciliationUnit,
  type BuilderEditScope, type BuilderProjectionResponse } from './trip-builder-reconciliation.ts';
import { routeProjectionInputKey, routeProjectionStatus } from './trip-route-intent.ts';
import { createTripMutationPersistenceQueue, mergeTripMutationDocuments } from './trip-mutation-persistence.ts';
import { canonicalTripStopIdentityMap, remapTripStopReferences, tripBuildDocumentsCanonicalEquivalent } from './trip-promotion.ts';
import { type TripRecoveryHandle, type TripRecoveryRecord,
  type TripRecoveryState, type TripRecoveryWriteResult, type TripBuildSaveAcknowledgement } from './storage.ts';
import { EasyTTripPersistenceError, tripRecoveryStateForPersistenceError } from './trip-persistence-error.ts';

type Unit = TripRouteReconciliation['residual'][number];
export type BuilderReconciliationRequest = {
  trip: CanonicalEasyTTrip; scope: BuilderEditScope; inputKey: string; requestId: string; dispatched: Unit[];
};
export type BuilderSessionSaveState = 'device-saving' | 'local' | 'cloud-saving' | 'cloud' | 'error';
export type BuilderEditSessionSnapshot = {
  trip: CanonicalEasyTTrip; inputRevision: number; acceptedRevision: number; draft: BuilderInputDraft;
  saveState: BuilderSessionSaveState; canonicalSaveState: BuilderSessionSaveState;
  projectionState: 'legacy-unverified' | 'pending' | 'current' | 'provisional' | 'failed' | 'conflict';
  pendingUnits: Unit[]; failedUnits: Unit[]; conflictUnits: Unit[];
  historicalRecovery: boolean; browserOwnerId: string | null;
  recovery: TripRecoveryHandle | null; error: { category: TripRecoveryState | 'storage' | 'protected'; message: string } | null;
};
export type BuilderEditSessionOptions = {
  initialTrip: EasyTTrip; initialRecovery?: TripRecoveryRecord | null; initialCanonicalTrip?: EasyTTrip | null;
  /** Set only after the existing deliberate recovery flow authorizes this exact source; never infer from a read. */
  allowRecoverySync?: boolean;
  getOwnerId(): string | null;
  readDraft(trip: CanonicalEasyTTrip, browserOwnerId: string | null): BuilderInputReadResult;
  writeDraft(trip: CanonicalEasyTTrip, draft: BuilderInputDraft, browserOwnerId: string | null): ReturnType<typeof writeBuilderInputDraft>;
  saveRecovery(trip: CanonicalEasyTTrip, options: { ownerId: string | null; replace?: TripRecoveryHandle; accountSavePending: boolean; state: TripRecoveryState }): TripRecoveryWriteResult;
  acknowledgeRecovery(reviewed: EasyTTrip, canonical: EasyTTrip, handle: TripRecoveryHandle): TripBuildSaveAcknowledgement;
  markRecoveryState?(handle: TripRecoveryHandle, state: TripRecoveryState): boolean;
  persistAccount(trip: EasyTTrip, handle: TripRecoveryHandle): Promise<EasyTTrip>;
  reconcile(request: BuilderReconciliationRequest, signal: AbortSignal): Promise<BuilderProjectionResponse>;
  now(): string;
  schedule(callback: () => void, milliseconds: number): () => void;
};
type SaveJob = { trip: CanonicalEasyTTrip; localTrip: CanonicalEasyTTrip; handle: TripRecoveryHandle; acceptedRevision: number;
  authoredFrom?: CanonicalEasyTTrip; submitted?: CanonicalEasyTTrip };
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
const exact = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
class BuilderPromotionStorageError extends Error {}

/** Device recovery is the acceptance boundary. Cloud and projections are independent, scoped continuations. */
export function createBuilderEditSession(options: BuilderEditSessionOptions) {
  let trip = requireReadableTripDocument(options.initialTrip);
  const initialRecovery = options.initialRecovery;
  const ownerId = initialRecovery ? initialRecovery.ownerId : trip.ownerId, tripId = trip.id;
  if (trip.ownerId !== null && trip.ownerId !== ownerId || initialRecovery && (initialRecovery.tripId !== tripId
    || !initialRecovery.writeId || options.getOwnerId() !== ownerId
    || !exact(prepareTripDocumentForWrite(initialRecovery.trip), prepareTripDocumentForWrite(trip)))) {
    throw new TypeError('Recovery does not own the hydrated Builder document');
  }
  const read = options.readDraft(trip, ownerId);
  let draft = read.kind === 'readable' ? read.draft : createBuilderInputDraft(trip, 0, ownerId);
  let inputRevision = draft.inputRevision, acceptedRevision = 0;
  let disposed = false, draftNeedsWrite = false;
  let recovery: TripRecoveryHandle | null = initialRecovery
    ? { ownerId, tripId, writeId: initialRecovery.writeId } : null;
  let historicalRecovery = Boolean(initialRecovery && ownerId !== null && !options.allowRecoverySync);
  let promoting = false;
  let promotionIdentity: ReadonlyMap<string, string> | null = null;
  let undoFrame: { snapshot: BuilderStructuralSnapshot; stopIds: ReadonlyMap<string, string> } | null = null;
  let paused = historicalRecovery || Boolean(initialRecovery && initialRecovery.state !== 'pending');
  let pauseReason: TripRecoveryState | null = paused ? initialRecovery!.state : null;
  let error: BuilderEditSessionSnapshot['error'] = read.kind === 'protected' || read.kind === 'error'
    ? { category: read.kind === 'protected' ? 'protected' : 'storage', message: 'The input draft could not be read safely.' }
    : paused ? { category: initialRecovery!.state, message: 'The saved device trip needs recovery before account sync.' } : null;
  const draftProtected = read.kind === 'protected';
  let canonicalSaveState: BuilderSessionSaveState = error ? 'error' : recovery || ownerId === null ? 'local' : 'cloud';
  let pending: SaveJob | null = recovery ? { trip: structuredClone(trip), localTrip: structuredClone(trip), handle: recovery, acceptedRevision } : null;
  let failedJob: SaveJob | null = null, inFlight: Promise<void> | null = null;
  let acknowledgedCanonical: CanonicalEasyTTrip | null = null;
  let lastEnqueuedTrip: CanonicalEasyTTrip | undefined;
  let cloudDue = false, cancelCloud: (() => void) | null = null, cancelWork: (() => void) | null = null;
  let work: BuilderReconciliationRequest | null = null, requestSequence = 0;
  let workAbort: AbortController | null = null;
  const listeners = new Set<() => void>();
  const active = () => !disposed && options.getOwnerId() === ownerId;
  const queue = createTripMutationPersistenceQueue(async (document, handle) => {
    const currentJob = submitting;
    if (!active() || !currentJob || !exact(currentJob.handle, handle)) throw new Error('Save scope expired');
    currentJob.submitted = requireReadableTripDocument(document);
    const canonical = requireReadableTripDocument(await options.persistAccount(document, handle));
    if (canonical.ownerId !== ownerId || canonical.id !== tripId
      || !tripBuildDocumentsCanonicalEquivalent(document, canonical, ownerId)) throw new EasyTTripPersistenceError({
        category: 'validation', status: 200, operation: 'update', message: 'Invalid canonical save acknowledgement',
      });
    return canonical;
  });
  // A recovered document is never treated as an acknowledged cloud ancestor.
  queue.reset(options.initialCanonicalTrip ?? (recovery ? null : trip));
  let submitting: SaveJob | null = null;
  let snapshot: BuilderEditSessionSnapshot;
  function publish() {
    const residual = trip.brief.cascadeStatus?.routeReconciliation?.residual ?? [];
    const pendingUnits = residual.filter(unit => unit.phase === 'pending');
    const failedUnits = residual.filter(unit => unit.phase === 'failed');
    const conflictUnits = residual.filter(unit => unit.phase === 'conflict');
    const status = routeProjectionStatus(trip);
    const projectionState = conflictUnits.length ? 'conflict' : pendingUnits.length ? 'pending' : failedUnits.length ? 'failed'
      : status === 'current' ? 'current' : status === 'provisional' ? 'provisional' : status === 'pending' ? 'pending' : 'legacy-unverified';
    snapshot = freeze(structuredClone({ trip, draft, inputRevision, acceptedRevision, canonicalSaveState,
      saveState: error ? 'error' : draft.fields.length && canonicalSaveState === 'cloud' ? 'local' : canonicalSaveState,
      projectionState, pendingUnits, failedUnits, conflictUnits, historicalRecovery, browserOwnerId: ownerId, recovery, error }));
    listeners.forEach(listener => listener());
  }
  function scheduleCloud() {
    cancelCloud?.(); cloudDue = false;
    if (!active() || paused || draftNeedsWrite || !pending || ownerId === null || trip.ownerId === null && !promoting) return;
    cancelCloud = options.schedule(() => { cancelCloud = null; cloudDue = true; startSave(); }, 450);
  }
  function saveFailure(category: NonNullable<BuilderEditSessionSnapshot['error']>['category'], message: string) {
    error = { category, message }; canonicalSaveState = 'error'; publish();
  }
  function storeCanonical(candidate: CanonicalEasyTTrip, authoredFrom: CanonicalEasyTTrip): boolean {
    if (!active() || draftProtected) return false;
    candidate = requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(candidate))));
    let result: TripRecoveryWriteResult;
    const accountSavePending = ownerId !== null && !paused && !historicalRecovery
      && (candidate.ownerId !== null || promoting);
    try { result = options.saveRecovery(candidate, { ownerId, ...(recovery ? { replace: recovery } : {}), accountSavePending, state: pauseReason ?? 'pending' }); }
    catch { saveFailure('unknown', 'This edit could not be accepted. Your current trip remains preserved.'); return false; }
    if (!result.stored || result.handle.ownerId !== ownerId || result.handle.tripId !== tripId) {
      const scopeMatches = result.handle.ownerId === ownerId && result.handle.tripId === tripId;
      if (scopeMatches && result.blockedByExistingRecovery) {
        saveFailure('protected', 'Another device recovery is protected. Reopen it before editing.');
      } else if (scopeMatches && result.failureReason === 'device-unavailable') {
        saveFailure('storage', 'This edit could not be saved on this device. Your current trip remains preserved.');
      } else {
        saveFailure('unknown', 'This edit could not be accepted. Your current trip remains preserved.');
      }
      return false;
    }
    recovery = result.handle; trip = candidate; acceptedRevision++;
    pending = { trip: structuredClone(trip), localTrip: structuredClone(trip), handle: structuredClone(recovery), acceptedRevision,
      authoredFrom: lastEnqueuedTrip ?? authoredFrom };
    canonicalSaveState = 'local';
    if (!paused) error = null;
    return true;
  }
  function writeDraft(): boolean {
    let result: ReturnType<typeof writeBuilderInputDraft>;
    try { result = options.writeDraft(trip, draft, ownerId); } catch { result = { ok: false, reason: 'storage' }; }
    draftNeedsWrite = !result.ok;
    if (!result.ok) { saveFailure(result.reason === 'protected' ? 'protected' : 'storage', 'The input draft is still in memory and could not be saved on this device.'); return false; }
    return true;
  }
  function startSave() {
    if (!active() || paused || draftNeedsWrite || inFlight || !pending || ownerId === null || !cloudDue || pending.trip.ownerId === null && !promoting) return;
    const job = pending; pending = null; submitting = job; cloudDue = false;
    lastEnqueuedTrip = structuredClone(job.trip);
    canonicalSaveState = 'cloud-saving'; publish();
    inFlight = queue.enqueue(job.trip, job.handle, job.authoredFrom).then(saved => {
      if (!active()) return;
      const canonical = requireReadableTripDocument(saved);
      acknowledgedCanonical = requireReadableTripDocument(canonical);
      const submitted = job.submitted!;
      const isPromotion = submitted.ownerId === null && canonical.ownerId === ownerId;
      const proposedIds = canonicalTripStopIdentityMap(job.localTrip), canonicalIds = new Set(canonical.stops.map(stop => stop.id));
      const submittedIds = new Map(job.localTrip.stops.map(stop => {
        const mapped = proposedIds.get(stop.id)!;
        const target = canonicalIds.has(mapped) ? mapped : canonicalIds.has(stop.id) ? stop.id : null;
        if (target === null) throw new EasyTTripPersistenceError({category:'validation',status:200,operation:isPromotion?'promotion':'update',message:'Unmapped canonical acknowledgement'});
        return [stop.id,target];
      }));
      if (isPromotion || [...submittedIds].some(([source,target]) => source !== target)) {
        // An old ACK may prove ownership/identity, never replace later traveller edits.
        const before = structuredClone(trip);
        const currentIds = canonicalTripStopIdentityMap(before);
        const liveIds = new Map(before.stops.map(stop => [stop.id,submittedIds.get(stop.id) ?? currentIds.get(stop.id)!]));
        const reservedIds = new Set(submittedIds.values());
        if (new Set(liveIds.values()).size !== liveIds.size || [...liveIds].some(([source,target])=>!submittedIds.has(source) && reservedIds.has(target))) throw new EasyTTripPersistenceError({category:'validation',status:200,operation:'promotion',message:'Ambiguous canonical identity continuation'});
        const mapped = requireReadableTripDocument(remapTripStopReferences({ ...before, ownerId },liveIds,before));
        const mappedSubmitted = requireReadableTripDocument(remapTripStopReferences({ ...job.localTrip,ownerId,updatedAt:canonical.updatedAt },submittedIds,job.localTrip));
        const isLatest = acceptedRevision === job.acceptedRevision && exact(recovery, job.handle) && exact(trip, job.localTrip);
        const next = isLatest ? canonical : requireReadableTripDocument(mergeTripMutationDocuments(mappedSubmitted, mapped, canonical));
        const nextDraft = remapBuilderInputDraftIdentity(draft, before, next, liveIds, ownerId);
        const draftWrite = options.writeDraft(next, nextDraft, ownerId);
        if (!draftWrite.ok) throw new BuilderPromotionStorageError('Promoted raw input could not be retained on this device');
        workAbort?.abort(); cancelWork?.(); workAbort = null; work = null;
        if (!isLatest) {
          lastEnqueuedTrip = canonical;
          if (!storeCanonical(next, canonical)) {
            // Compensate the first local write when the second key cannot be replaced.
            // A failed compensation still keeps all bytes/source and reports storage failure.
            const originalDraft = { ...draft, inputRevision: nextDraft.inputRevision + 1 };
            if (options.writeDraft(before, originalDraft, ownerId).ok) { draft = originalDraft; inputRevision = originalDraft.inputRevision; }
            throw new BuilderPromotionStorageError('Promoted latest recovery could not be retained');
          }
          draft = nextDraft; inputRevision = nextDraft.inputRevision; draftNeedsWrite = false;
          if (isPromotion) promotionIdentity = new Map([...submittedIds,...liveIds]);
          else if (promotionIdentity) promotionIdentity = new Map([...promotionIdentity].map(([source,current])=>[source,submittedIds.get(current) ?? liveIds.get(current) ?? current]));
          if (undoFrame) undoFrame.stopIds = new Map([...undoFrame.stopIds].map(([source,current]) => [source,submittedIds.get(current) ?? liveIds.get(current) ?? current]));
          const acknowledgement = options.acknowledgeRecovery(submitted, canonical, job.handle);
          if (acknowledgement.outcome === 'storage-failed' || acknowledgement.outcome === 'invalid-canonical') throw new Error('Promotion acknowledgement could not be retained');
          failedJob = null; promoting = false; historicalRecovery = false;
          cloudDue = true; scheduleWork(); publish(); return;
        }
        const acknowledgement = options.acknowledgeRecovery(submitted, canonical, job.handle);
        if (acknowledgement.outcome !== 'acknowledged') throw new Error('Promotion recovery acknowledgement needs attention');
        trip = canonical; recovery = null; pending = null; failedJob = null;
        draft = nextDraft; inputRevision = nextDraft.inputRevision; draftNeedsWrite = false;
        canonicalSaveState = 'cloud'; error = null; promoting = false; historicalRecovery = false;
        if (isPromotion) promotionIdentity = submittedIds;
        else if (promotionIdentity) promotionIdentity = new Map([...promotionIdentity].map(([source,current])=>[source,submittedIds.get(current) ?? current]));
        if (undoFrame) undoFrame.stopIds = new Map([...undoFrame.stopIds].map(([source,current]) => [source,submittedIds.get(current) ?? current]));
        scheduleWork(); publish(); return;
      }
      const acknowledgement = options.acknowledgeRecovery(submitted, canonical, job.handle);
      const isCurrent = acceptedRevision === job.acceptedRevision && exact(recovery, job.handle)
        && exact(trip, job.localTrip);
      if (acknowledgement.outcome === 'storage-failed' || acknowledgement.outcome === 'invalid-canonical') {
        throw new Error('Canonical acknowledgement could not be retained on this device');
      }
      // A known predecessor may advance the queue/cache CAS ancestry, never the newer visible trip or handle.
      if (isCurrent) {
        if (acknowledgement.outcome !== 'acknowledged') throw new Error('A different device recovery still requires attention');
        trip = requireReadableTripDocument(canonical); recovery = null; failedJob = null;
        canonicalSaveState = 'cloud'; if (!draftNeedsWrite) error = null;
      } else if (!paused) canonicalSaveState = 'local';
      publish();
    }).catch(cause => {
      if (!active()) return;
      if (cause instanceof BuilderPromotionStorageError) {
        paused = true; pauseReason = 'unknown'; failedJob = job;
        if (recovery) options.markRecoveryState?.(recovery, 'unknown');
        saveFailure('storage', 'The promoted trip could not be retained safely on this device. Your recovery and input remain preserved.');
        return;
      }
      const category = tripRecoveryStateForPersistenceError(cause);
      paused = true; pauseReason = category; failedJob = job;
      // Failures pause this session's latest write too; a newer write must not silently clear a genuine conflict.
      if (recovery) options.markRecoveryState?.(recovery, category);
      saveFailure(category, category === 'conflict' ? 'This device trip conflicts with the account trip. Review recovery before continuing.'
        : 'The trip is saved on this device. Account sync needs attention.');
    }).finally(() => {
      inFlight = null; submitting = null;
      if (active()) startSave();
    });
  }
  function scheduleWork() {
    cancelWork?.(); workAbort?.abort(); workAbort = null; work = null;
    if (!active() || draftProtected || !pendingBuilderReconciliationUnits(trip).length) return;
    cancelWork = options.schedule(() => { cancelWork = null; void resumeNecessaryWork(); }, 0);
  }
  async function resumeNecessaryWork() {
    if (!active() || draftProtected || work) return;
    const dispatched = pendingBuilderReconciliationUnits(trip);
    if (!dispatched.length) return;
    const request: BuilderReconciliationRequest = { trip: structuredClone(trip), scope: { ownerId: trip.ownerId, tripId, inputRevision },
      inputKey: routeProjectionInputKey(trip), requestId: `${tripId}:${inputRevision}:${++requestSequence}:${options.now()}`, dispatched };
    work = request;
    const controller = new AbortController(); workAbort = controller;
    let continued = false;
    try {
      const response = await options.reconcile(structuredClone(request), controller.signal);
      if (!active() || work !== request || inputRevision !== request.scope.inputRevision) return;
      const merged = mergeBuilderProjectionResponse(trip, response, request);
      if (!merged.ok) return;
      const before = structuredClone(trip);
      if (exact(before, merged.trip)) return;
      if (!storeCanonical(merged.trip, before)) return;
      continued = true;
      draft = rebindBuilderInputDraft(draft, trip, ownerId);
      if (writeDraft()) scheduleCloud();
      publish();
    } catch {
      if (!active() || work !== request || inputRevision !== request.scope.inputRevision) return;
      // Persist only the exact dispatched subset as failed. No provider result is invented.
      const failed = mergeBuilderProjectionResponse(trip, { ...request, results: dispatched.map(unit => ({ ...unit, phase: 'failed', reason: 'unavailable' })), legs: [] }, request);
      if (failed.ok && storeCanonical(failed.trip, structuredClone(trip))) { continued = true; draft = rebindBuilderInputDraft(draft, trip, ownerId); if (writeDraft()) scheduleCloud(); publish(); }
    } finally { if (work === request) { work = null; workAbort = null; if (continued) scheduleWork(); } }
  }
  function acceptEdits(edits: readonly BuilderAcceptedEdit[], expectedInputRevision: number,
    acceptedInputs?: readonly { binding: BuilderInputBinding; raw: string }[]) {
    if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };
    if (draftProtected || error?.category === 'protected') return { ok: false as const, reason: 'protected' as const };
    const inverse = edits.length === 1 && edits[0]!.kind === 'structural-inverse' ? edits[0] : null;
    const inverseIds = inverse && (undoFrame?.snapshot === inverse.snapshot ? undoFrame.stopIds
      : inverse.snapshot.ownerId === null && trip.ownerId !== null ? promotionIdentity : null);
    let source = trip;
    if (inverse && inverseIds && (inverse.snapshot.ownerId !== trip.ownerId || [...inverseIds].some(([from,to])=>from!==to))) {
      if (!inverse.snapshot.stops.every(stop=>inverseIds.has(stop.id))) return {ok:false as const,reason:'binding-conflict' as const};
      const reverse = new Map([...inverseIds].map(([from,to])=>[to,from]));
      for (const stop of trip.stops) if (!reverse.has(stop.id)) reverse.set(stop.id,stop.id);
      source = requireReadableTripDocument(remapTripStopReferences({...trip,ownerId:inverse.snapshot.ownerId},reverse,trip));
    }
    const prepared = prepareBuilderHandlerEdits(source, edits, builderDocumentFingerprint(source));
    if (!prepared.ok) return prepared;
    const candidate = source === trip ? prepared.trip : requireReadableTripDocument(remapTripStopReferences({...prepared.trip,ownerId},inverseIds!,prepared.trip));
    const before = structuredClone(trip);
    if (!storeCanonical(candidate, before)) return { ok: false as const, reason: 'storage' as const };
    // A caller can consume only the exact raw field it deliberately accepted. Unrelated bytes remain independent.
    for (const input of acceptedInputs ?? []) {
      draft = consumeBuilderInputDraft(draft, input.binding, draft.inputRevision, input.raw);
    }
    inputRevision = Math.max(inputRevision + 1, draft.inputRevision);
    draft = { ...rebindBuilderInputDraft(draft, trip, ownerId), inputRevision };
    if (writeDraft()) scheduleCloud();
    scheduleWork(); publish(); return { ok: true as const, trip: snapshot.trip, releasedNights: prepared.releasedNights };
  }
  publish();
  scheduleWork();
  if (pending && !paused && !error) scheduleCloud();
  return {
    getSnapshot: () => snapshot,
    captureStructuralSnapshot(retain = true) {
      const captured = freeze(builderStructuralSnapshot(trip));
      if (retain) undoFrame = {snapshot:captured,stopIds:new Map(trip.stops.map(stop=>[stop.id,stop.id]))};
      return captured;
    },
    retainStructuralSnapshot(captured: BuilderStructuralSnapshot, revision: number) {
      if (!active() || acceptedRevision !== revision || captured.id !== tripId || captured.ownerId !== trip.ownerId) return false;
      undoFrame = {snapshot:captured,stopIds:new Map(captured.stops.map(stop=>[stop.id,stop.id]))};
      return true;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    updateDraft(patch: { binding: BuilderInputBinding; raw: string }) {
      if (!active() || draftProtected) return false;
      const next = updateBuilderInputDraft(draft, trip, patch.binding, patch.raw, ownerId);
      if (next.inputRevision === draft.inputRevision) return !draftNeedsWrite;
      draft = next; inputRevision = draft.inputRevision;
      const stored = writeDraft(); if (stored && error?.category === 'storage' && !paused) error = null;
      scheduleWork(); publish(); return stored;
    },
    accept(edit: BuilderAcceptedEdit, expectedInputRevision: number, acceptedInput?: { binding: BuilderInputBinding; raw: string }) {
      return acceptEdits([edit], expectedInputRevision, acceptedInput ? [acceptedInput] : undefined);
    },
    acceptBatch: acceptEdits,
    resumeNecessaryWork,
    discardDraft(binding: BuilderInputBinding) {
      if(!active() || draftProtected) return false;
      draft=discardBuilderInputDraftField(draft,binding,draft.inputRevision);inputRevision=draft.inputRevision;
      const stored=writeDraft();scheduleWork();if(stored)scheduleCloud();publish();return stored;
    },
    retryNecessaryUnit(unit: Unit) {
      if(!active() || draftProtected) return false;
      const prepared=retryBuilderReconciliationUnit(trip,unit);
      if(!prepared.ok || !storeCanonical(prepared.trip,trip)) return false;
      draft=rebindBuilderInputDraft(draft,trip,ownerId);if(writeDraft())scheduleCloud();scheduleWork();publish();return true;
    },
    retrySave() {
      if (!active() || historicalRecovery || draftProtected || pauseReason === 'conflict' || pauseReason === 'auth'
        || pauseReason === 'validation' || error?.category === 'protected') return false;
      if (draftNeedsWrite && !writeDraft()) return false;
      if (promoting && failedJob?.submitted?.ownerId === null) {
        // Unknown lost success must first retry the identical insert; a newer draft is not an idempotent retry.
        pending = { ...failedJob, trip: structuredClone(failedJob.submitted), authoredFrom: undefined };
      }
      if (pending && failedJob?.submitted && acknowledgedCanonical
        && failedJob.submitted.updatedAt === acknowledgedCanonical.updatedAt
        && failedJob.submitted.ownerId === ownerId && failedJob.submitted.id === tripId) {
        // The failed submission contains the prior local edit rebased onto an
        // exact acknowledged ancestor. Carry later deltas (including inverses)
        // over that proven submission; a failed queue tail cannot supply it.
        // Keep the latest local document/write handle distinct from this CAS
        // submission. An unacknowledged server write still conflicts normally.
        try {
          pending = { ...pending, trip: requireReadableTripDocument(mergeTripMutationDocuments(
            failedJob.localTrip, pending.localTrip, failedJob.submitted,
          )), authoredFrom: undefined };
        } catch (cause) {
          paused = true; pauseReason = tripRecoveryStateForPersistenceError(cause);
          if (recovery) options.markRecoveryState?.(recovery, pauseReason);
          saveFailure(pauseReason, 'The retry needs recovery review. The exact device trip remains preserved.');
          return false;
        }
      }
      paused = false; pauseReason = null; error = null;
      if (recovery) options.markRecoveryState?.(recovery, 'pending');
      if (!pending && failedJob) pending = { ...failedJob, trip: structuredClone(failedJob.submitted ?? failedJob.trip), authoredFrom: undefined };
      canonicalSaveState = pending ? 'local' : canonicalSaveState;
      cloudDue = true; publish(); startSave(); return true;
    },
    async flush(input?: { promoteOwnerless?: boolean }): Promise<boolean> {
      if (input?.promoteOwnerless && active() && trip.ownerId === null && ownerId !== null && recovery
        && (!paused || historicalRecovery && pauseReason === 'pending') && (!error || error.category === 'pending')) {
        promoting = true; historicalRecovery = false; paused = false; pauseReason = null; error = null;
      }
      if (!active() || error || paused || draftNeedsWrite) return false;
      if (ownerId === null) return true;
      if (trip.ownerId === null && !promoting) return false;
      cancelCloud?.(); cancelCloud = null; cloudDue = true; startSave();
      while (inFlight) { await inFlight; if (!active() || paused || error) return false; cloudDue = true; startSave(); }
      return active() && !pending && !draftNeedsWrite && !error;
    },
    dispose() { disposed = true; cancelCloud?.(); cancelWork?.(); workAbort?.abort(); workAbort = null; work = null; listeners.clear(); queue.reset(); },
  };
}
export type BuilderEditSession = ReturnType<typeof createBuilderEditSession>;
