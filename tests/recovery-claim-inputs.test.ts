import assert from 'node:assert/strict';
import test from 'node:test';
import { envelope } from './helpers/durable-recovery-fixture.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { createBuilderInputDraft, updateBuilderInputDraft, readBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';
import { emptyHomepageInput } from './fixtures/homepage-dual-entry.ts';
import { decodeHomepageBundle } from '../lib/easyt/homepage-persistence.ts';
import { homepageReceiptForProjection, homepageHandoffMatchesTrip, homepageSemanticInputFingerprint,
  homepageSubmissionFingerprint, createPendingIntakeReceipt, type HomeTripDraft } from '../lib/easyt/home-trip-handoff.ts';
import { homepageRouteReviewKey, type HomepageRouteEvidence } from '../lib/easyt/home-route-choice.ts';

const loaded = import('../lib/easyt/recovery-claim-inputs.ts').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null; throw error;
});
async function api() { const result = await loaded; assert.ok(result, 'checked claim input rebinding must be implemented'); return result; }
function fixture() {
  const source = envelope('guest-exact', null);
  source.entry.input = null; source.entry.receipt = null;
  const trip = requireReadableTripDocument(JSON.parse(source.rawRecovery).trip);
  return { source, trip };
}
function builderFixture() {
  const value = fixture();
  let draft = createBuilderInputDraft(value.trip, 7);
  draft = updateBuilderInputDraft(draft, value.trip, { kind: 'origin' }, '  Lond\n');
  draft = updateBuilderInputDraft(draft, value.trip, { kind: 'nights', intentId: value.trip.brief.intent.route.destinations[0]!.id, stopId: value.trip.stops[0]!.id }, '2x  ');
  const raw = JSON.stringify(draft);
  value.source.entry.input = { ownerId: null, tripId: value.trip.id, inputRevision: draft.inputRevision, raw };
  return { ...value, draft, raw };
}
function homeFixture(review = false) {
  const value = fixture();
  const snapshot = { ...emptyHomepageInput(), revision: 12, prompt: '  retained inactive text\n', originInput: '  London  ',
    entries: value.trip.stops.map(stop => ({ id: stop.id, text: `  ${stop.name}  `, selection: null })),
    tripType: { state: 'selected' as const, value: 'one_way' as const } };
  const evidence: HomepageRouteEvidence = { tripType: 'one_way', journeyEnd: { mode: 'unknown' }, status: 'clear', source: 'legacy' };
  if (review) snapshot.routeReview = { version: 1, acceptedTripType: 'one_way', reviewedInputKey: homepageRouteReviewKey(snapshot, evidence) };
  const { version: _version, ownerId: _owner, revision: _revision, mode: _mode, entries: _entries, prompt: _prompt, ...choices } = snapshot;
  const draft: HomeTripDraft = { handoffId: 'completed-home', origin: value.trip.brief.origin,
    journeyEnd: value.trip.brief.journeyEnd, brief: value.trip.brief.mustDo,
    destinations: value.trip.stops.map(stop => ({ id: stop.id, name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId })),
    homepage: { version: 1, ownerId: null, revision: snapshot.revision, mode: snapshot.mode, occurrenceMentionIds: {}, choices } };
  const receipt = homepageReceiptForProjection(snapshot, draft, value.trip.id);
  draft.homepage!.receipt = receipt;
  assert.equal(homepageHandoffMatchesTrip(draft, value.trip), true, 'the supporting completed HOME draft matches the canonical guest trip');
  const bundle = { version: 1 as const, inputRaw: JSON.stringify({ snapshot, receipt }), draftRaw: JSON.stringify(draft) };
  const raw = JSON.stringify(bundle);
  value.source.entry.receipt = { ownerId: null, tripId: value.trip.id, operationId: receipt.handoffId, raw };
  return { ...value, snapshot, receipt, draft, bundle, raw, evidence };
}

test('Builder claim changes only its owner while retaining raw fields, bindings, revision and basis', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = builderFixture(), before = JSON.stringify(f.source);
  const result = rebindRecoveryClaimInputs(f.source, f.raw, null, 'owner-a');
  assert.equal(result.kind, 'ready'); if (result.kind !== 'ready') return;
  const input = JSON.parse(result.builderRaw!);
  assert.deepEqual({ ...input, ownerId: null }, f.draft);
  assert.deepEqual(input.fields.map((field: any) => field.raw), ['  Lond\n', '2x  ']);
  assert.deepEqual(result.input, { ownerId: 'owner-a', tripId: f.trip.id, inputRevision: f.draft.inputRevision, raw: result.builderRaw });
  assert.equal(readBuilderInputDraft({ getItem: () => result.builderRaw }, { ...f.trip, ownerId: 'owner-a' }, 'owner-a').kind, 'readable');
  assert.equal(JSON.stringify(f.source), before);
});

