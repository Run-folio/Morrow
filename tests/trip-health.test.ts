import assert from "node:assert/strict";
import test from "node:test";
import { reviewTrip, tripHealth } from "../lib/easyt/review.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const baseTrip = (): EasyTTrip => ({
  schemaVersion: 1, id: "health", ownerId: null, title: "Health", status: "draft", startDate: "2026-09-01", endDate: "2026-09-05", travellers: 2, currency: "GBP",
  brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: { version: 1, travellers: 2, timing: { flexibility: "fixed", durationDays: 5 }, hardConstraints: { originRequired: true, mustSeeStopIds: ["a", "b"], optionalStopIds: [], fixedCommitments: [], avoidDriving: false }, preferences: { budgetSensitivity: "mid", transportModes: ["train"], pace: "balanced", interests: [], dislikes: [] } }, scheduleLocks: { stopIds: [], arrivalDates: {} } },
  stops: [
    { id: "a", order: 0, name: "A", country: "Test", latitude: 0, longitude: 0, arrivalDate: "2026-09-01", departureDate: "2026-09-03", nights: 1 },
    { id: "b", order: 1, name: "B", country: "Test", latitude: 0, longitude: 10, arrivalDate: "2026-09-03", departureDate: "2026-09-05", nights: 1 },
  ],
  legs: [{ id: "leg", fromStopId: "a", toStopId: "b", mode: "road", distanceKm: 800, durationMinutes: 600, provider: "Planning estimate", routeMetadata: { planningEstimate: true } }],
  planItems: [
    { id: "a", stopId: "a", dayNumber: 1, date: "2026-09-01", type: "arrival", title: "A", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "b", stopId: "b", dayNumber: 3, date: "2026-09-03", type: "arrival", title: "B", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
  ], recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

test("flags a one-night stop reached by a heavy transfer as blocking", () => {
  const issues = reviewTrip(baseTrip());
  assert.equal(issues.some((item) => item.rule === "short-stop-heavy-transfer" && item.severity === "critical"), true);
});

test("treats a fixed commitment outside the trip dates as blocking", () => {
  const trip = baseTrip();
  trip.brief.intent!.hardConstraints.fixedCommitments = [{ id: "fixed", label: "Wedding", date: "2026-09-08" }];
  assert.equal(tripHealth(trip).blockingCount > 0, true);
  assert.equal(reviewTrip(trip).some((item) => item.rule === "fixed-date-conflict"), true);
});

test("does not call a trip ready while a major transport decision is still a planning estimate", () => {
  assert.equal(tripHealth(baseTrip()).isReady, false);
});

test("treats a persisted transport alternative as a decision while retaining the planning estimate", () => {
  const trip = baseTrip();
  trip.legs[0].routeMetadata.decisionOption = "fastest";
  assert.equal(reviewTrip(trip).some((item) => item.rule === "missing-transport-decision"), false);
});

test("blocks route readiness when a declared domestic stop is geographically implausible", () => {
  const trip = baseTrip();
  trip.stops[0] = { ...trip.stops[0], name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917 };
  trip.stops[1] = { ...trip.stops[1], name: "Nikko", country: "Japan", latitude: -16.2902, longitude: -66.1568 };
  assert.equal(reviewTrip(trip).some((item) => item.rule === "destination-identity" && item.severity === "critical"), true);
  assert.equal(tripHealth(trip).isReady, false);
});
