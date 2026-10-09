import assert from 'node:assert/strict';
import test from 'node:test';
import {actualCallbackHarness,lima,region} from './helpers/builder-handoff-callback.ts';
import {acceptedGeographicPlace,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {builderPlaceCommand} from '../lib/easyt/trip-builder-handler-contract.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';

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

function initialHomepageSelection(h:ReturnType<typeof actualCallbackHarness>) {
 const selection={mentionId:h.mention.mentionId,kind:'visit',selectedCanonicalPlaceId:h.mention.canonicalPlaceId,
  selectedName:h.mention.canonicalName,selectedPlaceType:'city',selectedParentCountries:['Peru'],routeStopId:h.trip().stops[0].id,
  provenance:{id:h.mention.mentionId,kind:'builder',label:'Homepage destination selection',supports:'Selected destination occurrence'},confidence:h.mention.confidence};
 h.scope.placeSelectionsRef.current=[selection];h.scope.intakeSelectionKeys.add(authoredContentKey(selection));return selection;
}
test('unchanged homepage intent selection permits geography enrichment through the actual mounted callback',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);h.send(lima.choices);
 assert.equal(h.accepted(),1);assert.deepEqual([h.trip().stops[0].longitude,h.trip().stops[0].latitude],lima.expected.coordinates);
 assert.deepEqual(h.trip().stops.map(s=>[s.id,s.canonicalPlaceId,s.nights]),h.before.stops.map(s=>[s.id,s.canonicalPlaceId,s.nights]));
 assert.deepEqual(h.trip().brief.intent.route.orderedStopIds,h.before.brief.intent.route.orderedStopIds);
});
test('unchanged homepage intent selection permits geography enrichment before canonical mounting',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);const result=h.sendBeforeCanonical(lima.choices);
 assert.deepEqual(result.after[0].coordinates,lima.expected.coordinates);assert.ok(result.after[0].geographicBinding);
 assert.deepEqual(result.after.map(s=>[s.id,s.canonicalPlaceId,s.nights]),result.before.map(s=>[s.id,s.canonicalPlaceId,s.nights]));
});
test('a changed selection after intake still rejects the held geography response',()=>{
 const h=actualCallbackHarness();const selection=initialHomepageSelection(h);
 h.scope.placeSelectionsRef.current=[{...selection,selectedCanonicalPlaceId:'other-lima'}];h.send(lima.choices);
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});
test('a later explicit handling of the same initial selection still rejects the held response',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);h.scope.lookupSession.handled.add(h.mention.mentionId);h.send(lima.choices);
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});
test('a selection introduced after intake still rejects the held geography response',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);h.scope.intakeSelectionKeys.clear();h.send(lima.choices);
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});
test('a reply during canonical mounting waits for the edit owner and then enriches the durable document',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);
 assert.equal(h.sendDuringCanonicalMount(lima.choices),0,'reserved canonical seed must not receive an independent React-state update');
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
 h.replayPending();assert.equal(h.accepted(),1);assert.deepEqual([h.trip().stops[0].longitude,h.trip().stops[0].latitude],lima.expected.coordinates);
 h.replayPending();assert.equal(h.accepted(),1,'draining again cannot duplicate an accepted edit');
});
test('a newer same-identity geometry edit rejects a queued mount-gap reply',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);h.sendDuringCanonicalMount(lima.choices);
 h.changeCoordinates([-77.025,-12.04]);const newer=structuredClone(h.trip());h.replayPending();
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),newer);
});
test('queued mount-gap reply cannot cross owner scope',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);h.sendDuringCanonicalMount(lima.choices);
 h.scope.activeBrowserOwnerIdRef.current='owner-b';h.replayPending();assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});
test('queued mount-gap reply cannot cross trip scope',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);h.sendDuringCanonicalMount(lima.choices);
 h.trip().id='other-trip';const changed=structuredClone(h.trip());h.replayPending();assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),changed);
});
test('removing an intent before mounting prevents queued reply resurrection',()=>{
 const h=actualCallbackHarness();initialHomepageSelection(h);h.sendDuringCanonicalMount(lima.choices);
 h.scope.removedPlaceMentionIdsRef.current=[h.mention.mentionId];h.replayPending();assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});
test('a newer selection before mounting remains authoritative over the queued reply',()=>{
 const h=actualCallbackHarness();const selection=initialHomepageSelection(h);h.sendDuringCanonicalMount(lima.choices);
 h.scope.placeSelectionsRef.current=[{...selection,selectedCanonicalPlaceId:'other-lima'}];h.replayPending();assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});
