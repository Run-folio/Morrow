import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { createAsyncBuilderEditSession } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { EasyTTripPersistenceError } from '../lib/easyt/trip-persistence-error.ts';
import { readBuilderInputDraft, writeBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';
import { saveTripRecoveryToStorage, loadTripRecoveryFromStorage, acknowledgeTripBuildSaveInStorage,
  markTripRecoveryStateInStorage } from '../lib/easyt/storage.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
const tick = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

/** Actual production Build entrypoint; only render/analytics and account transport are synthetic. */
function buildEntrypoint(editor: Awaited<ReturnType<typeof createAsyncBuilderEditSession>>) {
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const persistGeneratedTrip ='), source.indexOf('  const canOpenBuiltTrip ='));
  const scope = {
    builderBuildNavigationRef: { current: null }, builderEditSessionRef: { current: editor },
    builderMountedRef: { current: true }, activeBrowserOwnerIdRef: { current: editor.getSnapshot().browserOwnerId },
    requestBuildAssessment: async () => ({ trip: editor.getSnapshot().trip, assessment: { canBuildTrip: true } }),
    sameRecoveryDocument: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
    dispatchAcceptedBuilderEdit: async (edit: Parameters<typeof editor.accept>[0]) => (await editor.accept(edit, editor.getSnapshot().inputRevision)).ok,
    recordGeneratedTrip() {}, surfaceBuildConflict() {}, trackEvent() {}, setCloudSaveError() {},
    analyticsTripSource: 'synthetic-recovery', session: { user: { id: editor.getSnapshot().browserOwnerId } },
  };
  const script = ts.transpileModule(body + '\nreturn persistGeneratedTrip;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const build = new Function('scope', `with(scope){${script}}`)(scope) as (request?: { editor: typeof editor; barrier: ReturnType<typeof editor.captureCommandBarrier> }) => Promise<CanonicalEasyTTrip | null>;
  return Object.assign(build, {
    unmount() { scope.builderMountedRef.current = false; },
    changeOwner() { scope.activeBrowserOwnerIdRef.current = 'different-synthetic-owner'; },
  });
}

async function recoveredSession(genuineConflict = false) {
  const initial = requireReadableTripDocument({ ...canonicalRouteFixture(), status: 'draft' });
  const storage = new MemoryStorage(), delivery = deferred();
  // The recovered document's exact write already committed in the account, but its response was lost.
  let canonical = requireReadableTripDocument({ ...initial, updatedAt: nextTripUpdatedAt(initial.updatedAt) });
  const recovered = saveTripRecoveryToStorage(storage, initial, { ownerId: initial.ownerId, state: 'pending' });
  assert.equal(recovered.stored, true);
  const timers: { callback: () => void; delay: number; active: boolean }[] = [];
  const submitted: CanonicalEasyTTrip[] = [];
  const editor = await createAsyncBuilderEditSession({
    initialTrip: initial, initialRecovery: loadTripRecoveryFromStorage(storage, initial.id, initial.ownerId),
    // This is the actual entry-session contract for a recovered document, not acknowledged ancestry.
    initialCanonicalTrip: null, allowRecoverySync: true, getOwnerId: () => initial.ownerId,
    readDraft: async (trip, owner) => readBuilderInputDraft(storage, trip, owner),
    writeDraft: async (trip, draft, owner) => writeBuilderInputDraft(storage, trip, draft, owner),
    saveRecovery: async (trip, metadata) => {
      assert.equal(metadata.isCurrent(), true);
      const result = saveTripRecoveryToStorage(storage, trip, metadata);
      if (result.stored) assert.equal(writeBuilderInputDraft(storage, trip, metadata.draft, metadata.ownerId).ok, true);
      return result;
    },
    acknowledgeRecovery: async (reviewed, saved, handle) => ({ ...acknowledgeTripBuildSaveInStorage(storage, reviewed, saved, handle), accountAcknowledged: true, cacheStored: true }),
    markRecoveryState: async (handle, state) => markTripRecoveryStateInStorage(storage, handle, state),
    persistAccount: async trip => {
      submitted.push(requireReadableTripDocument(trip));
      if (submitted.length === 1) {
        await delivery.promise;
        if (genuineConflict) throw new EasyTTripPersistenceError({ category: 'conflict', status: 409, operation: 'update', message: 'Synthetic independent account edit' });
        // Simulate saveTripRecoveryToEasyT's existing exact lost-response acknowledgement.
        assert.deepEqual({ ...trip, updatedAt: canonical.updatedAt }, canonical);
        return canonical;
      }
      if (trip.updatedAt !== canonical.updatedAt) throw new EasyTTripPersistenceError({ category: 'conflict', status: 409, operation: 'update', message: 'Synthetic stale CAS' });
      canonical = requireReadableTripDocument({ ...trip, updatedAt: nextTripUpdatedAt(canonical.updatedAt) });
      return canonical;
    },
    reconcile: async request => ({ scope: request.scope, inputKey: request.inputKey, requestId: request.requestId, dispatched: request.dispatched,
      results: request.dispatched.map(unit => ({ ...unit, phase: 'complete' })), legs: request.trip.legs }),
    now: () => '2026-11-05T00:00:00.000Z',
    schedule: (callback, delay) => { const timer = { callback, delay, active: true }; timers.push(timer); return () => { timer.active = false; }; },
  });
  for (const timer of timers) if (timer.active && timer.delay === 450) { timer.active = false; timer.callback(); }
  await tick(); assert.equal(submitted.length, 1); assert.equal(editor.getSnapshot().canonicalSaveState, 'cloud-saving');
  return { editor, delivery, submitted, initial, canonical: () => canonical,
    recovery: () => loadTripRecoveryFromStorage(storage, initial.id, initial.ownerId) };
}

test('Build during the first recovered account save waits for its canonical ACK before build-status', { timeout: 5000 }, async () => {
  const h = await recoveredSession();
  try {
    const barrier = h.editor.captureCommandBarrier();
    const building = buildEntrypoint(h.editor)({ editor: h.editor, barrier });
    await tick();
    assert.equal(h.editor.getSnapshot().trip.status, 'draft', 'Build must not author planned status before its initial account ACK');
    assert.equal(h.submitted.length, 1);
    h.delivery.resolve();
    const built = await building;
    assert.equal(built?.status, 'planned', `Build must succeed after its exact owned ACK; state=${JSON.stringify(h.editor.getSnapshot().error)}; CAS revisions=${h.submitted.map(trip => trip.updatedAt).join(',')}`);
    assert.equal(h.editor.getSnapshot().error, null);
    assert.equal(h.canonical().status, 'planned');
  } finally { h.delivery.resolve(); h.editor.dispose(); }
});

test('waiting for the existing owned recovery flush preserves the original Build barrier and succeeds', { timeout: 5000 }, async () => {
  const h = await recoveredSession();
  try {
    const barrier = h.editor.captureCommandBarrier();
    const flush = h.editor.flush();
    await tick(); h.delivery.resolve();
    assert.equal(await flush, true); assert.equal(barrier.isCurrent(), true);
    const built = await buildEntrypoint(h.editor)({ editor: h.editor, barrier });
    assert.equal(built?.status, 'planned'); assert.equal(h.canonical().status, 'planned');
    assert.deepEqual(built?.planItems, h.initial.planItems);
    assert.deepEqual(built?.stops, h.initial.stops);
    assert.equal(h.editor.getSnapshot().error, null);
  } finally { h.delivery.resolve(); h.editor.dispose(); }
});

test('new raw intent during the owned flush retires the original Build request', { timeout: 5000 }, async () => {
  const h = await recoveredSession();
  try {
    const barrier = h.editor.captureCommandBarrier();
    const building = buildEntrypoint(h.editor)({ editor: h.editor, barrier });
    await tick();
    assert.equal(await h.editor.updateDraft({ binding: { kind: 'origin' }, raw: 'newer input while saving' }), true);
    h.delivery.resolve(); assert.equal(await building, null); assert.equal(barrier.isCurrent(), false);
    assert.equal(h.editor.getSnapshot().draft.fields[0]?.raw, 'newer input while saving');
    assert.equal(h.canonical().status, 'draft');
    assert.equal(h.submitted.length, 1);
  } finally { h.delivery.resolve(); h.editor.dispose(); }
});

test('a genuine initial recovery conflict remains protected and prevents Build navigation', { timeout: 5000 }, async () => {
  const h = await recoveredSession(true);
  try {
    const barrier = h.editor.captureCommandBarrier();
    const building = buildEntrypoint(h.editor)({ editor: h.editor, barrier });
    await tick(); h.delivery.resolve(); assert.equal(await building, null);
    assert.equal(h.editor.getSnapshot().error?.category, 'conflict');
    assert.equal(h.canonical().status, 'draft'); assert.ok(h.recovery());
    assert.equal(h.submitted.length, 1);
  } finally { h.delivery.resolve(); h.editor.dispose(); }
});

for (const interruption of ['unmount', 'changeOwner'] as const) test(`actual Build refuses ${interruption} during the initial owned recovery wait`, { timeout: 5000 }, async () => {
  const h = await recoveredSession();
  try {
    const barrier = h.editor.captureCommandBarrier(), build = buildEntrypoint(h.editor);
    const building = build({ editor: h.editor, barrier });
    await tick(); build[interruption](); h.delivery.resolve();
    assert.equal(await building, null);
    assert.equal(h.canonical().status, 'draft');
    assert.equal(h.editor.getSnapshot().trip.status, 'draft');
    assert.equal(h.submitted.length, 1, 'retired Build cannot issue a status update');
  } finally { h.delivery.resolve(); h.editor.dispose(); }
});
