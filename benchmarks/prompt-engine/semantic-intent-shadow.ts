import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";
import {
  runSemanticIntentShadow,
  type SemanticIntentComparison,
  type SemanticIntentExtractionResult,
  type SemanticIntentProvider,
  type SemanticIntentShadowLog,
} from "../../lib/easyt/semantic-trip-intent.ts";
import {
  PROMPT_CAPTURE_REGRESSION_CASES,
  type PromptCaptureRegressionFixture,
} from "../../tests/fixtures/prompt-capture-regression.ts";

export type SemanticIntentFixtureShadowReport = {
  kind: "semantic-intent-fixture-shadow-v1";
  cases: Array<{
    caseId: string;
    comparison: Awaited<ReturnType<typeof runSemanticIntentShadow>>["comparison"];
    escalation: Awaited<ReturnType<typeof runSemanticIntentShadow>>["escalation"];
    assessments: SemanticIntentDifferenceAssessment[];
    logs: SemanticIntentShadowLog[];
  }>;
  summary: SemanticIntentFixtureShadowSummary;
};

export type SemanticIntentDifferenceClassification =
  | "useful additional understanding"
  | "useful correction"
  | "neutral"
  | "incorrect interpretation"
  | "dangerous false geography"
  | "fabricated fact";

export type SemanticIntentDifferenceAssessment = {
  field: "extraction" | "origin" | "duration" | "destination" | "poi" | "poi-association" | "transport" | "constraint" | "interest" | "ambiguity" | "unclassified-text";
  subject: string;
  classification: SemanticIntentDifferenceClassification;
};

type ClassificationCounts = Record<SemanticIntentDifferenceClassification, number>;

export type SemanticIntentFixtureShadowSummary = {
  caseCount: number;
  classifications: ClassificationCounts;
  falseGeography: { count: number; destinationCandidates: number; rate: number };
  poi: { expected: number; identified: number; interpretedCorrectly: number; associationsCorrect: number; identificationRate: number | null; associationAccuracy: number | null };
  transport: { expectedSignals: number; correctSignals: number; accuracy: number | null };
  latencyMs: { total: number; mean: number | null };
  tokens: { input: number; output: number; total: number; missingUsageCases: number };
  approximateCostUsd: number;
};

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const days = (duration: { value: number; unit: "days" | "nights" | "weeks" } | null) => duration ? (duration.unit === "weeks" ? duration.value * 7 : duration.unit === "nights" ? duration.value + 1 : duration.value) : null;
const sameStrings = (left: string[], right: string[]) => left.length === right.length && left.every((value) => right.some((other) => normalize(other) === normalize(value)));
const emptyClassifications = (): ClassificationCounts => ({
  "useful additional understanding": 0,
  "useful correction": 0,
  neutral: 0,
  "incorrect interpretation": 0,
  "dangerous false geography": 0,
  "fabricated fact": 0,
});

