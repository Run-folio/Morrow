import {
  destinationKnowledge,
  type DestinationKnowledgeStore,
  type DestinationRole,
  type KnowledgeFact,
} from "./destination-knowledge.ts";
import {
  aggregatePlanningConfidence,
  createPlanningConfidence,
  planningConfidenceFromKnowledgeFact,
  type PlanningConfidence,
} from "./planning-confidence.ts";
import type { TransferImpact } from "./transfer-impact.ts";

export type NightAllocationPace = "relaxed" | "balanced" | "fast" | "packed";

export type NightAllocationReasonCode =
  | "destination-minimum"
  | "destination-ideal"
  | "fallback-minimum"
  | "fallback-ideal"
  | "anchor-priority"
  | "required-priority"
  | "traveller-preference"
  | "transfer-recovery"
  | "pace"
  | "fixed-nights"
  | "minimum-compromise";

export type NightAllocationReason = {
  code: NightAllocationReasonCode;
  message: string;
};

export type NightAllocationConflictCode =
  | "invalid-total-nights"
  | "no-stops"
  | "duplicate-stop"
  | "fixed-nights-exceed-total"
  | "fixed-night-mismatch"
  | "minimum-stay-compromise"
  | "fixed-below-minimum"
  | "one-night-anchor";

export type NightAllocationConflict = {
  code: NightAllocationConflictCode;
  severity: "warning" | "error";
  message: string;
  stopIds: string[];
  requiredNights?: number;
  allocatedNights?: number;
  shortfallNights?: number;
};

export type NightAllocationNotice = {
  code: "unlinked-fixed-commitment";
  message: string;
  commitmentLabel: string;
};

export type NightAllocationStopInput = {
  id: string;
  name: string;
  country?: string;
  providerId?: string;
  intent?: "place" | "landmark";
  required?: boolean;
  optional?: boolean;
  anchor?: boolean;
  /** Existing traveller-authored split. It is a target, not a hard constraint. */
  preferredNights?: number;
  /** A booking or linked fixed-date stay that must not be rebalanced. */
  fixedNights?: number;
  /** Existing planner guidance used only when destination knowledge is absent. */
  fallbackMinimumNights?: number;
  fallbackIdealNights?: number;
  /** Selected places or a caller-supplied interest match can raise priority. */
  preferenceWeight?: number;
  arrivalImpact?: TransferImpact;
  departureImpact?: TransferImpact;
};

export type NightAllocationFixedCommitment = {
  label: string;
  date?: string;
  stopId?: string;
  fixedNights?: number;
};

export type NightAllocationInput = {
  totalNights: number;
  stops: readonly NightAllocationStopInput[];
  pace?: NightAllocationPace;
  fixedCommitments?: readonly NightAllocationFixedCommitment[];
  config?: NightAllocationConfig;
  knowledge?: Pick<DestinationKnowledgeStore, "forNightAllocation">;
};

export type NightGuidanceSource = "destination-knowledge" | "planner-fallback" | "morrovia-default";

export type NightAllocationStopResult = {
  stopId: string;
  name: string;
  nights: number;
  minimumNights: number;
  idealNights: number;
  targetNights: number;
  minimumSource: NightGuidanceSource;
  idealSource: NightGuidanceSource;
  roles: readonly DestinationRole[];
  isAnchor: boolean;
  isRequired: boolean;
  isFixed: boolean;
  transferDayLoss: number | null;
  confidence: {
    minimumNights: PlanningConfidence;
    idealNights: PlanningConfidence;
    allocation: PlanningConfidence;
  };
  reasons: NightAllocationReason[];
};

export type NightAllocationSuccess = {
  version: 1;
  configVersion: string;
  state: "allocated" | "compromised";
  totalAvailableNights: number;
  totalAllocatedNights: number;
  allocations: Record<string, number>;
  stops: NightAllocationStopResult[];
  conflicts: NightAllocationConflict[];
  notices: NightAllocationNotice[];
};

export type NightAllocationFailure = {
  version: 1;
  configVersion: string;
  state: "conflict";
  totalAvailableNights: number;
  totalAllocatedNights: null;
  allocations: null;
  stops: [];
  conflicts: NightAllocationConflict[];
  notices: NightAllocationNotice[];
};

