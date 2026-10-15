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
  /** Exact physical predecessor; independent of acknowledged account ancestry. */
  expectedRecoverySource?: CanonicalEasyTTrip;
  authoredFrom: CanonicalEasyTTrip;
  projectionOnly?: { acceptedRevision: number; inputRevision: number };
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
export type BuilderCommandReceipt = {
  sequence: number; rawInputEpoch: number; ownerId: string | null; tripId: string; acceptedRevision: number;
  handle: TripRecoveryHandle; trip: CanonicalEasyTTrip; committedDraft: BuilderInputDraft;
};
type CommandDisposition = 'issued' | 'reserved' | 'accepted' | 'retired' | 'refused' | 'uncertain';
type CommandRecord = { sequence: number; rawInputEpoch: number; disposition: CommandDisposition;
  receipt?: BuilderCommandReceipt; done: Promise<void>; finish(): void };
export type BuilderCommandBarrier = {
  readonly sequence: number; readonly rawInputEpoch: number;
  isCurrent(): boolean;
  wait(): Promise<{ ok: true; trip: CanonicalEasyTTrip; recovery: TripRecoveryHandle | null; acceptedRevision: number }
    | { ok: false; disposition: 'retired' | 'refused' | 'uncertain' }>;
};
type SaveJob = { trip: CanonicalEasyTTrip; localTrip: CanonicalEasyTTrip; handle: TripRecoveryHandle; acceptedRevision: number;
  authoredFrom?: CanonicalEasyTTrip; submitted?: CanonicalEasyTTrip };
class BuilderPromotionStorageError extends Error {}

