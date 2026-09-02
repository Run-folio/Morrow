/**
 * The deterministic planning layer used by both the builder and saved trip
 * document. It deliberately makes its assumptions visible: travel durations
 * are planning estimates, not live timetable claims.
 */

import { generateRouteCandidates, type RouteCandidate, type RouteConstraintIssue } from "./route-candidates.ts";
import {
  destinationKnowledge,
  knownKnowledgeFact,
  type DestinationKnowledgeStore,
  type KnowledgeFact,
} from "./destination-knowledge.ts";
import {
  aggregatePlanningConfidence,
  planningConfidenceForLegacyLeg,
  planningConfidenceFromKnowledgeFact,
  unknownPlanningConfidence,
  type LegPlanningConfidence,
  type PlanningConfidence,
} from "./planning-confidence.ts";
import {
  TRANSFER_IMPACT_RULE_SOURCE,
  estimateTransferImpact,
  transferDoorToDoorMinutes,
  type TransferImpact,
} from "./transfer-impact.ts";
import {
  DEFAULT_ROUTE_SCORING_CONFIG,
  scoreRouteCandidates,
  type RouteCandidateSelection,
  type RouteScoringPreferences,
} from "./route-scoring.ts";
import { canonicalPlaceFactsMatch } from "./place-intelligence.ts";

export type PlannerPlace = {
  title: string;
  area: string;
  type: string;
  cost: number;
  tags: string[];
  description: string;
  image?: string;
  sourceUrl?: string;
  coordinates?: [number, number];
};

export type PlannerStop = {
  id: string;
  name: string;
  country: string;
  canonicalPlaceId?: string;
  countryCode?: string;
  region?: string;
  providerId?: string;
  coordinates?: [number, number];
  intent?: "place" | "landmark";
};

export type EstimatedLeg = {
  mode: "flight" | "train" | "road" | "ferry" | "unknown";
  distanceKm: number | null;
  /** Backward-compatible planning allowance retained for existing consumers. */
  durationMinutes: number | null;
  label: string;
  note: string;
  /** Identity certainty is separate from the transport-duration estimate. */
  confidence: "high" | "medium" | "unconfirmed";
  /** Typed headline and realistic travel-day impact, when inputs support it. */
  transferImpact?: TransferImpact;
  /** Rich claim confidence; optional so older persisted trip legs remain valid. */
  planningConfidence?: LegPlanningConfidence;
};

export type DestinationIntegrityIssue = {
  stopId: string;
  neighbouringStopId: string;
  distanceKm: number;
  country: string;
  reason: "canonical-mismatch" | "domestic-outlier";
};

export type DecisionAlternative = {
  id: "fastest" | "simplest" | "lower-cost" | "experience-led";
  label: string;
  mode: EstimatedLeg["mode"];
  estimatedMinutes: number | null;
  timeImpactMinutes: number | null;
  costImpact: string;
  tradeoff: string;
  recommended: boolean;
  recommendationReason?: string;
};

export type RouteOrderAssessment = {
  state: "insufficient-data" | "current-order" | "recommendation";
  currentStopIds: string[];
  recommendedStopIds: string[];
  currentTransferMinutes: number | null;
  recommendedTransferMinutes: number | null;
  improvementMinutes: number | null;
  reasons: string[];
  tradeoffs: string[];
  summary: string;
  /** Transient generation output; omitted from durable trip JSON. */
  candidates?: RouteCandidate[];
  constraintIssues?: RouteConstraintIssue[];
  scoring?: RouteCandidateSelection;
  /** Persisted concise confidence even when transient scoring detail is removed. */
  confidence?: PlanningConfidence;
};

export type StopDurationRecommendation = {
  stopId: string;
  minimumDays: number;
  recommendedDays: number;
  usableDays: number;
  arrivalMinutes: number | null;
  arrivalLoad: "light" | "substantial" | "travel-heavy" | "unknown";
  reason: string;
};

export type RouteIntelligenceAssessment = {
  route: RouteOrderAssessment;
  durations: Record<string, StopDurationRecommendation>;
  comfortableDays: number;
  shortfallDays: number;
  overload?: { suggestedCutStopId?: string; daysRecovered?: number; reason: string };
};

export type RoutePlanningConstraints = {
  fixedCommitments?: Array<{ label: string; date?: string }>;
  fixedStartStopId?: string;
  fixedEndStopId?: string;
  requiredStopIds?: string[];
  excludedStopIds?: string[];
  maximumStops?: number;
  /** Hard ceiling for any single realistic door-to-door transfer. */
  maximumTransferMinutes?: number;
  avoidDriving?: boolean;
  excludedTransportModes?: EstimatedLeg["mode"][];
  transportModes?: Array<"flight" | "train" | "drive">;
  optionalStopIds?: string[];
};

