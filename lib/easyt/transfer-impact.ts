import {
  knownKnowledgeFact,
  unknownKnowledgeFact,
  type DestinationBorderFriction,
  type DestinationTransferMode,
  type KnowledgeFact,
  type KnowledgeSource,
  type TransferMinuteRange,
} from "./destination-knowledge.ts";
import { planningConfidenceFromKnowledgeFact, type PlanningConfidence } from "./planning-confidence.ts";

export type TransferImpactComponentId =
  | "origin-local"
  | "check-in-security"
  | "waiting-buffer"
  | "transport"
  | "border-immigration"
  | "connection-buffer"
  | "arrival-local";

export type TransferTimeEstimate = {
  /** A deterministic planning value. Rule-derived values are rounded to 15 minutes. */
  planningMinutes: number;
  /** Null means the source only supports a single allowance, not a defensible range. */
  rangeMinutes: TransferMinuteRange | null;
  precision: "verified-point" | "planning-allowance" | "estimated-range";
};

export type TransferImpactComponent = {
  id: TransferImpactComponentId;
  label: string;
  timing: KnowledgeFact<TransferTimeEstimate>;
  reason: string;
};

export type TransferUsableDayLoss = {
  classification: "light" | "substantial" | "most-of-day" | "full-day-or-more" | "unknown";
  estimatedDayFraction: 0.25 | 0.5 | 0.75 | 1 | null;
  reason: string;
};

export type TransferImpact = {
  version: 1;
  mode: DestinationTransferMode;
  /** In-vehicle or scheduled transport time, excluding access and processing. */
  headline: KnowledgeFact<TransferTimeEstimate>;
  /** The likely traveller-facing impact from leaving one base to reaching the next. */
  doorToDoor: KnowledgeFact<TransferTimeEstimate>;
  components: readonly TransferImpactComponent[];
  usableDayLoss: TransferUsableDayLoss;
  occursOvernight: boolean | null;
  assumptions: readonly string[];
  /** Concise claim confidence for consumers that do not need component detail. */
  claimConfidence?: {
    headline: PlanningConfidence;
    doorToDoor: PlanningConfidence;
  };
};

export type EstimateTransferImpactInput = {
  mode: DestinationTransferMode;
  headlineMinutes?: KnowledgeFact<number>;
  knownDoorToDoorMinutes?: KnowledgeFact<number>;
  knownDoorToDoorRange?: KnowledgeFact<TransferMinuteRange>;
  borderFriction?: KnowledgeFact<DestinationBorderFriction>;
  international?: boolean | null;
  connectionCount?: number | null;
  occursOvernight?: boolean | null;
};

export const TRANSFER_IMPACT_RULE_SOURCE: KnowledgeSource = {
  id: "planner:transfer-impact-rules-v1",
  label: "Morrovia deterministic transfer-impact rules",
  kind: "curated",
  supports: "Mode-specific access, processing, waiting, arrival and usable-day planning ranges.",
  reviewedAt: "2026-08-23",
};

const roundTo15 = (minutes: number) => Math.max(0, Math.round(minutes / 15) * 15);
const floorTo15 = (minutes: number) => Math.max(0, Math.floor(minutes / 15) * 15);
const ceilTo15 = (minutes: number) => Math.max(0, Math.ceil(minutes / 15) * 15);

function timingFromMinutes(fact: KnowledgeFact<number>, range?: KnowledgeFact<TransferMinuteRange>): KnowledgeFact<TransferTimeEstimate> {
  if (fact.status === "unknown") return unknownKnowledgeFact(fact.reason);
  const knownRange = range?.status === "known" ? range.value : null;
  const estimatedRange = fact.confidence === "estimated" && !knownRange
    ? { minimum: floorTo15(fact.value - 15), maximum: ceilTo15(fact.value + 15) }
    : knownRange;
  return knownKnowledgeFact({
    planningMinutes: fact.confidence === "verified" ? fact.value : roundTo15(fact.value),
    rangeMinutes: estimatedRange,
    precision: fact.confidence === "verified"
      ? "verified-point"
      : estimatedRange
        ? "estimated-range"
        : "planning-allowance",
  }, fact.confidence, fact.sources);
}

