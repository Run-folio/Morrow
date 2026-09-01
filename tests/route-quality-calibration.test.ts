import assert from "node:assert/strict";
import test from "node:test";
import {
  ROUTE_QUALITY_CALIBRATION_FIXTURES,
  type RouteQualityCalibrationGeography,
} from "../benchmarks/route-quality-calibration/fixtures.ts";
import {
  comparableRouteQualityCalibration,
  runRouteQualityCalibration,
} from "../benchmarks/route-quality-calibration/harness.ts";
import { NIGHT_ALLOCATION_EXPECTATIONS } from "../benchmarks/route-quality-calibration/night-expectations.ts";

const requiredGeographies: RouteQualityCalibrationGeography[] = [
  "japan",
  "southern-spain",
  "portugal",
  "andes",
  "mexico-guatemala-belize",
  "italy",
  "balkans",
  "thailand",
  "vietnam",
  "morocco",
  "us-southwest",
  "scotland",
];

const orderKey = (ids: readonly string[]) => ids.join("|");
const sortedIds = (ids: readonly string[]) => [...ids].sort();

test("the calibration corpus contains 20 canonical trips across every requested geography", () => {
  assert.equal(ROUTE_QUALITY_CALIBRATION_FIXTURES.length, 20);
  assert.equal(new Set(ROUTE_QUALITY_CALIBRATION_FIXTURES.map((fixture) => fixture.id)).size, 20);
  assert.equal(NIGHT_ALLOCATION_EXPECTATIONS.length, 20);
  assert.deepEqual(NIGHT_ALLOCATION_EXPECTATIONS.map((item) => item.fixtureId), ROUTE_QUALITY_CALIBRATION_FIXTURES.map((fixture) => fixture.id));
  assert.deepEqual(
    [...new Set(ROUTE_QUALITY_CALIBRATION_FIXTURES.map((fixture) => fixture.geography))].sort(),
    [...requiredGeographies].sort(),
  );

  const specialCases = new Set(ROUTE_QUALITY_CALIBRATION_FIXTURES.flatMap((fixture) => fixture.specialCases));
  for (const required of [
    "cross-border",
    "fixed-first",
    "fixed-final",
    "very-short",
    "long-trip",
    "no-one-night-churn",
    "excellent-entered-order",
    "deliberate-backtracking",
    "island-flight-transition",
  ]) {
    assert.ok(specialCases.has(required), `missing calibration special case: ${required}`);
  }

  for (const fixture of ROUTE_QUALITY_CALIBRATION_FIXTURES) {
    assert.ok(fixture.stops.length >= 3 && fixture.stops.length <= 7, `${fixture.id} must contain 3–7 stops`);
    assert.ok(fixture.days > fixture.stops.length, `${fixture.id} needs a realistic positive stay window`);
    assert.ok(fixture.origin.canonicalPlaceId, `${fixture.id} needs a canonical origin ID`);
    assert.equal(fixture.origin.coordinates.length, 2, `${fixture.id} needs canonical origin coordinates`);

    const stopIds = fixture.stops.map((stop) => stop.id);
    assert.equal(new Set(stopIds).size, stopIds.length, `${fixture.id} has duplicate stop IDs`);
    assert.deepEqual(sortedIds(fixture.constraints.requiredStopIds ?? []), sortedIds(stopIds), `${fixture.id} must retain every requested stop`);
    for (const stop of fixture.stops) {
      assert.ok(stop.canonicalPlaceId, `${fixture.id}/${stop.id} needs a canonical place ID`);
      assert.ok(stop.coordinates, `${fixture.id}/${stop.id} needs canonical coordinates`);
      const [longitude, latitude] = stop.coordinates!;
      assert.ok(longitude >= -180 && longitude <= 180, `${fixture.id}/${stop.id} has an invalid longitude`);
      assert.ok(latitude >= -90 && latitude <= 90, `${fixture.id}/${stop.id} has an invalid latitude`);
    }

    assert.ok(fixture.humanReview.goodOrders.length, `${fixture.id} needs at least one strong human order`);
    for (const order of [...fixture.humanReview.goodOrders, ...fixture.humanReview.acceptableOrders]) {
      assert.deepEqual(sortedIds(order), sortedIds(stopIds), `${fixture.id} review order must be an exact stop permutation`);
      if (fixture.constraints.fixedStartStopId) assert.equal(order[0], fixture.constraints.fixedStartStopId, `${fixture.id} review order moves the fixed start`);
      if (fixture.constraints.fixedEndStopId) assert.equal(order.at(-1), fixture.constraints.fixedEndStopId, `${fixture.id} review order moves the fixed gateway`);
    }
    if (!fixture.humanReview.objectiveIssues.length) {
      assert.ok(fixture.humanReview.intentionalUnchangedReason, `${fixture.id} needs a reason to preserve its defensible entered order`);
    }
    if (fixture.orderIntent === "fixed-entered") {
      assert.ok(fixture.constraints.fixedCommitments?.length, `${fixture.id} must carry the existing fixed-order protection boundary`);
    }
  }
});

