import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { normalizeLegacyGeneratedDayContext } from '../lib/easyt/itinerary-generated-context.ts';
import { routeProjectionInputKey } from '../lib/easyt/trip-route-intent.ts';
import { builderRecommendationProjection } from '../lib/easyt/trip-builder-recommendations.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { readBuilderInputDraft, writeBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';
import { saveTripRecoveryToStorage, loadTripRecoveryFromStorage, acknowledgeTripBuildSaveInStorage, markTripRecoveryStateInStorage } from '../lib/easyt/storage.ts';
import { createBuilderEditSession } from '../lib/easyt/trip-builder-edit-session.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';
import type { BuilderProjectionResponse } from '../lib/easyt/trip-builder-reconciliation.ts';
import type { BuilderReconciliationRequest } from '../lib/easyt/trip-builder-edit-session.ts';
import type { AsyncBuilderEditSessionOptions } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { builderNightsCommand } from '../lib/easyt/trip-builder-handler-contract.ts';
import { tripNightsBetween, allocateTripNights } from '../lib/easyt/night-allocation.ts';
import { canBuildTrip } from '../lib/easyt/can-build-trip.ts';
import { acceptedGeographicPlace, stopGeographicPlace } from '../lib/easyt/geographic-binding.ts';
import type { JourneyEndpointPlace } from '../lib/easyt/trip.ts';

const loaded = import('../lib/easyt/trip-builder-async-edit-session.ts').catch((cause: NodeJS.ErrnoException) => {
  if (cause.code === 'ERR_MODULE_NOT_FOUND') return null; throw cause;
});
async function api() { const result = await loaded; assert.ok(result, 'Async Builder edit session must be implemented'); return result; }
class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function verifiedFixturePlace(place:JourneyEndpointPlace) {
 const verified=acceptedGeographicPlace(place,{...place,providerId:`fixture:${place.name}`,placeType:'city',routability:'direct_destination'},'endpoint');
 assert.ok(verified,'fixture geography must satisfy the unchanged production verifier');return verified;
}
function fixture() { const trip = requireReadableTripDocument(normalizeLegacyGeneratedDayContext(canonicalRouteFixture()));
  const start=verifiedFixturePlace({name:'London',country:'United Kingdom',canonicalPlaceId:'place:london',coordinates:[-0.1276,51.5072]});
  trip.brief.intent.route.origin=start;
  Object.assign(trip.brief,{origin:start.name,originCountry:start.country,originCanonicalPlaceId:start.canonicalPlaceId,originProviderId:start.providerId,originCoordinates:start.coordinates});
  trip.stops=trip.stops.map(stop=>{const place=verifiedFixturePlace(stopGeographicPlace(stop));return {...stop,providerId:place.providerId,geographicBinding:place.geographicBinding}});
  trip.brief.intent.route.projectionInputKey = routeProjectionInputKey(trip); return trip; }
const budget = { kind: 'budget', budget: 'high' } as const;
const origin = { kind: 'origin', place: verifiedFixturePlace({ name: 'Paris', canonicalPlaceId: 'place:paris', country: 'France', coordinates: [2.35, 48.85] }) } as const;
function response(request: BuilderReconciliationRequest): BuilderProjectionResponse {
  return { scope: request.scope, inputKey: request.inputKey, requestId: request.requestId, dispatched: request.dispatched,
    results: request.dispatched.map(unit => ({ ...unit, phase: 'complete' })),
    legs: request.trip.legs.filter(leg => request.dispatched.some(unit => unit.kind === 'leg' && unit.targetId === leg.id)),
    recommendationProjections: request.dispatched.filter(unit => unit.kind === 'recommendation').map(unit => builderRecommendationProjection(request.trip, unit.targetId, [])) };
}
async function harness(input: { initialTrip?: CanonicalEasyTTrip; owner?: string | null; storage?: MemoryStorage } = {}) {
  const initialTrip = input.initialTrip ?? fixture(), ownerId = input.owner === undefined ? initialTrip.ownerId : input.owner;
  const storage = input.storage ?? new MemoryStorage(); let owner = ownerId;
  let recoveryGate: ReturnType<typeof deferred<void>> | null = null, draftGate: ReturnType<typeof deferred<void>> | null = null;
  let ackGate: ReturnType<typeof deferred<void>> | null = null, failRecovery = false, failDraft = false, cacheFails = false;
  const timers: { callback: () => void; delay: number; active: boolean }[] = [];
  const writes: { trip: CanonicalEasyTTrip; result: ReturnType<typeof deferred<CanonicalEasyTTrip>> }[] = [];
  const projections: { request: BuilderReconciliationRequest; signal: AbortSignal; result: ReturnType<typeof deferred<BuilderProjectionResponse>> }[] = [];
  const deviceWrites: { trip: CanonicalEasyTTrip; options: Parameters<AsyncBuilderEditSessionOptions['saveRecovery']>[1] }[] = [];
  const options: AsyncBuilderEditSessionOptions = {
    initialTrip, initialRecovery: loadTripRecoveryFromStorage(storage, initialTrip.id, ownerId), getOwnerId: () => owner,
    readDraft: async (trip, scope) => readBuilderInputDraft(storage, trip, scope),
    writeDraft: async (trip, draft, scope, guard) => {
      const gate = draftGate; if (gate) await gate.promise;
      if (guard && !guard.isCurrent()) return { ok: false, reason: 'stale' };
      if (failDraft) return { ok: false, reason: 'storage' };
      return writeBuilderInputDraft(storage, trip, draft, scope);
    },
    saveRecovery: async (trip, metadata) => {
      deviceWrites.push({ trip, options: metadata }); const gate = recoveryGate; if (gate) await gate.promise;
      if (!metadata.isCurrent() || failRecovery || failDraft) return { stored: false, handle: metadata.replace ?? { ownerId: metadata.ownerId, tripId: trip.id, writeId: 'refused' }, blockedByExistingRecovery: false, failureReason: 'device-unavailable' };
      // Synthetic atomic callback: no fault or guard can occur between these synchronous writes.
      const result = saveTripRecoveryToStorage(storage, trip, metadata);
      if (result.stored) assert.equal(writeBuilderInputDraft(storage, trip, metadata.draft, metadata.ownerId).ok, true);
      return result;
    },
    acknowledgeRecovery: async (reviewed, canonical, handle) => {
      const gate = ackGate; if (gate) await gate.promise;
      if (cacheFails) return { outcome: 'storage-failed', remainingRecovery: loadTripRecoveryFromStorage(storage, initialTrip.id, ownerId), accountAcknowledged: true, cacheStored: false };
      return { ...acknowledgeTripBuildSaveInStorage(storage, reviewed, canonical, handle), accountAcknowledged: true, cacheStored: true };
    },
    markRecoveryState: async (handle, state) => markTripRecoveryStateInStorage(storage, handle, state),
    persistAccount: (trip) => { const result = deferred<CanonicalEasyTTrip>(); writes.push({ trip: requireReadableTripDocument(trip), result }); return result.promise; },
    reconcile: (request, signal) => { const result = deferred<BuilderProjectionResponse>(); projections.push({ request, signal, result }); return result.promise; },
    now: () => '2026-10-12T00:00:00.000Z',
    schedule: (callback, delay) => { const timer = { callback, delay, active: true }; timers.push(timer); return () => { timer.active = false; }; },
  };
  const session = await (await api()).createAsyncBuilderEditSession(options);
  return { session, options, storage, deviceWrites, writes, projections,
    holdRecovery() { recoveryGate = deferred<void>(); return recoveryGate; }, holdDraft() { draftGate = deferred<void>(); return draftGate; }, holdAck() { ackGate = deferred<void>(); return ackGate; },
    failRecovery() { failRecovery = true; }, failDraft() { failDraft = true; }, failCache() { cacheFails = true; }, rotate(value: string | null) { owner = value; },
    recovery: () => loadTripRecoveryFromStorage(storage, initialTrip.id, ownerId),
    run: async (delay: number) => { for (const timer of [...timers]) if (timer.active && timer.delay === delay) { timer.active = false; timer.callback(); } await tick(); },
    ack: async (index: number) => { const write = writes[index]!; write.result.resolve(write.trip.ownerId === null ? requireReadableTripDocument(canonicalTripForOwner(ownerId!, write.trip, nextTripUpdatedAt(write.trip.updatedAt))) : { ...write.trip, updatedAt: nextTripUpdatedAt(write.trip.updatedAt) }); await tick(); },
  };
}
async function accept(h: Awaited<ReturnType<typeof harness>>, edit = budget as Parameters<typeof h.session.accept>[0]) {
  const result = await h.session.accept(edit, h.session.getSnapshot().inputRevision); assert.ok(result.ok); return h.session.getSnapshot();
}

