import { findCatalogPlaceById } from "./place-catalog.ts";
import { canonicalPlaceSuggestionFor, type CanonicalPlaceSuggestion } from "./place-intelligence.ts";
import type { DiscoveryProjection } from "./discovery-projection.ts";

export type DiscoveryUnresolvedChoice = {
  id: string;
  name: string;
  reason: "browse-only" | "missing-canonical-identity" | "not-a-route-base" | "commit-failed";
};
export type DiscoveryReadyChoice = { id: string; name: string; suggestion: CanonicalPlaceSuggestion };

/** One shared gate for shortlist confirmation and autocomplete selection. */
export function discoveryConfirmationChoiceForId(id: string, projection: DiscoveryProjection): DiscoveryReadyChoice | DiscoveryUnresolvedChoice {
  const place = projection.places.find(item => item.id === id);
  const name = place?.name ?? findCatalogPlaceById(id)?.canonicalName ?? id;
  if (place && place.actionability !== "overnight-base") return { id, name, reason: "browse-only" };
  const catalog = findCatalogPlaceById(id);
  if (!catalog) return { id, name, reason: "missing-canonical-identity" };
  if (catalog.routability !== "direct_destination") return { id, name, reason: "not-a-route-base" };
  const suggestion = canonicalPlaceSuggestionFor(catalog.canonicalName, [...catalog.parentCountries]);
  if (!suggestion || suggestion.canonicalPlaceId !== id) return { id, name, reason: "missing-canonical-identity" };
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
