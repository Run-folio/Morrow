import { findCatalogPlaceById } from "./place-catalog.ts";
import { canonicalPlaceFactsMatch, canonicalPlaceSuggestionForId, canonicalPlaceSuggestionSuitableAsNearbyBase, isOvernightBaseEligible, nearbyBaseAnchorForMention, placeCandidateWithinPlanningParent, placeSuggestionRequiresBaseSelection, type CanonicalPlaceSuggestion, type ResolvedPlaceMention } from "./place-intelligence.ts";
import { discoveryPlaceForId, discoveryPlaceWithinMention } from "./discovery-content.ts";
import type { DiscoveryPlace } from "./discovery-content.ts";
import type { DiscoveryProjection } from "./discovery-projection.ts";
import type { DiscoveryDraft } from "./discovery-draft.ts";

export type DiscoveryUnresolvedChoice = {
  id: string;
  name: string;
  reason: "browse-only" | "missing-canonical-identity" | "not-a-route-base" | "commit-failed";
};
export type DiscoveryReadyChoice = { id: string; name: string; suggestion: CanonicalPlaceSuggestion };

/** An explicit identity choice can resolve an unknown place without claiming
 * that it is a reviewed Discovery recommendation. */
export function discoveryClarificationSearchCanAdd(suggestion: CanonicalPlaceSuggestion) {
  return Boolean(suggestion.coordinates && suggestion.country
    && isOvernightBaseEligible({ placeType: suggestion.placeType, routability: suggestion.routability ?? "direct_destination" }));
}

/** The shared safety gate for a visible direct-stop action and its commit. */
export function discoveryDirectStopSuggestion(place: DiscoveryPlace): CanonicalPlaceSuggestion | null {
  if (!["city", "town"].includes(place.placeType)) return null;
  const catalog = findCatalogPlaceById(place.id);
  if (!catalog || catalog.routability !== "direct_destination") return null;
  const suggestion = canonicalPlaceSuggestionForId(place.id);
  if(!suggestion||place.name!==catalog.canonicalName||place.placeType!==catalog.placeType||!catalog.parentCountries.includes(place.country))return null;
  const trusted= suggestion.coordinates ?? discoveryPlaceForId(place.id)?.coordinates;
  if(!trusted||trusted.length!==2||!trusted.every(Number.isFinite)||!place.coordinates?.every((v,i)=>v===trusted[i]))return null;
  return {...suggestion,coordinates:[...trusted] as [number,number]};
}

/** The primary grid is a stop picker; evidence that supports browsing alone is not an Add path. */
export function discoverySelectablePlaces(places: readonly DiscoveryPlace[]): DiscoveryPlace[] {
  return places.filter(place => Boolean(discoveryDirectStopSuggestion(place)));
}

/** Search choices use the existing canonical identity, without claiming reviewed recommendation evidence. */
export function discoverySearchStopSuggestion(suggestion: CanonicalPlaceSuggestion): CanonicalPlaceSuggestion | null {
  if (!suggestion.canonicalPlaceId || !suggestion.name.trim() || !suggestion.country.trim()
    || !suggestion.coordinates || suggestion.coordinates.length !== 2
    || !suggestion.coordinates.every(Number.isFinite)
    || Math.abs(suggestion.coordinates[0]) > 180 || Math.abs(suggestion.coordinates[1]) > 90
    || !Array.isArray(suggestion.provenance) || !suggestion.provenance.length
    || !isOvernightBaseEligible({ placeType: suggestion.placeType, routability: suggestion.routability ?? "direct_destination" })) return null;
  const catalog = findCatalogPlaceById(suggestion.canonicalPlaceId);
  if (catalog && (catalog.canonicalName !== suggestion.name || !catalog.parentCountries.includes(suggestion.country)
    || catalog.routability !== "direct_destination")) return null;
  if (!canonicalPlaceFactsMatch(suggestion.canonicalPlaceId, {
    country: suggestion.country, coordinates: suggestion.coordinates,
  })) return null;
  return suggestion;
}

