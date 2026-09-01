import assert from "node:assert/strict";
import test from "node:test";

import { addMappedPlaceToTrip, removeMappedPlaceFromTrip } from "../lib/easyt/map-place-itinerary.ts";
import { preserveBuilderCanonicalState } from "../lib/easyt/trip-builder-preservation.ts";
import {
  applyResolvedTripCopilotAction,
  buildTripCopilotPreviewCandidates,
  parseTripCopilotAction,
  TripCopilotActionValidationError,
} from "../lib/easyt/trip-copilot-actions.ts";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import type { EasyTTrip, PlanItem } from "../lib/easyt/trip.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";
import { assertOnlyTripPathsChanged } from "./helpers/trip-state-diff.ts";

const DAY = 86_400_000;
const persisted = (trip: EasyTTrip) => JSON.parse(JSON.stringify(trip)) as EasyTTrip;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

function reorderThroughPlanner(trip: EasyTTrip, stopOrder: string[]) {
  const ordered = stopOrder.flatMap((stopId) => trip.planItems.filter((item) => item.stopId === stopId).sort((left, right) => left.dayNumber - right.dayNumber));
  const dayMap = new Map(ordered.map((item, index) => [item.dayNumber, index + 1]));
  const remap = (record: Record<number, string[]> | undefined) => record && Object.fromEntries(
    Object.entries(record).map(([day, values]) => [dayMap.get(Number(day)) ?? Number(day), values]),
  );
  const next: EasyTTrip = {
    ...trip,
    brief: {
      ...trip.brief,
      ...(trip.brief.dayNotes ? { dayNotes: remap(trip.brief.dayNotes) } : {}),
      ...(trip.brief.customActivities ? { customActivities: remap(trip.brief.customActivities) } : {}),
      ...(trip.brief.mapPins ? { mapPins: trip.brief.mapPins.map((pin) => ({ ...pin, dayNumber: dayMap.get(pin.dayNumber) ?? pin.dayNumber })) } : {}),
    },
    planItems: ordered.map((item, index): PlanItem => ({ ...item, dayNumber: index + 1, date: addDays(trip.startDate, index) })),
  };
  const result = replanTripAfterDayOrder(next, next.planItems);
  assert.equal(result.state, "recalculated");
  if (result.state !== "recalculated") throw new Error("Expected a contiguous route reorder.");
  return result.trip;
}

function withAuthoredState() {
  const trip = tripCopilotFixture();
  trip.brief.customActivities = { 6: ["Private Kyoto supper"] };
  trip.brief.dayNotes = { 6: ["Call the guide"] };
  trip.brief.mapPins = [{ id: "guide-pin", title: "Guide meeting", category: "activity", dayNumber: 6, latitude: 35.01, longitude: 135.76 }];
  trip.brief.scheduleLocks = { stopIds: [], arrivalDates: {} };
  return trip;
}

test("preference-only mutations expose an exact, bounded canonical diff", () => {
  const before = withAuthoredState();
  const after = applyResolvedTripCopilotAction(before, { action: "set_trip_preference", preference: "pace", value: "packed" });
  const changes = assertOnlyTripPathsChanged(before, after, [
    "/brief/pace",
    "/brief/intent/preferences/pace",
    "/recommendations",
  ]);
  assert.ok(changes.includes("/brief/pace"));
  assert.deepEqual(after.stops, before.stops);
  assert.deepEqual(after.planItems, before.planItems);
  assert.deepEqual(after.brief.bookings, before.brief.bookings);
  assert.deepEqual(after.brief.customActivities, before.brief.customActivities);
});

test("unsupported add/remove/date/commitment mutations fail atomically for every dependency class", () => {
  const unsupported = [
    ["add_stop", { stopName: "Paris", entityType: "city" }],
    ["add_stop", { stopName: "Flåm", entityType: "town" }],
    ["add_visit", { visitName: "Machu Picchu", baseStopName: "Cusco" }],
    ["remove_stop", { stopName: "Tokyo" }],
    ["remove_stop", { stopName: "Kyoto" }],
    ["remove_stop", { stopName: "Hiroshima" }],
    ["set_trip_dates", { startDate: "2026-11-01", endDate: "2026-11-10" }],
    ["set_fixed_commitment", { label: "Hotel", date: "2026-10-12" }],
  ] as const;
  for (const [tool, args] of unsupported) {
    const trip = withAuthoredState();
    const before = persisted(trip);
    assert.throws(() => parseTripCopilotAction(tool, args, trip), TripCopilotActionValidationError);
    assert.deepEqual(trip, before, `${tool} must not partially mutate canonical state`);
  }
});

