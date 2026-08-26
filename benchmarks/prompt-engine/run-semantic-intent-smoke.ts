import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";
import {
  configuredOpenAISemanticIntentProvider,
  semanticIntentServerConfig,
} from "../../lib/easyt/openai-semantic-intent.server.ts";
import { runSemanticIntentShadow } from "../../lib/easyt/semantic-trip-intent.ts";
import { PROMPT_CAPTURE_REGRESSION_CASES } from "../../tests/fixtures/prompt-capture-regression.ts";

if (process.env.MORROVIA_SEMANTIC_INTENT_SMOKE !== "one") {
  throw new Error("Set MORROVIA_SEMANTIC_INTENT_SMOKE=one to authorize exactly one development smoke call.");
}
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for the explicit smoke call.");

const environment = { ...process.env, NODE_ENV: "development" };
const config = semanticIntentServerConfig(environment);
if (config.mode !== "shadow") throw new Error("Set MORROVIA_SEMANTIC_INTENT_MODE=shadow for the explicit smoke call.");
const provider = configuredOpenAISemanticIntentProvider(environment);
if (!provider) throw new Error("The Luna shadow provider is unavailable.");

const fixture = PROMPT_CAPTURE_REGRESSION_CASES.find((item) => item.id === "real-homepage-europe-typos-and-pois");
if (!fixture) throw new Error("The real homepage prompt fixture is missing.");

const logs: unknown[] = [];
const deterministic = captureJourneyBrief(fixture.rawPrompt);
const report = await runSemanticIntentShadow({
  rawPrompt: fixture.rawPrompt,
  deterministic,
  mode: config.mode,
  provider,
  log: (event) => logs.push(event),
});

// This is a developer-only, sanitized one-call report. It never prints the key
// or raw prompt and it is not wired to product analytics.
console.log(JSON.stringify({
  kind: "semantic-intent-shadow-smoke-v1",
  caseId: fixture.id,
  model: provider.model,
  comparison: report.comparison,
  escalation: report.escalation,
  logs,
}, null, 2));
