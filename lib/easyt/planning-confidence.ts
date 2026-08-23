import type { KnowledgeFact, KnowledgeSource } from "./destination-knowledge.ts";

export type PlanningConfidenceState = "verified" | "structured" | "inferred" | "estimated" | "unknown";
export type PlanningConfidenceLevel = "high" | "medium" | "low" | "unknown";
export type PlanningFreshness = "current" | "reviewed" | "stale" | "unknown";
export type PlanningVerificationScope = "dated-service" | "general-route" | "planning-rule" | "traveller-intent" | "unknown";

export type PlanningConfidenceSource = Omit<Pick<KnowledgeSource, "id" | "label" | "kind" | "supports" | "url" | "reviewedAt">, "kind"> & {
  kind: KnowledgeSource["kind"] | "traveller" | "system-default";
};

/**
 * Compact confidence metadata for a planning claim. Domain values remain in
 * their existing models; this record only explains how strongly to trust them.
 */
export type PlanningConfidence = {
  version: 1;
  state: PlanningConfidenceState;
  level: PlanningConfidenceLevel;
  freshness: PlanningFreshness;
  scope: PlanningVerificationScope;
  sources: readonly PlanningConfidenceSource[];
  reason: string;
  confirmation: {
    needed: boolean;
    reason: string | null;
  };
};

export type PlanningConfidenceOptions = {
  scope: PlanningVerificationScope;
  reason: string;
  asOfDate?: string;
  staleAfterDays?: number;
  confirmationReason?: string;
};

export type IntentProvenanceLike = {
  source: "prompt" | "builder" | "saved" | "morrovia-default";
  kind: "explicit" | "inferred" | "default";
  confidence: "high" | "medium" | "low";
  sourceText?: string;
};

export type LegacyLegConfidenceInput = {
  confidence: "high" | "medium" | "unconfirmed";
  durationMinutes: number | null;
  doorToDoor?: PlanningConfidence;
};

export type LegPlanningConfidence = {
  /** Whether a usable connection is generally plausible between these stops. */
  availability: PlanningConfidence;
  /** Whether an exact service has been verified for the traveller's dates. */
  schedule: PlanningConfidence;
  duration: PlanningConfidence;
  doorToDoor: PlanningConfidence;
  /** Confidence in using this leg for route comparison, not booking readiness. */
  overall: PlanningConfidence;
};

const STATE_RANK: Record<PlanningConfidenceState, number> = {
  unknown: 0,
  estimated: 1,
  inferred: 2,
  structured: 3,
  verified: 4,
};
const LEVEL_RANK: Record<PlanningConfidenceLevel, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
const FRESHNESS_RANK: Record<PlanningFreshness, number> = { unknown: 0, stale: 1, reviewed: 2, current: 3 };

const validDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()));

function sourceFreshness(
  sources: readonly PlanningConfidenceSource[],
  asOfDate?: string,
  staleAfterDays = 365,
): PlanningFreshness {
  const reviewed = sources.map((source) => source.reviewedAt).filter((value): value is string => validDate(value));
  if (!reviewed.length) return "unknown";
  if (!validDate(asOfDate)) return "reviewed";
  const asOf = new Date(`${asOfDate}T00:00:00Z`).getTime();
  const oldestReview = Math.min(...reviewed.map((value) => new Date(`${value}T00:00:00Z`).getTime()));
  const ageDays = Math.max(0, Math.floor((asOf - oldestReview) / 86_400_000));
  if (ageDays > staleAfterDays) return "stale";
  return sources.some((source) => source.kind === "provider" || source.kind === "official") ? "current" : "reviewed";
}

export function createPlanningConfidence(input: Omit<PlanningConfidence, "version" | "confirmation"> & {
  confirmationReason?: string | null;
}): PlanningConfidence {
  const unknown = input.state === "unknown";
  const confirmationReason = input.confirmationReason ?? (unknown ? input.reason : null);
  return {
    version: 1,
    state: input.state,
    level: unknown ? "unknown" : input.level,
    freshness: unknown ? "unknown" : input.freshness,
    scope: unknown ? "unknown" : input.scope,
    sources: input.sources,
    reason: input.reason,
    confirmation: { needed: Boolean(confirmationReason), reason: confirmationReason },
  };
}

export function unknownPlanningConfidence(reason: string): PlanningConfidence {
  return createPlanningConfidence({
    state: "unknown",
    level: "unknown",
    freshness: "unknown",
    scope: "unknown",
    sources: [],
    reason,
    confirmationReason: reason,
  });
}

export function planningConfidenceFromKnowledgeFact<T>(
  fact: KnowledgeFact<T>,
  options: PlanningConfidenceOptions,
): PlanningConfidence {
  if (fact.status === "unknown") return unknownPlanningConfidence(fact.reason);
  const state: PlanningConfidenceState = fact.confidence === "verified"
    ? "verified"
    : fact.confidence === "static"
      ? "structured"
      : "estimated";
  const level: PlanningConfidenceLevel = fact.confidence === "estimated" ? "medium" : "high";
  const freshness = sourceFreshness(fact.sources, options.asOfDate, options.staleAfterDays);
  const staleReason = freshness === "stale" ? "The supporting source is stale and needs review." : undefined;
  return createPlanningConfidence({
    state,
    level: staleReason ? "low" : level,
    freshness,
    scope: options.scope,
    sources: fact.sources,
    reason: options.reason,
    confirmationReason: staleReason ?? options.confirmationReason,
  });
}

