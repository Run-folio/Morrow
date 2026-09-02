import OpenAI from "openai";
import { captureJourneyBrief, captureJourneyBriefFromSemanticIntent } from "../../lib/easyt/journey-capture.ts";
import { createOpenAIPlanningModelProvider } from "../../lib/easyt/openai-semantic-intent.server.ts";
import { createOpenWorldPlaceProvider } from "../../lib/easyt/open-world-place.server.ts";
import { routeTripCaptureModel } from "../../lib/easyt/model-task-router.ts";
import { evaluatePlanningModel } from "../../lib/easyt/planning-model-runtime.ts";
import { canonicalizePlanningSuggestions } from "../../lib/easyt/planning-suggestion-validation.server.ts";
import { PLANNING_MODEL_EXPECTATIONS } from "./expectations.ts";
import { PLANNING_MODEL_BENCHMARK_FIXTURES } from "./fixtures.ts";

if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required for the live Terra candidate benchmark.");

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const contains = (values: string[], expected: string) => values.some((value) => normalize(value).includes(normalize(expected)) || normalize(expected).includes(normalize(value)));
const provider = createOpenAIPlanningModelProvider({
  tier: "escalation",
  client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
});
const placeProvider = createOpenWorldPlaceProvider();

async function runCase(fixture: (typeof PLANNING_MODEL_BENCHMARK_FIXTURES)[number]) {
  const deterministic = captureJourneyBrief(fixture.prompt);
  const routing = routeTripCaptureModel({ rawPrompt: fixture.prompt, deterministic });
  const result = await evaluatePlanningModel({
    rawPrompt: fixture.prompt,
    provider,
    timeoutMs: 30_000,
    requireSuggestions: routing.task === "planning_destination_expansion",
  });
  const output = result.output;
  const modelCapture = output
    ? await captureJourneyBriefFromSemanticIntent(fixture.prompt, output.intent, placeProvider)
    : deterministic;
  const canonical = output ? await canonicalizePlanningSuggestions({ suggestions: output.suggestions, capture: modelCapture, provider: placeProvider }) : [];
  const expectation = PLANNING_MODEL_EXPECTATIONS[fixture.id];
  const semanticTexts = output ? [
    ...(output.intent.origin.sourceText ? [output.intent.origin.sourceText] : []),
    ...(output.intent.journeyEnd.sourceText ? [output.intent.journeyEnd.sourceText] : []),
    ...output.intent.destinationCandidates.map((item) => item.sourceText),
    ...output.intent.pointsOfInterest.map((item) => item.sourceText),
  ] : [];
  const broadTexts = output?.intent.destinationCandidates.filter((item) => item.role === "planning-area").map((item) => item.sourceText) ?? [];
  const visitTexts = output ? [
    ...output.intent.pointsOfInterest.map((item) => item.sourceText),
    ...output.intent.destinationCandidates.map((item) => item.sourceText),
  ] : [];
  const checks = {
    structuredOutputValid: result.status === "completed",
    intentPreserved: expectation.preserved.every((item) => contains(semanticTexts, item)),
    broadDestinationUnderstood: (expectation.broad ?? []).every((item) => contains(broadTexts, item)),
    visitIntentRetained: (expectation.visit ?? []).every((item) => contains(visitTexts, item)),
    interestsRetained: (expectation.interests ?? []).every((item) => output?.intent.interests.some((interest) => interest.value === item)),
    boundedSuggestionCount: Boolean(output && output.suggestions.length >= expectation.suggestionRange[0] && output.suggestions.length <= expectation.suggestionRange[1]),
    canonicalResolutionSucceeded: expectation.suggestionRange[0] === 0 ? canonical.length === 0 : canonical.length >= 1,
    coherenceClassCorrect: expectation.coherence ? output?.assessment.coherence === expectation.coherence : true,
  };
  return {
    id: fixture.id,
    cohort: fixture.cohort,
    routing: { task: routing.task, complexity: routing.complexity, selectedModel: routing.selectedModel, signals: routing.signals },
    status: result.status,
    latencyMs: result.latencyMs,
    usage: result.usage,
    cost: result.cost?.approximateUsd,
    checks,
    intent: output ? {
      destinations: output.intent.destinationCandidates.map((item) => ({ sourceText: item.sourceText, role: item.role })),
      pointsOfInterest: output.intent.pointsOfInterest.map((item) => item.sourceText),
      interests: output.intent.interests.map((item) => item.value),
    } : null,
    suggestions: output?.suggestions.map((item) => ({ parent: item.parentSourceText, name: item.name, country: item.country, role: item.role, rationale: item.rationale })) ?? [],
    canonicalSuggestions: canonical.map((item) => ({ parentMentionId: item.mentionId, name: item.name, country: item.country, canonicalPlaceId: item.canonicalPlaceId })),
    assessment: output?.assessment ?? null,
  };
}

const cases: Array<Awaited<ReturnType<typeof runCase>>> = [];
const requestedCaseIds = new Set((process.env.MORROVIA_PLANNING_BENCHMARK_CASES ?? "").split(",").map((item) => item.trim()).filter(Boolean));
const selectedFixtures = requestedCaseIds.size
  ? PLANNING_MODEL_BENCHMARK_FIXTURES.filter((fixture) => requestedCaseIds.has(fixture.id))
  : PLANNING_MODEL_BENCHMARK_FIXTURES;
for (const fixture of selectedFixtures) cases.push(await runCase(fixture));

const complex = cases.filter((item) => item.cohort === "complex");
const simple = cases.filter((item) => item.cohort === "simple");
const checkRate = (items: typeof cases, key: keyof (typeof cases)[number]["checks"]) => items.length
  ? items.filter((item) => item.checks[key]).length / items.length : 0;
console.log(JSON.stringify({
  kind: "morrovia-terra-planning-candidate/v1",
  runAt: new Date().toISOString(),
  model: provider.model,
  summary: {
    caseCount: cases.length,
    structuredValidityRate: checkRate(cases, "structuredOutputValid"),
    simpleIntentPreservationRate: checkRate(simple, "intentPreserved"),
    simpleUnnecessarySuggestionAvoidanceRate: checkRate(simple, "boundedSuggestionCount"),
    complexIntentPreservationRate: checkRate(complex, "intentPreserved"),
    broadDestinationUnderstandingRate: checkRate(complex, "broadDestinationUnderstood"),
    visitIntentRetentionRate: checkRate(complex, "visitIntentRetained"),
    boundedSuggestionRate: checkRate(complex, "boundedSuggestionCount"),
    canonicalResolutionSuccessRate: checkRate(complex, "canonicalResolutionSucceeded"),
    coherenceClassificationRate: checkRate(cases, "coherenceClassCorrect"),
    averageLatencyMs: Math.round(cases.reduce((sum, item) => sum + item.latencyMs, 0) / cases.length),
    totalInputTokens: cases.reduce((sum, item) => sum + (item.usage?.inputTokens ?? 0), 0),
    totalOutputTokens: cases.reduce((sum, item) => sum + (item.usage?.outputTokens ?? 0), 0),
    estimatedCostUsd: Number(cases.reduce((sum, item) => sum + (item.cost ?? 0), 0).toFixed(6)),
    modelCalls: cases.length,
  },
  cases,
}, null, 2));
