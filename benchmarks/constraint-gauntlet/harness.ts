import { canBuildTrip } from "../../lib/easyt/can-build-trip.ts";
import { allocateTripNights, calendarDayAllocationsFromNights } from "../../lib/easyt/night-allocation.ts";
import { repairFinalPlan } from "../../lib/easyt/plan-repair.ts";
import { validateFinalPlan, type FinalPlan, type FinalPlanConstraints } from "../../lib/easyt/plan-validator.ts";
import { estimateLeg } from "../../lib/easyt/planner.ts";
import { generateRouteCandidates } from "../../lib/easyt/route-candidates.ts";
import { scoreRouteCandidates } from "../../lib/easyt/route-scoring.ts";
import {
  extractStructuredTripBrief,
  mergeStructuredTripBrief,
  routeConstraintsFromStructuredTripBrief,
} from "../../lib/easyt/structured-trip-brief.ts";
import type { EasyTTrip } from "../../lib/easyt/trip.ts";
import { CONSTRAINT_GAUNTLET_CASES, type ConstraintGauntletCase, type ConstraintOutcome } from "./fixtures.ts";

const DAY_MS = 86_400_000;
const unique = <T>(items: readonly T[]) => [...new Set(items)];
const dateAt = (startDate: string, offset: number) => new Date(new Date(`${startDate}T00:00:00Z`).getTime() + offset * DAY_MS).toISOString().slice(0, 10);

function mergedConstraints(scenario: ConstraintGauntletCase, structured: ReturnType<typeof mergeStructuredTripBrief>): FinalPlanConstraints {
  const derived = routeConstraintsFromStructuredTripBrief(structured);
  const supplied = scenario.constraints ?? {};
  return {
    ...derived,
    ...supplied,
    requiredStopIds: unique([...(derived.requiredStopIds ?? []), ...(supplied.requiredStopIds ?? []), ...scenario.stops.filter((stop) => stop.required).map((stop) => stop.id)]),
    excludedStopIds: unique([...(derived.excludedStopIds ?? []), ...(supplied.excludedStopIds ?? [])]),
    excludedTransportModes: unique([...(derived.excludedTransportModes ?? []), ...(supplied.excludedTransportModes ?? [])]),
    fixedCommitments: supplied.fixedCommitments?.length ? supplied.fixedCommitments : derived.fixedCommitments,
  };
}

function tripDocument(
  scenario: ConstraintGauntletCase,
  allocations: Record<string, number>,
  startDate: string,
  endDate: string,
): Pick<EasyTTrip, "stops" | "planItems" | "startDate" | "endDate"> {
  const stopIds = scenario.stops.map((stop) => stop.id);
  const days = calendarDayAllocationsFromNights(stopIds, allocations);
  let offset = 0;
  const planItems = stopIds.flatMap((stopId) => Array.from({ length: Math.max(0, days[stopId] ?? 0) }, () => {
    const dayNumber = offset + 1;
    const item = { stopId, dayNumber, date: dateAt(startDate, offset) };
    offset += 1;
    return item;
  }));
  return {
    startDate,
    endDate,
    stops: stopIds.map((id) => ({ id })) as EasyTTrip["stops"],
    planItems: planItems as EasyTTrip["planItems"],
  };
}

export type ConstraintGauntletResult = {
  id: string;
  name: string;
  hardFacts: string[];
  hardConflict: string | null;
  possibleSoftCompromise: string | null;
  expectedCanBuildTrip: boolean;
  expectedOutcome: ConstraintOutcome;
  expectedValidatorIssues: string[];
  prohibitedPlannerBehaviour: string[];
  capture: {
    hardConstraintTypes: string[];
    issueCodes: string[];
  };
  candidates: {
    count: number;
    issueCodes: string[];
    requiredStopsPreserved: boolean;
    fixedAnchorsPreserved: boolean;
  };
  scorer: {
    state: string;
    winnerStopIds: string[];
    requiredStopsPreserved: boolean;
  };
  nights: {
    state: string;
    totalAvailable: number;
    totalAllocated: number | null;
    reconciles: boolean;
    zeroNightStopIds: string[];
    conflictCodes: string[];
  };
  validator: {
    state: string;
    issueCodes: string[];
    hardIssueCodes: string[];
  };
  repair: {
    state: string;
    issueCodes: string[];
    requiredStopsPreserved: boolean;
    fixedAnchorsPreserved: boolean;
  };
  builder: {
    canBuildTrip: boolean;
    outcome: ConstraintOutcome;
    conflictCodes: string[];
    compromiseCount: number;
  };
  unsupportedClaims: {
    fabricatedPrice: boolean;
  };
  hardOutcome: {
    canBuildTrip: boolean;
    outcome: ConstraintOutcome;
    candidateIssueCodes: string[];
    allocatorState: string;
    validatorHardIssueCodes: string[];
    repairState: string;
  };
};

