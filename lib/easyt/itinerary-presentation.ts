import type { EasyTTrip, PlanItem, TripLeg } from "./trip.ts";
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
  day: Pick<PlanItem, "notes">,
  leg: TripLeg | null,
  trip: Pick<EasyTTrip, "stops">,
) {
  return itineraryNotesWithSourceIndexesForDisplay(day, leg, trip).map((item) => item.note);
}

/** Keeps the canonical note index available to direct itinerary mutations. */
export function itineraryNotesWithSourceIndexesForDisplay(
  day: Pick<PlanItem, "notes">,
  leg: TripLeg | null,
  trip: Pick<EasyTTrip, "stops">,
) {
  if (!leg) return day.notes.map((note, sourceIndex) => ({ note, sourceIndex }));
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
