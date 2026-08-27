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
  const from = leg.fromEndpoint?.name ?? trip.stops.find((stop) => stop.id === leg.fromStopId)?.name;
  const to = leg.toEndpoint?.name ?? trip.stops.find((stop) => stop.id === leg.toStopId)?.name;
  const route = from && to ? normalized(`${from} → ${to}`) : null;
  return day.notes.filter((note) => {
    const value = normalized(note);
    if (route && value === route) return false;
    if (value.startsWith("estimated door-to-door:") || value.startsWith("morrovia planning estimate:")) return false;
    return true;
  });
}
