import { countryCodeFor } from "./country-registry.ts";
import { destinationKnowledge } from "./destination-knowledge.ts";
import { guidedPlanningAreaSuggestions, placeCandidateWithinPlanningParent, type GuidedPlanningAreaSuggestion, type ResolvedPlaceMention } from "./place-intelligence.ts";
import { findCatalogPlaceById } from "./place-catalog.ts";
import { routeFamilies } from "./route-catalog.ts";

/** A read-only projection. Draft choices live on StructuredTripBrief; only the
 * Builder's existing Add stop boundary may turn a choice into a route stop. */
export type CountryDiscoveryCandidate = GuidedPlanningAreaSuggestion & {
  placeId: string;
  countryCode: string;
  alreadyInTrip: boolean;
  reason: string;
  stayGuidance?: string;
  recommendationProvenance: Array<{ id: string; label: string; url?: string; supports: string }>;
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
const routeStops = routeFamilies.flatMap((route) => route.stops);
const routeStopFor = (name: string, country: string) => routeStops.find((stop) => key(stop.name, stop.country) === key(name, country));
function straightLineKm(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

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
    const catalog = findCatalogPlaceById(suggestion.canonicalPlaceId);
    if (!countryCode || !catalog || !suggestion.coordinates
      || !["city", "town", "transport_gateway"].includes(suggestion.placeType) || seen.has(identity)) return [];
    if (!placeCandidateWithinPlanningParent({
      canonicalName: suggestion.name, placeType: suggestion.placeType,
      parentCountries: [suggestion.country], parentRegionId: catalog.parentRegionId,
      coordinates: suggestion.coordinates, routability: "direct_destination",
    }, mention)) return [];
    seen.add(identity);
    const knowledge = destinationKnowledge.findDestination({ canonicalPlaceId: suggestion.canonicalPlaceId, name: suggestion.name, country: suggestion.country });
    const sourceStop = routeStopFor(suggestion.name, suggestion.country);
    // The place catalogue owns identity and containment, not visitor appeal.
    // It cannot alone make a place a recommendation.
    if (!sourceStop && knowledge?.roles.status !== "known") return [];
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
          ? `Its known minimum stay can fit a share of this trip's nights.`
          : `A supported place within ${mention.canonicalName}; review how it fits your route.`;
    const stayGuidance = idealNights !== undefined
      ? `Typically ${idealNights} nights in Morrovia's reviewed route guidance`
      : minimumNights !== undefined ? `Allow at least ${minimumNights} nights in existing route guidance` : undefined;
    const recommendationProvenance = knowledge?.roles.status === "known"
      ? knowledge.roles.sources.map(({ id, label, url, supports }) => ({ id, label, url, supports }))
      : suggestion.provenance.map(({ id, label, supports }) => ({ id, label, supports }));
    return [{ ...suggestion, placeId: suggestion.canonicalPlaceId, countryCode, alreadyInTrip: existing.has(suggestion.canonicalPlaceId), reason, stayGuidance, recommendationProvenance, score }];
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const existingWithinParent = [...existing].map((id) => findCatalogPlaceById(id)).filter((place): place is NonNullable<typeof place> => Boolean(place
    && placeCandidateWithinPlanningParent({
      canonicalName: place.canonicalName, placeType: place.placeType,
      parentCountries: [...place.parentCountries], parentRegionId: place.parentRegionId,
      coordinates: place.coordinates ? [...place.coordinates] as [number, number] : undefined,
      routability: place.routability,
    }, mention)));
  const evidenceSupportsPacing = candidates.some((candidate) => candidate.stayGuidance);
  const maxDefault = !evidenceSupportsPacing || nights === undefined ? 2 : nights <= 7 ? 2 : nights <= 14 ? 3 : 4;
  const broadScale = mention.placeType === "continent" || mention.placeType === "macro_region";
  const existingCountries = new Set(existingWithinParent.flatMap((place) => place.parentCountries));
  const defaultIds: string[] = [];
  const defaultCandidates: CountryDiscoveryCandidate[] = [];
  let reservedNights = existingWithinParent.reduce((sum, place) => {
    const country = place.parentCountries[0] ?? "";
    const known = destinationKnowledge.findDestination({ canonicalPlaceId: place.canonicalPlaceId, name: place.canonicalName, country });
    return sum + (known?.minimumNights.status === "known" ? known.minimumNights.value
      : routeStopFor(place.canonicalName, country)?.minimumNights ?? 2);
  }, Math.max(0, existingWithinParent.length - 1));
  for (const candidate of candidates) {
    if (candidate.alreadyInTrip || candidate.score <= 0 || defaultIds.length + existingWithinParent.length >= maxDefault) continue;
    // A route family establishes this place's appeal, not a viable connection
    // to another family's country. A continent-scale draft starts in one
    // country; the traveller may explicitly add others.
    if (broadScale && (existingCountries.size > 1
      || (existingCountries.size === 1 && !existingCountries.has(candidate.country))
      || (defaultCandidates.length > 0 && defaultCandidates[0].country !== candidate.country))) continue;
    const known = destinationKnowledge.findDestination({ canonicalPlaceId: candidate.placeId, name: candidate.name, country: candidate.country });
    const sourceStop = routeStopFor(candidate.name, candidate.country);
    // Without route evidence, do not silently propose a far-flung pair as a
    // compact starting set. This is a conservative suppression, not a transfer
    // time claim; travellers can still add either place themselves.
    if (!sourceStop && candidate.coordinates && defaultCandidates.some((selected) =>
      !routeStopFor(selected.name, selected.country) && selected.coordinates
      && straightLineKm(candidate.coordinates!, selected.coordinates) > 250)) continue;
    const minimum = known?.minimumNights.status === "known" ? known.minimumNights.value : sourceStop?.minimumNights ?? 2;
    const nextReserved = reservedNights + minimum + (defaultIds.length + existingWithinParent.length > 0 ? 1 : 0);
    if (nights !== undefined && nextReserved > nights) continue;
    defaultIds.push(candidate.placeId);
    defaultCandidates.push(candidate);
    reservedNights = nextReserved;
  }
  const selectedIds = context.explicitChoiceIds === undefined
    ? defaultIds
    : context.explicitChoiceIds.filter((id) => candidates.some((candidate) => candidate.placeId === id && !candidate.alreadyInTrip));
  return { candidates, selectedIds, availableNights: nights };
}
