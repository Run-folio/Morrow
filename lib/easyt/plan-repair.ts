import {
  allocateTripNights,
  type NightAllocationResult,
  type NightAllocationStopInput,
} from "./night-allocation.ts";
import {
  validateFinalPlan,
  planWithStructuredBriefConstraints,
  type FinalPlan,
  type FinalPlanStop,
  type PlanLegEstimator,
  type PlanValidationConfig,
  type PlanValidationIssue,
  type PlanValidationReport,
  type TripHealthFindingInput,
  type ValidateFinalPlanInput,
} from "./plan-validator.ts";
import {
  aggregatePlanningConfidence,
  createPlanningConfidence,
  unknownPlanningConfidence,
  type PlanningConfidence,
} from "./planning-confidence.ts";
import { estimateLegForConstraints, type RoutePlanningConstraints } from "./planner.ts";
import { generateRouteCandidates } from "./route-candidates.ts";
import {
  scoreRouteCandidates,
  type RouteCandidateSelection,
  type RouteScoringPreferences,
} from "./route-scoring.ts";
import {
  routeScoringPreferencesFromStructuredBrief,
  type StructuredTripBrief,
} from "./structured-trip-brief.ts";

export type PlanRepairAction =
  | "restore-fixed-gateways"
  | "deduplicate-stop"
  | "remove-optional-stop"
  | "reallocate-nights"
  | "reorder-route";

export type PlanRepairCategory = "constraints" | "identity" | "night-allocation" | "route-order";

export type PlanRepairState = {
  stopIds: string[];
  nights: Record<string, number>;
  arrivals: Record<string, string | null>;
  departures: Record<string, string | null>;
  validation: {
    hardConstraintIssues: number;
    errors: number;
    warnings: number;
    automaticIssues: number;
  };
};

export type PlanRepairChange = {
  action: PlanRepairAction;
  stopIds: string[];
  summary: string;
};

export type RecalculatedPlanLayer = "route-scoring" | "night-allocation" | "transfer-impact" | "validation";

export type PlanRepairRecord = {
  iteration: number;
  issueId: string;
  issueCode: PlanValidationIssue["code"];
  category: PlanRepairCategory;
  action: PlanRepairAction;
  message: string;
  before: PlanRepairState;
  proposedChange: PlanRepairChange;
  reason: string;
  constraintsPreserved: string[];
  confidence: PlanningConfidence;
  recalculatedLayers: RecalculatedPlanLayer[];
  stopIdsBefore: string[];
  stopIdsAfter: string[];
  nightsBefore: Record<string, number>;
  nightsAfter: Record<string, number>;
  scoreExplanation?: string;
};

export type RejectedPlanRepair = {
  iteration: number;
  issueId: string;
  issueCode: PlanValidationIssue["code"];
  action?: PlanRepairAction;
  reason: "no-safe-proposal" | "repeated-state" | "hard-constraint-risk" | "no-measurable-improvement";
  message: string;
};

export type PlanRepairConfig = {
  version: string;
  maxIterations: number;
};

export const DEFAULT_PLAN_REPAIR_CONFIG: PlanRepairConfig = {
  version: "plan-repair-v2-bounded-improvement",
  maxIterations: 3,
};

export type RepairFinalPlanInput = Omit<ValidateFinalPlanInput, "plan" | "config"> & {
  plan: FinalPlan;
  structuredBrief?: StructuredTripBrief;
  routeSelection?: RouteCandidateSelection;
  nightAllocation?: NightAllocationResult;
  tripHealthFindings?: readonly TripHealthFindingInput[];
  scoringPreferences?: RouteScoringPreferences;
  validationConfig?: PlanValidationConfig;
  config?: PlanRepairConfig;
};

export type PlanRepairResult = {
  version: 1;
  configVersion: string;
  state: "valid" | "repaired" | "unresolved" | "iteration-limit";
  plan: FinalPlan;
  iterations: number;
  validationPasses: number;
  initialValidation: PlanValidationReport;
  finalValidation: PlanValidationReport;
  repairs: PlanRepairRecord[];
  rejectedRepairs: RejectedPlanRepair[];
  unresolvedIssues: PlanValidationIssue[];
  repeatedStateDetected: boolean;
  terminationReason: "valid" | "no-repairable-issue" | "no-safe-improvement" | "iteration-limit";
};

