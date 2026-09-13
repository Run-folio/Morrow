export type LocalPlaceResult = {
  id: string;
  name: string;
  address: string;
  category: string;
  coordinates: [number, number];
  distanceKm: number;
  provider: "google-places" | "openstreetmap";
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  image?: string;
};

function normalized(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function malformedName(name: string) {
  const value = name.trim();
  return value.length < 2
    || value.length > 120
    || !/[\p{L}\p{N}]/u.test(value)
    || /^(?:unnamed|unknown|restaurant|cafe|café|hotel|lodging)$/iu.test(value);
}

function identityStrength(place: LocalPlaceResult) {
  return (place.provider === "google-places" ? 20 : 0)
    + (place.id.trim() ? 8 : 0)
    + (place.address.trim() ? 3 : 0)
    + (place.category.trim() ? 2 : 0)
    + (place.rating !== undefined ? 2 : 0)
    + (place.reviewCount !== undefined ? 2 : 0)
    + (place.priceLevel !== undefined ? 1 : 0)
    + (place.image !== undefined ? 1 : 0);
}

function duplicatePlace(left: LocalPlaceResult, right: LocalPlaceResult) {
  if (left.provider === right.provider && left.id === right.id) return true;
  if (normalized(left.name) !== normalized(right.name)) return false;
  const [leftLongitude, leftLatitude] = left.coordinates;
  const [rightLongitude, rightLatitude] = right.coordinates;
  // At restaurant-search scale, this is deliberately conservative: exact
  // normalized names still need coordinates within roughly one city block.
  return Math.abs(leftLatitude - rightLatitude) <= 0.001
    && Math.abs(leftLongitude - rightLongitude) <= 0.001;
}

/**
 * Keeps provider identity intact, removes malformed records, and orders a
 * trustworthy canonical duplicate ahead of a weaker fallback. Similar names
 * alone never collapse two businesses.
 */
export function qualityControlledLocalPlaces<Result extends LocalPlaceResult>(places: readonly Result[]) {
  const ranked = places
    .map((place, index) => ({ place, index, score: identityStrength(place) }))
    .filter(({ place }) => !malformedName(place.name))
    .sort((left, right) => right.score - left.score || left.place.distanceKm - right.place.distanceKm || left.index - right.index);
  const accepted: Result[] = [];
  for (const { place } of ranked) {
    if (!accepted.some((candidate) => duplicatePlace(candidate, place))) accepted.push(place);
  }
  return accepted;
}
