import {japanTrip} from './transport-choice.ts';
import {markTransportLegBooked} from '../../lib/easyt/transport-booking.ts';
import type {CanonicalRouteEndpoint, TransferSegment} from '../../lib/easyt/trip.ts';

/** Synthetic UI evidence only: these parts make no claim about real services. */
export function savedJourneyPartsTrip(complete = false, booked = false) {
  const trip = structuredClone(japanTrip());
  trip.id = `synthetic-saved-parts-${complete ? 'complete' : 'gaps'}${booked ? '-booked' : ''}`;
  trip.title = 'Synthetic saved journey parts';
  const leg = trip.legs[0]!;
  const from = leg.fromEndpoint!, to = leg.toEndpoint!;
  const airport = (id:string,name:string):CanonicalRouteEndpoint => ({kind:'gateway',id,canonicalPlaceId:`synthetic:${id}`,name,country:'Japan',coordinates:null});
  const departure = airport('departure-airport','Synthetic departure airport'), arrival = airport('arrival-airport','Synthetic arrival airport');
  const part = (id:string,mode:TransferSegment['mode'],fromEndpoint:CanonicalRouteEndpoint,toEndpoint:CanonicalRouteEndpoint):TransferSegment => ({id,mode,fromEndpoint,toEndpoint,durationMinutes:null,distanceKm:null,provider:null,provenance:'planning_estimate',confidence:'unknown',scheduleNeedsChecking:true});
  Object.assign(leg,{mode:complete ? 'mixed' : 'flight',durationMinutes:null,doorToDoorMinutes:null,headlineMinutes:null,provider:null,provenance:'planning_estimate',confidence:'unknown',routeMetadata:{},segments:[
    ...(complete ? [part('synthetic-access','train',from,departure)] : []),
    part('synthetic-flight','flight',departure,arrival),
    ...(complete ? [part('synthetic-onward','road',arrival,to)] : []),
  ]});
  return booked ? markTransportLegBooked(trip,leg.id) : trip;
}
