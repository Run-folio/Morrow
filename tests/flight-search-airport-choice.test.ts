import assert from 'node:assert/strict';
import test from 'node:test';
import {airportChoiceFromSuggestion,flightSearchAirportPlan,flightSearchAirportBasis} from '../lib/easyt/flight-search-airport-choice.ts';
import {setFlightSearchAirports,omioBookingActionForLeg} from '../lib/easyt/booking-readiness.ts';
import {searchReferencePlaces,referencePlaceById} from '../lib/easyt/place-reference.server.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {prepareTripDocumentForWrite,requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
const airport=(query:string)=>{const r=referencePlaceById(searchReferencePlaces(query)[0]?.canonicalPlaceId??'')!;assert(r);return airportChoiceFromSuggestion({canonicalPlaceId:r.canonicalPlaceId,name:r.canonicalName,country:r.countryCode,coordinates:[...r.coordinates],referenceSnapshotId:REFERENCE_SNAPSHOT_ID,scheduledService:r.scheduledService,placeType:r.placeType,provenance:[{id:r.providerId}]});};
const orly=()=>airport('ORY')!,gatwick=()=>airport('LGW')!;

test('return search defaults to the chosen outbound departure airport after reload without storing a duplicate',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts');
 const source=cityReturnTrip(),out=source.legs[0],back=source.legs.at(-1)!;
 const selected=setFlightSearchAirports(source,out.id,{from:gatwick(),to:null},flightSearchAirportBasis(source,out)!);
 const restored=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(selected)))),before=structuredClone(restored);
 const plan=flightSearchAirportPlan(restored,restored.legs.at(-1)!)!;
 assert.equal(plan.to.endpoint.canonicalPlaceId,gatwick().endpoint.canonicalPlaceId);
 assert.equal(plan.to.selected,false);assert.equal(plan.to.inherited,true);assert.equal(plan.to.assumed,false);
 assert.equal(restored.brief.flightSearchAirportsByLeg?.[back.id],undefined);
 const action=omioBookingActionForLeg(restored,restored.legs.at(-1)!,new Date('2026-11-05'))!;
 assert.ok(action);const search=new URL(new URL(action.href).searchParams.get('u')!);
 assert.match(search.searchParams.get('departurePosTerm')!+(search.searchParams.get('arrivalPosTerm')??''),/Gatwick/);
 assert.deepEqual(restored,before);assert.deepEqual(selected.legs,source.legs);
});

test('reciprocal effective airport choices share both dates without ignoring a different explicit return airport',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts');
 const source=cityReturnTrip(),out=source.legs[0],back=source.legs.at(-1)!,now=new Date('2026-11-05');
 const trip=setFlightSearchAirports(source,out.id,{from:gatwick(),to:null},flightSearchAirportBasis(source,out)!);
 const actions=trip.legs.map(leg=>omioBookingActionForLeg(trip,leg,now)!);assert(actions.every(action=>action.returnSearch));
 assert.equal(actions[0].href,actions[1].href);const search=new URL(new URL(actions[0].href).searchParams.get('u')!);
 assert.equal(search.searchParams.get('departureDate'),trip.startDate);assert.equal(search.searchParams.get('returnDate'),trip.endDate);
 assert.equal(search.searchParams.get('departurePosTerm'),`${gatwick().endpoint.name}, ${gatwick().endpoint.country}`);
 const separate=setFlightSearchAirports(trip,back.id,{from:null,to:airport('STN')!},flightSearchAirportBasis(trip,back)!);
 assert.equal(omioBookingActionForLeg(separate,out,now)?.returnSearch,undefined);
 assert.equal(omioBookingActionForLeg(separate,back,now)?.returnSearch,undefined);
});

