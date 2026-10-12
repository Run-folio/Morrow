import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecoveryDomainStore, openIndexedDbRecoveryDriver } from '../lib/easyt/durable-recovery-store.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { envelope, rawEnvelope, canonicalAck } from './helpers/durable-recovery-fixture.ts';

const context = (ownerId: string | null = 'owner-a') => ({ ownerId, isCurrent: () => true });
const write = (value = envelope(), expectedHead = value.parent) => ({ raw: rawEnvelope(value), expectedHead, admission: 'native-setter-quota' as const });

test('committed generation, input and receipt reopen exactly without any LS locator', async () => {
  const driver = new MemoryRecoveryDriver(); const store = createRecoveryDomainStore(driver, context()); const value = envelope();
  const saved = await store.commit(write(value)); assert.equal(saved.kind, 'verified');
  const reopened = await createRecoveryDomainStore(driver, context()).read(value.handle.tripId);
  assert.equal(reopened.kind, 'ready');
  if (reopened.kind === 'ready') assert.deepEqual(reopened.envelope, value);
  assert.equal(driver.generations.size, 1); assert.equal(driver.heads.size, 2);
});

test('owner-scoped list and current pointer cold-reopen without an LS ID, with guest/account isolation', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryDomainStore(driver, context()), first = envelope();
  await store.commit(write(first)); const second = envelope('second-trip'); second.handle.tripId = 'other-trip';
  second.entry.pointer.tripId = second.handle.tripId; second.entry.input!.tripId = second.handle.tripId; second.entry.receipt!.tripId = second.handle.tripId;
  const record = JSON.parse(second.rawRecovery); record.tripId = second.handle.tripId; record.trip.id = second.handle.tripId; second.rawRecovery = JSON.stringify(record);
  await store.commit(write(second)); const guest = envelope('guest', null); await createRecoveryDomainStore(driver, context(null)).commit(write(guest));
  const list = await store.list(); assert.equal(list.kind, 'ready');
  if (list.kind === 'ready') assert.deepEqual(list.recoveries.map(r => r.envelope.handle.tripId).sort(), ['other-trip', 'synthetic-trip']);
  const current = await createRecoveryDomainStore(driver, context()).current(); assert.equal(current.kind, 'ready');
  if (current.kind === 'ready') assert.deepEqual(current.envelope, second);
  const foreign = await createRecoveryDomainStore(driver, context('owner-b')).current();
  if (foreign.kind !== 'ready') assert.fail(foreign.kind); assert.equal(foreign.envelope, null);
});

test('corrupt or foreign owner current pointers cannot masquerade as missing or authorize a different trip', async () => {
  for (const raw of ['{broken', JSON.stringify(envelope('foreign', 'owner-b').handle)]) {
    const driver = new MemoryRecoveryDriver(); driver.heads.set(JSON.stringify(['owner-a']), raw);
    const result = await createRecoveryDomainStore(driver, context()).current(); assert.notEqual(result.kind, 'ready');
    assert.equal(driver.heads.get(JSON.stringify(['owner-a'])), raw);
  }
});

test('retry reuses exact immutable generation; a handle collision cannot overwrite it', async () => {
  const driver = new MemoryRecoveryDriver(); const store = createRecoveryDomainStore(driver, context()); const first = envelope();
  assert.equal((await store.commit(write(first))).kind, 'verified');
  assert.equal((await store.commit(write(first))).kind, 'verified');
  const bytes = [...driver.generations.values()]; first.entry.input!.raw = 'different input for same handle';
  assert.equal((await store.commit(write(first))).kind, 'protected-conflict');
  assert.deepEqual([...driver.generations.values()], bytes);
});

