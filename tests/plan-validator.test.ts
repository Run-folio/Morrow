import assert from "node:assert/strict";
import test from "node:test";
import { repairFinalPlan } from "../lib/easyt/plan-repair.ts";
import { validateFinalPlan, type FinalPlan, type FinalPlanStop, type PlanLegEstimator } from "../lib/easyt/plan-validator.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

const stop = (
  id: string,
  coordinates: [number, number],
  nights = 2,
  extra: Partial<FinalPlanStop> = {},
): FinalPlanStop => ({ id, name: id.toUpperCase(), country: "Test", coordinates, nights, ...extra });

const plan = (stops: FinalPlanStop[], extra: Partial<FinalPlan> = {}): FinalPlan => ({
  version: 1,
  origin: { name: "Origin", coordinates: stops[0]?.coordinates },
  stops,
  totalNights: stops.reduce((total, item) => total + item.nights, 0),
  pace: "balanced",
  ...extra,
});

const supportedRoad: PlanLegEstimator = (from, to) => ({
  mode: "road",
  distanceKm: 120,
  durationMinutes: 150,
  label: `${from.name} → ${to.name}`,
  note: "Deterministic test transfer.",
  confidence: "high",
});

test("repairs fixed start and departure gateways without dropping must-visits", () => {
  const result = repairFinalPlan({
    plan: plan([
      stop("middle", [1, 0]),
      stop("start", [0, 0], 2, { required: true }),
      stop("anchor", [2, 0], 2, { anchor: true, required: true }),
      stop("end", [3, 0]),
    ], {
      constraints: {
        fixedStartStopId: "start",
        fixedEndStopId: "end",
        requiredStopIds: ["start", "anchor"],
      },
    }),
  });

  assert.equal(result.state, "repaired");
  assert.deepEqual(result.plan.stops.map((item) => item.id), ["start", "middle", "anchor", "end"]);
  assert.equal(result.repairs[0]?.action, "restore-fixed-gateways");
  assert.equal(result.finalValidation.hardConstraintIssueCount, 0);
  assert.equal(result.plan.stops.some((item) => item.id === "anchor"), true);
});

test("repairs an exact total-night mismatch through the night allocator", () => {
  const result = repairFinalPlan({
    plan: plan([stop("a", [0, 0], 1), stop("b", [1, 0], 1)], { totalNights: 4 }),
  });

  assert.equal(result.state, "repaired");
  assert.equal(result.plan.stops.reduce((total, item) => total + item.nights, 0), 4);
  assert.equal(result.repairs.some((item) => item.action === "reallocate-nights"), true);
});

test("deduplicates by stable destination identity and preserves the night budget", () => {
  const result = repairFinalPlan({
    plan: plan([stop("a", [0, 0], 1), stop("a", [0, 0], 2), stop("b", [1, 0], 1)]),
  });

  assert.equal(result.state, "repaired");
  assert.deepEqual(result.plan.stops.map((item) => item.id), ["a", "b"]);
  assert.equal(result.plan.stops.find((item) => item.id === "a")?.nights, 3);
  assert.equal(result.plan.stops.reduce((total, item) => total + item.nights, 0), 4);
});

test("repairs extreme balanced pacing deterministically", () => {
  const source = plan([
    stop("a", [0, 0], 1),
    stop("b", [1, 0], 1),
    stop("c", [2, 0], 1),
    stop("d", [3, 0], 5),
  ]);
  const first = repairFinalPlan({ plan: source });
  const second = repairFinalPlan({ plan: source });

  assert.deepEqual(first.plan.stops.map((item) => item.nights), [2, 2, 2, 2]);
  assert.deepEqual(first.plan, second.plan);
  assert.equal(first.finalValidation.issues.some((item) => item.code === "extreme-pacing"), false);
});

test("detects and repairs obvious backtracking through viable candidate scoring", () => {
  const result = repairFinalPlan({
    plan: plan([
      stop("a", [0, 0]),
      stop("c", [10, 0]),
      stop("b", [1, 0]),
      stop("d", [11, 0]),
    ], { constraints: { fixedStartStopId: "a", requiredStopIds: ["a", "b", "c", "d"] } }),
  });

  assert.equal(result.initialValidation.issues.some((item) => item.code === "unnecessary-backtracking"), true);
  assert.deepEqual(result.plan.stops.map((item) => item.id), ["a", "b", "c", "d"]);
  assert.equal(result.repairs.some((item) => item.action === "reorder-route" && Boolean(item.scoreExplanation)), true);
});