export type PlannedDay = {
  number: string;
  date: string;
  destination: string;
  title: string;
  reason: string;
  items: string[];
  type: "arrival" | "activity" | "open";
  placeTitle?: string;
  coordinates?: [number, number];
  travel?: EstimatedLeg;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function haversineKm(a?: [number, number], b?: [number, number]) {
  if (!a || !b) return null;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const rad = Math.PI / 180;
  const deltaLat = (lat2 - lat1) * rad;
  const deltaLon = (lon2 - lon1) * rad;
  const q = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
}

/**
 * A declared domestic route that jumps thousands of kilometres is almost
 * always a bad geocode, not a normal domestic flight. This deliberately does
 * not judge international legs, preserving valid long-haul trips.
 */
export function findDestinationIntegrityIssues(stops: Array<Pick<PlannerStop, "id" | "country" | "coordinates" | "canonicalPlaceId">>) {
  const issues: DestinationIntegrityIssue[] = [];
  stops.forEach((stop, index) => {
    if (!stop.canonicalPlaceId || canonicalPlaceFactsMatch(stop.canonicalPlaceId, stop)) return;
    const neighbour = stops[index > 0 ? index - 1 : index + 1] ?? stop;
    issues.push({
      stopId: stop.id,
      neighbouringStopId: neighbour.id,
      distanceKm: haversineKm(stop.coordinates, neighbour.coordinates) ?? 0,
      country: stop.country,
      reason: "canonical-mismatch",
    });
  });
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    const distanceKm = haversineKm(previous.coordinates, current.coordinates);
    if (!distanceKm || previous.country.trim().toLocaleLowerCase() !== current.country.trim().toLocaleLowerCase() || distanceKm < 3000) continue;
    if (!issues.some((issue) => issue.stopId === current.id)) {
      issues.push({ stopId: current.id, neighbouringStopId: previous.id, distanceKm, country: current.country, reason: "domestic-outlier" });
    }
  }
  return issues;
}

function withLegPlanningConfidence(
  leg: Omit<EstimatedLeg, "planningConfidence">,
  evidence: { mode?: KnowledgeFact<unknown>; duration?: KnowledgeFact<unknown> } = {},
): EstimatedLeg {
  const legacy = planningConfidenceForLegacyLeg({
    confidence: leg.confidence,
    durationMinutes: leg.durationMinutes,
    doorToDoor: leg.transferImpact?.claimConfidence?.doorToDoor,
  });
  const availability = evidence.mode
    ? planningConfidenceFromKnowledgeFact(evidence.mode, {
        scope: "general-route",
        reason: "Curated connection knowledge supports the general transport mode.",
        confirmationReason: "Confirm that this service operates on the traveller's dates.",
      })
    : legacy.availability;
  const duration = evidence.duration
    ? planningConfidenceFromKnowledgeFact(evidence.duration, {
        scope: "planning-rule",
        reason: "Confidence in the connection duration used by route planning.",
        confirmationReason: "Confirm the current operator duration before booking.",
      })
    : legacy.duration;
  const doorToDoor = leg.transferImpact?.claimConfidence?.doorToDoor ?? legacy.doorToDoor;
  const schedule = unknownPlanningConfidence("The general route may be plausible, but no exact schedule has been verified for these dates.");
  const overall = aggregatePlanningConfidence([availability, duration, doorToDoor], {
    scope: "general-route",
    reason: "Confidence in using this connection for route comparison.",
    confirmationReason: schedule.reason,
  });
  return { ...leg, planningConfidence: { availability, schedule, duration, doorToDoor, overall } };
}

