import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { normalizeLegacyGeneratedDayContext } from '../lib/easyt/itinerary-generated-context.ts';
import { routeProjectionInputKey } from '../lib/easyt/trip-route-intent.ts';
import { builderStructuralSnapshot } from '../lib/easyt/trip-builder-edit.ts';
import { canonicalTripForOwner, remapTripStopReferences } from '../lib/easyt/trip-promotion.ts';
import { authoredContentKey } from '../lib/easyt/trip-retained-authored-content.ts';
import { readBuilderInputDraft, writeBuilderInputDraft, builderInputDraftKey } from '../lib/easyt/trip-builder-input-draft.ts';
import { saveTripRecoveryToStorage, loadTripRecoveryFromStorage, acknowledgeTripBuildSaveInStorage,
  markTripRecoveryStateInStorage, saveTripRecoveryToEasyT, cacheCanonicalTripToStorage } from '../lib/easyt/storage.ts';
import { decideExistingTripUpdate, nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';
import type { BuilderReconciliationRequest } from '../lib/easyt/trip-builder-edit-session.ts';
import type { BuilderProjectionResponse } from '../lib/easyt/trip-builder-reconciliation.ts';

const path = '../lib/easyt/trip-builder-edit-session.ts';
const loaded = import(path).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ERR_MODULE_NOT_FOUND') return null; throw e; });
async function api(): Promise<typeof import('../lib/easyt/trip-builder-edit-session.ts')> {
  const result = await loaded; assert.ok(result, 'Task3 edit session not implemented'); return result;
}
class MemoryStorage {
  values = new Map<string, string>(); failRecovery = false; failDraft = false;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failRecovery && key.includes('trip-recovery') || this.failDraft && key.includes('builder-input')) throw new Error('disk full');
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function fixture() {
  const trip = requireReadableTripDocument(normalizeLegacyGeneratedDayContext(canonicalRouteFixture()));
  trip.brief.intent.route.projectionInputKey = routeProjectionInputKey(trip); return trip;
}
async function harness(initialTrip = fixture(), storage = new MemoryStorage(), persist?: typeof saveTripRecoveryToEasyT, scopeOwnerId = initialTrip.ownerId) {
  const timers: { callback: () => void; delay: number; active: boolean }[] = [];
  const recoveryWrites: { accountSavePending: boolean }[] = [];
  const writes: { trip: CanonicalEasyTTrip; handle: { ownerId: string | null; tripId: string; writeId: string }; result: ReturnType<typeof deferred<CanonicalEasyTTrip>> }[] = [];
  const projections: { request: BuilderReconciliationRequest; signal: AbortSignal; result: ReturnType<typeof deferred<BuilderProjectionResponse>> }[] = [];
  const recovery = loadTripRecoveryFromStorage(storage, initialTrip.id, scopeOwnerId);
  let owner = scopeOwnerId;
  const session = (await api()).createBuilderEditSession({ initialTrip, initialRecovery: recovery,
    getOwnerId: () => owner, readDraft: (trip, browserOwner) => readBuilderInputDraft(storage, trip, browserOwner),
    writeDraft: (trip, draft, browserOwner) => writeBuilderInputDraft(storage, trip, draft, browserOwner),
    saveRecovery: (trip, options) => { recoveryWrites.push({ accountSavePending: options.accountSavePending }); return saveTripRecoveryToStorage(storage, trip, options); },
    acknowledgeRecovery: (reviewed, canonical, handle) => acknowledgeTripBuildSaveInStorage(storage, reviewed, canonical, handle),
    markRecoveryState: (handle, state) => markTripRecoveryStateInStorage(storage, handle, state),
    persistAccount: async (trip, handle) => {
      const result = deferred<CanonicalEasyTTrip>(); writes.push({ trip: structuredClone(trip) as CanonicalEasyTTrip, handle, result });
      return persist ? persist(trip, handle) : result.promise;
    },
    reconcile: (request, signal) => { const result = deferred<BuilderProjectionResponse>(); projections.push({ request, signal, result }); return result.promise; },
    now: () => '2026-10-07T00:00:00.000Z',
    schedule: (callback, delay) => { const timer = { callback, delay, active: true }; timers.push(timer); return () => { timer.active = false; }; },
  });
  return { session, storage, writes, recoveryWrites, projections, rotate: (value: string | null) => { owner = value; },
    run: async (delay: number) => { for (const timer of [...timers]) if (timer.active && timer.delay === delay) { timer.active = false; timer.callback(); } await tick(); },
    recovery: () => loadTripRecoveryFromStorage(storage, initialTrip.id, scopeOwnerId),
    ack: async (index: number) => { const write = writes[index]!; write.result.resolve({ ...write.trip, updatedAt: nextTripUpdatedAt(write.trip.updatedAt) }); await tick(); },
  };
}
const budget = { kind: 'budget', budget: 'high' } as const;
const origin = { kind: 'origin', place: { name: 'Paris', canonicalPlaceId: 'place:paris', country: 'France', coordinates: [2.35, 48.85] as [number, number] } } as const;
function accept(h: Awaited<ReturnType<typeof harness>>, edit = budget as Parameters<typeof h.session.accept>[0]) {
  const result = h.session.accept(edit, h.session.getSnapshot().inputRevision); assert.ok(result.ok); return h.session.getSnapshot();
}
function response(request: BuilderReconciliationRequest, phase: 'complete' | 'failed' = 'failed', selected = request.dispatched): BuilderProjectionResponse {
  return { scope: request.scope, inputKey: request.inputKey, requestId: request.requestId, dispatched: request.dispatched,
    results: selected.map(unit => ({ ...unit, phase, ...(phase === 'failed' ? { reason: 'unavailable' as const } : {}) })),
    legs: request.trip.legs.filter(leg => selected.some(unit => unit.kind === 'leg' && unit.targetId === leg.id)) };
}

test('accepted_edit_is_device_durable_before_debounce', async () => {
  const h = await harness(); const state = accept(h);
  assert.deepEqual(h.recovery()?.trip, state.trip); assert.equal(h.writes.length, 0); assert.equal(state.saveState, 'local');
  await h.run(450); assert.equal(h.writes.length, 1); h.session.dispose();
});
test('A_ack_does_not_replace_B_or_retire_B_recovery', async () => {
  const h = await harness(); accept(h); await h.run(450);
  const b = accept(h, { kind: 'travellers', travellers: 3 }); const handle = h.recovery()!.writeId;
  await h.ack(0); assert.equal(h.session.getSnapshot().trip.travellers, 3);
  assert.equal(h.recovery()!.writeId, handle); assert.notEqual(h.session.getSnapshot().saveState, 'cloud');
  assert.equal(h.session.getSnapshot().acceptedRevision, b.acceptedRevision); h.session.dispose();
});
test('latest_coalesced_B_uses_A_acknowledged_CAS_ancestry', async () => {
  const h = await harness(); accept(h); await h.run(450);
  accept(h, { kind: 'travellers', travellers: 3 }); accept(h, { kind: 'travellers', travellers: 4 });
  await h.run(450); assert.equal(h.writes.length, 1); await h.ack(0);
  assert.equal(h.writes.length, 2); assert.notEqual(h.writes[1]!.trip.updatedAt, fixture().updatedAt);
  assert.equal(h.writes[1]!.trip.travellers, 4); await h.ack(1);
  assert.equal(h.recovery(), null); assert.equal(h.session.getSnapshot().saveState, 'cloud'); h.session.dispose();
});
test('edit_then_undo_while_A_in_flight_saves_the_inverse', async () => {
  const h = await harness(); const before = builderStructuralSnapshot(h.session.getSnapshot().trip);
  accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' }); await h.run(450);
  accept(h, { kind: 'structural-inverse', snapshot: before }); await h.run(450); await h.ack(0);
  assert.deepEqual(h.writes[1]!.trip.stops.map(s => s.id), fixture().stops.map(s => s.id));
  await h.ack(1); assert.equal(h.session.getSnapshot().saveState, 'cloud'); h.session.dispose();
});
test('owner_rotation_discards_old_feedback_and_projection_response', async () => {
  const h = await harness(); accept(h, origin); await h.run(0); await h.run(450);
  const before = h.session.getSnapshot(); h.rotate('other-owner'); await h.ack(0);
  h.projections[0]!.result.resolve(response(h.projections[0]!.request)); await tick();
  assert.deepEqual(h.session.getSnapshot().trip, before.trip); assert.ok(h.recovery());
  assert.equal(await h.session.flush(), false); h.session.dispose();
});
test('failed_storage_keeps_draft_and_last_valid_trip', async () => {
  const h = await harness(); h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Par' });
  const before = h.session.getSnapshot().trip; h.storage.failRecovery = true;
  assert.equal(h.session.accept(origin, h.session.getSnapshot().inputRevision).ok, false);
  assert.deepEqual(h.session.getSnapshot().trip, before); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, 'Par');
  assert.equal(h.session.getSnapshot().saveState, 'error'); await h.run(450); assert.equal(h.writes.length, 0); h.session.dispose();
});
test('retry_keeps_exact_trip_owner_and_write', async () => {
  const h = await harness(); accept(h); await h.run(450); const handle = h.writes[0]!.handle;
  h.writes[0]!.result.reject(new TypeError('offline')); await tick();
  assert.equal(h.recovery()?.state, 'network'); await h.run(450); assert.equal(h.writes.length, 1);
  h.session.retrySave(); await tick(); assert.equal(h.writes.length, 2); assert.deepEqual(h.writes[1]!.handle, handle);
  assert.deepEqual(h.writes[1]!.trip, h.writes[0]!.trip); await h.ack(1); assert.equal(h.session.getSnapshot().saveState, 'cloud'); h.session.dispose();
});
test('build_flush_uses_one_writer_for_latest_revision', async () => {
  const h = await harness(); accept(h); const first = h.session.flush(); const second = h.session.flush(); await tick();
  assert.equal(h.writes.length, 1); await h.ack(0); assert.equal(await first, true); assert.equal(await second, true);
  await h.run(450); assert.equal(h.writes.length, 1); h.session.dispose();
});
test('interrupted_projection_resumes_after_reload_without_update_route', async () => {
  const h = await harness(); accept(h, origin); const saved = h.recovery()!.trip; h.session.dispose();
  const reloaded = await harness(requireReadableTripDocument(saved), h.storage); await reloaded.run(0);
  assert.equal(reloaded.projections.length, 1); assert.ok(reloaded.projections[0]!.request.dispatched.every(u => u.phase === 'pending'));
  assert.equal(reloaded.session.getSnapshot().trip.updatedAt, saved.updatedAt); reloaded.session.dispose();
});
test('partial_typing_during_reconciliation_preserves_draft_and_resumes_same_canonical_key', async () => {
  const h = await harness(); accept(h, origin); await h.run(0); const first = h.projections[0]!;
  h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Lis' });
  first.result.resolve(response(first.request)); await tick(); assert.equal(h.session.getSnapshot().failedUnits.length, 0);
  await h.run(0); const second = h.projections[1]!;
  assert.equal(second.request.inputKey, first.request.inputKey); assert.notEqual(second.request.scope.inputRevision, first.request.scope.inputRevision);
  second.result.resolve(response(second.request)); await tick(); assert.ok(h.session.getSnapshot().failedUnits.length);
  await h.run(450); await h.ack(0); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, 'Lis');
  assert.equal(h.session.getSnapshot().canonicalSaveState, 'cloud'); assert.equal(h.session.getSnapshot().saveState, 'local'); h.session.dispose();
});
test('two_current_v2_sessions_same_ancestor_one_wins_loser_preserves_local_truth', async () => {
  let cloud = fixture(); let requests = 0;
  const persist: typeof saveTripRecoveryToEasyT = (trip, handle) => saveTripRecoveryToEasyT(trip, handle, async (_url, init) => {
    requests++; const incoming = JSON.parse(String(init?.body));
    const decision = decideExistingTripUpdate(cloud.ownerId!, incoming, cloud);
    if (decision.outcome === 'conflict') return new Response(JSON.stringify({ category: 'conflict', trip: cloud, conflictReason: decision.conflictReason }), { status: 409 });
    assert.equal(decision.outcome, 'save'); cloud = { ...incoming, updatedAt: nextTripUpdatedAt(cloud.updatedAt) };
    return new Response(JSON.stringify({ trip: cloud }), { status: 200 });
  });
  const a = await harness(cloud, new MemoryStorage(), persist); const b = await harness(cloud, new MemoryStorage(), persist);
  accept(a); assert.equal(await a.session.flush(), true);
  b.session.updateDraft({ binding: { kind: 'origin' }, raw: 'exact raw bytes  ' }); accept(b, { kind: 'travellers', travellers: 4 });
  const local = b.session.getSnapshot().trip; const handle = b.recovery()!.writeId;
  assert.equal(await b.session.flush(), false); assert.deepEqual(b.session.getSnapshot().trip, local);
  assert.equal(b.session.getSnapshot().error?.category, 'conflict'); assert.equal(b.recovery()!.writeId, handle); assert.equal(b.recovery()!.state, 'conflict');
  const beforeRequests = requests; b.session.retrySave(); await b.run(450); await tick(); assert.equal(requests, beforeRequests);
  assert.equal(cloud.travellers, 2); assert.equal(b.session.getSnapshot().draft.fields[0]!.raw, 'exact raw bytes  ');
  b.session.dispose(); const reload = await harness(requireReadableTripDocument(b.recovery()!.trip), b.storage, persist);
  assert.equal(reload.session.getSnapshot().saveState, 'error'); await reload.run(450); assert.equal(requests, beforeRequests);
  assert.deepEqual(reload.session.getSnapshot().trip, local); assert.equal(reload.session.getSnapshot().draft.fields[0]!.raw, 'exact raw bytes  ');
  a.session.dispose(); reload.session.dispose();
});
test('canonical_recovery_success_then_draft_failure_retains_both_truths_for_reload', async () => {
  const h = await harness(); h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Par' });
  const bytes = h.storage.getItem(builderInputDraftKey(fixture().ownerId, fixture().id)); h.storage.failDraft = true;
  accept(h, origin); assert.ok(h.recovery()); assert.equal(h.session.getSnapshot().saveState, 'error');
  assert.equal(h.storage.getItem(builderInputDraftKey(fixture().ownerId, fixture().id)), bytes);
  h.session.dispose(); const reload = await harness(requireReadableTripDocument(h.recovery()!.trip), h.storage);
  assert.equal(reload.session.getSnapshot().draft.fields[0]!.raw, 'Par'); assert.equal(reload.session.getSnapshot().draft.fields[0]!.status, 'binding-conflict'); reload.session.dispose();
});
test('hydration_is_read_only_and_protected_envelope_is_never_overwritten', async () => {
  const storage = new MemoryStorage(); const trip = fixture(); const key = builderInputDraftKey(trip.ownerId, trip.id);
  storage.setItem(key, '{"version":99,"precious":"bytes"}'); cacheCanonicalTripToStorage(storage, trip);
  const before = new Map(storage.values); const h = await harness(trip, storage);
  assert.deepEqual(storage.values, before); assert.equal(h.session.accept(budget, 0).ok, false);
  assert.deepEqual(storage.values, before); h.session.dispose();
});
test('saved_input_pending_projection_and_completed_projection_cloud_pending_are_independent', async () => {
  const h = await harness(); accept(h); await h.run(450); await h.ack(0);
  assert.equal(h.session.getSnapshot().saveState, 'cloud'); assert.equal(h.session.getSnapshot().projectionState, 'pending');
  await h.run(0); const work = h.projections[0]!; work.result.resolve(response(work.request, 'complete')); await tick();
  assert.equal(h.session.getSnapshot().projectionState, 'current'); assert.equal(h.session.getSnapshot().saveState, 'local');
  assert.ok(h.recovery()); h.session.dispose();
});
test('coalesced_intermediate_edit_then_inverse_retains_the_submitted_predecessor_proof', async () => {
  const h = await harness(); const before = builderStructuralSnapshot(h.session.getSnapshot().trip);
  accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' }); await h.run(450);
  accept(h, { kind: 'travellers', travellers: 4 }); accept(h, { kind: 'structural-inverse', snapshot: before });
  await h.run(450); await h.ack(0);
  assert.deepEqual(h.writes[1]!.trip.stops.map(s => s.id), fixture().stops.map(s => s.id));
  assert.equal(h.writes[1]!.trip.travellers, 4); await h.ack(1); assert.equal(h.session.getSnapshot().saveState, 'cloud'); h.session.dispose();
});
test('guest_flush_requires_device_durability_and_never_submits_an_account_write', async () => {
  const trip = fixture(); trip.ownerId = null; const h = await harness(trip); accept(h);
  assert.equal(await h.session.flush(), true); assert.equal(h.writes.length, 0); assert.ok(h.recovery()); h.session.dispose();
});
test('mixed_gateway_A_recommendation_B_and_raw_drafts_survive_exact_ACK_and_reload', async () => {
  const h = await harness(); accept(h, origin); await h.run(0); const a = h.projections[0]!;
  accept(h); h.session.updateDraft({ binding: { kind: 'origin' }, raw: '  unfinished origin ' });
  h.session.updateDraft({ binding: { kind: 'nights', intentId: 'intent:kyoto', stopId: 'kyoto' }, raw: '3.' });
  a.result.resolve(response(a.request)); await tick(); assert.equal(h.session.getSnapshot().failedUnits.length, 0);
  await h.run(0); const b = h.projections[1]!;
  const bRecommendations = b.request.dispatched.filter(u => u.kind === 'recommendation'); assert.ok(bRecommendations.length);
  b.result.resolve(response(b.request, 'complete', bRecommendations)); await tick();
  assert.ok(h.session.getSnapshot().pendingUnits.some(u => u.kind === 'leg'));
  assert.equal(h.session.getSnapshot().pendingUnits.some(u => u.kind === 'recommendation'), false);
  await h.run(0); const remaining = h.projections[2]!;
  assert.ok(remaining.request.dispatched.every(u => u.kind !== 'recommendation'));
  remaining.result.resolve(response(remaining.request)); await tick();
  assert.ok(h.session.getSnapshot().failedUnits.some(u => u.kind === 'leg'));
  await h.run(450); await h.ack(0); const saved = h.session.getSnapshot();
  assert.equal(saved.canonicalSaveState, 'cloud'); assert.equal(saved.saveState, 'local');
  assert.equal(saved.draft.fields[0]!.raw, '  unfinished origin '); assert.equal(saved.draft.fields[1]!.raw, '3.');
  h.session.dispose(); const reloaded = await harness(saved.trip, h.storage); await reloaded.run(0);
  assert.equal(reloaded.projections.length, 0); assert.deepEqual(reloaded.session.getSnapshot().failedUnits, saved.failedUnits);
  assert.deepEqual(reloaded.session.getSnapshot().draft, saved.draft); reloaded.session.dispose();
});
test('removed_occurrence_blocks_raw_nights_without_rebinding_them_to_a_sibling', async () => {
  const h = await harness(); h.session.updateDraft({ binding: { kind: 'nights', intentId: 'intent:hiroshima', stopId: 'hiroshima' }, raw: '2.' });
  accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' }); await h.run(450); await h.ack(0);
  const field = h.session.getSnapshot().draft.fields[0]!; assert.equal(field.status, 'binding-conflict'); assert.equal(field.raw, '2.');
  assert.deepEqual(field.binding, { kind: 'nights', intentId: 'intent:hiroshima', stopId: 'hiroshima' }); h.session.dispose();
});
test('stale_envelope_writer_is_rejected_and_only_exact_deliberately_accepted_raw_field_is_consumed', async () => {
  const h = await harness(); h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Paris' });
  const stale = h.session.getSnapshot().draft;
  h.session.updateDraft({ binding: { kind: 'nights', intentId: 'intent:kyoto', stopId: 'kyoto' }, raw: '3.' });
  const revision = h.session.getSnapshot().inputRevision;
  assert.ok(h.session.accept(origin, revision, { binding: { kind: 'origin' }, raw: 'Paris' }).ok);
  assert.equal(h.session.getSnapshot().draft.fields.length, 1); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, '3.');
  assert.deepEqual(writeBuilderInputDraft(h.storage, h.session.getSnapshot().trip, stale), { ok: false, reason: 'stale' }); h.session.dispose();
});
test('projection_and_later_edits_cannot_clear_a_durable_conflict_or_auth_pause', async () => {
  for (const category of ['conflict', 'auth'] as const) {
    const h = await harness(); accept(h); await h.run(450);
    h.writes[0]!.result.reject(Object.assign(new Error(category), { name: category === 'conflict' ? 'EasyTTripSaveConflictError' : 'EasyTTripAuthError' }));
    await tick(); accept(h, { kind: 'travellers', travellers: 4 }); await h.run(0);
    const work = h.projections[0]!; work.result.resolve(response(work.request)); await tick();
    assert.equal(h.recovery()!.state, category); await h.run(450); assert.equal(h.writes.length, 1);
    h.session.dispose(); const reload = await harness(requireReadableTripDocument(h.recovery()!.trip), h.storage);
    assert.equal(reload.session.getSnapshot().error?.category, category); await reload.run(450); assert.equal(reload.writes.length, 0); reload.session.dispose();
  }
});
test('A_in_flight_then_B_subset_completion_ACK_retains_A_marker_and_unaccepted_bytes', async () => {
  const h = await harness(); accept(h, origin); await h.run(450); accept(h);
  h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Lon' }); await h.run(0);
  const work = h.projections[0]!; const selected = work.request.dispatched.filter(unit => unit.kind === 'recommendation');
  work.result.resolve(response(work.request, 'complete', selected)); await tick(); await h.run(450); await h.ack(0);
  assert.equal(h.writes.length, 2); assert.ok(h.writes[1]!.trip.brief.cascadeStatus!.routeReconciliation!.residual.some(u => u.kind === 'leg'));
  assert.equal(h.writes[1]!.trip.brief.cascadeStatus!.routeReconciliation!.residual.some(u => u.kind === 'recommendation'), false);
  await h.ack(1); assert.ok(h.session.getSnapshot().pendingUnits.some(u => u.kind === 'leg'));
  assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, 'Lon'); assert.equal(h.session.getSnapshot().saveState, 'local'); h.session.dispose();
});
test('session_forwards_owned_retained_consumption_through_first_device_write', async () => {
  const h = await harness(); accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' });
  const entry = h.session.getSnapshot().trip.brief.retainedAuthoredContent!.entries[0]!;
  assert.ok(entry.days.length);
  const selection = { entryId: entry.id, expectedContentKey: authoredContentKey(entry),
    dayIds: entry.days.map(day => day.sourceDay.id), ideaIds: entry.itineraryIdeas.map(idea => idea.id), pinIds: entry.mapPins.map(pin => pin.id) };
  accept(h, { kind: 'retained-content-remove', selection });
  assert.equal(h.session.getSnapshot().trip.brief.retainedAuthoredContent?.entries.length ?? 0, 0);
  assert.equal(h.recovery()!.trip.brief.retainedAuthoredContent?.entries.length ?? 0, 0); h.session.dispose();
});
test('flush_in_flight_with_new_edit_waits_for_latest_revision_and_dispose_cancels_feedback', async () => {
  const h = await harness(); accept(h); const flush = h.session.flush(); await tick();
  accept(h, { kind: 'travellers', travellers: 5 }); await h.ack(0); assert.equal(h.writes.length, 2);
  let notified = 0; const unsubscribe = h.session.subscribe(() => { notified++; });
  const before = h.session.getSnapshot(); h.session.dispose(); await h.ack(1);
  assert.equal(await flush, false); assert.equal(notified, 0); assert.deepEqual(h.session.getSnapshot(), before);
  assert.ok(h.recovery()); unsubscribe();
});
test('observer_snapshots_are_stable_immutable_and_stale_acceptance_cannot_write', async () => {
  const h = await harness(); const before = h.session.getSnapshot(); assert.equal(before, h.session.getSnapshot());
  assert.throws(() => { before.trip.stops.pop(); }, TypeError);
  h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Par' });
  assert.deepEqual(h.session.accept(origin, before.inputRevision), { ok: false, reason: 'stale-source' }); assert.equal(h.recovery(), null); h.session.dispose();
});
test('hydrated_account_recovery_never_acquires_current_write_ownership_by_reading_it', async () => {
  const h = await harness(); accept(h); const trip = requireReadableTripDocument(h.recovery()!.trip); h.session.dispose();
  const reload = await harness(trip, h.storage); await reload.run(450);
  assert.equal(reload.writes.length, 0); assert.equal(reload.session.getSnapshot().historicalRecovery, true);
  assert.equal(reload.session.retrySave(), false); assert.equal(await reload.session.flush(), false);
  assert.ok(reload.recovery()); reload.session.dispose();
});
test('typing_and_disposal_abort_scoped_provider_work_without_applying_its_response', async () => {
  const h = await harness(); accept(h, origin); await h.run(0); const first = h.projections[0]!;
  assert.equal(first.signal?.aborted, false); h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Lon' });
  assert.equal(first.signal.aborted, true); await h.run(0); const second = h.projections[1]!;
  assert.equal(second.signal.aborted, false); h.session.dispose(); assert.equal(second.signal.aborted, true);
});
test('retry_after_predecessor_ACK_preserves_rebased_CAS_and_acknowledges_exact_local_revision', async () => {
  const h = await harness(); accept(h); await h.run(450); accept(h, { kind: 'travellers', travellers: 5 });
  await h.run(450); await h.ack(0); const submitted = h.writes[1]!;
  h.writes[1]!.result.reject(new TypeError('offline')); await tick(); assert.ok(h.recovery());
  assert.equal(h.session.retrySave(), true); await tick(); assert.deepEqual(h.writes[2]!.trip, submitted.trip);
  assert.deepEqual(h.writes[2]!.handle, submitted.handle); await h.ack(2);
  assert.equal(h.session.getSnapshot().saveState, 'cloud'); assert.equal(h.recovery(), null); h.session.dispose();
});
test('acknowledged_A_then_B_network_failure_and_new_C_retries_with_proven_ancestry', async () => {
  const h = await harness(); accept(h); await h.run(450);
  accept(h, { kind: 'travellers', travellers: 3 }); await h.run(450); await h.ack(0);
  const cloudA = { ...h.writes[0]!.trip, updatedAt: h.writes[1]!.trip.updatedAt };
  h.writes[1]!.result.reject(new TypeError('offline')); await tick();
  h.session.updateDraft({ binding: { kind: 'origin' }, raw: '  unfinished origin ' });
  h.session.updateDraft({ binding: { kind: 'nights', intentId: 'intent:kyoto', stopId: 'kyoto' }, raw: '3.' });
  const c = accept(h, { kind: 'travellers', travellers: 5 }); const cRecovery = h.recovery()!;
  assert.equal(h.session.retrySave(), true); await tick(); const retry = h.writes[2]!;
  assert.equal(retry.trip.updatedAt, cloudA.updatedAt);
  assert.deepEqual(decideExistingTripUpdate(cloudA.ownerId!, retry.trip, cloudA), { outcome: 'save' });
  assert.equal(retry.trip.travellers, 5); assert.equal(retry.trip.brief.budgetBand, 'high');
  assert.equal(retry.handle.writeId, cRecovery.writeId); assert.deepEqual(h.recovery()!.trip, c.trip);
  assert.deepEqual(h.session.getSnapshot().trip, c.trip); assert.deepEqual(h.session.getSnapshot().draft, c.draft);
  await h.ack(2); assert.equal(h.recovery(), null); assert.equal(h.session.getSnapshot().canonicalSaveState, 'cloud');
  assert.equal(h.session.getSnapshot().saveState, 'local'); assert.equal(h.session.getSnapshot().error, null);
  assert.deepEqual(h.session.getSnapshot().draft, c.draft); h.session.dispose();
});
test('newer_structural_inverse_after_rebased_network_failure_keeps_authoritative_route_and_C_handle', async () => {
  const h = await harness(); const before = builderStructuralSnapshot(h.session.getSnapshot().trip);
  accept(h, { kind: 'remove-destination', intentId: 'intent:hiroshima' }); await h.run(450);
  accept(h, { kind: 'travellers', travellers: 3 }); await h.run(450); await h.ack(0);
  const cloudA = { ...h.writes[0]!.trip, updatedAt: h.writes[1]!.trip.updatedAt };
  h.writes[1]!.result.reject(new TypeError('offline')); await tick();
  const c = accept(h, { kind: 'structural-inverse', snapshot: before }); const handle = h.recovery()!.writeId;
  assert.equal(h.session.retrySave(), true); await tick(); const retry = h.writes[2]!;
  assert.deepEqual(decideExistingTripUpdate(cloudA.ownerId!, retry.trip, cloudA), { outcome: 'save' });
  assert.equal(retry.trip.updatedAt, cloudA.updatedAt); assert.equal(retry.handle.writeId, handle);
  assert.deepEqual(retry.trip.brief.intent.route, c.trip.brief.intent.route);
  assert.deepEqual(retry.trip.stops, c.trip.stops); assert.equal(retry.trip.travellers, 3);
  assert.deepEqual(retry.trip.brief.nightAllocations, c.trip.brief.nightAllocations);
  assert.equal(retry.trip.brief.retainedAuthoredContent?.entries.length ?? 0, 0);
  await h.ack(2); assert.equal(h.recovery(), null); assert.equal(h.session.getSnapshot().saveState, 'cloud'); h.session.dispose();
});
test('lost_B_success_still_conflicts_on_new_C_retry_and_preserves_exact_C_recovery', async () => {
  const h = await harness(); accept(h); await h.run(450);
  accept(h, { kind: 'travellers', travellers: 3 }); await h.run(450); await h.ack(0);
  const cloudB = { ...h.writes[1]!.trip, updatedAt: nextTripUpdatedAt(h.writes[1]!.trip.updatedAt) };
  h.writes[1]!.result.reject(new TypeError('B response was lost')); await tick();
  h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'exact raw C  ' });
  const c = accept(h, { kind: 'travellers', travellers: 5 }); const handle = h.recovery()!.writeId;
  assert.equal(h.session.retrySave(), true); await tick(); const retry = h.writes[2]!;
  let decodedConflict: unknown;
  try {
    await saveTripRecoveryToEasyT(retry.trip, retry.handle, async (_url, init) => {
      const decision = decideExistingTripUpdate(cloudB.ownerId!, JSON.parse(String(init?.body)), cloudB);
      assert.equal(decision.outcome, 'conflict');
      return new Response(JSON.stringify({ category: 'conflict', trip: cloudB, conflictReason: 'cloud-changed' }), { status: 409 });
    });
  } catch (cause) { decodedConflict = cause; }
  assert.ok(decodedConflict instanceof Error); assert.equal(decodedConflict.name, 'EasyTTripSaveConflictError');
  retry.result.reject(decodedConflict); await tick();
  assert.equal(h.session.getSnapshot().error?.category, 'conflict'); assert.equal(h.session.getSnapshot().saveState, 'error');
  assert.deepEqual(h.session.getSnapshot().trip, c.trip); assert.deepEqual(h.session.getSnapshot().draft, c.draft);
  assert.equal(h.recovery()!.writeId, handle); assert.deepEqual(h.recovery()!.trip, c.trip);
  assert.equal(h.session.retrySave(), false); await h.run(450); assert.equal(h.writes.length, 3); h.session.dispose();
});
test('details_commands_validate_as_one_device_acceptance_and_preserve_unrelated_raw_fields', async () => {
  const h = await harness(); h.session.updateDraft({ binding: { kind: 'origin' }, raw: 'Paris' });
  h.session.updateDraft({ binding: { kind: 'nights', intentId: 'intent:kyoto', stopId: 'kyoto' }, raw: '3.' });
  const revision = h.session.getSnapshot().inputRevision;
  assert.ok(h.session.acceptBatch([origin, { kind: 'dates', startDate: '2026-10-11', endDate: '2026-10-20' }, { kind: 'travellers', travellers: 4 }], revision,
    [{ binding: { kind: 'origin' }, raw: 'Paris' }]).ok);
  assert.equal(h.session.getSnapshot().trip.travellers, 4); assert.equal(h.session.getSnapshot().trip.startDate, '2026-10-11');
  assert.equal([...h.storage.values.keys()].filter(key => key.startsWith('easyt:trip-recovery:v2:')).length, 1);
  assert.equal(h.session.getSnapshot().draft.fields.length, 1); assert.equal(h.session.getSnapshot().draft.fields[0]!.raw, '3.');
  assert.deepEqual(h.recovery()!.trip, h.session.getSnapshot().trip); await h.run(450); assert.equal(h.writes.length, 1); h.session.dispose();
});
test('invalid_later_details_command_cannot_partially_accept_an_earlier_origin_or_date', async () => {
  const h = await harness(); const before = h.session.getSnapshot();
  assert.equal(h.session.acceptBatch([origin, { kind: 'travellers', travellers: 0 }], before.inputRevision).ok, false);
  assert.deepEqual(h.session.getSnapshot().trip, before.trip); assert.equal(h.recovery(), null); await h.run(450); assert.equal(h.writes.length, 0); h.session.dispose();
});
async function ownerlessHarness(persist?: typeof saveTripRecoveryToEasyT, source = fixture()) {
  const trip = structuredClone(source); trip.ownerId = null; trip.status = 'draft';
  const storage = new MemoryStorage(); assert.ok(saveTripRecoveryToStorage(storage, trip, {ownerId:'owner-a'}).stored);
  return harness(trip,storage,persist,'owner-a');
}
test('account_scoped_ownerless_recovery_and_login_do_not_promote_or_assign_owner', async () => {
  const h = await ownerlessHarness();
  assert.equal(h.session.getSnapshot().browserOwnerId,'owner-a'); assert.equal(h.session.getSnapshot().trip.ownerId,null);
  accept(h,budget); assert.equal(h.recovery()!.ownerId,'owner-a'); assert.equal(h.recovery()!.trip.ownerId,null);
  assert.equal(h.session.updateDraft({binding:{kind:'origin'},raw:'Lon'}),true);
  await h.run(450); assert.equal(h.writes.length,0); assert.equal(await h.session.flush(),false);
  h.rotate('owner-b'); assert.equal(h.session.updateDraft({binding:{kind:'origin'},raw:'Foreign'}),false); h.session.dispose();
});
test('recovery_scope_alone_never_registers_current_account_save_ownership', async () => {
  const ownerless = await ownerlessHarness(); accept(ownerless,budget);
  assert.equal(ownerless.recoveryWrites.at(-1)!.accountSavePending,false);
  const saving = ownerless.session.flush({promoteOwnerless:true}); await tick();
  accept(ownerless,{kind:'travellers',travellers:3});
  assert.equal(ownerless.recoveryWrites.at(-1)!.accountSavePending,true);
  ownerless.session.dispose(); await ownerless.ack(0); assert.equal(await saving,false);
  const current = await harness(); accept(current,budget);
  assert.equal(current.recoveryWrites.at(-1)!.accountSavePending,true); current.session.dispose();
  const historical = await harness(requireReadableTripDocument(current.recovery()!.trip),current.storage);
  accept(historical,{kind:'travellers',travellers:4});
  assert.equal(historical.recoveryWrites.at(-1)!.accountSavePending,false);
  await historical.run(450); assert.equal(historical.writes.length,0); historical.session.dispose();
});
test('explicit_promotion_ACK_remaps_exact_raw_and_newer_Undo_without_installing_old_content', async () => {
  const h = await ownerlessHarness(); accept(h,budget);
  const saving = h.session.flush({promoteOwnerless:true}); await tick(); assert.equal(h.writes.length,1);
  const snapshot = builderStructuralSnapshot(h.session.getSnapshot().trip);
  accept(h,{kind:'remove-destination',intentId:'intent:hiroshima'});
  accept(h,{kind:'structural-inverse',snapshot}); accept(h,{kind:'travellers',travellers:4});
  assert.equal(h.session.updateDraft({binding:{kind:'nights',intentId:'intent:kyoto',stopId:'kyoto'},raw:'3.'}),true);
  await h.run(0); const oldWork = h.projections.at(-1)!;
  const first = h.writes[0]!; first.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',first.trip,nextTripUpdatedAt(first.trip.updatedAt))));
  await tick(); assert.equal(h.session.getSnapshot().trip.travellers,4);
  assert.equal(h.session.getSnapshot().trip.ownerId,'owner-a'); assert.equal(h.session.getSnapshot().saveState,'cloud-saving');
  assert.equal(h.writes.length,2); assert.equal(h.writes[1]!.trip.ownerId,'owner-a');
  const raw = h.session.getSnapshot().draft.fields[0]!; assert.equal(raw.raw,'3.'); assert.equal(raw.status,'editable');
  assert.equal(raw.binding.kind,'nights'); assert.equal(raw.binding.kind==='nights' && raw.binding.stopId,'batch14-trip-stop-kyoto');
  const before = h.session.getSnapshot(); oldWork.result.resolve(response(oldWork.request)); await tick();
  assert.equal(h.session.getSnapshot().acceptedRevision,before.acceptedRevision);
  assert.equal(oldWork.signal.aborted,true); await h.ack(1); assert.equal(await saving,true);
  assert.equal(h.recovery(),null); assert.equal(h.session.getSnapshot().saveState,'local','unaccepted raw is device-only');
  const reload = await harness(h.session.getSnapshot().trip,h.storage);
  assert.equal(reload.session.getSnapshot().draft.fields[0]!.status,'editable'); assert.equal(reload.session.getSnapshot().draft.fields[0]!.raw,'3.');
  reload.session.dispose(); h.session.dispose();
});
test('promotion_lost_response_retries_exact_insert_before_rebasing_newer_edit', async () => {
  const h = await ownerlessHarness(); accept(h,budget);
  const saving = h.session.flush({promoteOwnerless:true}); await tick(); const submitted = h.writes[0]!;
  accept(h,{kind:'travellers',travellers:4}); submitted.result.reject(new Error('lost response')); await tick(); assert.equal(await saving,false);
  assert.equal(h.session.retrySave(),true); await tick(); assert.deepEqual(h.writes[1]!.trip,submitted.trip);
  h.writes[1]!.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',submitted.trip,nextTripUpdatedAt(submitted.trip.updatedAt))));
  await tick(); await h.run(450); assert.equal(h.writes[2]!.trip.travellers,4); assert.equal(h.writes[2]!.trip.ownerId,'owner-a');
  await h.ack(2); assert.equal(h.recovery(),null); h.session.dispose();
});
test('actual_promotion_HTTP_auth_conflict_validation_keep_exact_device_recovery_and_pause', async () => {
  for (const [status,category] of [[401,'auth'],[409,'conflict'],[422,'validation'],[200,'validation']] as const) {
    const h = await ownerlessHarness((trip,handle) => saveTripRecoveryToEasyT(trip,handle,async (_url,init) => {
      const body = JSON.parse(String(init?.body)); assert.equal(body.ownerId,null);
      return new Response(JSON.stringify(status===409 ? {trip:canonicalTripForOwner('owner-a',trip),conflictReason:'cloud-different'} : {category,error:category}),{status});
    }));
    accept(h,budget); const before = h.session.getSnapshot();
    assert.equal(await h.session.flush({promoteOwnerless:true}),false);
    assert.equal(h.session.getSnapshot().error?.category,category);
    assert.deepEqual(h.session.getSnapshot().trip,before.trip); assert.equal(h.recovery()!.writeId,before.recovery!.writeId);
    assert.equal(h.recovery()!.state,category); assert.equal(h.session.retrySave(),false); h.session.dispose();
  }
});
test('promotion_ACK_after_owner_rotation_cannot_install_or_retire_the_old_scope', async () => {
  const h = await ownerlessHarness(); accept(h,budget); const before=h.session.getSnapshot();
  const saving=h.session.flush({promoteOwnerless:true}); await tick(); h.rotate('owner-b');
  h.writes[0]!.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',h.writes[0]!.trip)));
  await tick(); assert.equal(await saving,false); assert.equal(h.recovery()!.writeId,before.recovery!.writeId);
  assert.deepEqual(h.session.getSnapshot().trip,before.trip); h.session.dispose();
});
test('promotion_raw_or_latest_recovery_storage_failure_keeps_exact_ownerless_source_for_recovery', async () => {
  for (const failure of ['draft','recovery']) {
    const h=await ownerlessHarness(); accept(h,budget);
    const saving=h.session.flush({promoteOwnerless:true}); await tick();
    if(failure==='recovery') accept(h,{kind:'travellers',travellers:4});
    h.session.updateDraft({binding:{kind:'nights',intentId:'intent:kyoto',stopId:'kyoto'},raw:'3.'});
    const before=h.session.getSnapshot();
    if(failure==='draft') h.storage.failDraft=true; else h.storage.failRecovery=true;
    h.writes[0]!.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',h.writes[0]!.trip)));
    await tick(); assert.equal(await saving,false); assert.equal(h.session.getSnapshot().error?.category,'storage');
    assert.deepEqual(h.session.getSnapshot().trip,before.trip); assert.equal(h.recovery()!.writeId,before.recovery!.writeId);
    assert.equal(h.session.getSnapshot().draft.fields[0]!.raw,'3.');
    const stored=readBuilderInputDraft(h.storage,h.session.getSnapshot().trip,'owner-a'); assert.equal(stored.kind,'readable');
    assert.equal(stored.kind==='readable' && stored.draft.fields[0]!.status,'editable'); h.session.dispose();
  }
});
test('promotion_ACK_uses_proven_occurrence_map_when_newer_removal_changes_namespace_collisions', async () => {
  const source=requireReadableTripDocument(remapTripStopReferences(fixture(),new Map([['tokyo','batch14-trip-stop-kyoto'],['kyoto','kyoto'],['hiroshima','hiroshima']])));
  const h=await ownerlessHarness(undefined,source); accept(h,budget); const saving=h.session.flush({promoteOwnerless:true}); await tick();
  const submitted=h.writes[0]!; const canonical=requireReadableTripDocument(canonicalTripForOwner('owner-a',submitted.trip));
  const kyotoId=canonical.stops.find(stop=>stop.canonicalPlaceId==='place:kyoto')!.id;
  accept(h,{kind:'remove-destination',intentId:'intent:tokyo'});
  submitted.result.resolve(canonical); await tick();
  assert.equal(h.session.getSnapshot().trip.stops.find(stop=>stop.canonicalPlaceId==='place:kyoto')!.id,kyotoId);
  await h.ack(1); assert.equal(await saving,true); h.session.dispose();
});
test('Undo_captured_before_promotion_ACK_restores_historical_authored_content_after_ACK', async () => {
  const h=await ownerlessHarness(); accept(h,budget); const saving=h.session.flush({promoteOwnerless:true}); await tick();
  const snapshot=builderStructuralSnapshot(h.session.getSnapshot().trip); accept(h,{kind:'remove-destination',intentId:'intent:hiroshima'});
  h.writes[0]!.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',h.writes[0]!.trip))); await tick();
  accept(h,{kind:'structural-inverse',snapshot});
  assert.ok(h.session.getSnapshot().trip.stops.some(s=>s.id==='batch14-trip-stop-hiroshima'));
  assert.ok(h.session.getSnapshot().trip.planItems.some(s=>s.stopId==='batch14-trip-stop-hiroshima'));
  assert.equal(h.session.getSnapshot().trip.brief.retainedAuthoredContent?.entries.length ?? 0,0);
  await h.ack(1); await h.run(450); await h.ack(2); assert.equal(await saving,true); h.session.dispose();
});
test('owned_save_identity_ACK_rebases_newer_edit_and_valid_raw_using_actual_canonical_ids', async () => {
  const h=await harness(); accept(h,budget); await h.run(450); accept(h,{kind:'travellers',travellers:4});
  h.session.updateDraft({binding:{kind:'nights',intentId:'intent:kyoto',stopId:'kyoto'},raw:'3.'});
  h.writes[0]!.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',h.writes[0]!.trip))); await tick(); await h.run(450);
  assert.equal(h.writes[1]!.trip.stops[1]!.id,'batch14-trip-stop-kyoto'); assert.equal(h.writes[1]!.trip.travellers,4);
  assert.equal(h.session.getSnapshot().draft.fields[0]!.status,'editable'); await h.ack(1);
  const raw=h.session.getSnapshot().draft.fields[0]!;
  assert.equal(raw.binding.kind==='nights' && raw.binding.stopId,'batch14-trip-stop-kyoto');
  const reload=await harness(h.session.getSnapshot().trip,h.storage); assert.equal(reload.session.getSnapshot().draft.fields[0]!.status,'editable');
  reload.session.dispose(); h.session.dispose();
});
test('captured_Undo_frame_restores_a_stop_removed_before_first_promotion_without_rewriting_history', async () => {
  const h=await ownerlessHarness(); const snapshot=h.session.captureStructuralSnapshot();
  accept(h,{kind:'remove-destination',intentId:'intent:hiroshima'});
  const historical=JSON.stringify(h.session.getSnapshot().trip.brief.retainedAuthoredContent);
  const saving=h.session.flush({promoteOwnerless:true}); await tick();
  h.writes[0]!.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',h.writes[0]!.trip))); await tick(); assert.equal(await saving,true);
  assert.equal(JSON.stringify(h.session.getSnapshot().trip.brief.retainedAuthoredContent),historical);
  accept(h,{kind:'structural-inverse',snapshot});
  assert.ok(h.session.getSnapshot().trip.stops.some(stop=>stop.canonicalPlaceId==='place:hiroshima'));
  assert.equal(h.session.getSnapshot().trip.brief.retainedAuthoredContent?.entries.length ?? 0,0);
  await h.run(450); h.writes[1]!.result.resolve(requireReadableTripDocument(canonicalTripForOwner('owner-a',h.writes[1]!.trip))); await tick();
  assert.ok(h.session.getSnapshot().trip.stops.some(stop=>stop.id==='batch14-trip-stop-hiroshima'));
  assert.ok(h.session.getSnapshot().trip.planItems.some(day=>day.stopId==='batch14-trip-stop-hiroshima'));
  assert.equal(h.recovery(),null); h.session.dispose();
});
