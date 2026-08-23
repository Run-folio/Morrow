import { EasyTTrip, isEasyTTrip } from "./trip";
import {
  EasyTTripSaveConflictError,
  requestTripUpdate,
  type TripSaveConflictReason,
} from "./trip-continuity";
import { requestedTripMatch } from "./trip-id-resolution";
import { requestTripPromotion, type TripPromotionConflictReason } from "./trip-promotion";

export { EasyTTripSaveConflictError } from "./trip-continuity";

export const EASYT_ACTIVE_TRIP_KEY = "easyt:active-trip:v1";
export const EASYT_ACTIVE_TRIP_CHANGE_EVENT = "easyt-active-trip-change";
const LEGACY_JOURNEY_PLAN_KEY = "journey:planned-trip";

export function loadActiveTrip(): EasyTTrip | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EASYT_ACTIVE_TRIP_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isEasyTTrip(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveActiveTrip(trip: EasyTTrip) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EASYT_ACTIVE_TRIP_KEY, JSON.stringify(trip));
  // `storage` does not fire in the tab that made the change. The workspace
  // shell listens to this same-document signal so sibling views receive the
  // canonical active document after supported planner edits.
  window.dispatchEvent(new CustomEvent(EASYT_ACTIVE_TRIP_CHANGE_EVENT, { detail: trip }));
}

export async function saveTripToEasyT(trip: EasyTTrip): Promise<EasyTTrip> {
  if (!trip.ownerId) return (await promoteTripToEasyT(trip)).trip;
  const response = await requestTripUpdate(trip);
  const payload = await response.json().catch(() => null) as {
    trip?: unknown;
    conflictReason?: TripSaveConflictReason;
    error?: string;
  } | null;
  if (response.status === 409 && payload && isEasyTTrip(payload.trip) && payload.conflictReason) {
    throw new EasyTTripSaveConflictError(
      payload.error || "This trip changed in the cloud.",
      payload.trip,
      payload.conflictReason,
    );
  }
  // An owned device copy may outlive a failed initial sync. A genuinely
  // missing row can safely retry through the existing insert-only boundary;
  // deleted and changed rows return 409 above and are never recreated here.
  if (response.status === 404) return (await promoteTripToEasyT(trip)).trip;
  if (!response.ok) {
    throw new Error(payload?.error || "Morrovia cloud save failed.");
  }
  if (!payload || !isEasyTTrip(payload.trip)) throw new Error("Morrovia cloud returned an invalid trip.");
  return payload.trip;
}

export type EasyTTripPromotion = {
  trip: EasyTTrip;
  outcome: "promoted" | "already-canonical";
};

export class EasyTTripPromotionConflictError extends Error {
  readonly canonicalTrip: EasyTTrip;
  readonly reason: TripPromotionConflictReason;

  constructor(message: string, canonicalTrip: EasyTTrip, reason: TripPromotionConflictReason) {
    super(message);
    this.name = "EasyTTripPromotionConflictError";
    this.canonicalTrip = canonicalTrip;
    this.reason = reason;
  }
}

/** Insert-only local-to-cloud boundary. Existing cloud state is never updated. */
export async function promoteTripToEasyT(trip: EasyTTrip): Promise<EasyTTripPromotion> {
  const response = await requestTripPromotion(trip);
  const payload = await response.json().catch(() => null) as {
    trip?: unknown;
    outcome?: "promoted" | "already-canonical" | "conflict";
    conflictReason?: TripPromotionConflictReason;
    error?: string;
  } | null;

  if (response.status === 409 && payload && isEasyTTrip(payload.trip) && payload.conflictReason) {
    throw new EasyTTripPromotionConflictError(
      payload.error || "A cloud copy already exists.",
      payload.trip,
      payload.conflictReason,
    );
  }
  if (!response.ok || !payload || !isEasyTTrip(payload.trip)
    || (payload.outcome !== "promoted" && payload.outcome !== "already-canonical")) {
    throw new Error(payload?.error || "Morrovia cloud sync failed. Your trip is still saved on this device.");
  }
  return { trip: payload.trip, outcome: payload.outcome };
}

export async function loadTripFromEasyT(tripId: string): Promise<EasyTTrip | null> {
  const response = await fetch(`/api/easyt/trips/${encodeURIComponent(tripId)}`, { cache: "no-store" });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error("Morrovia cloud load failed.");
  const payload = await response.json() as { trip: EasyTTrip };
  return isEasyTTrip(payload.trip) ? payload.trip : null;
}

/**
 * Resolve a trip opened by URL using the same cloud-first, active-trip fallback
 * used by the legacy planner. Newly-shaped trips exist locally until the
 * account migration/save completes, while persisted trips remain owner-checked
 * by the API above.
 */
export async function loadRequestedTrip(tripId: string, ownerId?: string): Promise<EasyTTrip | null> {
  try {
    const cloudTrip = await loadTripFromEasyT(tripId);
    if (cloudTrip) return cloudTrip;
  } catch {
    // The exact active local document remains usable if cloud loading is
    // temporarily unavailable, matching the established planner behaviour.
  }

  return requestedTripMatch(tripId, loadActiveTrip(), ownerId);
}

/** @deprecated New Map Plans read the canonical EasyT document directly. */
export function saveJourneyPlanBridge(trip: EasyTTrip) {
  if (typeof window === "undefined") return;
  const duration = Math.max(1, Math.round((+new Date(`${trip.endDate}T00:00:00`) - +new Date(`${trip.startDate}T00:00:00`)) / 86400000) + 1);
  const pickDetails = Object.fromEntries(trip.stops.map((stop) => [
    stop.id,
    trip.planItems
      .filter((item) => item.stopId === stop.id && item.type === "activity")
      .map((item) => ({
        id: item.id,
        title: item.title,
        area: stop.name,
        type: "Activity",
        duration: "Flexible",
        description: item.reason,
        country: stop.country,
      })),
  ]));
  const brief = {
    origin: trip.brief.origin,
    destinations: trip.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      country: stop.country,
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
      kind: "place",
    })),
    startDate: trip.startDate,
    duration: String(duration),
    travellers: String(trip.travellers),
    interests: [],
    picks: trip.brief.selectedPlaces,
    pickDetails,
  };
  window.localStorage.setItem(LEGACY_JOURNEY_PLAN_KEY, JSON.stringify({ brief }));
}

export function clearActiveTrip() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(EASYT_ACTIVE_TRIP_KEY);
}
