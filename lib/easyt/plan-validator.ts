import { destinationKnowledge, type DestinationKnowledgeStore } from "./destination-knowledge.ts";
import type { NightAllocationResult } from "./night-allocation.ts";
import { estimateLegForConstraints, haversineKm, type EstimatedLeg, type PlannerStop, type RoutePlanningConstraints } from "./planner.ts";
import {
  routeConstraintsFromStructuredTripBrief,
  type StructuredTripBrief,
} from "./structured-trip-brief.ts";
import { transferDoorToDoorMinutes } from "./transfer-impact.ts";

export type PlanValidationIssueCode =
  | "hard-constraint-violation"
  | "required-stop-missing"
  | "fixed-start-broken"
  | "fixed-end-broken"
  | "total-nights-mismatch"
  | "below-minimum-stay"
  | "minimum-stay-conflict"
  | "one-night-anchor-after-large-transfer"
  | "extreme-pacing"
  | "excessive-travel-day-burden"
  | "unnecessary-backtracking"
  | "unsupported-transfer"
  | "duplicate-stop"
  | "fixed-date-conflict"
  | "transport-restriction-conflict";

export type PlanValidationSeverity = "error" | "warning";
export type PlanIssueRepairability = "automatic" | "manual" | "none";

export type PlanValidationEvidence = Record<
  string,
  string | number | boolean | null | readonly string[] | readonly number[]
>;

export type PlanValidationSource =
  | "final-plan"
  | "structured-trip-brief"
  | "candidate-scoring"
  | "destination-knowledge"
  | "transfer-impact"
  | "night-allocation"
  | "trip-health";

export type TripHealthFindingInput = {
  id: string;
  rule: string;
  message: string;
  issueCode?: PlanValidationIssueCode;
  stopIds?: readonly string[];
};

export type PlanValidationIssue = {
  id: string;
  code: PlanValidationIssueCode;
  severity: PlanValidationSeverity;
  message: string;
  stopIds: string[];
  legIndexes: number[];
  hardConstraint: boolean;
  repairability: PlanIssueRepairability;
  evidence: PlanValidationEvidence;
  sources: PlanValidationSource[];
  relatedTripHealthFindingIds: string[];
};

export type FinalPlanFixedCommitment = {
  label: string;
  date?: string;
  stopId?: string;
  fixedNights?: number;
};

export type FinalPlanConstraints = Omit<RoutePlanningConstraints, "fixedCommitments"> & {
  fixedCommitments?: FinalPlanFixedCommitment[];
};

export type FinalPlanStop = PlannerStop & {
  nights: number;
  arrivalDate?: string | null;
  departureDate?: string | null;
  fixedNights?: number;
  required?: boolean;
  optional?: boolean;
  anchor?: boolean;
  fallbackMinimumNights?: number;
  fallbackIdealNights?: number;
  preferenceWeight?: number;
};

export type FinalPlan = {
  version: 1;
  origin: { name: string; coordinates?: [number, number] };
  stops: FinalPlanStop[];
  totalNights: number;
  pace?: "relaxed" | "balanced" | "fast" | "packed";
  startDate?: string;
  endDate?: string;
  constraints?: FinalPlanConstraints;
  scheduleLocks?: {
    stopIds?: string[];
    arrivalDates?: Record<string, string>;
  };
};

export type PlanValidationConfig = {
  version: string;
  fallbackMinimumNights: number;
  anchorMinimumNights: number;
  excessiveTransferMinutes: number;
  backtrackingMinimumKm: number;
  backtrackingRatio: number;
  extremeOneNightStops: Record<"relaxed" | "balanced" | "fast", number>;
};

export const DEFAULT_PLAN_VALIDATION_CONFIG: PlanValidationConfig = {
  version: "plan-validation-v1",
  fallbackMinimumNights: 1,
  anchorMinimumNights: 2,
  excessiveTransferMinutes: 600,
  backtrackingMinimumKm: 100,
  backtrackingRatio: 0.15,
  extremeOneNightStops: { relaxed: 2, balanced: 3, fast: 5 },
};

