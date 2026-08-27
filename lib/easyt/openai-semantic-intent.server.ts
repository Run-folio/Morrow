import {
  SemanticIntentProviderError,
  SEMANTIC_INTENT_MODELS,
  runSemanticIntentShadow,
  semanticIntentMode,
  type SemanticIntentMode,
  type SemanticIntentProvider,
  type SemanticIntentShadowLog,
} from "./semantic-trip-intent.ts";
import type { JourneyCaptureResult } from "./journey-capture.ts";
import type OpenAI from "openai";
import {
  buildOpenAISemanticIntentRequest,
  parseOpenAISemanticIntentResponse,
} from "./openai-semantic-intent-request.ts";

type ServerEnvironment = {
  NODE_ENV?: string;
  MORROVIA_SEMANTIC_INTENT_MODE?: string;
  OPENAI_API_KEY?: string;
};

export type SemanticIntentServerConfig = {
  mode: SemanticIntentMode;
  primary: typeof SEMANTIC_INTENT_MODELS.primary;
  escalation: typeof SEMANTIC_INTENT_MODELS.escalation;
  hasApiKey: boolean;
};

/** One server-only configuration boundary. Default mode is always off. */
export function semanticIntentServerConfig(environment: ServerEnvironment = process.env): SemanticIntentServerConfig {
  const hasApiKey = Boolean(environment.OPENAI_API_KEY?.trim());
  const configuredMode = semanticIntentMode(environment);
  return {
    mode: configuredMode === "shadow" || configuredMode === "active"
      ? configuredMode
      : hasApiKey && environment.MORROVIA_SEMANTIC_INTENT_MODE !== "off" ? "active" : "off",
    primary: SEMANTIC_INTENT_MODELS.primary,
    escalation: SEMANTIC_INTENT_MODELS.escalation,
    hasApiKey,
  };
}

function providerCategory(status: number) {
  if (status === 401 || status === 403) return "auth" as const;
  if (status === 429) return "rate-limit" as const;
  if (status >= 400 && status < 500) return "invalid-request" as const;
  return "provider" as const;
}

/** Provider-neutral extractor implementation shared by Luna and future Terra escalation. */
export function createOpenAISemanticIntentProvider(options: {
  tier?: keyof typeof SEMANTIC_INTENT_MODELS;
  client?: Pick<OpenAI, "responses">;
}): SemanticIntentProvider {
  if (typeof window !== "undefined") throw new Error("Semantic intent providers are server-only.");
  const config = SEMANTIC_INTENT_MODELS[options.tier ?? "primary"];
  return {
    model: config.model,
    async extract(rawPrompt, signal) {
      const client = options.client ?? (await import("./openai.server.ts")).getOpenAIClient();
      let payload: unknown;
      try {
        payload = await client.responses.create(buildOpenAISemanticIntentRequest(rawPrompt, config.model), { signal });
      } catch (error) {
        const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : 500;
        throw new SemanticIntentProviderError({ status, category: providerCategory(status) });
      }
      const parsed = parseOpenAISemanticIntentResponse(payload);
      if (!parsed) throw new SemanticIntentProviderError({ category: "malformed-response" });
      return parsed;
    },
  };
}

export function configuredOpenAISemanticIntentProvider(environment: ServerEnvironment = process.env) {
  const config = semanticIntentServerConfig(environment);
  return config.mode !== "off" && environment.OPENAI_API_KEY
    ? createOpenAISemanticIntentProvider({ tier: "primary" })
    : undefined;
}

/** Server-only runtime hook. Its return value is observational and never reconciled into capture. */
export function runConfiguredOpenAISemanticIntentShadow(options: {
  rawPrompt: string;
  deterministic: JourneyCaptureResult;
  environment?: ServerEnvironment;
  timeoutMs?: number;
  log?: (event: SemanticIntentShadowLog) => void;
}) {
  const environment = options.environment ?? process.env;
  const config = semanticIntentServerConfig(environment);
  return runSemanticIntentShadow({
    rawPrompt: options.rawPrompt,
    deterministic: options.deterministic,
    mode: config.mode,
    provider: configuredOpenAISemanticIntentProvider(environment),
    timeoutMs: options.timeoutMs,
    log: options.log,
  });
}

/** Active extraction uses the same bounded contract; callers decide whether a
 * validated candidate is safe to project into deterministic resolution. */
export function runConfiguredOpenAISemanticIntentExtraction(options: {
  rawPrompt: string;
  environment?: ServerEnvironment;
  timeoutMs?: number;
  log?: (event: SemanticIntentShadowLog) => void;
}) {
  const environment = options.environment ?? process.env;
  const config = semanticIntentServerConfig(environment);
  return import("./semantic-trip-intent.ts").then(({ evaluateSemanticIntentShadow }) => evaluateSemanticIntentShadow(options.rawPrompt, {
    mode: config.mode === "active" ? "active" : config.mode,
    provider: configuredOpenAISemanticIntentProvider(environment),
    timeoutMs: options.timeoutMs,
    log: options.log,
  }));
}