test("the calibration harness evaluates every considered order with no hard regression", () => {
  const summary = runRouteQualityCalibration();
  const fixturesById = new Map(ROUTE_QUALITY_CALIBRATION_FIXTURES.map((fixture) => [fixture.id, fixture]));

  assert.equal(summary.version, "route-quality-calibration-v1");
  assert.equal(summary.fixtureCount, 20);
  assert.equal(summary.results.length, 20);
  assert.equal(summary.hardFailureCount, 0);
  assert.equal(summary.distribution["CLEARLY POOR"], 0,
    "the accepted deterministic route must remain within a documented good or defensible order");
  assert.equal(summary.nightAllocationDistribution["CLEARLY POOR"], 0,
    "the accepted deterministic allocation must remain inside a documented good or defensible band");
  assert.ok(summary.nightAllocationDistribution.GOOD >= summary.previousNightAllocationDistribution.GOOD,
    "destination-aware marginal allocation must not reduce human-rated GOOD stay splits");
  assert.equal(Object.values(summary.distribution).reduce((total, count) => total + count, 0), 20);
  assert.deepEqual(summary.results.map((result) => result.id), ROUTE_QUALITY_CALIBRATION_FIXTURES.map((fixture) => fixture.id));

  for (const result of summary.results) {
    const fixture = fixturesById.get(result.id)!;
    const stopIds = fixture.stops.map((stop) => stop.id);
    const candidateKeys = new Set(result.candidates.map((candidate) => orderKey(candidate.order)));

    assert.deepEqual(result.originalOrder, stopIds, `${result.id} changed the captured entered order`);
    assert.deepEqual(sortedIds(result.selectedOrder), sortedIds(stopIds), `${result.id} selected an incomplete route`);
    assert.ok(result.candidates.length > 0, `${result.id} considered no viable candidates`);
    assert.ok(
      fixture.humanReview.goodOrders.some((order) => candidateKeys.has(orderKey(order))),
      `${result.id} candidate generation omitted every documented strong order`,
    );
    assert.equal(result.hardConstraintIssues, 0, `${result.id} retained a hard constraint failure`);
    assert.ok(result.selectedScore !== null, `${result.id} needs a selected score`);
    assert.ok(result.selectedTransferMinutes !== null, `${result.id} needs an estimated transfer burden`);
    assert.equal(result.selectedLegs.length, stopIds.length, `${result.id} needs evidence for every arrival/transfer leg`);
    assert.equal(result.nightAllocation.totalAvailableNights, fixture.days - 1, `${result.id} used the wrong night budget`);
    assert.equal(result.nightAllocation.totalAllocatedNights, fixture.days - 1, `${result.id} did not allocate the complete night budget`);
    assert.notEqual(result.nightAllocationQuality, "CLEARLY POOR", `${result.id} produced a clearly poor night split`);
    assert.deepEqual(result.humanReview, fixture.humanReview);

    if (fixture.constraints.fixedStartStopId) assert.equal(result.selectedOrder[0], fixture.constraints.fixedStartStopId, `${result.id} moved the fixed start`);
    if (fixture.constraints.fixedEndStopId) assert.equal(result.selectedOrder.at(-1), fixture.constraints.fixedEndStopId, `${result.id} moved the fixed gateway`);

    for (const candidate of result.candidates) {
      assert.deepEqual(sortedIds(candidate.order), sortedIds(stopIds), `${result.id} emitted an incomplete candidate`);
      assert.equal(candidate.state, "scored", `${result.id} candidate lacks a score breakdown`);
      assert.ok(candidate.rank !== null && candidate.totalScore !== null, `${result.id} candidate lacks ranking totals`);
      assert.ok(candidate.components.length > 0, `${result.id} candidate lacks scoring components`);
      if (fixture.constraints.fixedStartStopId) assert.equal(candidate.order[0], fixture.constraints.fixedStartStopId, `${result.id} candidate moved the fixed start`);
      if (fixture.constraints.fixedEndStopId) assert.equal(candidate.order.at(-1), fixture.constraints.fixedEndStopId, `${result.id} candidate moved the fixed gateway`);
    }
  }
});

test("the comparable calibration output is deterministic without freezing tunable scores", () => {
  assert.deepEqual(
    comparableRouteQualityCalibration(runRouteQualityCalibration()),
    comparableRouteQualityCalibration(runRouteQualityCalibration()),
  );
});
