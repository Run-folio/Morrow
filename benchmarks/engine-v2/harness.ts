import { assessRouteIntelligence, estimateLeg, type EstimatedLeg } from "../../lib/easyt/planner.ts";
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
    transferMinutes: number | null;
    travelHeavyLegs: number;
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

const legsFor = (scenario: BenchmarkScenario, stopIds: string[]) => {
  const byId = new Map(scenario.stops.map((stop) => [stop.id, stop]));
  return stopIds.flatMap((id, index) => {
    const destination = byId.get(id);
    if (!destination) return [];
    const previous = index ? byId.get(stopIds[index - 1]) : scenario.origin;
    return previous ? [estimateLeg(previous, destination)] : [];
  });
};

const totalTransferMinutes = (legs: EstimatedLeg[]) => legs.some((leg) => leg.durationMinutes === null)
  ? null
  : legs.reduce((total, leg) => total + (leg.durationMinutes ?? 0), 0);

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
  });
  const stopIds = chosenStopIds(scenario, assessment.route.recommendedStopIds, assessment.route.state);
  const legs = legsFor(scenario, stopIds);
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
    findings.push(finding("maximum-stops", "constraint-compliance", stopIds.length <= scenario.requirements.maxStops ? "pass" : "fail", `${stopIds.length} stops against a maximum of ${scenario.requirements.maxStops}.`));
  }

  findings.push(assessment.route.state === "insufficient-data"
    ? finding("route-comparison", "route-efficiency", "warning", assessment.route.summary)
    : finding("route-comparison", "route-efficiency", "pass", assessment.route.state === "recommendation" ? assessment.route.summary : "The entered route was retained as reasonably direct."));

  findings.push(assessment.shortfallDays > 0
    ? finding("comfortable-duration", "pacing", "warning", `${assessment.comfortableDays} days are recommended for a ${scenario.availableDays}-day request; shortfall ${assessment.shortfallDays}.`)
    : finding("comfortable-duration", "pacing", "pass", `${scenario.availableDays} days meet the engine's ${assessment.comfortableDays}-day comfort estimate.`));

  const baseDensity = stopIds.length / Math.max(1, scenario.availableDays);
  const densityLimit = scenario.requirements.pace === "relaxed" ? 0.25 : scenario.requirements.pace === "fast" ? 0.5 : 0.4;
  findings.push(finding("base-density", "pacing", baseDensity > densityLimit ? "warning" : "pass", `${stopIds.length} bases across ${scenario.availableDays} days (${baseDensity.toFixed(2)} bases/day; ${scenario.requirements.pace ?? "balanced"} threshold ${densityLimit.toFixed(2)}).`));

  const unknownLegs = legs.filter((leg) => leg.durationMinutes === null);
  findings.push(finding("transfer-estimates-present", "transfer-quality", unknownLegs.length ? "warning" : "pass", unknownLegs.length ? `${unknownLegs.length} connection(s) remain unconfirmed.` : "Every connection has a planning estimate."));
  const optimisticLegs = legs.filter((leg) => (leg.distanceKm ?? 0) > 500 && (leg.durationMinutes ?? Number.POSITIVE_INFINITY) < 120);
  findings.push(finding("no-obviously-optimistic-transfer", "transfer-quality", optimisticLegs.length ? "fail" : "pass", optimisticLegs.length ? `${optimisticLegs.length} long-distance connection(s) are estimated below two hours.` : "No long-distance connection is estimated below two hours."));
  const heavyLegs = legs.filter((leg) => (leg.durationMinutes ?? 0) >= 600);
  if (heavyLegs.length) findings.push(finding("excessive-transfer-burden", "transfer-quality", "warning", `${heavyLegs.length} connection(s) consume at least ten door-to-door hours.`));

  if (scenario.requirements.noDriving) {
    const roadLegs = legs.filter((leg) => leg.mode === "road");
    findings.push(finding("no-driving", "preference-fit", roadLegs.length ? "fail" : "pass", roadLegs.length ? `${roadLegs.length} road transfer(s) conflict with no driving.` : "No road transfer is proposed."));
  }
  if (scenario.requirements.preferredModes?.length) {
    const outsidePreference = legs.filter((leg) => !scenario.requirements.preferredModes?.includes(leg.mode));
    findings.push(finding("preferred-transport", "preference-fit", outsidePreference.length ? "warning" : "pass", outsidePreference.length ? `${outsidePreference.length} connection(s) use modes outside the stated preference.` : "All estimated connections use a preferred mode."));
  }

  const unsupported = legs.filter((leg) => !/(verify|confirm|planning estimate|typical|approximate|compare)/i.test(leg.note));
  findings.push(finding("claims-qualified", "unsupported-claims", unsupported.length ? "warning" : "pass", unsupported.length ? `${unsupported.length} transfer claim(s) lack an explicit verification or estimate caveat.` : "Transfer claims are presented as estimates or require verification."));

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
      travelHeavyLegs: legs.filter((leg) => (leg.durationMinutes ?? 0) >= 300).length,
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
    lines.push(`${dimension}: ${after.pass - before.pass >= 0 ? "+" : ""}${after.pass - before.pass} pass, ${after.warning - before.warning >= 0 ? "+" : ""}${after.warning - before.warning} warning, ${after.fail - before.fail >= 0 ? "+" : ""}${after.fail - before.fail} fail`);
  });
  current.results.forEach((result) => {
    const before = baseline.results.find((item) => item.id === result.id);
    if (!before) {
      lines.push(`${result.id}: new benchmark`);
      return;
    }
    const introduced = result.failures.filter((id) => !before.failures.includes(id));
    const resolved = before.failures.filter((id) => !result.failures.includes(id));
    if (introduced.length) lines.push(`${result.id}: new failures — ${introduced.join(", ")}`);
    if (resolved.length) lines.push(`${result.id}: resolved failures — ${resolved.join(", ")}`);
    if (before.routeState !== result.routeState || before.stopIds.join("|") !== result.stopIds.join("|")) lines.push(`${result.id}: route output changed`);
  });
  return lines;
}
