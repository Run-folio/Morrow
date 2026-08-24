import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PROMPT_ENGINE_DIMENSIONS } from "./fixtures.ts";
import { comparablePromptEngineSnapshot, runPromptEngineHarness } from "./harness.ts";

const summary = runPromptEngineHarness();
const snapshot = comparablePromptEngineSnapshot(summary);
console.log(`Prompt engine: ${summary.total}/${summary.maxTotal}`);
PROMPT_ENGINE_DIMENSIONS.forEach((dimension) => console.log(`${dimension}: ${summary.dimensions[dimension]}/${summary.results.length * 2}`));
const baselinePath = fileURLToPath(new URL("./baseline.json", import.meta.url));
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
console.log("\nRegression versus baseline:");
PROMPT_ENGINE_DIMENSIONS.forEach((dimension) => {
  const delta = summary.dimensions[dimension] - baseline.dimensions[dimension];
  console.log(`${dimension}: ${delta === 0 ? "no change" : delta > 0 ? `+${delta}` : String(delta)}`);
});
const weakest = [...PROMPT_ENGINE_DIMENSIONS].sort((a, b) => summary.dimensions[a] - summary.dimensions[b]);
console.log(`\nWeakest dimensions: ${weakest.slice(0, 3).join(", ")}`);
if (process.argv.includes("--json")) console.log(JSON.stringify(snapshot, null, 2));
if (JSON.stringify(snapshot) !== JSON.stringify(baseline)) process.exitCode = 1;
