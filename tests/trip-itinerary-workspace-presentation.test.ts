import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.module.css", import.meta.url), "utf8");
const map = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
const context = readFileSync(new URL("../lib/easyt/itinerary-day-context.ts", import.meta.url), "utf8");
const ideas = readFileSync(new URL("../lib/easyt/itinerary-ideas.ts", import.meta.url), "utf8");
const accommodation = readFileSync(new URL("../lib/easyt/accommodation.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../components/easyt/itinerary-item-detail.tsx", import.meta.url), "utf8");
const detailStyles = readFileSync(new URL("../components/easyt/itinerary-item-detail.module.css", import.meta.url), "utf8");
const refinement = readFileSync(new URL("../components/journey-itinerary-refinement.tsx", import.meta.url), "utf8");
const mapWorkspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");

test("Itinerary map handoffs preserve the selected day as the return destination", () => {
  assert.match(itinerary, /const mapReturnHref = itineraryWorkspaceHref\(workingTrip\.id, active\.dayNumber\)/);
  assert.match(itinerary, /mapResultHandoffForExploreResult\(selectedRecommendation, selectedRecommendationMapSelectionId, selectedRecommendationMapDayNumber\),\s*mapReturnHref/);
});

test("the itinerary restores the day rail beside the agenda without a second selection owner", () => {
  assert.match(itinerary, /<nav className=\{styles\.rail\} aria-label=\{copy\.dayByDay\}/);
  assert.match(itinerary, /className=\{styles\.dayList\} role="tablist"/);
  assert.match(itinerary, /onClick=\{\(\) => setSelectedIndex\(dayIndex\)\}/);
  assert.match(itinerary, /aria-selected=\{dayIndex === index\}/);
  assert.doesNotMatch(itinerary, /styles\.railWithSavedIdeas/, "Saved Ideas in the context rail must not truncate the day navigator");
  assert.match(itinerary, /className=\{styles\.dayPanel\}/);
  assert.match(itinerary, /styles\.contextRail/);
  assert.match(styles, /grid-template-columns: minmax\(190px, 230px\) minmax\(0, 1fr\) minmax\(260px, 300px\)/);
  assert.match(styles, /\.dayButton,\s*\.dayButtonActive\s*\{[^}]*grid-template-columns: 34px minmax\(0, 1fr\);/, "the narrow rail must reserve the text column instead of placing the date beside it");
  assert.match(styles, /\.dayButton \.dayMeta,\s*\.dayButtonActive \.dayMeta\s*\{[^}]*grid-column: 2;/);
  assert.doesNotMatch(itinerary, /Edit trip brief/);
});

