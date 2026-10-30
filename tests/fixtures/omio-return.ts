import {defaultTripIntent} from '../../lib/easyt/trip.ts';
import {routeIntentFromLegacyTrip} from '../../lib/easyt/trip-route-intent.ts';
import {readTripDocument} from '../../lib/easyt/trip-document.ts';
import {capturedPhilippinesTrip} from './philippines-captured.ts';
import {selectedTransferPlace} from './accepted-transfer-place.ts';
import {buildCanonicalTripLegs} from '../../lib/easyt/trip-legs.ts';
export function cityReturnTrip(){
 const trip=capturedPhilippinesTrip();trip.id='trip-omio-return-fixture';trip.title='London and Paris';trip.startDate='2026-12-11';trip.endDate='2026-12-16';
 const origin=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');
 const place=selectedTransferPlace('Paris','France','reference:geonames:2988507','stop');
 trip.brief={origin:origin.name,originCountry:origin.country,originCoordinates:origin.coordinates,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,journeyEnd:{mode:'same_as_start'},mustDo:'',pace:'balanced',hotelChanges:'balanced',budgetBand:'mid',selectedPlaces:{},intent:{...trip.brief.intent!,route:{...trip.brief.intent!.route,origin,journeyEnd:{mode:'same_as_start'}}}} as any;
 trip.stops=[{...trip.stops[0],id:'paris-stay',order:0,name:place.name,country:place.country!,canonicalPlaceId:place.canonicalPlaceId,providerId:place.providerId,geographicBinding:place.geographicBinding,latitude:place.coordinates![1],longitude:place.coordinates![0],arrivalDate:trip.startDate,departureDate:trip.endDate,nights:5}];
 trip.legs=buildCanonicalTripLegs({tripId:trip.id,origin:{...origin,coordinates:origin.coordinates!},journeyEnd:trip.brief.journeyEnd,stops:trip.stops}).map(l=>({...l,mode:'flight',provenance:'planning_estimate',durationMinutes:240,doorToDoorMinutes:240,provider:'Planning estimate',routeMetadata:{}}));
 trip.planItems=[];trip.recommendations=[];
 trip.brief.intent={...defaultTripIntent({stopIds:trip.stops.map(s=>s.id),durationDays:6}),version:2,route:{...routeIntentFromLegacyTrip(trip),origin}} as any;
 const checked=readTripDocument(trip);if(checked.kind!=='readable')throw new Error(JSON.stringify(checked));return checked.trip;
}
