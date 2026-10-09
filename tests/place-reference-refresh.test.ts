import test from 'node:test';import assert from 'node:assert/strict';
import * as reference from '../lib/easyt/place-reference.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {mapRouteLegsFromTrip} from '../lib/easyt/map-spatial-context.ts';
import {guardTripRoutingGeometry} from '../lib/easyt/geographic-binding.ts';
import {searchReferencePlaces,referencePlaceById} from '../lib/easyt/place-reference.server.ts';
test('browser/server reference mismatch rejects new choices without changing existing selections',()=>{
 const seed=reference.referenceCountrySeeds('FJ')[0],candidate={providerId:seed.referenceProviderId!,referenceSnapshotId:reference.REFERENCE_SNAPSHOT_ID};
 assert.equal(reference.referenceResponseCompatible(candidate),true);
 assert.equal(reference.referenceResponseCompatible({...candidate,referenceSnapshotId:'other'}),false);
 assert.equal(reference.referenceResponseCompatible({...candidate,providerId:candidate.providerId.replace('@','@other-')}),false);
 assert.equal(reference.referenceResponseCompatible({providerId:'photon:node:1'}),true);
});
test('reference rename/code/point/country/deletion lookups cannot reassign saved authored decisions or legacy unknown ending',()=>{
 const saved=canonicalRouteFixture();
 const first=saved.stops[0];saved.stops[1].canonicalPlaceId=first.canonicalPlaceId;
 const before=JSON.stringify(saved),read=requireReadableTripDocument(JSON.parse(before));
 const point=referencePlaceById(reference.referenceCountrySeeds('FJ')[0].canonicalPlaceId)!;
 for(const changed of [{...point,canonicalName:'Renamed'},{...point,iataCode:'NEW'},{...point,coordinates:[0,0] as const},{...point,countryCode:'PF'},{...point,status:'quarantined' as const}]){
  reference.referenceSelectionMatches({canonicalPlaceId:point.canonicalPlaceId,providerId:point.providerId,country:'Fiji',placeType:point.placeType,coordinates:point.coordinates},changed,'simulated-refresh');
  searchReferencePlaces('Mostar',{});searchReferencePlaces('San Pedro de Atacama',{});
  guardTripRoutingGeometry(read);mapRouteLegsFromTrip(read);
  assert.equal(JSON.stringify(saved),before);assert.equal(read.brief.intent.route.journeyEnd.mode,'unknown');assert.equal(read.brief.intent.route.orderAuthority,'manual');
 }
 assert.deepEqual(read.stops.map(s=>[s.id,s.canonicalPlaceId,s.longitude,s.latitude,s.nights,s.order]),saved.stops.map(s=>[s.id,s.canonicalPlaceId,s.longitude,s.latitude,s.nights,s.order]));
 assert.deepEqual(read.planItems,saved.planItems);assert.deepEqual(read.brief.manualNightStopIds,saved.brief.manualNightStopIds);
});

import {createOpenWorldPlaceProvider} from '../lib/easyt/open-world-place.server.ts';
import {resolveExplicitPlaceMentionsWithProvider} from '../lib/easyt/place-intelligence.ts';
test('engine reference choices retain stable source identity and versioned point provenance',async()=>{
 const expected=searchReferencePlaces('Suva',{explicitCountryNames:['Fiji']})[0];assert.ok(expected);
 const provider=createOpenWorldPlaceProvider({searchMode:'reference-only',cache:new Map()});
 const result=await resolveExplicitPlaceMentionsWithProvider([{sourceText:'Suva',role:'preferred',travelIntent:'route-stop'}],provider,{countryNames:['Fiji']});
 const mention=result.mentions[0];assert.equal(mention.status,'resolved');assert.equal(mention.canonicalPlaceId,expected.canonicalPlaceId);
 assert.deepEqual(mention.coordinates,expected.coordinates);assert.ok(mention.provenance.some(p=>p.id===expected.providerId));
});
test('a conflicting provider tuple cannot claim a stable reference identity',async()=>{
 const candidate=searchReferencePlaces('Suva',{explicitCountryNames:['Fiji']})[0];
 const result=await resolveExplicitPlaceMentionsWithProvider([{sourceText:'Suva',role:'preferred',travelIntent:'route-stop'}],{id:'fixture',label:'Fixture',lookup:async()=>[{...candidate,coordinates:[0,0]}]},{countryNames:['Fiji']});
 assert.notEqual(result.mentions[0].canonicalPlaceId,candidate.canonicalPlaceId);
});
