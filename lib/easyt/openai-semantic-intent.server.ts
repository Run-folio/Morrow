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
import {
  buildOpenAISemanticIntentRequest,
  OPENAI_RESPONSES_ENDPOINT,
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
  return {
    mode: semanticIntentMode(environment),
    primary: SEMANTIC_INTENT_MODELS.primary,
    escalation: SEMANTIC_INTENT_MODELS.escalation,
    hasApiKey: Boolean(environment.OPENAI_API_KEY),
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
  apiKey: string;
  tier?: keyof typeof SEMANTIC_INTENT_MODELS;
  fetchImpl?: typeof fetch;
}): SemanticIntentProvider {
  if (typeof window !== "undefined") throw new Error("Semantic intent providers are server-only.");
  const config = SEMANTIC_INTENT_MODELS[options.tier ?? "primary"];
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    model: config.model,
    async extract(rawPrompt, signal) {
      const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(buildOpenAISemanticIntentRequest(rawPrompt, config.model)),
        signal,
      });
      if (!response.ok) throw new SemanticIntentProviderError({ status: response.status, category: providerCategory(response.status) });
      const payload = await response.json().catch(() => null);
      const parsed = parseOpenAISemanticIntentResponse(payload);
      if (!parsed) throw new SemanticIntentProviderError({ category: "malformed-response" });
      return parsed;
    },
  };
}

export function configuredOpenAISemanticIntentProvider(environment: ServerEnvironment = process.env) {
  const config = semanticIntentServerConfig(environment);
  return config.mode === "shadow" && environment.OPENAI_API_KEY
    ? createOpenAISemanticIntentProvider({ apiKey: environment.OPENAI_API_KEY, tier: "primary" })
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
