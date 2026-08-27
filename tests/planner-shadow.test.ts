import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { createGroqPlannerReviewProvider } from "../lib/easyt/groq-planner-review.ts";
import { executePlannerShadowRequest } from "../lib/easyt/planner-shadow-api.ts";
import { evaluatePlannerShadow, normalizeIntentReview, PlannerShadowProviderError, plannerShadowMode, type PlannerShadowInput } from "../lib/easyt/planner-shadow.ts";
import { PLANNER_SHADOW_LIVE_PACING_DEFAULTS, plannerShadowLivePacing, runPlannerShadowAudit } from "../benchmarks/prompt-engine/planner-shadow-audit.ts";
import { PROMPT_ENGINE_CASES } from "../benchmarks/prompt-engine/fixtures.ts";
import { assertReplayFixtureCurrent, runHybridEvaluation } from "../benchmarks/prompt-engine/hybrid-evaluation.ts";

const input = (): PlannerShadowInput => ({
  rawTravellerPrompt: "10 days from Tokyo to Kyoto, with food and no driving.",
  structuredBrief: captureJourneyBrief("10 days from Tokyo to Kyoto, with food and no driving.").structuredBrief,
  selectedRouteDirection: "balanced",
  routeCandidates: [{ id: "balanced", stopIds: ["tokyo", "kyoto"], summary: "Keep the direct route." }],
  engineFacts: { routeState: "current-order", selectedStopIds: ["tokyo", "kyoto"], comfortableDays: 6, shortfallDays: 0, routeConstraintIssueCodes: [], scoreExplanation: "Current order is direct." },
});

test("shadow mode is opt-in and cannot enable in production", () => {
  assert.equal(plannerShadowMode({ NODE_ENV: "production", MORROVIA_PLANNER_SHADOW_MODE: "shadow" }), "off");
  assert.equal(plannerShadowMode({ NODE_ENV: "development", MORROVIA_PLANNER_SHADOW_MODE: "shadow" }), "shadow");
  assert.equal(plannerShadowMode({ NODE_ENV: "test", MORROVIA_PLANNER_SHADOW_MODE: "off" }), "off");
});

test("review contract drops invented canonical IDs and unknown enum values", () => {
  const review = normalizeIntentReview({
    suggestedBriefCorrections: [{ subject: "route-order", classification: "soft", canonicalPlaceIds: ["tokyo", "invented-place"], rationale: "Keep the direct sequence." }],
    ambiguities: [{ canonicalPlaceIds: ["invented-place"], question: "Which base?" }],
    candidatePreference: { candidateId: "balanced", rationale: "It is the direct candidate." },
    challenges: [{ code: "transfer", rationale: "Keep arrival days light." }, { code: "price", rationale: "Invented enum." }],
    liveResearchNeeds: ["transport-schedule", "made-up-need"],
  }, input());
  assert.deepEqual(review?.suggestedBriefCorrections[0]?.canonicalPlaceIds, ["tokyo"]);
  assert.deepEqual(review?.ambiguities[0]?.canonicalPlaceIds, []);
  assert.equal(review?.candidatePreference?.candidateId, "balanced");
  assert.equal(review?.challenges.length, 1);
  assert.deepEqual(review?.liveResearchNeeds, ["transport-schedule"]);
});

test("off and failure paths keep deterministic input unchanged and issue one bounded call", async () => {
  const fixture = input(); const before = structuredClone(fixture); let calls = 0; const logs: unknown[] = [];
  const disabled = await evaluatePlannerShadow(fixture, { mode: "off", provider: { model: "never", review: async () => { calls += 1; return { review: {} }; } } });
  assert.deepEqual(disabled, { mode: "off", status: "disabled", review: null });
  const failed = await evaluatePlannerShadow(fixture, { mode: "shadow", timeoutMs: 10, provider: { model: "fixture", review: async () => { calls += 1; throw new Error("offline"); } }, log: (event) => logs.push(event) });
  assert.deepEqual(failed, { mode: "shadow", status: "failed", review: null });
  assert.equal(calls, 1); assert.deepEqual(fixture, before);
  assert.deepEqual(Object.keys(logs[0] as object).sort(), ["latencyMs", "mode", "model", "status", "usage"]);
  assert.equal(JSON.stringify(logs).includes(fixture.rawTravellerPrompt), false);
});