export function planningConfidenceFromIntentProvenance(provenance: IntentProvenanceLike): PlanningConfidence {
  const source: PlanningConfidenceSource = {
    id: `trip-brief:${provenance.source}`,
    label: provenance.source === "builder" ? "Traveller builder input" : provenance.source === "prompt" ? "Traveller prompt" : provenance.source,
    kind: provenance.source === "morrovia-default" ? "system-default" : "traveller",
    supports: provenance.sourceText ? `Traveller intent from: ${provenance.sourceText}` : "Structured traveller intent.",
  };
  if (provenance.kind === "inferred") {
    return createPlanningConfidence({
      state: "inferred", level: provenance.confidence === "low" ? "low" : "medium", freshness: "current",
      scope: "traveller-intent", sources: [source], reason: "Morrovia inferred this intent from traveller language.",
      confirmationReason: "Confirm that the inferred preference matches the traveller's intent.",
    });
  }
  if (provenance.kind === "default") {
    return createPlanningConfidence({
      state: "estimated", level: "low", freshness: "unknown", scope: "traveller-intent", sources: [source],
      reason: "This value is a product default rather than traveller-confirmed intent.",
      confirmationReason: "Confirm this default with the traveller.",
    });
  }
  return createPlanningConfidence({
    state: "structured", level: provenance.confidence, freshness: "current", scope: "traveller-intent", sources: [source],
    reason: "The traveller explicitly supplied this value.", confirmationReason: null,
  });
}

export function aggregatePlanningConfidence(
  claims: readonly PlanningConfidence[],
  options: { scope: PlanningVerificationScope; reason: string; confirmationReason?: string },
): PlanningConfidence {
  if (!claims.length) return unknownPlanningConfidence("No confidence-bearing planning facts were supplied.");
  const weakestState = [...claims].sort((left, right) => STATE_RANK[left.state] - STATE_RANK[right.state])[0];
  const weakestLevel = [...claims].sort((left, right) => LEVEL_RANK[left.level] - LEVEL_RANK[right.level])[0];
  const weakestFreshness = [...claims].sort((left, right) => FRESHNESS_RANK[left.freshness] - FRESHNESS_RANK[right.freshness])[0];
  const sources = claims.flatMap((claim) => claim.sources)
    .filter((source, index, all) => all.findIndex((item) => item.id === source.id) === index);
  const inheritedConfirmation = claims.find((claim) => claim.confirmation.needed)?.confirmation.reason;
  return createPlanningConfidence({
    state: weakestState?.state ?? "unknown",
    level: weakestLevel?.level ?? "unknown",
    freshness: weakestFreshness?.freshness ?? "unknown",
    scope: options.scope,
    sources,
    reason: options.reason,
    confirmationReason: options.confirmationReason ?? inheritedConfirmation,
  });
}

export function planningConfidenceRank(confidence: PlanningConfidence) {
  return STATE_RANK[confidence.state] * 10 + LEVEL_RANK[confidence.level];
}

export function isPlanningConfidence(value: unknown): value is PlanningConfidence {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<PlanningConfidence>;
  return claim.version === 1
    && (claim.state === "verified" || claim.state === "structured" || claim.state === "inferred" || claim.state === "estimated" || claim.state === "unknown")
    && (claim.level === "high" || claim.level === "medium" || claim.level === "low" || claim.level === "unknown")
    && (claim.freshness === "current" || claim.freshness === "reviewed" || claim.freshness === "stale" || claim.freshness === "unknown")
    && Boolean(claim.confirmation && typeof claim.confirmation === "object");
}

export function legPlanningConfidenceFromMetadata(value: unknown): LegPlanningConfidence | undefined {
  if (!value || typeof value !== "object") return undefined;
  const claims = value as Partial<LegPlanningConfidence>;
  return isPlanningConfidence(claims.availability)
    && isPlanningConfidence(claims.schedule)
    && isPlanningConfidence(claims.duration)
    && isPlanningConfidence(claims.doorToDoor)
    && isPlanningConfidence(claims.overall)
    ? claims as LegPlanningConfidence
    : undefined;
}

/** Backward-compatible adapter for persisted or test legs without rich facts. */
export function planningConfidenceForLegacyLeg(input: LegacyLegConfidenceInput): LegPlanningConfidence {
  const availability = input.confidence === "high"
    ? createPlanningConfidence({
        state: "structured", level: "high", freshness: "unknown", scope: "general-route", sources: [],
        reason: "Existing route data supports the general connection.",
        confirmationReason: "Confirm the exact service for the traveller's dates.",
      })
    : input.confidence === "medium" || input.durationMinutes !== null
      ? createPlanningConfidence({
          state: "inferred", level: input.confidence === "unconfirmed" ? "low" : "medium", freshness: "unknown", scope: "general-route", sources: [],
          reason: "The connection is inferred from existing route geography or planning rules.",
          confirmationReason: "Confirm that this route operates for the traveller's dates.",
        })
      : unknownPlanningConfidence("Connection availability has not been confirmed.");
  const schedule = unknownPlanningConfidence("No date-specific transport schedule has been verified.");
  const duration = input.durationMinutes === null
    ? unknownPlanningConfidence("No supported duration is available for this connection.")
    : createPlanningConfidence({
        state: "estimated", level: input.confidence === "unconfirmed" ? "low" : "medium", freshness: "unknown", scope: "planning-rule", sources: [],
        reason: "The duration is a planning estimate, not a date-specific timetable result.",
        confirmationReason: "Confirm the current operator duration before booking.",
      });
  const doorToDoor = input.doorToDoor ?? duration;
  const overall = aggregatePlanningConfidence([availability, duration, doorToDoor], {
    scope: "general-route",
    reason: "Confidence in using this leg for route comparison.",
    confirmationReason: schedule.reason,
  });
  return { availability, schedule, duration, doorToDoor, overall };
}
