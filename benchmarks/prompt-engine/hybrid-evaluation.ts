import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { PlannerReviewProvider } from "../../lib/easyt/planner-shadow.ts";
import { PROMPT_ENGINE_CASES, PROMPT_ENGINE_DIMENSIONS, type PromptEngineCase, type PromptEngineDimension } from "./fixtures.ts";
import { comparablePromptEngineSnapshot, runPromptEngineHarness } from "./harness.ts";
import { runPlannerShadowAudit, type PlannerShadowAuditReport } from "./planner-shadow-audit.ts";

const fixturePath = new URL("./planner-shadow-replay.json", import.meta.url);
export const REPLAY_METADATA = { model: "openai/gpt-oss-120b", schemaVersion: "morrovia_intent_review/v1", promptVersion: "advisory-critic/v1" } as const;
export type HybridEvaluationMode = "replay" | "live" | "record";
type ReplayCase = { promptHash: string; review: unknown; trace: { turns: number; requestCount: number }; usage?: { inputTokens?: number; outputTokens?: number } };
type ReplayFixture = typeof REPLAY_METADATA & { kind: "morrovia-planner-shadow-replay-v1"; cases: Record<string, ReplayCase> };

export const HYBRID_EVALUATION_BUDGETS = { maxCases: 15, maxConcurrency: 1, maxTurnsPerCase: 1, maxRequestsPerCase: 1, maxRequestsPerRun: 15, maxRuns: 2, maxCompletionTokens: 700, maxTotalTokens: 50_000, maxCallMs: 8_000, maxSuiteMs: 120_000, estimatedInputTokenCostUsdPerMillion: 0, estimatedOutputTokenCostUsdPerMillion: 0 } as const;
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

export function loadReplayFixture(): ReplayFixture { return JSON.parse(readFileSync(fixturePath, "utf8")) as ReplayFixture; }

export function assertReplayFixtureCurrent(fixture = loadReplayFixture()) {
  if (fixture.kind !== "morrovia-planner-shadow-replay-v1") throw new Error("Planner shadow replay fixture kind is unsupported.");
  for (const key of Object.keys(REPLAY_METADATA) as Array<keyof typeof REPLAY_METADATA>) if (fixture[key] !== REPLAY_METADATA[key]) throw new Error(`Planner shadow replay fixture drift: ${key} changed. Run explicit record mode to replace it.`);
  for (const scenario of PROMPT_ENGINE_CASES) {
    const recorded = fixture.cases[scenario.id];
    if (!recorded || recorded.promptHash !== hash(scenario.rawPrompt)) throw new Error(`Planner shadow replay fixture drift: ${scenario.id} prompt changed. Run explicit record mode to replace it.`);
    if (recorded.trace.turns !== 1 || recorded.trace.requestCount !== 1) throw new Error(`Planner shadow replay fixture budget drift: ${scenario.id}.`);
  }
  if (Object.keys(fixture.cases).length !== PROMPT_ENGINE_CASES.length) throw new Error("Planner shadow replay fixture case set drifted.");
  return fixture;
}

function replayProvider(fixture: ReplayFixture): PlannerReviewProvider {
  const byHash = new Map(Object.values(fixture.cases).map((item) => [item.promptHash, item]));
  return { model: fixture.model, async review(input) {
    const recorded = byHash.get(hash(input.rawTravellerPrompt));
    if (!recorded) throw new Error("Planner shadow replay fixture has no matching sanitized case.");
    return { review: recorded.review, usage: recorded.usage };
  } };
}

export type HybridEvaluationReport = { mode: HybridEvaluationMode; hardFailures: string[]; deterministic: ReturnType<typeof comparablePromptEngineSnapshot>; intentReview: PlannerShadowAuditReport; hybrid: { total: number; maxTotal: number; dimensionDeltas: Record<PromptEngineDimension, number>; hardFailures: string[] }; calls: { live: number; replay: number }; estimatedCostUsd: number | null };

