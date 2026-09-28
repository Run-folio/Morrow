import assert from "node:assert/strict";
import test from "node:test";
import { advanceFeedbackActiveUse, feedbackActiveUseStorageKey, feedbackActiveUseLeaseKey, feedbackInputIsRecent, feedbackTimeQualified, type ActiveUseSnapshot } from "../lib/easyt/feedback-active-use.ts";

const base: ActiveUseSnapshot = { elapsedMs: 599_000, lastTickMs: 0, lastInputMs: 0 };
test("foreground clock adds at most one second and meets 10-minute threshold", () => {
  assert.equal(advanceFeedbackActiveUse(base, 20_000, true).elapsedMs, 600_000);
  assert.equal(feedbackTimeQualified(599_999), false);
  assert.equal(feedbackTimeQualified(600_000), true);
});
test("hidden, blurred, idle or contended time adds nothing", () => {
  assert.equal(advanceFeedbackActiveUse(base, 1_000, false).elapsedMs, 599_000);
  assert.equal(feedbackInputIsRecent(60_000, 0), true);
  assert.equal(feedbackInputIsRecent(60_001, 0), false);
  assert.equal(feedbackInputIsRecent(30_000, null), false);
});
test("reload retains cumulative time but requires fresh input", () => {
  const resumed = advanceFeedbackActiveUse({ elapsedMs: 599_000, lastTickMs: null, lastInputMs: null }, 80_000, false);
  assert.equal(resumed.elapsedMs, 599_000);
  assert.equal(resumed.lastTickMs, 80_000);
  assert.equal(feedbackInputIsRecent(81_000, resumed.lastInputMs), false);
});
test("owner and survey keys are distinct from legacy unscoped feedback keys", () => {
  assert.notEqual(feedbackActiveUseStorageKey("owner-a", "survey-v1"), feedbackActiveUseStorageKey("owner-b", "survey-v1"));
  assert.notEqual(feedbackActiveUseLeaseKey("owner-a", "survey-v1"), feedbackActiveUseStorageKey("owner-a", "survey-v1"));
  assert.doesNotMatch(feedbackActiveUseStorageKey("owner-a", "survey-v1"), /dashboard-feedback-dismissed|dashboard-feedback-draft/);
});