test('concurrent distinct replacements have one CAS winner and preserve all prior generations', async () => {
  const driver = new MemoryRecoveryDriver(); const store = createRecoveryDomainStore(driver, context()); const first = envelope();
  await store.commit(write(first)); const second = envelope('write-2', 'owner-a', first.handle), third = envelope('write-3', 'owner-a', first.handle);
  const results = await Promise.all([store.commit(write(second)), store.commit(write(third))]);
  assert.equal(results.filter(r => r.kind === 'verified').length, 1);
  assert.equal(results.filter(r => r.kind === 'protected-conflict').length, 1);
  assert.equal(driver.generations.size, 2); assert.equal(driver.generations.get(driver.key(first.handle, first.handle.writeId)), rawEnvelope(first));
});

test('stale retry cannot promote an old generation over a newer head', async () => {
  const driver = new MemoryRecoveryDriver(); const store = createRecoveryDomainStore(driver, context()); const first = envelope();
  await store.commit(write(first)); const second = envelope('write-2', 'owner-a', first.handle); await store.commit(write(second));
  assert.equal((await store.commit(write(first))).kind, 'protected-conflict');
  const read = await store.read(first.handle.tripId); if (read.kind !== 'ready') assert.fail(read.kind);
  assert.deepEqual(read.envelope?.handle, second.handle); assert.equal(driver.generations.size, 2);
});

test('owner, pointer, input, receipt and parent scope mismatches never start a transaction', async () => {
  for (const change of [
    (v: ReturnType<typeof envelope>) => { v.handle.ownerId = 'owner-b'; },
    (v: ReturnType<typeof envelope>) => { v.entry.pointer.writeId = 'foreign-write'; },
    (v: ReturnType<typeof envelope>) => { v.entry.input!.ownerId = 'owner-b'; },
    (v: ReturnType<typeof envelope>) => { v.entry.receipt!.tripId = 'foreign-trip'; },
    (v: ReturnType<typeof envelope>) => { v.parent = { ...v.handle, ownerId: 'owner-b', writeId: 'prior' }; },
  ]) {
    const driver = new MemoryRecoveryDriver(), value = envelope(); change(value);
    assert.equal((await createRecoveryDomainStore(driver, context()).commit(write(value))).kind, 'protected-conflict');
    assert.equal(driver.transactions, 0); assert.equal(driver.generations.size, 0);
  }
});

test('only confirmed native setter quota can admit the isolated fallback operation', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryDomainStore(driver, context());
  for (const admission of ['security', 'unknown', 'protected-conflict']) {
    assert.equal((await store.commit({ ...write(), admission: admission as 'native-setter-quota' })).kind, 'protected-conflict');
  }
  assert.equal(driver.transactions, 0);
});

for (const [name, reason] of [['QuotaExceededError', 'quota'], ['SecurityError', 'security'], ['AbortError', 'abort'], ['InvalidStateError', 'unavailable'], ['OtherError', 'unknown']]) {
  test(`${name} preserves old copies and never verifies the refused operation`, async () => {
    const driver = new MemoryRecoveryDriver(), store = createRecoveryDomainStore(driver, context()), first = envelope();
    await store.commit(write(first)); const before = [...driver.generations]; driver.fail = new DOMException('Synthetic only', name);
    const result = await store.commit(write(envelope('write-2', 'owner-a', first.handle)));
    assert.equal(result.kind, 'failure'); if (result.kind === 'failure') assert.equal(result.reason, reason);
    assert.deepEqual([...driver.generations], before);
  });
}

test('committed bytes with failed independent readback remain retained but unverified', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryDomainStore(driver, context()), value = envelope();
  driver.afterCommit = () => { driver.fail = new DOMException('Readback denied', 'SecurityError'); };
  const result = await store.commit(write(value)); assert.equal(result.kind, 'failure');
  if (result.kind === 'failure') { assert.equal(result.commitStatus, 'committed'); assert.equal(result.reason, 'readback'); }
  assert.equal(driver.generations.get(driver.key(value.handle, value.handle.writeId)), rawEnvelope(value));
  driver.fail = null; driver.afterCommit = null; assert.equal((await store.commit(write(value))).kind, 'verified');
});

