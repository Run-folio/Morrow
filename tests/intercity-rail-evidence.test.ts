import assert from "node:assert/strict";
import test from "node:test";

import {
  createDestinationKnowledgeStore,
  destinationKnowledge,
  type IntercityRailEndpointKnowledge,
  type IntercityRailNetworkKnowledge,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import { resolveCanonicalTransferJourney } from "../lib/easyt/multimodal-transfer-resolution.ts";
import { assessRouteOrder, routeTransferSavingMinutes } from "../lib/easyt/planner.ts";
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

function providerStop(id: string, name: string, country: string, coordinates: [number, number]): TripStop {
  return {
    ...stop(id, name, country, coordinates),
    canonicalPlaceId: `provider-place:${id}:opaque`,
    providerId: `provider-result:${id}:opaque`,
  };
}

function leg(from: TripStop, to: TripStop) {
  return buildCanonicalTripLegs({
    tripId: `rail-test:${from.id}:${to.id}`,
    origin: {
      name: from.name,
      country: from.country,
      canonicalPlaceId: from.canonicalPlaceId,
      providerId: from.providerId,
      coordinates: [from.longitude!, from.latitude!],
    },
    stops: [to],
  })[0];
}

function unresolvedLeg(from: TripStop, to: TripStop) {
  return {
    ...leg(from, to),
    mode: "unknown" as const,
    durationMinutes: null,
    headlineMinutes: null,
    doorToDoorMinutes: null,
  };
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

test("provider-backed Western Europe identities resolve all required directions to canonical rail", () => {
  const providerParis = providerStop("paris-provider", "Paris", "France", [2.3522, 48.8566]);
  const providerBrussels = providerStop("brussels-provider", "Brussels", "Belgium", [4.3517, 50.8503]);
  const providerAmsterdam = providerStop("amsterdam-provider", "Amsterdam", "Netherlands", [4.9041, 52.3676]);
  const cases = [
    [providerParis, providerBrussels, 90, 180],
    [providerBrussels, providerParis, 90, 180],
    [providerBrussels, providerAmsterdam, 90, 180],
    [providerAmsterdam, providerBrussels, 90, 180],
    [providerParis, providerAmsterdam, 180, 300],
    [providerAmsterdam, providerParis, 180, 300],
  ] as const;

  for (const [from, to, minimum, maximum] of cases) {
    const canonical = leg(from, to);
    assert.equal(canonical.mode, "train", `${from.name} → ${to.name}`);
    assert.ok(canonical.durationMinutes !== null && canonical.durationMinutes >= minimum && canonical.durationMinutes <= maximum, `${from.name} → ${to.name}: ${canonical.durationMinutes}`);
    assert.equal(transferJourneyModeLabel(canonical), "Rail");
  }
});

test("Builder-equivalent Paris to Amsterdam to Brussels uses the same rail mode as presentation", () => {
  const providerParis = providerStop("paris-builder", "Paris", "France", [2.3522, 48.8566]);
  const providerAmsterdam = providerStop("amsterdam-builder", "Amsterdam", "Netherlands", [4.9041, 52.3676]);
  const providerBrussels = providerStop("brussels-builder", "Brussels", "Belgium", [4.3517, 50.8503]);
  const legs = buildCanonicalTripLegs({
    tripId: "builder-rail-regression",
    origin: {
      name: providerParis.name,
      country: providerParis.country,
      canonicalPlaceId: providerParis.canonicalPlaceId,
      providerId: providerParis.providerId,
      coordinates: [providerParis.longitude!, providerParis.latitude!],
    },
    stops: [providerAmsterdam, providerBrussels],
  });

  assert.deepEqual(legs.map((item) => item.mode), ["train", "train"]);
  assert.deepEqual(legs.map(transferJourneyModeLabel), ["Rail", "Rail"]);
  assert.ok(legs.every((item) => item.durationMinutes !== null && item.durationMinutes >= 90 && item.durationMinutes <= 300));

  const route = assessRouteOrder({
    origin: {
      name: providerParis.name,
      coordinates: [providerParis.longitude!, providerParis.latitude!],
    },
    stops: [
      { id: providerAmsterdam.id, name: providerAmsterdam.name, country: providerAmsterdam.country, canonicalPlaceId: providerAmsterdam.canonicalPlaceId, providerId: providerAmsterdam.providerId, coordinates: [providerAmsterdam.longitude!, providerAmsterdam.latitude!] },
      { id: providerBrussels.id, name: providerBrussels.name, country: providerBrussels.country, canonicalPlaceId: providerBrussels.canonicalPlaceId, providerId: providerBrussels.providerId, coordinates: [providerBrussels.longitude!, providerBrussels.latitude!] },
    ],
    availableDays: 8,
  });
  assert.equal(route.state, "recommendation");
  assert.deepEqual(route.recommendedStopIds, [providerBrussels.id, providerAmsterdam.id]);
  assert.equal(route.currentTransferMinutes, 345);
  assert.equal(route.recommendedTransferMinutes, 240);
  assert.equal(routeTransferSavingMinutes(route), 105);
});

test("deterministic rail network evidence survives unavailable exact or live provider data", async () => {
  const provider = new CountingRoadProvider();
  const providerBrussels = providerStop("brussels-fallback", "Brussels", "Belgium", [4.3517, 50.8503]);
  const providerAmsterdam = providerStop("amsterdam-fallback", "Amsterdam", "Netherlands", [4.9041, 52.3676]);
  const knowledge = {
    ...destinationKnowledge,
    findTransfer: () => undefined,
  };
  const result = await resolveCanonicalTransferJourney(unresolvedLeg(providerBrussels, providerAmsterdam), { knowledge, provider });

  assert.equal(result.leg.mode, "train");
  assert.ok(result.leg.durationMinutes !== null && result.leg.durationMinutes >= 90 && result.leg.durationMinutes <= 180);
  assert.match(result.diagnostic.selectedCandidateId ?? "", /^rail:network:/);
  assert.equal(provider.calls.length, 0);
});

test("reviewed network evidence creates domestic and cross-border rail candidates without road calls", async () => {
  for (const [from, to, expectedMinutes] of [
    [paris, amsterdam, 225],
    [london, edinburgh, 285],
    [salzburg, munich, 120],
  ] as const) {
    const provider = new CountingRoadProvider();
    const result = await resolveCanonicalTransferJourney(unresolvedLeg(from, to), { provider });
    assert.equal(result.leg.mode, "train");
    assert.equal(result.leg.durationMinutes, expectedMinutes);
    assert.match(result.diagnostic.selectedCandidateId ?? "", /^rail:network:/);
    assert.equal(result.diagnostic.candidates[0]?.evidence, "intercity_rail_network");
    assert.equal(provider.calls.length, 0);
  }
});

test("Brussels to Amsterdam proves the mechanism generalizes beyond the permanent benchmark routes", async () => {
  const provider = new CountingRoadProvider();
  const first = await resolveCanonicalTransferJourney(unresolvedLeg(brussels, amsterdam), { provider });
  const second = await resolveCanonicalTransferJourney(unresolvedLeg(brussels, amsterdam), { provider });
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
