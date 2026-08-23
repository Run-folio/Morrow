import assert from "node:assert/strict";
import test from "node:test";
import { knownKnowledgeFact } from "../lib/easyt/destination-knowledge.ts";
import {
  allocateTripNights,
  calendarDayAllocationsFromNights,
  tripNightsBetween,
} from "../lib/easyt/night-allocation.ts";
import { cascadeTripSchedule } from "../lib/easyt/cascade.ts";
import { estimateTransferImpact } from "../lib/easyt/transfer-impact.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const stop = (id: string, options: Partial<Parameters<typeof allocateTripNights>[0]["stops"][number]> = {}) => ({
  id,
  name: id.toUpperCase(),
  country: "Test",
  ...options,
});

test("allocated nights reconcile exactly with the trip duration", () => {
  const result = allocateTripNights({ totalNights: 7, stops: [stop("a"), stop("b"), stop("c")] });

  assert.notEqual(result.state, "conflict");
  assert.equal(result.totalAllocatedNights, 7);
  assert.equal(result.allocations && Object.values(result.allocations).reduce((total, nights) => total + nights, 0), 7);
  assert.equal(tripNightsBetween("2026-09-01", "2026-09-08"), 7);
  assert.deepEqual(calendarDayAllocationsFromNights(["a", "b", "c"], result.allocations ?? {}), {
    a: result.allocations?.a,
    b: result.allocations?.b,
    c: (result.allocations?.c ?? 0) + 1,
  });
});

test("night-native persisted metadata keeps cascade date boundaries exact", () => {
  const nightAllocation = allocateTripNights({ totalNights: 6, stops: [stop("a"), stop("b")] });
  assert.notEqual(nightAllocation.state, "conflict");
  const allocations = nightAllocation.allocations ?? {};
  const source: EasyTTrip = {
    schemaVersion: 1,
    id: "night-native",
    ownerId: null,
    title: "Night native",
    status: "draft",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "Origin", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, nightAllocation },
    stops: [
      { id: "a", order: 0, name: "A", country: "Test", latitude: 0, longitude: 0, arrivalDate: null, departureDate: null, nights: allocations.a ?? 0 },
      { id: "b", order: 1, name: "B", country: "Test", latitude: 0, longitude: 1, arrivalDate: null, departureDate: null, nights: allocations.b ?? 0 },
    ],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-08-23",
    updatedAt: "2026-08-23",
  };
  const trip = cascadeTripSchedule(source).trip;

  assert.equal(trip.stops.reduce((total, item) => total + (item.nights ?? 0), 0), 6);
  assert.equal(trip.stops[0]?.departureDate, trip.stops[1]?.arrivalDate);
  assert.equal(trip.stops.at(-1)?.departureDate, "2026-09-07");
  assert.deepEqual(trip.brief.cascadeStatus?.conflicts, []);
});

test("anchors and must-visits receive higher allocation priority", () => {
  const result = allocateTripNights({
    totalNights: 6,
    stops: [stop("anchor", { anchor: true, required: true }), stop("b"), stop("c")],
  });

  assert.notEqual(result.state, "conflict");
  assert.ok((result.allocations?.anchor ?? 0) > (result.allocations?.c ?? 0));
  assert.ok((result.allocations?.anchor ?? 0) >= 2);
  assert.equal(result.stops.find((item) => item.stopId === "anchor")?.reasons.some((reason) => reason.code === "anchor-priority"), true);
});

test("relaxed and fast pace produce predictable different splits", () => {
  const stops = [stop("anchor", { anchor: true, required: true }), stop("b"), stop("c")];
  const relaxed = allocateTripNights({ totalNights: 7, stops, pace: "relaxed" });
  const fast = allocateTripNights({ totalNights: 7, stops, pace: "fast" });

  assert.notEqual(relaxed.state, "conflict");
  assert.notEqual(fast.state, "conflict");
  assert.ok((relaxed.allocations?.anchor ?? 0) > (fast.allocations?.anchor ?? 0));
  assert.ok((fast.allocations?.c ?? 0) > (relaxed.allocations?.c ?? 0));
});

test("fixed stays remain fixed while the remaining nights rebalance", () => {
  const result = allocateTripNights({
    totalNights: 6,
    stops: [stop("fixed"), stop("flexible")],
    fixedCommitments: [{ label: "Confirmed stay", stopId: "fixed", fixedNights: 4 }],
  });

  assert.notEqual(result.state, "conflict");
  assert.equal(result.allocations?.fixed, 4);
  assert.equal(result.allocations?.flexible, 2);
  assert.equal(result.totalAllocatedNights, 6);
});