type RepairAttempt = {
  plan: FinalPlan;
  action: PlanRepairAction;
  message: string;
  scoreExplanation?: string;
  confidence: PlanningConfidence;
};

const clonePlan = (plan: FinalPlan): FinalPlan => ({
  ...plan,
  origin: { ...plan.origin, coordinates: plan.origin.coordinates ? [...plan.origin.coordinates] as [number, number] : undefined },
  stops: plan.stops.map((stop) => ({ ...stop, coordinates: stop.coordinates ? [...stop.coordinates] as [number, number] : undefined })),
  constraints: plan.constraints ? {
    ...plan.constraints,
    fixedCommitments: plan.constraints.fixedCommitments?.map((item) => ({ ...item })),
    requiredStopIds: plan.constraints.requiredStopIds ? [...plan.constraints.requiredStopIds] : undefined,
    excludedStopIds: plan.constraints.excludedStopIds ? [...plan.constraints.excludedStopIds] : undefined,
    optionalStopIds: plan.constraints.optionalStopIds ? [...plan.constraints.optionalStopIds] : undefined,
    excludedTransportModes: plan.constraints.excludedTransportModes ? [...plan.constraints.excludedTransportModes] : undefined,
    transportModes: plan.constraints.transportModes ? [...plan.constraints.transportModes] : undefined,
  } : undefined,
  scheduleLocks: plan.scheduleLocks ? {
    stopIds: plan.scheduleLocks.stopIds ? [...plan.scheduleLocks.stopIds] : undefined,
    arrivalDates: plan.scheduleLocks.arrivalDates ? { ...plan.scheduleLocks.arrivalDates } : undefined,
  } : undefined,
});

const stopIds = (plan: FinalPlan) => plan.stops.map((stop) => stop.id);
const nights = (plan: FinalPlan) => Object.fromEntries(plan.stops.map((stop) => [stop.id, stop.nights]));
const arrivals = (plan: FinalPlan) => Object.fromEntries(plan.stops.map((stop) => [stop.id, stop.arrivalDate ?? null]));
const departures = (plan: FinalPlan) => Object.fromEntries(plan.stops.map((stop) => [stop.id, stop.departureDate ?? null]));
const sameOrder = (left: readonly FinalPlanStop[], right: readonly FinalPlanStop[]) => left.length === right.length
  && left.every((stop, index) => stop.id === right[index]?.id);

const systemConfidence = (reason: string) => createPlanningConfidence({
  state: "structured",
  level: "high",
  freshness: "current",
  scope: "planning-rule",
  sources: [{
    id: "morrovia:repair-rule",
    label: "Morrovia deterministic repair rule",
    kind: "system-default",
    supports: reason,
  }],
  reason,
  confirmationReason: null,
});

const validationState = (plan: FinalPlan, report: PlanValidationReport): PlanRepairState => ({
  stopIds: stopIds(plan),
  nights: nights(plan),
  arrivals: arrivals(plan),
  departures: departures(plan),
  validation: {
    hardConstraintIssues: report.hardConstraintIssueCount,
    errors: report.errorCount,
    warnings: report.warningCount,
    automaticIssues: report.issues.filter((item) => item.repairability === "automatic").length,
  },
});

const stateKey = (plan: FinalPlan) => JSON.stringify({
  stopIds: stopIds(plan),
  nights: nights(plan),
  startDate: plan.startDate ?? null,
  endDate: plan.endDate ?? null,
  arrivals: arrivals(plan),
  departures: departures(plan),
});

const categoryFor = (issue: PlanValidationIssue): PlanRepairCategory => {
  if (issue.code === "fixed-start-broken" || issue.code === "fixed-end-broken" || issue.code === "hard-constraint-violation" || issue.code === "transport-restriction-conflict") return "constraints";
  if (issue.code === "duplicate-stop") return "identity";
  if (issue.code === "total-nights-mismatch" || issue.code === "below-minimum-stay" || issue.code === "minimum-stay-conflict" || issue.code === "one-night-anchor-after-large-transfer" || issue.code === "extreme-pacing") return "night-allocation";
  return "route-order";
};

