import { allocateTripNights, type NightAllocationResult } from "../../lib/easyt/night-allocation.ts";
import { assessPlanRealism, type PlanRealismClassification } from "../../lib/easyt/plan-realism.ts";
import { validateFinalPlan } from "../../lib/easyt/plan-validator.ts";
import {
  assessRouteIntelligence,
  estimateLegForConstraints,
  type EstimatedLeg,
  type PlannerStop,
} from "../../lib/easyt/planner.ts";
import { generateRouteCandidates, type RouteCandidateGeneration } from "../../lib/easyt/route-candidates.ts";
import type { RouteCandidateScore, RouteScoreComponent, RouteScorePenalty } from "../../lib/easyt/route-scoring.ts";
import { transferDoorToDoorMinutes } from "../../lib/easyt/transfer-impact.ts";
import {
  ROUTE_QUALITY_CALIBRATION_FIXTURES,
  type RouteQualityCalibrationFixture,
} from "./fixtures.ts";
import {
  classifyNightAllocation,
  nightAllocationExpectationFor,
} from "./night-expectations.ts";

export type HumanRouteQuality = "GOOD" | "ACCEPTABLE BUT SUBOPTIMAL" | "CLEARLY POOR";

export type CalibrationCandidate = {
  order: string[];
  source: string;
  matchesOriginalOrder: boolean;
  state: RouteCandidateScore["state"];
  rank: number | null;
  baseScore: number | null;
  totalScore: number | null;
  components: RouteScoreComponent[];
  penalties: RouteScorePenalty[];
  metrics: RouteCandidateScore["metrics"];
  unknownEvidence: {
    unconfirmedLegs: number;
    lowConfidenceLegs: number;
  };
};

export type CalibrationLeg = {
  from: string;
  to: string;
  mode: EstimatedLeg["mode"];
  distanceKm: number | null;
  doorToDoorMinutes: number | null;
  confidence: EstimatedLeg["confidence"];
  planningConfidence: string;
  evidenceGap: string | null;
};

export type RouteQualityCalibrationResult = {
  id: string;
  name: string;
  geography: RouteQualityCalibrationFixture["geography"];
  specialCases: string[];
  originalOrder: string[];
  candidateGeneration: Pick<RouteCandidateGeneration, "strategy" | "rawCandidateCount" | "rejectedCandidateCount" | "truncated">;
  candidates: CalibrationCandidate[];
  scoringWinner: string[] | null;
  runnerUps: string[][];
  selectedOrder: string[];
  routeState: "insufficient-data" | "current-order" | "recommendation";
  selectionExplanation: string;
  winnerExplanation: string;
  selectedScore: number | null;
  selectedTransferMinutes: number | null;
  selectedLegs: CalibrationLeg[];
  nightAllocation: NightAllocationResult;
  previousNightAllocations: Record<string, number>;
  previousNightAllocationQuality: HumanRouteQuality;
  nightAllocationQuality: HumanRouteQuality;
  nightAllocationQualityReasons: string[];
  realismClassification: PlanRealismClassification;
  validatorIssues: string[];
  hardConstraintIssues: number;
  quality: HumanRouteQuality;
  qualityReasons: string[];
  orderChanged: boolean;
  deliberatelyUnchanged: boolean;
  humanReview: RouteQualityCalibrationFixture["humanReview"];
};

const orderKey = (ids: readonly string[]) => ids.join("|");
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

function selectedStops(fixture: RouteQualityCalibrationFixture, selectedIds: readonly string[]) {
  const byId = new Map(fixture.stops.map((stop) => [stop.id, stop]));
  return selectedIds.map((id) => byId.get(id)).filter((stop): stop is PlannerStop => Boolean(stop));
}

function legsFor(fixture: RouteQualityCalibrationFixture, stops: readonly PlannerStop[]): CalibrationLeg[] {
  const origin = { name: fixture.origin.name, coordinates: fixture.origin.coordinates };
  return stops.map((stop, index) => {
    const previous = index ? stops[index - 1] : origin;
    const leg = estimateLegForConstraints(previous, stop, fixture.constraints);
    const planningConfidence = leg.planningConfidence?.overall.level ?? "unknown";
    const doorToDoorMinutes = transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes);
    return {
      from: index ? stops[index - 1]!.id : "origin",
      to: stop.id,
      mode: leg.mode,
      distanceKm: leg.distanceKm,
      doorToDoorMinutes,
      confidence: leg.confidence,
      planningConfidence,
      evidenceGap: doorToDoorMinutes === null || leg.confidence === "unconfirmed"
        ? leg.note
        : planningConfidence === "low" || planningConfidence === "unknown"
          ? leg.planningConfidence?.overall.reason ?? "Connection evidence remains weak."
          : null,
    };
  });
}

