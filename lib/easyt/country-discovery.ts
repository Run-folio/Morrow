import { countryCodeFor } from "./country-registry.ts";
import { destinationKnowledge } from "./destination-knowledge.ts";
import { guidedPlanningAreaSuggestions, type GuidedPlanningAreaSuggestion, type ResolvedPlaceMention } from "./place-intelligence.ts";
import { routeFamilies } from "./route-catalog.ts";

/** A read-only projection. Draft choices live on StructuredTripBrief; only the
 * Builder's existing Add stop boundary may turn a choice into a route stop. */
export type CountryDiscoveryCandidate = GuidedPlanningAreaSuggestion & {
  placeId: string;
  countryCode: string;
  alreadyInTrip: boolean;
  reason: string;
  stayGuidance?: string;
  score: number;
};

export type CountryDiscoveryContext = {
  mentions?: ResolvedPlaceMention[];
  interests?: string[];
  totalNights?: number;
  existingPlaceIds?: string[];
  /** Presence, including an empty array, means the traveller edited the draft. */
  explicitChoiceIds?: string[];
};

export const COUNTRY_DISCOVERY_WEIGHTS = {
  reviewedStay: 10,
  knownRole: 7,
  interest: 16,
  countryAnchor: 12,
  timeMismatch: 30,
} as const;

const key = (name: string, country: string) => `${name.trim().toLocaleLowerCase()}|${country.trim().toLocaleLowerCase()}`;

function availableNights(context: CountryDiscoveryContext): number | undefined {
  if (!context.totalNights || context.totalNights < 1) return undefined;
  const countries = new Set((context.mentions ?? [])
    .filter((mention) => mention.placeType === "country")
    .map((mention) => mention.canonicalName.toLocaleLowerCase()));
  return Math.max(1, Math.floor(context.totalNights / Math.max(1, countries.size)));
}

export function updateCountryDiscoveryChoice(currentIds: readonly string[], placeId: string, selected: boolean): string[] {
  return selected ? [...new Set([...currentIds, placeId])] : currentIds.filter((id) => id !== placeId);
}

export function buildCountryDiscovery(mention: ResolvedPlaceMention, context: CountryDiscoveryContext = {}) {
  const existing = new Set(context.existingPlaceIds ?? []);
  const interests = new Set((context.interests ?? []).map((interest) => interest.toLocaleLowerCase()));
  const nights = availableNights(context);
  const seen = new Set<string>();
  const candidates: CountryDiscoveryCandidate[] = guidedPlanningAreaSuggestions(mention, {
    mentions: context.mentions,
    interests: context.interests,
  }).flatMap((suggestion, index) => {
    const countryCode = countryCodeFor(suggestion.country);
    const identity = key(suggestion.name, suggestion.country);
    if (!countryCode || !suggestion.coordinates || !["city", "town", "transport_gateway"].includes(suggestion.placeType) || seen.has(identity)) return [];
    seen.add(identity);
    const knowledge = destinationKnowledge.findDestination({ canonicalPlaceId: suggestion.canonicalPlaceId, name: suggestion.name, country: suggestion.country });
    const sourceStop = routeFamilies.flatMap((route) => route.stops).find((stop) => key(stop.name, stop.country) === identity);
    const minimumNights = knowledge?.minimumNights.status === "known" ? knowledge.minimumNights.value : sourceStop?.minimumNights;
    const idealNights = knowledge?.idealNights.status === "known" ? knowledge.idealNights.value : sourceStop?.recommendedNights;
    const tags = knowledge?.experienceTags.status === "known" ? knowledge.experienceTags.value : [];
    const matchedInterest = tags.find((tag) => interests.has(tag.toLocaleLowerCase()));
    const role = knowledge?.roles.status === "known" ? knowledge.roles.value : [];
    const timeMismatch = nights !== undefined && minimumNights !== undefined && minimumNights > nights;
    const score = Math.max(0, 12 - index) + (minimumNights !== undefined ? COUNTRY_DISCOVERY_WEIGHTS.reviewedStay : 0)
      + (role.length ? COUNTRY_DISCOVERY_WEIGHTS.knownRole : 0)
      + (matchedInterest ? COUNTRY_DISCOVERY_WEIGHTS.interest : 0)
      + (suggestion.anchorMatched ? COUNTRY_DISCOVERY_WEIGHTS.countryAnchor : 0)
      - (timeMismatch ? COUNTRY_DISCOVERY_WEIGHTS.timeMismatch : 0);
    const reason = matchedInterest
      ? `Matches your ${matchedInterest} interest.`
      : suggestion.anchorMatched
        ? `In the same country as a place you specifically named.`
        : minimumNights !== undefined && nights !== undefined && minimumNights <= nights
          ? `Its known minimum stay fits within roughly ${nights} nights for this country.`
          : `A supported place within ${mention.canonicalName}; review how it fits your route.`;
    const stayGuidance = idealNights !== undefined
      ? `Typically ${idealNights} nights in Morrovia's reviewed route guidance`
      : minimumNights !== undefined ? `Allow at least ${minimumNights} nights in existing route guidance` : undefined;
    return [{ ...suggestion, placeId: suggestion.canonicalPlaceId, countryCode, alreadyInTrip: existing.has(suggestion.canonicalPlaceId), reason, stayGuidance, score }];
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const maxDefault = nights === undefined ? 2 : nights <= 7 ? 2 : nights <= 14 ? 3 : 4;
  const defaultIds = candidates.filter((candidate) => !candidate.alreadyInTrip && candidate.score > 0)
    .slice(0, Math.max(0, maxDefault - Math.min(existing.size, maxDefault)))
    .map((candidate) => candidate.placeId);
  const selectedIds = context.explicitChoiceIds === undefined
    ? defaultIds
    : context.explicitChoiceIds.filter((id) => candidates.some((candidate) => candidate.placeId === id && !candidate.alreadyInTrip));
  return { candidates, selectedIds, availableNights: nights };
}