/** Ready barrier plus device-first acceptance. The callback verifies the paired canonical/input operation. */
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
  let inputRevision = draft.inputRevision, acceptedRevision = 0, rawInputEpoch = 0;
  let disposed = false, draftNeedsWrite = false;
  let recovery: TripRecoveryHandle | null = initialRecovery
    ? { ownerId, tripId, writeId: initialRecovery.writeId, ...(initialRecovery.backend ? { backend: initialRecovery.backend } : {}) } : null;
  let recoverySource = initialRecovery ? structuredClone(trip) : null;
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
  let commandSequence = 0, lastCommand: CommandRecord | null = null;
  const issuedCommands = new Set<CommandRecord>();
  // Session-local field intent distinguishes unrelated typing from a newer edit
  // to the discard target, including changing away and back to identical bytes.
  const rawFieldEpochs = new Map<string, number>();
  const rawFieldKey = (binding: BuilderInputBinding) => JSON.stringify(Object.entries(binding).sort(([left], [right]) => left.localeCompare(right)));
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
  function ownedSourceGuard(): BuilderAsyncOperationGuard {
    const source = freeze(structuredClone(trip)), handle = freeze(structuredClone(recovery)), accepted = acceptedRevision;
    return { isCurrent: () => active() && acceptedRevision === accepted && exact(trip, source) && exact(recovery, handle) };
  }
  function operationGuard(): BuilderAsyncOperationGuard {
    const owned = ownedSourceGuard(), revision = inputRevision;
    return { isCurrent: () => inputRevision === revision && owned.isCurrent() };
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
      projectionOnly?: boolean; advanceRevision?: boolean; authoredFrom?: CanonicalEasyTTrip; command?: CommandRecord; committed?(): void;
    }): Promise<boolean> {
    const frozen = freeze(requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(candidate)))));
    const metadataSource = { ...(continuation?.projectionOnly ? { projectionOnly: { acceptedRevision, inputRevision } } : {}), ownerId, ...(recovery ? { replace: structuredClone(recovery) } : {}),
      accountSavePending: ownerId !== null && !paused && !historicalRecovery && (candidate.ownerId !== null || promoting),
      state: pauseReason ?? 'pending', draft: structuredClone(nextDraft), canonicalBase: structuredClone(canonicalBase),
      expectedRecoverySource: recoverySource ? structuredClone(recoverySource) : undefined,
      authoredFrom: structuredClone(continuation?.authoredFrom ?? lastEnqueuedTrip ?? canonicalBase) };
    return runDevice(true, async () => {
      if (!guard.isCurrent() || draftProtected) {
        if (continuation?.command) continuation.command.disposition = 'retired';
        return false;
      }
      if (continuation?.command) continuation.command.disposition = 'reserved';
      // Reservation precedes the async callback: new raw intent can retire
      // queued work, but cannot imply rollback once this exact operation starts.
      // Identity/promotion continuations retain their stricter existing guard.
      const reserved = continuation?.committed ? guard : ownedSourceGuard(), reservedEpoch = rawInputEpoch;
      const metadata = freeze({ ...metadataSource, isCurrent: reserved.isCurrent });
      let result: TripRecoveryWriteResult;
      try { result = await options.saveRecovery(frozen, metadata); }
      catch {
        if (continuation?.command) continuation.command.disposition = 'uncertain';
        if (reserved.isCurrent()) { reportPersistenceOutcome('builder-edit', { stored: false }); saveFailure('unknown', 'This edit could not be accepted. Your current trip remains unchanged.', 'unknown'); }
        return false;
      }
      if (!reserved.isCurrent()) {
        if (continuation?.command) continuation.command.disposition = 'uncertain';
        return false;
      }
      // Deferral did not issue a write: keep the accepted trip/handle and account job.
      if (continuation?.projectionOnly && result.projectionDeferred && !result.stored && result.writeAttempted === false) return false;
      reportPersistenceOutcome('builder-edit', result);
      if (!result.stored || result.handle.ownerId !== ownerId || result.handle.tripId !== tripId || !result.handle.writeId
        || result.recoveryDurable === false || result.readbackConfirmed === false || result.pointerAcknowledged === false) {
        if (continuation?.command) continuation.command.disposition = result.writeAttempted === false ? 'refused' : 'uncertain';
        const scopeMatches = result.handle.ownerId === ownerId && result.handle.tripId === tripId;
        if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected', 'Another device recovery is protected. Reopen it before editing.', 'protected-conflict');
        else if (scopeMatches && result.failureReason === 'device-unavailable') saveFailure('storage', 'This edit could not be saved on this device. Your current trip remains unchanged.', recoveryPersistenceOutcome(result));
        else saveFailure('unknown', 'This edit could not be accepted. Your current trip remains unchanged.', recoveryPersistenceOutcome({ ...result, stored: false }));
        return false;
      }
      recovery = structuredClone(result.handle); recoverySource = structuredClone(frozen); trip = structuredClone(frozen);
      if (continuation?.advanceRevision !== false) acceptedRevision++;
      if (rawInputEpoch === reservedEpoch) {
        draft = structuredClone(metadata.draft); draftNeedsWrite = false;
      } else {
        // The paired commit retained its frozen input. Newer raw bytes remain
        // independent and must outrank that committed input's numeric revision.
        draft = { ...rebindBuilderInputDraft(draft, trip, ownerId),
          inputRevision: Math.max(draft.inputRevision, metadata.draft.inputRevision) + 1 };
        draftNeedsWrite = true;
      }
      inputRevision = draft.inputRevision;
      pending = { trip: structuredClone(trip), localTrip: structuredClone(trip), handle: structuredClone(recovery), acceptedRevision,
        authoredFrom: structuredClone(metadata.authoredFrom) };
      canonicalSaveState = 'local';
      if (!paused && !error?.deviceOutcome) error = null;
      if (continuation?.command) {
        continuation.command.disposition = 'accepted';
        continuation.command.receipt = freeze({ sequence: continuation.command.sequence, rawInputEpoch: continuation.command.rawInputEpoch,
          ownerId, tripId, acceptedRevision, handle: structuredClone(recovery), trip: structuredClone(trip), committedDraft: structuredClone(metadata.draft) });
      }
      continuation?.committed?.();
      return true;
    });
  }
  async function writeDraft(nextDraft = draft, nextTrip = trip, guard = operationGuard(), install = false, latestEpoch?: number, discard?: BuilderInputBinding): Promise<boolean> {
    let frozenDraft = freeze(structuredClone(nextDraft)), frozenTrip = freeze(structuredClone(nextTrip));
    return runDevice(false, async () => {
      if (latestEpoch !== undefined) {
        if (!active() || rawInputEpoch !== latestEpoch) return false;
        // Resolve the canonical basis at execution, after any preceding owned
        // commit. Do not enqueue a guard tied to its superseded predecessor.
        frozenDraft = freeze(structuredClone(discard ? discardBuilderInputDraftField(draft, discard, draft.inputRevision) : draft));
        frozenTrip = freeze(structuredClone(trip)); guard = ownedSourceGuard();
      }
      if (!guard.isCurrent() || draftProtected) return false;
      const discardFieldEpoch = discard ? rawFieldEpochs.get(rawFieldKey(discard)) : undefined;
      let result: ReturnType<typeof writeBuilderInputDraft>;
      try { result = await options.writeDraft(frozenTrip, frozenDraft, ownerId, guard); }
      catch { result = { ok: false, reason: 'storage' }; }
      if (!guard.isCurrent()) return false;
      if (!result.ok) {
        if (!install) draftNeedsWrite = true;
        saveFailure(result.reason === 'protected' ? 'protected' : 'storage', 'The input draft is still in memory and could not be saved on this device.'); return false;
      }
      if (install && (latestEpoch === undefined || rawInputEpoch === latestEpoch)) {
        draft = structuredClone(frozenDraft); inputRevision = draft.inputRevision;
      } else if (install && rawInputEpoch !== latestEpoch) {
        // Keep a verified discard for an unchanged target. Newer input in that
        // field (even an ABA edit) supersedes it; unrelated fields stay intact.
        const retained = discard && rawFieldEpochs.get(rawFieldKey(discard)) === discardFieldEpoch
          ? discardBuilderInputDraftField(draft, discard, draft.inputRevision) : draft;
        draft = { ...retained, inputRevision: Math.max(retained.inputRevision, frozenDraft.inputRevision) + 1 };
        inputRevision = draft.inputRevision; draftNeedsWrite = true;
      }
      if (latestEpoch === undefined || rawInputEpoch === latestEpoch && inputRevision === frozenDraft.inputRevision) draftNeedsWrite = false;
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
            if (!recovery) recoverySource = null;
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
        if (!recovery) recoverySource = null;
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
  // Generated day notes cannot enter this route-only persistence path. Do not
  // let their provider requests delay the leg results this session can retain.
  const pendingRouteUnits = () => pendingBuilderReconciliationUnits(trip).filter(unit => unit.kind !== 'recommendation');
  function scheduleWork() {
    cancelWork?.(); workAbort?.abort(); workAbort = null; work = null;
    if (!active() || draftProtected || devicePending || !pendingRouteUnits().length) return;
    cancelWork = options.schedule(() => { cancelWork = null; void resumeNecessaryWork(); }, 0);
  }
  async function resumeNecessaryWork() {
    if (!active() || draftProtected || devicePending || work) return;
    const dispatched = pendingRouteUnits();
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
      // Generated day notes remain outside native projection-only eligibility.
      // Keep their units pending while independently validated route work advances.
      const routeResponse = { ...response, results: response.results.filter(unit => unit.kind !== 'recommendation'), recommendationProjections: undefined };
      const merged = mergeBuilderProjectionResponse(trip, routeResponse, request);
      if (!merged.ok || exact(trip, merged.trip)) return;
      const assessments = request.dispatched.filter(unit => unit.kind === 'leg' && response.legs.some(leg => leg.id === unit.targetId))
        .flatMap(unit => { const state = transferAssessmentForLeg(response.assessments, unit.targetId); return state ? [{ legId: unit.targetId, state }] : []; });
      const before = structuredClone(trip), nextDraft = rebindBuilderInputDraft(draft, merged.trip, ownerId);
      if (!await storeCanonical(merged.trip, before, nextDraft, operationGuard(), { projectionOnly: true }) || !current()) return;
      const retained = assessmentFeedback?.inputKey === request.inputKey ? assessmentFeedback.assessments.filter(item => !request.dispatched.some(unit => unit.kind === 'leg' && unit.targetId === item.legId)) : [];
      assessmentFeedback = { inputKey: request.inputKey, assessments: [...retained, ...assessments] };
      continued = true; scheduleCloud(); publish();
    } catch {
      if (!current()) return;
      const failed = mergeBuilderProjectionResponse(trip, { ...request, results: dispatched.map(unit => ({ ...unit, phase: 'failed', reason: 'unavailable' })), legs: [] }, request);
      if (failed.ok && await storeCanonical(failed.trip, structuredClone(trip), rebindBuilderInputDraft(draft, failed.trip, ownerId), operationGuard(), { projectionOnly: true }) && current()) {
        continued = true; scheduleCloud(); publish();
      }
    } finally { if (work === request) { work = null; workAbort = null; if (continued) scheduleWork(); } }
  }
  async function performAcceptedEdits(edits: readonly BuilderAcceptedEdit[], expectedInputRevision: number,
    acceptedInputs: readonly { binding: BuilderInputBinding; raw: string }[] | undefined, command: CommandRecord) {
    if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };
    // A preceding projection may change the canonical handle without changing
    // traveller input. Wait for its readback, then recheck the submitted revision.
    const assessedSource = edits.some(edit => edit.kind === 'build-status') ? structuredClone(trip) : null;
    if (devicePending && !await awaitDeviceWrites()) return { ok: false as const, reason: 'stale-source' as const };
    if (assessedSource && !exact(assessedSource, trip)) return { ok: false as const, reason: 'stale-source' as const };
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
    if (!await storeCanonical(candidate, structuredClone(trip), nextDraft, guard, { command })) {
      return { ok: false as const, reason: guard.isCurrent() ? 'storage' as const : 'stale-source' as const };
    }
    if (!paused) error = null;
    else if (error?.deviceOutcome) error = { category: pauseReason ?? 'unknown', message: 'This change is saved on this device. Account sync needs attention.' };
    assessmentFeedback = null;
    scheduleCloud(); scheduleWork(); publish(); return { ok: true as const, trip: command.receipt!.trip, receipt: command.receipt!, releasedNights: prepared.releasedNights };
  }
  function acceptEdits(edits: readonly BuilderAcceptedEdit[], expectedInputRevision: number,
    acceptedInputs?: readonly { binding: BuilderInputBinding; raw: string }[]) {
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    const command: CommandRecord = { sequence: ++commandSequence, rawInputEpoch, disposition: 'issued', done, finish };
    issuedCommands.add(command); lastCommand = command;
    return performAcceptedEdits(edits, expectedInputRevision, acceptedInputs, command).then(result => {
      if (command.disposition === 'issued') command.disposition = !result.ok && result.reason === 'stale-source' ? 'retired' : 'refused';
      return result;
    }, cause => { command.disposition = command.disposition === 'reserved' ? 'uncertain' : 'refused'; throw cause; })
      .finally(() => { issuedCommands.delete(command); command.finish(); });
  }
  function captureCommandBarrier(): BuilderCommandBarrier {
    const sequence = commandSequence, epoch = rawInputEpoch, precedingDevice = deviceTail;
    const commands = [...issuedCommands];
    if (lastCommand && lastCommand.disposition !== 'retired' && !commands.includes(lastCommand)) commands.push(lastCommand);
    const isCurrent = () => active() && commandSequence === sequence && rawInputEpoch === epoch;
    return Object.freeze({ sequence, rawInputEpoch: epoch, isCurrent,
      async wait() {
        await Promise.all([precedingDevice, ...commands.map(command => command.done)]);
        if (!isCurrent()) return { ok: false as const, disposition: 'retired' as const };
        const failed = commands.find(command => command.disposition !== 'accepted');
        // The barrier grants no account authority. Preserve the existing
        // explicit promotion path; flush({promoteOwnerless:true}) still owns it.
        const pendingPromotion = historicalRecovery && trip.ownerId === null && ownerId !== null
          && pauseReason === 'pending' && error?.category === 'pending';
        if (failed || error && !pendingPromotion || draftNeedsWrite) return { ok: false as const,
          disposition: failed?.disposition === 'uncertain' ? 'uncertain' as const : 'refused' as const };
        return { ok: true as const, trip: snapshot.trip, recovery: snapshot.recovery, acceptedRevision: snapshot.acceptedRevision };
      },
    });
  }
  function isCommandReceiptCurrent(receipt: BuilderCommandReceipt) {
    return active() && receipt.sequence === commandSequence && receipt.rawInputEpoch === rawInputEpoch
      && receipt.ownerId === ownerId && receipt.tripId === tripId && receipt.acceptedRevision === acceptedRevision
      && exact(receipt.handle, recovery) && exact(receipt.trip, trip);
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
      draft = next; inputRevision = draft.inputRevision; rawInputEpoch++; draftNeedsWrite = true;
      rawFieldEpochs.set(rawFieldKey(patch.binding), rawInputEpoch);
      scheduleWork(); publish();
      const stored = await writeDraft(undefined, undefined, undefined, false, rawInputEpoch);
      if (active()) { scheduleWork(); if (stored) scheduleCloud(); publish(); } return stored;
    },
    async accept(edit: BuilderAcceptedEdit, expectedInputRevision: number, acceptedInput?: { binding: BuilderInputBinding; raw: string }) {
      return acceptEdits([edit], expectedInputRevision, acceptedInput ? [acceptedInput] : undefined);
    },
    acceptBatch: acceptEdits,
    waitForDeviceWrites: awaitDeviceWrites,
    captureCommandBarrier, isCommandReceiptCurrent,
    resumeNecessaryWork,
    async discardDraft(binding: BuilderInputBinding) {
      if (!active() || draftProtected) return false;
      const next = discardBuilderInputDraftField(draft, binding, draft.inputRevision);
      if (!exact(next, draft)) rawInputEpoch++;
      const stored = await writeDraft(next, trip, operationGuard(), true, rawInputEpoch, binding);
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