test('explicit return airport wins and reset restores the current outbound default',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts');
 const source=cityReturnTrip(),out=source.legs[0],back=source.legs.at(-1)!;
 let trip=setFlightSearchAirports(source,out.id,{from:gatwick(),to:null},flightSearchAirportBasis(source,out)!);
 trip=setFlightSearchAirports(trip,back.id,{from:orly(),to:airport('STN')!},flightSearchAirportBasis(trip,back)!);
 assert.equal(flightSearchAirportPlan(trip,back)!.to.endpoint.canonicalPlaceId,airport('STN')!.endpoint.canonicalPlaceId);
 assert.equal(flightSearchAirportPlan(trip,back)!.to.inherited,false);
 trip=setFlightSearchAirports(trip,back.id,null,flightSearchAirportBasis(trip,back)!);
 assert.equal(flightSearchAirportPlan(trip,back)!.to.endpoint.canonicalPlaceId,gatwick().endpoint.canonicalPlaceId);
 trip=setFlightSearchAirports(trip,out.id,{from:airport('STN')!,to:null},flightSearchAirportBasis(trip,out)!);
 assert.equal(flightSearchAirportPlan(trip,back)!.to.endpoint.canonicalPlaceId,airport('STN')!.endpoint.canonicalPlaceId);
 trip=setFlightSearchAirports(trip,out.id,null,flightSearchAirportBasis(trip,out)!);
 assert.equal(flightSearchAirportPlan(trip,back)!.to.inherited,false);
 assert.match(flightSearchAirportPlan(trip,back)!.to.endpoint.name,/Heathrow/);
});

async function domesticReturn(reverse=false){
 const {returnTripForPlaces}=await import('./fixtures/gateway-return.ts');
 const london=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');
 const row=searchReferencePlaces('Manchester',{explicitCountryNames:['United Kingdom']}).find(p=>p.placeType==='city')!;assert(row);
 const manchester=selectedTransferPlace('Manchester','United Kingdom',row.canonicalPlaceId!,'stop');
 const trip=returnTripForPlaces(reverse?manchester:london,[reverse?london:manchester]);
 // Explicit planning-flight fixture: this validates choices, not service availability.
 trip.legs=trip.legs.map(leg=>({...leg,mode:'flight',provenance:'planning_estimate',routeMetadata:{}}));return trip;
}
test('same-country null return destination validates against the inherited airport on both write and read',async()=>{
 const source=await domesticReturn(),out=source.legs[0],back=source.legs.at(-1)!;
 let trip=setFlightSearchAirports(source,out.id,{from:gatwick(),to:airport('MAN')!},flightSearchAirportBasis(source,out)!);
 trip=setFlightSearchAirports(trip,back.id,{from:airport('LHR')!,to:null},flightSearchAirportBasis(trip,back)!);
 assert.notEqual(trip,source);const plan=flightSearchAirportPlan(trip,back)!;
 assert.equal(plan.stale,false);assert.equal(plan.from.selected,true);assert.equal(plan.from.endpoint.canonicalPlaceId,airport('LHR')!.endpoint.canonicalPlaceId);
 assert.equal(plan.to.endpoint.canonicalPlaceId,gatwick().endpoint.canonicalPlaceId);assert.equal(plan.to.inherited,true);
 assert.equal(trip.brief.flightSearchAirportsByLeg![back.id].to,null);
});
test('outbound airport changes preserve but stale a conflicting return choice and reject a new identical pair',async()=>{
 const source=await domesticReturn(),out=source.legs[0],back=source.legs.at(-1)!;
 let trip=setFlightSearchAirports(source,back.id,{from:gatwick(),to:null},flightSearchAirportBasis(source,back)!);
 const retained=structuredClone(trip.brief.flightSearchAirportsByLeg![back.id]);
 trip=setFlightSearchAirports(trip,out.id,{from:gatwick(),to:airport('MAN')!},flightSearchAirportBasis(trip,out)!);
 const plan=flightSearchAirportPlan(trip,back)!;assert.equal(plan.stale,true);assert.equal(plan.sameAirport,false);
 assert.deepEqual(trip.brief.flightSearchAirportsByLeg![back.id],retained);
 assert.equal(setFlightSearchAirports(trip,back.id,{from:gatwick(),to:null},flightSearchAirportBasis(trip,back)!),trip);
 const reset=setFlightSearchAirports(trip,back.id,null,flightSearchAirportBasis(trip,back)!);
 assert.equal(flightSearchAirportPlan(reset,back)!.to.inherited,true);
 assert.equal(flightSearchAirportPlan(reset,back)!.to.endpoint.canonicalPlaceId,gatwick().endpoint.canonicalPlaceId);
});
test('an inherited same-airport search remains editable and exposes no misleading provider handoff',async()=>{
 const source=await domesticReturn(true),out=source.legs[0],back=source.legs.at(-1)!;
 const trip=setFlightSearchAirports(source,out.id,{from:airport('LHR')!,to:airport('MAN')!},flightSearchAirportBasis(source,out)!);
 const {canEditFlightSearchAirports}=await import('../lib/easyt/booking-readiness.ts');
 for(const input of [trip,{...trip,brief:{...trip.brief,flightSearchAirportsByLeg:{...trip.brief.flightSearchAirportsByLeg,[back.id]:{version:1 as const,basis:flightSearchAirportBasis(trip,back)!,from:null,to:null}}}}]){
  const before=structuredClone(input),plan=flightSearchAirportPlan(input,back)!;
  assert.equal(plan.to.inherited,true);assert.equal(plan.sameAirport,true);
  assert.equal(canEditFlightSearchAirports(input,back),true);
  assert.equal(omioBookingActionForLeg(input,back,new Date('2026-11-05')),null);assert.deepEqual(input,before);
 }
});

