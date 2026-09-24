import type { DiscoveryPlace } from "./discovery-content.ts";

/** A preview target is always an evidenced place ID, never a nearby label. */
export function discoveryMapTarget(placeId: string, places: readonly Pick<DiscoveryPlace, "id" | "coordinates">[]) {
  const place = places.find(candidate => candidate.id === placeId);
  if (!place || !place.coordinates.every(Number.isFinite)) return null;
  return { id: place.id, coordinates: [place.coordinates[0], place.coordinates[1]] as [number, number] };
}

/** Choose a surviving card when a focused map control disappears. */
export function discoveryFailureFocusTarget(
  focusedPinId: string | null,
  highlightedPlaceId: string | null,
  places: readonly Pick<DiscoveryPlace, "id">[],
) {
  if (focusedPinId && places.some(place => place.id === focusedPinId)) return focusedPinId;
  if (highlightedPlaceId && places.some(place => place.id === highlightedPlaceId)) return highlightedPlaceId;
  return places[0]?.id ?? null;
}

/** Include an offscreen focused pin's card in the render before restoring focus. */
export function discoveryFailureFocusPlan(
  focusedPinId: string | null,
  highlightedPlaceId: string | null,
  places: readonly Pick<DiscoveryPlace, "id">[],
  visibleCount: number,
) {
  const placeId = discoveryFailureFocusTarget(focusedPinId, highlightedPlaceId, places);
  const index = places.findIndex(place => place.id === placeId);
  return { placeId, visibleCount: index < 0 ? visibleCount : Math.max(visibleCount, index + 1) };
}
