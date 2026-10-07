import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument, readTripDocument, prepareTripDocumentForWrite } from '../lib/easyt/trip-document.ts';
import { prepareAcceptedBuilderEdit, type BuilderAcceptedEdit } from '../lib/easyt/trip-builder-edit.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { routeProjectionInputKey, routeProjectionStatus } from '../lib/easyt/trip-route-intent.ts';
import { cascadeTripSchedule } from '../lib/easyt/cascade.ts';
import { reconcileAuthoredDayState } from '../lib/easyt/trip-authored-day-state.ts';
import { reconcileItineraryIdeas } from '../lib/easyt/itinerary-ideas.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';
import { builderRecommendationProjection } from '../lib/easyt/trip-builder-recommendations.ts';
const path = '../lib/easyt/trip-builder-reconciliation.ts';
const loaded = import(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ERR_MODULE_NOT_FOUND')
        return null;
    throw error;
});
async function api(): Promise<typeof import("../lib/easyt/trip-builder-reconciliation.ts")> {
    const value = await loaded;
    assert.ok(value, 'Task2 reconciliation not implemented');
    return value;
}
function fixture() {
    const trip = requireReadableTripDocument(canonicalRouteFixture());
    trip.brief.intent.route.projectionInputKey = routeProjectionInputKey(trip);
    return trip;
}
async function accept(before: CanonicalEasyTTrip, edit: BuilderAcceptedEdit) {
    const edited = prepareAcceptedBuilderEdit(before, edit, builderDocumentFingerprint(before));
    assert.ok(edited.ok);
    const result = (await api()).prepareBuilderNecessaryProjection(before, edited.trip, edited.scope);
    assert.ok(result.ok);
    return result.trip as CanonicalEasyTTrip;
}
const origin: BuilderAcceptedEdit = { kind: 'origin', place: { name: 'Paris', canonicalPlaceId: 'place:paris', country: 'France', coordinates: [2.35, 48.85] } };
function units(trip: CanonicalEasyTTrip) {
    return trip.brief.cascadeStatus?.routeReconciliation?.residual ?? [];
}
function live(trip: CanonicalEasyTTrip) {
    const stops = new Set(trip.stops.map(s => s.id));
    const days = new Set(trip.planItems.map(d => d.id));
    assert.ok(trip.planItems.every(d => stops.has(d.stopId)));
    assert.ok((trip.brief.itineraryIdeas ?? []).every(i => stops.has(i.stopId) && (!i.dayId || days.has(i.dayId))));
    assert.ok((trip.brief.mapPins ?? []).every(p => trip.planItems.some(d => d.dayNumber === p.dayNumber)));
    assert.ok(trip.legs.every(l => [`${trip.id}-origin`, ...stops].includes(l.fromStopId) && [`${trip.id}-end`, ...stops].includes(l.toStopId)));
}
async function response(trip: CanonicalEasyTTrip, selected = units(trip), phase: 'complete' | 'failed' | 'conflict' = 'complete', requestId = 'request1') {
    const scope = { ownerId: trip.ownerId, tripId: trip.id, inputRevision: 1 };
    return (await api()).mergeBuilderProjectionResponse(trip, { scope, inputKey: routeProjectionInputKey(trip), requestId, dispatched: selected,
        results: selected.map(u => ({ ...u, phase, ...(phase === 'failed' ? { reason: 'unavailable' } : {}) })), legs: trip.legs.filter(l => selected.some(u => u.kind === 'leg' && u.targetId === l.id)),
        recommendationProjections: phase === 'complete' ? selected.filter(u => u.kind === 'recommendation').map(u => builderRecommendationProjection(trip, u.targetId, [])) : [] }, { scope, requestId, dispatched: selected });
}
test('legacy_null_key_read_does_not_schedule_or_write', async () => {
    const trip = fixture();
    trip.brief.intent.route.projectionInputKey = null;
    const before = structuredClone(trip);
    assert.deepEqual((await api()).pendingBuilderReconciliationUnits(trip), []);
    assert.deepEqual(trip, before);
});
test('accepted_legacy_edit_marker_resumes_on_device_and_cloud_reload', async () => {
    const trip = fixture();
    trip.brief.intent.route.projectionInputKey = null;
    const next = await accept(trip, origin);
    for (const copy of [prepareTripDocumentForWrite(next), requireReadableTripDocument(JSON.parse(JSON.stringify(next)))]) {
        assert.deepEqual(units(copy), units(next));
        assert.ok((await api()).pendingBuilderReconciliationUnits(copy).length);
        assert.equal(routeProjectionStatus(copy), 'pending');
    }
});
test('origin_change_updates_only_gateway_legs', async () => {
    const trip = fixture();
    const next = await accept(trip, origin);
    assert.deepEqual(next.legs.filter(l => l.fromStopId !== 'batch14-trip-origin'), trip.legs);
    assert.ok(units(next).some(u => u.kind === 'leg'));
    assert.deepEqual(next.stops.map(s => s.id), trip.stops.map(s => s.id));
});
test('presentation_rename_keeps_geometry_key', async () => {
    const trip = fixture();
    const next = await accept(trip, { kind: 'origin', place: { ...trip.brief.intent.route.origin!, name: 'London, UK' } });
    assert.equal(routeProjectionInputKey(next), routeProjectionInputKey(trip));
    assert.equal(units(next).length, 0);
});
test('origin_A_then_budget_B_completion_and_reload_retains_A_gateway_work', async () => {
    const a = await accept(fixture(), origin);
    const b = await accept(a, { kind: 'budget', budget: 'high' });
    const legsA = units(a).filter(u => u.kind === 'leg');
    assert.deepEqual(units(b).filter(u => u.kind === 'leg'), legsA);
    const selected = units(b).filter(u => u.kind === 'recommendation');
    const result = await response(b, selected);
    assert.ok(result.ok);
    const reload = requireReadableTripDocument(JSON.parse(JSON.stringify(result.trip)));
    assert.deepEqual(units(reload).filter(u => u.kind === 'leg'), legsA);
    assert.equal(reload.brief.cascadeStatus!.routeReconciliation!.inputKey, routeProjectionInputKey(b));
    assert.equal(routeProjectionStatus(reload), 'pending');
});
test('failed_gateway_A_and_pending_recommendation_B_keep_mixed_phases', async () => {
    const a = await accept(fixture(), origin);
    const leg = units(a).filter(u => u.kind === 'leg');
    const failed = await response(a, leg, 'failed');
    assert.ok(failed.ok);
    const b = await accept(failed.trip, { kind: 'budget', budget: 'high' });
    assert.equal(units(b).find(u => u.kind === 'leg')?.phase, 'failed');
    assert.ok((await api()).pendingBuilderReconciliationUnits(b).every(u => u.phase === 'pending'));
    const done = await response(b, units(b).filter(u => u.kind === 'recommendation'));
    assert.ok(done.ok);
    assert.equal(units(done.trip).find(u => u.kind === 'leg')?.phase, 'failed');
});
test('partial_completion_retires_only_exact_successful_units', async () => {
    const trip = await accept(fixture(), origin);
    const selected = units(trip).slice(0, 1);
    const result = await response(trip, selected);
    assert.ok(result.ok);
    assert.deepEqual(units(result.trip), units(trip).filter(u => !selected.includes(u)));
});
test('old_leg_response_cannot_target_a_new_pair', async () => {
    const a = await accept(fixture(), origin);
    const b = await accept(a, { kind: 'remove-destination', intentId: 'intent:tokyo' });
    const scope = { ownerId: b.ownerId, tripId: b.id, inputRevision: 2 };
    const result = (await api()).mergeBuilderProjectionResponse(b, { scope, inputKey: routeProjectionInputKey(a), requestId: 'old', dispatched: units(a), results: [], legs: a.legs }, { scope, requestId: 'new', dispatched: units(b) });
    assert.deepEqual(result, { ok: false, reason: 'stale' });
    live(b);
});
test('pending_or_failed_marker_cannot_be_cleared_by_save', async () => {
    const a = await accept(fixture(), origin);
    const result = await response(a, units(a).filter(u => u.kind === 'leg'), 'failed');
    assert.ok(result.ok);
    assert.deepEqual(units(prepareTripDocumentForWrite(result.trip)), units(result.trip));
    assert.deepEqual(units(requireReadableTripDocument(cascadeTripSchedule(result.trip).trip)), units(result.trip));
});
test('removed_stop_reconnects_neighbors_and_retains_orphan_content', async () => {
    const trip = fixture();
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    Object.assign(day, { notes: ['full', 'second'], noteDayParts: ['morning', 'evening'], contextNotes: ['context'], startsAt: '09:00', endsAt: '11:00', bookingUrl: 'https://example.com/booking', sourceUrl: 'https://example.com/source', image: 'image.jpg', latitude: 1, longitude: 2 });
    trip.brief.dayNotes = { [day.dayNumber]: ['private'] };
    trip.brief.customActivities = { [day.dayNumber]: ['custom'] };
    trip.brief.mapPins = [{ id: 'pin', title: 'pin', category: 'activity', dayNumber: day.dayNumber, latitude: 1, longitude: 2 }];
    const next = await accept(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    live(next);
    const entry = next.brief.retainedAuthoredContent!.entries[0]!;
    assert.deepEqual(entry.sourceStop, trip.stops[1]);
    assert.deepEqual(entry.days.find(d => d.sourceDay.id === day.id), { sourceDay: day, dayNotes: ['private'], customActivities: ['custom'] });
    assert.deepEqual(entry.mapPins, trip.brief.mapPins);
    assert.deepEqual(next.brief.bookings, trip.brief.bookings);
    assert.ok(next.legs.some(l => l.fromStopId === 'tokyo' && l.toStopId === 'hiroshima'));
    let copy = next;
    for (let i = 0; i < 2; i++) {
        copy = requireReadableTripDocument(reconcileItineraryIdeas(reconcileAuthoredDayState(copy, cascadeTripSchedule(copy).trip)));
        live(copy);
        assert.deepEqual(copy.brief.retainedAuthoredContent, next.brief.retainedAuthoredContent);
    }
    copy = await accept(copy, { kind: 'budget', budget: 'high' });
    copy = requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(copy))));
    assert.deepEqual(copy.brief.retainedAuthoredContent, next.brief.retainedAuthoredContent);
});
test('accepted_removal_has_valid_child_references_before_first_save', async () => {
    live(prepareTripDocumentForWrite(await accept(fixture(), { kind: 'remove-destination', intentId: 'intent:kyoto' })));
});
test('future_work_and_retention_metadata_protect_original_source', async () => {
    await api();
    for (const field of ['work', 'retained']) {
        const trip = fixture();
        if (field === 'work')
            trip.brief.cascadeStatus = { conflicts: [], affectedBookingIds: [], affectedPlanItemCount: 0, routeReconciliation: { version: 2, inputKey: 'key', residual: [] } } as any;
        else
            trip.brief.retainedAuthoredContent = { version: 2, entries: [] } as any;
        const before = JSON.stringify(trip);
        assert.equal(readTripDocument(trip).kind, 'invalid');
        assert.throws(() => prepareTripDocumentForWrite(trip));
        assert.equal(JSON.stringify(trip), before);
    }
});
test('budget_work_does_not_invalidate_itinerary_geometry', async () => {
    const trip = fixture();
    const next = await accept(trip, { kind: 'budget', budget: 'high' });
    assert.deepEqual(next.legs, trip.legs);
    assert.equal(routeProjectionStatus(next), 'current');
    const result = await response(next, units(next), 'failed');
    assert.ok(result.ok);
    assert.equal(routeProjectionStatus(result.trip), 'current');
});
test('night_change_keeps_booked_dates_and_reports_conflict', async () => {
    const trip = fixture();
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    Object.assign(day, { startsAt: '09:00', endsAt: '10:00', bookingUrl: 'https://example.com/fixed' });
    const next = await accept(trip, { kind: 'nights', intentId: 'intent:tokyo', stopId: 'tokyo', nights: 5 });
    assert.equal(next.planItems.find(d => d.id === day.id)!.date, day.date);
    assert.deepEqual(next.brief.bookings, trip.brief.bookings);
    const result = (await api()).reconcileBuilderDependencies(next, units(next));
    assert.equal(result.ok, false);
    assert.ok(units(result.trip).some(u => u.phase === 'conflict'));
    assert.equal(routeProjectionStatus(result.trip), 'pending');
});
test('origin_A_then_destination_B_rejects_stale_A_and_resumes_union_on_reload', async () => {
    const a = await accept(fixture(), origin);
    const b = await accept(a, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    const gateway = units(a).find(u => u.kind === 'leg' && a.legs.find(l => l.id === u.targetId)?.fromStopId === `${a.id}-origin`)!;
    assert.deepEqual(units(b).find(u => u.targetId === gateway.targetId), gateway);
    assert.ok(units(b).some(u => u.kind === 'leg' && b.legs.some(l => l.id === u.targetId && l.fromStopId === 'tokyo' && l.toStopId === 'hiroshima')));
    assert.ok(units(b).every(u => u.kind !== 'leg' || b.legs.some(l => l.id === u.targetId)));
    const reloaded = requireReadableTripDocument(JSON.parse(JSON.stringify(b)));
    assert.deepEqual((await api()).pendingBuilderReconciliationUnits(reloaded), units(b).filter(u => u.phase === 'pending'));
});
test('provider_error_empty_and_ambiguity_remain_distinct', async () => {
    for (const resolution of ['unavailable', 'unresolved', 'ambiguous'] as const) {
        const trip = fixture();
        trip.brief.intent.route.destinations.push({ id: 'unresolved', sourceText: 'Mostar', kind: 'overnight_place', selectedPlace: null, resolution, requestedNights: 2, routeMembership: 'required', stopIds: [] });
        const next = await accept(trip, { kind: 'budget', budget: 'high' });
        assert.equal(next.brief.intent.route.destinations.at(-1)!.resolution, resolution);
        assert.equal(routeProjectionStatus(next), 'provisional');
    }
});
test('completed_unknown_transport_is_not_fabricated_or_permanent_network_failure', async () => {
    const trip = await accept(fixture(), origin);
    const selected = units(trip).filter(u => u.kind === 'leg');
    const result = await response(trip, selected);
    assert.ok(result.ok);
    assert.equal(units(result.trip).filter(u => u.kind === 'leg').length, 0);
    for (const unit of selected) {
        const leg: import('../lib/easyt/trip.ts').TripLeg = result.trip.legs.find(l => l.id === unit.targetId)!;
        assert.equal(leg.mode, 'unknown');
        assert.equal(leg.durationMinutes, null);
        assert.equal(leg.routeMetadata.pending, undefined);
    }
});
test('builder_rebuild_retains_full_attachment_and_no_absent_live_ideas', async () => {
    const trip = fixture();
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    trip.brief.itineraryIdeas = [{ id: 'google', stopId: 'kyoto', source: 'google-place-reference', category: 'activity', providerReference: { provider: 'google', placeId: 'reference' }, userNote: 'keep', dayId: day.id }];
    const next = await accept(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    const { preserveBuilderCanonicalState } = await import('../lib/easyt/trip-builder-preservation.ts');
    const rebuilt = structuredClone(next);
    delete rebuilt.brief.retainedAuthoredContent;
    const preserved = preserveBuilderCanonicalState(next, rebuilt);
    assert.deepEqual(preserved.brief.retainedAuthoredContent, next.brief.retainedAuthoredContent);
    live(requireReadableTripDocument(preserved));
    const { reviewTrip } = await import('../lib/easyt/review.ts');
    assert.ok(reviewTrip(preserved).some(r => r.rule === 'retained-authored-content' && r.message.includes('Kyoto')));
});
test('structural_Undo_restores_exact_full_removed_content_and_consumes_only_inverse_attachment', async () => {
    const { builderStructuralSnapshot } = await import('../lib/easyt/trip-builder-edit.ts');
    const trip = fixture();
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    trip.brief.dayNotes = { [day.dayNumber]: ['original'] };
    const snapshot = builderStructuralSnapshot(trip);
    const removed = await accept(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    const edited = await accept(removed, { kind: 'budget', budget: 'high' });
    const restored = await accept(edited, { kind: 'structural-inverse', snapshot });
    assert.deepEqual(restored.planItems.filter(d => d.stopId === 'kyoto'), trip.planItems.filter(d => d.stopId === 'kyoto'));
    assert.equal(restored.brief.retainedAuthoredContent?.entries.length ?? 0, 0);
    assert.deepEqual(restored.brief.dayNotes, trip.brief.dayNotes);
    assert.equal(restored.brief.budgetBand, 'high');
});
test('same_name_lossless_payload_survives_successful_projection_rebuild_and_Undo', async () => {
    const trip = fixture();
    trip.brief.bookings = [];
    trip.stops[2].name = 'Kyoto';
    const sibling = structuredClone(trip.planItems.filter(d => d.stopId === 'hiroshima'));
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    Object.assign(day, { notes: ['all', 'fields'], noteDayParts: ['morning', 'evening'], startsAt: '09:30', endsAt: '10:15', bookingUrl: 'https://example.com/b', contextNotes: ['provenance'], image: 'test.png', sourceUrl: 'https://example.com/s', latitude: 1, longitude: 2 });
    trip.brief.itineraryIdeas = [{ id: 'legacy', stopId: 'kyoto', placeId: 'place', title: 'Saved', category: 'activity', source: 'traveller-visit-intent', reasons: [], dayId: day.id, description: 'full description', startsAt: '09:30' }, { id: 'reference', source: 'google-place-reference', stopId: 'kyoto', category: 'activity', providerReference: { provider: 'google', placeId: 'g', lastResolvedAt: '2026-10-01' }, dayId: day.id, dayPart: 'morning', userNote: 'private' }];
    const before = structuredClone(trip);
    let next = await accept(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    const retained = structuredClone(next.brief.retainedAuthoredContent);
    const result = await response(next, units(next));
    assert.ok(result.ok);
    next = result.trip;
    assert.deepEqual(next.brief.retainedAuthoredContent, retained);
    const authoredDay = ({contextNotes: _generated, ...d}: typeof trip.planItems[number]) => ({ ...d, date: undefined, dayNumber: undefined });
    assert.deepEqual(next.planItems.filter(d => d.stopId === 'hiroshima').map(authoredDay), sibling.map(authoredDay));
    const { preserveBuilderCanonicalState } = await import('../lib/easyt/trip-builder-preservation.ts');
    for (let i = 0; i < 2; i++) {
        next = requireReadableTripDocument(preserveBuilderCanonicalState(next, reconcileItineraryIdeas(reconcileAuthoredDayState(next, cascadeTripSchedule(next).trip))));
        live(next);
        assert.deepEqual(next.brief.retainedAuthoredContent, retained);
    }
    const { builderStructuralSnapshot } = await import('../lib/easyt/trip-builder-edit.ts');
    next = await accept(requireReadableTripDocument(JSON.parse(JSON.stringify(next))), { kind: 'structural-inverse', snapshot: builderStructuralSnapshot(before) });
    assert.deepEqual(next.planItems.filter(d => d.stopId === 'kyoto'), before.planItems.filter(d => d.stopId === 'kyoto'));
    assert.deepEqual(next.brief.itineraryIdeas, before.brief.itineraryIdeas);
    assert.equal(next.brief.retainedAuthoredContent?.entries.length ?? 0, 0);
    live(next);
});
test('retained_content_collision_and_malformed_payload_block_destructive_save', async () => {
    const trip = fixture();
    const removed = await accept(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    const attachment = structuredClone(removed.brief.retainedAuthoredContent!);
    const source = structuredClone(trip);
    source.brief.retainedAuthoredContent = attachment;
    source.brief.retainedAuthoredContent.entries[0].days[0].sourceDay.notes = ['different'];
    const result = prepareAcceptedBuilderEdit(source, { kind: 'remove-destination', intentId: 'intent:kyoto' }, builderDocumentFingerprint(source));
    assert.ok(result.ok);
    assert.deepEqual((await api()).prepareBuilderNecessaryProjection(source, result.trip, result.scope), { ok: false, reason: 'invalid-bindings' });
    const malformed = structuredClone(removed);
    (malformed.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay as any).notes = null;
    assert.equal(readTripDocument(malformed).kind, 'invalid');
});
test('deliberate_retained_removal_and_move_consume_only_exact_selected_values', async () => {
    const trip = fixture();
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    trip.brief.itineraryIdeas = [{ id: 'reference', source: 'google-place-reference', stopId: 'kyoto', category: 'activity', providerReference: { provider: 'google', placeId: 'g' }, dayId: day.id, userNote: 'private' }];
    const removed = await accept(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    const retention = await import('../lib/easyt/trip-retained-authored-content.ts');
    const entry = removed.brief.retainedAuthoredContent!.entries[0];
    const selection = { entryId: entry.id, expectedContentKey: retention.authoredContentKey(entry), ideaIds: ['reference'] };
    const target = removed.planItems[0];
    const moved = retention.moveRetainedAuthoredContent(removed, selection, { stopId: target.stopId, dayId: target.id });
    assert.ok(moved.ok);
    assert.deepEqual(moved.trip.brief.itineraryIdeas![0], { ...entry.itineraryIdeas[0], stopId: target.stopId, dayId: target.id });
    assert.deepEqual(moved.trip.brief.retainedAuthoredContent!.entries[0].days, entry.days);
    assert.equal(moved.trip.brief.retainedAuthoredContent!.entries[0].itineraryIdeas.length, 0);
    assert.equal(retention.removeRetainedAuthoredContent(moved.trip, selection).ok, false);
    const current = moved.trip.brief.retainedAuthoredContent!.entries[0];
    const deleted = retention.removeRetainedAuthoredContent(moved.trip, { entryId: entry.id, expectedContentKey: retention.authoredContentKey(current), dayIds: [current.days[0].sourceDay.id] });
    assert.ok(deleted.ok);
    assert.equal(deleted.trip.brief.retainedAuthoredContent!.entries[0].days.length, current.days.length - 1);
});
test('retry_resets_only_selected_failed_unit_and_old_attempt_cannot_retire_it', async () => {
    const trip = await accept(fixture(), origin);
    const selected = units(trip).filter(u => u.kind === 'leg');
    const failed = await response(trip, selected, 'failed');
    assert.ok(failed.ok);
    const result = (await api()).retryBuilderReconciliationUnit(failed.trip, selected[0]);
    assert.ok(result.ok);
    assert.equal(units(result.trip).find(u => u.targetId === selected[0].targetId)!.phase, 'pending');
    assert.deepEqual(units(result.trip).filter(u => u.targetId !== selected[0].targetId), units(failed.trip).filter(u => u.targetId !== selected[0].targetId));
    const scope = { ownerId: trip.ownerId, tripId: trip.id, inputRevision: 1 };
    assert.deepEqual((await api()).mergeBuilderProjectionResponse(result.trip, { scope, inputKey: routeProjectionInputKey(result.trip), requestId: 'older', dispatched: selected, results: selected.map(u => ({ ...u, phase: 'complete' })), legs: trip.legs }, { scope, requestId: 'retry', dispatched: [selected[0]] }), { ok: false, reason: 'stale' });
});
test('necessary_worker_recomputes_only_dispatched_leg_and_keeps_unknown_truthful', async () => {
    const trip = await accept(fixture(), origin);
    const dispatched = units(trip).filter(u => u.kind === 'leg');
    const prior = structuredClone(trip);
    const result = (await api()).reconcileBuilderDependencies(trip, dispatched);
    assert.ok(result.ok);
    assert.equal(units(result.trip).filter(u => u.kind === 'leg').length, 0);
    assert.deepEqual(result.trip.legs.filter(l => !dispatched.some(u => u.targetId === l.id)), prior.legs.filter(l => !dispatched.some(u => u.targetId === l.id)));
    assert.deepEqual(units(result.trip).filter(u => u.kind !== 'leg'), units(prior).filter(u => u.kind !== 'leg'));
});
test('recommendation_only_worker_does_not_cascade_unrelated_dates', async () => {
    const trip = await accept(fixture(), { kind: 'budget', budget: 'high' });
    const original = structuredClone(trip);
    const result = (await api()).reconcileBuilderDependencies(trip, units(trip));
    assert.deepEqual(result.trip.stops, original.stops);
    assert.deepEqual(result.trip.planItems, original.planItems);
    assert.equal(routeProjectionStatus(result.trip), 'current');
});
test('recommendation_unavailability_is_durable_without_staling_current_geometry', async () => {
    const trip = await accept(fixture(), { kind: 'budget', budget: 'high' });
    const result = (await api()).reconcileBuilderDependencies(trip, units(trip));
    assert.equal(result.ok, false);
    if (!result.ok)
        assert.equal(result.reason, 'unavailable');
    const reloaded = requireReadableTripDocument(JSON.parse(JSON.stringify(result.trip)));
    assert.ok(units(reloaded).every(u => u.kind === 'recommendation' && u.phase === 'failed' && u.reason === 'unavailable'));
    assert.deepEqual((await api()).pendingBuilderReconciliationUnits(reloaded), []);
    assert.equal(routeProjectionStatus(reloaded), 'current');
});
test('successful_response_cannot_overwrite_unrelated_authored_values_or_stamp_blocked_geometry', async () => {
    const trip = await accept(fixture(), origin);
    const selected = units(trip).filter(u => u.kind === 'leg');
    const before = structuredClone(trip);
    const scope = { ownerId: trip.ownerId, tripId: trip.id, inputRevision: 1 };
    const result = (await api()).mergeBuilderProjectionResponse(trip, { scope, inputKey: routeProjectionInputKey(trip), requestId: 'valid', dispatched: selected, results: selected.map(u => ({ ...u, phase: 'complete' })), legs: trip.legs, planItems: [], stops: [] } as any, { scope, requestId: 'valid', dispatched: selected });
    assert.ok(result.ok);
    assert.deepEqual(result.trip.planItems, before.planItems);
    assert.deepEqual(result.trip.stops, before.stops);
    assert.equal(result.trip.brief.intent.route.projectionInputKey, before.brief.intent.route.projectionInputKey);
    assert.deepEqual(result.trip.brief.bookings, before.brief.bookings);
});
test('changed_unit_basis_and_foreign_owner_responses_retire_nothing', async () => {
    const trip = await accept(fixture(), origin);
    const selected = units(trip).slice(0, 1);
    const scope = { ownerId: trip.ownerId, tripId: trip.id, inputRevision: 1 };
    for (const response of [{ scope: { ...scope, ownerId: 'foreign' }, inputKey: routeProjectionInputKey(trip), requestId: 'r', dispatched: selected, results: [], legs: [] }, { scope, inputKey: routeProjectionInputKey(trip), requestId: 'r', dispatched: selected, results: selected.map(u => ({ ...u, basisKey: 'old', phase: 'complete' })), legs: trip.legs }]) {
        assert.deepEqual((await api()).mergeBuilderProjectionResponse(trip, response as any, { scope, requestId: 'r', dispatched: selected }), { ok: false, reason: 'stale' });
    }
});
test('repeat_capture_deduplicates_exact_source_snapshot_and_protected_move_consumes_nothing', async () => {
    const trip = fixture();
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    day.startsAt = '09:00';
    const removed = await accept(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' });
    const retention = await import('../lib/easyt/trip-retained-authored-content.ts');
    const repeated = retention.retainRemovedAuthoredContent(trip, removed);
    assert.deepEqual(repeated.brief.retainedAuthoredContent, removed.brief.retainedAuthoredContent);
    const entry = removed.brief.retainedAuthoredContent!.entries[0];
    const target = removed.planItems[0];
    const before = JSON.stringify(removed);
    assert.deepEqual(retention.moveRetainedAuthoredContent(removed, { entryId: entry.id, expectedContentKey: retention.authoredContentKey(entry), dayIds: [day.id] }, { stopId: target.stopId, dayId: target.id }), { ok: false, reason: 'protected-date' });
    assert.equal(JSON.stringify(removed), before);
});
test('accepted_route_edit_invalidates_old_assessment_until_scoped_replacement',async()=>{const trip=fixture();trip.brief.routeAssessment={route:{state:'recommendation',improvementMinutes:90,reasons:['old']}} as any;const next=await accept(trip,origin);assert.equal(next.brief.routeAssessment,undefined);});
test('unknown_leg_completion_rejects_fabricated_duration',async()=>{const trip=await accept(fixture(),origin);const dispatched=units(trip).filter(u=>u.kind==='leg');const scope={ownerId:trip.ownerId,tripId:trip.id,inputRevision:1};const response={scope,inputKey:routeProjectionInputKey(trip),requestId:'r',dispatched,results:dispatched.map(u=>({...u,phase:'complete' as const})),legs:trip.legs.filter(l=>dispatched.some(u=>u.targetId===l.id)).map(l=>({...l,mode:'unknown' as const,durationMinutes:60}))};assert.deepEqual((await api()).mergeBuilderProjectionResponse(trip,response,{scope,requestId:'r',dispatched}),{ok:false,reason:'invalid'});});
