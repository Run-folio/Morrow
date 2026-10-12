import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecoveryDomainStore, openIndexedDbRecoveryDriver } from '../lib/easyt/durable-recovery-store.ts';
import { IndexedDbModel } from './helpers/recovery-indexeddb-model.ts';
import { envelope, rawEnvelope, canonicalAck } from './helpers/durable-recovery-fixture.ts';

const context = { ownerId: 'owner-a', isCurrent: () => true };
const write = (value = envelope()) => ({ raw: rawEnvelope(value), expectedHead: value.parent, admission: 'native-setter-quota' as const });
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

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
