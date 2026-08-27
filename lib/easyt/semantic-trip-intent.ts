import type { JourneyCaptureResult } from "./journey-capture.ts";

export const SEMANTIC_TRIP_INTENT_SCHEMA_VERSION = "semantic-trip-intent/v1" as const;
export const SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION = "raw-trip-prompt/v1" as const;
export const SEMANTIC_INTENT_MODELS = {
  primary: { model: "gpt-5.6-luna", reasoningEffort: "low" },
  escalation: { model: "gpt-5.6-terra", reasoningEffort: "medium" },
} as const;
export const SEMANTIC_INTENT_PRICING_USD_PER_MILLION = {
  "gpt-5.6-luna": { input: 0.20, output: 1.20 },
  "gpt-5.6-terra": { input: 2.00, output: 12.00 },
} as const;

export type SemanticIntentMode = "off" | "shadow" | "active";
export type SemanticIntentCertainty = "explicit" | "likely" | "ambiguous";
export type SemanticTransportMode = "flight" | "train" | "drive" | "bus" | "ferry" | "ground";

export type SemanticTripIntent = {
  schemaVersion: typeof SEMANTIC_TRIP_INTENT_SCHEMA_VERSION;
  rawPromptVersion: typeof SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION;
  origin: { sourceText: string | null; certainty: SemanticIntentCertainty | null };
  duration: { sourceText: string | null; value: number | null; unit: "days" | "nights" | "weeks" | null };
  explicitDateTexts: string[];
  destinationCandidates: Array<{
    sourceText: string;
    interpretedText: string | null;
    role: "route-stop" | "planning-area" | "unknown";
    certainty: SemanticIntentCertainty;
  }>;
  pointsOfInterest: Array<{
    sourceText: string;
    interpretedText: string | null;
    likelyDestinationSourceText: string | null;
    certainty: SemanticIntentCertainty;
  }>;
  transport: {
    departure: { sourceText: string | null; mode: SemanticTransportMode | null };
    interStop: { sourceText: string | null; modes: SemanticTransportMode[] };
    avoid: Array<{ sourceText: string; mode: SemanticTransportMode }>;
  };
  pace: { sourceText: string | null; value: "relaxed" | "balanced" | "packed" | null };
  interests: Array<{
    sourceText: string;
    value: "food" | "coast" | "nightlife" | "culture" | "nature" | "adventure" | "shopping" | "wellness" | "other";
  }>;
  constraints: Array<{
    sourceText: string;
    kind: "no-driving" | "no-flying" | "must-visit" | "maximum-stops" | "maximum-transfer" | "fixed-commitment" | "budget" | "accessibility" | "other";
    strength: "hard" | "soft";
  }>;
  ambiguities: Array<{
    sourceText: string;
    kind: "origin" | "duration" | "date" | "destination" | "poi" | "transport" | "constraint" | "other";
  }>;
  unresolvedMeaningfulText: string[];
};

const certaintyValues = ["explicit", "likely", "ambiguous"] as const;
const transportModes = ["flight", "train", "drive", "bus", "ferry", "ground"] as const;

const strictObject = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

const nullableString = { type: ["string", "null"] } as const;
const certainty = { type: ["string", "null"], enum: [...certaintyValues, null] } as const;
const sourceString = { type: "string" } as const;
const mode = { type: ["string", "null"], enum: [...transportModes, null] } as const;