test('hydration awaits authoritative draft read and rejects an owner change during the read', async () => {
  const h = await harness(), gate = deferred<ReturnType<typeof readBuilderInputDraft>>(); let owner = 'owner-a', settled = false;
  const pending = (await api()).createAsyncBuilderEditSession({ ...h.options, getOwnerId: () => owner, readDraft: () => gate.promise }).then(value => { settled = true; return value; });
  await tick(); assert.equal(settled, false); owner = 'owner-b'; gate.resolve({ kind: 'empty' });
  await assert.rejects(pending, /scope|owner|expired/i); h.session.dispose();
});
test('held device transaction cannot advance accepted trip, Undo retention or account queue', async () => {
  const h = await harness(), before = h.session.getSnapshot(), frame = h.session.captureStructuralSnapshot(false), gate = h.holdRecovery();
  const pending = h.session.accept(budget, before.inputRevision); await tick();
  assert.equal(h.session.getSnapshot().acceptedRevision, 0); assert.deepEqual(h.session.getSnapshot().trip, before.trip);
  assert.equal(h.session.getSnapshot().saveState, 'device-saving'); assert.equal(h.session.retainStructuralSnapshot(frame, 1), false);
  await h.run(450); assert.equal(h.writes.length, 0); assert.equal(h.recovery(), null);
  const write = h.deviceWrites[0]!; assert.equal(Object.isFrozen(write.trip), true); assert.equal(Object.isFrozen(write.options.draft), true);
  assert.deepEqual(write.options.canonicalBase, before.trip); assert.equal(write.options.isCurrent(), true);
  gate.resolve(); assert.ok((await pending).ok); assert.equal(h.session.getSnapshot().acceptedRevision, 1); assert.deepEqual(h.recovery()?.trip, h.session.getSnapshot().trip);
  assert.equal(h.session.retainStructuralSnapshot(frame, 1), true); await h.run(450); assert.equal(h.writes.length, 1); h.session.dispose();
});
test('atomic accepted edit consumes only its exact raw field after durable verification', async () => {
  const h = await harness(); await h.session.updateDraft({ binding: { kind: 'origin' }, raw: '  Paris  ' });
  await h.session.updateDraft({ binding: { kind: 'destination-add' }, raw: ' unrelated bytes ' }); const gate = h.holdRecovery();
  const pending = h.session.accept(origin, h.session.getSnapshot().inputRevision, { binding: { kind: 'origin' }, raw: '  Paris  ' }); await tick();
  assert.deepEqual(h.session.getSnapshot().draft.fields.map(field => field.raw), ['  Paris  ', ' unrelated bytes ']);
  assert.deepEqual(h.deviceWrites[0]!.options.draft.fields.map(field => field.raw), [' unrelated bytes ']);
  gate.resolve(); assert.ok((await pending).ok); assert.deepEqual(h.session.getSnapshot().draft.fields.map(field => field.raw), [' unrelated bytes ']);
  assert.deepEqual(readBuilderInputDraft(h.storage, h.session.getSnapshot().trip), { kind: 'readable', draft: h.session.getSnapshot().draft }); h.session.dispose();
});
for (const change of ['owner', 'dispose'] as const) test(`held accepted edit rejects ${change} change and preserves raw bytes`, async () => {
  const h = await harness(); await h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' retained raw ' }); const before = h.session.getSnapshot(), bytes = new Map(h.storage.values), gate = h.holdRecovery();
  const pending = h.session.accept(budget, before.inputRevision); await tick();
  if (change === 'owner') h.rotate('owner-b'); else h.session.dispose();
  assert.equal(h.deviceWrites[0]!.options.isCurrent(), false); gate.resolve(); assert.deepEqual(await pending, { ok: false, reason: 'stale-source' });
  assert.equal(h.session.getSnapshot().acceptedRevision, 0); assert.deepEqual(h.session.getSnapshot().trip, before.trip); assert.equal(h.recovery(), null);
  assert.deepEqual(h.storage.values, bytes); h.session.dispose();
});
test('held raw input is visible in memory but stays pending and cannot release cloud saving', async () => {
  const h = await harness(); await accept(h); const before = new Map(h.storage.values), gate = h.holdDraft();
  const pending = h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' unfinished raw ' }); await tick();
  assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' unfinished raw '); assert.equal(h.session.getSnapshot().saveState, 'device-saving'); assert.deepEqual(h.storage.values, before);
  await h.run(450); assert.equal(h.writes.length, 0); gate.resolve(); assert.equal(await pending, true); await h.run(450); assert.equal(h.writes.length, 1); h.session.dispose();
});
test('failed atomic draft retention keeps accepted document and unconsumed raw bytes', async () => {
  const h = await harness(); await h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' exact raw ' }); const before = h.session.getSnapshot(), bytes = new Map(h.storage.values); h.failDraft();
  assert.deepEqual(await h.session.accept(origin, before.inputRevision, { binding: { kind: 'origin' }, raw: ' exact raw ' }), { ok: false, reason: 'storage' });
  assert.deepEqual(h.session.getSnapshot().trip, before.trip); assert.deepEqual(h.session.getSnapshot().draft, before.draft); assert.deepEqual(h.storage.values, bytes); assert.equal(h.writes.length, 0); h.session.dispose();
});
test('stale projection response cannot start a durable write after a newer raw input', async () => {
  const h = await harness(); await accept(h, origin); await h.run(0); const work = h.projections.at(-1)!; assert.ok(work);
  await h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' newer unaccepted origin ' }); const before = h.session.getSnapshot(), writes = h.deviceWrites.length;
  work.result.resolve(response(work.request)); await tick(); assert.equal(h.deviceWrites.length, writes); assert.deepEqual(h.session.getSnapshot().trip, before.trip); assert.equal(work.signal.aborted, true); h.session.dispose();
});
test('reserved projection finishes its canonical commit while preserving newer input and refusing stale feedback', async () => {
  const h = await harness(); await accept(h, origin); await h.run(0); const work = h.projections.at(-1)!, before = h.session.getSnapshot(), gate = h.holdRecovery();
  work.result.resolve(response(work.request)); await tick(); assert.equal(h.session.getSnapshot().acceptedRevision, before.acceptedRevision); assert.equal(h.deviceWrites.length, 2);
  const pending = h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' changed during projection ' }); gate.resolve(); await pending; await tick();
  assert.equal(h.session.getSnapshot().acceptedRevision,before.acceptedRevision+1); assert.deepEqual(h.recovery()?.trip,h.session.getSnapshot().trip);
  assert.deepEqual(h.session.getSnapshot().transferAssessments,[]); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' changed during projection '); h.session.dispose();
});
test('delayed exact ACK never installs old content or retires newer accepted recovery', async () => {
  const h = await harness(); await accept(h); await h.run(450); const gate = h.holdAck(); await h.ack(0);
  const later = await accept(h, { kind: 'travellers', travellers: 4 }), handle = h.recovery()!.writeId;
  gate.resolve(); await tick(); assert.equal(h.session.getSnapshot().trip.travellers, 4); assert.equal(h.session.getSnapshot().acceptedRevision, later.acceptedRevision); assert.equal(h.recovery()!.writeId, handle);
  await h.run(450); assert.equal(h.writes.length, 2); assert.equal(h.writes[1]!.trip.travellers, 4); assert.notEqual(h.writes[1]!.trip.updatedAt, fixture().updatedAt); await h.ack(1); assert.equal(h.session.getSnapshot().canonicalSaveState, 'cloud'); h.session.dispose();
});
test('exact account ACK remains account truth when optional canonical cache fails', async () => {
  const h = await harness(); await accept(h); h.failCache(); await h.run(450); await h.ack(0);
  assert.equal(h.session.getSnapshot().canonicalSaveState, 'cloud'); assert.equal(h.session.getSnapshot().error, null); assert.ok(h.recovery(), 'optional cache failure preserves source bytes');
  assert.equal(await h.session.flush(), true); h.session.dispose();
});
test('Undo remains awaited and carries CAS ancestry behind a held earlier save', async () => {
  const h = await harness(), frame = h.session.captureStructuralSnapshot(); await accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' }); await h.run(450);
  await accept(h, { kind: 'structural-inverse', snapshot: frame }); await h.run(450); await h.ack(0);
  assert.equal(h.writes.length, 2); assert.deepEqual(h.writes[1]!.trip.stops.map(stop => stop.id), fixture().stops.map(stop => stop.id)); await h.ack(1); assert.equal(h.session.getSnapshot().canonicalSaveState, 'cloud'); h.session.dispose();
});
test('promotion remaps preserved raw input and a pre-promotion Undo frame after newer edits', async () => {
  const initial = fixture(); initial.ownerId = null; const h = await harness({ initialTrip: initial, owner: 'owner-a' });
  await accept(h); const saving = h.session.flush({ promoteOwnerless: true }); await tick(); const frame = h.session.captureStructuralSnapshot();
  await accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' }); await accept(h, { kind: 'travellers', travellers: 4 });
  await h.session.updateDraft({ binding: { kind: 'nights', intentId: 'intent:kyoto', stopId: 'kyoto' }, raw: ' 3. ' }); await h.ack(0);
  assert.equal(h.session.getSnapshot().trip.ownerId, 'owner-a'); assert.equal(h.session.getSnapshot().trip.travellers, 4);
  assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' 3. '); assert.equal(h.session.getSnapshot().draft.fields[0]!.status, 'editable');
  await accept(h, { kind: 'structural-inverse', snapshot: frame }); await h.run(450); await h.ack(1); await tick();
  if (h.writes[2]) await h.ack(2); assert.equal(await saving, true); assert.equal(h.session.getSnapshot().trip.travellers, 4); assert.equal(h.session.getSnapshot().trip.stops.length, initial.stops.length); h.session.dispose();
});
test('raw discard retains bytes until its verified write and refuses failed discard', async () => {
  const h = await harness(); await h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' retained until discard ' }); const gate = h.holdDraft();
  const pending = h.session.discardDraft({ kind: 'origin' }); await tick(); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' retained until discard ');
  gate.resolve(); assert.equal(await pending, true); assert.equal(h.session.getSnapshot().draft.fields.length, 0);
  await h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' failed discard preserved ' }); h.failDraft(); assert.equal(await h.session.discardDraft({ kind: 'origin' }), false); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' failed discard preserved '); h.session.dispose();
});
test('the existing synchronous API retains immediate boolean and acceptance returns', async () => {
  const h = await harness(); const sync = createBuilderEditSession({ ...h.options,
    readDraft: (trip, scope) => readBuilderInputDraft(h.storage, trip, scope), writeDraft: (trip, draft, scope) => writeBuilderInputDraft(h.storage, trip, draft, scope),
    saveRecovery: (trip, metadata) => saveTripRecoveryToStorage(h.storage, trip, metadata), acknowledgeRecovery: (reviewed, canonical, handle) => acknowledgeTripBuildSaveInStorage(h.storage, reviewed, canonical, handle),
    markRecoveryState: (handle, state) => markTripRecoveryStateInStorage(h.storage, handle, state),
  });
  assert.equal(sync.updateDraft({ binding: { kind: 'origin' }, raw: ' sync stays sync ' }), true); const result = sync.accept(budget, sync.getSnapshot().inputRevision); assert.equal(result.ok, true); assert.equal(result instanceof Promise, false); sync.dispose(); h.session.dispose();
});

