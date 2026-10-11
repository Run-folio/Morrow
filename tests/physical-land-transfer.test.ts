import assert from 'node:assert/strict';
import test from 'node:test';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {landConnectionEvidence} from '../lib/easyt/land-connection.ts';
import {RoadRoutingError,type RoadRoutingProvider} from '../lib/easyt/road-routing.ts';
const znz=()=>selectedTransferPlace('ZNZ','Tanzania','reference:ourairports:3260','endpoint');
const town=()=>selectedTransferPlace('Nungwi','Tanzania','reference:geonames:7284275','stop');
const city=()=>selectedTransferPlace('Zanzibar','Tanzania','reference:geonames:148730','stop');
function leg(from=znz(),to=town()){
 return buildCanonicalTripLegs({tripId:'physical-land-qa',origin:{...from,coordinates:from.coordinates!},stops:[{id:'synthetic-stop',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],nights:2,arrivalDate:null,departureDate:null}]})[0];
}
for(const [label,from,to] of [['ZNZ/Nungwi',znz,town],['city/Nungwi',city,town],['airport/city',znz,city]] as const)test(`qualified ${label} reaches synthetic bounded road assessment`,async()=>{
 const input=leg(from(),to());let calls=0;
 const provider:RoadRoutingProvider={provider:'openrouteservice',async route(request){calls++;return {mode:'road',distanceKm:60,durationMinutes:75,confidence:'medium',provenance:'routed',provider:'openrouteservice',profile:'driving-car',providerCheckedAt:'2026-10-11',routeGeometry:[request.origin.coordinates,request.destination.coordinates],attribution:'EXPLICITLY SYNTHETIC road response; not real travel-time evidence'};}};
 assert.equal(landConnectionEvidence(input.fromEndpoint!.coordinates!,input.toEndpoint!.coordinates!),'same-land');
 const result=await resolveCanonicalTransferJourney(input,{provider});assert.equal(result.leg.mode,'road');assert.equal(calls,1);assert.equal(result.leg.durationMinutes,75,'only the explicitly synthetic response supplies duration');
 assert.deepEqual(result.leg.fromEndpoint,input.fromEndpoint);assert.deepEqual(result.leg.toEndpoint,input.toEndpoint);
 if(label!=='airport/city'){assert.match(result.leg.roadEstimate?.attribution??'',/OpenStreetMap contributors/);assert.ok(result.leg.roadEstimate?.warnings.some(w=>w.includes('/data/physical-land/')));}
});
for(const outcome of ['missing','no_route','error','implausible'] as const)test(`qualified island road remains unknown without usable provider: ${outcome}`,async()=>{
 let calls=0;const provider:RoadRoutingProvider={provider:'openrouteservice',async route(request){calls++;if(outcome==='no_route')throw new RoadRoutingError('no_route');if(outcome==='error')throw new Error('synthetic unavailable');return {mode:'road',distanceKm:10000,durationMinutes:1,confidence:'medium',provenance:'routed',provider:'openrouteservice',profile:'driving-car',providerCheckedAt:'2026-10-11',routeGeometry:[request.origin.coordinates,request.destination.coordinates],attribution:'SYNTHETIC invalid route'};}};
 const result=await resolveCanonicalTransferJourney(leg(),{provider:outcome==='missing'?undefined:provider});assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);assert.equal(result.leg.routeGeometry,undefined);assert.equal(calls,outcome==='missing'?0:1);
});
test('accepted Dar and Pemba crossings cannot become generic road',async()=>{
 const from=znz();const dar=selectedTransferPlace('Dar es Salaam','Tanzania','reference:geonames:160263','stop');const pemba=selectedTransferPlace('PMA','Tanzania','reference:ourairports:3258','endpoint');
 for(const to of [dar,pemba]){assert.equal(landConnectionEvidence(from.coordinates!,to.coordinates!),'separate-land');const input=leg(from,to);if(to===pemba)input.toEndpoint!.kind='end';let calls=0;const result=await resolveCanonicalTransferJourney(input,{provider:{provider:'openrouteservice',async route(){calls++;throw new Error('crossing must not request generic driving');}}});assert.notEqual(result.leg.mode,'road');assert.equal(calls,0);}
});
test('frozen raw Zanzibar points remain rejected before providers',async()=>{
 const input=leg();input.fromEndpoint={...input.fromEndpoint!,name:'Zanzibar Airport',canonicalPlaceId:'zanzibar-airport',providerId:undefined,geographicBinding:undefined,coordinates:[39.2249,-6.222]};input.toEndpoint={...input.toEndpoint!,canonicalPlaceId:'nungwi',providerId:undefined,geographicBinding:undefined,coordinates:[39.2987,-5.7265]};let calls=0;const result=await resolveCanonicalTransferJourney(input,{provider:{provider:'openrouteservice',async route(){calls++;throw new Error('unaccepted geography');}}});assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);assert.equal(calls,0);
});
test('accepted Coron/Cuyo never acquires an unsourced road or ferry from this refinement',async()=>{
 const from=selectedTransferPlace('Coron','Philippines','reference:geonames:1716834','endpoint'),to=selectedTransferPlace('Cuyo','Philippines','reference:geonames:1716397','stop');let calls=0;const input=leg(from,to);const result=await resolveCanonicalTransferJourney(input,{provider:{provider:'openrouteservice',async route(){calls++;throw new Error('water crossing cannot become generic road');}}});assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);assert.equal(calls,0);
});
