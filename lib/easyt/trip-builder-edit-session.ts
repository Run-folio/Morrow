import type { CanonicalEasyTTrip, EasyTTrip, TripRouteReconciliation } from './trip.ts';
import { requireReadableTripDocument, prepareTripDocumentForWrite } from './trip-document.ts';
import type { BuilderAcceptedEdit } from './trip-builder-edit.ts';
import { builderDocumentFingerprint } from './trip-builder-document-commit.ts';
import { prepareBuilderHandlerEdits } from './trip-builder-handler-contract.ts';
import { createBuilderInputDraft, updateBuilderInputDraft, rebindBuilderInputDraft, consumeBuilderInputDraft,
  type BuilderInputBinding, type BuilderInputDraft, type BuilderInputReadResult, type writeBuilderInputDraft } from './trip-builder-input-draft.ts';
import { pendingBuilderReconciliationUnits, mergeBuilderProjectionResponse,
  type BuilderEditScope, type BuilderProjectionResponse } from './trip-builder-reconciliation.ts';
import { routeProjectionInputKey, routeProjectionStatus } from './trip-route-intent.ts';
import { createTripMutationPersistenceQueue, mergeTripMutationDocuments } from './trip-mutation-persistence.ts';
import { tripBuildDocumentsCanonicalEquivalent } from './trip-promotion.ts';
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
  historicalRecovery: boolean;
  recovery: TripRecoveryHandle | null; error: { category: TripRecoveryState | 'storage' | 'protected'; message: string } | null;
};
export type BuilderEditSessionOptions = {
  initialTrip: EasyTTrip; initialRecovery?: TripRecoveryRecord | null; initialCanonicalTrip?: EasyTTrip | null;
  /** Set only after the existing deliberate recovery flow authorizes this exact source; never infer from a read. */
  allowRecoverySync?: boolean;
  getOwnerId(): string | null;
  readDraft(trip: CanonicalEasyTTrip): BuilderInputReadResult;
  writeDraft(trip: CanonicalEasyTTrip, draft: BuilderInputDraft): ReturnType<typeof writeBuilderInputDraft>;
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

/** Device recovery is the acceptance boundary. Cloud and projections are independent, scoped continuations. */
export function createBuilderEditSession(options: BuilderEditSessionOptions) {
  let trip = requireReadableTripDocument(options.initialTrip);
  const ownerId = trip.ownerId, tripId = trip.id;
  const read = options.readDraft(trip);
  let draft = read.kind === 'readable' ? read.draft : createBuilderInputDraft(trip);
  let inputRevision = draft.inputRevision, acceptedRevision = 0;
  let disposed = false, draftNeedsWrite = false;
  const initialRecovery = options.initialRecovery;
  if (initialRecovery && (initialRecovery.ownerId !== ownerId || initialRecovery.tripId !== tripId
    || !exact(prepareTripDocumentForWrite(initialRecovery.trip), prepareTripDocumentForWrite(trip)))) {
    throw new TypeError('Recovery does not own the hydrated Builder document');
  }
  let recovery: TripRecoveryHandle | null = initialRecovery
    ? { ownerId, tripId, writeId: initialRecovery.writeId } : null;
  const historicalRecovery = Boolean(initialRecovery && ownerId !== null && !options.allowRecoverySync);
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
      projectionState, pendingUnits, failedUnits, conflictUnits, historicalRecovery, recovery, error }));
    listeners.forEach(listener => listener());
  }
  function scheduleCloud() {
    cancelCloud?.(); cloudDue = false;
    if (!active() || paused || draftNeedsWrite || !pending || ownerId === null) return;
    cancelCloud = options.schedule(() => { cancelCloud = null; cloudDue = true; startSave(); }, 450);
  }
  function saveFailure(category: NonNullable<BuilderEditSessionSnapshot['error']>['category'], message: string) {
    error = { category, message }; canonicalSaveState = 'error'; publish();
  }
  function storeCanonical(candidate: CanonicalEasyTTrip, authoredFrom: CanonicalEasyTTrip): boolean {
    if (!active() || draftProtected) return false;
    candidate = requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(candidate))));
    let result: TripRecoveryWriteResult;
    try { result = options.saveRecovery(candidate, { ownerId, ...(recovery ? { replace: recovery } : {}), accountSavePending: ownerId !== null, state: pauseReason ?? 'pending' }); }
    catch { saveFailure('storage', 'The accepted edit could not be saved on this device.'); return false; }
    if (!result.stored || result.handle.ownerId !== ownerId || result.handle.tripId !== tripId) {
      saveFailure('storage', 'The accepted edit could not safely replace this device recovery.'); return false;
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
    try { result = options.writeDraft(trip, draft); } catch { result = { ok: false, reason: 'storage' }; }
    draftNeedsWrite = !result.ok;
    if (!result.ok) { saveFailure(result.reason === 'protected' ? 'protected' : 'storage', 'The input draft is still in memory and could not be saved on this device.'); return false; }
    return true;
  }
  function startSave() {
    if (!active() || paused || draftNeedsWrite || inFlight || !pending || ownerId === null || !cloudDue) return;
    const job = pending; pending = null; submitting = job; cloudDue = false;
    lastEnqueuedTrip = structuredClone(job.trip);
    canonicalSaveState = 'cloud-saving'; publish();
    inFlight = queue.enqueue(job.trip, job.handle, job.authoredFrom).then(canonical => {
      if (!active()) return;
      acknowledgedCanonical = requireReadableTripDocument(canonical);
      const submitted = job.submitted!;
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
    const request: BuilderReconciliationRequest = { trip: structuredClone(trip), scope: { ownerId, tripId, inputRevision },
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
      draft = rebindBuilderInputDraft(draft, trip);
      if (writeDraft()) scheduleCloud();
      publish();
    } catch {
      if (!active() || work !== request || inputRevision !== request.scope.inputRevision) return;
      // Persist only the exact dispatched subset as failed. No provider result is invented.
      const failed = mergeBuilderProjectionResponse(trip, { ...request, results: dispatched.map(unit => ({ ...unit, phase: 'failed', reason: 'unavailable' })), legs: [] }, request);
      if (failed.ok && storeCanonical(failed.trip, structuredClone(trip))) { continued = true; draft = rebindBuilderInputDraft(draft, trip); if (writeDraft()) scheduleCloud(); publish(); }
    } finally { if (work === request) { work = null; workAbort = null; if (continued) scheduleWork(); } }
  }
  function acceptEdits(edits: readonly BuilderAcceptedEdit[], expectedInputRevision: number,
    acceptedInputs?: readonly { binding: BuilderInputBinding; raw: string }[]) {
    if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };
    if (draftProtected || error?.category === 'protected') return { ok: false as const, reason: 'protected' as const };
    const prepared = prepareBuilderHandlerEdits(trip, edits, builderDocumentFingerprint(trip));
    if (!prepared.ok) return prepared;
    const candidate = prepared.trip;
    const before = structuredClone(trip);
    if (!storeCanonical(candidate, before)) return { ok: false as const, reason: 'storage' as const };
    // A caller can consume only the exact raw field it deliberately accepted. Unrelated bytes remain independent.
    for (const input of acceptedInputs ?? []) {
      draft = consumeBuilderInputDraft(draft, input.binding, draft.inputRevision, input.raw);
    }
    inputRevision = Math.max(inputRevision + 1, draft.inputRevision);
    draft = { ...rebindBuilderInputDraft(draft, trip), inputRevision };
    if (writeDraft()) scheduleCloud();
    scheduleWork(); publish(); return { ok: true as const, trip: snapshot.trip, releasedNights: prepared.releasedNights };
  }
  publish();
  scheduleWork();
  if (pending && !paused && !error) scheduleCloud();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    updateDraft(patch: { binding: BuilderInputBinding; raw: string }) {
      if (!active() || draftProtected) return false;
      const next = updateBuilderInputDraft(draft, trip, patch.binding, patch.raw);
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
    retrySave() {
      if (!active() || historicalRecovery || draftProtected || pauseReason === 'conflict' || pauseReason === 'auth'
        || pauseReason === 'validation' || error?.category === 'protected') return false;
      if (draftNeedsWrite && !writeDraft()) return false;
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
    async flush(): Promise<boolean> {
      if (!active() || error || paused || draftNeedsWrite) return false;
      if (ownerId === null) return true;
      cancelCloud?.(); cancelCloud = null; cloudDue = true; startSave();
      while (inFlight) { await inFlight; if (!active() || paused || error) return false; cloudDue = true; startSave(); }
      return active() && !pending && !draftNeedsWrite && !error;
    },
    dispose() { disposed = true; cancelCloud?.(); cancelWork?.(); workAbort?.abort(); workAbort = null; work = null; listeners.clear(); queue.reset(); },
  };
}
export type BuilderEditSession = ReturnType<typeof createBuilderEditSession>;