export type NightAllocationResult = NightAllocationSuccess | NightAllocationFailure;

export type NightAllocationConfig = {
  version: string;
  fallbackMinimumNights: number;
  anchorMinimumNights: number;
  unknownIdealExtraNights: Record<"relaxed" | "balanced" | "fast", number>;
  idealProgress: Record<"relaxed" | "balanced" | "fast", number>;
  transferRecoveryThresholds: { oneNight: number; twoNights: number };
  priority: {
    anchor: number;
    required: number;
    landmark: number;
    hub: number;
    base: number;
    sideTrip: number;
    optional: number;
    preferencePoint: number;
    transferNight: number;
  };
  targetGapWeight: number;
  minimumFirstNightBonus: number;
  priorityMultiplier: Record<"relaxed" | "balanced" | "fast", number>;
  overflowPriorityMultiplier: Record<"relaxed" | "balanced" | "fast", number>;
  balancePenalty: Record<"relaxed" | "balanced" | "fast", number>;
};

export const DEFAULT_NIGHT_ALLOCATION_CONFIG: NightAllocationConfig = {
  version: "night-allocation-v1",
  fallbackMinimumNights: 1,
  anchorMinimumNights: 2,
  unknownIdealExtraNights: { relaxed: 2, balanced: 1, fast: 0 },
  idealProgress: { relaxed: 1, balanced: 0.6, fast: 0 },
  transferRecoveryThresholds: { oneNight: 0.75, twoNights: 1.5 },
  priority: {
    anchor: 40,
    required: 30,
    landmark: 20,
    hub: 10,
    base: 8,
    sideTrip: -8,
    optional: -16,
    preferencePoint: 4,
    transferNight: 12,
  },
  targetGapWeight: 6,
  minimumFirstNightBonus: 200,
  priorityMultiplier: { relaxed: 1.2, balanced: 1, fast: 0.25 },
  overflowPriorityMultiplier: { relaxed: 0.1, balanced: 0.1, fast: 0 },
  balancePenalty: { relaxed: 3, balanced: 7, fast: 12 },
};

type Pace = "relaxed" | "balanced" | "fast";

type PreparedStop = {
  input: NightAllocationStopInput;
  index: number;
  minimumNights: number;
  idealNights: number;
  targetNights: number;
  minimumSource: NightGuidanceSource;
  idealSource: NightGuidanceSource;
  minimumConfidence: PlanningConfidence;
  idealConfidence: PlanningConfidence;
  allocationConfidence: PlanningConfidence;
  roles: readonly DestinationRole[];
  isAnchor: boolean;
  isRequired: boolean;
  transferDayLoss: number | null;
  transferRecoveryNights: number;
  fixedNights: number | null;
  fixedMismatch: boolean;
  priority: number;
  reasons: NightAllocationReason[];
};

const nonNegativeInteger = (value: number | undefined, fallback: number) => Number.isFinite(value)
  ? Math.max(0, Math.round(value as number))
  : fallback;

const normalizedPace = (pace: NightAllocationPace | undefined): Pace => pace === "relaxed"
  ? "relaxed"
  : pace === "fast" || pace === "packed"
    ? "fast"
    : "balanced";

function knownRoles(fact: KnowledgeFact<readonly DestinationRole[]>) {
  return fact.status === "known" ? fact.value : [];
}

function impactFraction(impact: TransferImpact | undefined) {
  return impact?.usableDayLoss.estimatedDayFraction ?? null;
}

function transferLossFor(stop: NightAllocationStopInput) {
  const values = [impactFraction(stop.arrivalImpact), impactFraction(stop.departureImpact)]
    .flatMap((value) => value === null ? [] : [value]);
  return values.length ? Math.min(2, values.reduce((total, value) => total + value, 0)) : null;
}

function recoveryNights(loss: number | null, config: NightAllocationConfig) {
  if (loss === null || loss < config.transferRecoveryThresholds.oneNight) return 0;
  return loss >= config.transferRecoveryThresholds.twoNights ? 2 : 1;
}

