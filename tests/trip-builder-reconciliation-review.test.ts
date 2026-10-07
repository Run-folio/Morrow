import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { prepareTripDocumentForWrite, requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { routeProjectionInputKey } from '../lib/easyt/trip-route-intent.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { prepareAcceptedBuilderEdit } from '../lib/easyt/trip-builder-edit.ts';
import { prepareBuilderNecessaryProjection, reconcileBuilderDependencies, pendingBuilderReconciliationUnits, mergeBuilderProjectionResponse } from '../lib/easyt/trip-builder-reconciliation.ts';
import { supportedTransportChoicesForLeg, effectiveTripLeg } from '../lib/easyt/transport-mode-choice.ts';
import { authoredContentKey, moveRetainedAuthoredContent, removeRetainedAuthoredContent } from '../lib/easyt/trip-retained-authored-content.ts';
import { cascadeTripSchedule } from '../lib/easyt/cascade.ts';
import { reconcileAuthoredDayState } from '../lib/easyt/trip-authored-day-state.ts';
import { reconcileItineraryIdeas } from '../lib/easyt/itinerary-ideas.ts';
import type { CanonicalEasyTTrip, RouteReconciliationScope } from '../lib/easyt/trip.ts';
const emptyScope: RouteReconciliationScope = { legIds: [], scheduleStopIds: [], recommendationStopIds: [], endpointChanged: false, routeAssessment: false };
function fixture() {
    const trip = requireReadableTripDocument(canonicalRouteFixture());
    trip.brief.intent.route.projectionInputKey = routeProjectionInputKey(trip);
    return trip;
}
function selectedFixture() {
    const trip = fixture();
    const leg = trip.legs[0];
    const endpoint = (stop: CanonicalEasyTTrip['stops'][number]) => ({ kind: 'stop' as const, id: stop.id, name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId, coordinates: [stop.longitude!, stop.latitude!] as [
            number,
            number
        ] });
    const segment = { id: 'road-segment', mode: 'road', fromEndpoint: endpoint(trip.stops[0]), toEndpoint: endpoint(trip.stops[1]), durationMinutes: 390, distanceKm: 450, provider: 'Fixture road', provenance: 'routing_engine', confidence: 'high', scheduleNeedsChecking: true };
    leg.routeMetadata = { multimodalResolution: { candidates: [{ id: 'road-a', summaryMode: 'road', evidence: 'fixture:road', totalDurationMinutes: 390, provenance: 'routing_engine', segments: [segment] }] } };
    const choice = supportedTransportChoicesForLeg(trip, leg)[0];
    assert.ok(choice);
    const edit = prepareAcceptedBuilderEdit(trip, { kind: 'transport', legId: leg.id, identity: choice.identity }, builderDocumentFingerprint(trip));
    assert.ok(edit.ok);
    const prefix = prepareBuilderNecessaryProjection(trip, edit.trip, edit.scope);
    assert.ok(prefix.ok);
    return { trip, edit, prefix: prefix.trip, legId: leg.id, choice };
}
function assertRoad(trip: CanonicalEasyTTrip, legId: string, identity: string) {
    const leg = trip.legs.find(l => l.id === legId)!;
    const effective = effectiveTripLeg(trip, leg);
    assert.equal(effective.mode, 'road');
    assert.equal(effective.durationMinutes, 390);
    assert.equal(effective.provenance, 'routing_engine');
    assert.equal(supportedTransportChoicesForLeg(trip, leg).find(c => c.identity === identity)?.evidence, 'fixture:road');
    assert.equal((trip.brief.decisionSelections!.transportByLeg[legId] as any).identity, identity);
}
test('C1_supported_road_choice_survives_coherent_first_save_and_reload', () => {
    const { edit, prefix, legId, choice } = selectedFixture();
    assertRoad(edit.trip, legId, choice.identity);
    assertRoad(prefix, legId, choice.identity);
    assertRoad(requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(prefix)))), legId, choice.identity);
});
test('C1_supported_road_choice_survives_necessary_worker_and_provider_merge', () => {
    const { prefix, legId, choice } = selectedFixture();
    const dispatched = pendingBuilderReconciliationUnits(prefix).filter(u => u.kind === 'leg');
    const worker = reconcileBuilderDependencies(prefix, dispatched);
    assertRoad(worker.trip, legId, choice.identity);
    const scope = { ownerId: prefix.ownerId, tripId: prefix.id, inputRevision: 1 };
    const result = mergeBuilderProjectionResponse(prefix, { scope, inputKey: routeProjectionInputKey(prefix), requestId: 'provider', dispatched, results: dispatched.map(u => ({ ...u, phase: 'complete' })), legs: worker.trip.legs.map(l => ({ ...l, mode: 'train', durationMinutes: 120, routeMetadata: { source: 'provider-refresh' } })) }, { scope, requestId: 'provider', dispatched });
    assert.ok(result.ok);
    assertRoad(requireReadableTripDocument(JSON.parse(JSON.stringify(result.trip))), legId, choice.identity);
});
test('C1_changed_place_evidence_does_not_rebind_saved_road_choice', () => {
    const { prefix, legId } = selectedFixture();
    const edited = prepareAcceptedBuilderEdit(prefix, { kind: 'replace-destination', intentId: 'intent:kyoto', stopId: 'kyoto', place: { name: 'Osaka', canonicalPlaceId: 'place:osaka', country: 'Japan', coordinates: [135.5, 34.69] } }, builderDocumentFingerprint(prefix));
    assert.ok(edited.ok);
    const result = prepareBuilderNecessaryProjection(prefix, edited.trip, edited.scope);
    assert.ok(result.ok);
    assert.notEqual(effectiveTripLeg(result.trip, result.trip.legs.find(l => l.id === legId)!).mode, 'road');
});
function retainedFixture() {
    const trip = fixture();
    const day = trip.planItems.find(d => d.stopId === 'kyoto')!;
    trip.brief.itineraryIdeas = [{ id: 'private-choice', stopId: 'kyoto', placeId: 'p', title: 'Saved choice', description: 'full provenance', category: 'activity', source: 'personalised-recommendation', reasons: [], dayId: day.id }];
    const edit = prepareAcceptedBuilderEdit(trip, { kind: 'remove-destination', intentId: 'intent:kyoto' }, builderDocumentFingerprint(trip));
    assert.ok(edit.ok);
    const result = prepareBuilderNecessaryProjection(trip, edit.trip, edit.scope);
    assert.ok(result.ok);
    const removed = result.trip;
    const entry = removed.brief.retainedAuthoredContent!.entries[0];
    const selection = { entryId: entry.id, expectedContentKey: authoredContentKey(entry), ideaIds: ['private-choice'] };
    return { removed, entry, selection, target: removed.planItems[0] };
}
for (const action of ['move', 'remove'] as const)
    test(`C2_deliberate_retained_${action}_passes_prefix_and_survives_reconcile_reload`, () => {
        const { removed, entry, selection, target } = retainedFixture();
        const result = action === 'move' ? moveRetainedAuthoredContent(removed, selection, { stopId: target.stopId, dayId: target.id }) : removeRetainedAuthoredContent(removed, selection);
        assert.ok(result.ok);
        assert.ok((result as any).consumption, 'The explicit action must carry exact consumption ownership');
        const prefixed = (prepareBuilderNecessaryProjection as any)(removed, result.trip, emptyScope, (result as any).consumption);
        assert.ok(prefixed.ok);
        let trip: CanonicalEasyTTrip = prefixed.trip;
        for (let i = 0; i < 2; i++) {
            trip = requireReadableTripDocument(reconcileItineraryIdeas(reconcileAuthoredDayState(trip, cascadeTripSchedule(trip).trip)));
            trip = requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
            assert.deepEqual(trip.brief.retainedAuthoredContent!.entries[0].days, entry.days);
            assert.equal(trip.brief.retainedAuthoredContent!.entries[0].itineraryIdeas.length, 0);
            if (action === 'move')
                assert.deepEqual(trip.brief.itineraryIdeas!.find(idea => idea.id === 'private-choice'), { ...entry.itineraryIdeas[0], stopId: target.stopId, dayId: target.id });
            else
                assert.ok(!trip.brief.itineraryIdeas!.some(idea => idea.id === 'private-choice'));
        }
    });
