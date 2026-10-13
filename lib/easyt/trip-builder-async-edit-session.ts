import type { CanonicalEasyTTrip, EasyTTrip, TripRouteReconciliation } from './trip.ts';
import { requireReadableTripDocument, prepareTripDocumentForWrite } from './trip-document.ts';
import { builderStructuralSnapshot, type BuilderAcceptedEdit, type BuilderStructuralSnapshot } from './trip-builder-edit.ts';
import { builderDocumentFingerprint } from './trip-builder-document-commit.ts';
import { prepareBuilderHandlerEdits } from './trip-builder-handler-contract.ts';
import { createBuilderInputDraft, updateBuilderInputDraft, rebindBuilderInputDraft, consumeBuilderInputDraft, remapBuilderInputDraftIdentity, discardBuilderInputDraftField,
  type BuilderInputBinding, type BuilderInputDraft, type BuilderInputReadResult, type writeBuilderInputDraft } from './trip-builder-input-draft.ts';
import { pendingBuilderReconciliationUnits, mergeBuilderProjectionResponse, retryBuilderReconciliationUnit,
  type BuilderProjectionResponse } from './trip-builder-reconciliation.ts';
import { routeProjectionInputKey, routeProjectionStatus } from './trip-route-intent.ts';
import { createTripMutationPersistenceQueue, mergeTripMutationDocuments } from './trip-mutation-persistence.ts';
import { canonicalTripStopIdentityMap, remapTripStopReferences, tripBuildDocumentsCanonicalEquivalent } from './trip-promotion.ts';
import { type TripRecoveryHandle,
  type TripRecoveryState, type TripRecoveryWriteResult, type TripBuildSaveAcknowledgement } from './storage.ts';
import { EasyTTripPersistenceError, tripRecoveryStateForPersistenceError } from './trip-persistence-error.ts';
import type { TransferAssessment } from './planning-evidence-state.ts';
import { transferAssessmentForLeg } from './planning-evidence-presentation.ts';
import { recoveryPersistenceOutcome, reportPersistenceOutcome, reportExactAccountAcknowledgement, type PersistenceOutcome } from './persistence-outcome.ts';

import { freezeBuilderSessionValue as freeze, builderSessionValuesEqual as exact } from './trip-builder-edit-session.ts';
import type { BuilderEditSessionOptions, BuilderEditSessionSnapshot, BuilderReconciliationRequest, BuilderSessionSaveState } from './trip-builder-edit-session.ts';

type Unit = TripRouteReconciliation['residual'][number];
type Awaitable<T> = T | Promise<T>;
export type BuilderAsyncOperationGuard = { isCurrent(): boolean };
export type BuilderAsyncRecoveryWriteOptions = Parameters<BuilderEditSessionOptions['saveRecovery']>[1] & BuilderAsyncOperationGuard & {
  /** Exact next input, committed with this canonical candidate before stored:true. */
  draft: BuilderInputDraft;
  canonicalBase: CanonicalEasyTTrip;
  authoredFrom: CanonicalEasyTTrip;
};
export type BuilderAsyncAcknowledgement = TripBuildSaveAcknowledgement & {
  /** Exact server response authority; never inferred from a GET/cache. */
  accountAcknowledged?: boolean;
  cacheStored?: boolean;
};
export type AsyncBuilderEditSessionOptions = Omit<BuilderEditSessionOptions,
  'readDraft' | 'writeDraft' | 'saveRecovery' | 'acknowledgeRecovery' | 'markRecoveryState'> & {
  readDraft(trip: CanonicalEasyTTrip, ownerId: string | null): Awaitable<BuilderInputReadResult>;
  writeDraft(trip: CanonicalEasyTTrip, draft: BuilderInputDraft, ownerId: string | null,
    guard?: BuilderAsyncOperationGuard): Awaitable<ReturnType<typeof writeBuilderInputDraft>>;
  saveRecovery(trip: CanonicalEasyTTrip, options: BuilderAsyncRecoveryWriteOptions): Awaitable<TripRecoveryWriteResult>;
  acknowledgeRecovery(reviewed: EasyTTrip, canonical: EasyTTrip, handle: TripRecoveryHandle,
    guard?: BuilderAsyncOperationGuard): Awaitable<BuilderAsyncAcknowledgement>;
  markRecoveryState?(handle: TripRecoveryHandle, state: TripRecoveryState): Awaitable<boolean>;
};
type SaveJob = { trip: CanonicalEasyTTrip; localTrip: CanonicalEasyTTrip; handle: TripRecoveryHandle; acceptedRevision: number;
  authoredFrom?: CanonicalEasyTTrip; submitted?: CanonicalEasyTTrip };
