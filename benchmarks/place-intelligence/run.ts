import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  comparablePlaceSnapshot,
  comparePlaceSnapshots,
  runPlaceIntelligenceBenchmarks,
  type ComparablePlaceSnapshot,
  type PlaceBenchmarkResult,
  type PlaceBenchmarkStatus,
} from "./harness.ts";

const pad = (value: string | number, width: number) => String(value).padEnd(width);
const count = (result: PlaceBenchmarkResult, status: PlaceBenchmarkStatus) => result.findings.filter((item) => item.status === status).length;
const summary = runPlaceIntelligenceBenchmarks();
const current = comparablePlaceSnapshot(summary);

console.log(`${pad("Fixture", 42)} ${pad("Pass", 6)} ${pad("Warn", 6)} Fail`);
summary.results.forEach((result) => {
  console.log(`${pad(result.name, 42)} ${pad(count(result, "pass"), 6)} ${pad(count(result, "warning"), 6)} ${count(result, "fail")}`);
});

console.log(`\nFixtures: ${summary.fixtureCount}`);
console.log(`Totals: ${summary.totals.pass} pass · ${summary.totals.warning} warnings · ${summary.totals.fail} failures`);
console.log("\nDimensions");
Object.entries(summary.dimensions).forEach(([dimension, statuses]) => {
  console.log(`${pad(dimension, 32)} ${statuses.pass} pass · ${statuses.warning} warnings · ${statuses.fail} failures`);
});

if (process.argv.includes("--json")) console.log(`\n${JSON.stringify(current, null, 2)}`);

const baselinePath = fileURLToPath(new URL("./accepted-baseline.json", import.meta.url));
if (process.argv.includes("--accept")) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  console.log("\nAccepted baseline updated from the current deterministic benchmark output.");
} else {
  try {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as ComparablePlaceSnapshot;
    const changes = comparePlaceSnapshots(baseline, current);
    if (!changes.length) console.log("\nAccepted baseline comparison: no change.");
    else {
      console.error("\nAccepted baseline comparison: CHANGED. Review place-resolution and projection deltas before accepting a new baseline.");
      changes.forEach((change) => console.error(`- ${change}`));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\nAccepted baseline comparison unavailable: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