/** Conservative door-to-door estimate; tells people to verify real services. */
export function estimateLeg(
  from: PlannerStop | { name: string; coordinates?: [number, number] },
  to: PlannerStop,
  knowledge: Pick<DestinationKnowledgeStore, "findTransfer"> = destinationKnowledge,
): EstimatedLeg {
  const distanceKm = haversineKm(from.coordinates, to.coordinates);
  const sameCountry = "country" in from && from.country.toLowerCase() === to.country.toLowerCase();
  const international = "country" in from ? !sameCountry : null;
  const known = knowledge.findTransfer(from, to);
  const canonicalMismatch = !canonicalPlaceFactsMatch(to.canonicalPlaceId ?? "", to)
    || ("canonicalPlaceId" in from && !canonicalPlaceFactsMatch(from.canonicalPlaceId ?? "", from));
  if (canonicalMismatch) {
    return withLegPlanningConfidence({
      mode: "unknown", distanceKm, durationMinutes: null, label: `${from.name} → ${to.name}`,
      note: `Check the saved place identity before trusting this route. Its country or coordinates contradict Morrovia's canonical place facts.`,
      confidence: "unconfirmed",
    });
  }
  if (known?.mode.status === "known" && known.planningMinutes.status === "known" && known.durationBasis.status === "known" && known.note.status === "known") {
    const transferImpact = estimateTransferImpact({
      mode: known.mode.value,
      ...(known.durationBasis.value === "headline"
        ? { headlineMinutes: known.planningMinutes }
        : { knownDoorToDoorMinutes: known.planningMinutes, knownDoorToDoorRange: known.realisticRangeMinutes }),
      borderFriction: known.borderFriction,
      international,
    });
    return withLegPlanningConfidence({
      mode: known.mode.value,
      durationMinutes: known.planningMinutes.value,
      note: known.note.value,
      distanceKm,
      label: `${from.name} → ${to.name}`,
      confidence: "high",
      transferImpact,
    }, { mode: known.mode, duration: known.planningMinutes });
  }
  if (distanceKm === null) {
    const mode = sameCountry ? "road" : "flight";
    return withLegPlanningConfidence({ mode, distanceKm: null, durationMinutes: null, label: `${from.name} → ${to.name}`, note: "Confirm the best connection before booking.", confidence: "unconfirmed", transferImpact: estimateTransferImpact({ mode, international }) });
  }
  if (distanceKm <= 45) {
    const durationMinutes = Math.max(35, Math.round(25 + distanceKm * 1.15));
    const duration = knownKnowledgeFact(durationMinutes, "estimated", TRANSFER_IMPACT_RULE_SOURCE);
    return withLegPlanningConfidence({ mode: "road", distanceKm, durationMinutes, label: `${from.name} → ${to.name}`, note: "Local transfer estimate; verify the route from your accommodation.", confidence: "medium", transferImpact: estimateTransferImpact({ mode: "road", knownDoorToDoorMinutes: duration, international, connectionCount: 0 }) }, { duration });
  }
  if (sameCountry && distanceKm <= 700) {
    const mode = distanceKm <= 180 ? "road" : "train";
    const headlineMinutes = (distanceKm / (mode === "train" ? 105 : 62)) * 60;
    const durationMinutes = Math.round((mode === "train" ? 55 : 48) + headlineMinutes);
    const headline = knownKnowledgeFact(headlineMinutes, "estimated", TRANSFER_IMPACT_RULE_SOURCE);
    return withLegPlanningConfidence({
      mode, distanceKm, durationMinutes, label: `${from.name} → ${to.name}`,
      note: "A planning estimate; compare rail and road schedules before booking.", confidence: "medium",
      transferImpact: estimateTransferImpact({
        mode,
        headlineMinutes: headline,
        international: false,
        connectionCount: mode === "road" ? 0 : null,
      }),
    }, { duration: headline });
  }
  // Cruise speed alone makes short heuristic flights look impossibly brief
  // (for example, a 400 km leg can fall near 30 minutes). Keep a conservative
  // one-hour airborne planning floor without claiming a live schedule.
  const { headlineMinutes, totalMinutes } = estimateFlightPlanningMinutes(distanceKm);
  const headline = knownKnowledgeFact(headlineMinutes, "estimated", TRANSFER_IMPACT_RULE_SOURCE);
  return withLegPlanningConfidence({
    mode: "flight", distanceKm, durationMinutes: totalMinutes, label: `${from.name} → ${to.name}`,
    note: "Door-to-door flight estimate, including airport time. Verify flight schedules before booking.", confidence: "medium",
    transferImpact: estimateTransferImpact({
      mode: "flight",
      headlineMinutes: headline,
      international,
      connectionCount: null,
    }),
  }, { duration: headline });
}

/** Broad door-to-door flight allowance used only after flight feasibility is established. */
export function estimateFlightPlanningMinutes(distanceKm: number) {
  const headlineMinutes = Math.max(60, (distanceKm / 760) * 60);
  return { headlineMinutes, totalMinutes: Math.round(180 + headlineMinutes) };
}

type TransportFeasibilityKnowledge = Pick<DestinationKnowledgeStore, "findTransfer" | "forRouteScoring">;

function ferryAccessWithoutLandConnectivity(
  stop: PlannerStop | { name: string; coordinates?: [number, number] },
  knowledge: TransportFeasibilityKnowledge,
) {
  const connectivity = knowledge.forRouteScoring(stop).connectivity;
  if (connectivity.status !== "known") return false;
  const modes = new Set(connectivity.value.map((item) => item.mode));
  return modes.has("ferry") && !modes.has("rail") && !modes.has("bus");
}

function unknownTransportLeg(
  from: PlannerStop | { name: string; coordinates?: [number, number] },
  to: PlannerStop,
  distanceKm: number | null,
  reason: string,
): EstimatedLeg {
  return withLegPlanningConfidence({
    mode: "unknown",
    distanceKm,
    durationMinutes: null,
    label: `${from.name} → ${to.name}`,
    note: `${reason} Confirm a compliant transport mode and current service before booking.`,
    confidence: "unconfirmed",
  });
}

/**
 * Applies hard transport feasibility before candidate scoring. Soft preferences
 * deliberately stay out of this boundary: they continue to influence scoring.
 */
