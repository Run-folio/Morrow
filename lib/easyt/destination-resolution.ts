const normalise = (value: string) => value.toLocaleLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** A global name match is not enough to become a routing identity. */
export function needsDestinationConfirmation(countries: Iterable<string>, hasNearbyContext = false) {
  return new Set([...countries].map(normalise).filter(Boolean)).size > 1 && !hasNearbyContext;
}

export function isWithinDestinationRadius(
  destination: [number, number],
  candidate: [number, number],
  radiusKm = 12,
) {
  const [destinationLon, destinationLat] = destination;
  const [candidateLon, candidateLat] = candidate;
  const radians = Math.PI / 180;
  const deltaLat = (candidateLat - destinationLat) * radians;
  const deltaLon = (candidateLon - destinationLon) * radians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(destinationLat * radians) * Math.cos(candidateLat * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area)) <= radiusKm;
}
