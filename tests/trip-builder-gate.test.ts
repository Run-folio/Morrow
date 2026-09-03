import assert from "node:assert/strict";
import test from "node:test";
import { canBuildTrip, type CanBuildTripInput } from "../lib/easyt/can-build-trip.ts";
import type { NightAllocationResult } from "../lib/easyt/night-allocation.ts";
import { generateRouteCandidates } from "../lib/easyt/route-candidates.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function allocatedNightResult(allocations: Record<string, number>, state: "allocated" | "compromised" = "allocated"): NightAllocationResult {
  const total = Object.values(allocations).reduce((sum, nights) => sum + nights, 0);
  return {
    version: 1,
    configVersion: "builder-gate-fixture",
    state,
    totalAvailableNights: total,
    totalAllocatedNights: total,
    allocations,
    stops: [],
    conflicts: [],
    notices: [],
  };
}

function document(stopIds = ["tokyo", "kyoto"], planStopIds = ["tokyo", "kyoto", "kyoto"]) {
  return {
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    stops: stopIds.map((id) => ({ id })),
    planItems: planStopIds.map((stopId, index) => ({ stopId, dayNumber: index + 1, date: `2026-10-0${index + 1}` })),
  } as Pick<EasyTTrip, "stops" | "planItems" | "startDate" | "endDate">;
}

function validInput(): CanBuildTripInput {
  const allocations = { tokyo: 1, kyoto: 1 };
  return {
    origin: "London",
    originCoordinates: [-0.1276, 51.5072],
    stops: [
      { id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
      { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
    ],
    placeIssues: [],
    routeConstraintIssues: [],
    requiredStopIds: ["tokyo", "kyoto"],
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    durationDays: 3,
    expectedDurationDays: 3,
    structuredBriefIssues: [],
    nightAllocation: allocatedNightResult(allocations),
    allocations,
    document: document(),
  };
}

test("valid builder document passes the authoritative invariant", () => {
  const result = canBuildTrip(validInput());
  assert.equal(result.canAdvanceToTime, true);
  assert.equal(result.canBuildTrip, true);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.qualityClassification, "reasonable");
});

test("the exact Cancún endpoint and opening-stay trip can advance to dates and nights", () => {
  const prompt = "Start in Cancún, stay overnight in Cancún, Tulum, Antigua Guatemala, Caye Caulker, Belize City and Flores, then return to Cancún for 22 days";
  const stops = [
    { id: "cancun-stay", name: "Cancún", country: "Mexico", coordinates: [-86.8515, 21.1619] as [number, number] },
    { id: "tulum", name: "Tulum", country: "Mexico", coordinates: [-87.4654, 20.2114] as [number, number] },
    { id: "antigua", name: "Antigua Guatemala", country: "Guatemala", coordinates: [-90.734, 14.557] as [number, number] },
    { id: "caye-caulker", name: "Caye Caulker", country: "Belize", coordinates: [-88.0329, 17.7425] as [number, number] },
    { id: "belize-city", name: "Belize City", country: "Belize", coordinates: [-88.1962, 17.5046] as [number, number] },
    { id: "flores", name: "Flores", country: "Guatemala", coordinates: [-89.897, 16.9294] as [number, number] },
  ];
  const brief = mergeStructuredTripBrief(extractStructuredTripBrief(prompt), {
    destinations: [
      { name: "Cancún", role: "arrival-gateway", priority: "required" },
      ...stops.map((stop) => ({ id: stop.id, name: stop.name, role: "preferred" as const, priority: "normal" as const })),
      { name: "Cancún", role: "departure-gateway", priority: "required" },
    ],
    mustVisit: stops.map((stop) => stop.name),
  });
  const constraints = routeConstraintsFromStructuredTripBrief(brief, stops.map((stop) => stop.id));
  const route = generateRouteCandidates({
    origin: { name: "Cancún", coordinates: [-86.8515, 21.1619] },
    stops,
    constraints,
    estimateLeg: () => ({ mode: "road", distanceKm: 100, durationMinutes: 120, label: "Test transfer", note: "Fixture.", confidence: "medium" }),
  });
  const input = validInput();
  input.origin = "Cancún";
  input.originCoordinates = [-86.8515, 21.1619];
  input.stops = stops;
  input.placeIssues = [];
  input.routeConstraintIssues = route.constraintIssues;
  input.requiredStopIds = constraints.requiredStopIds;
  input.expectedDurationDays = 22;

  assert.equal(constraints.fixedStartStopId, undefined);
  assert.equal(constraints.fixedEndStopId, undefined);
  assert.equal(route.constraintIssues.some((issue) => issue.code === "fixed-endpoint-conflict"), false);
  assert.equal(canBuildTrip(input).canAdvanceToTime, true);
});

test("a viable itinerary is not rejected across the exploratory duration range", () => {
  for (const durationDays of [7, 14, 28, 42, 56, 84]) {
    const input = validInput();
    const startDate = "2026-10-01";
    const start = new Date(`${startDate}T00:00:00Z`);
    const dateFor = (offset: number) => new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    const endDate = dateFor(durationDays - 1);
    const allocations = { tokyo: 1, kyoto: durationDays - 2 };
    input.startDate = startDate;
    input.endDate = endDate;
    input.durationDays = durationDays;
    input.expectedDurationDays = durationDays;
    input.allocations = allocations;
    input.nightAllocation = allocatedNightResult(allocations);
    input.document = {
      startDate,
      endDate,
      stops: [{ id: "tokyo" }, { id: "kyoto" }],
      planItems: Array.from({ length: durationDays }, (_, index) => ({
        stopId: index === 0 ? "tokyo" : "kyoto",
        dayNumber: index + 1,
        date: dateFor(index),
      })),
    } as Pick<EasyTTrip, "stops" | "planItems" | "startDate" | "endDate">;

    const result = canBuildTrip(input);
    assert.equal(result.canBuildTrip, true, `${durationDays}-day itinerary should not fail on duration alone`);
    assert.equal(result.conflicts.some((conflict) => conflict.code === "invalid-dates" || conflict.code === "duration-conflict"), false);
  }
});

test("progress tab cannot bypass unresolved place review", () => {
  const input = validInput();
  input.placeIssues = [{ mentionId: "mystery", blocksRoute: true, message: "Confirm Mystery Coast before building the route." }];
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.qualityClassification, "impossible");
  assert.equal(result.firstConflict?.code, "place-review-required");
});

