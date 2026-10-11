import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {acceptedA12OccurrenceTrip,A12_CURRENT_SOURCE_SELECTIONS} from './fixtures/batch14-accepted-occurrence.ts';
import {geographicallyReady,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {originPlaceFromBrief} from '../lib/easyt/journey-endpoints.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
const captured=requireReadableTripDocument(JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-occurrence.json',import.meta.url),'utf8')).A12.trip);
test('A12 explicit current selections preserve the captured occurrence and commitment contract without mutating history',()=>{
 const before=structuredClone(captured),selected=acceptedA12OccurrenceTrip(captured);
 assert.deepEqual(captured,before);
 assert.deepEqual(selected.stops.map(s=>[s.id,s.name,s.nights]),captured.stops.map(s=>[s.id,s.name,s.nights]));
 assert.equal(selected.startDate,captured.startDate);assert.equal(selected.endDate,captured.endDate);
 assert.deepEqual(selected.brief.intent.route.destinations.map(d=>[d.id,d.sourceText,d.stopIds]),captured.brief.intent.route.destinations.map(d=>[d.id,d.sourceText,d.stopIds]));
 assert.deepEqual(selected.brief.intent.hardConstraints.fixedCommitments.map(({place,...rest})=>rest),captured.brief.intent.hardConstraints.fixedCommitments.map(({place,...rest})=>rest));
 for(const stop of selected.stops){assert(stop.name==='Milan'||stop.name==='Venice');const expected=A12_CURRENT_SOURCE_SELECTIONS[stop.name];assert.equal(stop.canonicalPlaceId,expected.id);assert.deepEqual([stop.longitude,stop.latitude],expected.coordinates);assert(geographicallyReady(stopGeographicPlace(stop),'stop'));}
 assert(geographicallyReady(originPlaceFromBrief(selected.brief),'endpoint'));
});
test('A12 historical raw provider points remain unverified despite having coordinates',()=>{
 assert.deepEqual(captured.stops.filter(s=>!geographicallyReady(stopGeographicPlace(s),'stop')).map(s=>s.name),['Milan','Venice']);
 assert.equal(geographicallyReady(originPlaceFromBrief(captured.brief),'endpoint'),false);
});