test("fixed nights that exceed the trip return a conflict instead of rewriting the booking", () => {
  const result = allocateTripNights({
    totalNights: 3,
    stops: [stop("fixed"), stop("flexible")],
    fixedCommitments: [{ label: "Confirmed stay", stopId: "fixed", fixedNights: 4 }],
  });

  assert.equal(result.state, "conflict");
  assert.equal(result.allocations, null);
  assert.equal(result.conflicts[0]?.code, "fixed-nights-exceed-total");
});

test("cascade preserves fixed nights when their allocation conflict exceeds the date span", () => {
  const nightAllocation = allocateTripNights({
    totalNights: 2,
    stops: [stop("fixed"), stop("flexible")],
    fixedCommitments: [{ label: "Confirmed stay", stopId: "fixed", fixedNights: 3 }],
  });
  assert.equal(nightAllocation.state, "conflict");
  const source: EasyTTrip = {
    schemaVersion: 1,
    id: "fixed-conflict",
    ownerId: null,
    title: "Fixed conflict",
    status: "draft",
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "Origin",
      mustDo: "",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      nightAllocations: { fixed: 3, flexible: 0 },
      nightAllocation,
    },
    stops: [
      { id: "fixed", order: 0, name: "Fixed", country: "Test", latitude: 0, longitude: 0, arrivalDate: null, departureDate: null, nights: 3 },
      { id: "flexible", order: 1, name: "Flexible", country: "Test", latitude: 0, longitude: 1, arrivalDate: null, departureDate: null, nights: 0 },
    ],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-08-23",
    updatedAt: "2026-08-23",
  };
  const cascaded = cascadeTripSchedule(source);

  assert.equal(cascaded.trip.stops[0]?.nights, 3);
  assert.equal(cascaded.trip.stops[1]?.arrivalDate, "2026-09-04");
  assert.equal(cascaded.status.conflicts.some((message) => /beyond the trip end/i.test(message)), true);
});

test("too few nights return an exact but structured minimum-stay compromise", () => {
  const result = allocateTripNights({
    totalNights: 2,
    stops: [stop("a", { anchor: true, required: true }), stop("b", { anchor: true, required: true })],
  });

  assert.equal(result.state, "compromised");
  assert.equal(result.totalAllocatedNights, 2);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "minimum-stay-compromise"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "one-night-anchor"), true);
});

test("a transfer that consumes most of a day raises the destination target", () => {
  const source = {
    id: "provider:night-allocation-test",
    label: "Verified night-allocation fixture",
    kind: "provider" as const,
    supports: "Headline duration for deterministic transfer-loss allocation tests.",
    reviewedAt: "2026-08-23",
  };
  const impact = estimateTransferImpact({
    mode: "flight",
    headlineMinutes: knownKnowledgeFact(360, "verified", source),
    international: false,
    connectionCount: 0,
  });
  const result = allocateTripNights({
    totalNights: 5,
    stops: [stop("travel-heavy", { arrivalImpact: impact }), stop("easy-arrival")],
  });

  assert.notEqual(result.state, "conflict");
  assert.ok((result.allocations?.["travel-heavy"] ?? 0) > (result.allocations?.["easy-arrival"] ?? 0));
  assert.equal(result.stops.find((item) => item.stopId === "travel-heavy")?.reasons.some((reason) => reason.code === "transfer-recovery"), true);
});

test("unknown ideal nights use the explicit fallback instead of invented knowledge", () => {
  const result = allocateTripNights({
    totalNights: 4,
    stops: [stop("unknown", { fallbackMinimumNights: 1, fallbackIdealNights: 3 })],
  });

  assert.notEqual(result.state, "conflict");
  assert.equal(result.stops[0]?.idealSource, "planner-fallback");
  assert.equal(result.stops[0]?.idealNights, 3);
});

test("deterministic ties use stable input order", () => {
  const input = { totalNights: 3, stops: [stop("first"), stop("second")], pace: "balanced" as const };
  const first = allocateTripNights(input);
  const second = allocateTripNights(input);

  assert.deepEqual(first, second);
  assert.notEqual(first.state, "conflict");
  assert.equal(first.allocations?.first, 2);
  assert.equal(first.allocations?.second, 1);
});
