import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const projection = readFileSync(new URL("../lib/easyt/itinerary-calendar.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.module.css", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");

test("mobile day orientation stays compact and scrolls its own rail", () => {
  assert.match(itinerary, /labelClassName=\{styles\.compactJumpLabel\}/);
  assert.match(itinerary, /ref=\{dayListRef\}/);
  assert.match(itinerary, /dayListRef\.current\?\.scrollTo|rail\.scrollTo/);
  assert.doesNotMatch(itinerary, /tab-\$\{selectedIndex\}`\)\?\.scrollIntoView/);
  const mobile = styles.slice(styles.lastIndexOf("@media (max-width: 540px)"));
  assert.match(mobile, /\.workspaceToolbar\s*\{[^}]*display:\s*grid/);
  assert.match(mobile, /\.workspaceToolbar p\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.railHeader\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.dayHeader\[data-photo="true"\]\s*\{[^}]*min-height:\s*\d+px/);
  assert.match(styles, /\.dayHeader\[data-photo="true"\] > \.dayHeaderContent\s*\{/);
  assert.doesNotMatch(styles, /\.dayHeader\[data-photo="true"\] > div\s*\{/);
  assert.match(mobile, /\.dayHeader h2\s*\{[^}]*overflow-wrap:\s*break-word/);
});

test("matched populated acceptance route uses the trip's real Itinerary path", () => {
  assert.match(stories, /export const AcceptancePlannedMexicoStayPhoto:[\s\S]*parameters: itineraryStoryRoute\(mexicoPlannedTrip\.id\)/);
  assert.match(stories, /export const AcceptanceMobile390:[\s\S]*\.\.\.AcceptancePlannedMexicoStayPhoto/);
  assert.match(stories, /export const AcceptanceLongDestinationStayMobile320:[\s\S]*viewport: \{ value: "morrovia320"/);
});

test("320px saved-stay copy wraps inside its existing card and does not widen the page", () => {
  assert.match(styles, /\.stayContextSelect \{[^}]*min-width: 0;[^}]*white-space: normal;/);
  assert.match(styles, /\.stayContextSelect > span,[\s\S]*\.stayContextCopy \{[^}]*min-width: 0;[^}]*white-space: normal;/);
});

test("Calendar stays a pure projection while delegating planning interactions to its canonical parent", () => {
  assert.match(projection, /\[\.\.\.trip\.planItems\]/);
  assert.match(projection, /composeItineraryDay\(trip, day\.id\)/);
  assert.match(projection, /itineraryTransportAgenda\(trip\)/);
  assert.match(projection, /trip\.brief\.bookings/);
  assert.doesNotMatch(projection, /localStorage|sessionStorage|fetch\(|mutate|setTrip|saveTrip/);

  const calendarStart = itinerary.indexOf("function ItineraryCalendar(");
  const calendarEnd = itinerary.indexOf("function ItineraryDaySuggestions", calendarStart);
  assert.ok(calendarStart > -1 && calendarEnd > calendarStart);
  assert.doesNotMatch(itinerary.slice(calendarStart, calendarEnd), /mutateTrip|mutation\./);
  assert.match(itinerary.slice(calendarStart, calendarEnd), /draggable=\{draggable\}/);
  assert.match(itinerary.slice(calendarStart, calendarEnd), /onDrop\(day\)/);
  assert.match(itinerary, /moveItineraryActivityAcrossDays\(current, sourceDayId, activity\.id, targetDayId, targetDayPart\)/);
});

test("Calendar selection resolves canonical IDs in place, with an explicit full-day switch", () => {
  assert.match(itinerary, /days\.findIndex\(\(candidate\) => candidate\.id === day\.id\)/);
  assert.match(itinerary, /item\.activity\.id/);
  assert.match(itinerary, /`stay:\$\{item\.booking\.id\}`/);
  assert.match(itinerary, /`leg-\$\{item\.agenda\.leg\.id\}`/);
  assert.match(itinerary, /`booking:\$\{item\.booking\.id\}`/);
  assert.match(itinerary, /setWorkspaceView\("days"\)/);
  assert.match(itinerary, /data-selected=\{selectedDayId === day\.id/);
  assert.match(itinerary, /aria-pressed=\{selectedDayId === day\.id\}/);
  assert.match(itinerary, /calendarItemRequestRef\.current = itemId/);
  assert.match(itinerary, /Open full day/);
  assert.match(itinerary, /searchParams\.set\("day", String\(day\.dayNumber\)\)/);
  assert.match(itinerary, /parseItineraryWorkspaceTarget\(workingTrip, params\)/);
  assert.match(itinerary, /window\.addEventListener\("popstate", restoreOrientation\)/);
  assert.match(itinerary, /items\.slice\(0, 4\)/);
});

test("Calendar keeps day cards selectable while removing redundant empty-card and weekday copy", () => {
  const calendar = itinerary.slice(itinerary.indexOf("function ItineraryCalendar("), itinerary.indexOf("function CalendarItemButton("));
  assert.doesNotMatch(calendar, /calendarWeekdays|calendarWeekdayLabels|calendarEmptyDay|copy\.noCalendarPlans/);
  assert.match(calendar, /day\.day\.type === "open" && day\.items\.length === 0/);
  assert.match(calendar, /hasCalendarArrivalEvent\(day\)/);
  assert.match(calendar, /<time dateTime=\{day\.day\.date\}>/);
  assert.match(calendar, /aria-pressed=\{selectedDayId === day\.id\}/);
  assert.match(itinerary, /<EasyTButton variant="secondary" size="small" onClick=\{\(\) => setWorkspaceView\("days"\)\}>Open full day<\/EasyTButton>/);
});

test("Calendar places the existing photo-credit control below its side image", () => {
  assert.match(itinerary, /workspaceView === "days" \? dayHeroCredit : null/);
  assert.match(itinerary, /workspaceView === "calendar" \? dayHeroCredit : null/);
  assert.match(styles, /\.calendarDayHeroCredit\s*\{[^}]*position:\s*relative/);
  assert.match(stories, /export const CalendarAttributedPhoto: Story/);
});

test("Calendar exposes canonical Move, item-scoped Undo, and transport or booking detail owners", () => {
  assert.match(itinerary, /scheduleItineraryIdeaWithUndo/);
  assert.match(itinerary, /scheduleItineraryIdeaAtPositionWithUndo/);
  assert.match(itinerary, /undoItineraryItemAction\(current, undoReceipt\)/);
  assert.match(itinerary, /<MorroviaFormDialog[\s\S]*eyebrow=\{copy\.moveActivityEyebrow\}/);
  assert.match(itinerary, /function ItineraryLogisticsDetail/);
  assert.match(itinerary, /itineraryTransportAgenda\(workingTrip\)/);
  assert.match(itinerary, /selectedTransportAgenda \? <ItineraryLogisticsDetail/);
  assert.match(itinerary, /selectedBooking \? <ItineraryLogisticsDetail/);
  assert.doesNotMatch(itinerary.slice(itinerary.indexOf("function ItineraryLogisticsDetail")), /recommendationDetailForExploreResult/);
});

test("Calendar exposes truthful temporal and item semantics without relying on colour", () => {
  assert.match(itinerary, /calendarScheduleLabel/);
  assert.match(itinerary, /item\.schedule\.kind === "full-day"/);
  assert.match(itinerary, /item\.schedule\.kind === "day-part"/);
  assert.match(itinerary, /item\.schedule\.kind === "time"/);
  assert.match(itinerary, /copy\.timeNotSet/);
  assert.match(itinerary, /item\.kind === "transfer"/);
  assert.match(itinerary, /item\.kind === "accommodation"/);
  assert.match(itinerary, /item\.booking\.type/);
  assert.match(itinerary, /<b>\{band\.stop\.order \+ 1\}<\/b>/, "repeated destination bands need a visible occurrence number");
});

test("continuous and representative Calendar stories cover all required widths", () => {
  for (const story of ["RichDayPlannerIntegratedMobile390", "CalendarMobile320", "CalendarMobile390", "CalendarMobile430", "CalendarTablet768", "CalendarDesktop1024", "CalendarDesktop1440", "CalendarLongMonthCrossing", "CalendarLongTrip19Days", "CalendarLongTrip65Days", "CalendarRepeatedStopTransferHeavy", "CalendarBookingDetail", "LongTrip65LateDay"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
  assert.match(styles, /\.calendarGrid \{[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.calendarGrid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 540px\)[\s\S]*\.calendarGrid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.calendarItems \.calendarItem \{[\s\S]*min-height: 44px/);
  assert.match(styles, /--morrovia-mobile-dock-offset/);
});

test("mixed timing workspace acceptance includes a saved exact time and an untimed item", () => {
  const mixedTiming = stories.slice(stories.indexOf("export const AcceptanceMixedTiming"), stories.indexOf("export const AcceptanceTransferStayTransition"));
  assert.match(mixedTiming, /startsAt: index === 0 \? "09:00" : undefined/);
});

test("Spanish acceptance renders the production workspace with Spanish copy", () => {
  assert.match(stories, /export const AcceptanceSpanish: Story = \{[\s\S]*?language: "es"/);
  assert.match(itinerary, /routePhotoSources: "Fuentes de fotos de la ruta"/);
  assert.match(itinerary, /<summary><span>\{copy\.routePhotoSources\}<\/span><\/summary>/);
  assert.match(itinerary, /\{copy\.day\} \{pad\(active\.dayNumber\)\}/);
  assert.match(itinerary, /label=\{copy\.jumpToDateDestination\}/);
});

test("restored rail and occurrence navigation have explicit responsive Storybook states", () => {
  for (const story of ["RestoredDayRailMobile320", "RestoredDayRailMobile390", "RestoredDayRailMobile430", "RestoredDayRailTablet768", "RestoredDayRailDesktop1024", "RestoredDayRailDesktop1440", "RepeatedDestinationSecondOccurrence"]) {
    assert.match(stories, new RegExp(`export const ${story}`));
  }
  assert.match(stories, /second Tokyo occurrence must remain active/);
});

test("production-backed acceptance stories cover the ten day-view states and five widths", () => {
  assert.match(stories, /component: TripItineraryWorkspace/);
  for (const story of [
    "AcceptanceEmptyMexicoNoStay", "AcceptancePlannedMexicoStayPhoto", "AcceptanceMixedTiming",
    "AcceptanceTransferStayTransition", "AcceptanceNoSuggestions", "AcceptanceNoPhotography",
    "AcceptanceLongDestinations", "AcceptanceRepeatedTokyo", "AcceptanceDenseDay",
    "AcceptanceLogisticsOnly",
    "AcceptanceMobile390", "AcceptanceMobile430", "AcceptanceTablet768",
    "AcceptanceDesktop1024", "AcceptanceDesktop1440",
  ]) assert.match(stories, new RegExp(`export const ${story}`));
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.destinationTrack \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.dayList \{[\s\S]*overflow-x: auto/);
  assert.match(styles, /@media \(max-width: 1200px\)[\s\S]*\.contextRail \{[\s\S]*grid-row: auto/);
});

test("logistics-only acceptance includes a canonical saved stay and no invented activity", () => {
  const fixture = stories.slice(stories.indexOf("const mexicoLogisticsOnlyTrip"), stories.indexOf("export const AcceptanceEmptyMexicoNoStay"));
  assert.match(fixture, /bookings: \[\{ id: "mexico-logistics-stay", type: "stay"/);
  assert.match(stories, /export const AcceptanceLogisticsOnly: Story = \{ args: \{ trip: mexicoLogisticsOnlyTrip, selectedDayNumber: 1/);
});

test("no-photography acceptance does not show unrelated suggestion fixtures", () => {
  const noPhoto = stories.slice(stories.indexOf("export const SelectedDayWithoutPhotography"), stories.indexOf("const mexicoAcceptanceTrip"));
  assert.match(noPhoto, /initialSuggestions: \{ 1: \[\], 2: \[\], 3: \[\], 4: \[\], 5: \[\], 6: \[\] \}/);
  assert.match(noPhoto, /initialActivityInventory: \{ 1: \[\], 2: \[\], 3: \[\], 4: \[\], 5: \[\], 6: \[\] \}/);
});