test('multi-stop return follows original outbound airport after reload, while one-way and explicit different ends do not',async()=>{
 const {returnTripForPlaces}=await import('./fixtures/gateway-return.ts');
 const origin=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');
 const cairns=selectedTransferPlace('Cairns','Australia','reference:geonames:2172797','stop');
 const chengdu=selectedTransferPlace('Chengdu','China','reference:geonames:1815286','stop');
 const paris=selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint');
 for(const end of [{mode:'same_as_start' as const},{mode:'unknown' as const},{mode:'explicit' as const,place:paris}]){
  const source=returnTripForPlaces(origin,[cairns,chengdu],end),out=source.legs[0];
  const selected=setFlightSearchAirports(source,out.id,{from:gatwick(),to:airport('CNS')!},flightSearchAirportBasis(source,out)!);
  assert.notEqual(selected,source);
  const trip=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(selected)))),before=structuredClone(trip),back=trip.legs.at(-1)!;
  const plan=flightSearchAirportPlan(trip,back)!;assert(plan);
  assert.equal(plan.to.inherited,end.mode==='same_as_start');
  if(end.mode==='same_as_start'){
   assert.equal(trip.legs.length,3);assert.equal(plan.to.endpoint.canonicalPlaceId,gatwick().endpoint.canonicalPlaceId);
   const action=omioBookingActionForLeg(trip,back,new Date('2026-11-05'))!;assert(action);
   const search=new URL(new URL(action.href).searchParams.get('u')!);assert.equal(search.searchParams.get('arrivalPosTerm'),`${gatwick().endpoint.name}, ${gatwick().endpoint.country}`);
   assert.equal(search.searchParams.get('departureDate'),trip.endDate);
  }else if(end.mode==='unknown')assert.equal(trip.legs.length,2);
  else assert.equal(back.toEndpoint?.canonicalPlaceId,paris.canonicalPlaceId);
  assert.deepEqual(trip,before);assert.deepEqual(selected.legs,source.legs);
 }
});

