import type { DiscoveryPlace } from "./discovery-content.ts";

/** A preview target is always an evidenced place ID, never a nearby label. */
export function discoveryMapTarget(placeId: string, places: readonly Pick<DiscoveryPlace, "id" | "coordinates">[]) {
  const place = places.find(candidate => candidate.id === placeId);
  if (!place || !place.coordinates.every(Number.isFinite)) return null;
  return { id: place.id, coordinates: [place.coordinates[0], place.coordinates[1]] as [number, number] };
}