test("API request contract defaults to a deterministic disabled shadow response", async () => {
  assert.equal(await executePlannerShadowRequest({}), null);
  const response = await executePlannerShadowRequest(input(), { environment: { NODE_ENV: "production", MORROVIA_PLANNER_SHADOW_MODE: "shadow" } });
  assert.deepEqual(response, { mode: "off", status: "disabled", review: null });
});

test("shadow configuration without a key remains an unavailable advisory fallback", async () => {
  const response = await executePlannerShadowRequest(input(), { environment: { NODE_ENV: "development", MORROVIA_PLANNER_SHADOW_MODE: "shadow" } });
  assert.deepEqual(response, { mode: "shadow", status: "unavailable", review: null });
});

test("provider failures are classified without exposing provider messages", async () => {
  const logs: unknown[] = [];
  const response = await evaluatePlannerShadow(input(), { mode: "shadow", provider: { model: "fixture", review: async () => { throw new PlannerShadowProviderError({ status: 400, category: "invalid-request", reason: "schema" }); } }, log: (event) => logs.push(event) });
  assert.deepEqual(response, { mode: "shadow", status: "provider-failure", review: null });
  assert.deepEqual((logs[0] as { providerError?: unknown }).providerError, { status: 400, category: "invalid-request", reason: "schema" });
  assert.equal(JSON.stringify(logs).includes(input().rawTravellerPrompt), false);
});

test("Groq client makes one bounded, schema-constrained fixture request", async () => {
  let calls = 0; let requestBody: Record<string, unknown> | undefined; let headers: HeadersInit | undefined;
  const provider = createGroqPlannerReviewProvider("fixture-key", async (_url, init) => {
    calls += 1; requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>; headers = init?.headers;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestedBriefCorrections: [], ambiguities: [], candidatePreference: null, challenges: [], liveResearchNeeds: [] }) } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }));
  });
  const response = await provider.review(input(), new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(requestBody?.model, "openai/gpt-oss-120b");
  assert.equal(requestBody?.max_completion_tokens, 700);
  assert.equal(requestBody?.reasoning_effort, "low");
  assert.equal((requestBody?.response_format as { type?: string }).type, "json_schema");
  assert.deepEqual((requestBody?.response_format as { json_schema?: { schema?: { required?: string[]; properties?: { candidatePreference?: { anyOf?: unknown[] } } } } }).json_schema?.schema?.required, ["suggestedBriefCorrections", "ambiguities", "candidatePreference", "challenges", "liveResearchNeeds"]);
  assert.equal((requestBody?.response_format as { json_schema?: { schema?: { properties?: { candidatePreference?: { anyOf?: unknown[] } } } } }).json_schema?.schema?.properties?.candidatePreference?.anyOf?.length, 2);
  assert.equal(new Headers(headers).get("authorization"), "Bearer fixture-key");
  assert.equal("tools" in (requestBody ?? {}), false);
  assert.deepEqual(response.usage, { inputTokens: 12, outputTokens: 8 });
});

test("Groq client captures aggregate rate-limit headers without retaining response text", async () => {
  const provider = createGroqPlannerReviewProvider("fixture-key", async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestedBriefCorrections: [], ambiguities: [], candidatePreference: null, challenges: [], liveResearchNeeds: [] }) } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }), {
    headers: {
      "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": "999", "x-ratelimit-reset-requests": "1m30s",
      "x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "6400", "x-ratelimit-reset-tokens": "7.66s",
    },
  }));
  const response = await provider.review(input(), new AbortController().signal);
  assert.deepEqual(response.rateLimit, { requestLimit: 1000, requestsRemaining: 999, requestResetMs: 90_000, tokenLimit: 8000, tokensRemaining: 6400, tokenResetMs: 7_660, retryAfterMs: undefined });
});

test("Groq client safely classifies rejected models and malformed provider output", async () => {
  const rejectedModel = createGroqPlannerReviewProvider("fixture-key", async () => new Response(JSON.stringify({ error: { type: "invalid_request_error", code: "model_not_found" } }), { status: 400 }));
  await assert.rejects(() => rejectedModel.review(input(), new AbortController().signal), (error: unknown) => error instanceof PlannerShadowProviderError && error.status === 400 && error.category === "model");
  const malformed = createGroqPlannerReviewProvider("fixture-key", async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] })));
  await assert.rejects(() => malformed.review(input(), new AbortController().signal), (error: unknown) => error instanceof PlannerShadowProviderError && error.category === "malformed-response");
});

