import "server-only";

import {
  OpenRouteServiceRoadRoutingProvider,
  RoadRoutingError,
  type RoadRoutingProvider,
} from "./road-routing.server.ts";
import {
  resolveCanonicalTransferJourneys as resolveJourneys,
  resolveTripTransferJourneys as resolveTrip,
} from "./multimodal-transfer-resolution.ts";
import type { EasyTTrip, TripLeg } from "./trip.ts";

function configuredRoadProvider(provider?: RoadRoutingProvider) {
  if (provider) return provider;
  try {
    return new OpenRouteServiceRoadRoutingProvider();
  } catch (error) {
    if (error instanceof RoadRoutingError && error.category === "configuration") return undefined;
    throw error;
  }
}

export async function resolveCanonicalTransferJourneys(
  legs: readonly TripLeg[],
  options: { provider?: RoadRoutingProvider; maxLegs?: number } = {},
) {
  return resolveJourneys(legs, { ...options, provider: configuredRoadProvider(options.provider) });
}

export async function resolveTripTransferJourneys(
  trip: EasyTTrip,
  options: { provider?: RoadRoutingProvider } = {},
) {
  return resolveTrip(trip, { ...options, provider: configuredRoadProvider(options.provider) });
}

export {
  canonicalTransferSegments,
  transferJourneyModeLabel,
  transferJourneySegmentSummary,
} from "./transfer-journey.ts";