for (const failure of ['draft', 'recovery'] as const) test(`failed promotion ${failure} retention preserves exact ownerless recovery and raw input`, async () => {
  const initial = fixture(); initial.ownerId = null; const h = await harness({ initialTrip: initial, owner: 'owner-a' });
  await h.session.updateDraft({ binding: { kind: 'nights', intentId: 'intent:kyoto', stopId: 'kyoto' }, raw: ' preserved promotion raw ' }); await accept(h);
  const before = h.session.getSnapshot(), retained = h.recovery(); const saving = h.session.flush({ promoteOwnerless: true }); await tick();
  if (failure === 'draft') h.failDraft(); else h.failRecovery(); await h.ack(0); assert.equal(await saving, false);
  assert.deepEqual(h.session.getSnapshot().trip, before.trip); assert.deepEqual(h.session.getSnapshot().draft, before.draft); assert.equal(h.recovery()?.writeId, retained?.writeId); assert.deepEqual(h.recovery()?.trip, retained?.trip); h.session.dispose();
});
test('failed authoritative draft hydration cannot overwrite unknown raw bytes', async () => {
  const h = await harness(); const blocked = await (await api()).createAsyncBuilderEditSession({ ...h.options, readDraft: async () => ({ kind: 'error', reason: 'storage' }) });
  const before = new Map(h.storage.values); assert.equal((await blocked.accept(budget, 0)).ok, false); assert.equal(await blocked.updateDraft({ binding: { kind: 'origin' }, raw: ' cannot replace unread input ' }), false);
  assert.deepEqual(h.storage.values, before); assert.equal(h.deviceWrites.length, 0); blocked.dispose(); h.session.dispose();
});
test('projection retry awaits retained failure state without consuming independent raw input', async () => {
  const h = await harness(); await h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' retain during retry ' }); await accept(h, origin); await h.run(0);
  const work = h.projections.at(-1)!; work.result.resolve({ ...response(work.request), results: work.request.dispatched.map(unit => ({ ...unit, phase: 'failed', reason: 'unavailable' })) }); await tick();
  const before = h.session.getSnapshot(), unit = before.failedUnits[0]!; assert.ok(unit); const gate = h.holdRecovery(); const retrying = h.session.retryNecessaryUnit(unit); await tick();
  assert.equal(h.session.getSnapshot().acceptedRevision, before.acceptedRevision); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' retain during retry '); gate.resolve(); assert.equal(await retrying, true);
  assert.ok(h.session.getSnapshot().pendingUnits.some(item => item.kind === unit.kind && item.targetId === unit.targetId)); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' retain during retry '); h.session.dispose();
});
test('network retry keeps exact current handle and waits for async status before account submission', async () => {
  const h = await harness(); await accept(h); await h.run(450); h.writes[0]!.result.reject(new TypeError('offline')); await tick(); const retained = h.session.getSnapshot().recovery;
  assert.equal(h.session.getSnapshot().error?.category, 'network'); assert.equal(await h.session.retrySave(), true); await tick(); assert.equal(h.writes.length, 2); assert.deepEqual(h.session.getSnapshot().recovery, retained);
  await h.ack(1); assert.equal(await h.session.flush(), true); assert.equal(h.session.getSnapshot().canonicalSaveState, 'cloud'); h.session.dispose();
});

