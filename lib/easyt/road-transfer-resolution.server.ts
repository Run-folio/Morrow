import "server-only";

import { OpenRouteServiceRoadRoutingProvider, RoadRoutingError, type RoadRoutingProvider } from "./road-routing.server.ts";
import { resolveCanonicalRoadFallbacks as resolveFallbacks } from "./road-transfer-resolution.ts";
import type { EasyTTrip, TripLeg } from "./trip.ts";

export type { RoadFallbackResolution, RoadFallbackSkipReason } from "./road-transfer-resolution.ts";

function configuredProvider(provider?: RoadRoutingProvider) {
  if (provider) return provider;
  try {
    return new OpenRouteServiceRoadRoutingProvider();
  } catch (error) {
    if (error instanceof RoadRoutingError && error.category === "configuration") return null;
    throw error;
  }
}

export async function resolveCanonicalRoadFallbacks(
  legs: readonly TripLeg[],
  options: { provider?: RoadRoutingProvider; maxLegs?: number } = {},
): Promise<TripLeg[]> {
  const provider = configuredProvider(options.provider);
  if (!provider) return [...legs];
  return resolveFallbacks(legs, { ...options, provider });
}

export async function resolveTripRoadFallbacks(
  trip: EasyTTrip,
  options: { provider?: RoadRoutingProvider } = {},
): Promise<EasyTTrip> {
  const legs = await resolveCanonicalRoadFallbacks(trip.legs, options);
  return legs.some((leg, index) => leg !== trip.legs[index]) ? { ...trip, legs } : trip;
}
