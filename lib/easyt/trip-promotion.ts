import type { EasyTTrip, TripLeg } from "./trip";
import { normalizeLegacyGeneratedDayContext } from "./itinerary-generated-context.ts";
import { reconcileLegacyTransportLeg } from "./transport-leg-compatibility.ts";
import { prepareTripDocumentForWrite } from "./trip-document.ts";
import { routeProjectionInputKey } from "./trip-route-intent.ts";

const singleStopReferenceKeys = new Set([
  "stopId", "fromStopId", "toStopId", "fromEndpointId", "toEndpointId", "neighbouringStopId", "routeStopId",
  "suggestedCutStopId", "fixedStartStopId", "fixedEndStopId",
]);
const manyStopReferenceKeys = new Set([
  "stopIds", "mustSeeStopIds", "optionalStopIds", "currentStopIds",
  "recommendedStopIds", "requiredStopIds", "excludedStopIds", "canonicalStopIds", "manualNightStopIds", "orderedStopIds",
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

  if (key === "route" && value.version === 1 && Array.isArray(value.destinations) && Array.isArray(value.orderedStopIds)) {
    return { ...structuredClone(value),
      orderedStopIds: value.orderedStopIds.map(id => typeof id === "string" ? remappedStopId(id, stopIds) : id),
      destinations: value.destinations.map(intent => {
        if (!isRecord(intent)) return intent;
        return { ...remapNestedStopReferences(intent, stopIds) as Record<string, unknown>,
          id: intent.id, selectedPlace: structuredClone(intent.selectedPlace) };
      }),
    };
  }

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
  const endpointId = (id: string, kind?: string) => kind === "origin" || kind === "end" ? `${trip.id}-${kind}` : remappedStopId(id, stopIds);
  const result: EasyTTrip = {
    ...trip,
    brief: remapped,
    stops: trip.stops.map((stop) => ({ ...stop, id: remappedStopId(stop.id, stopIds) })),
    legs: trip.legs.map((leg) => ({
      ...leg,
      fromStopId: endpointId(leg.fromStopId, leg.fromEndpoint?.kind),
      toStopId: endpointId(leg.toStopId, leg.toEndpoint?.kind),
      ...(leg.fromEndpoint ? { fromEndpoint: {
        ...leg.fromEndpoint,
        id: endpointId(leg.fromEndpoint.id, leg.fromEndpoint.kind),
      } } : {}),
      ...(leg.toEndpoint ? { toEndpoint: {
        ...leg.toEndpoint,
        id: endpointId(leg.toEndpoint.id, leg.toEndpoint.kind),
      } } : {}),
      routeMetadata: remapNestedStopReferences(leg.routeMetadata, stopIds) as Record<string, unknown>,
    })),
    planItems: trip.planItems.map((item) => ({ ...item, stopId: remappedStopId(item.stopId, stopIds) })),
    recommendations: trip.recommendations.map((recommendation) => ({
      ...recommendation,
      proposedChange: remapNestedStopReferences(recommendation.proposedChange, stopIds) as Record<string, unknown> | null,
    })),
  };
  if (trip.brief.intent?.route?.projectionInputKey != null && trip.brief.intent.route.projectionInputKey === routeProjectionInputKey(trip)) {
    result.brief.intent!.route!.projectionInputKey = routeProjectionInputKey(result);
  }
  return result;
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
  if (key === "route" && value.version === 1 && Array.isArray(value.destinations) && Array.isArray(value.orderedStopIds)) {
    collectNestedStopReferences(value.orderedStopIds, references, "orderedStopIds");
    value.destinations.forEach(intent => {
      if (!isRecord(intent)) return;
      const { id: _intent, selectedPlace: _place, ...bindings } = intent;
      collectNestedStopReferences(bindings, references);
    });
    return;
  }
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
  const validStopIds = new Set([
    ...trip.stops.map((stop) => stop.id),
    `${trip.id}-origin`,
    `${trip.id}-end`,
    ...trip.legs.flatMap((leg) => [leg.fromEndpoint, leg.toEndpoint].filter((endpoint) => endpoint?.kind === "origin").map((endpoint) => endpoint!.id)),
  ]);
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
  trip = prepareTripDocumentForWrite(trip);
  const stopPrefix = `${trip.id}-stop-`;
  const candidateId = (id: string) => id.startsWith(stopPrefix) ? id : `${stopPrefix}${id}`;
  const counts = new Map<string, number>();
  trip.stops.forEach(stop => counts.set(candidateId(stop.id), (counts.get(candidateId(stop.id)) ?? 0) + 1));
  const reserved = new Set(trip.stops.map(stop => candidateId(stop.id)));
  const stopIds = new Map(
    [...trip.stops].sort((a, b) => a.id.localeCompare(b.id)).map((stop) => {
      let id = candidateId(stop.id);
      if (!stop.id.startsWith(stopPrefix) && counts.get(id)! > 1) {
        const base = `${stopPrefix}occurrence-${encodeURIComponent(stop.id)}`;
        id = base;
        let suffix = 1;
        while (reserved.has(id)) id = `${base}-${suffix++}`;
        reserved.add(id);
      }
      return [stop.id, id];
    }),
  );

  return prepareTripDocumentForWrite({ ...remapTripStopReferences(normalizeLegacyGeneratedDayContext({ ...trip, ownerId }), stopIds), updatedAt });
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

const transferResolutionMetadataKeys = new Set([
  "multimodalResolution",
  "planningEstimate",
  "roadFallbackEligible",
  "source",
  "transferImpact",
]);

function resolverOwnedLegProjection(reviewedLeg: TripLeg, canonicalLeg: TripLeg) {
  const reviewedSource = reviewedLeg.routeMetadata.source;
  const canonicalResolution = canonicalLeg.routeMetadata.multimodalResolution;
  const wasResolverEligible = reviewedSource === undefined
    || reviewedSource === "morrovia-planner"
    || reviewedSource === "road-routing-provider"
    || reviewedSource === "multimodal-resolver";
  const isCanonicalResolution = canonicalLeg.routeMetadata.source === "multimodal-resolver"
    && isRecord(canonicalResolution)
    && canonicalResolution.version === 1;
  const reconciledLegacyLeg = reconcileLegacyTransportLeg(reviewedLeg);
  const isExactLegacyCompatibility = reconciledLegacyLeg !== reviewedLeg
    && JSON.stringify(stableJsonValue(reconciledLegacyLeg)) === JSON.stringify(stableJsonValue(canonicalLeg));
  if (!isExactLegacyCompatibility && (!wasResolverEligible || !isCanonicalResolution)) return null;

  const authoredMetadata = (metadata: Record<string, unknown>) => Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !transferResolutionMetadataKeys.has(key)),
  );
  const projection = (leg: TripLeg) => ({
    id: leg.id,
    fromStopId: leg.fromStopId,
    toStopId: leg.toStopId,
    fromEndpoint: leg.fromEndpoint,
    toEndpoint: leg.toEndpoint,
    classification: leg.classification,
    straightLineDistanceKm: leg.straightLineDistanceKm,
    routeMetadata: authoredMetadata(leg.routeMetadata),
  });
  return {
    // Legacy compatibility is a complete, versioned server projection. Require
    // its exact output before accepting it; unlike multimodal resolution this
    // must not become a broad allowance for arbitrary transport rewrites.
    reviewed: projection(isExactLegacyCompatibility ? reconciledLegacyLeg : reviewedLeg),
    canonical: projection(canonicalLeg),
  };
}

