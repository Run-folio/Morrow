import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {savedJourneyFinishChoiceMatches} from '../lib/easyt/journey-endpoints.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-finish.json',import.meta.url),'utf8')).A20;
const trip=requireReadableTripDocument(fixture.trip),end=trip.brief.intent.route.journeyEnd;
assert(end.mode==='explicit');const finish=end.place,candidate=fixture.geocodeCandidates.Hanoi[0];
test('A20 actual catalog Hanoi stay bridges Hà Nội OSM relation1903516 without changing any inputs',()=>{
 const before=JSON.stringify(trip);assert(savedJourneyFinishChoiceMatches(finish,candidate,trip.stops));assert.equal(JSON.stringify(trip),before);
});
for(const kind of ['unknown-provider','unverified-osm-namespace','contradictory-provider','wrong-country','far-coordinate','invalid-coordinate','wrong-type'] as const)test(`A20 unfamiliar provider spelling needs proof: ${kind}`,()=>{
 const c=structuredClone(candidate);
 if(kind==='unknown-provider'){c.providerId='unverified';c.canonicalPlaceId='unknown:unverified';}
 if(kind==='unverified-osm-namespace'){c.providerId='unverified:r:1903516';c.canonicalPlaceId='open-world:unverified:r:1903516';}
 if(kind==='contradictory-provider')c.canonicalPlaceId='open-world:nominatim:relation:999999';
 if(kind==='wrong-country')c.country='Canada';
 if(kind==='far-coordinate')c.coordinates=[-79.4,43.7];
 if(kind==='invalid-coordinate')c.coordinates=[NaN,21];
 if(kind==='wrong-type'){c.kind='region';c.placeType='region';}
 assert.equal(savedJourneyFinishChoiceMatches(finish,c,trip.stops),false);
});
test('A20 verified OSM relation equivalence across Photon/Nominatim namespaces remains bounded by geography',()=>{
 const c={...candidate,providerId:'photon:r:1903516',canonicalPlaceId:'open-world:photon:r:1903516'};
 assert(savedJourneyFinishChoiceMatches(finish,c,trip.stops));assert(!savedJourneyFinishChoiceMatches(finish,{...c,coordinates:[-79.4,43.7]},trip.stops));
});
test('existing curated Bangkok/BKK alias remains a legitimate finish choice',()=>{
 const stop=trip.stops[0]!;assert.equal(stop.canonicalPlaceId,'bangkok');
 assert(savedJourneyFinishChoiceMatches({name:'Bangkok',country:'Thailand',canonicalPlaceId:'bangkok'},
  {name:'BKK',country:'Thailand',canonicalPlaceId:'bangkok',kind:'city',coordinates:[stop.longitude!,stop.latitude!]},trip.stops));
});
