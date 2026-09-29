import type { PlanItem, TripStop } from "./trip.ts";

export type ImportedDatedDayInput = {
  tripId: string;
  startDate: string;
  endDate: string;
  stops: readonly TripStop[];
  activities: readonly { id: string; stopId: string; date: string; title: string; notes: readonly string[] }[];
};

export type ImportedDatedDayResult = {
  planItems: PlanItem[];
  activityCommentsByDay: Record<number, string[]>;
};

function dayNumber(iso: string) {
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== iso) {
    throw new Error("Imported stop dates must be valid ISO dates.");
  }
  return Math.floor(parsed / 86_400_000);
}

function isoDay(number: number) {
  return new Date(number * 86_400_000).toISOString().slice(0, 10);
}

/** A reviewed stop interval owns its arrival day and nights; the last stop
 * also owns the final departure day without acquiring another night. */
export function buildImportedDatedDays(input: ImportedDatedDayInput): ImportedDatedDayResult {
  const start = dayNumber(input.startDate);
  const end = dayNumber(input.endDate);
  const stops = [...input.stops].sort((left, right) => left.order - right.order);
  if (!stops.length || end < start) throw new Error("Imported stop dates do not cover the trip.");
  let nextDay = start;
  const planItems: PlanItem[] = [];
  for (const [index, stop] of stops.entries()) {
    if (!stop.arrivalDate || !stop.departureDate || stop.nights === null) throw new Error("Imported stop timing is incomplete.");
    const arrival = dayNumber(stop.arrivalDate);
    const departure = dayNumber(stop.departureDate);
    if (arrival !== nextDay || departure <= arrival || stop.nights !== departure - arrival) {
      throw new Error("Imported stop timing is not contiguous and unambiguous.");
    }
    const ownedLastDay = index === stops.length - 1 ? departure : departure - 1;
    for (let dateDay = arrival; dateDay <= ownedLastDay; dateDay += 1) {
      const number = dateDay - start + 1;
      planItems.push({
        id: `${input.tripId}-import-day-${number}`,
        stopId: stop.id,
        dayNumber: number,
        date: isoDay(dateDay),
        type: "open",
        title: "Open planning day",
        reason: "Dated from the traveller’s reviewed stop timing.",
        notes: [],
        startsAt: null,
        endsAt: null,
        bookingUrl: null,
        latitude: stop.latitude,
        longitude: stop.longitude,
      });
    }
    nextDay = departure;
  }
  if (nextDay !== end || planItems.length !== end - start + 1) throw new Error("Imported stop timing does not cover the trip span.");
  const activityCommentsByDay: Record<number, string[]> = {};
  for (const activity of input.activities) {
    const dateDay = dayNumber(activity.date);
    const day = planItems[dateDay - start];
    if (!day || day.date !== activity.date || day.stopId !== activity.stopId) {
      throw new Error("Imported activity does not match its reviewed stop and day.");
    }
    day.notes.push(activity.title);
    if (activity.notes.length) activityCommentsByDay[day.dayNumber] = [
      ...(activityCommentsByDay[day.dayNumber] ?? []), ...activity.notes,
    ];
  }
  return { planItems, activityCommentsByDay };
}
