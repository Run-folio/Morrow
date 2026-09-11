import {
  normalizePlacePhrase,
  resolvePlaceMentions,
  resolveExplicitPlaceMentions,
  resolveExplicitPlaceMentionsWithProvider,
  resolvePlaceMentionsWithProvider,
  type ExplicitPlaceMention,
  type PlaceIntelligenceProvider,
  type PlaceMentionRole,
  type PlaceIntelligenceResult,
  type PlaceResolutionContext,
  type ResolvedPlaceMention,
} from "./place-intelligence.ts";
import { extractStructuredTripBrief, type StructuredTripBrief } from "./structured-trip-brief.ts";
import { parseTripBrief } from "./trip-brief.ts";
import type { SemanticIntentStatus, SemanticTripIntent } from "./semantic-trip-intent.ts";
import { journeyEndFromCapturedIntent } from "./journey-endpoints.ts";
import type { JourneyEndSelection } from "./trip.ts";
import type { GuidedPlanningAreaSuggestion } from "./place-intelligence.ts";
import type { ModelTaskDecision } from "./model-task-router.ts";

export type JourneyMentionCoverage = {
  expectedPlaceMentions: number;
  resolvedPlaceMentions: number;
  routeIntentMentions: number;
  missingFromResolution: string[];
  missingFromStructuredBrief: string[];
  complete: boolean;
};

export type JourneyCaptureResult = {
  rawBrief: string;
  parserVersion: string;
  durationDays?: number;
  regions: string[];
  routeHints: string[];
  mentions: ResolvedPlaceMention[];
  structuredBrief: StructuredTripBrief;
  /** Journey-level end routing context. It is never projected as a route stop. */
  journeyEnd: JourneyEndSelection;
  mentionCoverage: JourneyMentionCoverage;
  semanticExtraction?: {
    model: string;
    status: SemanticIntentStatus;
    fallbackUsed: boolean;
    recoveredPlaceMentions?: number;
    task?: ModelTaskDecision["task"];
    complexity?: ModelTaskDecision["complexity"];
    fallbackModel?: string;
    callCount?: number;
  };
  /** Advisory model suggestions only after canonical provider validation. They
   * remain optional Builder choices and never become stops automatically. */
  planningSuggestions?: GuidedPlanningAreaSuggestion[];
  planningAssessment?: { coherence: "coherent" | "needs-review" | "unknown"; warning: string | null };
};

function unique(values: string[]) {
  return values.filter((value, index, all) => all.findIndex((other) => other.toLocaleLowerCase() === value.toLocaleLowerCase()) === index);
}

function mentionSourceKey(value: string) {
  return normalizePlacePhrase(value).replace(/^the\s+/, "");
}