const recalculatedLayersFor = (action: PlanRepairAction): RecalculatedPlanLayer[] => action === "reorder-route"
  ? ["route-scoring", "night-allocation", "transfer-impact", "validation"]
  : action === "reallocate-nights" || action === "remove-optional-stop"
    ? ["night-allocation", "transfer-impact", "validation"]
    : ["transfer-impact", "validation"];

type ProtectedPlanState = {
  requiredPresentStopIds: string[];
  fixedStartStopId?: string;
  fixedEndStopId?: string;
  fixedNights: Record<string, number>;
  datedStops: Record<string, { arrivalDate: string | null; departureDate: string | null }>;
  scheduleLocks: FinalPlan["scheduleLocks"];
  constraints: FinalPlan["constraints"];
  startDate?: string;
  endDate?: string;
  protectedOrder: string[] | null;
};

function protectedPlanState(plan: FinalPlan): ProtectedPlanState {
  const required = new Set([
    ...(plan.constraints?.requiredStopIds ?? []),
    ...plan.stops.filter((stop) => stop.required || stop.anchor || stop.intent === "landmark").map((stop) => stop.id),
  ]);
  return {
    requiredPresentStopIds: plan.stops.filter((stop) => required.has(stop.id)).map((stop) => stop.id),
    fixedStartStopId: plan.constraints?.fixedStartStopId,
    fixedEndStopId: plan.constraints?.fixedEndStopId,
    fixedNights: Object.fromEntries(plan.stops.filter((stop) => stop.fixedNights !== undefined).map((stop) => [stop.id, stop.fixedNights as number])),
    datedStops: Object.fromEntries(plan.stops
      .filter((stop) => stop.arrivalDate || stop.departureDate)
      .map((stop) => [stop.id, { arrivalDate: stop.arrivalDate ?? null, departureDate: stop.departureDate ?? null }])),
    scheduleLocks: plan.scheduleLocks ? structuredClone(plan.scheduleLocks) : undefined,
    constraints: plan.constraints ? structuredClone(plan.constraints) : undefined,
    startDate: plan.startDate,
    endDate: plan.endDate,
    protectedOrder: plan.constraints?.fixedCommitments?.length || plan.scheduleLocks?.stopIds?.length || Object.keys(plan.scheduleLocks?.arrivalDates ?? {}).length
      ? stopIds(plan)
      : null,
  };
}

function hardConstraintPreservation(snapshot: ProtectedPlanState, plan: FinalPlan) {
  const violations: string[] = [];
  const ids = stopIds(plan);
  snapshot.requiredPresentStopIds.forEach((id) => {
    if (!ids.includes(id)) violations.push(`required destination ${id} was removed`);
  });
  if (snapshot.fixedStartStopId && ids[0] !== snapshot.fixedStartStopId) violations.push("fixed start gateway changed");
  if (snapshot.fixedEndStopId && ids.at(-1) !== snapshot.fixedEndStopId) violations.push("fixed departure gateway changed");
  Object.entries(snapshot.fixedNights).forEach(([id, fixedNights]) => {
    if (plan.stops.find((stop) => stop.id === id)?.nights !== fixedNights) violations.push(`fixed nights changed for ${id}`);
  });
  Object.entries(snapshot.datedStops).forEach(([id, dates]) => {
    const stop = plan.stops.find((item) => item.id === id);
    if (!stop || (stop.arrivalDate ?? null) !== dates.arrivalDate || (stop.departureDate ?? null) !== dates.departureDate) violations.push(`fixed calendar fields changed for ${id}`);
  });
  if (plan.startDate !== snapshot.startDate || plan.endDate !== snapshot.endDate) violations.push("fixed trip dates changed");
  if (JSON.stringify(plan.scheduleLocks) !== JSON.stringify(snapshot.scheduleLocks)) violations.push("schedule locks changed");
  if (JSON.stringify(plan.constraints) !== JSON.stringify(snapshot.constraints)) violations.push("hard route constraints changed");
  if (snapshot.protectedOrder) {
    const survivingOriginalOrder = snapshot.protectedOrder.filter((id) => ids.includes(id));
    if (survivingOriginalOrder.join("\u001f") !== ids.join("\u001f")) violations.push("a fixed commitment route was reordered");
  }
  return violations;
}

