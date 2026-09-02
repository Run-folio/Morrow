import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  comparableTransferBenchmarkSnapshot,
  runTransferRealismBenchmark,
  type TransferBenchmarkFailureCategory,
  type TransferBenchmarkProviderFactory,
} from "./harness.ts";
import { TRANSFER_REALISM_FIXTURES } from "./fixtures.ts";

const live = process.argv.includes("--live");
const fixtureId = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice("--fixture=".length);
const selected = TRANSFER_REALISM_FIXTURES.filter((fixture) => !fixtureId || fixture.id === fixtureId);
if (!selected.length) throw new Error("No transfer-realism fixture matched the requested selection.");

let providerFactory: TransferBenchmarkProviderFactory | undefined;
let fixtures = selected;
if (live) {
  if (!process.env.OPENROUTESERVICE_API_KEY?.trim()) {
    console.log("Transfer realism live smoke skipped: OPENROUTESERVICE_API_KEY is not configured.");
    process.exit(0);
  }
  const { OpenRouteServiceRoadRoutingProvider } = await import("../../lib/easyt/road-routing.ts");
  providerFactory = () => new OpenRouteServiceRoadRoutingProvider();
  const smokeIds = new Set(["huacachina-lima-road", "los-angeles-san-diego-road", "zanzibar-airport-nungwi-road"]);
  fixtures = selected.filter((fixture) => smokeIds.has(fixture.id));
  if (!fixtures.length) fixtures = selected.slice(0, 3);
}

const summary = await runTransferRealismBenchmark({ mode: live ? "live" : "deterministic", fixtures, providerFactory });
const snapshot = comparableTransferBenchmarkSnapshot(summary);
const pad = (value: string | number, width: number) => String(value).padEnd(width);
const ratio = (metric: { correct?: number; plausible?: number; count?: number; total?: number; assessed?: number; percent: number }) => {
  const numerator = metric.correct ?? metric.plausible ?? metric.count ?? 0;
  const denominator = metric.total ?? metric.assessed ?? 0;
  return `${numerator}/${denominator} (${metric.percent}%)`;
};

console.log(`Transfer realism benchmark · ${summary.mode}`);
console.log(`${pad("Fixture", 40)} ${pad("Expected", 10)} ${pad("Selected", 10)} ${pad("Status", 22)} Duration / calls`);
summary.results.forEach((result) => {
  console.log(`${pad(result.id, 40)} ${pad(result.preferredMode, 10)} ${pad(result.selectedMode, 10)} ${pad(result.status, 22)} ${result.durationMinutes ?? "?"}m / ${result.providerCalls}`);
});

console.log(`\nFixtures: ${summary.fixtureCount} across ${summary.regions.length} regions`);
console.log(`Outcomes: ${summary.statuses.correct} correct · ${summary.statuses["acceptable-not-ideal"]} acceptable but not ideal · ${summary.statuses["clearly-wrong"]} clearly wrong`);
console.log(`Preferred-mode accuracy: ${ratio(summary.metrics.preferredMode)}`);
console.log(`Acceptable-mode accuracy: ${ratio(summary.metrics.acceptableMode)}`);
console.log(`Clearly-wrong rate: ${summary.metrics.clearlyWrong.count}/${summary.metrics.clearlyWrong.total} (${summary.metrics.clearlyWrong.percent}%)`);
console.log(`Unknown rate: ${summary.metrics.unknown.count}/${summary.metrics.unknown.total} (${summary.metrics.unknown.percent}%); ${summary.metrics.unknown.appropriate} appropriate`);
console.log(`Duration plausibility: ${ratio(summary.metrics.durationPlausibility)}`);
console.log(`Gateway composition: ${ratio(summary.metrics.gatewayComposition)}`);
console.log(`Segment integrity: ${ratio(summary.metrics.segmentIntegrity)}`);
console.log(`Determinism: ${ratio(summary.metrics.determinism)}`);
console.log(`Provider efficiency: ${summary.metrics.providerEfficiency.calls}/${summary.metrics.providerEfficiency.allowedCalls} calls; ${summary.metrics.providerEfficiency.efficientFixtures}/${summary.metrics.providerEfficiency.totalFixtures} fixtures within limit; ${summary.metrics.providerEfficiency.duplicateCalls} duplicate calls`);

const categorized = new Map<TransferBenchmarkFailureCategory, typeof summary.results>();
summary.results.forEach((result) => result.failureCategories.forEach((category) => categorized.set(category, [...(categorized.get(category) ?? []), result])));
if (categorized.size) {
  console.log("\nFailure and uncertainty categories");
  [...categorized.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([category, results]) => {
    console.log(`${category}: ${results.map((result) => `${result.route} (${result.selectedMode})`).join("; ")}`);
  });
}

if (process.argv.includes("--json")) console.log(`\n${JSON.stringify(snapshot, null, 2)}`);

const baselinePath = fileURLToPath(new URL("./baseline.json", import.meta.url));
const p0bBaselinePath = fileURLToPath(new URL("./p0b-baseline.json", import.meta.url));
const acceptingP0B = process.argv.includes("--accept-p0b-baseline");
const acceptingFinal = process.argv.includes("--accept");
if (acceptingP0B || acceptingFinal) {
  if (process.env.MORROVIA_TRANSFER_BENCHMARK_ACCEPT !== "yes") {
    throw new Error("Baseline acceptance requires MORROVIA_TRANSFER_BENCHMARK_ACCEPT=yes.");
  }
  writeFileSync(acceptingP0B ? p0bBaselinePath : baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`\nAccepted ${acceptingP0B ? "untouched P0B" : "final"} transfer-realism baseline.`);
} else if (!live && !fixtureId) {
  try {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    if (JSON.stringify(baseline) === JSON.stringify(snapshot)) console.log("\nStored final baseline: no change.");
    else {
      console.error("\nStored final baseline: CHANGED. Review benchmark diagnostics before accepting.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\nStored final baseline unavailable: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
