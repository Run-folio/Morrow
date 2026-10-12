import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecoveryEntryStore } from '../lib/easyt/durable-entry-store.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import type { RecoveryEntryEnvelope, RecoveryEntryHandle } from '../lib/easyt/durable-entry-protocol.ts';

const context = { ownerId: 'owner-a', isCurrent: () => true };
function entry(writeId = 'entry-1', kind: 'homepage' | 'builder-input' = 'homepage', parent: RecoveryEntryHandle | null = null): RecoveryEntryEnvelope {
  return { version: 1, handle: { version: 1, backend: 'indexeddb-entry', ownerId: 'owner-a', kind, tripId: kind === 'homepage' ? null : 'synthetic-trip', writeId },
    parent, raw: 'full typed input and receipt bytes  ', legacyRaw: 'exact prior LS bytes', retainedPreviousRaw: 'exact prior LS bytes' };
}
const write = (value = entry()) => ({ raw: JSON.stringify(value), expectedHead: value.parent, admission: value.parent ? 'existing-domain' as const : 'native-setter-quota' as const });

test('homepage and Builder input cold-reopen exact independent metadata without a canonical placeholder trip', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryEntryStore(driver, context);
  for (const kind of ['homepage', 'builder-input'] as const) {
    const value = entry('entry-' + kind, kind); assert.equal((await store.commit(write(value))).kind, 'verified');
    const read = await createRecoveryEntryStore(driver, context).read(value.handle); assert.equal(read.kind, 'ready');
    if (read.kind === 'ready') assert.deepEqual(read.envelope, value);
  }
});

test('new entry needs confirmed quota; only an exact established domain head permits continuation', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryEntryStore(driver, context), first = entry();
  assert.equal((await store.commit({ ...write(first), admission: 'existing-domain' })).kind, 'protected-conflict');
  await store.commit(write(first)); const next = entry('entry-2', 'homepage', first.handle);
  assert.equal((await store.commit(write(next))).kind, 'verified');
  assert.equal((await store.commit(write(first))).kind, 'protected-conflict');
});

test('entry identity is immutable and two distinct replacements have one CAS winner', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryEntryStore(driver, context), first = entry(); await store.commit(write(first));
  const before = structuredClone(driver.generations), collision = { ...first, raw: 'different' };
  assert.equal((await store.commit(write(collision))).kind, 'protected-conflict'); assert.deepEqual(driver.generations, before);
  const results = await Promise.all([store.commit(write(entry('entry-2', 'homepage', first.handle))), store.commit(write(entry('entry-3', 'homepage', first.handle)))]);
  assert.equal(results.filter(r => r.kind === 'verified').length, 1); assert.equal(results.filter(r => r.kind === 'protected-conflict').length, 1);
  assert.equal(driver.generations.size, 2);
});

test('foreign owner, incorrect Builder binding and future schema refuse before storage mutation', async () => {
  for (const value of [ { ...entry(), handle: { ...entry().handle, ownerId: 'owner-b' } },
    { ...entry(), handle: { ...entry().handle, kind: 'builder-input', tripId: null } }, { ...entry(), version: 9 } ]) {
    const driver = new MemoryRecoveryDriver(), result = await createRecoveryEntryStore(driver, context).commit({ raw: JSON.stringify(value), expectedHead: null, admission: 'native-setter-quota' });
    assert.notEqual(result.kind, 'verified'); assert.equal(driver.transactions, 0); assert.equal(driver.generations.size, 0);
  }
});

test('an exact tombstone preserves every former raw payload instead of deleting records', async () => {
  const driver = new MemoryRecoveryDriver(), store = createRecoveryEntryStore(driver, context), first = entry(); await store.commit(write(first));
  const next = { ...entry('entry-2', 'homepage', first.handle), raw: null }; await store.commit(write(next));
  assert.equal(driver.generations.size, 2); assert([...driver.generations.values()].includes(JSON.stringify(first)));
  const read = await store.read(next.handle); if (read.kind !== 'ready') assert.fail(read.kind); assert.equal(read.envelope?.raw, null);
});

test('changed operation or refused independent readback retains bytes without verified acceptance', async () => {
  for (const fault of ['scope', 'readback'] as const) {
    const driver = new MemoryRecoveryDriver(); let active = true;
    const store = createRecoveryEntryStore(driver, { ...context, isCurrent: () => active });
    driver.afterCommit = () => { if (fault === 'scope') active = false; else driver.fail = new DOMException('Denied', 'SecurityError'); };
    const result = await store.commit(write()); assert.notEqual(result.kind, 'verified'); assert.equal(driver.generations.size, 1);
  }
});
