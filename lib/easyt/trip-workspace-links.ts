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

export function tripWorkspaceHref(tripId: string) {
  return `/journey/${encodeURIComponent(tripId)}`;
}

/** Mark only the just-generated arrival; normal workspace links stay quiet. */
export function firstTripWorkspaceHref(tripId: string) {
  return `${tripWorkspaceHref(tripId)}?created=1`;
}

/** A guest explicitly opts into account promotion after seeing the local trip. */
export function tripSaveSignInHref(tripId: string) {
  const returnHref = `${firstTripWorkspaceHref(tripId)}&saved=1`;
  return `/journey/login?next=${encodeURIComponent(returnHref)}`;
}

export function isFirstTripWorkspaceArrival(search: string) {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("created") === "1";
}

export function shouldShowFirstTripOrientation(firstArrival: boolean, alreadySeen: boolean) {
  return firstArrival && !alreadySeen;
}

export function isCanonicalTripWorkspaceHref(href: string) {
  return /^\/journey\/trip-[^/?#]+(?:\/(?:itinerary|map|prep))?(?:[?#].*)?$/.test(href);
}

export function mapWorkspaceHref(tripId: string, stopId?: string | null, mode: MapWorkspaceMode = "plan", dayNumber?: number | null) {
  const query = new URLSearchParams();
  if (stopId) query.set("stop", stopId);
  if (mode !== "plan") query.set("mode", mode);
  if (dayNumber) query.set("day", String(dayNumber));
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
  const rawDay = query.get("day") ?? "";
  const requestedDayNumber = /^\d+$/.test(rawDay) ? Number.parseInt(rawDay, 10) : Number.NaN;
  const requestedDay = Number.isInteger(requestedDayNumber)
    ? orderedDays(trip).find((day) => day.dayNumber === requestedDayNumber && day.stopId === stopId)
    : undefined;
  return { stopId, mode, dayNumber: requestedDay?.dayNumber ?? null };
}

/**
 * A normal Map visit is route-first. Only a valid, explicit stop target is
 * allowed to open the local camera; the selected day used by the planner is
 * otherwise presentation context, not persisted camera state.
 */
export function initialMapCameraMode(trip: Pick<WorkspaceTrip, "stops">, query: QueryReader) {
  const requestedStop = query.get("stop");
  return requestedStop && orderedStops(trip).some((stop) => stop.id === requestedStop)
    ? "detail" as const
    : "overview" as const;
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

export type TripWorkspaceView = "overview" | "itinerary" | "map";

export function workspaceVisitKey(href: string) {
  return href.split(/[?#]/, 1)[0];
}

export function workspaceViewFromPathname(pathname: string, tripId: string): TripWorkspaceView {
  const decodedPathname = decodeURIComponent(workspaceVisitKey(pathname));
  const remainder = decodedPathname.slice(`/journey/${tripId}`.length);
  if (remainder.startsWith("/itinerary")) return "itinerary";
  if (remainder.startsWith("/map")) return "map";
  return "overview";
}
