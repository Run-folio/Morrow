import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanonicalTransferJourney, resolveCanonicalTransferJourneys } from "../lib/easyt/multimodal-transfer-resolution.ts";
import { RoadRoutingError, type RoadRouteRequest, type RoadRouteResult, type RoadRoutingProvider } from "../lib/easyt/road-routing.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import type { JourneyEndSelection, TripLeg, TripStop } from "../lib/easyt/trip.ts";

const checkedAt = "2026-09-09T00:00:00.000Z";

function stop(
  id: string,
  order: number,
  name: string,
  country: string,
  coordinates: [number, number],
): TripStop {
  return {
    id,
    order,
    name,
    country,
    canonicalPlaceId: id,
    longitude: coordinates[0],
    latitude: coordinates[1],
    arrivalDate: null,
    departureDate: null,
    nights: 2,
  };
}

const southAmericaStops = [
  stop("lima", 0, "Lima", "Peru", [-77.0428, -12.0464]),
  stop("huacachina", 1, "Huacachina", "Peru", [-75.7618, -14.0876]),
  stop("la-paz", 2, "La Paz", "Bolivia", [-68.1193, -16.4897]),
  stop("salta-city", 3, "Salta", "Argentina", [-65.4103194, -24.7892946]),
  stop("uyuni-city", 4, "Uyuni", "Bolivia", [-66.8239, -20.4628]),
  stop("cusco", 5, "Cusco", "Peru", [-71.9675, -13.5319]),
];

function southAmericaLegs(journeyEnd: JourneyEndSelection = { mode: "same_as_start" }) {
  return buildCanonicalTripLegs({
    tripId: "south-america-builder-regression",
    origin: { name: "Paris", country: "France", canonicalPlaceId: "paris", coordinates: [2.3522, 48.8566] },
    journeyEnd,
    stops: southAmericaStops,
  });
}

function pair(leg: TripLeg) {
  return `${leg.fromEndpoint?.name} → ${leg.toEndpoint?.name}`;
}

class FixtureRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  readonly calls: RoadRouteRequest[] = [];
  private readonly result: "failure" | { distanceKm: number; durationMinutes: number };
  constructor(result: "failure" | { distanceKm: number; durationMinutes: number }) { this.result = result; }
  async route(input: RoadRouteRequest): Promise<RoadRouteResult> {
    this.calls.push(structuredClone(input));
    if (this.result === "failure") throw new RoadRoutingError("unavailable");
    return {
      mode: "road",
      ...this.result,
      confidence: "medium",
      provenance: "routed",
      provider: "openrouteservice",
      providerCheckedAt: checkedAt,
      profile: "driving-car",
      routeGeometry: [input.origin.coordinates, input.destination.coordinates],
      attribution: "Fixture road provider",
    };
  }
}

test("the exact South America Builder route exhausts gateway fallbacks without inventing regional flights", async () => {
  const originalStops = structuredClone(southAmericaStops);
  const baseline = southAmericaLegs();
  assert.deepEqual(baseline.map(pair), [
    "Paris → Lima",
    "Lima → Huacachina",
    "Huacachina → La Paz",
    "La Paz → Salta",
    "Salta → Uyuni",
    "Uyuni → Cusco",
    "Cusco → Paris",
  ]);

  const resolved = await resolveCanonicalTransferJourneys(baseline);
  assert.deepEqual(resolved.map((leg) => leg.mode), ["flight", "road", "mixed", "unknown", "unknown", "unknown", "flight"]);
  assert.deepEqual(resolved.map((leg) => leg.durationMinutes), [1005, 330, 600, null, null, null, 990]);
  assert.deepEqual(resolved[2]?.segments?.map((segment) => [segment.mode, segment.fromEndpoint.name, segment.toEndpoint.name]), [
    ["road", "Huacachina", "Lima"],
    ["flight", "Lima", "La Paz"],
  ]);
  assert.equal(resolved[1]?.routeMetadata.multimodalResolution && (resolved[1].routeMetadata.multimodalResolution as { selectedCandidateId?: string }).selectedCandidateId, "road:canonical-gateway-access");
  assert.equal(resolved[2]?.routeMetadata.multimodalResolution && (resolved[2].routeMetadata.multimodalResolution as { selectedCandidateId?: string }).selectedCandidateId, "mixed:air-gateway");
  for (const leg of resolved.slice(3, 6)) {
    assert.match(leg.provider ?? "", /no direct-service or complete multimodal evidence/);
  }
  assert.equal(resolved.at(-1)?.toEndpoint?.kind, "end");
  assert.equal(resolved.at(-1)?.toEndpoint?.canonicalPlaceId, "paris");
  assert.match(resolved[0]?.provider ?? "", /connection may be required/);
  assert.match(resolved.at(-1)?.provider ?? "", /connection may be required/);
  assert.deepEqual(southAmericaStops, originalStops);
});

