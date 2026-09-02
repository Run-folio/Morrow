import assert from "node:assert/strict";
import test from "node:test";

import {
  createDestinationKnowledgeStore,
  type IntercityRailEndpointKnowledge,
  type IntercityRailNetworkKnowledge,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import { resolveCanonicalTransferJourney } from "../lib/easyt/multimodal-transfer-resolution.ts";
import type { RoadRouteRequest, RoadRouteResult, RoadRoutingProvider } from "../lib/easyt/road-routing.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import { canonicalTransferSegments, transferJourneyModeLabel } from "../lib/easyt/transfer-journey.ts";
import type { EasyTTrip, TripStop } from "../lib/easyt/trip.ts";

const checkedAt = "2026-09-01T12:00:00.000Z";

function stop(id: string, name: string, country: string, coordinates: [number, number]): TripStop {
  return {
    id,
    canonicalPlaceId: id,
    order: 0,
    name,
    country,
    latitude: coordinates[1],
    longitude: coordinates[0],
    arrivalDate: null,
    departureDate: null,
    nights: 2,
  };
}

function leg(from: TripStop, to: TripStop) {
  return buildCanonicalTripLegs({
    tripId: `rail-test:${from.id}:${to.id}`,
    origin: {
      name: from.name,
      country: from.country,
      canonicalPlaceId: from.canonicalPlaceId,
      coordinates: [from.longitude!, from.latitude!],
    },
    stops: [to],
  })[0];
}

class CountingRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  readonly calls: RoadRouteRequest[] = [];
  async route(input: RoadRouteRequest): Promise<RoadRouteResult> {
    this.calls.push(structuredClone(input));
    return {
      mode: "road",
      distanceKm: 650,
      durationMinutes: 450,
      confidence: "medium",
      provenance: "routed",
      provider: "openrouteservice",
      providerCheckedAt: checkedAt,
      profile: "driving-car",
      routeGeometry: [input.origin.coordinates, input.destination.coordinates],
      attribution: "Deterministic rail evidence test provider.",
    };
  }
}

const paris = stop("paris", "Paris", "France", [2.3522, 48.8566]);
const amsterdam = stop("amsterdam", "Amsterdam", "Netherlands", [4.9041, 52.3676]);
const london = stop("london", "London", "United Kingdom", [-0.1276, 51.5072]);
const edinburgh = stop("edinburgh", "Edinburgh", "United Kingdom", [-3.1883, 55.9533]);
const salzburg = stop("salzburg", "Salzburg", "Austria", [13.055, 47.8095]);
const munich = stop("munich", "Munich", "Germany", [11.582, 48.1351]);
const brussels = stop("brussels", "Brussels", "Belgium", [4.3517, 50.8503]);

test("reviewed network evidence creates domestic and cross-border rail candidates without road calls", async () => {
  for (const [from, to, expectedMinutes] of [
    [paris, amsterdam, 225],
    [london, edinburgh, 285],
    [salzburg, munich, 120],
  ] as const) {
    const provider = new CountingRoadProvider();
    const result = await resolveCanonicalTransferJourney(leg(from, to), { provider });
    assert.equal(result.leg.mode, "train");
    assert.equal(result.leg.durationMinutes, expectedMinutes);
    assert.match(result.diagnostic.selectedCandidateId ?? "", /^rail:network:/);
    assert.equal(result.diagnostic.candidates[0]?.evidence, "intercity_rail_network");
    assert.equal(provider.calls.length, 0);
  }
});

test("Brussels to Amsterdam proves the mechanism generalizes beyond the permanent benchmark routes", async () => {
  const provider = new CountingRoadProvider();
  const first = await resolveCanonicalTransferJourney(leg(brussels, amsterdam), { provider });
  const second = await resolveCanonicalTransferJourney(leg(brussels, amsterdam), { provider });
  assert.equal(first.leg.mode, "train");
  assert.ok(first.leg.durationMinutes !== null && first.leg.durationMinutes >= 90 && first.leg.durationMinutes <= 180);
  assert.deepEqual(first.diagnostic, second.diagnostic);
  assert.equal(provider.calls.length, 0);
});

