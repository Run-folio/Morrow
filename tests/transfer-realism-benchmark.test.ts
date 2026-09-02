import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { TRANSFER_REALISM_FIXTURES } from "../benchmarks/transfer-realism/fixtures.ts";
import { comparableTransferBenchmarkSnapshot, runTransferRealismBenchmark } from "../benchmarks/transfer-realism/harness.ts";

const requiredCategories = [
  "normal-road", "strong-rail", "normal-flight", "gateway-mixed", "road-vs-rail",
  "road-vs-flight", "rail-vs-flight", "cross-border-terrestrial", "island-water",
  "remote-destination", "ambiguous-unsupported",
] as const;

const requiredRegions = ["europe", "east-asia", "southeast-asia", "south-asia", "north-america", "latin-america", "africa", "oceania"];

test("the permanent benchmark contains 28 diverse, human-reviewed legs", () => {
  assert.equal(TRANSFER_REALISM_FIXTURES.length, 28);
  assert.equal(new Set(TRANSFER_REALISM_FIXTURES.map((fixture) => fixture.id)).size, 28);
  assert.deepEqual([...new Set(TRANSFER_REALISM_FIXTURES.map((fixture) => fixture.region))].sort(), [...requiredRegions].sort());
  const categories = new Set(TRANSFER_REALISM_FIXTURES.flatMap((fixture) => fixture.categories));
  requiredCategories.forEach((category) => assert.equal(categories.has(category), true, `missing ${category}`));
  assert.ok(TRANSFER_REALISM_FIXTURES.filter((fixture) => fixture.expectedMixed).length >= 3);
  assert.ok(TRANSFER_REALISM_FIXTURES.filter((fixture) => fixture.preferredMode === "unknown").length >= 2);
  assert.ok(TRANSFER_REALISM_FIXTURES.filter((fixture) => fixture.preferredMode === "train").length >= 8);
});

test("fixture expectations are non-brittle, complete and internally consistent", () => {
  for (const fixture of TRANSFER_REALISM_FIXTURES) {
    assert.ok(fixture.rationale.length >= 40, `${fixture.id} needs a substantive rationale`);
    assert.ok(fixture.acceptableModes.includes(fixture.preferredMode), `${fixture.id} preferred mode must be acceptable`);
    assert.equal(fixture.acceptableModes.some((mode) => fixture.unacceptableModes.includes(mode)), false, `${fixture.id} mode sets overlap`);
    assert.equal(new Set([...fixture.acceptableModes, ...fixture.unacceptableModes]).size, 7, `${fixture.id} must classify every canonical mode`);
    if (fixture.approximateDurationRange) {
      assert.ok(fixture.approximateDurationRange.minMinutes < fixture.approximateDurationRange.maxMinutes, `${fixture.id} needs a useful duration range`);
      assert.ok(fixture.approximateDurationRange.maxMinutes - fixture.approximateDurationRange.minMinutes >= 60, `${fixture.id} duration range is too brittle`);
    }
  }
});

test("the untouched P0B baseline remains recorded separately from generalized fixes", () => {
  const path = fileURLToPath(new URL("../benchmarks/transfer-realism/p0b-baseline.json", import.meta.url));
  const baseline = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(baseline.statuses, { correct: 24, "acceptable-not-ideal": 0, "clearly-wrong": 4 });
  assert.equal(baseline.metrics.preferredMode.percent, 85.7);
  assert.equal(baseline.metrics.gatewayComposition.percent, 66.7);
  assert.equal(baseline.metrics.providerEfficiency.calls, 15);
  assert.deepEqual(
    baseline.results.filter((result: { status: string }) => result.status === "clearly-wrong").map((result: { id: string }) => result.id),
    ["paris-amsterdam-rail", "london-edinburgh-rail", "hanoi-hoi-an-mixed", "salzburg-munich-terrestrial"],
  );
});

test("the pre-generalized-rail 25/28 baseline remains frozen", () => {
  const path = fileURLToPath(new URL("../benchmarks/transfer-realism/pre-generalized-rail-baseline.json", import.meta.url));
  const baseline = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(baseline.statuses, { correct: 25, "acceptable-not-ideal": 0, "clearly-wrong": 3 });
  assert.equal(baseline.metrics.preferredMode.percent, 89.3);
  assert.equal(baseline.metrics.providerEfficiency.calls, 14);
  assert.deepEqual(baseline.clearlyWrong.map((result: { id: string }) => result.id), [
    "paris-amsterdam-rail",
    "london-edinburgh-rail",
    "salzburg-munich-terrestrial",
  ]);
});

test("the deterministic benchmark is repeatable and matches the reviewed final baseline", async () => {
  const first = await runTransferRealismBenchmark();
  const second = await runTransferRealismBenchmark();
  assert.deepEqual(comparableTransferBenchmarkSnapshot(first), comparableTransferBenchmarkSnapshot(second));
  const path = fileURLToPath(new URL("../benchmarks/transfer-realism/baseline.json", import.meta.url));
  assert.deepEqual(comparableTransferBenchmarkSnapshot(first), JSON.parse(readFileSync(path, "utf8")));
});

test("final engine defects are cleared while knowledge gaps and appropriate unknowns stay explicit", async () => {
  const summary = await runTransferRealismBenchmark();
  assert.deepEqual(summary.statuses, { correct: 28, "acceptable-not-ideal": 0, "clearly-wrong": 0 });
  assert.equal(summary.metrics.preferredMode.percent, 100);
  assert.equal(summary.metrics.acceptableMode.percent, 100);
  assert.equal(summary.metrics.durationPlausibility.percent, 100);
  assert.equal(summary.metrics.gatewayComposition.percent, 100);
  assert.equal(summary.metrics.segmentIntegrity.percent, 100);
  assert.equal(summary.metrics.determinism.percent, 100);
  assert.equal(summary.metrics.providerEfficiency.percent, 100);
  assert.equal(summary.metrics.providerEfficiency.duplicateCalls, 0);
  assert.deepEqual(summary.failureCategories, { J_unknown_is_appropriate: 2 });
  assert.equal(summary.results.some((result) => result.failureOwnership === "engine" || result.failureOwnership === "mixed"), false);
});

test("benchmark diagnostics remain outside the production analytics payload", () => {
  const analytics = readFileSync(fileURLToPath(new URL("../lib/analytics.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(analytics, /multimodalResolution|selectedCandidateId|air_gateway_composition/);
});