test('required Builder metadata cannot be omitted, changed, foreign or unsupported', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = builderFixture();
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, null, 'owner-a'), { kind: 'held', reason: 'builder-input-required' });
  const changed = JSON.stringify({ ...f.draft, inputRevision: f.draft.inputRevision + 1 });
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, changed, null, 'owner-a'), { kind: 'held', reason: 'builder-input-changed' });
  for (const raw of ['{broken', JSON.stringify({ ...f.draft, ownerId: 'owner-b' }), JSON.stringify({ ...f.draft, tripId: 'unrelated' }), JSON.stringify({ ...f.draft, version: 99 })]) {
    const source = structuredClone(f.source); source.entry.input = null;
    assert.deepEqual(rebindRecoveryClaimInputs(source, raw, null, 'owner-a'), { kind: 'held', reason: 'builder-input-unsupported' });
  }
});

test('an associated standalone Builder draft becomes required destination metadata', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = builderFixture(); f.source.entry.input = null;
  const result = rebindRecoveryClaimInputs(f.source, f.raw, null, 'owner-a');
  assert.equal(result.kind, 'ready'); if (result.kind !== 'ready') return;
  assert.equal(result.input?.inputRevision, f.draft.inputRevision);
  assert.equal(result.input?.raw, result.builderRaw);
});

test('complete HOME claim recomputes owner fingerprints and preserves exact typed strings and identities', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = homeFixture(), before = JSON.stringify(f.source);
  const result = rebindRecoveryClaimInputs(f.source, null, f.raw, 'owner-a');
  assert.equal(result.kind, 'ready'); if (result.kind !== 'ready') return;
  const decoded = decodeHomepageBundle(result.homepageRaw!, 'owner-a'); assert.ok(decoded);
  const snapshot = decoded.storedInput!.snapshot, receipt = decoded.storedInput!.receipt;
  assert.deepEqual({ ...snapshot, ownerId: null }, f.snapshot);
  assert.equal(receipt?.version, 1); if (receipt?.version !== 1) return;
  assert.equal(receipt.ownerId, 'owner-a'); assert.equal(receipt.handoffId, f.receipt.handoffId); assert.equal(receipt.tripId, f.trip.id);
  assert.equal(receipt.semanticInputFingerprint, homepageSemanticInputFingerprint(snapshot));
  assert.notEqual(receipt.semanticInputFingerprint, f.receipt.semanticInputFingerprint);
  assert.equal(receipt.inputFingerprint, homepageSubmissionFingerprint(decoded.draft as HomeTripDraft));
  assert.equal(homepageHandoffMatchesTrip(decoded.draft as HomeTripDraft, { ...f.trip, ownerId: 'owner-a' }), true);
  assert.equal(result.receipt?.ownerId, 'owner-a'); assert.equal(result.receipt?.raw, result.homepageRaw);
  assert.equal(JSON.stringify(f.source), before);
});

test('consumed current HOME draft retains original canonical supporting draft and every required receipt', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = homeFixture();
  const consumed = JSON.stringify({ ...f.bundle, draftRaw: null });
  const result = rebindRecoveryClaimInputs(f.source, null, consumed, 'owner-a');
  assert.equal(result.kind, 'ready'); if (result.kind !== 'ready') return;
  assert.equal(decodeHomepageBundle(result.homepageRaw!, 'owner-a')?.draft, null);
  const support = decodeHomepageBundle(result.receipt!.raw, 'owner-a'); assert.ok(support?.draft);
  assert.equal(result.receipt!.operationId, f.receipt.handoffId);
  assert.equal(homepageHandoffMatchesTrip(support.draft as HomeTripDraft, { ...f.trip, ownerId: 'owner-a' }), true);
});

test('HOME required support cannot be missing, pending, unrelated or semantically changed', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = homeFixture();
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, null, 'owner-a'), { kind: 'held', reason: 'homepage-required' });
  const withoutSupport = structuredClone(f.source); withoutSupport.entry.receipt = null;
  assert.deepEqual(rebindRecoveryClaimInputs(withoutSupport, null, JSON.stringify({ ...f.bundle, draftRaw: null }), 'owner-a'), { kind: 'held', reason: 'homepage-supporting-draft-required' });
  const pending = createPendingIntakeReceipt(f.snapshot, { tripId: f.trip.id, handoffId: 'pending-home' });
  const pendingRaw = JSON.stringify({ version: 1, inputRaw: JSON.stringify({ snapshot: f.snapshot, receipt: pending }), draftRaw: JSON.stringify({ version: 2, phase: 'pending-interpretation', receipt: pending }) });
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, pendingRaw, 'owner-a'), { kind: 'held', reason: 'homepage-pending' });
  const changed = JSON.stringify({ ...f.bundle, inputRaw: JSON.stringify({ snapshot: { ...f.snapshot, entries: [...f.snapshot.entries].reverse() }, receipt: f.receipt }) });
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, changed, 'owner-a'), { kind: 'held', reason: 'homepage-semantic-mismatch' });
  const unrelated = JSON.stringify({ ...f.bundle, inputRaw: JSON.stringify({ snapshot: f.snapshot, receipt: { ...f.receipt, tripId: 'other-trip' } }) });
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, unrelated, 'owner-a'), { kind: 'held', reason: 'homepage-trip-mismatch' });
});

