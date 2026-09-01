import type { RouteCandidate, RouteCandidateSource } from "./route-candidates.ts";
import type { EstimatedLeg, PlannerStop } from "./planner.ts";
import {
  aggregatePlanningConfidence,
  planningConfidenceForLegacyLeg,
  planningConfidenceRank,
  unknownPlanningConfidence,
  type PlanningConfidence,
} from "./planning-confidence.ts";
import { transferDoorToDoorMinutes, transferHeadlineMinutes } from "./transfer-impact.ts";
import { matchingTripInterests, type TripInterest } from "./trip-interest.ts";

export type RouteScoringPace = "relaxed" | "balanced" | "fast" | "packed";

export type RouteScoringPreferences = {
  pace?: RouteScoringPace;
  preferredModes?: EstimatedLeg["mode"][];
  /** A strong soft preference. It can reduce a score, but never prunes a route. */
  avoidFlights?: boolean;
  /** Canonical trip interests are a final, modest soft signal only. */
  interests?: TripInterest[];
};

export type RouteScoreComponentId =
  | "travel-efficiency"
  | "pacing"
  | "preference-fit"
  | "transport-convenience"
  | "destination-fit";

export type RouteScoreComponent = {
  id: RouteScoreComponentId;
  label: string;
  /** Normalized component score before weighting. */
  score: number;
  /** Share of the 100-point base score. */
  weight: number;
  weightedScore: number;
  reasons: string[];
};

export type RoutePenaltyCode =
  | "unnecessary-backtracking"
  | "excessive-transfer-burden"
  | "one-night-anchor"
  | "arrival-or-departure-consumes-stay"
  | "unnecessary-flight";

export type RouteScorePenalty = {
  code: RoutePenaltyCode;
  points: number;
  reason: string;
  stopIds: string[];
  legIndexes: number[];
};

export type RouteCandidateMetrics = {
  /** Realistic door-to-door total used by scoring; falls back to the legacy allowance. */
  transferMinutes: number | null;
  headlineTransferMinutes: number | null;
  distanceKm: number | null;
  travelHeavyLegs: number;
  excessiveLegs: number;
  mostDayLegs: number;
  fullDayLegs: number;
  estimatedTravelDays: number | null;
  unconfirmedLegs: number;
  lowConfidenceLegs: number;
  datedScheduleLegs: number;
  flightLegs: number;
  preferredModeLegs: number;
  meaningfulPreferenceLegs: number;
};

type CandidateScoreBase = {
  candidateIndex: number;
  stopIds: string[];
  source: RouteCandidateSource;
  matchesOriginalOrder: boolean;
  components: RouteScoreComponent[];
  penalties: RouteScorePenalty[];
  metrics: RouteCandidateMetrics;
  confidence: PlanningConfidence;
};

export type ScoredRouteCandidate = CandidateScoreBase & {
  state: "scored";
  rank: number;
  baseScore: number;
  totalScore: number;
  reasons: string[];
};

export type UnscoredRouteCandidate = CandidateScoreBase & {
  state: "insufficient-data";
  rank: null;
  baseScore: null;
  totalScore: null;
  reasons: string[];
};

export type RouteCandidateScore = ScoredRouteCandidate | UnscoredRouteCandidate;

export type RouteCandidateSelection = {
  state: "selected" | "insufficient-data";
  configVersion: string;
  winner: ScoredRouteCandidate | null;
  rankedCandidates: RouteCandidateScore[];
  explanation: string;
  confidence: PlanningConfidence;
};

export type RouteScoringConfig = {
  version: string;
  weights: Record<RouteScoreComponentId, number>;
  penalties: Record<RoutePenaltyCode, number>;
  thresholds: {
    travelHeavyMinutes: number;
    excessiveTransferMinutes: number;
    meaningfulPreferenceMinutes: number;
    meaningfulPreferenceDistanceKm: number;
    backtrackingMinimumKm: number;
    backtrackingRatio: number;
    shortFlightDistanceKm: number;
    stayTransferMinimumMinutes: number;
    stayTransferMinutesPerDay: number;
    minimumRecommendationScoreAdvantage: number;
    maximumBacktrackingTradeoffMinutes: number;
    maximumBacktrackingTradeoffRatio: number;
  };
};