export function evaluateConstraintGauntletCase(scenario: ConstraintGauntletCase): ConstraintGauntletResult {
  const startDate = "2026-10-01";
  const endDate = dateAt(startDate, scenario.totalNights);
  const captured = extractStructuredTripBrief(scenario.rawPrompt, "constraint-gauntlet-v1");
  const structured = mergeStructuredTripBrief(captured, {
    duration: { value: scenario.totalNights + 1, unit: "days", precision: "exact" },
    dates: { start: startDate, end: endDate, fixed: true },
    destinations: scenario.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      parentCountries: [stop.country],
      role: scenario.constraints?.fixedStartStopId === stop.id
        ? "arrival-gateway"
        : scenario.constraints?.fixedEndStopId === stop.id
          ? "departure-gateway"
          : stop.required ? "must-visit" : "preferred",
      priority: stop.required ? "required" : "normal",
    })),
    mustVisit: scenario.stops.filter((stop) => stop.required).map((stop) => stop.name),
    pace: scenario.pace === "fast" ? "packed" : scenario.pace,
    maximumStops: scenario.constraints?.maximumStops,
    maximumTransferMinutes: scenario.constraints?.maximumTransferMinutes,
    excludedDestinations: scenario.excludedDestinations,
    fixedCommitments: scenario.constraints?.fixedCommitments?.map((item) => ({ label: item.label, date: item.date })),
    avoidDriving: scenario.constraints?.avoidDriving,
    avoidFlying: scenario.constraints?.excludedTransportModes?.includes("flight"),
  });
  const constraints = mergedConstraints(scenario, structured);
  const legEstimator = scenario.estimateLeg ?? estimateLeg;
  const generation = generateRouteCandidates({
    origin: scenario.origin,
    stops: scenario.stops,
    constraints,
    estimateLeg: legEstimator,
  });
  const scoring = scoreRouteCandidates({
    origin: scenario.origin,
    candidates: generation.candidates,
    estimateLeg: legEstimator,
    availableDays: scenario.totalNights + 1,
    requiredStopIds: constraints.requiredStopIds,
    fixedStartStopId: constraints.fixedStartStopId,
    fixedEndStopId: constraints.fixedEndStopId,
  });
  const nightAllocation = allocateTripNights({
    totalNights: scenario.totalNights,
    pace: scenario.pace,
    fixedCommitments: constraints.fixedCommitments,
    stops: scenario.stops.map((stop) => ({
      ...stop,
      fixedNights: stop.fixedNights,
      fallbackMinimumNights: stop.fallbackMinimumNights,
      fallbackIdealNights: stop.fallbackIdealNights,
    })),
  });
  const allocations = scenario.planNights
    ?? nightAllocation.allocations
    ?? Object.fromEntries(scenario.stops.map((stop) => [stop.id, stop.fixedNights ?? 0]));
  const finalPlan: FinalPlan = {
    version: 1,
    origin: scenario.origin,
    stops: scenario.stops.map((stop) => ({
      ...stop,
      nights: Math.max(0, Math.round(allocations[stop.id] ?? 0)),
      arrivalDate: stop.arrivalDate,
      departureDate: stop.departureDate,
    })),
    totalNights: scenario.totalNights,
    pace: scenario.pace,
    startDate,
    endDate,
    constraints,
  };
  const validation = validateFinalPlan({ plan: finalPlan, structuredBrief: structured, nightAllocation, estimateLeg: legEstimator });
  const repair = repairFinalPlan({ plan: finalPlan, structuredBrief: structured, nightAllocation, estimateLeg: legEstimator });
  const document = tripDocument(scenario, allocations, startDate, endDate);
  const build = canBuildTrip({
    origin: scenario.origin.name,
    originCoordinates: scenario.origin.coordinates,
    stops: scenario.stops,
    routeConstraintIssues: generation.constraintIssues,
    requiredStopIds: constraints.requiredStopIds,
    maximumStops: constraints.maximumStops,
    startDate,
    endDate,
    durationDays: scenario.totalNights + 1,
    expectedDurationDays: structured.duration?.value,
    structuredBriefIssues: structured.issues,
    nightAllocation,
    allocations,
    planValidation: repair.finalValidation,
    document,
  });
  const requiredIds = constraints.requiredStopIds ?? [];
  const fixedStart = constraints.fixedStartStopId;
  const fixedEnd = constraints.fixedEndStopId;
  const candidateRequired = generation.candidates.every((candidate) => requiredIds.every((id) => candidate.stops.some((stop) => stop.id === id)));
  const candidateAnchors = generation.candidates.every((candidate) => (!fixedStart || candidate.stops[0]?.id === fixedStart)
    && (!fixedEnd || candidate.stops.at(-1)?.id === fixedEnd));
  const winnerIds = scoring.winner?.stopIds ?? [];
  const repairedIds = repair.plan.stops.map((stop) => stop.id);
  const claimOutput = JSON.stringify({ generation, scoring, nightAllocation, validation, repair: repair.finalValidation });
  const fabricatedPrice = /(?:[£$€]\s*\d|\b(?:gbp|usd|eur)\s*\d)/i.test(claimOutput);
  const validatorHardIssueCodes = validation.issues.filter((issue) => issue.hardConstraint).map((issue) => issue.code);
  const result: ConstraintGauntletResult = {
    id: scenario.id,
    name: scenario.name,
    hardFacts: scenario.hardFacts,
    hardConflict: scenario.hardConflict,
    possibleSoftCompromise: scenario.possibleSoftCompromise,
    expectedCanBuildTrip: scenario.expectedCanBuildTrip,
    expectedOutcome: scenario.expectedOutcome,
    expectedValidatorIssues: scenario.expectedValidatorIssues,
    prohibitedPlannerBehaviour: scenario.prohibitedPlannerBehaviour,
    capture: {
      hardConstraintTypes: structured.hardConstraints.map((constraint) => constraint.type),
      issueCodes: structured.issues.map((issue) => issue.code),
    },
    candidates: {
      count: generation.candidates.length,
      issueCodes: generation.constraintIssues.map((issue) => issue.code),
      requiredStopsPreserved: candidateRequired,
      fixedAnchorsPreserved: candidateAnchors,
    },
    scorer: {
      state: scoring.state,
      winnerStopIds: winnerIds,
      requiredStopsPreserved: !scoring.winner || requiredIds.every((id) => winnerIds.includes(id)),
    },
    nights: {
      state: nightAllocation.state,
      totalAvailable: scenario.totalNights,
      totalAllocated: nightAllocation.totalAllocatedNights,
      reconciles: nightAllocation.totalAllocatedNights === null || nightAllocation.totalAllocatedNights === scenario.totalNights,
      zeroNightStopIds: Object.entries(allocations).filter(([, nights]) => nights === 0).map(([id]) => id),
      conflictCodes: nightAllocation.conflicts.map((conflict) => conflict.code),
    },
    validator: {
      state: validation.state,
      issueCodes: validation.issues.map((issue) => issue.code),
      hardIssueCodes: validatorHardIssueCodes,
    },
    repair: {
      state: repair.state,
      issueCodes: repair.finalValidation.issues.map((issue) => issue.code),
      requiredStopsPreserved: requiredIds.every((id) => repairedIds.includes(id)),
      fixedAnchorsPreserved: (!fixedStart || repairedIds[0] === fixedStart) && (!fixedEnd || repairedIds.at(-1) === fixedEnd),
    },
    builder: {
      canBuildTrip: build.canBuildTrip,
      outcome: build.outcome,
      conflictCodes: build.conflicts.map((conflict) => conflict.code),
      compromiseCount: build.compromises.length,
    },
    unsupportedClaims: { fabricatedPrice },
    hardOutcome: {
      canBuildTrip: build.canBuildTrip,
      outcome: build.outcome,
      candidateIssueCodes: generation.constraintIssues.map((issue) => issue.code),
      allocatorState: nightAllocation.state,
      validatorHardIssueCodes,
      repairState: repair.state,
    },
  };
  return result;
}