test("leaves a missing required destination visible when it cannot repair safely", () => {
  const result = repairFinalPlan({
    plan: plan([stop("a", [0, 0])], { constraints: { requiredStopIds: ["a", "missing"] } }),
  });

  assert.equal(result.state, "unresolved");
  assert.equal(result.repairs.length, 0);
  assert.deepEqual(result.unresolvedIssues.find((item) => item.code === "required-stop-missing")?.stopIds, ["missing"]);
});

test("never accepts a repair that leaves or introduces a new hard violation", () => {
  const result = repairFinalPlan({
    plan: plan([
      stop("start", [0, 0]),
      stop("middle", [1, 0], 1),
      stop("middle", [1, 0], 1),
      stop("end", [2, 0]),
    ], {
      constraints: { fixedStartStopId: "start", fixedEndStopId: "end", requiredStopIds: ["start", "middle", "end"] },
    }),
  });

  assert.equal(result.finalValidation.hardConstraintIssueCount, 0);
  assert.deepEqual(result.plan.stops.map((item) => item.id), ["start", "middle", "end"]);
  assert.equal(result.plan.stops.every((item) => ["start", "middle", "end"].includes(item.id)), true);
});

test("stops at the explicit loop bound with remaining issues visible", () => {
  const result = repairFinalPlan({
    plan: plan([stop("middle", [1, 0], 1), stop("start", [0, 0], 1), stop("end", [2, 0], 1)], {
      totalNights: 5,
      constraints: { fixedStartStopId: "start", fixedEndStopId: "end" },
    }),
    config: { version: "one-pass-test", maxIterations: 1 },
  });

  assert.equal(result.state, "iteration-limit");
  assert.equal(result.iterations, 1);
  assert.equal(result.repairs.length, 1);
  assert.equal(result.unresolvedIssues.some((item) => item.code === "total-nights-mismatch"), true);
});

test("hard transport rules invalidate supported modes while soft preferences do not", () => {
  const source = plan([stop("a", [0, 0]), stop("b", [1, 0])]);
  const hard = validateFinalPlan({
    plan: { ...source, constraints: { avoidDriving: true } },
    estimateLeg: supportedRoad,
  });
  const soft = repairFinalPlan({
    plan: source,
    estimateLeg: supportedRoad,
    scoringPreferences: { preferredModes: ["train"] },
  });

  assert.equal(hard.issues.some((item) => item.code === "transport-restriction-conflict" && item.hardConstraint), true);
  assert.equal(soft.finalValidation.issues.some((item) => item.code === "transport-restriction-conflict"), false);
});

test("reports unsupported transfers and out-of-window fixed commitments", () => {
  const unknown: PlanLegEstimator = (from, to) => ({
    mode: "flight", distanceKm: null, durationMinutes: null, label: `${from.name} → ${to.name}`,
    note: "Unknown test connection.", confidence: "unconfirmed",
  });
  const report = validateFinalPlan({
    plan: plan([stop("a", [0, 0]), stop("b", [1, 0])], {
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      totalNights: 4,
      constraints: { fixedCommitments: [{ label: "Wedding", date: "2026-09-08" }] },
    }),
    estimateLeg: unknown,
  });

  assert.equal(report.issues.some((item) => item.code === "unsupported-transfer"), true);
  assert.equal(report.issues.some((item) => item.code === "fixed-date-conflict" && item.severity === "error"), true);
});

test("does not move a linked fixed commitment outside its destination stay", () => {
  const report = validateFinalPlan({
    plan: plan([
      stop("a", [0, 0], 2, { arrivalDate: "2026-09-01", departureDate: "2026-09-03" }),
      stop("b", [1, 0], 2, { arrivalDate: "2026-09-03", departureDate: "2026-09-05" }),
    ], {
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      constraints: { fixedCommitments: [{ label: "Booked event", date: "2026-09-04", stopId: "a" }] },
    }),
  });

  assert.equal(report.issues.some((item) => item.code === "fixed-date-conflict" && item.evidence.conflictingLinkedCommitments), true);
});