/** Search can resolve an island, but only a verified, contained settlement can leave Discovery as a stop. */
export function discoveryBaseForSearchedArea(area: CanonicalPlaceSuggestion, base: CanonicalPlaceSuggestion): CanonicalPlaceSuggestion | null {
  if (!placeSuggestionRequiresBaseSelection(area) || !area.coordinates || !area.bounds) return null;
  const eligible = discoverySearchStopSuggestion(base);
  if (!eligible) return null;
  const parent = { canonicalPlaceId: area.canonicalPlaceId, canonicalName: area.name, placeType: area.placeType,
    parentCountries: [area.country], parentRegionId: area.region, bounds: area.bounds };
  const anchor = nearbyBaseAnchorForMention({ canonicalPlaceId: area.canonicalPlaceId, canonicalName: area.name,
    placeType: area.placeType, parentCountries: [area.country], parentRegionId: area.region,
    coordinates: area.coordinates, routability: area.routability ?? "needs_base_selection" });
  return anchor && placeCandidateWithinPlanningParent({ canonicalName: base.name, placeType: base.placeType,
    parentCountries: [base.country], parentRegionId: base.region, coordinates: base.coordinates,
    routability: base.routability }, parent)
    && canonicalPlaceSuggestionSuitableAsNearbyBase(anchor, base) ? eligible : null;
}

/** A browsed direction is optional, but extending the original planning geography requires explicit intent. */
export function discoverySearchOutsideMention(suggestion: CanonicalPlaceSuggestion, mention: ResolvedPlaceMention): boolean {
  if (!mention.canonicalPlaceId) return false;
  if (findCatalogPlaceById(suggestion.canonicalPlaceId))
    return !discoveryPlaceWithinMention(suggestion.canonicalPlaceId, mention);
  if (mention.placeType === "country") return suggestion.country !== mention.canonicalName;
  if (mention.placeType === "continent" || mention.placeType === "macro_region")
    return !mention.parentCountries.includes(suggestion.country);
  return !placeCandidateWithinPlanningParent({ canonicalName: suggestion.name, placeType: suggestion.placeType,
    parentCountries: [suggestion.country], parentRegionId: suggestion.region, coordinates: suggestion.coordinates,
    routability: suggestion.routability }, {
    canonicalPlaceId: mention.canonicalPlaceId, canonicalName: mention.canonicalName, placeType: mention.placeType,
    parentCountries: mention.parentCountries, parentRegionId: mention.parentRegionId, bounds: mention.bounds,
  });
}

/** One shared gate for shortlist confirmation and autocomplete selection. */
export function discoveryConfirmationChoiceForId(id: string, projection: DiscoveryProjection, draft?: DiscoveryDraft): DiscoveryReadyChoice | DiscoveryUnresolvedChoice {
  const place = projection.places.find(item => item.id === id);
  const searched = draft?.searchSelections?.find(item => item.canonicalPlaceId === id);
  const name = place?.name ?? searched?.name ?? findCatalogPlaceById(id)?.canonicalName ?? id;
  if (!place && searched) {
    const suggestion = discoverySearchStopSuggestion(searched);
    return suggestion ? { id, name, suggestion } : { id, name, reason: "not-a-route-base" };
  }
  if (!place) return { id, name, reason: "missing-canonical-identity" };
  const catalog = findCatalogPlaceById(id);
  if (!catalog) return { id, name, reason: "missing-canonical-identity" };
  if (catalog.routability !== "direct_destination") return { id, name, reason: "not-a-route-base" };
  const suggestion = discoveryDirectStopSuggestion(place);
  if (!suggestion) return { id, name, reason: "not-a-route-base" };
  return { id, name, suggestion };
}

/** The caller owns route mutation; a partial result can never imply parent completion. */
export async function commitDiscoverySelections(
  ids: readonly string[],
  projection: DiscoveryProjection,
  commit: (suggestion: CanonicalPlaceSuggestion, id: string) => Promise<boolean>,
): Promise<{ committed: Array<{ id: string; name: string }>; unresolved: DiscoveryUnresolvedChoice[]; allConfirmed: boolean }> {
  const committed: Array<{ id: string; name: string }> = [];
  const unresolved: DiscoveryUnresolvedChoice[] = [];
  const uniqueIds = [...new Set(ids)];
  for (const id of uniqueIds) {
    const choice = discoveryConfirmationChoiceForId(id, projection);
    if ("reason" in choice) { unresolved.push(choice); continue; }
    try {
      if (await commit(choice.suggestion, id)) committed.push({ id, name: choice.name });
      else unresolved.push({ id, name: choice.name, reason: "commit-failed" });
    } catch {
      unresolved.push({ id, name: choice.name, reason: "commit-failed" });
    }
  }
  return { committed, unresolved, allConfirmed: uniqueIds.length > 0 && unresolved.length === 0 && committed.length === uniqueIds.length };
}
