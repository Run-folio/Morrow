import {
  SEMANTIC_INTENT_MODELS,
  SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
  type SemanticIntentProvider,
  type SemanticIntentUsage,
} from "./semantic-trip-intent.ts";
import { PLANNING_MODEL_OUTPUT_JSON_SCHEMA } from "./planning-model-output.ts";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export const SEMANTIC_INTENT_EXTRACTION_POLICY = `You extract semantic traveller intent from exactly one raw trip prompt.

Return only the supplied strict schema. Preserve source wording in every sourceText field, including spelling mistakes. interpretedText should give a cautious human-readable interpretation when the traveller uses a misspelling, common geographic shorthand, or omits a conventional article (for example a shortened city name). It is never verified or canonical geography, and must remain null when the intended place is genuinely unclear.

For origin, explicit-place journeyEnd, destinationCandidates and pointsOfInterest, sourceText is only the geographic name span copied from the prompt: use "London" from "Start in London", not "Start in London". A same-as-start journeyEnd may use the exact relational words, such as "home" or "back to London". Transport and constraint sourceText may include the surrounding phrase that carries their meaning.

Boundaries:
- Do not create canonical IDs, trip IDs, coordinates, normalized place records, verified places, prices, schedules, availability, calendar dates, years, or transport facts.
- Date text may appear only when explicitly present in the raw prompt and must be copied exactly.
- Origin is separate from route destinations.
- journeyEnd is separate from route destinations. Use explicit_place for a named final endpoint, same_as_start only for clear return/back/home intent, and unknown when the traveller has not supplied a final endpoint. Never infer same_as_start merely because an origin exists.
- "Fly into Tokyo and out of Osaka" means Tokyo is a route destination and Osaka is an explicit-place journeyEnd. "Flying home from Bangkok" means Bangkok is an explicit-place journeyEnd. "Then home" is same_as_start only when an origin is present; otherwise keep journeyEnd unknown and retain the phrase as unresolvedMeaningfulText.
- Endpoint words such as home, return, back, finish and out are meaning, never geographic destination candidates.
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

export const PLANNING_INTELLIGENCE_POLICY = `${SEMANTIC_INTENT_EXTRACTION_POLICY}

For this higher-reasoning planning task, also return a small advisory suggestion set and a coherence assessment.

Planning rules:
- Treat continents, countries and large regions as planning containers, never overnight stops.
- Preserve landmarks and natural areas as visit intent. Suggest possible stayable bases or gateways separately.
- Preserve every explicit requested place. Never silently replace or remove it.
- Suggestions are optional candidates, never confirmed choices. The traveller still completes broad-destination shaping.
- Suggest 3–6 places only when the prompt is broad, experience-first or asks for recommendations. Return no suggestions for a complete, explicit route unless a clear semantic repair is needed.
- Keep suggestions geographically bounded for the stated duration. Do not manufacture a large country-wide or continent-wide itinerary.
- Use stated interests and constraints, but do not infer sensitive or unstated preferences.
- parentSourceText must be an exact geographic or experiential source span from the prompt that the suggestion helps interpret.
- A suggestion contains only a place name, country, advisory role, short internal rationale and confidence. Never return coordinates, provider IDs, airport facts, travel times, distances, transport modes, schedules or prices.
- If an explicit route is implausibly ambitious for the stated duration, preserve all places and set assessment.coherence to needs-review with a concise internal warning. Do not claim the route is sensible.
- Do not write marketing prose.`;

export function buildOpenAISemanticIntentRequest(
  rawPrompt: string,
  model: string = SEMANTIC_INTENT_MODELS.primary.model,
  reasoningEffort: "low" | "medium" = "low",
) {
  return {
    model,
    reasoning: { effort: reasoningEffort },
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

export function buildOpenAIPlanningIntentRequest(
  rawPrompt: string,
  model: string = SEMANTIC_INTENT_MODELS.escalation.model,
  reasoningEffort: "low" | "medium" = "medium",
) {
  return {
    model,
    reasoning: { effort: reasoningEffort },
    input: [
      { role: "system", content: PLANNING_INTELLIGENCE_POLICY },
      { role: "user", content: rawPrompt },
    ] as Array<{ role: "system" | "user"; content: string }>,
    text: {
      format: {
        type: "json_schema" as const,
        name: "morrovia_planning_intelligence",
        strict: true,
        schema: PLANNING_MODEL_OUTPUT_JSON_SCHEMA,
      },
    },
    max_output_tokens: 2_800,
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