/**
 * Centralized, deterministic tuning. Cost is deliberately absent because the
 * current route boundary has no dependable fare data.
 */
export const DEFAULT_ROUTE_SCORING_CONFIG: RouteScoringConfig = {
  version: "route-scoring-v3-backtracking-severity",
  weights: {
    "travel-efficiency": 0.45,
    pacing: 0.15,
    "preference-fit": 0.2,
    "transport-convenience": 0.1,
    "destination-fit": 0.1,
  },
  penalties: {
    "unnecessary-backtracking": 10,
    "excessive-transfer-burden": 8,
    "one-night-anchor": 12,
    "arrival-or-departure-consumes-stay": 8,
    "unnecessary-flight": 8,
  },
  thresholds: {
    travelHeavyMinutes: 300,
    excessiveTransferMinutes: 600,
    meaningfulPreferenceMinutes: 150,
    meaningfulPreferenceDistanceKm: 120,
    backtrackingMinimumKm: 100,
    backtrackingRatio: 0.15,
    shortFlightDistanceKm: 900,
    stayTransferMinimumMinutes: 360,
    stayTransferMinutesPerDay: 300,
    minimumRecommendationScoreAdvantage: 4,
    maximumBacktrackingTradeoffMinutes: 60,
    maximumBacktrackingTradeoffRatio: 0.05,
  },
};

type RouteOrigin = { name: string; coordinates?: [number, number] };
type LegEstimator = (from: RouteOrigin | PlannerStop, to: PlannerStop) => EstimatedLeg;
type ScoredLeg = {
  index: number;
  fromStopId?: string;
  toStopId: string;
  leg: EstimatedLeg;
  impactMinutes: number | null;
  headlineMinutes: number | null;
  usableDayFraction: number | null;
};
type CandidateFacts = {
  candidate: RouteCandidate;
  legs: ScoredLeg[];
  metrics: RouteCandidateMetrics;
  confidence: PlanningConfidence;
};

export type ScoreRouteCandidatesInput = {
  origin: RouteOrigin;
  candidates: RouteCandidate[];
  estimateLeg: LegEstimator;
  preferences?: RouteScoringPreferences;
  availableDays?: number;
  /** Explicit calendar-day allocations only. Scoring never infers per-stop stays. */
  allocations?: Record<string, number>;
  picks?: Record<string, string[]>;
  /** Only known destination evidence belongs here; absent entries are neutral. */
  interestTagsByStopId?: Record<string, readonly string[]>;
  requiredStopIds?: string[];
  fixedStartStopId?: string;
  fixedEndStopId?: string;
  config?: RouteScoringConfig;
};

const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));
const round = (value: number, places = 1) => {
  const power = 10 ** places;
  return Math.round(value * power) / power;
};
const finite = (value: number | null) => value === null ? Number.POSITIVE_INFINITY : value;
const preferredModeSet = (preferences?: RouteScoringPreferences) => new Set(
  (preferences?.preferredModes ?? []).filter((mode) => !preferences?.avoidFlights || mode !== "flight"),
);

function legsFor(origin: RouteOrigin, candidate: RouteCandidate, estimateLeg: LegEstimator): ScoredLeg[] {
  const stops = candidate.stops;
  return (origin.coordinates ? stops : stops.slice(1)).map((stop, index) => {
    const actualIndex = origin.coordinates ? index : index + 1;
    const previous = actualIndex ? stops[actualIndex - 1] : origin;
    const leg = estimateLeg(previous, stop);
    const impactMinutes = transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes);
    return {
      index: actualIndex,
      fromStopId: actualIndex ? stops[actualIndex - 1]?.id : undefined,
      toStopId: stop.id,
      leg,
      impactMinutes,
      headlineMinutes: transferHeadlineMinutes(leg.transferImpact),
      usableDayFraction: leg.transferImpact?.usableDayLoss.estimatedDayFraction
        ?? (impactMinutes === null ? null : Math.min(1, impactMinutes / 600)),
    };
  });
}