export type PlanLegEstimator = (
  from: PlannerStop | { name: string; coordinates?: [number, number] },
  to: PlannerStop,
) => EstimatedLeg;

export type ValidateFinalPlanInput = {
  plan: FinalPlan;
  structuredBrief?: StructuredTripBrief;
  nightAllocation?: NightAllocationResult;
  tripHealthFindings?: readonly TripHealthFindingInput[];
  estimateLeg?: PlanLegEstimator;
  knowledge?: Pick<DestinationKnowledgeStore, "forNightAllocation">;
  config?: PlanValidationConfig;
};

export type PlanValidationReport = {
  version: 1;
  configVersion: string;
  state: "valid" | "issues-found";
  issues: PlanValidationIssue[];
  errorCount: number;
  warningCount: number;
  hardConstraintIssueCount: number;
  checkedStopIds: string[];
  consumedContext: {
    structuredTripBrief: boolean;
    destinationKnowledge: true;
    transferImpact: true;
    nightAllocation: boolean;
    tripHealthFindingCount: number;
  };
};

type LegFact = {
  index: number;
  fromStopId?: string;
  toStopId: string;
  leg: EstimatedLeg;
  realisticMinutes: number | null;
};

const ISSUE_ORDER: Record<PlanValidationIssueCode, number> = {
  "required-stop-missing": 0,
  "fixed-start-broken": 1,
  "fixed-end-broken": 2,
  "hard-constraint-violation": 3,
  "transport-restriction-conflict": 4,
  "duplicate-stop": 5,
  "fixed-date-conflict": 6,
  "total-nights-mismatch": 7,
  "below-minimum-stay": 8,
  "minimum-stay-conflict": 9,
  "one-night-anchor-after-large-transfer": 10,
  "extreme-pacing": 11,
  "unsupported-transfer": 12,
  "excessive-travel-day-burden": 13,
  "unnecessary-backtracking": 14,
};

const normalizedPace = (pace: FinalPlan["pace"]): "relaxed" | "balanced" | "fast" => pace === "relaxed"
  ? "relaxed"
  : pace === "fast" || pace === "packed"
    ? "fast"
    : "balanced";

const unique = <T>(items: readonly T[]) => [...new Set(items)];
const issueIdPart = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "plan";

function issue(input: Omit<PlanValidationIssue, "id" | "sources" | "relatedTripHealthFindingIds"> & {
  sources?: PlanValidationSource[];
}): PlanValidationIssue {
  const identity = [input.code, ...input.stopIds, ...input.legIndexes.map(String)].map(issueIdPart).join("-");
  return {
    id: `plan-issue-${identity}`,
    ...input,
    sources: unique(input.sources ?? ["final-plan"]),
    relatedTripHealthFindingIds: [],
  };
}

export function planWithStructuredBriefConstraints(plan: FinalPlan, brief: StructuredTripBrief | undefined): FinalPlan {
  if (!brief) return plan;
  const structured = routeConstraintsFromStructuredTripBrief(brief);
  const existing = plan.constraints ?? {};
  return {
    ...plan,
    totalNights: brief.duration?.precision === "exact"
      ? Math.max(0, Math.round(brief.duration.unit === "nights" ? brief.duration.value : brief.duration.value - 1))
      : plan.totalNights,
    startDate: brief.dates.start?.value ?? plan.startDate,
    endDate: brief.dates.end?.value ?? plan.endDate,
    pace: brief.pace?.value ?? plan.pace,
    constraints: {
      ...existing,
      ...structured,
      fixedStartStopId: structured.fixedStartStopId ?? existing.fixedStartStopId,
      fixedEndStopId: structured.fixedEndStopId ?? existing.fixedEndStopId,
      maximumStops: structured.maximumStops ?? existing.maximumStops,
      requiredStopIds: unique([...(existing.requiredStopIds ?? []), ...(structured.requiredStopIds ?? [])]),
      excludedStopIds: unique([...(existing.excludedStopIds ?? []), ...(structured.excludedStopIds ?? [])]),
      optionalStopIds: existing.optionalStopIds,
      excludedTransportModes: unique([...(existing.excludedTransportModes ?? []), ...(structured.excludedTransportModes ?? [])]),
      fixedCommitments: [
        ...(existing.fixedCommitments ?? []),
        ...(structured.fixedCommitments ?? []).filter((candidate) => !(existing.fixedCommitments ?? []).some((item) => item.label === candidate.label && item.date === candidate.date)),
      ],
    },
  };
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()));
}

