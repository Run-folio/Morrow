import { canonicalRouteFixture } from './batch14-route-documents.ts';
import { requireReadableTripDocument } from '../../lib/easyt/trip-document.ts';
import { buildCanonicalTripLegs } from '../../lib/easyt/trip-legs.ts';
import { routeProjectionInputKey } from '../../lib/easyt/trip-route-intent.ts';
import type { PlanItem } from '../../lib/easyt/trip.ts';

/** Sanitized four-stay A17 ancestor; identities and quantities are explicit. */
export function a17TripFixture() {
 const trip=requireReadableTripDocument(canonicalRouteFixture());
 trip.id='batch14-a17';trip.title='Hanoi, Hue, Hoi An and Ho Chi Minh City';trip.status='planned';
 trip.startDate='2026-11-01';trip.endDate='2026-11-13';trip.brief.intent.timing.durationDays=13;
 const date=(day:number)=>`2026-11-${String(day).padStart(2,'0')}`;
 const places=[{id:'hanoi',name:'Hanoi',coordinates:[105.854,21.0283],nights:3},{id:'hue',name:'Hue',coordinates:[107.5863,16.4639],nights:2},{id:'hoi-an',name:'Hoi An',coordinates:[108.3319,15.8796],nights:4},{id:'ho-chi-minh-city',name:'Ho Chi Minh City',coordinates:[106.7166,10.7737],nights:3}];
 let day=1;
 trip.stops=places.map((place,order)=>{const arrivalDate=date(day);day+=place.nights;return {id:place.id,order,name:place.name,country:'Vietnam',canonicalPlaceId:place.id,longitude:place.coordinates[0],latitude:place.coordinates[1],nights:place.nights,arrivalDate,departureDate:date(day)}});
 const origin={name:'London',country:'United Kingdom',canonicalPlaceId:'london',coordinates:[-.1276,51.5072] as [number,number]};
 Object.assign(trip.brief,{origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originCoordinates:origin.coordinates,
  manualNightStopIds:trip.stops.map(stop=>stop.id),nightAllocations:Object.fromEntries(trip.stops.map(stop=>[stop.id,stop.nights])),
  bookings:[{id:'stay-hanoi',type:'stay',title:'Hanoi stay',date:trip.startDate,confirmation:'sanitized-booking'}],
 });
 trip.brief.intent.hardConstraints={originRequired:true,mustSeeStopIds:[],optionalStopIds:[],fixedCommitments:[],avoidDriving:false};
 trip.brief.intent.route={version:1,origin,tripType:'one_way',journeyEnd:{mode:'unknown'},orderAuthority:'manual',explicitIntentIds:null,orderedStopIds:trip.stops.map(stop=>stop.id),projectionInputKey:null,
  destinations:trip.stops.map(stop=>({id:`intent:${stop.id}`,sourceText:stop.name,kind:'overnight_place',selectedPlace:{name:stop.name,country:stop.country,canonicalPlaceId:stop.canonicalPlaceId,coordinates:[stop.longitude!,stop.latitude!] as [number,number]},resolution:'resolved',requestedNights:stop.nights,routeMembership:'required',stopIds:[stop.id]}))};
 trip.brief.journeyEnd={mode:'unknown'};
 trip.legs=buildCanonicalTripLegs({tripId:trip.id,origin,journeyEnd:trip.brief.intent.route.journeyEnd,stops:trip.stops});
 day=1;trip.planItems=trip.stops.flatMap(stop=>Array.from({length:stop.nights!},()=>{const current=day++;return {id:`a17-day-${current}`,stopId:stop.id,dayNumber:current,date:date(current),type:'activity',title:`${stop.name} day`,reason:'Fixture day',notes:stop.id==='hue'?['Traveller Hue note']:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null} as PlanItem}));
 trip.planItems.push({...trip.planItems.at(-1)!,id:'a17-day-13',dayNumber:13,date:date(13),type:'transport',title:'Departure'});
 trip.recommendations=[];trip.brief.intent.route.projectionInputKey=routeProjectionInputKey(trip);
 return requireReadableTripDocument(trip);
}
