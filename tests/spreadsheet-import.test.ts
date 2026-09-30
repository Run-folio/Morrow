import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

import {
  buildSpreadsheetImportProposal,
  canonicalTripFromSpreadsheetProposal,
  parseDelimitedText,
  parseSpreadsheetDate,
  spreadsheetColumnMappings,
  spreadsheetImportSummary,
  tableFromRows,
  type ResolvedImportOrigin,
  type ResolvedImportPlace,
} from "../lib/easyt/spreadsheet-import.ts";
import { parseSpreadsheetWorkbook } from "../lib/easyt/spreadsheet-import-file.ts";
import {
  cacheCanonicalTripWithRecoveryToStorage,
  loadCachedTripFromStorage,
  loadTripRecoveryFromStorage,
  saveTripRecoveryToStorage,
  type EasyTBrowserStorage,
} from "../lib/easyt/storage.ts";
import { isEasyTTrip } from "../lib/easyt/trip.ts";
import { composeItineraryDay } from "../lib/easyt/itinerary-day-composition.ts";
import { resolveCanonicalRoadFallback } from "../lib/easyt/road-transfer-resolution.ts";
import { transportBookingForLeg, transportBookingProgress } from "../lib/easyt/booking-readiness.ts";
import { itineraryTransportAgenda } from "../lib/easyt/itinerary-transport-agenda.ts";
import { deriveItineraryCoverage } from "../lib/easyt/trip-facts.ts";
import { pendingSpreadsheetImportForRetry } from "../lib/easyt/spreadsheet-import-submission.ts";
import { firstTripWorkspaceHref, itineraryWorkspaceHref, mapWorkspaceHref } from "../lib/easyt/trip-workspace-links.ts";
import {
  formatImportDate,
  formatImportDateRange,
  groupSkippedImportIssues,
  skippedImportSummary,
} from "../app/journey/new/import/spreadsheet-import-review-presentation.ts";
import {
  ambiguousDateCsv,
  cachedFormulaXlsxFixture,
  cleanFiveStopTripCsv,
  duplicateTripCsv,
  messySpreadsheetCsv,
  partiallyUnmappableCsv,
  philippinesImportCsv,
  pastedGoogleSheetsTable,
  richTripCsv,
  richTripXlsxFixture,
  simpleDestinationDateCsv,
} from "./fixtures/spreadsheet-import.ts";

class MemoryStorage implements EasyTBrowserStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function resolvedPlaces(proposal: ReturnType<typeof buildSpreadsheetImportProposal>): ResolvedImportPlace[] {
  return proposal.stops.map((stop, index) => ({
    sourceStopId: stop.id,
    canonicalPlaceId: `fixture:${stop.name.toLocaleLowerCase()}`,
    name: stop.name,
    country: stop.country || "Fixture country",
    countryCode: "FX",
    providerId: `fixture-${index}`,
    coordinates: [139.7 - index * 4, 35.6 - index],
  }));
}

const origin: ResolvedImportOrigin = {
  canonicalPlaceId: "fixture:london",
  name: "London",
  country: "United Kingdom",
  countryCode: "GB",
  providerId: "fixture-origin",
  coordinates: [-0.1276, 51.5072],
};

test("Philippines review keeps six dated occurrences and does not book Journey / transport", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(philippinesImportCsv, "Philippines.csv"));
  assert.deepEqual(proposal.stops.map((stop) => stop.name), ["Manila", "El Nido", "Bohol", "Siquijor", "Cebu City", "Manila"]);
  assert.equal(new Set(proposal.stops.map((stop) => stop.id)).size, 6);
  assert.equal(proposal.totalNights, 20);
  assert.deepEqual([proposal.startDate, proposal.endDate], ["2026-12-11", "2026-12-31"]);
  assert.equal(proposal.bookings.filter((booking) => booking.type === "transport").length, 0);
  assert.equal(proposal.canConfirmStructure, true);
  assert.ok(proposal.ignoredColumns.includes("Journey / transport"));
});

