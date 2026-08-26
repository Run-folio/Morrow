import { PlannerShadowProviderError, type PlannerReviewProvider, type PlannerShadowInput, type PlannerShadowRateLimit } from "./planner-shadow.ts";

const model = "openai/gpt-oss-120b";
const endpoint = "https://api.groq.com/openai/v1/chat/completions";
const policy = "You are an advisory travel-planning critic. Review only supplied prompt, deterministic StructuredTripBrief, route candidates and engine facts. Do not invent dates, places, canonical IDs, prices, schedules, availability or transport facts. Canonical IDs must be copied only from the supplied brief. Unknown remains unknown. Suggest no mutations. Return JSON only.";
const schema = {
  type: "object", additionalProperties: false,
  required: ["suggestedBriefCorrections", "ambiguities", "candidatePreference", "challenges", "liveResearchNeeds"],
  properties: {
    suggestedBriefCorrections: { type: "array", items: { type: "object", additionalProperties: false, required: ["subject", "classification", "canonicalPlaceIds", "rationale"], properties: { subject: { type: "string" }, classification: { type: "string" }, canonicalPlaceIds: { type: "array", items: { type: "string" } }, rationale: { type: "string" } } } },
    ambiguities: { type: "array", items: { type: "object", additionalProperties: false, required: ["canonicalPlaceIds", "question"], properties: { canonicalPlaceIds: { type: "array", items: { type: "string" } }, question: { type: "string" } } } },
    // Strict Groq schemas require every declared field. Null preserves the optional advisory meaning.
    candidatePreference: { anyOf: [{ type: "object", additionalProperties: false, required: ["candidateId", "rationale"], properties: { candidateId: { type: "string" }, rationale: { type: "string" } } }, { type: "null" }] },
    challenges: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "rationale"], properties: { code: { type: "string" }, rationale: { type: "string" } } } },
    liveResearchNeeds: { type: "array", items: { type: "string" } },
  },
} as const;

type GroqErrorPayload = { error?: { type?: unknown; code?: unknown; message?: unknown; failed_generation?: unknown } };

function positiveInteger(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function durationMs(value: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const plainSeconds = Number(trimmed);
  if (Number.isFinite(plainSeconds) && plainSeconds > 0) return Math.ceil(plainSeconds * 1_000);
  const match = trimmed.match(/^(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!match) return undefined;
  const minutes = Number(match[1] ?? 0); const seconds = Number(match[2] ?? 0);
  const parsed = (minutes * 60 + seconds) * 1_000;
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : undefined;
}

/** Groq's response headers are aggregate-safe account limits, never prompts or traveller data. */
function rateLimitHeaders(headers: Headers): PlannerShadowRateLimit | undefined {
  const rateLimit = {
    requestLimit: positiveInteger(headers.get("x-ratelimit-limit-requests")),
    requestsRemaining: positiveInteger(headers.get("x-ratelimit-remaining-requests")),
    requestResetMs: durationMs(headers.get("x-ratelimit-reset-requests")),
    tokenLimit: positiveInteger(headers.get("x-ratelimit-limit-tokens")),
    tokensRemaining: positiveInteger(headers.get("x-ratelimit-remaining-tokens")),
    tokenResetMs: durationMs(headers.get("x-ratelimit-reset-tokens")),
    retryAfterMs: durationMs(headers.get("retry-after")),
  };
  return Object.values(rateLimit).some((value) => value !== undefined) ? rateLimit : undefined;
}

function providerErrorCategory(status: number, payload: GroqErrorPayload): "auth" | "invalid-request" | "model" | "rate-limit" | "provider" {
  const type = typeof payload.error?.type === "string" ? payload.error.type : "";
  const code = typeof payload.error?.code === "string" ? payload.error.code : "";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limit";
  if (/model/.test(type) || /model/.test(code)) return "model";
  if (status >= 400 && status < 500) return "invalid-request";
  return "provider";
}

/** Classifies known provider causes without retaining or logging provider text. */
function providerErrorReason(payload: GroqErrorPayload): PlannerShadowProviderError["reason"] {
  const message = typeof payload.error?.message === "string" ? payload.error.message.toLocaleLowerCase() : "";
  if (/schema|response_format|required.*field|additionalproperties/.test(message)) return "schema";
  if (/max_completion|completion token|context length|too many token/.test(message)) return "token-budget";
  if (/message|content|input/.test(message)) return "input";
  if (/temperature|parameter|unsupported/.test(message)) return "parameter";
  if (payload.error?.failed_generation || /generation/.test(message)) return "generation";
  return "unknown";
}

export function createGroqPlannerReviewProvider(apiKey: string, fetchImpl: typeof fetch = fetch): PlannerReviewProvider {
  return { model, async review(input: PlannerShadowInput, signal: AbortSignal) {
    const response = await fetchImpl(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0, reasoning_effort: "low", max_completion_tokens: 700, messages: [{ role: "system", content: policy }, { role: "user", content: JSON.stringify(input) }], response_format: { type: "json_schema", json_schema: { name: "morrovia_intent_review", strict: true, schema } } }), signal,
    });
    const rateLimit = rateLimitHeaders(response.headers);
    const payload = await response.json().catch(() => null) as ({ choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } } & GroqErrorPayload) | null;
    if (!response.ok) throw new PlannerShadowProviderError({ status: response.status, category: providerErrorCategory(response.status, payload ?? {}), reason: providerErrorReason(payload ?? {}), ...(rateLimit ? { rateLimit } : {}) });
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new PlannerShadowProviderError({ category: "malformed-response" });
    try { return { review: JSON.parse(content), usage: { inputTokens: payload?.usage?.prompt_tokens, outputTokens: payload?.usage?.completion_tokens }, ...(rateLimit ? { rateLimit } : {}) }; }
    catch { throw new PlannerShadowProviderError({ category: "malformed-response" }); }
  } };
}
