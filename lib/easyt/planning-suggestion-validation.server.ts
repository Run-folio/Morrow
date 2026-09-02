import type { JourneyCaptureResult } from "./journey-capture.ts";
import {
  isOvernightBaseEligible,
  normalizePlacePhrase,
  placeCandidateSuitableAsNearbyBase,
  placeCandidateWithinPlanningParent,
  type GuidedPlanningAreaSuggestion,
  type PlaceIntelligenceProvider,
  type PlaceProviderCandidate,
  type ResolvedPlaceMention,
} from "./place-intelligence.ts";
import type { PlanningSuggestionCandidate } from "./planning-model-output.ts";

function sameSource(mention: ResolvedPlaceMention, sourceText: string) {
  const key = normalizePlacePhrase(sourceText).replace(/^the\s+/, "");
  return [mention.sourceText, ...mention.sourceTexts, mention.canonicalName]
    .some((value) => {
      const candidate = normalizePlacePhrase(value).replace(/^the\s+/, "");
      return candidate === key || candidate.includes(key) || key.includes(candidate);
    });
}

function countryMatches(candidate: PlaceProviderCandidate, country: string) {
  const expected = normalizePlacePhrase(country);
  return candidate.parentCountries?.some((value) => normalizePlacePhrase(value) === expected);
}

function candidateFitsParent(parent: ResolvedPlaceMention, candidate: PlaceProviderCandidate, suggestion: PlanningSuggestionCandidate) {
  if (!isOvernightBaseEligible({
    placeType: candidate.placeType,
    routability: candidate.routability ?? "direct_destination",
  }) || !candidate.coordinates) return false;
  if (["landmark", "natural_area", "island", "archipelago", "coast", "mountain_range", "valley", "travel_corridor"].includes(parent.placeType)
    && parent.coordinates) return Boolean(placeCandidateSuitableAsNearbyBase(
      parent,
      candidate,
      suggestion.role === "gateway-candidate" ? 350 : 180,
    ));
  if (!parent.coordinates && !parent.bounds && parent.parentCountries.length) {
    return candidate.parentCountries?.some((country) => parent.parentCountries
      .some((parentCountry) => normalizePlacePhrase(parentCountry) === normalizePlacePhrase(country))) ?? false;
  }
  return placeCandidateWithinPlanningParent(candidate, parent);
}

/** Resolves advisory model names through the same provider/canonical boundary
 * used by capture and Builder search. Unresolved or geographically incoherent
 * names are discarded and never enter trip state. */
export async function canonicalizePlanningSuggestions(input: {
  suggestions: PlanningSuggestionCandidate[];
  capture: JourneyCaptureResult;
  provider: PlaceIntelligenceProvider;
}): Promise<GuidedPlanningAreaSuggestion[]> {
  const results = await Promise.all(input.suggestions.slice(0, 6).map(async (suggestion): Promise<GuidedPlanningAreaSuggestion | undefined> => {
    const parent = input.capture.mentions.find((mention) => sameSource(mention, suggestion.parentSourceText));
    if (!parent) return undefined;
    let candidates: PlaceProviderCandidate[];
    try {
      candidates = await input.provider.lookup(suggestion.name, {
        countryNames: [suggestion.country],
        explicitCountryNames: [suggestion.country],
        travelIntent: "route-stop",
      });
    } catch { return undefined; }
    const fallbackContainer = input.capture.mentions.find((mention) => mention.mentionId !== parent.mentionId
      && ["continent", "country", "macro_region", "region"].includes(mention.placeType)
      && mention.parentCountries.some((country) => normalizePlacePhrase(country) === normalizePlacePhrase(suggestion.country)));
    const candidate = candidates.find((item) => countryMatches(item, suggestion.country)
      && (candidateFitsParent(parent, item, suggestion)
        || Boolean(fallbackContainer && candidateFitsParent(fallbackContainer, item, suggestion))));
    if (!candidate?.coordinates) return undefined;
    return {
      mentionId: parent.mentionId,
      regionCanonicalPlaceId: parent.canonicalPlaceId ?? `planning-area:${normalizePlacePhrase(parent.canonicalName).replace(/\s+/g, "-")}`,
      canonicalPlaceId: candidate.providerId.startsWith("open-world:") ? candidate.providerId : `open-world:${candidate.providerId}`,
      name: candidate.canonicalName,
      country: candidate.parentCountries?.[0] ?? suggestion.country,
      placeType: candidate.placeType,
      coordinates: [...candidate.coordinates] as [number, number],
      reason: suggestion.rationale,
      provenance: [{
        id: `planning-model:${parent.mentionId}:${normalizePlacePhrase(candidate.canonicalName).replace(/\s+/g, "-")}`,
        label: "Morrovia planning suggestion",
        kind: "context" as const,
        supports: `A planning model proposed this as an optional candidate; ${input.provider.label} independently validated its canonical place identity and containment.`,
      }],
      anchorMatched: parent.role === "anchor" || parent.routability === "anchor_or_poi",
    };
  }));
  return results.filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.canonicalPlaceId === item.canonicalPlaceId) === index)
    .slice(0, 6);
}
