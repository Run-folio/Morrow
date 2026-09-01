import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyResolvedTripCopilotAction,
  buildTripCopilotPreviewCandidates,
  parseTripCopilotAction,
  TripCopilotActionValidationError,
  type ResolvedTripCopilotAction,
} from "../lib/easyt/trip-copilot-actions.ts";
import {
  applyTripCopilotPreview,
  TripCopilotApplyError,
  type TripCopilotApplyDependencies,
  type TripCopilotPreviewRecord,
} from "../lib/easyt/trip-copilot-apply.ts";
import { tripCopilotMutationHash, tripCopilotStateHash } from "../lib/easyt/trip-copilot-state.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";

test("Luna tool arguments normalize to exact allowlisted canonical actions", () => {
  const trip = tripCopilotFixture();
  assert.deepEqual(parseTripCopilotAction("change_stop_nights", { stopName: "Kyoto", nights: 4 }, trip), {
    action: "change_stop_nights", stopId: "kyoto", nights: 4,
  });
  assert.deepEqual(parseTripCopilotAction("set_trip_preference", { preference: "pace", value: "relaxed" }, trip), {
    action: "set_trip_preference", preference: "pace", value: "relaxed",
  });
  assert.deepEqual(parseTripCopilotAction("change_transport_preference", { preference: "prefer_train" }, trip), {
    action: "change_transport_preference", preference: "prefer_train",
  });
  assert.throws(() => parseTripCopilotAction("change_stop_nights", { stopName: "Kyoto", nights: 500 }, trip), TripCopilotActionValidationError);
  assert.throws(() => parseTripCopilotAction("book_transport", { leg: "Tokyo" }, trip), TripCopilotActionValidationError);
});

test("a night increase is preview-only and produces deterministic downstream alternatives", () => {
  const trip = tripCopilotFixture();
  const before = structuredClone(trip);
  const candidates = buildTripCopilotPreviewCandidates(trip, { action: "change_stop_nights", stopId: "kyoto", nights: 4 });
  assert.deepEqual(trip, before);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((item) => item.resolvedAction.action === "change_stop_nights" ? item.resolvedAction.resolution.type : null), ["extend_trip", "reduce_stop"]);
  assert.equal(candidates.every((item) => item.resultingTrip.stops.find((stop) => stop.id === "kyoto")?.nights === 4), true);
  assert.equal(candidates[0].resultingTrip.endDate, "2026-10-20");
  assert.equal(candidates[1].resultingTrip.stops.find((stop) => stop.id === "hiroshima")?.nights, 1);
});

test("a night reduction cannot leave an unallocated hole in the saved calendar", () => {
  const trip = tripCopilotFixture();
  const candidates = buildTripCopilotPreviewCandidates(trip, { action: "change_stop_nights", stopId: "kyoto", nights: 2 });
  assert.deepEqual(
    candidates.map((item) => item.resolvedAction.action === "change_stop_nights" ? item.resolvedAction.resolution.type : null),
    ["shorten_trip", "increase_stop"],
  );
  for (const item of candidates) {
    const days = item.resultingTrip.planItems.map((planItem) => planItem.dayNumber);
    assert.deepEqual(days, Array.from({ length: days.length }, (_, index) => index + 1));
    assert.equal(new Set(item.resultingTrip.planItems.map((planItem) => planItem.date)).size, days.length);
  }
});

test("a night reduction keeps traveller-authored day state attached to the surviving stop", () => {
  const trip = tripCopilotFixture();
  trip.brief.customActivities = { 7: ["Private tea booking"] };
  trip.brief.dayNotes = { 7: ["Ask for the quiet room"] };
  trip.brief.mapPins = [{ id: "tea-pin", title: "Tea room", category: "activity", dayNumber: 7, latitude: 35, longitude: 135 }];
  trip.planItems.find((item) => item.dayNumber === 7)?.notes.push("Private tea booking");

  const after = applyResolvedTripCopilotAction(trip, {
    action: "change_stop_nights",
    stopId: "kyoto",
    nights: 2,
    resolution: { type: "shorten_trip", days: 1 },
  });

  const retainedDay = after.planItems.find((item) => item.stopId === "kyoto" && item.notes.includes("Private tea booking"));
  assert.ok(retainedDay);
  assert.deepEqual(after.brief.customActivities?.[retainedDay.dayNumber], ["Private tea booking"]);
  assert.deepEqual(after.brief.dayNotes?.[retainedDay.dayNumber], ["Ask for the quiet room"]);
  assert.equal(after.brief.mapPins?.find((pin) => pin.id === "tea-pin")?.dayNumber, retainedDay.dayNumber);
  assert.equal(after.planItems.some((item) => item.stopId !== "kyoto" && item.notes.includes("Private tea booking")), false);
});

