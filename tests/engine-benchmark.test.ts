import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runBenchmarks } from "../benchmarks/engine-v2/harness.ts";
import { ENGINE_V2_BENCHMARKS } from "../benchmarks/engine-v2/trips.ts";

test("the first engine benchmark set contains ten uniquely identified trips", () => {
  assert.equal(ENGINE_V2_BENCHMARKS.length, 10);
  assert.equal(new Set(ENGINE_V2_BENCHMARKS.map((scenario) => scenario.id)).size, 10);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.review.length > 0), true);
});

test("every benchmark keeps machine findings separate from qualitative review", () => {
  const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
  assert.equal(summary.results.every((result) => result.findings.length > 0), true);
  assert.equal(summary.results.every((result) => result.qualitativeReview.length > 0), true);
});

test("the recorded pre-candidate baseline remains unchanged", () => {
  const path = fileURLToPath(new URL("../benchmarks/engine-v2/baseline.json", import.meta.url));
  const baseline = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(baseline.totals, { pass: 97, warning: 9, fail: 1 });
});

test("candidate generation resolves fixed gateways and the seven-stop comparison without new failures", () => {
  const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
  const fixedGateway = summary.results.find((result) => result.id === "fixed-gateways");
  const overpacked = summary.results.find((result) => result.id === "overpacked-europe");
  assert.equal(summary.totals.fail, 0);
  assert.equal(fixedGateway?.output.stopIds.at(-1), "ho-chi-minh-city");
  assert.notEqual(overpacked?.output.routeState, "insufficient-data");
});
