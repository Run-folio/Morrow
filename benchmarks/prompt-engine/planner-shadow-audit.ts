import { evaluatePlannerShadow, type IntentReview, type PlannerReviewProvider, type PlannerShadowLog, type PlannerShadowResult } from "../../lib/easyt/planner-shadow.ts";
import { PROMPT_ENGINE_CASES, PROMPT_ENGINE_DIMENSIONS, type PromptEngineCase, type PromptEngineDimension } from "./fixtures.ts";
import { evaluatePromptEngineCase, plannerShadowInputForPromptEngineCase, routeAssessment, type PromptEngineResult } from "./harness.ts";
import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";

export const PLANNER_SHADOW_AUDIT_LIMITS = {
  maxCases: 15,
  maxCalls: 15,
  maxSuiteMs: 120_000,
  maxCallMs: 8_000,
  // Preflight includes every fixture input plus the provider's 700-token
  // response cap, preventing a partial suite or an unbounded spend.
  maxTotalTokens: 50_000,
  reservedOutputTokensPerCall: 700,
} as const;

type DimensionSignal = { signals: number; knownMissesDetected: number; falseCorrections: number };
type FailureCounts = Record<"completed" | "disabled" | "unavailable" | "failed" | "provider-failure" | "invalid-response" | "timeout", number>;

export type PlannerShadowAuditReport = {
  kind: "planner-shadow-audit-v1";
  mode: "fixture" | "live";
  caseCount: number;
  limits: typeof PLANNER_SHADOW_AUDIT_LIMITS;
  completion: { completed: number; fallback: number; completionRate: number; fallbackRate: number };
  disagreementByDimension: Record<PromptEngineDimension, DimensionSignal>;
  corrections: { knownMissesDetected: number; falseCorrections: number; hardSoftClassification: { correct: number; incorrect: number; accuracy: number | null } };
  ambiguity: { expected: number; detected: number; missed: number; falsePositive: number };
  routeCandidatePreference: { eligible: number; expressed: number; agreed: number; disagreed: number; abstained: number; agreementRate: number | null };
  liveResearch: { requested: number; unnecessary: number };
  failures: FailureCounts;
  latencyMs: { total: number; mean: number | null; p50: number | null; p95: number | null };
  tokens: { input: number; output: number; total: number; missingUsageCalls: number };
};

const correctionDimensions: Record<IntentReview["suggestedBriefCorrections"][number]["subject"], PromptEngineDimension[]> = {
  duration: ["time-realism"],
  "route-order": ["route"],
  transport: ["constraints", "route"],
  "place-ambiguity": ["uncertainty", "state-preservation"],
  pace: ["intent"],
  booking: ["explanation"],
  unknown: ["uncertainty"],
};

const dimensionsForFailure = (failure: string): PromptEngineDimension[] => {
  if (failure === "intent facts changed") return ["intent"];
  if (failure === "hard constraint changed") return ["constraints"];
  if (failure === "canonical place identity changed" || failure === "unknown input was invented") return ["state-preservation"];
  if (failure === "expected warning or conflict missing") return ["uncertainty"];
  if (failure === "route state is not appropriate for the captured intent") return ["route"];
  if (failure === "time realism warning changed") return ["time-realism"];
  if (failure === "no explanation boundary available") return ["explanation"];
  return [];
};

function expectedClassification(subject: IntentReview["suggestedBriefCorrections"][number]["subject"], scenario: PromptEngineCase) {
  const hard = new Set(scenario.expectedHardFacts.hardConstraints ?? []);
  if (subject === "duration") return hard.has("duration") ? "hard" : "soft";
  if (subject === "route-order") return hard.has("start-at") || hard.has("end-at") || hard.has("must-visit") ? "hard" : "soft";
  if (subject === "transport") return hard.has("no-driving") ? "hard" : "soft";
  if (subject === "place-ambiguity") return scenario.expectedWarningsOrConflicts.some((code) => ["ambiguous_place", "unresolved_place", "region_requires_base"].includes(code)) ? "hard" : "soft";
  return "soft";
}