test('a first overnight stay at the original start preserves that outbound airport without using the trip-start date for its later flight',async()=>{
 const {returnTripForPlaces}=await import('./fixtures/gateway-return.ts');
 const origin=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');
 const paris=selectedTransferPlace('Paris','France','reference:geonames:2988507','stop');
 const source=returnTripForPlaces(origin,[origin,paris]);source.legs=source.legs.map(leg=>({...leg,mode:'flight',provenance:'planning_estimate',routeMetadata:{}}));
 const out=source.legs[0],back=source.legs.at(-1)!;assert.equal(out.fromEndpoint?.kind,'stop');
 const trip=setFlightSearchAirports(source,out.id,{from:gatwick(),to:null},flightSearchAirportBasis(source,out)!);
 assert.equal(flightSearchAirportPlan(trip,back)!.to.endpoint.canonicalPlaceId,gatwick().endpoint.canonicalPlaceId);
 assert.equal(flightSearchAirportPlan(trip,back)!.to.inherited,true);
 const action=omioBookingActionForLeg(trip,out,new Date('2026-11-05'))!;assert(action);assert.equal(action.returnSearch,undefined);
 const query=new URL(new URL(action.href).searchParams.get('u')!);assert.equal(query.searchParams.get('departureDate'),trip.stops[0].departureDate);
 assert.notEqual(query.searchParams.get('departureDate'),trip.startDate);
});