export function estimateLegForConstraints(
  from: PlannerStop | { name: string; coordinates?: [number, number] },
  to: PlannerStop,
  constraints?: RoutePlanningConstraints,
  knowledge: TransportFeasibilityKnowledge = destinationKnowledge,
): EstimatedLeg {
  const estimated = estimateLeg(from, to, knowledge);
  const forbiddenModes = new Set<EstimatedLeg["mode"]>(constraints?.excludedTransportModes ?? []);
  if (constraints?.avoidDriving) forbiddenModes.add("road");
  if (forbiddenModes.has(estimated.mode)) {
    return unknownTransportLeg(
      from,
      to,
      estimated.distanceKm,
      `${estimated.mode === "road" && constraints?.avoidDriving ? "Driving is explicitly excluded" : `${estimated.mode} is excluded by a hard transport constraint`}, and no supported compliant alternative is known.`,
    );
  }

  // Destination-level ferry access can establish that generic road inference
  // is unsafe without establishing a direct ferry between this exact pair.
  if (estimated.mode === "road"
    && ferryAccessWithoutLandConnectivity(from, knowledge)
    && ferryAccessWithoutLandConnectivity(to, knowledge)) {
    return unknownTransportLeg(
      from,
      to,
      estimated.distanceKm,
      "Curated endpoint facts make a generic road-only connection unsupported, but they do not establish a direct ferry service.",
    );
  }
  return estimated;
}

/**
 * Planning alternatives for a consequential intercity leg. These are broad
 * door-to-door comparisons, not live services or price quotes.
 */
export function legDecisionAlternatives(
  from: PlannerStop | { name: string; country?: string; coordinates?: [number, number] },
  to: PlannerStop,
  constraints?: RoutePlanningConstraints,
): DecisionAlternative[] {
  const baseline = estimateLegForConstraints(from, to, constraints);
  const distance = baseline.distanceKm;
  if (baseline.mode === "unknown" || distance === null || distance < 120) return [];
  const sameCountry = "country" in from && Boolean(from.country) && from.country?.toLowerCase() === to.country.toLowerCase();
  const flightMinutes = Math.round(180 + (distance / 760) * 60);
  const trainMinutes = Math.round(60 + (distance / 105) * 60);
  const roadMinutes = Math.round(35 + (distance / 62) * 60);
  const candidates: Array<Omit<DecisionAlternative, "timeImpactMinutes" | "recommended" | "recommendationReason">> = [
    { id: "fastest", label: baseline.mode === "flight" ? "Fly" : baseline.mode === "train" ? "Take the train" : "Travel by road", mode: baseline.mode, estimatedMinutes: transferDoorToDoorMinutes(baseline.transferImpact, baseline.durationMinutes), costImpact: "Compare live fares", tradeoff: "Usually saves usable trip time, but may add airport or station friction." },
  ];
  if (distance <= 350 && baseline.mode !== "road") candidates.push({ id: "simplest", label: "Direct road transfer", mode: "road", estimatedMinutes: roadMinutes, costImpact: "Price not yet verified", tradeoff: "Fewer changes and decisions, even when it is not the absolute fastest." });
  if (sameCountry && distance <= 900) candidates.push(baseline.mode === "train"
    ? { id: "lower-cost", label: "Compare coach or shared road travel", mode: "road", estimatedMinutes: roadMinutes, costImpact: "May be lower-cost; verify fares", tradeoff: "Usually slower than rail, but advance fares may be easier on the budget." }
    : { id: "lower-cost", label: "Compare rail", mode: "train", estimatedMinutes: trainMinutes, costImpact: "May be lower-cost; verify fares", tradeoff: "May take longer, but avoids airport transfers and baggage friction." });
  if ((sameCountry || baseline.mode === "train") && distance <= 900) candidates.push({ id: "experience-led", label: "Make the journey part of the trip", mode: baseline.mode === "train" ? "road" : "train", estimatedMinutes: baseline.mode === "train" ? roadMinutes : trainMinutes, costImpact: "Price not yet verified", tradeoff: "More time in transit in exchange for landscape and a stronger sense of place." });
  const forbiddenModes = new Set<EstimatedLeg["mode"]>(constraints?.excludedTransportModes ?? []);
  if (constraints?.avoidDriving) forbiddenModes.add("road");
  const unique = candidates
    .filter((option) => !forbiddenModes.has(option.mode))
    .filter((option, index, all) => all.findIndex((item) => item.id === option.id) === index);
  if (!unique.length) return [];
  const fastestMinutes = Math.min(...unique.map((option) => option.estimatedMinutes ?? Number.POSITIVE_INFINITY));
  const recommendedId = distance <= 350 && unique.some((option) => option.id === "simplest") ? "simplest" : "fastest";
  return unique.map((option) => ({
    ...option,
    timeImpactMinutes: option.estimatedMinutes === null || !Number.isFinite(fastestMinutes) ? null : option.estimatedMinutes - fastestMinutes,
    recommended: option.id === recommendedId,
    recommendationReason: option.id === recommendedId ? (recommendedId === "simplest" ? "Morrovia recommends this as the least disruptive door-to-door choice." : "Morrovia recommends this to protect usable time at the destination.") : undefined,
  }));
}

