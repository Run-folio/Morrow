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

export function safeJourneyReturnTarget(target: string | null | undefined) {
  if (!target
    || !target.startsWith("/")
    || target.startsWith("//")
    || target.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(target)) {
    return "/journey/dashboard";
  }
  try {
    const resolved = new URL(target, "https://morrovia.invalid");
    if (resolved.origin !== "https://morrovia.invalid"
      || (resolved.pathname !== "/journey" && !resolved.pathname.startsWith("/journey/"))) {
      return "/journey/dashboard";
    }
    return target;
  } catch {
    return "/journey/dashboard";
  }
}

export function journeyReauthenticationPath(target: string | null | undefined) {
  return `/journey/login?next=${encodeURIComponent(safeJourneyReturnTarget(target))}`;
}

export function googleSignInErrorPath(target: string | null | undefined) {
  const search = new URLSearchParams({
    next: safeJourneyReturnTarget(target),
    oauth: "google",
  });
  return `/journey/login?${search.toString()}`;
}

export function conflictHasCloudCopy(reason: TripSaveConflictReason | "cloud-newer" | "cloud-different" | undefined) {
  return reason !== "cloud-deleted";
}

/** Shared conflict actions keep the cloud and device destinations distinct. */
export function tripConflictResolutionActions(tripId: string) {
  return {
    cloudHref: `/journey/${encodeURIComponent(tripId)}`,
    deviceHref: tripSyncRecoveryPath(tripId),
    openCloudLabel: "Open cloud copy",
    openDeviceLabel: "Open device copy",
    discardDeviceLabel: "Discard device copy",
  } as const;
}

export type TripEditorSyncAction = "reload-cloud" | "open-device" | "sign-in" | "retry";

/**
 * A separately preserved recovery is not part of the authoritative cloud
 * document and therefore cannot make a cloud-bound co-pilot preview stale.
 * Active editor changes, conflicts and interrupted authentication still block
 * Apply before the server's revision/hash checks run.
 */
export function canApplyCanonicalCopilotChange({
  hasUnsavedChanges,
  hasCloudConflict,
  hasDeviceRecoveryIssue,
  cloudCopyHasPreservedRecovery,
  authInterrupted,
}: {
  hasUnsavedChanges: boolean;
  hasCloudConflict: boolean;
  hasDeviceRecoveryIssue: boolean;
  cloudCopyHasPreservedRecovery: boolean;
  authInterrupted: boolean;
}) {
  return !hasUnsavedChanges
    && !hasCloudConflict
    && !authInterrupted
    && (!hasDeviceRecoveryIssue || cloudCopyHasPreservedRecovery);
}

/** An unresolved cloud conflict remains the primary resolution after local edits. */
export function tripEditorSyncAction({
  hasCloudConflict,
  hasDeviceRecoveryIssue,
  authInterrupted,
}: {
  hasCloudConflict: boolean;
  hasDeviceRecoveryIssue: boolean;
  authInterrupted: boolean;
}): TripEditorSyncAction {
  if (hasCloudConflict) return "reload-cloud";
  if (hasDeviceRecoveryIssue) return "open-device";
  if (authInterrupted) return "sign-in";
  return "retry";
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

/**
 * Clean-cache replacement is deliberately narrower than repository CAS.
 * Canonical revisions emitted by Morrovia are monotonic ISO timestamps; an
 * equal revision is an idempotent refresh, a later one may advance the cache,
 * and an older or non-orderable different token fails closed. Repository
 * updates still treat the token as opaque and require exact equality.
 */
export function canonicalTripRevisionCanReplace(
  current: Pick<EasyTTrip, "id" | "ownerId" | "updatedAt">,
  incoming: Pick<EasyTTrip, "id" | "ownerId" | "updatedAt">,
) {
  if (current.id !== incoming.id || current.ownerId !== incoming.ownerId) return false;
  if (current.updatedAt === incoming.updatedAt) return true;
  const currentRevision = Date.parse(current.updatedAt);
  const incomingRevision = Date.parse(incoming.updatedAt);
  return Number.isFinite(currentRevision)
    && Number.isFinite(incomingRevision)
    && incomingRevision > currentRevision;
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
