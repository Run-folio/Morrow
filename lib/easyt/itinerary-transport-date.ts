import type {CanonicalRouteEndpoint,EasyTTrip,TripLeg} from './trip.ts';
const isIsoDate = (value: string | null | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export function itineraryDateForLeg(trip: EasyTTrip, leg: TripLeg, to: CanonicalRouteEndpoint) {
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

