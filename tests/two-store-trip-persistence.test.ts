import assert from 'node:assert/strict';
import test from 'node:test';
import { createTwoStoreTripPersistence } from '../lib/easyt/two-store-trip-persistence.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { envelope } from './helpers/durable-recovery-fixture.ts';
import { saveTripRecoveryToStorage, tripRecoveryStorageKey, type EasyTBrowserStorage } from '../lib/easyt/storage.ts';
import { createRecoveryDomainStore } from '../lib/easyt/durable-recovery-store.ts';

class SyntheticStorage implements EasyTBrowserStorage {
  values = new Map<string, string>(); limit = Infinity; refusal: 'quota' | 'security' | 'silent' | null = null;
  get length() { return this.values.size; } key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.refusal === 'security') throw new DOMException('Synthetic only', 'SecurityError'); if (this.refusal === 'silent') return;
    const size = [...this.values].reduce((n, [key, val]) => n + (key === k ? 0 : 2 * (key.length + val.length)), 0) + 2 * (k.length + v.length);
    if (this.refusal === 'quota' || size > this.limit) throw new DOMException('Synthetic only', 'QuotaExceededError'); this.values.set(k, v);
  }
  removeItem(k: string) { this.values.delete(k); }
}
const trip = (writeId = 'candidate', ownerId: string | null = null) => JSON.parse(envelope(writeId, ownerId).rawRecovery).trip;
const ctx = (ownerId: string | null = null) => ({ ownerId, isCurrent: () => true, overflowEnabled: true, accountOverflowQualified: true });

test('matched 76 raw copies: 77th native quota enters domain, cold read needs no LS locator and all prior bytes stay exact', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver();
  for (let i = 0; i < 76; i++) {
    const candidate = { ...trip('retained-' + i), id: 'retained-' + i, retainedSyntheticText: '' };
    const key = tripRecoveryStorageKey(null, candidate.id, 'prior-' + i), record = { version: 2, ownerId: null, tripId: candidate.id, writeId: 'prior-' + i,
      trip: candidate, state: 'pending', savedAt: '2026-10-12T00:00:00.000Z' };
    const units = (136294 - 2 * (key.length + JSON.stringify(record).length)) / 2; candidate.retainedSyntheticText = 'x'.repeat(units);
    ls.values.set(key, JSON.stringify(record));
  }
  ls.limit = 10 * 1024 * 1024; const before = [...ls.values], candidate = { ...trip(), retainedSyntheticText: 'x'.repeat(70000) };
  const result = await createTwoStoreTripPersistence(ls, driver, ctx()).save(candidate, { newTripOrClone: true, writeId: 'overflow-77' });
  assert.equal(result.stored, true); assert.deepEqual([...ls.values], before); assert.equal(driver.generations.size, 1);
  const reopened = await createTwoStoreTripPersistence(ls, driver, ctx()).read(candidate.id); assert.equal(reopened.kind, 'found');
  if (reopened.kind === 'found') assert.deepEqual(reopened.trip, candidate);
});

test('even a successful LS setter must await the domain barrier; existing sole domain copy blocks unobserved raw replacement', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(), value = envelope('domain', null);
  await createRecoveryDomainStore(driver, { ownerId: null, isCurrent: () => true }).commit({ raw: JSON.stringify(value), expectedHead: null, admission: 'native-setter-quota' });
  const result = await createTwoStoreTripPersistence(ls, driver, ctx()).save(trip('unobserved'), { newTripOrClone: true });
  assert.equal(result.stored, false); assert.equal(result.blockedByExistingRecovery, true); assert.equal(ls.values.size, 0);
});

test('raw divergence against an unacknowledged domain branch is preserved and blocks supported selection/writing', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(), value = envelope('domain', null);
  await createRecoveryDomainStore(driver, { ownerId: null, isCurrent: () => true }).commit({ raw: JSON.stringify(value), expectedHead: null, admission: 'native-setter-quota' });
  saveTripRecoveryToStorage(ls, trip('old-tab'), { ownerId: null, writeId: 'old-raw' }); const before = [...ls.values];
  const broker = createTwoStoreTripPersistence(ls, driver, ctx()); assert.equal((await broker.read(value.handle.tripId)).kind, 'protected');
  assert.equal((await broker.save(trip('new'), { newTripOrClone: true })).stored, false); assert.deepEqual([...ls.values], before); assert.equal(driver.generations.size, 1);
});

test('unavailable DB cannot authorize an LS write or turn a readable LS document into authoritative absence', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(); driver.fail = new DOMException('Synthetic denial', 'SecurityError');
  const result = await createTwoStoreTripPersistence(ls, driver, ctx()).save(trip(), { newTripOrClone: true });
  assert.equal(result.stored, false); assert.equal(ls.values.size, 0); assert.equal((await createTwoStoreTripPersistence(ls, driver, ctx()).read(trip().id)).kind, 'unavailable');
});

test('security/silent refusal and held activation/account eligibility cannot admit a first domain copy', async () => {
  for (const mode of ['security', 'silent', 'disabled', 'account', 'existing-trip'] as const) {
    const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(), ownerId = mode === 'account' ? 'owner-a' : null;
    ls.refusal = mode === 'security' || mode === 'silent' ? mode : 'quota';
    const context = { ...ctx(ownerId), overflowEnabled: mode !== 'disabled', accountOverflowQualified: mode !== 'account' };
    assert.equal((await createTwoStoreTripPersistence(ls, driver, context).save(trip('candidate', ownerId), { newTripOrClone: mode !== 'existing-trip' })).stored, false);
    assert.equal(driver.generations.size, 0);
  }
});