function candidateFacts(input: ScoreRouteCandidatesInput, candidate: RouteCandidate, config: RouteScoringConfig): CandidateFacts {
  const legs = legsFor(input.origin, candidate, input.estimateLeg);
  const legConfidences = legs.map(({ leg }) => leg.planningConfidence ?? planningConfidenceForLegacyLeg({
    confidence: leg.confidence,
    durationMinutes: leg.durationMinutes,
    doorToDoor: leg.transferImpact?.claimConfidence?.doorToDoor,
  }));
  const transferMinutes = legs.some(({ impactMinutes }) => impactMinutes === null)
    ? null
    : legs.reduce((total, { impactMinutes }) => total + (impactMinutes ?? 0), 0);
  const headlineTransferMinutes = legs.some(({ headlineMinutes }) => headlineMinutes === null)
    ? null
    : legs.reduce((total, { headlineMinutes }) => total + (headlineMinutes ?? 0), 0);
  const estimatedTravelDays = legs.some(({ usableDayFraction }) => usableDayFraction === null)
    ? null
    : legs.reduce((total, { usableDayFraction }) => total + (usableDayFraction ?? 0), 0);
  const distanceKm = legs.some(({ leg }) => leg.distanceKm === null)
    ? null
    : legs.reduce((total, { leg }) => total + (leg.distanceKm ?? 0), 0);
  const meaningful = legs.filter(({ leg, impactMinutes }) => (impactMinutes ?? 0) >= config.thresholds.meaningfulPreferenceMinutes
    || (leg.distanceKm ?? 0) >= config.thresholds.meaningfulPreferenceDistanceKm);
  const preferred = preferredModeSet(input.preferences);
  return {
    candidate,
    legs,
    confidence: aggregatePlanningConfidence(legConfidences.map((item) => item.overall), {
      scope: "general-route",
      reason: "Confidence in the route score based on its weakest material connection evidence.",
      confirmationReason: legConfidences.some((item) => item.schedule.scope !== "dated-service")
        ? "Confirm exact services and schedules for the traveller's dates before booking."
        : undefined,
    }),
    metrics: {
      transferMinutes,
      headlineTransferMinutes,
      distanceKm,
      travelHeavyLegs: legs.filter(({ impactMinutes }) => (impactMinutes ?? 0) >= config.thresholds.travelHeavyMinutes).length,
      excessiveLegs: legs.filter(({ impactMinutes }) => (impactMinutes ?? 0) >= config.thresholds.excessiveTransferMinutes).length,
      mostDayLegs: legs.filter(({ leg }) => leg.transferImpact?.usableDayLoss.classification === "most-of-day").length,
      fullDayLegs: legs.filter(({ leg }) => leg.transferImpact?.usableDayLoss.classification === "full-day-or-more").length,
      estimatedTravelDays,
      unconfirmedLegs: legs.filter(({ leg, impactMinutes }) => impactMinutes === null || leg.confidence === "unconfirmed").length,
      lowConfidenceLegs: legConfidences.filter((item) => item.overall.level === "low" || item.overall.level === "unknown").length,
      datedScheduleLegs: legConfidences.filter((item) => item.schedule.scope === "dated-service" && item.schedule.state === "verified").length,
      flightLegs: meaningful.filter(({ leg }) => leg.mode === "flight").length,
      preferredModeLegs: meaningful.filter(({ leg }) => preferred.has(leg.mode)).length,
      meaningfulPreferenceLegs: meaningful.length,
    },
  };
}

function component(
  id: RouteScoreComponentId,
  label: string,
  score: number,
  config: RouteScoringConfig,
  reasons: string[],
): RouteScoreComponent {
  const normalized = round(clamp(score));
  const weight = config.weights[id];
  return { id, label, score: normalized, weight, weightedScore: round(normalized * weight, 2), reasons };
}

function travelEfficiencyComponent(facts: CandidateFacts, bestMinutes: number, config: RouteScoringConfig) {
  const minutes = facts.metrics.transferMinutes;
  if (minutes === null || !Number.isFinite(bestMinutes)) {
    return component("travel-efficiency", "Travel efficiency", 0, config, ["At least one connection lacks a usable duration estimate."]);
  }
  const score = minutes === 0 ? 100 : bestMinutes === 0 ? 95 : (bestMinutes / minutes) * 100;
  return component("travel-efficiency", "Travel efficiency", score, config, [
    minutes === bestMinutes
      ? "This candidate has the lowest estimated transfer time in the viable set."
      : "This candidate uses more estimated transfer time than the most efficient viable order.",
  ]);
}

