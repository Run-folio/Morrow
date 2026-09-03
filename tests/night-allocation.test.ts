import assert from "node:assert/strict";
import test from "node:test";
import { knownKnowledgeFact, unknownKnowledgeFact } from "../lib/easyt/destination-knowledge.ts";
import {
  allocateTripNights,
  calendarDayAllocationsFromNights,
  rebalanceTripNights,
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

test("an explicit opening stay sharing the origin identity receives nights like every other stop", () => {
  const result = allocateTripNights({
    totalNights: 21,
    stops: ["cancun-stay", "tulum", "antigua", "caye-caulker", "belize-city", "flores"].map((id) => stop(id)),
  });
  assert.notEqual(result.state, "conflict");
  assert.equal(result.totalAllocatedNights, 21);
  assert.ok((result.allocations?.["cancun-stay"] ?? 0) > 0);
  assert.deepEqual(Object.keys(result.allocations ?? {}), ["cancun-stay", "tulum", "antigua", "caye-caulker", "belize-city", "flores"]);
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

test("required stops avoid one-night churn when the budget comfortably supports two nights each", () => {
  const result = allocateTripNights({
    totalNights: 10,
    pace: "relaxed",
    stops: [
      stop("anchor-a", { anchor: true, required: true, fallbackIdealNights: 5 }),
      stop("anchor-b", { anchor: true, required: true, fallbackIdealNights: 5 }),
      stop("anchor-c", { anchor: true, required: true, fallbackIdealNights: 5 }),
      stop("required", { required: true, fallbackIdealNights: 3 }),
    ],
  });

  assert.equal(result.state, "allocated");
  assert.equal(result.totalAllocatedNights, 10);
  assert.equal(result.stops.every((item) => item.nights >= 2), true);
});

test("semantic destination depth produces a defensible uneven multi-city split", () => {
  const result = allocateTripNights({
    totalNights: 12,
    stops: [
      stop("tokyo", { name: "Tokyo", country: "Japan", anchor: true, required: true }),
      stop("hakone", { intent: "landmark", required: true, fallbackMinimumNights: 1, fallbackIdealNights: 1 }),
      stop("kyoto", { name: "Kyoto", country: "Japan", anchor: true, required: true }),
      stop("nara", { intent: "landmark", required: true, fallbackMinimumNights: 1, fallbackIdealNights: 1 }),
      stop("osaka", { required: true, fallbackMinimumNights: 1, fallbackIdealNights: 2 }),
    ],
  });

  assert.deepEqual(result.allocations, { tokyo: 4, hakone: 1, kyoto: 4, nara: 1, osaka: 2 });
  assert.equal(result.stops.find((item) => item.stopId === "tokyo")?.depth, "deep");
  assert.equal(result.stops.find((item) => item.stopId === "hakone")?.depth, "single-purpose");
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

test("one internal transfer is apportioned across departure and arrival without double counting", () => {
  const source = {
    id: "provider:transfer-tax-test",
    label: "Transfer-tax fixture",
    kind: "provider" as const,
    supports: "Known duration for weighted transfer-tax coverage.",
  };
  const impact = estimateTransferImpact({
    mode: "train",
    headlineMinutes: knownKnowledgeFact(360, "verified", source),
  });
  const result = allocateTripNights({
    totalNights: 4,
    stops: [
      stop("departure", { departureImpact: impact }),
      stop("arrival", { arrivalImpact: impact }),
    ],
  });
  assert.notEqual(result.state, "conflict");
  const departureLoss = result.stops.find((item) => item.stopId === "departure")?.transferDayLoss ?? 0;
  const arrivalLoss = result.stops.find((item) => item.stopId === "arrival")?.transferDayLoss ?? 0;
  const expectedLoss = impact.usableDayLoss.estimatedDayFraction;
  assert.notEqual(expectedLoss, null);
  assert.ok(Math.abs((departureLoss + arrivalLoss) - (expectedLoss ?? 0)) < 0.0001);
  assert.ok(arrivalLoss > departureLoss);
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

test("a freed night moves only to one clearly strongest unlocked recipient", () => {
  const result = rebalanceTripNights({
    totalNights: 8,
    stops: [
      stop("edited", { anchor: true }),
      stop("recipient", { anchor: true, fallbackIdealNights: 5 }),
      stop("single-purpose", { intent: "landmark", fallbackIdealNights: 1 }),
    ],
    currentAllocations: { edited: 2, recipient: 3, "single-purpose": 2 },
    manualStopIds: ["edited"],
  });

  assert.deepEqual(result.nightAllocation.allocations, { edited: 2, recipient: 4, "single-purpose": 2 });
  assert.equal(result.balanceDelta, 0);
  assert.deepEqual(result.automaticChanges.map((change) => [change.stopId, change.direction]), [["recipient", "added"]]);
});

test("a freed night remains explicit when unlocked recipients are materially tied", () => {
  const result = rebalanceTripNights({
    totalNights: 6,
    stops: [stop("edited"), stop("a"), stop("b")],
    currentAllocations: { edited: 1, a: 2, b: 2 },
    manualStopIds: ["edited"],
  });

  assert.equal(result.balanceDelta, 1);
  assert.deepEqual(result.automaticChanges, []);
  assert.equal(result.nightAllocation.conflicts.some((conflict) => conflict.code === "unallocated-nights"), true);
});

test("an added manual night comes from one clearly lowest-value safe donor", () => {
  const result = rebalanceTripNights({
    totalNights: 7,
    stops: [
      stop("edited", { anchor: true }),
      stop("donor", { intent: "landmark", fallbackIdealNights: 1 }),
      stop("other", { anchor: true }),
    ],
    currentAllocations: { edited: 4, donor: 2, other: 2 },
    manualStopIds: ["edited"],
  });

  assert.deepEqual(result.nightAllocation.allocations, { edited: 4, donor: 1, other: 2 });
  assert.deepEqual(result.automaticChanges.map((change) => [change.stopId, change.direction]), [["donor", "removed"]]);
});

test("over-allocation stays visible when every possible donor is protected or tied", () => {
  const protectedResult = rebalanceTripNights({
    totalNights: 6,
    stops: [stop("edited"), stop("manual"), stop("booked", { fixedNights: 2 })],
    currentAllocations: { edited: 3, manual: 2, booked: 2 },
    manualStopIds: ["edited", "manual"],
  });

  assert.equal(protectedResult.balanceDelta, -1);
  assert.deepEqual(protectedResult.nightAllocation.allocations, { edited: 3, manual: 2, booked: 2 });
  assert.equal(protectedResult.nightAllocation.conflicts.some((conflict) => conflict.code === "overallocated-nights"), true);

  const tied = rebalanceTripNights({
    totalNights: 6,
    stops: [stop("edited"), stop("a"), stop("b")],
    currentAllocations: { edited: 3, a: 2, b: 2 },
    manualStopIds: ["edited"],
  });
  assert.equal(tied.balanceDelta, -1);
  assert.deepEqual(tied.automaticChanges, []);
});

test("manual, booking and gateway protections are never silently rewritten", () => {
  const result = rebalanceTripNights({
    totalNights: 9,
    stops: [
      stop("edited", { manualNights: 2 }),
      stop("second-manual", { manualNights: 2 }),
      stop("booked", { fixedNights: 2 }),
      stop("gateway", { gateway: true, fixedNights: 1 }),
      stop("recipient", { anchor: true, fallbackIdealNights: 5 }),
    ],
    currentAllocations: { edited: 2, "second-manual": 2, booked: 2, gateway: 1, recipient: 1 },
    manualStopIds: ["edited", "second-manual"],
  });

  assert.deepEqual(result.nightAllocation.allocations, { edited: 2, "second-manual": 2, booked: 2, gateway: 1, recipient: 2 });
  assert.equal(result.nightAllocation.allocations?.booked, 2);
  assert.equal(result.nightAllocation.allocations?.gateway, 1);
});

test("automatic removal never violates a required minimum", () => {
  const result = rebalanceTripNights({
    totalNights: 6,
    stops: [
      stop("edited", { anchor: true }),
      stop("minimum", { required: true, fallbackMinimumNights: 2, fallbackIdealNights: 2 }),
      stop("donor", { intent: "landmark", fallbackMinimumNights: 1, fallbackIdealNights: 1 }),
    ],
    currentAllocations: { edited: 3, minimum: 2, donor: 2 },
    manualStopIds: ["edited"],
  });

  assert.equal(result.nightAllocation.allocations?.minimum, 2);
  assert.equal(result.nightAllocation.allocations?.donor, 1);
});

test("removed stops and duration deltas use the same deterministic rebalance rules", () => {
  const stops = [stop("manual"), stop("deep", { anchor: true, fallbackIdealNights: 5 }), stop("small", { intent: "landmark", fallbackIdealNights: 1 })];
  const removed = rebalanceTripNights({
    totalNights: 7,
    stops,
    currentAllocations: { manual: 2, deep: 3, small: 1, removed: 1 },
    manualStopIds: ["manual"],
  });
  assert.equal(removed.balanceDelta, 0);
  assert.equal(removed.nightAllocation.allocations?.manual, 2);
  assert.equal(removed.nightAllocation.allocations?.deep, 4);

  const extended = rebalanceTripNights({
    totalNights: 7,
    stops,
    currentAllocations: { manual: 2, deep: 3, small: 1 },
    manualStopIds: ["manual"],
  });
  assert.deepEqual(extended.nightAllocation.allocations, { manual: 2, deep: 4, small: 1 });
  assert.equal(extended.balanceDelta, 0);
});

test("route reorder preserves manual intent by stable stop identity", () => {
  const currentAllocations = { manual: 2, deep: 4, small: 1 };
  const result = rebalanceTripNights({
    totalNights: 7,
    stops: [stop("small", { intent: "landmark" }), stop("manual"), stop("deep", { anchor: true })],
    currentAllocations,
    manualStopIds: ["manual"],
  });

  assert.equal(result.nightAllocation.allocations?.manual, currentAllocations.manual);
  assert.equal(result.nightAllocation.stops.find((item) => item.stopId === "manual")?.isManual, true);
});

test("interest evidence can move unlocked nights without overwriting a manual count", () => {
  const source = {
    id: "curated:interest-night-test",
    label: "Night allocation interest fixture",
    kind: "curated" as const,
    supports: "Equal stay guidance with different evidenced experience tags.",
  };
  const knowledge = {
    forNightAllocation: (input: { id?: string; name: string }) => ({
      canonicalId: input.id ?? null,
      minimumNights: knownKnowledgeFact(1, "static", source),
      idealNights: knownKnowledgeFact(3, "estimated", source),
      roles: knownKnowledgeFact([] as const, "static", source),
      experienceTags: knownKnowledgeFact(input.id === "beach" ? ["coast", "food"] : ["culture"], "static", source),
      connectivity: unknownKnowledgeFact("Connectivity is deliberately neutral in this fixture."),
    }),
  };
  const stops = [stop("manual"), stop("culture"), stop("beach")];
  const currentAllocations = { manual: 1, culture: 3, beach: 2 };
  const neutral = rebalanceTripNights({ totalNights: 6, stops, knowledge, currentAllocations, manualStopIds: ["manual"] }).nightAllocation;
  const beach = rebalanceTripNights({ totalNights: 6, stops, knowledge, interests: ["beach", "food"], currentAllocations, manualStopIds: ["manual"] }).nightAllocation;

  assert.equal(neutral.allocations?.manual, 1);
  assert.equal(beach.allocations?.manual, 1);
  assert.ok((beach.allocations?.beach ?? 0) > (neutral.allocations?.beach ?? 0));
  assert.equal(beach.stops.find((item) => item.stopId === "beach")?.matchedInterests?.includes("beach"), true);
});

test("an exact-budget interest rebalance stays put when the best receiver pairs are tied", () => {
  const source = {
    id: "curated:interest-tie-test",
    label: "Night allocation interest tie fixture",
    kind: "curated" as const,
    supports: "Equal stay guidance and equal evidenced experience tags.",
  };
  const knowledge = {
    forNightAllocation: (input: { id?: string; name: string }) => ({
      canonicalId: input.id ?? null,
      minimumNights: knownKnowledgeFact(1, "static", source),
      idealNights: knownKnowledgeFact(1, "static", source),
      roles: knownKnowledgeFact([] as const, "static", source),
      experienceTags: knownKnowledgeFact(input.id === "receiver-a" || input.id === "receiver-b" ? ["food"] : ["culture"], "static", source),
      connectivity: unknownKnowledgeFact("Connectivity is deliberately neutral in this fixture."),
    }),
  };
  const currentAllocations = { manual: 1, donor: 4, "receiver-a": 1, "receiver-b": 1 };
  const result = rebalanceTripNights({
    totalNights: 7,
    stops: [stop("manual"), stop("donor"), stop("receiver-a"), stop("receiver-b")],
    knowledge,
    interests: ["food"],
    currentAllocations,
    manualStopIds: ["manual"],
  });

  assert.equal(result.balanceDelta, 0);
  assert.deepEqual(result.nightAllocation.allocations, currentAllocations);
  assert.deepEqual(result.automaticChanges, []);
});

test("sparse destination evidence stays neutral and does not manufacture a rebalance winner", () => {
  const result = rebalanceTripNights({
    totalNights: 6,
    stops: [stop("manual"), stop("unknown-a"), stop("unknown-b")],
    currentAllocations: { manual: 1, "unknown-a": 2, "unknown-b": 2 },
    manualStopIds: ["manual"],
  });

  assert.equal(result.balanceDelta, 1);
  assert.deepEqual(result.automaticChanges, []);
  assert.equal(result.nightAllocation.stops.find((item) => item.stopId === "unknown-a")?.depth, "ordinary");
});