test('latest promotion is a durable identity continuation without a new accepted edit revision', async () => {
  const initial = fixture(); initial.ownerId = null; const h = await harness({ initialTrip: initial, owner: 'owner-a' }); await accept(h);
  const revision = h.session.getSnapshot().acceptedRevision, saving = h.session.flush({ promoteOwnerless: true }); await tick(); await h.ack(0);
  assert.equal(await saving, true); assert.equal(h.session.getSnapshot().acceptedRevision, revision); assert.equal(h.writes.length, 1); h.session.dispose();
});
test('pre-promotion Undo maps become available after durable remap while exact ACK journaling is held', async () => {
  const initial = fixture(); initial.ownerId = null; const h = await harness({ initialTrip: initial, owner: 'owner-a' }); await accept(h);
  const frame = h.session.captureStructuralSnapshot(), gate = h.holdAck(), saving = h.session.flush({ promoteOwnerless: true }); await tick();
  await accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' }); await h.ack(0);
  assert.equal(h.session.getSnapshot().trip.ownerId, 'owner-a');
  const inverse = await h.session.accept({ kind: 'structural-inverse', snapshot: frame }, h.session.getSnapshot().inputRevision); assert.equal(inverse.ok, true, JSON.stringify(inverse));
  gate.resolve(); await tick(); await h.run(450); if (h.writes[1]) await h.ack(1); if (h.writes[2]) await h.ack(2); await saving;
  assert.equal(h.session.getSnapshot().trip.stops.length, initial.stops.length); h.session.dispose();
});

test('an exact ACK waits for a held newer raw write instead of invalidating its durable continuation', async () => {
  const h = await harness(); await accept(h); await h.run(450); const gate = h.holdDraft();
  const typing = h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' newer raw across ACK ' }); await tick(); await h.ack(0);
  assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, ' newer raw across ACK '); gate.resolve(); assert.equal(await typing, true);
  await tick(); const state = h.session.getSnapshot(); assert.equal(state.canonicalSaveState, 'cloud');
  assert.equal((readBuilderInputDraft(h.storage, state.trip) as { kind: 'readable'; draft: typeof state.draft }).draft.fields[0]!.raw, ' newer raw across ACK ');
  assert.equal(await h.session.flush(), true); h.session.dispose();
});

test('an explicitly unacknowledged result cannot claim account success despite optional cache status', async () => {
  const h = await harness(); await accept(h); const retained = h.recovery();
  h.options.acknowledgeRecovery = async () => ({ outcome: 'acknowledged', remainingRecovery: retained, accountAcknowledged: false, cacheStored: true });
  await h.run(450); await h.ack(0); assert.notEqual(h.session.getSnapshot().canonicalSaveState, 'cloud'); assert.ok(h.session.getSnapshot().error); assert.equal(h.recovery()?.writeId, retained?.writeId); h.session.dispose();
});

