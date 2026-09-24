import assert from "node:assert/strict";
import test from "node:test";
import { createDiscoveryDraft } from "../lib/easyt/discovery-draft.ts";
import { projectDiscovery } from "../lib/easyt/discovery-projection.ts";
import { discoveryReviewState } from "../lib/easyt/discovery-review-state.ts";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";

const mention = resolvePlaceMentions("Australia").mentions[0]!;
const projection = projectDiscovery({ mention, draft: createDiscoveryDraft(), context: { interests: [], existingPlaceIds: [] } });
const base = projection.places.find(place => place.actionability === "overnight-base")!;
const visit = projection.places.find(place => place.actionability === "visit")!;
const browse = projection.places.find(place => place.actionability === "browse-only")!;
const selectedBase = { [mention.mentionId]: base.id };

test("a selected base cannot confirm a mixed exploratory shortlist", () => {
  for (const exploratoryId of [visit.id, browse.id, "missing-reviewed-id"]) {
    const draft = { ...createDiscoveryDraft(), baseByIntentId: selectedBase, shortlistIds: [base.id, exploratoryId] };
    const review = discoveryReviewState(mention.mentionId, draft, projection, [base.id]);
    assert.equal(review.canConfirm, false);
    assert.equal(review.choices.length, 2);
    assert.equal(review.choices[0]?.existing, true);
    assert.equal(review.choices[1]?.confirmable, false);
  }
});

test("every shortlisted overnight base is confirmable; a valid chosen base works alone", () => {
  const draft = { ...createDiscoveryDraft(), shortlistIds: [base.id] };
  assert.equal(discoveryReviewState(mention.mentionId, draft, projection).canConfirm, true);
  assert.equal(discoveryReviewState(mention.mentionId, { ...draft, shortlistIds: [], baseByIntentId: selectedBase }, projection).canConfirm, true);
  assert.equal(discoveryReviewState(mention.mentionId, { ...draft, shortlistIds: [], baseByIntentId: { [mention.mentionId]: visit.id } }, projection).canConfirm, false);
  assert.equal(discoveryReviewState(mention.mentionId, createDiscoveryDraft(), projection).canConfirm, false);
  const unsupported = { ...projection, places: [...projection.places, { ...base, id: "fixture-unroutable-base" }] };
  assert.equal(discoveryReviewState(mention.mentionId,
    { ...draft, shortlistIds: ["fixture-unroutable-base"] }, unsupported).canConfirm, false);
});

test("review preserves and flags choices outside the selected browsing direction", () => {
  const direction = projection.directions.find(item => !item.placeIds.includes(base.id))!;
  const draft = { ...createDiscoveryDraft(), directionId: direction.id, shortlistIds: [base.id, browse.id] };
  const review = discoveryReviewState(mention.mentionId, draft, projection);
  assert.deepEqual(review.choices.map(choice => choice.id), [base.id, browse.id]);
  assert.equal(review.choices[0]?.outsideDirection, true);
  assert.equal(review.hasOutsideDirection, true);
});
