import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { comparableSnapshot, compareSnapshots, runBenchmarks, type BenchmarkResult, type BenchmarkStatus } from "./harness.ts";
import { ENGINE_V2_BENCHMARKS } from "./trips.ts";

type Snapshot = ReturnType<typeof comparableSnapshot>;

const count = (result: BenchmarkResult, status: BenchmarkStatus) => result.findings.filter((item) => item.status === status).length;
const pad = (value: string | number, width: number) => String(value).padEnd(width);

const summary = runBenchmarks(ENGINE_V2_BENCHMARKS);
console.log(`${pad("Benchmark", 36)} ${pad("Pass", 6)} ${pad("Warn", 6)} Fail`);
summary.results.forEach((result) => console.log(`${pad(result.name, 36)} ${pad(count(result, "pass"), 6)} ${pad(count(result, "warning"), 6)} ${count(result, "fail")}`));
console.log(`\nTotals: ${summary.totals.pass} pass · ${summary.totals.warning} warnings · ${summary.totals.fail} failures`);
console.log("\nDimensions");
Object.entries(summary.dimensions).forEach(([dimension, statuses]) => console.log(`${pad(dimension, 24)} ${statuses.pass} pass · ${statuses.warning} warnings · ${statuses.fail} failures`));

const baselinePath = fileURLToPath(new URL("./baseline.json", import.meta.url));
const current = comparableSnapshot(summary);
if (process.argv.includes("--json")) console.log(`\n${JSON.stringify(current, null, 2)}`);

try {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Snapshot;
  if (JSON.stringify(baseline) === JSON.stringify(current)) {
    console.log("\nBaseline comparison: no change.");
  } else {
    console.log("\nBaseline comparison: CHANGED. Inspect the JSON diff before accepting an engine change.");
    compareSnapshots(baseline, current).forEach((line) => console.log(`- ${line}`));
    const aggregateRegression = current.totals.fail > baseline.totals.fail
      || current.totals.warning > baseline.totals.warning
      || current.totals.pass < baseline.totals.pass;
    if (aggregateRegression) process.exitCode = 1;
    else console.log("Baseline gate: changed without an aggregate pass/warning/failure regression.");
  }
} catch (error) {
  console.error(`\nBaseline comparison unavailable: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