function canonicalEquivalenceTrips(
  reviewed: Omit<EasyTTrip, "updatedAt">,
  canonical: Omit<EasyTTrip, "updatedAt">,
) {
  const reviewedLegs = reviewed.legs.map((leg, index) => {
    const canonicalLeg = canonical.legs[index];
    return canonicalLeg ? resolverOwnedLegProjection(leg, canonicalLeg)?.reviewed ?? leg : leg;
  });
  const canonicalLegs = canonical.legs.map((leg, index) => {
    const reviewedLeg = reviewed.legs[index];
    return reviewedLeg ? resolverOwnedLegProjection(reviewedLeg, leg)?.canonical ?? leg : leg;
  });
  return [{ ...reviewed, legs: reviewedLegs }, { ...canonical, legs: canonicalLegs }] as const;
}

/**
 * Prove that the complete reviewed Builder document is the document returned
 * by persistence. Repository-owned normalization (owner, stop IDs and the CAS
 * revision) and a marked server transfer resolution are allowed; semantic
 * intent, selected bases, order, dates, nights, canonical endpoints and
 * traveller-authored transfer constraints must all remain byte-equivalent.
 */
export function tripBuildDocumentsCanonicalEquivalent(
  reviewedTrip: EasyTTrip,
  canonicalTrip: EasyTTrip,
  ownerId = canonicalTrip.ownerId,
) {
  if (!ownerId || reviewedTrip.id !== canonicalTrip.id) return false;
  const { updatedAt: _reviewedRevision, ...reviewed } = canonicalTripForOwner(
    ownerId,
    reviewedTrip,
    canonicalTrip.updatedAt,
  );
  const { updatedAt: _canonicalRevision, ...canonical } = canonicalTripForOwner(
    ownerId,
    canonicalTrip,
    canonicalTrip.updatedAt,
  );
  const [reviewedForComparison, canonicalForComparison] = canonicalEquivalenceTrips(
    reviewed,
    canonical,
  );
  return JSON.stringify(stableJsonValue(reviewedForComparison))
    === JSON.stringify(stableJsonValue(canonicalForComparison));
}

/** Build a fresh ownerless draft copy before the existing promotion boundary claims it. */
export function duplicateTripDocument(
  source: EasyTTrip,
  input: { id: string; now: string; nextId: () => string; title?: string },
): EasyTTrip {
  source = prepareTripDocumentForWrite(source);
  const stopIds = new Map(source.stops.map((stop) => [stop.id, `${input.id}-stop-${input.nextId()}`]));
  const remapped = remapTripStopReferences({
    ...source,
    id: input.id,
    ownerId: null,
    title: input.title ?? `${source.title} copy`,
    status: "draft",
  }, stopIds);
  const legs = remapped.legs.map((leg) => ({ ...leg, id: `${input.id}-leg-${input.nextId()}` }));
  const planItemIds = new Map(remapped.planItems.map((item) => [item.id, `${input.id}-item-${input.nextId()}`]));
  const itineraryIdeas = remapped.brief.itineraryIdeas?.map((idea) => {
    if (!idea.dayId) return { ...idea };
    const dayId = planItemIds.get(idea.dayId);
    return dayId ? { ...idea, dayId } : { ...idea, dayId: undefined, dayPart: undefined };
  });
  return {
    ...remapped,
    brief: {
      ...remapped.brief,
      ...(itineraryIdeas ? { itineraryIdeas } : {}),
    },
    legs,
    planItems: remapped.planItems.map((item) => ({ ...item, id: planItemIds.get(item.id)! })),
    recommendations: remapped.recommendations.map((recommendation) => ({ ...recommendation, id: `${input.id}-recommendation-${input.nextId()}`, status: "open" })),
    createdAt: input.now,
    updatedAt: input.now,
  };
}