/** Grades semantic output only against fixture expectations and deterministic evidence. */
export function classifySemanticIntentDifferences(input: {
  fixture: PromptCaptureRegressionFixture;
  deterministic: ReturnType<typeof captureJourneyBrief>;
  extraction: SemanticIntentExtractionResult;
  comparison: SemanticIntentComparison;
}): SemanticIntentDifferenceAssessment[] {
  const expected = input.fixture.semanticExpectation;
  if (!expected) return [];
  const assessments: SemanticIntentDifferenceAssessment[] = [];
  const add = (field: SemanticIntentDifferenceAssessment["field"], subject: string, classification: SemanticIntentDifferenceClassification) => assessments.push({ field, subject, classification });
  if (!input.extraction.intent) {
    const fabricated = input.extraction.validationIssues?.some((issue) => ["source-not-in-prompt", "forbidden-field", "unexpected-field"].includes(issue.code));
    add("extraction", input.extraction.status, fabricated ? "fabricated fact" : "incorrect interpretation");
    return assessments;
  }
  const intent = input.extraction.intent;
  const deterministicOrigin = input.deterministic.mentions.find((mention) => mention.role === "origin")?.sourceText ?? null;
  const actualOrigin = intent.origin.sourceText;
  const originMatches = normalize(actualOrigin ?? "") === normalize(expected.originSourceText ?? "");
  if (!originMatches) add("origin", actualOrigin ?? "missing", "incorrect interpretation");
  else if (normalize(deterministicOrigin ?? "") === normalize(expected.originSourceText ?? "")) add("origin", actualOrigin ?? "none", "neutral");
  else add("origin", actualOrigin ?? "none", deterministicOrigin ? "useful correction" : "useful additional understanding");

  const actualDuration = intent.duration.value && intent.duration.unit ? { value: intent.duration.value, unit: intent.duration.unit } : null;
  const deterministicDuration = input.deterministic.structuredBrief.duration ? { value: input.deterministic.structuredBrief.duration.value, unit: input.deterministic.structuredBrief.duration.unit } : null;
  if (days(actualDuration) !== days(expected.duration)) add("duration", actualDuration ? `${actualDuration.value}-${actualDuration.unit}` : "missing", "incorrect interpretation");
  else if (days(deterministicDuration) === days(expected.duration)) add("duration", actualDuration ? `${actualDuration.value}-${actualDuration.unit}` : "none", "neutral");
  else add("duration", actualDuration ? `${actualDuration.value}-${actualDuration.unit}` : "none", deterministicDuration ? "useful correction" : "useful additional understanding");

  const actualDestinations = new Map(intent.destinationCandidates.map((candidate) => [normalize(candidate.sourceText), candidate]));
  const expectedDestinations = new Set(expected.destinationSourceTexts.map(normalize));
  for (const sourceText of expected.destinationSourceTexts) {
    const actual = actualDestinations.get(normalize(sourceText));
    if (!actual) { add("destination", sourceText, "incorrect interpretation"); continue; }
    const expectedInterpretation = expected.destinationInterpretations?.[sourceText] ?? null;
    const expectedRole = expected.destinationRoles?.[sourceText];
    const expectedCertainty = expected.destinationCertainties?.[sourceText];
    if (normalize(actual.interpretedText ?? "") !== normalize(expectedInterpretation ?? "") || (expectedRole && actual.role !== expectedRole) || (expectedCertainty && actual.certainty !== expectedCertainty)) {
      add("destination", sourceText, "incorrect interpretation");
      continue;
    }
    const deterministic = input.deterministic.mentions.find((mention) => normalize(mention.sourceText) === normalize(sourceText));
    if (!deterministic) add("destination", sourceText, "useful additional understanding");
    else if (expectedInterpretation && normalize(deterministic.canonicalName) !== normalize(expectedInterpretation)) add("destination", sourceText, "useful correction");
    else add("destination", sourceText, "neutral");
  }
  for (const actual of intent.destinationCandidates) {
    if (expectedDestinations.has(normalize(actual.sourceText))) continue;
    add("destination", actual.sourceText, input.comparison.safety.falseGeography.some((item) => normalize(item) === normalize(actual.sourceText)) ? "dangerous false geography" : "incorrect interpretation");
  }

  const actualPois = new Map(intent.pointsOfInterest.map((poi) => [normalize(poi.sourceText), poi]));
  const expectedPois = new Set((expected.pointsOfInterest ?? []).map((poi) => normalize(poi.sourceText)));
  for (const expectedPoi of expected.pointsOfInterest ?? []) {
    const actual = actualPois.get(normalize(expectedPoi.sourceText));
    if (!actual) { add("poi", expectedPoi.sourceText, "incorrect interpretation"); add("poi-association", expectedPoi.sourceText, "incorrect interpretation"); continue; }
    add("poi", expectedPoi.sourceText, normalize(actual.interpretedText ?? "") === normalize(expectedPoi.interpretedText ?? "") ? "useful additional understanding" : "incorrect interpretation");
    add("poi-association", expectedPoi.sourceText, normalize(actual.likelyDestinationSourceText ?? "") === normalize(expectedPoi.likelyDestinationSourceText ?? "") ? "useful additional understanding" : "incorrect interpretation");
  }
  for (const actual of intent.pointsOfInterest) if (!expectedPois.has(normalize(actual.sourceText))) add("poi", actual.sourceText, "incorrect interpretation");

  const actualAvoid = intent.transport.avoid.map((item) => item.mode);
  const transportMatches = intent.transport.departure.mode === (expected.departureMode ?? null)
    && normalize(intent.transport.departure.sourceText ?? "") === normalize(expected.departureSourceText ?? "")
    && sameStrings(intent.transport.interStop.modes, expected.interStopModes ?? [])
    && normalize(intent.transport.interStop.sourceText ?? "") === normalize(expected.interStopSourceText ?? "")
    && sameStrings(actualAvoid, expected.avoidModes ?? [])
    && (expected.avoidModes ?? []).every((mode) => {
      const actual = intent.transport.avoid.find((item) => item.mode === mode);
      return normalize(actual?.sourceText ?? "") === normalize(expected.avoidSourceTexts?.[mode] ?? "");
    });
  const hasExpectedTransport = Boolean(expected.departureMode || expected.interStopModes?.length || expected.avoidModes?.length);
  add("transport", "transport-context", transportMatches ? (hasExpectedTransport ? "useful additional understanding" : "neutral") : "incorrect interpretation");

  const expectedConstraints = (expected.constraints ?? []).map((item) => `${normalize(item.sourceText)}:${item.kind}:${item.strength}`);
  const actualConstraints = intent.constraints.map((item) => `${normalize(item.sourceText)}:${item.kind}:${item.strength}`);
  add("constraint", "constraints", sameStrings(actualConstraints, expectedConstraints) ? "neutral" : "incorrect interpretation");
  const expectedInterests = (expected.interests ?? []).map((item) => `${normalize(item.sourceText)}:${item.value}`);
  const actualInterests = intent.interests.map((item) => `${normalize(item.sourceText)}:${item.value}`);
  add("interest", "interests", sameStrings(actualInterests, expectedInterests) ? "neutral" : "incorrect interpretation");
  const expectedAmbiguities = (expected.ambiguities ?? []).map((item) => `${normalize(item.sourceText)}:${item.kind}`);
  const actualAmbiguities = intent.ambiguities.map((item) => `${normalize(item.sourceText)}:${item.kind}`);
  add("ambiguity", "ambiguities", sameStrings(actualAmbiguities, expectedAmbiguities) ? "neutral" : "incorrect interpretation");
  add("unclassified-text", "unclassified-meaning", sameStrings(intent.unresolvedMeaningfulText, expected.unresolvedMeaningfulText ?? []) ? "neutral" : "incorrect interpretation");
  if (input.comparison.safety.inventedFacts > 0) add("extraction", "invented-facts", "fabricated fact");
  return assessments;
}