function transferImpactsFor(fixture: RouteQualityCalibrationFixture, stops: readonly PlannerStop[]) {
  const origin = { name: fixture.origin.name, coordinates: fixture.origin.coordinates };
  return stops.map((stop, index) => estimateLegForConstraints(index ? stops[index - 1]! : origin, stop, fixture.constraints).transferImpact);
}

function allocationFor(fixture: RouteQualityCalibrationFixture, stops: readonly PlannerStop[]) {
  const impacts = transferImpactsFor(fixture, stops);
  const requiredIds = new Set(fixture.constraints.requiredStopIds ?? stops.map((stop) => stop.id));
  return allocateTripNights({
    totalNights: fixture.days - 1,
    pace: fixture.pace,
    fixedCommitments: fixture.constraints.fixedCommitments,
    stops: stops.map((stop, index) => ({
      ...stop,
      required: requiredIds.has(stop.id),
      optional: fixture.constraints.optionalStopIds?.includes(stop.id),
      arrivalImpact: impacts[index],
      departureImpact: impacts[index + 1],
    })),
  });
}

function scoreForOrder(candidates: readonly RouteCandidateScore[], ids: readonly string[]) {
  const key = orderKey(ids);
  return candidates.find((candidate) => orderKey(candidate.stopIds) === key);
}

function candidateReport(generation: RouteCandidateGeneration, scores: readonly RouteCandidateScore[]): CalibrationCandidate[] {
  return generation.candidates.map((candidate) => {
    const score = scores.find((item) => item.candidateIndex === candidate.metadata.candidateIndex);
    if (!score) throw new Error(`Missing score for candidate ${candidate.metadata.candidateIndex}.`);
    return {
      order: candidate.stops.map((stop) => stop.id),
      source: candidate.source,
      matchesOriginalOrder: candidate.metadata.matchesOriginalOrder,
      state: score.state,
      rank: score.rank,
      baseScore: score.baseScore,
      totalScore: score.totalScore,
      components: score.components,
      penalties: score.penalties,
      metrics: score.metrics,
      unknownEvidence: {
        unconfirmedLegs: score.metrics.unconfirmedLegs,
        lowConfidenceLegs: score.metrics.lowConfidenceLegs,
      },
    };
  });
}

function qualityFor(input: {
  fixture: RouteQualityCalibrationFixture;
  selectedIds: string[];
  nightAllocation: NightAllocationResult;
  realism: PlanRealismClassification;
  hardConstraintIssues: number;
}) {
  const reasons: string[] = [];
  const selectedKey = orderKey(input.selectedIds);
  const originalKey = orderKey(input.fixture.stops.map((stop) => stop.id));
  const good = input.fixture.humanReview.goodOrders.some((order) => orderKey(order) === selectedKey);
  const acceptable = good || input.fixture.humanReview.acceptableOrders.some((order) => orderKey(order) === selectedKey);
  const orderChanged = selectedKey !== originalKey;
  if (good) reasons.push("The selected order matches a strong human-planner route.");
  else if (acceptable) reasons.push("The selected order is defensible, but not the strongest calibration order.");
  else reasons.push("The selected order retains a material flow issue or falls outside the documented defensible alternatives.");

  if (input.hardConstraintIssues) reasons.push(`${input.hardConstraintIssues} hard constraint issue${input.hardConstraintIssues === 1 ? " remains" : "s remain"}.`);
  if (input.fixture.orderIntent === "fixed-entered" && orderChanged) reasons.push("The explicitly protected entered order changed.");
  if (input.fixture.orderIntent === "prefer-entered" && orderChanged && !good) reasons.push("A defensible entered route changed without producing the strongest documented order.");

  const allocations = input.nightAllocation.allocations ?? {};
  const allocated = Object.values(allocations);
  const avoidableOneNightChurn = input.fixture.days - 1 >= input.selectedIds.length * 2
    && allocated.some((nights) => nights === 1);
  if (avoidableOneNightChurn) reasons.push("The trip has enough nights to avoid a one-night stay, but one remains.");
  if (input.fixture.specialCases.includes("unequal-nights") && new Set(allocated).size <= 1) {
    reasons.push("The compressed trip gives every stop the same stay despite evidenced anchor differences.");
  }
  if (input.nightAllocation.state === "compromised") reasons.push("Night allocation reports a visible compromise.");
  if (input.realism !== "reasonable") reasons.push(`Existing realism classification is ${input.realism}.`);

  const hardPoor = input.hardConstraintIssues > 0
    || (input.fixture.orderIntent === "fixed-entered" && orderChanged)
    || input.realism === "impossible"
    || input.realism === "unreasonable";
  const quality: HumanRouteQuality = hardPoor || !acceptable
    ? "CLEARLY POOR"
    : !good
      || avoidableOneNightChurn
      || input.nightAllocation.state === "compromised"
      || input.realism === "exhausting but feasible"
      || input.realism === "unknown due to insufficient transport evidence"
      || (input.fixture.orderIntent === "prefer-entered" && orderChanged)
      ? "ACCEPTABLE BUT SUBOPTIMAL"
      : "GOOD";
  return { quality, reasons, orderChanged };
}

