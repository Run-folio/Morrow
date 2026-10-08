import { allocateTripNights, tripNightsBetween } from './night-allocation.ts';
import type { CanonicalEasyTTrip } from './trip.ts';

/** Existing allocation flags prove generation only while the occurrence and
 * count still agree. Missing/legacy provenance never authorizes redistribution. */
export function generatedFlexibleStopIds(trip: CanonicalEasyTTrip): Set<string> {
  const result = new Set<string>();
  if (trip.brief.intent.route.orderAuthority === 'legacy_preserved') return result;
  const manual = new Set(trip.brief.manualNightStopIds ?? []);
  const locks = trip.brief.scheduleLocks;
  // A dated commitment/booking constrains the surrounding calendar too.
  if (trip.brief.bookings?.length || Object.keys(locks?.arrivalDates ?? {}).length
    || trip.brief.intent.hardConstraints.fixedCommitments.some(c => c.date || c.commitmentType === 'booking')) return result;
  for (const stop of trip.stops) {
    const proof = trip.brief.nightAllocation?.stops.find(s => s.stopId === stop.id);
    if (proof?.isManual !== false || proof.isFixed !== false || proof.nights !== stop.nights
      || trip.brief.nightAllocation?.allocations?.[stop.id] !== stop.nights || manual.has(stop.id)
      || locks?.stopIds.includes(stop.id)
      || trip.brief.intent.route.destinations.some(i => i.stopIds.includes(stop.id) && i.requestedNights !== null)
      || trip.brief.intent.hardConstraints.fixedCommitments.some(c => c.stopId === stop.id)
      || trip.brief.selectedPlaces[stop.id]?.length
      || trip.brief.itineraryIdeas?.some(i => i.stopId === stop.id)) continue;
    const authored = trip.planItems.some(day => {
      if (day.stopId !== stop.id) return false;
      const {id,stopId: _stop,date: _date,dayNumber: _number,contextNotes: _generated,...content} = day;
      const blank = {type:'open',title:`Flexible day in ${stop.name}`,reason:'Plan this day around your preferences.',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null};
      // JSONB may reorder object keys; compare the exact allowed content fields,
      // retaining protection for any additional/changed authored field.
      const contentMatches = Object.keys(content).length === Object.keys(blank).length
        && Object.entries(blank).every(([key, value]) => JSON.stringify((content as Record<string, unknown>)[key]) === JSON.stringify(value));
      return !id.startsWith(`${trip.id}-calendar:`) || !contentMatches
        || Boolean(trip.brief.dayNotes?.[day.dayNumber]?.length || trip.brief.customActivities?.[day.dayNumber]?.length)
        || Boolean(trip.brief.mapPins?.some(pin => pin.dayNumber === day.dayNumber));
    });
    if (!authored) result.add(stop.id);
  }
  return result;
}

/** Allocate within the existing dates, reserving unresolved/partly bound source
 * budgets. This is part of the single accepted candidate, never a manual edit. */
export function allocateGeneratedBuilderNights(trip: CanonicalEasyTTrip, flexible: Set<string>) {
  if (!flexible.size) return;
  const held = trip.brief.intent.route.destinations.reduce((sum, intent) => {
    if (intent.requestedNights === null) return sum;
    const bound = trip.stops.filter(s => intent.stopIds.includes(s.id)).reduce((n,s)=>n+(s.nights??0),0);
    return sum + Math.max(0,intent.requestedNights-bound);
  },0);
  const budget = tripNightsBetween(trip.startDate,trip.endDate) - held;
  if (budget < 0) return;
  const allocation = allocateTripNights({totalNights:budget,
    stops:trip.stops.map(stop=>({...stop,
      required: !trip.brief.intent.hardConstraints.optionalStopIds.includes(stop.id),
      fixedNights:flexible.has(stop.id)?undefined:stop.nights??0})),
    pace:trip.brief.intent.preferences.pace,interests:trip.brief.intent.preferences.interests});
  if (!allocation.allocations) return;
  for (const stop of trip.stops) if (flexible.has(stop.id)) stop.nights = allocation.allocations[stop.id] ?? 0;
}

export function allRequiredStaysHaveNights(trip: CanonicalEasyTTrip): boolean {
  const required = trip.brief.intent.route.destinations.filter(i => i.routeMembership === 'required' && i.kind === 'overnight_place');
  return trip.stops.every(s => trip.brief.intent.hardConstraints.optionalStopIds.includes(s.id) || (s.nights??0)>0)
    && required.every(i => i.stopIds.length > 0 && i.stopIds.every(id => (trip.stops.find(s=>s.id===id)?.nights??0)>0));
}
