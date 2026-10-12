import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRecoveryProvenance } from '../lib/easyt/recovery-provenance.ts';
import { tripRecoveryStorageKey } from '../lib/easyt/storage.ts';
import { envelope } from './helpers/durable-recovery-fixture.ts';
import type { RecoveryEnvelope, LegacyRecoverySource, RecoveryReadResult } from '../lib/easyt/durable-recovery-domain.ts';

const scope = { ownerId: 'owner-a', tripId: 'synthetic-trip' };
const source = (v: RecoveryEnvelope): LegacyRecoverySource => ({ key: tripRecoveryStorageKey(v.handle.ownerId, v.handle.tripId, v.handle.writeId), raw: v.rawRecovery });
function resolve(copies: LegacyRecoverySource[], value: RecoveryEnvelope | null, domain?: RecoveryReadResult) {
  return resolveRecoveryProvenance({ scope, legacy: { kind: 'ready', copies }, domain: domain ?? { kind: 'ready', envelope: value, acknowledgement: null } });
}

test('empty is authoritative only when both stores are ready; unknown DB cannot hide sole recovery', () => {
  assert.equal(resolve([], null).kind, 'empty');
  const unknown: RecoveryReadResult = { kind: 'failure', reason: 'unavailable', commitStatus: 'not-started' };
  assert.equal(resolve([source(envelope())], null, unknown).kind, 'not-ready');
  assert.equal(resolveRecoveryProvenance({ scope, legacy: { kind: 'unavailable', copies: [] }, domain: { kind: 'ready', envelope: envelope(), acknowledgement: null } }).kind, 'not-ready');
});

test('sole overflow recovery is selected without a localStorage locator', () => {
  const value = envelope(); const result = resolve([], value);
  assert.equal(result.kind, 'indexeddb'); assert.deepEqual(result.envelope, value);
});

test('captured legacy baseline permits a descendant domain generation without deleting raw copies', () => {
  const prior = source(envelope('raw-baseline')); const value = envelope(); value.legacySources = [prior];
  const input = [prior], before = structuredClone(input); const result = resolve(input, value);
  assert.equal(result.kind, 'indexeddb'); assert.deepEqual(input, before); assert.deepEqual(result.preserved.legacy, before);
});

test('later-looking old raw divergence cannot replace a sole domain copy; both branches remain in the result', () => {
  const value = envelope(), raw = source(envelope('old-divergence'));
  raw.raw = JSON.stringify({ ...JSON.parse(raw.raw), savedAt: '2099-01-01T00:00:00.000Z' });
  const copies = [raw], before = structuredClone({ copies, value }); const result = resolve(copies, value);
  assert.equal(result.kind, 'protected-conflict'); assert.equal(result.reason, 'divergence');
  assert.deepEqual(result.preserved, { legacy: before.copies, domain: before.value }); assert.deepEqual({ copies, value }, before);
});

test('byte-changed or missing captured legacy source stays protected even if its write identity is unchanged', () => {
  const prior = source(envelope('prior')), value = envelope(); value.legacySources = [prior];
  const changed = { ...prior, raw: JSON.stringify({ ...JSON.parse(prior.raw), state: 'network' }) };
  assert.equal(resolve([changed], value).kind, 'protected-conflict');
  const missing = resolve([], value); assert.equal(missing.kind, 'protected-conflict'); assert.equal(missing.reason, 'missing-provenance');
});

test('exact mirror of the same immutable recovery can be read through domain metadata without pretending a new receipt ACK', () => {
  const value = envelope(); const result = resolve([source(value)], value);
  assert.equal(result.kind, 'indexeddb'); assert.deepEqual(result.envelope?.entry, value.entry);
  const changed = structuredClone(value); changed.rawRecovery = JSON.stringify({ ...JSON.parse(changed.rawRecovery), state: 'auth' });
  assert.equal(resolve([source(changed)], value).kind, 'protected-conflict');
});

test('raw-only multiple identities are protected without a timestamp winner or document-equivalence guess', () => {
  const a = source(envelope('a')), b = source(envelope('b')); assert.equal(resolve([a], null).kind, 'local-storage');
  assert.equal(resolve([a, b], null).kind, 'protected-conflict');
});

test('foreign scope, wrong physical key, corrupt and unsupported copies cannot become an absence or selected document', () => {
  for (const copy of [source(envelope('foreign', 'owner-b')), { ...source(envelope()), key: 'wrong-key' },
    { ...source(envelope()), raw: '{broken' }, { ...source(envelope()), raw: JSON.stringify({ ...JSON.parse(envelope().rawRecovery), version: 9 }) }]) {
    assert.equal(resolve([copy], null).kind, 'protected-conflict');
  }
  const foreign = envelope('foreign', 'owner-b'); assert.equal(resolve([], foreign).kind, 'protected-conflict');
});

test('duplicate physical keys cannot hide conflicting bytes during provenance comparison', () => {
  const a = source(envelope('a')), b = { ...source(envelope('b')), key: a.key };
  assert.equal(resolve([a, b], null).kind, 'protected-conflict');
});
