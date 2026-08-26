import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { classifySemanticIntentDifferences, runSemanticIntentFixtureShadow } from "../benchmarks/prompt-engine/semantic-intent-shadow.ts";
import {
  configuredOpenAISemanticIntentProvider,
  runConfiguredOpenAISemanticIntentShadow,
  semanticIntentServerConfig,
} from "../lib/easyt/openai-semantic-intent.server.ts";
import {
  buildOpenAISemanticIntentRequest,
  parseOpenAISemanticIntentResponse,
} from "../lib/easyt/openai-semantic-intent-request.ts";
import {
  SEMANTIC_INTENT_MODELS,
  SEMANTIC_INTENT_PRICING_USD_PER_MILLION,
  SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
  SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  SemanticIntentProviderError,
  compareSemanticIntent,
  estimateSemanticIntentCost,
  evaluateSemanticIntentShadow,
  runSemanticIntentShadow,
  semanticIntentMode,
  shouldEscalateSemanticIntent,
  validateSemanticTripIntent,
  type SemanticIntentExtractionResult,
  type SemanticIntentProvider,
  type SemanticTripIntent,
} from "../lib/easyt/semantic-trip-intent.ts";
import {
  PROMPT_CAPTURE_REGRESSION_CASES,
  type PromptCaptureRegressionFixture,
} from "./fixtures/prompt-capture-regression.ts";

const semanticFixtures = PROMPT_CAPTURE_REGRESSION_CASES.filter((fixture) => fixture.semanticExpectation);

function sourceMatch(rawPrompt: string, pattern: RegExp) {
  return pattern.exec(rawPrompt)?.[0] ?? null;
}

function intentForFixture(fixture: PromptCaptureRegressionFixture): SemanticTripIntent {
  const expected = fixture.semanticExpectation;
  assert.ok(expected, `${fixture.id} needs a semantic expectation`);
  const durationSource = expected.duration ? sourceMatch(fixture.rawPrompt, /\b(?:\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:days?|nights?|weeks?|wks?)\b/i) : null;
  assert.equal(Boolean(expected.duration), Boolean(durationSource));
  const departureSource = expected.departureMode
    ? expected.departureSourceText ?? sourceMatch(fixture.rawPrompt, /\b(?:flying\s+out\s+of|flying\s+from|fly\s+from)\s+[^,.;]+/i)
    : null;
  const interStopSource = expected.interStopModes?.length
    ? expected.interStopSourceText ?? sourceMatch(fixture.rawPrompt, /\btrains?(?:\s+between\s+cities|\s+preferred|\s+pls)?\b/i)
    : null;
  const avoids = (expected.avoidModes ?? []).map((mode) => {
    const pattern = mode === "drive" ? /\bno driving\b/i : /\bavoid flights?\b/i;
    const matched = expected.avoidSourceTexts?.[mode] ?? sourceMatch(fixture.rawPrompt, pattern);
    assert.ok(matched);
    return { sourceText: matched, mode };
  });
  const pace = expected.pace ?? null;
  return {
    schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
    rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: expected.originSourceText, certainty: expected.originSourceText ? "explicit" : null },
    duration: { sourceText: durationSource, value: expected.duration?.value ?? null, unit: expected.duration?.unit ?? null },
    explicitDateTexts: expected.explicitDateTexts ?? [],
    destinationCandidates: expected.destinationSourceTexts.map((sourceText) => ({
      sourceText,
      interpretedText: expected.destinationInterpretations?.[sourceText] ?? null,
      role: expected.destinationRoles?.[sourceText] ?? (sourceText.toLocaleLowerCase() === "japan" ? "planning-area" : "route-stop"),
      certainty: expected.destinationCertainties?.[sourceText] ?? (/maybe\s+/i.test(fixture.rawPrompt.slice(Math.max(0, fixture.rawPrompt.toLocaleLowerCase().indexOf(sourceText.toLocaleLowerCase()) - 8))) ? "likely" : "explicit"),
    })),
    pointsOfInterest: (expected.pointsOfInterest ?? []).map((item) => ({ ...item, certainty: "likely" })),
    transport: {
      departure: { sourceText: departureSource, mode: expected.departureMode ?? null },
      interStop: { sourceText: interStopSource, modes: expected.interStopModes ?? [] },
      avoid: avoids,
    },
    pace: { sourceText: pace?.sourceText ?? null, value: pace?.value ?? null },
    interests: expected.interests ?? [],
    constraints: expected.constraints ?? [],
    ambiguities: expected.ambiguities ?? [],
    unresolvedMeaningfulText: expected.unresolvedMeaningfulText ?? [],
  };
}