test('canonical HOME metadata identity and actual completed input must agree', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = homeFixture();
  const changed = structuredClone(f.source); changed.entry.receipt!.operationId = 'unrelated-operation';
  assert.deepEqual(rebindRecoveryClaimInputs(changed, null, f.raw, 'owner-a'), { kind: 'held', reason: 'homepage-receipt-mismatch' });
  const noReceipt = JSON.stringify({ version: 1, inputRaw: JSON.stringify({ snapshot: f.snapshot }), draftRaw: null });
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, noReceipt, 'owner-a'), { kind: 'held', reason: 'homepage-unassociated' });
  const noSemanticProof = JSON.parse(f.bundle.inputRaw); delete noSemanticProof.receipt.semanticInputFingerprint;
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, JSON.stringify({ ...f.bundle, inputRaw: JSON.stringify(noSemanticProof) }), 'owner-a'), { kind: 'held', reason: 'homepage-semantic-proof-required' });
});

test('owner-dependent HOME route review key is checked and recomputed with its receipt', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = homeFixture(true);
  const result = rebindRecoveryClaimInputs(f.source, null, f.raw, 'owner-a');
  assert.equal(result.kind, 'ready'); if (result.kind !== 'ready') return;
  const snapshot = decodeHomepageBundle(result.homepageRaw!, 'owner-a')!.storedInput!.snapshot;
  assert.equal(snapshot.routeReview!.reviewedInputKey, homepageRouteReviewKey(snapshot, f.evidence));
  assert.notEqual(snapshot.routeReview!.reviewedInputKey, f.snapshot.routeReview!.reviewedInputKey);
  assert.deepEqual(snapshot.entries, f.snapshot.entries); assert.equal(snapshot.revision, f.snapshot.revision);
});

test('guest-only checked source and nonempty exact owner are required; optional absent metadata stays absent', async () => {
  const { rebindRecoveryClaimInputs } = await api(), f = fixture();
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, null, 'owner-a'), { kind: 'ready', input: null, receipt: null, builderRaw: null, homepageRaw: null });
  assert.deepEqual(rebindRecoveryClaimInputs(f.source, null, null, '  '), { kind: 'held', reason: 'owner-required' });
  assert.deepEqual(rebindRecoveryClaimInputs(envelope('foreign', 'owner-b'), null, null, 'owner-a'), { kind: 'held', reason: 'source-not-guest' });
  const invalid = structuredClone(f.source); invalid.entry.pointer.writeId = 'another-write';
  assert.deepEqual(rebindRecoveryClaimInputs(invalid, null, null, 'owner-a'), { kind: 'held', reason: 'source-envelope-invalid' });
});

test('combined frozen Builder and HOME metadata remain complete, deterministic and source-retaining', async () => {
  const { rebindRecoveryClaimInputs } = await api(), builder = builderFixture(), home = homeFixture();
  home.source.entry.input = structuredClone(builder.source.entry.input);
  const freeze = (value: unknown) => {
    if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  };
  freeze(home.source);
  const before = JSON.stringify(home.source);
  const first = rebindRecoveryClaimInputs(home.source, builder.raw, home.raw, 'owner-a');
  assert.equal(first.kind, 'ready'); if (first.kind !== 'ready') return;
  assert.ok(first.input); assert.ok(first.receipt); assert.ok(first.builderRaw); assert.ok(first.homepageRaw);
  assert.deepEqual(rebindRecoveryClaimInputs(home.source, builder.raw, home.raw, 'owner-a'), first);
  const other = rebindRecoveryClaimInputs(home.source, builder.raw, home.raw, 'owner-b');
  assert.equal(other.kind, 'ready'); if (other.kind !== 'ready') return;
  assert.equal(other.input!.ownerId, 'owner-b'); assert.equal(other.receipt!.ownerId, 'owner-b');
  assert.notEqual(other.homepageRaw, first.homepageRaw);
  assert.equal(JSON.stringify(home.source), before);
});
