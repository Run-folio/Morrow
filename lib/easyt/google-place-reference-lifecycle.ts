import type { EnrichedPlace } from "./place-enrichment.ts";
import type { GooglePlaceReference } from "./trip.ts";

export type GooglePlaceResolution =
  | { status: "resolved"; detail: EnrichedPlace; refreshedReference: GooglePlaceReference }
  | { status: "unavailable"; reason: "invalid" | "not-found" | "provider-failure"; reference: GooglePlaceReference };

export type GooglePlaceResolver = {
  refreshPlaceId(placeId: string): Promise<string>;
  details(placeId: string): Promise<EnrichedPlace | null>;
};

function refreshNeeded(reference: GooglePlaceReference, now: Date): boolean {
  const resolved = reference.lastResolvedAt ? new Date(reference.lastResolvedAt) : null;
  if (!resolved || !Number.isFinite(resolved.getTime())) return true;
  const threshold = new Date(now);
  threshold.setUTCMonth(threshold.getUTCMonth() - 12);
  return resolved < threshold;
}

function unavailableReason(error: unknown): "invalid" | "not-found" | "provider-failure" {
  const message = error instanceof Error ? error.message : "";
  if (/INVALID_REQUEST|places_http_400/.test(message)) return "invalid";
  if (/NOT_FOUND|places_http_404/.test(message)) return "not-found";
  return "provider-failure";
}

/** ID freshness is durable; all resolved Google facts remain transient. */
export async function resolveGooglePlaceReference(
  reference: GooglePlaceReference,
  provider: GooglePlaceResolver,
  now: Date = new Date(),
): Promise<GooglePlaceResolution> {
  if (reference.provider !== "google" || !/^[a-zA-Z0-9_-]{1,180}$/.test(reference.placeId)) {
    return { status: "unavailable", reason: "invalid", reference };
  }
  try {
    const refresh = refreshNeeded(reference, now);
    if (refresh) {
      const refreshedId = await provider.refreshPlaceId(reference.placeId);
      if (refreshedId !== reference.placeId) return { status: "unavailable", reason: "not-found", reference };
    }
    const detail = await provider.details(reference.placeId);
    if (!detail || detail.providerPlaceId !== reference.placeId) return { status: "unavailable", reason: "not-found", reference };
    return { status: "resolved", detail, refreshedReference: refresh
      ? { provider: "google", placeId: reference.placeId, lastResolvedAt: now.toISOString() }
      : reference };
  } catch (error) {
    return { status: "unavailable", reason: unavailableReason(error), reference };
  }
}
