import assert from "node:assert/strict";
import test from "node:test";

import { discoveryPlacesForMention } from "../lib/easyt/discovery-content.ts";
import { createDiscoveryDraft, reduceDiscoveryDraft, selectCanonicalSearchResult } from "../lib/easyt/discovery-draft.ts";
import { projectDiscovery } from "../lib/easyt/discovery-projection.ts";
import { discoveryReviewState } from "../lib/easyt/discovery-review-state.ts";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

const mention = extractStructuredTripBrief("Australia").placeMentions![0]!;
const places = discoveryPlacesForMention(mention);

test("card and canonical search add the same reviewed place, and Back preserves the choice", () => {
  const byCard = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "melbourne" });
  const bySearch = selectCanonicalSearchResult(createDiscoveryDraft(), { canonicalPlaceId: "melbourne", country: "Australia" }, places);
  assert.deepEqual(bySearch.shortlistIds, byCard.shortlistIds);
  assert.deepEqual(reduceDiscoveryDraft(bySearch, { type: "set-step", step: "directions" }).shortlistIds, ["melbourne"]);
  assert.deepEqual(reduceDiscoveryDraft(bySearch, { type: "remove-shortlist", placeId: "melbourne" }).removedIds, ["melbourne"]);
});

test("search rejects provider-only, wrong-country and browse-only route choices", () => {
  const empty = createDiscoveryDraft();
  assert.deepEqual(selectCanonicalSearchResult(empty, { canonicalPlaceId: "provider-only", country: "Australia" }, places), empty);
  assert.deepEqual(selectCanonicalSearchResult(empty, { canonicalPlaceId: "melbourne", country: "Japan" }, places), empty);
  const browse = places.find(place => place.actionability === "browse-only")!;
  assert.deepEqual(selectCanonicalSearchResult(empty, { canonicalPlaceId: browse.id, country: browse.country }, places, { type: "choose-base", intentId: mention.mentionId }), empty);
});

test("Stay here and split stay use only reviewed overnight settlements", () => {
  const bases = places.filter(place => place.actionability === "overnight-base");
  assert.ok(bases.length >= 2);
  const first = selectCanonicalSearchResult(createDiscoveryDraft(), { canonicalPlaceId: bases[0]!.id, country: bases[0]!.country }, places, { type: "choose-base", intentId: mention.mentionId });
  assert.equal(first.baseByIntentId[mention.mentionId], bases[0]!.id);
  const split = selectCanonicalSearchResult(first, { canonicalPlaceId: bases[1]!.id, country: bases[1]!.country }, places);
  assert.deepEqual(split.shortlistIds, [bases[1]!.id]);
  const changed = selectCanonicalSearchResult(split, { canonicalPlaceId: bases[1]!.id, country: bases[1]!.country }, places, { type: "choose-base", intentId: mention.mentionId });
  assert.equal(changed.baseByIntentId[mention.mentionId], bases[1]!.id);
  assert.deepEqual(reduceDiscoveryDraft(changed, { type: "reset" }), createDiscoveryDraft());
});

test("Visit from base keeps the original mention and requires a supported base", () => {
  const base = places.find(place => place.actionability === "overnight-base")!;
  const draft = selectCanonicalSearchResult(createDiscoveryDraft(), { canonicalPlaceId: base.id, country: base.country }, places,
    { type: "choose-visit-base", intentId: mention.mentionId });
  assert.equal(draft.visitBaseByIntentId[mention.mentionId], base.id);
  assert.equal(draft.baseByIntentId[mention.mentionId], undefined);
});

test("resumed direction missing from reviewed content remains visible as unresolved", () => {
  const draft = { ...createDiscoveryDraft(), directionId: "retired-direction", shortlistIds: ["melbourne"] };
  const projection = projectDiscovery({ mention, draft, context: { interests: [], existingPlaceIds: [] } });
  const review = discoveryReviewState(mention.mentionId, draft, projection);
  assert.equal(review.hasUnresolvedChoices, true);
  assert.equal(review.canConfirm, false);
  assert.equal(draft.directionId, "retired-direction");
});
