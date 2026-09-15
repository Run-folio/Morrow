import { composeItineraryDay, itineraryDayParts, type ComposedItineraryActivity, type ComposedItineraryTransfer } from "./itinerary-day-composition.ts";
import { itineraryTransportAgenda, type ItineraryTransportAgendaLeg } from "./itinerary-transport-agenda.ts";
import type { EasyTTrip, ItineraryDayPart, PlanItem, TripBooking, TripStop } from "./trip.ts";

export type ItineraryCalendarSchedule =
  | { kind: "day-part"; dayPart: ItineraryDayPart }
  | { kind: "time"; startsAt: string }
  | { kind: "full-day" }
  | { kind: "time-not-set" };

export type ItineraryCalendarItem =
  | { kind: "activity"; id: string; activity: ComposedItineraryActivity; schedule: ItineraryCalendarSchedule }
  | { kind: "transfer"; id: string; transfer: ComposedItineraryTransfer | null; agenda: ItineraryTransportAgendaLeg }
  | { kind: "accommodation"; id: string; booking: TripBooking; destination: string | null }
  | { kind: "booking"; id: string; booking: TripBooking };

export type ItineraryCalendarDay = {
  id: string;
  day: PlanItem;
  stop: TripStop | null;
  items: ItineraryCalendarItem[];
  arrival: boolean;
  departure: boolean;
};

export type ItineraryCalendarWeek = {
  id: string;
  startDate: string | null;
  days: Array<ItineraryCalendarDay | null>;
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function utcDate(value: string) {
  if (!isoDate.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || isoValue(date) !== value ? null : date;
}

function isoValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekStart(value: string) {
  const date = utcDate(value);
  if (!date) return null;
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function activitySchedule(activity: ComposedItineraryActivity): ItineraryCalendarSchedule {
  if (activity.startsAt) return { kind: "time", startsAt: activity.startsAt };
  if (activity.dayPart) return { kind: "day-part", dayPart: activity.dayPart };
  const duration = activity.providerMetadata?.duration;
  const minimumMinutes = duration?.fixedMinutes ?? duration?.fromMinutes ?? null;
  return minimumMinutes !== null && minimumMinutes >= 8 * 60
    ? { kind: "full-day" }
    : { kind: "time-not-set" };
}

/**
 * Read-only trip-wide calendar projection. Every row retains its canonical day,
 * activity, transfer or booking object; this module owns no mutation or storage.
 */
export function itineraryCalendarDays(trip: EasyTTrip): ItineraryCalendarDay[] {
  const transportAgenda = itineraryTransportAgenda(trip);
  const orderedDays = [...trip.planItems].sort((left, right) => left.dayNumber - right.dayNumber);
  const transportDayIds = new Map(transportAgenda.flatMap((agenda) => {
    const assignedDay = orderedDays.find((day) => agenda.dayNumber === day.dayNumber)
      ?? orderedDays.find((day) => agenda.date === day.date)
      ?? (agenda.to.kind === "stop" ? orderedDays.find((day) => day.stopId === agenda.to.id) : null)
      ?? [...orderedDays].reverse().find((day) => day.stopId === agenda.from.id)
      ?? null;
    return assignedDay ? [[agenda.leg.id, assignedDay.id] as const] : [];
  }));
  return orderedDays
    .flatMap((day) => {
      const composition = composeItineraryDay(trip, day.id);
      if (!composition) return [];
      const activities = [
        ...itineraryDayParts.flatMap((part) => composition.planned[part]),
        ...composition.unslotted,
      ];
      const transfers = transportAgenda
        .filter((agenda) => transportDayIds.get(agenda.leg.id) === day.id)
        .map((agenda): ItineraryCalendarItem => ({
          kind: "transfer",
          id: `transfer:${agenda.leg.id}`,
          transfer: composition.transfers.find((transfer) => transfer.id === agenda.leg.id) ?? null,
          agenda,
        }));
      const activityItems = activities.map((activity): ItineraryCalendarItem => ({
        kind: "activity",
        id: `activity:${activity.id}`,
        activity,
        schedule: activitySchedule(activity),
      }));
      const usedBookingIds = new Set([
        ...transfers.flatMap((item) => item.kind === "transfer" && item.agenda.booking ? [item.agenda.booking.id] : []),
        ...activityItems.flatMap((item) => item.kind === "activity" && item.activity.booking ? [item.activity.booking.id] : []),
      ]);
      const stay = composition.tonight.state === "booked" && composition.tonight.booking
        ? composition.tonight.booking
        : null;
      if (stay) usedBookingIds.add(stay.id);
      const datedBookings = (trip.brief.bookings ?? [])
        .filter((booking) => booking.date === day.date && !usedBookingIds.has(booking.id))
        .map((booking): ItineraryCalendarItem => ({ kind: "booking", id: `booking:${booking.id}`, booking }));
      const accommodation: ItineraryCalendarItem[] = stay ? [{
        kind: "accommodation",
        id: `accommodation:${stay.id}`,
        booking: stay,
        destination: composition.tonight.destination,
      }] : [];
      return [{
        id: day.id,
        day,
        stop: composition.stop,
        items: [...transfers, ...activityItems, ...accommodation, ...datedBookings],
        arrival: day.type === "arrival" || composition.transfers.some((transfer) => transfer.direction === "arriving"),
        departure: composition.transfers.some((transfer) => transfer.direction === "departing"),
      }];
    });
}

/** Continuous Monday-to-Sunday travel weeks; month changes never paginate or hide days. */
export function itineraryCalendarWeeks(trip: EasyTTrip): ItineraryCalendarWeek[] {
  const days = itineraryCalendarDays(trip);
  const weeks: ItineraryCalendarWeek[] = [];
  let undatedWeek: ItineraryCalendarWeek | null = null;
  for (const projected of days) {
    const start = weekStart(projected.day.date);
    if (!start) {
      if (!undatedWeek || undatedWeek.days.every(Boolean)) {
        undatedWeek = { id: `undated-${weeks.length + 1}`, startDate: null, days: Array(7).fill(null) };
        weeks.push(undatedWeek);
      }
      const slot = undatedWeek.days.findIndex((day) => day === null);
      undatedWeek.days[slot] = projected;
      continue;
    }
    const id = isoValue(start);
    let week = weeks.find((candidate) => candidate.id === id);
    if (!week) {
      week = { id, startDate: id, days: Array(7).fill(null) };
      weeks.push(week);
    }
    const date = utcDate(projected.day.date)!;
    week.days[(date.getUTCDay() + 6) % 7] = projected;
  }
  return weeks.sort((left, right) => {
    if (left.startDate === null) return 1;
    if (right.startDate === null) return -1;
    return left.startDate.localeCompare(right.startDate);
  });
}
