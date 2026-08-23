import { assessRouteIntelligence, estimateLegForConstraints, routeIntelligenceForPersistence, type RoutePlanningConstraints } from "./planner.ts";
import { cascadeTripSchedule } from "./cascade.ts";
import { routeConstraintsFromStructuredTripBrief, routeScoringPreferencesFromStructuredBrief } from "./structured-trip-brief.ts";
import type { EasyTTrip, PlanItem, TripLeg, TripStop } from "./trip.ts";

export type DayOrderReplan =
  | { state: "recalculated"; trip: EasyTTrip; stopIds: string[] }
  | { state: "needs-route-edit"; trip: EasyTTrip; returnedStopId: string };

const totalDaysFor = (trip: EasyTTrip) => Math.max(1, Math.round(
  (+new Date(`${trip.endDate}T00:00:00`) - +new Date(`${trip.startDate}T00:00:00`)) / 86400000,
) + 1);

const routeLegsFor = (trip: EasyTTrip, stops: TripStop[], constraints: RoutePlanningConstraints): TripLeg[] => stops.slice(1).map((stop, index) => {
  const from = stops[index];
  const estimate = estimateLegForConstraints(
    { name: from.name, country: from.country, coordinates: from.longitude !== null && from.latitude !== null ? [from.longitude, from.latitude] : undefined },
    { id: stop.id, name: stop.name, country: stop.country, coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined },
    constraints,
  );
  return {
    id: `${trip.id}-leg-${index + 1}`,
    fromStopId: from.id,
    toStopId: stop.id,
    mode: estimate.mode,
    distanceKm: estimate.distanceKm,
    durationMinutes: estimate.durationMinutes,
    provider: estimate.note,
    routeMetadata: { planningEstimate: true, label: estimate.label, routingConfidence: estimate.confidence, transferImpact: estimate.transferImpact, planningConfidence: estimate.planningConfidence },
  };
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
  const structuredConstraints: RoutePlanningConstraints = trip.brief.structuredBrief ? routeConstraintsFromStructuredTripBrief(trip.brief.structuredBrief) : {};
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
  const routeAssessment = assessRouteIntelligence({
    origin: { name: trip.brief.origin, coordinates: trip.brief.originCoordinates },
    stops: stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      country: stop.country,
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
    },
    allocations: Object.fromEntries(stops.map((stop) => [stop.id, Math.max(1, (stop.nights ?? 0) + 1)])),
  });
  const replanned = cascadeTripSchedule({ ...trip, stops, legs: routeLegsFor(trip, stops, routeConstraints), brief: { ...trip.brief, routeAssessment: routeIntelligenceForPersistence(routeAssessment) } }).trip;
  return {
    state: "recalculated",
    stopIds: fullOrder,
    trip: replanned,
  };
}
