import {
  SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
  validateSemanticTripIntent,
  type SemanticTripIntent,
} from "./semantic-trip-intent.ts";

export const PLANNING_MODEL_OUTPUT_VERSION = "morrovia-planning-model/v1" as const;

export type PlanningSuggestionCandidate = {
  parentSourceText: string;
  name: string;
  country: string;
  role: "overnight-base-candidate" | "gateway-candidate" | "complementary-candidate";
  rationale: string;
  confidence: "high" | "medium" | "low";
};

export type PlanningModelOutput = {
  version: typeof PLANNING_MODEL_OUTPUT_VERSION;
  intent: SemanticTripIntent;
  suggestions: PlanningSuggestionCandidate[];
  assessment: {
    coherence: "coherent" | "needs-review" | "unknown";
    warning: string | null;
  };
};

const strictObject = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export const PLANNING_MODEL_OUTPUT_JSON_SCHEMA = strictObject({
  version: { type: "string", enum: [PLANNING_MODEL_OUTPUT_VERSION] },
  intent: SEMANTIC_TRIP_INTENT_JSON_SCHEMA,
  suggestions: {
    type: "array",
    maxItems: 6,
    items: strictObject({
      parentSourceText: { type: "string" },
      name: { type: "string" },
      country: { type: "string" },
      role: { type: "string", enum: ["overnight-base-candidate", "gateway-candidate", "complementary-candidate"] },
      rationale: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    }),
  },
  assessment: strictObject({
    coherence: { type: "string", enum: ["coherent", "needs-review", "unknown"] },
    warning: { type: ["string", "null"] },
  }),
});

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const text = (value: unknown, maximum: number) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;

/** Planning output remains untrusted despite strict generation. Suggestions
 * are advisory names only; canonical identity is resolved in a later boundary. */
export function validatePlanningModelOutput(value: unknown, rawPrompt: string): {
  valid: true;
  output: PlanningModelOutput;
  issues: [];
} | {
  valid: false;
  output: null;
  issues: string[];
} {
  const issues: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, output: null, issues: ["not-object"] };
  const row = value as Record<string, unknown>;
  const expected = ["version", "intent", "suggestions", "assessment"];
  if (Object.keys(row).some((key) => !expected.includes(key))) issues.push("unexpected-field");
  if (row.version !== PLANNING_MODEL_OUTPUT_VERSION) issues.push("invalid-version");
  const intent = validateSemanticTripIntent(row.intent, rawPrompt);
  if (!intent.valid) issues.push(...intent.issues.map((issue) => `intent:${issue.code}:${issue.path}`));
  const suggestions = Array.isArray(row.suggestions) ? row.suggestions : [];
  if (!Array.isArray(row.suggestions) || suggestions.length > 6) issues.push("invalid-suggestions");
  const promptKey = normalize(rawPrompt);
  const parsedSuggestions: PlanningSuggestionCandidate[] = [];
  const roles = new Set(["overnight-base-candidate", "gateway-candidate", "complementary-candidate"]);
  const confidence = new Set(["high", "medium", "low"]);
  suggestions.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) { issues.push(`suggestions[${index}]:not-object`); return; }
    const suggestion = item as Record<string, unknown>;
    const parent = typeof suggestion.parentSourceText === "string" ? suggestion.parentSourceText : "";
    if (!text(parent, 160) || !promptKey.includes(normalize(parent))) issues.push(`suggestions[${index}]:invalid-parent-source`);
    if (!text(suggestion.name, 120) || !text(suggestion.country, 120) || !text(suggestion.rationale, 220)) issues.push(`suggestions[${index}]:invalid-text`);
    if (!roles.has(String(suggestion.role)) || !confidence.has(String(suggestion.confidence))) issues.push(`suggestions[${index}]:invalid-enum`);
    if (Object.keys(suggestion).some((key) => !["parentSourceText", "name", "country", "role", "rationale", "confidence"].includes(key)
      || /(coordinate|canonical|provider|distance|duration|transport|airport)/i.test(key))) issues.push(`suggestions[${index}]:forbidden-field`);
    if (!issues.some((issue) => issue.startsWith(`suggestions[${index}]`))) parsedSuggestions.push(suggestion as PlanningSuggestionCandidate);
  });
  const assessment = row.assessment && typeof row.assessment === "object" && !Array.isArray(row.assessment)
    ? row.assessment as Record<string, unknown> : null;
  if (!assessment || !["coherent", "needs-review", "unknown"].includes(String(assessment.coherence))
    || !(assessment.warning === null || text(assessment.warning, 240))) issues.push("invalid-assessment");
  if (issues.length || !intent.valid || !assessment) return { valid: false, output: null, issues };
  return {
    valid: true,
    output: {
      version: PLANNING_MODEL_OUTPUT_VERSION,
      intent: intent.intent,
      suggestions: parsedSuggestions,
      assessment: assessment as PlanningModelOutput["assessment"],
    },
    issues: [],
  };
}
