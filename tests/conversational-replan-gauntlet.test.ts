import assert from "node:assert/strict";
import test from "node:test";

import {
  applyResolvedTripCopilotAction,
  buildTripCopilotPreviewCandidates,
  parseTripCopilotAction,
  TripCopilotActionValidationError,
  type ResolvedTripCopilotAction,
} from "../lib/easyt/trip-copilot-actions.ts";
import { buildTripCopilotProjection } from "../lib/easyt/trip-copilot.ts";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";

const persisted = (trip: EasyTTrip) => JSON.parse(JSON.stringify(trip)) as EasyTTrip;
const stopIds = (trip: EasyTTrip) => trip.stops.map((stop) => stop.id);

function assertUnsupportedKeepsTrip(toolName: string, args: unknown) {
  const trip = tripCopilotFixture();
  const before = persisted(trip);
  assert.throws(() => parseTripCopilotAction(toolName, args, trip), TripCopilotActionValidationError);
  assert.deepEqual(trip, before);
}

test("01 · ‘Add Kanazawa’ fails closed until a canonical stop can be resolved", () => {
  assertUnsupportedKeepsTrip("add_stop", { stopName: "Kanazawa" });
});

test("02 · ‘Remove Osaka’ cannot silently delete a stop or nested state", () => {
  assertUnsupportedKeepsTrip("remove_stop", { stopName: "Kyoto" });
});

test("03 · ‘Give Kyoto one more night’ preserves IDs and produces a gap-free calendar", () => {
  const before = tripCopilotFixture();
  const candidate = buildTripCopilotPreviewCandidates(before, { action: "change_stop_nights", stopId: "kyoto", nights: 4 })[0]!;
  const after = candidate.resultingTrip;
  assert.deepEqual(stopIds(after), stopIds(before));
  assert.equal(after.stops.find((stop) => stop.id === "kyoto")?.nights, 4);
  assert.deepEqual(after.planItems.map((item) => item.dayNumber), Array.from({ length: 11 }, (_, index) => index + 1));
  assert.equal(new Set(after.planItems.map((item) => item.date)).size, 11);
  assert.equal(after.planItems.some((item) => item.id === `${after.id}-replan-kyoto-2026-10-17`), true);
  assert.deepEqual(after.brief.bookings, before.brief.bookings);
});

test("04 · ‘We’re not renting a car’ changes only future-planning preference state", () => {
  const before = tripCopilotFixture();
  const after = applyResolvedTripCopilotAction(before, { action: "change_transport_preference", preference: "avoid_drive" });
  assert.equal(after.brief.intent?.hardConstraints.avoidDriving, true);
  assert.deepEqual(after.stops, before.stops);
  assert.deepEqual(after.legs, before.legs);
  assert.deepEqual(after.planItems, before.planItems);
  assert.deepEqual(after.brief.bookings, before.brief.bookings);
});

test("05 · ‘Move Kyoto two days later’ fails safely rather than inventing a schedule edit", () => {
  assertUnsupportedKeepsTrip("set_stop_arrival_date", { stopName: "Kyoto", date: "2026-10-16" });
});

test("06 · ‘We booked Florence 8–11 May’ does not fabricate a commitment or overwrite bookings", () => {
  assertUnsupportedKeepsTrip("set_fixed_commitment", { stopName: "Florence", startDate: "2027-05-08", endDate: "2027-05-11" });
});

test("07 · ‘Can we squeeze in Venice?’ remains preview-safe when add-stop resolution is unavailable", () => {
  assertUnsupportedKeepsTrip("add_stop", { stopName: "Venice" });
});

test("08 · ‘Make the middle less hectic’ preserves the complete route and calendar", () => {
  const before = tripCopilotFixture();
  const after = applyResolvedTripCopilotAction(before, { action: "set_trip_preference", preference: "pace", value: "relaxed" });
  assert.deepEqual(after.stops, before.stops);
  assert.deepEqual(after.legs, before.legs);
  assert.deepEqual(after.planItems, before.planItems);
  assert.deepEqual(after.brief.bookings, before.brief.bookings);
  assert.equal(after.brief.intent?.preferences.pace, "relaxed");
});

