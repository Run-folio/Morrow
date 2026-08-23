import type { EasyTTrip, TripRecommendation } from "./trip.ts";

export type MapWorkspaceMode = "plan" | "stay" | "eat" | "see";

type QueryReader = { get(name: string): string | null };
type WorkspaceTrip = Pick<EasyTTrip, "id" | "stops" | "planItems">;

const mapModes = new Set<MapWorkspaceMode>(["plan", "stay", "eat", "see"]);

function orderedStops(trip: Pick<WorkspaceTrip, "stops">) {
  return [...trip.stops].sort((left, right) => left.order - right.order);
}

function orderedDays(trip: Pick<WorkspaceTrip, "planItems">) {
  return [...trip.planItems].sort((left, right) => left.dayNumber - right.dayNumber);
}

export function mapWorkspaceHref(tripId: string, stopId?: string | null, mode: MapWorkspaceMode = "plan") {
  const query = new URLSearchParams();
  if (stopId) query.set("stop", stopId);
  if (mode !== "plan") query.set("mode", mode);
  const suffix = query.toString();
  return `/journey/${encodeURIComponent(tripId)}/map${suffix ? `?${suffix}` : ""}`;
}

export function itineraryWorkspaceHref(tripId: string, dayNumber?: number | null) {
  const base = `/journey/${encodeURIComponent(tripId)}/itinerary`;
  return dayNumber ? `${base}?day=${dayNumber}` : base;
}

export function parseMapWorkspaceTarget(trip: WorkspaceTrip, query: QueryReader) {
  const stops = orderedStops(trip);
  const requestedStop = query.get("stop");
  const stopId = requestedStop && stops.some((stop) => stop.id === requestedStop)
    ? requestedStop
    : stops[0]?.id ?? null;
  const requestedMode = query.get("mode");
  const mode = requestedMode && mapModes.has(requestedMode as MapWorkspaceMode)
    ? requestedMode as MapWorkspaceMode
    : "plan";
  return { stopId, mode };
}

export function parseItineraryWorkspaceTarget(trip: Pick<WorkspaceTrip, "planItems">, query: QueryReader) {
  const days = orderedDays(trip);
  const rawDay = query.get("day") ?? "";
  const requested = /^\d+$/.test(rawDay) ? Number.parseInt(rawDay, 10) : Number.NaN;
  const dayNumber = Number.isInteger(requested) && days.some((day) => day.dayNumber === requested)
    ? requested
    : days[0]?.dayNumber ?? null;
  return { dayNumber };
}

export function firstItineraryDayForStop(trip: Pick<WorkspaceTrip, "planItems">, stopId: string) {
  return orderedDays(trip).find((day) => day.stopId === stopId)?.dayNumber ?? null;
}

export function itineraryDayForRecommendation(
  trip: Pick<WorkspaceTrip, "planItems">,
  recommendation: Pick<TripRecommendation, "affectedDays">,
) {
  const canonicalDays = new Set(trip.planItems.map((day) => day.dayNumber));
  return [...recommendation.affectedDays].sort((left, right) => left - right)
    .find((dayNumber) => canonicalDays.has(dayNumber)) ?? null;
}

export type TripWorkspaceView = "overview" | "itinerary" | "map" | "prep";

export function workspaceVisitKey(href: string) {
  return href.split(/[?#]/, 1)[0];
}

export function workspaceViewFromPathname(pathname: string, tripId: string): TripWorkspaceView {
  const decodedPathname = decodeURIComponent(workspaceVisitKey(pathname));
  const remainder = decodedPathname.slice(`/journey/${tripId}`.length);
  if (remainder.startsWith("/itinerary")) return "itinerary";
  if (remainder.startsWith("/map")) return "map";
  if (remainder.startsWith("/prep")) return "prep";
  return "overview";
}