test("an entered origin may reach validation but cannot build while unverified", () => {
  const input = validInput();
  input.originCoordinates = undefined;
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, true);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.find((conflict) => conflict.code === "origin-unverified")?.stage, "time");
});

test("unreviewed geography blocks an otherwise authored itinerary", () => {
  const input = validInput();
  input.placeReviewPending = true;
  assert.equal(input.document.planItems.length > 0, true);
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "place-review-required"), true);
});

test("empty trip cannot advance, build, persist or navigate", () => {
  const input = validInput();
  input.origin = "";
  input.stops = [];
  input.requiredStopIds = [];
  input.allocations = {};
  input.nightAllocation = allocatedNightResult({});
  input.document = document([], []);
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "origin-required"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "route-empty"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "itinerary-empty"), true);
});

test("three required stops under a hard maximum of two surfaces the structured conflict", () => {
  const input = validInput();
  input.stops.push({ id: "osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937] });
  input.requiredStopIds = ["tokyo", "kyoto", "osaka"];
  input.maximumStops = 2;
  const result = canBuildTrip(input);
  const conflict = result.conflicts.find((item) => item.code === "required-stops-exceed-maximum");
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(conflict?.source, "structured-brief");
  assert.match(conflict?.message ?? "", /3 required stops.*maximum of 2/);
});

test("eight retained stops in three days fail on zero-night stops and coverage", () => {
  const input = validInput();
  const stopIds = Array.from({ length: 8 }, (_, index) => `stop-${index + 1}`);
  input.stops = stopIds.map((id, index) => ({ id, name: `Stop ${index + 1}`, country: "Exampleland", coordinates: [index, index] }));
  input.requiredStopIds = stopIds;
  input.allocations = Object.fromEntries(stopIds.map((id, index) => [id, index < 2 ? 1 : 0]));
  input.nightAllocation = allocatedNightResult(input.allocations, "compromised");
  input.document = document(stopIds, [stopIds[0], stopIds[1], stopIds[1]]);
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.deepEqual(result.conflicts.find((conflict) => conflict.code === "zero-night-stop")?.stopIds, stopIds.slice(2));
  assert.equal(result.conflicts.some((conflict) => conflict.code === "itinerary-stop-uncovered"), true);
});

test("invalid document persistence is rejected for missing itinerary coverage", () => {
  const input = validInput();
  input.document = document(["tokyo", "kyoto"], ["tokyo", "tokyo", "tokyo"]);
  input.document.endDate = "2026-10-04";
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "invalid-dates"), true);
  assert.deepEqual(result.conflicts.find((conflict) => conflict.code === "itinerary-stop-uncovered")?.stopIds, ["kyoto"]);
});