function routeEstimate(
  origin: { name: string; coordinates?: [number, number] },
  stops: PlannerStop[],
  legEstimator: (from: PlannerStop | { name: string; coordinates?: [number, number] }, to: PlannerStop) => EstimatedLeg = estimateLeg,
  end?: PlannerStop,
) {
  // An origin is useful for choosing the direction of the trip, but it should
  // not prevent us from spotting an obvious loop within the requested stops.
  // Prompt-first trips often do not include a departure airport yet.
  const legs = origin.coordinates
    ? stops.map((stop, index) => legEstimator(index ? stops[index - 1] : origin, stop))
    : stops.slice(1).map((stop, index) => legEstimator(stops[index], stop));
  if (end && stops.length) legs.push(legEstimator(stops.at(-1)!, end));
  const impactMinutes = legs.map((leg) => transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes));
  if (impactMinutes.some((minutes) => minutes === null)) return { legs, minutes: null };
  return { legs, minutes: impactMinutes.reduce<number>((total, minutes) => total + (minutes ?? 0), 0) };
}

function transportTradeoffs(legs: EstimatedLeg[], constraints?: RoutePlanningConstraints) {
  const modes = new Set(legs.map((leg) => leg.mode));
  const tradeoffs: string[] = [];
  if (constraints?.avoidDriving && modes.has("road")) tradeoffs.push("Avoid driving is set, but one or more local transfers still need a rail or flight check.");
  if (constraints?.transportModes?.length) {
    const permitted = new Set<EstimatedLeg["mode"]>(constraints.transportModes.map((mode) => mode === "drive" ? "road" : mode));
    const unpreferred = [...modes].filter((mode) => !permitted.has(mode));
    if (unpreferred.length) tradeoffs.push(`This route may still need ${unpreferred.join(" or ")} transfers; compare alternatives before booking.`);
  }
  return tradeoffs;
}

/**
 * Compare the traveller's order with the smallest set of geographic alternatives.
 * This is deliberately a planning signal, not live routing or airport inventory.
 */
