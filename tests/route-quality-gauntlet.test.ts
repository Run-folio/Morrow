import assert from "node:assert/strict";
import test from "node:test";
import { comparableRouteQualitySnapshot, runRouteQualityGauntlet } from "../benchmarks/route-quality-gauntlet/harness.ts";
import { ROUTE_QUALITY_FIXTURES, ROUTE_QUALITY_VARIANTS } from "../benchmarks/route-quality-gauntlet/fixtures.ts";

test("route-quality gauntlet spans the required trip structures and continents", () => {
  assert.ok(ROUTE_QUALITY_FIXTURES.length >= 18);
  assert.ok(ROUTE_QUALITY_VARIANTS.length >= 12);
  const structures = new Set(ROUTE_QUALITY_FIXTURES.flatMap((fixture) => fixture.structures));
  for (const required of ["linear", "hub-and-spoke", "geographic-outlier", "cross-border", "island-mainland", "multiple-islands", "mountain-remote", "rail-friendly", "driving", "very-short", "long", "many-stop", "loop", "fixed-dates", "attraction-heavy"]) {
    assert.ok(structures.has(required), `missing structure: ${required}`);
  }
  const regions = new Set(ROUTE_QUALITY_FIXTURES.flatMap((fixture) => fixture.regions));
  for (const region of ["Europe", "Asia", "South America", "Oceania", "Africa"]) assert.ok(regions.has(region), `missing region: ${region}`);
});

test("full canonical route-quality pipeline has no objective invariant failures", () => {
  const summary = runRouteQualityGauntlet();
  assert.deepEqual(summary.failedFindings, [], summary.failedFindings.map((item) => `${item.fixtureId}: ${item.layer}/${item.id}: ${item.message}`).join("\n"));
  assert.deepEqual(summary.comparisonFailures, [], summary.comparisonFailures.map((item) => `${item.id}: ${item.observations.join(" ")}`).join("\n"));
});

test("route-quality gauntlet is deterministic through canonical trip, health and Builder output", () => {
  assert.deepEqual(comparableRouteQualitySnapshot(runRouteQualityGauntlet()), comparableRouteQualitySnapshot(runRouteQualityGauntlet()));
});

test("duration, pace and attraction comparisons change only the intended planning dimensions", () => {
  const summary = runRouteQualityGauntlet();
  const durationTotals = [7, 10, 14, 21].map((days) => {
    const result = summary.variantResults.find((item) => item.id === `italy-${days}-days`)!;
    return Object.values(result.output.allocations ?? {}).reduce((total, nights) => total + nights, 0);
  });
  assert.deepEqual(durationTotals, [6, 9, 13, 20]);
  const paceAllocations = ["relaxed", "balanced", "fast"].map((pace) => JSON.stringify(summary.variantResults.find((item) => item.id === `japan-${pace}`)?.output.allocations));
  assert.ok(new Set(paceAllocations).size > 1, "pace must materially affect the exact night split");
  assert.equal(summary.comparisons.find((item) => item.id === "cusco-add-attraction")?.pass, true);
});
