import { normalizeEnrichedPlace, normalizeEnrichedReview, placeEnrichmentTypes, validPlaceEnrichmentQuery, type EnrichedPlace, type EnrichedReview, type PlaceEnrichmentCategory } from "./place-enrichment.ts";
import { exactGooglePhotoResource, safeGooglePhotoAttributions, safeGooglePhotoSourceUrl, type GooglePlacePhotoAttribution } from "./google-place-photo.ts";

export type SelectedGooglePhoto = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  sourceUrl: string;
  attributions: GooglePlacePhotoAttribution[];
};

export type PlaceEnrichmentProvider = {
  nearby(input: { latitude: number; longitude: number; category: PlaceEnrichmentCategory }): Promise<EnrichedPlace[]>;
  details(providerPlaceId: string): Promise<EnrichedPlace | null>;
  reviews(providerPlaceId: string): Promise<EnrichedReview[]>;
  photo(providerPlaceId: string): Promise<SelectedGooglePhoto | null>;
  refreshPlaceId(providerPlaceId: string): Promise<string>;
};

const base = "https://places.googleapis.com/v1";
const nearbyMask = "places.id,places.displayName,places.location,places.primaryTypeDisplayName,places.formattedAddress,places.googleMapsUri";
const detailsMask = "id,displayName,location,primaryTypeDisplayName,formattedAddress,googleMapsUri,rating,userRatingCount,priceLevel,currentOpeningHours,websiteUri,attributions";
const reviewMask = "id,reviews";
const photoMask = "id,photos";
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,180}$/.test(id);

export function googlePlaceEnrichmentProvider(apiKey: string, request: typeof fetch = fetch): PlaceEnrichmentProvider {
  async function read(response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) throw new Error(`places_http_${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("places_malformed");
    return value as Record<string, unknown>;
  }
  return {
    async refreshPlaceId(providerPlaceId) {
      if (!validId(providerPlaceId)) throw new Error("INVALID_REQUEST");
      const response = await request(`${base}/places/${encodeURIComponent(providerPlaceId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id" },
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      const data = await read(response);
      if (typeof data.id !== "string" || !validId(data.id)) throw new Error("NOT_FOUND");
      return data.id;
    },
    async nearby(input) {
      if (!validPlaceEnrichmentQuery(input)) throw new Error("places_invalid_query");
      const response = await request(`${base}/places:searchNearby`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": nearbyMask },
        body: JSON.stringify({
          includedTypes: placeEnrichmentTypes(input.category), maxResultCount: 10,
          locationRestriction: { circle: { center: { latitude: input.latitude, longitude: input.longitude }, radius: 5000 } },
        }),
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      const data = await read(response);
      if (data.places === undefined) return [];
      if (!Array.isArray(data.places)) throw new Error("places_malformed");
      return data.places.map(normalizeEnrichedPlace).filter((item): item is EnrichedPlace => Boolean(item));
    },
    async details(providerPlaceId) {
      if (!validId(providerPlaceId)) throw new Error("places_invalid_id");
      const response = await request(`${base}/places/${encodeURIComponent(providerPlaceId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": detailsMask },
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      return normalizeEnrichedPlace(await read(response));
    },
    async reviews(providerPlaceId) {
      if (!validId(providerPlaceId)) throw new Error("places_invalid_id");
      const response = await request(`${base}/places/${encodeURIComponent(providerPlaceId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": reviewMask },
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      const data = await read(response);
      if (data.id !== providerPlaceId || !Array.isArray(data.reviews)) return [];
      return data.reviews.slice(0, 3).map(normalizeEnrichedReview).filter((review): review is EnrichedReview => Boolean(review));
    },
    async photo(providerPlaceId) {
      if (!validId(providerPlaceId)) throw new Error("places_invalid_id");
      const metadataResponse = await request(`${base}/places/${encodeURIComponent(providerPlaceId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": photoMask },
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      const data = await read(metadataResponse);
      if (data.id !== providerPlaceId || !Array.isArray(data.photos)) return null;
      const photo = data.photos[0];
      if (!photo || typeof photo !== "object") return null;
      const source = photo as { name?: unknown; googleMapsUri?: unknown; authorAttributions?: unknown };
      const resource = exactGooglePhotoResource(providerPlaceId, source.name);
      const sourceUrl = safeGooglePhotoSourceUrl(source.googleMapsUri);
      if (!resource || !sourceUrl) return null;
      const mediaResponse = await request(`${base}/${resource}/media?maxWidthPx=960&maxHeightPx=640`, {
        headers: { "X-Goog-Api-Key": apiKey }, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(5000),
      });
      const contentType = mediaResponse.headers.get("content-type") ?? "";
      if (!mediaResponse.ok || !["image/jpeg", "image/png", "image/webp"].includes(contentType) || !mediaResponse.body) return null;
      return { body: mediaResponse.body, contentType, sourceUrl, attributions: safeGooglePhotoAttributions(source.authorAttributions) };
    },
  };
}