function preservedConstraintLabels(snapshot: ProtectedPlanState) {
  return [
    ...(snapshot.requiredPresentStopIds.length ? [`required/must-visit stops (${snapshot.requiredPresentStopIds.join(", ")})`] : []),
    ...(snapshot.fixedStartStopId ? [`fixed start gateway (${snapshot.fixedStartStopId})`] : []),
    ...(snapshot.fixedEndStopId ? [`fixed departure gateway (${snapshot.fixedEndStopId})`] : []),
    ...(Object.keys(snapshot.fixedNights).length ? [`fixed-night stays (${Object.keys(snapshot.fixedNights).join(", ")})`] : []),
    ...(Object.keys(snapshot.datedStops).length || snapshot.startDate || snapshot.endDate ? ["fixed trip and stop dates"] : []),
    ...(snapshot.protectedOrder ? ["fixed commitment order"] : []),
    "hard transport restrictions",
    "explicit traveller preferences",
  ];
}

function routingConstraints(plan: FinalPlan): RoutePlanningConstraints | undefined {
  if (!plan.constraints) return undefined;
  return {
    ...plan.constraints,
    fixedCommitments: plan.constraints.fixedCommitments?.map(({ label, date }) => ({ label, date })),
  };
}

function restoreGateways(plan: FinalPlan) {
  const startId = plan.constraints?.fixedStartStopId;
  const endId = plan.constraints?.fixedEndStopId;
  if (!startId && !endId) return null;
  if (plan.stops.length > 1 && startId && startId === endId) return null;
  const start = startId ? plan.stops.find((stop) => stop.id === startId) : undefined;
  const end = endId ? plan.stops.find((stop) => stop.id === endId) : undefined;
  if ((startId && !start) || (endId && !end)) return null;
  const middle = plan.stops.filter((stop) => stop.id !== start?.id && stop.id !== end?.id);
  const stops = [...(start ? [start] : []), ...middle, ...(end ? [end] : [])];
  if (sameOrder(stops, plan.stops)) return null;
  return {
    plan: { ...plan, stops }, action: "restore-fixed-gateways" as const,
    message: "Moved the existing fixed gateway stops back to their protected endpoints without removing any destination.",
    confidence: systemConfidence("The repair uses explicit fixed endpoint IDs already present in the plan."),
  };
}

function deduplicate(plan: FinalPlan, issue: PlanValidationIssue) {
  if (issue.repairability !== "automatic") return null;
  const duplicateIds = new Set(issue.stopIds);
  const seen = new Set<string>();
  const stops: FinalPlanStop[] = [];
  for (const stop of plan.stops) {
    if (!duplicateIds.has(stop.id) || !seen.has(stop.id)) {
      stops.push({ ...stop });
      seen.add(stop.id);
      continue;
    }
    const retained = stops.find((item) => item.id === stop.id);
    if (retained) retained.nights += stop.nights;
  }
  if (stops.length === plan.stops.length) return null;
  return {
    plan: { ...plan, stops }, action: "deduplicate-stop" as const,
    message: "Merged repeated stable destination identities and retained their combined night budget.",
    confidence: systemConfidence("The repair uses the destination IDs already established as stable identities."),
  };
}

function allocationFor(
  plan: FinalPlan,
  estimateLeg: PlanLegEstimator,
  knowledge: RepairFinalPlanInput["knowledge"],
  ignorePreferredSplit: boolean,
) {
  const legByDestination = new Map<string, ReturnType<PlanLegEstimator>>();
  plan.stops.forEach((stop, index) => {
    const previous = index ? plan.stops[index - 1] : plan.origin;
    if (!index && !plan.origin.coordinates) return;
    legByDestination.set(stop.id, estimateLeg(previous, stop));
  });
  return allocateTripNights({
    totalNights: plan.totalNights,
    pace: plan.pace,
    fixedCommitments: plan.constraints?.fixedCommitments,
    knowledge,
    stops: plan.stops.map((stop): NightAllocationStopInput => ({
      ...stop,
      required: stop.required || plan.constraints?.requiredStopIds?.includes(stop.id),
      optional: stop.optional || plan.constraints?.optionalStopIds?.includes(stop.id),
      preferredNights: ignorePreferredSplit ? undefined : stop.nights,
      arrivalImpact: legByDestination.get(stop.id)?.transferImpact,
    })),
  });
}

