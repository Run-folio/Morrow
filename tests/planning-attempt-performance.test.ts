import assert from "node:assert/strict";
import test from "node:test";
import {
  markPlanningMilestone,
  planningAttemptDurations,
  planningContentIsActionable,
  planningAttemptOutcome,
  planningRequiredInterpretationIsComplete,
} from "../lib/easyt/planning-attempt-performance.ts";

test("milestones are one-time, ordered, elapsed from submit, and do not invent missing stages", () => {
  const id = "opaque-task7-order";
  markPlanningMilestone(id, "shell-visible", 50);
  assert.deepEqual(planningAttemptDurations(id), {});
  markPlanningMilestone(id, "submit", 100);
  markPlanningMilestone(id, "durable-intake", 135);
  markPlanningMilestone(id, "shell-visible", 150);
  markPlanningMilestone(id, "shell-visible", 999);
  markPlanningMilestone(id, "first-actionable", 140);
  assert.deepEqual(planningAttemptDurations(id), {
    submit: 0, "durable-intake": 35, "shell-visible": 50,
  });
  markPlanningMilestone(id, "first-actionable", 180);
  assert.equal(planningAttemptDurations(id)["first-actionable"], 80);
  assert.equal(planningAttemptDurations(id)["route-ready"], undefined);
});

test("shell and preserved Describe prompt are orientation, not first actionable content", () => {
  assert.equal(planningContentIsActionable({ mode: "describe", editableCanonicalOccurrences: 0, selectableClarification: false, controlsEnabled: true }), false);
  assert.equal(planningContentIsActionable({ mode: "describe", editableCanonicalOccurrences: 0, selectableClarification: true, controlsEnabled: true }), true);
  assert.equal(planningContentIsActionable({ mode: "describe", editableCanonicalOccurrences: 1, selectableClarification: false, controlsEnabled: false }), false);
  assert.equal(planningContentIsActionable({ mode: "describe", editableCanonicalOccurrences: 1, selectableClarification: false, controlsEnabled: true }), true);
  assert.equal(planningContentIsActionable({ mode: "stops", editableCanonicalOccurrences: 1, selectableClarification: false, controlsEnabled: true }), true);
  assert.equal(planningContentIsActionable({ mode: "stops", editableCanonicalOccurrences: 0, selectableClarification: true, controlsEnabled: true }), false);
});

test("required interpretation can finish at actionable Discovery while route readiness remains separate", () => {
  const base = { pendingInterpretation: false, pendingLookup: false, failedLookup: false, routeOccurrences: 0, selectableDiscovery: true };
  assert.equal(planningRequiredInterpretationIsComplete(base), true);
  assert.equal(planningRequiredInterpretationIsComplete({ ...base, selectableDiscovery: false }), false);
  assert.equal(planningRequiredInterpretationIsComplete({ ...base, pendingLookup: true }), false);
  assert.equal(planningRequiredInterpretationIsComplete({ ...base, failedLookup: true }), false);
});

test("error is terminal without fabricated completion and repeated rerenders cannot emit duplicate marks", () => {
  const id = "opaque-task7-error";
  markPlanningMilestone(id, "submit", 100);
  markPlanningMilestone(id, "durable-intake", 120);
  planningAttemptOutcome(id, "error", 130);
  markPlanningMilestone(id, "route-ready", 150);
  planningAttemptOutcome(id, "abandoned", 160);
  assert.deepEqual(planningAttemptDurations(id), { submit: 0, "durable-intake": 20 });
  markPlanningMilestone(id, "submit", 200);
  markPlanningMilestone(id, "durable-intake", 205);
  markPlanningMilestone(id, "first-actionable", 250);
  assert.deepEqual(planningAttemptDurations(id), { submit: 0, "durable-intake": 5, "first-actionable": 50 });
});

test("retry keeps browser timing marks within the new attempt", () => {
  const id = "opaque-task7-retry-marks";
  Object.defineProperty(globalThis, "window", { configurable: true, value: { performance } });
  try {
    markPlanningMilestone(id, "submit", 100);
    markPlanningMilestone(id, "durable-intake", 120);
    planningAttemptOutcome(id, "error", 130);
    markPlanningMilestone(id, "submit", 200);
    markPlanningMilestone(id, "first-actionable", 240);
    const names = performance.getEntriesByType("mark").map((entry) => entry.name)
      .filter((name) => name.startsWith(`morrovia-planning:${id}:`));
    assert.deepEqual(names, [
      `morrovia-planning:${id}:submit`,
      `morrovia-planning:${id}:first-actionable`,
    ]);
  } finally {
    for (const entry of performance.getEntriesByType("mark"))
      if (entry.name.startsWith(`morrovia-planning:${id}:`)) performance.clearMarks(entry.name);
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("diagnostics contain only allow-listed stage names and durations, never traveller content", () => {
  const id = "opaque-task7-privacy";
  markPlanningMilestone(id, "submit", 100);
  markPlanningMilestone(id, "first-actionable", 140);
  const diagnostic = JSON.stringify(planningAttemptDurations(id));
  assert.match(diagnostic, /first-actionable/);
  assert.doesNotMatch(diagnostic, /prompt|Tokyo|latitude|longitude|document|ownerId|receipt|coordinate|tripId/);
  assert.equal(typeof (globalThis as { localStorage?: unknown }).localStorage, "undefined");
});
