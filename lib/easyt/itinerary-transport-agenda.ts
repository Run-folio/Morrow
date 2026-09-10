import { transportBookingForLeg } from "./booking-readiness.ts";
import { routeEndpointForLeg } from "./trip-legs.ts";
import type { CanonicalRouteEndpoint, EasyTTrip, TripBooking, TripLeg } from "./trip.ts";

export type ItineraryTransportAgendaStatus = "booked" | "available" | "confirm";

export type ItineraryTransportAgendaLeg = {
  leg: TripLeg;
  from: CanonicalRouteEndpoint;
  to: CanonicalRouteEndpoint;
  date: string | null;
  dayNumber: number | null;
  booking: TripBooking | null;
  status: ItineraryTransportAgendaStatus;
};

const isIsoDate = (value: string | null | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

function itineraryDateForLeg(trip: EasyTTrip, leg: TripLeg, to: CanonicalRouteEndpoint) {
  if (to.kind === "end") return isIsoDate(trip.endDate) ? { date: trip.endDate, dayNumber: null } : { date: null, dayNumber: null };

  const arrivalDay = [...trip.planItems]
    .filter((day) => day.stopId === leg.toStopId && isIsoDate(day.date))
    .sort((left, right) => left.dayNumber - right.dayNumber)[0];
  if (arrivalDay) return { date: arrivalDay.date, dayNumber: arrivalDay.dayNumber };

  const stop = trip.stops.find((candidate) => candidate.id === leg.toStopId);
  return {
    date: isIsoDate(stop?.arrivalDate) ? stop.arrivalDate : null,
    dayNumber: null,
  };
}

export function itineraryTransportAgendaStatus(leg: TripLeg, booking: TripBooking | null): ItineraryTransportAgendaStatus {
  if (booking?.type === "transport") return "booked";
  const duration = leg.doorToDoorMinutes ?? leg.durationMinutes;
  if (leg.mode === "unknown" || typeof duration !== "number" || leg.scheduleNeedsChecking || leg.confidence === "low" || leg.confidence === "unknown") return "confirm";
  return "available";
}

/**
 * Read-only itinerary projection. Canonical trip legs, endpoints and bookings
 * remain the sole durable owners of transport state.
 */
export function itineraryTransportAgenda(trip: EasyTTrip): ItineraryTransportAgendaLeg[] {
  return trip.legs.flatMap((leg) => {
    const from = routeEndpointForLeg(trip, leg, "from");
    const to = routeEndpointForLeg(trip, leg, "to");
    if (!from || !to || from.id === to.id) return [];

    const fromStop = trip.stops.find((stop) => stop.id === leg.fromStopId);
    const toStop = trip.stops.find((stop) => stop.id === leg.toStopId);
    const booking = transportBookingForLeg(trip, leg, fromStop, toStop) ?? null;
    return [{
      leg,
      from,
      to,
      ...itineraryDateForLeg(trip, leg, to),
      booking,
      status: itineraryTransportAgendaStatus(leg, booking),
    }];
  });
}
