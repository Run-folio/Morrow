import { knownKnowledgeFact, type KnowledgeSource } from "./destination-knowledge.ts";
import { haversineKm } from "./planner.ts";
import {
  type RoadRouteRequest,
  type RoadRouteResult,
  type RoadRoutingProvider,
} from "./road-routing.ts";
import { estimateTransferImpact } from "./transfer-impact.ts";
import type { EasyTTrip, TripLeg } from "./trip.ts";

export type RoadFallbackSkipReason =
  | "already_resolved"
  | "explicit_or_unsupported_source"
  | "missing_coordinates"
  | "cross_border"
  | "same_place"
  | "distance_out_of_scope"
  | "provider_failure"
  | "implausible_route";

export type RoadFallbackResolution = {
  leg: TripLeg;
  outcome: "resolved" | "unchanged";
  reason?: RoadFallbackSkipReason;
};

const MAX_STRAIGHT_LINE_ROAD_KM = 1_200;
const MAX_ROUTED_ROAD_KM = 1_800;
const MAX_ROAD_DURATION_MINUTES = 24 * 60;
const MAX_ROUTE_DETOUR_FACTOR = 3.5;
const MAX_ROAD_AVERAGE_SPEED_KMH = 130;
const MIN_ROAD_AVERAGE_SPEED_KMH = 5;

const ROAD_ROUTING_SOURCE: KnowledgeSource = {
  id: "provider:openrouteservice-directions-v2",
  label: "OpenRouteService road routing",
  kind: "provider",
  supports: "Routed road distance, approximate driving duration and route geometry between two geographic points.",
  url: "https://openrouteservice.org/",
};

function normalizedIdentity(value: string | undefined) {
  return value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ?? "";
}

function validCoordinates(value: [number, number] | null | undefined): value is [number, number] {
  return Boolean(value
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90);
}

function endpointIdentity(endpoint: NonNullable<TripLeg["fromEndpoint"]>) {
  return endpoint.canonicalPlaceId?.trim()
    || endpoint.providerId?.trim()
    || `${normalizedIdentity(endpoint.country)}:${normalizedIdentity(endpoint.name)}`;
}

function roadFallbackEligible(leg: TripLeg) {
  const metadata = leg.routeMetadata as { source?: unknown; roadFallbackEligible?: unknown; decisionOption?: unknown };
  return metadata.source === "morrovia-planner"
    && metadata.decisionOption === undefined
    && (metadata.roadFallbackEligible === true
      || (metadata.roadFallbackEligible === undefined
        && /no supported service fact for this exact leg|rail could be considered for this distance/i.test(leg.provider ?? "")));
}

function routeIsPlausible(result: RoadRouteResult, straightLineDistanceKm: number) {
  if (result.distanceKm < Math.max(1, straightLineDistanceKm * 0.8)) return false;
  if (result.distanceKm > MAX_ROUTED_ROAD_KM || result.durationMinutes > MAX_ROAD_DURATION_MINUTES) return false;
  if (result.distanceKm > Math.max(straightLineDistanceKm * MAX_ROUTE_DETOUR_FACTOR, straightLineDistanceKm + 100)) return false;
  const averageSpeed = result.distanceKm / (result.durationMinutes / 60);
  return averageSpeed >= MIN_ROAD_AVERAGE_SPEED_KMH && averageSpeed <= MAX_ROAD_AVERAGE_SPEED_KMH;
}