export function assessRouteOrder(input: {
  origin: { name: string; coordinates?: [number, number] };
  /** Hard final journey endpoint used only as terminal routing context. */
  end?: PlannerStop;
  stops: PlannerStop[];
  constraints?: RoutePlanningConstraints;
  scoringPreferences?: RouteScoringPreferences;
  availableDays?: number;
  allocations?: Record<string, number>;
  picks?: Record<string, string[]>;
}): RouteOrderAssessment {
  const currentStopIds = input.stops.map((stop) => stop.id);
  const constrainedEstimateLeg = (
    from: PlannerStop | { name: string; coordinates?: [number, number] },
    to: PlannerStop,
  ) => estimateLegForConstraints(from, to, input.constraints);
  // Candidate pruning must see the supported underlying mode. The constrained
  // wrapper deliberately turns a forbidden mode into `unknown` for downstream
  // presentation, which would otherwise hide the hard conflict from generation.
  const generation = generateRouteCandidates({ ...input, estimateLeg });
  const legacyPreferredModes = input.constraints?.transportModes?.map((mode) => mode === "drive" ? "road" as const : mode);
  const interestTagsByStopId = Object.fromEntries(input.stops.flatMap((stop) => {
    const fact = destinationKnowledge.forRouteScoring(stop).experienceTags;
    return fact.status === "known" ? [[stop.id, fact.value] as const] : [];
  }));
  const scoring = scoreRouteCandidates({
    origin: input.origin,
    end: input.end,
    candidates: generation.candidates,
    estimateLeg: constrainedEstimateLeg,
    preferences: {
      ...input.scoringPreferences,
      preferredModes: input.scoringPreferences?.preferredModes?.length ? input.scoringPreferences.preferredModes : legacyPreferredModes,
    },
    availableDays: input.availableDays,
    allocations: input.allocations,
    picks: input.picks,
    interestTagsByStopId,
    requiredStopIds: input.constraints?.requiredStopIds,
    fixedStartStopId: input.constraints?.fixedStartStopId,
    fixedEndStopId: input.constraints?.fixedEndStopId,
  });
  const candidateFields = { candidates: generation.candidates, constraintIssues: generation.constraintIssues, scoring, confidence: scoring.confidence };
  if (!generation.candidates.length) {
    return {
      state: "insufficient-data", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: null, recommendedTransferMinutes: null, improvementMinutes: null,
      reasons: [], tradeoffs: [], summary: generation.constraintIssues[0]?.message ?? "Morrovia could not create a route that preserves every hard constraint.",
      ...candidateFields,
    };
  }
  if (input.stops.length < 2 || input.stops.some((stop) => !stop.coordinates)) {
    return {
      state: "insufficient-data", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: null, recommendedTransferMinutes: null, improvementMinutes: null,
      reasons: [], tradeoffs: [], summary: "Confirm every place before Morrovia can compare the route order.",
      ...candidateFields,
    };
  }

  const current = routeEstimate(input.origin, input.stops, constrainedEstimateLeg, input.end);
  const winner = scoring.winner;
  const bestCandidate = winner ? generation.candidates.find((candidate) => candidate.metadata.candidateIndex === winner.candidateIndex) : undefined;
  const best = bestCandidate ? { candidate: bestCandidate, stops: bestCandidate.stops, ...routeEstimate(input.origin, bestCandidate.stops, constrainedEstimateLeg, input.end) } : undefined;
  if (!best || best.minutes === null) {
    return {
      state: "insufficient-data", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: current.minutes, recommendedTransferMinutes: null, improvementMinutes: null,
      reasons: [], tradeoffs: [], summary: scoring.explanation || "Morrovia could not compare this route yet.",
      ...candidateFields,
    };
  }

  // A dated commitment is a hard constraint. Until it is explicitly linked to
  // a stop and re-timed, holding the traveller's entered order is safer than
  // offering an apparently efficient route that could break a booking.
  if (input.constraints?.fixedCommitments?.length) {
    return {
      state: "current-order", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: current.minutes, recommendedTransferMinutes: current.minutes, improvementMinutes: 0,
      reasons: ["The entered order is held while a fixed date or booking is in the trip."],
      tradeoffs: ["Confirm where each fixed commitment sits before changing the route order.", ...transportTradeoffs(current.legs, input.constraints)],
      summary: "Your fixed commitments are protected.",
      ...candidateFields,
    };
  }

  const improvementMinutes = current.minutes === null ? null : Math.max(0, current.minutes - best.minutes);
  const originalViable = generation.candidates.some((candidate) => candidate.metadata.matchesOriginalOrder);
  const originalScore = scoring.rankedCandidates.find((candidate) => candidate.state === "scored" && candidate.matchesOriginalOrder);
  const scoreAdvantage = originalScore?.state === "scored" ? winner!.totalScore - originalScore.totalScore : Number.POSITIVE_INFINITY;
  const legacyMeaningful = improvementMinutes !== null && current.minutes !== null
    && improvementMinutes >= 90 && improvementMinutes / Math.max(1, current.minutes) >= 0.1;
  const timeTradeoffMinutes = current.minutes !== null && best.minutes !== null ? Math.max(0, best.minutes - current.minutes) : null;
  const replacesBacktracking = originalScore?.state === "scored"
    && originalScore.penalties.some((penalty) => penalty.code === "unnecessary-backtracking")
    && !winner!.penalties.some((penalty) => penalty.code === "unnecessary-backtracking");
  const acceptableBacktrackingTradeoff = timeTradeoffMinutes !== null && current.minutes !== null
    && replacesBacktracking
    && timeTradeoffMinutes <= DEFAULT_ROUTE_SCORING_CONFIG.thresholds.maximumBacktrackingTradeoffMinutes
    && timeTradeoffMinutes / Math.max(1, current.minutes) <= DEFAULT_ROUTE_SCORING_CONFIG.thresholds.maximumBacktrackingTradeoffRatio;
  const scoreMeaningful = scoreAdvantage >= DEFAULT_ROUTE_SCORING_CONFIG.thresholds.minimumRecommendationScoreAdvantage
    && (current.minutes === null || best.minutes <= current.minutes || acceptableBacktrackingTradeoff);
  const winnerMatchesCurrent = best.stops.every((stop, index) => stop.id === input.stops[index]?.id);
  if ((originalViable && !legacyMeaningful && !scoreMeaningful) || winnerMatchesCurrent) {
    return {
      state: "current-order", currentStopIds, recommendedStopIds: currentStopIds,
      currentTransferMinutes: current.minutes, recommendedTransferMinutes: current.minutes, improvementMinutes: 0,
      reasons: [winnerMatchesCurrent
        ? "The entered order ranks first under the current route criteria."
        : "The best alternative does not clear the meaningful-change threshold."],
      tradeoffs: transportTradeoffs(current.legs, input.constraints),
      summary: "Your route already flows well.",
      ...candidateFields,
    };
  }

  const currentLongLegs = current.legs.filter((leg) => (transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes) ?? 0) >= 300).length;
  const bestLongLegs = best.legs.filter((leg) => (transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes) ?? 0) >= 300).length;
  const reasons = [
    ...(!originalViable ? ["It preserves the fixed route gateways and required destinations."]
      : improvementMinutes !== null && improvementMinutes > 0
        ? [`It removes about ${Math.floor(improvementMinutes / 60)}h ${improvementMinutes % 60}m of estimated door-to-door travel.`]
        : acceptableBacktrackingTradeoff && timeTradeoffMinutes !== null
          ? [`It removes material geographic backtracking for about ${timeTradeoffMinutes}m more in the current broad transfer estimates.`]
        : [scoring.explanation]),
    ...(bestLongLegs < currentLongLegs ? ["It also reduces the number of travel-heavy days."] : ["It keeps the route moving in one direction instead of doubling back."]),
  ];
  return {
    state: "recommendation", currentStopIds, recommendedStopIds: best.stops.map((stop) => stop.id),
    currentTransferMinutes: current.minutes, recommendedTransferMinutes: best.minutes, improvementMinutes,
    reasons: reasons.slice(0, 2),
    tradeoffs: transportTradeoffs(best.legs, input.constraints),
    summary: `${best.stops.map((stop) => stop.name).join(" → ")} is the strongest order under the current route criteria.`,
    ...candidateFields,
  };
}