function summarize(cases: SemanticIntentFixtureShadowReport["cases"]): SemanticIntentFixtureShadowSummary {
  const classifications = emptyClassifications();
  for (const assessment of cases.flatMap((item) => item.assessments)) classifications[assessment.classification] += 1;
  const destinationCandidates = cases.reduce((sum, item) => sum + (item.comparison.semantic?.destinationCandidates.length ?? 0), 0);
  const falseGeographyCount = cases.reduce((sum, item) => sum + item.comparison.safety.falseGeography.length, 0);
  let expectedPois = 0; let identifiedPois = 0; let interpretedPois = 0; let associatedPois = 0;
  let expectedTransportSignals = 0; let correctTransportSignals = 0;
  for (const item of cases) {
    const fixture = PROMPT_CAPTURE_REGRESSION_CASES.find((candidate) => candidate.id === item.caseId);
    const expected = fixture?.semanticExpectation;
    const semantic = item.comparison.semantic;
    if (!expected || !semantic) continue;
    for (const poi of expected.pointsOfInterest ?? []) {
      expectedPois += 1;
      const actual = semantic.poiCandidates.find((candidate) => normalize(candidate.sourceText) === normalize(poi.sourceText));
      if (!actual) continue;
      identifiedPois += 1;
      if (normalize(actual.interpretedText ?? "") === normalize(poi.interpretedText ?? "")) interpretedPois += 1;
      if (normalize(actual.likelyDestinationSourceText ?? "") === normalize(poi.likelyDestinationSourceText ?? "")) associatedPois += 1;
    }
    if (expected.departureMode) {
      expectedTransportSignals += 1;
      if (semantic.departureMode === expected.departureMode && normalize(semantic.departureSourceText ?? "") === normalize(expected.departureSourceText ?? "")) correctTransportSignals += 1;
    }
    for (const mode of expected.interStopModes ?? []) {
      expectedTransportSignals += 1;
      if (semantic.interStopModes.includes(mode) && normalize(semantic.interStopSourceText ?? "") === normalize(expected.interStopSourceText ?? "")) correctTransportSignals += 1;
    }
    for (const mode of expected.avoidModes ?? []) {
      expectedTransportSignals += 1;
      const actual = semantic.avoid.find((candidate) => candidate.mode === mode);
      if (actual && normalize(actual.sourceText) === normalize(expected.avoidSourceTexts?.[mode] ?? "")) correctTransportSignals += 1;
    }
  }
  const inputTokens = cases.reduce((sum, item) => sum + (item.comparison.usage?.inputTokens ?? 0), 0);
  const outputTokens = cases.reduce((sum, item) => sum + (item.comparison.usage?.outputTokens ?? 0), 0);
  const totalTokens = cases.reduce((sum, item) => sum + (item.comparison.usage?.totalTokens ?? ((item.comparison.usage?.inputTokens ?? 0) + (item.comparison.usage?.outputTokens ?? 0))), 0);
  const totalLatency = cases.reduce((sum, item) => sum + item.comparison.latencyMs, 0);
  return {
    caseCount: cases.length,
    classifications,
    falseGeography: { count: falseGeographyCount, destinationCandidates, rate: destinationCandidates ? falseGeographyCount / destinationCandidates : 0 },
    poi: { expected: expectedPois, identified: identifiedPois, interpretedCorrectly: interpretedPois, associationsCorrect: associatedPois, identificationRate: expectedPois ? identifiedPois / expectedPois : null, associationAccuracy: identifiedPois ? associatedPois / identifiedPois : null },
    transport: { expectedSignals: expectedTransportSignals, correctSignals: correctTransportSignals, accuracy: expectedTransportSignals ? correctTransportSignals / expectedTransportSignals : null },
    latencyMs: { total: totalLatency, mean: cases.length ? totalLatency / cases.length : null },
    tokens: { input: inputTokens, output: outputTokens, total: totalTokens, missingUsageCases: cases.filter((item) => !item.comparison.usage).length },
    approximateCostUsd: cases.reduce((sum, item) => sum + (item.comparison.cost?.approximateUsd ?? 0), 0),
  };
}