test("station or network access alone never creates a strong rail candidate", async () => {
  const source: KnowledgeSource = {
    id: "test:rail-access-only",
    label: "Access-only rail test evidence",
    kind: "curated",
    supports: "Proves station access is weaker than direct intercity connection evidence.",
  };
  const network: IntercityRailNetworkKnowledge = {
    id: "access-only",
    label: "Access-only network",
    connectionEvidence: "network-access-only",
    supportsCrossBorder: true,
    minimumDistanceKm: 50,
    maximumDistanceKm: 800,
    routeDistanceFactor: 1.1,
    planningSpeedKmh: 160,
    stationAllowanceMinutes: 45,
    source,
  };
  const endpoints: IntercityRailEndpointKnowledge[] = [
    { canonicalId: "weak-a", name: "Weak A", country: "A", networkIds: [network.id] },
    { canonicalId: "weak-b", name: "Weak B", country: "A", networkIds: [network.id] },
  ];
  const knowledge = createDestinationKnowledgeStore({
    destinations: [],
    transfers: [],
    intercityRailNetworks: [network],
    intercityRailEndpoints: endpoints,
  });
  const provider = new CountingRoadProvider();
  const result = await resolveCanonicalTransferJourney(leg(
    stop("weak-a", "Weak A", "A", [0, 0]),
    stop("weak-b", "Weak B", "A", [3, 0]),
  ), { knowledge, provider });
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.summaryMode === "train"), false);
  assert.equal(result.leg.mode, "road");
  assert.equal(provider.calls.length, 1);
});

test("a shared domestic network cannot be used cross-border unless the evidence explicitly allows it", async () => {
  const source: KnowledgeSource = { id: "test:domestic-rail", label: "Domestic rail test", kind: "curated", supports: "Cross-border safeguard test." };
  const network: IntercityRailNetworkKnowledge = {
    id: "domestic-only",
    label: "Domestic-only intercity network",
    connectionEvidence: "strong-intercity",
    supportsCrossBorder: false,
    minimumDistanceKm: 50,
    maximumDistanceKm: 800,
    routeDistanceFactor: 1.1,
    planningSpeedKmh: 160,
    stationAllowanceMinutes: 45,
    source,
  };
  const knowledge = createDestinationKnowledgeStore({
    destinations: [],
    transfers: [],
    intercityRailNetworks: [network],
    intercityRailEndpoints: [
      { canonicalId: "border-a", name: "Border A", country: "A", networkIds: [network.id] },
      { canonicalId: "border-b", name: "Border B", country: "B", networkIds: [network.id] },
    ],
  });
  const provider = new CountingRoadProvider();
  const result = await resolveCanonicalTransferJourney(leg(
    stop("border-a", "Border A", "A", [0, 0]),
    stop("border-b", "Border B", "B", [3, 0]),
  ), { knowledge, provider });
  assert.notEqual(result.leg.mode, "train");
  assert.equal(result.diagnostic.candidates.some((candidate) => candidate.summaryMode === "train"), false);
});

test("canonical rail legs remain persistence-compatible and feed existing Builder, Map and Itinerary presentation contracts", async () => {
  const resolved = await resolveCanonicalTransferJourney(leg(paris, amsterdam));
  const persisted = structuredClone(resolved.leg);
  assert.equal(transferJourneyModeLabel(persisted), "Rail");
  assert.equal(persisted.scheduleNeedsChecking, true);
  assert.deepEqual(canonicalTransferSegments(persisted).map((segment) => segment.mode), ["train"]);

  const trip = {
    id: "rail-presentation",
    brief: { origin: paris.name },
    stops: [amsterdam],
    legs: [persisted],
  } as Pick<EasyTTrip, "id" | "brief" | "stops" | "legs">;
  const mapped = mapRouteLegsFromTrip(trip)[0];
  assert.equal(mapped.mode, "train");
  assert.equal(mapped.modeLabel, "Rail");
  assert.equal(mapped.routeSegments, undefined);
  assert.deepEqual([mapped.fromCoordinates, mapped.toCoordinates], [paris.longitude !== null && paris.latitude !== null ? [paris.longitude, paris.latitude] : null, amsterdam.longitude !== null && amsterdam.latitude !== null ? [amsterdam.longitude, amsterdam.latitude] : null]);
});
