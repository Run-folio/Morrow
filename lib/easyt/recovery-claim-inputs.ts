import { decodeRecoveryEnvelope, decodeRawRecovery, type RecoveryEnvelope } from './durable-recovery-domain.ts';
import { readBuilderInputDraft, builderInputDraftKey, type BuilderInputDraft } from './trip-builder-input-draft.ts';
import { decodeHomepageBundle, type HomepageBundle } from './homepage-persistence.ts';
import {
  homepageHandoffMatchesTrip, homepageHandoffReceiptForOwner, homepageReceiptForProjection,
  homepageSemanticInputFingerprint, reusableHomepageReceipt,
  type HomeTripDraft, type HomepageHandoffReceipt, type HomepageInputSnapshot,
} from './home-trip-handoff.ts';
import { homepageRouteReviewKey, type HomepageRouteEvidence } from './home-route-choice.ts';
import type { CanonicalEasyTTrip, JourneyEndSelection } from './trip.ts';

type Held = { kind: 'held'; reason: string };
export type RecoveryClaimInputs = Held | {
  kind: 'ready'; input: RecoveryEnvelope['entry']['input']; receipt: RecoveryEnvelope['entry']['receipt'];
  builderRaw: string | null; homepageRaw: string | null;
};
type CheckedHome = {
  bundle: HomepageBundle; snapshot: HomepageInputSnapshot; receipt: HomepageHandoffReceipt; draft: HomeTripDraft | null;
};
const held = (reason: string): Held => ({ kind: 'held', reason });
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function checkedHome(raw: string, trip: CanonicalEasyTTrip): CheckedHome | Held {
  const decoded = decodeHomepageBundle(raw, null);
  if (!decoded) return held('homepage-unsupported');
  const { storedInput, bundle } = decoded;
  if (storedInput?.receipt?.version === 2 || object(decoded.draft) && decoded.draft.version === 2 || storedInput?.review) return held('homepage-pending');
  const receipt = storedInput?.receipt;
  if (!storedInput || receipt?.version !== 1) return held('homepage-unassociated');
  if (receipt.tripId !== trip.id) return held('homepage-trip-mismatch');
  if (!receipt.semanticInputFingerprint) return held('homepage-semantic-proof-required');
  if (receipt.semanticInputFingerprint !== homepageSemanticInputFingerprint(storedInput.snapshot)) return held('homepage-semantic-mismatch');
  let draft: HomeTripDraft | null = null;
  if (decoded.draft !== null) {
    draft = decoded.draft as HomeTripDraft;
    const draftReceipt = homepageHandoffReceiptForOwner(draft, null);
    if (!draftReceipt || !sameReceipt(receipt, draftReceipt) || !reusableHomepageReceipt(storedInput, draft)) return held('homepage-receipt-mismatch');
    if (!homepageHandoffMatchesTrip(draft, trip)) return held('homepage-trip-mismatch');
  }
  return { bundle, snapshot: storedInput.snapshot, receipt, draft };
}

function sameReceipt(left: HomepageHandoffReceipt, right: HomepageHandoffReceipt) {
  return left.version === right.version && left.ownerId === right.ownerId && left.handoffId === right.handoffId
    && left.tripId === right.tripId && left.inputFingerprint === right.inputFingerprint
    && left.semanticInputFingerprint === right.semanticInputFingerprint;
}

/** Route-review keys also include owner. Their embedded normalized evidence
 * must reproduce the old key through the existing codec before owner rebinding. */
