import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const projection = readFileSync(new URL("../lib/easyt/itinerary-calendar.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.module.css", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.stories.tsx", import.meta.url), "utf8");

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
  assert.match(itinerary, /searchParams\.set\("itineraryDay", day\.id\)/);
  assert.match(itinerary, /window\.addEventListener\("popstate", restoreOrientation\)/);
  assert.match(itinerary, /items\.slice\(0, 4\)/);
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
