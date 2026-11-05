import assert from "node:assert/strict";
import test from "node:test";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import { reconcileCuratedRouteKnowledge } from "../lib/easyt/curated-route-knowledge.ts";
import { geographicallyReady } from "../lib/easyt/geographic-binding.ts";

const betaRoutes = ["japan-slow", "andean-highlands", "portugal-atlantic"] as const;

function buildRouteTrip(routeKey: (typeof betaRoutes)[number]) {
  const detail = publicRouteDetailFor(routeKey);
  assert.ok(detail, `${routeKey} should derive from canonical curated content`);
  const payload = routePlannerPayload(detail.planDraft, new Date(2026, 4, 10, 12));
  return tripFromBuilder({
    id: `trip-${routeKey}`,
    sourceRouteKey: payload.sourceRouteKey,
    curatedRoute: payload.curatedRoute,
    origin: payload.origin,
    originCanonicalPlaceId: payload.originCanonicalPlaceId,
    originCountry: payload.originCountry,
    originCoordinates: payload.originCoordinates,
    stops: payload.destinations,
    startDate: payload.startDate,
    endDate: payload.endDate,
    picks: {},
    mustDo: payload.brief,
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: payload.nightAllocations,
    draft: [],
    structuredBrief: payload.structuredBrief,
  });
}

for (const routeKey of betaRoutes) {
  test(`${routeKey} keeps curated evidence through handoff, save, and reload`, () => {
    const trip = buildRouteTrip(routeKey);
    assert.equal(trip.brief.curatedRoute?.coverage.state, "fully-supported");
    assert.equal(trip.brief.curatedRoute?.stops.length, trip.stops.length);
    // Each seed starts in its first overnight base. Canonical endpoint
    // deduplication preserves that stay but emits no zero-distance arrival leg.
    assert.equal(trip.brief.originCanonicalPlaceId, trip.stops[0]?.canonicalPlaceId);
    const expectedPairs = trip.stops.slice(1).map((stop, index) => [trip.stops[index]!.id, stop.id]);
    assert.deepEqual(trip.legs.map((leg) => [leg.fromStopId, leg.toStopId]), expectedPairs);
    const knowledge = trip.brief.curatedRoute!;
    assert.equal(knowledge.connections.length, trip.stops.length - 1);
    assert.deepEqual(knowledge.connections.map(connection => [connection.fromStopId, connection.toStopId]), expectedPairs);
    assert.equal(knowledge.connections.every(connection => connection.sourceIds.length > 0), true,
      "the reviewed editorial evidence remains in the snapshot even when geography prevents an operational leg");
    assert.equal(assertOperationalTransfers(trip), routeKey === "japan-slow" ? 0 : 2);
    const reloaded = JSON.parse(JSON.stringify(canonicalTripForOwner("owner-a", trip)));
    assert.equal(reloaded.brief.curatedRoute.coverage.state, "fully-supported");
    assert.equal(reloaded.brief.originCanonicalPlaceId, trip.brief.originCanonicalPlaceId);
    assert.deepEqual(reloaded.brief.curatedRoute.canonicalStopIds, reloaded.stops.map((stop: { id: string }) => stop.id));
    const stopFacts = (stops: typeof trip.stops) => JSON.parse(JSON.stringify(stops.map(({ id: _id, ...facts }) => facts)));
    assert.deepEqual(stopFacts(reloaded.stops), stopFacts(trip.stops));
    const reloadedPairs = reloaded.stops.slice(1).map((stop: { id: string }, index: number) => [reloaded.stops[index].id, stop.id]);
    assert.deepEqual(reloaded.legs.map((leg: { fromStopId: string; toStopId: string }) => [leg.fromStopId, leg.toStopId]), reloadedPairs);
    assert.equal(assertOperationalTransfers(reloaded), routeKey === "japan-slow" ? 0 : 2);
    const transferFacts = (connections: typeof knowledge.connections) => connections.map(({fromStopId: _from, toStopId: _to, ...facts}) => facts);
    assert.deepEqual(transferFacts(reloaded.brief.curatedRoute.connections), transferFacts(knowledge.connections));
    assert.deepEqual(reloaded.brief.curatedRoute.connections.map((connection: typeof knowledge.connections[number]) => [connection.fromStopId, connection.toStopId]), reloadedPairs);
  });
}

