import {
  SEMANTIC_INTENT_MODELS,
  SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
  type SemanticIntentProvider,
  type SemanticIntentUsage,
} from "./semantic-trip-intent.ts";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export const SEMANTIC_INTENT_EXTRACTION_POLICY = `You extract semantic traveller intent from exactly one raw trip prompt.

Return only the supplied strict schema. Preserve source wording in every sourceText field, including spelling mistakes. interpretedText should give a cautious human-readable interpretation when the traveller uses a misspelling, common geographic shorthand, or omits a conventional article (for example a shortened city name). It is never verified or canonical geography, and must remain null when the intended place is genuinely unclear.

For origin, destinationCandidates and pointsOfInterest, sourceText is only the geographic name span copied from the prompt: use "London" from "Start in London", not "Start in London". Transport and constraint sourceText may include the surrounding phrase that carries their meaning.

Boundaries:
- Do not create canonical IDs, trip IDs, coordinates, normalized place records, verified places, prices, schedules, availability, calendar dates, years, or transport facts.
- Date text may appear only when explicitly present in the raw prompt and must be copied exactly.
- Origin is separate from route destinations.
- transport.departure.sourceText and transport.departure.mode must either both be null or both describe an explicit departure transport phrase such as "flying from London". "Start in London" is origin only, so both departure fields are null.
- A departure mode such as "flying from London" is not an inter-stop mode unless the traveller separately says it is. transport.interStop.sourceText is null exactly when transport.interStop.modes is empty.
- Each geographic source phrase must appear in exactly one of destinationCandidates or pointsOfInterest, never both.
- A landmark or attraction listed as one of the places the traveller intends to travel to is a destinationCandidate, even though deterministic place resolution may later preserve it as a non-overnight anchor. Use pointsOfInterest only when the traveller expresses the attraction as attached to a separately named destination.
- Country, region, island, lake, natural area and landmark mentions are valid destination intentions. Do not replace them with a capital or nearby city.
- Words describing travel style or transport, including "overland", "by train", "road trip" and "public transport", are transport meaning and never geography.
- "overland" is inter-stop ground transport: copy the explicit overland phrase into transport.interStop.sourceText and include "ground" in transport.interStop.modes.
- Food, wine, beaches, nightlife, relaxed pace, museums, cheap/value language, nature, romantic, architecture, and "don't rush" are preferences or constraints, never destinations by themselves.
- Unknown and ambiguous meaning must remain unknown or ambiguous. Never fill gaps.
- This output is a bounded candidate interpretation. It must not prescribe geography or mutate a trip.`;

export function buildOpenAISemanticIntentRequest(
  rawPrompt: string,
  model: string = SEMANTIC_INTENT_MODELS.primary.model,
) {
  return {
    model,
    reasoning: { effort: "low" as const },
    input: [
      { role: "system", content: SEMANTIC_INTENT_EXTRACTION_POLICY },
      { role: "user", content: rawPrompt },
    ] as Array<{ role: "system" | "user"; content: string }>,
    text: {
      format: {
        type: "json_schema" as const,
        name: "morrovia_semantic_trip_intent",
        strict: true,
        schema: SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
      },
    },
    max_output_tokens: 1_800,
    store: false,
  };
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
