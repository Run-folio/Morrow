import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { comparableSnapshot, compareSnapshots, runBenchmarks, type BenchmarkResult, type BenchmarkStatus } from "./harness.ts";
import { ENGINE_V2_BASELINE_BENCHMARKS, ENGINE_V2_BENCHMARKS } from "./trips.ts";

type Snapshot = ReturnType<typeof comparableSnapshot>;

const count = (result: BenchmarkResult, status: BenchmarkStatus) => result.findings.filter((item) => item.status === status).length;
const pad = (value: string | number, width: number) => String(value).padEnd(width);

const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
console.log(`${pad("Benchmark", 36)} ${pad("Pass", 6)} ${pad("Warn", 6)} Fail`);
summary.results.forEach((result) => console.log(`${pad(result.name, 36)} ${pad(count(result, "pass"), 6)} ${pad(count(result, "warning"), 6)} ${count(result, "fail")}`));
console.log(`\nTotals: ${summary.totals.pass} pass · ${summary.totals.warning} warnings · ${summary.totals.fail} failures`);
console.log("\nDimensions");
Object.entries(summary.dimensions).forEach(([dimension, statuses]) => console.log(`${pad(dimension, 24)} ${statuses.pass} pass · ${statuses.warning} warnings · ${statuses.fail} failures`));

const current = comparableSnapshot(summary);
if (process.argv.includes("--json")) console.log(`\n${JSON.stringify(current, null, 2)}`);

const transportFeasibilityDelta = [
  "route-efficiency (regression): -2 pass, +2 warning, +0 fail",
  "transfer-quality (regression): -2 pass, +2 warning, +0 fail",
  "preference-fit (improvement): +2 pass, +0 warning, -2 fail",
  "morocco-family-access: resolved failures — no-driving",
  "morocco-family-access: new warnings — route-comparison, transfer-estimates-present",
  "morocco-family-access: route output changed",
  "canada-accessible-no-drive: resolved failures — no-driving",
  "canada-accessible-no-drive: new warnings — route-comparison, transfer-estimates-present",
  "canada-accessible-no-drive: route output changed",
];

const historicalBaselinePath = fileURLToPath(new URL("./baseline.json", import.meta.url));
const phaseOneBaselinePath = fileURLToPath(new URL("./phase-1-baseline.json", import.meta.url));

try {
  const historicalBaseline = JSON.parse(readFileSync(historicalBaselinePath, "utf8")) as Snapshot;
  const originalCohortCurrent = comparableSnapshot(runBenchmarks(ENGINE_V2_BASELINE_BENCHMARKS));
  if (JSON.stringify(historicalBaseline) === JSON.stringify(originalCohortCurrent)) {
    console.log("\nHistorical first-ten comparison: no change.");
  } else {
    console.log("\nHistorical first-ten comparison: CHANGED since the preserved pre-candidate snapshot.");
    compareSnapshots(historicalBaseline, originalCohortCurrent).forEach((line) => console.log(`- ${line}`));
  }
} catch (error) {
  console.error(`\nHistorical comparison unavailable: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

try {
  const phaseOneBaseline = JSON.parse(readFileSync(phaseOneBaselinePath, "utf8")) as Snapshot;
  if (JSON.stringify(phaseOneBaseline) === JSON.stringify(current)) {
    console.log("\nPhase-one 23-trip comparison: no change.");
  } else {
    console.log("\nPhase-one 23-trip comparison: CHANGED. Inspect improvements and regressions by dimension before accepting an engine change.");
    const comparison = compareSnapshots(phaseOneBaseline, current);
    comparison.forEach((line) => console.log(`- ${line}`));
    if (JSON.stringify(comparison) === JSON.stringify(transportFeasibilityDelta)) {
      console.log("Phase-one gate: accepted transport-feasibility delta; the original snapshot remains preserved.");
    } else {
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(`\nPhase-one comparison unavailable: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