test("Groq rate limits retain only retry timing and stop the advisory call", async () => {
  const provider = createGroqPlannerReviewProvider("fixture-key", async () => new Response(JSON.stringify({ error: { type: "rate_limit_error", message: "request limited" } }), { status: 429, headers: { "retry-after": "2" } }));
  await assert.rejects(() => provider.review(input(), new AbortController().signal), (error: unknown) => error instanceof PlannerShadowProviderError && error.category === "rate-limit" && error.rateLimit?.retryAfterMs === 2_000 && !JSON.stringify(error).includes("request limited"));
});

test("Groq client reduces schema errors to a safe category without provider text", async () => {
  const provider = createGroqPlannerReviewProvider("fixture-key", async () => new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "All fields must be required by the JSON schema." } }), { status: 400 }));
  await assert.rejects(() => provider.review(input(), new AbortController().signal), (error: unknown) => error instanceof PlannerShadowProviderError && error.category === "invalid-request" && error.reason === "schema" && !JSON.stringify(error).includes("All fields"));
});

test("provider timeout remains one advisory fallback", async () => {
  let calls = 0;
  const response = await evaluatePlannerShadow(input(), {
    mode: "shadow", timeoutMs: 5,
    provider: { model: "fixture", review: async () => { calls += 1; return new Promise(() => undefined); } },
  });
  assert.deepEqual(response, { mode: "shadow", status: "timeout", review: null });
  assert.equal(calls, 1);
});

test("prompt gauntlet shadow audit stays aggregate-only and bounded", async () => {
  let calls = 0;
  const report = await runPlannerShadowAudit({
    mode: "fixture",
    provider: {
      model: "fixture",
      review: async () => {
        calls += 1;
        return { review: { suggestedBriefCorrections: [], ambiguities: [], challenges: [], liveResearchNeeds: [] }, usage: { inputTokens: 10, outputTokens: 5 } };
      },
    },
  });
  assert.equal(calls, 15);
  assert.equal(report.caseCount, 15);
  assert.equal(report.completion.completed, 15);
  assert.equal(report.tokens.total, 225);
  assert.equal(JSON.stringify(report).includes("Tokyo"), false);
  assert.equal(JSON.stringify(report).includes("rawTravellerPrompt"), false);
});

test("audit records invented geography as a sanitized unsupported-certainty safety concern", async () => {
  const report = await runPlannerShadowAudit({
    mode: "fixture", cases: PROMPT_ENGINE_CASES.slice(0, 1),
    provider: {
      model: "fixture",
      review: async () => ({
        review: {
          suggestedBriefCorrections: [{ subject: "place-ambiguity", classification: "hard", canonicalPlaceIds: ["invented-place"], rationale: "[sanitized]" }],
          ambiguities: [], candidatePreference: null, challenges: [], liveResearchNeeds: [],
        },
      }),
    },
  });
  assert.deepEqual(report.advisoryOutcomes, [{ caseNumber: 1, resultState: "completed", classification: "unsupported certainty" }]);
  assert.deepEqual(report.hardSafety, { total: 1, inventedCanonicalIds: 1, invalidCandidatePreferences: 0, hardConstraintRisks: 0 });
  assert.equal(JSON.stringify(report).includes("invented-place"), false);
});

test("an ambiguity already surfaced by the deterministic engine is redundant, not useful signal", async () => {
  const report = await runPlannerShadowAudit({
    mode: "fixture", cases: [PROMPT_ENGINE_CASES[1]!],
    provider: {
      model: "fixture",
      review: async () => ({ review: { suggestedBriefCorrections: [], ambiguities: [{ canonicalPlaceIds: [], question: "[sanitized]" }], candidatePreference: null, challenges: [], liveResearchNeeds: [] } }),
    },
  });
  assert.deepEqual(report.advisoryOutcomes, [{ caseNumber: 1, resultState: "completed", classification: "neutral/redundant" }]);
});