test("removes only the lowest-priority optional stop to satisfy a hard maximum", () => {
  const result = repairFinalPlan({
    plan: plan([
      stop("start", [0, 0], 2, { required: true }),
      stop("optional", [1, 0], 2, { optional: true, preferenceWeight: 0 }),
      stop("anchor", [2, 0], 2, { anchor: true, required: true }),
      stop("end", [3, 0], 2, { required: true }),
    ], {
      constraints: {
        fixedStartStopId: "start",
        fixedEndStopId: "end",
        requiredStopIds: ["start", "anchor", "end"],
        optionalStopIds: ["optional"],
        maximumStops: 3,
      },
    }),
  });

  assert.deepEqual(result.plan.stops.map((item) => item.id), ["start", "anchor", "end"]);
  assert.equal(result.repairs[0]?.action, "remove-optional-stop");
  assert.equal(result.repairs[0]?.category, "constraints");
  assert.deepEqual(result.repairs[0]?.proposedChange.stopIds, ["start", "optional", "anchor", "end"]);
  assert.equal(result.repairs[0]?.constraintsPreserved.some((item) => item.includes("required/must-visit")), true);
  assert.equal(result.repairs[0]?.confidence.sources.length, 1);
  assert.equal(result.finalValidation.hardConstraintIssueCount, 0);
});

test("keeps an impossible required-stop maximum unresolved instead of dropping a must-visit", () => {
  const source = plan([
    stop("start", [0, 0], 2, { required: true }),
    stop("anchor", [1, 0], 2, { required: true, anchor: true }),
    stop("end", [2, 0], 2, { required: true }),
  ], {
    constraints: {
      fixedStartStopId: "start",
      fixedEndStopId: "end",
      requiredStopIds: ["start", "anchor", "end"],
      maximumStops: 2,
    },
  });
  const result = repairFinalPlan({ plan: source });

  assert.deepEqual(result.plan.stops, source.stops);
  assert.equal(result.plan.totalNights, source.totalNights);
  assert.equal(result.plan.constraints?.maximumStops, source.constraints?.maximumStops);
  assert.equal(result.repairs.length, 0);
  assert.equal(result.unresolvedIssues.some((item) => item.code === "hard-constraint-violation" && item.repairability === "none"), true);
});

test("does not rewrite dated stop fields while restoring a fixed gateway", () => {
  const result = repairFinalPlan({
    plan: plan([
      stop("middle", [1, 0], 2, { arrivalDate: "2026-09-03", departureDate: "2026-09-05" }),
      stop("start", [0, 0], 2, { arrivalDate: "2026-09-01", departureDate: "2026-09-03" }),
      stop("end", [2, 0], 2, { arrivalDate: "2026-09-05", departureDate: "2026-09-07" }),
    ], {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      constraints: { fixedStartStopId: "start", fixedEndStopId: "end" },
    }),
  });

  assert.equal(result.repairs[0]?.action, "restore-fixed-gateways");
  assert.deepEqual(
    Object.fromEntries(result.plan.stops.map((item) => [item.id, [item.arrivalDate, item.departureDate]])),
    {
      start: ["2026-09-01", "2026-09-03"],
      middle: ["2026-09-03", "2026-09-05"],
      end: ["2026-09-05", "2026-09-07"],
    },
  );
});