/**
 * Runs A/B comparison over the existing sanitized capture corpus. A provider
 * must be injected deliberately, so importing or testing this harness can
 * never create a live API call.
 */
export async function runSemanticIntentFixtureShadow(options: {
  providerForFixture: (fixture: PromptCaptureRegressionFixture) => SemanticIntentProvider;
  fixtures?: PromptCaptureRegressionFixture[];
  timeoutMs?: number;
}): Promise<SemanticIntentFixtureShadowReport> {
  const fixtures = (options.fixtures ?? PROMPT_CAPTURE_REGRESSION_CASES).filter((fixture) => fixture.semanticExpectation);
  const cases = [];
  for (const fixture of fixtures) {
    const logs: SemanticIntentShadowLog[] = [];
    const deterministic = captureJourneyBrief(fixture.rawPrompt);
    const result = await runSemanticIntentShadow({
      rawPrompt: fixture.rawPrompt,
      deterministic,
      mode: "shadow",
      provider: options.providerForFixture(fixture),
      timeoutMs: options.timeoutMs,
      log: (event) => logs.push(event),
    });
    cases.push({
      caseId: fixture.id,
      comparison: result.comparison,
      escalation: result.escalation,
      assessments: classifySemanticIntentDifferences({ fixture, deterministic, extraction: result.extraction, comparison: result.comparison }),
      logs,
    });
  }
  return { kind: "semantic-intent-fixture-shadow-v1", cases, summary: summarize(cases) };
}
