/** Ephemeral provider data for the Map discovery panel; never a trip model. */
export type PlaceEnrichmentCategory = "see" | "eat" | "stay" | "practical";
export type EnrichedPlace = {
  providerPlaceId: string;
  name: string;
  coordinates: [number, number];
  category?: string;
  address?: string;
  mapsUrl: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  hours?: string[];
  website?: string;
  hasPhoto?: true;
  attributions?: Array<{ name: string; url?: string }>;
};

const types: Record<PlaceEnrichmentCategory, string[]> = {
  see: ["tourist_attraction", "museum", "art_gallery", "park"],
  eat: ["restaurant", "cafe"],
  stay: ["lodging", "hotel"],
  practical: ["train_station", "transit_station", "airport"],
};

export function placeEnrichmentTypes(category: PlaceEnrichmentCategory): string[] { return types[category]; }
export function placeEnrichmentEnabled(input: { flag?: string; key?: string }): boolean {
  return input.flag === "enabled" && Boolean(input.key?.trim());
}
export function priceLevelLabel(level: string | undefined): string | undefined {
  const labels: Record<string, string> = {
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "Inexpensive",
    PRICE_LEVEL_MODERATE: "Moderate",
    PRICE_LEVEL_EXPENSIVE: "Expensive",
    PRICE_LEVEL_VERY_EXPENSIVE: "Very expensive",
  };
  return level ? labels[level] : undefined;
}
export function validPlaceEnrichmentQuery(input: { latitude: number; longitude: number; category: string }): input is { latitude: number; longitude: number; category: PlaceEnrichmentCategory } {
  return Object.hasOwn(types, input.category)
    && Number.isFinite(input.latitude) && Math.abs(input.latitude) <= 90
    && Number.isFinite(input.longitude) && Math.abs(input.longitude) <= 180;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown, maximum = 240): string | undefined { return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined; }
function safeUrl(value: unknown, hosts?: readonly string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (hosts && !hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))) return undefined;
    return url.toString();
  } catch { return undefined; }
}

export function isEnrichedPlace(value: unknown): value is EnrichedPlace {
  const place = record(value);
  const coordinates = place.coordinates;
  return typeof place.providerPlaceId === "string" && /^[a-zA-Z0-9_-]{1,180}$/.test(place.providerPlaceId)
    && typeof place.name === "string" && Boolean(place.name.trim())
    && Array.isArray(coordinates) && coordinates.length === 2
    && coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90
    && Boolean(safeUrl(place.mapsUrl, ["google.com", "google.co.jp"]));
}

export function normalizeEnrichedPlace(value: unknown): EnrichedPlace | null {
  const place = record(value);
  const providerPlaceId = text(place.id, 180);
  const name = text(record(place.displayName).text, 160);
  const latitude = record(place.location).latitude;
  const longitude = record(place.location).longitude;
  if (!providerPlaceId || !/^[a-zA-Z0-9_-]+$/.test(providerPlaceId) || !name
    || typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  const mapsUrl = safeUrl(place.googleMapsUri, ["google.com", "google.co.jp"])
    ?? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: name, query_place_id: providerPlaceId })}`;
  const result: EnrichedPlace = { providerPlaceId, name, coordinates: [longitude, latitude], mapsUrl };
  const category = text(record(place.primaryTypeDisplayName).text, 80);
  const address = text(place.formattedAddress);
  if (category) result.category = category;
  if (address) result.address = address;
  if (typeof place.rating === "number" && Number.isFinite(place.rating) && place.rating >= 0 && place.rating <= 5) result.rating = place.rating;
  if (typeof place.userRatingCount === "number" && Number.isInteger(place.userRatingCount) && place.userRatingCount >= 0) result.ratingCount = place.userRatingCount;
  const priceLevel = text(place.priceLevel, 40);
  if (priceLevel && priceLevel !== "PRICE_LEVEL_UNSPECIFIED") result.priceLevel = priceLevel;
  const opening = record(place.currentOpeningHours);
  if (typeof opening.openNow === "boolean") result.openNow = opening.openNow;
  if (Array.isArray(opening.weekdayDescriptions)) {
    const hours = opening.weekdayDescriptions.slice(0, 7).map((item) => text(item, 100)).filter((item): item is string => Boolean(item));
    if (hours.length) result.hours = hours;
  }
  const website = safeUrl(place.websiteUri);
  if (website) result.website = website;
  if (Array.isArray(place.photos) && place.photos.length > 0) result.hasPhoto = true;
  if (Array.isArray(place.attributions)) {
    const attributions = place.attributions.slice(0, 5).map((item) => {
      const source = record(item);
      const name = text(source.provider, 100);
      const url = safeUrl(source.providerUri);
      return name ? { name, ...(url ? { url } : {}) } : null;
    }).filter((item): item is { name: string; url?: string } => Boolean(item));
    if (attributions.length) result.attributions = attributions;
  }
  return result;
}
