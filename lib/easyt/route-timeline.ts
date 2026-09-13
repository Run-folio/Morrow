import type { EasyTTrip } from "./trip.ts";
import { tripOriginEndpointId } from "./trip-legs.ts";

export type RouteTimelineStop = {
  id: string;
  name: string;
  dayLabel: string;
  image?: string;
  active: boolean;
  kind: "origin" | "stop";
};

type RouteTimelineTrip = Pick<EasyTTrip, "id" | "brief" | "stops" | "planItems">;

export function routeTimelineSelectionId(tripId: string, scopeId: "all" | string) {
  return scopeId === "all" ? tripOriginEndpointId(tripId) : scopeId;
}

export function routeTimelineScopeId(tripId: string, selectionId: string) {
  return selectionId === tripOriginEndpointId(tripId) ? "all" : selectionId;
}

export function routeTimelineStopsForTrip(
  trip: RouteTimelineTrip,
  options: {
    scopeId: "all" | string;
    imageByStopId?: Readonly<Record<string, string | undefined>>;
  },
): RouteTimelineStop[] {
  const activeId = routeTimelineSelectionId(trip.id, options.scopeId);
  const originId = tripOriginEndpointId(trip.id);
  const origin = trip.brief.origin.trim() || "your starting point";

  return [{
    id: originId,
    name: "All trip",
    dayLabel: `From ${origin}`,
    active: activeId === originId,
    kind: "origin",
  }, ...[...trip.stops]
    .sort((left, right) => left.order - right.order)
    .map((stop) => {
      const days = trip.planItems
        .filter((item) => item.stopId === stop.id)
        .sort((left, right) => left.dayNumber - right.dayNumber);
      const first = days[0];
      const last = days.at(-1);
      const dayLabel = first
        ? first.dayNumber === last?.dayNumber
          ? `Day ${first.dayNumber}`
          : `Days ${first.dayNumber}–${last?.dayNumber}`
        : stop.nights === null
          ? "Dates to confirm"
          : `${stop.nights} ${stop.nights === 1 ? "night" : "nights"}`;
      const image = options.imageByStopId?.[stop.id] ?? days.find((item) => item.image)?.image ?? undefined;
      return {
        id: stop.id,
        name: stop.name,
        dayLabel,
        ...(image ? { image } : {}),
        active: activeId === stop.id,
        kind: "stop" as const,
      };
    })];
}
