import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import {emptyServerMarkerPlugin} from './helpers/server-marker.mjs';
import { referencePlaceById, referenceSnapshotId } from '../lib/easyt/place-reference.server.ts';
import { destinationKnowledge } from '../lib/easyt/destination-knowledge.ts';

const parent={canonicalPlaceId:'bali',canonicalName:'Bali',placeType:'island',parentCountries:['Indonesia']};
const ids=['reference:geonames:1622846','reference:geonames:1639002'];
let apiPromise:Promise<any>|undefined;
function api(){return apiPromise??=(async()=>{
 const result=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[emptyServerMarkerPlugin,{name:'next-response',setup(b){
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const NextResponse={json:(body,options)=>({body,status:options?.status??200})};'}));
 }}]});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`);
})();}
function request(extra:Record<string,string>={}){
 const q=new URLSearchParams({areaBases:'1',parentId:parent.canonicalPlaceId,parentName:parent.canonicalName,parentType:parent.placeType,parentCountry:'Indonesia',...extra});
 return {nextUrl:new URL('http://localhost/api/journey-geocode?'+q),signal:new AbortController().signal};
}
async function offline(req=request()){
 const route=await api();const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No external geography allowed');};
 try{return {...await route.GET(req),calls};}finally{globalThis.fetch=old;}
}
test('reviewed Bali discovery offers exact Ubud and Bali Kuta offline without resolving the island intent',async()=>{
 const before=structuredClone(parent);const result=await offline();assert.equal(result.status,200);assert.equal(result.body.status,'ready');assert.equal(result.calls,0);
 assert.deepEqual(result.body.candidates.map((c:any)=>c.canonicalPlaceId),ids);
 for(const c of result.body.candidates){const record=referencePlaceById(c.canonicalPlaceId)!;
 assert.equal(c.providerId,record.providerId);assert.equal(c.referenceSnapshotId,referenceSnapshotId());assert.deepEqual(c.coordinates,record.coordinates);
 assert.equal(c.placeType,record.placeType);assert.equal(c.country,'Indonesia');assert.equal(c.region,'Bali');assert.match(c.normalizationReason,/Reviewed island membership/);assert.doesNotMatch(c.normalizationReason,/Physical island verified/);}
 assert.deepEqual(parent,before);
});
test('reviewed Bali base identities expose the exact DPS gateway without changing their points',()=>{
 for(const id of ids){const base=referencePlaceById(id)!;const before=structuredClone(base);const knowledge=destinationKnowledge.forTransferResolution({canonicalPlaceId:id,providerId:base.providerId,name:base.canonicalName,country:'Indonesia',coordinates:base.coordinates});
 assert.equal(knowledge.airGateways.status,'known');if(knowledge.airGateways.status!=='known')continue;
 assert.equal(knowledge.airGateways.value.length,1);assert.equal(knowledge.airGateways.value[0].canonicalId,'reference:ourairports:26751');assert.deepEqual(knowledge.airGateways.value[0].coordinates,[115.167123,-8.748409]);assert.deepEqual(base,before);
 }
});

import { reviewedIslandBaseSeeds, normalizeReviewedIslandBaseCandidates } from '../lib/easyt/reviewed-island-destinations.server.ts';
import { REVIEWED_ISLAND_DESTINATIONS, reviewedIslandParent } from '../lib/easyt/reviewed-island-destinations.ts';
import { normalizePhysicalIslandBaseCandidates } from '../lib/easyt/openstreetmap-island-containment.server.ts';
import { verifyPhysicalIslandSuggestion } from '../lib/easyt/destination-resolution.ts';
import { acceptedGeographicPlace, geographicallyReady } from '../lib/easyt/geographic-binding.ts';
import { buildCanonicalTripLegs } from '../lib/easyt/trip-legs.ts';
import { resolveCanonicalTransferJourney } from '../lib/easyt/multimodal-transfer-resolution.ts';
import type { PlanningParentConstraint, CanonicalPlaceSuggestion } from '../lib/easyt/place-intelligence.ts';
import type { TripStop } from '../lib/easyt/trip.ts';
const selectedParent=parent as PlanningParentConstraint;

test('reviewed Bali coverage fails closed on a changed reference snapshot instead of falling through to live guesses',async()=>{
 const old=REVIEWED_ISLAND_DESTINATIONS.referenceSnapshotId;let calls=0;REVIEWED_ISLAND_DESTINATIONS.referenceSnapshotId='future-snapshot';
 try{await assert.rejects(normalizePhysicalIslandBaseCandidates([],selectedParent,{fetchImpl:async()=>{calls++;throw Error('No egress');}}),/snapshot/);assert.equal(calls,0);}
 finally{REVIEWED_ISLAND_DESTINATIONS.referenceSnapshotId=old;}
});
for(const change of [
 {canonicalPlaceId:'reference:geonames:7378343'}, {providerId:'reference:geonames:1639002@wrong'}, {coordinates:[115,-8]},
 {parentCountries:['China']}, {parentCountries:['Indonesia','China']}, {canonicalName:'Other Kuta'}, {placeType:'island'}, {routability:'needs_base_selection'},
])test(`reviewed membership rejects changed tuple ${JSON.stringify(change)}`,()=>{
 const base=reviewedIslandBaseSeeds(selectedParent)![1]!;
 assert.deepEqual(normalizeReviewedIslandBaseCandidates([{...base,...change} as any],selectedParent),[]);
});
test('province, foreign, unknown and missing island identities cannot use reviewed Bali membership',()=>{
 for(const p of [{...selectedParent,placeType:'region'}, {...selectedParent,canonicalPlaceId:'wikidata:Q3125978'}, {...selectedParent,canonicalPlaceId:undefined}, {...selectedParent,parentCountries:['China']}, {...selectedParent,canonicalName:'Other Bali'}]){
 assert.equal(reviewedIslandParent(p as PlanningParentConstraint),false);assert.equal(reviewedIslandBaseSeeds(p as PlanningParentConstraint),undefined);
 }
});
test('Bali text search and explicit base revalidation use the same offline exact membership',async()=>{
 const params=request({areaBases:'0',place:'kuta',candidates:'1',country:'Indonesia'});const result=await offline(params);
 assert.equal(result.status,200);assert.equal(result.calls,0);assert.deepEqual(result.body.candidates.map((c:any)=>c.canonicalPlaceId),[ids[1]]);
 const c=result.body.candidates[0];const suggestion={...c,label:'Kuta, Indonesia',confidence:'high',provenance:[{id:c.providerId,kind:'provider',label:c.providerSourceLabel,supports:c.normalizationReason}]} as CanonicalPlaceSuggestion;
 const unchanged=structuredClone(suggestion);const verified=await verifyPhysicalIslandSuggestion(selectedParent,suggestion,{fetchImpl:async input=>{
 const q=new URL(String(input),'http://local');return Response.json((await offline({nextUrl:q,signal:new AbortController().signal})).body);
 }});
 assert(verified);assert.equal(verified.canonicalPlaceId,ids[1]);assert.deepEqual(verified.coordinates,c.coordinates);assert.deepEqual(suggestion,unchanged);
 const wrong={...suggestion,canonicalPlaceId:'reference:geonames:7378343'};
 assert.equal(await verifyPhysicalIslandSuggestion(selectedParent,wrong,{fetchImpl:async()=>Response.json(result.body)}),null);
});
function endpoint(id:string){
 const r=referencePlaceById(id)!;const plain={name:r.canonicalName,country:r.countryCode==='ID'?'Indonesia':'Singapore',canonicalPlaceId:id};
 return acceptedGeographicPlace(plain,{...plain,providerId:r.providerId,coordinates:[...r.coordinates],placeType:r.placeType,routability:'direct_destination',referenceSnapshotId:referenceSnapshotId()},r.placeType==='transport_gateway'?'endpoint':'stop')!;
}
function leg(fromId:string,toId:string){const from=endpoint(fromId),to=endpoint(toId);assert(from&&to);
 const stop:TripStop={id:'synthetic-bali-stop',order:0,...to,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,latitude:to.coordinates![1],longitude:to.coordinates![0],arrivalDate:null,departureDate:null,nights:3};
 return buildCanonicalTripLegs({tripId:'synthetic-bali-transport',origin:{...from,coordinates:from.coordinates!},stops:[stop]})[0]!;
}
for(const id of ids)for(const reverse of [false,true])test(`explicit ${id} ${reverse?'outbound':'inbound'} uses DPS flight and separate ground-access segments offline`,async()=>{
 const original=leg(reverse?id:'reference:geonames:1880252',reverse?'reference:geonames:1880252':id);const before=structuredClone(original);
 const result=await resolveCanonicalTransferJourney(original,{provider:{provider:'openrouteservice',route:async()=>{throw Error('Synthetic road source unavailable');}} as any});
 assert.equal(result.leg.mode,'mixed');assert(result.leg.durationMinutes!>0);assert(result.leg.segments?.some(s=>s.mode==='road'));assert(result.leg.segments?.some(s=>s.mode==='flight'));
 const flight=result.leg.segments!.find(s=>s.mode==='flight')!;
 assert.equal((reverse?flight.fromEndpoint:flight.toEndpoint).canonicalPlaceId,'reference:ourairports:26751');
 assert.equal(result.leg.scheduleNeedsChecking,true);assert.equal(result.leg.provenance,'planning_estimate');assert.deepEqual(original,before);
 assert.deepEqual(result.leg.fromEndpoint?.coordinates,original.fromEndpoint?.coordinates);assert.deepEqual(result.leg.toEndpoint?.coordinates,original.toEndpoint?.coordinates);
 assert.equal(geographicallyReady(endpoint(id)),true);
});
test('Bali gateway support preserves exclusions, booked facts, other Kuta and same-island journeys',async()=>{
 const original=leg('reference:geonames:1880252',ids[0]!);
 const excluded=structuredClone(original);excluded.routeMetadata.transportConstraints={excludedModes:['flight']};
 const noFlight=await resolveCanonicalTransferJourney(excluded);assert(!noFlight.leg.segments?.some(s=>s.mode==='flight'));assert.notEqual(noFlight.leg.mode,'flight');
 const booked=structuredClone(original);booked.mode='flight';booked.durationMinutes=123;booked.provider='Existing booking';booked.routeMetadata.userConfirmed=true;
 assert.deepEqual((await resolveCanonicalTransferJourney(booked)).leg,booked);
 const other=referencePlaceById('reference:geonames:7378343')!;assert(other);
 assert.equal(destinationKnowledge.forTransferResolution({name:other.canonicalName,country:'Indonesia',canonicalPlaceId:other.canonicalPlaceId,providerId:other.providerId,coordinates:other.coordinates}).airGateways.status,'unknown');
 const local=await resolveCanonicalTransferJourney(leg(ids[0]!,ids[1]!));assert(!local.leg.segments?.some(s=>s.mode==='flight'));
 assert.equal(destinationKnowledge.forTransferResolution({name:'Bali',country:'Indonesia',canonicalPlaceId:'bali'}).airGateways.status,'unknown');
});

import { createDestinationKnowledgeStore, unknownKnowledgeFact } from '../lib/easyt/destination-knowledge.ts';
import { reviewedIslandGatewayRecord } from '../lib/easyt/reviewed-island-destinations.ts';
import { referenceRecordKey } from '../lib/easyt/place-reference.ts';
test('reviewed gateway projection cannot move the pinned airport by changing a self-consistent tuple',()=>{
 const raw=REVIEWED_ISLAND_DESTINATIONS.gateway;const previous=structuredClone(raw);
 try{raw.coordinates=[110,-7];raw.providerId=referenceRecordKey({...referencePlaceById(raw.canonicalPlaceId)!,coordinates:[110,-7]},referenceSnapshotId());
 assert.equal(reviewedIslandGatewayRecord(),undefined);
 }finally{Object.assign(raw,previous);}
});
test('custom destination stores and explicit unknown overrides remain authoritative',()=>{
 const base=endpoint(ids[0]!);const input={...base,coordinates:base.coordinates!};
 assert.equal(createDestinationKnowledgeStore({destinations:[],transfers:[]}).forTransferResolution(input).airGateways.status,'unknown');
 const empty=unknownKnowledgeFact('Explicit test unknown');
 const custom=createDestinationKnowledgeStore({destinationOverrides:[{canonicalId:base.canonicalPlaceId!,name:base.name,airGateways:empty}]});
 assert.deepEqual(custom.forTransferResolution(input).airGateways,empty);
});

import { tripFromBuilder, type BuilderTripInput } from '../lib/easyt/trip.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { saveTripRecoveryToStorage, loadTripRecoveryFromStorage } from '../lib/easyt/storage.ts';
import { destinationPlanningDecision } from '../lib/easyt/destination-planning-policy.ts';
test('reviewed registry fields match the actual accepted reference records, including the DPS airport',()=>{
 for(const pin of [...REVIEWED_ISLAND_DESTINATIONS.bases,REVIEWED_ISLAND_DESTINATIONS.gateway]){
 const actual=referencePlaceById(pin.canonicalPlaceId)!;assert(actual);
 for(const key of Object.keys(pin))assert.deepEqual((actual as any)[key],(pin as any)[key],`${pin.canonicalPlaceId}.${key}`);
 }
 assert.equal(destinationPlanningDecision(selectedParent,{intent:'explicit-area'}).behavior,'choose-base');
});
test('explicit accepted Bali base builds and round-trips canonical trip identity in isolated device storage',async()=>{
 const origin=endpoint('reference:geonames:1880252'),base=endpoint(ids[0]!);
 const input:BuilderTripInput={id:'synthetic-reviewed-bali',origin:origin.name,originCountry:origin.country,
 originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,journeyEnd:{mode:'same_as_start'},
 stops:[{id:'explicit-ubud-occurrence',...base,country:'Indonesia'}],startDate:'2026-11-10',endDate:'2026-11-14',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],
 nightAllocations:{'explicit-ubud-occurrence':4},createdAt:'2026-10-21T00:00:00.000Z'};
 const initial=tripFromBuilder(input);
 // The actual Builder supplies effectiveIntent.route, including accepted origin proof.
 let trip=requireReadableTripDocument(tripFromBuilder({...input,routeIntent:{...initial.brief.intent.route,origin}}));
 const source=structuredClone(trip.stops);trip={...trip,legs:await Promise.all(trip.legs.map(async l=>(await resolveCanonicalTransferJourney(l)).leg))};
 assert.equal(trip.legs.length,2);assert(trip.legs.every(l=>l.mode==='mixed'),JSON.stringify(trip.legs.map(l=>({mode:l.mode,reason:l.provider,source:l.routeMetadata.source,from:l.fromEndpoint,to:l.toEndpoint}))));assert.deepEqual(trip.stops,source);
 const values=new Map<string,string>();const storage={get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 assert.equal(saveTripRecoveryToStorage(storage,trip,{writeId:'reviewed-bali-device-fixture'}).stored,true);
 const cold=loadTripRecoveryFromStorage(storage,trip.id,null)!;assert(cold);assert.deepEqual(cold.trip.stops,JSON.parse(JSON.stringify(trip.stops)));
 assert.deepEqual(cold.trip.legs,JSON.parse(JSON.stringify(trip.legs)));assert.equal(cold.trip.stops[0]!.canonicalPlaceId,ids[0]);
});
test('unverified changed base geography and explicitly selected airports never become an assumed Bali stay',async()=>{
 const unverified=leg('reference:geonames:1880252',ids[0]!);unverified.toEndpoint!.coordinates=[110,-7];
 const result=await resolveCanonicalTransferJourney(unverified);assert.equal(result.outcome,'unresolved');assert(!result.leg.segments?.some(s=>s.mode==='flight'));
 const airport=leg('reference:ourairports:26751','reference:geonames:1880252');const airportBefore=structuredClone(airport);
 const explicit=await resolveCanonicalTransferJourney(airport);assert.deepEqual(explicit.leg.fromEndpoint,airportBefore.fromEndpoint);
 assert(!explicit.leg.segments?.some(s=>s.mode==='road'));assert.deepEqual(airport,airportBefore);
});
