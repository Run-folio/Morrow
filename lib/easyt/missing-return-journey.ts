import type {CanonicalRouteEndpoint,EasyTTrip} from './trip.ts';
import {canonicalRouteEndpoints,originEndpointForTrip,routeEndpointForLeg} from './trip-legs.ts';
import {transferEndpointGeographicallyReady} from './geographic-binding.ts';
import {sameJourneyPlace} from './journey-endpoints.ts';
import {transportBookingForLeg,travellerTransportBookingMismatchForLeg} from './transport-booking.ts';

type BlockReason='unverified-route'|'ambiguous-topology'|'saved-journey-data'|'inconsistent-dates';
export type MissingReturnJourney = {kind:'not-needed'}|{kind:'blocked';reason:BlockReason}
 |{kind:'repairable';legId:string;from:CanonicalRouteEndpoint;to:CanonicalRouteEndpoint;date:string};
const same=(a:CanonicalRouteEndpoint,b:CanonicalRouteEndpoint)=>sameJourneyPlace(
 {...a,coordinates:a.coordinates??undefined},{...b,coordinates:b.coordinates??undefined});
const isoDate=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
 &&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

/** Read-only eligibility: restore only the absent final edge of an otherwise
 * exact route. Never reconstruct, replace or infer an existing saved journey. */
export function missingReturnJourney(trip:EasyTTrip):MissingReturnJourney {
 try{return classifyMissingReturnJourney(trip);}catch{return {kind:'blocked',reason:'unverified-route'};}
}
function classifyMissingReturnJourney(trip:EasyTTrip):MissingReturnJourney {
 const route=trip.brief.intent?.route;
 if(route?.tripType!=='return_to_start'||route.journeyEnd.mode!=='same_as_start')return {kind:'not-needed'};
 const blocked=(reason:BlockReason):MissingReturnJourney=>({kind:'blocked',reason});
 if(trip.schemaVersion!==2||trip.brief.journeyEnd?.mode!=='same_as_start'||!route.origin)return blocked('unverified-route');
 const endpoints=canonicalRouteEndpoints(trip),to=endpoints.at(-1),from=endpoints.at(-2);
 // The last overnight stay can already be the original start: no extra leg.
 if(!from||!to||to.kind!=='end')return {kind:'not-needed'};
 if(trip.legs.some(leg=>leg.fromStopId===from.id&&leg.toStopId===to.id))return {kind:'not-needed'};
 if(endpoints.some(endpoint=>!transferEndpointGeographicallyReady(endpoint))
  ||!same(originEndpointForTrip(trip),{...route.origin,id:to.id,kind:'origin',coordinates:route.origin.coordinates??null})
  ||!same(originEndpointForTrip(trip),to))return blocked('unverified-route');
 if(trip.legs.length!==endpoints.length-2||new Set(trip.legs.map(leg=>leg.id)).size!==trip.legs.length)return blocked('ambiguous-topology');
 for(const [index,leg] of trip.legs.entries()){
  const a=endpoints[index],b=endpoints[index+1],actualFrom=routeEndpointForLeg(trip,leg,'from'),actualTo=routeEndpointForLeg(trip,leg,'to');
  if(!a||!b||leg.fromStopId!==a.id||leg.toStopId!==b.id||!actualFrom||!actualTo||!same(actualFrom,a)||!same(actualTo,b)
   ||leg.fromEndpoint&&(!transferEndpointGeographicallyReady(leg.fromEndpoint)||!same(leg.fromEndpoint,a))
   ||leg.toEndpoint&&(!transferEndpointGeographicallyReady(leg.toEndpoint)||!same(leg.toEndpoint,b)))return blocked('ambiguous-topology');
 }
 const last=trip.stops.find(stop=>stop.id===from.id);
 if(!isoDate(trip.startDate)||!isoDate(trip.endDate)||trip.endDate<trip.startDate||!last
  ||last.departureDate!==null&&last.departureDate!==trip.endDate
  ||last.arrivalDate!==null&&(!isoDate(last.arrivalDate)||last.arrivalDate>trip.endDate))return blocked('inconsistent-dates');
 const legId=`${trip.id}-leg:${encodeURIComponent(from.id)}:${encodeURIComponent(to.id)}`,ids=new Set(trip.legs.map(leg=>leg.id));
 const stops=new Set(trip.stops.map(stop=>stop.id));
 if(ids.has(legId)||Object.keys(trip.brief.flightSearchAirportsByLeg??{}).some(id=>!ids.has(id))
  ||Object.keys(trip.brief.decisionSelections?.transportByLeg??{}).some(id=>!ids.has(id))
  ||trip.brief.cascadeStatus?.routeReconciliation?.residual.some(unit=>unit.kind==='leg'&&!ids.has(unit.targetId))
  ||trip.planItems.some(day=>!stops.has(day.stopId))
  ||trip.brief.scheduleLocks?.stopIds.some(id=>!stops.has(id))
  ||Object.keys(trip.brief.scheduleLocks?.arrivalDates??{}).some(id=>!stops.has(id)))return blocked('saved-journey-data');
 for(const booking of trip.brief.bookings??[]){
  if(booking.type!=='transport')continue;
  if(booking.transportLegBinding){if(!ids.has(booking.transportLegBinding.legId))return blocked('saved-journey-data');}
  else if(trip.legs.filter(leg=>transportBookingForLeg(trip,leg,routeEndpointForLeg(trip,leg,'from')??undefined,routeEndpointForLeg(trip,leg,'to')??undefined)?.id===booking.id).length!==1)return blocked('saved-journey-data');
 }
 if(trip.legs.some(leg=>travellerTransportBookingMismatchForLeg(trip,leg)))return blocked('saved-journey-data');
 return {kind:'repairable',legId,from,to,date:trip.endDate};
}