test("adjacent, reverse, edge-to-middle and substantial route reorders retain stable entities", () => {
  const orders = [
    ["kyoto", "tokyo", "hiroshima"],
    ["hiroshima", "kyoto", "tokyo"],
    ["kyoto", "hiroshima", "tokyo"],
    ["hiroshima", "tokyo", "kyoto"],
    ["tokyo", "hiroshima", "kyoto"],
  ];
  for (const order of orders) {
    const before = withAuthoredState();
    const after = reorderThroughPlanner(before, order);
    assert.deepEqual(after.stops.map((stop) => stop.id), order);
    assert.deepEqual(new Set(after.stops.map((stop) => stop.id)), new Set(before.stops.map((stop) => stop.id)));
    for (const stop of before.stops) {
      const retained = after.stops.find((candidate) => candidate.id === stop.id)!;
      assert.equal(retained.canonicalPlaceId, stop.canonicalPlaceId);
    }
    assert.deepEqual(after.brief.bookings, before.brief.bookings);
    assert.deepEqual(after.brief.customActivities, { [after.planItems.find((item) => item.id === "japan-day-6")!.dayNumber]: ["Private Kyoto supper"] });
    assert.equal(after.brief.mapPins?.[0]?.dayNumber, after.planItems.find((item) => item.id === "japan-day-6")?.dayNumber);
  }
});

test("Map itinerary additions and removals are idempotent and destination-scoped", () => {
  const before = withAuthoredState();
  const place = { id: "osm-restaurant-1", provider: "openstreetmap" as const, name: "Soba House", coordinates: [139.7, 35.6] as [number, number] };
  const once = addMappedPlaceToTrip(before, place, "restaurant", 2, "tokyo");
  const twice = addMappedPlaceToTrip(once, place, "restaurant", 2, "tokyo");
  assert.deepEqual(twice, once);
  assert.equal(twice.brief.mapPins?.filter((pin) => pin.id.includes("osm-restaurant-1")).length, 1);
  assert.deepEqual(twice.brief.bookings, before.brief.bookings);
  const removed = removeMappedPlaceFromTrip(twice, place, "restaurant", 2, "tokyo");
  const removedAgain = removeMappedPlaceFromTrip(removed, place, "restaurant", 2, "tokyo");
  assert.deepEqual(removedAgain, removed);
  assert.deepEqual(removed.brief.customActivities?.[6], before.brief.customActivities?.[6]);
});

test("locked and stay-booked night mutations fail before producing a preview", () => {
  const locked = withAuthoredState();
  locked.brief.scheduleLocks = { stopIds: ["kyoto"], arrivalDates: {} };
  const lockedBefore = persisted(locked);
  assert.throws(() => buildTripCopilotPreviewCandidates(locked, { action: "change_stop_nights", stopId: "kyoto", nights: 4 }), /schedule lock/);
  assert.deepEqual(locked, lockedBefore);

  const booked = withAuthoredState();
  const bookedBefore = persisted(booked);
  assert.throws(() => buildTripCopilotPreviewCandidates(booked, { action: "change_stop_nights", stopId: "tokyo", nights: 5 }), /saved accommodation/);
  assert.deepEqual(booked, bookedBefore);
});

test("Sequence A: itinerary edit → booking → reorder → nights → reload → pace → reload preserves unrelated state", () => {
  let trip = withAuthoredState();
  const stopIds = new Set(trip.stops.map((stop) => stop.id));
  trip = addMappedPlaceToTrip(trip, { id: "map-cafe", name: "Kyoto Cafe", coordinates: [135.76, 35.01] }, "restaurant", 6, "kyoto");
  trip.brief.bookings = [...(trip.brief.bookings ?? []), { id: "train-booking", type: "transport", title: "Tokyo to Kyoto", date: "2026-10-14", confirmation: "TRAIN-1", url: null }];
  trip = persisted(reorderThroughPlanner(trip, ["kyoto", "tokyo", "hiroshima"]));
  trip = applyResolvedTripCopilotAction(trip, { action: "change_stop_nights", stopId: "hiroshima", nights: 3, resolution: { type: "extend_trip", days: 1 } });
  trip = persisted(applyResolvedTripCopilotAction(persisted(trip), { action: "set_trip_preference", preference: "pace", value: "balanced" }));

  assert.deepEqual(new Set(trip.stops.map((stop) => stop.id)), stopIds);
  assert.equal(trip.brief.customActivities && Object.values(trip.brief.customActivities).flat().includes("Kyoto Cafe"), true);
  assert.equal(trip.brief.mapPins?.some((pin) => pin.title === "Kyoto Cafe"), true);
  assert.equal(trip.brief.bookings?.some((booking) => booking.id === "train-booking" && booking.confirmation === "TRAIN-1"), true);
  assert.equal(trip.brief.intent?.preferences.pace, "balanced");
});

