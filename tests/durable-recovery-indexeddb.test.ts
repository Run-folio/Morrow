import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecoveryDomainStore, openIndexedDbRecoveryDriver } from '../lib/easyt/durable-recovery-store.ts';
import { IndexedDbModel } from './helpers/recovery-indexeddb-model.ts';
import { envelope, rawEnvelope, canonicalAck } from './helpers/durable-recovery-fixture.ts';
import { createRecoveryEntryStore } from '../lib/easyt/durable-entry-store.ts';
import type { RecoveryEntryEnvelope, RecoveryEntryWrite } from '../lib/easyt/durable-entry-protocol.ts';

const context = { ownerId: 'owner-a', isCurrent: () => true };
const write = (value = envelope()) => ({ raw: rawEnvelope(value), expectedHead: value.parent, admission: 'native-setter-quota' as const });
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const inputEntry = (value = envelope()): RecoveryEntryEnvelope => ({ version: 1,
  handle: { version: 1, backend: 'indexeddb-entry', kind: 'builder-input', ownerId: value.handle.ownerId, tripId: value.handle.tripId, writeId: 'input-1' },
  parent: null, raw: value.entry.input!.raw, legacyRaw: null, retainedPreviousRaw: null });
const entryWrite = (value = inputEntry()): RecoveryEntryWrite => ({ raw: JSON.stringify(value), expectedHead: value.parent, admission: 'native-setter-quota' });

test('native entry adapter preserves typed input independently of a canonical trip and enumerates only recovery heads', async () => {
  const model = new IndexedDbModel(), driver = await openIndexedDbRecoveryDriver(model.factory());
  const entry = inputEntry(), store = createRecoveryEntryStore(driver, context);
  assert.equal((await store.commit(entryWrite(entry))).kind, 'verified');
  const reopened = await store.read(entry.handle); if (reopened.kind !== 'ready') assert.fail(reopened.kind);
  assert.deepEqual(reopened.envelope, entry); assert.deepEqual(await driver.listHeads(context.ownerId), []); driver.close?.();
});

test('canonical recovery and required input metadata commit and verify in one native transaction', async () => {
  const model = new IndexedDbModel(), driver = await openIndexedDbRecoveryDriver(model.factory()), value = envelope();
  const result = await createRecoveryDomainStore(driver, context).commit({ ...write(value), entries: [entryWrite(inputEntry(value))] });
  assert.equal(result.kind, 'verified'); const entry = await createRecoveryEntryStore(driver, context).read(inputEntry(value).handle);
  if (entry.kind !== 'ready') assert.fail(entry.kind); assert.equal(entry.envelope?.raw, value.entry.input!.raw); driver.close?.();
});

test('required entry quota aborts already queued canonical generation and pointer writes', async () => {
  const model = new IndexedDbModel(), driver = await openIndexedDbRecoveryDriver(model.factory()), before = structuredClone(model.data), value = envelope();
  model.failAddKeyPrefix = '["entry",';
  const result = await createRecoveryDomainStore(driver, context).commit({ ...write(value), entries: [entryWrite(inputEntry(value))] });
  assert.equal(result.kind, 'failure'); if (result.kind === 'failure') assert.equal(result.reason, 'quota');
  assert.deepEqual(model.data, before); driver.close?.();
});

test('native adapter waits for transaction complete, then independently reads back every entry byte', async () => {
  const model = new IndexedDbModel(); model.holdCompletion = true;
  const driver = await openIndexedDbRecoveryDriver(model.factory()), store = createRecoveryDomainStore(driver, context), value = envelope();
  let completed = false; const promise = store.commit(write(value)).then(result => { completed = true; return result; });
  await turn(); assert.equal(completed, false); assert.equal(model.data.get('generations')?.size, 0);
  assert(model.pendingCompletion); model.holdCompletion = false; model.pendingCompletion();
  const result = await promise; assert.equal(result.kind, 'verified');
  const read = await createRecoveryDomainStore(driver, context).read(value.handle.tripId);
  if (read.kind !== 'ready') assert.fail(read.kind); assert.deepEqual(read.envelope, value); driver.close?.();
});

test('first native quota cause survives queued pointer AbortError and aborts the whole transaction', async () => {
  const model = new IndexedDbModel(), driver = await openIndexedDbRecoveryDriver(model.factory()), store = createRecoveryDomainStore(driver, context), first = envelope();
  await store.commit(write(first)); const before = structuredClone(model.data); model.failAddStore = 'generations';
  const result = await store.commit(write(envelope('write-2', 'owner-a', first.handle)));
  assert.equal(result.kind, 'failure'); if (result.kind === 'failure') { assert.equal(result.reason, 'quota'); assert.equal(result.commitStatus, 'not-committed'); }
  assert.deepEqual(model.data, before); driver.close?.();
});

test('native ACK journal quota never retires recovery or modifies the newer pointer', async () => {
  const model = new IndexedDbModel(), driver = await openIndexedDbRecoveryDriver(model.factory()), store = createRecoveryDomainStore(driver, context), first = envelope();
  await store.commit(write(first)); const second = envelope('write-2', 'owner-a', first.handle); await store.commit(write(second));
  const before = structuredClone(model.data); model.failAddStore = 'acknowledgements';
  const result = await store.recordTrustedAccountAck({ handle: first.handle, rawRecovery: first.rawRecovery, canonicalRaw: canonicalAck(first) });
  assert.equal(result.kind, 'failure'); assert.deepEqual(model.data, before); driver.close?.();
});

test('a blocked open is terminal and late upgrade is aborted without creating a schema', async () => {
  const model = new IndexedDbModel(); model.openMode = 'blocked';
  await assert.rejects(openIndexedDbRecoveryDriver(model.factory()), (e: unknown) => e instanceof Error && 'reason' in e && e.reason === 'blocked');
  model.lateSuccess?.(); assert.equal(model.upgradeAborts, 1); assert.equal(model.createdStores, 0); assert.equal(model.closed, 1);
});

test('unsupported/missing schema refuses without deleting or repairing existing data', async () => {
  for (const mode of ['future', 'missing'] as const) {
    const model = new IndexedDbModel(); if (mode === 'future') model.openMode = 'future'; else model.data.delete('heads');
    const before = structuredClone(model.data);
    await assert.rejects(openIndexedDbRecoveryDriver(model.factory()), (e: unknown) => e instanceof Error && 'reason' in e && e.reason === 'schema');
    assert.deepEqual(model.data, before); assert.equal(model.createdStores, 0);
  }
});

test('new namespace creates only the domain schema; version change closes the connection without recovery mutation', async () => {
  const model = new IndexedDbModel(); model.openMode = 'new'; const driver = await openIndexedDbRecoveryDriver(model.factory());
  assert.equal(model.createdStores, 3); const store = createRecoveryDomainStore(driver, context), value = envelope();
  await store.commit(write(value)); const before = structuredClone(model.data); model.versionChange?.();
  const result = await store.read(value.handle.tripId); assert.equal(result.kind, 'failure');
  if (result.kind === 'failure') assert.equal(result.reason, 'unavailable'); assert.deepEqual(model.data, before);
});

test('unsupported strict durability refuses writes rather than silently retrying with relaxed durability', async () => {
  const model = new IndexedDbModel(); model.strictSupported = false;
  const driver = await openIndexedDbRecoveryDriver(model.factory()), store = createRecoveryDomainStore(driver, context);
  const result = await store.commit(write()); assert.equal(result.kind, 'failure');
  if (result.kind === 'failure') assert.equal(result.reason, 'unavailable'); assert.equal(model.data.get('generations')?.size, 0); driver.close?.();
});
