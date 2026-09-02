import {
  normalizePlacePhrase,
  resolvePlaceMentions,
  resolveExplicitPlaceMentions,
  resolveExplicitPlaceMentionsWithProvider,
  resolvePlaceMentionsWithProvider,
  type ExplicitPlaceMention,
  type PlaceIntelligenceProvider,
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

function geographySourceSpan(sourceText: string, rawBrief: string) {
  const stripped = sourceText
    .replace(/^(?:start(?:ing)?|begin(?:ning)?|depart(?:ing)?|leav(?:e|ing)|finish(?:ing)?|travel(?:ling|ing)?|visit(?:ing)?)\s+(?:in|from|at|to)\s+/i, "")
    .replace(/^(?:then|and)\s+/i, "")
    .trim();
  return stripped && rawBrief.toLocaleLowerCase().includes(stripped.toLocaleLowerCase()) ? stripped : sourceText;
}

function semanticPlaceMentions(
  intent: SemanticTripIntent,
  rawBrief: string,
  deterministicMentions: ResolvedPlaceMention[],
): ExplicitPlaceMention[] {
  const inputs: ExplicitPlaceMention[] = [];
  if (intent.origin.sourceText) inputs.push({ sourceText: geographySourceSpan(intent.origin.sourceText, rawBrief), role: "origin" });
  if (intent.journeyEnd?.mode === "explicit_place" && intent.journeyEnd.sourceText) inputs.push({
    sourceText: geographySourceSpan(intent.journeyEnd.sourceText, rawBrief),
    role: "fixed_end",
    travelIntent: "route-stop",
    ...(intent.journeyEnd.interpretedText ? { lookupText: intent.journeyEnd.interpretedText } : {}),
  });
  for (const destination of intent.destinationCandidates) inputs.push({
    sourceText: geographySourceSpan(destination.sourceText, rawBrief),
    // Semantic certainty describes confidence in the interpretation, not
    // whether the traveller considers an explicitly listed stop optional.
    role: "preferred",
    travelIntent: destination.role,
    ...(destination.interpretedText ? { lookupText: destination.interpretedText } : {}),
  });
  for (const point of intent.pointsOfInterest) inputs.push({
    sourceText: geographySourceSpan(point.sourceText, rawBrief),
    role: "anchor",
    travelIntent: "anchor",
    ...(point.interpretedText ? { lookupText: point.interpretedText } : {}),
  });
  for (const ambiguity of intent.ambiguities) {
    if (!['destination', 'poi'].includes(ambiguity.kind)) continue;
    const sourceText = geographySourceSpan(ambiguity.sourceText, rawBrief);
    if (!inputs.some((input) => input.sourceText.toLocaleLowerCase() === sourceText.toLocaleLowerCase())) {
      inputs.push({ sourceText, role: ambiguity.kind === "poi" ? "anchor" : "preferred" });
    }
  }
  // Luna supplies semantic classification, but it is not authoritative for
  // mention inventory. Recover any deterministic geographic mention it omitted
  // before resolution so a valid-but-incomplete model response cannot silently
  // reduce the traveller's route.
  for (const mention of deterministicMentions) {
    const normalized = mention.normalizedPhrase;
    const existing = inputs.find((input) => sameRawPlaceSpan(input.sourceText, mention.sourceText)
      || (input.lookupText && sameRawPlaceSpan(input.lookupText, mention.sourceText)));
    if (existing) {
      if (["origin", "fixed_start"].includes(mention.role) && !["origin", "fixed_start"].includes(existing.role)) existing.role = "origin";
      if (["fixed_end", "excluded"].includes(mention.role)) existing.role = mention.role;
      if (["required", "optional"].includes(mention.role)) existing.role = mention.role;
      if (!existing.travelIntent) existing.travelIntent = mention.role === "anchor" ? "anchor" : "route-stop";
      continue;
    }
    if (normalized) inputs.push({
      sourceText: mention.sourceText,
      role: mention.role,
      travelIntent: mention.role === "anchor" ? "anchor" : "route-stop",
    });
  }
  return inputs
    .filter((input, index, all) => all.findIndex((candidate) => mentionSourceKey(candidate.sourceText) === mentionSourceKey(input.sourceText)) === index)
    .sort((left, right) => rawBrief.toLocaleLowerCase().indexOf(left.sourceText.toLocaleLowerCase()) - rawBrief.toLocaleLowerCase().indexOf(right.sourceText.toLocaleLowerCase()));
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
    ...(intent.origin.sourceText ? [{ sourceText: geographySourceSpan(intent.origin.sourceText, capture.rawBrief), role: "origin", interpretedText: null }] : []),
    ...intent.destinationCandidates.map((item) => ({ sourceText: geographySourceSpan(item.sourceText, capture.rawBrief), role: item.role, interpretedText: item.interpretedText })),
    ...intent.pointsOfInterest.map((item) => ({ sourceText: geographySourceSpan(item.sourceText, capture.rawBrief), role: "poi", interpretedText: item.interpretedText })),
  ];
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