test("review blocks stop gaps, overlaps and zero-night intervals before confirmation", () => {
  const changed = [
    ["2026-12-14,2026-12-18,4", "gap"],
    ["2026-12-12,2026-12-18,6", "overlap"],
    ["2026-12-13,2026-12-13,0", "zero nights"],
  ] as const;
  for (const [dates, label] of changed) {
    const csv = philippinesImportCsv.replace("2026-12-13,2026-12-18,5", dates);
    const proposal = buildSpreadsheetImportProposal(parseDelimitedText(csv));
    assert.equal(proposal.canConfirmStructure, false, label);
    assert.ok(proposal.issues.some((issue) => issue.status === "needs-review"), label);
  }
});

test("review blocks an outgoing-stop activity on its departure boundary", () => {
  const csv = `${philippinesImportCsv}\n7,Manila,Manila,2026-12-11,2026-12-13,2,, , ,Museum,2026-12-13`;
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(csv.replace("Notes\n", "Notes,Activity,Activity date\n")));
  assert.equal(proposal.canConfirmStructure, false);
});

test("A. simple destination/date CSV detects stops, derives nights, and preserves route order", () => {
  const table = parseDelimitedText(simpleDestinationDateCsv, "simple.csv");
  const proposal = buildSpreadsheetImportProposal(table);
  assert.equal(proposal.canConfirmStructure, true);
  assert.deepEqual(proposal.stops.map((stop) => stop.name), ["Tokyo", "Kyoto"]);
  assert.deepEqual(proposal.stops.map((stop) => stop.nights), [4, 4]);
  assert.deepEqual(spreadsheetImportSummary(proposal), { stops: 2, nights: 8, stays: 0, transportBookings: 0, activities: 0, needsReview: 0, notImported: 0 });
});

test("B. richer CSV maps confirmed stays, transport, activities and notes conservatively", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(richTripCsv, "rich.csv"));
  const summary = spreadsheetImportSummary(proposal);
  assert.deepEqual(proposal.stops.map((stop) => stop.name), ["Tokyo", "Kyoto"]);
  assert.deepEqual(summary, { stops: 2, nights: 8, stays: 2, transportBookings: 1, activities: 2, needsReview: 0, notImported: 0 });
  assert.equal(proposal.bookings[0].endDate, "2027-04-06");
  assert.deepEqual(proposal.bookings.at(-1)?.transportDetails, { mode: "train", sourceMode: "Train", from: "Tokyo", to: "Kyoto" });
  assert.deepEqual(proposal.activities.map((activity) => activity.date), ["2027-04-03", "2027-04-08"]);
});

test("clean five-stop review fixture produces the traveller-facing acceptance summary", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(cleanFiveStopTripCsv, "Trip.xlsx"));
  assert.deepEqual(spreadsheetImportSummary(proposal), {
    stops: 5,
    nights: 14,
    stays: 5,
    transportBookings: 5,
    activities: 10,
    needsReview: 0,
    notImported: 0,
  });
  assert.equal(proposal.columns.filter((mapping) => mapping.state === "mapped").length, 14);
  assert.equal(proposal.canConfirmStructure, true);
});

test("C. XLSX inspects visible non-empty worksheets without merging or reading hidden sheets", () => {
  const workbook = parseSpreadsheetWorkbook(richTripXlsxFixture(), "trip.xlsx");
  assert.deepEqual(workbook.sheets.map((sheet) => sheet.name), ["Trip plan", "Alternate plan"]);
  const proposal = buildSpreadsheetImportProposal(workbook.sheets[0]);
  assert.equal(proposal.bookings.length, 3);
  assert.equal(proposal.activities.length, 2);
});

