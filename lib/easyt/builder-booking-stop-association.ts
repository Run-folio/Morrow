import type {EasyTTrip,TripBooking} from './trip.ts';

/** Booking identity outranks display names, particularly on repeat visits.
 * Unbound legacy records retain their existing conservative protection. */
export function builderBookingStopIds(trip:EasyTTrip,booking:TripBooking,options:{includeLegacyDateOnly?:boolean}={}):string[]{
 const ids=new Set(trip.stops.map(stop=>stop.id));
 if(booking.type==='transport'){
  const binding=booking.transportLegBinding;
  if(binding&&booking.travellerMarkedBooked===false)return [];
  if(binding)return [...new Set([binding.fromEndpointId,binding.toEndpointId])].filter(id=>ids.has(id));
  const legs=trip.legs.filter(leg=>booking.id===leg.id||booking.id===`transport-${leg.id}`||leg.routeMetadata.importedBookingId===booking.id);
  if(legs.length)return [...new Set(legs.flatMap(leg=>[leg.fromStopId,leg.toStopId]))].filter(id=>ids.has(id));
 }
 const exact=trip.stops.find(stop=>booking.id===`stay-${stop.id}`);
 if(exact)return [exact.id];
 const named=trip.stops.filter(stop=>booking.title.toLocaleLowerCase().includes(stop.name.toLocaleLowerCase()));
 const dated=named.filter(stop=>booking.date&&stop.arrivalDate&&stop.departureDate&&booking.date>=stop.arrivalDate&&booking.date<stop.departureDate);
 if(options.includeLegacyDateOnly)return trip.stops.filter(stop=>named.includes(stop)||booking.date&&stop.arrivalDate&&stop.departureDate&&booking.date>=stop.arrivalDate&&booking.date<stop.departureDate).map(stop=>stop.id);
 return (dated.length?dated:named).map(stop=>stop.id);
}
