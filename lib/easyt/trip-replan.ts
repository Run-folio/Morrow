import { assessRouteIntelligence, routeIntelligenceForPersistence, type RoutePlanningConstraints } from "./planner.ts";
import { cascadeTripSchedule } from "./cascade.ts";
import { routeConstraintsFromStructuredTripBrief, routeScoringPreferencesFromStructuredBrief } from "./structured-trip-brief.ts";
import type { EasyTTrip, PlanItem, TripStop } from "./trip.ts";
import { reconcileCuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import { buildCanonicalTripLegs } from "./trip-legs.ts";
import { reconcileAuthoredDayState } from "./trip-authored-day-state.ts";
import { originPlaceFromBrief, plannerEndpointForJourneyEnd } from "./journey-endpoints.ts";

export type DayOrderReplan =
  | { state: "recalculated"; trip: EasyTTrip; stopIds: string[] }
  | { state: "needs-route-edit"; trip: EasyTTrip; returnedStopId: string };

const totalDaysFor = (trip: EasyTTrip) => Math.max(1, Math.round(
  (+new Date(`${trip.endDate}T00:00:00`) - +new Date(`${trip.startDate}T00:00:00`)) / 86400000,
) + 1);

const routeLegsFor = (trip: EasyTTrip, stops: TripStop[], constraints: RoutePlanningConstraints) => buildCanonicalTripLegs({
  tripId: trip.id,
  origin: {
    name: trip.brief.origin,
    country: trip.brief.originCountry,
    canonicalPlaceId: trip.brief.originCanonicalPlaceId,
    providerId: trip.brief.originProviderId,
    coordinates: trip.brief.originCoordinates ?? null,
  },
  journeyEnd: trip.brief.journeyEnd,
  stops,
  constraints,
  curatedRoute: trip.brief.curatedRoute,
});

/**
 * A day move can represent a clean route reorder, or an implicit return to a
 * base. Recalculate the former; leave the latter intact and make it visible
 * for the traveller to resolve consciously in the route builder.
 */
export function replanTripAfterDayOrder(trip: EasyTTrip, orderedPlanItems: PlanItem[]): DayOrderReplan {
  const stopIds = orderedPlanItems.reduce<string[]>((sequence, item) => {
    if (trip.stops.some((stop) => stop.id === item.stopId) && sequence.at(-1) !== item.stopId) sequence.push(item.stopId);
    return sequence;
  }, []);
  const returnedStopId = stopIds.find((stopId, index) => stopIds.indexOf(stopId) !== index);
  if (returnedStopId) return { state: "needs-route-edit", trip, returnedStopId };

  // A day list can temporarily omit an unplanned base. Preserve it after the
  // visible route rather than dropping a traveller's chosen destination.
  const fullOrder = [...stopIds, ...trip.stops.map((stop) => stop.id).filter((id) => !stopIds.includes(id))];
  const stopById = new Map(trip.stops.map((stop) => [stop.id, stop]));
  const stops = fullOrder.map((id, order) => ({ ...stopById.get(id)!, order }));
  const structuredConstraints: RoutePlanningConstraints = trip.brief.structuredBrief ? routeConstraintsFromStructuredTripBrief(trip.brief.structuredBrief, trip.stops.map((stop) => stop.id)) : {};
  const structuredScoring = trip.brief.structuredBrief ? routeScoringPreferencesFromStructuredBrief(trip.brief.structuredBrief) : undefined;
  const intent = trip.brief.intent;
  const avoidDriving = Boolean(structuredConstraints.avoidDriving || intent?.hardConstraints.avoidDriving);
  const routeConstraints: RoutePlanningConstraints = {
    ...structuredConstraints,
    requiredStopIds: structuredConstraints.requiredStopIds?.length ? structuredConstraints.requiredStopIds : intent?.hardConstraints.mustSeeStopIds,
    fixedCommitments: intent?.hardConstraints.fixedCommitments.length
      ? intent.hardConstraints.fixedCommitments
      : structuredConstraints.fixedCommitments,
    avoidDriving,
    excludedTransportModes: avoidDriving ? ["road" as const] : structuredConstraints.excludedTransportModes,
    transportModes: structuredConstraints.transportModes?.length ? structuredConstraints.transportModes : intent?.preferences.transportModes,
    optionalStopIds: intent?.hardConstraints.optionalStopIds,
  };
  const brokenFixedEndpoint = routeConstraints.fixedStartStopId && fullOrder[0] !== routeConstraints.fixedStartStopId
    ? routeConstraints.fixedStartStopId
    : routeConstraints.fixedEndStopId && fullOrder.at(-1) !== routeConstraints.fixedEndStopId
      ? routeConstraints.fixedEndStopId
      : null;
  if (brokenFixedEndpoint) return { state: "needs-route-edit", trip, returnedStopId: brokenFixedEndpoint };
  const routeAssessment = assessRouteIntelligence({
    origin: { name: trip.brief.origin, coordinates: trip.brief.originCoordinates },
    end: plannerEndpointForJourneyEnd(trip.id, originPlaceFromBrief(trip.brief), trip.brief.journeyEnd),
    stops: stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: stop.canonicalPlaceId,
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] as [number, number] : undefined,
    })),
    picks: trip.brief.selectedPlaces,
    availableDays: totalDaysFor(trip),
    constraints: routeConstraints,
    scoringPreferences: {
      pace: structuredScoring?.pace ?? intent?.preferences.pace,
      preferredModes: structuredScoring?.preferredModes.length
        ? structuredScoring.preferredModes
        : intent?.preferences.transportModes.map((mode) => mode === "drive" ? "road" as const : mode),
      avoidFlights: structuredScoring?.avoidFlights,
      interests: intent?.preferences.interests ?? structuredScoring?.interests,
    },
    allocations: Object.fromEntries(stops.map((stop) => [stop.id, Math.max(1, (stop.nights ?? 0) + 1)])),
  });
  const replannedInput = { ...trip, stops, legs: routeLegsFor(trip, stops, routeConstraints), brief: { ...trip.brief, curatedRoute: reconcileCuratedRouteKnowledge(trip.brief.curatedRoute, fullOrder), routeAssessment: routeIntelligenceForPersistence(routeAssessment) } };
  const replanned = reconcileAuthoredDayState(trip, cascadeTripSchedule(replannedInput).trip);
  return {
    state: "recalculated",
    stopIds: fullOrder,
    trip: replanned,
  };
}
