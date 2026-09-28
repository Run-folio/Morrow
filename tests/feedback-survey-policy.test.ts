import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CONTEXTUAL_FEEDBACK_SURVEY_ID, isMeaningfulFeedbackAcknowledgement, normalizeContextualFeedback } from "../lib/easyt/feedback-survey.ts";
import { contextualFeedbackPayloadHash } from "../lib/easyt/feedback-survey-store.ts";

const yes = [
  ["itinerary-day-1", "activity-add"],
  ["itinerary-suggestion-stop-a-place-b", "idea-schedule"],
  ["itinerary-activity-move-activity-a", "activity-move"],
  ["stay-select-stop-a-hotel-b", "stay-select"],
  ["itinerary-suggestion-cusco-viator:12345", "idea-schedule"],
] as const;
const no = ["itinerary-day-0", "itinerary-day-1-extra", "itinerary-day-future", "itinerary-suggestion-", "itinerary-activity-place-", "stay-select-", "stay-remove-stop-a-hotel-b", "itinerary-stay-stop-a", "itinerary-item-undo", "trip-title", "explore-save-place-a", "transport-choice-leg-a", "unresolved-place-dismiss-a", "itinerary-day-promotion-1"];
for (const [key, action] of yes) test(`approved acknowledgement ${action} ${key}`, () => assert.equal(isMeaningfulFeedbackAcknowledgement(key, action), true));
for (const key of no) test(`unapproved acknowledgement ${key}`, () => assert.equal(isMeaningfulFeedbackAcknowledgement(key, "activity-add"), false));
test("a future caller with the same key cannot qualify without explicit action opt-in", () => {
  for (const [key] of yes) assert.equal(isMeaningfulFeedbackAcknowledgement(key), false);
  assert.equal(isMeaningfulFeedbackAcknowledgement("itinerary-day-1", "stay-select"), false);
});

test("payload identity uses normalized immutable rating and note", () => {
  assert.equal(CONTEXTUAL_FEEDBACK_SURVEY_ID, "contextual-beta-v1");
  const a = normalizeContextualFeedback(3, "  useful  ");
  const b = normalizeContextualFeedback(3, "useful");
  assert.deepEqual(a, b);
  assert.equal(contextualFeedbackPayloadHash(a), contextualFeedbackPayloadHash(b));
  assert.notEqual(contextualFeedbackPayloadHash(a), contextualFeedbackPayloadHash(normalizeContextualFeedback(4, "useful")));
  assert.throws(() => normalizeContextualFeedback(0, ""));
  assert.throws(() => normalizeContextualFeedback(1, "x".repeat(1001)));
});

test("migration leaves ordinary feedback unbounded and survey uniqueness account-scoped", () => {
  const sql = readFileSync(new URL("../db/migrations/0015_easyt_feedback_survey.sql", import.meta.url), "utf8");
  assert.match(sql, /unique index[\s\S]*\(owner_id, survey_id\)/i);
  assert.match(sql, /where owner_id is not null and survey_id is not null/i);
  assert.match(sql, /on delete cascade/i);
  assert.doesNotMatch(sql, /alter column owner_id set not null/i);
});
