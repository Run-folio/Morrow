import {
  homepageHandoffReceiptForOwner,
  homepageSemanticInputFingerprint,
  pendingIntakeReceiptForOwner,
  pendingHomepageHandoffForOwner,
  type HomeTripDraft,
  type PendingHomeTripHandoff,
  type HomepageInputSnapshot,
  type StoredHomepageInput,
} from "../../../lib/easyt/home-trip-handoff.ts";

export type NewTripEntryStateInput = {
  hydrated: boolean;
  sessionPending?: boolean;
  ownerId: string | null;
  trip?: string | null;
  recover?: string | null;
  homeDraft?: boolean;
  handoff?: string | null;
  inspire?: string | null;
  currentDraftTripId?: string | null;
  storedInput?: StoredHomepageInput | null;
  draft?: HomeTripDraft | PendingHomeTripHandoff | null;
  reservedTripId?: string | null;
  hasBuilderContext?: boolean;
  savedLibraryTripId?: string | null;
};

export type NewTripEntryState = {
  kind: "loading" | "explicit-trip" | "current-draft" | "home-handoff" | "pending-home-handoff" | "pending-direct-intake" | "route-handoff" | "populated-builder" | "fresh" | "unavailable";
  tripId?: string;
  snapshot?: HomepageInputSnapshot;
  receipt?: never;
};

/** Completed legacy receipts cannot prove an edit; duplicate prevention wins. */
export function resumableNewTripSnapshot(stored: StoredHomepageInput | null): HomepageInputSnapshot | null {
  if (!stored) return null;
  if (!stored.receipt) return stored.snapshot;
  if (stored.receipt.version === 2) return stored.receipt.frozenSnapshot;
  if (!stored.receipt.semanticInputFingerprint) return null;
  return stored.receipt.semanticInputFingerprint === homepageSemanticInputFingerprint(stored.snapshot)
    ? null : stored.snapshot;
}

/** Pure gate. Storage/repository reads and canonical application stay in Builder. */
export function resolveNewTripEntryState(input: NewTripEntryStateInput): NewTripEntryState {
  if (!input.hydrated || input.sessionPending) return { kind: "loading" };
  if (input.trip || input.recover) return { kind: "explicit-trip", tripId: input.trip ?? input.recover ?? undefined };
  if (!input.homeDraft && !input.inspire && input.currentDraftTripId) return { kind: "current-draft", tripId: input.currentDraftTripId };
  if (input.homeDraft) {
    const stored = input.storedInput;
    if (!stored?.receipt || stored.snapshot.ownerId !== input.ownerId
      || !input.handoff || stored.receipt.handoffId !== input.handoff) return { kind: "unavailable" };
    const pendingEnvelope = input.draft && pendingHomepageHandoffForOwner(input.draft, input.ownerId, input.handoff);
    // Recovery is canonical if it already contains the reserved trip. A crash
    // can occur after receipt completion but before clearing the v2 envelope.
    if (pendingEnvelope && stored.receipt.version === 1
      && input.reservedTripId === pendingEnvelope.tripId
      && stored.receipt.ownerId === input.ownerId
      && stored.receipt.tripId === pendingEnvelope.tripId
      && stored.receipt.semanticInputFingerprint === pendingEnvelope.semanticInputFingerprint)
      return { kind: "explicit-trip", tripId: pendingEnvelope.tripId };
    if (stored.receipt.version === 2) {
      const storedPending = pendingIntakeReceiptForOwner(stored.receipt, input.ownerId);
      const draftPending = pendingEnvelope;
      if (input.reservedTripId === storedPending?.tripId) return { kind: "explicit-trip", tripId: input.reservedTripId };
      if (!storedPending || !draftPending || input.reservedTripId
        || storedPending.tripId !== draftPending.tripId
        || storedPending.inputRevision !== draftPending.inputRevision
        || storedPending.semanticInputFingerprint !== draftPending.semanticInputFingerprint)
        return { kind: "unavailable" };
      return { kind: "pending-home-handoff", tripId: storedPending.tripId, snapshot: storedPending.frozenSnapshot };
    }
    const receipt = input.draft && !('version' in input.draft)
      ? homepageHandoffReceiptForOwner(input.draft, input.ownerId) : null;
    if (!input.draft && input.reservedTripId === stored.receipt.tripId) {
      return { kind: "explicit-trip", tripId: input.reservedTripId };
    }
    if (!receipt || stored.receipt.handoffId !== receipt.handoffId
      || stored.receipt.tripId !== receipt.tripId
      || stored.receipt.inputFingerprint !== receipt.inputFingerprint
      || stored.receipt.semanticInputFingerprint !== receipt.semanticInputFingerprint) return { kind: "unavailable" };
    if (input.reservedTripId === receipt.tripId) return { kind: "explicit-trip", tripId: receipt.tripId };
    if (input.reservedTripId) return { kind: "unavailable" };
    return { kind: "home-handoff", tripId: receipt.tripId };
  }
  if (input.inspire) return { kind: "route-handoff" };
  if (input.hasBuilderContext) return { kind: "populated-builder" };
  const stored = input.storedInput?.snapshot.ownerId === input.ownerId ? input.storedInput : null;
  const pending = stored?.receipt && pendingIntakeReceiptForOwner(stored.receipt, input.ownerId);
  if (pending) return { kind: "pending-direct-intake", tripId: pending.tripId, snapshot: pending.frozenSnapshot };
  return { kind: "fresh", snapshot: resumableNewTripSnapshot(stored) ?? undefined };
}
