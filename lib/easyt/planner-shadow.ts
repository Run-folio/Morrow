import type { StructuredTripBrief } from "./structured-trip-brief.ts";

export type PlannerShadowMode = "off" | "shadow";
export type PlannerShadowStatus = "disabled" | "completed" | "unavailable" | "failed" | "provider-failure" | "timeout" | "invalid-response";
export type PlannerShadowCandidate = { id: string; stopIds: string[]; summary: string };
export type PlannerShadowInput = { rawTravellerPrompt: string; structuredBrief: StructuredTripBrief; selectedRouteDirection: string; routeCandidates: PlannerShadowCandidate[]; engineFacts: { routeState: "insufficient-data" | "current-order" | "recommendation"; selectedStopIds: string[]; comfortableDays: number; shortfallDays: number; routeConstraintIssueCodes: string[]; scoreExplanation?: string } };
export type IntentReview = { suggestedBriefCorrections: Array<{ subject: "duration" | "route-order" | "transport" | "place-ambiguity" | "pace" | "booking" | "unknown"; classification: "hard" | "soft"; canonicalPlaceIds: string[]; rationale: string }>; ambiguities: Array<{ canonicalPlaceIds: string[]; question: string }>; candidatePreference?: { candidateId: string; rationale: string }; challenges: Array<{ code: "time" | "transfer" | "constraint" | "uncertainty"; rationale: string }>; liveResearchNeeds: Array<"transport-schedule" | "availability" | "price" | "entry-requirements" | "weather" | "accessibility" | "opening-hours"> };
export type PlannerShadowResult = { mode: PlannerShadowMode; status: PlannerShadowStatus; review: IntentReview | null };
export type PlannerShadowRateLimit = { requestLimit?: number; requestsRemaining?: number; requestResetMs?: number; tokenLimit?: number; tokensRemaining?: number; tokenResetMs?: number; retryAfterMs?: number };
export type PlannerReviewProvider = { model: string; review(input: PlannerShadowInput, signal: AbortSignal): Promise<{ review: unknown; usage?: { inputTokens?: number; outputTokens?: number }; rateLimit?: PlannerShadowRateLimit }> };
export type PlannerShadowSafety = { inventedCanonicalIds: number; invalidCandidatePreference: boolean };
export type PlannerShadowLog = { model: string; mode: PlannerShadowMode; latencyMs: number; usage?: { inputTokens?: number; outputTokens?: number }; rateLimit?: PlannerShadowRateLimit; status: PlannerShadowStatus; safety?: PlannerShadowSafety; providerError?: { status?: number; category: PlannerShadowProviderError["category"]; reason: PlannerShadowProviderError["reason"]; retryAfterMs?: number } };

/** Deliberately carries no provider message into aggregate-safe shadow logs. */
export class PlannerShadowProviderError extends Error {
  readonly status?: number;
  readonly category: "auth" | "invalid-request" | "model" | "rate-limit" | "provider" | "malformed-response";
  readonly reason: "schema" | "token-budget" | "input" | "parameter" | "generation" | "unknown";
  readonly rateLimit?: PlannerShadowRateLimit;

  constructor(detail: { status?: number; category?: "auth" | "invalid-request" | "model" | "rate-limit" | "provider" | "malformed-response"; reason?: "schema" | "token-budget" | "input" | "parameter" | "generation" | "unknown"; rateLimit?: PlannerShadowRateLimit } = {}) {
    super("Planner shadow provider failed.");
    this.name = "PlannerShadowProviderError";
    this.status = detail.status;
    this.category = detail.category ?? "provider";
    this.reason = detail.reason ?? "unknown";
    this.rateLimit = detail.rateLimit;
  }
}

const subjects = new Set(["duration", "route-order", "transport", "place-ambiguity", "pace", "booking", "unknown"]);
const classifications = new Set(["hard", "soft"]); const challenges = new Set(["time", "transfer", "constraint", "uncertainty"]); const research = new Set(["transport-schedule", "availability", "price", "entry-requirements", "weather", "accessibility", "opening-hours"]);
const text = (value: unknown, max = 400) => typeof value === "string" ? value.trim().slice(0, max) : "";
const strings = (value: unknown, max = 6) => Array.isArray(value) ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 120)] : []).slice(0, max) : [];

/** Inspect only aggregate boundary violations; never retain provider prose or IDs. */
export function intentReviewSafety(value: unknown, input: PlannerShadowInput): PlannerShadowSafety {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const known = new Set(input.structuredBrief.placeMentions?.flatMap((mention) => mention.canonicalPlaceId ?? []) ?? []);
  const correctionIds = Array.isArray(raw.suggestedBriefCorrections) ? raw.suggestedBriefCorrections.flatMap((item) => item && typeof item === "object" ? strings((item as Record<string, unknown>).canonicalPlaceIds) : []) : [];
  const ambiguityIds = Array.isArray(raw.ambiguities) ? raw.ambiguities.flatMap((item) => item && typeof item === "object" ? strings((item as Record<string, unknown>).canonicalPlaceIds) : []) : [];
  const candidate = raw.candidatePreference && typeof raw.candidatePreference === "object" ? raw.candidatePreference as Record<string, unknown> : undefined;
  const candidateId = text(candidate?.candidateId, 120);
  return {
    inventedCanonicalIds: [...correctionIds, ...ambiguityIds].filter((id) => !known.has(id)).length,
    invalidCandidatePreference: Boolean(candidateId && !input.routeCandidates.some((item) => item.id === candidateId)),
  };
}