/** Strict Responses API schema. It deliberately has no canonical IDs or verified facts. */
export const SEMANTIC_TRIP_INTENT_JSON_SCHEMA = strictObject({
  schemaVersion: { type: "string", enum: [SEMANTIC_TRIP_INTENT_SCHEMA_VERSION] },
  rawPromptVersion: { type: "string", enum: [SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION] },
  origin: strictObject({ sourceText: nullableString, certainty }),
  duration: strictObject({
    sourceText: nullableString,
    value: { type: ["number", "null"] },
    unit: { type: ["string", "null"], enum: ["days", "nights", "weeks", null] },
  }),
  explicitDateTexts: { type: "array", items: sourceString },
  destinationCandidates: {
    type: "array", items: strictObject({
      sourceText: sourceString,
      interpretedText: nullableString,
      role: { type: "string", enum: ["route-stop", "planning-area", "unknown"] },
      certainty: { type: "string", enum: certaintyValues },
    }),
  },
  pointsOfInterest: {
    type: "array", items: strictObject({
      sourceText: sourceString,
      interpretedText: nullableString,
      likelyDestinationSourceText: nullableString,
      certainty: { type: "string", enum: certaintyValues },
    }),
  },
  transport: strictObject({
    departure: strictObject({ sourceText: nullableString, mode }),
    interStop: strictObject({
      sourceText: nullableString,
      modes: { type: "array", items: { type: "string", enum: transportModes } },
    }),
    avoid: {
      type: "array", items: strictObject({
        sourceText: sourceString,
        mode: { type: "string", enum: transportModes },
      }),
    },
  }),
  pace: strictObject({
    sourceText: nullableString,
    value: { type: ["string", "null"], enum: ["relaxed", "balanced", "packed", null] },
  }),
  interests: {
    type: "array", items: strictObject({
      sourceText: sourceString,
      value: { type: "string", enum: ["food", "coast", "nightlife", "culture", "nature", "adventure", "shopping", "wellness", "other"] },
    }),
  },
  constraints: {
    type: "array", items: strictObject({
      sourceText: sourceString,
      kind: { type: "string", enum: ["no-driving", "no-flying", "must-visit", "maximum-stops", "maximum-transfer", "fixed-commitment", "budget", "accessibility", "other"] },
      strength: { type: "string", enum: ["hard", "soft"] },
    }),
  },
  ambiguities: {
    type: "array", items: strictObject({
      sourceText: sourceString,
      kind: { type: "string", enum: ["origin", "duration", "date", "destination", "poi", "transport", "constraint", "other"] },
    }),
  },
  unresolvedMeaningfulText: { type: "array", items: sourceString },
});

export type SemanticIntentValidationIssueCode =
  | "not-object"
  | "missing-field"
  | "unexpected-field"
  | "forbidden-field"
  | "invalid-value"
  | "source-not-in-prompt"
  | "inconsistent-value"
  | "duplicate-value";
export type SemanticIntentValidationIssue = { code: SemanticIntentValidationIssueCode; path: string };
export type SemanticIntentValidationResult =
  | { valid: true; intent: SemanticTripIntent; issues: [] }
  | { valid: false; intent: null; issues: SemanticIntentValidationIssue[] };

const forbiddenField = /(canonical|place_?id|trip_?id|verified|coordinates?|price|schedule|availability)/i;
const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const hasSource = (rawPrompt: string, sourceText: string) => normalize(rawPrompt).includes(normalize(sourceText));

function inspectKeys(value: unknown, path: string, keys: string[], issues: SemanticIntentValidationIssue[]) {
  const item = record(value);
  if (!item) { issues.push({ code: "not-object", path }); return null; }
  for (const key of keys) if (!(key in item)) issues.push({ code: "missing-field", path: `${path}.${key}` });
  for (const key of Object.keys(item)) {
    if (forbiddenField.test(key)) issues.push({ code: "forbidden-field", path: `${path}.${key}` });
    if (!keys.includes(key)) issues.push({ code: "unexpected-field", path: `${path}.${key}` });
  }
  return item;
}

function source(value: unknown, path: string, rawPrompt: string, issues: SemanticIntentValidationIssue[], nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 240) { issues.push({ code: "invalid-value", path }); return null; }
  if (!hasSource(rawPrompt, value)) issues.push({ code: "source-not-in-prompt", path });
  return value;
}

function interpretedText(value: unknown, path: string, issues: SemanticIntentValidationIssue[]) {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 120) { issues.push({ code: "invalid-value", path }); return null; }
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, issues: SemanticIntentValidationIssue[], nullable = false): T | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) { issues.push({ code: "invalid-value", path }); return null; }
  return value as T;
}

function array(value: unknown, path: string, issues: SemanticIntentValidationIssue[], max = 16) {
  if (!Array.isArray(value) || value.length > max) { issues.push({ code: "invalid-value", path }); return [] as unknown[]; }
  return value;
}