test('changed operation after commit refuses acceptance while retaining its exact scoped bytes', async () => {
  const driver = new MemoryRecoveryDriver(); let current = true;
  const store = createRecoveryDomainStore(driver, { ownerId: 'owner-a', isCurrent: () => current }), value = envelope();
  driver.afterCommit = () => { current = false; };
  assert.equal((await store.commit(write(value))).kind, 'protected-conflict');
  assert.equal(driver.generations.get(driver.key(value.handle, value.handle.writeId)), rawEnvelope(value));
  assert.equal((await createRecoveryDomainStore(driver, context('owner-b')).read(value.handle.tripId)).kind, 'ready');
  const foreign = await createRecoveryDomainStore(driver, context('owner-b')).read(value.handle.tripId);
  if (foreign.kind === 'ready') assert.equal(foreign.envelope, null);
});

test('corrupt/future generation and a missing head generation stay protected during read and replacement', async () => {
  for (const bad of ['{broken', JSON.stringify({ ...envelope(), version: 9 }), undefined]) {
    const driver = new MemoryRecoveryDriver(), value = envelope(), store = createRecoveryDomainStore(driver, context());
    driver.heads.set(driver.scopeKey(value.handle), JSON.stringify(value.handle));
    if (bad !== undefined) driver.generations.set(driver.key(value.handle, value.handle.writeId), bad);
    assert.equal((await store.read(value.handle.tripId)).kind, 'failure');
    assert.equal((await store.commit(write(envelope('write-2', 'owner-a', value.handle)))).kind, 'failure');
    assert.equal(driver.heads.get(driver.scopeKey(value.handle)), JSON.stringify(value.handle));
  }
});

test('delayed exact trusted ACK journals only its generation and cannot retire or move a newer head', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryDomainStore(driver, context()), first = envelope(); await store.commit(write(first));
  const next = envelope('write-2', 'owner-a', first.handle); await store.commit(write(next));
  const ack = await store.recordTrustedAccountAck({ handle: first.handle, rawRecovery: first.rawRecovery, canonicalRaw: canonicalAck(first) });
  assert.equal(ack.kind, 'journaled'); if (ack.kind === 'journaled') assert.equal(ack.headMatches, false);
  assert.equal(driver.generations.size, 2); assert.equal(driver.acknowledgements.size, 1);
  const read = await store.read(next.handle.tripId); if (read.kind !== 'ready') assert.fail(read.kind);
  assert.deepEqual(read.envelope?.handle, next.handle);
});

test('foreign, changed-candidate and guest ACKs cannot be journaled; exact retry does not overwrite the journal', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryDomainStore(driver, context()), first = envelope(); await store.commit(write(first));
  const exact = { handle: first.handle, rawRecovery: first.rawRecovery, canonicalRaw: canonicalAck(first) };
  for (const ack of [ { ...exact, handle: { ...first.handle, ownerId: 'owner-b' } },
    { ...exact, rawRecovery: JSON.stringify({ ...JSON.parse(first.rawRecovery), writeId: 'other' }) },
    { ...exact, canonicalRaw: canonicalAck(envelope('different')) } ]) {
    assert.equal((await store.recordTrustedAccountAck(ack)).kind, 'protected-conflict');
  }
  assert.equal(driver.acknowledgements.size, 0);
  assert.equal((await store.recordTrustedAccountAck(exact)).kind, 'journaled');
  const before = [...driver.acknowledgements]; assert.equal((await store.recordTrustedAccountAck(exact)).kind, 'journaled');
  assert.deepEqual([...driver.acknowledgements], before);
  const guest = envelope('guest', null), guestStore = createRecoveryDomainStore(driver, context(null)); await guestStore.commit(write(guest));
  assert.equal((await guestStore.recordTrustedAccountAck({ handle: guest.handle, rawRecovery: guest.rawRecovery, canonicalRaw: canonicalAck(guest) })).kind, 'protected-conflict');
});

test('missing IndexedDB fails explicitly without attempting any browser/global fallback', async () => {
  await assert.rejects(openIndexedDbRecoveryDriver(undefined), (error: unknown) => error instanceof Error && 'reason' in error && error.reason === 'unavailable');
});
