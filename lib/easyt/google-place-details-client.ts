import { isEnrichedPlace, type EnrichedPlace } from "./place-enrichment.ts";
import type { GooglePlaceReference } from "./trip.ts";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** One server Details path for native POI, list, marker and saved reference selection. */
export function createLatestGoogleDetailRequest(fetcher: FetchLike = fetch) {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    async select(placeId: string, onResult: (place: EnrichedPlace, refreshedReference?: GooglePlaceReference) => void, reference?: GooglePlaceReference, onUnavailable?: (reason: "invalid" | "not-found" | "provider-failure") => void): Promise<void> {
      controller?.abort();
      const activeGeneration = ++generation;
      controller = new AbortController();
      const query = new URLSearchParams({ mode: reference ? "resolve" : "details", id: placeId });
      if (reference?.lastResolvedAt) query.set("lastResolvedAt", reference.lastResolvedAt);
      try {
        const response = await fetcher(`/api/journey-place-enrichment?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data: unknown = await response.json();
        const payload = data && typeof data === "object" ? data as { place?: unknown; detail?: unknown; refreshedReference?: unknown; status?: unknown } : {};
        if (reference && payload.status === "unavailable") {
          const reason = (data as { reason?: unknown }).reason;
          if (generation === activeGeneration) onUnavailable?.(reason === "invalid" || reason === "not-found" ? reason : "provider-failure");
          return;
        }
        const place = reference ? payload.status === "resolved" ? payload.detail : undefined : payload.place;
        const refreshed = payload.refreshedReference;
        const safeReference = refreshed && typeof refreshed === "object"
          && (refreshed as GooglePlaceReference).provider === "google"
          && (refreshed as GooglePlaceReference).placeId === placeId
          && typeof (refreshed as GooglePlaceReference).lastResolvedAt === "string"
          ? { provider: "google" as const, placeId, lastResolvedAt: (refreshed as GooglePlaceReference).lastResolvedAt }
          : undefined;
        if (generation === activeGeneration && isEnrichedPlace(place) && place.providerPlaceId === placeId) onResult(place, safeReference);
      } catch {
        // The parent keeps the selected reference and renders a retry state.
      }
    },
    clear() { controller?.abort(); controller = null; generation++; },
  };
}
