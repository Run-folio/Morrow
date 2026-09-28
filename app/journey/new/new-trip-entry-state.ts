import {
  homepageHandoffReceiptForOwner,
  homepageSemanticInputFingerprint,
  type HomeTripDraft,
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
  draft?: HomeTripDraft | null;
  reservedTripId?: string | null;
  hasBuilderContext?: boolean;
  savedLibraryTripId?: string | null;
};

export type NewTripEntryState = {
  kind: "loading" | "explicit-trip" | "current-draft" | "home-handoff" | "route-handoff" | "populated-builder" | "fresh" | "unavailable";
  tripId?: string;
  snapshot?: HomepageInputSnapshot;
  receipt?: never;
};

/** Completed legacy receipts cannot prove an edit; duplicate prevention wins. */
export function resumableNewTripSnapshot(stored: StoredHomepageInput | null): HomepageInputSnapshot | null {
  if (!stored) return null;
  if (!stored.receipt) return stored.snapshot;
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
    const receipt = input.draft && homepageHandoffReceiptForOwner(input.draft, input.ownerId);
    const stored = input.storedInput;
    if (!stored?.receipt || stored.snapshot.ownerId !== input.ownerId
      || !input.handoff || stored.receipt.handoffId !== input.handoff) return { kind: "unavailable" };
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
  return { kind: "fresh", snapshot: resumableNewTripSnapshot(stored) ?? undefined };
}
