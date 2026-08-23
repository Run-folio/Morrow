import type { EasyTTrip } from "./trip";

export type TripSaveConflictReason = "cloud-changed" | "cloud-deleted";

export type ExistingTripUpdateDecision =
  | { outcome: "save" }
  | { outcome: "forbidden" }
  | { outcome: "conflict"; conflictReason: TripSaveConflictReason };

export class EasyTTripSaveConflictError extends Error {
  readonly canonicalTrip: EasyTTrip;
  readonly reason: TripSaveConflictReason;

  constructor(message: string, canonicalTrip: EasyTTrip, reason: TripSaveConflictReason) {
    super(message);
    this.name = "EasyTTripSaveConflictError";
    this.canonicalTrip = canonicalTrip;
    this.reason = reason;
  }
}

export class EasyTTripAuthError extends Error {
  constructor(message = "Your Morrovia session expired. Sign in again to sync this trip.") {
    super(message);
    this.name = "EasyTTripAuthError";
  }
}

export function tripSyncAuthError(status: number, message?: string): EasyTTripAuthError | null {
  if (status !== 401) return null;
  return new EasyTTripAuthError(message === "Unauthorized" ? undefined : message);
}

/** Return through the planner so its exact local document can retry safely. */
export function tripSyncRecoveryPath(tripId: string) {
  return `/journey/plan?trip=${encodeURIComponent(tripId)}&save=1&recover=1`;
}

export function tripSyncSignInPath(tripId: string) {
  return `/journey/login?next=${encodeURIComponent(tripSyncRecoveryPath(tripId))}`;
}

/**
 * `updatedAt` is the existing trip document's cloud revision token. Treat it
 * as opaque: an edit may be saved only when it is based on the exact revision
 * currently stored for this owner and canonical trip ID.
 */
export function decideExistingTripUpdate(
  ownerId: string,
  incomingTrip: Pick<EasyTTrip, "id" | "ownerId" | "updatedAt">,
  cloudTrip: Pick<EasyTTrip, "id" | "ownerId" | "updatedAt">,
  cloudDeleted = false,
): ExistingTripUpdateDecision {
  if (incomingTrip.id !== cloudTrip.id
    || incomingTrip.ownerId !== ownerId
    || cloudTrip.ownerId !== ownerId) {
    return { outcome: "forbidden" };
  }
  if (cloudDeleted) {
    return { outcome: "conflict", conflictReason: "cloud-deleted" };
  }
  return incomingTrip.updatedAt === cloudTrip.updatedAt
    ? { outcome: "save" }
    : { outcome: "conflict", conflictReason: "cloud-changed" };
}

/** Always advance the revision, including when a client supplied a future timestamp. */
export function nextTripUpdatedAt(previousUpdatedAt: string, now = new Date()): string {
  const previous = Date.parse(previousUpdatedAt);
  const current = now.getTime();
  return new Date(Number.isFinite(previous) && previous >= current ? previous + 1 : current).toISOString();
}

export function requestTripUpdate(
  trip: EasyTTrip,
  request: typeof fetch = fetch,
) {
  return request(`/api/easyt/trips/${encodeURIComponent(trip.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(trip),
  });
}
