import assert from "node:assert/strict";
import test from "node:test";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import { reviewTrip } from "../lib/easyt/review.ts";
import { loadTripRecoveryFromStorage, saveTripRecoveryToStorage, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief, structuredTripBriefFromSavedSelections } from "../lib/easyt/structured-trip-brief.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

class MemoryStorage implements EasyTBrowserStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const trip = (): EasyTTrip => ({
  schemaVersion: 1, id: "trip", ownerId: null, title: "Test", status: "draft", startDate: "2026-09-01", endDate: "2026-09-04", travellers: 2, currency: "GBP",
  brief: { origin: "Start", originCoordinates: [0, 0], mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
  stops: [
    { id: "a", order: 0, name: "A", country: "Testland", latitude: 0, longitude: 1, arrivalDate: null, departureDate: null, nights: 1 },
    { id: "b", order: 1, name: "B", country: "Testland", latitude: 0, longitude: 10, arrivalDate: null, departureDate: null, nights: 1 },
  ],
  legs: [],
  planItems: [
    { id: "1", stopId: "a", dayNumber: 1, date: "2026-09-01", type: "arrival", title: "A", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "2", stopId: "a", dayNumber: 2, date: "2026-09-02", type: "activity", title: "A", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "3", stopId: "b", dayNumber: 3, date: "2026-09-03", type: "arrival", title: "B", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "4", stopId: "b", dayNumber: 4, date: "2026-09-04", type: "activity", title: "B", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
  ],
  recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

test("recalculates canonical stops and legs for a contiguous day-order change", () => {
  const source = trip();
  const result = replanTripAfterDayOrder(source, [source.planItems[2], source.planItems[3], source.planItems[0], source.planItems[1]]);

  assert.equal(result.state, "recalculated");
  if (result.state === "recalculated") {
    assert.deepEqual(result.trip.stops.map((stop) => stop.id), ["b", "a"]);
    assert.equal(result.trip.legs.length, 2);
    assert.equal(result.trip.legs[0]?.fromEndpoint?.kind, "origin");
    assert.equal(result.trip.legs[0]?.toStopId, "b");
    assert.equal(result.trip.legs[1]?.fromStopId, "b");
    assert.equal(result.trip.legs[1]?.toStopId, "a");
  }
});

test("benign route replanning preserves stable stop-bound manual night intent", () => {
  const source = trip();
  source.brief.nightAllocations = { a: 1, b: 1 };
  source.brief.manualNightStopIds = ["a"];
  const result = replanTripAfterDayOrder(source, [source.planItems[2], source.planItems[3], source.planItems[0], source.planItems[1]]);

  assert.equal(result.state, "recalculated");
  if (result.state === "recalculated") {
    assert.deepEqual(result.trip.brief.manualNightStopIds, ["a"]);
    assert.equal(result.trip.stops.find((stop) => stop.id === "a")?.nights, 1);
    assert.equal(result.trip.stops.find((stop) => stop.id === "b")?.nights, 1);
  }
});

test("does not silently pretend a return to an earlier base is a clean route", () => {
  const source = trip();
  const result = replanTripAfterDayOrder(source, [source.planItems[0], source.planItems[2], source.planItems[1], source.planItems[3]]);

  assert.equal(result.state, "needs-route-edit");
  if (result.state === "needs-route-edit") assert.equal(result.returnedStopId, "a");
});

test("refuses day reorders that violate fixed start or end gateways without mutating the trip", () => {
  const source = trip();
  source.stops = [
    { ...source.stops[0], order: 0 },
    { id: "c", order: 1, name: "C", country: "Testland", latitude: 0, longitude: 5, arrivalDate: null, departureDate: null, nights: 1 },
    { ...source.stops[1], order: 2 },
  ];
  source.planItems = [
    { ...source.planItems[0], dayNumber: 1, date: "2026-09-01" },
    { ...source.planItems[2], id: "c1", stopId: "c", dayNumber: 2, date: "2026-09-02", title: "C" },
    { ...source.planItems[3], id: "b1", stopId: "b", dayNumber: 3, date: "2026-09-03", title: "B" },
  ];
  source.brief.structuredBrief = structuredTripBriefFromSavedSelections({
    destinations: [
      { id: "a", name: "A", role: "arrival-gateway", priority: "required" },
      { id: "c", name: "C", role: "preferred", priority: "normal" },
      { id: "b", name: "B", role: "departure-gateway", priority: "required" },
    ],
  });
  const planItemByStop = new Map(source.planItems.map((item) => [item.stopId, item]));

  for (const { order, protectedStopId } of [
    { order: ["c", "a", "b"], protectedStopId: "a" },
    { order: ["a", "b", "c"], protectedStopId: "b" },
  ]) {
    const before = structuredClone(source);
    const result = replanTripAfterDayOrder(source, order.map((stopId) => planItemByStop.get(stopId)!));

    assert.equal(result.state, "needs-route-edit");
    if (result.state === "needs-route-edit") {
      assert.equal(result.returnedStopId, protectedStopId);
      assert.strictEqual(result.trip, source);
    }
    assert.deepEqual(source, before);
  }
});

test("route replan preserves place mentions, issues, selections, removals and geographic IDs", () => {
  const captured = extractStructuredTripBrief("Patagonia, Tierra del Fuego and Rapa Nui.");
  const patagonia = captured.placeMentions?.find((mention) => mention.canonicalPlaceId === "patagonia");
  const rapaNui = captured.placeMentions?.find((mention) => mention.canonicalPlaceId === "rapa-nui");
  assert.ok(patagonia);
  assert.ok(rapaNui);
  const baseOption = captured.placeIssues?.find((issue) => issue.mentionId === patagonia.mentionId)?.options[0];
  assert.ok(baseOption);
  assert.ok(baseOption.provenance[0]);
  const structuredBrief = mergeStructuredTripBrief(captured, {
    destinations: [{
      id: "a",
      name: baseOption.label,
      canonicalPlaceId: baseOption.canonicalPlaceId,
      placeMentionId: patagonia.mentionId,
      placeType: baseOption.placeType,
      resolutionStatus: "resolved",
      routability: "direct_destination",
    }],
    placeSelections: [{
      mentionId: patagonia.mentionId,
      kind: "base",
      selectedCanonicalPlaceId: baseOption.canonicalPlaceId,
      selectedName: baseOption.label,
      routeStopId: "a",
      provenance: baseOption.provenance[0],
    }],
    removedPlaceMentionIds: [rapaNui.mentionId],
  });
  const source = trip();
  source.brief.structuredBrief = structuredBrief;

  const result = replanTripAfterDayOrder(source, [source.planItems[2], source.planItems[3], source.planItems[0], source.planItems[1]]);
  assert.equal(result.state, "recalculated");
  if (result.state !== "recalculated") return;

  assert.deepEqual(result.trip.brief.structuredBrief, structuredBrief);
  assert.equal(result.trip.brief.structuredBrief?.placeSelections?.[0]?.routeStopId, "a");
  assert.equal(result.trip.brief.structuredBrief?.destinations.find((destination) => destination.id === "a")?.canonicalPlaceId, baseOption.canonicalPlaceId);
  assert.notEqual(result.trip.brief.structuredBrief?.destinations.find((destination) => destination.id === "a")?.id, baseOption.canonicalPlaceId);
  assert.equal(result.trip.brief.structuredBrief?.placeIssues?.some((issue) => issue.code === "region_requires_base"), true);
});

test("nearby landmark base survives save/reload and replan without turning the anchor into a route leg", () => {
  const captured = extractStructuredTripBrief("Visit Tikal.");
  const tikal = captured.placeMentions?.find((mention) => mention.canonicalPlaceId === "tikal");
  assert.ok(tikal);
  const structuredBrief = mergeStructuredTripBrief(captured, {
    destinations: [
      { id: "a", name: "Flores", canonicalPlaceId: "open-world:fixture:node:1", placeMentionId: tikal.mentionId, placeType: "city", resolutionStatus: "resolved", routability: "direct_destination" },
      { id: "b", name: "Antigua Guatemala", canonicalPlaceId: "antigua-guatemala", placeType: "city", resolutionStatus: "resolved", routability: "direct_destination" },
    ],
    placeSelections: [{
      mentionId: tikal.mentionId,
      kind: "visit",
      selectedCanonicalPlaceId: "open-world:fixture:node:1",
      selectedName: "Flores",
      selectedPlaceType: "city",
      selectedParentCountries: ["Guatemala"],
      routeStopId: "a",
      relationshipType: "visit-from-base",
      provenance: { id: "fixture:node:1", label: "Nearby fixture provider", kind: "provider", supports: "Traveller-selected canonical nearby base." },
    }],
    completedPlanningAreaMentionIds: [tikal.mentionId],
  });
  const source = trip();
  source.stops = [
    { ...source.stops[0]!, name: "Flores", country: "Guatemala", canonicalPlaceId: "open-world:fixture:node:1" },
    { ...source.stops[1]!, name: "Antigua Guatemala", country: "Guatemala", canonicalPlaceId: "antigua-guatemala" },
  ];
  source.brief.structuredBrief = JSON.parse(JSON.stringify(structuredBrief));

  const result = replanTripAfterDayOrder(source, [source.planItems[2]!, source.planItems[3]!, source.planItems[0]!, source.planItems[1]!]);
  assert.equal(result.state, "recalculated");
  if (result.state !== "recalculated") return;
  const reloaded = JSON.parse(JSON.stringify(result.trip)) as EasyTTrip;
  const visit = reloaded.brief.structuredBrief?.placeSelections?.find((selection) => selection.mentionId === tikal.mentionId);
  assert.equal(visit?.selectedName, "Flores");
  assert.equal(visit?.routeStopId, "a");
  assert.equal(reloaded.brief.structuredBrief?.placeMentions?.some((mention) => mention.canonicalPlaceId === "tikal"), true);
  assert.equal(reloaded.stops.some((stop) => stop.name === "Tikal"), false);
  assert.equal(reloaded.legs.some((leg) => leg.fromEndpoint?.name === "Tikal" || leg.toEndpoint?.name === "Tikal"), false);
  const storage = new MemoryStorage();
  assert.equal(saveTripRecoveryToStorage(storage, reloaded, { writeId: "nearby-base-recovery" }).stored, true);
  const recovered = loadTripRecoveryFromStorage(storage, reloaded.id, reloaded.ownerId)?.trip;
  assert.equal(recovered?.brief.structuredBrief?.placeSelections?.find((selection) => selection.mentionId === tikal.mentionId)?.routeStopId, "a");
  assert.equal(recovered?.brief.structuredBrief?.placeMentions?.some((mention) => mention.canonicalPlaceId === "tikal"), true);
});

test("flags a split base in Plan Review after an intentional day-level return", () => {
  const source = trip();
  const planItems = [source.planItems[0], source.planItems[2], source.planItems[1], source.planItems[3]]
    .map((item, index) => ({ ...item, dayNumber: index + 1 }));
  const checks = reviewTrip({ ...source, planItems });

  assert.equal(checks.some((check) => check.rule === "split-base-sequence"), true);
});
