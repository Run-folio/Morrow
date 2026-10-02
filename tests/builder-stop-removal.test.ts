import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { allocateTripNights, rebalanceTripNights } from "../lib/easyt/night-allocation.ts";
import { tripFromBuilder, type EasyTTrip, type TripBooking } from "../lib/easyt/trip.ts";
import { handoffStopOccurrenceId } from "../lib/easyt/home-trip-handoff.ts";
import { cascadeTripSchedule } from "../lib/easyt/cascade.ts";

// Execute the real Builder mutation closures without mounting its map or
// network boundaries. Setters implement React's value/updater contract.
function removalFixture(options: { only?: boolean; bookings?: TripBooking[]; updatedAt?: string } = {}) {
  const stops = (options.only ? ["cusco-first"] : ["cusco-first", "arequipa-first", "cusco-return", "arequipa-return"]).map((id) => ({
    id, name: id.startsWith("cusco") ? "Cusco" : "Arequipa", country: "Peru", canonicalPlaceId: id.startsWith("cusco") ? "cusco" : "arequipa",
  }));
  const allocation = Object.fromEntries(stops.map((stop) => [stop.id, 2]));
  const document = tripFromBuilder({ id: "removal", origin: "Lima", journeyEnd: { mode: "explicit", place: { name: "Lima", canonicalPlaceId: "lima" } },
    stops, startDate: "2026-10-01", endDate: "2026-10-09", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid", nightAllocations: allocation, draft: [],
  });
  document.brief.bookings = options.bookings;
  const state: Record<string, any> = {
    stops, allocation, dayAllocations: { ...allocation }, manualNightStopIds: [],
    scheduleLocks: { stopIds: [], arrivalDates: { "cusco-return": "2026-10-05" } },
    handoffStopOccurrenceId, handoffOccurrenceMentionIdsRef: { current: {} }, placeSelections: [], capturedStructuredBrief: { placeMentions: [] }, activeTripDocument: document,
    tripUpdatedAt: options.updatedAt, decisionSelections: { transportByLeg: {} }, pendingStopRemoval: null, stopRemovalBlocked: null, showStopEditor: false,
    nightEditFeedback: null, selectedRouteStopId: stops[0].id, routePreviewStopIds: null,
    removedPlaceMentionIds: [], completedPlanningAreaMentionIds: [], capturedPlaceSelections: [],
    startDate: document.startDate, endDate: document.endDate, picks: {}, discoveredPlaces: {},
    rememberStructuralChange: () => {},
  };
  for (const name of ["Stops", "DayAllocations", "ManualNightStopIds", "ScheduleLocks", "DecisionSelections", "PendingStopRemoval", "StopRemovalBlocked", "NightEditFeedback", "SelectedRouteStopId", "RoutePreviewStopIds", "ShowStopEditor", "PlaceSelections", "CapturedStructuredBrief", "RemovedPlaceMentionIds", "CompletedPlanningAreaMentionIds", "Picks", "DiscoveredPlaces"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    state[`set${name}`] = (next: unknown) => { state[key] = typeof next === "function" ? next(state[key]) : next; };
  }
  const source = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const actions = source.slice(source.indexOf("  const stopRemovalSafety ="), source.indexOf("  const updateTravelRange ="));
  const script = ts.transpileModule(`${actions}\nreturn { removeStop, requestRemoveStop };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handlers = new Function("scope", `with (scope) { ${script} }`)(state) as { removeStop: (id: string) => void; requestRemoveStop: (id: string) => void };
  return { state, document, ...handlers };
}

for (const id of ["cusco-first", "arequipa-first", "cusco-return", "arequipa-return"]) {
  test(`removing ${id} preserves other occurrences and leaves its nights unallocated`, () => {
    const view = removalFixture();
    view.removeStop(id);
    const expectedIds = ["cusco-first", "arequipa-first", "cusco-return", "arequipa-return"].filter((value) => value !== id);
    assert.deepEqual(view.state.stops.map((stop: { id: string }) => stop.id), expectedIds);
    assert.deepEqual(view.state.dayAllocations, Object.fromEntries(expectedIds.map((value) => [value, 2])));
    // Remaining counts must enter the existing allocator as traveller-owned
    // values, so a structural deletion cannot silently spend the released nights.
    const inputs = { totalNights: 8, stops: view.state.stops, currentAllocations: view.state.dayAllocations, manualStopIds: view.state.manualNightStopIds };
    const result = view.state.manualNightStopIds.length ? rebalanceTripNights(inputs).nightAllocation : allocateTripNights(inputs);
    assert.deepEqual(result.allocations, Object.fromEntries(expectedIds.map((value) => [value, 2])));
    assert.equal(result.totalAvailableNights - (result.totalAllocatedNights ?? 0), 2);
    assert.equal(view.state.startDate, "2026-10-01");
    assert.equal(view.state.endDate, "2026-10-09");
    if (id !== "cusco-return") assert.equal(view.state.scheduleLocks.arrivalDates["cusco-return"], "2026-10-05");
  });
}

test("only overnight stop removal keeps journey endpoints and trip dates", () => {
  const view = removalFixture({ only: true });
  view.removeStop("cusco-first");
  assert.deepEqual(view.state.stops, []);
  assert.deepEqual(view.state.dayAllocations, {});
  assert.equal(view.state.showStopEditor, true, "removing the last overnight stop must leave the existing Add stop editor available");
  assert.equal(view.document.brief.origin, "Lima");
  assert.equal(view.document.brief.journeyEnd?.mode, "explicit");
  if (view.document.brief.journeyEnd?.mode === "explicit") assert.equal(view.document.brief.journeyEnd.place.name, "Lima");
  assert.equal(view.state.startDate, "2026-10-01");
  assert.equal(view.state.endDate, "2026-10-09");
});

test("locked stop and missing occurrence cannot be removed", () => {
  const view = removalFixture();
  view.state.scheduleLocks.stopIds = ["cusco-first"];
  view.requestRemoveStop("cusco-first");
  view.removeStop("missing");
  assert.equal(view.state.stops.length, 4);
  assert.equal(view.state.pendingStopRemoval, null);
});

test("saved stay requires confirmation even before a cloud timestamp exists", () => {
  const view = removalFixture({ bookings: [{ id: "stay-cusco-first", type: "stay", title: "Cusco hotel", date: "2026-10-01", confirmation: null, url: null }] });
  view.requestRemoveStop("cusco-first");
  assert.equal(view.state.stops.length, 4);
  assert.equal(view.state.pendingStopRemoval?.id, "cusco-first");
});

test("saved activity requires confirmation and cancel leaves its data intact", () => {
  const view = removalFixture();
  view.document.planItems = [{ id: "activity", stopId: "cusco-first", dayNumber: 1, date: "2026-10-01", type: "activity", title: "Museum", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }];
  view.requestRemoveStop("cusco-first");
  assert.equal(view.state.stops.length, 4);
  assert.equal(view.state.pendingStopRemoval?.id, "cusco-first");
  view.state.setPendingStopRemoval(null);
  assert.equal(view.document.planItems[0].title, "Museum");
});

test("remaining explicit arrival dates survive the schedule rebuild", () => {
  const view = removalFixture();
  view.removeStop("arequipa-first");
  const next = { ...view.document, stops: view.document.stops.filter((stop) => stop.id !== "arequipa-first"), brief: { ...view.document.brief, nightAllocations: view.state.dayAllocations, scheduleLocks: view.state.scheduleLocks } } as EasyTTrip;
  const result = cascadeTripSchedule(next).trip;
  assert.equal(result.stops.find((stop) => stop.id === "cusco-return")?.arrivalDate, "2026-10-05");
  assert.equal(result.stops.find((stop) => stop.id === "cusco-return")?.departureDate, "2026-10-07");
});


test("a stay tied to the return occurrence blocks a removal that could discard it by city name", () => {
  const view = removalFixture({ updatedAt: "2026-10-01T00:00:00Z", bookings: [{ id: "stay-cusco-return", type: "stay", title: "Cusco hotel", date: "2026-10-05", confirmation: "ABC", url: null }] });
  view.requestRemoveStop("cusco-first");
  assert.equal(view.state.stops.length, 4);
  assert.equal(view.state.pendingStopRemoval, null);
  assert.equal(view.state.stopRemovalBlocked?.id, "cusco-first");
  assert.equal(view.document.brief.bookings?.[0].confirmation, "ABC");
});


test("removing the return visit clears only its own captured mention", () => {
  const view = removalFixture();
  view.state.capturedStructuredBrief.placeMentions = [
    { mentionId: "first-cusco", order: 0, canonicalName: "Cusco" },
    { mentionId: "return-cusco", order: 2, canonicalName: "Cusco" },
  ];
  view.state.handoffOccurrenceMentionIdsRef.current = { "cusco-first": "first-cusco", "cusco-return": "return-cusco" };
  view.removeStop("cusco-return");
  assert.deepEqual(view.state.removedPlaceMentionIds, ["return-cusco"]);
  assert.deepEqual(view.state.stops.map((stop: { id: string }) => stop.id), ["cusco-first", "arequipa-first", "arequipa-return"]);
});

test("removing the selected occurrence clears the stale reorder preview", () => {
  const view = removalFixture();
  view.state.selectedRouteStopId = "cusco-return";
  view.state.routePreviewStopIds = ["cusco-return", "cusco-first", "arequipa-first", "arequipa-return"];
  view.removeStop("cusco-return");
  assert.equal(view.state.routePreviewStopIds, null);
  assert.equal(view.state.selectedRouteStopId, "cusco-first");
});

test("a saved idea requires confirmation when there are no generated days", () => {
  const view = removalFixture();
  view.document.brief.itineraryIdeas = [{ id: "saved-idea", stopId: "cusco-first", title: "Museum", category: "activity", placeId: "museum", source: "destination-highlight", reasons: ["destination-significance"], coordinates: [-71.98, -13.5] }];
  view.requestRemoveStop("cusco-first");
  assert.equal(view.state.stops.length, 4);
  assert.equal(view.state.pendingStopRemoval?.id, "cusco-first");
});