function pacingComponent(input: ScoreRouteCandidatesInput, facts: CandidateFacts, config: RouteScoringConfig) {
  const pace = input.preferences?.pace === "packed" ? "fast" : (input.preferences?.pace ?? "balanced");
  const paceMultiplier = pace === "relaxed" ? 1 : pace === "fast" ? 0.35 : 0.65;
  const heavyFriction = facts.metrics.travelHeavyLegs * 8 * paceMultiplier;
  const excessiveFriction = facts.metrics.excessiveLegs * 16 * paceMultiplier;
  if (!input.availableDays || input.availableDays < 1) {
    return component("pacing", "Pacing", 70 - heavyFriction - excessiveFriction, config, [
      "No trip window was supplied, so pacing only reflects travel-heavy connections.",
    ]);
  }
  const transferLoadDays = facts.metrics.estimatedTravelDays
    ?? facts.legs.reduce((total, { impactMinutes }) => total + Math.min(1, (impactMinutes ?? config.thresholds.excessiveTransferMinutes) / config.thresholds.excessiveTransferMinutes), 0);
  const usableWindow = Math.max(0, input.availableDays - transferLoadDays);
  const daysPerBase = usableWindow / Math.max(1, facts.candidate.stops.length);
  const target = pace === "relaxed" ? 2.5 : pace === "fast" ? 1.1 : 1.75;
  const windowScore = clamp((daysPerBase / target) * 100);
  return component("pacing", "Pacing", windowScore - heavyFriction - excessiveFriction, config, [
    windowScore >= 100
      ? `The available trip window clears the ${pace} pacing threshold after estimated transfer load.`
      : `Estimated transfer load compresses the trip below the ${pace} pacing threshold.`,
  ]);
}

function preferenceFitComponent(input: ScoreRouteCandidatesInput, facts: CandidateFacts, config: RouteScoringConfig) {
  const preferred = preferredModeSet(input.preferences);
  const meaningful = facts.legs.filter(({ leg, impactMinutes }) => (impactMinutes ?? 0) >= config.thresholds.meaningfulPreferenceMinutes
    || (leg.distanceKm ?? 0) >= config.thresholds.meaningfulPreferenceDistanceKm);
  if (!meaningful.length || (!preferred.size && !input.preferences?.avoidFlights)) {
    return component("preference-fit", "Preference fit", 100, config, [
      meaningful.length ? "No strong transport preference was supplied." : "No meaningful intercity leg needs a transport-preference comparison.",
    ]);
  }
  const scores: number[] = meaningful.map(({ leg }) => {
    if (input.preferences?.avoidFlights && leg.mode === "flight") return (leg.distanceKm ?? Number.POSITIVE_INFINITY) <= config.thresholds.shortFlightDistanceKm ? 0 : 50;
    if (preferred.has(leg.mode)) return 100;
    if (leg.mode === "road" && preferred.has("train") && (leg.distanceKm ?? Number.POSITIVE_INFINITY) < 180) return 60;
    return preferred.size ? 20 : 100;
  });
  const score = scores.reduce((total, value) => total + value, 0) / scores.length;
  const nonFlightLegs = meaningful.filter(({ leg }) => leg.mode !== "flight").length;
  return component("preference-fit", "Preference fit", score, config, [
    preferred.size
      ? facts.metrics.preferredModeLegs === meaningful.length
        ? "Every meaningful estimated leg matches a preferred transport mode."
        : `${facts.metrics.preferredModeLegs} of ${meaningful.length} meaningful estimated legs match a preferred mode.`
      : `${nonFlightLegs} of ${meaningful.length} meaningful estimated legs avoid flying.`,
  ]);
}

