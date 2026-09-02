import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";
import { createOpenAISemanticIntentProvider } from "../../lib/easyt/openai-semantic-intent.server.ts";
import { evaluateSemanticIntentShadow } from "../../lib/easyt/semantic-trip-intent.ts";
import { PLANNING_MODEL_BENCHMARK_FIXTURES } from "./fixtures.ts";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required for the live Luna baseline.");

const provider = createOpenAISemanticIntentProvider({
  tier: "primary",
  client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
});
const cases = [];
for (const fixture of PLANNING_MODEL_BENCHMARK_FIXTURES) {
  const deterministic = captureJourneyBrief(fixture.prompt);
  const result = await evaluateSemanticIntentShadow(fixture.prompt, {
    mode: "shadow",
    provider,
    timeoutMs: 20_000,
  });
  cases.push({
    id: fixture.id,
    cohort: fixture.cohort,
    status: result.status,
    latencyMs: result.latencyMs,
    usage: result.usage,
    cost: result.cost?.approximateUsd,
    intent: result.intent ? {
      destinations: result.intent.destinationCandidates.map((item) => ({ sourceText: item.sourceText, role: item.role })),
      pointsOfInterest: result.intent.pointsOfInterest.map((item) => item.sourceText),
      interests: result.intent.interests.map((item) => item.value),
      duration: result.intent.duration,
      ambiguityCount: result.intent.ambiguities.length,
    } : null,
    deterministic: {
      mentionCount: deterministic.mentions.length,
      unresolvedCount: deterministic.mentions.filter((item) => item.status === "unresolved").length,
      broadCount: deterministic.mentions.filter((item) => item.routability === "planning_area" || item.routability === "needs_base_selection").length,
    },
    planningSuggestionCount: 0,
  });
}

const completed = cases.filter((item) => item.status === "completed");
console.log(JSON.stringify({
  kind: "morrovia-current-luna-planning-baseline/v1",
  frozenAt: new Date().toISOString(),
  model: provider.model,
  schema: "semantic-trip-intent/v2",
  note: "This is the pre-Terra production semantic-extraction contract; it does not generate route-base suggestions.",
  summary: {
    caseCount: cases.length,
    completed: completed.length,
    structuredValidityRate: cases.length ? completed.length / cases.length : 0,
    averageLatencyMs: completed.length ? Math.round(completed.reduce((sum, item) => sum + item.latencyMs, 0) / completed.length) : null,
    totalInputTokens: cases.reduce((sum, item) => sum + (item.usage?.inputTokens ?? 0), 0),
    totalOutputTokens: cases.reduce((sum, item) => sum + (item.usage?.outputTokens ?? 0), 0),
    estimatedCostUsd: Number(cases.reduce((sum, item) => sum + (item.cost ?? 0), 0).toFixed(6)),
    modelCalls: cases.length,
  },
  cases,
}, null, 2));