/** Treat model output as untrusted even after strict structured generation. */
export function validateSemanticTripIntent(value: unknown, rawPrompt: string): SemanticIntentValidationResult {
  const issues: SemanticIntentValidationIssue[] = [];
  const rootKeys = ["schemaVersion", "rawPromptVersion", "origin", "duration", "explicitDateTexts", "destinationCandidates", "pointsOfInterest", "transport", "pace", "interests", "constraints", "ambiguities", "unresolvedMeaningfulText"];
  const root = inspectKeys(value, "$", rootKeys, issues);
  if (!root) return { valid: false, intent: null, issues };
  if (root.schemaVersion !== SEMANTIC_TRIP_INTENT_SCHEMA_VERSION) issues.push({ code: "invalid-value", path: "$.schemaVersion" });
  if (root.rawPromptVersion !== SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION) issues.push({ code: "invalid-value", path: "$.rawPromptVersion" });

  const origin = inspectKeys(root.origin, "$.origin", ["sourceText", "certainty"], issues);
  const originText = origin ? source(origin.sourceText, "$.origin.sourceText", rawPrompt, issues, true) : null;
  const originCertainty = origin ? enumValue(origin.certainty, certaintyValues, "$.origin.certainty", issues, true) : null;
  if ((originText === null) !== (originCertainty === null)) issues.push({ code: "inconsistent-value", path: "$.origin" });

  const duration = inspectKeys(root.duration, "$.duration", ["sourceText", "value", "unit"], issues);
  const durationText = duration ? source(duration.sourceText, "$.duration.sourceText", rawPrompt, issues, true) : null;
  const durationUnit = duration ? enumValue(duration.unit, ["days", "nights", "weeks"] as const, "$.duration.unit", issues, true) : null;
  const durationValue = duration?.value;
  if (durationValue !== null && (typeof durationValue !== "number" || !Number.isFinite(durationValue) || durationValue <= 0 || durationValue > 366)) issues.push({ code: "invalid-value", path: "$.duration.value" });
  if ((durationText === null) !== (durationUnit === null) || (durationText === null) !== (durationValue === null)) issues.push({ code: "inconsistent-value", path: "$.duration" });

  const exactSourceArray = (value: unknown, path: string, max = 16) => {
    const values = array(value, path, issues, max).flatMap((item, index) => source(item, `${path}[${index}]`, rawPrompt, issues) ?? []);
    if (new Set(values.map(normalize)).size !== values.length) issues.push({ code: "duplicate-value", path });
    return values;
  };
  exactSourceArray(root.explicitDateTexts, "$.explicitDateTexts", 8);

  const destinations = array(root.destinationCandidates, "$.destinationCandidates", issues);
  const destinationTexts = destinations.flatMap((item, index) => {
    const path = `$.destinationCandidates[${index}]`;
    const row = inspectKeys(item, path, ["sourceText", "interpretedText", "role", "certainty"], issues);
    if (!row) return [];
    const text = source(row.sourceText, `${path}.sourceText`, rawPrompt, issues);
    interpretedText(row.interpretedText, `${path}.interpretedText`, issues);
    enumValue(row.role, ["route-stop", "planning-area", "unknown"] as const, `${path}.role`, issues);
    enumValue(row.certainty, certaintyValues, `${path}.certainty`, issues);
    return text ? [text] : [];
  });
  if (new Set(destinationTexts.map(normalize)).size !== destinationTexts.length) issues.push({ code: "duplicate-value", path: "$.destinationCandidates" });

  const pois = array(root.pointsOfInterest, "$.pointsOfInterest", issues);
  const poiTexts = pois.flatMap((item, index) => {
    const path = `$.pointsOfInterest[${index}]`;
    const row = inspectKeys(item, path, ["sourceText", "interpretedText", "likelyDestinationSourceText", "certainty"], issues);
    if (!row) return [];
    const text = source(row.sourceText, `${path}.sourceText`, rawPrompt, issues);
    interpretedText(row.interpretedText, `${path}.interpretedText`, issues);
    const likely = source(row.likelyDestinationSourceText, `${path}.likelyDestinationSourceText`, rawPrompt, issues, true);
    enumValue(row.certainty, certaintyValues, `${path}.certainty`, issues);
    if (likely && !destinationTexts.some((candidate) => normalize(candidate) === normalize(likely))) issues.push({ code: "inconsistent-value", path: `${path}.likelyDestinationSourceText` });
    return text ? [text] : [];
  });
  if (new Set(poiTexts.map(normalize)).size !== poiTexts.length) issues.push({ code: "duplicate-value", path: "$.pointsOfInterest" });
  if (poiTexts.some((text) => destinationTexts.some((candidate) => normalize(candidate) === normalize(text)))) issues.push({ code: "inconsistent-value", path: "$.pointsOfInterest" });

  const transport = inspectKeys(root.transport, "$.transport", ["departure", "interStop", "avoid"], issues);
  const departure = inspectKeys(transport?.departure, "$.transport.departure", ["sourceText", "mode"], issues);
  const departureText = departure ? source(departure.sourceText, "$.transport.departure.sourceText", rawPrompt, issues, true) : null;
  const departureMode = departure ? enumValue(departure.mode, transportModes, "$.transport.departure.mode", issues, true) : null;
  if ((departureText === null) !== (departureMode === null)) issues.push({ code: "inconsistent-value", path: "$.transport.departure" });
  const interStop = inspectKeys(transport?.interStop, "$.transport.interStop", ["sourceText", "modes"], issues);
  const interStopText = interStop ? source(interStop.sourceText, "$.transport.interStop.sourceText", rawPrompt, issues, true) : null;
  const interStopModes = interStop ? array(interStop.modes, "$.transport.interStop.modes", issues, 6) : [];
  interStopModes.forEach((item, index) => enumValue(item, transportModes, `$.transport.interStop.modes[${index}]`, issues));
  if ((interStopText === null) !== (interStopModes.length === 0)) issues.push({ code: "inconsistent-value", path: "$.transport.interStop" });
  array(transport?.avoid, "$.transport.avoid", issues, 6).forEach((item, index) => {
    const path = `$.transport.avoid[${index}]`;
    const row = inspectKeys(item, path, ["sourceText", "mode"], issues);
    if (!row) return;
    source(row.sourceText, `${path}.sourceText`, rawPrompt, issues);
    enumValue(row.mode, transportModes, `${path}.mode`, issues);
  });

  const pace = inspectKeys(root.pace, "$.pace", ["sourceText", "value"], issues);
  const paceText = pace ? source(pace.sourceText, "$.pace.sourceText", rawPrompt, issues, true) : null;
  const paceValue = pace ? enumValue(pace.value, ["relaxed", "balanced", "packed"] as const, "$.pace.value", issues, true) : null;
  if ((paceText === null) !== (paceValue === null)) issues.push({ code: "inconsistent-value", path: "$.pace" });

  const interestValues = ["food", "coast", "nightlife", "culture", "nature", "adventure", "shopping", "wellness", "other"] as const;
  array(root.interests, "$.interests", issues).forEach((item, index) => {
    const path = `$.interests[${index}]`;
    const row = inspectKeys(item, path, ["sourceText", "value"], issues);
    if (!row) return;
    source(row.sourceText, `${path}.sourceText`, rawPrompt, issues);
    enumValue(row.value, interestValues, `${path}.value`, issues);
  });
  const constraintKinds = ["no-driving", "no-flying", "must-visit", "maximum-stops", "maximum-transfer", "fixed-commitment", "budget", "accessibility", "other"] as const;
  array(root.constraints, "$.constraints", issues).forEach((item, index) => {
    const path = `$.constraints[${index}]`;
    const row = inspectKeys(item, path, ["sourceText", "kind", "strength"], issues);
    if (!row) return;
    source(row.sourceText, `${path}.sourceText`, rawPrompt, issues);
    enumValue(row.kind, constraintKinds, `${path}.kind`, issues);
    enumValue(row.strength, ["hard", "soft"] as const, `${path}.strength`, issues);
  });
  const ambiguityKinds = ["origin", "duration", "date", "destination", "poi", "transport", "constraint", "other"] as const;
  array(root.ambiguities, "$.ambiguities", issues).forEach((item, index) => {
    const path = `$.ambiguities[${index}]`;
    const row = inspectKeys(item, path, ["sourceText", "kind"], issues);
    if (!row) return;
    source(row.sourceText, `${path}.sourceText`, rawPrompt, issues);
    enumValue(row.kind, ambiguityKinds, `${path}.kind`, issues);
  });
  exactSourceArray(root.unresolvedMeaningfulText, "$.unresolvedMeaningfulText");

  return issues.length ? { valid: false, intent: null, issues } : { valid: true, intent: value as SemanticTripIntent, issues: [] };
}

