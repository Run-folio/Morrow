import { evaluatePlannerShadow, type IntentReview, type PlannerReviewProvider, type PlannerShadowLog, type PlannerShadowResult } from "../../lib/easyt/planner-shadow.ts";
import { PROMPT_ENGINE_CASES, PROMPT_ENGINE_DIMENSIONS, type PromptEngineCase, type PromptEngineDimension } from "./fixtures.ts";
import { evaluatePromptEngineCase, plannerShadowInputForPromptEngineCase, routeAssessment, type PromptEngineResult } from "./harness.ts";
import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";

export const PLANNER_SHADOW_AUDIT_LIMITS = {
  maxCases: 15,
  maxCalls: 15,
  // A free-tier-safe, sequential run can need several token windows. This is
  // an upper bound, not a target; the audit stops early with a partial report.
  maxSuiteMs: 1_200_000,
  maxCallMs: 8_000,
  // Reservations include each serialized fixture plus the provider's 700-token
  // response cap. This stays comfortably below the documented free daily cap.
  maxTotalTokens: 48_000,
  reservedOutputTokensPerCall: 700,
} as const;

/** Conservative defaults below Groq's documented free-plan 30 RPM / 8K TPM. */
export const PLANNER_SHADOW_LIVE_PACING_DEFAULTS = {
  requestsPerMinute: 15,
  tokensPerMinute: 6_000,
  windowMs: 60_000,
} as const;

export type PlannerShadowLivePacing = { requestsPerMinute: number; tokensPerMinute: number; windowMs: number };
export type PlannerShadowAuditProgress = { caseNumber: number; caseCount: number; requestTokens: number; completionTokens: number | null; runningSuiteTokens: number; latencyMs: number | null; waitAppliedMs: number; resultState: string };
type AuditStopReason = "suite-time-budget" | "suite-token-budget" | "account-request-quota" | "provider-token-quota" | "provider-rate-limit" | "repeated-provider-failure" | "repeated-malformed-output";
type AdvisoryClassification = "useful correction" | "useful warning/ambiguity" | "neutral/redundant" | "unnecessary correction" | "incorrect correction" | "unsupported certainty" | "hard-constraint risk";
type AdvisoryOutcome = { caseNumber: number; resultState: string; classification: AdvisoryClassification | null };

type DimensionSignal = { signals: number; knownMissesDetected: number; falseCorrections: number };
type FailureCounts = Record<"completed" | "disabled" | "unavailable" | "failed" | "provider-failure" | "invalid-response" | "timeout", number>;

