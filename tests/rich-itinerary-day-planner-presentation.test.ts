import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.module.css", import.meta.url), "utf8");
const identityStyles = readFileSync(new URL("../components/easyt/itinerary-activity-identity.module.css", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.stories.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const workspaceStories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
const composition = readFileSync(new URL("../lib/easyt/itinerary-day-composition.ts", import.meta.url), "utf8");

test("empty day keeps one invitation and opens the same composer without a second daypart strip", () => {
  assert.match(component, /const hasVisibleActivities =/);
  assert.match(component, /!hasVisibleActivities/);
  assert.match(component, /className=\{styles\.emptyInvitation\}/);
  assert.match(component, /onAddOpen\?\.\(null\)/);
  assert.match(component, /onSeeSuggestions\?\.\(\)/);
  assert.match(component, /addComposerOpen \? addComposer : <div className=\{styles\.emptyActions\}>/);
  assert.doesNotMatch(component, /className=\{styles\.emptyDayparts\}/);
  assert.match(component, /<EasyTSelect label=\{copy\.choosePeriod\}/);
  assert.match(workspace, /onSeeSuggestions=\{\(\) =>/);
  assert.match(workspace, /document\.getElementById\(`\$\{tabIdPrefix\}-ideas`\)/);
});

test("populated day shows occupied periods and saved unslotted rows before its single Add action", () => {
  assert.match(component, /const occupiedParts = itineraryDayParts\.filter/);
  assert.match(component, /const emptyParts = itineraryDayParts\.filter/);
  assert.match(component, /occupiedParts\.map\(renderPeriod\)/);
  assert.match(component, /unslotted\.length \? \(/);
  assert.match(component, /className=\{styles\.populatedActions\}/);
  assert.match(component, /emptyParts\.map\(renderPeriod\)/);
  assert.ok(component.indexOf("unslotted.length ? (") < component.indexOf("className={styles.populatedActions}"));
  assert.match(component, /dragActive && emptyParts\.length/);
  assert.doesNotMatch(component, /className=\{styles\.secondaryPeriods\}/);
});

test("one populated Add action uses the controlled composer for exact daypart intent", () => {
  assert.match(component, /hasVisibleActivities && onAddOpen \? <div className=\{styles\.populatedActions\}>/);
  assert.match(component, /onClick=\{\(\) => onAddOpen\(null\)\}/);
  assert.match(component, /onAddComposerDayPartChange\?\.\(event\.target\.value \? event\.target\.value as ItineraryDayPart : null\)/);
  assert.match(workspace, /onAddComposerDayPartChange=\{\(dayPart\) => setAddFlow/);
  assert.match(workspace, /addItineraryActivityWithUndo\(current, addFlow\.dayNumber, addFlow\.noteIndex, addDraft, addFlow\.dayPart\)/);
  assert.doesNotMatch(component, /className=\{styles\.partInsertActions\}/);
});

test("mobile populated plan removes surplus section gap without shrinking activity controls", () => {
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.planner \{\s*gap: 8px;/);
  assert.match(styles, /\.activitySelect \{[\s\S]*min-height: 68px/);
});

test("travel card copy can wrap inside the shared quiet button at mobile widths", () => {
  assert.match(styles, /\.planner \.transferSelect \{[^}]*min-width: 0;[^}]*white-space: normal;/);
});

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
  assert.match(component, /<section[\s\S]{0,180}className=\{`\$\{styles\.period\}/);
  assert.match(component, /<EasyTSelect/);
  assert.match(component, /<option value="">/);
  assert.match(component, /event\.target\.value \? event\.target\.value as ItineraryDayPart : null/);
  assert.match(component, /disabled=\{pending \|\| !onDayPartChange\}/);
  assert.match(component, /draggable/);
  assert.match(component, /onActivityDragStart/);
  assert.match(component, /onActivityDrop/);
  assert.match(component, /data-day-part=\{part\}/);
  assert.match(component, /data-drop-index/);
  assert.match(component, /data-drop-zone={dragActive \? "ready" : undefined}/);
  assert.match(component, /onActivityDrop\?\.\(part, activities\.length\)/);
  assert.match(component, /event\.stopPropagation\(\)/);
  assert.match(component, /draggable=\{activity\.dayPartEditable && Boolean\(onActivityDragStart\)\}/);
});

test("native drag uses a canonical pointer source while preserving every canonical placement path", () => {
  assert.match(component, /<EasyTButton[\s\S]{0,240}className=\{styles\.dragHandle\}[\s\S]{0,240}data-itinerary-drag-handle=\{activity\.id\}[\s\S]{0,240}draggable[\s\S]{0,240}onDragStart=\{onDragStart\}/);
  assert.match(component, /tabIndex=\{-1\}[\s\S]{0,120}aria-hidden="true"/,
    "the pointer-only source must not masquerade as a keyboard action");
  assert.match(component, />\{copy\.dragActivity\}: \{activity\.title\}<\/EasyTButton>/);
  assert.match(styles, /\.dragHandle \{[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*min-height: 44px;/);
  assert.doesNotMatch(styles, /\.dragHandle \{[^}]*touch-action: none/);
  assert.match(component, /onDragStart=\{\(event\) => onActivityDragStart\?\.\(activity, event\)\}/);
  assert.match(workspace, /event\.dataTransfer\.setData\("text\/plain", activity\.id\)/);
  assert.match(workspace, /beginPlannerDrag\(\{ kind: "activity", activity, sourceDayId: active\.id, sourceStopId: active\.stopId \}\)/);
  assert.match(component, /onMoveToDay/);
  assert.match(workspace, /plannerDragRef\.current = dragged/);
  assert.match(workspace, /const dropPlannerItem = \(dayPart: ItineraryDayPart, insertionIndex: number\)/);
  assert.match(workspace, /const dragged = plannerDragRef\.current \?\? plannerDrag/);
  assert.match(workspace, /placeItineraryActivity\(current, active\.id, dragged\.activity\.id, dayPart, insertionIndex\)/);
  assert.match(workspace, /mutation\.mutateTrip/);
});

test("whole, empty, populated, and insertion drop targets retain native acceptance semantics", () => {
  assert.equal((component.match(/onDragEnter=\{\(event\) => \{ event\.preventDefault\(\);/g) ?? []).length, 4, "every native drop target cancels dragenter so a fast pointer drop is accepted");
  assert.match(component, /data-day-part=\{part\}[\s\S]{0,420}onDragOver=\{\(event\) => \{ if \(onActivityDrop\) event\.preventDefault\(\); \}\}[\s\S]{0,320}onActivityDrop\?\.\(part, activities\.length\)/);
  assert.match(component, /className=\{`\$\{styles\.freePeriod\}[\s\S]{0,400}onDragOver=\{\(event\) => \{ event\.stopPropagation\(\); if \(onActivityDrop\) event\.preventDefault\(\); \}\}[\s\S]{0,240}onActivityDrop\?\.\(part, 0\)/);
  const populatedMarker = component.slice(component.indexOf("data-drop-index={activityIndex}"), component.indexOf("<ActivityRow", component.indexOf("data-drop-index={activityIndex}")));
  const appendMarker = component.slice(component.indexOf("data-drop-index={activities.length}"), component.indexOf("</div>", component.indexOf("data-drop-index={activities.length}")));
  assert.match(populatedMarker, /onActivityDrop\?\.\(part, activityIndex\)/);
  assert.match(appendMarker, /onActivityDrop\?\.\(part, activities\.length\)/);
  assert.match(component, /onDragEnd=\{\(\) => \{ setDropTarget\(null\); onActivityDragEnd\?\.\(\); \}\}/);
});

test("entering native drag mode never changes period geometry", () => {
  assert.doesNotMatch(styles, /\.periodDropReady\s*\{[^}]*min-height:/);
  assert.doesNotMatch(styles, /\.periodDropReady \.freePeriod/);
  assert.doesNotMatch(component, /Drop activity here/);
});

test("mobile hides pointer drag without removing the explicit scheduling and reorder controls", () => {
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.dragHandle \{[\s\S]*display: none/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.dragHandle \{[\s\S]*display: none/);
  assert.match(component, /<EasyTSelect[\s\S]{0,520}<option value="">\{copy\.unsetPeriod\}<\/option>/);
  assert.match(component, /onMoveActivity\(activity, "earlier"\)/);
  assert.match(component, /onMoveActivity\(activity, "later"\)/);
});

test("mobile retains drop zones only during drag and leaves daypart choice in the composer", () => {
  assert.match(component, /data-empty=\{activities\.length === 0\}/);
  assert.match(component, /dragActive && emptyParts\.length/);
  assert.match(component, /onAddComposerDayPartChange/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.periodGrid:has\(\.period\[data-empty="true"\]\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.period\[data-empty="true"\][\s\S]*grid-column: span 2/);
});

test("single Add composer, first-class travel, and tonight context stay distinct", () => {
  assert.doesNotMatch(component, /No activity is set for this part of the day|copy\.freeDetail/);
  assert.match(component, /const addComposer = <form/);
  assert.match(component, /<option value="">\{copy\.unsetPeriod\}<\/option>/);
  assert.doesNotMatch(component, /Day context and notes|Retained day context/);
  assert.match(component, /composition\.transfers\.map/);
  assert.match(component, /tonight\.state === "booked"/);
  assert.match(component, /tonight\.state === "not-organised"/);
  assert.match(component, /copy\.noOvernight/);
  assert.doesNotMatch(component, /09:00|13:00|18:00|hourly|calendar grid/i);
  const travelSection = component.slice(component.indexOf("composition.transfers.length"), component.indexOf("className={styles.periodGrid}"));
  const tonightSection = component.slice(component.indexOf("className={styles.tonight}"), component.indexOf("</section>", component.indexOf("className={styles.tonight}")));
  assert.doesNotMatch(travelSection, /onDrop/);
  assert.doesNotMatch(tonightSection, /onDrop/);
});

test("long names and compact breakpoints remain contained without a parallel mobile data path", () => {
  assert.match(styles, /min-width: 0/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /\.unslottedList \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.unslottedList \.activity \+ \.activity \{[\s\S]*border-top:/);
  assert.doesNotMatch(styles, /\.unslottedList \{[\s\S]{0,100}repeat\(2/);
  assert.match(styles, /\.periodGrid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(styles, /\.periodGrid \{[\s\S]{0,100}repeat\(2/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.unslottedList/);
  assert.match(identityStyles, /\.copy \{[\s\S]*white-space: normal/);
  assert.doesNotMatch(component, /innerWidth|matchMedia|mobileComposition|desktopComposition/);
});

test("day parts use the canonical calm surface and heading typography at every width", () => {
  assert.match(styles, /\.period \{[\s\S]*border: 1px solid var\(--morrovia-line\)[\s\S]*border-radius: var\(--morrovia-control-radius\)[\s\S]*background: var\(--morrovia-paper\)/);
  assert.match(styles, /\.periodHeading \{[\s\S]*background: var\(--morrovia-paper\)/);
  assert.match(styles, /\.periodHeading h3,[\s\S]*font: var\(--morrovia-type-control\)/);
});

test("the scheduled card is the primary selection target and editing chrome is secondary", () => {
  assert.match(component, /className=\{styles\.activitySelect\}/);
  assert.match(component, /aria-pressed=\{selected\}/);
  assert.match(component, /onActivitySelect\?\.\(activity, trigger\)/);
  assert.match(component, /<details className=\{styles\.activityMenu\}>/);
  assert.match(styles, /\.activitySelected \{[\s\S]*outline:/);
  assert.match(styles, /\.activitySelected::before,[\s\S]*background: var\(--morrovia-signal\)/);
  assert.match(styles, /\.activitySelect \{[\s\S]*min-height: 68px/);
});

test("the rendered planner follows Travel, chronological day parts, unslotted context, then Tonight", () => {
  const travelIndex = component.indexOf("composition.transfers.length");
  const periodsIndex = component.indexOf("className={styles.periodGrid}");
  const unslottedIndex = component.indexOf("unslotted.length ? (");
  const tonightIndex = component.indexOf("className={`${styles.tonight}");
  assert.ok(travelIndex < periodsIndex && periodsIndex < unslottedIndex && unslottedIndex < tonightIndex);
  assert.match(composition, /itineraryDayParts = \["morning", "midday", "afternoon", "evening"\]/);
});

test("Storybook uses the production component for composed planner and responsive states", () => {
  assert.match(stories, /component: RichItineraryDayPlanner/);
  for (const story of [
    "FullFourSectionDay",
    "SparseDay",
    "ArrivalDay",
    "BookedActivity",
    "AuthoredActivities",
    "MultipleActivitiesInMorning",
    "MultipleActivitiesInAfternoon",
    "ExactTimeAndUntimedMix",
    "FullDayExperienceWarning",
    "RestaurantAndEveningActivity",
    "TransferAndActivities",
    "DraggingActivityOverMorning",
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
    "OnePlannedItem",
    "ThreePlannedItems",
    "VeryLongProviderTitle",
    "OccupiedAllPeriods",
    "DesktopShortHeightViewport",
    "Mobile320",
    "Mobile390",
    "Mobile430",
    "Tablet768",
    "Desktop1024",
    "Desktop1440",
    "Desktop1680",
  ]) assert.match(stories, new RegExp(`export const ${story}`));
});
