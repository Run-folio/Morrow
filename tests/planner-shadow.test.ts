import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { createGroqPlannerReviewProvider } from "../lib/easyt/groq-planner-review.ts";
import { executePlannerShadowRequest } from "../lib/easyt/planner-shadow-api.ts";
import { evaluatePlannerShadow, normalizeIntentReview, plannerShadowMode, type PlannerShadowInput } from "../lib/easyt/planner-shadow.ts";

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

test("Groq client makes one bounded, schema-constrained fixture request", async () => {
  let calls = 0; let requestBody: Record<string, unknown> | undefined;
  const provider = createGroqPlannerReviewProvider("fixture-key", async (_url, init) => {
    calls += 1; requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestedBriefCorrections: [], ambiguities: [], challenges: [], liveResearchNeeds: [] }) } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }));
  });
  const response = await provider.review(input(), new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(requestBody?.model, "openai/gpt-oss-120b");
  assert.equal(requestBody?.max_completion_tokens, 700);
  assert.equal((requestBody?.response_format as { type?: string }).type, "json_schema");
  assert.deepEqual(response.usage, { inputTokens: 12, outputTokens: 8 });
});
