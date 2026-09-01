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
import { matchingTripInterests, type TripInterest } from "./trip-interest.ts";

export type NightAllocationPace = "relaxed" | "balanced" | "fast" | "packed";

export type NightAllocationReasonCode =
  | "destination-minimum"
  | "destination-ideal"
  | "fallback-minimum"
  | "fallback-ideal"
  | "anchor-priority"
  | "destination-depth"
  | "gateway-stop"
  | "required-priority"
  | "traveller-preference"
  | "interest-fit"
  | "transfer-recovery"
  | "pace"
  | "fixed-nights"
  | "manual-nights"
  | "diminishing-returns"
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
  | "one-night-anchor"
  | "unallocated-nights"
  | "overallocated-nights";

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
  canonicalPlaceId?: string;
  providerId?: string;
  intent?: "place" | "landmark";
  required?: boolean;
  optional?: boolean;
  anchor?: boolean;
  /** A fixed arrival/departure gateway; it remains viable but is not assumed to be a deep stay. */
  gateway?: boolean;
  /** Existing traveller-authored split. It is a target, not a hard constraint. */
  preferredNights?: number;
  /** An explicit traveller edit. It is authoritative until deliberately cleared. */
  manualNights?: number;
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
  interests?: readonly TripInterest[];
  fixedCommitments?: readonly NightAllocationFixedCommitment[];
  config?: NightAllocationConfig;
  knowledge?: Pick<DestinationKnowledgeStore, "forNightAllocation">;
};

export type NightGuidanceSource = "destination-knowledge" | "planner-fallback" | "morrovia-default";
export type NightAllocationStopDepth = "deep" | "substantial" | "ordinary" | "single-purpose" | "gateway";

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
  isManual?: boolean;
  depth?: NightAllocationStopDepth;
  matchedInterests?: readonly TripInterest[];
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

export type NightRebalanceAutomaticChange = {
  stopId: string;
  name: string;
  direction: "added" | "removed";
  nights: number;
  beforeNights: number;
  afterNights: number;
  reason: "clear-highest-marginal-value" | "clear-lowest-marginal-value";
};

export type RebalanceTripNightsInput = NightAllocationInput & {
  /** Stable stop-bound values currently visible to the traveller. */
  currentAllocations: Readonly<Record<string, number>>;
  /** Explicit traveller edits. These IDs are immutable in this pass. */
  manualStopIds: readonly string[];
};

export type RebalanceTripNightsResult = {
  nightAllocation: NightAllocationResult;
  automaticChanges: NightRebalanceAutomaticChange[];
  /** Positive means nights remain to add; negative means nights still need removing. */
  balanceDelta: number;
  manualStopIds: string[];
};

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
  requiredSecondNightBonus: number;
  priorityMultiplier: Record<"relaxed" | "balanced" | "fast", number>;
  overflowPriorityMultiplier: Record<"relaxed" | "balanced" | "fast", number>;
  balancePenalty: Record<"relaxed" | "balanced" | "fast", number>;
  depthBaseValue: Record<NightAllocationStopDepth, number>;
  diminishingReturn: Record<NightAllocationStopDepth, number>;
  targetGapBonus: number;
  idealOverflowPenalty: number;
  interestMatchValue: number;
  maximumInterestValue: number;
  transferTaxValue: number;
  rebalanceConfidenceMargin: number;
  rebalanceMinimumReceiveValue: number;
  rebalanceMaximumDonorValue: number;
};