function provider(value: unknown, model = SEMANTIC_INTENT_MODELS.primary.model): SemanticIntentProvider {
  return { model, extract: async () => ({ value, usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 } }) };
}

function completed(intent: SemanticTripIntent): SemanticIntentExtractionResult {
  return { mode: "shadow", status: "completed", intent, latencyMs: 2 };
}

test("semantic contract is strict, versioned, and cannot carry planner or canonical facts", () => {
  assert.equal(SEMANTIC_TRIP_INTENT_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(SEMANTIC_INTENT_MODELS, {
    primary: { model: "gpt-5.6-luna", reasoningEffort: "medium" },
    escalation: { model: "gpt-5.6-terra", reasoningEffort: "medium" },
  });
  const serialized = JSON.stringify(SEMANTIC_TRIP_INTENT_JSON_SCHEMA).toLocaleLowerCase();
  for (const forbidden of ["canonicalplaceid", "tripdocument", "coordinates", "price", "schedule", "availability"]) assert.equal(serialized.includes(forbidden), false);
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (row.type === "object") assert.equal(row.additionalProperties, false);
    Object.values(row).forEach(visit);
  };
  visit(SEMANTIC_TRIP_INTENT_JSON_SCHEMA);
});

test("shared regression corpus has at least 25 valid fixture-backed semantic shapes", async () => {
  assert.ok(semanticFixtures.length >= 25);
  for (const fixture of semanticFixtures) {
    const intent = intentForFixture(fixture);
    assert.equal(validateSemanticTripIntent(intent, fixture.rawPrompt).valid, true, fixture.id);
    const extraction = await evaluateSemanticIntentShadow(fixture.rawPrompt, { mode: "shadow", provider: provider(intent) });
    assert.equal(extraction.status, "completed", fixture.id);
    assert.deepEqual(extraction.intent?.destinationCandidates.map((item) => item.sourceText), fixture.semanticExpectation?.destinationSourceTexts);
    const forbidden = new Set(fixture.semanticExpectation?.forbiddenDestinationTerms?.map((item) => item.toLocaleLowerCase()) ?? []);
    assert.equal(extraction.intent?.destinationCandidates.some((item) => forbidden.has(item.sourceText.toLocaleLowerCase())), false, fixture.id);
  }
});

test("shared-corpus harness produces a sanitized A/B report for every semantic fixture", async () => {
  const intents = new Map(semanticFixtures.map((fixture) => [fixture.id, intentForFixture(fixture)]));
  const report = await runSemanticIntentFixtureShadow({
    fixtures: semanticFixtures,
    providerForFixture: (fixture) => provider(intents.get(fixture.id)),
  });
  assert.equal(report.kind, "semantic-intent-fixture-shadow-v1");
  assert.deepEqual(report.cases.map((item) => item.caseId), semanticFixtures.map((item) => item.id));
  assert.equal(report.cases.every((item) => item.comparison.status === "completed" && item.comparison.semantic !== null), true);
  assert.equal(report.cases.every((item) => typeof item.comparison.latencyMs === "number" && item.comparison.usage?.totalTokens === 200), true);
  assert.equal(report.summary.caseCount, semanticFixtures.length);
  assert.equal(report.summary.falseGeography.count, 0);
  assert.ok(report.summary.falseGeography.destinationCandidates > 0);
  assert.equal(report.summary.falseGeography.rate, 0);
  assert.deepEqual(report.summary.poi, { expected: 10, identified: 10, interpretedCorrectly: 10, associationsCorrect: 10, identificationRate: 1, associationAccuracy: 1 });
  assert.deepEqual(report.summary.transport, { expectedSignals: 6, correctSignals: 6, accuracy: 1 });
  assert.equal(report.summary.classifications["incorrect interpretation"], 0);
  assert.equal(report.summary.classifications["dangerous false geography"], 0);
  assert.equal(report.summary.classifications["fabricated fact"], 0);
  assert.ok(report.summary.classifications["useful additional understanding"] > 0);
  assert.equal(report.summary.tokens.total, semanticFixtures.length * 200);
  assert.equal(Number(report.summary.approximateCostUsd.toFixed(8)), Number((semanticFixtures.length * 0.00012).toFixed(8)));
  const serializedLogs = JSON.stringify(report.cases.map((item) => item.logs));
  assert.equal(semanticFixtures.some((fixture) => serializedLogs.includes(fixture.rawPrompt)), false);
});

