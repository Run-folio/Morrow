import { normalizeEnrichedPlace, placeEnrichmentTypes, validPlaceEnrichmentQuery, type EnrichedPlace, type PlaceEnrichmentCategory } from "./place-enrichment.ts";

export type PlaceEnrichmentProvider = {
  nearby(input: { latitude: number; longitude: number; category: PlaceEnrichmentCategory }): Promise<EnrichedPlace[]>;
  details(providerPlaceId: string): Promise<EnrichedPlace | null>;
};

const base = "https://places.googleapis.com/v1";
const nearbyMask = "places.id,places.displayName,places.location,places.primaryTypeDisplayName,places.formattedAddress,places.googleMapsUri";
const detailsMask = "id,displayName,location,primaryTypeDisplayName,formattedAddress,googleMapsUri,rating,userRatingCount,priceLevel,currentOpeningHours,websiteUri,photos,attributions";

export function googlePlaceEnrichmentProvider(apiKey: string, request: typeof fetch = fetch): PlaceEnrichmentProvider {
  async function read(response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) throw new Error(`places_http_${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("places_malformed");
    return value as Record<string, unknown>;
  }
  return {
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
      if (!/^[a-zA-Z0-9_-]{1,180}$/.test(providerPlaceId)) throw new Error("places_invalid_id");
      const response = await request(`${base}/places/${encodeURIComponent(providerPlaceId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": detailsMask },
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      return normalizeEnrichedPlace(await read(response));
    },
  };
}