test('C2_missing_stale_or_overbroad_consumption_cannot_erase_other_retained_values', () => {
    const { removed, selection, target } = retainedFixture();
    const moved = moveRetainedAuthoredContent(removed, selection, { stopId: target.stopId, dayId: target.id });
    assert.ok(moved.ok);
    assert.deepEqual(prepareBuilderNecessaryProjection(removed, moved.trip as CanonicalEasyTTrip, emptyScope), { ok: false, reason: 'invalid-bindings' });
    const tampered = structuredClone(moved.trip);
    tampered.brief.retainedAuthoredContent!.entries[0].days = [];
    assert.deepEqual((prepareBuilderNecessaryProjection as any)(removed, tampered, emptyScope, (moved as any).consumption), { ok: false, reason: 'invalid-bindings' });
});
for (const action of ['move', 'remove'] as const)
    test(`C2_owned_accepted_${action}_carries_consumption_to_prefix`, () => {
        const { removed, entry, selection, target } = retainedFixture();
        const input = action === 'move' ? { kind: 'retained-content-move', selection, target: { stopId: target.stopId, dayId: target.id } } : { kind: 'retained-content-remove', selection };
        const edit = prepareAcceptedBuilderEdit(removed, input as any, builderDocumentFingerprint(removed));
        assert.ok(edit.ok);
        assert.ok((edit as any).retainedConsumption);
        const result = prepareBuilderNecessaryProjection(removed, edit.trip, edit.scope, (edit as any).retainedConsumption);
        assert.ok(result.ok);
        assert.deepEqual(result.trip.brief.retainedAuthoredContent!.entries[0].days, entry.days);
        assert.equal(result.trip.brief.retainedAuthoredContent!.entries[0].itineraryIdeas.length, 0);
        assert.deepEqual(result.trip.brief.cascadeStatus?.routeReconciliation, removed.brief.cascadeStatus?.routeReconciliation);
        const later = prepareAcceptedBuilderEdit(result.trip, { kind: 'budget', budget: 'high' }, builderDocumentFingerprint(result.trip));
        assert.ok(later.ok);
        assert.equal((later as any).retainedConsumption, undefined);
        const again = prepareBuilderNecessaryProjection(result.trip, later.trip, later.scope);
        assert.ok(again.ok);
        assert.equal(again.trip.brief.retainedAuthoredContent!.entries[0].itineraryIdeas.length, 0);
    });