test("the exact homepage prompt keeps origin, duration, POIs, and departure flight separate from inter-stop modes", async () => {
  const fixture = semanticFixtures[0];
  assert.ok(fixture);
  const deterministic = captureJourneyBrief(fixture.rawPrompt);
  const result = await runSemanticIntentShadow({ rawPrompt: fixture.rawPrompt, deterministic, mode: "shadow", provider: provider(intentForFixture(fixture)) });
  assert.equal(result.extraction.intent?.origin.sourceText, "london");
  assert.deepEqual(result.extraction.intent?.duration, { sourceText: "3 wks", value: 3, unit: "weeks" });
  assert.deepEqual(result.extraction.intent?.destinationCandidates.map((item) => item.sourceText), ["paris", "porto", "rome", "athen"]);
  assert.deepEqual(result.extraction.intent?.pointsOfInterest.map((item) => item.sourceText), ["colusseum", "pathanon"]);
  assert.deepEqual(result.extraction.intent?.pointsOfInterest.map((item) => ({ interpretedText: item.interpretedText, likelyDestinationSourceText: item.likelyDestinationSourceText })), [
    { interpretedText: "Colosseum", likelyDestinationSourceText: "rome" },
    { interpretedText: "Parthenon", likelyDestinationSourceText: "athen" },
  ]);
  assert.equal(result.extraction.intent?.transport.departure.mode, "flight");
  assert.deepEqual(result.extraction.intent?.transport.interStop.modes, []);
  assert.equal(result.comparison.agreement.origin, true);
  assert.equal(result.comparison.agreement.duration, true);
  assert.deepEqual(result.comparison.safety, { falseGeography: [], inventedFacts: 0, meaningfulUnexplainedText: [] });
  assert.equal(result.escalation.shouldEscalate, false);
});

test("Responses API request uses Luna medium reasoning and strict structured output; Terra reuses the same contract", () => {
  const rawPrompt = semanticFixtures[0]?.rawPrompt ?? "";
  const luna = buildOpenAISemanticIntentRequest(rawPrompt);
  const terra = buildOpenAISemanticIntentRequest(rawPrompt, SEMANTIC_INTENT_MODELS.escalation.model);
  assert.equal(luna.model, "gpt-5.6-luna");
  assert.deepEqual(luna.reasoning, { effort: "medium" });
  assert.equal(luna.text.format.type, "json_schema");
  assert.equal(luna.text.format.strict, true);
  assert.equal(luna.store, false);
  assert.equal(terra.model, "gpt-5.6-terra");
  assert.strictEqual(terra.text.format.schema, luna.text.format.schema);
  assert.equal(JSON.stringify(luna).includes("OPENAI_API_KEY"), false);
  assert.deepEqual(SEMANTIC_INTENT_PRICING_USD_PER_MILLION["gpt-5.6-luna"], { input: 0.20, output: 1.20 });
  assert.deepEqual(estimateSemanticIntentCost("gpt-5.6-luna", { inputTokens: 120, outputTokens: 80 }), {
    currency: "USD", model: "gpt-5.6-luna", approximateUsd: 0.00012, inputUsdPerMillion: 0.20, outputUsdPerMillion: 1.20,
  });
});

test("Responses payload parsing accepts output_text and rejects malformed JSON or refusals", () => {
  const intent = intentForFixture(semanticFixtures[0]!);
  const parsed = parseOpenAISemanticIntentResponse({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(intent) }] }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } });
  assert.deepEqual(parsed, { value: intent, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } });
  assert.equal(parseOpenAISemanticIntentResponse({ output_text: "{" }), null);
  assert.equal(parseOpenAISemanticIntentResponse({ output: [{ content: [{ type: "refusal", refusal: "no" }] }] }), null);
});