export type SemanticIntentUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number };
export type SemanticIntentCostEstimate = {
  currency: "USD";
  model: keyof typeof SEMANTIC_INTENT_PRICING_USD_PER_MILLION;
  approximateUsd: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

/** Standard uncached token-rate estimate; provider billing remains authoritative. */
export function estimateSemanticIntentCost(model: string, usage: SemanticIntentUsage | undefined): SemanticIntentCostEstimate | undefined {
  if (!usage || !(model in SEMANTIC_INTENT_PRICING_USD_PER_MILLION)) return undefined;
  const typedModel = model as keyof typeof SEMANTIC_INTENT_PRICING_USD_PER_MILLION;
  const rates = SEMANTIC_INTENT_PRICING_USD_PER_MILLION[typedModel];
  const approximateUsd = ((usage.inputTokens ?? 0) * rates.input + (usage.outputTokens ?? 0) * rates.output) / 1_000_000;
  return { currency: "USD", model: typedModel, approximateUsd, inputUsdPerMillion: rates.input, outputUsdPerMillion: rates.output };
}
export type SemanticIntentProvider = {
  model: string;
  extract(rawPrompt: string, signal: AbortSignal): Promise<{ value: unknown; usage?: SemanticIntentUsage }>;
};
export type SemanticIntentStatus = "disabled" | "completed" | "unavailable" | "timeout" | "invalid-response" | "provider-failure" | "failed";
export type SemanticIntentExtractionResult = {
  mode: SemanticIntentMode;
  status: SemanticIntentStatus;
  intent: SemanticTripIntent | null;
  latencyMs: number;
  usage?: SemanticIntentUsage;
  cost?: SemanticIntentCostEstimate;
  validationIssues?: SemanticIntentValidationIssue[];
};
export type SemanticIntentShadowLog = {
  model: string;
  mode: "shadow" | "active";
  status: SemanticIntentStatus;
  latencyMs: number;
  usage?: SemanticIntentUsage;
  cost?: SemanticIntentCostEstimate;
  validationIssueCodes?: SemanticIntentValidationIssueCode[];
};

export class SemanticIntentProviderError extends Error {
  readonly category: "auth" | "rate-limit" | "invalid-request" | "model" | "provider" | "malformed-response";
  readonly status?: number;
  constructor(detail: { category?: SemanticIntentProviderError["category"]; status?: number } = {}) {
    super("Semantic intent provider failed.");
    this.name = "SemanticIntentProviderError";
    this.category = detail.category ?? "provider";
    this.status = detail.status;
  }
}

export function semanticIntentMode(environment: { NODE_ENV?: string; MORROVIA_SEMANTIC_INTENT_MODE?: string } = process.env): SemanticIntentMode {
  if (environment.MORROVIA_SEMANTIC_INTENT_MODE === "off") return "off";
  if (environment.NODE_ENV !== "production" && environment.MORROVIA_SEMANTIC_INTENT_MODE === "shadow") return "shadow";
  return environment.MORROVIA_SEMANTIC_INTENT_MODE === "active" ? "active" : "off";
}

class SemanticIntentTimeoutError extends Error { constructor() { super("Semantic intent timed out."); this.name = "TimeoutError"; } }

async function callWithTimeout(provider: SemanticIntentProvider, rawPrompt: string, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new SemanticIntentTimeoutError()); }, timeoutMs);
  });
  try { return await Promise.race([provider.extract(rawPrompt, controller.signal), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function evaluateSemanticIntentShadow(
  rawPrompt: string,
  options: { mode: SemanticIntentMode; provider?: SemanticIntentProvider; timeoutMs?: number; log?: (event: SemanticIntentShadowLog) => void },
): Promise<SemanticIntentExtractionResult> {
  if (options.mode === "off") return { mode: "off", status: "disabled", intent: null, latencyMs: 0 };
  const mode = options.mode === "active" ? "active" as const : "shadow" as const;
  if (!options.provider) return { mode, status: "unavailable", intent: null, latencyMs: 0 };
  const startedAt = Date.now();
  let status: SemanticIntentStatus = "failed";
  let usage: SemanticIntentUsage | undefined;
  let cost: SemanticIntentCostEstimate | undefined;
  let validationIssues: SemanticIntentValidationIssue[] | undefined;
  try {
    const response = await callWithTimeout(options.provider, rawPrompt, options.timeoutMs ?? 8_000);
    usage = response.usage;
    cost = estimateSemanticIntentCost(options.provider.model, usage);
    const validation = validateSemanticTripIntent(response.value, rawPrompt);
    if (!validation.valid) {
      status = "invalid-response";
      validationIssues = validation.issues;
      return { mode, status, intent: null, latencyMs: Date.now() - startedAt, usage, cost, validationIssues };
    }
    status = "completed";
    return { mode, status, intent: validation.intent, latencyMs: Date.now() - startedAt, usage, cost };
  } catch (error) {
    status = error instanceof SemanticIntentTimeoutError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
      ? "timeout"
      : error instanceof SemanticIntentProviderError ? "provider-failure" : "failed";
    return { mode, status, intent: null, latencyMs: Date.now() - startedAt, usage };
  } finally {
    options.log?.({
      model: options.provider.model,
      mode,
      status,
      latencyMs: Date.now() - startedAt,
      ...(usage ? { usage } : {}),
      ...(cost ? { cost } : {}),
      ...(validationIssues ? { validationIssueCodes: [...new Set(validationIssues.map((issue) => issue.code))] } : {}),
    });
  }
}

const falseGeographyTerms = new Set(["food", "wine", "beaches", "beach", "nightlife", "relaxed", "museums", "museum", "cheap", "keep it cheap", "nature", "don't rush", "dont rush", "romantic", "architecture"]);
const days = (value: number, unit: "days" | "nights" | "weeks") => unit === "weeks" ? value * 7 : unit === "nights" ? value + 1 : value;

export type SemanticIntentComparison = {
  status: SemanticIntentStatus;
  deterministic: {
    originSourceText: string | null;
    duration: { value: number; unit: "days" | "nights" } | null;
    geographySourceTexts: string[];
    poiSourceTexts: string[];
    transportModes: string[];
    constraints: string[];
    interests: string[];
  };
  semantic: {
    originSourceText: string | null;
    duration: { value: number; unit: "days" | "nights" | "weeks" } | null;
    destinationSourceTexts: string[];
    destinationCandidates: SemanticTripIntent["destinationCandidates"];
    poiSourceTexts: string[];
    poiCandidates: SemanticTripIntent["pointsOfInterest"];
    departureMode: SemanticTransportMode | null;
    departureSourceText: string | null;
    interStopModes: SemanticTransportMode[];
    interStopSourceText: string | null;
    avoidModes: SemanticTransportMode[];
    avoid: SemanticTripIntent["transport"]["avoid"];
    constraints: Array<{ sourceText: string; kind: string; strength: "hard" | "soft" }>;
    interests: Array<{ sourceText: string; value: string }>;
    ambiguities: Array<{ sourceText: string; kind: string }>;
  } | null;
  agreement: { origin: boolean | null; duration: boolean | null };
  safety: { falseGeography: string[]; inventedFacts: number; meaningfulUnexplainedText: string[] };
  latencyMs: number;
  usage?: SemanticIntentUsage;
  cost?: SemanticIntentCostEstimate;
};

export function compareSemanticIntent(deterministic: JourneyCaptureResult, extraction: SemanticIntentExtractionResult): SemanticIntentComparison {
  const origin = deterministic.mentions.find((mention) => mention.role === "origin");
  const geography = deterministic.mentions.filter((mention) => !["origin", "excluded", "anchor"].includes(mention.role)).map((mention) => mention.sourceText);
  const deterministicPois = deterministic.mentions.filter((mention) => mention.role === "anchor" || mention.routability === "anchor_or_poi" || mention.routability === "non_routable_reference").map((mention) => mention.sourceText);
  const deterministicDuration = deterministic.structuredBrief.duration
    ? { value: deterministic.structuredBrief.duration.value, unit: deterministic.structuredBrief.duration.unit }
    : null;
  const deterministicTransport = deterministic.structuredBrief.transportPreferences.map((item) => item.value);
  const intent = extraction.intent;
  const coverage = intent ? [
    ...intent.destinationCandidates.map((item) => item.sourceText),
    ...intent.pointsOfInterest.map((item) => item.sourceText),
    ...intent.ambiguities.map((item) => item.sourceText),
    ...intent.unresolvedMeaningfulText,
  ].map(normalize) : [];
  const modelDuration = intent?.duration.value && intent.duration.unit ? { value: intent.duration.value, unit: intent.duration.unit } : null;
  const falseGeography = intent?.destinationCandidates.map((item) => item.sourceText).filter((text) => falseGeographyTerms.has(normalize(text))) ?? [];
  const inventedFacts = extraction.validationIssues?.filter((issue) => ["source-not-in-prompt", "forbidden-field", "unexpected-field"].includes(issue.code)).length ?? 0;
  const unexplained = extraction.status === "completed"
    ? [...geography, ...deterministicPois].filter((text) => !coverage.includes(normalize(text)))
    : [];
  return {
    status: extraction.status,
    deterministic: {
      originSourceText: origin?.sourceText ?? null,
      duration: deterministicDuration,
      geographySourceTexts: geography,
      poiSourceTexts: deterministicPois,
      transportModes: deterministicTransport,
      constraints: deterministic.structuredBrief.hardConstraints.map((item) => item.type),
      interests: deterministic.structuredBrief.interests.map((item) => item.value),
    },
    semantic: intent ? {
      originSourceText: intent.origin.sourceText,
      duration: modelDuration,
      destinationSourceTexts: intent.destinationCandidates.map((item) => item.sourceText),
      destinationCandidates: intent.destinationCandidates,
      poiSourceTexts: intent.pointsOfInterest.map((item) => item.sourceText),
      poiCandidates: intent.pointsOfInterest,
      departureMode: intent.transport.departure.mode,
      departureSourceText: intent.transport.departure.sourceText,
      interStopModes: intent.transport.interStop.modes,
      interStopSourceText: intent.transport.interStop.sourceText,
      avoidModes: intent.transport.avoid.map((item) => item.mode),
      avoid: intent.transport.avoid,
      constraints: intent.constraints,
      interests: intent.interests,
      ambiguities: intent.ambiguities,
    } : null,
    agreement: {
      origin: intent ? (origin ? normalize(intent.origin.sourceText ?? "") === normalize(origin.sourceText) : intent.origin.sourceText === null) : null,
      duration: intent ? (deterministicDuration && modelDuration
        ? days(deterministicDuration.value, deterministicDuration.unit) === days(modelDuration.value, modelDuration.unit)
        : deterministicDuration === null && modelDuration === null) : null,
    },
    safety: { falseGeography, inventedFacts, meaningfulUnexplainedText: unexplained },
    latencyMs: extraction.latencyMs,
    ...(extraction.usage ? { usage: extraction.usage } : {}),
    ...(extraction.cost ? { cost: extraction.cost } : {}),
  };
}

export type SemanticIntentEscalationReasonCode =
  | "extraction-failure"
  | "explicit-origin-missing"
  | "explicit-duration-missing"
  | "unresolved-meaningful-geography"
  | "ambiguous-place-resolution"
  | "poi-destination-conflict"
  | "hard-fact-disagreement"
  | "hard-constraint-ambiguity"
  | "significant-unclassified-text";
export type SemanticIntentEscalationReason = { code: SemanticIntentEscalationReasonCode; fields: string[]; evidence: string };
export type SemanticIntentEscalationDecision = { shouldEscalate: boolean; reasons: SemanticIntentEscalationReason[] };

const explicitOriginPattern = /\b(?:from|flying\s+from|depart(?:ing)?\s+from|leav(?:e|ing)\s+from)\s+[^,.;]+/i;
const explicitDurationPattern = /\b(?:\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:days?|nights?|weeks?|wks?)\b/i;

/** Escalation is evidence-based; it never uses a single global confidence score. */
export function shouldEscalateSemanticIntent(input: {
  rawPrompt: string;
  deterministic: JourneyCaptureResult;
  extraction: SemanticIntentExtractionResult;
  comparison?: SemanticIntentComparison;
}): SemanticIntentEscalationDecision {
  const comparison = input.comparison ?? compareSemanticIntent(input.deterministic, input.extraction);
  const intent = input.extraction.intent;
  const reasons: SemanticIntentEscalationReason[] = [];
  const add = (code: SemanticIntentEscalationReasonCode, fields: string[], evidence: string) => {
    if (!reasons.some((reason) => reason.code === code)) reasons.push({ code, fields, evidence });
  };
  if (input.extraction.status !== "completed" || !intent) {
    add("extraction-failure", ["semanticIntent"], input.extraction.status);
    return { shouldEscalate: true, reasons };
  }
  if (explicitOriginPattern.test(input.rawPrompt) && !intent.origin.sourceText) add("explicit-origin-missing", ["origin"], "explicit-source-signal-not-classified");
  if (explicitDurationPattern.test(input.rawPrompt) && (!intent.duration.sourceText || !intent.duration.value || !intent.duration.unit)) add("explicit-duration-missing", ["duration"], "explicit-source-signal-not-classified");
  const semanticCoverage = new Set([
    ...(intent.origin.sourceText ? [normalize(intent.origin.sourceText)] : []),
    ...intent.destinationCandidates.map((item) => normalize(item.sourceText)),
    ...intent.pointsOfInterest.map((item) => normalize(item.sourceText)),
    ...intent.ambiguities.map((item) => normalize(item.sourceText)),
    ...intent.unresolvedMeaningfulText.map(normalize),
  ]);
  const unresolvedGeography = input.deterministic.mentions.filter((mention) => mention.role !== "origin" && mention.status === "unresolved" && !semanticCoverage.has(normalize(mention.sourceText)));
  if (unresolvedGeography.length) add("unresolved-meaningful-geography", ["destinationCandidates", "pointsOfInterest"], "deterministic-unresolved-text-unclassified");
  if (input.deterministic.structuredBrief.placeIssues?.some((issue) => issue.code === "ambiguous_place")) add("ambiguous-place-resolution", ["destinationCandidates", "ambiguities"], "place-intelligence-ambiguity");
  const destinationSet = new Set(intent.destinationCandidates.map((item) => normalize(item.sourceText)));
  const poiConflict = intent.pointsOfInterest.some((poi) => destinationSet.has(normalize(poi.sourceText)) || (poi.likelyDestinationSourceText !== null && !destinationSet.has(normalize(poi.likelyDestinationSourceText))));
  if (poiConflict) add("poi-destination-conflict", ["destinationCandidates", "pointsOfInterest"], "semantic-role-conflict");
  if (comparison.agreement.origin === false || comparison.agreement.duration === false) add("hard-fact-disagreement", [comparison.agreement.origin === false ? "origin" : "duration"], "deterministic-semantic-disagreement");
  const deterministicHardKinds = input.deterministic.structuredBrief.hardConstraints.map((constraint) => constraint.type);
  const semanticHardKinds = new Set(intent.constraints.filter((constraint) => constraint.strength === "hard").map((constraint) => constraint.kind));
  const missingHardConstraint = deterministicHardKinds.some((kind) => {
    if (kind === "duration") return false;
    if (kind === "no-driving" || kind === "no-flying" || kind === "maximum-stops") return !semanticHardKinds.has(kind);
    if (kind === "maximum-transfer-time") return !semanticHardKinds.has("maximum-transfer");
    return false;
  });
  if (missingHardConstraint || intent.ambiguities.some((item) => item.kind === "constraint")) add("hard-constraint-ambiguity", ["constraints", "ambiguities"], "hard-constraint-not-unambiguous");
  if (intent.unresolvedMeaningfulText.some((text) => normalize(text).split(" ").length >= 2 || text.length >= 12)) add("significant-unclassified-text", ["unresolvedMeaningfulText"], "material-source-text-unclassified");
  if (comparison.safety.meaningfulUnexplainedText.length) add("unresolved-meaningful-geography", ["destinationCandidates", "pointsOfInterest"], "deterministic-meaning-not-covered");
  return { shouldEscalate: reasons.length > 0, reasons };
}

export async function runSemanticIntentShadow(input: {
  rawPrompt: string;
  deterministic: JourneyCaptureResult;
  mode: SemanticIntentMode;
  provider?: SemanticIntentProvider;
  timeoutMs?: number;
  log?: (event: SemanticIntentShadowLog) => void;
}) {
  const extraction = await evaluateSemanticIntentShadow(input.rawPrompt, input);
  const comparison = compareSemanticIntent(input.deterministic, extraction);
  return { extraction, comparison, escalation: shouldEscalateSemanticIntent({ ...input, extraction, comparison }) };
}
