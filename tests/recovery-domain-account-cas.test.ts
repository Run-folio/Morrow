import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { register } from 'node:module';
import type { EasyTTrip } from '../lib/easyt/trip.ts';
import type { RecoveryEnvelope } from '../lib/easyt/durable-recovery-domain.ts';

register(new URL('./helpers/recovery-domain-account-loader.mjs', import.meta.url));
const { accountSql, SyntheticAccountStorage } = await import('./helpers/recovery-domain-account-synthetic.ts');
const repository = await import('../lib/easyt/repository.ts');
const item = await import('../app/api/easyt/trips/[tripId]/route.ts');
const collection = await import('../app/api/easyt/trips/route.ts');
const promotion = await import('../app/api/easyt/trips/[tripId]/promote/route.ts');
const { createRecoveryDomainStore } = await import('../lib/easyt/durable-recovery-store.ts');
const { createTwoStoreTripPersistence } = await import('../lib/easyt/two-store-trip-persistence.ts');
const { resolveRecoveryProvenance } = await import('../lib/easyt/recovery-provenance.ts');
const { saveTripRecoveryToStorage, tripRecoveryStorageKey } = await import('../lib/easyt/storage.ts');
const { prepareTripDocumentForWrite } = await import('../lib/easyt/trip-document.ts');
const { canonicalRouteFixture, legacyRouteFixture } = await import('./fixtures/batch14-route-documents.ts');
const { envelope } = await import('./helpers/durable-recovery-fixture.ts');
const { MemoryRecoveryDriver } = await import('./helpers/durable-recovery-driver.ts');

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const ownerId = 'owner-a', tripId = 'synthetic-trip';
const context = { ownerId, isCurrent: () => true };
const brokerContext = { ...context, overflowEnabled: true, accountOverflowQualified: true };
const originalFetch = globalThis.fetch;
let networkAttempts = 0;
before(() => { globalThis.fetch = async () => { networkAttempts++; throw new Error('Network forbidden in synthetic account qualification'); }; });
after(() => { globalThis.fetch = originalFetch; assert.equal(networkAttempts, 0); });

