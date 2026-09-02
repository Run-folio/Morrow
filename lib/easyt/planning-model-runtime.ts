import {
  estimateSemanticIntentCost,
  SemanticIntentProviderError,
  type SemanticIntentCostEstimate,
  type SemanticIntentStatus,
  type SemanticIntentUsage,
} from "./semantic-trip-intent.ts";
import { validatePlanningModelOutput, type PlanningModelOutput } from "./planning-model-output.ts";

export type PlanningModelProvider = {
  model: string;
  plan(rawPrompt: string, signal: AbortSignal): Promise<{ value: unknown; usage?: SemanticIntentUsage }>;
};

export type PlanningModelResult = {
  status: SemanticIntentStatus | "empty-result";
  output: PlanningModelOutput | null;
  latencyMs: number;
  usage?: SemanticIntentUsage;
  cost?: SemanticIntentCostEstimate;
  validationIssues?: string[];
};

class PlanningTimeoutError extends Error { constructor() { super("Planning model timed out."); this.name = "TimeoutError"; } }

export async function evaluatePlanningModel(input: {
  rawPrompt: string;
  provider?: PlanningModelProvider;
  timeoutMs?: number;
  requireSuggestions?: boolean;
}): Promise<PlanningModelResult> {
  if (!input.provider) return { status: "unavailable", output: null, latencyMs: 0 };
  const startedAt = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      input.provider.plan(input.rawPrompt, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new PlanningTimeoutError()); }, input.timeoutMs ?? 12_000);
      }),
    ]);
    const cost = estimateSemanticIntentCost(input.provider.model, response.usage);
    const validation = validatePlanningModelOutput(response.value, input.rawPrompt);
    if (!validation.valid) return {
      status: "invalid-response",
      output: null,
      latencyMs: Date.now() - startedAt,
      usage: response.usage,
      cost,
      validationIssues: validation.issues,
    };
    const needsSuggestions = input.requireSuggestions
      || validation.output.intent.destinationCandidates.some((item) => item.role === "planning-area")
      || validation.output.intent.pointsOfInterest.length > 0;
    if (needsSuggestions && validation.output.suggestions.length === 0) return {
      status: "empty-result",
      output: null,
      latencyMs: Date.now() - startedAt,
      usage: response.usage,
      cost,
    };
    return { status: "completed", output: validation.output, latencyMs: Date.now() - startedAt, usage: response.usage, cost };
  } catch (error) {
    const status = error instanceof PlanningTimeoutError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
      ? "timeout"
      : error instanceof SemanticIntentProviderError ? "provider-failure" : "failed";
    return { status, output: null, latencyMs: Date.now() - startedAt };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
