import type { EasyTTrip } from "./trip";

const singleStopReferenceKeys = new Set([
  "stopId", "fromStopId", "toStopId", "neighbouringStopId", "routeStopId",
  "suggestedCutStopId", "fixedStartStopId", "fixedEndStopId",
]);
const manyStopReferenceKeys = new Set([
  "stopIds", "mustSeeStopIds", "optionalStopIds", "currentStopIds",
  "recommendedStopIds", "requiredStopIds", "excludedStopIds",
]);
const stopReferenceRecordKeys = new Set([
  "selectedPlaces", "dayAllocations", "nightAllocations", "arrivalDates",
  "allocations", "durations",
]);

type StopIdMap = ReadonlyMap<string, string>;

function remappedStopId(value: string, stopIds: StopIdMap) {
  return stopIds.get(value) ?? value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** Remap durable stop identities in typed fields and forward-compatible metadata. */
function remapNestedStopReferences(value: unknown, stopIds: StopIdMap, key?: string): unknown {
  if (typeof value === "string" && key && singleStopReferenceKeys.has(key)) {
    return remappedStopId(value, stopIds);
  }
  if (Array.isArray(value)) {
    if (key && manyStopReferenceKeys.has(key)) {
      return value.map((item) => typeof item === "string" ? remappedStopId(item, stopIds) : remapNestedStopReferences(item, stopIds));
    }
    return value.map((item) => remapNestedStopReferences(item, stopIds, key));
  }
  if (!isRecord(value)) return value;

  const remapped: Record<string, unknown> = {};
  const isRouteStopShape = typeof value.id === "string"
    && (key === "stops" || "routeStopId" in value || "canonicalPlaceId" in value || "placeMentionId" in value);
  for (const [childKey, childValue] of Object.entries(value)) {
    if (stopReferenceRecordKeys.has(childKey) && isRecord(childValue)) {
      remapped[childKey] = Object.fromEntries(Object.entries(childValue).map(([recordKey, recordValue]) => [
        remappedStopId(recordKey, stopIds),
        remapNestedStopReferences(recordValue, stopIds),
      ]));
    } else if (childKey === "id" && isRouteStopShape && typeof childValue === "string") {
      remapped[childKey] = remappedStopId(childValue, stopIds);
    } else {
      remapped[childKey] = remapNestedStopReferences(childValue, stopIds, childKey);
    }
  }
  return remapped;
}

/**
 * Single stop-reference boundary for canonicalization and server-side copies.
 * Unknown fields are retained, while known stop-reference field names are
 * remapped recursively to keep durable JSON forward-compatible.
 */
export function remapTripStopReferences(trip: EasyTTrip, stopIds: StopIdMap): EasyTTrip {
  const remapped = remapNestedStopReferences(trip.brief, stopIds) as EasyTTrip["brief"];
  return {
    ...trip,
    brief: remapped,
    stops: trip.stops.map((stop) => ({ ...stop, id: remappedStopId(stop.id, stopIds) })),
    legs: trip.legs.map((leg) => ({
      ...leg,
      fromStopId: remappedStopId(leg.fromStopId, stopIds),
      toStopId: remappedStopId(leg.toStopId, stopIds),
      routeMetadata: remapNestedStopReferences(leg.routeMetadata, stopIds) as Record<string, unknown>,
    })),
    planItems: trip.planItems.map((item) => ({ ...item, stopId: remappedStopId(item.stopId, stopIds) })),
    recommendations: trip.recommendations.map((recommendation) => ({
      ...recommendation,
      proposedChange: remapNestedStopReferences(recommendation.proposedChange, stopIds) as Record<string, unknown> | null,
    })),
  };
}

function collectNestedStopReferences(value: unknown, references: string[], key?: string) {
  if (typeof value === "string" && key && singleStopReferenceKeys.has(key)) {
    references.push(value);
    return;
  }
  if (Array.isArray(value)) {
    if (key && manyStopReferenceKeys.has(key)) {
      references.push(...value.filter((item): item is string => typeof item === "string"));
      return;
    }
    value.forEach((item) => collectNestedStopReferences(item, references, key));
    return;
  }
  if (!isRecord(value)) return;
  const isRouteStopShape = typeof value.id === "string"
    && (key === "stops" || "routeStopId" in value || "canonicalPlaceId" in value || "placeMentionId" in value);
  for (const [childKey, childValue] of Object.entries(value)) {
    if (stopReferenceRecordKeys.has(childKey) && isRecord(childValue)) {
      references.push(...Object.keys(childValue));
      Object.values(childValue).forEach((item) => collectNestedStopReferences(item, references));
    } else if (childKey === "id" && isRouteStopShape && typeof childValue === "string") {
      references.push(childValue);
    } else {
      collectNestedStopReferences(childValue, references, childKey);
    }
  }
}

/** A durable trip must never retain a nested reference to a missing route stop. */
export function tripStopReferenceInvariantIssues(trip: EasyTTrip) {
  const validStopIds = new Set(trip.stops.map((stop) => stop.id));
  const references = [
    ...trip.legs.flatMap((leg) => [leg.fromStopId, leg.toStopId]),
    ...trip.planItems.map((item) => item.stopId),
  ];
  trip.legs.forEach((leg) => collectNestedStopReferences(leg.routeMetadata, references));
  collectNestedStopReferences(trip.brief, references);
  trip.recommendations.forEach((recommendation) => collectNestedStopReferences(recommendation.proposedChange, references));
  return [...new Set(references.filter((stopId) => !validStopIds.has(stopId)))];
}

export type TripPromotionConflictReason =
  | "cloud-newer"
  | "cloud-different"
  | "cloud-deleted";

export type ExistingTripPromotionDecision =
  | { outcome: "already-canonical" }
  | { outcome: "conflict"; conflictReason: TripPromotionConflictReason };

/** Promotion is the insert-only claim boundary, exclusively for ownerless drafts. */
export function canPromoteTripForOwner(
  trip: Pick<EasyTTrip, "ownerId" | "status">,
  _ownerId: string,
) {
  return trip.ownerId === null && trip.status === "draft";
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

  return { ...remapTripStopReferences({ ...trip, ownerId }, stopIds), updatedAt };
}

/** Build a fresh ownerless draft copy before the existing promotion boundary claims it. */
export function duplicateTripDocument(
  source: EasyTTrip,
  input: { id: string; now: string; nextId: () => string; title?: string },
): EasyTTrip {
  const stopIds = new Map(source.stops.map((stop) => [stop.id, `${input.id}-stop-${input.nextId()}`]));
  const remapped = remapTripStopReferences({
    ...source,
    id: input.id,
    ownerId: null,
    title: input.title ?? `${source.title} copy`,
    status: "draft",
  }, stopIds);
  return {
    ...remapped,
    legs: remapped.legs.map((leg) => ({ ...leg, id: `${input.id}-leg-${input.nextId()}` })),
    planItems: remapped.planItems.map((item) => ({ ...item, id: `${input.id}-item-${input.nextId()}` })),
    recommendations: remapped.recommendations.map((recommendation) => ({ ...recommendation, id: `${input.id}-recommendation-${input.nextId()}`, status: "open" })),
    createdAt: input.now,
    updatedAt: input.now,
  };
}
