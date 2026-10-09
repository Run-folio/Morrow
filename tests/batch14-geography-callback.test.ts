import assert from 'node:assert/strict';
import test from 'node:test';
import {actualCallbackHarness,lima,region} from './helpers/builder-handoff-callback.ts';
import {acceptedGeographicPlace,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {builderPlaceCommand} from '../lib/easyt/trip-builder-handler-contract.ts';

test('actual Builder callback binds compatible city geometry without changing manual order, IDs or nights',()=>{
 const h=actualCallbackHarness();h.send(lima.choices);assert.equal(h.accepted(),1);
 assert.deepEqual([h.trip().stops[0].longitude,h.trip().stops[0].latitude],lima.expected.coordinates);
 assert.deepEqual(h.trip().brief.intent.route.orderedStopIds,h.before.brief.intent.route.orderedStopIds);
 assert.equal(h.trip().brief.intent.route.orderAuthority,'manual');
 assert.deepEqual(h.trip().stops.map(s=>[s.id,s.nights]),h.before.stops.map(s=>[s.id,s.nights]));
});
test('actual Builder callback retains region-only result for clarification without accepting a city edit',()=>{
 const h=actualCallbackHarness();h.send([region]);assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
 assert.equal(h.scope.lookupSession.statuses.get(h.mention.mentionId),'needs-confirmation');
});
test('actual callback discards a foreign-owner response',()=>{
 const h=actualCallbackHarness();h.scope.activeBrowserOwnerIdRef.current='owner-b';h.send(lima.choices);assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});

test('actual callback rejects a held result after a newer geometry-only edit with unchanged city identity',()=>{
 const h=actualCallbackHarness();h.changeCoordinates([-77.0306,-12.046]);const newer=structuredClone(h.trip());h.send(lima.choices);
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),newer);
});

test('missing-coordinate seed cannot overwrite a newer confirmed same-identity provider point',()=>{
 const h=actualCallbackHarness();assert.equal(h.scope.seedById.get(h.trip().stops[0].id).coordinates,undefined);
 const place=acceptedGeographicPlace(stopGeographicPlace(h.trip().stops[0]),{...lima.expected,coordinates:[-77.025,-12.04]});assert.ok(place);
 h.scope.dispatchAcceptedBuilderEdit(builderPlaceCommand(h.trip(),{stopId:h.trip().stops[0].id,intentId:h.mention.mentionId,place:place!}),{expectedInputRevision:1});
 const confirmed=structuredClone(h.trip());h.send(lima.choices);
 assert.equal(h.accepted(),1,'held callback must not apply a second edit');assert.deepEqual(h.trip(),confirmed);
});

test('evidence-only confirmation invalidates held initial lookup with identical point and provider',()=>{
 const h=actualCallbackHarness(lima.expected.coordinates);
 const place=acceptedGeographicPlace(stopGeographicPlace(h.trip().stops[0]),lima.expected);assert.ok(place);
 h.scope.dispatchAcceptedBuilderEdit(builderPlaceCommand(h.trip(),{stopId:h.trip().stops[0].id,intentId:h.mention.mentionId,place:place!}),{expectedInputRevision:1});
 const confirmed=structuredClone(h.trip());h.send(lima.choices);
 assert.equal(h.accepted(),1,'evidence changed even though identity and point did not');assert.deepEqual(h.trip(),confirmed);
});

test('unchanged target still accepts held compatible lookup after a sibling budget edit',()=>{
 const h=actualCallbackHarness();h.scope.dispatchAcceptedBuilderEdit({kind:'budget',budget:'high'},{expectedInputRevision:1});
 h.send(lima.choices);assert.equal(h.accepted(),2);assert.equal(h.trip().brief.budgetBand,'high');
 assert.deepEqual([h.trip().stops[0].longitude,h.trip().stops[0].latitude],lima.expected.coordinates);
 assert.deepEqual(h.trip().stops.map(s=>[s.id,s.nights]),h.before.stops.map(s=>[s.id,s.nights]));
});
