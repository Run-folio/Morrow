import type { EasyTTrip, PlanItem, TripLeg } from "./trip.ts";
import { originPlaceFromBrief, sameJourneyPlace } from "./journey-endpoints.ts";
import { routeEndpointForLeg } from "./trip-legs.ts";

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Presentation-only semantic label for the engine's canonical same-city arrival leg. */
export function semanticSamePlaceArrival(trip: EasyTTrip, leg: TripLeg) {
  if (leg.classification !== "arrival") return null;
  const from = routeEndpointForLeg(trip, leg, "from");
  const to = routeEndpointForLeg(trip, leg, "to");
  const sameCanonicalPlace = Boolean(from?.canonicalPlaceId && from.canonicalPlaceId === to?.canonicalPlaceId);
  const canonicalIdentityLeg = leg.routeMetadata.source === "canonical-endpoint-identity";
  const zeroMovement = (leg.doorToDoorMinutes ?? leg.durationMinutes) === 0 && leg.distanceKm === 0;
  if (!to || !zeroMovement || (!sameCanonicalPlace && !canonicalIdentityLeg)) return null;
  return `Arrive in ${to.name}`;
}

/** Removes generated rows already represented by the transfer summary. */
export function itineraryNotesForDisplay(
  day: Pick<PlanItem, "id" | "notes">,
  leg: TripLeg | null,
  trip: Pick<EasyTTrip, "stops"> & Partial<Pick<EasyTTrip, "brief" | "planItems">>,
) {
  return itineraryNotesWithSourceIndexesForDisplay(day, leg, trip).map((item) => item.note);
}

/**
 * Older and current builder documents can retain generated arrival-note rows
 * even when the canonical route correctly deduplicates colocated semantic
 * endpoints. Treat the canonical absence of that inbound leg as authoritative,
 * while leaving the stay and every authored row intact.
 */
function stopPlace(stop: EasyTTrip["stops"][number]) {
  return {
    name: stop.name,
    country: stop.country,
    canonicalPlaceId: stop.canonicalPlaceId,
    providerId: stop.providerId,
    coordinates: stop.longitude === null || stop.latitude === null ? undefined : [stop.longitude, stop.latitude] as [number, number],
  };
}

function generatedSamePlaceMovementRows(
  day: Pick<PlanItem, "id" | "notes">,
  leg: TripLeg | null,
  trip: Pick<EasyTTrip, "stops"> & Partial<Pick<EasyTTrip, "brief" | "planItems">>,
) {
  if (leg || !trip.brief || !trip.planItems?.length) return new Set<number>();
  const ordered = [...trip.planItems].sort((left, right) => left.dayNumber - right.dayNumber || left.id.localeCompare(right.id));
  const dayIndex = ordered.findIndex((candidate) => candidate.id === day.id);
  if (dayIndex < 0) return new Set<number>();
  const current = ordered[dayIndex];
  const stop = trip.stops.find((candidate) => candidate.id === current.stopId);
  if (!stop) return new Set<number>();
  const previousDay = ordered[dayIndex - 1];
  const previousStop = previousDay && previousDay.stopId !== current.stopId
    ? trip.stops.find((candidate) => candidate.id === previousDay.stopId)
    : null;
  const from = dayIndex === 0 ? originPlaceFromBrief(trip.brief) : previousStop ? stopPlace(previousStop) : null;
  if (!from || !sameJourneyPlace(from, stopPlace(stop))) return new Set<number>();

  const generatedRoute = normalized(`${from.name} → ${stop.name}`);
  const routeIndex = day.notes.findIndex((note) => normalized(note) === generatedRoute);
  if (routeIndex < 0) return new Set<number>();
  const indexes = new Set([routeIndex]);
  day.notes.forEach((note, index) => {
    const value = normalized(note);
    if (value.startsWith("estimated door-to-door:") || value.startsWith("morrovia planning estimate:")) indexes.add(index);
  });
  return indexes;
}

/** Keeps the canonical note index available to direct itinerary mutations. */
export function itineraryNotesWithSourceIndexesForDisplay(
  day: Pick<PlanItem, "id" | "notes">,
  leg: TripLeg | null,
  trip: Pick<EasyTTrip, "stops"> & Partial<Pick<EasyTTrip, "brief" | "planItems">>,
) {
  if (!leg) {
    const suppressed = generatedSamePlaceMovementRows(day, leg, trip);
    return day.notes.map((note, sourceIndex) => ({ note, sourceIndex })).filter(({ sourceIndex }) => !suppressed.has(sourceIndex));
  }
  const from = leg.fromEndpoint?.name ?? trip.stops.find((stop) => stop.id === leg.fromStopId)?.name;
  const to = leg.toEndpoint?.name ?? trip.stops.find((stop) => stop.id === leg.toStopId)?.name;
  const route = from && to ? normalized(`${from} → ${to}`) : null;
  return day.notes.map((note, sourceIndex) => ({ note, sourceIndex })).filter(({ note }) => {
    const value = normalized(note);
    if (route && value === route) return false;
    if (value.startsWith("estimated door-to-door:") || value.startsWith("morrovia planning estimate:")) return false;
    return true;
  });
}
