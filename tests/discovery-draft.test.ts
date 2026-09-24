import assert from "node:assert/strict";
import test from "node:test";

import { createDiscoveryDraft, readDiscoveryDraft, reduceDiscoveryDraft, type DiscoveryDraft } from "../lib/easyt/discovery-draft.ts";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

test("an absent legacy choice starts a new draft, while an explicit empty choice migrates as empty", () => {
  const brief = extractStructuredTripBrief("Australia");
  const mentionId = brief.placeMentions?.[0]?.mentionId ?? "mention-australia";

  assert.equal(readDiscoveryDraft(brief, mentionId).status, "new");
  assert.equal(readDiscoveryDraft({ ...brief, countryDiscoveryChoices: {} }, mentionId).status, "new");
  const migrated = readDiscoveryDraft({ ...brief, countryDiscoveryChoices: { [mentionId]: [] } }, mentionId);
  assert.equal(migrated.status, "migrated");
  assert.deepEqual(migrated.draft.shortlistIds, []);
});

test("a saved draft wins over a legacy choice on every later read", () => {
  const brief = extractStructuredTripBrief("Australia");
  const mentionId = brief.placeMentions?.[0]?.mentionId ?? "mention-australia";
  const legacy = { ...brief, countryDiscoveryChoices: { [mentionId]: ["sydney"] } };
  const first = readDiscoveryDraft(legacy, mentionId);
  assert.equal(first.status, "migrated");
  assert.deepEqual(first.draft.shortlistIds, ["sydney"]);

  const cleared = reduceDiscoveryDraft(first.draft, { type: "remove-shortlist", placeId: "sydney" });
  const saved = JSON.parse(JSON.stringify({ ...legacy, discoveryDraftByMentionId: { [mentionId]: cleared } }));
  const reread = readDiscoveryDraft(saved, mentionId);
  assert.equal(reread.status, "current");
  assert.deepEqual(reread.draft.shortlistIds, []);
  assert.deepEqual(reread.draft.removedIds, ["sydney"]);
});

test("Back changes only the visible step and preserves every explicit decision", () => {
  let draft = createDiscoveryDraft();
  draft = reduceDiscoveryDraft(draft, { type: "change-direction", directionId: "east-coast" });
  draft = reduceDiscoveryDraft(draft, { type: "add-shortlist", placeId: "sydney" });
  draft = reduceDiscoveryDraft(draft, { type: "choose-base", intentId: "coast", baseId: "sydney" });
  draft = reduceDiscoveryDraft(draft, { type: "choose-visit-base", intentId: "reef", baseId: "cairns" });
  draft = reduceDiscoveryDraft(draft, { type: "mark-review-ready" });
  const back = reduceDiscoveryDraft(draft, { type: "set-step", step: "directions" });

  assert.deepEqual(back, { ...draft, step: "directions" });
});

test("an explicit base choice replaces the opposite choice for the same intent", () => {
  const intentId = "coast";
  const base = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "choose-base", intentId, baseId: "sydney" });
  const visitBase = reduceDiscoveryDraft(base, { type: "choose-visit-base", intentId, baseId: "melbourne" });
  assert.equal(visitBase.baseByIntentId[intentId], undefined);
  assert.equal(visitBase.visitBaseByIntentId[intentId], "melbourne");
  const changedBack = reduceDiscoveryDraft(visitBase, { type: "choose-base", intentId, baseId: "sydney" });
  assert.equal(changedBack.visitBaseByIntentId[intentId], undefined);
});

test("changing direction preserves decisions and requires renewed review", () => {
  const chosen = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "sydney" });
  const ready = reduceDiscoveryDraft(chosen, { type: "mark-review-ready" });
  const changed = reduceDiscoveryDraft(ready, { type: "change-direction", directionId: "outback" });

  assert.deepEqual(changed.shortlistIds, ["sydney"]);
  assert.equal(changed.reviewState, "editing");
  assert.equal(changed.directionId, "outback");
});

test("explicit removal survives JSON and explicit re-add restores a choice", () => {
  const chosen = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "sydney" });
  const removed = reduceDiscoveryDraft(chosen, { type: "remove-shortlist", placeId: "sydney" });
  const reloaded: DiscoveryDraft = JSON.parse(JSON.stringify(removed));
  assert.deepEqual(reloaded.shortlistIds, []);
  assert.deepEqual(reloaded.removedIds, ["sydney"]);

  const restored = reduceDiscoveryDraft(reloaded, { type: "add-shortlist", placeId: "sydney" });
  assert.deepEqual(restored.shortlistIds, ["sydney"]);
  assert.deepEqual(restored.removedIds, []);
  assert.deepEqual(reduceDiscoveryDraft(restored, { type: "reset" }), createDiscoveryDraft());
});

test("unsupported draft version fails closed and keeps its original payload", () => {
  const brief = extractStructuredTripBrief("Australia");
  const mentionId = brief.placeMentions?.[0]?.mentionId ?? "mention-australia";
  const future = { ...createDiscoveryDraft(), version: 99, futureDecision: "keep me" } as unknown as DiscoveryDraft;
  const saved = { ...brief, countryDiscoveryChoices: { [mentionId]: ["sydney"] }, discoveryDraftByMentionId: { [mentionId]: future } };
  const before = JSON.stringify(saved);
  const read = readDiscoveryDraft(saved, mentionId);

  assert.equal(read.status, "unsupported-version");
  assert.equal(read.draft, future);
  assert.equal(JSON.stringify(saved), before);
});

test("each mention keeps its own draft", () => {
  const brief = extractStructuredTripBrief("Australia and Japan");
  const first = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "sydney" });
  const second = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "tokyo" });
  const saved = { ...brief, discoveryDraftByMentionId: { australia: first, japan: second } };

  assert.deepEqual(readDiscoveryDraft(saved, "australia").draft.shortlistIds, ["sydney"]);
  assert.deepEqual(readDiscoveryDraft(saved, "japan").draft.shortlistIds, ["tokyo"]);
});