test("malformed output, schema failure, timeout, and provider failure are bounded failure states", async () => {
  const rawPrompt = semanticFixtures[0]?.rawPrompt ?? "";
  assert.equal((await evaluateSemanticIntentShadow(rawPrompt, { mode: "shadow", provider: provider("not-an-object") })).status, "invalid-response");
  const wrongSchema = { ...intentForFixture(semanticFixtures[0]!), schemaVersion: "semantic-trip-intent/v0" };
  assert.equal((await evaluateSemanticIntentShadow(rawPrompt, { mode: "shadow", provider: provider(wrongSchema) })).status, "invalid-response");
  const hung: SemanticIntentProvider = { model: "hung-fixture", extract: async () => new Promise(() => undefined) };
  const startedAt = Date.now();
  assert.equal((await evaluateSemanticIntentShadow(rawPrompt, { mode: "shadow", provider: hung, timeoutMs: 15 })).status, "timeout");
  assert.ok(Date.now() - startedAt < 300);
  const failed: SemanticIntentProvider = { model: "failed-fixture", extract: async () => { throw new SemanticIntentProviderError({ category: "rate-limit", status: 429 }); } };
  assert.equal((await evaluateSemanticIntentShadow(rawPrompt, { mode: "shadow", provider: failed })).status, "provider-failure");
});

test("invented dates and canonical-ID injection are rejected after structured generation", () => {
  const fixture = semanticFixtures[0]!;
  const intent = intentForFixture(fixture);
  const inventedDate = { ...intent, explicitDateTexts: ["1 January 2030"] };
  const dateValidation = validateSemanticTripIntent(inventedDate, fixture.rawPrompt);
  assert.equal(dateValidation.valid, false);
  if (!dateValidation.valid) assert.ok(dateValidation.issues.some((issue) => issue.code === "source-not-in-prompt"));
  const injected = structuredClone(intent) as SemanticTripIntent & { destinationCandidates: Array<SemanticTripIntent["destinationCandidates"][number] & { canonicalPlaceId?: string }> };
  injected.destinationCandidates[0]!.canonicalPlaceId = "paris";
  const injectionValidation = validateSemanticTripIntent(injected, fixture.rawPrompt);
  assert.equal(injectionValidation.valid, false);
  if (!injectionValidation.valid) assert.ok(injectionValidation.issues.some((issue) => issue.code === "forbidden-field"));
  if (!injectionValidation.valid) {
    const extraction: SemanticIntentExtractionResult = { mode: "shadow", status: "invalid-response", intent: null, latencyMs: 1, validationIssues: injectionValidation.issues };
    const deterministic = captureJourneyBrief(fixture.rawPrompt);
    const assessments = classifySemanticIntentDifferences({ fixture, deterministic, extraction, comparison: compareSemanticIntent(deterministic, extraction) });
    assert.deepEqual(assessments.map((item) => item.classification), ["fabricated fact"]);
  }
});

test("POI-versus-destination confusion fails validation and preference geography is visible in comparison", async () => {
  const fixture = semanticFixtures[0]!;
  const confused = structuredClone(intentForFixture(fixture));
  confused.pointsOfInterest.push({ sourceText: "rome", interpretedText: "Rome", likelyDestinationSourceText: "rome", certainty: "likely" });
  assert.equal(validateSemanticTripIntent(confused, fixture.rawPrompt).valid, false);

  const rawPrompt = "Paris, food, wine, beaches, relaxed, nightlife, museums, cheap, keep it cheap, nature, don't rush, romantic, architecture, Rome";
  const bad = {
    ...intentForFixture({ ...fixture, rawPrompt, semanticExpectation: { originSourceText: null, duration: null, destinationSourceTexts: ["Paris", "food", "wine", "beaches", "relaxed", "nightlife", "museums", "cheap", "keep it cheap", "nature", "don't rush", "romantic", "architecture", "Rome"] } }),
    pace: { sourceText: null, value: null },
    interests: [],
  } satisfies SemanticTripIntent;
  const extraction = await evaluateSemanticIntentShadow(rawPrompt, { mode: "shadow", provider: provider(bad) });
  assert.equal(extraction.status, "completed");
  const comparison = compareSemanticIntent(captureJourneyBrief(rawPrompt), extraction);
  assert.deepEqual(comparison.safety.falseGeography, ["food", "wine", "beaches", "relaxed", "nightlife", "museums", "cheap", "keep it cheap", "nature", "don't rush", "romantic", "architecture"]);
  const assessments = classifySemanticIntentDifferences({ fixture, deterministic: captureJourneyBrief(rawPrompt), extraction, comparison });
  assert.ok(assessments.some((item) => item.classification === "dangerous false geography"));
});