test("retains the original route when a lower-transfer proposal does not improve validation", () => {
  const estimator: PlanLegEstimator = (from, to) => {
    const fromId = "id" in from ? from.id : "origin";
    const durationMinutes = fromId === "a" && to.id === "b" ? 700 : fromId === "a" && to.id === "c" ? 600 : 100;
    return {
      mode: "road",
      distanceKm: durationMinutes,
      durationMinutes,
      label: `${from.name} → ${to.name}`,
      note: "Deterministic validation-improvement test.",
      confidence: "high",
    };
  };
  const source = plan([
    stop("a", [0, 0]),
    stop("b", [1, 0]),
    stop("c", [2, 0]),
  ], { constraints: { fixedStartStopId: "a" } });
  const result = repairFinalPlan({ plan: source, estimateLeg: estimator });

  assert.deepEqual(result.plan.stops.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(result.repairs.length, 0);
  assert.equal(result.rejectedRepairs.some((item) => item.reason === "no-measurable-improvement"), true);
  assert.equal(result.terminationReason, "no-safe-improvement");
});

test("diagnoses a one-night anchor after a large transfer and uses the existing allocator", () => {
  const longTransfer: PlanLegEstimator = (from, to) => ({
    mode: "flight",
    distanceKm: 1_000,
    durationMinutes: 360,
    label: `${from.name} → ${to.name}`,
    note: "Deterministic long transfer.",
    confidence: "high",
  });
  const result = repairFinalPlan({
    plan: plan([
      stop("base", [0, 0], 4),
      stop("anchor", [10, 0], 1, { anchor: true }),
      stop("finish", [11, 0], 3),
    ]),
    estimateLeg: longTransfer,
  });

  assert.equal(result.initialValidation.issues.some((item) => item.code === "one-night-anchor-after-large-transfer"), true);
  assert.ok((result.plan.stops.find((item) => item.id === "anchor")?.nights ?? 0) >= 2);
  assert.equal(result.repairs.some((item) => item.action === "reallocate-nights"), true);
});

test("keeps fixed nights unchanged and surfaces an inconsistent fixed stay as hard", () => {
  const report = validateFinalPlan({
    plan: plan([
      stop("fixed", [0, 0], 1, { fixedNights: 2 }),
      stop("flexible", [1, 0], 3),
    ]),
  });

  assert.equal(report.issues.some((item) => item.code === "fixed-date-conflict" && item.hardConstraint), true);
  assert.deepEqual(report.issues.find((item) => item.code === "fixed-date-conflict")?.evidence.fixedNightMismatches, ["fixed"]);
});

test("correlates Trip Health evidence without delegating validation to it", () => {
  const report = validateFinalPlan({
    plan: plan([stop("a", [0, 0], 1), stop("b", [1, 0], 1)], { totalNights: 4 }),
    tripHealthFindings: [{
      id: "health-night-total",
      rule: "night-total",
      message: "Saved plan days do not reconcile.",
      issueCode: "total-nights-mismatch",
    }],
  });
  const mismatch = report.issues.find((item) => item.code === "total-nights-mismatch");

  assert.deepEqual(mismatch?.relatedTripHealthFindingIds, ["health-night-total"]);
  assert.equal(mismatch?.sources.includes("trip-health"), true);
  assert.equal(report.consumedContext.tripHealthFindingCount, 1);
});

test("consumes StructuredTripBrief as the canonical hard-constraint source", () => {
  const brief = mergeStructuredTripBrief(
    extractStructuredTripBrief("4 nights. Start in Start, Anchor is a must-visit, and end in End."),
    {
      destinations: [
        { id: "start", name: "Start", role: "arrival-gateway", priority: "required" },
        { id: "anchor", name: "Anchor", role: "trip-anchor", priority: "required" },
        { id: "end", name: "End", role: "departure-gateway", priority: "required" },
      ],
      mustVisit: ["Anchor"],
    },
  );
  const result = repairFinalPlan({
    structuredBrief: brief,
    plan: plan([
      stop("anchor", [1, 0], 2),
      stop("start", [0, 0], 1),
      stop("end", [2, 0], 1),
    ]),
  });

  assert.deepEqual(result.plan.stops.map((item) => item.id), ["start", "anchor", "end"]);
  assert.equal(result.plan.totalNights, 4);
  assert.equal(result.finalValidation.consumedContext.structuredTripBrief, true);
  assert.equal(result.plan.constraints?.requiredStopIds?.includes("anchor"), true);
  assert.equal(result.repairs[0]?.constraintsPreserved.some((item) => item.includes("fixed start gateway")), true);
});

test("maximum transfer time remains a hard unresolved validator issue", () => {
  const threeHours: PlanLegEstimator = (from, to) => ({
    mode: "train",
    distanceKm: 200,
    durationMinutes: 180,
    label: `${from.name} → ${to.name}`,
    note: "Deterministic maximum-transfer test.",
    confidence: "high",
  });
  const result = repairFinalPlan({
    plan: plan([stop("a", [0, 0], 2), stop("b", [1, 0], 2)], {
      constraints: { maximumTransferMinutes: 120 },
    }),
    estimateLeg: threeHours,
  });

  assert.equal(result.finalValidation.issues.some((issue) => issue.code === "maximum-transfer-time-conflict" && issue.hardConstraint), true);
  assert.equal(result.state, "unresolved");
  assert.equal(result.repairs.length, 0);
});
