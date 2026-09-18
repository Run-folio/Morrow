import assert from "node:assert/strict";
import test from "node:test";
import { buildBuilderRoutePreview } from "../lib/easyt/trip-builder-route-preview.ts";
import { tripFromBuilder, type BuilderTripInput } from "../lib/easyt/trip.ts";

function fixtureTrip(overrides: Partial<BuilderTripInput> = {}) {
  const stops: BuilderTripInput["stops"] = [
    { id: "tokyo-1", name: "Tokyo", country: "Japan" },
    { id: "kyoto-1", name: "Kyoto", country: "Japan" },
    { id: "tokyo-2", name: "Tokyo", country: "Japan" },
  ];
  return tripFromBuilder({
    id: "builder-route-preview",
    origin: "London",
    journeyEnd: { mode: "same_as_start" },
    stops,
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: { "tokyo-1": 3, "kyoto-1": 2, "tokyo-2": 1 },
    draft: [],
    ...overrides,
  });
}

test("reorders occurrences and re-derives legs without mutating the canonical trip", () => {
  const canonical = fixtureTrip();
  const originalLegIds = canonical.legs.map(({ id }) => id);
  const preview = buildBuilderRoutePreview(canonical, ["tokyo-2", "kyoto-1", "tokyo-1"]);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.deepEqual(preview.trip.stops.map(({ id }) => id), ["tokyo-2", "kyoto-1", "tokyo-1"]);
  assert.deepEqual(preview.trip.stops.map(({ order }) => order), [0, 1, 2]);
  assert.deepEqual(canonical.stops.map(({ id }) => id), ["tokyo-1", "kyoto-1", "tokyo-2"]);
  assert.deepEqual(canonical.legs.map(({ id }) => id), originalLegIds);
  assert.equal(preview.trip.brief.origin, "London");
  assert.equal(preview.trip.brief.journeyEnd?.mode, "same_as_start");
  assert.equal(preview.trip.updatedAt, canonical.updatedAt);
});

test("returns a rejection rather than a partial preview for an invalid permutation", () => {
  const canonical = fixtureTrip();
  assert.deepEqual(buildBuilderRoutePreview(canonical, ["missing"]), {
    ok: false,
    reason: "length-mismatch",
  });
});
