import assert from "node:assert/strict";
import test from "node:test";

import { dashboardHeroTrip, archiveTripStatus, restoreTripStatus, statusForTripEdit, tripDatePresentation, tripStartDateSortKey } from "../lib/easyt/trip-status.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const now = new Date(2026, 7, 24, 12);

function trip(id: string, status: EasyTTrip["status"], startDate: string, endDate: string, updatedAt = "2026-08-01T12:00:00.000Z"): EasyTTrip {
  return {
    schemaVersion: 1, id, ownerId: "owner-a", title: id, status, startDate, endDate,
    travellers: 2, currency: "GBP", brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops: [], legs: [], planItems: [], recommendations: [], createdAt: "2026-08-01T10:00:00.000Z", updatedAt,
  };
}

test("draft becomes planned when a usable trip is saved", () => {
  assert.equal(statusForTripEdit("draft", "planned"), "planned");
});

test("editing a planned trip cannot silently downgrade it to draft", () => {
  assert.equal(statusForTripEdit("planned", "draft"), "planned");
  assert.equal(statusForTripEdit("planned", "planned"), "planned");
});

test("archive and restore retain the previous planned lifecycle", () => {
  const beforeArchive = archiveTripStatus("planned");
  assert.equal(beforeArchive, "planned");
  assert.equal(restoreTripStatus(beforeArchive), "planned");
  assert.equal(restoreTripStatus(archiveTripStatus("draft")), "draft");
});

test("dashboard prefers a future planned trip to a recently touched past draft", () => {
  const pastDraft = trip("stale-draft", "draft", "2026-08-01", "2026-08-04", "2026-08-24T11:59:00.000Z");
  const futurePlan = trip("future-plan", "planned", "2026-09-10", "2026-09-17");
  assert.equal(dashboardHeroTrip([pastDraft, futurePlan], now)?.id, futurePlan.id);
  assert.equal(tripDatePresentation(pastDraft, now).state, "ended");
  assert.equal(pastDraft.status, "draft");
});

test("dashboard hero handles ongoing, future, and all-past fixtures without mutating status", () => {
  const ongoing = trip("ongoing", "planned", "2026-08-20", "2026-08-27");
  const future = trip("future", "planned", "2026-09-01", "2026-09-05");
  const past = trip("past", "planned", "2026-08-01", "2026-08-03", "2026-08-24T12:00:00.000Z");
  assert.equal(tripDatePresentation(ongoing, now).state, "in-progress");
  assert.equal(tripDatePresentation(future, now).state, "upcoming");
  assert.equal(tripDatePresentation(past, now).state, "ended");
  assert.equal(dashboardHeroTrip([future, ongoing, past], now)?.id, ongoing.id);
  assert.equal(dashboardHeroTrip([future, past], now)?.id, future.id);
  assert.equal(dashboardHeroTrip([past, trip("older", "draft", "2026-07-01", "2026-07-03")], now)?.id, past.id);
  assert.equal(ongoing.status, "planned");
});

test("dashboard start-date sorting uses calendar dates, not UTC-parsed instants", () => {
  const earlier = trip("calendar-earlier", "planned", "2026-01-01", "2026-01-04");
  const later = trip("calendar-later", "planned", "2026-01-02", "2026-01-05");
  assert.ok(tripStartDateSortKey(earlier) < tripStartDateSortKey(later));
  assert.equal(tripStartDateSortKey(trip("no-date", "draft", "", "")), Number.MAX_SAFE_INTEGER);
});