const rangeFact = (minimum: number, maximum: number) => knownKnowledgeFact<TransferTimeEstimate>({
  planningMinutes: roundTo15((minimum + maximum) / 2),
  rangeMinutes: { minimum, maximum },
  precision: "estimated-range",
}, "estimated", TRANSFER_IMPACT_RULE_SOURCE);

const zeroFact = () => knownKnowledgeFact<TransferTimeEstimate>({
  planningMinutes: 0,
  rangeMinutes: { minimum: 0, maximum: 0 },
  precision: "estimated-range",
}, "estimated", TRANSFER_IMPACT_RULE_SOURCE);

type ModeRule = {
  originLocal: [number, number];
  checkInSecurity: [number, number];
  waitingBuffer: [number, number];
  arrivalLocal: [number, number];
};

const MODE_RULES: Record<DestinationTransferMode, ModeRule> = {
  flight: { originLocal: [30, 60], checkInSecurity: [30, 60], waitingBuffer: [45, 75], arrivalLocal: [30, 60] },
  train: { originLocal: [15, 30], checkInSecurity: [0, 15], waitingBuffer: [15, 30], arrivalLocal: [15, 30] },
  road: { originLocal: [0, 15], checkInSecurity: [0, 0], waitingBuffer: [0, 15], arrivalLocal: [10, 30] },
  ferry: { originLocal: [30, 60], checkInSecurity: [15, 30], waitingBuffer: [30, 60], arrivalLocal: [30, 60] },
};

function borderRange(mode: DestinationTransferMode, friction: DestinationBorderFriction): TransferMinuteRange {
  if (friction === "none") return { minimum: 0, maximum: 0 };
  if (friction === "routine") return mode === "flight" ? { minimum: 30, maximum: 60 } : { minimum: 15, maximum: 45 };
  if (friction === "variable") return { minimum: 45, maximum: 120 };
  return { minimum: 90, maximum: 180 };
}

function component(
  id: TransferImpactComponentId,
  label: string,
  timing: KnowledgeFact<TransferTimeEstimate>,
  reason: string,
): TransferImpactComponent {
  return { id, label, timing, reason };
}

function unknownComponent(id: TransferImpactComponentId, label: string, reason: string) {
  return component(id, label, unknownKnowledgeFact(reason), reason);
}

function usableDayLoss(timing: KnowledgeFact<TransferTimeEstimate>, occursOvernight: boolean | null): TransferUsableDayLoss {
  if (timing.status === "unknown") {
    return { classification: "unknown", estimatedDayFraction: null, reason: "The door-to-door impact is unknown, so usable-day loss is not inferred." };
  }
  const minutes = timing.value.planningMinutes;
  if (occursOvernight && minutes >= 300) {
    return {
      classification: "substantial",
      estimatedDayFraction: 0.5,
      reason: "The transfer is long but occurs overnight; departure, arrival and recovery still use a substantial part of a usable day.",
    };
  }
  if (minutes < 150) return { classification: "light", estimatedDayFraction: 0.25, reason: "The estimated transfer should leave most of the day usable." };
  if (minutes < 300) return { classification: "substantial", estimatedDayFraction: 0.5, reason: "The estimated transfer uses a meaningful part of the day." };
  if (minutes < 600) return { classification: "most-of-day", estimatedDayFraction: 0.75, reason: "The estimated transfer consumes most of a normal travel day." };
  return { classification: "full-day-or-more", estimatedDayFraction: 1, reason: "The estimated transfer needs a full travel day or more." };
}