function guidanceValue(
  knowledgeValue: KnowledgeFact<number>,
  fallbackValue: number | undefined,
  defaultValue: number,
  label: string,
): { value: number; source: NightGuidanceSource; confidence: PlanningConfidence } {
  if (knowledgeValue.status === "known" && Number.isFinite(knowledgeValue.value)) {
    return {
      value: Math.max(0, Math.round(knowledgeValue.value)),
      source: "destination-knowledge",
      confidence: planningConfidenceFromKnowledgeFact(knowledgeValue, {
        scope: "planning-rule",
        reason: `${label} comes from curated destination knowledge.`,
        confirmationReason: knowledgeValue.confidence === "estimated" ? `Treat the ${label.toLocaleLowerCase()} as planning guidance, not a verified booking rule.` : undefined,
      }),
    };
  }
  if (Number.isFinite(fallbackValue)) {
    return {
      value: nonNegativeInteger(fallbackValue, defaultValue),
      source: "planner-fallback",
      confidence: createPlanningConfidence({
        state: "estimated", level: "medium", freshness: "unknown", scope: "planning-rule", sources: [],
        reason: `${label} uses existing planner guidance because destination knowledge is unknown.`,
        confirmationReason: `Confirm whether the fallback ${label.toLocaleLowerCase()} suits this destination and trip.`,
      }),
    };
  }
  return {
    value: defaultValue,
    source: "morrovia-default",
    confidence: createPlanningConfidence({
      state: "estimated", level: "low", freshness: "unknown", scope: "planning-rule", sources: [],
      reason: `${label} uses a Morrovia default because no destination-specific fact is known.`,
      confirmationReason: `Confirm the ${label.toLocaleLowerCase()} before relying on this stay recommendation.`,
    }),
  };
}

function linkedFixedNights(input: NightAllocationInput, stop: NightAllocationStopInput) {
  const linked = input.fixedCommitments?.filter((commitment) => commitment.stopId === stop.id && commitment.fixedNights !== undefined) ?? [];
  const values = [stop.fixedNights, ...linked.map((commitment) => commitment.fixedNights)].filter((value): value is number => value !== undefined);
  if (!values.length) return { value: null, mismatch: false };
  const normalized = values.map((value) => nonNegativeInteger(value, 0));
  return { value: normalized[0], mismatch: normalized.some((value) => value !== normalized[0]) };
}