function transportConvenienceComponent(facts: CandidateFacts, config: RouteScoringConfig) {
  const knownModes = facts.legs.filter(({ impactMinutes }) => impactMinutes !== null).map(({ leg }) => leg.mode);
  const modeChanges = knownModes.slice(1).filter((mode, index) => mode !== knownModes[index]).length;
  const score = 100
    - facts.metrics.travelHeavyLegs * 6
    - facts.metrics.excessiveLegs * 10
    - facts.metrics.unconfirmedLegs * 20
    - facts.metrics.flightLegs * 3
    - modeChanges * 4;
  const reasons = [
    facts.metrics.travelHeavyLegs
      ? `${facts.metrics.travelHeavyLegs} estimated connection${facts.metrics.travelHeavyLegs === 1 ? " is" : "s are"} travel-heavy.`
      : "No estimated connection crosses the travel-heavy threshold.",
    ...(facts.metrics.unconfirmedLegs ? [`${facts.metrics.unconfirmedLegs} connection${facts.metrics.unconfirmedLegs === 1 ? " remains" : "s remain"} unconfirmed.`] : []),
  ];
  return component("transport-convenience", "Transport convenience", score, config, reasons);
}

function destinationFit(
  input: ScoreRouteCandidatesInput,
  facts: CandidateFacts,
  config: RouteScoringConfig,
): { score: RouteScoreComponent; penalties: RouteScorePenalty[] } {
  const anchorIds = new Set([
    ...(input.requiredStopIds ?? []),
    ...facts.candidate.stops.filter((stop) => stop.intent === "landmark" || (input.picks?.[stop.id]?.length ?? 0) >= 3).map((stop) => stop.id),
  ]);
  const penalties: RouteScorePenalty[] = [];
  let score = 100;
  const selectedInterests = input.preferences?.interests ?? [];
  const evidencedStops = facts.candidate.stops.flatMap((stop) => {
    const tags = input.interestTagsByStopId?.[stop.id];
    return tags ? [{ stop, tags }] : [];
  });
  const interestMatches = evidencedStops.filter(({ tags }) => matchingTripInterests(selectedInterests, tags).length > 0);
  const interestReasons: string[] = [];
  if (selectedInterests.length && evidencedStops.length) {
    // Destination interest contributes at most 2.5 points to the total route
    // score (25 component points at the existing 10% destination-fit weight).
    // It therefore cannot erase the scorer's four-point recommendation guard.
    score -= 25 * (1 - interestMatches.length / evidencedStops.length);
    interestReasons.push(interestMatches.length
      ? `${interestMatches.length} of ${evidencedStops.length} destinations with curated experience evidence match a selected trip interest.`
      : "Curated destination evidence does not currently match a selected trip interest, so interest fit remains a small negative signal.");
  } else if (selectedInterests.length) {
    interestReasons.push("No curated destination-interest evidence is available, so interest fit is neutral.");
  }
  if (input.allocations) {
    facts.candidate.stops.forEach((stop) => {
      const days = input.allocations?.[stop.id];
      if (!days || days < 1) return;
      if (anchorIds.has(stop.id) && days <= 1) {
        score -= 30;
        penalties.push({
          code: "one-night-anchor",
          points: config.penalties["one-night-anchor"],
          reason: `${stop.name} is an anchor but has only one explicitly allocated day.`,
          stopIds: [stop.id],
          legIndexes: [],
        });
      }
      const inbound = facts.legs.find(({ toStopId }) => toStopId === stop.id);
      const outbound = facts.legs.find(({ fromStopId }) => fromStopId === stop.id);
      const transferMinutes = (inbound?.impactMinutes ?? 0) + (outbound?.impactMinutes ?? 0);
      if (transferMinutes >= Math.max(config.thresholds.stayTransferMinimumMinutes, days * config.thresholds.stayTransferMinutesPerDay)) {
        score -= 20;
        penalties.push({
          code: "arrival-or-departure-consumes-stay",
          points: config.penalties["arrival-or-departure-consumes-stay"],
          reason: `Estimated arrival and departure travel consume a large share of the explicit stay in ${stop.name}.`,
          stopIds: [stop.id],
          legIndexes: [inbound?.index, outbound?.index].filter((index): index is number => index !== undefined),
        });
      }
    });
  }
  return {
    score: component("destination-fit", "Destination and anchor fit", score, config, [
      anchorIds.size
        ? `${anchorIds.size} required or major destination${anchorIds.size === 1 ? " is" : "s are"} preserved in this viable order.`
        : "No required anchor needs additional scoring treatment.",
      ...(!input.allocations ? ["No explicit per-stop allocation was supplied, so stay-length penalties were not inferred."] : []),
      ...interestReasons,
    ]),
    penalties,
  };
}

