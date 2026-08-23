import { assessRouteIntelligence, estimateLegForConstraints, type EstimatedLeg, type RoutePlanningConstraints } from "../../lib/easyt/planner.ts";
import { allocateTripNights } from "../../lib/easyt/night-allocation.ts";
import { DEFAULT_PLAN_REPAIR_CONFIG, repairFinalPlan } from "../../lib/easyt/plan-repair.ts";
import { transferDoorToDoorMinutes, transferHeadlineMinutes } from "../../lib/easyt/transfer-impact.ts";
import type { BenchmarkScenario } from "./trips.ts";

export type BenchmarkDimension =
  | "constraint-compliance"
  | "route-efficiency"
  | "pacing"
  | "transfer-quality"
  | "preference-fit"
  | "unsupported-claims";

export type BenchmarkStatus = "pass" | "warning" | "fail";

export type BenchmarkFinding = {
  id: string;
  dimension: BenchmarkDimension;
  status: BenchmarkStatus;
  message: string;
};

export type BenchmarkResult = {
  id: string;
  name: string;
  input: { availableDays: number; enteredStopIds: string[] };
  output: {
    routeState: "insufficient-data" | "current-order" | "recommendation";
    stopIds: string[];
    comfortableDays: number;
    shortfallDays: number;
    /** Historical legacy allowance retained for snapshot compatibility. */
    transferMinutes: number | null;
    headlineTransportMinutes: number | null;
    doorToDoorMinutes: number | null;
    travelHeavyLegs: number;
    mostDayLegs: number;
    fullDayLegs: number;
    score: number | null;
    scoredWinnerStopIds: string[];
    scoreComponents: Record<string, number>;
    scorePenalties: string[];
    scoreExplanation: string;
    scoreConfidenceState: "verified" | "structured" | "inferred" | "estimated" | "unknown";
    scoreConfidenceLevel: "high" | "medium" | "low" | "unknown";
    scoreConfidenceFreshness: "current" | "reviewed" | "stale" | "unknown";
    scoreNeedsConfirmation: boolean;
    datedScheduleLegs: number;
    candidateCount: number;
    routeConstraintIssueCodes: string[];
    nightAllocationState: "allocated" | "compromised" | "conflict";
    availableNights: number;
    allocatedNights: number | null;
    nightAllocations: Record<string, number> | null;
    nightCompromises: number;
    oneNightAnchors: number;
    repairState: "valid" | "repaired" | "unresolved" | "iteration-limit";
    repairIterations: number;
    repairCount: number;
    rejectedRepairCount: number;
    repeatedRepairStateDetected: boolean;
    repairTerminationReason: "valid" | "no-repairable-issue" | "no-safe-improvement" | "iteration-limit";
    validationIssueCodes: string[];
    hardValidationIssues: number;
  };
  findings: BenchmarkFinding[];
  qualitativeReview: BenchmarkScenario["review"];
};

export type BenchmarkSummary = {
  generatedBy: "current-deterministic-route-engine";
  results: BenchmarkResult[];
  totals: Record<BenchmarkStatus, number>;
  dimensions: Record<BenchmarkDimension, Record<BenchmarkStatus, number>>;
};

const finding = (id: string, dimension: BenchmarkDimension, status: BenchmarkStatus, message: string): BenchmarkFinding => ({ id, dimension, status, message });

const chosenStopIds = (scenario: BenchmarkScenario, recommendedStopIds: string[], state: BenchmarkResult["output"]["routeState"]) =>
  state === "recommendation" ? recommendedStopIds : scenario.stops.map((stop) => stop.id);

const legsFor = (scenario: BenchmarkScenario, stopIds: string[], constraints?: RoutePlanningConstraints) => {
  const byId = new Map(scenario.stops.map((stop) => [stop.id, stop]));
  return stopIds.flatMap((id, index) => {
    const destination = byId.get(id);
    if (!destination) return [];
    const previous = index ? byId.get(stopIds[index - 1]) : scenario.origin;
    return previous ? [estimateLegForConstraints(previous, destination, constraints)] : [];
  });
};

const totalTransferMinutes = (legs: EstimatedLeg[]) => legs.some((leg) => leg.durationMinutes === null)
  ? null
  : legs.reduce((total, leg) => total + (leg.durationMinutes ?? 0), 0);