test('C2_exact_receipt_cannot_be_replayed_after_save_or_apply_to_foreign_trip', () => {
    const { removed, selection, target } = retainedFixture();
    const action = moveRetainedAuthoredContent(removed, selection, { stopId: target.stopId, dayId: target.id });
    assert.ok(action.ok);
    const prefix = (prepareBuilderNecessaryProjection as any)(removed, action.trip, emptyScope, (action as any).consumption);
    assert.ok(prefix.ok);
    assert.deepEqual((prepareBuilderNecessaryProjection as any)(prefix.trip, action.trip, emptyScope, (action as any).consumption), { ok: false, reason: 'invalid-bindings' });
    const foreign = structuredClone(removed);
    foreign.ownerId = 'different-owner';
    assert.deepEqual((prepareBuilderNecessaryProjection as any)(foreign, action.trip, emptyScope, (action as any).consumption), { ok: false, reason: 'invalid-bindings' });
});
test('C1_provider_refresh_cannot_reactivate_choice_with_old_place_evidence', () => {
    const { prefix, legId } = selectedFixture();
    const edited = prepareAcceptedBuilderEdit(prefix, { kind: 'replace-destination', intentId: 'intent:kyoto', stopId: 'kyoto', place: { name: 'Osaka', canonicalPlaceId: 'place:osaka', country: 'Japan', coordinates: [135.5, 34.69] } }, builderDocumentFingerprint(prefix));
    assert.ok(edited.ok);
    const prepared = prepareBuilderNecessaryProjection(prefix, edited.trip, edited.scope);
    assert.ok(prepared.ok);
    const current = prepared.trip;
    const dispatched = pendingBuilderReconciliationUnits(current).filter(unit => unit.kind === 'leg' && unit.targetId === legId);
    const scope = { ownerId: current.ownerId, tripId: current.id, inputRevision: 2 };
    const old = prefix.legs.find(leg => leg.id === legId)!;
    const legs = current.legs.filter(leg => leg.id === legId).map(leg => ({ ...leg, routeMetadata: old.routeMetadata }));
    assert.deepEqual(mergeBuilderProjectionResponse(current, { scope, inputKey: routeProjectionInputKey(current), requestId: 'refresh', dispatched, results: dispatched.map(unit => ({ ...unit, phase: 'complete' })), legs }, { scope, requestId: 'refresh', dispatched }), { ok: false, reason: 'invalid' });
});