export async function resolveCanonicalRoadFallback(
  leg: TripLeg,
  options: { provider?: RoadRoutingProvider } = {},
): Promise<RoadFallbackResolution> {
  if (leg.mode !== "unknown" || leg.durationMinutes !== null) return { leg, outcome: "unchanged", reason: "already_resolved" };
  if (!roadFallbackEligible(leg)) return { leg, outcome: "unchanged", reason: "explicit_or_unsupported_source" };
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  if (!from || !to || !validCoordinates(from.coordinates) || !validCoordinates(to.coordinates)) {
    return { leg, outcome: "unchanged", reason: "missing_coordinates" };
  }
  if (!from.country || !to.country || normalizedIdentity(from.country) !== normalizedIdentity(to.country)) {
    return { leg, outcome: "unchanged", reason: "cross_border" };
  }
  const straightLineDistanceKm = haversineKm(from.coordinates, to.coordinates);
  if (straightLineDistanceKm === null || straightLineDistanceKm < 1) return { leg, outcome: "unchanged", reason: "same_place" };
  if (straightLineDistanceKm > MAX_STRAIGHT_LINE_ROAD_KM) return { leg, outcome: "unchanged", reason: "distance_out_of_scope" };
  const provider = options.provider ?? null;
  if (!provider) return { leg, outcome: "unchanged", reason: "provider_failure" };

  const request: RoadRouteRequest = {
    origin: { canonicalIdentity: endpointIdentity(from), coordinates: from.coordinates },
    destination: { canonicalIdentity: endpointIdentity(to), coordinates: to.coordinates },
    profile: "driving-car",
  };
  let result: RoadRouteResult;
  try {
    result = await provider.route(request);
  } catch {
    return { leg, outcome: "unchanged", reason: "provider_failure" };
  }
  if (!routeIsPlausible(result, straightLineDistanceKm)) return { leg, outcome: "unchanged", reason: "implausible_route" };

  const durationFact = knownKnowledgeFact(result.durationMinutes, "estimated", ROAD_ROUTING_SOURCE);
  const transferImpact = estimateTransferImpact({
    mode: "road",
    headlineMinutes: durationFact,
    knownDoorToDoorMinutes: durationFact,
    international: false,
    connectionCount: 0,
  });
  const resolved: TripLeg = {
    ...leg,
    mode: "road",
    distanceKm: result.distanceKm,
    straightLineDistanceKm,
    routedDistanceKm: result.distanceKm,
    durationMinutes: result.durationMinutes,
    headlineMinutes: result.durationMinutes,
    doorToDoorMinutes: result.durationMinutes,
    usableDayLoss: transferImpact.usableDayLoss.estimatedDayFraction,
    provider: "OpenRouteService road route; Morrovia planning estimate, not a live timetable.",
    provenance: "routing_engine",
    confidence: result.confidence,
    scheduleNeedsChecking: true,
    warnings: [],
    routeGeometry: result.routeGeometry,
    routeMetadata: {
      ...leg.routeMetadata,
      planningEstimate: true,
      source: "road-routing-provider",
      roadFallbackEligible: false,
      transferImpact,
      routingConfidence: result.confidence,
      roadRouting: {
        version: 1,
        provider: result.provider,
        profile: result.profile,
        provenance: result.provenance,
        checkedAt: result.providerCheckedAt,
        attribution: result.attribution,
      },
    },
  };
  return { leg: resolved, outcome: "resolved" };
}

export async function resolveCanonicalRoadFallbacks(
  legs: readonly TripLeg[],
  options: { provider?: RoadRoutingProvider; maxLegs?: number } = {},
): Promise<TripLeg[]> {
  const maximum = Math.max(0, Math.min(8, options.maxLegs ?? 8));
  const output: TripLeg[] = [];
  let attempted = 0;
  for (const leg of legs) {
    if (attempted >= maximum || !roadFallbackEligible(leg) || leg.mode !== "unknown" || leg.durationMinutes !== null) {
      output.push(leg);
      continue;
    }
    attempted += 1;
    output.push((await resolveCanonicalRoadFallback(leg, options)).leg);
  }
  return output;
}

export async function resolveTripRoadFallbacks(
  trip: EasyTTrip,
  options: { provider?: RoadRoutingProvider } = {},
): Promise<EasyTTrip> {
  const legs = await resolveCanonicalRoadFallbacks(trip.legs, options);
  return legs.some((leg, index) => leg !== trip.legs[index]) ? { ...trip, legs } : trip;
}
