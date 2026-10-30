import assert from 'node:assert/strict';
import test from 'node:test';
import {buildOmioRouteSearchLink,OMIO_TRACKING_BASE} from '../lib/easyt/omio-search-link.ts';
import {omioBookingActionForLeg,buildBookingReadiness} from '../lib/easyt/booking-readiness.ts';
import {cityReturnTrip} from './fixtures/omio-return.ts';
const now=new Date('2026-10-27T00:00:00Z');
const inner=(url:string)=>new URL(new URL(url).searchParams.get('u')!);
test('shared helper validates return flight dates and preserves both URL encoding layers',()=>{
 const input={mode:'flight',originName:'A & B',originCountry:'Country',destinationName:'C/D',destinationCountry:'Elsewhere',departureDate:'2026-12-11',returnDate:'2026-12-16',now};
 const url=buildOmioRouteSearchLink(input)!;assert.equal(new URL(url).origin+new URL(url).pathname,OMIO_TRACKING_BASE);const search=inner(url);assert.equal(search.searchParams.get('returnDate'),input.returnDate);assert.equal(search.searchParams.get('departurePosTerm'),'A & B, Country');assert.equal(search.searchParams.get('arrivalPosTerm'),'C/D, Elsewhere');assert.match(url,/%2526/);
 for(const value of ['2026-12-10','2026-12-11','2026-02-30','bad',''])assert.equal(buildOmioRouteSearchLink({...input,returnDate:value}),null);
 assert.equal(buildOmioRouteSearchLink({...input,mode:'train'}),null);
 assert.equal(inner(buildOmioRouteSearchLink({...input,returnDate:undefined})!).searchParams.has('returnDate'),false);
});
test('both qualified city legs offer the same return search without altering itinerary or saved state',()=>{
 const trip=cityReturnTrip(),before=JSON.stringify(trip);assert.equal(trip.legs.length,2);
 const actions=trip.legs.map(l=>omioBookingActionForLeg(trip,l,now)!);assert.ok(actions.every(Boolean));assert.equal(actions[0].cta,'Return search');assert.equal(actions[1].cta,'Return search');assert.equal(actions[0].href,actions[1].href);
 const search=inner(actions[0].href);assert.equal(search.searchParams.get('departurePosTerm'),'London, United Kingdom');assert.equal(search.searchParams.get('arrivalPosTerm'),'Paris, France');assert.equal(search.searchParams.get('departureDate'),trip.startDate);assert.equal(search.searchParams.get('returnDate'),trip.endDate);
 assert.equal(buildBookingReadiness(trip,{},now).filter(a=>a.cta==='Return search').length,1);assert.equal(JSON.stringify(trip),before);
});
test('open jaw, repeated cities, changed identity, confirmed/airport/booked and nonflight cases are not paired',()=>{
 const changes=[(t:any)=>t.brief.journeyEnd={mode:'unknown'},(t:any)=>t.stops.push({...t.stops[0],id:'repeat',order:1}), (t:any)=>t.stops[0].providerId+='changed', (t:any)=>t.legs[1].routeMetadata.confirmed=true,(t:any)=>t.legs[1].provenance='provider',(t:any)=>t.legs[1].mode='train',(t:any)=>t.brief.bookings=[{id:'transport-'+t.legs[1].id,type:'transport',title:'Booked return'}],(t:any)=>t.legs[1].segments=[{mode:'flight',fromEndpoint:{...t.legs[1].fromEndpoint,kind:'gateway',canonicalPlaceId:'reference:ourairports:4185'},toEndpoint:t.legs[1].toEndpoint}]];
 for(const change of changes){const trip=cityReturnTrip();change(trip);const before=JSON.stringify(trip);assert.notEqual(omioBookingActionForLeg(trip,trip.legs[0],now)?.cta,'Return search');assert.equal(JSON.stringify(trip),before);}
});
test('mismatched agenda dates never silently become another return search date',()=>{const t=cityReturnTrip();assert.notEqual(omioBookingActionForLeg(t,t.legs[1],now,'2026-12-17')?.cta,'Return search');});

test('explicit saved gateway snapshots and malformed segments cannot masquerade as city return pairs',()=>{
 for(const change of [(t:any)=>t.legs[0].fromEndpoint={...t.legs[0].fromEndpoint,kind:'gateway',canonicalPlaceId:'reference:ourairports:2434'},(t:any)=>t.legs[0].segments=[{}],(t:any)=>t.legs[0].segments=[null]]){
  const trip=cityReturnTrip();change(trip);assert.notEqual(omioBookingActionForLeg(trip,trip.legs[1],now)?.cta,'Return search');
 }
});

test('both agenda dates must agree before either side offers a return search',()=>{
 const trip=cityReturnTrip();trip.planItems=[{id:'shifted',stopId:trip.stops[0].id,dayNumber:1,date:'2026-12-12',type:'arrival',title:'Later arrival',reason:'',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}];
 assert.notEqual(omioBookingActionForLeg(trip,trip.legs[1],now,trip.endDate)?.cta,'Return search');
});