function arrivalLoad(minutes: number | null): StopDurationRecommendation["arrivalLoad"] {
  if (minutes === null) return "unknown";
  if (minutes < 150) return "light";
  if (minutes < 300) return "substantial";
  return "travel-heavy";
}

function arrivalLoadForLeg(leg: EstimatedLeg): StopDurationRecommendation["arrivalLoad"] {
  const classification = leg.transferImpact?.usableDayLoss.classification;
  if (classification === "light") return "light";
  if (classification === "substantial") return "substantial";
  if (classification === "most-of-day" || classification === "full-day-or-more") return "travel-heavy";
  return arrivalLoad(transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes));
}

/** The part of a calendar allocation that remains useful after arriving. */
export function usableStopDays(
  calendarDays: number,
  load: StopDurationRecommendation["arrivalLoad"],
) {
  if (calendarDays <= 0) return 0;
  const arrivalUsable = load === "light" ? 0.75 : load === "substantial" ? 0.5 : load === "travel-heavy" ? 0.15 : 0;
  return Math.max(0, Math.round((Math.max(1, calendarDays) - 1 + arrivalUsable) * 4) / 4);
}

/** Recommend calendar days from usable time, not just from a stop count. */
export function recommendStopDurations(input: {
  origin: { name: string; coordinates?: [number, number] };
  stops: Array<PlannerStop & { intent?: "place" | "landmark" }>;
  picks: Record<string, string[]>;
  constraints?: RoutePlanningConstraints;
}): Record<string, StopDurationRecommendation> {
  return Object.fromEntries(input.stops.map((stop, index) => {
    const previous = index ? input.stops[index - 1] : input.origin;
    const leg = estimateLegForConstraints(previous, stop, input.constraints);
    const arrivalMinutes = transferDoorToDoorMinutes(leg.transferImpact, leg.durationMinutes);
    const load = arrivalLoadForLeg(leg);
    const selectedCount = input.picks[stop.id]?.length ?? 0;
    const activityDays = Math.max(1, Math.ceil(selectedCount / 2));
    // A substantial transfer leaves only a partial arrival day. Protect a
    // proper visit day rather than treating that partial day as a full stop.
    const protectedArrival = load === "light" ? 0 : 1;
    const landmarkDay = stop.intent === "landmark" ? 1 : 0;
    const minimumDays = Math.max(1, protectedArrival + 1);
    const recommendedDays = Math.max(minimumDays, protectedArrival + activityDays + landmarkDay);
    const usableDays = usableStopDays(recommendedDays, load);
    const reason = load === "travel-heavy"
      ? `The arrival transfer takes most of the day, so one full day is protected here.`
      : load === "substantial"
        ? `The arrival transfer uses a meaningful part of the day.`
        : stop.intent === "landmark"
          ? `Keep a full visit day protected for this landmark.`
          : selectedCount >= 3
            ? `${selectedCount} selected places need more than a single rushed day.`
            : "This leaves time to arrive and still experience the place.";
    return [stop.id, { stopId: stop.id, minimumDays, recommendedDays, usableDays, arrivalMinutes, arrivalLoad: load, reason }];
  }));
}

export function assessRouteIntelligence(input: {
  origin: { name: string; coordinates?: [number, number] };
  end?: PlannerStop;
  stops: PlannerStop[];
  picks: Record<string, string[]>;
  availableDays: number;
  constraints?: RoutePlanningConstraints;
  scoringPreferences?: RouteScoringPreferences;
  allocations?: Record<string, number>;
}): RouteIntelligenceAssessment {
  const route = assessRouteOrder(input);
  // Keep duration guidance honest about the route the traveller is currently
  // looking at. If they accept a reorder, this function runs again for that
  // new sequence instead of silently budgeting against a route they declined.
  const durations = recommendStopDurations({ ...input, stops: input.stops });
  const comfortableDays = Object.values(durations).reduce((total, duration) => total + duration.recommendedDays, 0);
  const shortfallDays = Math.max(0, comfortableDays - input.availableDays);
  const optionalStops = input.stops.filter((stop) => input.constraints?.optionalStopIds?.includes(stop.id));
  const cut = shortfallDays && optionalStops.length
    ? [...optionalStops].sort((a, b) => (durations[a.id]?.recommendedDays ?? 1) - (durations[b.id]?.recommendedDays ?? 1))[0]
    : undefined;
  return {
    route, durations, comfortableDays, shortfallDays,
    overload: shortfallDays ? {
      suggestedCutStopId: cut?.id,
      daysRecovered: cut ? durations[cut.id]?.recommendedDays : undefined,
      reason: cut
        ? `${cut.name} is the smallest optional stop to remove without breaking the must-see route.`
        : "Every remaining stop is marked must-see, so add days rather than compressing the route.",
    } : undefined,
  };
}

