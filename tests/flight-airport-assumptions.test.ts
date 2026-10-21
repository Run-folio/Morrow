import assert from 'node:assert/strict';
import test from 'node:test';
import {flightPlanningAirports,flightAirportAssumptionLabel,FLIGHT_AIRPORT_DEFAULTS} from '../lib/easyt/flight-airport-assumptions.ts';
import {referencePlaceById,searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {omioBookingActionForLeg} from '../lib/easyt/booking-readiness.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import type {CanonicalRouteEndpoint,TripLeg} from '../lib/easyt/trip.ts';
const endpoint=(query:string,country:string):CanonicalRouteEndpoint=>{
 const row=searchReferencePlaces(query,{explicitCountryNames:[country]})[0]!;
 const owner={name:row.canonicalName,country,canonicalPlaceId:row.canonicalPlaceId};
 const place=acceptedGeographicPlace(owner,{...row,...owner,referenceSnapshotId:REFERENCE_SNAPSHOT_ID},'endpoint')!;
 assert(place);return {...place,id:row.canonicalPlaceId!,kind:'end',coordinates:place.coordinates!};
};
const paris=endpoint('Paris','France'),london=endpoint('London','United Kingdom');
const leg=(from=paris,to=london,mode:TripLeg['mode']='flight'):TripLeg=>({
 id:'synthetic-flight',fromStopId:from.id,toStopId:to.id,fromEndpoint:from,toEndpoint:to,
 mode,distanceKm:350,durationMinutes:240,provider:'Planning estimate',provenance:'planning_estimate',routeMetadata:{},
});
test('small defaults are exact active scheduled airport records in the pinned snapshot',()=>{
 assert.equal(FLIGHT_AIRPORT_DEFAULTS.snapshotId,REFERENCE_SNAPSHOT_ID);
 assert.equal(FLIGHT_AIRPORT_DEFAULTS.entries.length,2);
 for(const mapping of FLIGHT_AIRPORT_DEFAULTS.entries){
  assert.deepEqual(mapping.airport,referencePlaceById(mapping.airport.canonicalPlaceId));
  assert.equal(mapping.airport.status,'active');assert.equal(mapping.airport.scheduledService,true);
  assert.equal(mapping.airport.airportType,'large_airport');
  assert.equal(referencePlaceById(mapping.cityId)!.countryCode,mapping.airport.countryCode);
 }
});
test('unbooked flight planning derives CDG and LHR without rewriting city route or claiming service',()=>{
 const source=leg(),before=structuredClone(source),plan=flightPlanningAirports(source)!;
 assert.equal(plan.from.endpoint.canonicalPlaceId,'reference:ourairports:4185');
 assert.equal(plan.to.endpoint.canonicalPlaceId,'reference:ourairports:2434');
 assert.equal(plan.from.assumed,true);assert.equal(plan.to.assumed,true);
 assert.match(flightAirportAssumptionLabel(source)! ,/CDG.*LHR/);
 assert.match(flightAirportAssumptionLabel(source)! ,/service.*checking/i);
 assert.deepEqual(source,before);
});
test('explicit Gatwick and Orly remain the exact selected endpoint objects',()=>{
 const orly=endpoint('ORY','France'),gatwick=endpoint('LGW','United Kingdom');
 const plan=flightPlanningAirports(leg(orly,gatwick))!;
 assert.strictEqual(plan.from.endpoint,orly);assert.strictEqual(plan.to.endpoint,gatwick);
 assert.equal(plan.from.assumed,false);assert.equal(plan.to.assumed,false);
 assert.equal(flightAirportAssumptionLabel(leg(orly,gatwick)),null);
});
test('explicit airport segments take precedence over city-level defaults',()=>{
 const source=leg(),orly=endpoint('ORY','France'),gatwick=endpoint('LGW','United Kingdom');
 source.segments=[{id:'air',mode:'flight',fromEndpoint:orly,toEndpoint:gatwick,durationMinutes:90,distanceKm:300,provider:'Selected airport pair',provenance:'planning_estimate',confidence:'low',scheduleNeedsChecking:true}];
 const plan=flightPlanningAirports(source)!;assert.strictEqual(plan.from.endpoint,orly);assert.strictEqual(plan.to.endpoint,gatwick);
});
test('nonflight choices and excluded or confirmed flights do not acquire assumptions',()=>{
 for(const mode of ['train','road','ferry','mixed','walk'] as const)assert.equal(flightPlanningAirports(leg(paris,london,mode)),null);
 const blocked=leg();blocked.routeMetadata.transportConstraints={excludedModes:['flight']};assert.equal(flightPlanningAirports(blocked),null);
 for(const provenance of ['provider','canonical_schedule'] as const)assert.equal(flightPlanningAirports({...leg(),provenance}),null);
 const canonical=buildCanonicalTripLegs({tripId:'city-control',origin:paris,stops:[],journeyEnd:{mode:'explicit',place:{...london,coordinates:london.coordinates!}}});
 assert.equal(canonical[0].mode,'train');assert.equal(flightAirportAssumptionLabel(canonical[0]),null);
});
test('unknown flight feasibility stays conditional and creates no mode/duration evidence',()=>{
 const source={...leg(paris,london,'unknown'),durationMinutes:null},before=structuredClone(source);
 assert.match(flightAirportAssumptionLabel(source)! ,/^If flying/);assert.deepEqual(source,before);
});
test('unmapped, same-name foreign and changed geography never get a default by name',()=>{
 const rome=endpoint('Rome','Italy');assert.equal(flightPlanningAirports(leg(rome,rome))!.from.assumed,false);
 for(const bad of [{...paris,canonicalPlaceId:'foreign-paris'}, {...paris,country:'United States'}, {...paris,coordinates:[2.4,48.9] as [number,number]}, {...paris,name:'Different place'}, {...paris,providerId:paris.providerId!.replace(REFERENCE_SNAPSHOT_ID,'stale')}]){
  assert.equal(flightPlanningAirports(leg(bad,rome))!.from.assumed,false);
 }
});
test('existing flight search uses the visible assumed airports while train search keeps city names',()=>{
 const trip=canonicalRouteFixture();trip.startDate='2027-04-01';trip.endDate='2027-04-07';
 const source=leg();trip.legs=[source];const before=structuredClone(trip);
 const now=new Date('2027-03-01');
 const action=omioBookingActionForLeg(trip,source,now,'2027-04-07');assert(action);
 const url=new URL(new URL(action.href).searchParams.get('u')!);
 assert.match(url.searchParams.get('departurePosTerm')!,/Charles de Gaulle/);assert.match(url.searchParams.get('arrivalPosTerm')!,/Heathrow/);
 assert.match(action.detail,/assum/i);assert.deepEqual(trip,before);
 const rail=omioBookingActionForLeg(trip,{...source,mode:'train'},now,'2027-04-07');assert(rail);
 const trainUrl=new URL(new URL(rail.href).searchParams.get('u')!);
 assert.equal(trainUrl.searchParams.get('departurePosTerm'),'Paris, France');assert.equal(trainUrl.searchParams.get('arrivalPosTerm'),'London, United Kingdom');
});

test('saved confirmed/imported flight facts do not acquire airport assumptions',()=>{
 for(const routeMetadata of [{confirmed:true},{userConfirmed:true},{source:'imported-booking'}])assert.equal(flightPlanningAirports({...leg(),routeMetadata}),null);
});

test('actual Transport detail keeps assumption visible for retained unmarked booking details',async()=>{
 const {readFileSync}=await import('node:fs');const ts=await import('typescript');
 const source=readFileSync('components/easyt/trip-transport-workspace.tsx','utf8');
 const ast=ts.createSourceFile('transport.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let initializer:import('typescript').Expression|undefined;
 function visit(node:import('typescript').Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='airportAssumption')initializer=node.initializer;ts.forEachChild(node,visit);}visit(ast);
 assert(initializer);const text=ts.transpileModule(`return (${initializer.getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const evaluate=new Function('item','leg','language','flightAirportAssumptionLabel',text);
 const sourceLeg=leg(),item={from:paris,to:london,booking:null,manualBooking:{travellerMarkedBooked:false},bookingMismatch:null};
 assert.match(evaluate(item,sourceLeg,'en',flightAirportAssumptionLabel),/CDG.*LHR/);
 assert.equal(evaluate({...item,booking:{travellerMarkedBooked:true}},sourceLeg,'en',flightAirportAssumptionLabel),null);
});
