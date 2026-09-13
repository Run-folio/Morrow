import type { EasyTTrip, TripBooking, TripStop } from "./trip";
import type { JourneyLocalPlace } from "./local-place.ts";
import { mappedPlacePinId } from "./map-place-itinerary.ts";
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
  const stays = (trip.brief.bookings ?? []).filter((booking) => booking.type === "stay");
  const exact = stays.find((booking) => booking.id === `stay-${stop.id}`);
  if (exact) return exact;
  const dated = stays.find((booking) => datesReady && parseIsoDate(booking.date) !== null && booking.date! >= stop.arrivalDate! && booking.date! < stop.departureDate!);
  if (dated) return dated;
  const repeatedDestination = trip.stops.filter((candidate) => candidate.name.trim().toLocaleLowerCase() === stopName).length > 1;
  return repeatedDestination || !stopName
    ? undefined
    : stays.find((booking) => booking.title.toLocaleLowerCase().includes(stopName));
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
  location?: string;
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
    location: draft.location === undefined ? existing?.location ?? null : draft.location.trim() || null,
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

/** Save a mapped property to its stop without turning accommodation into a daypart activity. */
export function selectMappedStayForStop(trip: EasyTTrip, stopId: string, place: JourneyLocalPlace): EasyTTrip {
  const stop = trip.stops.find((candidate) => candidate.id === stopId);
  const firstDay = trip.planItems.filter((day) => day.stopId === stopId).sort((left, right) => left.dayNumber - right.dayNumber)[0];
  if (!stop || !firstDay) return trip;
  const withBooking = upsertStayBooking(trip, stopId, { title: place.name, location: place.address });
  const pinId = mappedPlacePinId(firstDay.dayNumber, "stay", place);
  const stopDays = new Set(trip.planItems.filter((day) => day.stopId === stopId).map((day) => day.dayNumber));
  const retainedPins = (withBooking.brief.mapPins ?? []).filter((pin) => pin.category !== "stay" || !stopDays.has(pin.dayNumber) || pin.id === pinId);
  if (retainedPins.some((pin) => pin.id === pinId) && retainedPins.length === (withBooking.brief.mapPins ?? []).length) return withBooking;
  return {
    ...withBooking,
    brief: {
      ...withBooking.brief,
      mapPins: [...retainedPins.filter((pin) => pin.id !== pinId), {
        id: pinId,
        title: place.name,
        category: "stay",
        dayNumber: firstDay.dayNumber,
        longitude: place.coordinates[0],
        latitude: place.coordinates[1],
      }],
    },
  };
}

export function removeMappedStayForStop(trip: EasyTTrip, stopId: string, place?: JourneyLocalPlace): EasyTTrip {
  const stopDays = new Set(trip.planItems.filter((day) => day.stopId === stopId).map((day) => day.dayNumber));
  const withoutBooking = removeStayBooking(trip, stopId);
  const normalizedName = place?.name.trim().toLocaleLowerCase();
  return {
    ...withoutBooking,
    brief: {
      ...withoutBooking.brief,
      mapPins: (withoutBooking.brief.mapPins ?? []).filter((pin) => !(
        pin.category === "stay"
        && stopDays.has(pin.dayNumber)
        && (!normalizedName || pin.title.trim().toLocaleLowerCase() === normalizedName)
      )),
    },
  };
}
