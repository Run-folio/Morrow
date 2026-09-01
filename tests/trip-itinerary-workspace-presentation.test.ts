import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.module.css", import.meta.url), "utf8");
const map = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
const context = readFileSync(new URL("../lib/easyt/itinerary-day-context.ts", import.meta.url), "utf8");
const ideas = readFileSync(new URL("../lib/easyt/itinerary-ideas.ts", import.meta.url), "utf8");
const accommodation = readFileSync(new URL("../lib/easyt/accommodation.ts", import.meta.url), "utf8");
const destinationAccommodation = readFileSync(new URL("../components/easyt/destination-accommodation-module.tsx", import.meta.url), "utf8");
const refinement = readFileSync(new URL("../components/journey-itinerary-refinement.tsx", import.meta.url), "utf8");
const mapWorkspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");

test("the itinerary redesign stays below TripShell and composes the three workspace regions", () => {
  assert.match(itinerary, /className=\{styles\.rail\}/);
  assert.match(itinerary, /className=\{styles\.dayPanel\}/);
  assert.match(itinerary, /className=\{styles\.contextRail\}/);
  assert.match(styles, /grid-template-columns: minmax\(270px, 310px\) minmax\(0, 1fr\) minmax\(280px, 320px\)/);
  assert.doesNotMatch(itinerary, /Edit trip brief/);
});

test("the selected day timeline uses canonical content and the shared Map persistence architecture", () => {
  assert.match(itinerary, /itineraryNotesWithSourceIndexesForDisplay\(active, incomingLeg, workingTrip\)/);
  assert.match(itinerary, /workingTrip\.brief\.dayNotes\?\.\[active\.dayNumber\]/);
  assert.match(itinerary, /workingTrip\.brief\.customActivities\?\.\[active\.dayNumber\]/);
  assert.match(itinerary, /mapWorkspaceHref\(workingTrip\.id, active\.stopId, "see", active\.dayNumber\)/);
  assert.match(itinerary, /<EasyTTripCopilot/);
  assert.match(itinerary, /<InsertionControl/);
  assert.match(itinerary, /useTripMutationPersistence\(trip, presentation === "shell"\)/);
});

