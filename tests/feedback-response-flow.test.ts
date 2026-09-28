import assert from "node:assert/strict";
import test from "node:test";
import { beginFeedbackAttempt, completeFeedbackAttempt, failFeedbackAttempt, reconcileFeedbackAttempt, type FeedbackResponseFlow } from "../lib/easyt/feedback-response-flow.ts";

const open: FeedbackResponseFlow = { phase: "open", rating: 4, comment: " useful ", attempt: null };
const begun = beginFeedbackAttempt(open, "00000000-0000-4000-8000-000000000001");
test("a rating alone does not send, and double send locks one attempt", () => {
  assert.equal(open.phase, "open");
  assert.equal(begun.phase, "sending");
  assert.equal(beginFeedbackAttempt(begun, "another").attempt?.attemptId, begun.attempt?.attemptId);
});
test("uncertain failure retains exact immutable payload for retry", () => {
  const uncertain = failFeedbackAttempt(begun, true);
  assert.equal(uncertain.phase, "uncertain");
  assert.deepEqual(uncertain.attempt, { attemptId: "00000000-0000-4000-8000-000000000001", rating: 4, comment: "useful" });
  assert.equal(beginFeedbackAttempt(uncertain, "different").attempt?.attemptId, begun.attempt?.attemptId);
  assert.equal(reconcileFeedbackAttempt(uncertain, false).phase, "open");
  assert.equal(reconcileFeedbackAttempt(uncertain, false).attempt, null);
  assert.equal(reconcileFeedbackAttempt(uncertain, true).phase, "sent");
});
test("definite failure permits a fresh attempt; another accepted response is not this payload", () => {
  const failed = failFeedbackAttempt(begun, false);
  assert.equal(failed.phase, "failed");
  assert.equal(beginFeedbackAttempt(failed, "00000000-0000-4000-8000-000000000002").attempt?.attemptId, "00000000-0000-4000-8000-000000000002");
  assert.equal(completeFeedbackAttempt(begun, "already-submitted").phase, "already-submitted");
});