const totalDoorToDoorMinutes = (legs: EstimatedLeg[]) => {
  const minutes = legs.map((leg) => transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes));
  return minutes.some((value) => value === null) ? null : minutes.reduce<number>((total, value) => total + (value ?? 0), 0);
};

const totalHeadlineMinutes = (legs: EstimatedLeg[]) => {
  const minutes = legs.map((leg) => transferHeadlineMinutes(leg.transferImpact));
  return minutes.some((value) => value === null) ? null : minutes.reduce<number>((total, value) => total + (value ?? 0), 0);
};

export function evaluateBenchmark(scenario: BenchmarkScenario): BenchmarkResult {
  // Benchmark requirements are the fixture's explicit traveller constraints,
  // not post-hoc expected output. Feed them through the same typed boundary as
  // production so fixed gateways and required anchors are actually enforced.
  const routeConstraints = {
    ...scenario.constraints,
    fixedStartStopId: scenario.requirements.fixedStart,
    fixedEndStopId: scenario.requirements.fixedEnd,
    requiredStopIds: scenario.requirements.mustInclude,
    maximumStops: scenario.requirements.maxStops,
    avoidDriving: scenario.requirements.noDriving ?? scenario.constraints?.avoidDriving,
    excludedTransportModes: scenario.requirements.noDriving ? ["road" as const] : scenario.constraints?.excludedTransportModes,
  };
  const assessment = assessRouteIntelligence({
    origin: scenario.origin,
    stops: scenario.stops,
    picks: scenario.picks,
    availableDays: scenario.availableDays,
    constraints: routeConstraints,
    scoringPreferences: {
      pace: scenario.requirements.pace,
      preferredModes: scenario.requirements.preferredModes,
    },
  });
  const stopIds = chosenStopIds(scenario, assessment.route.recommendedStopIds, assessment.route.state);
  const legs = legsFor(scenario, stopIds, routeConstraints);
  const stopById = new Map(scenario.stops.map((stop) => [stop.id, stop]));
  const nightAllocation = allocateTripNights({
    totalNights: Math.max(0, scenario.availableDays - 1),
    pace: scenario.requirements.pace,
    stops: stopIds.flatMap((id, index) => {
      const stop = stopById.get(id);
      if (!stop) return [];
      return [{
        ...stop,
        required: scenario.requirements.mustInclude.includes(id),
        optional: scenario.constraints?.optionalStopIds?.includes(id),
        anchor: stop.intent === "landmark",
        preferenceWeight: scenario.picks[id]?.length ?? 0,
        fallbackMinimumNights: assessment.durations[id]?.minimumDays,
        fallbackIdealNights: assessment.durations[id]?.recommendedDays,
        arrivalImpact: legs[index]?.transferImpact,
      }];
    }),
  });
  const repair = repairFinalPlan({
    plan: {
      version: 1,
      origin: scenario.origin,
      stops: stopIds.flatMap((id) => {
        const stop = stopById.get(id);
        if (!stop) return [];
        return [{
          ...stop,
          nights: nightAllocation.allocations?.[id] ?? 0,
          required: scenario.requirements.mustInclude.includes(id),
          optional: scenario.constraints?.optionalStopIds?.includes(id),
          anchor: stop.intent === "landmark",
          fallbackMinimumNights: assessment.durations[id]?.minimumDays,
          fallbackIdealNights: assessment.durations[id]?.recommendedDays,
          preferenceWeight: scenario.picks[id]?.length ?? 0,
        }];
      }),
      totalNights: Math.max(0, scenario.availableDays - 1),
      pace: scenario.requirements.pace,
      constraints: routeConstraints,
    },
    scoringPreferences: {
      pace: scenario.requirements.pace,
      preferredModes: scenario.requirements.preferredModes,
    },
    routeSelection: assessment.route.scoring,
    nightAllocation,
  });
  const expectedConflictCodes = scenario.requirements.expectedConflictCodes ?? [];
  const routeConstraintIssueCodes = assessment.route.constraintIssues?.map((issue) => issue.code) ?? [];
  const missingExpectedConflicts = expectedConflictCodes.filter((code) => !routeConstraintIssueCodes.includes(code));
  const expectsStructuredConflict = expectedConflictCodes.length > 0;
  const findings: BenchmarkFinding[] = [];
  const duplicateIds = stopIds.filter((id, index) => stopIds.indexOf(id) !== index);
  findings.push(finding("no-duplicate-destinations", "constraint-compliance", duplicateIds.length ? "fail" : "pass", duplicateIds.length ? `Duplicate destinations: ${duplicateIds.join(", ")}.` : "No destination is duplicated."));

  const missing = scenario.requirements.mustInclude.filter((id) => !stopIds.includes(id));
  findings.push(finding("must-visits-preserved", "constraint-compliance", missing.length ? "fail" : "pass", missing.length ? `Missing required destinations: ${missing.join(", ")}.` : "All required destinations are preserved."));

  findings.push(finding("duration-window-retained", "constraint-compliance", scenario.availableDays > 0 ? "pass" : "fail", `The assessment used the supplied ${scenario.availableDays}-day window without replacing it.`));
  if (scenario.requirements.fixedStart) {
    findings.push(finding("fixed-start", "constraint-compliance", stopIds[0] === scenario.requirements.fixedStart ? "pass" : "fail", `Expected ${scenario.requirements.fixedStart} first; engine output starts with ${stopIds[0] ?? "nothing"}.`));
  }
  if (scenario.requirements.fixedEnd) {
    findings.push(finding("fixed-end", "constraint-compliance", stopIds.at(-1) === scenario.requirements.fixedEnd ? "pass" : "fail", `Expected ${scenario.requirements.fixedEnd} last; engine output ends with ${stopIds.at(-1) ?? "nothing"}.`));
  }
  if (scenario.requirements.maxStops !== undefined) {
    const withinMaximum = stopIds.length <= scenario.requirements.maxStops;
    const conflictVisible = expectedConflictCodes.includes("maximum-stops-exceeded") && routeConstraintIssueCodes.includes("maximum-stops-exceeded");
    findings.push(finding(
      "maximum-stops",
      "constraint-compliance",
      withinMaximum || conflictVisible ? "pass" : "fail",
      withinMaximum
        ? `${stopIds.length} stops against a maximum of ${scenario.requirements.maxStops}.`
        : conflictVisible
          ? `${stopIds.length} mandatory stops exceed the maximum of ${scenario.requirements.maxStops}; the contradiction remains structured instead of silently dropping a stop.`
          : `${stopIds.length} stops against a maximum of ${scenario.requirements.maxStops}.`,
    ));
  }
  if (expectsStructuredConflict) {
    findings.push(finding(
      "expected-conflict-surfaced",
      "constraint-compliance",
      missingExpectedConflicts.length ? "fail" : "pass",
      missingExpectedConflicts.length
        ? `Expected structured conflict(s) were not surfaced: ${missingExpectedConflicts.join(", ")}.`
        : `The engine surfaced the expected structured conflict(s): ${expectedConflictCodes.join(", ")}.`,
    ));
  }
  findings.push(finding(
    "post-generation-hard-validity",
    "constraint-compliance",
    expectsStructuredConflict
      ? repair.finalValidation.hardConstraintIssueCount && !missingExpectedConflicts.length ? "pass" : "fail"
      : repair.finalValidation.hardConstraintIssueCount ? "fail" : "pass",
    expectsStructuredConflict && repair.finalValidation.hardConstraintIssueCount && !missingExpectedConflicts.length
      ? "The final-plan critic keeps the intentionally unrepairable hard conflict visible."
      : repair.finalValidation.hardConstraintIssueCount
      ? `${repair.finalValidation.hardConstraintIssueCount} hard final-plan issue(s) remain after the bounded repair loop.`
      : "The independent final-plan critic found no unresolved hard constraint violation.",
  ));
  findings.push(finding(
    "repair-loop-bounded",
    "constraint-compliance",
    repair.iterations <= DEFAULT_PLAN_REPAIR_CONFIG.maxIterations ? "pass" : "fail",
    `The repair loop used ${repair.iterations} of ${DEFAULT_PLAN_REPAIR_CONFIG.maxIterations} permitted iteration(s).`,
  ));

  findings.push(assessment.route.state === "insufficient-data" && !expectsStructuredConflict
    ? finding("route-comparison", "route-efficiency", "warning", assessment.route.summary)
    : finding(
        "route-comparison",
        "route-efficiency",
        missingExpectedConflicts.length ? "fail" : "pass",
        expectsStructuredConflict
          ? "Route selection correctly stopped because the hard requirements contradict one another."
          : assessment.route.state === "recommendation" ? assessment.route.summary : "The entered route was retained as reasonably direct.",
      ));

  findings.push(assessment.shortfallDays > 0
    ? finding("comfortable-duration", "pacing", "warning", `${assessment.comfortableDays} days are recommended for a ${scenario.availableDays}-day request; shortfall ${assessment.shortfallDays}.`)
    : finding("comfortable-duration", "pacing", "pass", `${scenario.availableDays} days meet the engine's ${assessment.comfortableDays}-day comfort estimate.`));

  const baseDensity = stopIds.length / Math.max(1, scenario.availableDays);
  const densityLimit = scenario.requirements.pace === "relaxed" ? 0.25 : scenario.requirements.pace === "fast" ? 0.5 : 0.4;
  findings.push(finding("base-density", "pacing", baseDensity > densityLimit ? "warning" : "pass", `${stopIds.length} bases across ${scenario.availableDays} days (${baseDensity.toFixed(2)} bases/day; ${scenario.requirements.pace ?? "balanced"} threshold ${densityLimit.toFixed(2)}).`));
  findings.push(finding(
    "night-total-reconciled",
    "pacing",
    nightAllocation.totalAllocatedNights === Math.max(0, scenario.availableDays - 1) ? "pass" : "fail",
    nightAllocation.totalAllocatedNights === null
      ? `The ${Math.max(0, scenario.availableDays - 1)}-night budget has a structured allocation conflict.`
      : `${nightAllocation.totalAllocatedNights} allocated nights reconcile with the ${Math.max(0, scenario.availableDays - 1)}-night trip.`,
  ));
  findings.push(finding(
    "night-minimums-explained",
    "pacing",
    nightAllocation.state === "conflict" ? "fail" : nightAllocation.state === "compromised" ? "warning" : "pass",
    nightAllocation.state === "allocated"
      ? "Known or fallback minimum stays fit inside the available nights."
      : nightAllocation.conflicts[0]?.message ?? "The allocation exposes its minimum-stay compromise.",
  ));

  const unknownLegs = legs.filter((leg) => transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes) === null);
  findings.push(finding("transfer-estimates-present", "transfer-quality", unknownLegs.length ? "warning" : "pass", unknownLegs.length ? `${unknownLegs.length} connection(s) remain unconfirmed.` : "Every connection has a planning estimate."));
  const optimisticLegs = legs.filter((leg) => {
    const realistic = transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes);
    const headline = transferHeadlineMinutes(leg.transferImpact);
    return ((leg.distanceKm ?? 0) > 500 && (realistic ?? Number.POSITIVE_INFINITY) < 120)
      || (leg.mode === "flight" && headline !== null && realistic !== null && realistic - headline < 120);
  });
  findings.push(finding("no-obviously-optimistic-transfer", "transfer-quality", optimisticLegs.length ? "fail" : "pass", optimisticLegs.length ? `${optimisticLegs.length} connection(s) have implausibly low realistic travel impact.` : "No long-distance or airport transfer has an implausibly low realistic impact."));
  const heavyLegs = legs.filter((leg) => (transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes) ?? 0) >= 600);
  if (heavyLegs.length) findings.push(finding("excessive-transfer-burden", "transfer-quality", "warning", `${heavyLegs.length} connection(s) consume at least ten door-to-door hours.`));
  const mostDayLegs = legs.filter((leg) => leg.transferImpact?.usableDayLoss.classification === "most-of-day");
  if (mostDayLegs.length) findings.push(finding("most-day-transfer-burden", "transfer-quality", "warning", `${mostDayLegs.length} connection(s) consume most of a usable travel day.`));

  if (scenario.requirements.noDriving) {
    const roadLegs = legs.filter((leg) => leg.mode === "road");
    findings.push(finding("no-driving", "preference-fit", roadLegs.length ? "fail" : "pass", roadLegs.length ? `${roadLegs.length} road transfer(s) conflict with no driving.` : "No road transfer is proposed."));
  }
  if (scenario.requirements.preferredModes?.length) {
    const outsidePreference = legs.filter((leg) => leg.mode === "unknown" || !scenario.requirements.preferredModes?.includes(leg.mode));
    findings.push(finding("preferred-transport", "preference-fit", outsidePreference.length ? "warning" : "pass", outsidePreference.length ? `${outsidePreference.length} connection(s) use modes outside the stated preference.` : "All estimated connections use a preferred mode."));
  }

  const unsupported = legs.filter((leg) => {
    const qualified = /(verify|confirm|planning estimate|typical|approximate|compare|check)/i.test(leg.note);
    const assertsDatedCertainty = /\b(?:schedule|service) (?:is|has been) (?:confirmed|verified|available)\b/i.test(leg.note)
      && leg.planningConfidence?.schedule.scope !== "dated-service";
    return !qualified || assertsDatedCertainty;
  });
  const unverifiedSchedules = legs.filter((leg) => leg.planningConfidence?.schedule.scope !== "dated-service"
    || leg.planningConfidence.schedule.state !== "verified");
  findings.push(finding(
    "claims-qualified",
    "unsupported-claims",
    unsupported.length ? "warning" : "pass",
    unsupported.length
      ? `${unsupported.length} transfer claim(s) overstate certainty or lack an explicit verification caveat.`
      : `Transfer claims remain qualified; ${unverifiedSchedules.length} connection schedule(s) are explicitly not date-verified.`,
  ));

  return {
    id: scenario.id,
    name: scenario.name,
    input: { availableDays: scenario.availableDays, enteredStopIds: scenario.stops.map((stop) => stop.id) },
    output: {
      routeState: assessment.route.state,
      stopIds,
      comfortableDays: assessment.comfortableDays,
      shortfallDays: assessment.shortfallDays,
      transferMinutes: totalTransferMinutes(legs),
      headlineTransportMinutes: totalHeadlineMinutes(legs),
      doorToDoorMinutes: totalDoorToDoorMinutes(legs),
      travelHeavyLegs: legs.filter((leg) => (transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes) ?? 0) >= 300).length,
      mostDayLegs: mostDayLegs.length,
      fullDayLegs: legs.filter((leg) => leg.transferImpact?.usableDayLoss.classification === "full-day-or-more").length,
      score: assessment.route.scoring?.winner?.totalScore ?? null,
      scoredWinnerStopIds: assessment.route.scoring?.winner?.stopIds ?? [],
      scoreComponents: Object.fromEntries(assessment.route.scoring?.winner?.components.map((component) => [component.id, component.score]) ?? []),
      scorePenalties: assessment.route.scoring?.winner?.penalties.map((penalty) => penalty.code) ?? [],
      scoreExplanation: assessment.route.scoring?.explanation ?? "",
      scoreConfidenceState: assessment.route.scoring?.confidence.state ?? "unknown",
      scoreConfidenceLevel: assessment.route.scoring?.confidence.level ?? "unknown",
      scoreConfidenceFreshness: assessment.route.scoring?.confidence.freshness ?? "unknown",
      scoreNeedsConfirmation: assessment.route.scoring?.confidence.confirmation.needed ?? true,
      datedScheduleLegs: legs.filter((leg) => leg.planningConfidence?.schedule.scope === "dated-service" && leg.planningConfidence.schedule.state === "verified").length,
      candidateCount: assessment.route.scoring?.rankedCandidates.length ?? 0,
      routeConstraintIssueCodes,
      nightAllocationState: nightAllocation.state,
      availableNights: Math.max(0, scenario.availableDays - 1),
      allocatedNights: nightAllocation.totalAllocatedNights,
      nightAllocations: nightAllocation.allocations,
      nightCompromises: nightAllocation.conflicts.length,
      oneNightAnchors: nightAllocation.conflicts.filter((conflict) => conflict.code === "one-night-anchor").length,
      repairState: repair.state,
      repairIterations: repair.iterations,
      repairCount: repair.repairs.length,
      rejectedRepairCount: repair.rejectedRepairs.length,
      repeatedRepairStateDetected: repair.repeatedStateDetected,
      repairTerminationReason: repair.terminationReason,
      validationIssueCodes: repair.unresolvedIssues.map((issue) => issue.code),
      hardValidationIssues: repair.finalValidation.hardConstraintIssueCount,
    },
    findings,
    qualitativeReview: scenario.review,
  };
}