test("escalation uses explicit structured reasons instead of a global confidence threshold", async () => {
  const fixture = semanticFixtures[0]!;
  const deterministic = captureJourneyBrief(fixture.rawPrompt);
  const good = intentForFixture(fixture);
  const missingFacts = structuredClone(good);
  missingFacts.origin = { sourceText: null, certainty: null };
  missingFacts.duration = { sourceText: null, value: null, unit: null };
  let decision = shouldEscalateSemanticIntent({ rawPrompt: fixture.rawPrompt, deterministic, extraction: completed(missingFacts) });
  assert.ok(decision.reasons.some((reason) => reason.code === "explicit-origin-missing"));
  assert.ok(decision.reasons.some((reason) => reason.code === "explicit-duration-missing"));

  const disagreement = structuredClone(good);
  disagreement.duration.value = 2;
  decision = shouldEscalateSemanticIntent({ rawPrompt: fixture.rawPrompt, deterministic, extraction: completed(disagreement) });
  assert.ok(decision.reasons.some((reason) => reason.code === "hard-fact-disagreement"));

  const unresolvedPrompt = "Paris and Lost Ridge";
  const unresolvedDeterministic = captureJourneyBrief(unresolvedPrompt);
  const unresolvedIntent: SemanticTripIntent = {
    ...structuredClone(good),
    origin: { sourceText: null, certainty: null }, duration: { sourceText: null, value: null, unit: null }, explicitDateTexts: [],
    destinationCandidates: [{ sourceText: "Paris", interpretedText: null, role: "route-stop", certainty: "explicit" }], pointsOfInterest: [],
    transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] }, pace: { sourceText: null, value: null }, interests: [], constraints: [], ambiguities: [], unresolvedMeaningfulText: [],
  };
  decision = shouldEscalateSemanticIntent({ rawPrompt: unresolvedPrompt, deterministic: unresolvedDeterministic, extraction: completed(unresolvedIntent) });
  assert.ok(decision.reasons.some((reason) => reason.code === "unresolved-meaningful-geography"));

  const ambiguousPrompt = "Georgia";
  const ambiguousIntent = { ...structuredClone(unresolvedIntent), destinationCandidates: [{ sourceText: "Georgia", interpretedText: null, role: "unknown" as const, certainty: "ambiguous" as const }], ambiguities: [{ sourceText: "Georgia", kind: "destination" as const }] };
  decision = shouldEscalateSemanticIntent({ rawPrompt: ambiguousPrompt, deterministic: captureJourneyBrief(ambiguousPrompt), extraction: completed(ambiguousIntent) });
  assert.ok(decision.reasons.some((reason) => reason.code === "ambiguous-place-resolution"));

  const poiConflict = structuredClone(good);
  poiConflict.pointsOfInterest.push({ sourceText: "rome", interpretedText: "Rome", likelyDestinationSourceText: "rome", certainty: "likely" });
  decision = shouldEscalateSemanticIntent({ rawPrompt: fixture.rawPrompt, deterministic, extraction: completed(poiConflict) });
  assert.ok(decision.reasons.some((reason) => reason.code === "poi-destination-conflict"));

  const noDrivingPrompt = "Paris and Rome, no driving";
  const noDrivingIntent = structuredClone(unresolvedIntent);
  noDrivingIntent.destinationCandidates = [{ sourceText: "Paris", interpretedText: null, role: "route-stop", certainty: "explicit" }, { sourceText: "Rome", interpretedText: null, role: "route-stop", certainty: "explicit" }];
  decision = shouldEscalateSemanticIntent({ rawPrompt: noDrivingPrompt, deterministic: captureJourneyBrief(noDrivingPrompt), extraction: completed(noDrivingIntent) });
  assert.ok(decision.reasons.some((reason) => reason.code === "hard-constraint-ambiguity"));

  const unclassified = structuredClone(unresolvedIntent);
  const unclassifiedPrompt = "Paris with a mysterious overnight sequencing rule";
  unclassified.unresolvedMeaningfulText = ["mysterious overnight sequencing rule"];
  decision = shouldEscalateSemanticIntent({ rawPrompt: unclassifiedPrompt, deterministic: captureJourneyBrief(unclassifiedPrompt), extraction: completed(unclassified) });
  assert.ok(decision.reasons.some((reason) => reason.code === "significant-unclassified-text"));

  decision = shouldEscalateSemanticIntent({ rawPrompt: fixture.rawPrompt, deterministic, extraction: { mode: "shadow", status: "timeout", intent: null, latencyMs: 10 } });
  assert.deepEqual(decision.reasons.map((reason) => reason.code), ["extraction-failure"]);
});