function explanationFor(winner: ScoredRouteCandidate, runnerUp?: ScoredRouteCandidate) {
  const route = winner.stopIds.join(" → ");
  const suffix = winner.confidence.confirmation.needed ? ` ${winner.confidence.confirmation.reason}` : "";
  if (!runnerUp) return `${route} is the only numerically scoreable viable candidate, with a deterministic score of ${winner.totalScore}.${suffix}`;
  const difference = round(winner.totalScore - runnerUp.totalScore);
  if (difference === 0) {
    const tieReason = winner.metrics.transferMinutes !== runnerUp.metrics.transferMinutes
      ? "the lower estimated transfer time"
      : winner.matchesOriginalOrder
        ? "the entered order is preserved when evidence is tied"
        : "the stable candidate order";
    return `${route} wins a score tie through ${tieReason}.${suffix}`;
  }
  const runnerComponents = new Map(runnerUp.components.map((item) => [item.id, item]));
  const strongest = winner.components
    .map((item) => ({ label: item.label.toLocaleLowerCase(), difference: item.weightedScore - (runnerComponents.get(item.id)?.weightedScore ?? 0) }))
    .filter((item) => item.difference > 0.05)
    .sort((left, right) => right.difference - left.difference)
    .slice(0, 2)
    .map((item) => item.label);
  const penaltyDifference = runnerUp.penalties.reduce((total, penalty) => total + penalty.points, 0)
    - winner.penalties.reduce((total, penalty) => total + penalty.points, 0);
  const because = [
    ...(strongest.length ? [`stronger ${strongest.join(" and ")}`] : []),
    ...(penaltyDifference > 0 ? ["fewer supported penalties"] : []),
  ];
  return `${route} scores ${difference} points above ${runnerUp.stopIds.join(" → ")}${because.length ? ` because it has ${because.join(" and ")}` : " under the same deterministic criteria"}.${suffix}`;
}