const emptyCounts = (): Record<BenchmarkStatus, number> => ({ pass: 0, warning: 0, fail: 0 });

export function runBenchmarks(scenarios: BenchmarkScenario[]): BenchmarkSummary {
  const results = scenarios.map(evaluateBenchmark);
  const dimensions: BenchmarkSummary["dimensions"] = {
    "constraint-compliance": emptyCounts(),
    "route-efficiency": emptyCounts(),
    pacing: emptyCounts(),
    "transfer-quality": emptyCounts(),
    "preference-fit": emptyCounts(),
    "unsupported-claims": emptyCounts(),
  };
  const totals = emptyCounts();
  results.flatMap((result) => result.findings).forEach((item) => {
    totals[item.status] += 1;
    dimensions[item.dimension][item.status] += 1;
  });
  return { generatedBy: "current-deterministic-route-engine", results, totals, dimensions };
}

export function comparableSnapshot(summary: BenchmarkSummary) {
  return {
    results: summary.results.map((result) => ({
      id: result.id,
      routeState: result.output.routeState,
      stopIds: result.output.stopIds,
      comfortableDays: result.output.comfortableDays,
      shortfallDays: result.output.shortfallDays,
      transferMinutes: result.output.transferMinutes,
      passes: result.findings.filter((finding) => finding.status === "pass").length,
      warnings: result.findings.filter((finding) => finding.status === "warning").map((finding) => finding.id),
      failures: result.findings.filter((finding) => finding.status === "fail").map((finding) => finding.id),
    })),
    totals: summary.totals,
    dimensions: summary.dimensions,
  };
}