test('bookings, confirmed or explicit flight parts and stale choices are never replaced by an outbound default',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts');
 const {markTransportLegBooked}=await import('../lib/easyt/transport-booking.ts');
 const source=cityReturnTrip(),out=source.legs[0],back=source.legs.at(-1)!;
 const selected=setFlightSearchAirports(source,out.id,{from:gatwick(),to:null},flightSearchAirportBasis(source,out)!);
 const booked=markTransportLegBooked(selected,back.id,{confirmation:'RETAIN-RETURN',note:'Synthetic manual record'}),bookedBefore=structuredClone(booked);
 assert.equal(flightSearchAirportPlan(booked,back)!.to.inherited,false);assert.equal(omioBookingActionForLeg(booked,back,new Date('2026-11-05')),null);assert.deepEqual(booked,bookedBefore);
 const legacy={...selected,brief:{...selected.brief,bookings:[{id:`transport-${back.id}`,type:'transport' as const,title:'Saved return',date:selected.endDate,confirmation:'KEEP',url:null}]}};
 assert.equal(flightSearchAirportPlan(legacy,back)!.to.inherited,false);
 const confirmed={...back,routeMetadata:{confirmed:true}};assert.equal(flightSearchAirportPlan(selected,confirmed),null);
 const original=flightSearchAirportPlan(source,back)!;
 const parts={...back,segments:[{id:'explicit-return-flight',mode:'flight' as const,fromEndpoint:original.from.endpoint,toEndpoint:original.to.endpoint,durationMinutes:null,distanceKm:null,provider:null,provenance:'planning_estimate' as const,confidence:'unknown' as const,scheduleNeedsChecking:true}]};
 assert.equal(flightSearchAirportPlan(selected,parts)!.to.inherited,false);assert.match(flightSearchAirportPlan(selected,parts)!.to.endpoint.name,/Heathrow/);
 const stale={...selected,brief:{...selected.brief,flightSearchAirportsByLeg:{...selected.brief.flightSearchAirportsByLeg,[back.id]:{version:1 as const,basis:'old-geography',from:null,to:airport('STN')!}}}},before=structuredClone(stale);
 assert.equal(flightSearchAirportPlan(stale,back)!.stale,true);assert.equal(flightSearchAirportPlan(stale,back)!.to.inherited,false);assert.deepEqual(stale,before);
 const malformed={...selected,legs:[{...out,segments:[null] as never},back]};
 assert.equal(flightSearchAirportPlan(malformed,back)!.to.inherited,false);
});
function fixture(){const trip=canonicalRouteFixture(); const from=selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint'),to=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');trip.legs=[{id:'air-choice',fromStopId:'from',toStopId:'to',fromEndpoint:{...from,id:'from',kind:'origin',coordinates:from.coordinates!},toEndpoint:{...to,id:'to',kind:'end',coordinates:to.coordinates!},mode:'flight',durationMinutes:null,distanceKm:null,provider:null,provenance:'planning_estimate',routeMetadata:{}}];return trip;}
test('accepts only current pinned scheduled airport suggestions',()=>{
 const valid=orly();assert(valid);assert.match(valid.endpoint.canonicalPlaceId!,/ourairports/);
 assert.equal(airportChoiceFromSuggestion({name:'Tokyo',country:'Japan',canonicalPlaceId:'tokyo',placeType:'city'}),null);
 assert.equal(airportChoiceFromSuggestion({name:'Fake',country:'Japan',canonicalPlaceId:'reference:ourairports:123',placeType:'transport_gateway',scheduledService:true,coordinates:[1,2],referenceSnapshotId:'old'}),null);
});
test('explicit search airports survive JSON reload without rewriting canonical route, timings or mode choice',()=>{
 const source=fixture(),leg=source.legs[0],before=structuredClone(source),basis=flightSearchAirportBasis(source,leg)!;
 const next=setFlightSearchAirports(source,leg.id,{from:orly(),to:gatwick()},basis);
 assert.notEqual(next,source);assert.deepEqual(next.legs,source.legs);assert.deepEqual(next.stops,source.stops);
 const plan=flightSearchAirportPlan(next,leg)!;assert.equal(plan.from.endpoint.canonicalPlaceId,orly().endpoint.canonicalPlaceId);assert.equal(plan.from.selected,true);
 const restored=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(next))));
 assert.deepEqual(restored.brief.flightSearchAirportsByLeg,next.brief.flightSearchAirportsByLeg);assert.deepEqual(source,before);
});
test('rejects stale save, wrong-country and identical-airport pairs',()=>{
 const source=fixture(),leg=source.legs[0],basis=flightSearchAirportBasis(source,leg)!;
 assert.equal(setFlightSearchAirports(source,leg.id,{from:orly(),to:gatwick()},'stale'),source);
 assert.equal(setFlightSearchAirports(source,leg.id,{from:gatwick(),to:orly()},basis),source);
 assert.equal(setFlightSearchAirports(source,leg.id,{from:orly(),to:orly()},basis),source);
});
test('changed geography makes the retained choice stale; date edits retain only airport identity',()=>{
 const source=fixture(),leg=source.legs[0],next=setFlightSearchAirports(source,leg.id,{from:orly(),to:gatwick()},flightSearchAirportBasis(source,leg)!);
 assert.equal(flightSearchAirportPlan({...next,startDate:'2027-05-01'},leg)?.from.selected,true);
 const changed={...leg,fromEndpoint:{...leg.fromEndpoint!,name:'Changed city'}};
 assert.equal(flightSearchAirportPlan(next,changed)?.stale,true);assert.equal(flightSearchAirportPlan(next,changed)?.from.selected,false);
 assert(next.brief.flightSearchAirportsByLeg?.[leg.id]);
});
test('booked or confirmed legs reject edits; reset preserves booking and other choices',()=>{
 const source=fixture(),leg=source.legs[0],basis=flightSearchAirportBasis(source,leg)!;
 const booked={...source,brief:{...source.brief,bookings:[{id:`transport-${leg.id}`,type:'transport' as const,title:'Synthetic booking',date:'2027-04-01',confirmation:'KEEP',url:null}]}};
 assert.equal(setFlightSearchAirports(booked,leg.id,{from:orly(),to:gatwick()},basis),booked);
 const confirmed={...source,legs:[{...leg,routeMetadata:{confirmed:true}}]};assert.equal(setFlightSearchAirports(confirmed,leg.id,{from:orly(),to:gatwick()},basis),confirmed);
 const next=setFlightSearchAirports(source,leg.id,{from:orly(),to:gatwick()},basis),reset=setFlightSearchAirports(next,leg.id,null,basis);
 assert.deepEqual(reset.brief.flightSearchAirportsByLeg,{});assert.deepEqual(reset.brief.bookings,source.brief.bookings);
});

