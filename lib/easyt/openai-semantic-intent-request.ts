import {
  SEMANTIC_INTENT_MODELS,
  SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
  type SemanticIntentProvider,
  type SemanticIntentUsage,
} from "./semantic-trip-intent.ts";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export const SEMANTIC_INTENT_EXTRACTION_POLICY = `You extract semantic traveller intent from exactly one raw trip prompt.

Return only the supplied strict schema. Preserve source wording in every sourceText field, including spelling mistakes. interpretedText may give a cautious human-readable interpretation of a misspelling, but it is never verified or canonical geography.

Boundaries:
- Do not create canonical IDs, trip IDs, coordinates, normalized place records, verified places, prices, schedules, availability, calendar dates, years, or transport facts.
- Date text may appear only when explicitly present in the raw prompt and must be copied exactly.
- Origin is separate from route destinations.
- A departure mode such as "flying from London" is not an inter-stop mode unless the traveller separately says it is.
- Landmarks and attractions are points of interest, not overnight route stops. Link a POI only to a destination candidate already copied from the prompt.
- Food, wine, beaches, nightlife, relaxed pace, museums, cheap/value language, nature, romantic, architecture, and "don't rush" are preferences or constraints, never destinations by themselves.
- Unknown and ambiguous meaning must remain unknown or ambiguous. Never fill gaps.
- This output is advisory shadow data. It must not prescribe or mutate a trip.`;

export function buildOpenAISemanticIntentRequest(
  rawPrompt: string,
  model: string = SEMANTIC_INTENT_MODELS.primary.model,
) {
  return {
    model,
    reasoning: { effort: "medium" },
    input: [
      { role: "system", content: SEMANTIC_INTENT_EXTRACTION_POLICY },
      { role: "user", content: rawPrompt },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "morrovia_semantic_trip_intent",
        strict: true,
        schema: SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
      },
    },
    max_output_tokens: 1_800,
    store: false,
  } as const;
}

type ResponsesPayload = {
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    content?: Array<{ type?: unknown; text?: unknown; refusal?: unknown }>;
  }>;
  usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown };
};

const tokenCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Extracts only structured output and aggregate usage; refusal/provider prose is not retained. */
export function parseOpenAISemanticIntentResponse(payload: unknown): { value: unknown; usage?: SemanticIntentUsage } | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as ResponsesPayload;
  const outputText = typeof response.output_text === "string"
    ? response.output_text
    : response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text" && typeof item.text === "string")?.text;
  if (typeof outputText !== "string" || !outputText) return null;
  let value: unknown;
  try { value = JSON.parse(outputText); }
  catch { return null; }
  const usage = {
    inputTokens: tokenCount(response.usage?.input_tokens),
    outputTokens: tokenCount(response.usage?.output_tokens),
    totalTokens: tokenCount(response.usage?.total_tokens),
  };
  return { value, ...(Object.values(usage).some((item) => item !== undefined) ? { usage } : {}) };
}

export type OpenAISemanticIntentProvider = SemanticIntentProvider;
