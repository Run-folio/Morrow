import assert from 'node:assert/strict';
import test from 'node:test';
import {buildOmioRouteSearchLink,OMIO_TRACKING_BASE} from '../lib/easyt/omio-search-link.ts';
import {omioBookingActionForLeg,buildBookingReadiness} from '../lib/easyt/booking-readiness.ts';
import {cityReturnTrip} from './fixtures/omio-return.ts';
import {gatewayReturnTrip,returnTripForPlaces} from './fixtures/gateway-return.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {readTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {itineraryTransportAgenda} from '../lib/easyt/itinerary-transport-agenda.ts';
import {prepareAcceptedBuilderEdit,type BuilderAcceptedEdit} from '../lib/easyt/trip-builder-edit.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {prepareBuilderNecessaryProjection} from '../lib/easyt/trip-builder-reconciliation.ts';
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

test('validated airport-to-town return retains both legs across serialization and sends both dates',()=>{
 const original=gatewayReturnTrip(),before=structuredClone(original);
 const read=readTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(original))));assert.equal(read.kind,'readable');
 if(read.kind!=='readable')return;
 const trip=read.trip;assert.equal(trip.legs.length,2);assert.equal(itineraryTransportAgenda(trip).length,2);
 assert.equal(trip.legs[1].toEndpoint?.name,'London Gatwick Airport');
 const actions=trip.legs.map(leg=>omioBookingActionForLeg(trip,leg,now)!);
 assert.ok(actions.every(action=>action?.returnSearch),'both flight legs must expose the closed return search');
 assert.equal(actions[0].href,actions[1].href);
 const search=inner(actions[0].href);assert.equal(search.searchParams.get('departurePosTerm'),'London Gatwick Airport, United Kingdom');
 assert.equal(search.searchParams.get('arrivalPosTerm'),'Cairns, Australia');
 assert.equal(search.searchParams.get('departureDate'),'2026-12-11');assert.equal(search.searchParams.get('returnDate'),'2026-12-21');
 assert.deepEqual(original,before);
});

test('one-way gateway trip is not silently converted into a return journey',()=>{
 const trip=gatewayReturnTrip({mode:'unknown'}),before=structuredClone(trip);
 assert.equal(trip.brief.intent.route.tripType,'one_way');assert.equal(trip.legs.length,1);assert.equal(itineraryTransportAgenda(trip).length,1);
 const action=omioBookingActionForLeg(trip,trip.legs[0],now)!;assert.ok(action);assert.equal(action.returnSearch,undefined);
 assert.equal(inner(action.href).searchParams.has('returnDate'),false);assert.deepEqual(trip,before);
});

test('pairing covers accepted town and airport identities rather than a named route exception',()=>{
 const town=selectedTransferPlace('Cairns','Australia','reference:geonames:2172797','endpoint');
 const airport=selectedTransferPlace('Cairns','Australia','reference:ourairports:26904','endpoint');
 const london=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','stop');
 const paris=selectedTransferPlace('Paris','France','reference:geonames:2988507','stop');
 for(const [from,to] of [[town,london],[airport,paris]]) {
  const trip=returnTripForPlaces(from,[to]),before=structuredClone(trip);
  assert.equal(trip.legs.length,2);
  const typedBefore=structuredClone(trip),actions=trip.legs.map(leg=>omioBookingActionForLeg(trip,leg,now)!);
  assert.ok(actions.every(action=>action?.returnSearch));assert.equal(actions[0].href,actions[1].href);
  const search=inner(actions[0].href);assert.equal(search.searchParams.get('departurePosTerm'),`${from.name}, ${from.country}`);
  assert.equal(search.searchParams.get('arrivalPosTerm'),`${to.name}, ${to.country}`);assert.equal(search.searchParams.get('returnDate'),trip.endDate);
  assert.deepEqual(trip,typedBefore);assert.equal(before.brief.intent.route.journeyEnd.mode,'same_as_start');
 }
});

test('multi-stop open-jaw return retains final gateway leg and its own date without fabricating a closed search',()=>{
 const base=gatewayReturnTrip(),origin=base.brief.intent.route.origin!;
 const cairns=selectedTransferPlace('Cairns','Australia','reference:geonames:2172797','stop');
 const chengdu=selectedTransferPlace('Chengdu','China','reference:geonames:1815286','stop');
 const source=returnTripForPlaces(origin,[cairns,chengdu]),read=readTripDocument(JSON.parse(JSON.stringify(source)));assert.equal(read.kind,'readable');
 if(read.kind!=='readable')return;
 const trip=read.trip,before=structuredClone(trip);assert.equal(trip.legs.length,3);assert.equal(itineraryTransportAgenda(trip).length,3);
 const back=trip.legs.at(-1)!,action=omioBookingActionForLeg(trip,back,now)!;assert.ok(action);assert.equal(action.returnSearch,undefined);
 const search=inner(action.href);assert.equal(search.searchParams.get('departureDate'),trip.endDate);assert.equal(search.searchParams.has('returnDate'),false);
 assert.equal(back.toEndpoint?.name,'London Gatwick Airport');assert.deepEqual(trip,before);
});

test('supported one-way/return and date edits preserve the intended gateway topology through reload',()=>{
 let trip=gatewayReturnTrip();
 for(const [edit,count] of [
  [{kind:'type',tripType:'one_way'},1],
  [{kind:'type',tripType:'return_to_start'},2],
  [{kind:'dates',startDate:'2026-12-13',endDate:'2026-12-23'},2],
 ] as [BuilderAcceptedEdit,number][]) {
  const before=structuredClone(trip),edited=prepareAcceptedBuilderEdit(trip,edit,builderDocumentFingerprint(trip));assert.ok(edited.ok);
  const projected=prepareBuilderNecessaryProjection(trip,edited.trip,edited.scope);assert.ok(projected.ok);
  const read=readTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(projected.trip))));assert.equal(read.kind,'readable');
  if(read.kind!=='readable')return;
  assert.deepEqual(trip,before);trip=read.trip;
  assert.equal(trip.legs.length,count);const agenda=itineraryTransportAgenda(trip);assert.equal(agenda.length,count);
  if(count===2){assert.equal(trip.legs.at(-1)!.toEndpoint?.name,'London Gatwick Airport');assert.equal(agenda.at(-1)!.date,trip.endDate);}
 }
 assert.equal(trip.endDate,'2026-12-23');
});
