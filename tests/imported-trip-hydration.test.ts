import assert from "node:assert/strict";
import test from "node:test";
import { buildSpreadsheetImportProposal, canonicalTripFromSpreadsheetProposal, parseDelimitedText } from "../lib/easyt/spreadsheet-import.ts";
import { buildImportedDatedDays } from "../lib/easyt/imported-trip-hydration.ts";
import { philippinesImportCsv } from "./fixtures/spreadsheet-import.ts";

const proposal = buildSpreadsheetImportProposal(parseDelimitedText(philippinesImportCsv));
const trip = canonicalTripFromSpreadsheetProposal({
  id: "trip-philippines", proposal,
  origin: { canonicalPlaceId: "place:manila", name: "Manila", country: "Philippines", coordinates: [120.98, 14.6] },
  places: proposal.stops.map((stop, index) => ({
    sourceStopId: stop.id,
    canonicalPlaceId: `place:${stop.name.toLowerCase().replaceAll(" ", "-")}`,
    name: stop.name,
    country: "Philippines",
    coordinates: [120 + index, 14 + index] as [number, number],
  })),
});

test("pure imported projection creates 21 stable dated days with final Manila departure-day ownership", () => {
  const input = { tripId: trip.id, startDate: trip.startDate!, endDate: trip.endDate!, stops: trip.stops, activities: [] };
  const first = buildImportedDatedDays(input);
  const second = buildImportedDatedDays(input);
  assert.equal(first.planItems.length, 21);
  assert.deepEqual(first.planItems.map((item) => item.date), Array.from({ length: 21 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 11, 11 + index));
    return date.toISOString().slice(0, 10);
  }));
  assert.deepEqual(first.planItems.map((item) => item.dayNumber), Array.from({ length: 21 }, (_, index) => index + 1));
  assert.deepEqual(first.planItems.map((item) => item.stopId), [
    ...Array(2).fill(trip.stops[0].id), ...Array(5).fill(trip.stops[1].id),
    ...Array(4).fill(trip.stops[2].id), ...Array(5).fill(trip.stops[3].id),
    ...Array(3).fill(trip.stops[4].id), ...Array(2).fill(trip.stops[5].id),
  ]);
  assert.equal(first.planItems[20].date, "2026-12-31");
  assert.equal(first.planItems[20].stopId, trip.stops[5].id);
  assert.ok(first.planItems.every((item) => item.type === "open" && item.notes.length === 0));
  assert.deepEqual(first, second);
});