/** Reject advisory references that are not already present in deterministic Place Intelligence. */
export function normalizeIntentReview(value: unknown, input: PlannerShadowInput): IntentReview | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const known = new Set(input.structuredBrief.placeMentions?.flatMap((mention) => mention.canonicalPlaceId ?? []) ?? []);
  const ids = (item: unknown) => strings(item).filter((id) => known.has(id));
  const corrections = Array.isArray(raw.suggestedBriefCorrections) ? raw.suggestedBriefCorrections.flatMap((item) => {
    if (!item || typeof item !== "object") return []; const row = item as Record<string, unknown>; const subject = text(row.subject, 40); const classification = text(row.classification, 20); const rationale = text(row.rationale);
    return subjects.has(subject) && classifications.has(classification) && rationale ? [{ subject: subject as IntentReview["suggestedBriefCorrections"][number]["subject"], classification: classification as IntentReview["suggestedBriefCorrections"][number]["classification"], canonicalPlaceIds: ids(row.canonicalPlaceIds), rationale }] : [];
  }).slice(0, 6) : [];
  const ambiguities = Array.isArray(raw.ambiguities) ? raw.ambiguities.flatMap((item) => { if (!item || typeof item !== "object") return []; const row = item as Record<string, unknown>; const question = text(row.question); return question ? [{ canonicalPlaceIds: ids(row.canonicalPlaceIds), question }] : []; }).slice(0, 6) : [];
  const candidate = raw.candidatePreference && typeof raw.candidatePreference === "object" ? raw.candidatePreference as Record<string, unknown> : undefined; const candidateId = text(candidate?.candidateId, 120); const candidatePreference = input.routeCandidates.some((item) => item.id === candidateId) && text(candidate?.rationale) ? { candidateId, rationale: text(candidate?.rationale) } : undefined;
  const challengeRows = Array.isArray(raw.challenges) ? raw.challenges.flatMap((item) => { if (!item || typeof item !== "object") return []; const row = item as Record<string, unknown>; const code = text(row.code, 40); const rationale = text(row.rationale); return challenges.has(code) && rationale ? [{ code: code as IntentReview["challenges"][number]["code"], rationale }] : []; }).slice(0, 6) : [];
  return { suggestedBriefCorrections: corrections, ambiguities, ...(candidatePreference ? { candidatePreference } : {}), challenges: challengeRows, liveResearchNeeds: strings(raw.liveResearchNeeds).filter((need): need is IntentReview["liveResearchNeeds"][number] => research.has(need)) };
}

export function plannerShadowMode(environment: { NODE_ENV?: string; MORROVIA_PLANNER_SHADOW_MODE?: string } = process.env): PlannerShadowMode { return (environment.NODE_ENV === "development" || environment.NODE_ENV === "test") && environment.MORROVIA_PLANNER_SHADOW_MODE === "shadow" ? "shadow" : "off"; }

export async function evaluatePlannerShadow(input: PlannerShadowInput, options: { mode: PlannerShadowMode; provider?: PlannerReviewProvider; timeoutMs?: number; log?: (event: PlannerShadowLog) => void }): Promise<PlannerShadowResult> {
  if (options.mode === "off") return { mode: "off", status: "disabled", review: null };
  if (!options.provider) return { mode: "shadow", status: "unavailable", review: null };
  const startedAt = Date.now(); let status: PlannerShadowStatus = "failed"; let usage: PlannerShadowLog["usage"]; let rateLimit: PlannerShadowLog["rateLimit"]; let safety: PlannerShadowLog["safety"]; let providerError: PlannerShadowLog["providerError"];
  try { const response = await options.provider.review(input, AbortSignal.timeout(options.timeoutMs ?? 8_000)); usage = response.usage; rateLimit = response.rateLimit; safety = intentReviewSafety(response.review, input); const review = normalizeIntentReview(response.review, input); status = review ? "completed" : "invalid-response"; return { mode: "shadow", status, review }; }
  catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (error instanceof PlannerShadowProviderError) providerError = { status: error.status, category: error.category, reason: error.reason, ...(error.rateLimit?.retryAfterMs ? { retryAfterMs: error.rateLimit.retryAfterMs } : {}) };
    status = name === "TimeoutError" || name === "AbortError"
      ? "timeout"
      : error instanceof PlannerShadowProviderError ? "provider-failure" : "failed";
    return { mode: "shadow", status, review: null };
  }
  finally { options.log?.({ model: options.provider.model, mode: "shadow", latencyMs: Date.now() - startedAt, usage, ...(rateLimit ? { rateLimit } : {}), status, ...(safety ? { safety } : {}), ...(providerError ? { providerError } : {}) }); }
}