test("XLSX cached formula values may be read without retaining or executing formulas", () => {
  const workbook = parseSpreadsheetWorkbook(cachedFormulaXlsxFixture(), "formula.xlsx");
  assert.equal(workbook.sheets[0].rows[0][2], 4);
  const proposal = buildSpreadsheetImportProposal(workbook.sheets[0]);
  assert.equal(proposal.stops[0].nights, 4);
  assert.equal(proposal.stops[0].departureDate, "2027-03-05");
});

test("D. pasted Google-Sheets-style tabs use the same deterministic parser", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(pastedGoogleSheetsTable));
  assert.deepEqual(proposal.stops.map((stop) => [stop.name, stop.nights]), [["Lisbon", 3], ["Porto", 3]]);
  assert.equal(proposal.stops[0].notes[0].text, "Anniversary dinner");
});

test("E. messy headers, blanks and extra columns remain visible but do not corrupt recognised stops", () => {
  const table = parseDelimitedText(messySpreadsheetCsv, "messy.csv");
  const proposal = buildSpreadsheetImportProposal(table);
  assert.deepEqual(proposal.stops.map((stop) => stop.name), ["Tokyo", "Kyoto"]);
  assert.ok(proposal.ignoredColumns.includes("Unused budget idea"));
  assert.ok(proposal.issues.some((issue) => issue.title === "Blank row not imported"));
});

test("F. ambiguous dates fail closed instead of choosing US or international order", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(ambiguousDateCsv));
  assert.equal(proposal.canConfirmStructure, false);
  assert.equal(proposal.stops[0].arrivalDate, null);
  assert.ok(proposal.issues.some((issue) => issue.title === "Ambiguous arrival date"));
  assert.deepEqual(parseSpreadsheetDate("13/05/2027"), { value: "2027-05-13", state: "valid", source: "13/05/2027" });
  assert.deepEqual(parseSpreadsheetDate("05/13/2027"), { value: "2027-05-13", state: "valid", source: "05/13/2027" });
});

test("G. identical rows and repeated booking references are conservatively omitted", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(duplicateTripCsv));
  assert.equal(proposal.stops.length, 1);
  assert.equal(proposal.bookings.length, 1);
  assert.equal(proposal.issues.filter((issue) => issue.title === "Duplicate row not imported").length, 2);
});

test("H. partially unmappable sheets retain ignored columns and explain dropped rows", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(partiallyUnmappableCsv));
  assert.deepEqual(proposal.ignoredColumns, ["Maybe", "Freeform wish"]);
  assert.ok(proposal.issues.some((issue) => issue.title === "Row has no destination"));
  assert.ok(proposal.rows.some((row) => row.status === "needs-review"));
});

test("common aliases map case-insensitively while generic Date remains ambiguous", () => {
  const table = tableFromRows("aliases", [[" CITY ", "CHECK-IN", "checkout", "PNR", "Date"], ["Rome", "2027-01-01", "2027-01-03", "ABC", "2027-01-02"]]);
  const mappings = spreadsheetColumnMappings(table.headers);
  assert.deepEqual(mappings.map((mapping) => [mapping.header, mapping.field, mapping.state]), [
    ["CITY", "destination", "mapped"], ["CHECK-IN", "arrivalDate", "mapped"], ["checkout", "departureDate", "mapped"], ["PNR", "bookingReference", "mapped"], ["Date", null, "ambiguous"],
  ]);
});