test("date and night-allocation contradictions block final persistence", () => {
  const input = validInput();
  input.endDate = "2026-09-30";
  input.nightAllocation = {
    version: 1,
    configVersion: "builder-gate-fixture",
    state: "conflict",
    totalAvailableNights: 0,
    totalAllocatedNights: null,
    allocations: null,
    stops: [],
    conflicts: [{ code: "fixed-nights-exceed-total", severity: "error", message: "Fixed stays exceed the available trip nights.", stopIds: [], requiredNights: 4, allocatedNights: 0 }],
    notices: [],
  };
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "invalid-dates"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "night-allocation-conflict"), true);
});

test("the final validator blocks build, persistence and navigation through the same gate", () => {
  const input = validInput();
  input.planValidation = {
    issues: [{
      id: "plan-issue-fixed-date",
      code: "fixed-date-conflict",
      severity: "error",
      message: "A protected booking conflicts with the final calendar.",
      stopIds: ["kyoto"],
      legIndexes: [],
      hardConstraint: true,
      repairability: "manual",
      evidence: {},
      sources: ["final-plan"],
      relatedTripHealthFindingIds: [],
    }],
  };
  const result = canBuildTrip(input);

  assert.equal(result.canBuildTrip, false);
  assert.equal(result.outcome, "impossible");
  assert.equal(result.conflicts.some((conflict) => conflict.code === "final-plan-invalid" && conflict.source === "validator"), true);
});

test("the builder gate preserves distinct feasible and unknown realism outcomes", () => {
  const compressed = validInput();
  compressed.planValidation = {
    issues: [{
      id: "plan-issue-extreme-pacing", code: "extreme-pacing", severity: "warning",
      message: "Repeated one-night stops make this route unusually compressed.", stopIds: ["tokyo", "kyoto"], legIndexes: [],
      hardConstraint: false, repairability: "automatic", evidence: { oneNightStopCount: 2 }, sources: ["final-plan"], relatedTripHealthFindingIds: [],
    }],
  };
  assert.equal(canBuildTrip(compressed).qualityClassification, "exhausting but feasible");

  const unsupported = validInput();
  unsupported.planValidation = {
    issues: [{
      id: "plan-issue-unsupported-transfer", code: "unsupported-transfer", severity: "warning",
      message: "The ferry connection lacks enough supported data.", stopIds: ["tokyo", "kyoto"], legIndexes: [1],
      hardConstraint: false, repairability: "manual", evidence: { unconfirmedLegs: 1 }, sources: ["transfer-impact"], relatedTripHealthFindingIds: [],
    }],
  };
  assert.equal(canBuildTrip(unsupported).qualityClassification, "unknown due to insufficient transport evidence");
});
