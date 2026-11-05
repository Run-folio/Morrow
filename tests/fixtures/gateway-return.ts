import {tripFromBuilder,type JourneyEndSelection,type JourneyEndpointPlace} from '../../lib/easyt/trip.ts';
import {selectedTransferPlace} from './accepted-transfer-place.ts';

/** Current pinned selections; no assumed airport, timetable or provider result. */
export function gatewayReturnTrip(journeyEnd:JourneyEndSelection={mode:'same_as_start'}) {
 const origin=selectedTransferPlace('Gatwick','United Kingdom','reference:ourairports:2429','endpoint');
 const destination=selectedTransferPlace('Cairns','Australia','reference:geonames:2172797','stop');
 return returnTripForPlaces(origin,[destination],journeyEnd);
}
export function returnTripForPlaces(origin:JourneyEndpointPlace,destinations:JourneyEndpointPlace[],journeyEnd:JourneyEndSelection={mode:'same_as_start'}) {
 const stops=destinations.map((destination,i)=>({id:`synthetic-stay-${i}`,...destination,country:destination.country!}));
 return tripFromBuilder({id:'synthetic-gateway-return',origin:origin.name,originCountry:origin.country,
  originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,
  routeIntent:{version:1,origin,tripType:journeyEnd.mode==='same_as_start'?'return_to_start':'one_way',journeyEnd,
   destinations:[],orderAuthority:'manual',explicitIntentIds:null,orderedStopIds:[],projectionInputKey:null},
  journeyEnd,stops,startDate:'2026-12-11',endDate:'2026-12-21',
  picks:{},mustDo:'Synthetic return regression only',pace:'slow',hotels:'few',budget:'mid',draft:[],nightAllocations:Object.fromEntries(stops.map(stop=>[stop.id,10/stops.length]))});
}