function builderDispatch(h: Awaited<ReturnType<typeof harness>>) {
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const dispatchAcceptedBuilderEdits =');
  const end = source.indexOf('  const updateDiscoveryPlanningState =', start);
  const changes: unknown[] = [], applied: unknown[] = [], errors: string[] = [];
  const ref = { current: h.session }, mounted = { current: true };
  const scope = { builderEditSessionRef: ref, builderMountedRef: mounted, activeBrowserOwnerIdRef: { current: h.session.getSnapshot().browserOwnerId },
    builderStructuralFeedback: () => ({ summary: 'remove_stop' }), captureStructuralChange: (summary: string, canonical: unknown) => ({ summary, canonical }),
    publishStructuralChange: (frame: unknown) => changes.push(frame), applyAcceptedBuilderDocument: (trip: unknown) => applied.push(trip),
    setCloudSaveError: (message: string) => errors.push(message), setSaveState: () => {} };
  const script = ts.transpileModule(source.slice(start, end) + '\nreturn dispatchAcceptedBuilderEdit;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dispatch = new Function('scope', `with(scope){${script}}`)(scope) as (edit: Parameters<typeof h.session.accept>[0]) => Promise<boolean>;
  return { dispatch, changes, applied, errors, mounted, ref };
}
function buildPersistence(h: Awaited<ReturnType<typeof harness>>, onAssessment?: (ordinal:number)=>Promise<void>) {
  const view = builderDispatch(h);
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const persistGeneratedTrip ='), source.indexOf('  const settleUnacknowledgedBuild ='));
  const effects:Array<()=>void>=[];let assessmentCount=0;
  const scope = { builderEditSessionRef: view.ref, builderMountedRef: view.mounted,
    activeBrowserOwnerIdRef: { current: h.session.getSnapshot().browserOwnerId },
    buildInvariant: { canBuildTrip: true }, dispatchAcceptedBuilderEdit: view.dispatch,
    sameRecoveryDocument: (a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),
    pendingBuildAssessmentRef:{current:null},buildAssessmentRequestId:0,setBuildAssessmentRequestId(){},
    useEffect(effect:()=>void){effects.push(effect)},activeTripDocument:h.session.getSnapshot().trip,
    requestBuildAssessment: async (editor:typeof h.session)=>{
      const pending=requestAssessment(editor);if(onAssessment)await onAssessment(++assessmentCount);
      const trip=editor.getSnapshot().trip,nightAllocation=trip.brief.nightAllocation??allocateTripNights({totalNights:tripNightsBetween(trip.startDate,trip.endDate),stops:trip.stops});
      scope.activeTripDocument=trip;
      scope.buildInvariant=canBuildTrip({origin:trip.brief.intent.route.origin?.name??'',originCoordinates:trip.brief.intent.route.origin?.coordinates,
        journeyEnd:trip.brief.intent.route.journeyEnd,stops:trip.stops.map(s=>({...s,coordinates:[s.longitude!,s.latitude!] as [number,number]})),
        startDate:trip.startDate,endDate:trip.endDate,durationDays:tripNightsBetween(trip.startDate,trip.endDate)+1,
        nightAllocation,allocations:trip.brief.nightAllocations??Object.fromEntries(trip.stops.map(s=>[s.id,s.nights??0])),document:trip});
      effects[0]!();return pending;
    },
    builderBuildNavigationRef:{current:null},
    recordGeneratedTrip() {}, surfaceBuildConflict() {}, setCloudSaveError() {}, trackEvent() {}, analyticsTripSource: 'builder' };
  const assessmentBody=source.slice(source.indexOf('  const requestBuildAssessment ='),source.indexOf('  const recordGeneratedTrip ='));
  const requestAssessment=new Function('scope',`with(scope){${ts.transpileModule(assessmentBody+'\nreturn requestBuildAssessment;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope) as (editor:typeof h.session)=>Promise<unknown>;
  const navStart=source.indexOf('  const canOpenBuiltTrip =');
  // Before the fix there is no final navigation guard; actual callers below also lack it.
  const canOpen=navStart<0?()=>true:new Function('scope',`with(scope){${ts.transpileModule(source.slice(navStart,source.indexOf('  const settleUnacknowledgedBuild ='))+'\nreturn canOpenBuiltTrip;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope) as (trip:CanonicalEasyTTrip)=>boolean;
  const script = ts.transpileModule(body + '\nreturn persistGeneratedTrip;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { ...view, canOpen, persist: new Function('scope', `with(scope){${script}}`)(scope) as (request?: {editor: typeof h.session; barrier: ReturnType<typeof h.session.captureCommandBarrier>}) => Promise<CanonicalEasyTTrip | null> };
}
function nightAdjustment(h: Awaited<ReturnType<typeof harness>>) {
  const view = builderDispatch(h);
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const updateAllocatedDays ='), source.indexOf('  const beginRouteEdit ='));
  const script = ts.transpileModule(body + '\nreturn adjustAllocatedDays;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const adjust = new Function('scope', `with(scope){${script}}`)({ builderEditSessionRef: view.ref,
    builderMountedRef: view.mounted, activeBrowserOwnerIdRef: { current: h.session.getSnapshot().browserOwnerId },
    nightDeltaQueueRef: { current: null }, protectedBuilderStopIds: [], rememberStructuralChange() {},
    builderNightsCommand, tripNightsBetween, dispatchAcceptedBuilderEdit: view.dispatch }) as (id: string, delta: number) => Promise<void>;
  return { ...view, adjust };
}
function discoveryCheckpoint(h: Awaited<ReturnType<typeof harness>>, renderedTrip: CanonicalEasyTTrip,
  isCurrent: () => boolean = () => true) {
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('trip-builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let checkpoint = '', persist = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (node.name.getText(parsed) === 'checkpoint') checkpoint = node.initializer.getText(parsed);
      if (node.name.getText(parsed) === 'persistDeviceRecovery' && ts.isCallExpression(node.initializer)) persist = node.initializer.arguments[0]!.getText(parsed);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed); assert.ok(checkpoint); assert.ok(persist);
  const compile = (body: string, scope: object) => new Function('scope', `with(scope){${ts.transpileModule(`return (${body});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}}`)(scope);
  const ref = { current: h.session }, owner = { current: h.session.getSnapshot().browserOwnerId };
  const mounted = { current: true };
  const persistDeviceRecovery = compile(persist, { builderEditSessionRef: ref, builderMountedRef: mounted,
    activeBrowserOwnerIdRef: owner, sameRecoveryDocument: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) });
  const run = compile(checkpoint, { confirmIsCurrent: isCurrent, builderEditSessionRef: ref, builderMountedRef: mounted,
    activeBrowserOwnerIdRef: owner, discoveryOwnersRef: { current: { trip: renderedTrip, persistDeviceRecovery } },
    receiptAcknowledgementRef: { current: null }, language: 'en',
    setDeviceRecoveryBlocked() {}, setDeviceStorageBlocked() {}, setSaveState() {}, setCloudSaveError() {} }) as () => Promise<boolean>;
  return run;
}
test('actual Discovery checkpoint verifies the accepted session document instead of a stale rendered owner ref', async () => {
  const h = await harness({ initialTrip: requireReadableTripDocument({ ...fixture(), ownerId: null }), owner: null });
  const rendered = h.session.getSnapshot().trip; await accept(h, budget);
  assert.equal(await discoveryCheckpoint(h, rendered)(), true);
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('actual Discovery checkpoint refuses a newer raw input while projection readback is pending', async () => {
  const { h, gate } = await heldGuestProjection();
  const pending = discoveryCheckpoint(h, h.session.getSnapshot().trip)(); await tick();
  const raw = h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' newer checkpoint raw ' }); gate.resolve(); await raw;
  assert.equal(await pending, false);
  assert.equal(h.session.getSnapshot().draft.fields[0]?.raw, ' newer checkpoint raw ');
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('actual Discovery checkpoint cannot confirm after its view retires during readback', async () => {
  const { h, gate } = await heldGuestProjection(); let current = true;
  const pending = discoveryCheckpoint(h, h.session.getSnapshot().trip, () => current)(); await tick();
  current = false; gate.resolve(); assert.equal(await pending, false);
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('actual Discovery checkpoint cannot acknowledge a different rendered trip scope', async () => {
  const h = await harness({ initialTrip: requireReadableTripDocument({ ...fixture(), ownerId: null }), owner: null });
  const other = requireReadableTripDocument({ ...h.session.getSnapshot().trip, id: 'different-trip' });
  assert.equal(await discoveryCheckpoint(h, other)(), false);
  assert.equal(h.deviceWrites.length, 0); assert.equal(h.writes.length, 0); h.session.dispose();
});
test('actual night controls retain two rapid activations across awaited device acceptance', async () => {
  const h = await harness({ initialTrip: requireReadableTripDocument({ ...fixture(), ownerId: null }), owner: null });
  const view = nightAdjustment(h), stop = h.session.getSnapshot().trip.stops[0]!, gate = h.holdRecovery();
  const first = view.adjust(stop.id, 1), second = view.adjust(stop.id, 1); await tick(); gate.resolve();
  await Promise.all([first, second]);
  assert.equal(h.session.getSnapshot().trip.stops[0]!.nights, stop.nights! + 2);
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('reserved night activation finishes while newer raw input retires the queued second activation', async () => {
  const h = await harness({ initialTrip: requireReadableTripDocument({ ...fixture(), ownerId: null }), owner: null });
  const view = nightAdjustment(h), stop = h.session.getSnapshot().trip.stops[0]!, gate = h.holdRecovery();
  const first = view.adjust(stop.id, 1), second = view.adjust(stop.id, 1); await tick();
  const raw = h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' newer raw ' }); gate.resolve();
  await Promise.all([first, second, raw]);
  assert.equal(h.session.getSnapshot().trip.stops[0]!.nights, stop.nights! + 1);
  assert.equal(h.session.getSnapshot().draft.fields[0]?.raw, ' newer raw ');
  assert.equal(h.deviceWrites.length,1); assert.equal(h.writes.length, 0); h.session.dispose();
});
test('queued night activations stop after native refusal without an automatic second write', async () => {
  const h = await harness({ initialTrip: requireReadableTripDocument({ ...fixture(), ownerId: null }), owner: null });
  const view = nightAdjustment(h), stop = h.session.getSnapshot().trip.stops[0]!;
  h.failRecovery(); await Promise.all([view.adjust(stop.id, 1), view.adjust(stop.id, 1)]);
  assert.equal(h.deviceWrites.length, 1); assert.equal(h.session.getSnapshot().trip.stops[0]!.nights, stop.nights);
  assert.equal(h.writes.length, 0); h.session.dispose();
});
async function heldGuestProjection() {
  const initialTrip = requireReadableTripDocument({ ...fixture(), ownerId: null });
  const h = await harness({ initialTrip, owner: null });
  await accept(h, origin); await h.run(0);
  const work = h.projections.at(-1)!; assert.ok(work);
  const gate = h.holdRecovery(); work.result.resolve(response(work.request)); await tick();
  assert.equal(h.session.getSnapshot().canonicalSaveState, 'device-saving');
  return { h, gate };
}
test('accepted edit waits for the current projection readback without rebasing newer traveller input', async () => {
  const { h, gate } = await heldGuestProjection();
  const revision = h.session.getSnapshot().inputRevision;
  const pending = h.session.accept(budget, revision); await tick(); gate.resolve();
  assert.equal((await pending).ok, true);
  assert.equal(h.session.getSnapshot().inputRevision, revision + 1);
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('actual Build waits for an in-flight projection commit before accepting planned status', async () => {
  const { h, gate } = await heldGuestProjection(), view = buildPersistence(h);
  const revision = h.session.getSnapshot().inputRevision;
  const pending = view.persist(); await tick(); gate.resolve();
  const saved = await pending;
  assert.equal(saved?.status, 'planned');
  assert.equal(saved?.brief.origin, 'Paris');
  assert.equal(h.session.getSnapshot().inputRevision, revision + 1);
  assert.equal(h.writes.length, 0, 'guest Build must not write an account');
  assert.equal(h.recovery()?.trip.status, 'planned'); h.session.dispose();
});
test('waiting Build cannot accept planned status after its mounted scope retires', async () => {
  const { h, gate } = await heldGuestProjection(), view = buildPersistence(h);
  const pending = view.persist(); await tick(); view.mounted.current = false; gate.resolve();
  assert.equal(await pending, null); assert.equal(h.session.getSnapshot().trip.status, 'draft');
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('waiting Build cannot cross an owner rotation during canonical readback', async () => {
  const { h, gate } = await heldGuestProjection(), view = buildPersistence(h);
  const pending = view.persist(); await tick(); h.rotate('different-owner'); gate.resolve();
  assert.equal(await pending, null); assert.equal(h.session.getSnapshot().trip.status, 'draft');
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('waiting Build preserves a newer unsubmitted raw input and refuses the stale request', async () => {
  const { h, gate } = await heldGuestProjection(), view = buildPersistence(h);
  const pending = view.persist(); await tick();
  const raw = h.session.updateDraft({ binding: { kind: 'origin' }, raw: ' newer raw origin ' });
  gate.resolve(); await raw;
  assert.equal(await pending, null); assert.equal(h.session.getSnapshot().trip.status, 'draft');
  assert.equal(h.session.getSnapshot().draft.fields[0]?.raw, ' newer raw origin ');
  assert.equal(h.writes.length, 0); h.session.dispose();
});
test('mounted Builder dispatch waits for durable acceptance before publishing Undo and success', async () => {
  const h = await harness(), view = builderDispatch(h), gate = h.holdRecovery();
  const pending = view.dispatch({ kind: 'remove-destination', intentId: 'intent:hiroshima' });
  assert.equal(pending instanceof Promise, true); await tick(); assert.equal(view.changes.length, 0); assert.equal(view.applied.length, 0);
  gate.resolve(); assert.equal(await pending, true); assert.equal(view.changes.length, 1); assert.equal(view.applied.length, 1); h.session.dispose();
});
test('mounted Builder dispatch cannot publish a completed acceptance after unmount', async () => {
  const h = await harness(), view = builderDispatch(h), gate = h.holdRecovery(); const pending = view.dispatch(budget); await tick();
  view.mounted.current = false; gate.resolve(); assert.equal(await pending, false); assert.equal(view.changes.length, 0); assert.equal(view.applied.length, 0); h.session.dispose();
});

test('mounted Builder preservation refuses a held acceptance instead of fabricating device durability', async () => {
  const h = await harness(), gate = h.holdRecovery(); const before = h.session.getSnapshot().trip;
  const pending = h.session.accept(budget, h.session.getSnapshot().inputRevision); await tick();
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('trip-builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'persistDeviceRecovery' && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0]!.getText(parsed); ts.forEachChild(node, visit); }; visit(parsed);
  assert.ok(callback);
  const script = ts.transpileModule(`return (${callback});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = { builderEditSessionRef: { current: h.session }, builderMountedRef: { current: true }, activeBrowserOwnerIdRef: { current: before.ownerId }, sameRecoveryDocument: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) };
  const preserve = new Function('scope', `with(scope){${script}}`)(scope) as (trip: CanonicalEasyTTrip) => Promise<{ stored: boolean }>;
  assert.equal((await preserve(before)).stored, false); gate.resolve(); await pending; h.session.dispose();
});

// Regression: completion of an already-issued origin is not new traveller input.
test('actual Build follows an origin command issued before Build while its acceptance is pending', async () => {
  const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
  await h.session.updateDraft({binding:{kind:'origin'},raw:'Paris'});
  const gate=h.holdRecovery(),before=h.session.getSnapshot();
  const prior=h.session.accept(origin,before.inputRevision,{binding:{kind:'origin'},raw:'Paris'});await tick();
  const view=buildPersistence(h),building=view.persist();await tick();gate.resolve();
  assert.equal((await prior).ok,true);const saved=await building;
  assert.equal(saved?.status,'planned');assert.equal(saved?.brief.origin,'Paris');assert.equal(h.writes.length,0);h.session.dispose();
});

test('reserved accepted edit retains newer raw bytes with a revision above the committed draft', async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 await h.session.updateDraft({binding:{kind:'origin'},raw:'original raw'});
 const gate=h.holdRecovery(),command=h.session.accept(budget,h.session.getSnapshot().inputRevision);await tick();
 const newer=h.session.updateDraft({binding:{kind:'origin'},raw:'newer raw'});gate.resolve();
 const result=await command;assert.equal(result.ok,true);assert.equal(await newer,true);
 if(!result.ok)throw Error('Expected accepted receipt');
 assert.equal(h.session.isCommandReceiptCurrent(result.receipt),false);
 assert.ok(h.session.getSnapshot().inputRevision>result.receipt.committedDraft.inputRevision);
 assert.equal(h.session.getSnapshot().draft.fields[0]?.raw,'newer raw');
 const read=readBuilderInputDraft(h.storage,h.session.getSnapshot().trip);assert.equal(read.kind,'readable');
 if(read.kind==='readable')assert.equal(read.draft.fields[0]?.raw,'newer raw');h.session.dispose();
});
for(const interruption of ['later-command','prior-refusal','editor-replaced'] as const)test(`actual Build refuses ${interruption} while a prior origin is pending`,async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 const gate=h.holdRecovery(),prior=h.session.accept(origin,h.session.getSnapshot().inputRevision);await tick();
 const view=buildPersistence(h),building=view.persist();await tick();let later:Promise<unknown>|undefined;
 if(interruption==='later-command')later=h.session.accept(budget,h.session.getSnapshot().inputRevision);
 if(interruption==='prior-refusal')h.failRecovery();
 if(interruption==='editor-replaced')view.ref.current=null as unknown as typeof h.session;
 gate.resolve();await prior;await later;assert.equal(await building,null);assert.equal(h.session.getSnapshot().trip.status,'draft');assert.equal(h.writes.length,0);h.session.dispose();
});

