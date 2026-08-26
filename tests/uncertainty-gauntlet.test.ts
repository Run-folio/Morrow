import assert from "node:assert/strict";
import test from "node:test";
import { UNCERTAINTY_GAUNTLET, comparableUncertaintySnapshot, runUncertaintyGauntlet } from "../benchmarks/uncertainty-gauntlet/harness.ts";

test("uncertainty gauntlet records at least eighteen high-signal cases across every boundary", () => {
  assert.ok(UNCERTAINTY_GAUNTLET.length >= 18);
  assert.deepEqual([...new Set(UNCERTAINTY_GAUNTLET.map((scenario) => scenario.domain))].sort(), ["cost-availability", "date-lifecycle", "geography", "hostile-input", "provider-state", "transport"]);
});

test("uncertainty gauntlet refuses false certainty and preserves protected state", async () => {
  const summary = await runUncertaintyGauntlet();
  assert.equal(summary.hardFailureCount, 0, summary.results.flatMap((result) => result.findings.filter((finding) => finding.status === "fail").map((finding) => `${result.id}: ${finding.message}`)).join("\n"));
});

test("uncertainty gauntlet is deterministic across two complete runs", async () => {
  assert.deepEqual(comparableUncertaintySnapshot(await runUncertaintyGauntlet()), comparableUncertaintySnapshot(await runUncertaintyGauntlet()));
});