function rebindSnapshot(snapshot: HomepageInputSnapshot, ownerId: string): HomepageInputSnapshot | Held {
  const rebound = { ...structuredClone(snapshot), ownerId };
  const review = snapshot.routeReview;
  if (!review) return rebound;
  try {
    const key: unknown = JSON.parse(review.reviewedInputKey);
    if (!object(key) || key.version !== 1 || ![null, 'one_way', 'return_to_start'].includes(key.type as string | null)
      || !['clear', 'unknown', 'requires_review'].includes(String(key.status)) || !object(key.end)
      || snapshot.tripType?.state !== 'selected' || review.acceptedTripType !== snapshot.tripType.value) return held('homepage-route-review-unsupported');
    let journeyEnd: JourneyEndSelection;
    if (key.end.mode === 'unknown' || key.end.mode === 'same_as_start') journeyEnd = { mode: key.end.mode };
    else if (key.end.mode === 'explicit' && object(key.end.place)) {
      const place = key.end.place;
      if (typeof place.canonicalPlaceId === 'string' && place.canonicalPlaceId.trim()) {
        // Only the canonical identity enters this key; this temporary label is
        // never emitted as traveller input or as a destination.
        journeyEnd = { mode: 'explicit', place: { name: '', canonicalPlaceId: place.canonicalPlaceId } };
      } else if (typeof place.name === 'string' && typeof place.country === 'string'
        && (place.providerId === null || typeof place.providerId === 'string')) {
        journeyEnd = { mode: 'explicit', place: { name: place.name, country: place.country,
          ...(typeof place.providerId === 'string' ? { providerId: place.providerId } : {}) } };
      } else return held('homepage-route-review-unsupported');
    } else return held('homepage-route-review-unsupported');
    const evidence: HomepageRouteEvidence = { tripType: key.type as HomepageRouteEvidence['tripType'],
      status: key.status as HomepageRouteEvidence['status'], source: 'legacy', journeyEnd };
    if (homepageRouteReviewKey(snapshot, evidence) !== review.reviewedInputKey) return held('homepage-route-review-unsupported');
    rebound.routeReview = { ...review, reviewedInputKey: homepageRouteReviewKey(rebound, evidence) };
    return rebound;
  } catch { return held('homepage-route-review-unsupported'); }
}

function rebindHome(home: CheckedHome, support: HomeTripDraft, ownerId: string, trip: CanonicalEasyTTrip): { raw: string } | Held {
  const snapshot = rebindSnapshot(home.snapshot, ownerId);
  if ('kind' in snapshot) return snapshot;
  const draft = structuredClone(home.draft ?? support);
  if (!draft.homepage) return held('homepage-supporting-draft-required');
  const draftReview = draft.homepage.choices.routeReview, snapshotReview = home.snapshot.routeReview;
  if (Boolean(draftReview) !== Boolean(snapshotReview) || draftReview && snapshotReview
    && (draftReview.version !== snapshotReview.version || draftReview.acceptedTripType !== snapshotReview.acceptedTripType
      || draftReview.reviewedInputKey !== snapshotReview.reviewedInputKey)) return held('homepage-review-mismatch');
  draft.homepage.ownerId = ownerId;
  if (draftReview) draft.homepage.choices.routeReview = structuredClone(snapshot.routeReview!);
  const computed = homepageReceiptForProjection(snapshot, draft, trip.id);
  const receipt = { ...home.receipt, ownerId, inputFingerprint: computed.inputFingerprint, semanticInputFingerprint: computed.semanticInputFingerprint };
  draft.homepage.receipt = receipt;
  const input = JSON.parse(home.bundle.inputRaw!) as Record<string, unknown>;
  input.snapshot = snapshot; input.receipt = receipt;
  const bundle: HomepageBundle = { version: 1, inputRaw: JSON.stringify(input), draftRaw: home.draft ? JSON.stringify(draft) : null };
  const raw = JSON.stringify(bundle), decoded = decodeHomepageBundle(raw, ownerId);
  if (!decoded?.storedInput || decoded.storedInput.receipt?.version !== 1
    || decoded.storedInput.receipt.semanticInputFingerprint !== homepageSemanticInputFingerprint(decoded.storedInput.snapshot)
    || !reusableHomepageReceipt(decoded.storedInput, draft)
    || !homepageHandoffMatchesTrip(draft, { ...trip, ownerId })) return held('homepage-rebound-invalid');
  return { raw };
}

/** Pure preparation only. This grants no claim/account authority, writes no
 * storage and never drops a required input or completed handoff receipt. */
