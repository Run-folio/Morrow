import assert from "node:assert/strict";
import test from "node:test";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import { reconcileCuratedRouteKnowledge } from "../lib/easyt/curated-route-knowledge.ts";

const betaRoutes = ["japan-slow", "andean-highlands", "portugal-atlantic"] as const;

function buildRouteTrip(routeKey: (typeof betaRoutes)[number]) {
  const detail = publicRouteDetailFor(routeKey);
  assert.ok(detail, `${routeKey} should be a published curated route`);
  const payload = routePlannerPayload(detail.planDraft, new Date(2026, 4, 10, 12));
  return tripFromBuilder({
    id: `trip-${routeKey}`,
    sourceRouteKey: payload.sourceRouteKey,
    curatedRoute: payload.curatedRoute,
    origin: payload.origin,
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
    assert.equal(trip.legs.every((leg) => leg.routeMetadata.source === "curated-route"), true);
    const reloaded = JSON.parse(JSON.stringify(canonicalTripForOwner("owner-a", trip)));
    assert.equal(reloaded.brief.curatedRoute.coverage.state, "fully-supported");
    assert.deepEqual(reloaded.brief.curatedRoute.canonicalStopIds, reloaded.stops.map((stop: { id: string }) => stop.id));
    assert.equal(reloaded.legs.every((leg: { routeMetadata: { source?: string } }) => leg.routeMetadata.source === "curated-route"), true);
  });
}

test("a curated-route reorder preserves matching base facts, downgrades coverage, and does not invent transfers", () => {
  const trip = buildRouteTrip("japan-slow");
  const reordered = [trip.stops[0]!, trip.stops[2]!, trip.stops[1]!].map((stop, index) => ({
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