function nightsBetween(startDate: string, endDate: string) {
  return Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000);
}

function legsFor(plan: FinalPlan, estimateLeg: PlanLegEstimator): LegFact[] {
  const stops = plan.stops;
  const destinations = plan.origin.coordinates ? stops : stops.slice(1);
  return destinations.map((stop, offset) => {
    const index = plan.origin.coordinates ? offset : offset + 1;
    const previous = index ? stops[index - 1] : plan.origin;
    const leg = estimateLeg(previous, stop);
    return {
      index,
      fromStopId: index ? stops[index - 1]?.id : undefined,
      toStopId: stop.id,
      leg,
      realisticMinutes: transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes),
    };
  });
}

function routeDistance(origin: FinalPlan["origin"], stops: readonly FinalPlanStop[]) {
  let total = 0;
  for (let index = 0; index < stops.length; index += 1) {
    const previousCoordinates = index ? stops[index - 1]?.coordinates : origin.coordinates;
    const distance = haversineKm(previousCoordinates, stops[index]?.coordinates);
    if (distance === null) return null;
    total += distance;
  }
  return total;
}

function bestLocalRoute(plan: FinalPlan) {
  const currentDistance = routeDistance(plan.origin, plan.stops);
  if (currentDistance === null || plan.stops.length < 3) return null;
  const firstFlexible = plan.constraints?.fixedStartStopId ? 1 : 0;
  const lastFlexible = plan.constraints?.fixedEndStopId ? plan.stops.length - 2 : plan.stops.length - 1;
  let bestDistance = currentDistance;
  let bestStops = plan.stops;
  for (let start = firstFlexible; start < lastFlexible; start += 1) {
    for (let end = start + 1; end <= lastFlexible; end += 1) {
      const candidate = [
        ...plan.stops.slice(0, start),
        ...plan.stops.slice(start, end + 1).reverse(),
        ...plan.stops.slice(end + 1),
      ];
      const distance = routeDistance(plan.origin, candidate);
      if (distance !== null && distance < bestDistance) {
        bestDistance = distance;
        bestStops = candidate;
      }
    }
  }
  return { currentDistance, bestDistance, bestStopIds: bestStops.map((stop) => stop.id) };
}

function knownMinimum(
  stop: FinalPlanStop,
  knowledge: Pick<DestinationKnowledgeStore, "forNightAllocation">,
  config: PlanValidationConfig,
) {
  const guidance = knowledge.forNightAllocation(stop);
  const curated = guidance.minimumNights.status === "known" && Number.isFinite(guidance.minimumNights.value)
    ? Math.max(0, Math.round(guidance.minimumNights.value))
    : null;
  const fallback = Number.isFinite(stop.fallbackMinimumNights)
    ? Math.max(0, Math.round(stop.fallbackMinimumNights as number))
    : config.fallbackMinimumNights;
  const roles = guidance.roles.status === "known" ? guidance.roles.value : [];
  const anchor = Boolean(stop.anchor || stop.intent === "landmark" || roles.includes("anchor"));
  return {
    minimum: anchor ? Math.max(curated ?? fallback, config.anchorMinimumNights) : curated ?? fallback,
    source: curated === null ? "fallback" : "destination-knowledge",
    anchor,
  } as const;
}

