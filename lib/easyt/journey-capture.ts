import {
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
  mentionCoverage: JourneyMentionCoverage;
  semanticExtraction?: {
    model: string;
    status: SemanticIntentStatus;
    fallbackUsed: boolean;
  };
};

function unique(values: string[]) {
  return values.filter((value, index, all) => all.findIndex((other) => other.toLocaleLowerCase() === value.toLocaleLowerCase()) === index);
}

function mentionCoverage(
  expected: ExplicitPlaceMention[],
  resolution: PlaceIntelligenceResult,
  structuredBrief: StructuredTripBrief,
): JourneyMentionCoverage {
  const resolvedBySource = new Set(resolution.mentions.map((mention) => mention.sourceText.toLocaleLowerCase()));
  const routeMentionIds = new Set(structuredBrief.destinations.flatMap((destination) => destination.placeMentionId ? [destination.placeMentionId] : []));
  const missingFromResolution = expected
    .filter((item) => !resolvedBySource.has(item.sourceText.toLocaleLowerCase()))
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
    mentionCoverage: mentionCoverage(expected, resolution, structuredBrief),
    ...(semanticExtraction ? { semanticExtraction } : {}),
  };
  return result;
}

function semanticPlaceMentions(intent: SemanticTripIntent, rawBrief: string): ExplicitPlaceMention[] {
  const inputs: ExplicitPlaceMention[] = [];
  const geographySpan = (sourceText: string) => {
    const stripped = sourceText
      .replace(/^(?:start(?:ing)?|begin(?:ning)?|depart(?:ing)?|leav(?:e|ing)|finish(?:ing)?|travel(?:ling|ing)?|visit(?:ing)?)\s+(?:in|from|at|to)\s+/i, "")
      .replace(/^(?:then|and)\s+/i, "")
      .trim();
    return stripped && rawBrief.toLocaleLowerCase().includes(stripped.toLocaleLowerCase()) ? stripped : sourceText;
  };
  if (intent.origin.sourceText) inputs.push({ sourceText: geographySpan(intent.origin.sourceText), role: "origin" });
  for (const destination of intent.destinationCandidates) inputs.push({
    sourceText: geographySpan(destination.sourceText),
    role: destination.certainty === "likely" ? "optional" : "preferred",
  });
  for (const point of intent.pointsOfInterest) inputs.push({ sourceText: geographySpan(point.sourceText), role: "anchor" });
  for (const ambiguity of intent.ambiguities) {
    if (!['destination', 'poi'].includes(ambiguity.kind)) continue;
    const sourceText = geographySpan(ambiguity.sourceText);
    if (!inputs.some((input) => input.sourceText.toLocaleLowerCase() === sourceText.toLocaleLowerCase())) {
      inputs.push({ sourceText, role: ambiguity.kind === "poi" ? "anchor" : "preferred" });
    }
  }
  return inputs
    .filter((input, index, all) => all.findIndex((candidate) => candidate.sourceText.toLocaleLowerCase() === input.sourceText.toLocaleLowerCase()) === index)
    .sort((left, right) => rawBrief.toLocaleLowerCase().indexOf(left.sourceText.toLocaleLowerCase()) - rawBrief.toLocaleLowerCase().indexOf(right.sourceText.toLocaleLowerCase()));
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
  extraction?: { model: string; status: SemanticIntentStatus },
): Promise<JourneyCaptureResult> {
  const expected = semanticPlaceMentions(intent, brief);
  const resolution = provider
    ? await resolveExplicitPlaceMentionsWithProvider(expected, provider, context)
    : resolveExplicitPlaceMentions(expected, context);
  return captureFromResolution(brief, resolution, expected, extraction ? { ...extraction, fallbackUsed: false } : undefined);
}

export function captureJourneyBriefFallback(
  brief: string,
  extraction?: { model: string; status: SemanticIntentStatus },
  context: PlaceResolutionContext = {},
) {
  const capture = captureJourneyBrief(brief, context);
  return extraction ? { ...capture, semanticExtraction: { ...extraction, fallbackUsed: true } } : capture;
}