function allocationConfidence(allocation: NightAllocationResult) {
  if (allocation.state === "conflict") return unknownPlanningConfidence("The existing night allocator could not produce a safe allocation for this repair.");
  return aggregatePlanningConfidence(allocation.stops.map((stop) => stop.confidence.allocation), {
    scope: "planning-rule",
    reason: "Confidence in the repaired stay split comes from the existing deterministic night-allocation result.",
  });
}

function reallocate(
  plan: FinalPlan,
  issue: PlanValidationIssue,
  estimateLeg: PlanLegEstimator,
  knowledge: RepairFinalPlanInput["knowledge"],
) {
  const ignorePreferredSplit = issue.code === "extreme-pacing"
    || issue.code === "minimum-stay-conflict"
    || issue.code === "one-night-anchor-after-large-transfer";
  const allocation = allocationFor(plan, estimateLeg, knowledge, ignorePreferredSplit);
  if (allocation.state === "conflict" || !allocation.allocations) return null;
  const stops = plan.stops.map((stop) => ({ ...stop, nights: allocation.allocations?.[stop.id] ?? stop.nights }));
  if (stops.every((stop, index) => stop.nights === plan.stops[index]?.nights)) return null;
  return {
    plan: { ...plan, stops }, action: "reallocate-nights" as const,
    message: allocation.state === "compromised"
      ? "Reconciled the night total deterministically; unavoidable minimum-stay compromises remain explicit."
      : "Reallocated the existing night budget to restore an exact, pace-aware stay split.",
    confidence: allocationConfidence(allocation),
  };
}