function trip(title: string, owner: string | null = ownerId): EasyTTrip {
  return prepareTripDocumentForWrite({ ...canonicalRouteFixture(), id: tripId, ownerId: owner, status: 'draft', title, updatedAt: '2026-10-12T00:00:00.000Z' });
}
function candidateEnvelope(candidate: EasyTTrip, writeId: string): RecoveryEnvelope {
  const value = envelope(writeId, ownerId); value.rawRecovery = JSON.stringify({ ...JSON.parse(value.rawRecovery), trip: candidate }); return value;
}
async function retain(driver: InstanceType<typeof MemoryRecoveryDriver>, value: RecoveryEnvelope) {
  const store = createRecoveryDomainStore(driver, context);
  assert.equal((await store.commit({ raw: JSON.stringify(value), expectedHead: value.parent, admission: 'native-setter-quota' })).kind, 'verified');
  return store;
}
const request = (body: EasyTTrip, method: string) => new Request('https://synthetic.invalid/api/easyt/trips/' + tripId, {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const params = () => ({ params: Promise.resolve({ tripId }) });
const save = (body: EasyTTrip) => item.PUT(request(body, 'PUT'), params());
const oldCollection = (body: EasyTTrip) => collection.POST(request(body, 'POST'));
const claim = (body: EasyTTrip) => promotion.POST(request(body, 'POST'), params());
async function conflict(response: Response, canonical: EasyTTrip) {
  assert.equal(response.status, 409); const body = await response.json();
  assert.equal(body.category, 'conflict'); assert.deepEqual(body.trip, wire(canonical)); return body;
}
const retainedBytes = (driver: InstanceType<typeof MemoryRecoveryDriver>) => ({ generations: [...driver.generations], heads: [...driver.heads] });

test('case 1: old requests meet actual owner, source-version and revision CAS rejection after a newer exact cloud ACK', async () => {
  accountSql.reset(); const baseline = (await repository.promoteTripForOwner(ownerId, trip('original', null))).trip;
  const candidate = { ...baseline, title: 'new reader save' }, driver = new MemoryRecoveryDriver(), value = candidateEnvelope(candidate, 'newer-ack');
  const store = await retain(driver, value), response = await save(candidate); assert.equal(response.status, 200);
  const canonical = (await response.json()).trip as EasyTTrip; assert.notEqual(canonical.updatedAt, baseline.updatedAt);
  const journal = await store.recordTrustedAccountAck({ handle: value.handle, rawRecovery: value.rawRecovery, canonicalRaw: JSON.stringify(canonical) });
  assert.equal(journal.kind, 'journaled'); if (journal.kind === 'journaled') assert.equal(journal.headMatches, true);
  const before = accountSql.snapshot(), deviceBefore = retainedBytes(driver), ackBefore = [...driver.acknowledgements];
  for (const handler of [save, oldCollection]) {
    const body = await conflict(await handler({ ...baseline, title: 'old outstanding request' }), canonical);
    assert.equal(body.conflictReason, 'cloud-changed'); assert.deepEqual(accountSql.snapshot(), before);
  }
  // Same cloud token still cannot downgrade a v2 row from an old schema request.
  const oldSchema = { ...legacyRouteFixture(), id: tripId, ownerId, updatedAt: canonical.updatedAt };
  await conflict(await save(oldSchema), canonical); assert.deepEqual(accountSql.snapshot(), before);
  const queriesBefore = accountSql.queries.length;
  assert.equal((await save({ ...canonical, ownerId: 'owner-b' })).status, 403);
  assert.equal(accountSql.queries.length, queriesBefore, 'Body ownership guard must precede SQL');
  accountSql.ownerId = 'owner-b';
  assert.equal((await save({ ...canonical, ownerId: 'owner-b' })).status, 403);
  accountSql.ownerId = ownerId;
  assert.deepEqual(accountSql.snapshot(), before); assert.deepEqual(retainedBytes(driver), deviceBefore); assert.deepEqual([...driver.acknowledgements], ackBefore);
  assert.ok(accountSql.blockedProjectionStatements > 0, 'Losing actual SQL child statements retain their save_won barrier');
  const reread = await store.read(tripId); assert.equal(reread.kind, 'ready');
  if (reread.kind === 'ready') assert.equal(reread.acknowledgement?.canonicalRaw, JSON.stringify(canonical));
});

test('case 2: supported account reader preserves old raw and unacknowledged IDB branches and blocks even a capacious LS writer', async () => {
  accountSql.reset(); const storage = new SyntheticAccountStorage(), driver = new MemoryRecoveryDriver();
  const value = candidateEnvelope(trip('unacknowledged domain work'), 'unacknowledged-idb'), store = await retain(driver, value);
  assert.equal(driver.acknowledgements.size, 0);
  const old = { ...trip('divergent old raw'), updatedAt: '2099-01-01T00:00:00.000Z' };
  assert.equal(saveTripRecoveryToStorage(storage, old, { ownerId, writeId: 'old-raw', now: '2099-01-01T00:00:00.000Z' }).stored, true);
  const rawBefore = [...storage.values], deviceBefore = retainedBytes(driver), setterCalls = storage.setterCalls;
  const rawSources = rawBefore.filter(([key]) => key === tripRecoveryStorageKey(ownerId, tripId)
    || key.startsWith(tripRecoveryStorageKey(ownerId, tripId) + ':')).map(([key, raw]) => ({ key, raw }));
  const domain = await store.read(tripId); assert.equal(domain.kind, 'ready');
  const resolved = resolveRecoveryProvenance({ scope: { ownerId, tripId }, legacy: { kind: 'ready', copies: rawSources }, domain });
  assert.equal(resolved.kind, 'protected-conflict'); assert.equal(resolved.reason, 'divergence');
  assert.deepEqual(resolved.preserved, { legacy: rawSources, domain: value });
  const supported = createTwoStoreTripPersistence(storage, driver, brokerContext);
  assert.deepEqual(await supported.read(tripId), { kind: 'protected', reason: 'divergence' });
  const mutation = await supported.save(trip('supported replacement'), { replace: { ...value.handle }, writeId: 'replacement', newTripOrClone: true });
  assert.equal(mutation.stored, false); assert.equal(mutation.blockedByExistingRecovery, true); assert.equal(mutation.writeAttempted, false);
  assert.deepEqual([...storage.values], rawBefore); assert.equal(storage.setterCalls, setterCalls); assert.equal(storage.removals, 0);
  assert.deepEqual(retainedBytes(driver), deviceBefore); assert.equal(driver.acknowledgements.size, 0); assert.equal(accountSql.queries.length, 0);
});

test('case 3: old request during a held new claim/save retains IDB and the exact authoritative ACK or conflict for either winner', async t => {
  for (const operation of ['save', 'claim'] as const) for (const winner of ['new', 'old'] as const) {
    await t.test(operation + ': ' + winner + ' request wins', async () => {
      accountSql.reset(); const storage = new SyntheticAccountStorage(), driver = new MemoryRecoveryDriver();
      const baseline = operation === 'save' ? (await repository.promoteTripForOwner(ownerId, trip('base', null))).trip : trip('base', null);
      const candidate = { ...baseline, title: 'new IDB candidate' }, old = { ...baseline, title: 'old outstanding candidate' };
      const value = candidateEnvelope(candidate, operation + '-' + winner), store = await retain(driver, value), deviceBefore = retainedBytes(driver);
      const hold = accountSql.holdNextTransaction(), newRequest = operation === 'save' ? save : claim;
      const held = winner === 'new' ? oldCollection(old) : newRequest(candidate);
      await hold.entered;
      const first = winner === 'new' ? await newRequest(candidate) : await oldCollection(old);
      hold.release(); const last = await held;
      const newResponse = winner === 'new' ? first : last, oldResponse = winner === 'new' ? last : first;
      assert.equal(accountSql.rows.size, 1); const canonical = accountSql.rows.get(tripId)!.document;
      assert.equal(canonical.title, winner === 'new' ? candidate.title : old.title);
      assert.deepEqual(retainedBytes(driver), deviceBefore); assert.equal(storage.values.size, 0); assert.equal(storage.removals, 0);
      if (winner === 'new') {
        assert.equal(newResponse.status, operation === 'claim' ? 201 : 200);
        const ack = await newResponse.json(); assert.deepEqual(ack.trip, wire(canonical));
        const rejected = await conflict(oldResponse, canonical);
        assert.equal(rejected.conflictReason, operation === 'claim' ? 'cloud-different' : 'cloud-changed');
        const journal = await store.recordTrustedAccountAck({ handle: value.handle, rawRecovery: value.rawRecovery, canonicalRaw: JSON.stringify(ack.trip) });
        assert.equal(journal.kind, 'journaled'); if (journal.kind === 'journaled') { assert.equal(journal.headMatches, true); assert.equal(journal.accountAckMatchesCandidate, true); }
        const reopen = await createTwoStoreTripPersistence(storage, driver, brokerContext).read(tripId); assert.equal(reopen.kind, 'found');
        if (reopen.kind === 'found') { assert.equal(reopen.recovery, null); assert.deepEqual(wire(reopen.trip), wire(canonical)); }
      } else {
        assert.equal(oldResponse.status, 200); const acknowledgedOld = await oldResponse.json(); assert.deepEqual(acknowledgedOld.trip, wire(canonical));
        const rejected = await conflict(newResponse, canonical);
        assert.equal(rejected.conflictReason, operation === 'claim' ? 'cloud-different' : 'cloud-changed');
        // A conflict response or another request's ACK is never proof of this IDB write.
        assert.equal((await store.recordTrustedAccountAck({ handle: value.handle, rawRecovery: value.rawRecovery, canonicalRaw: JSON.stringify(rejected.trip) })).kind, 'protected-conflict');
        assert.equal(driver.acknowledgements.size, 0);
        const reopen = await createTwoStoreTripPersistence(storage, driver, brokerContext).read(tripId); assert.equal(reopen.kind, 'found');
        if (reopen.kind === 'found') { assert.deepEqual(wire(reopen.trip), wire(candidate)); assert.equal(reopen.recovery?.writeId, value.handle.writeId); }
      }
      assert.deepEqual(retainedBytes(driver), deviceBefore); assert.ok(accountSql.blockedProjectionStatements > 0);
      const read = await store.read(tripId); assert.equal(read.kind, 'ready');
      if (read.kind === 'ready') {
        assert.deepEqual(read.envelope, value);
        assert.equal(read.acknowledgement?.canonicalRaw ?? null, winner === 'new' ? JSON.stringify(wire(canonical)) : null);
      }
    });
  }
});
