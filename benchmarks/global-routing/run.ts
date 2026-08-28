import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GLOBAL_ROUTING_CAPABILITIES, comparableGlobalRoutingSnapshot, compareGlobalRoutingSnapshots, runGlobalRoutingBenchmark, type ComparableGlobalRoutingSnapshot, type GlobalRoutingIntentResult } from "./harness.ts";
import { GLOBAL_ROUTING_FIXTURES } from "./fixtures.ts";

const live = process.argv.includes("--live");
const fixtureArg = process.argv.find((argument) => argument.startsWith("--fixture="))?.slice("--fixture=".length);
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="))?.slice("--limit=".length);
const limit = limitArg ? Number(limitArg) : undefined;
const selected = GLOBAL_ROUTING_FIXTURES
  .filter((fixture) => !fixtureArg || fixture.id === fixtureArg)
  .slice(0, Number.isInteger(limit) && (limit ?? 0) > 0 ? limit : undefined);
if (!selected.length) throw new Error("No global-routing fixtures matched the requested selection.");

let extractIntent: ((fixture: typeof GLOBAL_ROUTING_FIXTURES[number]) => Promise<GlobalRoutingIntentResult>) | undefined;
let placeProvider: ((fixture: typeof GLOBAL_ROUTING_FIXTURES[number]) => import("../../lib/easyt/place-intelligence.ts").PlaceIntelligenceProvider) | undefined;
if (live) {
  if (process.env.MORROVIA_GLOBAL_ROUTING_LIVE !== "yes") throw new Error("Live mode requires MORROVIA_GLOBAL_ROUTING_LIVE=yes.");
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("Live mode requires OPENAI_API_KEY.");
  const [{ default: OpenAI }, { createOpenAISemanticIntentProvider }, { evaluateSemanticIntentShadow }, { createNominatimPlaceProvider }] = await Promise.all([
    import("openai"),
    import("../../lib/easyt/openai-semantic-intent.server.ts"),
    import("../../lib/easyt/semantic-trip-intent.ts"),
    import("../../lib/easyt/nominatim-place.server.ts"),
  ]);
  // Pass the SDK client explicitly because this CLI runs outside Next's
  // server-only module transform while retaining the production provider.
  const provider = createOpenAISemanticIntentProvider({ tier: "primary", client: new OpenAI() });
  const nominatim = createNominatimPlaceProvider();
  placeProvider = () => nominatim;
  extractIntent = async (fixture) => {
    const result = await evaluateSemanticIntentShadow(fixture.prompt, { mode: "active", provider, timeoutMs: 20_000 });
    return {
      intent: result.intent,
      error: result.status === "completed" ? undefined : `semantic extraction status: ${result.status}`,
      telemetry: {
        model: provider.model,
        latencyMs: result.latencyMs,
        usage: result.usage,
        cost: result.cost,
      },
    };
  };
}

const summary = await runGlobalRoutingBenchmark({ mode: live ? "live" : "deterministic", fixtures: selected, extractIntent, placeProvider });
const snapshot = comparableGlobalRoutingSnapshot(summary);
const pad = (value: string | number, width: number) => String(value).padEnd(width);

console.log(`Global routing intelligence · ${summary.mode}`);
console.log(`${pad("Fixture", 43)} ${pad("Outcome", 31)} Unknown / unresolved`);
summary.results.forEach((result) => console.log(`${pad(result.name, 43)} ${pad(result.outcome, 31)} ${result.output.unknownTransferCount} / ${result.output.unresolvedPlaceCount}`));
console.log(`\nFixtures: ${summary.fixtureCount}`);
console.log(`Outcomes: ${Object.entries(summary.outcomes).map(([outcome, count]) => `${count} ${outcome.toLocaleLowerCase()}`).join(" · ")}`);
console.log(`Unknown transfers: ${summary.unknownTransferCount}`);
console.log(`Unresolved/base-required places: ${summary.unresolvedPlaceCount}`);
console.log("\nCapability scores");
GLOBAL_ROUTING_CAPABILITIES.forEach((capability) => {
  const score = summary.scores[capability];
  console.log(`${pad(capability, 28)} ${score.earned}/${score.possible} (${score.percent}%)`);
});
if (summary.p0RegressionFailures.length) console.error(`\nP0 regression failures: ${summary.p0RegressionFailures.join(", ")}`);

const failures = summary.results.filter((result) => result.outcome === "HARD FAILURE");
if (failures.length) {
  console.error("\nHard failures");
  failures.forEach((result) => result.diagnostics.filter((item) => item.severity === "hard-failure").forEach((item) => {
    console.error(`\nFixture:\n${result.name}\n\nFailure:\n${item.failure}\n\nLayer:\n${item.layer}\n\nExpected:\n${item.expected}\n\nActual:\n${item.actual}`);
  }));
}

if (summary.live) {
  console.log("\nLive intelligence telemetry (aggregate only)");
  console.log(`Calls: ${summary.live.calls}`);
  console.log(`Latency: ${summary.live.latencyMs}ms`);
  console.log(`Tokens: ${summary.live.totalTokens ?? "unavailable"}`);
  console.log(`Estimated cost: ${summary.live.estimatedCostUsd === null ? "unavailable" : `$${summary.live.estimatedCostUsd.toFixed(6)}`}`);
}

const baselinePath = fileURLToPath(new URL("./baseline.json", import.meta.url));
if (!live && process.argv.includes("--accept")) {
  if (process.env.MORROVIA_GLOBAL_ROUTING_ACCEPT !== "yes") throw new Error("Baseline acceptance requires MORROVIA_GLOBAL_ROUTING_ACCEPT=yes.");
  if (failures.length) throw new Error("Refusing to accept a baseline with hard failures.");
  writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log("\nAccepted deterministic baseline updated after explicit approval.");
} else if (!live && !fixtureArg && !limit) {
  try {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as ComparableGlobalRoutingSnapshot;
    const changes = compareGlobalRoutingSnapshots(baseline, snapshot);
    if (!changes.length) console.log("\nStored baseline: no change.");
    else {
      console.error("\nStored baseline: CHANGED.");
      changes.forEach((change) => console.error(`- ${change}`));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\nStored baseline unavailable: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv.includes("--json")) console.log(`\n${JSON.stringify(snapshot, null, 2)}`);
if (failures.length || summary.p0RegressionFailures.length) process.exitCode = 1;
