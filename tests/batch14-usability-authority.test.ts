import assert from 'node:assert/strict';
import test from 'node:test';
import { prioritizeRouteStopSuggestions } from '../lib/easyt/place-autocomplete.ts';
import { tripIntentForTrip } from '../lib/easyt/trip.ts';
import { buildTripCopilotProjection } from '../lib/easyt/trip-copilot.ts';
import { structuredTripBriefFromSavedSelections } from '../lib/easyt/structured-trip-brief.ts';
import { canonicalRouteFixture, legacyRouteFixture } from './fixtures/batch14-route-documents.ts';

for (const [name,id,query] of [['Japan','japan','Japan'],['Germany','germany','Germany'],['Japan','japan','Japón'],['United States','united-states','USA']]) {
  test(`whole-query ${query} prioritizes verified country before namesakes and display limit`,()=>{
    const town={name,canonicalPlaceId:'foreign-town',placeType:'town',routability:'direct_destination'};
    const country={name,canonicalPlaceId:id,placeType:'country',routability:'planning_area'};
    const candidates=[town,...Array.from({length:8},(_,i)=>({...town,name:`Other ${i}`})),country];
    const ranked=prioritizeRouteStopSuggestions(candidates,'route-stop',query);
    assert.equal(ranked.slice(0,8)[0],country);
    assert.equal(candidates[0],town);
  });
}
test('qualified settlement query does not receive country priority',()=>{
  const town={name:'Japan',canonicalPlaceId:'foreign-town',placeType:'town',routability:'direct_destination'};
  const country={name:'Japan',canonicalPlaceId:'japan',placeType:'country',routability:'planning_area'};
  assert.equal(prioritizeRouteStopSuggestions([country,town],'route-stop','Japan, Missouri')[0],town);
  assert.deepEqual(prioritizeRouteStopSuggestions([country,town],'unknown'),[country,town]);
});
test('v2 readers retain accepted preferences and constraints instead of historical capture',()=>{
  const trip=canonicalRouteFixture();
  trip.brief.structuredBrief=structuredTripBriefFromSavedSelections({pace:'relaxed',transportPreferences:['drive'],avoidDriving:false});
  trip.brief.intent!.preferences={...trip.brief.intent!.preferences,pace:'packed',transportModes:['train'],interests:[]};
  trip.brief.intent!.hardConstraints={...trip.brief.intent!.hardConstraints,avoidDriving:true,fixedCommitments:[]};
  const before=structuredClone(trip.brief.structuredBrief);
  const intent=tripIntentForTrip(trip);
  assert.equal(intent.preferences.pace,'packed');
  assert.deepEqual(intent.preferences.transportModes,['train']);
  assert.equal(intent.hardConstraints.avoidDriving,true);
  assert.deepEqual(intent.preferences.interests,[]);
  const projection=buildTripCopilotProjection(trip).trip.preferences;
  assert.equal(projection.pace,'packed');
  assert.deepEqual(projection.transport,['train']);
  assert.ok(projection.hardConstraints.includes('no driving'));
  assert.deepEqual(trip.brief.structuredBrief,before);
});
test('v2 explicit empty transport and removed no-driving stay cleared; legacy source compatibility remains',()=>{
  const trip=canonicalRouteFixture();
  trip.brief.structuredBrief=structuredTripBriefFromSavedSelections({pace:'packed',transportPreferences:['train'],avoidDriving:true});
  trip.brief.intent!.preferences.transportModes=[];
  trip.brief.intent!.hardConstraints.avoidDriving=false;
  assert.deepEqual(tripIntentForTrip(trip).preferences.transportModes,[]);
  assert.deepEqual(buildTripCopilotProjection(trip).trip.preferences.transport,[]);
  assert.ok(!buildTripCopilotProjection(trip).trip.preferences.hardConstraints.includes('no driving'));
  const legacy=legacyRouteFixture();legacy.brief.structuredBrief=trip.brief.structuredBrief;
  assert.equal(tripIntentForTrip(legacy).preferences.pace,'packed');
  assert.equal(tripIntentForTrip(legacy).hardConstraints.avoidDriving,true);
});
