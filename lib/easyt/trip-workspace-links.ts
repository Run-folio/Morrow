import type { EasyTTrip, TripRecommendation } from "./trip.ts";
import type { MapResultHandoffTarget } from "./map-result-selection.ts";

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

/** Device-only trips must opt into the recovery path when they return to the
 * Builder. Account-owned trips continue through the canonical cloud path. */
export function tripBuilderHref(
  tripId: string,
  ownerId: string | null,
  target?: { placeMentionId?: string },
) {
  const base = `/journey/new?trip=${encodeURIComponent(tripId)}`;
  const recovery = ownerId === null ? "&recover=1" : "";
  const placeMentionId = target?.placeMentionId?.trim();
  const placeIntent = placeMentionId
    ? `&${new URLSearchParams({ placeIntent: placeMentionId }).toString()}`
    : "";
  return `${base}${recovery}${placeIntent}`;
}

/** Generic Overview entry resets position; an explicit section hash keeps its native anchor behaviour. */
export function shouldResetOverviewEntry(hash: string) {
  return hash === "" || hash === "#";
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

export function isCanonicalTripWorkspaceHref(href: string) {
  return /^\/journey\/trip-[^/?#]+(?:\/(?:itinerary|map|explore|stay|transport|prep))?(?:[?#].*)?$/.test(href);
}

export function mapWorkspaceHref(
  tripId: string,
  stopId?: string | null,
  mode: MapWorkspaceMode = "plan",
  dayNumber?: number | null,
  resultSelectionId?: string | null,
  resultHandoff?: MapResultHandoffTarget | null,
) {
  const query = new URLSearchParams();
  if (stopId) query.set("stop", stopId);
  if (mode !== "plan") query.set("mode", mode);
  if (dayNumber) query.set("day", String(dayNumber));
  if (resultSelectionId) query.set("result", resultSelectionId);
  if (resultSelectionId
    && stopId
    && resultHandoff?.selectionId === resultSelectionId
    && resultHandoff.stopId === stopId
    && resultHandoff.kind === mode) {
    query.set("targetId", resultHandoff.sourceId);
    query.set("targetName", resultHandoff.name);
    query.set("targetLng", String(resultHandoff.coordinates[0]));
    query.set("targetLat", String(resultHandoff.coordinates[1]));
    query.set("targetKind", resultHandoff.kind);
    query.set("targetAddress", resultHandoff.address);
    query.set("targetCategory", resultHandoff.category);
    if (resultHandoff.provider) query.set("targetProvider", resultHandoff.provider);
    if (resultHandoff.providerProductId) query.set("targetProduct", resultHandoff.providerProductId);
    if (resultHandoff.commercialProvider) query.set("targetCommercialProvider", resultHandoff.commercialProvider);
    if (resultHandoff.commercialProviderProductId) query.set("targetCommercialProduct", resultHandoff.commercialProviderProductId);
  }
  const suffix = query.toString();
  return `/journey/${encodeURIComponent(tripId)}/map${suffix ? `?${suffix}` : ""}`;
}

export function itineraryWorkspaceHref(tripId: string, dayNumber?: number | null) {
  const base = `/journey/${encodeURIComponent(tripId)}/itinerary`;
  return dayNumber ? `${base}?day=${dayNumber}` : base;
}

export function exploreWorkspaceHref(tripId: string, stopId?: string | null, dayNumber?: number | null) {
  const query = new URLSearchParams();
  if (stopId) query.set("stop", stopId);
  if (dayNumber) query.set("day", String(dayNumber));
  const suffix = query.toString();
  return `/journey/${encodeURIComponent(tripId)}/explore${suffix ? `?${suffix}` : ""}`;
}

export function stayWorkspaceHref(tripId: string, stopId?: string | null, resultSelectionId?: string | null) {
  const query = new URLSearchParams();
  if (stopId) query.set("stop", stopId);
  if (resultSelectionId) query.set("result", resultSelectionId);
  const suffix = query.toString();
  return `/journey/${encodeURIComponent(tripId)}/stay${suffix ? `?${suffix}` : ""}`;
}

export function transportWorkspaceHref(tripId: string) {
  return `/journey/${encodeURIComponent(tripId)}/transport`;
}

export function parseStayWorkspaceTarget(trip: Pick<WorkspaceTrip, "stops">, query: QueryReader) {
  const stops = orderedStops(trip).filter((stop) => (stop.nights ?? 0) > 0);
  const requestedStop = query.get("stop");
  const stopId = requestedStop && stops.some((stop) => stop.id === requestedStop)
    ? requestedStop
    : stops[0]?.id ?? null;
  const rawResultSelectionId = query.get("result");
  const resultSelectionId = rawResultSelectionId
    && rawResultSelectionId.length <= 240
    && /^result:stay:[^\s]+$/.test(rawResultSelectionId)
    ? rawResultSelectionId
    : null;
  return { stopId, resultSelectionId };
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
  const rawResultSelectionId = query.get("result");
  const resultSelectionId = rawResultSelectionId
    && rawResultSelectionId.length <= 240
    && /^(?:idea:|saved:|result:(?:stay|eat|see):)[^\s]+$/.test(rawResultSelectionId)
    ? rawResultSelectionId
    : null;
  const dayNumber = requestedDay?.dayNumber ?? null;
  const targetSourceId = query.get("targetId")?.trim() ?? "";
  const targetName = query.get("targetName")?.trim() ?? "";
  const rawTargetLongitude = query.get("targetLng");
  const rawTargetLatitude = query.get("targetLat");
  const targetLongitude = rawTargetLongitude?.trim() ? Number(rawTargetLongitude) : Number.NaN;
  const targetLatitude = rawTargetLatitude?.trim() ? Number(rawTargetLatitude) : Number.NaN;
  const targetKind = query.get("targetKind");
  const targetAddress = query.get("targetAddress")?.trim() ?? "";
  const targetCategory = query.get("targetCategory")?.trim() ?? "";
  const rawProvider = query.get("targetProvider");
  const provider = rawProvider === "booking-demand" || rawProvider === "google-places" || rawProvider === "openstreetmap" || rawProvider === "viator"
    ? rawProvider
    : undefined;
  const providerProductId = query.get("targetProduct")?.trim() || undefined;
  const commercialProvider = query.get("targetCommercialProvider") === "booking-demand" ? "booking-demand" as const : undefined;
  const commercialProviderProductId = query.get("targetCommercialProduct")?.trim() || undefined;
  const resultHandoff = resultSelectionId
    && stopId
    && targetKind === mode
    && targetKind !== "plan"
    && targetSourceId.length > 0 && targetSourceId.length <= 240
    && targetName.length > 0 && targetName.length <= 200
    && targetAddress.length <= 300
    && targetCategory.length <= 120
    && Number.isFinite(targetLongitude) && Math.abs(targetLongitude) <= 180
    && Number.isFinite(targetLatitude) && Math.abs(targetLatitude) <= 90
    && (!providerProductId || providerProductId.length <= 240)
    && (!commercialProviderProductId || Boolean(commercialProvider) && commercialProviderProductId.length <= 240)
    ? {
        selectionId: resultSelectionId,
        sourceId: targetSourceId,
        stopId,
        dayNumber,
        name: targetName,
        coordinates: [targetLongitude, targetLatitude] as [number, number],
        kind: targetKind,
        address: targetAddress || trip.stops.find((candidate) => candidate.id === stopId)?.name || "Selected map result",
        category: targetCategory || (targetKind === "stay" ? "Accommodation" : targetKind === "eat" ? "Restaurant" : "Activity"),
        ...(provider ? { provider } : {}),
        ...(providerProductId ? { providerProductId } : {}),
        ...(commercialProvider ? { commercialProvider } : {}),
        ...(commercialProvider && commercialProviderProductId ? { commercialProviderProductId } : {}),
      } satisfies MapResultHandoffTarget
    : null;
  return {
    stopId,
    mode,
    dayNumber,
    resultSelectionId,
    ...(resultHandoff ? { resultHandoff } : {}),
  };
}

/**
 * Resolve the concrete planner day that should accompany a Map URL target.
 * The URL's canonical stop instance always wins; a missing/invalid handoff
 * keeps the normal first-stop default supplied by parseMapWorkspaceTarget.
 */
export function mapWorkspaceSelectionForTarget(trip: WorkspaceTrip, query: QueryReader) {
  const target = parseMapWorkspaceTarget(trip, query);
  const selectedDay = orderedDays(trip).find((candidate) => candidate.dayNumber === target.dayNumber && candidate.stopId === target.stopId)
    ?? orderedDays(trip).find((candidate) => candidate.stopId === target.stopId)
    ?? orderedDays(trip)[0]
    ?? null;
  return { target, selectedDay };
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

export type TripWorkspaceView = "overview" | "itinerary" | "map" | "explore" | "stay" | "transport";

export function workspaceVisitKey(href: string) {
  return href.split(/[?#]/, 1)[0];
}

export function workspaceViewFromPathname(pathname: string, tripId: string): TripWorkspaceView {
  const decodedPathname = decodeURIComponent(workspaceVisitKey(pathname));
  const remainder = decodedPathname.slice(`/journey/${tripId}`.length);
  if (remainder.startsWith("/explore")) return "explore";
  if (remainder.startsWith("/stay")) return "stay";
  if (remainder.startsWith("/transport")) return "transport";
  if (remainder.startsWith("/itinerary")) return "itinerary";
  if (remainder.startsWith("/map")) return "map";
  return "overview";
}