export function evaluateRouteQualityCalibrationFixture(fixture: RouteQualityCalibrationFixture): RouteQualityCalibrationResult {
  const origin = { name: fixture.origin.name, coordinates: fixture.origin.coordinates };
  const generation = generateRouteCandidates({ origin, stops: fixture.stops, constraints: fixture.constraints, estimateLeg: (from, to) => estimateLegForConstraints(from, to, fixture.constraints) });
  const assessment = assessRouteIntelligence({
    origin,
    stops: fixture.stops,
    picks: {},
    availableDays: fixture.days,
    constraints: fixture.constraints,
    scoringPreferences: {
      pace: fixture.pace,
      preferredModes: fixture.constraints.transportModes?.map((mode) => mode === "drive" ? "road" as const : mode),
    },
  });
  const scores = assessment.route.scoring?.rankedCandidates ?? [];
  const originalOrder = fixture.stops.map((stop) => stop.id);
  const selectedOrder = assessment.route.state === "recommendation" ? assessment.route.recommendedStopIds : originalOrder;
  const selected = selectedStops(fixture, selectedOrder);
  const selectedLegs = legsFor(fixture, selected);
  const nightAllocation = allocationFor(fixture, selected);
  const allocations = nightAllocation.allocations ?? Object.fromEntries(selected.map((stop) => [stop.id, 0]));
  const nightExpectation = nightAllocationExpectationFor(fixture.id);
  if (!nightExpectation) throw new Error(`Missing human night-allocation expectation for ${fixture.id}.`);
  const previousNightQuality = classifyNightAllocation(nightExpectation, nightExpectation.previousAllocations);
  const nightQuality = classifyNightAllocation(nightExpectation, allocations);
  const validation = validateFinalPlan({
    plan: {
      version: 1,
      origin,
      stops: selected.map((stop) => ({
        ...stop,
        nights: allocations[stop.id] ?? 0,
        required: fixture.constraints.requiredStopIds?.includes(stop.id) ?? true,
      })),
      totalNights: fixture.days - 1,
      pace: fixture.pace,
      constraints: fixture.constraints,
    },
    nightAllocation,
  });
  const realism = assessPlanRealism({
    validation,
    nightAllocation,
    transferImpacts: transferImpactsFor(fixture, selected),
    routeOrderFixed: fixture.orderIntent === "fixed-entered",
    retainedStopIds: selectedOrder,
    retainedStopNights: selectedOrder.map((id) => allocations[id] ?? 0),
  });
  const quality = qualityFor({
    fixture,
    selectedIds: selectedOrder,
    nightAllocation,
    realism: realism.classification,
    hardConstraintIssues: validation.hardConstraintIssueCount,
  });
  const ranked = scores.filter((candidate) => candidate.state === "scored").sort((left, right) => (left.rank ?? 999) - (right.rank ?? 999));
  const selectedScore = scoreForOrder(scores, selectedOrder);
  const deliberatelyUnchanged = !quality.orderChanged && Boolean(fixture.humanReview.intentionalUnchangedReason);
  return {
    id: fixture.id,
    name: fixture.name,
    geography: fixture.geography,
    specialCases: fixture.specialCases,
    originalOrder,
    candidateGeneration: {
      strategy: generation.strategy,
      rawCandidateCount: generation.rawCandidateCount,
      rejectedCandidateCount: generation.rejectedCandidateCount,
      truncated: generation.truncated,
    },
    candidates: candidateReport(generation, scores),
    scoringWinner: assessment.route.scoring?.winner?.stopIds ?? null,
    runnerUps: ranked.slice(1, 4).map((candidate) => candidate.stopIds),
    selectedOrder,
    routeState: assessment.route.state,
    selectionExplanation: assessment.route.summary,
    winnerExplanation: assessment.route.scoring?.explanation ?? assessment.route.summary,
    selectedScore: selectedScore?.totalScore ?? null,
    selectedTransferMinutes: selectedScore?.metrics.transferMinutes
      ?? (selectedLegs.every((leg) => leg.doorToDoorMinutes !== null)
        ? sum(selectedLegs.map((leg) => leg.doorToDoorMinutes!))
        : null),
    selectedLegs,
    nightAllocation,
    previousNightAllocations: nightExpectation.previousAllocations,
    previousNightAllocationQuality: previousNightQuality.quality,
    nightAllocationQuality: nightQuality.quality,
    nightAllocationQualityReasons: nightQuality.reasons,
    realismClassification: realism.classification,
    validatorIssues: validation.issues.map((issue) => issue.code),
    hardConstraintIssues: validation.hardConstraintIssueCount,
    quality: quality.quality,
    qualityReasons: quality.reasons,
    orderChanged: quality.orderChanged,
    deliberatelyUnchanged,
    humanReview: fixture.humanReview,
  };
}

