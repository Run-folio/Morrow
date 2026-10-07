import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { prepareBuilderHandlerEdit } from '../lib/easyt/trip-builder-handler-contract.ts';
import { canonicalTripForOwner, duplicateTripDocument, tripStopReferenceInvariantIssues } from '../lib/easyt/trip-promotion.ts';
import { pendingBuilderReconciliationUnits, reconcileBuilderDependencies } from '../lib/easyt/trip-builder-reconciliation.ts';
import { routeProjectionInputKey } from '../lib/easyt/trip-route-intent.ts';
function edited() {
  const trip = requireReadableTripDocument(canonicalRouteFixture()); trip.ownerId = null;
  const result = prepareBuilderHandlerEdit(trip, { kind: 'nights', stopId: 'kyoto', intentId: 'intent:kyoto', nights: 4 }, builderDocumentFingerprint(trip));
  assert.ok(result.ok); return result.trip;
}
test('promotion_maps_live_work_and_dependency_bases_preserving_mixed_phases_and_null_projection', () => {
  const trip = edited(), units = trip.brief.cascadeStatus!.routeReconciliation!.residual;
  units.find(unit => unit.kind === 'recommendation')!.phase = 'failed';
  units.find(unit => unit.kind === 'recommendation')!.reason = 'unavailable';
  units.find(unit => unit.kind === 'schedule')!.phase = 'conflict';
  units.find(unit => unit.kind === 'schedule')!.reason = 'protected-date';
  const next = requireReadableTripDocument(canonicalTripForOwner('owner-a', trip));
  const mapped = next.brief.cascadeStatus!.routeReconciliation!.residual;
  assert.equal(next.brief.intent.route.projectionInputKey, trip.brief.intent.route.projectionInputKey);
  assert.equal(mapped.length, units.length);
  assert.deepEqual(mapped.map(u => [u.kind, u.phase, u.reason]), units.map(u => [u.kind, u.phase, u.reason]));
  assert.ok(mapped.filter(u => ['schedule','recommendation'].includes(u.kind)).every(u => next.stops.some(s => s.id === u.targetId)));
  const completed = reconcileBuilderDependencies(next, pendingBuilderReconciliationUnits(next));
  assert.ok(!pendingBuilderReconciliationUnits(completed.trip).some(u => u.kind === 'leg'), 'mapped leg dependency bases must be executable');
  assert.deepEqual(canonicalTripForOwner('owner-a', next), next, 'repeated canonicalization is idempotent');
});
test('promotion_preserves_historical_retained_payload_and_exempts_only_typed_snapshots', () => {
  const trip = requireReadableTripDocument(canonicalRouteFixture()); trip.ownerId = null;
  const result = prepareBuilderHandlerEdit(trip, {kind:'remove-destination',intentId:'intent:hiroshima'}, builderDocumentFingerprint(trip)); assert.ok(result.ok);
  const historical = JSON.stringify(result.trip.brief.retainedAuthoredContent);
  const promoted = requireReadableTripDocument(canonicalTripForOwner('owner-a', result.trip));
  assert.equal(JSON.stringify(promoted.brief.retainedAuthoredContent), historical);
  assert.deepEqual(tripStopReferenceInvariantIssues(promoted), []);
  const invalid = structuredClone(promoted); invalid.planItems[0]!.stopId = 'foreign-live-stop';
  assert.ok(tripStopReferenceInvariantIssues(invalid).length, 'live projection references still fail');
});
test('promotion_rejects_invalid_or_stale_work_basis_instead_of_blessing_it', () => {
  const trip = edited(); trip.brief.cascadeStatus!.routeReconciliation!.residual[0]!.basisKey = 'unproven';
  assert.throws(() => canonicalTripForOwner('owner-a', trip));
});
test('duplicate_maps_pending_work_through_actual_generated_leg_ids_and_trip_identity', () => {
  let count = 0; const copy = requireReadableTripDocument(duplicateTripDocument(edited(), {id:'copy-trip',now:'2026-10-07T00:00:00.000Z',nextId:()=>String(++count)}));
  const units = pendingBuilderReconciliationUnits(copy);
  assert.ok(units.filter(u=>u.kind==='leg').every(u=>copy.legs.some(leg=>leg.id===u.targetId)));
  assert.ok(units.filter(u=>u.kind==='assessment').every(u=>u.targetId===copy.id));
  const work = reconcileBuilderDependencies(copy,units);
  assert.ok(!pendingBuilderReconciliationUnits(work.trip).some(u=>u.kind==='leg'));
});
test('canonicalization_keeps_null_and_stale_projection_semantics_and_translates_only_current_keys', () => {
  for (const state of ['null','stale','current']) {
    const trip=edited(); trip.brief.intent.route.projectionInputKey=state==='null'?null:state==='current'?routeProjectionInputKey(trip):routeProjectionInputKey({...trip,startDate:'2026-11-01'});
    const key=trip.brief.intent.route.projectionInputKey;
    const next=requireReadableTripDocument(canonicalTripForOwner('owner-a',trip));
    assert.equal(next.brief.intent.route.projectionInputKey,state==='current'?routeProjectionInputKey(next):key);
    if(state==='stale') assert.notEqual(next.brief.intent.route.projectionInputKey,routeProjectionInputKey(next));
  }
});
