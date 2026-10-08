import assert from 'node:assert/strict';
import test from 'node:test';
import { generatedPinFixture } from './fixtures/batch14-generated-pin.ts';
import { generatedFlexibleStopIds, allRequiredStaysHaveNights } from '../lib/easyt/trip-builder-generated-nights.ts';
import { builderStructuralSnapshot, type BuilderAcceptedEdit } from '../lib/easyt/trip-builder-edit.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { builderPlaceCommand, prepareBuilderHandlerEdit } from '../lib/easyt/trip-builder-handler-contract.ts';
import { prepareTripDocumentForWrite, requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';

const reload = (trip: CanonicalEasyTTrip) => requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
function apply(trip: CanonicalEasyTTrip, edit: BuilderAcceptedEdit) {
  const result = prepareBuilderHandlerEdit(trip, edit, builderDocumentFingerprint(trip));
  assert.ok(result.ok, JSON.stringify(result));
  return reload(result.trip);
}
function add(trip: CanonicalEasyTTrip, id = 'hiroshima-new') {
  const command = builderPlaceCommand(trip, { stopId: id, place: { name: 'Hiroshima', canonicalPlaceId: 'hiroshima', country: 'Japan', coordinates: [132.4553, 34.3853] }, requestedNights: null });
  assert.ok(command);
  return apply(trip, command);
}
function assertPinnedDay(trip: CanonicalEasyTTrip, before: CanonicalEasyTTrip) {
  const day = before.planItems.find(day => day.stopId === 'tokyo' && day.dayNumber === 7)!;
  assert.equal(trip.stops.find(stop => stop.id === 'tokyo')!.nights, 7);
  assert.deepEqual(trip.planItems.find(item => item.id === day.id), day);
  assert.deepEqual(trip.brief.mapPins, before.brief.mapPins);
  assert.equal(Boolean(trip.brief.retainedAuthoredContent?.entries.some(entry => entry.mapPins.some(pin => pin.id === before.brief.mapPins![0]!.id))), false);
  assert.equal(trip.endDate, before.endDate);
}

test('live day7 pin protects Tokyo through accepted addition, JSON reload and exact Undo', () => {
  const before = generatedPinFixture(), snapshot = builderStructuralSnapshot(before);
  const next = add(before);
  assertPinnedDay(next, before);
  assert.deepEqual([...generatedFlexibleStopIds(before)], ['kyoto']);
  assert.equal(next.stops.reduce((sum, stop) => sum + (stop.nights ?? 0), 0), 14);
  assert.ok(next.stops.every(stop => (stop.nights ?? 0) > 0));
  assert.equal(next.brief.intent.route.orderAuthority, before.brief.intent.route.orderAuthority);
  const undone = apply(next, { kind: 'structural-inverse', snapshot });
  assertPinnedDay(undone, before);
  assert.deepEqual(undone.stops, before.stops);
});
test('pinned stay remains live through subsequent addition, resolution and another stay increase', () => {
  const before = generatedPinFixture();
  let next = add(add(before), 'hiroshima-repeat');
  assertPinnedDay(next, before);
  next.brief.intent.route.destinations.push({ id: 'pending:nara', sourceText: 'Nara', kind: 'overnight_place', selectedPlace: null, resolution: 'unresolved', requestedNights: null, routeMembership: 'required', stopIds: [] });
  next = apply(reload(next), { kind: 'resolve-destination', intentId: 'pending:nara', stopId: 'nara-new', place: { name: 'Nara', canonicalPlaceId: 'nara', country: 'Japan', coordinates: [135.8, 34.6851] } });
  assertPinnedDay(next, before);
  const kyoto = next.stops.find(stop => stop.id === 'kyoto')!;
  next = apply(next, { kind: 'nights', stopId: kyoto.id, intentId: 'intent:kyoto', nights: kyoto.nights! + 1 });
  assertPinnedDay(next, before);
});
test('all day-pinned stays preserve 7/7 and a required addition needs nights', () => {
  const before = generatedPinFixture([7, 14]), next = add(before);
  assert.deepEqual(next.stops.map(stop => stop.nights), [7, 7, 0]);
  assert.deepEqual(next.brief.mapPins, before.brief.mapPins);
  for (const pin of before.brief.mapPins!) {
    const day = before.planItems.find(day => day.dayNumber === pin.dayNumber)!;
    assert.deepEqual(next.planItems.find(item => item.id === day.id), day);
  }
  assert.equal(allRequiredStaysHaveNights(next), false);
  assert.equal(next.endDate, before.endDate);
});
for (const dayNumber of [0, 99]) test(`unbound/stale pin day${dayNumber} does not freeze unrelated generated stays`, () => {
  const before = generatedPinFixture([dayNumber]);
  assert.deepEqual([...generatedFlexibleStopIds(before)], ['tokyo', 'kyoto']);
  const next = add(before);
  assert.deepEqual(next.stops.map(stop => stop.nights), [5, 5, 4]);
  assert.deepEqual(next.brief.mapPins, before.brief.mapPins);
});
test('pin coordinates and reference labels do not override its exact live day ownership', () => {
  const trip = generatedPinFixture([8]);
  trip.brief.mapPins![0]!.id = 'tokyo-reference';
  trip.brief.mapPins![0]!.title = 'Tokyo saved place reference';
  assert.deepEqual([...generatedFlexibleStopIds(trip)], ['tokyo']);
});
test('a pin saved after command capture is protected from the current document', () => {
  const old = generatedPinFixture([]), current = generatedPinFixture();
  const command = builderPlaceCommand(old, { stopId: 'hiroshima-new', place: { name: 'Hiroshima', canonicalPlaceId: 'hiroshima', country: 'Japan' } });
  assert.ok(command);
  const result = prepareBuilderHandlerEdit(current, command, builderDocumentFingerprint(old));
  assert.ok(result.ok);
  assertPinnedDay(reload(result.trip), current);
});
test('stale route source cannot allocate or displace a pinned day', () => {
  const old = generatedPinFixture(), current = apply(old, { kind: 'nights', intentId: 'intent:kyoto', stopId: 'kyoto', nights: 8 });
  const before = structuredClone(current);
  const command = builderPlaceCommand(old, { stopId: 'hiroshima-new', place: { name: 'Hiroshima', canonicalPlaceId: 'hiroshima', country: 'Japan' } });
  assert.ok(command);
  assert.deepEqual(prepareBuilderHandlerEdit(current, command, builderDocumentFingerprint(old)), { ok: false, reason: 'stale-source' });
  assert.deepEqual(current, before);
});
