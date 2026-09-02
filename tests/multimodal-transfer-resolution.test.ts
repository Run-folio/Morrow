import assert from "node:assert/strict";
import test from "node:test";

import {
  createDestinationKnowledgeStore,
  knownKnowledgeFact,
  unknownKnowledgeFact,
  type DestinationTransferKnowledge,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import {
  resolveCanonicalTransferJourney,
} from "../lib/easyt/multimodal-transfer-resolution.ts";
import {
  canonicalTransferSegments,
  transferJourneyModeLabel,
  transferJourneySegmentSummary,
} from "../lib/easyt/transfer-journey.ts";
import { RoadRoutingError, type RoadRouteRequest, type RoadRouteResult, type RoadRoutingProvider } from "../lib/easyt/road-routing.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import { isEasyTTrip, type EasyTTrip, type TripLeg, type TripStop } from "../lib/easyt/trip.ts";

const checkedAt = "2026-09-01T12:00:00.000Z";

const stop = (id: string, order: number, name: string, country: string, coordinates?: [number, number]): TripStop => ({
  id,
  order,
  name,
  country,
  canonicalPlaceId: id,
  latitude: coordinates?.[1] ?? null,
  longitude: coordinates?.[0] ?? null,
  arrivalDate: null,
  departureDate: null,
  nights: 2,
});

function baseline(from: TripStop, to: TripStop, tripId = `${from.id}-${to.id}`) {
  return buildCanonicalTripLegs({
    tripId,
    origin: { name: from.name, country: from.country, canonicalPlaceId: from.canonicalPlaceId, coordinates: from.longitude !== null && from.latitude !== null ? [from.longitude, from.latitude] : null },
    stops: [to],
  })[0];
}

function roadResult(input: RoadRouteRequest, distanceKm = 305, durationMinutes = 255): RoadRouteResult {
  return {
    mode: "road",
    distanceKm,
    durationMinutes,
    confidence: "medium",
    provenance: "routed",
    provider: "openrouteservice",
    providerCheckedAt: checkedAt,
    profile: "driving-car",
    routeGeometry: [input.origin.coordinates, input.destination.coordinates],
    attribution: "Test OpenRouteService attribution",
  };
}

class FixtureRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  calls: RoadRouteRequest[] = [];
  private readonly handler: (input: RoadRouteRequest) => RoadRouteResult | Error;
  constructor(handler: (input: RoadRouteRequest) => RoadRouteResult | Error = (input) => roadResult(input)) { this.handler = handler; }
  async route(input: RoadRouteRequest) {
    this.calls.push(input);
    const result = this.handler(input);
    if (result instanceof Error) throw result;
    return structuredClone(result);
  }
}

const huacachina = stop("huacachina", 0, "Huacachina", "Peru", [-75.768, -14.088]);
const lima = stop("lima", 1, "Lima", "Peru", [-77.0428, -12.0464]);
const hiroshima = stop("hiroshima", 0, "Hiroshima", "Japan", [132.4553, 34.3853]);
const kyoto = stop("kyoto", 1, "Kyoto", "Japan", [135.7681, 35.0116]);
const laPaz = stop("la-paz", 0, "La Paz", "Bolivia", [-68.1193, -16.4897]);

test("Huacachina to Lima selects one routed road journey and no unknown marker state", async () => {
  const provider = new FixtureRoadProvider();
  const resolved = await resolveCanonicalTransferJourney(baseline(huacachina, lima), { provider });
  assert.equal(resolved.leg.mode, "road");
  assert.equal(resolved.leg.durationMinutes, 255);
  assert.equal(resolved.leg.distanceKm, 305);
  assert.equal(resolved.leg.segments?.length, 1);
  assert.equal(resolved.leg.segments?.[0]?.mode, "road");
  assert.equal(transferJourneyModeLabel(resolved.leg), "Road");
  assert.equal(provider.calls.length, 1);
});

test("Hiroshima to Kyoto selects generalizable direct rail evidence without calling road routing", async () => {
  const provider = new FixtureRoadProvider();
  const first = await resolveCanonicalTransferJourney(baseline(hiroshima, kyoto), { provider });
  const second = await resolveCanonicalTransferJourney(baseline(hiroshima, kyoto), { provider });
  assert.equal(first.leg.mode, "train");
  assert.equal(first.leg.durationMinutes, 120);
  assert.equal(first.leg.confidence, "medium");
  assert.equal(first.diagnostic.selectedCandidateId, "rail:direct-connectivity");
  assert.deepEqual(first.diagnostic, second.diagnostic);
  assert.equal(provider.calls.length, 0);
});

test("hard transport constraints filter candidates before provider work", async () => {
  const provider = new FixtureRoadProvider();
  const leg = baseline(hiroshima, kyoto);
  leg.routeMetadata.transportConstraints = { avoidDriving: true, excludedModes: ["train"], preferredModes: [] };
  const result = await resolveCanonicalTransferJourney(leg, { provider });
  assert.equal(result.leg.mode, "unknown");
  assert.equal(provider.calls.length, 0);
});