test("night changes fail closed for the requested or donor stop when protected by a lock or saved stay", () => {
  const locked = tripCopilotFixture();
  locked.brief.scheduleLocks = { stopIds: ["kyoto"], arrivalDates: {} };
  const lockedBefore = structuredClone(locked);
  assert.throws(
    () => buildTripCopilotPreviewCandidates(locked, { action: "change_stop_nights", stopId: "kyoto", nights: 4 }),
    /protected by a schedule lock/,
  );
  assert.deepEqual(locked, lockedBefore);

  const booked = tripCopilotFixture();
  const bookedBefore = structuredClone(booked);
  assert.throws(
    () => buildTripCopilotPreviewCandidates(booked, { action: "change_stop_nights", stopId: "tokyo", nights: 5 }),
    /saved accommodation/,
  );
  assert.deepEqual(booked, bookedBefore);

  const donorLocked = tripCopilotFixture();
  donorLocked.brief.scheduleLocks = { stopIds: ["hiroshima"], arrivalDates: {} };
  assert.throws(
    () => applyResolvedTripCopilotAction(donorLocked, {
      action: "change_stop_nights",
      stopId: "kyoto",
      nights: 4,
      resolution: { type: "reduce_stop", stopId: "hiroshima", nights: 1 },
    }),
    /protected by a schedule lock/,
  );
});

test("confirmed night and preference actions reuse deterministic cascade without rewriting transport", () => {
  const trip = tripCopilotFixture();
  const nightCandidate = buildTripCopilotPreviewCandidates(trip, { action: "change_stop_nights", stopId: "kyoto", nights: 4 })[0];
  const changed = applyResolvedTripCopilotAction(trip, nightCandidate.resolvedAction);
  assert.equal(changed.stops.find((stop) => stop.id === "kyoto")?.nights, 4);
  assert.deepEqual(changed.brief.manualNightStopIds, ["kyoto"]);
  assert.equal(changed.endDate, "2026-10-20");
  assert.equal(changed.stops.find((stop) => stop.id === "hiroshima")?.arrivalDate, "2026-10-18");
  assert.deepEqual(changed.legs, trip.legs);

  const preference = applyResolvedTripCopilotAction(trip, { action: "change_transport_preference", preference: "prefer_train" });
  assert.deepEqual(preference.brief.intent?.preferences.transportModes, ["train"]);
  assert.deepEqual(preference.legs, trip.legs);
  assert.deepEqual(preference.stops, trip.stops);
});

type MemoryState = {
  trip: EasyTTrip;
  preview: TripCopilotPreviewRecord;
  saveCount: number;
};

function memoryDependencies(state: MemoryState): TripCopilotApplyDependencies {
  return {
    async getPreview(ownerId, tripId, previewId) {
      return state.preview.ownerId === ownerId && state.preview.tripId === tripId && state.preview.previewId === previewId ? structuredClone(state.preview) : null;
    },
    async claimPreview(ownerId, tripId, previewId) {
      if (state.preview.ownerId !== ownerId || state.preview.tripId !== tripId || state.preview.previewId !== previewId) return "missing";
      if (state.preview.status !== "pending") return state.preview.status;
      state.preview.status = "applying";
      return "claimed";
    },
    async getTrip(ownerId, tripId) {
      return state.trip.ownerId === ownerId && state.trip.id === tripId ? structuredClone(state.trip) : null;
    },
    async saveTrip(_ownerId, trip) {
      state.saveCount += 1;
      state.trip = { ...structuredClone(trip), updatedAt: "2026-08-27T12:00:00.000Z" };
      return structuredClone(state.trip);
    },
    async completePreview(_ownerId, _tripId, _previewId, trip) {
      state.preview.status = "applied";
      state.preview.resultTrip = structuredClone(trip);
    },
    async markPreviewStale() { state.preview.status = "stale"; },
    async releasePreview() { state.preview.status = "pending"; },
  };
}

