import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { comparableSnapshot, compareSnapshots, runBenchmarks } from "../benchmarks/engine-v2/harness.ts";
import {
  ENGINE_V2_BASELINE_BENCHMARKS,
  ENGINE_V2_BENCHMARKS,
  ENGINE_V2_EXPANSION_BENCHMARKS,
} from "../benchmarks/engine-v2/trips.ts";

test("the original ten benchmarks remain an explicit unchanged cohort", () => {
  assert.equal(ENGINE_V2_BASELINE_BENCHMARKS.length, 10);
  assert.deepEqual(ENGINE_V2_BASELINE_BENCHMARKS.map((scenario) => scenario.id), [
    "sea-anchor",
    "japan-classic-alps",
    "balkans",
    "italy-train",
    "iberia-long-finish",
    "china-regions",
    "slow-three-bases",
    "fast-central-europe",
    "fixed-gateways",
    "overpacked-europe",
  ]);
});

test("phase one expands the suite to 23 distinct, reviewable trips", () => {
  assert.equal(ENGINE_V2_EXPANSION_BENCHMARKS.length, 13);
  assert.equal(ENGINE_V2_BENCHMARKS.length, 23);
  assert.equal(new Set(ENGINE_V2_BENCHMARKS.map((scenario) => scenario.id)).size, 23);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.coverage.length > 0), true);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.requirements.mustInclude.length > 0), true);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.expectedCharacteristics.length > 0), true);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.unacceptableFailures.length > 0), true);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.usefulWarnings.length > 0), true);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.acceptableVariations.length > 0), true);
  assert.equal(ENGINE_V2_BENCHMARKS.every((scenario) => scenario.review.length > 0), true);

  const tags = new Set(ENGINE_V2_BENCHMARKS.flatMap((scenario) => scenario.coverage));
  for (const requiredTag of [
    "south-america", "island-hopping", "ferry", "scandinavia", "central-asia", "africa",
    "mixed-transport", "road-trip", "no-driving", "budget-aware", "family", "mobility-needs",
    "honeymoon", "backpacking", "fixed-booking", "overpacked", "seven-plus-stops",
  ] as const) assert.equal(tags.has(requiredTag), true, `missing coverage tag ${requiredTag}`);
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
  const summary = runBenchmarks(ENGINE_V2_BASELINE_BENCHMARKS);
  const fixedGateway = summary.results.find((result) => result.id === "fixed-gateways");
  const overpacked = summary.results.find((result) => result.id === "overpacked-europe");
  assert.equal(summary.totals.fail, 0);
  assert.equal(fixedGateway?.output.stopIds.at(-1), "ho-chi-minh-city");
  assert.notEqual(overpacked?.output.routeState, "insufficient-data");
});

test("every benchmark exposes deterministic scoring without rewriting historical findings", () => {
  const first = runBenchmarks(ENGINE_V2_BASELINE_BENCHMARKS);
  const second = runBenchmarks(ENGINE_V2_BASELINE_BENCHMARKS);
  assert.equal(first.results.every((result) => result.output.score !== null), true);
  assert.equal(first.results.every((result) => Object.keys(result.output.scoreComponents).length === 5), true);
  assert.equal(first.results.every((result) => result.output.scoreExplanation.length > 0 && result.output.candidateCount > 0), true);
  assert.deepEqual(
    first.results.map((result) => ({ id: result.id, score: result.output.score, components: result.output.scoreComponents, penalties: result.output.scorePenalties, scoredWinnerStopIds: result.output.scoredWinnerStopIds, stopIds: result.output.stopIds, doorToDoorMinutes: result.output.doorToDoorMinutes, headlineTransportMinutes: result.output.headlineTransportMinutes })),
    second.results.map((result) => ({ id: result.id, score: result.output.score, components: result.output.scoreComponents, penalties: result.output.scorePenalties, scoredWinnerStopIds: result.output.scoredWinnerStopIds, stopIds: result.output.stopIds, doorToDoorMinutes: result.output.doorToDoorMinutes, headlineTransportMinutes: result.output.headlineTransportMinutes })),
  );
});

test("benchmarks expose realistic transfer impact and reject suspicious optimism", () => {
  const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
  assert.equal(summary.results.every((result) => result.output.doorToDoorMinutes !== null
    || result.findings.some((finding) => finding.id === "transfer-estimates-present" && finding.status === "warning")), true);
  assert.equal(summary.results.every((result) => result.findings.find((finding) => finding.id === "no-obviously-optimistic-transfer")?.status === "pass"), true);
  assert.equal(summary.results.some((result) => result.output.mostDayLegs > 0 || result.output.fullDayLegs > 0), true);
});