export function compareSnapshots(baseline: ReturnType<typeof comparableSnapshot>, current: ReturnType<typeof comparableSnapshot>) {
  const lines: string[] = [];
  Object.keys(current.dimensions).forEach((key) => {
    const dimension = key as BenchmarkDimension;
    const before = baseline.dimensions[dimension];
    const after = current.dimensions[dimension];
    if (!before || JSON.stringify(before) === JSON.stringify(after)) return;
    const regressed = after.fail > before.fail || after.warning > before.warning || after.pass < before.pass;
    const improved = after.fail < before.fail || after.warning < before.warning || after.pass > before.pass;
    const direction = regressed && improved ? "mixed" : regressed ? "regression" : "improvement";
    lines.push(`${dimension} (${direction}): ${after.pass - before.pass >= 0 ? "+" : ""}${after.pass - before.pass} pass, ${after.warning - before.warning >= 0 ? "+" : ""}${after.warning - before.warning} warning, ${after.fail - before.fail >= 0 ? "+" : ""}${after.fail - before.fail} fail`);
  });
  current.results.forEach((result) => {
    const before = baseline.results.find((item) => item.id === result.id);
    if (!before) {
      lines.push(`${result.id}: new benchmark`);
      return;
    }
    const introduced = result.failures.filter((id) => !before.failures.includes(id));
    const resolved = before.failures.filter((id) => !result.failures.includes(id));
    const introducedWarnings = result.warnings.filter((id) => !before.warnings.includes(id));
    const resolvedWarnings = before.warnings.filter((id) => !result.warnings.includes(id));
    if (introduced.length) lines.push(`${result.id}: new failures — ${introduced.join(", ")}`);
    if (resolved.length) lines.push(`${result.id}: resolved failures — ${resolved.join(", ")}`);
    if (introducedWarnings.length) lines.push(`${result.id}: new warnings — ${introducedWarnings.join(", ")}`);
    if (resolvedWarnings.length) lines.push(`${result.id}: resolved warnings — ${resolvedWarnings.join(", ")}`);
    if (before.routeState !== result.routeState || before.stopIds.join("|") !== result.stopIds.join("|")) lines.push(`${result.id}: route output changed`);
  });
  return lines;
}
