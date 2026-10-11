import assert from 'node:assert/strict';
import {referencePlaceById} from '../../lib/easyt/place-reference.server.ts';
import {referenceRecordKey,REFERENCE_SNAPSHOT_ID} from '../../lib/easyt/place-reference.ts';
import {journeyEndpointPlaceFromSuggestion} from '../../lib/easyt/journey-endpoints.ts';
import {geographicallyReady} from '../../lib/easyt/geographic-binding.ts';
import {requireReadableTripDocument} from '../../lib/easyt/trip-document.ts';

// Explicit current source selections for this acceptance fixture, not a
// crosswalk/migration of the separately preserved historical provider capture.
export const A12_CURRENT_SOURCE_SELECTIONS = {
 London:{id:'reference:geonames:2643743',country:'United Kingdom',iso:'GB',coordinates:[-0.12574,51.50853]},
 Milan:{id:'reference:geonames:3173435',country:'Italy',iso:'IT',coordinates:[9.18951,45.46427]},
 Venice:{id:'reference:geonames:3164603',country:'Italy',iso:'IT',coordinates:[12.33265,45.43713]},
} as const;
function currentSelection(name:keyof typeof A12_CURRENT_SOURCE_SELECTIONS){
 const expected=A12_CURRENT_SOURCE_SELECTIONS[name],record=referencePlaceById(expected.id);
 assert(record,'Missing explicit pinned A12 source identity: '+expected.id);
 assert.equal(record.canonicalPlaceId,expected.id);assert.equal(record.source,'geonames');
 assert.equal(record.status,'active');assert.equal(record.canonicalName,name);
 assert.equal(record.countryCode,expected.iso);assert.equal(record.placeType,'city');
 assert.deepEqual(record.coordinates,expected.coordinates);
 assert.equal(record.providerId,referenceRecordKey(record,REFERENCE_SNAPSHOT_ID));
 const selected=journeyEndpointPlaceFromSuggestion({canonicalPlaceId:record.canonicalPlaceId,
  referenceSnapshotId:REFERENCE_SNAPSHOT_ID,name:record.canonicalName,label:record.canonicalName,
  country:expected.country,placeType:record.placeType,routability:'direct_destination',
  coordinates:[...record.coordinates],provenance:[{id:record.providerId,label:'GeoNames',kind:'provider',
   supports:'Explicit acceptance-fixture selection of this exact pinned source record.'}]});
 assert(selected&&geographicallyReady(selected,'endpoint'));return selected;
}
export function acceptedA12OccurrenceTrip(captured:unknown){
 const trip=requireReadableTripDocument(structuredClone(captured));
 const origin=currentSelection('London');trip.brief.intent.route.origin=origin;
 Object.assign(trip.brief,{origin:origin.name,originCountry:origin.country,
  originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates});
 for(const stop of trip.stops){
  assert(stop.name==='Milan'||stop.name==='Venice','Only the two existing retained occurrences are initialized');
  const selected=currentSelection(stop.name);
  Object.assign(stop,{canonicalPlaceId:selected.canonicalPlaceId,providerId:selected.providerId,
   longitude:selected.coordinates![0],latitude:selected.coordinates![1],geographicBinding:selected.geographicBinding});
  for(const intent of trip.brief.intent.route.destinations)if(intent.stopIds.includes(stop.id))intent.selectedPlace=selected;
  for(const commitment of trip.brief.intent.hardConstraints.fixedCommitments)if(commitment.stopId===stop.id)
   commitment.place={name:selected.name,country:selected.country,canonicalPlaceId:selected.canonicalPlaceId};
 }
 // This is derived state for the old fixture's selected tuples.
 trip.brief.intent.route.projectionInputKey=null;
 return trip;
}
