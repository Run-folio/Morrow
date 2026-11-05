import {itineraryDateForLeg} from './itinerary-transport-date.ts';
import type {CanonicalRouteEndpoint,EasyTTrip,TripLeg} from './trip.ts';
import {routeEndpointForLeg,stopEndpoint} from './trip-legs.ts';
import {transferEndpointGeographicallyReady} from './geographic-binding.ts';
import {effectiveTripLeg} from './transport-mode-choice.ts';
import {flightPlanningAirports} from './flight-airport-assumptions.ts';
import {flightSearchAirportPlan} from './flight-search-airport-choice.ts';
import {validOmioDepartureDate} from './omio-search-link.ts';

const searchPlace=(p:CanonicalRouteEndpoint|null):p is CanonicalRouteEndpoint=>!!p&&(['city','town'].includes(p.geographicBinding?.placeType??'')
 ||p.geographicBinding?.placeType==='transport_gateway'&&p.canonicalPlaceId?.startsWith('reference:ourairports:')===true)&&transferEndpointGeographicallyReady(p);
const samePlace=(a:CanonicalRouteEndpoint,b:CanonicalRouteEndpoint)=>searchPlace(a)&&searchPlace(b)&&a.canonicalPlaceId===b.canonicalPlaceId&&a.providerId===b.providerId&&a.name===b.name&&a.country===b.country&&a.coordinates?.every((n,i)=>n===b.coordinates?.[i]);
const explicitGateway=(p:CanonicalRouteEndpoint)=>p.kind==='gateway'||p.geographicBinding?.placeType==='transport_gateway'||p.canonicalPlaceId?.startsWith('reference:ourairports:');
/** Read-only pairing of accepted route endpoints, never an airport inference or saved booking mutation. */
export function qualifiedFlightReturnSearch(trip:EasyTTrip,requested:TripLeg,now:Date,isBooked:(leg:TripLeg)=>boolean,agendaDate?:string|null){
 if(trip.brief.journeyEnd?.mode!=='same_as_start'||trip.legs.length<2||new Set(trip.legs.map(l=>l.id)).size!==trip.legs.length)return null;
 const legs=trip.legs.map(l=>effectiveTripLeg(trip,l)),out=legs[0],back=legs.at(-1)!;
 if(requested.id!==out.id&&requested.id!==back.id||requested.mode!=='flight')return null;
 const of=routeEndpointForLeg(trip,out,'from'),ot=routeEndpointForLeg(trip,out,'to'),bf=routeEndpointForLeg(trip,back,'from'),bt=routeEndpointForLeg(trip,back,'to');
 if(!searchPlace(of)||!searchPlace(ot)||!searchPlace(bf)||!searchPlace(bt)||of.kind!=='origin'||bt.kind!=='end'||!samePlace(of,bt)||!samePlace(ot,bf)||samePlace(of,ot))return null;
 // Repeated or unqualified visits make a closed return search ambiguous.
 const stops=trip.stops.map(stopEndpoint);
 if(stops.some((s,i)=>!searchPlace(s)||samePlace(s,of)||stops.slice(0,i).some(prior=>samePlace(prior,s))))return null;
 if(trip.stops[0]?.id!==out.toStopId||trip.stops.at(-1)?.id!==back.fromStopId)return null;
 for(let i=1;i<legs.length;i++)if(legs[i-1].toStopId!==legs[i].fromStopId)return null;
 for(const leg of [out,back]){
  const from=routeEndpointForLeg(trip,leg,'from'),to=routeEndpointForLeg(trip,leg,'to');
  if(!searchPlace(from)||!searchPlace(to)||!searchPlace(leg.fromEndpoint??null)||!searchPlace(leg.toEndpoint??null)||!samePlace(from,leg.fromEndpoint!)||!samePlace(to,leg.toEndpoint!))return null;
  if(leg.segments!==undefined&&(!Array.isArray(leg.segments)||leg.segments.some(s=>!s||!s.fromEndpoint||!s.toEndpoint||explicitGateway(s.fromEndpoint)||explicitGateway(s.toEndpoint))))return null;
  if(leg.mode!=='flight'||isBooked(leg)||!flightPlanningAirports(leg))return null;
  if((trip.brief.bookings??[]).some(b=>b.type==='transport'&&b.transportLegBinding?.legId===leg.id))return null;
 }
 const departureDate=trip.startDate,returnDate=trip.endDate;
 if(!validOmioDepartureDate(departureDate,now)||!validOmioDepartureDate(returnDate,now)||returnDate!<=departureDate!||trip.stops[0]?.arrivalDate!==departureDate||trip.stops.at(-1)?.departureDate!==returnDate)return null;
 if(itineraryDateForLeg(trip,out,ot).date!==departureDate||itineraryDateForLeg(trip,back,bt).date!==returnDate)return null;
 if(agendaDate!==undefined&&agendaDate!==(requested.id===out.id?departureDate:returnDate))return null;
 const outward=flightSearchAirportPlan(trip,out),inward=flightSearchAirportPlan(trip,back);
 if(!outward||!inward||outward.stale||inward.stale||outward.sameAirport||inward.sameAirport)return null;
 const customized=outward.from.selected||outward.to.selected||inward.from.selected||inward.to.selected||inward.to.inherited;
 if(customized&&(!samePlace(outward.from.endpoint,inward.to.endpoint)||!samePlace(outward.to.endpoint,inward.from.endpoint)))return null;
 const origin=customized?outward.from.endpoint:of,destination=customized?outward.to.endpoint:ot;
 return {outboundLegId:out.id,returnLegId:back.id,originName:origin.name,originCountry:origin.country!,destinationName:destination.name,destinationCountry:destination.country!,departureDate:departureDate!,returnDate:returnDate!};
}