test("a gateway access leg falls back to canonical evidence after a road-provider failure", async () => {
  const provider = new FixtureRoadProvider("failure");
  const legs = southAmericaLegs({ mode: "unknown" });
  const directAccess = await resolveCanonicalTransferJourney(legs[1]!, { provider });
  assert.equal(directAccess.leg.mode, "road");
  assert.equal(directAccess.leg.durationMinutes, 330);
  const mixed = await resolveCanonicalTransferJourney(legs[2]!, { provider });
  assert.equal(mixed.leg.mode, "mixed");
  assert.equal(mixed.leg.durationMinutes, 600);
  assert.deepEqual(mixed.leg.segments?.map((segment) => segment.mode), ["road", "flight"]);
  assert.equal(provider.calls.length, 2);
});

test("a neighbouring domestic pair uses routed road evidence", async () => {
  const lima = southAmericaStops[0]!;
  const ica = stop("ica", 0, "Ica", "Peru", [-75.7286, -14.0678]);
  const leg = buildCanonicalTripLegs({
    tripId: "domestic-road-regression",
    origin: { name: lima.name, country: lima.country, canonicalPlaceId: lima.canonicalPlaceId, coordinates: [lima.longitude!, lima.latitude!] },
    stops: [ica],
  })[0]!;
  const provider = new FixtureRoadProvider({ distanceKm: 305, durationMinutes: 255 });
  const result = await resolveCanonicalTransferJourney(leg, { provider });
  assert.equal(result.leg.mode, "road");
  assert.equal(result.leg.durationMinutes, 255);
  assert.equal(provider.calls.length, 1);
});

test("existing rail evidence wins and a genuinely unsupported water crossing remains unresolved", async () => {
  const hiroshima = stop("hiroshima", 0, "Hiroshima", "Japan", [132.4553, 34.3853]);
  const kyoto = stop("kyoto", 0, "Kyoto", "Japan", [135.7681, 35.0116]);
  const railLeg = buildCanonicalTripLegs({
    tripId: "rail-control",
    origin: { name: hiroshima.name, country: hiroshima.country, canonicalPlaceId: hiroshima.canonicalPlaceId, coordinates: [hiroshima.longitude!, hiroshima.latitude!] },
    stops: [kyoto],
  })[0]!;
  assert.equal((await resolveCanonicalTransferJourney(railLeg)).leg.mode, "train");

  const wellington = stop("wellington", 0, "Wellington", "New Zealand", [174.7762, -41.2866]);
  const nelson = stop("nelson", 0, "Nelson", "New Zealand", [173.284, -41.2706]);
  const unsupported = buildCanonicalTripLegs({
    tripId: "unsupported-water-control",
    origin: { name: wellington.name, country: wellington.country, canonicalPlaceId: wellington.canonicalPlaceId, coordinates: [wellington.longitude!, wellington.latitude!] },
    stops: [nelson],
  })[0]!;
  const unresolved = await resolveCanonicalTransferJourney(unsupported, { provider: new FixtureRoadProvider("failure") });
  assert.equal(unresolved.leg.mode, "unknown");
  assert.equal(unresolved.leg.durationMinutes, null);
});