test('actual Build retains the existing explicit ownerless promotion path from pending recovery',async()=>{
 const initial=requireReadableTripDocument({...fixture(),ownerId:null}),storage=new MemoryStorage();
 assert.equal(saveTripRecoveryToStorage(storage,initial,{ownerId:'owner-a'}).stored,true);
 const h=await harness({initialTrip:initial,owner:'owner-a',storage}),view=buildPersistence(h);
 const building=view.persist();await tick();assert.equal(h.writes.length,1,'Build must reach the existing explicit promotion flush');
 await h.ack(0);const built=await building;assert.equal(built?.ownerId,'owner-a');assert.equal(built?.status,'planned');h.session.dispose();
});
test('actual Build request retires when raw input changes before its effect starts',async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null}),view=buildPersistence(h);
 const request={editor:h.session,barrier:h.session.captureCommandBarrier()};
 await h.session.updateDraft({binding:{kind:'origin'},raw:'typed after Build click'});
 assert.equal(await view.persist(request),null);assert.equal(h.session.getSnapshot().trip.status,'draft');assert.equal(h.deviceWrites.length,0);h.session.dispose();
});
test('actual Build cannot navigate after newer raw input arrives during account flush',async()=>{
 const h=await harness(),view=buildPersistence(h),building=view.persist();await tick();assert.equal(h.writes.length,1);
 await h.session.updateDraft({binding:{kind:'origin'},raw:'newer during account flush'});await h.ack(0);
 assert.equal(await building,null);assert.equal(h.session.getSnapshot().draft.fields[0]?.raw,'newer during account flush');h.session.dispose();
});

