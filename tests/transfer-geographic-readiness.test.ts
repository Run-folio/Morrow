import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalTripLegs } from '../lib/easyt/trip-legs.ts';
import { resolveCanonicalTransferJourney, resolveCanonicalTransferJourneys } from '../lib/easyt/multimodal-transfer-resolution.ts';
import { resolveCanonicalRoadFallback } from '../lib/easyt/road-transfer-resolution.ts';
import { acceptedGeographicPlace, geographicallyReady } from '../lib/easyt/geographic-binding.ts';
import type { RoadRoutingProvider } from '../lib/easyt/road-routing.ts';
import type { TripLeg } from '../lib/easyt/trip.ts';
import { REFERENCE_SNAPSHOT_ID } from '../lib/easyt/place-reference.ts';
import { searchReferencePlaces } from '../lib/easyt/place-reference.server.ts';
import { REVIEWED_SURFACE_CROSSINGS } from '../lib/easyt/surface-crossing-evidence.ts';
import { destinationKnowledge, knownKnowledgeFact } from '../lib/easyt/destination-knowledge.ts';
import { selectedTransferPlace } from './fixtures/accepted-transfer-place.ts';

function constructed(fromReady: boolean, toReady: boolean): TripLeg {
  return buildCanonicalTripLegs({tripId:'readiness',origin:{name:'Lima',country:'Peru',canonicalPlaceId:fromReady?'lima':'raw-lima',coordinates:[-77.0428,-12.0464]},stops:[{id:'huacachina',canonicalPlaceId:toReady?'huacachina':'raw-huacachina',name:'Huacachina',country:'Peru',longitude:-75.7642,latitude:-14.0875,order:0,nights:2,arrivalDate:null,departureDate:null}]})[0]!;
}
function routingSpy() {
  const calls: unknown[]=[];
  const provider: RoadRoutingProvider={provider:'openrouteservice',async route(input){calls.push(input);return {mode:'road',distanceKm:305,durationMinutes:255,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-11',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Deterministic test routing'};}};
  return {calls,provider};
}
function unknown(leg:TripLeg) {
  assert.equal(leg.mode,'unknown');
  for(const key of ['durationMinutes','headlineMinutes','doorToDoorMinutes','distanceKm','straightLineDistanceKm','routedDistanceKm','usableDayLoss'] as const)assert.equal(leg[key],null,key);
  assert.equal(leg.routeGeometry,undefined);assert.equal(leg.roadEstimate,undefined);assert.equal(leg.segments,undefined);
}
for(const source of ['traveller-authored','imported-booking','curated-route'])test(`${source} transport is preserved without authorizing inferred road work`,async()=>{
  const raw=constructed(false,false);raw.mode='road';raw.durationMinutes=300;raw.routeMetadata={source};
  const before=structuredClone(raw),spy=routingSpy();
  assert.deepEqual((await resolveCanonicalTransferJourney(raw,{provider:spy.provider})).leg,before);
  assert.deepEqual((await resolveCanonicalRoadFallback(raw,{provider:spy.provider})).leg,before);
  assert.equal(spy.calls.length,0);assert.deepEqual(raw,before);
});
for(const flag of ['userConfirmed','confirmed'] as const)test(`${flag} saved transport does not become inferred provider work`,async()=>{
  const raw=constructed(false,false);raw.mode='road';raw.durationMinutes=300;raw.routeMetadata={source:'morrovia-planner',[flag]:true,roadFallbackEligible:true};
  const before=structuredClone(raw),spy=routingSpy();
  assert.deepEqual((await resolveCanonicalTransferJourney(raw,{provider:spy.provider})).leg,before);
  assert.deepEqual((await resolveCanonicalRoadFallback(raw,{provider:spy.provider})).leg,before);
  assert.equal(spy.calls.length,0);
});
for(const [fromReady,toReady] of [[false,true],[true,false],[false,false]] as const)test(`canonical construction and serialization do not route readiness ${fromReady}/${toReady}`,async()=>{
  const leg=constructed(fromReady,toReady);assert.equal(leg.routeMetadata.source,'unverified-geography');
  const original=structuredClone(leg);const spy=routingSpy();
  const [result]=await resolveCanonicalTransferJourneys(JSON.parse(JSON.stringify([leg])),{provider:spy.provider});
  assert.equal(spy.calls.length,0);unknown(result!);assert.deepEqual(leg,original);
});
test('source rewriting and stale binding cannot promote geographic readiness',async()=>{
  const raw=constructed(false,true);raw.routeMetadata={source:'morrovia-planner',roadFallbackEligible:true};
  raw.fromEndpoint!.geographicBinding={version:1,source:'provider',providerId:'test-provider',placeType:'city',country:'Peru',routability:'direct_destination',inputKey:'stale'};
  const spy=routingSpy();unknown((await resolveCanonicalTransferJourney(raw,{provider:spy.provider})).leg);assert.equal(spy.calls.length,0);
});
test('the former approximate Huacachina point remains unverified instead of inheriting the selected point',async()=>{
  const raw=constructed(true,true);raw.toEndpoint!.coordinates=[-75.768,-14.088];
  const spy=routingSpy();unknown((await resolveCanonicalTransferJourney(raw,{provider:spy.provider})).leg);assert.equal(spy.calls.length,0);
});
test('direct fallback gates raw coordinates before provider consumption',async()=>{
  const raw=constructed(true,false);raw.routeMetadata={source:'morrovia-planner',roadFallbackEligible:true};
  const spy=routingSpy();unknown((await resolveCanonicalRoadFallback(raw,{provider:spy.provider})).leg);assert.equal(spy.calls.length,0);
});
test('an unverified reviewed gateway point cannot acquire inferred access timing',async()=>{
  const selected=(name:string,country:string,id:string,role:'endpoint'|'stop')=>{
    const candidate=searchReferencePlaces(name,{explicitCountryNames:[country]},{limit:20}).find(c=>c.canonicalPlaceId===id);assert.ok(candidate);
    const place=acceptedGeographicPlace({name:candidate.canonicalName,country,canonicalPlaceId:id},{...candidate,name:candidate.canonicalName,country,referenceSnapshotId:REFERENCE_SNAPSHOT_ID},role);assert.ok(place);return place;
  };
  const from=selected('Tokyo','Japan','reference:geonames:1850147','endpoint'),to=selected('Hoi An','Vietnam','reference:geonames:1580541','stop');
  const leg=buildCanonicalTripLegs({tripId:'gateway-readiness',origin:{...from,coordinates:from.coordinates!},stops:[{id:'to',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],nights:2,arrivalDate:null,departureDate:null}]})[0]!;
  const knowledge={findTransfer:destinationKnowledge.findTransfer,findIntercityRailConnection:destinationKnowledge.findIntercityRailConnection,forTransferResolution(endpoint:Parameters<typeof destinationKnowledge.forTransferResolution>[0]){const facts=destinationKnowledge.forTransferResolution(endpoint);return facts.airGateways.status==='known'?{...facts,airGateways:{...facts.airGateways,value:facts.airGateways.value.map(({geographicPlaceId: _record,providerId:_provider,geographicBinding:_binding,...raw})=>raw)}}:facts;}};
  const spy=routingSpy();const result=await resolveCanonicalTransferJourney(leg,{provider:spy.provider,knowledge});
  assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);assert.equal(result.leg.segments,undefined);assert.equal(spy.calls.length,0);
});
test('selected gateway provenance survives candidate construction and serialization',async()=>{
  const from=selectedTransferPlace('Tokyo','Japan','reference:geonames:1850147','endpoint'),to=selectedTransferPlace('Hoi An','Vietnam','reference:geonames:1580541','stop');
  const gateway=selectedTransferPlace('Da Nang','Vietnam','reference:geonames:1583992','endpoint','da-nang');
  const knowledge={findTransfer:destinationKnowledge.findTransfer,findIntercityRailConnection:destinationKnowledge.findIntercityRailConnection,forTransferResolution(endpoint:Parameters<typeof destinationKnowledge.forTransferResolution>[0]){
    const facts=destinationKnowledge.forTransferResolution(endpoint);
    return endpoint.name==='Hoi An'?{...facts,airGateways:knownKnowledgeFact([{...gateway,canonicalId:'da-nang',country:gateway.country!,coordinates:gateway.coordinates!,accessMode:'road' as const}],'static',{id:'test:selected-da-nang',label:'Selected GeoNames 1583992 with existing Hoi An gateway relationship',kind:'curated',supports:'Actual selected point provenance; the existing gateway relationship is retained.'})}:facts;
  }};
  const leg=buildCanonicalTripLegs({tripId:'gateway-provenance',origin:{...from,coordinates:from.coordinates!},stops:[{id:'to',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],nights:2,arrivalDate:null,departureDate:null}]})[0]!;
  const provider:RoadRoutingProvider={provider:'openrouteservice',async route(input){return {mode:'road',distanceKm:30,durationMinutes:45,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-11',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Synthetic provider control'};}};
  const result=await resolveCanonicalTransferJourney(JSON.parse(JSON.stringify(leg)),{provider,knowledge});
  assert.equal(result.leg.mode,'mixed');
  const endpoint=result.leg.segments!.find(s=>s.mode==='flight')!.toEndpoint;
  assert.equal(endpoint.providerId,gateway.providerId);assert.deepEqual(endpoint.geographicBinding,gateway.geographicBinding);
  assert.deepEqual((await resolveCanonicalTransferJourney(JSON.parse(JSON.stringify(result.leg)),{provider,knowledge})).leg.segments,result.leg.segments);
});
test('verified mainland endpoints retain plausible routed road control',async()=>{
  const leg=constructed(true,true);
  assert.ok(geographicallyReady({...leg.fromEndpoint!,coordinates:leg.fromEndpoint!.coordinates!},'endpoint'));
  assert.ok(geographicallyReady({...leg.toEndpoint!,coordinates:leg.toEndpoint!.coordinates!},'stop'));
  const spy=routingSpy();const result=await resolveCanonicalTransferJourney(leg,{provider:spy.provider});
  assert.equal(spy.calls.length,1);assert.equal(result.leg.mode,'road');assert.equal(result.leg.durationMinutes,255);
});
for(const crossing of REVIEWED_SURFACE_CROSSINGS)test(`verified ${crossing.id} retains sourced crossing without invented timing`,async()=>{
  for(const reverse of [false,true]) {
    const [from,to]=reverse?[...crossing.sides].reverse():crossing.sides;
    const select=(side:typeof from,role:'endpoint'|'stop')=>{const candidate=searchReferencePlaces(side!.scopeName,{explicitCountryNames:[side!.country]},{limit:20}).find(c=>c.canonicalPlaceId===side!.scopeReferenceId);assert.ok(candidate);assert.deepEqual(candidate.coordinates,side!.scopeCentre);const place=acceptedGeographicPlace({name:candidate.canonicalName,country:side!.country,canonicalPlaceId:side!.scopeReferenceId},{...candidate,name:candidate.canonicalName,country:side!.country,referenceSnapshotId:REFERENCE_SNAPSHOT_ID},role);assert.ok(place);return place;};
    const a=select(from,'endpoint'),b=select(to,'stop');
    const leg=buildCanonicalTripLegs({tripId:'crossing',origin:{...a,coordinates:a.coordinates!},stops:[{id:'to',order:0,name:b.name,country:b.country!,canonicalPlaceId:b.canonicalPlaceId,providerId:b.providerId,geographicBinding:b.geographicBinding,longitude:b.coordinates![0],latitude:b.coordinates![1],nights:2,arrivalDate:null,departureDate:null}]})[0]!;
    const spy=routingSpy();
    const provider:RoadRoutingProvider={...spy.provider,async route(input){spy.calls.push(input);return {mode:'road',distanceKm:45,durationMinutes:60,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-11',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Synthetic fixed-link control'};}};
    const result=await resolveCanonicalTransferJourney(leg,{provider});
    if(crossing.mode==='road'){assert.equal(result.leg.mode,'road');assert.equal(spy.calls.length,1);}
    else {assert.equal(result.leg.mode,'mixed');assert.equal(result.leg.durationMinutes,null);assert.ok(result.leg.segments?.every(s=>s.durationMinutes===null));assert.equal(spy.calls.length,0);assert.match(result.leg.segments![1]!.provider!,/asdp.id/);}
  }
});
