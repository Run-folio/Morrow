import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {preferredHandoffLocationChoice,mergeHandoffLocationChoice} from '../lib/easyt/home-trip-handoff.ts';
import {acceptedGeographicPlace,geographicallyReady,stopGeographicPlace,guardTripRoutingGeometry,validatedActivityCoordinates} from '../lib/easyt/geographic-binding.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {prepareAcceptedBuilderEdit} from '../lib/easyt/trip-builder-edit.ts';
import {routeProjectionInputKey} from '../lib/easyt/trip-route-intent.ts';
import {pendingBuilderReconciliationUnits,mergeBuilderProjectionResponse} from '../lib/easyt/trip-builder-reconciliation.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import type {HandoffLocationChoice} from '../lib/easyt/home-trip-handoff.ts';
import type {ResolvedPlaceMention} from '../lib/easyt/place-intelligence.ts';
import {canBuildTrip,builderRouteInputIsReady} from '../lib/easyt/can-build-trip.ts';
import {routeFamilies} from '../lib/easyt/route-catalog.ts';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-city-region-candidates.json',import.meta.url),'utf8')) as Array<{case:string;name:string;mention:ResolvedPlaceMention;choices:HandoffLocationChoice[];expected:HandoffLocationChoice}>;
for(const f of fixtures)test(`frozen ${f.case} ${f.name} chooses compatible city, preserving aliases`,()=>{
 assert.deepEqual(preferredHandoffLocationChoice(f.mention,f.choices),f.expected);
 const region=f.choices.find(c=>c.placeType==='region')!;
 assert.equal(preferredHandoffLocationChoice(f.mention,[region]),undefined);
 assert.equal(preferredHandoffLocationChoice(f.mention,[{...f.expected,country:'Portugal'}]),undefined);
 assert.equal(preferredHandoffLocationChoice(f.mention,[{...f.expected,coordinates:[999,99]}]),undefined);
 const repeated=[{id:'stay-a',name:f.name,country:f.expected.country,nights:3},{id:'stay-b',name:f.name,country:f.expected.country,nights:2}];
 assert.deepEqual(mergeHandoffLocationChoice(repeated,f.mention,region,'stay-a'),repeated);
 const merged=mergeHandoffLocationChoice(repeated,f.mention,f.expected,'stay-a');
 assert.equal(merged[0]!.id,'stay-a');assert.equal((merged[0] as typeof repeated[number]).nights,3);assert.deepEqual(merged[1],repeated[1]);
});
test('distinct plausible provider identities require clarification instead of arbitrary first selection',()=>{
 const f=fixtures[0]!;
 assert.equal(preferredHandoffLocationChoice(f.mention,[f.expected,{...f.expected,canonicalPlaceId:'other-lima',providerId:'node:other',coordinates:[-77.031,-12.04]}]),undefined);
});
test('a candidate outside the captured location bounds cannot replace its geometry',()=>{
 const f=fixtures[0]!,mention={...f.mention,bounds:{west:-77.2,east:-76.9,south:-12.2,north:-11.9}};
 assert.equal(preferredHandoffLocationChoice(mention,[{...f.expected,coordinates:[-77.5,-12.05]}]),undefined);
 assert.deepEqual(preferredHandoffLocationChoice(mention,[f.expected]),f.expected);
});
test('provider verification is durable, bounded, and tied to its exact owner input',()=>{
 const f=fixtures[0]!,owner={name:f.name,country:f.expected.country,canonicalPlaceId:f.mention.canonicalPlaceId,providerId:f.expected.providerId,coordinates:f.expected.coordinates};
 const accepted=acceptedGeographicPlace(owner,f.expected);
 assert.ok(accepted?.geographicBinding);assert.equal(geographicallyReady(JSON.parse(JSON.stringify(accepted)),'stop'),true);
 assert.equal(geographicallyReady({...accepted!,coordinates:[-76.285,-12.2]},'stop'),false);
 assert.equal(geographicallyReady({...accepted!,geographicBinding:{...accepted!.geographicBinding!,placeType:'region'}},'stop'),false);
 assert.equal(geographicallyReady({...accepted!,geographicBinding:{version:99} as never},'stop'),false);
 assert.equal(geographicallyReady(owner,'stop'),false,'legacy provider geometry has no durable entity semantics');
 assert.equal(acceptedGeographicPlace(owner,f.choices[0]!),undefined,'bypassing the chooser cannot bind a region to a city');
});
test('trusted catalog coordinates can verify, but provider points never inherit catalog trust',()=>{
 const catalog={name:'Tokyo',country:'Japan',canonicalPlaceId:'tokyo',coordinates:[139.6917,35.6895] as [number,number]};
 assert.equal(geographicallyReady(catalog,'stop'),true);
 assert.equal(geographicallyReady({...catalog,providerId:'nominatim:node:unverified'},'stop'),false);
 assert.equal(geographicallyReady({...catalog,coordinates:[139.7,35.7]},'stop'),false);
});
test('curated directly routable island remains usable; broad provider island never verifies a city',()=>{
 const seed=routeFamilies.filter(route=>route.confidence!=='needs-review').flatMap(route=>route.stops).find(stop=>stop.name==='Naxos')!;
 assert.ok(seed);
 const island={name:'Naxos',country:'Greece',canonicalPlaceId:'naxos',coordinates:seed.coordinates};
 assert.equal(geographicallyReady(island),true);
 assert.ok(acceptedGeographicPlace(island,{...island,placeType:'island',routability:'direct_destination'}));
 assert.equal(acceptedGeographicPlace({name:'Lima',country:'Peru',canonicalPlaceId:'lima'}, {...fixtures[0]!.expected,placeType:'island'}),undefined);
});
test('evidence-only accepted verification changes incident work bases without allocating dates, nights or order',()=>{
 let trip=requireReadableTripDocument(canonicalRouteFixture());
 const f=fixtures[0]!,s=trip.stops[0]!;
 Object.assign(s,{name:'Lima',country:'Peru',canonicalPlaceId:'lima',providerId:f.expected.providerId,longitude:f.expected.coordinates[0],latitude:f.expected.coordinates[1]});
 const intent=trip.brief.intent.route.destinations.find(i=>i.stopIds.includes(s.id))!;
 intent.selectedPlace=stopGeographicPlace(s);
 const before=structuredClone(trip),oldKey=routeProjectionInputKey(trip),oldFingerprint=builderDocumentFingerprint(trip);
 const place=acceptedGeographicPlace(stopGeographicPlace(s),f.expected)!;
 const command=builderPlaceCommand(trip,{stopId:s.id,intentId:intent.id,place})!;
 const accepted=prepareBuilderHandlerEdit(trip,command,oldFingerprint);assert.ok(accepted.ok);
 if(!accepted.ok)return;
 trip=accepted.trip;
 assert.notEqual(routeProjectionInputKey(trip),oldKey);assert.notEqual(builderDocumentFingerprint(trip),oldFingerprint);
 assert.deepEqual(trip.stops.map(s=>[s.id,s.nights,s.arrivalDate,s.departureDate]),before.stops.map(s=>[s.id,s.nights,s.arrivalDate,s.departureDate]));
 assert.deepEqual(trip.brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
 assert.deepEqual(trip.planItems,before.planItems);
 assert.ok(pendingBuilderReconciliationUnits(trip).some(u=>u.kind==='leg'));
 assert.ok(!pendingBuilderReconciliationUnits(trip).some(u=>u.kind==='schedule'));
 assert.equal(geographicallyReady(stopGeographicPlace(trip.stops[0]!),'stop'),true);
 const reloaded=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
 const promoted=requireReadableTripDocument(canonicalTripForOwner('owner-a',reloaded));
 assert.equal(geographicallyReady(stopGeographicPlace(promoted.stops[0]!),'stop'),true);
 assert.deepEqual(promoted.stops[0]!.geographicBinding,trip.stops[0]!.geographicBinding);
});
test('correcting geometry for the same canonical city does not create calendar work',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture()),f=fixtures[0]!,stop=trip.stops[0]!;
 Object.assign(stop,{name:'Lima',country:'Peru',canonicalPlaceId:'lima',providerId:f.choices[0]!.providerId,longitude:f.choices[0]!.coordinates[0],latitude:f.choices[0]!.coordinates[1]});
 const intent=trip.brief.intent.route.destinations.find(intent=>intent.stopIds.includes(stop.id))!;intent.selectedPlace=stopGeographicPlace(stop);
 const place=acceptedGeographicPlace(stopGeographicPlace(stop),f.expected)!;
 const command=builderPlaceCommand(trip,{stopId:stop.id,place})!;
 const edit=prepareAcceptedBuilderEdit(trip,command,builderDocumentFingerprint(trip));assert.ok(edit.ok);if(!edit.ok)return;
 assert.deepEqual(edit.scope.scheduleStopIds,[]);
 const accepted=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.ok(accepted.ok);if(!accepted.ok)return;
 assert.deepEqual(accepted.trip.stops.map(stop=>[stop.id,stop.nights,stop.arrivalDate,stop.departureDate]),trip.stops.map(stop=>[stop.id,stop.nights,stop.arrivalDate,stop.departureDate]));
 assert.deepEqual(accepted.trip.planItems,trip.planItems);
});
test('derived geometry masks never alter the original raw saved document or authored pin',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture());
 trip.stops[0]!.providerId='unknown-provider';
 trip.brief.mapPins=[{id:'authored',title:'Meeting point',category:'custom',dayNumber:1,longitude:12,latitude:13}];
 const before=JSON.stringify(trip),derived=guardTripRoutingGeometry(trip);
 assert.equal(derived.stops[0]!.longitude,null);assert.equal(derived.stops[0]!.latitude,null);
 assert.ok(derived.legs.filter(l=>l.fromStopId===trip.stops[0]!.id||l.toStopId===trip.stops[0]!.id).every(l=>l.durationMinutes===null&&l.mode==='unknown'));
 assert.equal(JSON.stringify(trip),before);assert.deepEqual(derived.brief.mapPins,trip.brief.mapPins);
});
test('a generated activity cannot reuse unverified base geometry; independent activity and authored pin points remain',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture()),stop=trip.stops[0]!;
 stop.providerId='unverified-legacy';const before=JSON.stringify(trip);
 assert.equal(validatedActivityCoordinates(stop,[stop.longitude!,stop.latitude!]),null);
 assert.deepEqual(validatedActivityCoordinates(stop,[139.7,35.7]),[139.7,35.7]);
 assert.equal(JSON.stringify(trip),before);
});
test('pre-geography saved pending/failed work survives codec and promotion; target verification retires only incident bases',()=>{
 const frozen=JSON.parse(readFileSync(new URL('./fixtures/batch14-pre-geography-pending.json',import.meta.url),'utf8'));
 assert.equal(frozen.sourceSha,'e2152fd');
 const trip=requireReadableTripDocument(frozen.trip),marker=trip.brief.cascadeStatus!.routeReconciliation!;
 assert.equal(marker.inputKey,routeProjectionInputKey(trip),'pre-evidence input serialization is unchanged');
 const roundtrip=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
 assert.deepEqual(roundtrip.brief.cascadeStatus!.routeReconciliation,marker);
 const promoted=requireReadableTripDocument(canonicalTripForOwner('owner-a',roundtrip));
 assert.equal(promoted.brief.cascadeStatus!.routeReconciliation!.residual.length,marker.residual.length);
 const stop=trip.stops[0]!,place=stopGeographicPlace(stop);
 const verified=acceptedGeographicPlace(place,{...place,placeType:'city',routability:'direct_destination'})!;
 const accepted=prepareBuilderHandlerEdit(trip,builderPlaceCommand(trip,{stopId:stop.id,place:verified})!,builderDocumentFingerprint(trip));assert.ok(accepted.ok);if(!accepted.ok)return;
 const after=accepted.trip.brief.cascadeStatus!.routeReconciliation!.residual;
 const unaffected=marker.residual.filter(unit=>unit.kind==='recommendation'&&unit.targetId!==stop.id||unit.kind==='leg'&&trip.legs.some(leg=>leg.id===unit.targetId&&leg.fromStopId!==stop.id&&leg.toStopId!==stop.id));
 assert.ok(unaffected.length);
 for(const unit of unaffected)assert.deepEqual(after.find(next=>next.kind===unit.kind&&next.targetId===unit.targetId),unit);
 assert.ok(after.some(unit=>unit.kind==='leg'&&unit.phase==='pending'&&marker.residual.some(old=>old.targetId===unit.targetId&&old.basisKey!==unit.basisKey)));
 const scope={ownerId:trip.ownerId,tripId:trip.id,inputRevision:1},dispatched=marker.residual.filter(unit=>unit.kind==='leg');
 const late=mergeBuilderProjectionResponse(accepted.trip,{scope,requestId:'held',inputKey:marker.inputKey,dispatched,results:dispatched.map(unit=>({...unit,phase:'complete'})),legs:trip.legs},{scope,requestId:'held',dispatched});
 assert.deepEqual(late,{ok:false,reason:'stale'});
});
test('missing, incompatible and malformed evidence remain readable/saveable, but only affected targets fail Build',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture());
 for(const stop of trip.stops){const place={...stopGeographicPlace(stop),providerId:`fixture:${stop.id}`};const verified=acceptedGeographicPlace(place,{...place,placeType:'city',routability:'direct_destination'})!;stop.providerId=verified.providerId;stop.geographicBinding=verified.geographicBinding;}
 const bad=trip.stops[0]!;bad.geographicBinding={version:99} as never;
 const before=JSON.stringify(trip),reloaded=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
 assert.equal(JSON.stringify(reloaded.stops[0]!.geographicBinding),JSON.stringify(bad.geographicBinding));
 const target={id:bad.id,name:bad.name,country:bad.country,canonicalPlaceId:bad.canonicalPlaceId};
 assert.equal(builderRouteInputIsReady([target]),true,'input readiness still permits an editable canonical draft');
 // Test the geography gate independently of the deliberately incomplete itinerary fixture.
 const result=canBuildTrip({origin:'London',originCoordinates:[-.1276,51.5072],stops:[target],startDate:trip.startDate,endDate:trip.endDate,durationDays:14,allocations:{},nightAllocation:{state:'conflict',conflicts:[],allocations:null} as never,document:reloaded});
 const conflict=result.conflicts.find(item=>item.code==='geography-unverified');assert.ok(conflict);assert.deepEqual(conflict.stopIds,[bad.id]);
 assert.equal(JSON.stringify(trip),before,'readiness does not rewrite the canonical document');
 const save=prepareBuilderHandlerEdit(reloaded,{kind:'budget',budget:'high'},builderDocumentFingerprint(reloaded));assert.ok(save.ok);
});
