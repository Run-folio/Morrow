import { normalizeJourneyEnd, originPlaceFromBrief } from "./journey-endpoints.ts";
import type { CanonicalEasyTTrip, DestinationIntent, EasyTTrip, JourneyEndpointPlace, RouteIntent, TripStop } from "./trip.ts";
import type { TripDocumentIssue } from "./trip-document.ts";

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function placeForRouteStop(stop: TripStop): JourneyEndpointPlace {
  return {
    name: stop.name,
    ...(stop.canonicalPlaceId ? { canonicalPlaceId: stop.canonicalPlaceId } : {}),
    ...(stop.providerId ? { providerId: stop.providerId } : {}),
    ...(stop.country ? { country: stop.country } : {}),
    ...(Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)
      ? { coordinates: [stop.longitude!, stop.latitude!] as [number, number] } : {}),
  };
}

/** Preserve the ordered v1 projection; geography and labels never merge stays. */
export function routeIntentFromLegacyTrip(trip: EasyTTrip): RouteIntent {
  const sourceEnd = trip.brief.journeyEnd ?? trip.brief.intent?.journeyEnd;
  const journeyEnd = sourceEnd && (sourceEnd.mode !== "explicit" || sourceEnd.place?.name?.trim())
    ? structuredClone(sourceEnd) : normalizeJourneyEnd(sourceEnd);
  const manualIds = Array.isArray(trip.brief.manualNightStopIds) ? trip.brief.manualNightStopIds : [];
  const optionalIds = Array.isArray(trip.brief.intent?.hardConstraints?.optionalStopIds) ? trip.brief.intent.hardConstraints.optionalStopIds : [];
  const destinations: DestinationIntent[] = trip.stops.map(stop => ({
    id: `legacy-stop:${stop.id}`,
    sourceText: stop.name,
    kind: "overnight_place",
    selectedPlace: placeForRouteStop(stop),
    resolution: stop.canonicalPlaceId || (Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) ? "resolved" : "unresolved",
    requestedNights: manualIds.includes(stop.id) && nonnegativeInteger(stop.nights) ? stop.nights : null,
    routeMembership: optionalIds.includes(stop.id) ? "optional" : "required",
    stopIds: [stop.id],
  }));
  const captured = trip.brief.capturedIntent;
  if (Array.isArray(captured?.mentions)) {
    captured.mentions.forEach((mention, index) => {
      if (mention?.role !== "stop" || mention.status !== "unresolved" || mention.intent === "landmark" || !mention.sourceText) return;
      // Original immutable source occurrence is the fallback for v1's ID-less mentions.
      const id = `legacy-mention:${trip.id}:${index}`;
      destinations.push({ id, sourceText: mention.sourceText,
        kind: ["country", "region", "island", "lake"].includes(mention.placeType ?? "") ? "planning_area" : "overnight_place",
        selectedPlace: null, resolution: "unresolved", requestedNights: null,
        routeMembership: "required", stopIds: [] });
    });
  }
  return {
    version: 1,
    origin: trip.brief.origin?.trim() ? originPlaceFromBrief(trip.brief) : null,
    tripType: journeyEnd.mode === "same_as_start" ? "return_to_start" : journeyEnd.mode === "explicit" ? "one_way" : "unknown_legacy",
    journeyEnd,
    destinations,
    orderAuthority: "legacy_preserved",
    explicitIntentIds: null,
    orderedStopIds: trip.stops.map(stop => stop.id),
    projectionInputKey: null,
  };
}

function placeDependency(place: JourneyEndpointPlace | null) {
  if (!place) return null;
  return { canonicalPlaceId: place.canonicalPlaceId ?? null, providerId: place.providerId ?? null,
    coordinates: place.coordinates ?? null,
    // An unverified endpoint's typed place remains semantic input, not display copy.
    ...(place.canonicalPlaceId || place.providerId || place.coordinates ? {} : { sourceText: place.name.trim().toLocaleLowerCase(), country: place.country ?? null }) };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

/** Browser/server-identical semantic serialization; excludes save and display fields. */
export function routeProjectionInputKey(trip: EasyTTrip): string {
  const route = trip.brief.intent?.route ?? routeIntentFromLegacyTrip(trip);
  return JSON.stringify(stableValue({
    origin: placeDependency(route.origin), tripType: route.tripType,
    journeyEnd: route.journeyEnd.mode === "explicit" ? { mode: "explicit", place: placeDependency(route.journeyEnd.place) } : route.journeyEnd,
    destinations: [...route.destinations].sort((a, b) => a.id.localeCompare(b.id)).map(intent => ({
      id: intent.id, kind: intent.kind, selectedPlace: placeDependency(intent.selectedPlace),
      ...(intent.selectedPlace?.canonicalPlaceId || intent.selectedPlace?.providerId || intent.selectedPlace?.coordinates ? {} : { sourceText: intent.sourceText.trim().toLocaleLowerCase() }),
      resolution: intent.resolution, requestedNights: intent.requestedNights,
      routeMembership: intent.routeMembership, stopIds: intent.stopIds,
    })),
    orderAuthority: route.orderAuthority, explicitIntentIds: route.explicitIntentIds, orderedStopIds: route.orderedStopIds,
    stops: trip.stops.map(stop => ({ id: stop.id, place: placeDependency(placeForRouteStop(stop)), nights: stop.nights })),
    startDate: trip.startDate, endDate: trip.endDate,
    fixedCommitments: trip.brief.intent?.hardConstraints?.fixedCommitments ?? [],
    scheduleLocks: trip.brief.scheduleLocks ?? null,
  }));
}

export function routeProjectionStatus(trip: CanonicalEasyTTrip): "legacy_unverified" | "current" | "pending" | "provisional" {
  const route = trip.brief.intent.route;
  if (route.destinations.some(intent => intent.routeMembership === "required" && intent.resolution !== "resolved")) return "provisional";
  if (route.projectionInputKey === null) return "legacy_unverified";
  return route.projectionInputKey === routeProjectionInputKey(trip) ? "current" : "pending";
}

export function routeNightBudget(trip: CanonicalEasyTTrip, availableNights: number | null): {
  allocated: number; held: number; unallocated: number | null; overallocated: number; issues: TripDocumentIssue[];
} {
  const issues: TripDocumentIssue[] = [];
  const stops = new Map(trip.stops.map(stop => [stop.id, stop]));
  let allocated = 0;
  for (const stop of trip.stops) {
    if (nonnegativeInteger(stop.nights)) allocated += stop.nights;
    else issues.push({ code: "unknown_allocated_nights", path: `stops.${stop.id}.nights`, severity: "warning" });
  }
  const seen = new Set<string>();
  let held = 0;
  for (const intent of trip.brief.intent.route.destinations) {
    let mapped = 0;
    for (const id of intent.stopIds) {
      if (seen.has(id) || !stops.has(id)) issues.push({ code: "ambiguous_night_binding", path: `brief.intent.route.destinations.${intent.id}`, severity: "blocking" });
      seen.add(id);
      const nights = stops.get(id)?.nights;
      if (nonnegativeInteger(nights)) mapped += nights;
    }
    if (intent.requestedNights !== null) held += Math.max(0, intent.requestedNights - mapped);
  }
  const known = nonnegativeInteger(availableNights) && issues.length === 0;
  return { allocated, held, unallocated: known ? Math.max(0, availableNights - allocated - held) : null,
    overallocated: nonnegativeInteger(availableNights) ? Math.max(0, allocated + held - availableNights) : 0, issues };
}