function sameRawPlaceSpan(left: string, right: string) {
  const leftKey = mentionSourceKey(left);
  const rightKey = mentionSourceKey(right);
  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function semanticJourneyRole(role: ExplicitPlaceMention["role"]) {
  if (role === "origin" || role === "fixed_start") return "origin";
  if (role === "fixed_end") return "end";
  if (role === "excluded") return "excluded";
  return "stay";
}

function duplicatesRelationalJourneyEnd(sourceText: string, intent: SemanticTripIntent) {
  const endSource = intent.journeyEnd.sourceText;
  return Boolean(endSource
    && intent.journeyEnd.mode !== "unknown"
    && /\b(?:back|return|ending|finish|home)\b/i.test(endSource)
    && mentionSourceKey(sourceText) === mentionSourceKey(endSource));
}

function duplicatesOriginWithoutExplicitStay(sourceText: string, deterministicMentions: ResolvedPlaceMention[]) {
  const matching = deterministicMentions.filter((mention) => sameRawPlaceSpan(sourceText, mention.sourceText));
  return matching.some((mention) => mention.role === "origin" || mention.role === "fixed_start")
    && !matching.some((mention) => semanticJourneyRole(mention.role) === "stay");
}

function mentionCoverage(
  expected: ExplicitPlaceMention[],
  resolution: PlaceIntelligenceResult,
  structuredBrief: StructuredTripBrief,
): JourneyMentionCoverage {
  const resolvedBySource = new Set(resolution.mentions.flatMap((mention) => mention.sourceTexts.map(mentionSourceKey)));
  const routeMentionIds = new Set(structuredBrief.destinations.flatMap((destination) => destination.placeMentionId ? [destination.placeMentionId] : []));
  const missingFromResolution = expected
    .filter((item) => !resolvedBySource.has(mentionSourceKey(item.sourceText)))
    .map((item) => item.sourceText);
  const missingFromStructuredBrief = resolution.mentions
    .filter((mention) => mention.role !== "excluded" && !routeMentionIds.has(mention.mentionId))
    .map((mention) => mention.sourceText);
  return {
    expectedPlaceMentions: expected.length,
    resolvedPlaceMentions: resolution.mentions.length,
    routeIntentMentions: routeMentionIds.size,
    missingFromResolution,
    missingFromStructuredBrief,
    complete: missingFromResolution.length === 0 && missingFromStructuredBrief.length === 0,
  };
}

function captureFromResolution(
  rawBrief: string,
  resolution: PlaceIntelligenceResult,
  expected: ExplicitPlaceMention[] = resolution.mentions.map((mention) => ({ sourceText: mention.sourceText, role: mention.role })),
  semanticExtraction?: JourneyCaptureResult["semanticExtraction"],
  planning?: Pick<JourneyCaptureResult, "planningSuggestions" | "planningAssessment">,
): JourneyCaptureResult {
  const parsed = parseTripBrief(rawBrief, resolution);
  const structuredBrief = extractStructuredTripBrief(rawBrief, resolution.parserVersion, resolution);
  const durationDays = structuredBrief.duration
    ? structuredBrief.duration.value + (structuredBrief.duration.unit === "nights" ? 1 : 0)
    : parsed.durationDays;
  const regions = resolution.mentions
    .filter((mention) => mention.role !== "excluded"
      && (mention.routability === "planning_area" || mention.routability === "needs_base_selection"))
    .map((mention) => mention.canonicalName);
  const result: JourneyCaptureResult = {
    rawBrief,
    parserVersion: resolution.parserVersion,
    durationDays,
    regions: unique(regions),
    routeHints: parsed.routeHints,
    mentions: resolution.mentions,
    structuredBrief,
    journeyEnd: journeyEndFromCapturedIntent(rawBrief, resolution.mentions),
    mentionCoverage: mentionCoverage(expected, resolution, structuredBrief),
    ...(semanticExtraction ? { semanticExtraction } : {}),
    ...(planning?.planningSuggestions?.length ? { planningSuggestions: planning.planningSuggestions } : {}),
    ...(planning?.planningAssessment ? { planningAssessment: planning.planningAssessment } : {}),
  };
  return result;
}

const standaloneTravelGrammar = new Set([
  "and", "at", "begin", "beginning", "depart", "departing", "finish", "finishing", "from", "go", "going",
  "in", "leave", "leaving", "next", "or", "see", "seeing", "start", "starting", "stay", "staying", "then",
  "to", "travel", "traveling", "travelling", "visit", "visiting", "while", "with",
]);

function lexicalWords(value: string) {
  return value.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]*/gu) ?? [];
}

/**
 * Semantic extraction identifies candidate spans, but geographic identity is
 * resolved elsewhere. Keep that trust boundary strict: sentence punctuation,
 * connective text and bare travel actions are not geographic lookup inputs.
 *
 * Common words are rejected only when the entire span is grammar. A complete
 * proper name such as "Travel Town" therefore remains eligible, as does any
 * full span already backed by deterministic canonical evidence.
 */