function prepareStops(input: NightAllocationInput, config: NightAllocationConfig, notices: NightAllocationNotice[]) {
  const pace = normalizedPace(input.pace);
  const knowledge = input.knowledge ?? destinationKnowledge;
  for (const commitment of input.fixedCommitments ?? []) {
    if (!commitment.stopId || commitment.fixedNights === undefined) {
      notices.push({
        code: "unlinked-fixed-commitment",
        commitmentLabel: commitment.label,
        message: `${commitment.label} remains fixed, but it is not linked to a stop and night count, so the allocator does not infer a stay from it.`,
      });
    }
  }
  return input.stops.map((stop, index): PreparedStop => {
    const guidance = knowledge.forNightAllocation(stop);
    const roles = knownRoles(guidance.roles);
    const isAnchor = Boolean(stop.anchor || stop.intent === "landmark" || roles.includes("anchor"));
    const isRequired = Boolean(stop.required || isAnchor);
    const minimumGuidance = guidanceValue(
      guidance.minimumNights,
      stop.fallbackMinimumNights,
      config.fallbackMinimumNights,
      "Minimum stay",
    );
    const minimumNights = isAnchor
      ? Math.max(minimumGuidance.value, config.anchorMinimumNights)
      : minimumGuidance.value;
    const idealGuidance = guidanceValue(
      guidance.idealNights,
      stop.fallbackIdealNights,
      minimumNights + config.unknownIdealExtraNights[pace],
      "Ideal stay",
    );
    const transferDayLoss = transferLossFor(stop);
    const transferRecoveryNights = recoveryNights(transferDayLoss, config);
    const idealNights = Math.max(minimumNights, idealGuidance.value) + transferRecoveryNights;
    const paceTarget = minimumNights + Math.round((idealNights - minimumNights) * config.idealProgress[pace]);
    const targetNights = Math.max(
      minimumNights,
      stop.preferredNights === undefined ? paceTarget : nonNegativeInteger(stop.preferredNights, paceTarget),
    );
    const fixed = linkedFixedNights(input, stop);
    const transferConfidences = [stop.arrivalImpact?.claimConfidence?.doorToDoor, stop.departureImpact?.claimConfidence?.doorToDoor]
      .filter((claim): claim is PlanningConfidence => Boolean(claim));
    const allocationConfidence = fixed.value !== null
      ? createPlanningConfidence({
          state: "structured", level: "high", freshness: "current", scope: "traveller-intent", sources: [],
          reason: "The night count is fixed by a linked traveller commitment.", confirmationReason: null,
        })
      : aggregatePlanningConfidence(
          [minimumGuidance.confidence, idealGuidance.confidence, ...transferConfidences],
          {
            scope: "planning-rule",
            reason: "Confidence in this deterministic night recommendation and its planning inputs.",
          },
        );
    let priority = 0;
    if (isAnchor) priority += config.priority.anchor;
    if (isRequired) priority += config.priority.required;
    if (stop.intent === "landmark") priority += config.priority.landmark;
    if (roles.includes("hub")) priority += config.priority.hub;
    if (roles.includes("base")) priority += config.priority.base;
    if (roles.includes("side-trip")) priority += config.priority.sideTrip;
    if (stop.optional) priority += config.priority.optional;
    priority += Math.max(0, stop.preferenceWeight ?? 0) * config.priority.preferencePoint;
    priority += transferRecoveryNights * config.priority.transferNight;
    const reasons: NightAllocationReason[] = [
      {
        code: minimumGuidance.source === "destination-knowledge" ? "destination-minimum" : "fallback-minimum",
        message: minimumGuidance.source === "destination-knowledge"
          ? `${stop.name} uses its curated ${minimumNights}-night minimum.`
          : `${stop.name} uses the existing planning fallback because no curated minimum is available.`,
      },
      {
        code: idealGuidance.source === "destination-knowledge" ? "destination-ideal" : "fallback-ideal",
        message: idealGuidance.source === "destination-knowledge"
          ? `${stop.name} has a curated ${idealGuidance.value}-night ideal before transfer recovery.`
          : `${stop.name} keeps fallback ideal-night guidance rather than inventing destination knowledge.`,
      },
      { code: "pace", message: `${pace} pace sets a ${paceTarget}-night target before traveller-authored adjustments.` },
      ...(isAnchor ? [{ code: "anchor-priority" as const, message: `${stop.name} is treated as a major anchor.` }] : []),
      ...(stop.required ? [{ code: "required-priority" as const, message: `${stop.name} is a required or must-visit stop.` }] : []),
      ...((stop.preferenceWeight ?? 0) > 0 ? [{ code: "traveller-preference" as const, message: `Traveller selections raise ${stop.name}'s allocation priority.` }] : []),
      ...(transferRecoveryNights ? [{ code: "transfer-recovery" as const, message: `${transferRecoveryNights} additional target night${transferRecoveryNights === 1 ? "" : "s"} protects time lost to arrival or departure travel.` }] : []),
      ...(fixed.value !== null ? [{ code: "fixed-nights" as const, message: `${fixed.value} night${fixed.value === 1 ? " is" : "s are"} fixed and cannot be rebalanced.` }] : []),
    ];
    return {
      input: stop,
      index,
      minimumNights,
      idealNights,
      targetNights,
      minimumSource: minimumGuidance.source,
      idealSource: idealGuidance.source,
      minimumConfidence: minimumGuidance.confidence,
      idealConfidence: idealGuidance.confidence,
      allocationConfidence,
      roles,
      isAnchor,
      isRequired,
      transferDayLoss,
      transferRecoveryNights,
      fixedNights: fixed.value,
      fixedMismatch: fixed.mismatch,
      priority,
      reasons,
    };
  });
}

function failure(
  totalNights: number,
  config: NightAllocationConfig,
  conflicts: NightAllocationConflict[],
  notices: NightAllocationNotice[],
): NightAllocationFailure {
  return {
    version: 1,
    configVersion: config.version,
    state: "conflict",
    totalAvailableNights: totalNights,
    totalAllocatedNights: null,
    allocations: null,
    stops: [],
    conflicts,
    notices,
  };
}

