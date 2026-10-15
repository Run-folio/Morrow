import assert from 'node:assert/strict';
import test from 'node:test';
import { createTwoStoreTripPersistence } from '../lib/easyt/two-store-trip-persistence.ts';
import { resolveTripTransferJourneys } from '../lib/easyt/multimodal-transfer-resolution.ts';
import { RoadRoutingError } from '../lib/easyt/road-routing.ts';
import { builderRemoveCommand, prepareBuilderHandlerEdits } from '../lib/easyt/trip-builder-handler-contract.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { prepareTripDocumentForWrite } from '../lib/easyt/trip-document.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { tripRecoveryStorageKey } from '../lib/easyt/storage.ts';
import type { EasyTBrowserStorage } from '../lib/easyt/storage.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { jsonbObjectOrder, saveReopenTripFixture } from './fixtures/save-reopen-trip.ts';

class QuotaStorage implements EasyTBrowserStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem() { throw new DOMException('Synthetic quota only', 'QuotaExceededError'); }
  removeItem(key: string) { this.values.delete(key); }
}
const context = { ownerId: 'owner-a', isCurrent: () => true, overflowEnabled: true, accountOverflowQualified: true };
// Exercise real transfer resolution with no provider/network access.
const provider = { provider: 'openrouteservice' as const, async route(): Promise<never> { throw new RoadRoutingError('configuration'); } };
async function acknowledgedTrip() {
  const storage = new QuotaStorage(), driver = new MemoryRecoveryDriver();
  const broker = createTwoStoreTripPersistence(storage, driver, context);
  const submitted = await resolveTripTransferJourneys(saveReopenTripFixture(), { provider });
  const first = await broker.save(submitted, { newTripOrClone: true, writeId: 'initial' });
  assert.equal(first.stored, true); assert.equal(first.handle.backend, 'indexeddb');
  const canonical = prepareTripDocumentForWrite(jsonbObjectOrder({ ...submitted,
    updatedAt: nextTripUpdatedAt(submitted.updatedAt) }));
  assert.equal((await broker.acknowledge(submitted, canonical, first.handle)).outcome, 'acknowledged');
  // A cold GET repeats the production repository's read-time projection.
  const opened = prepareTripDocumentForWrite(await resolveTripTransferJourneys(structuredClone(canonical), { provider }));
  assert.deepEqual(opened, canonical, 'GET must not change any persisted value in this reproduction');
  assert.notEqual(JSON.stringify(opened), JSON.stringify(canonical), 'real GET projection changes object representation');
  const cold = createTwoStoreTripPersistence(storage, driver, context);
  const read = await cold.read(opened.id); assert.equal(read.kind, 'found');
  if (read.kind === 'found') assert.equal(read.recovery, null, 'an acknowledged head exposes no editable recovery handle');
  return { storage, driver, broker: cold, canonical, opened, first };
}
function removeFlores(source: CanonicalEasyTTrip) {
  const command = builderRemoveCommand(source, source.stops[0]!.id); assert.ok(command);
  const edited = prepareBuilderHandlerEdits(source, [command], builderDocumentFingerprint(source));
  assert.ok(edited.ok);
  assert.deepEqual(edited.trip.stops.map(stop => stop.name), ['Antigua Guatemala', 'Panajachel', 'Colón', 'Panama City', 'David']);
  return edited.trip;
}
for (const discarded of [false, true]) test(`ACKed overflow GET permits one removal across object order; discarded=${discarded}`, async () => {
  const h = await acknowledgedTrip();
  if (discarded) assert.equal(await h.broker.discard(h.first.handle, true), true);
  const generations = [...h.driver.generations], native = [...h.storage.values];
  const saved = await h.broker.save(removeFlores(h.opened), { canonicalBase: h.opened, writeId: 'remove-flores' });
  assert.equal(saved.stored, true, 'representation-only GET differences must not fabricate protected recovery');
  assert.equal(saved.readbackConfirmed, true);
  assert.deepEqual([...h.storage.values], native);
  for (const [key, raw] of generations) assert.equal(h.driver.generations.get(key), raw, 'prior recovery generations remain byte-exact');
  const reopened = await h.broker.read(h.opened.id); assert.equal(reopened.kind, 'found');
  if (reopened.kind === 'found') assert.deepEqual(reopened.trip.stops.map(stop => stop.name),
    ['Antigua Guatemala', 'Panajachel', 'Colón', 'Panama City', 'David']);
});
for (const change of ['revision', 'title', 'generated-leg', 'array-order', 'owner'] as const) test(`ACK admission still refuses changed ${change}`, async () => {
  const h = await acknowledgedTrip(), base = structuredClone(h.opened);
  if (change === 'revision') base.updatedAt = nextTripUpdatedAt(base.updatedAt);
  if (change === 'title') base.title = 'different traveller edit';
  if (change === 'generated-leg') base.legs[0]!.durationMinutes = (base.legs[0]!.durationMinutes ?? 0) + 1;
  if (change === 'array-order') base.brief.intent.preferences.dislikes.reverse();
  if (change === 'owner') base.ownerId = 'owner-b';
  const before = [...h.driver.generations], native = [...h.storage.values];
  const result = await h.broker.save(removeFlores(h.opened), { canonicalBase: base, writeId: 'refused' });
  assert.equal(result.stored, false); assert.equal(result.blockedByExistingRecovery, true); assert.equal(result.writeAttempted, false);
  assert.deepEqual([...h.driver.generations], before); assert.deepEqual([...h.storage.values], native);
});
test('an unacknowledged newer domain head cannot be replaced through an old GET', async () => {
  const h = await acknowledgedTrip();
  assert.equal((await h.broker.save({ ...h.canonical, title: 'newer device edit' },
    { canonicalBase: h.canonical, writeId: 'newer' })).stored, true);
  const before = [...h.driver.generations];
  const result = await h.broker.save(removeFlores(h.opened), { canonicalBase: h.opened, writeId: 'stale-get' });
  assert.equal(result.stored, false); assert.equal(result.writeAttempted, false);
  assert.deepEqual([...h.driver.generations], before);
});
test('a genuinely divergent native copy stays protected after an acknowledged GET', async () => {
  const h = await acknowledgedTrip();
  h.storage.values.set(tripRecoveryStorageKey('owner-a', h.opened.id, 'foreign'), JSON.stringify({ version: 2,
    ownerId: 'owner-a', tripId: h.opened.id, writeId: 'foreign', trip: { ...h.canonical, title: 'different native edit' },
    state: 'pending', savedAt: '2026-10-15T00:00:00.000Z' }));
  const before = [...h.driver.generations], native = [...h.storage.values];
  const result = await h.broker.save(removeFlores(h.opened), { canonicalBase: h.opened, writeId: 'refused' });
  assert.equal(result.stored, false); assert.equal(result.blockedByExistingRecovery, true);
  assert.deepEqual([...h.driver.generations], before); assert.deepEqual([...h.storage.values], native);
});