test("canonical confirmation creates one normal trip with exact stops, bookings, activities and explicit leg mode", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(richTripCsv, "rich.csv"));
  const trip = canonicalTripFromSpreadsheetProposal({ id: "trip-spreadsheet-fixture", proposal, origin, places: resolvedPlaces(proposal), createdAt: "2027-01-01T00:00:00.000Z" });
  assert.equal(isEasyTTrip(trip), true);
  assert.equal(trip.status, "planned");
  assert.deepEqual(trip.stops.map((stop) => [stop.name, stop.arrivalDate, stop.departureDate, stop.nights]), [["Tokyo", "2027-04-02", "2027-04-06", 4], ["Kyoto", "2027-04-06", "2027-04-10", 4]]);
  assert.equal(trip.brief.bookings?.length, 3);
  assert.equal(trip.brief.bookings?.[0].endDate, "2027-04-06");
  assert.equal(trip.planItems.length, 9);
  assert.equal(deriveItineraryCoverage(trip).label, "9 days outlined", "partial authored activity does not make every structural day planned");
  assert.equal(new Set(trip.planItems.map((item) => item.date)).size, 9);
  assert.deepEqual(trip.planItems.find((item) => item.date === "2027-04-03")?.notes, ["Senso-ji"]);
  assert.deepEqual(trip.planItems.find((item) => item.date === "2027-04-08")?.notes, ["Fushimi Inari"]);
  assert.deepEqual(trip.brief.customActivities?.[2], ["Senso-ji"]);
  assert.deepEqual(trip.brief.dayNotes?.[2], ["Morning visit"]);
  const composed = composeItineraryDay(trip, trip.planItems.find((item) => item.date === "2027-04-03")!.id)!;
  assert.deepEqual([...Object.values(composed.planned).flat(), ...composed.unslotted].map((item) => item.title), ["Senso-ji"]);
  assert.equal(trip.legs.find((leg) => leg.fromEndpoint?.name === "Tokyo" && leg.toEndpoint?.name === "Kyoto")?.mode, "train");
  assert.equal(firstTripWorkspaceHref(trip.id), "/journey/trip-spreadsheet-fixture?created=1");
  assert.equal(mapWorkspaceHref(trip.id), "/journey/trip-spreadsheet-fixture/map");
  assert.equal(itineraryWorkspaceHref(trip.id), "/journey/trip-spreadsheet-fixture/itinerary");
});

test("Philippines confirmation creates one day per date without inventing activity content", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(philippinesImportCsv));
  const manilaOrigin = { ...origin, name: "Manila", country: "Philippines", canonicalPlaceId: "fixture:manila" };
  const trip = canonicalTripFromSpreadsheetProposal({ id: "trip-philippines-import", proposal, origin: manilaOrigin, places: resolvedPlaces(proposal) });
  assert.equal(trip.planItems.length, 21);
  assert.equal(trip.planItems[20].stopId, trip.stops[5].id);
  assert.deepEqual(trip.planItems[20].notes, []);
  assert.equal(trip.stops[0].id === trip.stops[5].id, false);
  assert.equal(trip.planItems.some((item) => item.type !== "open"), false);
  assert.equal(trip.legs.length, 5);
  assert.ok(trip.legs.every((leg) => leg.mode === "unknown" && leg.durationMinutes === null && leg.usableDayLoss === null && leg.scheduleNeedsChecking));
  assert.ok(trip.legs.every((leg) => leg.routeMetadata.roadFallbackEligible === false));
  assert.ok(trip.legs.every((leg) => leg.routeMetadata.label === undefined && leg.routeMetadata.transferImpact === undefined));
});

test("unbooked imported island legs never acquire a confident road duration from fallback", async () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(philippinesImportCsv));
  const trip = canonicalTripFromSpreadsheetProposal({ id: "trip-island-legs", proposal, origin: { ...origin, name: "Manila", canonicalPlaceId: "fixture:manila" }, places: resolvedPlaces(proposal) });
  for (const [from, to] of [["El Nido", "Bohol"], ["Siquijor", "Cebu City"]]) {
    const leg = trip.legs.find((item) => item.fromEndpoint?.name === from && item.toEndpoint?.name === to)!;
    const result = await resolveCanonicalRoadFallback(leg, { provider: { provider: "openrouteservice", route: async () => { throw new Error("Road provider must not be called"); } } });
    assert.equal(result.reason, "explicit_or_unsupported_source");
    assert.equal(result.leg.mode, "unknown");
    assert.equal(result.leg.durationMinutes, null);
  }
});