export const DEFAULT_NIGHT_ALLOCATION_CONFIG: NightAllocationConfig = {
  version: "night-allocation-v2-marginal-depth",
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
  requiredSecondNightBonus: 160,
  priorityMultiplier: { relaxed: 1.2, balanced: 1, fast: 0.25 },
  overflowPriorityMultiplier: { relaxed: 0.1, balanced: 0.1, fast: 0 },
  balancePenalty: { relaxed: 3, balanced: 7, fast: 12 },
  depthBaseValue: { deep: 76, substantial: 66, ordinary: 56, "single-purpose": 42, gateway: 38 },
  diminishingReturn: { deep: 9, substantial: 11, ordinary: 14, "single-purpose": 18, gateway: 20 },
  targetGapBonus: 30,
  idealOverflowPenalty: 18,
  interestMatchValue: 6,
  maximumInterestValue: 12,
  transferTaxValue: 16,
  rebalanceConfidenceMargin: 12,
  rebalanceMinimumReceiveValue: 58,
  rebalanceMaximumDonorValue: 78,
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
  isManual: boolean;
  depth: NightAllocationStopDepth;
  matchedInterests: readonly TripInterest[];
  transferDayLoss: number | null;
  transferRecoveryNights: number;
  fixedNights: number | null;
  hardFixedNights: number | null;
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

function knownStrings(fact: KnowledgeFact<readonly string[]>) {
  return fact.status === "known" ? fact.value : [];
}

function impactFraction(impact: TransferImpact | undefined) {
  return impact?.usableDayLoss.estimatedDayFraction ?? null;
}

/**
 * Charge each internal transfer once across its two adjacent stays: 70% to the
 * arrival stop and 30% to the departure stop. The first arrival is charged in
 * full because its origin is outside the stay allocation. This uses both ends
 * of a stop without counting the same route leg as two full lost days.
 */
function transferLossFor(stop: NightAllocationStopInput, index: number, stopCount: number) {
  const arrival = impactFraction(stop.arrivalImpact);
  const departure = impactFraction(stop.departureImpact);
  if (arrival === null && departure === null) return null;
  const arrivalWeight = index === 0 ? 1 : 0.7;
  const departureWeight = index === stopCount - 1 ? 1 : 0.3;
  return Math.min(1.5, (arrival ?? 0) * arrivalWeight + (departure ?? 0) * departureWeight);
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

function depthFor(input: {
  stop: NightAllocationStopInput;
  roles: readonly DestinationRole[];
  isAnchor: boolean;
  minimumNights: number;
  idealNights: number;
  idealSource: NightGuidanceSource;
}): NightAllocationStopDepth {
  if (input.stop.gateway && !input.isAnchor) return "gateway";
  if (!input.isAnchor && (input.roles.includes("side-trip") || input.stop.intent === "landmark")) return "single-purpose";
  if (input.isAnchor) return "deep";
  if (input.roles.includes("base") || (input.roles.includes("hub") && input.idealNights >= 3)) return "substantial";
  if (input.idealSource !== "morrovia-default" && input.idealNights - input.minimumNights >= 2) return "substantial";
  return "ordinary";
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
    const isAnchor = Boolean(stop.anchor || roles.includes("anchor"));
    const isRequired = Boolean(stop.required || stop.intent === "landmark" || isAnchor);
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
    const transferDayLoss = transferLossFor(stop, index, input.stops.length);
    const transferRecoveryNights = recoveryNights(transferDayLoss, config);
    const idealNights = Math.max(minimumNights, idealGuidance.value) + transferRecoveryNights;
    const paceTarget = minimumNights + Math.round((idealNights - minimumNights) * config.idealProgress[pace]);
    const targetNights = Math.max(
      minimumNights,
      stop.preferredNights === undefined ? paceTarget : nonNegativeInteger(stop.preferredNights, paceTarget),
    );
    const hardFixed = linkedFixedNights(input, stop);
    const manualNights = stop.manualNights === undefined ? null : nonNegativeInteger(stop.manualNights, 0);
    const fixedNights = hardFixed.value ?? manualNights;
    const fixedMismatch = hardFixed.mismatch || (hardFixed.value !== null && manualNights !== null && hardFixed.value !== manualNights);
    const isManual = manualNights !== null;
    const depth = depthFor({ stop, roles, isAnchor, minimumNights, idealNights, idealSource: idealGuidance.source });
    const matchedInterests = matchingTripInterests(input.interests ?? [], knownStrings(guidance.experienceTags));
    const transferConfidences = [stop.arrivalImpact?.claimConfidence?.doorToDoor, stop.departureImpact?.claimConfidence?.doorToDoor]
      .filter((claim): claim is PlanningConfidence => Boolean(claim));
    const allocationConfidence = fixedNights !== null
      ? createPlanningConfidence({
          state: "structured", level: "high", freshness: "current", scope: "traveller-intent", sources: [],
          reason: isManual ? "The night count is an explicit traveller edit." : "The night count is fixed by a linked traveller commitment.", confirmationReason: null,
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
      { code: "destination-depth", message: `${stop.name} has ${depth.replace("-", " ")} stay-depth evidence for marginal night allocation.` },
      ...(stop.gateway ? [{ code: "gateway-stop" as const, message: `${stop.name} is a fixed route gateway, so extra nights require other stay-value evidence.` }] : []),
      ...(stop.required ? [{ code: "required-priority" as const, message: `${stop.name} is a required or must-visit stop.` }] : []),
      ...((stop.preferenceWeight ?? 0) > 0 ? [{ code: "traveller-preference" as const, message: `Traveller-selected places raise ${stop.name}'s allocation priority within a bounded range.` }] : []),
      ...(matchedInterests.length ? [{ code: "interest-fit" as const, message: `${stop.name} has evidenced ${matchedInterests.join(" + ")} fit for this trip.` }] : []),
      ...(transferRecoveryNights ? [{ code: "transfer-recovery" as const, message: `${transferRecoveryNights} additional target night${transferRecoveryNights === 1 ? "" : "s"} protects usable time after weighted arrival and departure transfer loss.` }] : []),
      ...(hardFixed.value !== null ? [{ code: "fixed-nights" as const, message: `${hardFixed.value} night${hardFixed.value === 1 ? " is" : "s are"} fixed and cannot be rebalanced.` }] : []),
      ...(isManual ? [{ code: "manual-nights" as const, message: `${manualNights} night${manualNights === 1 ? " is" : "s are"} fixed by the traveller's explicit edit.` }] : []),
      { code: "diminishing-returns", message: `Each additional night in ${stop.name} is valued incrementally with bounded diminishing returns.` },
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
      isManual,
      depth,
      matchedInterests,
      transferDayLoss,
      transferRecoveryNights,
      fixedNights,
      hardFixedNights: hardFixed.value,
      fixedMismatch,
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

function marginalStayValue(stop: PreparedStop, current: number, config: NightAllocationConfig, pace: Pace) {
  if (current < stop.minimumNights) {
    return config.minimumFirstNightBonus
      + (stop.minimumNights - current) * config.targetGapWeight
      + stop.priority;
  }
  const targetGap = Math.max(0, stop.targetNights - current);
  const extraIndex = Math.max(0, current - stop.minimumNights);
  const pastIdeal = Math.max(0, current - stop.idealNights + 1);
  const interestValue = Math.min(config.maximumInterestValue, stop.matchedInterests.length * config.interestMatchValue);
  const preferenceValue = Math.min(12, Math.max(0, stop.input.preferenceWeight ?? 0) * config.priority.preferencePoint);
  const transferValue = current < stop.idealNights ? (stop.transferDayLoss ?? 0) * config.transferTaxValue : 0;
  const requiredSecondNight = stop.isRequired
    && current === 1
    && stop.idealNights >= 2
    && stop.depth !== "single-purpose"
    && stop.depth !== "gateway"
      ? config.requiredSecondNightBonus
      : 0;
  const paceDiminishing = pace === "relaxed" ? 0.8 : pace === "fast" ? 1.25 : 1;
  const roleValue = stop.priority * (targetGap > 0 ? 0.4 : 0.08);
  return config.depthBaseValue[stop.depth]
    + (targetGap > 0 ? config.targetGapBonus + targetGap * config.targetGapWeight : 0)
    + requiredSecondNight
    + roleValue
    + interestValue
    + preferenceValue
    + transferValue
    - extraIndex * config.diminishingReturn[stop.depth] * paceDiminishing
    - pastIdeal * config.idealOverflowPenalty
    - current * config.balancePenalty[pace] * 0.2;
}

function rankedExtraClaims(stops: PreparedStop[], allocations: Record<string, number>, config: NightAllocationConfig, pace: Pace) {
  return stops
    .filter((stop) => stop.fixedNights === null)
    .map((stop) => ({ stop, score: marginalStayValue(stop, allocations[stop.input.id] ?? 0, config, pace) }))
    .sort((left, right) => right.score - left.score || left.stop.index - right.stop.index);
}

function bestExtraClaim(stops: PreparedStop[], allocations: Record<string, number>, config: NightAllocationConfig, pace: Pace) {
  return rankedExtraClaims(stops, allocations, config, pace)[0]?.stop;
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
    isManual: stop.isManual,
    depth: stop.depth,
    matchedInterests: stop.matchedInterests,
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

/**
 * Reconcile a traveller-authored stay split without turning route order into a
 * hidden tie-break. Manual and hard-fixed stops are immutable. A remaining
 * night moves only when the best marginal recipient/donor clears both the
 * absolute safety threshold and the configured margin over the runner-up.
 */
export function rebalanceTripNights(input: RebalanceTripNightsInput): RebalanceTripNightsResult {
  const config = input.config ?? DEFAULT_NIGHT_ALLOCATION_CONFIG;
  const totalNights = nonNegativeInteger(input.totalNights, -1);
  const notices: NightAllocationNotice[] = [];
  const manualSet = new Set(input.manualStopIds);
  const manualStopIds = input.stops.map((stop) => stop.id).filter((id) => manualSet.has(id));
  const finish = (
    nightAllocation: NightAllocationResult,
    automaticChanges: NightRebalanceAutomaticChange[] = [],
  ): RebalanceTripNightsResult => ({
    nightAllocation,
    automaticChanges,
    balanceDelta: nightAllocation.totalAllocatedNights === null ? 0 : totalNights - nightAllocation.totalAllocatedNights,
    manualStopIds,
  });
  if (!Number.isFinite(input.totalNights) || input.totalNights < 0 || !Number.isInteger(input.totalNights)) {
    return finish(failure(totalNights, config, [{ code: "invalid-total-nights", severity: "error", message: "Total available nights must be a non-negative integer.", stopIds: [] }], notices));
  }
  if (!input.stops.length) {
    if (totalNights !== 0) return finish(failure(totalNights, config, [{ code: "no-stops", severity: "error", message: `${totalNights} nights cannot be allocated without a destination stop.`, stopIds: [] }], notices));
    return finish({ version: 1, configVersion: config.version, state: "allocated", totalAvailableNights: 0, totalAllocatedNights: 0, allocations: {}, stops: [], conflicts: [], notices: [] });
  }
  const duplicateIds = input.stops.filter((stop, index, all) => all.findIndex((candidate) => candidate.id === stop.id) !== index).map((stop) => stop.id);
  if (duplicateIds.length) {
    return finish(failure(totalNights, config, [{ code: "duplicate-stop", severity: "error", message: `Night allocation requires unique stop identities; duplicate IDs: ${[...new Set(duplicateIds)].join(", ")}.`, stopIds: [...new Set(duplicateIds)] }], notices));
  }

  const canonicalInput: NightAllocationInput = {
    ...input,
    stops: input.stops.map((stop) => manualSet.has(stop.id)
      ? { ...stop, manualNights: nonNegativeInteger(input.currentAllocations[stop.id] ?? stop.manualNights, 0) }
      : { ...stop, manualNights: undefined }),
  };
  const prepared = prepareStops(canonicalInput, config, notices);
  const mismatches = prepared.filter((stop) => stop.fixedMismatch);
  if (mismatches.length) {
    return finish(failure(totalNights, config, mismatches.map((stop) => ({
      code: "fixed-night-mismatch" as const,
      severity: "error" as const,
      message: `${stop.input.name} has conflicting traveller and fixed-night commitments.`,
      stopIds: [stop.input.id],
    })), notices));
  }
  const hardFixedTotal = prepared.reduce((total, stop) => total + (stop.hardFixedNights ?? 0), 0);
  if (hardFixedTotal > totalNights) {
    return finish(failure(totalNights, config, [{
      code: "fixed-nights-exceed-total",
      severity: "error",
      message: `${hardFixedTotal} fixed nights cannot fit inside the ${totalNights}-night trip.`,
      stopIds: prepared.filter((stop) => stop.hardFixedNights !== null).map((stop) => stop.input.id),
      requiredNights: hardFixedTotal,
      allocatedNights: totalNights,
      shortfallNights: hardFixedTotal - totalNights,
    }], notices));
  }

  const allocations = Object.fromEntries(prepared.map((stop) => [
    stop.input.id,
    stop.fixedNights ?? nonNegativeInteger(input.currentAllocations[stop.input.id], 0),
  ])) as Record<string, number>;
  const before = { ...allocations };
  const pace = normalizedPace(input.pace);
  let balanceDelta = totalNights - Object.values(allocations).reduce((total, value) => total + value, 0);
  const initialBalanceDelta = balanceDelta;

  while (balanceDelta > 0) {
    const ranked = rankedExtraClaims(prepared, allocations, config, pace);
    const best = ranked[0];
    const second = ranked[1];
    const clear = Boolean(best)
      && best!.score >= config.rebalanceMinimumReceiveValue
      && (!second || best!.score - second.score >= config.rebalanceConfidenceMargin);
    if (!clear || !best) break;
    allocations[best.stop.input.id] += 1;
    balanceDelta -= 1;
  }

  while (balanceDelta < 0) {
    const ranked = prepared
      .filter((stop) => stop.fixedNights === null && (allocations[stop.input.id] ?? 0) > stop.minimumNights)
      .map((stop) => ({
        stop,
        score: marginalStayValue(stop, (allocations[stop.input.id] ?? 0) - 1, config, pace),
      }))
      .sort((left, right) => left.score - right.score || left.stop.index - right.stop.index);
    const best = ranked[0];
    const second = ranked[1];
    const clear = Boolean(best)
      && best!.score <= config.rebalanceMaximumDonorValue
      && (!second || second.score - best!.score >= config.rebalanceConfidenceMargin);
    if (!clear || !best) break;
    allocations[best.stop.input.id] -= 1;
    balanceDelta += 1;
  }

  // When the budget is already exact, allow only a clearly beneficial
  // one-night swap between unlocked stops. This lets changed canonical
  // interests/transfer evidence affect flexible nights without recomputing or
  // clearing traveller-fixed counts. The bounded loop terminates as marginal
  // returns converge.
  let swapBudget = totalNights + prepared.length;
  while (initialBalanceDelta === 0 && balanceDelta === 0 && swapBudget > 0) {
    swapBudget -= 1;
    const receivers = rankedExtraClaims(prepared, allocations, config, pace);
    const donors = prepared
      .filter((stop) => stop.fixedNights === null && (allocations[stop.input.id] ?? 0) > stop.minimumNights)
      .map((stop) => ({
        stop,
        score: marginalStayValue(stop, (allocations[stop.input.id] ?? 0) - 1, config, pace),
      }));
    const swaps = receivers.flatMap((receiver) => donors
      .filter((donor) => donor.stop.input.id !== receiver.stop.input.id)
      .map((donor) => ({ receiver, donor, improvement: receiver.score - donor.score })))
      .sort((left, right) => right.improvement - left.improvement
        || left.receiver.stop.index - right.receiver.stop.index
        || left.donor.stop.index - right.donor.stop.index);
    const swap = swaps[0];
    const runnerUp = swaps[1];
    const clear = Boolean(swap)
      && swap!.improvement >= config.rebalanceConfidenceMargin
      && (!runnerUp || swap!.improvement - runnerUp.improvement >= config.rebalanceConfidenceMargin);
    if (!clear || !swap) break;
    allocations[swap.donor.stop.input.id] -= 1;
    allocations[swap.receiver.stop.input.id] += 1;
  }

  const automaticChanges = prepared.flatMap((stop): NightRebalanceAutomaticChange[] => {
    if (stop.fixedNights !== null) return [];
    const beforeNights = before[stop.input.id] ?? 0;
    const afterNights = allocations[stop.input.id] ?? 0;
    if (beforeNights === afterNights) return [];
    const direction = afterNights > beforeNights ? "added" as const : "removed" as const;
    return [{
      stopId: stop.input.id,
      name: stop.input.name,
      direction,
      nights: Math.abs(afterNights - beforeNights),
      beforeNights,
      afterNights,
      reason: direction === "added" ? "clear-highest-marginal-value" : "clear-lowest-marginal-value",
    }];
  });
  const conflicts: NightAllocationConflict[] = [];
  for (const stop of prepared) {
    const allocated = allocations[stop.input.id] ?? 0;
    if (allocated < stop.minimumNights) {
      conflicts.push({
        code: stop.fixedNights !== null ? "fixed-below-minimum" : "minimum-stay-compromise",
        severity: "warning",
        message: stop.fixedNights !== null
          ? `${stop.input.name}'s fixed ${allocated}-night stay is below its ${stop.minimumNights}-night minimum.`
          : `${stop.input.name} receives ${allocated} of its ${stop.minimumNights} minimum nights because the trip is too short.`,
        stopIds: [stop.input.id],
        requiredNights: stop.minimumNights,
        allocatedNights: allocated,
        shortfallNights: stop.minimumNights - allocated,
      });
    }
    if (stop.isAnchor && allocated === 1) {
      conflicts.push({
        code: "one-night-anchor",
        severity: "warning",
        message: `${stop.input.name} is a major anchor with only one night; this occurs only because fixed or total-night constraints require it.`,
        stopIds: [stop.input.id],
        requiredNights: Math.max(2, stop.minimumNights),
        allocatedNights: 1,
        shortfallNights: Math.max(1, stop.minimumNights - 1),
      });
    }
  }
  const totalAllocatedNights = Object.values(allocations).reduce((total, nights) => total + nights, 0);
  if (totalAllocatedNights < totalNights) {
    conflicts.push({
      code: "unallocated-nights",
      severity: "warning",
      message: `${totalNights - totalAllocatedNights} night${totalNights - totalAllocatedNights === 1 ? " is" : "s are"} left to add because no unlocked destination has a materially stronger marginal claim.`,
      stopIds: [],
      requiredNights: totalNights,
      allocatedNights: totalAllocatedNights,
      shortfallNights: totalNights - totalAllocatedNights,
    });
  } else if (totalAllocatedNights > totalNights) {
    conflicts.push({
      code: "overallocated-nights",
      severity: "warning",
      message: `${totalAllocatedNights - totalNights} night${totalAllocatedNights - totalNights === 1 ? " needs" : "s need"} to be removed because no safe unlocked donor is materially clearer.`,
      stopIds: [],
      requiredNights: totalNights,
      allocatedNights: totalAllocatedNights,
      shortfallNights: totalAllocatedNights - totalNights,
    });
  }
  const stops = prepared.map((stop): NightAllocationStopResult => ({
    stopId: stop.input.id,
    name: stop.input.name,
    nights: allocations[stop.input.id] ?? 0,
    minimumNights: stop.minimumNights,
    idealNights: stop.idealNights,
    targetNights: stop.targetNights,
    minimumSource: stop.minimumSource,
    idealSource: stop.idealSource,
    roles: stop.roles,
    isAnchor: stop.isAnchor,
    isRequired: stop.isRequired,
    isFixed: stop.fixedNights !== null,
    isManual: stop.isManual,
    depth: stop.depth,
    matchedInterests: stop.matchedInterests,
    transferDayLoss: stop.transferDayLoss,
    confidence: {
      minimumNights: stop.minimumConfidence,
      idealNights: stop.idealConfidence,
      allocation: stop.allocationConfidence,
    },
    reasons: stop.reasons,
  }));
  return finish({
    version: 1,
    configVersion: config.version,
    state: conflicts.length ? "compromised" : "allocated",
    totalAvailableNights: totalNights,
    totalAllocatedNights,
    allocations,
    stops,
    conflicts,
    notices,
  }, automaticChanges);
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