export type PlannerShadowAuditReport = {
  kind: "planner-shadow-audit-v1";
  mode: "fixture" | "live";
  caseCount: number;
  execution: { attempted: number; stoppedEarly: boolean; stopReason: AuditStopReason | null; wallClockMs: number };
  limits: typeof PLANNER_SHADOW_AUDIT_LIMITS;
  completion: { completed: number; fallback: number; completionRate: number; fallbackRate: number };
  disagreementByDimension: Record<PromptEngineDimension, DimensionSignal>;
  corrections: { knownMissesDetected: number; falseCorrections: number; hardSoftClassification: { correct: number; incorrect: number; accuracy: number | null } };
  ambiguity: { expected: number; detected: number; missed: number; falsePositive: number };
  routeCandidatePreference: { eligible: number; expressed: number; agreed: number; disagreed: number; abstained: number; agreementRate: number | null };
  liveResearch: { requested: number; unnecessary: number };
  failures: FailureCounts;
  latencyMs: { total: number; mean: number | null; p50: number | null; p95: number | null };
  tokens: { input: number; output: number; total: number; reserved: number; missingUsageCalls: number };
  rateLimits: { events: number; latest: { requestLimit?: number; requestsRemaining?: number; requestResetMs?: number; tokenLimit?: number; tokensRemaining?: number; tokenResetMs?: number } | null };
  advisoryOutcomes: AdvisoryOutcome[];
  hardSafety: { total: number; inventedCanonicalIds: number; invalidCandidatePreferences: number; hardConstraintRisks: number };
  caseProgress: PlannerShadowAuditProgress[];
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

function advisoryClassification(review: IntentReview | null, safety: PlannerShadowLog["safety"], scenario: PromptEngineCase, deterministic: PromptEngineResult) {
  if (!review) return null;
  if ((safety?.inventedCanonicalIds ?? 0) > 0) return "unsupported certainty" as const;
  if (safety?.invalidCandidatePreference) return "incorrect correction" as const;
  const corrections = review.suggestedBriefCorrections;
  const hardConstraintRisk = corrections.some((correction) => expectedClassification(correction.subject, scenario) === "hard" && correction.classification !== "hard");
  if (hardConstraintRisk) return "hard-constraint risk" as const;
  if (corrections.some((correction) => correction.classification !== expectedClassification(correction.subject, scenario))) return "incorrect correction" as const;
  const baselineFailureDimensions = new Set(deterministic.deterministicFailures.flatMap(dimensionsForFailure));
  const usefulCorrection = corrections.some((correction) => correctionDimensions[correction.subject].some((dimension) => baselineFailureDimensions.has(dimension)));
  if (usefulCorrection) return "useful correction" as const;
  if (review.ambiguities.length && expectedAmbiguity(scenario) && baselineFailureDimensions.has("uncertainty")) return "useful warning/ambiguity" as const;
  if (corrections.length) return "unnecessary correction" as const;
  return "neutral/redundant" as const;
}

function emptyFailures(): FailureCounts {
  return { completed: 0, disabled: 0, unavailable: 0, failed: 0, "provider-failure": 0, "invalid-response": 0, timeout: 0 };
}

function clampConfiguredLimit(value: string | undefined, defaultValue: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(defaultValue, Math.floor(parsed)) : defaultValue;
}

/** Environment overrides may only make the live runner more conservative. */
export function plannerShadowLivePacing(environment: Record<string, string | undefined> = process.env): PlannerShadowLivePacing {
  return {
    requestsPerMinute: clampConfiguredLimit(environment.MORROVIA_PLANNER_SHADOW_RPM, PLANNER_SHADOW_LIVE_PACING_DEFAULTS.requestsPerMinute),
    tokensPerMinute: clampConfiguredLimit(environment.MORROVIA_PLANNER_SHADOW_TPM, PLANNER_SHADOW_LIVE_PACING_DEFAULTS.tokensPerMinute),
    windowMs: PLANNER_SHADOW_LIVE_PACING_DEFAULTS.windowMs,
  };
}

function createPacer(pacing: PlannerShadowLivePacing, now: () => number, sleep: (ms: number) => Promise<void>) {
  const reservations: Array<{ at: number; tokens: number }> = [];
  let tokenCeiling: number = pacing.tokensPerMinute;
  let providerTokensRemaining: number | undefined;
  let providerTokenResetAt: number | undefined;
  let blockedReason: "provider-token-quota" | undefined;
  const prune = () => {
    const threshold = now() - pacing.windowMs;
    while (reservations[0] && reservations[0].at <= threshold) reservations.shift();
    if (providerTokenResetAt !== undefined && providerTokenResetAt <= now()) {
      providerTokensRemaining = undefined;
      providerTokenResetAt = undefined;
    }
  };
  const waitForReservation = async (tokens: number) => {
    blockedReason = undefined;
    if (tokens > tokenCeiling) return null;
    prune();
    let waitMs = 0;
    if (providerTokensRemaining !== undefined && providerTokensRemaining < tokens) {
      if (providerTokenResetAt === undefined || providerTokenResetAt <= now()) {
        blockedReason = "provider-token-quota";
        return null;
      }
      waitMs = Math.max(waitMs, providerTokenResetAt - now());
    }
    if (reservations.length >= pacing.requestsPerMinute) waitMs = Math.max(waitMs, reservations[0]!.at + pacing.windowMs - now());
    let activeTokens = reservations.reduce((total, reservation) => total + reservation.tokens, 0);
    for (const reservation of reservations) {
      if (activeTokens + tokens <= tokenCeiling) break;
      waitMs = Math.max(waitMs, reservation.at + pacing.windowMs - now());
      activeTokens -= reservation.tokens;
    }
    if (waitMs > 0) { await sleep(waitMs); prune(); }
    reservations.push({ at: now(), tokens });
    return Math.max(0, waitMs);
  };
  return {
    waitForReservation,
    blockedReason: () => blockedReason,
    observe(rateLimit: { tokenLimit?: number; tokensRemaining?: number; tokenResetMs?: number } | undefined) {
      if (rateLimit?.tokenLimit) tokenCeiling = Math.min(tokenCeiling, Math.floor(rateLimit.tokenLimit * 0.75));
      if (rateLimit?.tokensRemaining !== undefined) {
        providerTokensRemaining = rateLimit.tokensRemaining;
        providerTokenResetAt = rateLimit.tokenResetMs === undefined ? undefined : now() + rateLimit.tokenResetMs;
      }
    },
  };
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
  sleep?: (ms: number) => Promise<void>;
  pacing?: PlannerShadowLivePacing;
  progress?: (event: PlannerShadowAuditProgress) => void;
}): Promise<PlannerShadowAuditReport> {
  const cases = (options.cases ?? PROMPT_ENGINE_CASES).slice(0, PLANNER_SHADOW_AUDIT_LIMITS.maxCases);
  if (cases.length > PLANNER_SHADOW_AUDIT_LIMITS.maxCalls) throw new Error("Planner shadow audit call budget exceeded.");

  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pacer = options.mode === "live" ? createPacer(options.pacing ?? plannerShadowLivePacing(), now, sleep) : undefined;
  const suiteStartedAt = now();
  const dimensions = Object.fromEntries(PROMPT_ENGINE_DIMENSIONS.map((dimension) => [dimension, { signals: 0, knownMissesDetected: 0, falseCorrections: 0 }])) as Record<PromptEngineDimension, DimensionSignal>;
  const failures = emptyFailures(); const latencies: number[] = [];
  let inputTokens = 0; let outputTokens = 0; let reservedTokens = 0; let missingUsageCalls = 0;
  let knownMissesDetected = 0; let falseCorrections = 0; let classificationCorrect = 0; let classificationIncorrect = 0;
  let ambiguityExpected = 0; let ambiguityDetected = 0; let ambiguityMissed = 0; let ambiguityFalsePositive = 0;
  let preferenceEligible = 0; let preferenceExpressed = 0; let preferenceAgreed = 0; let preferenceDisagreed = 0;
  let researchRequested = 0; let unnecessaryResearch = 0;
  const caseProgress: PlannerShadowAuditProgress[] = [];
  let stopReason: AuditStopReason | null = null;
  let rateLimitEvents = 0;
  let latestRateLimit: PlannerShadowAuditReport["rateLimits"]["latest"] = null;
  const advisoryOutcomes: AdvisoryOutcome[] = [];
  let inventedCanonicalIds = 0; let invalidCandidatePreferences = 0; let hardConstraintRisks = 0;

  for (const [index, scenario] of cases.entries()) {
    if (now() - suiteStartedAt >= PLANNER_SHADOW_AUDIT_LIMITS.maxSuiteMs) { stopReason = "suite-time-budget"; break; }
    const input = plannerShadowInputForPromptEngineCase(scenario);
    const requestReservation = Math.ceil(JSON.stringify(input).length / 4) + PLANNER_SHADOW_AUDIT_LIMITS.reservedOutputTokensPerCall;
    if (reservedTokens + requestReservation > PLANNER_SHADOW_AUDIT_LIMITS.maxTotalTokens) { stopReason = "suite-token-budget"; break; }
    const waitAppliedMs = pacer ? await pacer.waitForReservation(requestReservation) : 0;
    if (waitAppliedMs === null) { stopReason = pacer?.blockedReason() ?? "suite-token-budget"; break; }
    reservedTokens += requestReservation;
    const deterministic = evaluatePromptEngineCase(scenario);
    const assessment = routeAssessment(scenario, captureJourneyBrief(scenario.rawPrompt).structuredBrief);
    const logs: PlannerShadowLog[] = [];
    const result = await evaluatePlannerShadow(input, { mode: "shadow", provider: options.provider, timeoutMs: PLANNER_SHADOW_AUDIT_LIMITS.maxCallMs, log: (event) => logs.push(event) });
    const event = logs[0];
    if (event) {
      latencies.push(event.latencyMs);
      if (event.usage?.inputTokens === undefined && event.usage?.outputTokens === undefined) missingUsageCalls += 1;
      inputTokens += event.usage?.inputTokens ?? 0; outputTokens += event.usage?.outputTokens ?? 0;
      pacer?.observe(event.rateLimit);
      if (event.rateLimit) {
        const { retryAfterMs: _retryAfterMs, ...safeRateLimit } = event.rateLimit;
        latestRateLimit = safeRateLimit;
      }
    } else missingUsageCalls += 1;
    failures[result.status] += 1;
    inventedCanonicalIds += event?.safety?.inventedCanonicalIds ?? 0;
    invalidCandidatePreferences += Number(event?.safety?.invalidCandidatePreference ?? false);
    const progress = {
      caseNumber: index + 1,
      caseCount: cases.length,
      requestTokens: event?.usage?.inputTokens ?? requestReservation - PLANNER_SHADOW_AUDIT_LIMITS.reservedOutputTokensPerCall,
      completionTokens: event?.usage?.outputTokens ?? null,
      runningSuiteTokens: reservedTokens,
      latencyMs: event?.latencyMs ?? null,
      waitAppliedMs,
      resultState: result.status,
    };
    caseProgress.push(progress); options.progress?.(progress);
    const remainingCases = cases.length - index - 1;
    if (event?.providerError?.category === "rate-limit") { rateLimitEvents += 1; stopReason = "provider-rate-limit"; break; }
    if (event?.rateLimit?.requestsRemaining !== undefined && event.rateLimit.requestsRemaining < remainingCases) { stopReason = "account-request-quota"; break; }
    if (failures["provider-failure"] >= 2) { stopReason = "repeated-provider-failure"; break; }
    if (failures["invalid-response"] >= 2) { stopReason = "repeated-malformed-output"; break; }
    const outcome = advisoryClassification(result.review, event?.safety, scenario, deterministic);
    advisoryOutcomes.push({ caseNumber: index + 1, resultState: result.status, classification: outcome });
    if (outcome === "hard-constraint risk") hardConstraintRisks += 1;
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
  const fallback = caseProgress.length - completed;
  const classified = classificationCorrect + classificationIncorrect;
  return {
    kind: "planner-shadow-audit-v1", mode: options.mode, caseCount: cases.length, limits: PLANNER_SHADOW_AUDIT_LIMITS,
    execution: { attempted: caseProgress.length, stoppedEarly: Boolean(stopReason), stopReason, wallClockMs: now() - suiteStartedAt },
    completion: { completed, fallback, completionRate: cases.length ? completed / cases.length : 0, fallbackRate: cases.length ? fallback / cases.length : 0 },
    disagreementByDimension: dimensions,
    corrections: { knownMissesDetected, falseCorrections, hardSoftClassification: { correct: classificationCorrect, incorrect: classificationIncorrect, accuracy: classified ? classificationCorrect / classified : null } },
    ambiguity: { expected: ambiguityExpected, detected: ambiguityDetected, missed: ambiguityMissed, falsePositive: ambiguityFalsePositive },
    routeCandidatePreference: { eligible: preferenceEligible, expressed: preferenceExpressed, agreed: preferenceAgreed, disagreed: preferenceDisagreed, abstained: preferenceEligible - preferenceExpressed, agreementRate: preferenceExpressed ? preferenceAgreed / preferenceExpressed : null },
    liveResearch: { requested: researchRequested, unnecessary: unnecessaryResearch },
    failures,
    latencyMs: { total: latencies.reduce((total, value) => total + value, 0), mean: latencies.length ? latencies.reduce((total, value) => total + value, 0) / latencies.length : null, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens, reserved: reservedTokens, missingUsageCalls },
    rateLimits: { events: rateLimitEvents, latest: latestRateLimit },
    advisoryOutcomes,
    hardSafety: { total: inventedCanonicalIds + invalidCandidatePreferences + hardConstraintRisks, inventedCanonicalIds, invalidCandidatePreferences, hardConstraintRisks },
    caseProgress,
  };
}
