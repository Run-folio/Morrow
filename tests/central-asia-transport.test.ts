import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanonicalTransferJourney } from "../lib/easyt/multimodal-transfer-resolution.ts";
import type { RoadRouteRequest, RoadRouteResult, RoadRoutingProvider } from "../lib/easyt/road-routing.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import type { TripLeg, TripStop } from "../lib/easyt/trip.ts";

const stops: TripStop[] = [
  { id: "bukhara", canonicalPlaceId: "bukhara", order: 0, name: "Bukhara", country: "Uzbekistan", longitude: 64.4207, latitude: 39.7747, arrivalDate: null, departureDate: null, nights: 2 },
  { id: "samarkand", canonicalPlaceId: "samarkand", order: 1, name: "Samarkand", country: "Uzbekistan", longitude: 66.9597, latitude: 39.6542, arrivalDate: null, departureDate: null, nights: 2 },
  { id: "tashkent", canonicalPlaceId: "tashkent", order: 2, name: "Tashkent", country: "Uzbekistan", longitude: 69.2401, latitude: 41.2995, arrivalDate: null, departureDate: null, nights: 2 },
  { id: "almaty", canonicalPlaceId: "almaty", order: 3, name: "Almaty", country: "Kazakhstan", longitude: 76.886, latitude: 43.2389, arrivalDate: null, departureDate: null, nights: 2 },
  { id: "bishkek", canonicalPlaceId: "bishkek", order: 4, name: "Bishkek City", country: "Kyrgyzstan", longitude: 74.5698, latitude: 42.8746, arrivalDate: null, departureDate: null, nights: 2 },
  { id: "dushanbe", canonicalPlaceId: "dushanbe", order: 5, name: "Dushanbe", country: "Tajikistan", longitude: 68.787, latitude: 38.5598, arrivalDate: null, departureDate: null, nights: 2 },
];

function routeLegs(constraints?: Parameters<typeof buildCanonicalTripLegs>[0]["constraints"]) {
  return buildCanonicalTripLegs({
    tripId: "central-asia-transport-fixture",
    origin: { name: "London", country: "United Kingdom", canonicalPlaceId: "london", coordinates: [-0.1276, 51.5072] },
    journeyEnd: { mode: "same_as_start" },
    stops,
    constraints,
  });
}

class FixedRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  readonly requests: RoadRouteRequest[] = [];

  async route(input: RoadRouteRequest): Promise<RoadRouteResult> {
    this.requests.push(input);
    const [fromLng, fromLat] = input.origin.coordinates;
    const [toLng, toLat] = input.destination.coordinates;
    return {
      mode: "road",
      distanceKm: 245,
      durationMinutes: 270,
      confidence: "medium",
      provenance: "routed",
      provider: "openrouteservice",
      providerCheckedAt: "2026-10-05T12:00:00.000Z",
      profile: "driving-car",
      routeGeometry: [[fromLng, fromLat], [(fromLng + toLng) / 2, (fromLat + toLat) / 2], [toLng, toLat]],
      attribution: "Deterministic OpenRouteService fixture.",
    };
  }
}

test("cross-border road routing is retained as a reference estimate, not selected as transport", async () => {
  const leg = routeLegs()[4]!;
  const provider = new FixedRoadProvider();
  const result = await resolveCanonicalTransferJourney(leg, { provider });

  assert.equal(provider.requests.length, 1);
  assert.deepEqual(provider.requests[0]?.origin.canonicalIdentity, "almaty");
  assert.deepEqual(provider.requests[0]?.destination.canonicalIdentity, "bishkek");
  assert.equal(result.leg.fromEndpoint?.id, leg.fromEndpoint?.id);
  assert.equal(result.leg.toEndpoint?.id, leg.toEndpoint?.id);
  assert.equal(result.leg.mode, "unknown");
  assert.equal(result.leg.durationMinutes, null);
  assert.equal(result.leg.roadEstimate?.distanceKm, 245);
  assert.equal(result.leg.roadEstimate?.durationMinutes, 270);
  assert.equal(result.leg.roadEstimate?.provider, "openrouteservice");
  assert.ok(result.leg.roadEstimate?.warnings.some((warning) => /passenger service/i.test(warning)));
  assert.ok(result.leg.roadEstimate?.warnings.some((warning) => /border/i.test(warning)));
  const persisted = JSON.parse(JSON.stringify(result.leg)) as TripLeg;
  assert.deepEqual(persisted.roadEstimate, result.leg.roadEstimate);
  assert.equal(persisted.mode, "unknown");
  assert.equal(persisted.durationMinutes, null);
});

test("without routed evidence, a domestic coordinate distance does not become a road route or duration", async () => {
  const leg = routeLegs()[1]!;
  const result = await resolveCanonicalTransferJourney(leg);

  assert.equal(result.leg.mode, "unknown");
  assert.equal(result.leg.durationMinutes, null);
  assert.equal(result.leg.routedDistanceKm, null);
  assert.equal(result.leg.roadEstimate, undefined);
});

test("a no-driving constraint prevents even a road-reference lookup", async () => {
  const leg = routeLegs({ avoidDriving: true, excludedTransportModes: ["road"] })[4]!;
  const provider = new FixedRoadProvider();
  const result = await resolveCanonicalTransferJourney(leg, { provider });

  assert.equal(provider.requests.length, 0);
  assert.equal(result.leg.mode, "unknown");
  assert.equal(result.leg.roadEstimate, undefined);
});