test("day header prioritises Find ideas and Add note while Luna remains available in More", () => {
  const actionStart = itinerary.indexOf("className={styles.dayActionRegion}");
  const actionEnd = itinerary.indexOf("mutation.saveState === \"error\"", actionStart);
  const actions = itinerary.slice(actionStart, actionEnd);
  assert.ok(actionStart > -1 && actionEnd > actionStart);
  assert.ok(actions.indexOf("copy.findIdeas") < actions.indexOf("copy.addNote"));
  assert.ok(actions.indexOf("copy.addNote") < actions.indexOf(">More</EasyTButton>"));
  assert.match(actions, /role="menu"[\s\S]*copy\.askMorrovia/);
  assert.doesNotMatch(actions, /copy\.shapeDay/);
  assert.match(itinerary, /role="dialog" aria-labelledby=\{`\$\{tabIdPrefix\}-note-title`\}/);
  assert.match(itinerary, /noteInputRef\.current\?\.focus\(\)/);
  assert.match(itinerary, /event\.key === "Escape"/);
  assert.match(styles, /\.headerNoteComposer[\s\S]*position: absolute/);
  assert.match(styles, /@media \(max-width: 540px\)[\s\S]*\.headerNoteComposer \{[\s\S]*position: fixed/);
});

test("Find ideas focuses the existing current-day suggestion surface and becomes a narrow-layout sheet", () => {
  assert.match(itinerary, /ideasPanelRef\.current\?\.scrollIntoView/);
  assert.match(itinerary, /ideasPanelRef\.current\?\.focus/);
  assert.match(itinerary, /id=\{`\$\{tabIdPrefix\}-ideas`\}/);
  assert.match(itinerary, /key=\{`\$\{workingTrip\.id\}-\$\{active\.id\}`\}/);
  assert.match(styles, /\.ideasSectionFocused/);
  assert.match(styles, /@media \(max-width: 540px\)[\s\S]*\.ideasSectionFocused \{[\s\S]*position: fixed/);
});

test("Map attraction Add schedules the canonical activity instead of only toggling selectedPlaces", () => {
  assert.match(refinement, /day \? `Add to Day \$\{day\.dayNumber\}` : "Add to trip"/);
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

test("the contextual rail renders only canonical map, booking, recommendation, note and saved-place data", () => {
  assert.match(itinerary, /<JourneyPlannerMap/);
  assert.match(itinerary, /previewMode/);
  assert.match(itinerary, /itineraryDayMapContext\(workingTrip, active, null\)/);
  assert.match(itinerary, /itineraryDayMapSelection\(dayMapContext, active, selectedItemId\)/);
  assert.match(itinerary, /onLegSelect=\{\(leg\) => setSelectedItemId\(`leg-\$\{leg\.id\}`\)\}/);
  assert.match(itinerary, /closest<HTMLElement>\("\[data-planner-pin-id\]"\)/);
  assert.match(itinerary, /itinerarySelectionForMapPin\(pin, active\)/);
  assert.match(itinerary, /onPointerDownCapture=\{\(event\) => selectPreviewPin\(event\.target\)\}/);
  assert.match(itinerary, /selectedPlannerPinId=\{mapContext\.selectedPlannerPinId\}/);
  assert.match(itinerary, /bookingsForDay\(workingTrip, active, stop\)/);
  assert.match(itinerary, /itineraryDayLegs\(workingTrip, active\)/);
  assert.match(itinerary, /workingTrip\.recommendations\.filter/);
  assert.match(itinerary, /workingTrip\.brief\.selectedPlaces/);
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
  assert.match(map, /if \(!previewMode\) \{\s*removeMap\(\);\s*return;/);
  assert.match(map, /if \(previewMode\) map\.on\("error", handleMapError\)/);
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

test("the rail co-pilot receives stable selected-day context and keeps the reviewed apply contract", () => {
  assert.match(itinerary, /scope="selected-day"/);
  assert.match(itinerary, /stopId=\{stop\?\.id\}/);
  assert.match(itinerary, /dayNumber=\{active\.dayNumber\}/);
  assert.match(itinerary, /onTripApplied=\{mutation\.acceptCanonicalTrip\}/);
});

test("tablet and mobile layouts collapse instead of squeezing three columns", () => {
  assert.match(styles, /@media \(max-width: 1200px\)[\s\S]*grid-template-columns: minmax\(240px, 270px\) minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.workspace \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(styles, /\.dayList \{[\s\S]*overflow-x: auto/);
  assert.match(styles, /max-height: calc\(100vh - 180px\)/);
  assert.match(itinerary, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
});

test("long canonical and provider content stays inside the timeline and planning rail", () => {
  const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
  assert.match(styles, /grid-template-columns: minmax\(270px, 310px\) minmax\(0, 1fr\) minmax\(280px, 320px\)/);
  assert.match(styles, /\.rowSelect \{[\s\S]*white-space: normal/);
  assert.match(styles, /\.logisticsCard,[\s\S]*\.savedIdeas > button \{[\s\S]*white-space: normal/);
  assert.match(styles, /\.discoveryCopy > strong \{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(styles, /\.discoveryCopy > p \{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(styles, /\.discoveryActions button \{ min-height: 40px/);
  assert.match(stories, /Taipei 101 \(Chinese: 台北101; pinyin: Táiběi Yīlíngyī/);
  for (const story of ["LongContentMobile320", "LongContentMobile390", "LongContentTablet768", "LongContentDesktop1024", "LongContentDesktop1440", "LongContentDesktop1680"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
});

test("recommendation cards use canonical day scoring, an accessible itinerary menu, and separate Add and Save actions", () => {
  const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");
  assert.match(itinerary, /itineraryIdeaDayOptions\(trip, stop\.id\)/);
  assert.match(itinerary, /preferredItineraryIdeaDay\(trip, stop\.id\)/);
  assert.doesNotMatch(itinerary, /<EasyTSelect|<option[^>]*>Choose a day/);
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