function expectedAmbiguity(scenario: PromptEngineCase) {
  return scenario.expectedWarningsOrConflicts.some((code) => ["ambiguous_place", "unresolved_place", "region_requires_base"].includes(code));
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function emptyFailures(): FailureCounts {
  return { completed: 0, disabled: 0, unavailable: 0, failed: 0, "provider-failure": 0, "invalid-response": 0, timeout: 0 };
}

/**
 * Aggregate-only audit: it retains no prompts, trip data, model rationales or
 * account identifiers. The deterministic gauntlet remains the sole scoring
 * contract; advisory observations only describe its overlap with that score.
 */
export async function runPlannerShadowAudit(options: {
  provider: PlannerReviewProvider;
  mode: "fixture" | "live";
  cases?: PromptEngineCase[];
  now?: () => number;
}): Promise<PlannerShadowAuditReport> {
  const cases = (options.cases ?? PROMPT_ENGINE_CASES).slice(0, PLANNER_SHADOW_AUDIT_LIMITS.maxCases);
  if (cases.length > PLANNER_SHADOW_AUDIT_LIMITS.maxCalls) throw new Error("Planner shadow audit call budget exceeded.");
  const estimatedTokens = cases.reduce((total, scenario) => total + Math.ceil(JSON.stringify(plannerShadowInputForPromptEngineCase(scenario)).length / 4) + PLANNER_SHADOW_AUDIT_LIMITS.reservedOutputTokensPerCall, 0);
  if (estimatedTokens > PLANNER_SHADOW_AUDIT_LIMITS.maxTotalTokens) throw new Error("Planner shadow audit token budget exceeded before any request.");

  const now = options.now ?? Date.now;
  const suiteStartedAt = now();
  const dimensions = Object.fromEntries(PROMPT_ENGINE_DIMENSIONS.map((dimension) => [dimension, { signals: 0, knownMissesDetected: 0, falseCorrections: 0 }])) as Record<PromptEngineDimension, DimensionSignal>;
  const failures = emptyFailures(); const latencies: number[] = [];
  let inputTokens = 0; let outputTokens = 0; let missingUsageCalls = 0;
  let knownMissesDetected = 0; let falseCorrections = 0; let classificationCorrect = 0; let classificationIncorrect = 0;
  let ambiguityExpected = 0; let ambiguityDetected = 0; let ambiguityMissed = 0; let ambiguityFalsePositive = 0;
  let preferenceEligible = 0; let preferenceExpressed = 0; let preferenceAgreed = 0; let preferenceDisagreed = 0;
  let researchRequested = 0; let unnecessaryResearch = 0;

  for (const scenario of cases) {
    if (now() - suiteStartedAt >= PLANNER_SHADOW_AUDIT_LIMITS.maxSuiteMs) throw new Error("Planner shadow audit time budget exceeded.");
    const input = plannerShadowInputForPromptEngineCase(scenario);
    const deterministic = evaluatePromptEngineCase(scenario);
    const assessment = routeAssessment(scenario, captureJourneyBrief(scenario.rawPrompt).structuredBrief);
    const logs: PlannerShadowLog[] = [];
    const result = await evaluatePlannerShadow(input, { mode: "shadow", provider: options.provider, timeoutMs: PLANNER_SHADOW_AUDIT_LIMITS.maxCallMs, log: (event) => logs.push(event) });
    const event = logs[0];
    if (event) {
      latencies.push(event.latencyMs);
      if (event.usage?.inputTokens === undefined && event.usage?.outputTokens === undefined) missingUsageCalls += 1;
      inputTokens += event.usage?.inputTokens ?? 0; outputTokens += event.usage?.outputTokens ?? 0;
    } else missingUsageCalls += 1;
    failures[result.status] += 1;
    if (!result.review) continue;

    const baselineFailureDimensions = new Set(deterministic.deterministicFailures.flatMap(dimensionsForFailure));
    const review = result.review;
    const hasExpectedAmbiguity = expectedAmbiguity(scenario);
    if (hasExpectedAmbiguity) ambiguityExpected += 1;
    if (review.ambiguities.length) {
      if (hasExpectedAmbiguity) ambiguityDetected += 1;
      else ambiguityFalsePositive += 1;
    } else if (hasExpectedAmbiguity) ambiguityMissed += 1;

    for (const correction of review.suggestedBriefCorrections) {
      const expected = expectedClassification(correction.subject, scenario);
      if (correction.classification === expected) classificationCorrect += 1;
      else classificationIncorrect += 1;
      for (const dimension of correctionDimensions[correction.subject]) {
        dimensions[dimension].signals += 1;
        if (baselineFailureDimensions.has(dimension)) { dimensions[dimension].knownMissesDetected += 1; knownMissesDetected += 1; }
        else { dimensions[dimension].falseCorrections += 1; falseCorrections += 1; }
      }
    }

    const candidates = input.routeCandidates;
    const deterministicCandidate = candidates.find((candidate) => candidate.stopIds.join("|") === input.engineFacts.selectedStopIds.join("|"));
    if (candidates.length > 1 && deterministicCandidate) {
      preferenceEligible += 1;
      if (review.candidatePreference) {
        preferenceExpressed += 1;
        if (review.candidatePreference.candidateId === deterministicCandidate.id) preferenceAgreed += 1;
        else preferenceDisagreed += 1;
      }
    }

    researchRequested += review.liveResearchNeeds.length;
    const noKnownOpenIssue = deterministic.deterministicFailures.length === 0
      && input.engineFacts.routeState !== "insufficient-data"
      && input.engineFacts.shortfallDays === 0
      && input.engineFacts.routeConstraintIssueCodes.length === 0;
    if (noKnownOpenIssue) unnecessaryResearch += review.liveResearchNeeds.length;
  }

  const completed = failures.completed;
  const fallback = cases.length - completed;
  const classified = classificationCorrect + classificationIncorrect;
  return {
    kind: "planner-shadow-audit-v1", mode: options.mode, caseCount: cases.length, limits: PLANNER_SHADOW_AUDIT_LIMITS,
    completion: { completed, fallback, completionRate: cases.length ? completed / cases.length : 0, fallbackRate: cases.length ? fallback / cases.length : 0 },
    disagreementByDimension: dimensions,
    corrections: { knownMissesDetected, falseCorrections, hardSoftClassification: { correct: classificationCorrect, incorrect: classificationIncorrect, accuracy: classified ? classificationCorrect / classified : null } },
    ambiguity: { expected: ambiguityExpected, detected: ambiguityDetected, missed: ambiguityMissed, falsePositive: ambiguityFalsePositive },
    routeCandidatePreference: { eligible: preferenceEligible, expressed: preferenceExpressed, agreed: preferenceAgreed, disagreed: preferenceDisagreed, abstained: preferenceEligible - preferenceExpressed, agreementRate: preferenceExpressed ? preferenceAgreed / preferenceExpressed : null },
    liveResearch: { requested: researchRequested, unnecessary: unnecessaryResearch },
    failures,
    latencyMs: { total: latencies.reduce((total, value) => total + value, 0), mean: latencies.length ? latencies.reduce((total, value) => total + value, 0) / latencies.length : null, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, missingUsageCalls },
  };
}
