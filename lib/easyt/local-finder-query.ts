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
  address?: string;
  category?: string;
  mapsUrl?: string;
  nativeName?: string;
  image?: string;
  rating?: number;
  reviewCount?: number;
  provider?: string;
  providerProductId?: string;
  commercialProvider?: string;
  commercialProviderProductId?: string;
};

const normalizedPlaceName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * Keeps the earlier canonical mapped identity while attaching later evidence
 * to an exact ID or exact normalized name within roughly one city block.
 * Similar names or distinct provider products remain separate.
 */
export function mergeLocalFinderPlaces<Place extends LocalFinderPlaceIdentity>(
  ...groups: readonly (readonly Place[])[]
) {
  const merged: Place[] = [];
  for (const place of groups.flat()) {
    const duplicateIndex = merged.findIndex((candidate) => candidate.id === place.id || (
      normalizedPlaceName(candidate.name) === normalizedPlaceName(place.name)
      && Math.abs(candidate.coordinates[0] - place.coordinates[0]) <= 0.001
      && Math.abs(candidate.coordinates[1] - place.coordinates[1]) <= 0.001
    ));
    if (duplicateIndex < 0) {
      merged.push(place);
      continue;
    }
    const canonical = merged[duplicateIndex]!;
    const incomingCommercialProvider = place.provider === "booking-demand" ? place.provider : place.commercialProvider;
    const incomingCommercialProductId = place.provider === "booking-demand" ? place.providerProductId : place.commercialProviderProductId;
    merged[duplicateIndex] = {
      ...canonical,
      ...place,
      id: canonical.id,
      name: canonical.name,
      coordinates: canonical.coordinates,
      address: canonical.address || place.address,
      category: canonical.category || place.category,
      mapsUrl: canonical.mapsUrl || place.mapsUrl,
      nativeName: canonical.nativeName ?? place.nativeName,
      image: canonical.image ?? place.image,
      provider: canonical.provider ?? place.provider,
      providerProductId: canonical.providerProductId ?? (canonical.provider ? undefined : place.providerProductId),
      commercialProvider: incomingCommercialProvider ?? canonical.commercialProvider,
      commercialProviderProductId: incomingCommercialProductId ?? canonical.commercialProviderProductId,
      // Core ratings remain attached to their mapped source. A commercial-only
      // property still keeps its Booking.com rating on its own canonical card.
      rating: canonical.rating ?? place.rating,
      reviewCount: canonical.rating !== undefined
        ? canonical.reviewCount
        : place.rating !== undefined
          ? place.reviewCount
          : canonical.reviewCount ?? place.reviewCount,
    } as Place;
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
