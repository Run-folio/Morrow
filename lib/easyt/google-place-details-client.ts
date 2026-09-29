import { isEnrichedPlace, type EnrichedPlace } from "./place-enrichment.ts";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** One server Details path for native POI, list, marker and saved reference selection. */
export function createLatestGoogleDetailRequest(fetcher: FetchLike = fetch) {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    async select(placeId: string, onResult: (place: EnrichedPlace) => void): Promise<void> {
      controller?.abort();
      const activeGeneration = ++generation;
      controller = new AbortController();
      const query = new URLSearchParams({ mode: "details", id: placeId });
      try {
        const response = await fetcher(`/api/journey-place-enrichment?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data: unknown = await response.json();
        const place = data && typeof data === "object" ? (data as { place?: unknown }).place : undefined;
        if (generation === activeGeneration && isEnrichedPlace(place) && place.providerPlaceId === placeId) onResult(place);
      } catch {
        // The parent keeps the selected reference and renders a retry state.
      }
    },
    clear() { controller?.abort(); controller = null; generation++; },
  };
}
