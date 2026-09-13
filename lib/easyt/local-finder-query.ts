export type LocalFinderQueryContext = {
  kind: "restaurant" | "stay";
  city: string;
  country: string;
  canonicalPlaceId?: string;
  dayId: string;
  coordinates: [number, number];
  locale: string;
  staySearch?: {
    checkIn?: string;
    checkOut?: string;
    adults?: number;
    rooms?: number;
    currency?: string;
    bookerCountry?: string;
  };
};

export type LocalFinderBaseQueryContext = Omit<LocalFinderQueryContext, "staySearch">;

const coordinateKey = (coordinate: number) => Math.round(coordinate * 10_000) / 10_000;

/**
 * Base mapped-place identity excludes dates and traveller configuration because
 * those belong only to live commercial inventory. Stop/day identity remains in
 * the key so repeated visits to the same city never collapse across the trip.
 */
export function localFinderBaseQueryKey({
  kind,
  city,
  country,
  canonicalPlaceId,
  dayId,
  coordinates: [longitude, latitude],
  locale,
}: LocalFinderBaseQueryContext) {
  return [kind, city, country, canonicalPlaceId ?? "", dayId, coordinateKey(latitude), coordinateKey(longitude), locale].join("|");
}

type LocalFinderPlaceIdentity = {
  id: string;
  name: string;
  coordinates: [number, number];
};

const normalizedPlaceName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * Keeps the earlier (commercial when present) identity and removes only exact
 * IDs or exact normalized names within roughly one city block. Similar names
 * or distinct provider products remain separate.
 */
export function mergeLocalFinderPlaces<Place extends LocalFinderPlaceIdentity>(
  ...groups: readonly (readonly Place[])[]
) {
  const merged: Place[] = [];
  for (const place of groups.flat()) {
    const duplicate = merged.some((candidate) => candidate.id === place.id || (
      normalizedPlaceName(candidate.name) === normalizedPlaceName(place.name)
      && Math.abs(candidate.coordinates[0] - place.coordinates[0]) <= 0.001
      && Math.abs(candidate.coordinates[1] - place.coordinates[1]) <= 0.001
    ));
    if (!duplicate) merged.push(place);
  }
  return merged;
}

/**
 * Stable identity for the provider inputs that produce one local-finder result
 * set. Presentation state such as the selected result deliberately stays out.
 */
export function localFinderQueryKey({
  kind,
  city,
  country,
  canonicalPlaceId,
  dayId,
  coordinates: [longitude, latitude],
  locale,
  staySearch,
}: LocalFinderQueryContext) {
  return [
    kind,
    city,
    country,
    canonicalPlaceId ?? "",
    dayId,
    latitude,
    longitude,
    locale,
    staySearch?.checkIn ?? "",
    staySearch?.checkOut ?? "",
    staySearch?.adults ?? "",
    staySearch?.rooms ?? "",
    staySearch?.currency ?? "",
    staySearch?.bookerCountry ?? "",
  ].join("|");
}