export function runRouteQualityCalibration() {
  const results = ROUTE_QUALITY_CALIBRATION_FIXTURES.map(evaluateRouteQualityCalibrationFixture);
  const burdens = results.map((result) => result.selectedTransferMinutes).filter((minutes): minutes is number => minutes !== null).sort((a, b) => a - b);
  const distribution = {
    GOOD: results.filter((result) => result.quality === "GOOD").length,
    "ACCEPTABLE BUT SUBOPTIMAL": results.filter((result) => result.quality === "ACCEPTABLE BUT SUBOPTIMAL").length,
    "CLEARLY POOR": results.filter((result) => result.quality === "CLEARLY POOR").length,
  };
  const previousNightAllocationDistribution = {
    GOOD: results.filter((result) => result.previousNightAllocationQuality === "GOOD").length,
    "ACCEPTABLE BUT SUBOPTIMAL": results.filter((result) => result.previousNightAllocationQuality === "ACCEPTABLE BUT SUBOPTIMAL").length,
    "CLEARLY POOR": results.filter((result) => result.previousNightAllocationQuality === "CLEARLY POOR").length,
  };
  const nightAllocationDistribution = {
    GOOD: results.filter((result) => result.nightAllocationQuality === "GOOD").length,
    "ACCEPTABLE BUT SUBOPTIMAL": results.filter((result) => result.nightAllocationQuality === "ACCEPTABLE BUT SUBOPTIMAL").length,
    "CLEARLY POOR": results.filter((result) => result.nightAllocationQuality === "CLEARLY POOR").length,
  };
  return {
    version: "route-quality-calibration-v1" as const,
    fixtureCount: results.length,
    distribution,
    previousNightAllocationDistribution,
    nightAllocationDistribution,
    hardFailureCount: results.filter((result) => result.hardConstraintIssues > 0).length,
    routeOrdersChanged: results.filter((result) => result.orderChanged).length,
    routeOrdersDeliberatelyUnchanged: results.filter((result) => result.deliberatelyUnchanged).length,
    averageTransferMinutes: burdens.length ? Math.round(sum(burdens) / burdens.length) : null,
    medianTransferMinutes: burdens.length ? burdens[Math.floor(burdens.length / 2)]! : null,
    results,
  };
}

export function comparableRouteQualityCalibration(summary: ReturnType<typeof runRouteQualityCalibration>) {
  return {
    distribution: summary.distribution,
    hardFailureCount: summary.hardFailureCount,
    routeOrdersChanged: summary.routeOrdersChanged,
    routeOrdersDeliberatelyUnchanged: summary.routeOrdersDeliberatelyUnchanged,
    averageTransferMinutes: summary.averageTransferMinutes,
    medianTransferMinutes: summary.medianTransferMinutes,
    results: summary.results.map((result) => ({
      id: result.id,
      selectedOrder: result.selectedOrder,
      routeState: result.routeState,
      selectedScore: result.selectedScore,
      selectedTransferMinutes: result.selectedTransferMinutes,
      allocations: result.nightAllocation.allocations,
      previousNightAllocations: result.previousNightAllocations,
      previousNightAllocationQuality: result.previousNightAllocationQuality,
      nightAllocationQuality: result.nightAllocationQuality,
      realismClassification: result.realismClassification,
      validatorIssues: result.validatorIssues,
      quality: result.quality,
      orderChanged: result.orderChanged,
      candidateCount: result.candidates.length,
    })),
  };
}
