import { directRoadPlausibilityConflict } from "./road-transfer-resolution.ts";
import type { EasyTTrip, TripLeg } from "./trip.ts";

export const LEGACY_ROAD_COMPATIBILITY_SOURCE = "legacy-road-compatibility";

function isUnverifiedLegacyRoad(leg: TripLeg) {
  const source = leg.routeMetadata.source;
  return leg.mode === "road"
    && leg.durationMinutes !== null
    && source === undefined
    && leg.routeMetadata.decisionOption === undefined
    && leg.routeMetadata.userConfirmed !== true
    && leg.routeMetadata.confirmed !== true;
}

/**
 * Projects persisted transport through current definitive plausibility guards.
 * It is pure and idempotent: storage changes only on a later explicit save.
 */
export function reconcileLegacyTransportLeg(leg: TripLeg): TripLeg {
  if (!isUnverifiedLegacyRoad(leg)) return leg;
  const conflict = directRoadPlausibilityConflict(leg);
  if (!conflict) return leg;
  return {
    ...leg,
    mode: "unknown",
    durationMinutes: null,
    headlineMinutes: null,
    doorToDoorMinutes: null,
    usableDayLoss: null,
    provider: "The stored direct-road estimate conflicts with current transport plausibility rules; confirm the complete connection.",
    provenance: "unknown",
    confidence: "unknown",
    scheduleNeedsChecking: true,
    warnings: ["Transfer mode and duration need confirmation."],
    routedDistanceKm: null,
    routeGeometry: undefined,
    segments: undefined,
    routeMetadata: {
      ...leg.routeMetadata,
      source: LEGACY_ROAD_COMPATIBILITY_SOURCE,
      planningEstimate: false,
      roadFallbackEligible: false,
      legacyTransportCompatibility: { version: 1, outcome: "downgraded", conflict },
    },
  };
}

export function reconcileLegacyTransportTrip(trip: EasyTTrip): EasyTTrip {
  const legs = trip.legs.map(reconcileLegacyTransportLeg);
  return legs.some((leg, index) => leg !== trip.legs[index]) ? { ...trip, legs } : trip;
}
