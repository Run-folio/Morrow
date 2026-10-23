// Production browser facade and IndexedDB adapter with a transaction model;
// this does not assert native browser durability or reproduce an owner's trip.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexedDbModel } from './helpers/recovery-indexeddb-model.ts';
import { envelope } from './helpers/durable-recovery-fixture.ts';
import { createAsyncBuilderEditSession } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { createBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';
import { readDurableBuilderInputDraft, writeDurableBuilderInputDraft } from '../lib/easyt/builder-input-persistence.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {openIndexedDbRecoveryDriver} from '../lib/easyt/durable-recovery-indexeddb.ts';
import { acknowledgeTripBuildSave, cacheCanonicalTrip, loadTripRecovery, saveTripRecovery,
  tripDocumentsCanonicalEquivalent, tripRecoveryIsAwaitingCanonicalSave,resolveCanonicalEquivalentTripRecovery } from '../lib/easyt/storage.ts';

class SyntheticStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, raw) { this.values.set(key, raw); }
  removeItem(key) { this.values.delete(key); }
}

test('generic account cache refresh respects paired Builder save ownership (IndexedDB model)', async t => {
  const priorGlobals = new Map(['window', 'CustomEvent', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const priorFlag = process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
  const priorConsoleInfo = console.info;
  const storage = new SyntheticStorage(), model = new IndexedDbModel();
  // One adapter factory serves all unique scopes; browserRecoveryDriver caches its open promise.
  globalThis.window = { localStorage: storage, indexedDB: model.factory(), addEventListener() {}, dispatchEvent() { return true; } };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  globalThis.fetch = async () => { throw new Error('External requests are forbidden in this synthetic fixture'); };
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS = '0';
  const retainedSyntheticStates = [];
  const preserve = label => retainedSyntheticStates.push({ label, storage: structuredClone(storage.values), domain: structuredClone(model.data) });
  let sequence = 0;
  const fixture = () => {
    const trip = JSON.parse(envelope('synthetic cache baseline', 'synthetic-owner').rawRecovery).trip;
    trip.id = `synthetic-cache-retirement-${++sequence}`;
    // A deliberate A -> B -> A must restore the original explicit budget source too.
    trip.brief.budgetPreference = { source: 'explicit', value: trip.brief.budgetBand };
    trip.brief.intent.preferences.budgetSensitivity = trip.brief.budgetBand;
    return trip;
  };
  async function withPendingInverse(run) {
    const initial = fixture(), scheduled = [];
    let active = true, finishAccount;
    let accountStarted;
    const started = new Promise(resolve => { accountStarted = resolve; });
    assert.equal((await cacheCanonicalTrip(initial)).stored, true);
    const session = await createAsyncBuilderEditSession({
      initialTrip: initial, initialCanonicalTrip: initial,
      getOwnerId: () => active ? initial.ownerId : 'detached-synthetic-owner',
      readDraft: (trip, owner) => readDurableBuilderInputDraft(trip, owner, () => active),
      writeDraft: (trip, draft, owner, guard) => writeDurableBuilderInputDraft(trip, draft, owner, guard.isCurrent, false),
      saveRecovery: (trip, options) => saveTripRecovery(trip, { ...options, newTripOrClone: false }),
      acknowledgeRecovery: (reviewed, canonical, handle, guard) => acknowledgeTripBuildSave(reviewed, canonical, handle, guard),
      persistAccount: trip => {
        accountStarted();
        return new Promise(resolve => { finishAccount = () => resolve({ ...trip, updatedAt: '2026-10-12T00:05:00.000Z' }); });
      },
      reconcile: () => { throw new Error('Provider work is forbidden in this synthetic fixture'); },
      now: () => initial.updatedAt,
      schedule: (callback, delay) => {
        const task = { callback, delay, live: true }; scheduled.push(task);
        return () => { task.live = false; };
      },
    });
    const release = session.deferAutomaticWork();
    const alternate = initial.brief.budgetBand === 'high' ? 'value' : 'high';
    const edit = budget => session.accept({ kind: 'budget', budget }, session.getSnapshot().inputRevision);
    try {
      assert.equal((await edit(alternate)).ok, true);
      preserve('B before held account response');
      const cloud = scheduled.findLast(task => task.live && task.delay === 450);
      assert.ok(cloud); cloud.live = false; cloud.callback(); await started;
      assert.equal((await edit(initial.brief.budgetBand)).ok, true);
      const recovery = await loadTripRecovery(initial.id, initial.ownerId);
      assert.ok(recovery);
      assert.equal(tripRecoveryIsAwaitingCanonicalSave(recovery), true);
      assert.equal(tripDocumentsCanonicalEquivalent(session.getSnapshot().trip, initial), true);
      preserve('A inverse while B response remains held');
      await run({ initial, session, recovery, nextEdit: () => edit(alternate) });
    } finally {
      preserve('fixture result'); active = false; session.dispose(); release(); finishAccount?.();
    }
  }
  try {
    await t.test('stale generic cache cannot retire the current pending inverse or refuse its next edit', async () => {
      await withPendingInverse(async ({ initial, session, recovery, nextEdit }) => {
        const cache = await cacheCanonicalTrip(initial);
        const remaining = await loadTripRecovery(initial.id, initial.ownerId);
        const next = await nextEdit();
        assert.deepEqual({ cacheStored: cache.stored, recoveryResolved: cache.recoveryResolved,
          pendingHandleRetained: remaining?.writeId === recovery.writeId, nextAccepted: next.ok,
          errorCategory: session.getSnapshot().error?.category ?? null },
        { cacheStored: true, recoveryResolved: false, pendingHandleRetained: true, nextAccepted: true, errorCategory: null });
      });
    });
    await t.test('without a generic cache writer the pending inverse remains editable', async () => {
      await withPendingInverse(async ({ session, nextEdit }) => {
        assert.equal((await nextEdit()).ok, true); assert.equal(session.getSnapshot().error, null);
      });
    });
    await t.test('a separate document cache writer must preserve the first document pending inverse', async () => {
      // Separate ESM instance models the second document's private pending-save
      // registry. The actual native broker barriers and cache adapter run here:
      // this is a transaction model, not real browser/OAuth/SQL proof.
      const otherDocument = await import('../lib/easyt/storage.ts?synthetic-other-document');
      await withPendingInverse(async ({ initial, session, recovery, nextEdit }) => {
        assert.equal(tripRecoveryIsAwaitingCanonicalSave(recovery), true);
        assert.equal(otherDocument.tripRecoveryIsAwaitingCanonicalSave(recovery), false);
        const otherDriver=await openIndexedDbRecoveryDriver(model.factory());
        const broker=createTwoStoreTripPersistence(storage,otherDriver,{ownerId:initial.ownerId,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
        let nativeResult;
        const cached=await broker.native(initial.id,()=>nativeResult=otherDocument.cacheCanonicalTripWithRecoveryToStorage(storage,initial));
        const remaining = await loadTripRecovery(initial.id, initial.ownerId);
        const next = await nextEdit();
        t.diagnostic(JSON.stringify({separateDocumentRegistry:true,brokerResult:cached.kind,nativeOperationRan:Boolean(nativeResult),retired:nativeResult?.recoveryResolved}));
        assert.deepEqual({ retired:nativeResult?.recoveryResolved, pendingHandleRetained:remaining?.writeId===recovery.writeId,
          nextAccepted:next.ok,errorCategory:session.getSnapshot().error?.category??null },
        {retired:false,pendingHandleRetained:true,nextAccepted:true,errorCategory:null});
      });
    });
    await t.test('canonical equivalence reconciliation must not acknowledge another in-flight save',async()=>{
      await withPendingInverse(async({initial,session,recovery,nextEdit})=>{
        assert.equal(tripRecoveryIsAwaitingCanonicalSave(recovery),true);
        const resolved=await resolveCanonicalEquivalentTripRecovery(initial,recovery);
        const remaining=await loadTripRecovery(initial.id,initial.ownerId),next=await nextEdit();
        assert.deepEqual({equivalent:resolved.equivalent,retired:resolved.recoveryResolved,
          pendingHandleRetained:remaining?.writeId===recovery.writeId,nextAccepted:next.ok,
          errorCategory:session.getSnapshot().error?.category??null},
        {equivalent:true,retired:false,pendingHandleRetained:true,nextAccepted:true,errorCategory:null});
      });
    });
    await t.test('same-document cache refresh after dispose retains the pending handle until exact ACK', async () => {
      await withPendingInverse(async ({ initial, session, recovery }) => {
        session.dispose();
        assert.deepEqual(await cacheCanonicalTrip(initial), { stored: true, recoveryResolved: false });
        const remaining = await loadTripRecovery(initial.id, initial.ownerId);
        assert.equal(remaining?.writeId, recovery.writeId);
        const acknowledged = await acknowledgeTripBuildSave(remaining.trip,
          { ...remaining.trip, updatedAt: '2026-10-12T00:06:00.000Z' }, recovery);
        assert.equal(acknowledged.accountAcknowledged, true);
        assert.equal(acknowledged.outcome, 'acknowledged');
        assert.equal(await loadTripRecovery(initial.id, initial.ownerId), null);
      });
    });
    await t.test('historical equivalence preserves recovery until an exact account ACK retires it', async () => {
      const trip = fixture();
      const written = await saveTripRecovery(trip, { newTripOrClone: true, draft: createBuilderInputDraft(trip) });
      assert.equal(written.stored, true);
      const recovery = await loadTripRecovery(trip.id, trip.ownerId);
      assert.equal(tripRecoveryIsAwaitingCanonicalSave(recovery), false); preserve('historical recovery before retirement');
      assert.deepEqual(await cacheCanonicalTrip(trip), { stored: true, recoveryResolved: false });
      assert.equal((await loadTripRecovery(trip.id,trip.ownerId)).writeId,recovery.writeId);
      const acknowledged=await acknowledgeTripBuildSave(trip,trip,written.handle);
      assert.equal(acknowledged.accountAcknowledged,true);assert.equal(acknowledged.outcome,'acknowledged');
      assert.equal(await loadTripRecovery(trip.id, trip.ownerId), null);
    });
    await t.test('exact account ACK still retires the supplied pending handle', async () => {
      const trip = fixture();
      const written = await saveTripRecovery(trip, { newTripOrClone: true, accountSavePending: true, draft: createBuilderInputDraft(trip) });
      assert.equal(written.stored, true);
      const recovery = await loadTripRecovery(trip.id, trip.ownerId);
      assert.equal(tripRecoveryIsAwaitingCanonicalSave(recovery), true); preserve('pending recovery before exact ACK');
      const acknowledged = await acknowledgeTripBuildSave(trip, { ...trip, updatedAt: '2026-10-12T00:05:00.000Z' }, written.handle);
      assert.equal(acknowledged.accountAcknowledged, true); assert.equal(acknowledged.outcome, 'acknowledged');
      assert.equal(await loadTripRecovery(trip.id, trip.ownerId), null);
    });
    await t.test('newer divergent account C preserves pending A without merging it', async () => {
      await withPendingInverse(async ({ initial, session, recovery, nextEdit }) => {
        const before = structuredClone(session.getSnapshot().trip);
        const canonical = { ...initial, title: 'Synthetic newer account C', updatedAt: '2026-10-12T00:04:00.000Z' };
        assert.deepEqual(await cacheCanonicalTrip(canonical), { stored: true, recoveryResolved: false });
        const remaining = await loadTripRecovery(initial.id, initial.ownerId);
        assert.equal(remaining.writeId, recovery.writeId); assert.deepEqual(remaining.trip, before);
        assert.deepEqual(session.getSnapshot().trip, before);
        // Only local acceptance is asserted: a later account CAS still owns conflict handling.
        assert.equal((await nextEdit()).ok, true); assert.equal(session.getSnapshot().error, null);
      });
    });
    assert.ok(retainedSyntheticStates.some(state => state.label === 'historical recovery before retirement'));
    assert.ok(retainedSyntheticStates.some(state => state.label === 'pending recovery before exact ACK'));
  } finally {
    for (const [key, descriptor] of priorGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    if (priorFlag === undefined) delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
    else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS = priorFlag;
    console.info = priorConsoleInfo;
  }
});