test("benchmarks measure night allocation by invariants rather than one prescribed split", () => {
  const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
  assert.equal(summary.results.every((result) => result.output.nightAllocationState !== "conflict"), true);
  assert.equal(summary.results.every((result) => result.output.allocatedNights === result.output.availableNights), true);
  assert.equal(summary.results.every((result) => result.findings.find((finding) => finding.id === "night-total-reconciled")?.status === "pass"), true);
  assert.equal(summary.results.some((result) => result.output.nightAllocationState === "compromised"), true);
});

test("benchmarks run the independent critic and keep automatic repair bounded", () => {
  const summary = runBenchmarks(ENGINE_V2_BASELINE_BENCHMARKS);
  assert.equal(summary.results.every((result) => result.output.hardValidationIssues === 0), true);
  assert.equal(summary.results.every((result) => result.output.repairIterations <= 3), true);
  assert.equal(summary.results.every((result) => result.findings.find((finding) => finding.id === "post-generation-hard-validity")?.status === "pass"), true);
  assert.equal(summary.results.every((result) => result.findings.find((finding) => finding.id === "repair-loop-bounded")?.status === "pass"), true);
  assert.equal(summary.results.every((result) => !result.output.repeatedRepairStateDetected), true);
  assert.equal(summary.results.every((result) => ["valid", "no-repairable-issue", "no-safe-improvement", "iteration-limit"].includes(result.output.repairTerminationReason)), true);
});

test("expanded cases cover bounded generation, fixed commitments, and structured impossibility", () => {
  const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
  const islands = summary.results.find((result) => result.id === "indonesia-seven-islands");
  const booking = summary.results.find((result) => result.id === "india-honeymoon-booking");
  const impossible = summary.results.find((result) => result.id === "impossible-required-maximum");

  assert.ok((islands?.output.candidateCount ?? 0) > 0);
  assert.ok((islands?.output.candidateCount ?? 0) <= 20);
  assert.equal(booking?.output.routeState, "current-order");
  assert.deepEqual(booking?.output.stopIds, ["delhi", "agra", "jaipur", "udaipur", "mumbai"]);
  assert.equal(impossible?.output.routeState, "insufficient-data");
  assert.equal(impossible?.output.candidateCount, 0);
  assert.equal(impossible?.output.routeConstraintIssueCodes.includes("required-stops-exceed-maximum"), true);
  assert.equal(impossible?.output.routeConstraintIssueCodes.includes("maximum-stops-exceeded"), true);
  assert.equal(impossible?.findings.find((finding) => finding.id === "expected-conflict-surfaced")?.status, "pass");
  assert.ok((impossible?.output.hardValidationIssues ?? 0) > 0);
});

test("the preserved phase-one snapshot permits only the documented transport-feasibility delta", () => {
  const path = fileURLToPath(new URL("../benchmarks/engine-v2/phase-1-baseline.json", import.meta.url));
  const recorded = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(recorded.totals, { pass: 329, warning: 46, fail: 2 });
  assert.deepEqual(compareSnapshots(recorded, comparableSnapshot(runBenchmarks(ENGINE_V2_BENCHMARKS))), [
    "route-efficiency (regression): -2 pass, +2 warning, +0 fail",
    "transfer-quality (regression): -2 pass, +2 warning, +0 fail",
    "preference-fit (improvement): +2 pass, +0 warning, -2 fail",
    "morocco-family-access: resolved failures — no-driving",
    "morocco-family-access: new warnings — route-comparison, transfer-estimates-present",
    "morocco-family-access: route output changed",
    "canada-accessible-no-drive: resolved failures — no-driving",
    "canada-accessible-no-drive: new warnings — route-comparison, transfer-estimates-present",
    "canada-accessible-no-drive: route output changed",
  ]);
});

test("snapshot comparison labels dimension regressions and per-trip warning changes", () => {
  const before = comparableSnapshot(runBenchmarks([ENGINE_V2_BASELINE_BENCHMARKS[0]!]));
  const after = structuredClone(before);
  after.dimensions.pacing.warning += 1;
  after.totals.warning += 1;
  after.results[0]!.warnings.push("synthetic-warning");

  const comparison = compareSnapshots(before, after);
  assert.equal(comparison.some((line) => line.startsWith("pacing (regression):")), true);
  assert.equal(comparison.some((line) => line.includes("new warnings — synthetic-warning")), true);
});

test("benchmarks reject unsupported certainty without rewarding vague claims", () => {
  const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
  assert.equal(summary.results.every((result) => result.findings.find((finding) => finding.id === "claims-qualified")?.status === "pass"), true);
  assert.equal(summary.results.every((result) => result.output.scoreConfidenceState !== "verified"), true);
  assert.equal(summary.results.every((result) => result.output.scoreNeedsConfirmation), true);
  assert.equal(summary.results.every((result) => result.output.datedScheduleLegs === 0), true);
});