export function scoreRouteCandidates(input: ScoreRouteCandidatesInput): RouteCandidateSelection {
  const config = input.config ?? DEFAULT_ROUTE_SCORING_CONFIG;
  if (!input.candidates.length) {
    const confidence = unknownPlanningConfidence("No hard-constraint-safe route candidate is available to assess.");
    return {
      state: "insufficient-data",
      configVersion: config.version,
      winner: null,
      rankedCandidates: [],
      explanation: "No hard-constraint-safe route candidate is available to score.",
      confidence,
    };
  }

  const facts = input.candidates.map((candidate) => candidateFacts(input, candidate, config));
  const scoreable = facts.filter((item) => item.metrics.transferMinutes !== null);
  const bestMinutes = Math.min(...scoreable.map((item) => item.metrics.transferMinutes ?? Number.POSITIVE_INFINITY));
  const knownDistances = scoreable.map((item) => item.metrics.distanceKm).filter((value): value is number => value !== null);
  const bestDistance = knownDistances.length ? Math.min(...knownDistances) : null;
  const minimumFlights = scoreable.length ? Math.min(...scoreable.map((item) => item.metrics.flightLegs)) : 0;

  const results: RouteCandidateScore[] = facts.map((item) => {
    const common = {
      candidateIndex: item.candidate.metadata.candidateIndex,
      stopIds: item.candidate.stops.map((stop) => stop.id),
      source: item.candidate.source,
      matchesOriginalOrder: item.candidate.metadata.matchesOriginalOrder,
      metrics: item.metrics,
      confidence: item.confidence,
    };
    if (item.metrics.transferMinutes === null) {
      return {
        ...common,
        state: "insufficient-data" as const,
        rank: null,
        baseScore: null,
        totalScore: null,
        components: [],
        penalties: [],
        reasons: ["At least one connection lacks a usable duration, so this candidate cannot receive a numeric score."],
      };
    }

    const travel = travelEfficiencyComponent(item, bestMinutes, config);
    const pacing = pacingComponent(input, item, config);
    const preferences = preferenceFitComponent(input, item, config);
    const convenience = transportConvenienceComponent(item, config);
    const anchors = destinationFit(input, item, config);
    const components = [travel, pacing, preferences, convenience, anchors.score];
    const penalties = [...anchors.penalties];

    if (bestDistance !== null && item.metrics.distanceKm !== null) {
      const excessKm = item.metrics.distanceKm - bestDistance;
      const ratio = bestDistance > 0 ? item.metrics.distanceKm / bestDistance - 1 : 0;
      if (excessKm >= config.thresholds.backtrackingMinimumKm && ratio >= config.thresholds.backtrackingRatio) {
        const severityMultiplier = clamp(
          ratio / config.thresholds.backtrackingRatio,
          1,
          3,
        );
        penalties.push({
          code: "unnecessary-backtracking",
          points: Math.round(config.penalties["unnecessary-backtracking"] * severityMultiplier),
          reason: `This order adds ${Math.round(excessKm)} km of estimated movement versus the most direct viable geography.`,
          stopIds: item.candidate.stops.map((stop) => stop.id),
          legIndexes: item.legs.map(({ index }) => index),
        });
      }
    }
    item.legs.filter(({ impactMinutes }) => (impactMinutes ?? 0) >= config.thresholds.excessiveTransferMinutes).forEach(({ index, fromStopId, toStopId }) => {
      penalties.push({
        code: "excessive-transfer-burden",
        points: config.penalties["excessive-transfer-burden"],
        reason: "One estimated connection consumes at least ten door-to-door hours.",
        stopIds: [fromStopId, toStopId].filter((id): id is string => Boolean(id)),
        legIndexes: [index],
      });
    });
    const strongNonFlightPreference = Boolean(input.preferences?.avoidFlights)
      || Boolean(input.preferences?.preferredModes?.length && !input.preferences.preferredModes.includes("flight"));
    if (strongNonFlightPreference && item.metrics.flightLegs > minimumFlights) {
      const excessFlights = item.metrics.flightLegs - minimumFlights;
      penalties.push({
        code: "unnecessary-flight",
        points: config.penalties["unnecessary-flight"] * excessFlights,
        reason: `${excessFlights} estimated flight${excessFlights === 1 ? " is" : "s are"} avoidable within the viable candidate set under the traveller's strong transport preference.`,
        stopIds: item.candidate.stops.map((stop) => stop.id),
        legIndexes: item.legs.filter(({ leg }) => leg.mode === "flight").map(({ index }) => index),
      });
    }

    const baseScore = round(components.reduce((total, itemComponent) => total + itemComponent.weightedScore, 0));
    const penaltyPoints = penalties.reduce((total, penalty) => total + penalty.points, 0);
    return {
      ...common,
      state: "scored" as const,
      rank: 0,
      baseScore,
      totalScore: round(clamp(baseScore - penaltyPoints)),
      components,
      penalties,
      reasons: components.flatMap((itemComponent) => itemComponent.reasons),
    };
  });

  const scored = results.filter((result): result is ScoredRouteCandidate => result.state === "scored")
    .sort((left, right) => right.totalScore - left.totalScore
      || finite(left.metrics.transferMinutes) - finite(right.metrics.transferMinutes)
      || Number(right.matchesOriginalOrder) - Number(left.matchesOriginalOrder)
      || planningConfidenceRank(right.confidence) - planningConfidenceRank(left.confidence)
      || left.candidateIndex - right.candidateIndex)
    .map((result, index) => ({ ...result, rank: index + 1 }));
  const rankByCandidate = new Map(scored.map((result) => [result.candidateIndex, result]));
  const rankedCandidates = [
    ...scored,
    ...results.filter((result): result is UnscoredRouteCandidate => result.state === "insufficient-data")
      .sort((left, right) => left.candidateIndex - right.candidateIndex),
  ].map((result) => rankByCandidate.get(result.candidateIndex) ?? result);
  const winner = scored[0] ?? null;
  const confidence = winner?.confidence ?? unknownPlanningConfidence("Every viable candidate lacks enough duration evidence for a numeric score.");
  return {
    state: winner ? "selected" : "insufficient-data",
    configVersion: config.version,
    winner,
    rankedCandidates,
    explanation: winner ? explanationFor(winner, scored[1]) : "Every viable candidate lacks a usable duration for at least one connection, so no numeric winner is presented.",
    confidence,
  };
}
