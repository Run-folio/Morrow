import {buildCanonicalTripLegs} from '../../lib/easyt/trip-legs.ts';
import {selectedTransferPlace} from './accepted-transfer-place.ts';
import type {RoadRoutingProvider} from '../../lib/easyt/road-routing.ts';
export function comparisonLeg() {
 const origin=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint','london');
 const to=selectedTransferPlace('Edinburgh','United Kingdom','reference:geonames:2650225','stop','edinburgh');
 return buildCanonicalTripLegs({tripId:'comparison-test',origin:{...origin,coordinates:origin.coordinates!},stops:[{id:'edinburgh-occurrence',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],arrivalDate:null,departureDate:null,nights:2}]})[0]!;
}
export function syntheticRoad(onCall=()=>{}) : RoadRoutingProvider {
 return {provider:'openrouteservice',async route(input){onCall();return {mode:'road',distanceKm:650,durationMinutes:480,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-26T00:00:00.000Z',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Synthetic fixture'};}};
}