// Independent implementation review regressions: each was RED on the reviewed diff.
test('discard queued behind a reserved commit settles against its accepted source', async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 await h.session.updateDraft({binding:{kind:'origin'},raw:'discard me'});
 const gate=h.holdRecovery(),command=h.session.accept(budget,h.session.getSnapshot().inputRevision);await tick();
 const discard=h.session.discardDraft({kind:'origin'});gate.resolve();assert.equal((await command).ok,true);
 assert.equal(await discard,true);assert.equal(h.session.getSnapshot().draft.fields.length,0);
 assert.equal(h.session.getSnapshot().saveState,'local');assert.equal(await h.session.flush(),true);
 assert.equal((await h.session.captureCommandBarrier().wait()).ok,true);h.session.dispose();
});
test('fresh Build can follow an obsolete retired command and a verified discard',async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 const command=h.session.accept(budget,h.session.getSnapshot().inputRevision);
 const raw=h.session.updateDraft({binding:{kind:'origin'},raw:'superseding raw'});
 assert.equal((await command).ok,false);assert.equal(await raw,true);
 assert.equal(await h.session.discardDraft({kind:'origin'}),true);assert.equal(h.session.getSnapshot().error,null);
 const built=await buildPersistence(h).persist();assert.equal(built?.status,'planned');h.session.dispose();
});
test('actual Build must reassess a pending origin clear after its acceptance',async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 const gate=h.holdRecovery(),command=h.session.accept({kind:'origin',place:null},h.session.getSnapshot().inputRevision);await tick();
 const built=buildPersistence(h).persist();gate.resolve();assert.equal((await command).ok,true);
 assert.equal(await built,null);assert.equal(h.session.getSnapshot().trip.status,'draft');assert.equal(h.writes.length,0);h.session.dispose();
});

test('guest Build retirement renders no account failure or unverified device assurance',async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 const gate=h.holdDraft(),writing=h.session.updateDraft({binding:{kind:'origin'},raw:'pending newer raw'});await tick();
 const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const settleUnacknowledgedBuild ='),source.indexOf('  const openBuiltTrip ='));
 const scope:any={builderEditSessionRef:{current:h.session},setOpeningTrip(){},setSaveState(){},setBuildNeedsReview(value:boolean){scope.buildNeedsReview=value},
  setCloudSaveError(fn:any){scope.cloudSaveError=typeof fn==='function'?fn(''):fn},language:'en',buildNeedsReview:false,
  mountedBuilder:{snapshot:h.session.getSnapshot()},devicePersistenceOutcome:null,deviceStorageBlocked:false,deviceRecoveryBlocked:false,cloudConflictTrip:null,cloudAuthInterrupted:false};
 const script=ts.transpileModule(body+'\nsettleUnacknowledgedBuild();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('scope',`with(scope){${script}}`)(scope);
 const parsed=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const props:Record<string,string>={};
 function visit(node:ts.Node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(parsed)==='MorroviaRecoveryFeedback'){
  for(const prop of node.attributes.properties)if(ts.isJsxAttribute(prop)&&['title','safety'].includes(prop.name.getText(parsed))&&prop.initializer&&ts.isJsxExpression(prop.initializer)&&prop.initializer.expression)props[prop.name.getText(parsed)]=prop.initializer.expression.getText(parsed);
 }ts.forEachChild(node,visit)}visit(parsed);
 const render=(value:string)=>new Function('scope',`with(scope){return (${value});}`)(scope);
 assert.doesNotMatch(render(props.title!),/account/i);assert.doesNotMatch(render(props.safety!),/safe on this device/i);
 assert.match(render(props.safety!),/keep this tab open/i);gate.resolve();await writing;h.session.dispose();
});

for(const change of ['none','document','revision','owner','unmount'] as const)test(`Build assessment publication is bound to its settled render: ${change}`,async()=>{
 const h=await harness(),source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const requestBuildAssessment ='),source.indexOf('  const recordGeneratedTrip ='));
 const effects:Array<()=>void>=[],snapshot=h.session.getSnapshot();
 const scope:any={pendingBuildAssessmentRef:{current:null},setBuildAssessmentRequestId(){},useEffect(effect:()=>void){effects.push(effect)},buildAssessmentRequestId:0,
  builderEditSessionRef:{current:h.session},builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:snapshot.browserOwnerId},activeTripDocument:snapshot.trip,
  buildInvariant:{canBuildTrip:true},sameRecoveryDocument:(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)};
 const script=ts.transpileModule(body+'\nreturn requestBuildAssessment;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const request=new Function('scope',`with(scope){${script}}`)(scope);const pending=request(h.session);
 if(change==='document')scope.activeTripDocument={...snapshot.trip,title:'a different rendered document'};
 if(change==='revision')await accept(h);
 if(change==='owner')scope.activeBrowserOwnerIdRef.current='owner-b';
 if(change==='unmount')scope.builderMountedRef.current=false;
 effects[0]!();const result=await pending;assert.equal(result!==null,change==='none');h.session.dispose();
});
test('discard superseded during its reserved write keeps newer raw and persists the higher revision',async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 await h.session.updateDraft({binding:{kind:'origin'},raw:'discard requested'});const gate=h.holdDraft();
 const discard=h.session.discardDraft({kind:'origin'});await tick();const raw=h.session.updateDraft({binding:{kind:'origin'},raw:'newest raw'});gate.resolve();
 await discard;assert.equal(await raw,true);assert.equal(h.session.getSnapshot().draft.fields[0]?.raw,'newest raw');
 assert.deepEqual(readBuilderInputDraft(h.storage,h.session.getSnapshot().trip),{kind:'readable',draft:h.session.getSnapshot().draft});
 assert.equal(h.session.getSnapshot().saveState,'local');h.session.dispose();
});