function bestMinimumClaim(stops: PreparedStop[], allocations: Record<string, number>, config: NightAllocationConfig) {
  return stops
    .filter((stop) => stop.fixedNights === null && allocations[stop.input.id] < stop.minimumNights)
    .map((stop) => ({
      stop,
      score: stop.priority
        + (allocations[stop.input.id] === 0 ? config.minimumFirstNightBonus : 0)
        + (stop.minimumNights - allocations[stop.input.id]) * config.targetGapWeight,
    }))
    .sort((left, right) => right.score - left.score || left.stop.index - right.stop.index)[0]?.stop;
}

function bestExtraClaim(stops: PreparedStop[], allocations: Record<string, number>, config: NightAllocationConfig, pace: Pace) {
  return stops
    .filter((stop) => stop.fixedNights === null)
    .map((stop) => {
      const current = allocations[stop.input.id];
      const gap = Math.max(0, stop.targetNights - current);
      return {
        stop,
        score: (gap > 0 ? 100 + gap * config.targetGapWeight : 0)
          + stop.priority * (gap > 0 ? config.priorityMultiplier[pace] : config.overflowPriorityMultiplier[pace])
          - current * config.balancePenalty[pace],
      };
    })
    .sort((left, right) => right.score - left.score || left.stop.index - right.stop.index)[0]?.stop;
}

/**
 * Allocate an exact trip-night budget without hiding unsupported facts.
 * Fixed stays are immutable; destination minima are protected when the budget
 * permits and returned as structured compromises when it does not.
 */