function claimConfidence(
  headline: KnowledgeFact<TransferTimeEstimate>,
  doorToDoor: KnowledgeFact<TransferTimeEstimate>,
): NonNullable<TransferImpact["claimConfidence"]> {
  return {
    headline: planningConfidenceFromKnowledgeFact(headline, {
      scope: "planning-rule",
      reason: "Confidence in the headline transport duration used for planning.",
      confirmationReason: "Confirm the operator's current duration and exact service before booking.",
    }),
    doorToDoor: planningConfidenceFromKnowledgeFact(doorToDoor, {
      scope: "planning-rule",
      reason: "Confidence in the realistic door-to-door travel-day allowance.",
      confirmationReason: "Confirm current access, processing, connection and arrival conditions before booking.",
    }),
  };
}

function knownTotalImpact(input: EstimateTransferImpactInput): TransferImpact | null {
  if (input.knownDoorToDoorMinutes?.status !== "known") return null;
  const doorToDoor = timingFromMinutes(input.knownDoorToDoorMinutes, input.knownDoorToDoorRange);
  const unsupported = "The curated source supports the total allowance but not this individual component.";
  const components = [
    unknownComponent("origin-local", "Local journey to departure point", unsupported),
    unknownComponent("check-in-security", "Check-in and security", unsupported),
    unknownComponent("waiting-buffer", "Waiting and departure buffer", unsupported),
    unknownComponent("transport", "Headline transport", "The source does not separate in-vehicle time from its door-to-door allowance."),
    unknownComponent("border-immigration", "Border and immigration", input.borderFriction?.status === "unknown" ? input.borderFriction.reason : unsupported),
    unknownComponent("connection-buffer", "Connection buffer", unsupported),
    unknownComponent("arrival-local", "Arrival to accommodation", unsupported),
  ];
  return {
    version: 1,
    mode: input.mode,
    headline: input.headlineMinutes ? timingFromMinutes(input.headlineMinutes) : unknownKnowledgeFact("The curated allowance is door-to-door and does not expose headline transport time."),
    doorToDoor,
    components,
    usableDayLoss: usableDayLoss(doorToDoor, input.occursOvernight ?? null),
    occursOvernight: input.occursOvernight ?? null,
    assumptions: [
      "The existing curated total is preserved without inventing a component breakdown.",
      ...(input.knownDoorToDoorRange?.status === "known" ? [] : ["No defensible minimum/maximum range is currently available for this allowance."]),
    ],
    claimConfidence: claimConfidence(
      input.headlineMinutes ? timingFromMinutes(input.headlineMinutes) : unknownKnowledgeFact("The curated allowance is door-to-door and does not expose headline transport time."),
      doorToDoor,
    ),
  };
}

/**
 * Build a deterministic impact estimate from an explicit headline duration or
 * preserve a curated door-to-door total. Unknown components stay unknown and
 * are not silently added to the total.
 */