function previewState(action: ResolvedTripCopilotAction): MemoryState {
  const trip = tripCopilotFixture();
  const result = applyResolvedTripCopilotAction(trip, action);
  return {
    trip,
    saveCount: 0,
    preview: {
      previewId: "11111111-1111-4111-8111-111111111111",
      ownerId: trip.ownerId!,
      tripId: trip.id,
      actionType: action.action,
      action,
      baseUpdatedAt: trip.updatedAt,
      baseHash: tripCopilotStateHash(trip),
      expectedHash: tripCopilotMutationHash(result),
      status: "pending",
      expiresAt: "2026-08-27T13:00:00.000Z",
      resultTrip: null,
    },
  };
}

test("confirmation applies once and a repeated submission returns the same canonical result", async () => {
  const action: ResolvedTripCopilotAction = { action: "change_stop_nights", stopId: "kyoto", nights: 4, resolution: { type: "extend_trip", days: 1 } };
  const state = previewState(action);
  const deps = memoryDependencies(state);
  const input = { ownerId: state.preview.ownerId, tripId: state.preview.tripId, previewId: state.preview.previewId, expectedAction: action.action, now: new Date("2026-08-27T12:30:00.000Z") } as const;
  const first = await applyTripCopilotPreview(input, deps);
  const second = await applyTripCopilotPreview(input, deps);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(state.saveCount, 1);
  assert.deepEqual(second.trip, first.trip);
  assert.equal(state.trip.stops.find((stop) => stop.id === "kyoto")?.nights, 4);
});

test("stale previews and cross-owner access are rejected without a write", async () => {
  const action: ResolvedTripCopilotAction = { action: "set_trip_preference", preference: "pace", value: "packed" };
  const stale = previewState(action);
  stale.trip = { ...stale.trip, title: "Changed elsewhere", updatedAt: "2026-08-27T12:10:00.000Z" };
  await assert.rejects(
    applyTripCopilotPreview({ ownerId: stale.preview.ownerId, tripId: stale.preview.tripId, previewId: stale.preview.previewId, expectedAction: action.action, now: new Date("2026-08-27T12:30:00.000Z") }, memoryDependencies(stale)),
    (error: unknown) => error instanceof TripCopilotApplyError && error.code === "stale",
  );
  assert.equal(stale.saveCount, 0);

  const owned = previewState(action);
  await assert.rejects(
    applyTripCopilotPreview({ ownerId: "another-owner", tripId: owned.preview.tripId, previewId: owned.preview.previewId, expectedAction: action.action, now: new Date("2026-08-27T12:30:00.000Z") }, memoryDependencies(owned)),
    (error: unknown) => error instanceof TripCopilotApplyError && error.code === "not-found",
  );
  assert.equal(owned.saveCount, 0);
});

test("a repository failure releases the preview and preserves the previous canonical trip", async () => {
  const action: ResolvedTripCopilotAction = { action: "set_trip_preference", preference: "pace", value: "packed" };
  const state = previewState(action);
  const before = structuredClone(state.trip);
  const dependencies = memoryDependencies(state);
  await assert.rejects(
    applyTripCopilotPreview(
      { ownerId: state.preview.ownerId, tripId: state.preview.tripId, previewId: state.preview.previewId, expectedAction: action.action, now: new Date("2026-08-27T12:30:00.000Z") },
      { ...dependencies, async saveTrip() { throw new Error("repository unavailable"); } },
    ),
    /repository unavailable/,
  );
  assert.deepEqual(state.trip, before);
  assert.equal(state.preview.status, "pending");
});

test("only action-specific confirmation routes can reach the canonical save boundary", () => {
  const interpretRoute = readFileSync(new URL("../app/api/easyt/trips/[tripId]/copilot/route.ts", import.meta.url), "utf8");
  const applyService = readFileSync(new URL("../lib/easyt/trip-copilot-apply.server.ts", import.meta.url), "utf8");
  const applyRoute = readFileSync(new URL("../lib/easyt/trip-copilot-apply-route.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(interpretRoute, /saveTripForOwner|applyConfirmedTripCopilotPreview/);
  assert.match(applyService, /saveTrip:\s*saveTripForOwner/);
  assert.match(applyRoute, /Object\.keys\(row\)\.length !== 1/);
  assert.match(applyRoute, /requireEasyTOwner\(\)/);
  assert.doesNotMatch(applyRoute, /OPENAI_API_KEY|getOpenAIClient|body\.message|row\.message/);
});
