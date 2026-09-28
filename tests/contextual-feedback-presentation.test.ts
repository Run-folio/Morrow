import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { feedbackSlotOnEntry, type FeedbackSlotState } from "../lib/easyt/feedback-entry-policy.ts";

const idle: FeedbackSlotState = { entryKey: null, visible: false };
test("eligibility acquired during a workspace entry waits for the next entry", () => {
  const first = feedbackSlotOnEntry(idle, "itinerary:day-1", false, false);
  assert.equal(first.visible, false);
  assert.equal(feedbackSlotOnEntry(first, "itinerary:day-1", true, false).visible, false);
  assert.equal(feedbackSlotOnEntry(first, "itinerary:day-2", true, false).visible, true);
});
test("blocked entry defers and an already rendered invitation stays in place", () => {
  const blocked = feedbackSlotOnEntry(idle, "overview", true, true);
  assert.equal(blocked.visible, false);
  assert.equal(feedbackSlotOnEntry(blocked, "overview", true, false).visible, false);
  const shown = feedbackSlotOnEntry(blocked, "itinerary:day-1", true, false);
  assert.equal(shown.visible, true);
  assert.equal(feedbackSlotOnEntry(shown, "itinerary:day-1", false, true).visible, true);
});
test("shared shell owns one controller and workspaces use the same slot", () => {
  const shell = readFileSync(new URL("../components/easyt/trip-shell.tsx", import.meta.url), "utf8");
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../components/easyt/trip-overview-workspace.tsx", import.meta.url), "utf8");
  assert.match(shell, /ContextualFeedbackProvider/);
  assert.match(itinerary, /<ContextualFeedbackSlot workspace="itinerary"/);
  assert.match(overview, /<ContextualFeedbackSlot workspace="overview"/);
});
test("only four reviewed call sites opt in and acknowledgement follows the exact cache", () => {
  const persistence = readFileSync(new URL("../components/easyt/use-trip-mutation-persistence.ts", import.meta.url), "utf8");
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const stay = readFileSync(new URL("../components/easyt/trip-stay-workspace.tsx", import.meta.url), "utf8");
  assert.match(persistence, /if \(!cacheSavedTrip\(saved, recovery\.handle\)\) return;[\s\S]*setLastAcknowledgedMutation/);
  for (const action of ["activity-add", "idea-schedule", "activity-move"]) assert.match(itinerary, new RegExp(`"${action}"`));
  assert.match(stay, /"stay-select"/);
  assert.doesNotMatch(readFileSync(new URL("../components/easyt/trip-overview-workspace.tsx", import.meta.url), "utf8"), /"activity-add"|"idea-schedule"|"activity-move"|"stay-select"/);
});
test("feedback is contextual, deliberate and absent from fixed Dashboard placement", () => {
  const component = readFileSync(new URL("../components/easyt/easyt-feedback.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/journey/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../components/easyt/contextual-feedback-controller.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboard, /<EasyTFeedback\s*\/>/);
  assert.match(controller, /<EasyTFeedback/);
  assert.match(component, /Send feedback/);
  assert.match(component, /Share feedback/);
  assert.match(component, /Try again/);
  assert.match(component, /requestAnimationFrame\(\(\) => questionRef\.current\?\.focus\(\)\)/);
  assert.match(component, /role="radiogroup"/);
  assert.match(component, /aria-checked=\{flow\.rating === index \+ 1\}/);
  assert.match(component, /maxLength=\{1000\}/);
  assert.match(component, /sending\.current/);
  assert.match(component, /reconcile\(true\)/);
  assert.doesNotMatch(component, /easyt-dashboard-feedback-dismissed|easyt-dashboard-feedback-draft/);
  const css = readFileSync(new URL("../components/easyt/contextual-feedback.module.css", import.meta.url), "utf8");
  assert.match(css, /min-width: 44px/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /position: fixed/);
});
test("production Storybook covers populated itinerary and overview plus the four response views", () => {
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../components/easyt/trip-overview-workspace.stories.tsx", import.meta.url), "utf8");
  const feedback = readFileSync(new URL("../components/easyt/contextual-feedback.stories.tsx", import.meta.url), "utf8");
  assert.match(itinerary, /ContextualFeedbackPopulatedDay/);
  assert.match(overview, /ContextualFeedbackPopulatedOverview/);
  assert.match(itinerary, /feedbackStoryEligible: true/);
  assert.match(overview, /feedbackStoryEligible: true/);
  assert.match(feedback, /EasyTFeedback/);
  for (const state of ["Invitation", "OpenedForm", "SubmissionFailure", "Submitted"]) assert.match(feedback, new RegExp(`export const ${state}`));
});
test("qualified entry survives async hydration and dismissal cannot be undone by stale state", () => {
  const controller = readFileSync(new URL("../components/easyt/contextual-feedback-controller.tsx", import.meta.url), "utf8");
  assert.match(controller, /surveyStateCache/);
  assert.match(controller, /requestVersionRef/);
  assert.match(controller, /await retryDismiss\(\)/);
  assert.match(controller, /context\?\.hydrated/);
});
test("reviewed action metadata survives an intervening queued mutation until canonical acknowledgement", () => {
  const persistence = readFileSync(new URL("../components/easyt/use-trip-mutation-persistence.ts", import.meta.url), "utf8");
  assert.match(persistence, /pendingMeaningfulFeedbackRef/);
  assert.match(persistence, /if \(!cacheSavedTrip\(saved, recovery\.handle\)\) return;/);
  assert.match(persistence, /pendingMeaningfulFeedbackRef\.current\?\.originWriteId === recovery\.handle\.writeId/);
});