function removableIds(issue: PlanValidationIssue) {
  const value = issue.evidence.removableOptionalStopIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function removeOptionalStops(
  plan: FinalPlan,
  issue: PlanValidationIssue,
  estimateLeg: PlanLegEstimator,
  knowledge: RepairFinalPlanInput["knowledge"],
) {
  const candidates = removableIds(issue)
    .flatMap((id) => {
      const index = plan.stops.findIndex((stop) => stop.id === id);
      const stop = plan.stops[index];
      return stop ? [{ stop, index }] : [];
    })
    .sort((left, right) => (left.stop.preferenceWeight ?? 0) - (right.stop.preferenceWeight ?? 0)
      || left.stop.nights - right.stop.nights
      || right.index - left.index);
  if (!candidates.length) return null;

  const excluded = new Set(Array.isArray(issue.evidence.excludedStopIds) ? issue.evidence.excludedStopIds : []);
  const maximum = typeof issue.evidence.maximumStops === "number" ? issue.evidence.maximumStops : null;
  const initiallyRequired = candidates.filter(({ stop }) => excluded.has(stop.id)).map(({ stop }) => stop.id);
  const orderedIds = [...initiallyRequired, ...candidates.map(({ stop }) => stop.id).filter((id) => !excluded.has(id))];
  for (let count = Math.max(1, initiallyRequired.length); count <= orderedIds.length; count += 1) {
    const removed = new Set(orderedIds.slice(0, count));
    const stops = plan.stops.filter((stop) => !removed.has(stop.id));
    if (maximum !== null && stops.length > maximum) continue;
    const candidatePlan = { ...plan, stops };
    const allocation = allocationFor(candidatePlan, estimateLeg, knowledge, true);
    if (allocation.state === "conflict" || !allocation.allocations) continue;
    if (issue.code === "minimum-stay-conflict" && allocation.state !== "allocated") continue;
    const allocatedStops = stops.map((stop) => ({ ...stop, nights: allocation.allocations?.[stop.id] ?? stop.nights }));
    return {
      plan: { ...candidatePlan, stops: allocatedStops },
      action: "remove-optional-stop" as const,
      message: `Removed ${[...removed].join(", ")} as the smallest optional-stop reduction that lets the remaining plan reconcile.`,
      confidence: allocationConfidence(allocation),
    };
  }
  return null;
}

function reorderRoute(
  plan: FinalPlan,
  estimateLeg: PlanLegEstimator,
  knowledge: RepairFinalPlanInput["knowledge"],
  preferences?: RouteScoringPreferences,
  existingSelection?: RouteCandidateSelection,
) {
  const generated = generateRouteCandidates({
    origin: plan.origin,
    stops: plan.stops,
    constraints: routingConstraints(plan),
    estimateLeg,
  });
  if (!generated.candidates.length) return null;
  const rescoredSelection = scoreRouteCandidates({
    origin: plan.origin,
    candidates: generated.candidates,
    estimateLeg,
    preferences: { pace: plan.pace, ...preferences },
    availableDays: plan.totalNights + 1,
    allocations: nights(plan),
    requiredStopIds: plan.constraints?.requiredStopIds,
    fixedStartStopId: plan.constraints?.fixedStartStopId,
    fixedEndStopId: plan.constraints?.fixedEndStopId,
  });
  const existingWinnerIds = existingSelection?.winner?.stopIds ?? [];
  const sameStopSet = existingWinnerIds.length === plan.stops.length
    && existingWinnerIds.every((id) => plan.stops.some((stop) => stop.id === id));
  const selection = sameStopSet && existingSelection?.winner ? existingSelection : rescoredSelection;
  const winner = selection.winner;
  if (!winner || winner.stopIds.join("\u001f") === stopIds(plan).join("\u001f")) return null;
  const byId = new Map(plan.stops.map((stop) => [stop.id, stop]));
  let stops = winner.stopIds.flatMap((id) => {
    const stop = byId.get(id);
    return stop ? [stop] : [];
  });
  if (stops.length !== plan.stops.length) return null;
  let repairedPlan = { ...plan, stops };
  let allocation = allocationFor(repairedPlan, estimateLeg, knowledge, false);
  if (allocation.state === "conflict" || !allocation.allocations) return null;
  repairedPlan = {
    ...repairedPlan,
    stops: repairedPlan.stops.map((stop) => ({ ...stop, nights: allocation.allocations?.[stop.id] ?? stop.nights })),
  };
  const finalSelection = scoreRouteCandidates({
    origin: plan.origin,
    candidates: generated.candidates,
    estimateLeg,
    preferences: { pace: plan.pace, ...preferences },
    availableDays: plan.totalNights + 1,
    allocations: nights(repairedPlan),
    requiredStopIds: plan.constraints?.requiredStopIds,
    fixedStartStopId: plan.constraints?.fixedStartStopId,
    fixedEndStopId: plan.constraints?.fixedEndStopId,
  });
  if (finalSelection.winner && finalSelection.winner.stopIds.join("\u001f") !== stopIds(repairedPlan).join("\u001f")) {
    stops = finalSelection.winner.stopIds.flatMap((id) => {
      const stop = byId.get(id);
      return stop ? [stop] : [];
    });
    if (stops.length !== plan.stops.length) return null;
    const finalPlan = { ...plan, stops };
    allocation = allocationFor(finalPlan, estimateLeg, knowledge, false);
    if (allocation.state === "conflict" || !allocation.allocations) return null;
    repairedPlan = {
      ...finalPlan,
      stops: finalPlan.stops.map((stop) => ({ ...stop, nights: allocation.allocations?.[stop.id] ?? stop.nights })),
    };
  }
  return {
    plan: repairedPlan, action: "reorder-route" as const,
    message: "Applied the highest-ranked viable existing-stop order to remove the detected route defect.",
    scoreExplanation: finalSelection.explanation,
    confidence: aggregatePlanningConfidence([finalSelection.confidence, allocationConfidence(allocation)], {
      scope: "general-route",
      reason: "The repaired order was rescored and its changed arrival impacts were reallocated before validation.",
    }),
  };
}

function attemptRepair(
  plan: FinalPlan,
  issue: PlanValidationIssue,
  estimateLeg: PlanLegEstimator,
  knowledge: RepairFinalPlanInput["knowledge"],
  preferences?: RouteScoringPreferences,
  routeSelection?: RouteCandidateSelection,
): RepairAttempt | null {
  if (issue.repairability !== "automatic") return null;
  const protectsCalendar = Boolean(
    plan.scheduleLocks?.stopIds?.length
      || Object.keys(plan.scheduleLocks?.arrivalDates ?? {}).length
      || plan.stops.some((stop) => stop.arrivalDate || stop.departureDate)
      || plan.constraints?.fixedCommitments?.some((commitment) => commitment.date),
  );
  switch (issue.code) {
    case "fixed-start-broken":
    case "fixed-end-broken":
      return restoreGateways(plan);
    case "hard-constraint-violation":
    case "minimum-stay-conflict":
      if (protectsCalendar) return null;
      return removeOptionalStops(plan, issue, estimateLeg, knowledge);
    case "duplicate-stop":
      return deduplicate(plan, issue);
    case "total-nights-mismatch":
    case "below-minimum-stay":
    case "one-night-anchor-after-large-transfer":
    case "extreme-pacing":
      if (protectsCalendar) return null;
      return reallocate(plan, issue, estimateLeg, knowledge);
    case "unnecessary-backtracking":
    case "unsupported-transfer":
    case "excessive-travel-day-burden":
    case "transport-restriction-conflict":
      return reorderRoute(plan, estimateLeg, knowledge, preferences, routeSelection);
    default:
      return null;
  }
}

const hardIssueKey = (issue: PlanValidationIssue) => `${issue.code}:${issue.stopIds.join("|")}:${issue.legIndexes.join("|")}`;
const repairFamily = (issue: PlanValidationIssue) => {
  if (issue.code === "fixed-start-broken" || issue.code === "fixed-end-broken") return "fixed-gateways";
  if (issue.code === "total-nights-mismatch" || issue.code === "below-minimum-stay" || issue.code === "minimum-stay-conflict" || issue.code === "one-night-anchor-after-large-transfer" || issue.code === "extreme-pacing") return "night-allocation";
  if (issue.code === "unnecessary-backtracking" || issue.code === "unsupported-transfer" || issue.code === "excessive-travel-day-burden" || issue.code === "transport-restriction-conflict") return "route-order";
  return issue.id;
};

const validationQuality = (report: PlanValidationReport) => [
  report.hardConstraintIssueCount,
  report.errorCount,
  report.warningCount,
] as const;

function measurablyImproves(before: PlanValidationReport, after: PlanValidationReport) {
  const left = validationQuality(before);
  const right = validationQuality(after);
  for (let index = 0; index < left.length; index += 1) {
    if (right[index] < left[index]) return true;
    if (right[index] > left[index]) return false;
  }
  return false;
}

/**
 * Runs validate → targeted repair → validate with an explicit small bound.
 * Every tentative change is rolled back if it creates a new hard violation.
 */
export function repairFinalPlan(input: RepairFinalPlanInput): PlanRepairResult {
  const config = input.config ?? DEFAULT_PLAN_REPAIR_CONFIG;
  const maxIterations = Math.max(0, Math.floor(config.maxIterations));
  const briefPreferences = input.structuredBrief ? routeScoringPreferencesFromStructuredBrief(input.structuredBrief) : undefined;
  const scoringPreferences = { ...briefPreferences, ...input.scoringPreferences };
  let plan = clonePlan(planWithStructuredBriefConstraints(input.plan, input.structuredBrief));
  const estimateLeg = input.estimateLeg ?? ((from, to) => estimateLegForConstraints(from, to, plan.constraints));
  const validate = (plan: FinalPlan) => validateFinalPlan({
    plan,
    structuredBrief: input.structuredBrief,
    nightAllocation: input.nightAllocation,
    tripHealthFindings: input.tripHealthFindings,
    estimateLeg,
    knowledge: input.knowledge,
    config: input.validationConfig,
  });
  const protectedState = protectedPlanState(plan);
  const initialValidation = validate(plan);
  let currentValidation = initialValidation;
  const repairs: PlanRepairRecord[] = [];
  const rejectedRepairs: RejectedPlanRepair[] = [];
  const attemptedFamilies = new Set<string>();
  const seenStates = new Set([stateKey(plan)]);
  let iterations = 0;
  let validationPasses = 1;
  let stoppedByLimit = false;
  let repeatedStateDetected = false;

  while (currentValidation.issues.length) {
    const hardIssues = currentValidation.issues.filter((item) => item.hardConstraint);
    const eligibleIssues = hardIssues.length ? hardIssues : currentValidation.issues;
    const repairable = eligibleIssues.find((item) => item.repairability === "automatic" && !attemptedFamilies.has(repairFamily(item)));
    if (!repairable) break;
    if (iterations >= maxIterations) {
      stoppedByLimit = true;
      break;
    }
    attemptedFamilies.add(repairFamily(repairable));
    iterations += 1;
    const before = plan;
    const beforeValidation = currentValidation;
    const attempt = attemptRepair(before, repairable, estimateLeg, input.knowledge, scoringPreferences, input.routeSelection);
    if (!attempt) {
      rejectedRepairs.push({
        iteration: iterations,
        issueId: repairable.id,
        issueCode: repairable.code,
        reason: "no-safe-proposal",
        message: "The existing planner layers could not produce a local correction without weakening a protected date, commitment, or planning fact.",
      });
      continue;
    }
    const proposalKey = stateKey(attempt.plan);
    if (seenStates.has(proposalKey)) {
      repeatedStateDetected = true;
      rejectedRepairs.push({
        iteration: iterations,
        issueId: repairable.id,
        issueCode: repairable.code,
        action: attempt.action,
        reason: "repeated-state",
        message: "The proposal repeats a plan state already validated in this repair run.",
      });
      continue;
    }
    seenStates.add(proposalKey);
    const preservationViolations = hardConstraintPreservation(protectedState, attempt.plan);
    if (preservationViolations.length) {
      rejectedRepairs.push({
        iteration: iterations,
        issueId: repairable.id,
        issueCode: repairable.code,
        action: attempt.action,
        reason: "hard-constraint-risk",
        message: preservationViolations.join("; "),
      });
      continue;
    }
    const nextValidation = validate(attempt.plan);
    validationPasses += 1;
    const existingHard = new Set(currentValidation.issues.filter((item) => item.hardConstraint).map(hardIssueKey));
    const introducedHard = nextValidation.issues.some((item) => item.hardConstraint && !existingHard.has(hardIssueKey(item)));
    if (introducedHard) {
      rejectedRepairs.push({
        iteration: iterations,
        issueId: repairable.id,
        issueCode: repairable.code,
        action: attempt.action,
        reason: "hard-constraint-risk",
        message: "The proposal introduced a new hard validation issue, so the prior plan was retained.",
      });
      continue;
    }
    if (!measurablyImproves(currentValidation, nextValidation)) {
      rejectedRepairs.push({
        iteration: iterations,
        issueId: repairable.id,
        issueCode: repairable.code,
        action: attempt.action,
        reason: "no-measurable-improvement",
        message: "The proposal did not reduce the lexicographic hard-issue, error, and warning counts, so the prior plan was retained.",
      });
      continue;
    }
    plan = attempt.plan;
    const changedStopIds = stopIds(before).join("\u001f") === stopIds(plan).join("\u001f")
      ? plan.stops.filter((stop) => stop.nights !== before.stops.find((item) => item.id === stop.id)?.nights).map((stop) => stop.id)
      : [...new Set([...stopIds(before), ...stopIds(plan)])];
    repairs.push({
      iteration: iterations,
      issueId: repairable.id,
      issueCode: repairable.code,
      category: categoryFor(repairable),
      action: attempt.action,
      message: attempt.message,
      before: validationState(before, beforeValidation),
      proposedChange: { action: attempt.action, stopIds: changedStopIds, summary: attempt.message },
      reason: `${repairable.message} ${attempt.message}`,
      constraintsPreserved: preservedConstraintLabels(protectedState),
      confidence: attempt.confidence,
      recalculatedLayers: recalculatedLayersFor(attempt.action),
      stopIdsBefore: stopIds(before),
      stopIdsAfter: stopIds(plan),
      nightsBefore: nights(before),
      nightsAfter: nights(plan),
      scoreExplanation: attempt.scoreExplanation,
    });
    currentValidation = nextValidation;
  }

  const unresolvedIssues = currentValidation.issues;
  const state = unresolvedIssues.length === 0
    ? repairs.length ? "repaired" as const : "valid" as const
    : stoppedByLimit ? "iteration-limit" as const : "unresolved" as const;
  const hasRemainingAutomatic = unresolvedIssues.some((item) => item.repairability === "automatic");
  const terminationReason = !unresolvedIssues.length
    ? "valid" as const
    : stoppedByLimit && hasRemainingAutomatic
      ? "iteration-limit" as const
      : rejectedRepairs.length
        ? "no-safe-improvement" as const
        : "no-repairable-issue" as const;
  return {
    version: 1,
    configVersion: config.version,
    state,
    plan,
    iterations,
    validationPasses,
    initialValidation,
    finalValidation: currentValidation,
    repairs,
    rejectedRepairs,
    unresolvedIssues,
    repeatedStateDetected,
    terminationReason,
  };
}
