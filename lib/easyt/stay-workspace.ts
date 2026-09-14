import { stayBookingForStop } from "./accommodation.ts";
import type { JourneyLocalPlace } from "./local-place.ts";
import { mergeLocalFinderPlaces } from "./local-finder-query.ts";
import { formatIsoDate } from "./trip-lifecycle.ts";
import { stableStopDateRange } from "./trip-facts.ts";
import type { EasyTTrip, TripStop } from "./trip.ts";

export type StayWorkspaceContext = {
  key: string;
  stop: TripStop;
  nights: number;
  checkIn: string | null;
  checkOut: string | null;
  dateLabel: string;
  plannedCoordinates: Array<[number, number]>;
  plannedCentroid: [number, number] | null;
  clusterRadiusKm: number | null;
  searchCoordinates: [number, number] | null;
};

export type StayAreaGuidance = {
  kind: "cluster" | "spread";
  title: string;
  reason: string;
};

const stayCategory = /\b(?:hotel|hostel|guest[_ -]?house|motel|apartment|lodging|accommodation|available stay)\b/i;

function validCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && Math.abs(value[0]) <= 180
    && Math.abs(value[1]) <= 90;
}

export function mapDistanceKm(left: [number, number], right: [number, number]) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function uniqueCoordinates(values: Array<[number, number]>) {
  const seen = new Set<string>();
  return values.filter((coordinates) => {
    const key = `${coordinates[0].toFixed(5)}:${coordinates[1].toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function plannedCoordinatesForStop(trip: EasyTTrip, stopId: string) {
  const stopDays = new Set(trip.planItems.filter((day) => day.stopId === stopId).map((day) => day.dayNumber));
  const ideaCoordinates = (trip.brief.itineraryIdeas ?? [])
    .filter((idea) => idea.stopId === stopId && Boolean(idea.dayId) && validCoordinates(idea.coordinates))
    .map((idea) => idea.coordinates as [number, number]);
  const pinCoordinates = (trip.brief.mapPins ?? [])
    .filter((pin) => stopDays.has(pin.dayNumber) && pin.category !== "stay")
    .map((pin) => [pin.longitude, pin.latitude] as [number, number])
    .filter(validCoordinates);
  return uniqueCoordinates([...ideaCoordinates, ...pinCoordinates]);
}

function centroid(coordinates: Array<[number, number]>): [number, number] | null {
  if (!coordinates.length) return null;
  const total = coordinates.reduce((sum, coordinate) => [sum[0] + coordinate[0], sum[1] + coordinate[1]] as [number, number], [0, 0]);
  return [total[0] / coordinates.length, total[1] / coordinates.length];
}

function shortDate(value: string | null) {
  return formatIsoDate(value, "en-GB", { day: "numeric", month: "short" });
}

export function stayWorkspaceContext(trip: EasyTTrip, stopId: string): StayWorkspaceContext | null {
  const stop = trip.stops.find((candidate) => candidate.id === stopId && (candidate.nights ?? 0) > 0);
  if (!stop) return null;
  const range = stableStopDateRange(stop, trip);
  const plannedCoordinates = plannedCoordinatesForStop(trip, stop.id);
  const plannedCentroid = centroid(plannedCoordinates);
  const clusterRadiusKm = plannedCentroid && plannedCoordinates.length > 1
    ? Math.max(...plannedCoordinates.map((coordinates) => mapDistanceKm(plannedCentroid, coordinates)))
    : null;
  const stopCoordinates = stop.longitude !== null && stop.latitude !== null
    ? [stop.longitude, stop.latitude] as [number, number]
    : null;
  const checkIn = range?.checkIn ?? null;
  const checkOut = range?.checkOut ?? null;
  const start = shortDate(checkIn);
  const end = shortDate(checkOut);
  return {
    key: [trip.id, stop.id, checkIn ?? "no-check-in", checkOut ?? "no-check-out"].join(":"),
    stop,
    nights: Math.max(0, stop.nights ?? 0),
    checkIn,
    checkOut,
    dateLabel: start && end ? `${start}–${end}` : "Dates to confirm",
    plannedCoordinates,
    plannedCentroid,
    clusterRadiusKm,
    searchCoordinates: plannedCentroid ?? stopCoordinates,
  };
}

export function stayAreaGuidance(context: StayWorkspaceContext): StayAreaGuidance | null {
  const count = context.plannedCoordinates.length;
  if (count < 2 || context.clusterRadiusKm === null) return null;
  if (context.clusterRadiusKm <= 8) {
    return {
      kind: "cluster",
      title: "Best placed for your current plans",
      reason: `${count} planned places form a mapped cluster in ${context.stop.name}. Stay options are ranked partly by their distance from its centre.`,
    };
  }
  return {
    kind: "spread",
    title: "Compare locations against your plans",
    reason: `Your ${count} mapped plans are spread across ${context.stop.name}, so Morrovia is not naming a single best area.`,
  };
}

export function isStayCandidate(place: JourneyLocalPlace) {
  return Boolean(place.id.trim()
    && place.name.trim()
    && validCoordinates(place.coordinates)
    && stayCategory.test(place.category));
}

function reviewSignal(place: JourneyLocalPlace) {
  const rating = Number.isFinite(place.rating) ? Math.max(0, Math.min(5, place.rating!)) * 5 : 0;
  const reviews = Number.isFinite(place.reviewCount) ? Math.min(12, Math.log10(place.reviewCount! + 1) * 4) : 0;
  return rating + reviews;
}

/** Stable, evidence-only ranking. No score is exposed to travellers. */
export function rankedStayShortlist(
  places: readonly JourneyLocalPlace[],
  context: StayWorkspaceContext,
  limit = 6,
) {
  const valid = places.filter(isStayCandidate);
  const deduped = mergeLocalFinderPlaces(valid);
  const anchor = context.plannedCentroid ?? context.searchCoordinates;
  return deduped
    .map((place, index) => ({
      place,
      index,
      distance: anchor ? mapDistanceKm(anchor, place.coordinates) : null,
      // Availability and price are volatile provider facts, not quality. They
      // enrich a stable shortlist after ranking; missing enrichment is neutral.
      score: Number(place.operational === true) * 6
        + reviewSignal(place)
        - (anchor ? Math.min(20, mapDistanceKm(anchor, place.coordinates)) : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, Math.min(6, limit)))
    .map(({ place }) => place);
}

export function stayCandidateFit(place: JourneyLocalPlace, context: StayWorkspaceContext) {
  if (context.plannedCentroid && context.plannedCoordinates.length >= 2) {
    const distance = mapDistanceKm(context.plannedCentroid, place.coordinates);
    return `${distance.toFixed(1)} km from the centre of your mapped plans.`;
  }
  if (context.searchCoordinates) {
    const distance = mapDistanceKm(context.searchCoordinates, place.coordinates);
    return `${distance.toFixed(1)} km from this stop.`;
  }
  return `Mapped for this ${context.stop.name} stop.`;
}

export function stayIsSelected(trip: EasyTTrip, context: StayWorkspaceContext, place: JourneyLocalPlace) {
  const booking = stayBookingForStop(trip, context.stop);
  return Boolean(booking && booking.title.trim().toLocaleLowerCase() === place.name.trim().toLocaleLowerCase());
}