test('selected airports replace city-return handoff with a truthful one-way airport search, then reset restores pairing',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts');
 const source=cityReturnTrip(),leg=source.legs[0],now=new Date('2026-11-04T00:00:00Z');
 const paired=omioBookingActionForLeg(source,leg,now)!;assert(paired.returnSearch);
 const next=setFlightSearchAirports(source,leg.id,{from:gatwick(),to:orly()},flightSearchAirportBasis(source,leg)!);
 const action=omioBookingActionForLeg(next,leg,now)!;assert(!action.returnSearch);
 const inner=new URL(new URL(action.href).searchParams.get('u')!);
 assert.equal(inner.searchParams.get('departurePosTerm'),`${gatwick().endpoint.name}, ${gatwick().endpoint.country}`);
 assert.equal(inner.searchParams.get('arrivalPosTerm'),`${orly().endpoint.name}, ${orly().endpoint.country}`);
 assert.equal(inner.searchParams.get('returnDate'),null);assert.equal(inner.searchParams.get('travelMode'),'FLIGHT');
 const reset=setFlightSearchAirports(next,leg.id,null,flightSearchAirportBasis(next,leg)!);
 assert(omioBookingActionForLeg(reset,leg,now)?.returnSearch);
 assert.deepEqual(next.legs,source.legs);assert.deepEqual(next.brief.bookings,source.brief.bookings);
});
test('clearing a selected airport cannot silently reuse its old value when no default exists',()=>{
 const source=fixture(),leg=source.legs[0];
 const plain={...leg,fromEndpoint:{...leg.fromEndpoint!,canonicalPlaceId:'synthetic:unmapped-city',providerId:undefined,geographicBinding:undefined}};
 const trip={...source,legs:[plain]},basis=flightSearchAirportBasis(trip,plain)!;
 const next=setFlightSearchAirports(trip,plain.id,{from:orly(),to:gatwick()},basis);assert.notEqual(next,trip);
 assert.equal(setFlightSearchAirports(next,plain.id,{from:null,to:gatwick()},basis),next);
});

test('read boundary rejects a malformed effective pair instead of searching one airport to itself',()=>{
 const trip=fixture(),leg=trip.legs[0];leg.toEndpoint={...leg.fromEndpoint!,id:'other',name:'Another French town'};
 trip.brief.flightSearchAirportsByLeg={[leg.id]:{version:1,basis:flightSearchAirportBasis(trip,leg)!,from:orly(),to:orly()}};
 const plan=flightSearchAirportPlan(trip,leg)!;assert.equal(plan.stale,true);assert.equal(plan.from.selected,false);assert.equal(plan.to.selected,false);
});
test('a fabricated but self-consistent reference key is not a pinned scheduled airport',async()=>{
 const {referenceRecordKey}=await import('../lib/easyt/place-reference.ts');
 const id='999999999',coordinates:[number,number]=[137,36];
 assert.equal(airportChoiceFromSuggestion({name:'Invented airport',country:'Japan',canonicalPlaceId:`reference:ourairports:${id}`,coordinates,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,scheduledService:true,placeType:'transport_gateway',provenance:[{id:referenceRecordKey({source:'ourairports',sourceId:id,countryCode:'JP',placeType:'transport_gateway',coordinates},REFERENCE_SNAPSHOT_ID)}]}),null);
});
test('compact identities are exactly the scheduled, coded airports in the integrity-pinned source',async()=>{
 const {readFileSync}=await import('node:fs'),{createHash}=await import('node:crypto');
 const manifest=JSON.parse(readFileSync('data/place-reference/manifest.json','utf8')),bytes=readFileSync('data/place-reference/airports.json');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files.find((f:{path:string})=>f.path==='airports.json').sha256);
 const projection=JSON.parse(readFileSync('data/place-reference/scheduled-airport-identities.json','utf8'));
 assert.equal(projection.snapshotId,REFERENCE_SNAPSHOT_ID);
 assert.deepEqual(projection.airports,JSON.parse(bytes.toString()).filter((r:unknown[])=>r[8]===true&&r[5]!=='closed_airport'&&!!r[6]).map((r:unknown[])=>r.slice(0,5)));
});

