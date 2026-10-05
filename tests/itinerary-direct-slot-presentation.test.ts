import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planner = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.module.css", import.meta.url), "utf8");

test("every active day renders three compact slots with direct context carrying Add controls", () => {
  assert.match(planner, /itineraryPlanningParts\.map\(renderPeriod\)/);
  assert.match(planner, /onAddOpen\?\.\(part\)/);
  assert.match(planner, /aria-label=\{`\$\{copy\.addPlanTo\}/);
  assert.doesNotMatch(planner, /!hasVisibleActivities \? <section className=\{styles\.emptyInvitation\}/);
  assert.doesNotMatch(planner, /copy\.freeDetail/);
  assert.match(styles, /\.planner \.period \{[^}]*border: 0;/);
});

test("the selected day and slot flow uses the existing canonical trip mutation", () => {
  assert.match(workspace, /composeItineraryDayForPlanning\(workingTrip, active\.id\)/);
  assert.match(workspace, /onAddOpen=\{\(dayPart\) => openAddFlow\(active\.notes\.length, "activity", dayPart\)\}/);
  assert.match(workspace, /addItineraryActivityWithUndo\(current, addFlow\.dayNumber, addFlow\.noteIndex, addDraft, addFlow\.dayPart\)/);
  assert.match(planner, /addComposerOpen && addComposerDayPart === part/);
});
