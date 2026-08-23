import type { EasyTTrip } from "./trip";

export type TripPromotionConflictReason =
  | "cloud-newer"
  | "cloud-different"
  | "cloud-deleted";

export type ExistingTripPromotionDecision =
  | { outcome: "already-canonical" }
  | { outcome: "conflict"; conflictReason: TripPromotionConflictReason };

/** An unclaimed browser draft may be claimed; an owned draft may only return to its owner. */
export function canPromoteTripForOwner(
  trip: Pick<EasyTTrip, "ownerId">,
  ownerId: string,
) {
  return !trip.ownerId || trip.ownerId === ownerId;
}

export function requestTripPromotion(
  trip: EasyTTrip,
  request: typeof fetch = fetch,
) {
  return request(`/api/easyt/trips/${encodeURIComponent(trip.id)}/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(trip),
  });
}

export function tripPromotionConflictReason(
  localTrip: Pick<EasyTTrip, "updatedAt">,
  cloudTrip: Pick<EasyTTrip, "updatedAt">,
  cloudDeleted = false,
): TripPromotionConflictReason {
  if (cloudDeleted) return "cloud-deleted";
  const localUpdatedAt = Date.parse(localTrip.updatedAt);
  const cloudUpdatedAt = Date.parse(cloudTrip.updatedAt);
  return Number.isFinite(cloudUpdatedAt)
    && (!Number.isFinite(localUpdatedAt) || cloudUpdatedAt > localUpdatedAt)
    ? "cloud-newer"
    : "cloud-different";
}

export function decideExistingTripPromotion(
  localTrip: Pick<EasyTTrip, "updatedAt">,
  cloudTrip: Pick<EasyTTrip, "updatedAt">,
  options: { exactMatch: boolean; cloudDeleted?: boolean },
): ExistingTripPromotionDecision {
  if (options.exactMatch && !options.cloudDeleted) {
    return { outcome: "already-canonical" };
  }
  return {
    outcome: "conflict",
    conflictReason: tripPromotionConflictReason(localTrip, cloudTrip, options.cloudDeleted),
  };
}

/**
 * Apply the repository's canonical owner and globally-safe stop IDs without
 * changing the trip's ID or edit timestamp. Promotion uses this stable form so
 * retrying the same browser document is an exact, idempotent operation.
 */
export function canonicalTripForOwner(
  ownerId: string,
  trip: EasyTTrip,
  updatedAt = trip.updatedAt,
): EasyTTrip {
  const stopPrefix = `${trip.id}-stop-`;
  const stopIds = new Map(
    trip.stops.map((stop) => [
      stop.id,
      stop.id.startsWith(stopPrefix) ? stop.id : `${stopPrefix}${stop.id}`,
    ]),
  );

  return {
    ...trip,
    ownerId,
    brief: {
      ...trip.brief,
      selectedPlaces: Object.fromEntries(
        Object.entries(trip.brief.selectedPlaces).map(([stopId, places]) => [
          stopIds.get(stopId) ?? stopId,
          places,
        ]),
      ),
      structuredBrief: trip.brief.structuredBrief ? {
        ...trip.brief.structuredBrief,
        destinations: trip.brief.structuredBrief.destinations.map((destination) => ({
          ...destination,
          id: destination.id ? (stopIds.get(destination.id) ?? destination.id) : undefined,
        })),
        mustVisit: trip.brief.structuredBrief.mustVisit.map((destination) => ({
          ...destination,
          id: destination.id ? (stopIds.get(destination.id) ?? destination.id) : undefined,
        })),
        placeSelections: trip.brief.structuredBrief.placeSelections?.map((selection) => ({
          ...selection,
          routeStopId: selection.routeStopId ? (stopIds.get(selection.routeStopId) ?? selection.routeStopId) : undefined,
        })),
      } : undefined,
    },
    stops: trip.stops.map((stop) => ({
      ...stop,
      id: stopIds.get(stop.id) ?? stop.id,
    })),
    legs: trip.legs.map((leg) => ({
      ...leg,
      fromStopId: stopIds.get(leg.fromStopId) ?? leg.fromStopId,
      toStopId: stopIds.get(leg.toStopId) ?? leg.toStopId,
    })),
    planItems: trip.planItems.map((item) => ({
      ...item,
      stopId: stopIds.get(item.stopId) ?? item.stopId,
    })),
    updatedAt,
  };
}
