import { nativeGooglePoiSelection } from "./map-workspace-selection.ts";
import type { PlaceEnrichmentCategory } from "./place-enrichment.ts";

export type GoogleDiscoveryScope = {
  stopId: string;
  dayId: string | null;
  category: PlaceEnrichmentCategory;
};

/** Occurrence ID, never destination display text, keys in-memory provider results. */
export function googleDiscoveryScopeKey(stopId: string, category: PlaceEnrichmentCategory): string {
  return `${stopId}:${category}`;
}

export function shouldApplyGoogleDiscoveryResult(responseScope: string, currentScope: string): boolean {
  return responseScope === currentScope;
}

export function googlePlaceSelectionForScope(placeId: string, scope: GoogleDiscoveryScope) {
  return nativeGooglePoiSelection(placeId, scope.stopId, scope.dayId);
}
