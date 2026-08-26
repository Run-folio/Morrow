import { knownKnowledgeFact } from "../../lib/easyt/destination-knowledge.ts";
import { allocateTripNights } from "../../lib/easyt/night-allocation.ts";
import { assessPlanRealism } from "../../lib/easyt/plan-realism.ts";
import { validateFinalPlan, type FinalPlan, type PlanValidationReport } from "../../lib/easyt/plan-validator.ts";
import { assessRouteIntelligence, estimateLegForConstraints, type EstimatedLeg, type PlannerStop } from "../../lib/easyt/planner.ts";
import type { RouteCandidate } from "../../lib/easyt/route-candidates.ts";
import { scoreRouteCandidates } from "../../lib/easyt/route-scoring.ts";
import { estimateTransferImpact, TRANSFER_IMPACT_RULE_SOURCE, transferDoorToDoorMinutes, transferHeadlineMinutes, type TransferImpact } from "../../lib/easyt/transfer-impact.ts";
import { REALISM_GAUNTLET, type RealismFixture } from "./fixtures.ts";

export type RealismFinding = { id: string; status: "pass" | "fail"; message: string };
export type RealismResult = {
  id: string;
  name: string;
  record: Pick<RealismFixture, "hardFacts" | "hardConcern" | "possibleSoftCompromise" | "expectedClassification" | "expectedValidatorIssues" | "prohibitedPlannerBehaviour">;
  output: {
    classification: ReturnType<typeof assessPlanRealism>["classification"];
    routeState: "insufficient-data" | "current-order" | "recommendation";
    enteredStopIds: string[];
    selectedStopIds: string[];
    routeScoreDelta: number | null;
    transferHeadlineMinutes: number | null;
    transferDoorToDoorMinutes: number | null;
    usableDayLosses: string[];
    transferModes: EstimatedLeg["mode"][];
    transferConfidence: EstimatedLeg["confidence"][];
    nightAllocationState: "allocated" | "compromised" | "conflict";
    allocations: Record<string, number> | null;
    allocatedNights: number | null;
    zeroNightStops: string[];
    validatorIssueCodes: string[];
    hardValidationIssues: number;
    routeOrderFixed: boolean;
  };
  findings: RealismFinding[];
};
export type RealismSummary = { generatedBy: "morrovia-deterministic-realism-gauntlet"; results: RealismResult[]; totals: { pass: number; fail: number }; hardFailureCount: number };

const finding = (id: string, pass: boolean, message: string): RealismFinding => ({ id, status: pass ? "pass" : "fail", message });

function routeLegs(fixture: RealismFixture, stopIds: string[]) {
  const byId = new Map(fixture.stops.map((stop) => [stop.id, stop]));
  return stopIds.flatMap((id, index) => {
    const to = byId.get(id);
    if (!to) return [];
    const from = index ? byId.get(stopIds[index - 1]) : fixture.origin;
    return from ? [estimateLegForConstraints(from, to, fixture.constraints)] : [];
  });
}