class BuilderPromotionStorageError extends Error {}

/** Ready barrier plus device-first acceptance. The callback owns atomic canonical/input durability. */
export async function createAsyncBuilderEditSession(options: AsyncBuilderEditSessionOptions) {
  let trip = requireReadableTripDocument(options.initialTrip);
  const initialRecovery = options.initialRecovery;
  const ownerId = initialRecovery ? initialRecovery.ownerId : trip.ownerId ?? options.getOwnerId(), tripId = trip.id;
  if (trip.ownerId !== null && trip.ownerId !== ownerId || options.getOwnerId() !== ownerId
    || initialRecovery && (initialRecovery.tripId !== tripId || !initialRecovery.writeId
      || !exact(prepareTripDocumentForWrite(initialRecovery.trip), prepareTripDocumentForWrite(trip)))) {
    throw new TypeError('Recovery does not own the hydrated Builder document');
  }
  let read: BuilderInputReadResult;
  try { read = await options.readDraft(freeze(structuredClone(trip)), ownerId); }
  catch { read = { kind: 'error', reason: 'storage' }; }
  if (options.getOwnerId() !== ownerId) throw new TypeError('Builder owner scope expired during hydration');
  let draft = read.kind === 'readable' ? structuredClone(read.draft) : createBuilderInputDraft(trip, 0, ownerId);
  let inputRevision = draft.inputRevision, acceptedRevision = 0;
  let disposed = false, draftNeedsWrite = false;
  let recovery: TripRecoveryHandle | null = initialRecovery
    ? { ownerId, tripId, writeId: initialRecovery.writeId, ...(initialRecovery.backend ? { backend: initialRecovery.backend } : {}) } : null;
  let historicalRecovery = Boolean(initialRecovery && ownerId !== null && !options.allowRecoverySync);
  let promoting = false;
  let promotionIdentity: ReadonlyMap<string, string> | null = null;
  let undoFrame: { snapshot: BuilderStructuralSnapshot; stopIds: ReadonlyMap<string, string> } | null = null;
  let paused = historicalRecovery || Boolean(initialRecovery && initialRecovery.state !== 'pending');
  let pauseReason: TripRecoveryState | null = paused ? initialRecovery!.state : null;
  let error: BuilderEditSessionSnapshot['error'] = read.kind === 'protected' || read.kind === 'error'
    ? { category: read.kind === 'protected' ? 'protected' : 'storage', message: 'The input draft could not be read safely.' }
    : paused ? { category: initialRecovery!.state, message: 'The saved device trip needs recovery before account sync.' } : null;
  const draftProtected = read.kind === 'protected' || read.kind === 'error';
  let canonicalSaveState: BuilderSessionSaveState = error ? 'error' : recovery || ownerId === null ? 'local' : 'cloud';
  let pending: SaveJob | null = recovery ? { trip: structuredClone(trip), localTrip: structuredClone(trip), handle: recovery, acceptedRevision } : null;
  let failedJob: SaveJob | null = null, inFlight: Promise<void> | null = null;
  let acknowledgedCanonical: CanonicalEasyTTrip | null = null;
  let lastEnqueuedTrip: CanonicalEasyTTrip | undefined;
  let cloudDue = false, cancelCloud: (() => void) | null = null, cancelWork: (() => void) | null = null;
  let work: BuilderReconciliationRequest | null = null, requestSequence = 0;
  let assessmentFeedback: { inputKey: string; assessments: TransferAssessment[] } | null = null;
  let workAbort: AbortController | null = null;
  let deviceTail = Promise.resolve(), devicePending = 0, canonicalPending = 0;
  const listeners = new Set<() => void>();
  const active = () => !disposed && options.getOwnerId() === ownerId;
  const queue = createTripMutationPersistenceQueue(async (document, handle) => {
    const currentJob = submitting;
    if (!active() || !currentJob || !exact(currentJob.handle, handle)) throw new Error('Save scope expired');
    currentJob.submitted = requireReadableTripDocument(document);
    const canonical = requireReadableTripDocument(await options.persistAccount(freeze(structuredClone(document)), freeze(structuredClone(handle))));
    if (canonical.ownerId !== ownerId || canonical.id !== tripId
      || !tripBuildDocumentsCanonicalEquivalent(document, canonical, ownerId)) throw new EasyTTripPersistenceError({
        category: 'validation', status: 200, operation: 'update', message: 'Invalid canonical save acknowledgement',
      });
    return canonical;
  });
  // A recovered document never becomes acknowledged ancestry merely by being read.
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
    snapshot = freeze(structuredClone({ trip, draft, inputRevision, acceptedRevision,
      canonicalSaveState: canonicalPending && !error ? 'device-saving' : canonicalSaveState,
      saveState: error ? 'error' : devicePending || draftNeedsWrite ? 'device-saving' : draft.fields.length && canonicalSaveState === 'cloud' ? 'local' : canonicalSaveState,
      projectionState, pendingUnits, failedUnits, conflictUnits,
      transferAssessments: assessmentFeedback?.inputKey === routeProjectionInputKey(trip) ? assessmentFeedback.assessments : [],
      historicalRecovery, browserOwnerId: ownerId, recovery, error }));
    listeners.forEach(listener => listener());
  }
  function operationGuard(): BuilderAsyncOperationGuard {
    const source = freeze(structuredClone(trip)), handle = freeze(structuredClone(recovery));
    const revision = inputRevision, accepted = acceptedRevision;
    return { isCurrent: () => active() && inputRevision === revision && acceptedRevision === accepted && exact(trip, source) && exact(recovery, handle) };
  }
  function runDevice<T>(canonical: boolean, operation: () => Promise<T>): Promise<T> {
    devicePending++; if (canonical) canonicalPending++;
    cancelCloud?.(); cancelCloud = null; cloudDue = false; publish();
    const result = deviceTail.then(operation).finally(() => {
      devicePending--; if (canonical) canonicalPending--;
      if (active()) { publish(); if (!devicePending) scheduleCloud(); }
    });
    deviceTail = result.then(() => undefined, () => undefined);
    return result;
  }
  function scheduleCloud() {
    cancelCloud?.(); cloudDue = false;
    if (!active() || paused || devicePending || draftNeedsWrite || !pending || ownerId === null || trip.ownerId === null && !promoting) return;
    cancelCloud = options.schedule(() => { cancelCloud = null; cloudDue = true; startSave(); }, 450);
  }
  function saveFailure(category: NonNullable<BuilderEditSessionSnapshot['error']>['category'], message: string, deviceOutcome?: PersistenceOutcome) {
    const retainedOutcome = deviceOutcome ?? error?.deviceOutcome;
    const rejectedEditMessage = deviceOutcome ? message : error?.rejectedEditMessage;
    error = { category, message: rejectedEditMessage && !deviceOutcome ? `${message} ${rejectedEditMessage}` : message,
      ...(retainedOutcome ? { deviceOutcome: retainedOutcome, rejectedEditMessage } : {}) };
    canonicalSaveState = 'error'; publish();
  }
  async function markState(handle: TripRecoveryHandle | null, state: TripRecoveryState) {
    if (!handle || !active()) return;
    try { await options.markRecoveryState?.(freeze(structuredClone(handle)), state); } catch { /* Optional status cannot change proven account authority. */ }
  }
  async function storeCanonical(candidate: CanonicalEasyTTrip, canonicalBase: CanonicalEasyTTrip,
    nextDraft: BuilderInputDraft, guard = operationGuard(), continuation?: {
      advanceRevision?: boolean; authoredFrom?: CanonicalEasyTTrip; committed?(): void;
    }): Promise<boolean> {
    const frozen = freeze(requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(candidate)))));
    const metadata = freeze({ ownerId, ...(recovery ? { replace: structuredClone(recovery) } : {}),
      accountSavePending: ownerId !== null && !paused && !historicalRecovery && (candidate.ownerId !== null || promoting),
      state: pauseReason ?? 'pending', draft: structuredClone(nextDraft), canonicalBase: structuredClone(canonicalBase),
      authoredFrom: structuredClone(continuation?.authoredFrom ?? lastEnqueuedTrip ?? canonicalBase), isCurrent: guard.isCurrent });
    return runDevice(true, async () => {
      if (!guard.isCurrent() || draftProtected) return false;
      let result: TripRecoveryWriteResult;
      try { result = await options.saveRecovery(frozen, metadata); }
      catch {
        if (guard.isCurrent()) { reportPersistenceOutcome('builder-edit', { stored: false }); saveFailure('unknown', 'This edit could not be accepted. Your current trip remains unchanged.', 'unknown'); }
        return false;
      }
      if (!guard.isCurrent()) return false;
      reportPersistenceOutcome('builder-edit', result);
      if (!result.stored || result.handle.ownerId !== ownerId || result.handle.tripId !== tripId || !result.handle.writeId
        || result.recoveryDurable === false || result.readbackConfirmed === false || result.pointerAcknowledged === false) {
        const scopeMatches = result.handle.ownerId === ownerId && result.handle.tripId === tripId;
        if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected', 'Another device recovery is protected. Reopen it before editing.', 'protected-conflict');
        else if (scopeMatches && result.failureReason === 'device-unavailable') saveFailure('storage', 'This edit could not be saved on this device. Your current trip remains unchanged.', recoveryPersistenceOutcome(result));
        else saveFailure('unknown', 'This edit could not be accepted. Your current trip remains unchanged.', recoveryPersistenceOutcome({ ...result, stored: false }));
        return false;
      }
      recovery = structuredClone(result.handle); trip = structuredClone(frozen);
      if (continuation?.advanceRevision !== false) acceptedRevision++;
      draft = structuredClone(metadata.draft); inputRevision = draft.inputRevision; draftNeedsWrite = false;
      pending = { trip: structuredClone(trip), localTrip: structuredClone(trip), handle: structuredClone(recovery), acceptedRevision,
        authoredFrom: structuredClone(metadata.authoredFrom) };
      canonicalSaveState = 'local';
      if (!paused && !error?.deviceOutcome) error = null;
      continuation?.committed?.();
      return true;
    });
  }
  async function writeDraft(nextDraft = draft, nextTrip = trip, guard = operationGuard(), install = false): Promise<boolean> {
    const frozenDraft = freeze(structuredClone(nextDraft)), frozenTrip = freeze(structuredClone(nextTrip));
    return runDevice(false, async () => {
      if (!guard.isCurrent() || draftProtected) return false;
      let result: ReturnType<typeof writeBuilderInputDraft>;
      try { result = await options.writeDraft(frozenTrip, frozenDraft, ownerId, guard); }
      catch { result = { ok: false, reason: 'storage' }; }
      if (!guard.isCurrent()) return false;
      if (!result.ok) {
        if (!install) draftNeedsWrite = true;
        saveFailure(result.reason === 'protected' ? 'protected' : 'storage', 'The input draft is still in memory and could not be saved on this device.'); return false;
      }
      if (install) { draft = structuredClone(frozenDraft); inputRevision = draft.inputRevision; }
      draftNeedsWrite = false;
      if (error?.category === 'storage' && !error.deviceOutcome && !paused) error = null;
      return true;
    });
  }
  function acknowledgementAccepted(ack: BuilderAsyncAcknowledgement) {
    return ack.accountAcknowledged !== false && ack.outcome !== 'invalid-canonical'
      && (ack.accountAcknowledged === true || ack.outcome !== 'storage-failed');
  }
  async function awaitDeviceWrites() {
    while (devicePending && active()) await deviceTail;
    return active();
  }
  async function acknowledge(job: SaveJob, canonical: CanonicalEasyTTrip) {
    // Delayed predecessor ACKs may journal exact authority without changing the current head.
    const ack = await options.acknowledgeRecovery(freeze(structuredClone(job.submitted!)), freeze(structuredClone(canonical)),
      freeze(structuredClone(job.handle)), { isCurrent: active });
    if (!await awaitDeviceWrites()) return null;
    if (!acknowledgementAccepted(ack)) throw new Error('Canonical acknowledgement could not be retained on this device');
    reportExactAccountAcknowledgement();
    return ack;
  }
  function startSave() {
    if (!active() || paused || devicePending || draftNeedsWrite || inFlight || !pending || ownerId === null || !cloudDue || pending.trip.ownerId === null && !promoting) return;
    const job = pending; pending = null; submitting = job; cloudDue = false;
    lastEnqueuedTrip = structuredClone(job.trip);
    canonicalSaveState = 'cloud-saving'; publish();
    inFlight = queue.enqueue(job.trip, job.handle, job.authoredFrom).then(async saved => {
      if (!await awaitDeviceWrites()) return;
      const canonical = requireReadableTripDocument(saved);
      acknowledgedCanonical = requireReadableTripDocument(canonical);
      const submitted = job.submitted!;
      const isPromotion = submitted.ownerId === null && canonical.ownerId === ownerId;
      const proposedIds = canonicalTripStopIdentityMap(job.localTrip), canonicalIds = new Set(canonical.stops.map(stop => stop.id));
      const submittedIds = new Map(job.localTrip.stops.map(stop => {
        const mapped = proposedIds.get(stop.id)!;
        const target = canonicalIds.has(mapped) ? mapped : canonicalIds.has(stop.id) ? stop.id : null;
        if (target === null) throw new EasyTTripPersistenceError({ category: 'validation', status: 200, operation: isPromotion ? 'promotion' : 'update', message: 'Unmapped canonical acknowledgement' });
        return [stop.id, target];
      }));
      if (isPromotion || [...submittedIds].some(([source, target]) => source !== target)) {
        // Preserve the ownerless source until the atomic promoted canonical/input continuation is verified.
        const before = structuredClone(trip), guard = operationGuard();
        const currentIds = canonicalTripStopIdentityMap(before);
        const liveIds = new Map(before.stops.map(stop => [stop.id, submittedIds.get(stop.id) ?? currentIds.get(stop.id)!]));
        const reservedIds = new Set(submittedIds.values());
        if (new Set(liveIds.values()).size !== liveIds.size || [...liveIds].some(([source, target]) => !submittedIds.has(source) && reservedIds.has(target))) {
          throw new EasyTTripPersistenceError({ category: 'validation', status: 200, operation: 'promotion', message: 'Ambiguous canonical identity continuation' });
        }
        const mapped = requireReadableTripDocument(remapTripStopReferences({ ...before, ownerId }, liveIds, before));
        const mappedSubmitted = requireReadableTripDocument(remapTripStopReferences({ ...job.localTrip, ownerId, updatedAt: canonical.updatedAt }, submittedIds, job.localTrip));
        const isLatest = acceptedRevision === job.acceptedRevision && exact(recovery, job.handle) && exact(trip, job.localTrip);
        const next = isLatest ? canonical : requireReadableTripDocument(mergeTripMutationDocuments(mappedSubmitted, mapped, canonical));
        const nextDraft = remapBuilderInputDraftIdentity(draft, before, next, liveIds, ownerId);
        // Retain the promoted input and current authored continuation together before installing identities or Undo mappings.
        if (!await storeCanonical(next, before, nextDraft, guard, {
          advanceRevision: !isLatest, authoredFrom: canonical,
          committed: () => {
            lastEnqueuedTrip = structuredClone(canonical);
            workAbort?.abort(); cancelWork?.(); workAbort = null; work = null;
            if (isPromotion) promotionIdentity = new Map([...submittedIds, ...liveIds]);
            else if (promotionIdentity) promotionIdentity = new Map([...promotionIdentity].map(([source, current]) => [source, submittedIds.get(current) ?? liveIds.get(current) ?? current]));
            if (undoFrame) undoFrame.stopIds = new Map([...undoFrame.stopIds].map(([source, current]) => [source, submittedIds.get(current) ?? liveIds.get(current) ?? current]));
            failedJob = null; promoting = false; historicalRecovery = false;
          },
        })) {
          if (!active()) return;
          throw new BuilderPromotionStorageError('Promoted latest recovery could not be retained');
        }
        const retainedHandle = structuredClone(recovery!);
        const retainedTrip = structuredClone(trip), retainedRevision = acceptedRevision;
        const ack = await acknowledge(job, canonical);
        if (!ack || !active()) return;
        if (isLatest) {
          // The new device handle represents the same exact account document. Resolve only that retained continuation.
          const promotedJob = { ...job, handle: retainedHandle, localTrip: retainedTrip, acceptedRevision: retainedRevision, submitted: canonical };
          const promotedAck = await acknowledge(promotedJob, canonical);
          if (!active()) return;
          if (promotedAck && acceptedRevision === promotedJob.acceptedRevision && exact(recovery, promotedJob.handle) && exact(trip, promotedJob.localTrip)) {
            recovery = promotedAck.outcome === 'acknowledged' ? null : recovery;
            pending = null; canonicalSaveState = 'cloud'; if (!error?.deviceOutcome) error = null;
          }
        } else cloudDue = true;
        if (pending) cloudDue = true;
        scheduleWork(); publish(); return;
      }
      const ack = await acknowledge(job, canonical);
      if (!ack || !active()) return;
      const isCurrent = acceptedRevision === job.acceptedRevision && exact(recovery, job.handle) && exact(trip, job.localTrip);
      if (isCurrent) {
        if (ack.outcome !== 'acknowledged' && !(ack.accountAcknowledged === true && ack.outcome === 'storage-failed')) {
          throw new Error('A different device recovery still requires attention');
        }
        trip = requireReadableTripDocument(canonical); recovery = ack.outcome === 'acknowledged' ? null : recovery; failedJob = null;
        canonicalSaveState = 'cloud'; if (!draftNeedsWrite && !error?.deviceOutcome) error = null;
      } else if (!paused) canonicalSaveState = 'local';
      publish();
    }).catch(async cause => {
      if (!active()) return;
      if (cause instanceof BuilderPromotionStorageError) {
        paused = true; pauseReason = 'unknown'; failedJob = job;
        await markState(recovery, 'unknown');
        if (active()) saveFailure('storage', 'The promoted trip could not be retained safely on this device. Your recovery and input remain preserved.');
        return;
      }
      const category = tripRecoveryStateForPersistenceError(cause);
      paused = true; pauseReason = category; failedJob = job;
      await markState(recovery, category);
      if (active()) saveFailure(category, category === 'conflict' ? 'This device trip conflicts with the account trip. Review recovery before continuing.'
        : 'The trip is saved on this device. Account sync needs attention.');
    }).finally(() => {
      inFlight = null; submitting = null;
      if (active()) startSave();
    });
  }
  function scheduleWork() {
    cancelWork?.(); workAbort?.abort(); workAbort = null; work = null;
    if (!active() || draftProtected || devicePending || !pendingBuilderReconciliationUnits(trip).length) return;
    cancelWork = options.schedule(() => { cancelWork = null; void resumeNecessaryWork(); }, 0);
  }
  async function resumeNecessaryWork() {
    if (!active() || draftProtected || devicePending || work) return;
    const dispatched = pendingBuilderReconciliationUnits(trip);
    if (!dispatched.length) return;
    const request: BuilderReconciliationRequest = freeze({ trip: structuredClone(trip), scope: { ownerId: trip.ownerId, tripId, inputRevision },
      inputKey: routeProjectionInputKey(trip), requestId: `${tripId}:${inputRevision}:${++requestSequence}:${options.now()}`, dispatched });
    if (assessmentFeedback?.inputKey === request.inputKey) assessmentFeedback = { inputKey: request.inputKey, assessments: assessmentFeedback.assessments.filter(item => !dispatched.some(unit => unit.kind === 'leg' && unit.targetId === item.legId)) };
    else assessmentFeedback = null;
    work = request;
    const controller = new AbortController(); workAbort = controller;
    let continued = false;
    const current = () => active() && work === request && inputRevision === request.scope.inputRevision;
    try {
      const response = await options.reconcile(structuredClone(request), controller.signal);
      if (!current()) return;
      const merged = mergeBuilderProjectionResponse(trip, response, request);
      if (!merged.ok || exact(trip, merged.trip)) return;
      const assessments = request.dispatched.filter(unit => unit.kind === 'leg' && response.legs.some(leg => leg.id === unit.targetId))
        .flatMap(unit => { const state = transferAssessmentForLeg(response.assessments, unit.targetId); return state ? [{ legId: unit.targetId, state }] : []; });
      const before = structuredClone(trip), nextDraft = rebindBuilderInputDraft(draft, merged.trip, ownerId);
      if (!await storeCanonical(merged.trip, before, nextDraft) || !current()) return;
      const retained = assessmentFeedback?.inputKey === request.inputKey ? assessmentFeedback.assessments.filter(item => !request.dispatched.some(unit => unit.kind === 'leg' && unit.targetId === item.legId)) : [];
      assessmentFeedback = { inputKey: request.inputKey, assessments: [...retained, ...assessments] };
      continued = true; scheduleCloud(); publish();
    } catch {
      if (!current()) return;
      const failed = mergeBuilderProjectionResponse(trip, { ...request, results: dispatched.map(unit => ({ ...unit, phase: 'failed', reason: 'unavailable' })), legs: [] }, request);
      if (failed.ok && await storeCanonical(failed.trip, structuredClone(trip), rebindBuilderInputDraft(draft, failed.trip, ownerId)) && current()) {
        continued = true; scheduleCloud(); publish();
      }
    } finally { if (work === request) { work = null; workAbort = null; if (continued) scheduleWork(); } }
  }
  async function acceptEdits(edits: readonly BuilderAcceptedEdit[], expectedInputRevision: number,
    acceptedInputs?: readonly { binding: BuilderInputBinding; raw: string }[]) {
    if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };
    // A preceding projection may change the canonical handle without changing
    // traveller input. Wait for its readback, then recheck the submitted revision.
    if (devicePending && !await awaitDeviceWrites()) return { ok: false as const, reason: 'stale-source' as const };
    if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };
    if (draftProtected || error?.category === 'protected') return { ok: false as const, reason: 'protected' as const };
    const guard = operationGuard();
    const inverse = edits.length === 1 && edits[0]!.kind === 'structural-inverse' ? edits[0] : null;
    const inverseIds = inverse && (undoFrame?.snapshot === inverse.snapshot ? undoFrame.stopIds
      : inverse.snapshot.ownerId === null && trip.ownerId !== null ? promotionIdentity : null);
    let source = trip;
    if (inverse && inverseIds && (inverse.snapshot.ownerId !== trip.ownerId || [...inverseIds].some(([from, to]) => from !== to))) {
      if (!inverse.snapshot.stops.every(stop => inverseIds.has(stop.id))) return { ok: false as const, reason: 'binding-conflict' as const };
      const reverse = new Map([...inverseIds].map(([from, to]) => [to, from]));
      for (const stop of trip.stops) if (!reverse.has(stop.id)) reverse.set(stop.id, stop.id);
      source = requireReadableTripDocument(remapTripStopReferences({ ...trip, ownerId: inverse.snapshot.ownerId }, reverse, trip));
    }
    const prepared = prepareBuilderHandlerEdits(source, edits, builderDocumentFingerprint(source));
    if (!prepared.ok) return prepared;
    const candidate = source === trip ? prepared.trip : requireReadableTripDocument(remapTripStopReferences({ ...prepared.trip, ownerId }, inverseIds!, prepared.trip));
    let nextDraft = structuredClone(draft);
    for (const input of acceptedInputs ?? []) nextDraft = consumeBuilderInputDraft(nextDraft, input.binding, nextDraft.inputRevision, input.raw);
    const nextRevision = Math.max(inputRevision + 1, nextDraft.inputRevision);
    nextDraft = { ...rebindBuilderInputDraft(nextDraft, candidate, ownerId), inputRevision: nextRevision };
    if (!await storeCanonical(candidate, structuredClone(trip), nextDraft, guard)) {
      return { ok: false as const, reason: guard.isCurrent() ? 'storage' as const : 'stale-source' as const };
    }
    if (!paused) error = null;
    else if (error?.deviceOutcome) error = { category: pauseReason ?? 'unknown', message: 'This change is saved on this device. Account sync needs attention.' };
    assessmentFeedback = null;
    scheduleCloud(); scheduleWork(); publish(); return { ok: true as const, trip: snapshot.trip, releasedNights: prepared.releasedNights };
  }
  publish(); scheduleWork(); if (pending && !paused && !error) scheduleCloud();
  return {
    getSnapshot: () => snapshot,
    captureStructuralSnapshot(retain = true) {
      const captured = freeze(builderStructuralSnapshot(trip));
      if (retain) undoFrame = { snapshot: captured, stopIds: new Map(trip.stops.map(stop => [stop.id, stop.id])) };
      return captured;
    },
    retainStructuralSnapshot(captured: BuilderStructuralSnapshot, revision: number) {
      if (!active() || acceptedRevision !== revision || captured.id !== tripId || captured.ownerId !== trip.ownerId) return false;
      undoFrame = { snapshot: captured, stopIds: new Map(captured.stops.map(stop => [stop.id, stop.id])) }; return true;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async updateDraft(patch: { binding: BuilderInputBinding; raw: string }) {
      if (!active() || draftProtected) return false;
      const next = updateBuilderInputDraft(draft, trip, patch.binding, patch.raw, ownerId);
      if (next.inputRevision === draft.inputRevision) return !draftNeedsWrite && !devicePending;
      draft = next; inputRevision = draft.inputRevision; draftNeedsWrite = true;
      scheduleWork(); publish();
      const stored = await writeDraft(); if (active()) { scheduleWork(); if (stored) scheduleCloud(); publish(); } return stored;
    },
    async accept(edit: BuilderAcceptedEdit, expectedInputRevision: number, acceptedInput?: { binding: BuilderInputBinding; raw: string }) {
      return acceptEdits([edit], expectedInputRevision, acceptedInput ? [acceptedInput] : undefined);
    },
    acceptBatch: acceptEdits,
    waitForDeviceWrites: awaitDeviceWrites,
    resumeNecessaryWork,
    async discardDraft(binding: BuilderInputBinding) {
      if (!active() || draftProtected) return false;
      const next = discardBuilderInputDraftField(draft, binding, draft.inputRevision);
      const stored = await writeDraft(next, trip, operationGuard(), true);
      if (active()) { scheduleWork(); if (stored) scheduleCloud(); publish(); } return stored;
    },
    async retryNecessaryUnit(unit: Unit) {
      if (!active() || draftProtected) return false;
      const prepared = retryBuilderReconciliationUnit(trip, unit);
      if (!prepared.ok || !await storeCanonical(prepared.trip, trip, rebindBuilderInputDraft(draft, prepared.trip, ownerId))) return false;
      scheduleCloud(); scheduleWork(); publish(); return true;
    },
    async retrySave() {
      if (error?.deviceOutcome || !active() || historicalRecovery || draftProtected || pauseReason === 'conflict' || pauseReason === 'auth'
        || pauseReason === 'validation' || error?.category === 'protected') return false;
      const guard = operationGuard();
      if (draftNeedsWrite && !await writeDraft()) return false;
      if (!guard.isCurrent()) return false;
      if (promoting && failedJob?.submitted?.ownerId === null) pending = { ...failedJob, trip: structuredClone(failedJob.submitted), authoredFrom: undefined };
      if (pending && failedJob?.submitted && acknowledgedCanonical
        && failedJob.submitted.updatedAt === acknowledgedCanonical.updatedAt
        && failedJob.submitted.ownerId === ownerId && failedJob.submitted.id === tripId) {
        try { pending = { ...pending, trip: requireReadableTripDocument(mergeTripMutationDocuments(failedJob.localTrip, pending.localTrip, failedJob.submitted)), authoredFrom: undefined }; }
        catch (cause) {
          paused = true; pauseReason = tripRecoveryStateForPersistenceError(cause); await markState(recovery, pauseReason);
          if (active()) saveFailure(pauseReason, 'The retry needs recovery review. The exact device trip remains preserved.'); return false;
        }
      }
      await markState(recovery, 'pending'); if (!guard.isCurrent()) return false;
      paused = false; pauseReason = null; error = null;
      if (!pending && failedJob) pending = { ...failedJob, trip: structuredClone(failedJob.submitted ?? failedJob.trip), authoredFrom: undefined };
      canonicalSaveState = pending ? 'local' : canonicalSaveState;
      cloudDue = true; publish(); startSave(); return true;
    },
    async flush(input?: { promoteOwnerless?: boolean }): Promise<boolean> {
      while (devicePending) { await deviceTail; if (!active()) return false; }
      if (input?.promoteOwnerless && active() && trip.ownerId === null && ownerId !== null && recovery
        && (!paused || historicalRecovery && pauseReason === 'pending') && (!error || error.category === 'pending')) {
        promoting = true; historicalRecovery = false; paused = false; pauseReason = null; error = null;
      }
      if (!active() || error || paused || draftNeedsWrite) return false;
      if (ownerId === null) return true;
      if (trip.ownerId === null && !promoting) return false;
      cancelCloud?.(); cancelCloud = null; cloudDue = true; startSave();
      while (inFlight || devicePending) {
        if (inFlight) await inFlight; else await deviceTail;
        if (!active() || paused || error || draftNeedsWrite) return false;
        cloudDue = true; startSave();
      }
      return active() && !pending && !draftNeedsWrite && !error;
    },
    dispose() { disposed = true; cancelCloud?.(); cancelWork?.(); workAbort?.abort(); workAbort = null; work = null; listeners.clear(); queue.reset(); },
  };
}
export type AsyncBuilderEditSession = Awaited<ReturnType<typeof createAsyncBuilderEditSession>>;