/** Candidate sets are reproducible and can be large, so durable trips retain only the selected assessment. */
export function routeIntelligenceForPersistence(assessment: RouteIntelligenceAssessment): RouteIntelligenceAssessment {
  const { candidates: _candidates, constraintIssues: _constraintIssues, scoring: _scoring, ...route } = assessment.route;
  return { ...assessment, route };
}

function dateAt(startDate: string, offset: number) {
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function pairs<T>(items: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += 2) result.push(items.slice(index, index + 2));
  return result;
}

function fallbackDay(stop: PlannerStop, index: number): Omit<PlannedDay, "number" | "date"> {
  const variants = [
    { title: `Explore ${stop.name}`, reason: `A deliberately light day in ${stop.name}, leaving space to follow what looks good once you are there.`, items: ["Choose one walkable neighbourhood", "Add one real place once you have local context", "Leave the evening for a nearby meal"] },
    { title: `A slower ${stop.name} day`, reason: "A buffer day protects the trip from becoming a chain of transfers and bookings.", items: ["Start later", "Stay close to your base", "Keep one meal unplanned"] },
  ];
  return { ...variants[index % variants.length], destination: stop.name, type: "open" };
}

export function buildCredibleItinerary(input: {
  origin: string;
  originCoordinates?: [number, number];
  stops: PlannerStop[];
  startDate: string;
  allocations: Record<string, number>;
  picks: Record<string, string[]>;
  places: Record<string, PlannerPlace[]>;
  constraints?: RoutePlanningConstraints;
}): PlannedDay[] {
  const days: PlannedDay[] = [];
  let dayIndex = 0;
  input.stops.forEach((stop, stopIndex) => {
    const count = Math.max(0, input.allocations[stop.id] ?? 1);
    const selectedNames = new Set(input.picks[stop.id] ?? []);
    const selectedPlaces = (input.places[stop.id] ?? []).filter((place) => selectedNames.has(place.title));
    const nearbyRealPlaces = (input.places[stop.id] ?? []).filter((place) => !selectedNames.has(place.title));
    const previous: PlannerStop | { name: string; coordinates?: [number, number] } = stopIndex
      ? input.stops[stopIndex - 1]
      : { name: input.origin, coordinates: input.originCoordinates };
    const arrivalLeg = estimateLegForConstraints(previous, stop, input.constraints);
    const arrivalImpactMinutes = transferDoorToDoorMinutes(arrivalLeg.transferImpact, arrivalLeg.durationMinutes);
    const experienceDays = pairs(selectedPlaces);

    for (let localDay = 0; localDay < count; localDay += 1) {
      const number = dayIndex + 1;
      const base = { number: pad(number), date: dateAt(input.startDate, dayIndex), destination: stop.name };
      if (localDay === 0) {
        days.push({
          ...base,
          type: "arrival",
          title: stopIndex === 0 ? `Arrive in ${stop.name}` : `Travel to ${stop.name}`,
          reason: "A protected arrival day gives the route room for the transfer, check-in and a first feel for the place.",
          items: [arrivalLeg.label, arrivalImpactMinutes ? `Morrovia planning estimate: about ${Math.floor(arrivalImpactMinutes / 60)}h ${arrivalImpactMinutes % 60}m door to door; check current schedules.` : arrivalLeg.note, "Check in, walk one nearby area and keep dinner easy"],
          coordinates: stop.coordinates,
          travel: arrivalLeg,
        });
      } else {
        const group = experienceDays[localDay - 1];
        if (group?.length) {
          const primary = group[0];
          const names = group.map((place) => place.title);
          days.push({
            ...base,
            type: "activity",
            title: group.length > 1 ? `${primary.title} + nearby time` : primary.title,
            reason: group.length > 1
              ? `These two selected places are planned as one focused day, rather than a scattered checklist across ${stop.name}.`
              : `Built around ${primary.title}; the rest of the day stays close to ${primary.area}.`,
            items: [
              ...names,
              ...group.map((place) => place.description),
              primary.type.toLowerCase().includes("heritage") || primary.type.toLowerCase().includes("museum") ? "Check opening hours and timed-entry requirements before booking." : "Leave the final part of the day open for a local meal or a nearby walk.",
            ],
            placeTitle: primary.title,
            coordinates: primary.coordinates ?? stop.coordinates,
          });
        } else if (nearbyRealPlaces.length) {
          const place = nearbyRealPlaces[(localDay - 1 - experienceDays.length) % nearbyRealPlaces.length];
          days.push({
            ...base,
            type: "activity",
            title: `Explore ${stop.name}`,
            reason: `A flexible day built around a real nearby option, without committing you to another long transfer.`,
            items: [place.title, place.description, "Keep the rest of the day in the same area."],
            placeTitle: place.title,
            coordinates: place.coordinates ?? stop.coordinates,
          });
        } else {
          days.push({ ...base, ...fallbackDay(stop, localDay - 1), coordinates: stop.coordinates });
        }
      }
      dayIndex += 1;
    }
  });
  return days;
}