function sumKnown(values: Array<number | null>) {
  return values.some((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function unknownFerryLeg(from: { name: string }, to: PlannerStop): EstimatedLeg {
  return { mode: "unknown", distanceKm: null, durationMinutes: null, label: `${from.name} to ${to.name}`, note: "No supported exact ferry service or duration is available.", confidence: "unconfirmed", transferImpact: estimateTransferImpact({ mode: "ferry" }) };
}

function severeTrainLeg(from: { name: string }, to: PlannerStop): EstimatedLeg {
  const impact = estimateTransferImpact({ mode: "train", headlineMinutes: knownKnowledgeFact(900, "estimated", TRANSFER_IMPACT_RULE_SOURCE), international: true, connectionCount: 2 });
  return { mode: "train", distanceKm: 1_450, durationMinutes: transferDoorToDoorMinutes(impact), label: `${from.name} to ${to.name} by multi-leg rail estimate`, note: "Deterministic stress evidence, not a live or direct timetable.", confidence: "medium", transferImpact: impact };
}

function syntheticModeChoice() {
  const origin = { name: "Origin", coordinates: [0, 0] as [number, number] };
  const stops: PlannerStop[] = [
    { id: "a", name: "A", country: "Test", coordinates: [1, 0] },
    { id: "b", name: "B", country: "Test", coordinates: [2, 0] },
    { id: "c", name: "C", country: "Test", coordinates: [3, 0] },
  ];
  const candidate = (ordered: PlannerStop[], candidateIndex: number, matchesOriginalOrder: boolean): RouteCandidate => ({
    stops: ordered, source: matchesOriginalOrder ? "existing" : "permutation", constraintsSatisfied: true, constraintIssues: [],
    metadata: { reordered: !matchesOriginalOrder, candidateIndex, matchesOriginalOrder, generatedByMorrovia: !matchesOriginalOrder, derivedFromCurrentRouteIntelligence: false, routeComparisonAvailable: true, estimatedTransferMinutes: null },
  });
  const flight = estimateTransferImpact({ mode: "flight", headlineMinutes: knownKnowledgeFact(90, "estimated", TRANSFER_IMPACT_RULE_SOURCE), international: false, connectionCount: 0 });
  const train = estimateTransferImpact({ mode: "train", headlineMinutes: knownKnowledgeFact(90, "estimated", TRANSFER_IMPACT_RULE_SOURCE), international: false, connectionCount: 0 });
  const leg = (mode: "flight" | "train" | "road", impact?: TransferImpact): EstimatedLeg => ({ mode, distanceKm: mode === "road" ? 0 : 100, durationMinutes: impact ? transferDoorToDoorMinutes(impact) : 0, label: "Deterministic comparison", note: "Planning evidence only.", confidence: "high", transferImpact: impact });
  const pairs: Record<string, EstimatedLeg> = { "Origin|A": leg("road"), "A|B": leg("flight", flight), "B|C": leg("train", train), "A|C": leg("train", train), "C|B": leg("train", train) };
  const estimate = (from: { name: string }, to: PlannerStop) => pairs[`${from.name}|${to.name}`] ?? leg("train", train);
  const scoring = scoreRouteCandidates({ origin, candidates: [candidate(stops, 0, true), candidate([stops[0], stops[2], stops[1]], 1, false)], estimateLeg: estimate, availableDays: 8 });
  return { scoring, impacts: [train, train], selectedStopIds: scoring.winner?.stopIds ?? stops.map((stop) => stop.id) };
}

function validationFor(fixture: RealismFixture, selectedStops: PlannerStop[], allocations: Record<string, number>, estimateLeg?: (from: PlannerStop | { name: string; coordinates?: [number, number] }, to: PlannerStop) => EstimatedLeg): PlanValidationReport {
  const plan: FinalPlan = {
    version: 1, origin: fixture.origin,
    stops: selectedStops.map((stop) => ({ ...stop, nights: allocations[stop.id] ?? 0, required: fixture.requiredStopIds?.includes(stop.id), anchor: stop.intent === "landmark" })),
    totalNights: Math.max(0, fixture.days - 1), pace: fixture.pace, constraints: fixture.constraints,
  };
  return validateFinalPlan({ plan, estimateLeg });
}

export function evaluateRealismFixture(fixture: RealismFixture): RealismResult {
  const route = assessRouteIntelligence({
    origin: fixture.origin, stops: fixture.stops, picks: {}, availableDays: fixture.days, constraints: fixture.constraints,
    scoringPreferences: { pace: fixture.pace, preferredModes: fixture.constraints?.transportModes?.map((mode) => mode === "drive" ? "road" as const : mode) },
  });
  let selectedStopIds = route.route.state === "recommendation" ? route.route.recommendedStopIds : fixture.stops.map((stop) => stop.id);
  let legs = routeLegs(fixture, selectedStopIds);
  const byId = new Map(fixture.stops.map((stop) => [stop.id, stop]));
  const selectedStops = () => selectedStopIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  const allocation = allocateTripNights({
    totalNights: Math.max(0, fixture.days - 1), pace: fixture.pace,
    stops: selectedStops().map((stop, index) => ({ ...stop, required: fixture.requiredStopIds?.includes(stop.id), anchor: stop.intent === "landmark", fallbackMinimumNights: route.durations[stop.id]?.minimumDays, fallbackIdealNights: route.durations[stop.id]?.recommendedDays, arrivalImpact: legs[index]?.transferImpact })),
  });
  const allocations = fixture.authoredAllocations ?? allocation.allocations ?? {};
  let validationEstimator: Parameters<typeof validationFor>[3];
  let classificationImpacts = legs.map((leg) => leg.transferImpact);
  if (fixture.special === "round-trip-day-trip") {
    const outbound = estimateLegForConstraints(fixture.stops[0], fixture.stops[1]);
    const inbound = estimateLegForConstraints(fixture.stops[1], fixture.stops[0]);
    classificationImpacts = [outbound.transferImpact, inbound.transferImpact];
    legs = [outbound, inbound];
  } else if (fixture.special === "unknown-ferry") {
    validationEstimator = unknownFerryLeg;
    legs = selectedStops().map((to, index) => unknownFerryLeg(index ? selectedStops()[index - 1] : fixture.origin, to));
    classificationImpacts = legs.map((leg) => leg.transferImpact);
  } else if (fixture.id === "train-preference-severe") {
    validationEstimator = severeTrainLeg;
    legs = selectedStops().map((to, index) => severeTrainLeg(index ? selectedStops()[index - 1] : fixture.origin, to));
    classificationImpacts = legs.map((leg) => leg.transferImpact);
  }
  let syntheticScoreDelta: number | null = null;
  if (fixture.special === "door-to-door-mode-choice") {
    const comparison = syntheticModeChoice();
    selectedStopIds = comparison.selectedStopIds;
    classificationImpacts = comparison.impacts;
    syntheticScoreDelta = comparison.scoring.winner && comparison.scoring.rankedCandidates[1]?.state === "scored" ? Number((comparison.scoring.winner.totalScore - comparison.scoring.rankedCandidates[1].totalScore).toFixed(1)) : null;
  }
  let validation = validationFor(fixture, selectedStops(), allocations, validationEstimator);
  if (fixture.special === "round-trip-day-trip" && !validation.issues.some((issue) => issue.code === "excessive-travel-day-burden")) {
    validation = validateFinalPlan({
      plan: { version: 1, origin: fixture.origin, stops: selectedStops().map((stop) => ({ ...stop, nights: allocations[stop.id] ?? 0 })), totalNights: fixture.days - 1 },
      estimateLeg: (from, to) => estimateLegForConstraints(from, to),
      config: { version: "day-trip-stress", fallbackMinimumNights: 1, anchorMinimumNights: 2, excessiveTransferMinutes: 300, backtrackingMinimumKm: 100, backtrackingRatio: 0.15, extremeOneNightStops: { relaxed: 2, balanced: 3, fast: 5 } },
    });
  }
  const realism = assessPlanRealism({
    validation,
    nightAllocation: fixture.authoredAllocations ? undefined : allocation,
    transferImpacts: classificationImpacts,
    routeOrderFixed: fixture.fixedOrder,
    retainedStopNights: Object.values(allocations),
    retainedStopIds: selectedStopIds,
    transferDayKeys: fixture.special === "round-trip-day-trip" ? ["excursion-day", "excursion-day"] : undefined,
  });
  const enteredScore = route.route.scoring?.rankedCandidates.find((item) => item.matchesOriginalOrder && item.state === "scored");
  const routeScoreDelta = syntheticScoreDelta ?? (route.route.scoring?.winner && enteredScore?.state === "scored" ? Number((route.route.scoring.winner.totalScore - enteredScore.totalScore).toFixed(1)) : null);
  const zeroNightStops = selectedStopIds.filter((id) => (allocations[id] ?? 0) <= 0);
  const validatorIssueCodes = validation.issues.map((issue) => issue.code);
  const routeMatchesEntered = selectedStopIds.every((id, index) => id === fixture.stops[index]?.id);
  const findings: RealismFinding[] = [
    finding("quality-classification", realism.classification === fixture.expectedClassification, `Expected ${fixture.expectedClassification}; received ${realism.classification}.`),
    finding("validator-evidence", fixture.expectedValidatorIssues.every((code) => validatorIssueCodes.includes(code)), `Expected ${fixture.expectedValidatorIssues.join(", ") || "no required issue"}; received ${validatorIssueCodes.join(", ") || "none"}.`),
    finding("night-total-reconciled", allocation.totalAllocatedNights === Math.max(0, fixture.days - 1), `${allocation.totalAllocatedNights ?? "No"} allocated nights against ${Math.max(0, fixture.days - 1)} available.`),
    finding("no-invented-stops", selectedStopIds.length === fixture.stops.length && selectedStopIds.every((id) => byId.has(id)), `Selected ${selectedStopIds.join(" → ")}.`),
    finding("zero-night-not-valid", zeroNightStops.length === 0 || realism.classification === "impossible", zeroNightStops.length ? `Zero-night stops remain visible: ${zeroNightStops.join(", ")}.` : "Every retained stop has at least one night."),
  ];
  if (fixture.routeExpectation) findings.push(finding("route-order-authority", fixture.routeExpectation === "change" ? !routeMatchesEntered : routeMatchesEntered, fixture.routeExpectation === "change" ? `Entered order ${routeMatchesEntered ? "was retained" : "was improved"}.` : `Fixed order ${routeMatchesEntered ? "was preserved" : "was changed"}.`));
  if (fixture.special === "door-to-door-mode-choice") findings.push(finding("door-to-door-choice", selectedStopIds.join(",") === "a,c,b" && (syntheticScoreDelta ?? 0) > 0, `Door-to-door scoring selected ${selectedStopIds.join(" → ")} with a ${syntheticScoreDelta ?? 0}-point advantage.`));
  return {
    id: fixture.id, name: fixture.name,
    record: { hardFacts: fixture.hardFacts, hardConcern: fixture.hardConcern, possibleSoftCompromise: fixture.possibleSoftCompromise, expectedClassification: fixture.expectedClassification, expectedValidatorIssues: fixture.expectedValidatorIssues, prohibitedPlannerBehaviour: fixture.prohibitedPlannerBehaviour },
    output: {
      classification: realism.classification, routeState: route.route.state, enteredStopIds: fixture.stops.map((stop) => stop.id), selectedStopIds, routeScoreDelta,
      transferHeadlineMinutes: sumKnown(legs.map((leg) => transferHeadlineMinutes(leg.transferImpact))), transferDoorToDoorMinutes: sumKnown(legs.map((leg) => transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes))),
      usableDayLosses: legs.map((leg) => leg.transferImpact?.usableDayLoss.classification ?? "unknown"), transferModes: legs.map((leg) => leg.mode), transferConfidence: legs.map((leg) => leg.confidence),
      nightAllocationState: allocation.state, allocations: allocation.allocations, allocatedNights: allocation.totalAllocatedNights, zeroNightStops, validatorIssueCodes, hardValidationIssues: validation.hardConstraintIssueCount, routeOrderFixed: Boolean(fixture.fixedOrder),
    },
    findings,
  };
}

export function runRealismGauntlet(fixtures = REALISM_GAUNTLET): RealismSummary {
  const results = fixtures.map(evaluateRealismFixture);
  const findings = results.flatMap((result) => result.findings);
  return { generatedBy: "morrovia-deterministic-realism-gauntlet", results, totals: { pass: findings.filter((item) => item.status === "pass").length, fail: findings.filter((item) => item.status === "fail").length }, hardFailureCount: findings.filter((item) => item.status === "fail").length };
}

export function comparableRealismSnapshot(summary: RealismSummary) {
  return summary.results.map((result) => ({ id: result.id, output: result.output, findings: result.findings }));
}
