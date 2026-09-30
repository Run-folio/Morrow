import assert from "node:assert/strict";
import test from "node:test";
import { buildSpreadsheetImportProposal, canonicalTripFromSpreadsheetProposal, parseDelimitedText } from "../lib/easyt/spreadsheet-import.ts";
import { buildImportedDatedDays } from "../lib/easyt/imported-trip-hydration.ts";
import { tripRouteDisplayLabel } from "../lib/easyt/trip-legs.ts";
import { itineraryCalendarDays, itineraryCalendarWeeks, itineraryCalendarNightBands } from "../lib/easyt/itinerary-calendar.ts";
import { exploreDestinationOptions, exploreDiscoveryRequestKey } from "../lib/easyt/explore.ts";
import { tripReadinessSummary } from "../lib/easyt/trip-readiness-summary.ts";
import { deriveOverviewReadinessCategories } from "../lib/easyt/trip-overview-readiness.ts";
import { overviewStopImage } from "../lib/easyt/trip-overview-imagery.ts";
import { personalRoutePresentation } from "../lib/easyt/personal-route.ts";
import { deriveItineraryCoverage } from "../lib/easyt/trip-facts.ts";
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

test("shared route label hides only equivalent origin and first stop", () => {
  assert.equal(tripRouteDisplayLabel(trip), "Manila → El Nido → Bohol → Siquijor → Cebu City → Manila");
  assert.equal(trip.stops.length, 6);
  assert.notEqual(trip.stops[0].id, trip.stops[5].id);
  const distinctOrigin = { ...trip, brief: { ...trip.brief, originCanonicalPlaceId: "place:other-manila", originCoordinates: [121.5, 14.6] as [number, number] } };
  assert.equal(tripRouteDisplayLabel(distinctOrigin), "Manila → Manila → El Nido → Bohol → Siquijor → Cebu City → Manila");
  const adjacentRepeat = { ...trip, stops: [trip.stops[0], { ...trip.stops[0], id: "adjacent-repeat", order: 0.5 }, ...trip.stops.slice(1)] };
  assert.equal(tripRouteDisplayLabel(adjacentRepeat), "Manila → Manila → El Nido → Bohol → Siquijor → Cebu City → Manila");
});

test("hydrated import enters existing calendar, Explore, route and image projections", () => {
  const hydrated = { ...trip, planItems: buildImportedDatedDays({ tripId: trip.id, startDate: trip.startDate!, endDate: trip.endDate!, stops: trip.stops, activities: [] }).planItems };
  const calendar = itineraryCalendarDays(hydrated);
  assert.equal(calendar.length, 21);
  assert.equal(calendar[20].stop?.id, hydrated.stops[5].id);
  assert.equal(calendar.filter((day) => day.items.some((item) => item.kind === "activity")).length, 0);
  assert.equal(itineraryCalendarWeeks(hydrated).flatMap(itineraryCalendarNightBands).reduce((total, band) => total + band.span, 0), 20);
  const destinations = exploreDestinationOptions(hydrated);
  assert.deepEqual(destinations.map((option) => option.id), hydrated.stops.map((stop) => stop.id));
  const request = JSON.parse(exploreDiscoveryRequestKey(hydrated));
  assert.deepEqual(request.stops.map((stop: { id: string }) => stop.id), hydrated.stops.map((stop) => stop.id));
  assert.equal(personalRoutePresentation(hydrated).stops.length, 6);
  assert.equal(overviewStopImage(hydrated, hydrated.stops[0])?.src, overviewStopImage(trip, trip.stops[0])?.src);
});

test("21 structural import days do not claim a fully planned itinerary", () => {
  const hydrated = { ...trip, planItems: buildImportedDatedDays({ tripId: trip.id, startDate: trip.startDate!, endDate: trip.endDate!, stops: trip.stops, activities: [] }).planItems };
  const itinerary = tripReadinessSummary(hydrated).signals.find((signal) => signal.id === "itinerary")!;
  assert.equal(itinerary.complete, false);
  assert.match(itinerary.label, /outline|activities|time free/i);
  assert.match(deriveItineraryCoverage(hydrated).label, /outline/i);
  const overview = deriveOverviewReadinessCategories({ trip: hydrated, prepTasks: [], providerStatus: "unavailable" }).find((item) => item.id === "itinerary")!;
  assert.equal(overview.status, "in-progress");
});