test("destination context is a separate route-level control that drives the canonical selected day", () => {
  assert.match(itinerary, /itineraryDestinationTrack\(workingTrip, activeDayId\)/);
  assert.match(itinerary, /className=\{styles\.destinationTrack\} aria-label=\{language === "es" \? "Destinos de la ruta" : "Route destinations"\}/);
  assert.match(itinerary, /aria-current=\{destination\.active \? "step" : undefined\}/);
  assert.match(itinerary, /destination\.firstDayNumber/);
  assert.match(itinerary, /setSelectedIndex\(dayIndex\)/);
  assert.equal((itinerary.match(/role="tablist"/g) ?? []).length, 1, "destinations must not become competing day tabs");
  assert.doesNotMatch(itinerary, /useState<[^>]*selectedDestination|setSelectedDestination|localStorage\.setItem\([^)]*destination/);
  assert.match(styles, /\.destinationTrack \{[\s\S]*grid-column: 1 \/ -1/);
});

test("the selected day timeline uses canonical content and the shared Map persistence architecture", () => {
  assert.match(itinerary, /itineraryNotesWithSourceIndexesForDisplay\(active, incomingLeg, workingTrip\)/);
  assert.match(itinerary, /workingTrip\.brief\.dayNotes\?\.\[active\.dayNumber\]/);
  assert.match(itinerary, /workingTrip\.brief\.customActivities\?\.\[active\.dayNumber\]/);
  assert.match(itinerary, /mapWorkspaceHref\(workingTrip\.id, active\.stopId, "see", active\.dayNumber, null, null, mapReturnHref\)/);
  assert.match(itinerary, /<InsertionControl/);
  assert.match(itinerary, /useOptionalTripShellMutation\(\)/);
  assert.match(itinerary, /const mutation = shellMutation \?\? localMutation/);
});

test("day header keeps only canonical day context and navigation", () => {
  const headerStart = itinerary.indexOf("className={styles.dayHeader}");
  const headerEnd = itinerary.indexOf("</header>", headerStart);
  const header = itinerary.slice(headerStart, headerEnd);
  assert.ok(headerStart > -1 && headerEnd > headerStart);
  assert.match(header, /DAY \{pad\(active\.dayNumber\)\}/);
  assert.match(header, /displayDayDate\(active\.date, language\)/);
  assert.match(header, /stop\?\.name \?\? active\.title/);
  assert.match(header, /className=\{styles\.dayRole\}>\{active\.title\}/);
  assert.doesNotMatch(header, /active\.reason|dayCount|copy\.items/);
  assert.doesNotMatch(itinerary, /className=\{styles\.dayActionRegion\}|copy\.findIdeas|noteComposerOpen/);
  assert.doesNotMatch(itinerary, /<EasyTTripCopilot|copy\.aiPlanning|copilotOpen/);
  assert.match(itinerary, /noteInputRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(styles, /\.headerNoteComposer|\.dayCount|\.dayActionRegion/);
});

test("Explore remains the canonical discovery handoff without a second header action", () => {
  assert.match(itinerary, /id=\{`\$\{tabIdPrefix\}-ideas`\}/);
  assert.match(itinerary, /key=\{`\$\{workingTrip\.id\}-\$\{active\.id\}`\}/);
  assert.match(itinerary, /exploreWorkspaceHref\(workingTrip\.id, active\.stopId, active\.dayNumber\)/);
  assert.match(itinerary, />See more ideas in Explore<\/EasyTLinkButton>/);
  assert.doesNotMatch(itinerary, /copy\.findIdeas|ideasPanelOpen|ideasSectionFocused/);
});

test("Map attraction Add schedules the canonical activity instead of only toggling selectedPlaces", () => {
  assert.match(refinement, /day \? `Add to Day \$\{day\.dayNumber\}` : "Add to a day"/);
  assert.match(refinement, /`Added to Day \$\{scheduledDay\}\$\{scheduledPart/);
  assert.match(refinement, /scheduledIdea\?\.dayPart/);
  assert.match(mapWorkspace, /setDiscoveryPlaceScheduled\(trip, \{ stopId, place, dayId: targetDay\.id, selected \}\)/);
  assert.doesNotMatch(mapWorkspace.slice(mapWorkspace.indexOf("const handleAttractionSelection"), mapWorkspace.indexOf("const undoPlannerEdit")), /selected\s*\? \[\.\.\.\(trip\.brief\.selectedPlaces/);
});

test("device-copy recovery is calm, explicit, and links to the protected review path", () => {
  assert.match(itinerary, /You have newer changes on this device/);
  assert.match(itinerary, /Both versions remain protected while you review the device changes/);
  assert.match(itinerary, /tripSyncRecoveryPath\(workingTrip\.id\)/);
  assert.match(itinerary, />Review device changes<\/EasyTLinkButton>/);
});

test("the contextual rail renders canonical map, booking, recommendation, and note data", () => {
  assert.match(itinerary, /<JourneyPlannerMap/);
  assert.match(itinerary, /surface=\{\{ variant: "embedded", interaction: "selection-only" \}\}/);
  assert.match(itinerary, /itineraryDayMapContext\(workingTrip, active, null\)/);
  assert.match(itinerary, /itineraryDayMapSelection\(dayMapContext, active, mapSelectionItemId\)/);
  assert.match(itinerary, /onLegSelect=\{\(leg\) => setSelectedItemId\(`leg-\$\{leg\.id\}`\)\}/);
  assert.match(itinerary, /interactivePlannerPinIds=\{interactiveMapPinIds\}/);
  assert.match(itinerary, /if \(activity\) setSelectedItemId\(activity\.id\)/);
  assert.match(itinerary, /selectedPlannerPinId=\{mapContext\.selectedPlannerPinId\}/);
  assert.match(itinerary, /bookingsForDay\(workingTrip, active, stop\)/);
  assert.match(itinerary, /itineraryDayLegs\(workingTrip, active\)/);
  assert.match(itinerary, /workingTrip\.recommendations\.filter/);
  assert.match(itinerary, /scheduleItineraryIdea/);
  assert.match(ideas, /addMappedPlaceToTrip/);
  assert.match(itinerary, /addItineraryDayNote\(current, active\.dayNumber, railNoteDraft\)/);
  assert.match(context, /no title matching is used for selection linkage/i);
  assert.doesNotMatch(itinerary, /weather|planned percentage|82%/i);
});

test("Itinerary uses embedded selection while full Map uses the shared workspace policy", () => {
  assert.match(map, /const presentationOnly = surface\.variant === "preview"/);
  assert.match(map, /const policy = resolveMapSurfacePolicy\(surface\)/);
  assert.match(map, /selectedPlannerPinId = null/);
  assert.match(map, /morroviaMapOptions\(surface, "compact"\)/);
  assert.match(map, /previewLabel \?\? "Whole-trip route map preview"/);
  assert.match(map, /map\.remove\(\);\s*map\.off\("error", handleMapError\)/);
  assert.match(map, /map\.on\("error", handleMapError\)/);
  assert.match(map, /basemapLifecycle\.handleError\(event\)/);
  assert.match(map, /\}, \[domainSelection, interactivePlannerPinIds, plannerPins, surface\.variant\]\);/);
});

test("Itinerary suggestions reuse discovery, the canonical idea bridge, Map's mapped-place mutation, and the shared persistence hook", () => {
  assert.match(itinerary, /fetch\(`\/api\/journey-discover\?/);
  assert.match(itinerary, /scheduleItineraryIdeaWithUndo\(/);
  assert.match(ideas, /addMappedPlaceToTrip\(/);
  assert.match(itinerary, /mutation\.mutateTrip/);
  assert.match(itinerary, /itinerarySuggestionCandidates\(trip, day, places\)/);
  assert.doesNotMatch(itinerary, /setTrip\(|useState\(trip\)/);
});

test("day navigation is owned by the toolbar and precedes planner content", () => {
  const headerIndex = itinerary.indexOf("className={styles.dayHeader}");
  const navigationIndex = itinerary.indexOf("className={styles.dateNavigation}");
  const plannerIndex = itinerary.indexOf("<RichItineraryDayPlanner", headerIndex);
  assert.ok(navigationIndex < headerIndex && headerIndex < plannerIndex);
  assert.match(itinerary, /label="Jump to date \/ destination"/);
  assert.match(itinerary, /disabled=\{workspaceView === "calendar" \? currentWeekIndex <= 0 : index === 0\}/);
  assert.doesNotMatch(itinerary, /function DayNavigation/);
});

test("tablet and mobile retain the one horizontal day scroller", () => {
  assert.match(itinerary, /role="tablist" aria-label=\{copy\.dayByDay\}/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.workspace \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.dayList \{[\s\S]*overflow-x: auto/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.destinationTrack \{ display: none; \}/);
  const mobileRailRules = styles.slice(styles.indexOf("@media (max-width: 540px)"), styles.indexOf("@media (max-width: 640px)"));
  assert.doesNotMatch(mobileRailRules, /\.rail \{ display: none; \}/);
  assert.doesNotMatch(styles, /^\s*\.rail\s*\{\s*display:\s*none;/m, "later responsive rules must not hide the restored scroller");
  assert.match(styles, /\.railSavedIdeas \{[\s\S]*max-height: min\(34vh, 300px\)/);
});

test("mobile composition keeps the plan before Saved Ideas and secondary discovery", () => {
  const dayPanel = itinerary.indexOf("className={styles.dayPanel}");
  const planner = itinerary.indexOf("<RichItineraryDayPlanner", dayPanel);
  const contextRail = itinerary.indexOf("styles.contextRail");
  const suggestions = itinerary.indexOf("<ItineraryDaySuggestions", contextRail);
  assert.ok(dayPanel < planner && planner < contextRail, "the production DOM owns one planner before contextual discovery");
  assert.ok(contextRail < suggestions, "suggestions remain inside the secondary context rail");

  const singleColumn = styles.slice(styles.indexOf("@media (max-width: 900px)"), styles.indexOf("@media (max-width: 540px)"));
  assert.match(singleColumn, /\.contextRail \{[\s\S]*grid-column: 1;[\s\S]*grid-row: auto;/);

  const mobile = styles.slice(styles.indexOf("@media (max-width: 540px)"));
  assert.match(mobile, /\.dayPanel \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/);
  assert.match(mobile, /\.dayHeader \{ order: 0; \}/);
  assert.ok(itinerary.indexOf("<SavedIdeasSection") > planner);
  assert.equal((itinerary.match(/<SavedIdeasSection/g) ?? []).length, 1);
  assert.match(mobile, /\.dayPanel > \.details \{ order: 4; \}/);
  assert.match(mobile, /\.sequenceEditor \{ order: 5; \}/);
  assert.match(itinerary, /<nav className=\{styles\.rail\} aria-label=\{copy\.dayByDay\}/);
});

test("Calendar uses a compact selected-day summary and only mounts the context rail for unique detail capability", () => {
  const summaryStart = itinerary.indexOf("function CalendarSelectedDaySummary");
  const summaryEnd = itinerary.indexOf("function calendarScheduleLabel", summaryStart);
  const summary = itinerary.slice(summaryStart, summaryEnd);
  assert.match(itinerary, /<CalendarSelectedDaySummary/);
  assert.match(itinerary, /workspaceView === "days" && dayComposition \? <div[\s\S]*<RichItineraryDayPlanner/);
  assert.match(itinerary, /const hasContextRail = workspaceView === "days" \|\| hasSelectedDetail/);
  assert.match(itinerary, /workspaceView === "days" \? <div className=\{styles\.contextRailBody\}/);
  assert.match(itinerary, /stayWorkspaceHref\(tripId, composition\.tonight\.stopId\)/);
  assert.doesNotMatch(itinerary, /<DestinationAccommodationModule/);
  assert.doesNotMatch(summary, /displayDayDate|day\.stop\?\.name/, "the selected-day header already owns date and destination");
});

test("scheduled cards open one reusable detail owner without introducing another persistence model", () => {
  assert.match(itinerary, /<ItineraryItemDetail/);
  assert.match(itinerary, /selectedDetail \? <ItineraryItemDetail/);
  assert.match(itinerary, /onActivitySelect=\{\(activity, trigger\)/);
  assert.match(itinerary, /selectedItemOriginRef\.current = trigger/);
  assert.match(itinerary, /window\.requestAnimationFrame\(\(\) => origin\?\.focus\(\)\)/);
  assert.match(detail, /role=\{embedded \? undefined : "dialog"\}/);
  assert.match(detail, /event\.key === "Escape"/);
  assert.match(detail, /document\.body\.style\.overflow = "hidden"/);
  assert.match(detailStyles, /@media \(max-width: 900px\)[\s\S]*position: fixed[\s\S]*max-height: min\(88svh, 760px\)/);
  assert.match(detailStyles, /padding-bottom: env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(detail, /setTrip|mutateTrip|localStorage/);
});

test("activity, restaurant, and accommodation detail stay truthful and omit absent facts", () => {
  assert.match(itinerary, /kind: selectedActivity\.category === "restaurant" \? "restaurant" : "activity"/);
  assert.match(itinerary, /kind: "accommodation"/);
  assert.match(detail, /detail\.summary \?/);
  assert.match(detail, /detail\.duration \?/);
  assert.match(detail, /detail\.price \?/);
  assert.match(detail, /detail\.practical\?\.length \?/);
  assert.match(itinerary, /itineraryStayPresentation\(composition\.tonight\)/);
});

test("long canonical and provider content stays inside the timeline and planning rail", () => {
  const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
  assert.match(styles, /grid-template-columns: minmax\(190px, 230px\) minmax\(0, 1fr\) minmax\(260px, 300px\)/);
  assert.match(styles, /\.rowSelect \{[\s\S]*white-space: normal/);
  assert.match(styles, /\.savedIdeaSelect \{[\s\S]*white-space: normal/);
  assert.match(styles, /\.discoveryCopy > strong \{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(styles, /\.discoveryCopy > p \{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(styles, /\.discoveryActions button \{ min-height: 40px/);
  assert.match(stories, /Taipei 101 \(Chinese: 台北101; pinyin: Táiběi Yīlíngyī/);
  for (const story of ["LongContentMobile320", "LongContentMobile390", "LongContentMobile430", "LongContentTablet768", "LongContentDesktop1024", "LongContentDesktop1440", "LongContentDesktop1680", "DetailRailLongProviderTitle", "SelectedPlannedItemDesktop"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
});

test("saved ideas have one shared stop-scoped unscheduled owner in the planning rail", () => {
  const railIndex = itinerary.indexOf("className={styles.contextRailBody}");
  const desktopSavedIndex = itinerary.indexOf("<SavedIdeasSection", railIndex);
  const panelIndex = itinerary.indexOf("className={styles.dayPanel}");
  assert.ok(panelIndex < railIndex && railIndex < desktopSavedIndex);
  assert.match(itinerary, /const unscheduledSavedIdeas = \(workingTrip\.brief\.itineraryIdeas \?\? \[\]\)\.filter\(\(idea\) => idea\.stopId === active\.stopId && !idea\.dayId\)/);
  assert.match(itinerary, /function SavedIdeasSection/);
  assert.match(itinerary, /if \(!ideas\.length\) return null/);
  assert.match(itinerary, /className=\{styles\.savedIdeas\} role="list"/);
  assert.match(itinerary, /aria-pressed=\{selectedIdeaId === idea\.id\}/);
  assert.match(itinerary, /exploreResultForIdea\(workingTrip, idea\)/);
  assert.match(itinerary, /<ItineraryItemDetail/);
  assert.match(itinerary, /onSchedule=\{scheduleIdea\}/);
  assert.match(itinerary, /removeItineraryIdea\(current, idea\.id\)/);
  assert.match(styles, /\.railSavedIdeas \{[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.mobileSavedIdeas \{[\s\S]*display: none/);
});

test("Notes is the only note-entry owner and stays inside the Day-by-day context body", () => {
  const bodyIndex = itinerary.indexOf("className={styles.contextRailBody}");
  const notesIndex = itinerary.indexOf(`<summary><span>{copy.notes}</span>`, bodyIndex);
  const bodyCloseIndex = itinerary.indexOf("</div> : null}", notesIndex);
  assert.ok(bodyIndex < notesIndex && notesIndex < bodyCloseIndex);
  assert.equal((itinerary.match(/submitRailNote\(\)/g) ?? []).length, 1, "the Notes form is the only day-note submit owner");
  assert.equal((itinerary.match(/<EasyTField ref=\{noteInputRef\}/g) ?? []).length, 1);
  assert.doesNotMatch(itinerary, /onAddNote=/);
});

test("Viator inventory uses compact disclosure and suppresses the generic fallback when a live product is visible", () => {
  const affiliate = readFileSync(new URL("../components/easyt/affiliate-link.tsx", import.meta.url), "utf8");
  assert.match(affiliate, /visibleAffiliateDisclosure = "Partner link · Morrovia may earn a commission at no extra cost to you\."/);
  assert.match(affiliate, /Booking, payment and provider terms apply on \$\{providerLabel\}’s site\./);
  assert.match(affiliate, /<MorroviaContextualDisclosure/);
  assert.match(itinerary, /hasLiveViatorProduct = results\.some/);
  assert.match(itinerary, /commercialStatus !== "loading" && !hasLiveViatorProduct/);
  assert.match(itinerary, /"More tours on Viator"/);
  assert.doesNotMatch(itinerary, /Bookable experience ·/);
});

test("recommendation cards use canonical day scoring, an accessible itinerary menu, and separate Add and Save actions", () => {
  const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
  assert.match(itinerary, /itineraryIdeaDayOptions\(trip, stop\.id\)/);
  assert.match(itinerary, /rankItineraryRecommendations\(trip, day/);
  assert.match(itinerary, /dedupeExploreResults\(\[\.\.\.organic, \.\.\.commercial\]\)/);
  const suggestionOwner = itinerary.slice(itinerary.indexOf("function ItineraryDaySuggestions"));
  assert.doesNotMatch(suggestionOwner, /<EasyTSelect|<option[^>]*>Choose a day/);
  assert.match(itinerary, /aria-haspopup="menu"/);
  assert.match(itinerary, /role="menu"/);
  assert.match(itinerary, /role="menuitem"/);
  assert.match(itinerary, /aria-current=\{current \? "true"/);
  assert.match(itinerary, /event\.key === "Escape"/);
  assert.match(itinerary, /event\.key === "ArrowDown"/);
  assert.match(itinerary, /triggerRef\.current\?\.focus\(\)/);
  assert.match(itinerary, /scheduleItineraryIdeaWithUndo\(current, idea, dayId, scheduledPart\)/);
  assert.match(itinerary, /preferredItineraryDayPart\(current, dayId, idea\.category\)/);
  assert.match(itinerary, /placeItineraryActivity\(current, active\.id/);
  assert.match(itinerary, /removeItineraryIdea\(current, ideaId\)/);
  assert.match(itinerary, />\{pending \? "Saving…" : "Save"\}<\/EasyTButton>/);
  assert.match(styles, /\.discoveryMedia \{[\s\S]*height: 112px/);
  assert.match(styles, /\.discoveryMedia > img,[\s\S]*object-fit: cover/);
  assert.match(styles, /@media \(max-width: 540px\)[\s\S]*\.dayPickerPanel \{[\s\S]*position: fixed/);
  assert.match(itinerary, /Choose day and part of day for/);
  assert.doesNotMatch(itinerary, /<p>\{place\.description\}<\/p>/);
  assert.match(itinerary, /itineraryDayParts\.map/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.dragHint \{ display: none; \}/);
  for (const story of ["RecommendationDefault", "RecommendationNoImage", "RecommendationInterestMatch", "RecommendationAlreadySaved", "RecommendationAlreadyAdded", "RecommendationDayPickerOpen", "RecommendationLongTitle", "RecommendationMobile320"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
});

test("selected-day deep links do not override a traveller's later day choice after local mutations", () => {
  assert.match(itinerary, /selectedDayRequestRef/);
  assert.match(itinerary, /request\.tripId === workingTrip\.id && request\.dayNumber === selectedDayNumber/);
});

test("suggestion requests use the shared stale-result and cancellation guard", () => {
  assert.match(itinerary, /createAbortableEffectScope\(`Itinerary suggestions for day \$\{day\.dayNumber\}`\)/);
  assert.match(itinerary, /scope\.commit\(\(\) =>/);
  assert.match(itinerary, /scope\.isCancellation\(caught\)/);
  assert.match(itinerary, /return \(\) => scope\.dispose\(\)/);
});

test("planner drag ownership survives native pointer timing and is cleared at workspace boundaries", () => {
  assert.match(itinerary, /const beginPlannerDrag = \(dragged: PlannerDragItem\) => \{\s*plannerDragRef\.current = dragged;\s*setPlannerDrag\(dragged\);\s*\}/);
  assert.match(itinerary, /const clearPlannerDrag = \(\) => \{\s*plannerDragRef\.current = null;\s*setPlannerDrag\(null\);\s*\}/);
  assert.match(itinerary, /\}, \[activeDayId\]\);/);
  assert.match(itinerary, /onDragStart=\{nativePlannerDrag \? \(idea, event\) => \{[\s\S]{0,220}beginPlannerDrag\(\{ kind: "suggestion", idea \}\);/);
  assert.match(itinerary, /onDragEnd=\{nativePlannerDrag \? clearPlannerDrag : undefined\}/);
  assert.match(itinerary, /onInteractionReset=\{clearPlannerDrag\}/);
  assert.match(itinerary, /scheduleItineraryIdeaAtPositionWithUndo\(current, dragged\.idea, active\.id, dayPart, insertionIndex\)/);
  assert.match(itinerary, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/);
  assert.match(itinerary, /onActivityDragStart=\{nativePlannerDrag && workspaceView === "days" \? \(activity, event\) => \{/,
    "Day by day keeps native drag only for fine pointers");
  assert.match(itinerary, /onActivityDragEnd=\{nativePlannerDrag && workspaceView === "days" \? clearPlannerDrag : undefined\}/,
    "Calendar's narrow side panel must not expose a misleading pointer-drag handle");
  assert.match(itinerary, /dragActive=\{workspaceView === "days" && Boolean\(plannerDrag\)\}/);
  assert.match(itinerary, /onActivityDrop=\{workspaceView === "days" \? dropPlannerItem : undefined\}/,
    "Calendar's narrow side panel must not expose a second drop target");
});

test("day placement menus escape the scroll owner through a viewport-positioned portal", () => {
  assert.match(itinerary, /createPortal\(menu, document\.body\)/);
  assert.match(itinerary, /trigger\.getBoundingClientRect\(\)/);
  assert.match(itinerary, /window\.addEventListener\("scroll", positionMenu, true\)/);
  assert.match(styles, /\.dayPickerPortal \{[\s\S]*position: fixed;[\s\S]*z-index: 80;/);
});

test("an unavailable Suggestions lane is compact, resets active drag, and retries without overlap", () => {
  const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
  assert.match(itinerary, /const interactionResetRef = useRef\(onInteractionReset\)/);
  assert.match(itinerary, /if \(unavailable\) interactionResetRef\.current\(\);\s*\}, \[unavailable\]\);/);
  assert.match(itinerary, /<MorroviaSectionStatus compact state="error"/);
  assert.match(itinerary, /onRetry=\{\(\) => \{ onInteractionReset\(\); setRetryVersion/);
  assert.match(stories, /export const NativeDragAfterSuggestionsFailure/);
});

test("Itinerary keeps stay management in the canonical Stay owner", () => {
  assert.match(itinerary, /stayWorkspaceHref\(tripId, composition\.tonight\.stopId\)/);
  assert.match(itinerary, /window\.location\.assign\(stayWorkspaceHref\(workingTrip\.id, stop\.id\)\)/);
  assert.match(itinerary, /removeStayBooking\(current, stop\.id\)/);
  assert.match(accommodation, /id: `stay-\$\{stop\.id\}`/);
  assert.doesNotMatch(itinerary, /<DestinationAccommodationModule/);
});

test("Logistics keeps transfer and other bookings while accommodation moves to the day context", () => {
  const transferIndex = itinerary.indexOf("logisticsLegs.map");
  const otherBookingsIndex = itinerary.indexOf("otherDayBookings.map");
  assert.ok(transferIndex < otherBookingsIndex);
  assert.match(itinerary, /<SelectedDayStayContext/);
  assert.match(itinerary, /semanticSamePlaceArrival\(trip, leg\)/);
  assert.match(itinerary, /Arrival into your first overnight destination/);
  assert.doesNotMatch(itinerary, /arrivalLabel \?[^:]+: `~\$\{formatTripDuration\(durationMinutes\)\}`/);
});
