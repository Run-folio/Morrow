import type { EasyTTrip, TripBooking, TripStop } from "./trip";

/**
 * Shared derived accommodation state. A saved stay remains a booking already
 * held on the canonical trip document; UI surfaces must not maintain a second
 * completion model.
 */
export function overnightAccommodationStops(trip: EasyTTrip): TripStop[] {
  return trip.stops.filter((stop) => (stop.nights ?? 0) > 0 && Boolean(stop.arrivalDate && stop.departureDate));
}

export function stayBookingForStop(trip: EasyTTrip, stop: TripStop): TripBooking | undefined {
  return (trip.brief.bookings ?? []).find((booking) => booking.type === "stay" && (
    booking.id === `stay-${stop.id}`
    || (booking.date !== null && booking.date >= (stop.arrivalDate ?? "") && booking.date < (stop.departureDate ?? ""))
    || booking.title.toLowerCase().includes(stop.name.toLowerCase())
  ));
}

export function accommodationProgress(trip: EasyTTrip) {
  const stops = overnightAccommodationStops(trip);
  const sortedCount = stops.filter((stop) => Boolean(stayBookingForStop(trip, stop))).length;
  return { stops, sortedCount, complete: stops.length > 0 && sortedCount === stops.length };
}