test("live audit pacing is sequential, conservative, and preserves a complete partial report", async () => {
  let clock = 0; const waits: number[] = []; let calls = 0;
  const report = await runPlannerShadowAudit({
    mode: "live", cases: PROMPT_ENGINE_CASES.slice(0, 2), now: () => clock,
    sleep: async (ms) => { waits.push(ms); clock += ms; },
    pacing: PLANNER_SHADOW_LIVE_PACING_DEFAULTS,
    provider: { model: "fixture", review: async () => { calls += 1; return { review: { suggestedBriefCorrections: [], ambiguities: [], candidatePreference: null, challenges: [], liveResearchNeeds: [] }, usage: { inputTokens: 2_800, outputTokens: 20 }, rateLimit: { tokenLimit: 8_000, requestsRemaining: 999 } }; } },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [60_000]);
  assert.deepEqual(report.execution, { attempted: 2, stoppedEarly: false, stopReason: null, wallClockMs: 60_000 });
  assert.equal(report.caseProgress.length, 2);
  assert.equal(report.caseProgress[1]?.waitAppliedMs, 60_000);
});

test("live pacing waits for a provider token reset before the next advisory call", async () => {
  let clock = 0; const waits: number[] = []; let calls = 0;
  const report = await runPlannerShadowAudit({
    mode: "live", cases: PROMPT_ENGINE_CASES.slice(0, 2), now: () => clock,
    sleep: async (ms) => { waits.push(ms); clock += ms; },
    pacing: { requestsPerMinute: 15, tokensPerMinute: 50_000, windowMs: 60_000 },
    provider: {
      model: "fixture",
      review: async () => {
        calls += 1;
        return {
          review: { suggestedBriefCorrections: [], ambiguities: [], candidatePreference: null, challenges: [], liveResearchNeeds: [] },
          usage: { inputTokens: 100, outputTokens: 20 },
          rateLimit: { requestLimit: 1000, requestsRemaining: 999, tokenLimit: 100_000, tokensRemaining: 100, tokenResetMs: 2_000 },
        };
      },
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2_000]);
  assert.equal(report.caseProgress[1]?.waitAppliedMs, 2_000);
  assert.deepEqual(report.rateLimits, { events: 0, latest: { requestLimit: 1000, requestsRemaining: 999, tokenLimit: 100_000, tokensRemaining: 100, tokenResetMs: 2_000 } });
});

test("live audit ends cleanly after a rate-limit response and does not present it as complete", async () => {
  let calls = 0;
  const report = await runPlannerShadowAudit({
    mode: "live", cases: PROMPT_ENGINE_CASES.slice(0, 2), pacing: PLANNER_SHADOW_LIVE_PACING_DEFAULTS,
    provider: { model: "fixture", review: async () => { calls += 1; throw new PlannerShadowProviderError({ status: 429, category: "rate-limit", rateLimit: { retryAfterMs: 2_000 } }); } },
  });
  assert.equal(calls, 1);
  assert.equal(report.execution.attempted, 1);
  assert.equal(report.execution.stoppedEarly, true);
  assert.equal(report.execution.stopReason, "provider-rate-limit");
  assert.equal(report.completion.completed, 0);
  assert.equal(report.caseProgress[0]?.resultState, "provider-failure");
  assert.equal(report.rateLimits.events, 1);
});

test("live pacing environment can only reduce the conservative default", () => {
  assert.deepEqual(plannerShadowLivePacing({ MORROVIA_PLANNER_SHADOW_RPM: "5", MORROVIA_PLANNER_SHADOW_TPM: "4000" }), { requestsPerMinute: 5, tokensPerMinute: 4000, windowMs: 60_000 });
  assert.deepEqual(plannerShadowLivePacing({ MORROVIA_PLANNER_SHADOW_RPM: "999", MORROVIA_PLANNER_SHADOW_TPM: "999999" }), PLANNER_SHADOW_LIVE_PACING_DEFAULTS);
});

test("hybrid evaluation replays sanitized fixtures and never uses a live provider", async () => {
  assertReplayFixtureCurrent();
  const report = await runHybridEvaluation();
  assert.equal(report.mode, "replay");
  assert.equal(report.calls.live, 0);
  assert.equal(report.calls.replay, 15);
  assert.equal(report.deterministic.total, 210);
  assert.equal(report.hybrid.total, 210);
  assert.equal(report.intentReview.completion.completed, 15);
});