function routeConstraintIssues(plan: FinalPlan, legs: readonly LegFact[], structuredBrief: StructuredTripBrief | undefined) {
  const issues: PlanValidationIssue[] = [];
  const constraints = plan.constraints;
  const ids = plan.stops.map((stop) => stop.id);
  const present = new Set(ids);
  const required = unique([...(constraints?.requiredStopIds ?? []), ...plan.stops.filter((stop) => stop.required || stop.anchor || stop.intent === "landmark").map((stop) => stop.id)]);
  const missing = required.filter((id) => !present.has(id));
  if (missing.length) {
    issues.push(issue({
      code: "required-stop-missing", severity: "error", hardConstraint: true, repairability: "none",
      message: `Required destination${missing.length === 1 ? " is" : "s are"} missing: ${missing.join(", ")}.`,
      stopIds: missing, legIndexes: [], evidence: { requiredStopIds: required },
      sources: structuredBrief ? ["structured-trip-brief", "final-plan"] : ["final-plan"],
    }));
  }

  if (constraints?.fixedStartStopId && ids[0] !== constraints.fixedStartStopId) {
    issues.push(issue({
      code: "fixed-start-broken", severity: "error", hardConstraint: true,
      repairability: present.has(constraints.fixedStartStopId) ? "automatic" : "none",
      message: `${constraints.fixedStartStopId} must remain the first stop.`, stopIds: [constraints.fixedStartStopId], legIndexes: [],
      evidence: { expectedStopId: constraints.fixedStartStopId, actualStopId: ids[0] ?? null },
      sources: structuredBrief ? ["structured-trip-brief", "final-plan"] : ["final-plan"],
    }));
  }
  if (constraints?.fixedEndStopId && ids.at(-1) !== constraints.fixedEndStopId) {
    issues.push(issue({
      code: "fixed-end-broken", severity: "error", hardConstraint: true,
      repairability: present.has(constraints.fixedEndStopId) ? "automatic" : "none",
      message: `${constraints.fixedEndStopId} must remain the final departure stop.`, stopIds: [constraints.fixedEndStopId], legIndexes: [],
      evidence: { expectedStopId: constraints.fixedEndStopId, actualStopId: ids.at(-1) ?? null },
      sources: structuredBrief ? ["structured-trip-brief", "final-plan"] : ["final-plan"],
    }));
  }

  const excluded = unique(constraints?.excludedStopIds ?? []).filter((id) => present.has(id));
  const overMaximum = constraints?.maximumStops !== undefined && plan.stops.length > constraints.maximumStops;
  const endpointConflict = Boolean(plan.stops.length > 1 && constraints?.fixedStartStopId && constraints.fixedStartStopId === constraints.fixedEndStopId);
  if (excluded.length || overMaximum || endpointConflict) {
    const protectedIds = new Set([
      ...(constraints?.requiredStopIds ?? []),
      constraints?.fixedStartStopId,
      constraints?.fixedEndStopId,
      ...(plan.scheduleLocks?.stopIds ?? []),
      ...(constraints?.fixedCommitments ?? []).flatMap((item) => item.stopId ? [item.stopId] : []),
      ...plan.stops.filter((stop) => stop.required || stop.anchor || stop.intent === "landmark" || stop.fixedNights !== undefined).map((stop) => stop.id),
    ].filter((id): id is string => Boolean(id)));
    const optionalIds = new Set([...(constraints?.optionalStopIds ?? []), ...plan.stops.filter((stop) => stop.optional).map((stop) => stop.id)]);
    const removable = plan.stops.filter((stop) => optionalIds.has(stop.id) && !protectedIds.has(stop.id)).map((stop) => stop.id);
    const excludedRepairable = excluded.every((id) => removable.includes(id));
    const overage = overMaximum ? plan.stops.length - (constraints?.maximumStops ?? plan.stops.length) : 0;
    const maximumRepairable = !overMaximum || removable.length >= overage;
    const automatic = !endpointConflict && excludedRepairable && maximumRepairable;
    const messages = [
      ...(excluded.length ? [`excluded stops remain (${excluded.join(", ")})`] : []),
      ...(overMaximum ? [`${plan.stops.length} stops exceed the maximum of ${constraints?.maximumStops}`] : []),
      ...(endpointConflict ? ["the same stop is fixed at both ends of a multi-stop route"] : []),
    ];
    issues.push(issue({
      code: "hard-constraint-violation", severity: "error", hardConstraint: true, repairability: automatic ? "automatic" : "none",
      message: `The final plan conflicts with a hard route constraint: ${messages.join("; ")}.`,
      stopIds: unique([...excluded, ...(endpointConflict && constraints?.fixedStartStopId ? [constraints.fixedStartStopId] : [])]), legIndexes: [],
      evidence: { stopCount: plan.stops.length, maximumStops: constraints?.maximumStops ?? null, excludedStopIds: excluded, removableOptionalStopIds: removable },
      sources: structuredBrief ? ["structured-trip-brief", "final-plan"] : ["final-plan"],
    }));
  }

  const forbiddenModes = new Set<EstimatedLeg["mode"]>(constraints?.excludedTransportModes ?? []);
  if (constraints?.avoidDriving) forbiddenModes.add("road");
  const transportConflicts = legs.filter(({ leg }) => forbiddenModes.has(leg.mode));
  if (transportConflicts.length) {
    issues.push(issue({
      code: "transport-restriction-conflict", severity: "error", hardConstraint: true,
      repairability: constraints?.fixedCommitments?.length ? "manual" : "automatic",
      message: "A supported transfer estimate conflicts with a hard transport restriction.",
      stopIds: unique(transportConflicts.flatMap((item) => [item.fromStopId, item.toStopId].filter((id): id is string => Boolean(id)))),
      legIndexes: transportConflicts.map((item) => item.index),
      evidence: { forbiddenModes: [...forbiddenModes], detectedModes: unique(transportConflicts.map((item) => item.leg.mode)) },
      sources: structuredBrief ? ["structured-trip-brief", "transfer-impact"] : ["final-plan", "transfer-impact"],
    }));
  }
  return issues;
}