function geographySourceSpan(
  sourceText: string,
  rawBrief: string,
  deterministicMentions: readonly ResolvedPlaceMention[] = [],
): string | null {
  const promptGrounded = rawBrief.toLocaleLowerCase().includes(sourceText.trim().toLocaleLowerCase());
  const boundaryCleaned = sourceText
    .trim()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .trim();
  if (!boundaryCleaned || !lexicalWords(boundaryCleaned).length) return null;

  const canonicalEvidence = deterministicMentions.some((mention) => sameRawPlaceSpan(mention.sourceText, boundaryCleaned)
    && Boolean(mention.canonicalPlaceId)
    && !mention.provenance.some((item) => item.id.startsWith("fuzzy:")));
  if (canonicalEvidence) return boundaryCleaned;

  const stripped = boundaryCleaned
    .replace(/^(?:(?:then|and|next)\s+)?(?:(?:visit(?:ing)?|see(?:ing)?)\b\s+|(?:start(?:ing)?|begin(?:ning)?|depart(?:ing)?|leav(?:e|ing)|finish(?:ing)?|travel(?:ling|ing)?|go(?:ing)?|stay(?:ing)?)\b\s+(?:in|from|at|to)\s+)/iu, "")
    .replace(/^(?:then|and|next)\b[\s,:;.-]*/iu, "")
    .trim();
  const candidate = stripped && rawBrief.toLocaleLowerCase().includes(stripped.toLocaleLowerCase()) ? stripped : boundaryCleaned;
  const words = lexicalWords(candidate).map((word) => word.toLocaleLowerCase().replace(/[.’'-]+$/g, ""));
  if (!words.length || words.every((word) => standaloneTravelGrammar.has(word))) return null;
  // A semantic span must be text from the traveller's prompt. Interpreted
  // canonical lookup text is handled separately and never substitutes for a
  // malformed source span.
  return promptGrounded || rawBrief.toLocaleLowerCase().includes(candidate.toLocaleLowerCase()) ? candidate : null;
}

function safeLookupText(value: string | null, sourceText: string) {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "").trim();
  const words = lexicalWords(cleaned).map((word) => word.toLocaleLowerCase());
  if (!cleaned || !words.length || words.every((word) => standaloneTravelGrammar.has(word))) return undefined;
  return normalizePlacePhrase(cleaned) === normalizePlacePhrase(sourceText) ? undefined : cleaned;
}

function semanticDestinationIntent(
  sourceText: string,
  role: SemanticTripIntent["destinationCandidates"][number]["role"],
  deterministicMentions: ResolvedPlaceMention[],
) {
  if (role !== "planning-area") return role;
  const explicitBroadWording = /\b(?:state|province|region|country)\b/i.test(sourceText);
  const deterministicBroadIdentity = deterministicMentions.some((mention) => sameRawPlaceSpan(mention.sourceText, sourceText)
    && mention.requiresBaseSelection
    && !mention.provenance.some((item) => item.id.startsWith("fuzzy:")));
  return explicitBroadWording || deterministicBroadIdentity ? "planning-area" : "route-stop";
}

function semanticPlaceMentions(
  intent: SemanticTripIntent,
  rawBrief: string,
  deterministicMentions: ResolvedPlaceMention[],
): ExplicitPlaceMention[] {
  const inputs: ExplicitPlaceMention[] = [];
  const safeSpan = (value: string) => geographySourceSpan(value, rawBrief, deterministicMentions);
  if (intent.origin.sourceText) {
    const sourceText = safeSpan(intent.origin.sourceText);
    if (sourceText) inputs.push({ sourceText, role: "origin" });
  }
  if (intent.journeyEnd?.mode === "explicit_place" && intent.journeyEnd.sourceText) {
    const sourceText = safeSpan(intent.journeyEnd.sourceText);
    if (sourceText) {
      const lookupText = safeLookupText(intent.journeyEnd.interpretedText, sourceText);
      inputs.push({ sourceText, role: "fixed_end", travelIntent: "route-stop", ...(lookupText ? { lookupText } : {}) });
    }
  }
  for (const destination of intent.destinationCandidates) {
    if (duplicatesRelationalJourneyEnd(destination.sourceText, intent)
      || duplicatesOriginWithoutExplicitStay(destination.sourceText, deterministicMentions)) continue;
    const sourceText = safeSpan(destination.sourceText);
    if (!sourceText) continue;
    const lookupText = safeLookupText(destination.interpretedText, sourceText);
    inputs.push({
    sourceText,
    // Semantic certainty describes confidence in the interpretation, not
    // whether the traveller considers an explicitly listed stop optional.
    role: "preferred",
    // An unqualified destination name is an ordinary route stop even when the
    // semantic model guesses that a same-name administrative area was meant.
    // Explicit broad wording and trusted deterministic broad identities retain
    // planning-area intent.
    travelIntent: semanticDestinationIntent(sourceText, destination.role, deterministicMentions),
    ...(lookupText ? { lookupText } : {}),
    });
  }
  for (const point of intent.pointsOfInterest) {
    const sourceText = safeSpan(point.sourceText);
    if (!sourceText) continue;
    const lookupText = safeLookupText(point.interpretedText, sourceText);
    inputs.push({ sourceText, role: "anchor", travelIntent: "anchor", ...(lookupText ? { lookupText } : {}) });
  }
  for (const ambiguity of intent.ambiguities) {
    if (!['destination', 'poi'].includes(ambiguity.kind)) continue;
    if (duplicatesRelationalJourneyEnd(ambiguity.sourceText, intent)) continue;
    const sourceText = safeSpan(ambiguity.sourceText);
    if (!sourceText) continue;
    if (!inputs.some((input) => input.sourceText.toLocaleLowerCase() === sourceText.toLocaleLowerCase())) {
      inputs.push({ sourceText, role: ambiguity.kind === "poi" ? "anchor" : "preferred" });
    }
  }
  // Luna supplies semantic classification, but it is not authoritative for
  // mention inventory. Recover any deterministic geographic mention it omitted
  // before resolution so a valid-but-incomplete model response cannot silently
  // reduce the traveller's route.
  for (const mention of deterministicMentions) {
    const safeDeterministicSource = safeSpan(mention.sourceText);
    if (!safeDeterministicSource) continue;
    const normalized = mention.normalizedPhrase;
    const sameRoleExisting = inputs.find((input) => semanticJourneyRole(input.role) === semanticJourneyRole(mention.role)
      && (sameRawPlaceSpan(input.sourceText, mention.sourceText)
        || (input.lookupText && sameRawPlaceSpan(input.lookupText, mention.sourceText))));
    // Explicit visit language is a deterministic role fact. Preserve it when a
    // semantic provider classifies the same source span as an overnight stop;
    // otherwise the provider can replace a curated landmark identity with a
    // similarly named planning area and force the wrong Builder interaction.
    const explicitVisitExisting = mention.role === "anchor"
      ? inputs.find((input) => sameRawPlaceSpan(input.sourceText, mention.sourceText)
        || Boolean(input.lookupText && sameRawPlaceSpan(input.lookupText, mention.sourceText)))
      : undefined;
    const existing = sameRoleExisting ?? explicitVisitExisting;
    if (existing) {
      if (["origin", "fixed_start"].includes(mention.role) && !["origin", "fixed_start"].includes(existing.role)) existing.role = "origin";
      if (["fixed_end", "excluded"].includes(mention.role)) existing.role = mention.role;
      if (["required", "optional"].includes(mention.role)) existing.role = mention.role;
      if (mention.role === "anchor") existing.role = "anchor";
      if (!existing.travelIntent) existing.travelIntent = mention.role === "anchor" ? "anchor" : "route-stop";
      if (mention.role === "anchor") existing.travelIntent = "anchor";
      continue;
    }
    if (normalized) inputs.push({
      sourceText: safeDeterministicSource,
      role: mention.role,
      travelIntent: mention.role === "anchor" ? "anchor" : "route-stop",
    });
  }
  return inputs
    .filter((input, index, all) => all.findIndex((candidate) => mentionSourceKey(candidate.sourceText) === mentionSourceKey(input.sourceText)
      && semanticJourneyRole(candidate.role) === semanticJourneyRole(input.role)) === index)
    .sort((left, right) => {
      const raw = rawBrief.toLocaleLowerCase();
      const position = (input: { sourceText: string; role: PlaceMentionRole }) => ["fixed_end", "excluded"].includes(input.role)
        ? raw.lastIndexOf(input.sourceText.toLocaleLowerCase())
        : raw.indexOf(input.sourceText.toLocaleLowerCase());
      return position(left) - position(right);
    });
}

/** Development-only, prompt-safe trace. It records geographic source spans and
 * pipeline outcomes without returning the full traveller prompt or secrets. */
export function developmentJourneyCaptureDiagnostics(
  intent: SemanticTripIntent,
  capture: JourneyCaptureResult,
) {
  const deterministic = resolvePlaceMentions(capture.rawBrief);
  const expected = semanticPlaceMentions(intent, capture.rawBrief, deterministic.mentions);
  const semantic = [
    ...(intent.origin.sourceText ? [{ sourceText: geographySourceSpan(intent.origin.sourceText, capture.rawBrief, deterministic.mentions), role: "origin", interpretedText: null }] : []),
    ...intent.destinationCandidates.map((item) => ({ sourceText: geographySourceSpan(item.sourceText, capture.rawBrief, deterministic.mentions), role: item.role, interpretedText: item.interpretedText })),
    ...intent.pointsOfInterest.map((item) => ({ sourceText: geographySourceSpan(item.sourceText, capture.rawBrief, deterministic.mentions), role: "poi", interpretedText: item.interpretedText })),
  ].filter((item): item is typeof item & { sourceText: string } => Boolean(item.sourceText));
  const structuredByMention = new Map(capture.structuredBrief.destinations
    .flatMap((destination) => destination.placeMentionId ? [[destination.placeMentionId, destination] as const] : []));
  return {
    kind: "journey-capture-geography-diagnostic-v1",
    semanticOutput: semantic,
    coverage: capture.mentionCoverage,
    mentions: expected.map((input) => {
      const normalized = normalizePlacePhrase(input.sourceText);
      const semanticItem = semantic.find((item) => normalizePlacePhrase(item.sourceText) === normalized);
      const mention = capture.mentions.find((item) => item.normalizedPhrase === normalized);
      const structured = mention ? structuredByMention.get(mention.mentionId) : undefined;
      const origin = mention && ["origin", "fixed_start"].includes(mention.role);
      return {
        sourceText: input.sourceText,
        lunaExtracted: Boolean(semanticItem),
        semanticRole: semanticItem?.role ?? "deterministic-recovery",
        lunaLikelyEntityType: semanticItem?.role ?? null,
        deterministicInferredType: deterministic.mentions.find((item) => item.normalizedPhrase === normalized)?.placeType ?? "unknown",
        normalizedPhrase: normalized,
        mentionCoverage: { expected: true, resolution: Boolean(mention), structuredBrief: Boolean(structured) },
        resolverRequest: input.lookupText ?? input.sourceText,
        resolverCandidates: mention?.candidates.map((candidate) => ({
          canonicalName: candidate.canonicalName,
          parentCountries: candidate.parentCountries,
          placeType: candidate.placeType,
          routability: candidate.routability,
          matchQuality: (candidate as typeof candidate & { matchQuality?: string }).matchQuality,
          rankScore: (candidate as typeof candidate & { rankScore?: number }).rankScore,
          normalization: candidate.provenance.find((source) => source.kind === "provider")?.supports,
        })) ?? [],
        selectedCandidate: mention?.canonicalPlaceId ? {
          canonicalName: mention.canonicalName,
          parentCountries: mention.parentCountries,
          placeType: mention.placeType,
          routability: mention.routability,
        } : null,
        confidence: mention ? { state: mention.confidence.state, level: mention.confidence.level } : null,
        providerStatus: mention?.provenance.some((source) => source.kind === "provider")
          ? "selected"
          : mention?.candidates.some((candidate) => candidate.provenance.some((source) => source.kind === "provider"))
            ? "candidates"
            : mention?.status === "unresolved" ? "no-result" : "not-required",
        catalogueStatus: mention?.provenance.some((source) => source.kind === "canonical" || source.kind === "curated_alias") ? "selected" : "no-match",
        structuredBrief: structured ? { name: structured.name, role: structured.role, resolutionStatus: structured.resolutionStatus } : null,
        builder: !mention
          ? { representation: "missing", label: input.sourceText }
          : origin
            ? { representation: "origin", label: mention.canonicalName }
            : mention.role === "excluded"
              ? { representation: "excluded", label: mention.canonicalName }
              : mention.status === "resolved" && mention.routability === "direct_destination"
                ? { representation: "resolved-destination", label: mention.canonicalName }
                : { representation: "to-confirm", label: mention.canonicalName },
      };
    }),
  };
}

/** One deterministic interpretation shared by homepage and builder capture. */
export function captureJourneyBrief(brief: string, context: PlaceResolutionContext = {}): JourneyCaptureResult {
  const rawBrief = brief;
  return captureFromResolution(rawBrief, resolvePlaceMentions(rawBrief, context));
}

/**
 * Optional provider-enriched path. The provider is mapped into the same compact
 * boundary and failures preserve the deterministic/unresolved result.
 */
export async function captureJourneyBriefWithProvider(
  brief: string,
  provider: PlaceIntelligenceProvider,
  context: PlaceResolutionContext = {},
): Promise<JourneyCaptureResult> {
  const rawBrief = brief;
  return captureFromResolution(rawBrief, await resolvePlaceMentionsWithProvider(rawBrief, provider, context));
}

/**
 * Projects bounded semantic classifications into the existing place and brief
 * models. Geographic identity still comes only from deterministic/provider
 * resolution; model interpretations are never treated as canonical facts.
 */
export async function captureJourneyBriefFromSemanticIntent(
  brief: string,
  intent: SemanticTripIntent,
  provider?: PlaceIntelligenceProvider,
  context: PlaceResolutionContext = {},
  extraction?: { model: string; status: SemanticIntentStatus; task?: ModelTaskDecision["task"]; complexity?: ModelTaskDecision["complexity"]; fallbackModel?: string; callCount?: number },
  planning?: Pick<JourneyCaptureResult, "planningSuggestions" | "planningAssessment">,
): Promise<JourneyCaptureResult> {
  const deterministic = resolvePlaceMentions(brief, context);
  const semanticOnly = semanticPlaceMentions(intent, brief, []);
  const expected = semanticPlaceMentions(intent, brief, deterministic.mentions);
  const semanticSources = new Set(semanticOnly.map((mention) => mentionSourceKey(mention.sourceText)));
  const recoveredPlaceMentions = expected.filter((mention) => !semanticSources.has(mentionSourceKey(mention.sourceText))).length;
  const resolution = provider
    ? await resolveExplicitPlaceMentionsWithProvider(expected, provider, context)
    : resolveExplicitPlaceMentions(expected, context);
  return captureFromResolution(brief, resolution, expected, extraction ? { ...extraction, fallbackUsed: false, recoveredPlaceMentions } : undefined, planning);
}

export function captureJourneyBriefFallback(
  brief: string,
  extraction?: { model: string; status: SemanticIntentStatus },
  context: PlaceResolutionContext = {},
) {
  const capture = captureJourneyBrief(brief, context);
  return extraction ? { ...capture, semanticExtraction: { ...extraction, fallbackUsed: true } } : capture;
}
