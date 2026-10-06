import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyRouteFixture, canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { readTripDocument,requireReadableTripDocument,TripDocumentReadError } from '../lib/easyt/trip-document.ts';
import { canonicalTripForOwner,duplicateTripDocument } from '../lib/easyt/trip-promotion.ts';
import { tripFromBuilder,type EasyTTrip } from '../lib/easyt/trip.ts';
import { routeNightBudget,routeProjectionInputKey,routeProjectionStatus } from '../lib/easyt/trip-route-intent.ts';
import { EASYT_ACTIVE_TRIP_KEY,loadLocalTripFromStorage,saveTripRecoveryToStorage,saveTripToEasyT,loadTripRecoveryFromStorage,cacheCanonicalTripWithRecoveryToStorage,type EasyTBrowserStorage } from '../lib/easyt/storage.ts';
import { deriveItineraryCoverage } from '../lib/easyt/trip-facts.ts';
class Store implements EasyTBrowserStorage {
 values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}
 getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}
}
const cases:Record<string,()=>EasyTTrip>={
 absent_legacy_end:()=>legacyRouteFixture(),
 explicit_finish:()=>{const trip=legacyRouteFixture();trip.brief.journeyEnd={mode:'explicit',place:{name:'Tokyo',canonicalPlaceId:'place:tokyo'}};return trip;},
 repeated_city:()=>{const trip=legacyRouteFixture();trip.stops.push({...trip.stops[0],id:'tokyo-return',order:3,nights:0});trip.brief.journeyEnd={mode:'explicit',place:{name:'Tokyo',canonicalPlaceId:'place:tokyo'}};return trip;},
 manual_order:()=>canonicalRouteFixture(),
 explicit_order:()=>{const trip=canonicalRouteFixture();trip.brief.intent!.route!.orderAuthority='explicit';trip.brief.intent!.route!.explicitIntentIds=trip.brief.intent!.route!.destinations.map(intent=>intent.id);return trip;},
 area_with_bases:()=>{const trip=canonicalRouteFixture();const route=trip.brief.intent!.route!;route.destinations=[{id:'country-japan',sourceText:'Japan',kind:'planning_area',selectedPlace:{name:'Japan',canonicalPlaceId:'country:jp'},resolution:'resolved',requestedNights:9,routeMembership:'required',stopIds:trip.stops.map(stop=>stop.id)}];return trip;},
 unresolved_Mostar:()=>{const trip=canonicalRouteFixture();trip.brief.intent!.route!.destinations.push({id:'mostar-occurrence',sourceText:'Mostar',kind:'overnight_place',selectedPlace:null,resolution:'unavailable',requestedNights:2,routeMembership:'required',stopIds:[]});return trip;},
 unresolved_San_Pedro:()=>{const trip=canonicalRouteFixture();trip.brief.intent!.route!.destinations.push({id:'san-pedro-occurrence',sourceText:'San Pedro de Atacama',kind:'overnight_place',selectedPlace:null,resolution:'unresolved',requestedNights:3,routeMembership:'required',stopIds:[]});return trip;},
 authored_and_locked:()=>{const trip=canonicalRouteFixture();trip.brief.dayNotes={2:['Keep my meeting']};trip.brief.scheduleLocks={stopIds:['kyoto'],arrivalDates:{kyoto:'2026-10-14'}};return trip;},
};
for(const [name,make] of Object.entries(cases))test(`every_supported_path_preserves_route_contract: ${name}`,async()=>{
 const source=make();const raw=JSON.stringify(source);const canonical=requireReadableTripDocument(source);const store=new Store();store.values.set(EASYT_ACTIVE_TRIP_KEY,raw);
 const read=loadLocalTripFromStorage(store,source.id,source.ownerId)!;assert.equal(store.getItem(EASYT_ACTIVE_TRIP_KEY),raw);assert.equal(read.updatedAt,source.updatedAt);
 const recovery=saveTripRecoveryToStorage(store,read,{writeId:'accepted-edit'});assert.equal(recovery.stored,true);
 const saved=await saveTripToEasyT(read,(async()=>Response.json({trip:canonicalTripForOwner('owner-a',read,'2026-10-06T12:00:00.000Z')})) as typeof fetch);
 const scoped=loadTripRecoveryFromStorage(store,read.id,'owner-a')!;
 assert.equal(cacheCanonicalTripWithRecoveryToStorage(store,saved,scoped).recoveryResolved,true);
 assert.equal(store.getItem(EASYT_ACTIVE_TRIP_KEY),raw);
 assert.deepEqual(saved.brief.intent!.route!.destinations.map(intent=>[intent.id,intent.requestedNights,intent.resolution]),canonical.brief.intent.route.destinations.map(intent=>[intent.id,intent.requestedNights,intent.resolution]));
 const copy=duplicateTripDocument(saved,{id:'copy-'+name,now:saved.updatedAt,nextId:(()=>{let i=0;return()=>String(++i);})()});
 const promoted=canonicalTripForOwner('owner-b',copy);
 const restored=requireReadableTripDocument(JSON.parse(JSON.stringify(promoted)));
 assert.deepEqual(restored.brief.intent.route.destinations.map(intent=>intent.id),canonical.brief.intent.route.destinations.map(intent=>intent.id));
 assert.equal(restored.brief.intent.route.orderAuthority,canonical.brief.intent.route.orderAuthority);
 assert.deepEqual(restored.brief.intent.route.journeyEnd,canonical.brief.intent.route.journeyEnd);
 assert.deepEqual(restored.stops.map(stop=>[stop.name,stop.nights]),canonical.stops.map(stop=>[stop.name,stop.nights]));
 assert.equal(routeNightBudget(restored,20).held,routeNightBudget(canonical,20).held);
 const rebuilt=tripFromBuilder({id:restored.id,origin:restored.brief.origin,originCanonicalPlaceId:restored.brief.originCanonicalPlaceId,journeyEnd:restored.brief.journeyEnd,stops:restored.stops.map(stop=>({...stop,coordinates:stop.longitude!==null&&stop.latitude!==null?[stop.longitude,stop.latitude]:undefined})),startDate:restored.startDate,endDate:restored.endDate,picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],intent:restored.brief.intent,routeIntent:restored.brief.intent.route,nightAllocations:Object.fromEntries(restored.stops.map(stop=>[stop.id,stop.nights!]))});
 assert.deepEqual(rebuilt.brief.intent.route.destinations.map(intent=>[intent.id,intent.requestedNights]).sort(),restored.brief.intent.route.destinations.map(intent=>[intent.id,intent.requestedNights]).sort());
 assert.equal(rebuilt.brief.intent.route.orderAuthority,restored.brief.intent.route.orderAuthority);
});
test('failed_dependent_work_remains_pending_on_reload_and_rollback_retains_v2',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture());trip.brief.intent.route.projectionInputKey=routeProjectionInputKey(trip);
 trip.brief.intent.route.origin!.canonicalPlaceId='new-origin';
 const restored=requireReadableTripDocument(JSON.parse(JSON.stringify(trip)));
 assert.equal(restored.schemaVersion,2);assert.equal(routeProjectionStatus(restored),'pending');assert.notEqual(deriveItineraryCoverage(restored).state,'complete');
 const again=requireReadableTripDocument(restored);assert.deepEqual(again,restored);
 assert.throws(()=>requireReadableTripDocument({...restored,schemaVersion:3}),TripDocumentReadError);
});
test('required_corruption_is_invalid_and_optional_metadata_is_retained_with_a_warning',()=>{
 const trip=legacyRouteFixture();
 for(const value of [{...trip,legs:undefined},{...trip,recommendations:undefined},{...trip,travellers:'two'},{...trip,stops:[{id:'broken',name:'Tokyo'}]}]) assert.equal(readTripDocument(value).kind,'invalid');
 const malformed={...trip,brief:{...trip.brief,structuredBrief:{destinations:[null],hardConstraints:[],interests:[],source:{},placeMentions:[null]}}};
 const result=readTripDocument(malformed);assert.equal(result.kind,'readable');if(result.kind==='readable'){assert.ok(result.issues.some(issue=>issue.code==='malformed_optional_metadata'));assert.deepEqual(result.trip.brief.structuredBrief,malformed.brief.structuredBrief);}
});

test("malformed_v2_intent_and_incoherent_stop_order_are_invalid",()=>{
 const trip=canonicalRouteFixture();
 for(const intent of [{...trip.brief.intent,hardConstraints:null},{...trip.brief.intent,preferences:null},{...trip.brief.intent,timing:null}]) assert.equal(readTripDocument({...trip,brief:{...trip.brief,intent}}).kind,"invalid");
 assert.equal(readTripDocument({...trip,stops:trip.stops.map((stop,index)=>({...stop,order:index===0?2:index}))}).kind,"invalid");
});