export function estimateTransferImpact(input: EstimateTransferImpactInput): TransferImpact {
  const known = knownTotalImpact(input);
  if (known) return known;

  const headline = input.headlineMinutes
    ? timingFromMinutes(input.headlineMinutes)
    : unknownKnowledgeFact("Headline transport duration is not available.");
  const rules = MODE_RULES[input.mode];
  const originLocal = rangeFact(...rules.originLocal);
  const checkInSecurity = rangeFact(...rules.checkInSecurity);
  const waitingBuffer = rangeFact(...rules.waitingBuffer);
  const arrivalLocal = rangeFact(...rules.arrivalLocal);

  const border = input.international === false
    ? zeroFact()
    : input.borderFriction?.status === "known"
      ? rangeFact(borderRange(input.mode, input.borderFriction.value).minimum, borderRange(input.mode, input.borderFriction.value).maximum)
      : unknownKnowledgeFact(input.international
        ? "This is cross-border, but no stable border or immigration allowance is curated."
        : "Whether border or immigration processing applies is unknown.");

  const connectionBuffer = typeof input.connectionCount === "number"
    ? input.connectionCount <= 0
      ? zeroFact()
      : rangeFact(input.connectionCount * 45, input.connectionCount * 90)
    : input.mode === "road" && headline.status === "known" && headline.value.planningMinutes >= 240
      ? rangeFact(15, 30)
      : unknownKnowledgeFact("The route does not identify whether a timed connection is required.");

  const components: TransferImpactComponent[] = [
    component("origin-local", "Local journey to departure point", originLocal, `Mode rule for ${input.mode} access.`),
    component("check-in-security", "Check-in and security", checkInSecurity, `Mode rule for ${input.mode} processing.`),
    component("waiting-buffer", "Waiting and departure buffer", waitingBuffer, `Mode rule for ${input.mode} departure reliability.`),
    component("transport", "Headline transport", headline, "In-vehicle or scheduled transport time."),
    component("border-immigration", "Border and immigration", border, border.status === "known" ? "Explicit domestic or curated border-friction rule." : border.reason),
    component("connection-buffer", "Connection buffer", connectionBuffer, connectionBuffer.status === "known" ? "Explicit direct-route, connection or long-road-break rule." : connectionBuffer.reason),
    component("arrival-local", "Arrival to accommodation", arrivalLocal, `Mode rule for ${input.mode} arrival access.`),
  ];

  let doorToDoor: KnowledgeFact<TransferTimeEstimate>;
  const included = components.filter((item) => item.timing.status === "known");
  if (headline.status === "unknown") {
    doorToDoor = unknownKnowledgeFact("Door-to-door impact cannot be calculated without headline transport time or a curated total allowance.");
  } else {
    const ranges = included.map((item) => item.timing.status === "known"
      ? item.timing.value.rangeMinutes ?? { minimum: item.timing.value.planningMinutes, maximum: item.timing.value.planningMinutes }
      : { minimum: 0, maximum: 0 });
    const totalRange = ranges.reduce<TransferMinuteRange>((total, range) => ({
      minimum: total.minimum + range.minimum,
      maximum: total.maximum + range.maximum,
    }), { minimum: 0, maximum: 0 });
    const sources = [TRANSFER_IMPACT_RULE_SOURCE, ...headline.sources]
      .filter((source, index, all) => all.findIndex((item) => item.id === source.id) === index) as [KnowledgeSource, ...KnowledgeSource[]];
    doorToDoor = knownKnowledgeFact({
      planningMinutes: roundTo15((totalRange.minimum + totalRange.maximum) / 2),
      rangeMinutes: totalRange,
      precision: "estimated-range",
    }, "estimated", sources);
  }

  const assumptions = [
    "Mode overheads are broad planning ranges, not live schedule or queue predictions.",
    ...(border.status === "unknown" ? ["Unknown border or immigration time is excluded from the numeric total and remains visible as a limitation."] : []),
    ...(connectionBuffer.status === "unknown" ? ["Unknown connection time is excluded from the numeric total and remains visible as a limitation."] : []),
  ];
  return {
    version: 1,
    mode: input.mode,
    headline,
    doorToDoor,
    components,
    usableDayLoss: usableDayLoss(doorToDoor, input.occursOvernight ?? null),
    occursOvernight: input.occursOvernight ?? null,
    assumptions,
    claimConfidence: claimConfidence(headline, doorToDoor),
  };
}

export function transferDoorToDoorMinutes(impact: TransferImpact | undefined, fallback: number | null = null) {
  return impact?.doorToDoor.status === "known" ? impact.doorToDoor.value.planningMinutes : fallback;
}

export function transferHeadlineMinutes(impact: TransferImpact | undefined) {
  return impact?.headline.status === "known" ? impact.headline.value.planningMinutes : null;
}

export function isTransferImpact(value: unknown): value is TransferImpact {
  if (!value || typeof value !== "object") return false;
  const impact = value as Partial<TransferImpact>;
  return impact.version === 1
    && (impact.mode === "flight" || impact.mode === "train" || impact.mode === "road" || impact.mode === "ferry")
    && Boolean(impact.doorToDoor && typeof impact.doorToDoor === "object")
    && Boolean(impact.headline && typeof impact.headline === "object")
    && Array.isArray(impact.components);
}

export function transferImpactFromMetadata(value: unknown) {
  return isTransferImpact(value) ? value : undefined;
}
