import type { EasyTTrip, TripBooking, TripStop } from "./trip";
import { stableStopDateRange } from "./trip-facts.ts";
import { parseIsoDate } from "./trip-lifecycle.ts";

function safeExternalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Prefer the search response's attributable handoff and never expose an unsafe provider URL. */
export function bookingDemandHandoffUrl(input: {
  deepLinkUrl?: string;
  searchUrl?: string;
  detailWebUrl?: string;
  detailUrl?: string;
}): string | undefined {
  return [input.deepLinkUrl, input.searchUrl, input.detailWebUrl, input.detailUrl]
    .map(safeExternalUrl)
    .find(Boolean);
}

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