test('later explicit saved airport segments supersede a retained search preference after reload',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts');
 const source=cityReturnTrip(),leg=source.legs[0],next=setFlightSearchAirports(source,leg.id,{from:gatwick(),to:orly()},flightSearchAirportBasis(source,leg)!);
 const plan=flightSearchAirportPlan(source,leg)!;
 next.legs[0]={...leg,segments:[{id:'explicit',mode:'flight',fromEndpoint:plan.from.endpoint,toEndpoint:plan.to.endpoint,durationMinutes:null,distanceKm:null,provider:null,provenance:'planning_estimate',confidence:'unknown',scheduleNeedsChecking:true}]};
 const restored=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(next))));
 const actual=flightSearchAirportPlan(restored,restored.legs[0])!;
 assert.equal(actual.stale,true);assert.equal(actual.from.selected,false);assert.equal(actual.to.selected,false);
 assert.equal(actual.from.endpoint.canonicalPlaceId,plan.from.endpoint.canonicalPlaceId);assert.equal(actual.to.endpoint.canonicalPlaceId,plan.to.endpoint.canonicalPlaceId);
 const action=omioBookingActionForLeg(restored,restored.legs[0],new Date('2026-11-04T00:00:00Z'))!;
 assert.match(decodeURIComponent(new URL(action.href).searchParams.get('u')!),/Heathrow/);
 assert(restored.brief.flightSearchAirportsByLeg?.[leg.id]);
});

test('non-reference explicit gateway flight parts also supersede retained search preferences',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts'),{canEditFlightSearchAirports}=await import('../lib/easyt/booking-readiness.ts');
 const trip=cityReturnTrip(),leg=trip.legs[0],next=setFlightSearchAirports(trip,leg.id,{from:gatwick(),to:orly()},flightSearchAirportBasis(trip,leg)!);
 const from={...leg.fromEndpoint!,kind:'gateway' as const,canonicalPlaceId:'legacy:departure-airport'},to={...leg.toEndpoint!,kind:'gateway' as const,canonicalPlaceId:'legacy:arrival-airport'};
 const explicit={...leg,segments:[{id:'legacy-airports',mode:'flight' as const,fromEndpoint:from,toEndpoint:to,durationMinutes:null,distanceKm:null,provider:null,provenance:'planning_estimate' as const,confidence:'unknown' as const,scheduleNeedsChecking:true}]};
 assert.equal(canEditFlightSearchAirports(next,explicit),false);assert.equal(flightSearchAirportPlan(next,explicit)?.from.selected,false);assert.equal(flightSearchAirportPlan(next,explicit)?.stale,true);
});

test('undoing a manual booked mark restores airport editing without losing retained booking details',async()=>{
 const {cityReturnTrip}=await import('./fixtures/omio-return.ts');
 const {markTransportLegBooked,unmarkTransportBooking}=await import('../lib/easyt/transport-booking.ts');
 const {canEditFlightSearchAirports}=await import('../lib/easyt/booking-readiness.ts');
 const source=cityReturnTrip(),leg=source.legs[0];
 const marked=markTransportLegBooked(source,leg.id,{confirmation:'SYNTHETIC-KEEP',note:'Retain these synthetic details'});
 assert.equal(canEditFlightSearchAirports(marked,marked.legs[0]),false);
 const booking=marked.brief.bookings![0],undone=unmarkTransportBooking(marked,booking.id);
 const reloaded=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(undone))));
 assert.equal(canEditFlightSearchAirports(reloaded,reloaded.legs[0]),true);
 const edited=setFlightSearchAirports(reloaded,leg.id,{from:gatwick(),to:orly()},flightSearchAirportBasis(reloaded,reloaded.legs[0])!);
 assert.notEqual(edited,reloaded);assert.deepEqual(edited.legs,reloaded.legs);
 assert.deepEqual(edited.brief.bookings,reloaded.brief.bookings);
 assert.equal(edited.brief.bookings![0].confirmation,'SYNTHETIC-KEEP');
 assert.equal(edited.brief.bookings![0].travellerMarkedBooked,false);
 const mismatch=structuredClone(reloaded);mismatch.brief.bookings![0].transportLegBinding!.fromLabel='Earlier route';
 assert.equal(canEditFlightSearchAirports(mismatch,mismatch.legs[0]),false,'retained mismatched booking details still require review');
});