export function runConstraintGauntlet(cases = CONSTRAINT_GAUNTLET_CASES) {
  const results = cases.map(evaluateConstraintGauntletCase);
  return {
    caseCount: results.length,
    hardFailureCount: results.filter((result) => !result.builder.canBuildTrip).length,
    expectedHardFailureCount: results.filter((result) => !result.expectedCanBuildTrip).length,
    expectationFailures: results.flatMap((result) => {
      const failures: string[] = [];
      if (result.builder.canBuildTrip !== result.expectedCanBuildTrip) failures.push(`${result.id}: builder gate mismatch`);
      if (result.builder.outcome !== result.expectedOutcome) failures.push(`${result.id}: outcome mismatch (${result.builder.outcome})`);
      for (const issue of result.expectedValidatorIssues) {
        if (!result.validator.issueCodes.includes(issue)) failures.push(`${result.id}: validator issue missing (${issue})`);
      }
      if (!result.candidates.requiredStopsPreserved || !result.scorer.requiredStopsPreserved || !result.repair.requiredStopsPreserved) failures.push(`${result.id}: required stop was not preserved`);
      if (!result.candidates.fixedAnchorsPreserved || !result.repair.fixedAnchorsPreserved) failures.push(`${result.id}: fixed anchor was not preserved`);
      if (!result.nights.reconciles) failures.push(`${result.id}: successful allocation did not reconcile`);
      if (result.builder.canBuildTrip && result.nights.zeroNightStopIds.length) failures.push(`${result.id}: build passed with a zero-night stop`);
      if (result.unsupportedClaims.fabricatedPrice) failures.push(`${result.id}: fabricated price-like output detected`);
      return failures;
    }),
    results,
  };
}

export function comparableConstraintHardOutcomes(summary: ReturnType<typeof runConstraintGauntlet>) {
  return summary.results.map((result) => ({ id: result.id, hardOutcome: result.hardOutcome }));
}