function assertOperationalTransfers(trip: ReturnType<typeof buildRouteTrip>) {
  let unqualified = 0;
  for (const leg of trip.legs) {
    const ready = (endpoint: NonNullable<typeof leg.fromEndpoint>) => geographicallyReady(
      {...endpoint, coordinates: endpoint.coordinates ?? undefined}, endpoint.kind === "stop" ? "stop" : "endpoint");
    assert.ok(leg.fromEndpoint && leg.toEndpoint);
    if (ready(leg.fromEndpoint) && ready(leg.toEndpoint)) {
      assert.equal(leg.routeMetadata.source, "curated-route");
      assert.ok((leg.routeMetadata.curatedRouteTransfer as {sourceIds?: string[]})?.sourceIds?.length);
    } else {
      unqualified += 1;
      assert.equal(leg.routeMetadata.source, "unverified-geography");
      assert.equal(leg.mode, "unknown");
      assert.equal(leg.durationMinutes, null);
      assert.equal(leg.doorToDoorMinutes, null);
      assert.equal(leg.routeMetadata.curatedRouteTransfer, undefined);
      assert.equal(leg.provider, "Confirm the affected location to assess this connection.");
      assert.ok(leg.warnings?.some(warning => warning.includes("validated coordinates")));
    }
  }
  return unqualified;
}

test("a flexible-gateway curated-route reorder preserves matching base facts, downgrades coverage, and does not invent transfers", () => {
  const original = buildRouteTrip("japan-slow");
  const trip = {
    ...original,
    brief: {
      ...original.brief,
      structuredBrief: original.brief.structuredBrief ? {
        ...original.brief.structuredBrief,
        destinations: original.brief.structuredBrief.destinations.map((destination) => ({
          ...destination,
          role: "preferred" as const,
          priority: "normal" as const,
        })),
        hardConstraints: original.brief.structuredBrief.hardConstraints.filter((constraint) => (
          constraint.type !== "start-at" && constraint.type !== "end-at"
        )),
      } : undefined,
    },
  };
  const reordered = [trip.stops[0]!, trip.stops[2]!, trip.stops[4]!, trip.stops[1]!, trip.stops[3]!].map((stop, index) => ({
    id: `day-${index + 1}`,
    stopId: stop.id,
    dayNumber: index + 1,
    date: `2026-05-${String(10 + index).padStart(2, "0")}`,
    type: "open" as const,
    title: stop.name,
    reason: "test",
    notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null,
  }));
  const result = replanTripAfterDayOrder(trip, reordered);
  assert.equal(result.state, "recalculated");
  if (result.state !== "recalculated") return;
  assert.equal(result.trip.brief.curatedRoute?.coverage.state, "partially-supported");
  assert.equal(result.trip.brief.curatedRoute?.stops[0]?.minimumNights, 3);
  assert.equal(result.trip.legs.some((leg) => leg.routeMetadata.source === "curated-route"), false);
  assert.equal(result.trip.legs.every((leg) => leg.routeMetadata.source !== "curated-route"), true);
});

test("adding a stop outside the curated route says so without discarding retained evidence", () => {
  const trip = buildRouteTrip("portugal-atlantic");
  const coverage = reconcileCuratedRouteKnowledge(trip.brief.curatedRoute, [...trip.stops.map((stop) => stop.id), "new-base"]);
  assert.equal(coverage?.coverage.state, "outside-supported-route");
  assert.equal(coverage?.stops.find((stop) => stop.name === "Lisbon")?.minimumNights, 2);
  assert.match(coverage?.coverage.reason ?? "", /outside the reviewed route/i);
});