test("complete dated transport booking binds only the adjacent final Manila occurrence", () => {
  const booked = philippinesImportCsv.split("\n").map((row, index) => `${row},${index === 0 ? "Transport,From,To,Transport date,Booking reference" : index === 6 ? "Flight,Cebu City,Manila,2026-12-30,BOOK-6" : ",,,,"}`).join("\n");
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(booked));
  const trip = canonicalTripFromSpreadsheetProposal({ id: "trip-booked-final", proposal, origin: { ...origin, name: "Manila", canonicalPlaceId: "fixture:manila" }, places: resolvedPlaces(proposal) });
  assert.equal(proposal.bookings.filter((booking) => booking.type === "transport").length, 1);
  const bookedLegs = trip.legs.filter((leg) => leg.routeMetadata.importedBookingId);
  assert.equal(bookedLegs.length, 1);
  assert.equal(bookedLegs[0].fromStopId, trip.stops[4].id);
  assert.equal(bookedLegs[0].toStopId, trip.stops[5].id);
  assert.equal(bookedLegs[0].mode, "flight");
  assert.equal(bookedLegs[0].durationMinutes, null, "booking confirms mode but not a duration");
  assert.equal(transportBookingForLeg(trip, bookedLegs[0], trip.stops[4], trip.stops[5])?.id, bookedLegs[0].routeMetadata.importedBookingId);
  assert.equal(itineraryTransportAgenda(trip).find((item) => item.leg.id === bookedLegs[0].id)?.status, "booked");
});

test("transport with matching names but a mismatched date cannot bind a leg", () => {
  const mismatched = philippinesImportCsv.split("\n").map((row, index) => `${row},${index === 0 ? "Transport,From,To,Transport date,Booking reference" : index === 6 ? "Flight,Manila,El Nido,2026-12-30,BOOK-MISMATCH" : ",,,,"}`).join("\n");
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(mismatched));
  const trip = canonicalTripFromSpreadsheetProposal({ id: "trip-date-mismatch", proposal, origin: { ...origin, name: "Manila", canonicalPlaceId: "fixture:manila" }, places: resolvedPlaces(proposal) });
  assert.equal(proposal.bookings.filter((booking) => booking.type === "transport").length, 1);
  assert.equal(trip.legs.filter((leg) => leg.routeMetadata.importedBookingId).length, 0);
  const firstLeg = trip.legs.find((leg) => leg.fromStopId === trip.stops[0].id && leg.toStopId === trip.stops[1].id)!;
  assert.equal(transportBookingForLeg(trip, firstLeg, trip.stops[0], trip.stops[1]), undefined);
  assert.equal(itineraryTransportAgenda(trip).find((item) => item.leg.id === firstLeg.id)?.status, "confirm");
  assert.equal(transportBookingProgress(trip).sortedCount, 0);
});

test("review is temporary; only explicit confirmation enters existing recovery and canonical cache paths", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(richTripCsv));
  const storage = new MemoryStorage();
  assert.equal(storage.length, 0, "parsing and proposal creation do not persist a trip");
  const trip = canonicalTripFromSpreadsheetProposal({ id: "trip-import-once", proposal, origin, places: resolvedPlaces(proposal) });
  const recovery = saveTripRecoveryToStorage(storage, trip, { ownerId: "owner-one", writeId: "import-write" });
  assert.equal(recovery.stored, true);
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-one")?.trip.id, trip.id);
  const canonical = { ...trip, ownerId: "owner-one", updatedAt: "2027-01-01T00:00:01.000Z" };
  const cached = cacheCanonicalTripWithRecoveryToStorage(storage, canonical, recovery.handle);
  assert.deepEqual(cached, { stored: true, recoveryResolved: true });
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-one"), null);
  assert.equal(loadCachedTripFromStorage(storage, trip.id, "owner-one")?.id, "trip-import-once");
});

