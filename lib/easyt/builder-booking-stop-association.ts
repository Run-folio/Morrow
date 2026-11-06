import type {EasyTTrip,TripBooking} from './trip.ts';
import {routeEndpointForLeg} from './trip-legs.ts';

type AssociationOptions = {includeLegacyDateOnly?:boolean};

function legacyBookingStopIds(trip:EasyTTrip,booking:TripBooking,options:AssociationOptions):string[]{
 const named=trip.stops.filter(stop=>booking.title.toLocaleLowerCase().includes(stop.name.toLocaleLowerCase()));
 const dated=named.filter(stop=>booking.date&&stop.arrivalDate&&stop.departureDate&&booking.date>=stop.arrivalDate&&booking.date<stop.departureDate);
 if(options.includeLegacyDateOnly)return trip.stops.filter(stop=>named.includes(stop)||booking.date&&stop.arrivalDate&&stop.departureDate&&booking.date>=stop.arrivalDate&&booking.date<stop.departureDate).map(stop=>stop.id);
 return (dated.length?dated:named).map(stop=>stop.id);
}

/** Verified occurrence identity outranks display names. Stale references retain
 * surviving associations and conservative legacy protection until reviewed. */
export function builderBookingStopIds(trip:EasyTTrip,booking:TripBooking,options:AssociationOptions={}):string[]{
 const ids=new Set(trip.stops.map(stop=>stop.id));
 if(booking.type==='transport'){
  const binding=booking.transportLegBinding;
  if(binding&&booking.travellerMarkedBooked===false)return [];
  if(binding){
   const leg=trip.legs.find(candidate=>candidate.id===binding.legId);
   const from=leg?routeEndpointForLeg(trip,leg,'from'):null;
   const to=leg?routeEndpointForLeg(trip,leg,'to'):null;
   const referenced=[binding.fromEndpointId,binding.toEndpointId];
   if(from?.id===binding.fromEndpointId&&to?.id===binding.toEndpointId)return [...new Set(referenced)].filter(id=>ids.has(id));
   return [...new Set([...referenced,...(leg?[leg.fromStopId,leg.toStopId]:[]),...legacyBookingStopIds(trip,booking,options)])].filter(id=>ids.has(id));
  }
  const legs=trip.legs.filter(leg=>booking.id===leg.id||booking.id===`transport-${leg.id}`||leg.routeMetadata.importedBookingId===booking.id);
  if(legs.length)return [...new Set(legs.flatMap(leg=>[leg.fromStopId,leg.toStopId]))].filter(id=>ids.has(id));
 }
 const exact=trip.stops.find(stop=>booking.id===`stay-${stop.id}`);
 if(exact)return [exact.id];
 return legacyBookingStopIds(trip,booking,options);
}
