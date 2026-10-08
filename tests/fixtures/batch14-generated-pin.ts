import { canonicalRouteFixture } from './batch14-route-documents.ts';
import { prepareTripDocumentForWrite, requireReadableTripDocument } from '../../lib/easyt/trip-document.ts';
import { allocateTripNights } from '../../lib/easyt/night-allocation.ts';
import { projectBuilderCalendar } from '../../lib/easyt/trip-builder-calendar.ts';
import { routeProjectionInputKey } from '../../lib/easyt/trip-route-intent.ts';
import type { PlannerMapPin } from '../../lib/easyt/trip.ts';

/** Synthetic generated 7/7 calendar, round-tripped through the real document boundary. */
export function generatedPinFixture(pinDays: number[] = [7]) {
  let trip = requireReadableTripDocument(canonicalRouteFixture());
  trip.endDate = '2026-10-24';
  trip.stops = trip.stops.slice(0, 2).map(stop => ({ ...stop, nights: 7, arrivalDate: null, departureDate: null }));
  trip.planItems = [];
  Object.assign(trip.brief, { bookings: [], manualNightStopIds: [], itineraryIdeas: [], selectedPlaces: {}, dayNotes: {}, customActivities: {}, mapPins: [] });
  trip.brief.intent.route.orderAuthority = 'optimizable';
  trip.brief.intent.route.orderedStopIds = trip.stops.map(stop => stop.id);
  trip.brief.intent.route.destinations = trip.brief.intent.route.destinations.slice(0, 2).map(intent => ({ ...intent, requestedNights: null }));
  trip.brief.nightAllocations = { tokyo: 7, kyoto: 7 };
  trip.brief.nightAllocation = allocateTripNights({ totalNights: 14, stops: trip.stops });
  trip.brief.nightAllocation.stops = trip.brief.nightAllocation.stops.map(stop => ({ ...stop, nights: 7, isManual: false, isFixed: false }));
  trip.brief.nightAllocation.allocations = { tokyo: 7, kyoto: 7 };
  trip = requireReadableTripDocument(projectBuilderCalendar(trip, trip).trip);
  trip.brief.mapPins = pinDays.map((dayNumber, index): PlannerMapPin => ({
    id: `authored-pin:${index}`, title: 'My chosen meeting point', dayNumber,
    category: 'activity', longitude: 139.7, latitude: 35.7,
  }));
  trip.brief.intent.route.projectionInputKey = routeProjectionInputKey(trip);
  return requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
}
