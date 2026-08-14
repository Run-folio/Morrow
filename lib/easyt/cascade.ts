import type { EasyTTrip, TripCascadeStatus, TripScheduleLocks } from "./trip.ts";

const DAY = 86_400_000;
const dateAt = (value: string) => new Date(`${value}T00:00:00`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => iso(new Date(dateAt(value).getTime() + days * DAY));

export type CascadedTrip = {
  trip: EasyTTrip;
  status: TripCascadeStatus;
};

/**
 * Applies the existing stop allocation as one connected calendar. This is
 * deliberately deterministic: locks are honoured, conflicts are reported,
 * and confirmed bookings are never edited or removed automatically.
 */
export function cascadeTripSchedule(trip: EasyTTrip): CascadedTrip {
  const locks: TripScheduleLocks = trip.brief.scheduleLocks ?? { stopIds: [], arrivalDates: {} };
  const conflicts: string[] = [];
  let cursor = trip.startDate;

  const stops = [...trip.stops]
    .sort((a, b) => a.order - b.order)
    .map((stop, order) => {
      const expectedArrival = cursor;
      const lockedArrival = locks.arrivalDates[stop.id];
      const arrivalDate = lockedArrival || expectedArrival;
      if (lockedArrival && lockedArrival !== expectedArrival) {
        conflicts.push(`${stop.name} is locked for ${lockedArrival}, so the route cannot stay fully continuous.`);
      }
      const nights = Math.max(0, stop.nights ?? 0);
      const departureDate = addDays(arrivalDate, nights + 1);
      cursor = departureDate;
      return { ...stop, order, arrivalDate, departureDate };
    });

  const endExclusive = addDays(trip.endDate, 1);
  if (cursor > endExclusive) {
    conflicts.push(`The route now runs through ${addDays(cursor, -1)}, beyond the trip end of ${trip.endDate}.`);
  }

  const arrivalByStop = new Map(stops.map((stop) => [stop.id, stop.arrivalDate]));
  const originalPlanItems = trip.planItems;
  const planItems = originalPlanItems.map((item) => {
    const stopArrival = arrivalByStop.get(item.stopId);
    if (!stopArrival) return item;
    const offset = Math.max(0, item.dayNumber - (trip.planItems.find((candidate) => candidate.stopId === item.stopId)?.dayNumber ?? item.dayNumber));
    return { ...item, date: addDays(stopArrival, offset) };
  });
  const affectedPlanItemCount = planItems.filter((item, index) => item.date !== originalPlanItems[index]?.date).length;

  const affectedBookingIds = (trip.brief.bookings ?? [])
    .filter((booking) => booking.date && (booking.date < trip.startDate || booking.date > trip.endDate || Boolean(booking.date && planItems.some((item) => item.date === booking.date && item.type === "transport"))))
    .map((booking) => booking.id);
  if (affectedBookingIds.length) {
    conflicts.push(`${affectedBookingIds.length} saved booking${affectedBookingIds.length === 1 ? " may" : "s may"} need a date check.`);
  }

  const status: TripCascadeStatus = { conflicts, affectedBookingIds, affectedPlanItemCount };
  return {
    trip: {
      ...trip,
      stops,
      planItems,
      brief: { ...trip.brief, scheduleLocks: locks, cascadeStatus: status },
    },
    status,
  };
}