test('Build status refuses a source changed by projection after its assessment',async()=>{
 const {h,gate}=await heldGuestProjection(),before=h.deviceWrites.length;
 const command=h.session.accept({kind:'build-status'},h.session.getSnapshot().inputRevision);await tick();gate.resolve();
 assert.equal((await command).ok,false);assert.equal(h.session.getSnapshot().trip.status,'draft');
 assert.equal(h.deviceWrites.length,before,'a stale assessment cannot start a status write');h.session.dispose();
});

// Independent-recheck counterexamples: actual Build closure and assessment publication.
for(const outcome of ['failed','held'] as const)test(`final Build assessment refuses ${outcome} projection persistence`,async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});await accept(h,origin);
 let held:ReturnType<typeof h.holdRecovery>|undefined,before:ReturnType<typeof h.session.getSnapshot>|undefined;
 const view=buildPersistence(h,async ordinal=>{
  if(ordinal!==2)return;
  before=h.session.getSnapshot();await h.run(0);const work=h.projections.at(-1)!;assert.ok(work);
  if(outcome==='failed')h.failRecovery();else held=h.holdRecovery();
  work.result.resolve(response(work.request));await tick();
  assert.equal(h.session.getSnapshot().acceptedRevision,before.acceptedRevision);
  assert.deepEqual(h.session.getSnapshot().trip,before.trip);
  assert.equal(outcome==='failed'?h.session.getSnapshot().error?.deviceOutcome:h.session.getSnapshot().saveState,outcome==='failed'?'unknown':'device-saving');
 });
 const saved=await view.persist();assert.equal(saved,null,'unsettled or failed persistence cannot gain navigation authority');
 held?.resolve();await tick();h.session.dispose();
});
function navigationEffect(h:Awaited<ReturnType<typeof harness>>,view:ReturnType<typeof buildPersistence>,interrupt:()=>Promise<void>,surface:'build'|'map'){
 const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const start=source.indexOf('    void (async () => {',source.indexOf(surface==='build'?'    if (!buildRequested) return;':'        onOpenMap={() => {'));
 const end=source.indexOf('    })();',start);assert.ok(start>=0&&end>start);
 const body=source.slice(start+'    void (async () => {'.length,end),navigated:string[]=[];let settled=0;
 const scope={builderBuildRequestRef:{current:null},persistGeneratedTrip:async()=>{const result=await view.persist();assert.ok(result);await interrupt();return result},
  hydratedOwnerScopeRef:{current:h.session.getSnapshot().browserOwnerId},activeBrowserOwnerIdRef:{current:h.session.getSnapshot().browserOwnerId},
  canUseHydratedTripScope:()=>true,canOpenBuiltTrip:view.canOpen,session:null,window:{location:{assign:(path:string)=>navigated.push(path)}},
  firstTripWorkspaceHref:(id:string)=>'/trip/'+id,mapWorkspaceHref:(id:string)=>'/map/'+id,tripSyncSignInPath:(id:string)=>'/sign-in/'+id,settleUnacknowledgedBuild(){settled++}};
 return {run:()=>new Function('scope',`with(scope){return (async()=>{${ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}})();}`)(scope),navigated,get settled(){return settled}};
}
for(const surface of ['build','map'] as const)for(const interruption of ['none','failed','held','new-raw','owner','unmount'] as const)test(`actual ${surface} navigation rechecks ${interruption} after the async persistence return`,async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});await accept(h,origin);
 const view=buildPersistence(h);let held:ReturnType<typeof h.holdRecovery>|undefined;
 const nav=navigationEffect(h,view,async()=>{
  if(interruption==='none')return;
  if(interruption==='owner'){h.rotate('owner-b');return;}
  if(interruption==='unmount'){view.mounted.current=false;return;}
  if(interruption==='new-raw'){await h.session.updateDraft({binding:{kind:'origin'},raw:'new intent after Build returned'});return;}
  await h.run(0);const work=h.projections.at(-1)!;assert.ok(work);
  if(interruption==='failed')h.failRecovery();else held=h.holdRecovery();
  work.result.resolve(response(work.request));await tick();
 },surface);
 await nav.run();assert.equal(nav.navigated.length,interruption==='none'?1:0);assert.equal(nav.settled,interruption==='none'?0:1);
 held?.resolve();await tick();h.session.dispose();
});
for(const input of ['unrelated','same-field','same-field-aba'] as const)test(`verified discard preserves only actual newer field intent: ${input}`,async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 const oldRaw='origin requested for discard';await h.session.updateDraft({binding:{kind:'origin'},raw:oldRaw});
 const gate=h.holdDraft(),discard=h.session.discardDraft({kind:'origin'});await tick();
 const raw=h.session.updateDraft({binding:input==='unrelated'?{kind:'destination-add'}:{kind:'origin'},raw:'new raw intent'});
 const back=input==='same-field-aba'?h.session.updateDraft({binding:{kind:'origin'},raw:oldRaw}):undefined;
 gate.resolve();assert.equal(await discard,true);await raw;if(back)assert.equal(await back,true);
 const state=h.session.getSnapshot();assert.equal(state.saveState,'local');
 assert.deepEqual(state.draft.fields.map(f=>({binding:f.binding,raw:f.raw})),[{binding:input==='unrelated'?{kind:'destination-add'}:{kind:'origin'},raw:input==='same-field-aba'?oldRaw:'new raw intent'}]);
 assert.deepEqual(readBuilderInputDraft(h.storage,state.trip),{kind:'readable',draft:state.draft});h.session.dispose();
});

for(const interruption of ['write-failure','owner'] as const)test(`unverified discard cannot remove input after ${interruption}`,async()=>{
 const h=await harness({initialTrip:requireReadableTripDocument({...fixture(),ownerId:null}),owner:null});
 await h.session.updateDraft({binding:{kind:'origin'},raw:'keep until verified'});const durableBefore=readBuilderInputDraft(h.storage,h.session.getSnapshot().trip);
 const gate=h.holdDraft(),discard=h.session.discardDraft({kind:'origin'});await tick();
 const newer=h.session.updateDraft({binding:{kind:'destination-add'},raw:'new unrelated raw'});
 if(interruption==='write-failure')h.failDraft();else h.rotate('owner-b');gate.resolve();
 assert.equal(await discard,false);assert.equal(await newer,false);
 assert.deepEqual(h.session.getSnapshot().draft.fields.map(f=>f.raw),['keep until verified','new unrelated raw']);
 assert.deepEqual(readBuilderInputDraft(h.storage,h.session.getSnapshot().trip),durableBefore);h.session.dispose();
});
