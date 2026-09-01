import type { EasyTTrip, TripBooking, TripStop } from "./trip";
import { stableStopDateRange } from "./trip-facts.ts";
import { parseIsoDate } from "./trip-lifecycle.ts";

/**
 * Shared derived accommodation state. A saved stay remains a booking already
 * held on the canonical trip document; UI surfaces must not maintain a second
 * completion model.
 */
export function overnightAccommodationStops(trip: EasyTTrip): TripStop[] {
  return trip.stops.filter((stop) => (stop.nights ?? 0) > 0);
}

export function accommodationDatesReady(stop: TripStop, trip?: Pick<EasyTTrip, "startDate" | "endDate">): boolean {
  if (trip) return Boolean(stableStopDateRange(stop, trip));
  const arrival = parseIsoDate(stop.arrivalDate);
  const departure = parseIsoDate(stop.departureDate);
  return Boolean(arrival && departure && departure.getTime() > arrival.getTime());
}

export function stayBookingForStop(trip: EasyTTrip, stop: TripStop): TripBooking | undefined {
  const datesReady = accommodationDatesReady(stop);
  const stopName = stop.name.trim().toLocaleLowerCase();
  return (trip.brief.bookings ?? []).find((booking) => booking.type === "stay" && (
    booking.id === `stay-${stop.id}`
    || (datesReady && parseIsoDate(booking.date) !== null && booking.date! >= stop.arrivalDate! && booking.date! < stop.departureDate!)
    || (stopName.length > 0 && booking.title.toLocaleLowerCase().includes(stopName))
  ));
}

export function accommodationProgress(trip: EasyTTrip) {
  const stops = overnightAccommodationStops(trip);
  const sortedCount = stops.filter((stop) => Boolean(stayBookingForStop(trip, stop))).length;
  const datesReadyCount = stops.filter((stop) => accommodationDatesReady(stop, trip)).length;
  return {
    stops,
    sortedCount,
    datesReadyCount,
    complete: stops.length > 0 && sortedCount === stops.length && datesReadyCount === stops.length,
  };
}

export type StayBookingDraft = {
  title: string;
  confirmation?: string;
  url?: string;
};

/** Canonical add/edit boundary shared by stay surfaces; no completion flag is stored. */
export function upsertStayBooking(trip: EasyTTrip, stopId: string, draft: StayBookingDraft): EasyTTrip {
  const stop = trip.stops.find((candidate) => candidate.id === stopId);
  const title = draft.title.trim().replace(/\s+/g, " ");
  if (!stop || !title) return trip;
  const existing = stayBookingForStop(trip, stop);
  const booking: TripBooking = {
    ...existing,
    id: `stay-${stop.id}`,
    type: "stay",
    title,
    date: stop.arrivalDate,
    confirmation: draft.confirmation === undefined ? existing?.confirmation ?? null : draft.confirmation.trim() || null,
    url: draft.url === undefined ? existing?.url ?? null : draft.url.trim() || null,
  };
  return {
    ...trip,
    brief: {
      ...trip.brief,
      bookings: [...(trip.brief.bookings ?? []).filter((candidate) => candidate.id !== booking.id && candidate.id !== existing?.id), booking],
    },
  };
}

export function removeStayBooking(trip: EasyTTrip, stopId: string): EasyTTrip {
  const stop = trip.stops.find((candidate) => candidate.id === stopId);
  if (!stop || !stayBookingForStop(trip, stop)) return trip;
  const existing = stayBookingForStop(trip, stop)!;
  return { ...trip, brief: { ...trip.brief, bookings: (trip.brief.bookings ?? []).filter((candidate) => candidate.id !== existing.id) } };
}
