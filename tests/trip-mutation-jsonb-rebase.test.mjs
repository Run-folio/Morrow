import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyRouteFixture } from './fixtures/batch14-route-documents.ts';
import { jsonbObjectOrder } from './fixtures/save-reopen-trip.ts';
import { createTripMutationPersistenceQueue, mergeTripMutationDocuments } from '../lib/easyt/trip-mutation-persistence.ts';

function allocationTrip() {
  const trip = legacyRouteFixture();
  trip.brief.nightAllocation = { stops: trip.stops.map(stop => ({
    stopId: stop.id, name: stop.name, nights: stop.nights,
    reasons: [{ code: 'manual-nights', detail: { source: 'traveller', values: ['first', 'second'] } }],
  })) };
  return trip;
}
function editNights(trip, nights) {
  const edited = structuredClone(trip);
  edited.stops[0].nights = nights;
  edited.brief.nightAllocation.stops[0].nights = nights;
  return edited;
}

test('JSONB key order cannot duplicate stopId allocation rows during a queued rebase', () => {
  const base = allocationTrip(), authored = editNights(base, 6);
  const canonical = jsonbObjectOrder({ ...base, updatedAt: 'ack-1' });
  const before = structuredClone({ base, authored, canonical });
  const merged = mergeTripMutationDocuments(base, authored, canonical);
  assert.deepEqual(merged.brief.nightAllocation.stops, authored.brief.nightAllocation.stops);
  assert.equal(merged.brief.nightAllocation.stops.length, 3);
  assert.equal(new Set(merged.brief.nightAllocation.stops.map(row => row.stopId)).size, 3);
  assert.deepEqual(merged.stops.map(stop => stop.nights), [6, 3, 2]);
  assert.deepEqual({ base, authored, canonical }, before, 'merge must not mutate inputs');
});

test('semantic rebase keeps real nested value edits and authored array order', () => {
  const base = allocationTrip(), authored = structuredClone(base);
  authored.brief.nightAllocation.stops[0].reasons[0].detail.source = 'new traveller constraint';
  authored.brief.nightAllocation.stops[0].reasons[0].detail.values.reverse();
  authored.brief.nightAllocation.stops.reverse();
  const canonical = jsonbObjectOrder({ ...base, title: 'Independent saved name', updatedAt: 'ack-1' });
  const merged = mergeTripMutationDocuments(base, authored, canonical);
  assert.deepEqual(merged.brief.nightAllocation.stops, authored.brief.nightAllocation.stops);
  assert.equal(merged.title, 'Independent saved name');
  assert.deepEqual(merged.brief.nightAllocation.stops.map(row => row.stopId), ['hiroshima', 'kyoto', 'tokyo']);
});

test('overlapping night edits submit exactly three rows after a delayed JSONB acknowledgement', async () => {
  const original = allocationTrip(), first = editNights(original, 5), second = editNights(first, 6);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const submitted = [];
  const queue = createTripMutationPersistenceQueue(async trip => {
    submitted.push(structuredClone(trip));
    if (submitted.length === 1) return held;
    assert.equal(trip.updatedAt, 'ack-1', 'next write uses the acknowledged CAS revision');
    assert.deepEqual(trip.brief.nightAllocation.stops, second.brief.nightAllocation.stops);
    return jsonbObjectOrder({ ...trip, updatedAt: 'ack-2' });
  });
  queue.reset(original);
  const handle = writeId => ({ ownerId: original.ownerId, tripId: original.id, writeId });
  const pendingFirst = queue.enqueue(first, handle('first'));
  const pendingSecond = queue.enqueue(second, handle('second'), first);
  await Promise.resolve();
  assert.equal(submitted.length, 1);
  release(jsonbObjectOrder({ ...first, updatedAt: 'ack-1' }));
  await pendingFirst;
  const saved = await pendingSecond;
  assert.equal(submitted.length, 2);
  assert.equal(saved.updatedAt, 'ack-2');
  assert.deepEqual(saved.stops.map(stop => stop.nights), [6, 3, 2]);
  assert.equal(saved.brief.nightAllocation.stops.length, 3);
});