test("failed account acknowledgement retries the same reviewed import and recovery handle", () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(philippinesImportCsv));
  const storage = new MemoryStorage();
  const trip = canonicalTripFromSpreadsheetProposal({ id: "trip-import-retry", proposal, origin: { ...origin, name: "Manila", canonicalPlaceId: "fixture:manila" }, places: resolvedPlaces(proposal) });
  const saved = saveTripRecoveryToStorage(storage, trip, { ownerId: "owner-one", writeId: "import-write" });
  assert.equal(saved.stored, true);
  const pending = { reviewedInputKey: "reviewed-philippines", ownerId: "owner-one", trip, handle: saved.handle };
  const recovery = loadTripRecoveryFromStorage(storage, trip.id, "owner-one");
  const storedKeyCount = storage.length;
  const retry = pendingSpreadsheetImportForRetry(pending, { reviewedInputKey: "reviewed-philippines", ownerId: "owner-one", recovery });
  assert.equal(retry?.trip, trip);
  assert.equal(retry?.handle.writeId, saved.handle.writeId);
  assert.equal(storage.length, storedKeyCount, "retry does not write a second recovery");
  assert.throws(() => pendingSpreadsheetImportForRetry(pending, { reviewedInputKey: "edited-review", ownerId: "owner-one", recovery }), /changed/i);
  assert.throws(() => pendingSpreadsheetImportForRetry(pending, { reviewedInputKey: "reviewed-philippines", ownerId: "owner-two", recovery }), /account/i);
  assert.throws(() => pendingSpreadsheetImportForRetry(pending, { reviewedInputKey: "reviewed-philippines", ownerId: "owner-one", recovery: null }), /recovery/i);
  const replacement = saveTripRecoveryToStorage(storage, { ...trip, title: "Newer edit" }, { ownerId: "owner-one", writeId: "newer-write", replace: saved.handle });
  assert.equal(replacement.stored, true);
  assert.throws(() => pendingSpreadsheetImportForRetry(pending, { reviewedInputKey: "reviewed-philippines", ownerId: "owner-one", recovery: loadTripRecoveryFromStorage(storage, trip.id, "owner-one") }), /recovery/i);
});

test("malformed and oversized structures fail with specific recovery messages", () => {
  assert.throws(() => parseDelimitedText('Destination,Notes\nTokyo,"unclosed'), /unclosed quoted value/);
  assert.throws(() => tableFromRows("wide", [Array.from({ length: 61 }, (_, index) => `H${index}`), Array(61).fill("x")]), /more than 60 columns/);
  assert.throws(() => tableFromRows("blank", [["", ""], ["", ""]]), /blank/);
});