test("success, failure, timeout, malformed, disabled, and missing-key states never mutate deterministic product output", async () => {
  const fixture = semanticFixtures[0]!;
  const routeSource = readFileSync(new URL("../app/api/journey-capture/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /after\(async \(\) =>/);
  assert.match(routeSource, /return NextResponse\.json\(deterministic\)/);
  const scenarios: Array<{ expectedStatus: string; mode: "off" | "shadow"; provider?: SemanticIntentProvider }> = [
    { expectedStatus: "completed", mode: "shadow", provider: provider(intentForFixture(fixture)) },
    { expectedStatus: "failed", mode: "shadow", provider: { model: "failure", extract: async () => { throw new Error("offline"); } } },
    { expectedStatus: "timeout", mode: "shadow", provider: { model: "timeout", extract: async () => new Promise(() => undefined) } },
    { expectedStatus: "invalid-response", mode: "shadow", provider: provider({ unexpected: true }) },
    { expectedStatus: "disabled", mode: "off" },
    { expectedStatus: "unavailable", mode: "shadow" },
  ];
  for (const scenario of scenarios) {
    const before = captureJourneyBrief(fixture.rawPrompt);
    const snapshot = structuredClone(before);
    const result = await runSemanticIntentShadow({ rawPrompt: fixture.rawPrompt, deterministic: before, mode: scenario.mode, provider: scenario.provider, timeoutMs: 10 });
    assert.equal(result.extraction.status, scenario.expectedStatus);
    assert.deepEqual(before, snapshot);
    assert.deepEqual(captureJourneyBrief(fixture.rawPrompt), snapshot);
  }
});

test("configuration defaults off, production cannot opt into shadow, and logs stay aggregate-only", async () => {
  assert.equal(semanticIntentMode({}), "off");
  assert.equal(semanticIntentMode({ NODE_ENV: "development", MORROVIA_SEMANTIC_INTENT_MODE: "shadow" }), "shadow");
  assert.equal(semanticIntentMode({ NODE_ENV: "production", MORROVIA_SEMANTIC_INTENT_MODE: "shadow" }), "off");
  const missingKeyEnvironment = { NODE_ENV: "development", MORROVIA_SEMANTIC_INTENT_MODE: "shadow" };
  assert.deepEqual(semanticIntentServerConfig(missingKeyEnvironment), {
    mode: "shadow",
    primary: SEMANTIC_INTENT_MODELS.primary,
    escalation: SEMANTIC_INTENT_MODELS.escalation,
    hasApiKey: false,
  });
  assert.equal(configuredOpenAISemanticIntentProvider(missingKeyEnvironment), undefined);
  assert.equal((await evaluateSemanticIntentShadow("Paris", { mode: "shadow" })).status, "unavailable");
  const fixture = semanticFixtures[0]!;
  const deterministic = captureJourneyBrief(fixture.rawPrompt);
  const configuredMissingKey = await runConfiguredOpenAISemanticIntentShadow({ rawPrompt: fixture.rawPrompt, deterministic, environment: missingKeyEnvironment });
  assert.equal(configuredMissingKey.extraction.status, "unavailable");
  assert.deepEqual(deterministic, captureJourneyBrief(fixture.rawPrompt));
  const logs: unknown[] = [];
  await evaluateSemanticIntentShadow(fixture.rawPrompt, { mode: "shadow", provider: provider(intentForFixture(fixture)), log: (event) => logs.push(event) });
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes(fixture.rawPrompt), false);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
  assert.match(serialized, /inputTokens/);
  assert.match(serialized, /latencyMs/);
});