export function allocateTripNights(input: NightAllocationInput): NightAllocationResult {
  const config = input.config ?? DEFAULT_NIGHT_ALLOCATION_CONFIG;
  const totalNights = nonNegativeInteger(input.totalNights, -1);
  const notices: NightAllocationNotice[] = [];
  const conflicts: NightAllocationConflict[] = [];
  if (!Number.isFinite(input.totalNights) || input.totalNights < 0 || !Number.isInteger(input.totalNights)) {
    return failure(totalNights, config, [{
      code: "invalid-total-nights",
      severity: "error",
      message: "Total available nights must be a non-negative integer.",
      stopIds: [],
    }], notices);
  }
  if (!input.stops.length) {
    return totalNights === 0
      ? {
          version: 1,
          configVersion: config.version,
          state: "allocated",
          totalAvailableNights: 0,
          totalAllocatedNights: 0,
          allocations: {},
          stops: [],
          conflicts: [],
          notices: [],
        }
      : failure(totalNights, config, [{
          code: "no-stops",
          severity: "error",
          message: `${totalNights} nights cannot be allocated without a destination stop.`,
          stopIds: [],
        }], notices);
  }
  const duplicateIds = input.stops.filter((stop, index, all) => all.findIndex((candidate) => candidate.id === stop.id) !== index).map((stop) => stop.id);
  if (duplicateIds.length) {
    return failure(totalNights, config, [{
      code: "duplicate-stop",
      severity: "error",
      message: `Night allocation requires unique stop identities; duplicate IDs: ${[...new Set(duplicateIds)].join(", ")}.`,
      stopIds: [...new Set(duplicateIds)],
    }], notices);
  }

  const prepared = prepareStops(input, config, notices);
  for (const stop of prepared.filter((item) => item.fixedMismatch)) {
    conflicts.push({
      code: "fixed-night-mismatch",
      severity: "error",
      message: `${stop.input.name} has conflicting fixed-night commitments.`,
      stopIds: [stop.input.id],
    });
  }
  if (conflicts.some((conflict) => conflict.severity === "error")) return failure(totalNights, config, conflicts, notices);

  const fixedTotal = prepared.reduce((total, stop) => total + (stop.fixedNights ?? 0), 0);
  if (fixedTotal > totalNights) {
    return failure(totalNights, config, [{
      code: "fixed-nights-exceed-total",
      severity: "error",
      message: `${fixedTotal} fixed nights cannot fit inside the ${totalNights}-night trip.`,
      stopIds: prepared.filter((stop) => stop.fixedNights !== null).map((stop) => stop.input.id),
      requiredNights: fixedTotal,
      allocatedNights: totalNights,
      shortfallNights: fixedTotal - totalNights,
    }], notices);
  }

  const allocations = Object.fromEntries(prepared.map((stop) => [stop.input.id, stop.fixedNights ?? 0])) as Record<string, number>;
  let remaining = totalNights - fixedTotal;
  const nonFixedMinimumTotal = prepared.filter((stop) => stop.fixedNights === null).reduce((total, stop) => total + stop.minimumNights, 0);
  if (remaining >= nonFixedMinimumTotal) {
    for (const stop of prepared) {
      if (stop.fixedNights === null) allocations[stop.input.id] = stop.minimumNights;
    }
    remaining -= nonFixedMinimumTotal;
  } else {
    while (remaining > 0) {
      const stop = bestMinimumClaim(prepared, allocations, config);
      if (!stop) break;
      allocations[stop.input.id] += 1;
      remaining -= 1;
    }
  }

  const pace = normalizedPace(input.pace);
  while (remaining > 0) {
    const stop = bestExtraClaim(prepared, allocations, config, pace);
    if (!stop) break;
    allocations[stop.input.id] += 1;
    remaining -= 1;
  }

  for (const stop of prepared) {
    const allocated = allocations[stop.input.id];
    if (allocated < stop.minimumNights) {
      const fixed = stop.fixedNights !== null;
      conflicts.push({
        code: fixed ? "fixed-below-minimum" : "minimum-stay-compromise",
        severity: "warning",
        message: fixed
          ? `${stop.input.name}'s fixed ${allocated}-night stay is below its ${stop.minimumNights}-night minimum.`
          : `${stop.input.name} receives ${allocated} of its ${stop.minimumNights} minimum nights because the trip is too short.`,
        stopIds: [stop.input.id],
        requiredNights: stop.minimumNights,
        allocatedNights: allocated,
        shortfallNights: stop.minimumNights - allocated,
      });
      stop.reasons.push({ code: "minimum-compromise", message: `${stop.minimumNights - allocated} minimum night${stop.minimumNights - allocated === 1 ? "" : "s"} could not be protected.` });
    }
    if (stop.isAnchor && allocated === 1) {
      conflicts.push({
        code: "one-night-anchor",
        severity: "warning",
        message: `${stop.input.name} is a major anchor with only one night; this occurs only because the fixed or total-night constraints require it.`,
        stopIds: [stop.input.id],
        requiredNights: Math.max(2, stop.minimumNights),
        allocatedNights: 1,
        shortfallNights: Math.max(1, stop.minimumNights - 1),
      });
    }
  }

  const stopResults = prepared.map((stop): NightAllocationStopResult => ({
    stopId: stop.input.id,
    name: stop.input.name,
    nights: allocations[stop.input.id],
    minimumNights: stop.minimumNights,
    idealNights: stop.idealNights,
    targetNights: stop.targetNights,
    minimumSource: stop.minimumSource,
    idealSource: stop.idealSource,
    roles: stop.roles,
    isAnchor: stop.isAnchor,
    isRequired: stop.isRequired,
    isFixed: stop.fixedNights !== null,
    transferDayLoss: stop.transferDayLoss,
    confidence: {
      minimumNights: stop.minimumConfidence,
      idealNights: stop.idealConfidence,
      allocation: stop.allocationConfidence,
    },
    reasons: stop.reasons,
  }));
  const totalAllocatedNights = Object.values(allocations).reduce((total, nights) => total + nights, 0);
  return {
    version: 1,
    configVersion: config.version,
    state: conflicts.length ? "compromised" : "allocated",
    totalAvailableNights: totalNights,
    totalAllocatedNights,
    allocations,
    stops: stopResults,
    conflicts,
    notices,
  };
}

export function tripNightsBetween(startDate: string, endDate: string) {
  const start = +new Date(`${startDate}T00:00:00Z`);
  const end = +new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000);
}

/** Existing itinerary generation consumes calendar-day counts, not nights. */
export function calendarDayAllocationsFromNights(
  stopIds: readonly string[],
  allocations: Record<string, number>,
) {
  return Object.fromEntries(stopIds.map((stopId, index) => [
    stopId,
    Math.max(0, allocations[stopId] ?? 0) + (index === stopIds.length - 1 ? 1 : 0),
  ])) as Record<string, number>;
}