test("privacy boundary keeps raw files client-side and sends no spreadsheet rows to AI or remote URLs", () => {
  const client = readFileSync(new URL("../app/journey/new/import/spreadsheet-import-client.tsx", import.meta.url), "utf8");
  const parser = readFileSync(new URL("../lib/easyt/spreadsheet-import-file.ts", import.meta.url), "utf8");
  const core = readFileSync(new URL("../lib/easyt/spreadsheet-import.ts", import.meta.url), "utf8");
  assert.doesNotMatch(`${client}\n${parser}\n${core}`, /openai|chatgpt|responses\.create|dangerouslySetInnerHTML/i);
  assert.doesNotMatch(parser, /fetch\(|http:|https:/);
  assert.doesNotMatch(client, /localStorage.*file|sessionStorage.*file|FormData|FileReader/);
  assert.match(client, /\/api\/journey-geocode/);
  assert.match(parser, /bookVBA: false/);
  assert.match(parser, /cellFormula: false/);
});

test("import navigation returns to the unified Builder empty state", { skip: !builderBrowserTestsEnabled }, async () => {
  const view = await renderBuilder();
  try {
    await view.page.getByRole("link", { name: "Import existing trip" }).click();
    await view.page.getByRole("heading", { name: "Bring your trip into Morrovia." }).waitFor();
    assert.equal(new URL(view.page.url()).pathname, "/journey/new/import");
    const back = view.page.getByRole("link", { name: "Back to trip creation" });
    assert.equal(await back.getAttribute("href"), "/journey/new");
    await back.click();
    await view.page.getByRole("heading", { name: "Describe your trip" }).waitFor();
    assert.equal(await view.page.getByRole("combobox", { name: "Add your first place", exact: true }).count(), 1);
  } finally { await view.close(); }
});

test("review presentation keeps diagnostics progressive and uses traveller-facing status language", () => {
  const review = readFileSync(new URL("../app/journey/new/import/spreadsheet-import-review.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/journey/new/import/spreadsheet-import-client.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/import/spreadsheet-import.module.css", import.meta.url), "utf8");
  const stories = readFileSync(new URL("../app/journey/new/import/spreadsheet-import-review.stories.tsx", import.meta.url), "utf8");
  assert.match(review, /Review your trip/);
  assert.match(review, /Everything looks ready/);
  assert.match(review, /Create trip/);
  assert.match(review, /Import details/);
  assert.match(review, /View skipped rows/);
  assert.match(review, /Column mapping/);
  assert.match(review, /Skipped rows/);
  assert.match(review, /Source rows/);
  assert.match(review, /<details className={styles\.importDetails}>/);
  assert.match(review, /role="status"/);
  assert.match(review, /aria-labelledby="attention-title"/);
  assert.match(review, /label={`Meaning of \$\{mapping\.header\}`}/);
  assert.match(review, /formatImportDateRange\(stop\.arrivalDate, stop\.departureDate\)/);
  assert.match(review, /stays\.length \? <details/);
  assert.match(review, /notes\.length \? <details/);
  assert.doesNotMatch(review, /Review import details|Review column mapping|View source details|Create one normal Morrovia trip/);
  assert.doesNotMatch(review, /Imported from your spreadsheet|Check column mapping|Confirm and open trip/);
  assert.doesNotMatch(client, /mappingPanel|summaryGrid|Detected route/);
  assert.doesNotMatch(styles, /var\(--morrovia-success\)|var\(--morrovia-tint\)|var\(--morrovia-danger-soft\)/);
  assert.match(stories, /CleanImport/);
  assert.match(stories, /NeedsAttention/);
  assert.match(stories, /PartialImport/);
  assert.match(stories, /MappingRequired/);
  assert.match(stories, /CleanImportAt390/);
});

test("review presentation groups duplicate diagnostics by source row without changing parser issues", () => {
  const issues = [
    { id: "duplicate-reference-12", status: "not-imported" as const, title: "Duplicate booking reference not imported", detail: "Reference already appears.", rowNumber: 12 },
    { id: "stay-incomplete-12", status: "not-imported" as const, title: "Hotel not imported as booked", detail: "The stay is incomplete.", rowNumber: 12 },
    { id: "missing-destination-13", status: "not-imported" as const, title: "Row has no destination", detail: "No destination was supplied.", rowNumber: 13 },
  ];
  const groups = groupSkippedImportIssues(issues);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].repeatedBookingRow, true);
  assert.equal(groups[0].issues.length, 2, "both parser diagnostics remain available in the presentation group");
  assert.deepEqual(skippedImportSummary(groups), {
    title: "2 rows skipped",
    detail: "1 repeated booking row and 1 duplicate/incomplete entry were ignored.",
  });
});

test("review dates are human-readable while canonical ISO values remain untouched", () => {
  const start = "2027-05-03";
  const end = "2027-05-06";
  assert.equal(formatImportDateRange(start, end), "3–6 May 2027");
  assert.equal(formatImportDate(start), "3 May 2027");
  assert.equal(start, "2027-05-03");
  assert.equal(end, "2027-05-06");
});