test("three consecutive supported edits plus reload preserve stop IDs, bookings, locks and authored content", () => {
  let trip = withAuthoredState();
  const protectedState = {
    ids: trip.stops.map((stop) => stop.id),
    bookings: persisted(trip).brief.bookings,
    customActivities: persisted(trip).brief.customActivities,
    dayNotes: persisted(trip).brief.dayNotes,
  };
  trip = persisted(applyResolvedTripCopilotAction(trip, { action: "change_transport_preference", preference: "avoid_drive" }));
  trip = persisted(applyResolvedTripCopilotAction(trip, { action: "set_trip_preference", preference: "budget", value: "value" }));
  trip = persisted(applyResolvedTripCopilotAction(trip, { action: "set_trip_preference", preference: "accommodation", value: "fewer_hotel_changes" }));
  assert.deepEqual(trip.stops.map((stop) => stop.id), protectedState.ids);
  assert.deepEqual(trip.brief.bookings, protectedState.bookings);
  assert.deepEqual(trip.brief.customActivities, protectedState.customActivities);
  assert.deepEqual(trip.brief.dayNotes, protectedState.dayNotes);
  assert.equal(trip.brief.intent?.hardConstraints.avoidDriving, true);
  assert.equal(trip.brief.budgetBand, "value");
  assert.equal(trip.brief.hotelChanges, "few");
});

test("saved-trip Builder date rebuild preserves bookings, Prep, history and authored day state", () => {
  const source = withAuthoredState();
  source.brief.checklist = [{ id: "visa", label: "Check visa", complete: true }];
  const rebuilt: EasyTTrip = {
    ...persisted(source),
    ownerId: source.ownerId,
    startDate: "2026-11-01",
    endDate: "2026-11-10",
    brief: {
      ...source.brief,
      dayNotes: undefined,
      customActivities: undefined,
      mapPins: undefined,
      bookings: undefined,
      checklist: undefined,
    },
    stops: source.stops.map((stop) => ({ ...stop, arrivalDate: null, departureDate: null })),
    planItems: source.planItems.map((item, index) => ({ ...item, date: addDays("2026-11-01", index) })),
    changeHistory: undefined,
  };

  const after = preserveBuilderCanonicalState(source, rebuilt);
  assert.equal(after.startDate, "2026-11-01");
  assert.equal(after.endDate, "2026-11-10");
  assert.deepEqual(after.brief.bookings, source.brief.bookings);
  assert.deepEqual(after.brief.checklist, source.brief.checklist);
  assert.deepEqual(after.changeHistory, source.changeHistory);
  const authoredDay = after.planItems.find((item) => item.stopId === "kyoto" && item.notes.includes("Private Kyoto supper"));
  assert.ok(authoredDay);
  assert.deepEqual(after.brief.customActivities?.[authoredDay.dayNumber], ["Private Kyoto supper"]);
  assert.deepEqual(after.brief.dayNotes?.[authoredDay.dayNumber], ["Call the guide"]);
  assert.equal(after.brief.mapPins?.[0]?.dayNumber, authoredDay.dayNumber);
});

test("confirmed Builder stop removal deletes only disclosed stop dependencies", () => {
  const source = withAuthoredState();
  source.brief.bookings = [
    ...(source.brief.bookings ?? []),
    { id: "stay-kyoto", type: "stay", title: "Kyoto stay", date: "2026-10-14", confirmation: "KYOTO-1", url: null },
    { id: "rail-pass", type: "transport", title: "Rail pass", date: "2026-10-10", confirmation: "RAIL-1", url: null },
  ];
  const rebuilt: EasyTTrip = {
    ...persisted(source),
    brief: { ...source.brief, dayNotes: undefined, customActivities: undefined, mapPins: undefined, bookings: undefined, checklist: undefined },
    stops: source.stops.filter((stop) => stop.id !== "kyoto"),
    planItems: source.planItems.filter((item) => item.stopId !== "kyoto"),
  };

  const after = preserveBuilderCanonicalState(source, rebuilt);
  assert.equal(after.brief.bookings?.some((booking) => booking.id === "stay-kyoto"), false);
  assert.equal(after.brief.bookings?.some((booking) => booking.id === "stay-tokyo"), true);
  assert.equal(after.brief.bookings?.some((booking) => booking.id === "rail-pass"), true);
  assert.equal(after.brief.customActivities && Object.values(after.brief.customActivities).flat().includes("Private Kyoto supper"), false);
  assert.equal(after.brief.mapPins?.some((pin) => pin.id === "guide-pin"), false);
  assert.deepEqual(after.brief.checklist, source.brief.checklist);
});
