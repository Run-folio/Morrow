import { createGroqPlannerReviewProvider } from "./groq-planner-review.ts";
import { evaluatePlannerShadow, plannerShadowMode, type PlannerReviewProvider, type PlannerShadowInput } from "./planner-shadow.ts";

export function validPlannerShadowInput(value: unknown): value is PlannerShadowInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<PlannerShadowInput>;
  return typeof input.rawTravellerPrompt === "string" && Boolean(input.structuredBrief && typeof input.structuredBrief === "object")
    && typeof input.selectedRouteDirection === "string" && Array.isArray(input.routeCandidates)
    && Boolean(input.engineFacts && typeof input.engineFacts === "object");
}

/** Pure request boundary shared by the Next route and fixture tests. */
export async function executePlannerShadowRequest(
  value: unknown,
  options: { environment?: { NODE_ENV?: string; MORROVIA_PLANNER_SHADOW_MODE?: string; GROQ_API_KEY?: string }; provider?: PlannerReviewProvider; log?: (event: { model: string; mode: "off" | "shadow"; latencyMs: number; usage?: { inputTokens?: number; outputTokens?: number }; status: "disabled" | "completed" | "unavailable" | "failed" | "provider-failure" | "timeout" | "invalid-response" }) => void } = {},
) {
  if (!validPlannerShadowInput(value)) return null;
  const environment = options.environment ?? process.env;
  const mode = plannerShadowMode(environment);
  const provider = options.provider ?? (mode === "shadow" && environment.GROQ_API_KEY ? createGroqPlannerReviewProvider(environment.GROQ_API_KEY) : undefined);
  return evaluatePlannerShadow(value, { mode, provider, log: options.log });
}