test("09 · ‘What if we did it backwards?’ reorders with stable stop identity", () => {
  const before = tripCopilotFixture();
  const reversed = [...before.planItems].reverse();
  const result = replanTripAfterDayOrder(before, reversed);
  assert.equal(result.state, "recalculated");
  if (result.state !== "recalculated") return;
  assert.deepEqual(result.stopIds, ["hiroshima", "kyoto", "tokyo"]);
  assert.deepEqual(new Set(stopIds(result.trip)), new Set(stopIds(before)));
  assert.deepEqual(result.trip.brief.bookings, before.brief.bookings);
});

test("10 · ‘Actually skip it’ with no unique referent fails closed", () => {
  const duplicate = tripCopilotFixture();
  duplicate.stops[2] = { ...duplicate.stops[2]!, id: "other-kyoto", name: "Kyoto" };
  assert.throws(
    () => parseTripCopilotAction("change_stop_nights", { stopName: "Kyoto", nights: 3 }, duplicate),
    /could not identify one saved stop/,
  );
});

test("11 · ‘Make that 3 nights’ can use one explicitly selected current stop", () => {
  const trip = tripCopilotFixture();
  const projection = buildTripCopilotProjection(trip, { stopId: "kyoto" });
  assert.deepEqual(projection.trip.route.stops.filter((stop) => stop.selected).map((stop) => stop.name), ["Kyoto"]);
  assert.deepEqual(parseTripCopilotAction("change_stop_nights", { stopName: "Kyoto", nights: 3 }, trip), {
    action: "change_stop_nights", stopId: "kyoto", nights: 3,
  });
});

test("12 · three consecutive edits survive a save/reload boundary without ID drift", () => {
  let trip = tripCopilotFixture();
  const originalIds = stopIds(trip);
  const actions: ResolvedTripCopilotAction[] = [
    { action: "change_transport_preference", preference: "avoid_drive" },
    { action: "set_trip_preference", preference: "pace", value: "balanced" },
    { action: "change_stop_nights", stopId: "kyoto", nights: 2, resolution: { type: "increase_stop", stopId: "hiroshima", nights: 3 } },
  ];
  for (const action of actions) trip = persisted(applyResolvedTripCopilotAction(persisted(trip), action));
  assert.deepEqual(stopIds(trip), originalIds);
  assert.equal(trip.stops.find((stop) => stop.id === "kyoto")?.nights, 2);
  assert.equal(trip.brief.intent?.hardConstraints.avoidDriving, true);
  assert.equal(trip.brief.intent?.preferences.pace, "balanced");
  assert.deepEqual(trip.brief.bookings, tripCopilotFixture().brief.bookings);
});

test("13 · a failed preview/save attempt leaves the previous canonical document intact", () => {
  const canonical = tripCopilotFixture();
  const before = persisted(canonical);
  const candidate = buildTripCopilotPreviewCandidates(canonical, { action: "change_stop_nights", stopId: "kyoto", nights: 4 })[0]!;
  assert.notDeepEqual(candidate.resultingTrip, canonical);
  assert.deepEqual(canonical, before);
});

test("14 · past and archived trips reject mutation previews", () => {
  const past = tripCopilotFixture();
  assert.throws(
    () => buildTripCopilotPreviewCandidates(past, { action: "set_trip_preference", preference: "pace", value: "packed" }, new Date("2027-01-01T00:00:00Z")),
    /Past or archived trips/,
  );
  const archived = { ...tripCopilotFixture(), status: "archived" as const };
  assert.throws(
    () => buildTripCopilotPreviewCandidates(archived, { action: "change_transport_preference", preference: "prefer_train" }, new Date("2026-08-28T00:00:00Z")),
    /Past or archived trips/,
  );
});