test("La Paz to Huacachina composes flight to Lima plus provider-routed ground access", async () => {
  const provider = new FixtureRoadProvider();
  const original = baseline(laPaz, huacachina);
  assert.equal(original.mode, "flight");
  const resolved = await resolveCanonicalTransferJourney(original, { provider });
  assert.equal(resolved.leg.mode, "mixed");
  assert.deepEqual(resolved.leg.segments?.map((item) => item.mode), ["flight", "road"]);
  assert.equal(resolved.leg.segments?.[0]?.toEndpoint.name, "Lima");
  assert.equal(resolved.leg.segments?.[1]?.toEndpoint.name, "Huacachina");
  assert.equal(resolved.leg.toEndpoint?.name, "Huacachina");
  assert.equal(resolved.leg.durationMinutes, 525);
  assert.equal(transferJourneyModeLabel(resolved.leg), "Flight + road");
  assert.equal(transferJourneySegmentSummary(resolved.leg), "Flight to Lima · Ground transfer to Huacachina");
  assert.equal(provider.calls.length, 1);

  const trip = { id: "mixed-trip", brief: { origin: "La Paz" }, stops: [huacachina], legs: [resolved.leg] } as Pick<EasyTTrip, "id" | "brief" | "stops" | "legs">;
  const mapped = mapRouteLegsFromTrip(trip)[0];
  assert.equal(mapped.mode, "mixed");
  assert.equal(mapped.modeLabel, "Flight + road");
  assert.deepEqual(mapped.routeSegments?.map((item) => item.mode), ["flight", "road"]);
});

test("a normal direct-air journey remains flight", async () => {
  const resolved = await resolveCanonicalTransferJourney(baseline(laPaz, lima), { provider: new FixtureRoadProvider() });
  assert.equal(resolved.leg.mode, "flight");
  assert.equal(resolved.leg.segments?.[0]?.toEndpoint.name, "Lima");
});

test("a short land journey selects road rather than flight", async () => {
  const from = stop("short-a", 0, "Short A", "Testland", [0, 0]);
  const to = stop("short-b", 1, "Short B", "Testland", [0.25, 0]);
  const provider = new FixtureRoadProvider((input) => roadResult(input, 32, 45));
  const resolved = await resolveCanonicalTransferJourney(baseline(from, to), { provider });
  assert.equal(resolved.leg.mode, "road");
  assert.equal(resolved.leg.durationMinutes, 45);
});

test("exact supported ferry evidence can resolve without inventing a service", async () => {
  const source: KnowledgeSource = { id: "test:ferry", label: "Test ferry evidence", kind: "curated", supports: "Exact fixture ferry." };
  const transfer: DestinationTransferKnowledge = {
    fromCanonicalId: "island-a",
    toCanonicalId: "island-b",
    mode: knownKnowledgeFact("ferry", "static", source),
    planningMinutes: knownKnowledgeFact(120, "estimated", source),
    durationBasis: knownKnowledgeFact("door-to-door", "static", source),
    realisticRangeMinutes: unknownKnowledgeFact("Not needed for fixture."),
    borderFriction: unknownKnowledgeFact("Not needed for fixture."),
    note: knownKnowledgeFact("Supported ferry planning allowance; verify sailing.", "static", source),
  };
  const knowledge = createDestinationKnowledgeStore({
    destinations: [],
    destinationOverrides: [
      { canonicalId: "island-a", name: "Island A" },
      { canonicalId: "island-b", name: "Island B" },
    ],
    transfers: [transfer],
  });
  const islandA = stop("island-a", 0, "Island A", "Archipelago", [0, 0]);
  const islandB = stop("island-b", 1, "Island B", "Archipelago", [0.5, 0]);
  const resolved = await resolveCanonicalTransferJourney(baseline(islandA, islandB), { knowledge });
  assert.equal(resolved.leg.mode, "ferry");
  assert.equal(resolved.leg.durationMinutes, 120);
});

test("island/no-route and provider outage degrade without fabricating road or direct flight", async () => {
  const noRoute = new FixtureRoadProvider(() => new RoadRoutingError("no_route"));
  const islandA = stop("unsupported-island-a", 0, "Unsupported Island A", "Archipelago", [0, 0]);
  const islandB = stop("unsupported-island-b", 1, "Unsupported Island B", "Archipelago", [0.5, 0]);
  const unresolvedIsland = await resolveCanonicalTransferJourney(baseline(islandA, islandB), { provider: noRoute });
  assert.equal(unresolvedIsland.leg.mode, "unknown");
  assert.equal(unresolvedIsland.leg.durationMinutes, null);

  const unresolvedGateway = await resolveCanonicalTransferJourney(baseline(laPaz, huacachina));
  assert.equal(unresolvedGateway.leg.mode, "unknown");
  assert.equal(unresolvedGateway.leg.toEndpoint?.name, "Huacachina");
  assert.equal(unresolvedGateway.leg.segments, undefined);
});

test("explicit confirmed transport is preserved and legacy persisted legs remain readable", async () => {
  const explicit: TripLeg = {
    ...baseline(huacachina, lima),
    mode: "road",
    durationMinutes: 300,
    provider: "Traveller confirmed private transfer.",
    routeMetadata: { source: "traveller-authored", userConfirmed: true },
  };
  const provider = new FixtureRoadProvider();
  const result = await resolveCanonicalTransferJourney(explicit, { provider });
  assert.equal(result.outcome, "preserved");
  assert.equal(result.leg.durationMinutes, 300);
  assert.equal(provider.calls.length, 0);
  assert.deepEqual(canonicalTransferSegments(explicit).map((item) => item.mode), ["road"]);
  assert.equal(isEasyTTrip({ schemaVersion: 1, id: "legacy", startDate: "2026-09-01", endDate: "2026-09-02", stops: [huacachina, lima], legs: [explicit], planItems: [] }), true);
});

test("missing coordinates remain unresolved without a provider call", async () => {
  const provider = new FixtureRoadProvider();
  const missing = stop("missing", 0, "Missing", "Testland");
  const resolved = await resolveCanonicalTransferJourney(baseline(missing, lima), { provider });
  assert.equal(resolved.leg.mode, "unknown");
  assert.equal(provider.calls.length, 0);
});
