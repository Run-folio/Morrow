import { nativeGooglePoiSelection } from "./map-workspace-selection.ts";
import type { PlaceEnrichmentCategory } from "./place-enrichment.ts";

export type GoogleDiscoveryScope = {
  stopId: string;
  dayId: string | null;
  category: PlaceEnrichmentCategory;
};

/** Occurrence ID, never destination display text, keys in-memory provider results. */
export function googleDiscoveryScopeKey(stopId: string, category: PlaceEnrichmentCategory, coordinates?: readonly [number, number] | null): string {
  return `${stopId}:${category}${coordinates ? `@${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}` : ""}`;
}

/** Render a resolved detail only for the exact current selection, including before effects clear prior data. */
export function selectedGoogleDetailForPlace<T extends { providerPlaceId: string }>(placeId: string | null, detail: T | null): T | null {
  return placeId && detail?.providerPlaceId === placeId ? detail : null;
}

export function shouldApplyGoogleDiscoveryResult(responseScope: string, currentScope: string): boolean {
  return responseScope === currentScope;
}

export function googlePlaceSelectionForScope(placeId: string, scope: GoogleDiscoveryScope) {
  return nativeGooglePoiSelection(placeId, scope.stopId, scope.dayId);
}

export function googleSavedReferenceSelection(placeId: string, stopId: string, referenceId: string) {
  return { kind: "google" as const, placeId, stopId, dayId: null, referenceId };
}
