import assert from "node:assert/strict";
import test from "node:test";
import { CONSTRAINT_GAUNTLET_CASES } from "../benchmarks/constraint-gauntlet/fixtures.ts";
import { comparableConstraintHardOutcomes, runConstraintGauntlet } from "../benchmarks/constraint-gauntlet/harness.ts";

test("constraint gauntlet records at least twelve complete high-signal scenarios", () => {
  assert.ok(CONSTRAINT_GAUNTLET_CASES.length >= 12);
  assert.equal(new Set(CONSTRAINT_GAUNTLET_CASES.map((scenario) => scenario.id)).size, CONSTRAINT_GAUNTLET_CASES.length);
  for (const scenario of CONSTRAINT_GAUNTLET_CASES) {
    assert.ok(scenario.hardFacts.length > 0, scenario.id);
    assert.ok(scenario.possibleSoftCompromise, scenario.id);
    assert.ok(scenario.prohibitedPlannerBehaviour.length >= 2, scenario.id);
  }
});

test("hard constraints, repairs, validator and builder gate agree across the gauntlet", () => {
  const summary = runConstraintGauntlet();
  assert.deepEqual(summary.expectationFailures, []);
  assert.equal(summary.hardFailureCount, summary.expectedHardFailureCount);
  assert.equal(summary.results.some((result) => result.builder.outcome === "valid-but-poor"), true);
  assert.equal(summary.results.some((result) => result.builder.outcome === "constrained-compromise"), true);
  assert.equal(summary.results.some((result) => result.builder.outcome === "impossible"), true);
  assert.equal(summary.results.some((result) => result.builder.outcome === "valid"), true);
});

test("two deterministic runs produce identical hard outcomes", () => {
  const first = comparableConstraintHardOutcomes(runConstraintGauntlet());
  const second = comparableConstraintHardOutcomes(runConstraintGauntlet());
  assert.deepEqual(first, second);
});
