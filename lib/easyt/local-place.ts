export type JourneyLocalPlace = {
  id: string;
  name: string;
  nativeName?: string;
  address: string;
  category: string;
  coordinates: [number, number];
  mapsUrl: string;
  distanceKm?: number;
  operational?: true;
  availability?: "available" | "check";
  provider?: "booking-demand" | "google-places" | "openstreetmap";
  providerProductId?: string;
  commercialProvider?: "booking-demand";
  commercialProviderProductId?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  price?: { total: number; currency: string };
  cancellation?: string;
  description?: string;
  image?: string;
};

export function hasBookingLiveInformation(place: Pick<JourneyLocalPlace, "provider" | "commercialProvider">) {
  return place.provider === "booking-demand" || place.commercialProvider === "booking-demand";
}

export type AccommodationInventoryStatus = "not-requested" | "loading" | "live" | "empty" | "unconfigured" | "unavailable";

export type JourneyLocalFinderInitialState = {
  corePlaces: JourneyLocalPlace[];
  commercialPlaces?: JourneyLocalPlace[];
  coreLoading?: boolean;
  coreUnavailable?: boolean;
  accommodationInventoryStatus?: AccommodationInventoryStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isJourneyLocalPlace(value: unknown): value is JourneyLocalPlace {
  if (!isRecord(value)) return false;
  const coordinates = value.coordinates;
  const price = value.price;
  const validPrice = price === undefined || (isRecord(price)
    && typeof price.total === "number" && Number.isFinite(price.total) && price.total >= 0
    && typeof price.currency === "string" && Boolean(price.currency.trim()));
  const validProvider = value.provider === undefined || value.provider === "booking-demand" || value.provider === "google-places" || value.provider === "openstreetmap";
  const validCommercialProvider = value.commercialProvider === undefined || value.commercialProvider === "booking-demand";
  const validAvailability = value.availability === undefined || value.availability === "available" || value.availability === "check";
  return typeof value.id === "string" && Boolean(value.id.trim())
    && typeof value.name === "string" && Boolean(value.name.trim())
    && (value.nativeName === undefined || typeof value.nativeName === "string")
    && typeof value.address === "string"
    && typeof value.category === "string"
    && typeof value.mapsUrl === "string" && Boolean(value.mapsUrl.trim())
    && Array.isArray(coordinates)
    && coordinates.length === 2
    && coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && Math.abs(coordinates[0]) <= 180
    && Math.abs(coordinates[1]) <= 90
    && (value.distanceKm === undefined || (typeof value.distanceKm === "number" && Number.isFinite(value.distanceKm) && value.distanceKm >= 0))
    && (value.operational === undefined || value.operational === true)
    && (value.providerProductId === undefined || typeof value.providerProductId === "string")
    && (value.commercialProviderProductId === undefined || (value.commercialProvider === "booking-demand" && typeof value.commercialProviderProductId === "string"))
    && (value.rating === undefined || (typeof value.rating === "number" && Number.isFinite(value.rating) && value.rating >= 0 && value.rating <= 5))
    && (value.reviewCount === undefined || (typeof value.reviewCount === "number" && Number.isFinite(value.reviewCount) && value.reviewCount >= 0))
    && (value.priceLevel === undefined || typeof value.priceLevel === "string")
    && (value.cancellation === undefined || typeof value.cancellation === "string")
    && (value.description === undefined || typeof value.description === "string")
    && (value.image === undefined || typeof value.image === "string")
    && validAvailability
    && validProvider
    && validCommercialProvider
    && validPrice;
}

export function localSearchPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.places)) {
    return { places: [] as JourneyLocalPlace[], searchStatus: "failed" as const, unavailable: true };
  }
  const places = value.places.filter(isJourneyLocalPlace);
  const searchStatus = value.searchStatus === "ready" || value.searchStatus === "empty" || value.searchStatus === "failed"
    ? value.searchStatus
    : places.length ? "ready" : value.unavailable === true ? "failed" : "empty";
  return {
    places,
    searchStatus,
    unavailable: searchStatus === "failed" || value.unavailable === true || places.length !== value.places.length,
  };
}

export function accommodationInventoryPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.properties)) {
    return { properties: [] as JourneyLocalPlace[], unavailable: true, configured: null as boolean | null };
  }
  const properties = value.properties.filter(isJourneyLocalPlace);
  return {
    properties,
    unavailable: value.unavailable === true || properties.length !== value.properties.length,
    configured: value.configured === true ? true : value.configured === false ? false : null,
  };
}
