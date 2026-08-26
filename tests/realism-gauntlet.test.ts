import assert from "node:assert/strict";
import test from "node:test";
import { comparableRealismSnapshot, runRealismGauntlet } from "../benchmarks/realism-gauntlet/harness.ts";
import { REALISM_GAUNTLET } from "../benchmarks/realism-gauntlet/fixtures.ts";

test("realism gauntlet covers at least fifteen recorded high-signal cases", () => {
  assert.ok(REALISM_GAUNTLET.length >= 15);
  for (const fixture of REALISM_GAUNTLET) {
    assert.ok(fixture.hardFacts.length > 0);
    assert.ok(fixture.hardConcern);
    assert.ok(fixture.possibleSoftCompromise);
    assert.ok(fixture.prohibitedPlannerBehaviour.length > 0);
  }
});

test("realism gauntlet has no hard quality failures", () => {
  const summary = runRealismGauntlet();
  assert.equal(summary.hardFailureCount, 0, summary.results.flatMap((result) => result.findings.filter((item) => item.status === "fail").map((item) => `${result.id}: ${item.id}: ${item.message}`)).join("\n"));
});

test("realism gauntlet produces identical hard outcomes twice", () => {
  assert.deepEqual(comparableRealismSnapshot(runRealismGauntlet()), comparableRealismSnapshot(runRealismGauntlet()));
});

test("slow and fast pace produce different exact night splits for identical destinations", () => {
  const summary = runRealismGauntlet();
  const slow = summary.results.find((result) => result.id === "slow-pace-identical-route")?.output.allocations;
  const fast = summary.results.find((result) => result.id === "fast-pace-identical-route")?.output.allocations;
  assert.notDeepEqual(slow, fast);
  assert.equal(Object.values(slow ?? {}).reduce((total, nights) => total + nights, 0), 14);
  assert.equal(Object.values(fast ?? {}).reduce((total, nights) => total + nights, 0), 14);
});
