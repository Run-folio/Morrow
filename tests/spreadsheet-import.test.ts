import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.equal(trip.planItems.length, 2);
  assert.equal(trip.legs.find((leg) => leg.fromEndpoint?.name === "Tokyo" && leg.toEndpoint?.name === "Kyoto")?.mode, "train");
  assert.equal(firstTripWorkspaceHref(trip.id), "/journey/trip-spreadsheet-fixture?created=1");
  assert.equal(mapWorkspaceHref(trip.id), "/journey/trip-spreadsheet-fixture/map");
  assert.equal(itineraryWorkspaceHref(trip.id), "/journey/trip-spreadsheet-fixture/itinerary");
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

test("import is an additional Builder entry and leaves natural-language capture intact", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  assert.match(builder, /<MorroviaTripCapture/);
  assert.match(builder, /Import existing trip/);
  assert.match(builder, /href="\/journey\/new\/import"/);
  assert.match(builder, /submitInitialTripBrief/);
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