/**
 * Independent post-generation critic. It diagnoses final plan facts against
 * explicit intent and upstream evidence, but never treats the route scorer's
 * winner or Trip Health's own findings as proof that the plan is valid.
 */
export function validateFinalPlan(input: ValidateFinalPlanInput): PlanValidationReport {
  const plan = planWithStructuredBriefConstraints(input.plan, input.structuredBrief);
  const config = input.config ?? DEFAULT_PLAN_VALIDATION_CONFIG;
  const knowledge = input.knowledge ?? destinationKnowledge;
  const estimateLeg = input.estimateLeg ?? ((from, to) => estimateLegForConstraints(from, to, plan.constraints));
  const issues: PlanValidationIssue[] = [];
  const ids = plan.stops.map((stop) => stop.id);
  const duplicateIds = unique(ids.filter((id, index) => ids.indexOf(id) !== index));
  if (duplicateIds.length) {
    const duplicateStops = plan.stops.filter((stop) => duplicateIds.includes(stop.id));
    const safe = duplicateStops.every((stop) => stop.fixedNights === undefined)
      && !duplicateIds.some((id) => plan.scheduleLocks?.stopIds?.includes(id));
    issues.push(issue({
      code: "duplicate-stop", severity: "error", hardConstraint: false, repairability: safe ? "automatic" : "manual",
      message: `The final plan repeats stable destination ${duplicateIds.join(", ")}.`, stopIds: duplicateIds, legIndexes: [],
      evidence: { duplicateStopIds: duplicateIds, occurrenceCount: duplicateStops.length },
      sources: ["final-plan"],
    }));
  }

  const legs = duplicateIds.length ? [] : legsFor(plan, estimateLeg);
  issues.push(...routeConstraintIssues(plan, legs, input.structuredBrief));

  const allocatedNights = plan.stops.reduce((total, stop) => total + (Number.isFinite(stop.nights) ? Math.max(0, Math.round(stop.nights)) : 0), 0);
  const dateNights = validDate(plan.startDate) && validDate(plan.endDate)
    ? nightsBetween(plan.startDate as string, plan.endDate as string)
    : null;
  if (allocatedNights !== plan.totalNights || (dateNights !== null && dateNights !== plan.totalNights)) {
    issues.push(issue({
      code: "total-nights-mismatch", severity: "error", hardConstraint: false, repairability: duplicateIds.length ? "manual" : "automatic",
      message: `${allocatedNights} allocated nights do not reconcile with the ${plan.totalNights}-night trip${dateNights !== null && dateNights !== plan.totalNights ? ` and ${dateNights}-night date window` : ""}.`,
      stopIds: ids, legIndexes: [], evidence: { allocatedNights, totalNights: plan.totalNights, dateWindowNights: dateNights },
      sources: input.nightAllocation ? ["night-allocation", "final-plan"] : ["final-plan"],
    }));
  }

  const minimums = new Map<string, ReturnType<typeof knownMinimum>>();
  if (!duplicateIds.length) {
    for (const stop of plan.stops) {
      const guidance = knownMinimum(stop, knowledge, config);
      minimums.set(stop.id, guidance);
      if (stop.nights >= guidance.minimum) continue;
      issues.push(issue({
        code: "below-minimum-stay", severity: "warning", hardConstraint: false,
        repairability: stop.fixedNights === undefined ? "automatic" : "manual",
        message: `${stop.name} has ${stop.nights} night${stop.nights === 1 ? "" : "s"}, below its ${guidance.minimum}-night planning minimum.`,
        stopIds: [stop.id], legIndexes: [], evidence: { allocatedNights: stop.nights, minimumNights: guidance.minimum, minimumSource: guidance.source, anchor: guidance.anchor },
        sources: input.nightAllocation ? ["destination-knowledge", "night-allocation", "final-plan"] : ["destination-knowledge", "final-plan"],
      }));
    }

    const requiredMinimumNights = plan.stops.reduce((total, stop) => total + (minimums.get(stop.id)?.minimum ?? 0), 0);
    if (requiredMinimumNights > plan.totalNights) {
      const protectedIds = new Set([
        ...(plan.constraints?.requiredStopIds ?? []),
        plan.constraints?.fixedStartStopId,
        plan.constraints?.fixedEndStopId,
        ...(plan.scheduleLocks?.stopIds ?? []),
        ...(plan.constraints?.fixedCommitments ?? []).flatMap((item) => item.stopId ? [item.stopId] : []),
        ...plan.stops.filter((stop) => stop.required || stop.anchor || stop.intent === "landmark" || stop.fixedNights !== undefined).map((stop) => stop.id),
      ].filter((id): id is string => Boolean(id)));
      const optionalIds = new Set([...(plan.constraints?.optionalStopIds ?? []), ...plan.stops.filter((stop) => stop.optional).map((stop) => stop.id)]);
      const removableOptionalStopIds = plan.stops
        .filter((stop) => optionalIds.has(stop.id) && !protectedIds.has(stop.id))
        .map((stop) => stop.id);
      issues.push(issue({
        code: "minimum-stay-conflict",
        severity: "warning",
        hardConstraint: false,
        repairability: removableOptionalStopIds.length ? "automatic" : "manual",
        message: `Known or fallback minimum stays require ${requiredMinimumNights} nights, ${requiredMinimumNights - plan.totalNights} more than the trip contains.`,
        stopIds: ids,
        legIndexes: [],
        evidence: {
          requiredMinimumNights,
          totalNights: plan.totalNights,
          shortfallNights: requiredMinimumNights - plan.totalNights,
          removableOptionalStopIds,
        },
        sources: input.nightAllocation ? ["destination-knowledge", "night-allocation", "final-plan"] : ["destination-knowledge", "final-plan"],
      }));
    }
  }

  const pace = normalizedPace(plan.pace);
  const oneNightStops = plan.stops.filter((stop) => stop.nights === 1);
  if (oneNightStops.length >= config.extremeOneNightStops[pace]) {
    issues.push(issue({
      code: "extreme-pacing", severity: "warning", hardConstraint: false, repairability: "automatic",
      message: `${oneNightStops.length} one-night stops make this ${pace} route unusually compressed.`,
      stopIds: oneNightStops.map((stop) => stop.id), legIndexes: [],
      evidence: { oneNightStopCount: oneNightStops.length, threshold: config.extremeOneNightStops[pace], pace },
      sources: input.nightAllocation ? ["night-allocation", "final-plan"] : ["final-plan"],
    }));
  }

  for (const fact of legs) {
    const stop = plan.stops[fact.index];
    const guidance = stop ? minimums.get(stop.id) : undefined;
    if (!stop || stop.nights !== 1 || !guidance?.anchor || (fact.realisticMinutes ?? 0) < 300) continue;
    issues.push(issue({
      code: "one-night-anchor-after-large-transfer",
      severity: "warning",
      hardConstraint: false,
      repairability: stop.fixedNights === undefined && !plan.scheduleLocks?.stopIds?.includes(stop.id) ? "automatic" : "manual",
      message: `${stop.name} is a one-night anchor after a ${Math.round((fact.realisticMinutes ?? 0) / 60)}-hour door-to-door transfer.`,
      stopIds: [stop.id],
      legIndexes: [fact.index],
      evidence: { allocatedNights: stop.nights, realisticMinutes: fact.realisticMinutes, minimumNights: guidance.minimum },
      sources: input.nightAllocation ? ["destination-knowledge", "transfer-impact", "night-allocation"] : ["destination-knowledge", "transfer-impact", "final-plan"],
    }));
  }

  for (const fact of legs) {
    const fullDay = fact.leg.transferImpact?.usableDayLoss.classification === "full-day-or-more";
    if (!fullDay && (fact.realisticMinutes ?? 0) < config.excessiveTransferMinutes) continue;
    issues.push(issue({
      code: "excessive-travel-day-burden", severity: "warning", hardConstraint: false,
      repairability: !plan.constraints?.fixedCommitments?.length && !plan.scheduleLocks?.stopIds?.length && plan.stops.length > 2 ? "automatic" : "manual",
      message: `${fact.leg.label} consumes approximately a full travel day door to door.`,
      stopIds: [fact.fromStopId, fact.toStopId].filter((id): id is string => Boolean(id)), legIndexes: [fact.index],
      evidence: { realisticMinutes: fact.realisticMinutes, mode: fact.leg.mode, confidence: fact.leg.confidence },
      sources: ["transfer-impact"],
    }));
  }

  const unsupported = legs.filter(({ leg, realisticMinutes }) => leg.confidence === "unconfirmed" || realisticMinutes === null);
  if (unsupported.length) {
    issues.push(issue({
      code: "unsupported-transfer", severity: "warning", hardConstraint: false,
      repairability: plan.constraints?.fixedCommitments?.length ? "manual" : "automatic",
      message: `${unsupported.length} transfer${unsupported.length === 1 ? " lacks" : "s lack"} enough supported data to validate the connection.`,
      stopIds: unique(unsupported.flatMap((item) => [item.fromStopId, item.toStopId].filter((id): id is string => Boolean(id)))),
      legIndexes: unsupported.map((item) => item.index), evidence: { unconfirmedLegs: unsupported.length },
      sources: ["transfer-impact"],
    }));
  }

  const localRoute = bestLocalRoute(plan);
  if (localRoute) {
    const improvementKm = localRoute.currentDistance - localRoute.bestDistance;
    const improvementRatio = localRoute.bestDistance > 0 ? improvementKm / localRoute.bestDistance : 0;
    if (improvementKm >= config.backtrackingMinimumKm && improvementRatio >= config.backtrackingRatio) {
      issues.push(issue({
        code: "unnecessary-backtracking", severity: "warning", hardConstraint: false,
        repairability: plan.constraints?.fixedCommitments?.length ? "manual" : "automatic",
        message: `A local route correction removes about ${Math.round(improvementKm)} km of avoidable geographic backtracking.`,
        stopIds: ids, legIndexes: legs.map((item) => item.index),
        evidence: { currentDistanceKm: localRoute.currentDistance, alternativeDistanceKm: localRoute.bestDistance, improvementKm: Math.round(improvementKm), suggestedStopIds: localRoute.bestStopIds },
        sources: ["candidate-scoring", "final-plan"],
      }));
    }
  }

  const commitments = plan.constraints?.fixedCommitments ?? [];
  const outOfRange = commitments.filter((commitment) => commitment.date && validDate(commitment.date)
    && validDate(plan.startDate) && validDate(plan.endDate)
    && (commitment.date < (plan.startDate as string) || commitment.date > (plan.endDate as string)));
  const invalidDates = commitments.filter((commitment) => commitment.date && !validDate(commitment.date));
  const linkedCommitmentConflicts = commitments.filter((commitment) => {
    if (!commitment.stopId) return false;
    const stop = plan.stops.find((item) => item.id === commitment.stopId);
    if (!stop) return true;
    if (!commitment.date || !validDate(commitment.date) || !validDate(stop.arrivalDate ?? undefined) || !validDate(stop.departureDate ?? undefined)) return false;
    return commitment.date < (stop.arrivalDate as string) || commitment.date >= (stop.departureDate as string);
  });
  const lockConflicts = Object.entries(plan.scheduleLocks?.arrivalDates ?? {}).filter(([stopId, date]) => {
    const stop = plan.stops.find((item) => item.id === stopId);
    return !stop || !validDate(date) || (Boolean(stop.arrivalDate) && stop.arrivalDate !== date);
  });
  const fixedNightMismatches = plan.stops.filter((stop) => stop.fixedNights !== undefined && stop.nights !== stop.fixedNights);
  if (outOfRange.length || invalidDates.length || linkedCommitmentConflicts.length || lockConflicts.length || fixedNightMismatches.length) {
    issues.push(issue({
      code: "fixed-date-conflict", severity: "error", hardConstraint: true, repairability: "manual",
      message: "A fixed commitment or protected arrival conflicts with the final trip calendar.",
      stopIds: unique([...linkedCommitmentConflicts.flatMap((item) => item.stopId ? [item.stopId] : []), ...lockConflicts.map(([stopId]) => stopId)]), legIndexes: [],
      evidence: {
        outOfRangeCommitments: outOfRange.map((item) => item.label),
        invalidCommitments: invalidDates.map((item) => item.label),
        conflictingLinkedCommitments: linkedCommitmentConflicts.map((item) => item.label),
        conflictingArrivalLocks: lockConflicts.map(([stopId]) => stopId),
        fixedNightMismatches: fixedNightMismatches.map((stop) => stop.id),
      },
      sources: input.structuredBrief ? ["structured-trip-brief", "final-plan"] : ["final-plan"],
    }));
  }

  const correlated = issues.map((item) => ({
    ...item,
    relatedTripHealthFindingIds: (input.tripHealthFindings ?? [])
      .filter((finding) => finding.issueCode === item.code
        || Boolean(finding.stopIds?.some((stopId) => item.stopIds.includes(stopId))))
      .map((finding) => finding.id),
    sources: (input.tripHealthFindings ?? []).some((finding) => finding.issueCode === item.code
      || Boolean(finding.stopIds?.some((stopId) => item.stopIds.includes(stopId))))
      ? unique([...item.sources, "trip-health" as const])
      : item.sources,
  }));
  const deduplicated = correlated.filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((left, right) => Number(right.severity === "error") - Number(left.severity === "error")
      || ISSUE_ORDER[left.code] - ISSUE_ORDER[right.code]
      || left.id.localeCompare(right.id));
  return {
    version: 1,
    configVersion: config.version,
    state: deduplicated.length ? "issues-found" : "valid",
    issues: deduplicated,
    errorCount: deduplicated.filter((item) => item.severity === "error").length,
    warningCount: deduplicated.filter((item) => item.severity === "warning").length,
    hardConstraintIssueCount: deduplicated.filter((item) => item.hardConstraint).length,
    checkedStopIds: ids,
    consumedContext: {
      structuredTripBrief: Boolean(input.structuredBrief),
      destinationKnowledge: true,
      transferImpact: true,
      nightAllocation: Boolean(input.nightAllocation),
      tripHealthFindingCount: input.tripHealthFindings?.length ?? 0,
    },
  };
}