export function rebindRecoveryClaimInputs(source: RecoveryEnvelope, builderRaw: string | null, homepageRaw: string | null, ownerId: string): RecoveryClaimInputs {
  if (typeof ownerId !== 'string' || !ownerId.trim()) return held('owner-required');
  if (source?.handle?.ownerId !== null) return held('source-not-guest');
  try {
    const checked = decodeRecoveryEnvelope(JSON.stringify(source), source.handle);
    if (checked.kind !== 'readable') return held('source-envelope-invalid');
    source = checked.value;
    if (source.handle.ownerId !== null) return held('source-not-guest');
    const raw = decodeRawRecovery(source.rawRecovery, source.handle);
    if (raw.kind !== 'readable' || JSON.parse(source.rawRecovery).trip.schemaVersion !== 2) return held('source-trip-unsupported');
    const trip = raw.value.trip as CanonicalEasyTTrip;
    if (trip.ownerId !== null) return held('source-not-guest');
    let input: RecoveryEnvelope['entry']['input'] = null, reboundBuilder: string | null = null;
    if (source.entry.input && builderRaw === null) return held('builder-input-required');
    if (source.entry.input && source.entry.input.raw !== builderRaw) return held('builder-input-changed');
    if (builderRaw !== null) {
      const key = builderInputDraftKey(null, trip.id);
      const read = readBuilderInputDraft(Object.freeze({ getItem: (observed: string) => observed === key ? builderRaw : null }), trip, null);
      if (read.kind !== 'readable') return held('builder-input-unsupported');
      const draft = JSON.parse(builderRaw) as BuilderInputDraft;
      if (source.entry.input && source.entry.input.inputRevision !== draft.inputRevision) return held('builder-input-revision-mismatch');
      reboundBuilder = JSON.stringify({ ...draft, ownerId });
      const targetKey = builderInputDraftKey(ownerId, trip.id);
      const target = readBuilderInputDraft(Object.freeze({ getItem: (observed: string) => observed === targetKey ? reboundBuilder : null }), { ...trip, ownerId }, ownerId);
      if (target.kind !== 'readable' || target.draft.inputRevision !== draft.inputRevision) return held('builder-input-rebound-invalid');
      input = { ownerId, tripId: trip.id, inputRevision: draft.inputRevision, raw: reboundBuilder };
    }

    let receipt: RecoveryEnvelope['entry']['receipt'] = null, reboundHomepage: string | null = null;
    if (source.entry.receipt && homepageRaw === null) return held('homepage-required');
    if (homepageRaw !== null) {
      const decoded = decodeHomepageBundle(homepageRaw, null);
      if (!source.entry.receipt && decoded?.bundle.inputRaw === null && decoded.bundle.draftRaw === null) reboundHomepage = homepageRaw;
      else {
        const current = checkedHome(homepageRaw, trip);
        if ('kind' in current) return current;
        const original = source.entry.receipt ? checkedHome(source.entry.receipt.raw, trip) : current;
        if ('kind' in original) return original.reason === 'homepage-unsupported' ? held('homepage-receipt-unsupported') : original;
        if (source.entry.receipt && source.entry.receipt.operationId !== original.receipt.handoffId
          || !sameReceipt(current.receipt, original.receipt)) return held('homepage-receipt-mismatch');
        const support = current.draft ?? original.draft;
        if (!support) return held('homepage-supporting-draft-required');
        const currentRebound = rebindHome(current, support, ownerId, trip);
        if ('kind' in currentRebound) return currentRebound;
        const originalRebound = rebindHome(original, support, ownerId, trip);
        if ('kind' in originalRebound) return originalRebound;
        reboundHomepage = currentRebound.raw;
        receipt = { ownerId, tripId: trip.id, operationId: original.receipt.handoffId, raw: originalRebound.raw };
      }
    }
    return { kind: 'ready', input, receipt, builderRaw: reboundBuilder, homepageRaw: reboundHomepage };
  } catch { return held('claim-inputs-unsupported'); }
}
