import type { EasyTTrip } from "./trip.ts";
import type { TripRecoveryHandle, TripRecoveryRecord } from "./storage.ts";
import { tripBuildDocumentsCanonicalEquivalent } from "./trip-promotion.ts";

/** In-memory retry pointer only; the existing recovery record remains canonical. */
export type PendingSpreadsheetImportSubmission = {
  reviewedInputKey: string;
  ownerId: string;
  trip: EasyTTrip;
  handle: TripRecoveryHandle;
};

export function pendingSpreadsheetImportForRetry(
  pending: PendingSpreadsheetImportSubmission | null,
  input: { reviewedInputKey: string; ownerId: string | null; recovery: TripRecoveryRecord | null },
): PendingSpreadsheetImportSubmission | null {
  if (!pending) return null;
  if (pending.ownerId !== input.ownerId) throw new Error("The account changed. Open the existing recovery before importing another trip.");
  if (pending.reviewedInputKey !== input.reviewedInputKey) throw new Error("The reviewed import changed. Open the existing recovery before creating another trip.");
  const { recovery, ownerId } = input;
  if (!ownerId || !recovery
    || recovery.ownerId !== ownerId
    || recovery.tripId !== pending.trip.id
    || recovery.writeId !== pending.handle.writeId
    || !tripBuildDocumentsCanonicalEquivalent(pending.trip, recovery.trip, ownerId)) {
    throw new Error("The reviewed trip recovery changed. Open or resolve it before retrying.");
  }
  return pending;
}
