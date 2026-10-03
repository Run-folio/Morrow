import type { EasyTTrip } from "./trip.ts";

/** Card copy for the shared JourneyPlannerMap destinationCards renderer. */
export function builderDestinationCards(trip: Pick<EasyTTrip, "stops" | "brief">) {
  const brief = trip.brief.structuredBrief;
  return trip.stops.map((stop, index) => {
    const destination = brief?.destinations.find((item) => item.id === stop.id);
    const unresolvedBase = Boolean(destination?.placeMentionId && brief?.placeIssues?.some((issue) =>
      issue.mentionId === destination.placeMentionId && issue.code === "region_requires_base" && issue.blocksRoute));
    const nights = stop.nights ?? 0;
    return {
      stopId: stop.id,
      name: stop.name,
      dayLabel: `Stop ${index + 1} · ${nights} ${nights === 1 ? "night" : "nights"}${unresolvedBase ? " · Base to confirm" : ""}`,
    };
  });
}
