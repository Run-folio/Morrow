import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.module.css", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.stories.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const workspaceStories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");

test("the production itinerary owner consumes canonical composition and persists period changes through its mutation path", () => {
  assert.match(workspace, /composeItineraryDay\(workingTrip, active\.id\)/);
  assert.match(workspace, /assignItineraryIdeaDayPart\(current, activity\.id, dayPart\)/);
  assert.match(workspace, /assignItineraryActivityDayPart/);
  assert.match(workspace, /<RichItineraryDayPlanner/);
  assert.match(workspace, /mutation\.mutateTrip/);
  assert.match(workspaceStories, /export const RichDayPlannerIntegrated/);
  assert.doesNotMatch(component, /useState\(/);
});

test("broad periods use semantic headings, canonical controls, and a keyboard-accessible clear state", () => {
  assert.match(component, /itineraryDayParts\.map/);
  assert.match(component, /<section className=\{styles\.period\} aria-labelledby=/);
  assert.match(component, /<EasyTSelect/);
  assert.match(component, /<option value="">/);
  assert.match(component, /event\.target\.value \? event\.target\.value as ItineraryDayPart : null/);
  assert.match(component, /disabled=\{pending \|\| !onDayPartChange\}/);
  assert.doesNotMatch(component, /draggable|onDragStart|onDrop/);
});

test("free periods, contextual add controls, first-class travel, and tonight context stay distinct", () => {
  assert.match(component, /copy\.freeDetail/);
  assert.match(component, /addComposerDayPart === part/);
  assert.match(component, /aria-label=\{`\$\{copy\.addActivity\}/);
  assert.match(component, /composition\.transfers\.map/);
  assert.match(component, /tonight\.state === "booked"/);
  assert.match(component, /tonight\.state === "not-organised"/);
  assert.match(component, /copy\.noOvernight/);
  assert.doesNotMatch(component, /09:00|13:00|18:00|hourly|calendar grid/i);
});

test("long names and compact breakpoints remain contained without a parallel mobile data path", () => {
  assert.match(styles, /min-width: 0/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.unslottedList/);
  assert.doesNotMatch(component, /innerWidth|matchMedia|mobileComposition|desktopComposition/);
});

test("Storybook uses the production component for composed planner and responsive states", () => {
  assert.match(stories, /component: RichItineraryDayPlanner/);
  for (const story of [
    "FullFourSectionDay",
    "SparseDay",
    "ArrivalDay",
    "BookedActivity",
    "AuthoredActivities",
    "EmptyDaypart",
    "MixedGeneratedAndAuthored",
    "FullMorningAfternoonEvening",
    "PartiallyFreeDay",
    "UnslottedPlannedItem",
    "ArrivalDayBookedAccommodation",
    "DepartureDayUnknownTiming",
    "AccommodationNotYetOrganised",
    "SparseProviderEvidence",
    "LongActivityNames",
    "Mobile320",
    "Mobile390",
    "Tablet768",
    "Desktop1024",
    "Desktop1440",
    "Desktop1680",
  ]) assert.match(stories, new RegExp(`export const ${story}`));
});
