import {
  resolvePlaceMentions,
  resolvePlaceMentionsWithProvider,
  type PlaceIntelligenceProvider,
  type PlaceIntelligenceResult,
  type PlaceResolutionContext,
  type ResolvedPlaceMention,
} from "./place-intelligence.ts";
import { extractStructuredTripBrief, type StructuredTripBrief } from "./structured-trip-brief.ts";
import { parseTripBrief } from "./trip-brief.ts";

export type JourneyCaptureResult = {
  rawBrief: string;
  parserVersion: string;
  durationDays?: number;
  regions: string[];
  routeHints: string[];
  mentions: ResolvedPlaceMention[];
  structuredBrief: StructuredTripBrief;
};

function unique(values: string[]) {
  return values.filter((value, index, all) => all.findIndex((other) => other.toLocaleLowerCase() === value.toLocaleLowerCase()) === index);
}

function captureFromResolution(rawBrief: string, resolution: PlaceIntelligenceResult): JourneyCaptureResult {
  const parsed = parseTripBrief(rawBrief, resolution);
  const structuredBrief = extractStructuredTripBrief(rawBrief, resolution.parserVersion, resolution);
  const durationDays = structuredBrief.duration
    ? structuredBrief.duration.value + (structuredBrief.duration.unit === "nights" ? 1 : 0)
    : parsed.durationDays;
  const regions = resolution.mentions
    .filter((mention) => mention.role !== "excluded"
      && (mention.routability === "planning_area" || mention.routability === "needs_base_selection"))
    .map((mention) => mention.canonicalName);
  return {
    rawBrief,
    parserVersion: resolution.parserVersion,
    durationDays,
    regions: unique(regions),
    routeHints: parsed.routeHints,
    mentions: resolution.mentions,
    structuredBrief,
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
