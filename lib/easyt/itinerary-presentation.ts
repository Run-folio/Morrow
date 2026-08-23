import type { EasyTTrip, PlanItem, TripLeg } from "./trip.ts";

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Removes generated rows already represented by the transfer summary. */
export function itineraryNotesForDisplay(
  day: Pick<PlanItem, "notes">,
  leg: TripLeg | null,
  trip: Pick<EasyTTrip, "stops">,
) {
  if (!leg) return day.notes;
  const from = trip.stops.find((stop) => stop.id === leg.fromStopId)?.name;
  const to = trip.stops.find((stop) => stop.id === leg.toStopId)?.name;
  const route = from && to ? normalized(`${from} → ${to}`) : null;
  return day.notes.filter((note) => {
    const value = normalized(note);
    if (route && value === route) return false;
    if (leg.durationMinutes !== null && value.startsWith("estimated door-to-door:")) return false;
    return true;
  });
}