function sanitizeRecordedReview(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rows = (key: string) => Array.isArray(raw[key]) ? raw[key] : [];
  return {
    suggestedBriefCorrections: rows("suggestedBriefCorrections").flatMap((item) => item && typeof item === "object" ? [{ ...(item as Record<string, unknown>), rationale: "[sanitized]" }] : []),
    ambiguities: rows("ambiguities").flatMap((item) => item && typeof item === "object" ? [{ ...(item as Record<string, unknown>), question: "[sanitized]" }] : []),
    ...(raw.candidatePreference && typeof raw.candidatePreference === "object" ? { candidatePreference: { ...(raw.candidatePreference as Record<string, unknown>), rationale: "[sanitized]" } } : {}),
    challenges: rows("challenges").flatMap((item) => item && typeof item === "object" ? [{ ...(item as Record<string, unknown>), rationale: "[sanitized]" }] : []),
    liveResearchNeeds: rows("liveResearchNeeds").filter((item) => typeof item === "string"),
  };
}

/** The hybrid result is evaluation-only: it never applies a review to a TripDocument. */
export async function runHybridEvaluation(options: { mode?: HybridEvaluationMode; provider?: PlannerReviewProvider; recordApproval?: boolean; cases?: PromptEngineCase[] } = {}): Promise<HybridEvaluationReport> {
  const mode = options.mode ?? "replay";
  if (mode === "record" && !options.recordApproval) throw new Error("Record mode requires explicit approval.");
  if ((mode === "live" || mode === "record") && !options.provider) throw new Error(`${mode} mode requires an explicitly supplied provider.`);
  const baseline = comparablePromptEngineSnapshot(runPromptEngineHarness());
  const fixture = mode === "live" ? undefined : assertReplayFixtureCurrent();
  const recorded = new Map<string, ReplayCase>();
  const provider = mode === "record" ? {
    model: options.provider!.model,
    async review(input: Parameters<PlannerReviewProvider["review"]>[0], signal: AbortSignal) {
      const response = await options.provider!.review(input, signal);
      recorded.set(hash(input.rawTravellerPrompt), { promptHash: hash(input.rawTravellerPrompt), review: sanitizeRecordedReview(response.review), trace: { turns: 1, requestCount: 1 }, usage: response.usage });
      return response;
    },
  } satisfies PlannerReviewProvider : options.provider ?? replayProvider(fixture!);
  const cases = options.cases ?? PROMPT_ENGINE_CASES;
  const intentReview = await runPlannerShadowAudit({ provider, mode: mode === "live" ? "live" : "fixture", cases });
  const deltas = Object.fromEntries(PROMPT_ENGINE_DIMENSIONS.map((dimension) => [dimension, 0])) as Record<PromptEngineDimension, number>;
  const hardFailures = [
    ...(intentReview.completion.fallback ? [`intent-review fallback ${intentReview.completion.fallback}/${intentReview.caseCount}`] : []),
    ...(intentReview.execution.stoppedEarly ? [`intent-review stopped early: ${intentReview.execution.stopReason}`] : []),
    ...(intentReview.ambiguity.missed ? [`intent-review missed ${intentReview.ambiguity.missed} required ambiguity signals`] : []),
  ];
  const hybrid = { total: baseline.total, maxTotal: baseline.maxTotal, dimensionDeltas: deltas, hardFailures };
  const totalTokens = intentReview.tokens.total;
  const cost = intentReview.tokens.missingUsageCalls ? null : (intentReview.tokens.input * HYBRID_EVALUATION_BUDGETS.estimatedInputTokenCostUsdPerMillion + intentReview.tokens.output * HYBRID_EVALUATION_BUDGETS.estimatedOutputTokenCostUsdPerMillion) / 1_000_000;
  if (mode === "record") {
    if (recorded.size !== PROMPT_ENGINE_CASES.length || intentReview.completion.fallback) throw new Error("Record mode will not replace fixtures after an incomplete or fallback run.");
    const replacement: ReplayFixture = { kind: "morrovia-planner-shadow-replay-v1", ...REPLAY_METADATA, cases: Object.fromEntries(PROMPT_ENGINE_CASES.map((scenario) => [scenario.id, recorded.get(hash(scenario.rawPrompt))!])) };
    writeFileSync(fixturePath, `${JSON.stringify(replacement, null, 2)}\n`);
  }
  return { mode, hardFailures, deterministic: baseline, intentReview, hybrid, calls: { live: mode === "live" ? intentReview.execution.attempted : 0, replay: mode === "live" ? 0 : intentReview.execution.attempted }, estimatedCostUsd: totalTokens || !intentReview.tokens.missingUsageCalls ? cost : null };
}
