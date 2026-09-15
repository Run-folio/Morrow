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
const destinationAccommodation = readFileSync(new URL("../components/easyt/destination-accommodation-module.tsx", import.meta.url), "utf8");
const refinement = readFileSync(new URL("../components/journey-itinerary-refinement.tsx", import.meta.url), "utf8");
const mapWorkspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");

test("the itinerary redesign stays below TripShell and composes the three workspace regions", () => {
  assert.match(itinerary, /className=\{`\$\{styles\.rail\}/);
  assert.match(itinerary, /className=\{styles\.dayPanel\}/);
  assert.match(itinerary, /styles\.contextRail/);
  assert.match(styles, /grid-template-columns: minmax\(240px, 270px\) minmax\(0, 1fr\) minmax\(280px, 320px\)/);
  assert.doesNotMatch(itinerary, /Edit trip brief/);
});

test("the selected day timeline uses canonical content and the shared Map persistence architecture", () => {
  assert.match(itinerary, /itineraryNotesWithSourceIndexesForDisplay\(active, incomingLeg, workingTrip\)/);
  assert.match(itinerary, /workingTrip\.brief\.dayNotes\?\.\[active\.dayNumber\]/);
  assert.match(itinerary, /workingTrip\.brief\.customActivities\?\.\[active\.dayNumber\]/);
  assert.match(itinerary, /mapWorkspaceHref\(workingTrip\.id, active\.stopId, "see", active\.dayNumber\)/);
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
  assert.match(itinerary, /previewMode/);
  assert.match(itinerary, /itineraryDayMapContext\(workingTrip, active, null\)/);
  assert.match(itinerary, /itineraryDayMapSelection\(dayMapContext, active, mapSelectionItemId\)/);
  assert.match(itinerary, /onLegSelect=\{\(leg\) => setSelectedItemId\(`leg-\$\{leg\.id\}`\)\}/);
  assert.match(itinerary, /closest<HTMLElement>\("\[data-planner-pin-id\]"\)/);
  assert.match(itinerary, /itinerarySelectionForMapPin\(pin, active\)/);
  assert.match(itinerary, /onPointerDownCapture=\{\(event\) => selectPreviewPin\(event\.target\)\}/);
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

test("the itinerary preview is opt-in and the main Map default remains interactive", () => {
  assert.match(map, /previewMode = false/);
  assert.match(map, /selectedPlannerPinId = null/);
  assert.match(map, /interactive: !previewMode/);
  assert.match(map, /previewLabel \?\? "Whole-trip route map preview"/);
  assert.match(map, /map\.remove\(\);\s*map\.off\("error", handleMapError\)/);
  assert.match(map, /map\.on\("error", handleMapError\)/);
  assert.match(map, /basemapLifecycle\.handleError\(event\)/);
  assert.match(map, /\}, \[plannerPins, previewMode\]\);/);
});

test("Itinerary suggestions reuse discovery, the canonical idea bridge, Map's mapped-place mutation, and the shared persistence hook", () => {
  assert.match(itinerary, /fetch\(`\/api\/journey-discover\?/);
  assert.match(itinerary, /scheduleItineraryIdea\(/);
  assert.match(ideas, /addMappedPlaceToTrip\(/);
  assert.match(itinerary, /mutation\.mutateTrip/);
  assert.match(itinerary, /itinerarySuggestionCandidates\(trip, day, places\)/);
  assert.doesNotMatch(itinerary, /setTrip\(|useState\(trip\)/);
});

test("day navigation is semantically grouped beside day context and precedes planner actions and content", () => {
  const headerIndex = itinerary.indexOf("className={styles.dayHeader}");
  const navigationIndex = itinerary.indexOf("className={styles.dateNavigation}");
  const plannerIndex = itinerary.indexOf("<RichItineraryDayPlanner", headerIndex);
  assert.ok(navigationIndex < headerIndex && headerIndex < plannerIndex);
  assert.match(itinerary, /<nav className=\{styles\.dayNavigation\} aria-label="Day navigation">/);
  assert.match(itinerary, /disabled=\{index === 0\}/);
  assert.match(itinerary, /disabled=\{index === count - 1\}/);
  assert.doesNotMatch(itinerary, /Day \{index \+ 1\} of \{count\}/);
});

test("tablet and mobile layouts collapse instead of squeezing three columns", () => {
  assert.match(styles, /@media \(max-width: 1200px\)[\s\S]*grid-template-columns: minmax\(240px, 270px\) minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.workspace \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(styles, /\.dayList \{[\s\S]*overflow-x: auto/);
  assert.match(styles, /\.railSavedIdeas \{[\s\S]*max-height: min\(34vh, 300px\)/);
  assert.match(itinerary, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
});

test("mobile composition keeps the plan before Saved Ideas and secondary discovery", () => {
  const rail = itinerary.indexOf("ref={itineraryDaysOrientationTarget}");
  const dayPanel = itinerary.indexOf("className={styles.dayPanel}");
  const planner = itinerary.indexOf("<RichItineraryDayPlanner", dayPanel);
  const contextRail = itinerary.indexOf("styles.contextRail");
  const suggestions = itinerary.indexOf("<ItineraryDaySuggestions", contextRail);
  assert.ok(rail > -1 && rail < dayPanel, "day navigation precedes the selected-day panel");
  assert.ok(dayPanel < planner && planner < contextRail, "the production DOM owns one planner before contextual discovery");
  assert.ok(contextRail < suggestions, "suggestions remain inside the secondary context rail");

  const singleColumn = styles.slice(styles.indexOf("@media (max-width: 900px)"), styles.indexOf("@media (max-width: 540px)"));
  assert.match(singleColumn, /\.contextRail \{[\s\S]*grid-column: 1;[\s\S]*grid-row: auto;/);

  const mobile = styles.slice(styles.indexOf("@media (max-width: 540px)"));
  assert.match(mobile, /\.dayPanel \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/);
  assert.match(mobile, /\.dayHeader \{ order: 0; \}/);
  assert.match(mobile, /\.dayNavigation \{ order: 1; \}/);
  assert.ok(itinerary.indexOf("<SavedIdeasSection") > planner);
  assert.equal((itinerary.match(/<SavedIdeasSection/g) ?? []).length, 1);
  assert.match(mobile, /\.dayPanel > \.details \{ order: 4; \}/);
  assert.match(mobile, /\.sequenceEditor \{ order: 5; \}/);
  assert.match(mobile, /\.rail \{ display: none; \}/);
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
  assert.match(itinerary, /showImportStatus=\{false\}/);
});

test("long canonical and provider content stays inside the timeline and planning rail", () => {
  const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
  assert.match(styles, /grid-template-columns: minmax\(240px, 270px\) minmax\(0, 1fr\) minmax\(280px, 320px\)/);
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

test("Notes is the only note-entry owner and stays after the contextual body", () => {
  const bodyIndex = itinerary.indexOf("className={styles.contextRailBody}");
  const bodyCloseIndex = itinerary.indexOf("</div>", itinerary.indexOf("See more ideas in Explore", bodyIndex));
  const notesIndex = itinerary.indexOf(`<summary><span>{copy.notes}</span>`, bodyIndex);
  assert.ok(bodyIndex < bodyCloseIndex && bodyCloseIndex < notesIndex);
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
  assert.match(itinerary, /scheduleItineraryIdea\(current, idea, dayId, scheduledPart\)/);
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
  assert.match(itinerary, /scheduleItineraryIdeaAtPosition\(current, dragged\.idea, active\.id, dayPart, insertionIndex\)/);
  assert.match(itinerary, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/);
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

test("Logistics reuses canonical stay state, affiliate handoff, accessible controls and persistence", () => {
  assert.match(itinerary, /<DestinationAccommodationModule/);
  assert.match(destinationAccommodation, /destinationStayState\(trip, stop/);
  assert.match(itinerary, /upsertStayBooking\(current, stop\.id, draft\)/);
  assert.match(itinerary, /removeStayBooking\(current, stop\.id\)/);
  assert.match(destinationAccommodation, /getCurrentPartnerAction\("accommodation"\)/);
  assert.match(destinationAccommodation, /<MorroviaAffiliateLink/);
  assert.match(destinationAccommodation, /affiliateDisclosure/);
  assert.match(destinationAccommodation, /<EasyTField autoFocus label="Property name"/);
  assert.match(destinationAccommodation, /<MorroviaConfirmationDialog open=\{confirmRemove\}/);
  assert.match(accommodation, /id: `stay-\$\{stop\.id\}`/);
  assert.doesNotMatch(destinationAccommodation, /onClick=.*(?:booked|sorted).*true/);
});

test("Logistics prioritises transfer, accommodation, then other bookings and cleans same-city arrival presentation", () => {
  const transferIndex = itinerary.indexOf("logisticsLegs.map");
  const accommodationIndex = itinerary.indexOf("<DestinationAccommodationModule");
  const otherBookingsIndex = itinerary.indexOf("otherDayBookings.map");
  assert.ok(transferIndex < accommodationIndex && accommodationIndex < otherBookingsIndex);
  assert.match(itinerary, /semanticSamePlaceArrival\(trip, leg\)/);
  assert.match(itinerary, /Arrival into your first overnight destination/);
  assert.doesNotMatch(itinerary, /arrivalLabel \?[^:]+: `~\$\{formatTripDuration\(durationMinutes\)\}`/);
});
