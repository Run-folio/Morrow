import {
  destinationKnowledge,
  type DestinationAirGateway,
  type DestinationKnowledgeStore,
  type DestinationTransferKnowledge,
  type IntercityRailConnectionEvidence,
} from "./destination-knowledge.ts";
import { estimateFlightPlanningMinutes, haversineKm } from "./planner.ts";
import { resolveCanonicalRoadFallback } from "./road-transfer-resolution.ts";
import type { RoadRoutingProvider } from "./road-routing.ts";
import { estimateTransferImpact } from "./transfer-impact.ts";
import type {
  CanonicalRouteEndpoint,
  EasyTTrip,
  TransferSegment,
  TripLeg,
  TripLegProvenance,
  TripTransferMode,
} from "./trip.ts";

export type TransferEvidenceKind =
  | "exact_transfer"
  | "intercity_rail_network"
  | "direct_rail_connectivity"
  | "routed_road"
  | "direct_air_connectivity"
  | "legacy_flight_estimate"
  | "air_gateway_composition";

export type TransferJourneyCandidate = {
  id: string;
  summaryMode: TripTransferMode;
  segments: TransferSegment[];
  totalDurationMinutes: number;
  distanceKm: number | null;
  confidence: "high" | "medium" | "low";
  provenance: TripLegProvenance;
  evidence: TransferEvidenceKind;
  score: number;
  reasons: string[];
};

export type TransferResolutionDiagnostic = {
  version: 1;
  selected: TripTransferMode | "preserved" | "unresolved";
  selectedCandidateId?: string;
  candidates: Array<Pick<TransferJourneyCandidate, "id" | "summaryMode" | "totalDurationMinutes" | "score" | "evidence" | "reasons">>;
  rejected: string[];
};

export type MultimodalResolutionResult = {
  leg: TripLeg;
  outcome: "resolved" | "preserved" | "unresolved";
  diagnostic: TransferResolutionDiagnostic;
};

/** Provider-neutral evidence boundary; future timetable adapters normalize into this contract. */
export type TransferEvidenceProvider = Pick<DestinationKnowledgeStore, "findTransfer" | "findIntercityRailConnection" | "forTransferResolution">;

/** Centralized planning thresholds; UI components never select transport modes. */
export const MULTIMODAL_SELECTION_RULES = {
  minimumIntercityRailKm: 80,
  maximumInferredRailKm: 1_000,
  inferredRailStationAllowanceMinutes: 30,
  inferredRailSpeedKmh: 200,
  maximumCandidates: 8,
  scores: {
    exactTransfer: 100,
    directRailConnectivity: 86,
    airGatewayComposition: 82,
    routedRoad: 76,
    directAirConnectivity: 78,
    legacyFlightEstimate: 68,
  },
} as const;

function normalized(value: string | undefined) {
  return value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ?? "";
}

function sameCountry(from: CanonicalRouteEndpoint, to: CanonicalRouteEndpoint) {
  return Boolean(from.country && to.country && normalized(from.country) === normalized(to.country));
}

function roundPlanningMinutes(minutes: number) {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

function endpointIdentity(endpoint: CanonicalRouteEndpoint) {
  return endpoint.canonicalPlaceId || endpoint.providerId || `${normalized(endpoint.country)}:${normalized(endpoint.name)}`;
}

function gatewayEndpoint(gateway: DestinationAirGateway): CanonicalRouteEndpoint {
  return {
    kind: "gateway",
    id: `gateway:${gateway.canonicalId}`,
    name: gateway.name,
    country: gateway.country,
    canonicalPlaceId: gateway.canonicalId,
    coordinates: gateway.coordinates,
  };
}

function segment(input: Omit<TransferSegment, "id">, index = 0): TransferSegment {
  return { ...input, id: `${endpointIdentity(input.fromEndpoint)}:${endpointIdentity(input.toEndpoint)}:${input.mode}:${index}` };
}

function segmentFromLeg(leg: TripLeg, index = 0): TransferSegment | null {
  if (!leg.fromEndpoint || !leg.toEndpoint || leg.mode === "mixed") return null;
  return segment({
    mode: leg.mode,
    fromEndpoint: leg.fromEndpoint,
    toEndpoint: leg.toEndpoint,
    distanceKm: leg.routedDistanceKm ?? leg.distanceKm,
    durationMinutes: leg.doorToDoorMinutes ?? leg.durationMinutes,
    provider: leg.provider,
    provenance: leg.provenance ?? "planning_estimate",
    confidence: leg.confidence ?? "unknown",
    scheduleNeedsChecking: leg.scheduleNeedsChecking ?? true,
    ...(leg.routeGeometry?.length ? { routeGeometry: leg.routeGeometry } : {}),
  }, index);
}

function candidateScore(base: number, durationMinutes: number, segmentCount: number, confidence: TransferJourneyCandidate["confidence"]) {
  const durationPenalty = Math.min(8, durationMinutes / 240);
  const connectionPenalty = Math.max(0, segmentCount - 1) * 3;
  const confidenceAdjustment = confidence === "high" ? 4 : confidence === "low" ? -5 : 0;
  return Number((base + confidenceAdjustment - durationPenalty - connectionPenalty).toFixed(2));
}

function candidate(input: Omit<TransferJourneyCandidate, "score"> & { baseScore: number }): TransferJourneyCandidate {
  const { baseScore, ...rest } = input;
  return { ...rest, score: candidateScore(baseScore, input.totalDurationMinutes, input.segments.length, input.confidence) };
}

function exactTransferCandidate(
  leg: TripLeg,
  transfer: DestinationTransferKnowledge | undefined,
): TransferJourneyCandidate | null {
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  if (!from || !to || !transfer || transfer.mode.status !== "known" || transfer.planningMinutes.status !== "known") return null;
  const duration = roundPlanningMinutes(transfer.planningMinutes.value);
  const mode = transfer.mode.value;
  const exactSegment = segment({
    mode,
    fromEndpoint: from,
    toEndpoint: to,
    distanceKm: leg.straightLineDistanceKm ?? leg.distanceKm,
    durationMinutes: duration,
    provider: transfer.note.status === "known" ? transfer.note.value : "Supported canonical transfer evidence.",
    provenance: "planning_estimate",
    confidence: "high",
    scheduleNeedsChecking: true,
  });
  return candidate({
    id: `exact:${mode}`,
    summaryMode: mode,
    segments: [exactSegment],
    totalDurationMinutes: duration,
    distanceKm: exactSegment.distanceKm,
    confidence: "high",
    provenance: "planning_estimate",
    evidence: "exact_transfer",
    baseScore: MULTIMODAL_SELECTION_RULES.scores.exactTransfer,
    reasons: ["An exact canonical transfer fact supports this mode and planning duration."],
  });
}

function hasDirectConnectivity(
  knowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  mode: "air" | "rail" | "ferry",
) {
  return knowledge.connectivity.status === "known"
    && knowledge.connectivity.value.some((item) => item.mode === mode && item.access === "direct");
}

function railCandidate(
  leg: TripLeg,
  fromKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  toKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  networkEvidence?: IntercityRailConnectionEvidence,
): TransferJourneyCandidate | null {
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  const distanceKm = from?.coordinates && to?.coordinates ? haversineKm(from.coordinates, to.coordinates) : null;
  if (!from || !to || distanceKm === null
    || distanceKm < MULTIMODAL_SELECTION_RULES.minimumIntercityRailKm
    || distanceKm > MULTIMODAL_SELECTION_RULES.maximumInferredRailKm) return null;
  const legacyEndpointEvidence = sameCountry(from, to)
    && hasDirectConnectivity(fromKnowledge, "rail")
    && hasDirectConnectivity(toKnowledge, "rail");
  if (!networkEvidence && !legacyEndpointEvidence) return null;
  const duration = networkEvidence?.planningMinutes ?? roundPlanningMinutes(
    MULTIMODAL_SELECTION_RULES.inferredRailStationAllowanceMinutes
      + (distanceKm / MULTIMODAL_SELECTION_RULES.inferredRailSpeedKmh) * 60,
  );
  const railSegment = segment({
    mode: "train",
    fromEndpoint: from,
    toEndpoint: to,
    distanceKm,
    durationMinutes: duration,
    provider: networkEvidence
      ? `${networkEvidence.networkLabel}; Morrovia planning estimate, verify the live timetable.`
      : "Morrovia rail planning estimate from canonical intercity connectivity; verify the live timetable.",
    provenance: "planning_estimate",
    confidence: "medium",
    scheduleNeedsChecking: true,
  });
  return candidate({
    id: networkEvidence ? `rail:network:${networkEvidence.networkId}` : "rail:direct-connectivity",
    summaryMode: "train",
    segments: [railSegment],
    totalDurationMinutes: duration,
    distanceKm,
    confidence: "medium",
    provenance: "planning_estimate",
    evidence: networkEvidence ? "intercity_rail_network" : "direct_rail_connectivity",
    baseScore: MULTIMODAL_SELECTION_RULES.scores.directRailConnectivity,
    reasons: networkEvidence
      ? [`Both canonical endpoints share reviewed strong intercity evidence on the ${networkEvidence.networkLabel}.`, "Rail avoids airport and driving friction for this intercity distance."]
      : ["Both canonical endpoints have direct national or regional rail connectivity.", "Rail avoids airport and driving friction for this intercity distance."],
  });
}

async function roadCandidate(leg: TripLeg, provider?: RoadRoutingProvider): Promise<TransferJourneyCandidate | null> {
  const existing = leg.mode === "road" && leg.durationMinutes !== null && leg.provenance === "routing_engine"
    ? leg
    : (await resolveCanonicalRoadFallback({
        ...leg,
        mode: "unknown",
        durationMinutes: null,
        routeMetadata: { ...leg.routeMetadata, source: "morrovia-planner", roadFallbackEligible: true, decisionOption: undefined },
      }, { provider })).leg;
  if (existing.mode !== "road" || existing.durationMinutes === null) return null;
  const roadSegment = segmentFromLeg(existing);
  if (!roadSegment || roadSegment.durationMinutes === null) return null;
  return candidate({
    id: "road:routed",
    summaryMode: "road",
    segments: [roadSegment],
    totalDurationMinutes: roadSegment.durationMinutes,
    distanceKm: roadSegment.distanceKm,
    confidence: existing.confidence === "high" ? "high" : existing.confidence === "low" ? "low" : "medium",
    provenance: "routing_engine",
    evidence: "routed_road",
    baseScore: MULTIMODAL_SELECTION_RULES.scores.routedRoad,
    reasons: ["The road provider returned a plausible routed journey between the actual endpoints."],
  });
}

function directFlightCandidate(
  leg: TripLeg,
  fromKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  toKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
): TransferJourneyCandidate | null {
  if (leg.mode !== "flight" || leg.durationMinutes === null || !leg.fromEndpoint || !leg.toEndpoint) return null;
  const destinationRequiresGateway = toKnowledge.airGateways.status === "known" && toKnowledge.airGateways.value.length > 0;
  const originRequiresGateway = fromKnowledge.airGateways.status === "known" && fromKnowledge.airGateways.value.length > 0;
  if (destinationRequiresGateway || originRequiresGateway) return null;
  const directEvidence = hasDirectConnectivity(fromKnowledge, "air") && hasDirectConnectivity(toKnowledge, "air");
  const flightSegment = segmentFromLeg(leg);
  if (!flightSegment || flightSegment.durationMinutes === null) return null;
  return candidate({
    id: directEvidence ? "flight:direct-connectivity" : "flight:legacy-estimate",
    summaryMode: "flight",
    segments: [flightSegment],
    totalDurationMinutes: flightSegment.durationMinutes,
    distanceKm: flightSegment.distanceKm,
    confidence: directEvidence ? "medium" : "low",
    provenance: leg.provenance ?? "planning_estimate",
    evidence: directEvidence ? "direct_air_connectivity" : "legacy_flight_estimate",
    baseScore: directEvidence ? MULTIMODAL_SELECTION_RULES.scores.directAirConnectivity : MULTIMODAL_SELECTION_RULES.scores.legacyFlightEstimate,
    reasons: [directEvidence ? "Both actual endpoints have direct air connectivity evidence." : "The legacy planner supports a flight estimate and no gateway contradiction is known."],
  });
}

async function routeGatewayAccess(
  from: CanonicalRouteEndpoint,
  to: CanonicalRouteEndpoint,
  provider?: RoadRoutingProvider,
): Promise<TransferSegment | null> {
  const temporary: TripLeg = {
    id: `gateway-road:${endpointIdentity(from)}:${endpointIdentity(to)}`,
    fromStopId: from.id,
    toStopId: to.id,
    fromEndpoint: from,
    toEndpoint: to,
    mode: "unknown",
    distanceKm: from.coordinates && to.coordinates ? haversineKm(from.coordinates, to.coordinates) : null,
    durationMinutes: null,
    provider: null,
    routeMetadata: { source: "morrovia-planner", roadFallbackEligible: true },
  };
  const resolved = await resolveCanonicalRoadFallback(temporary, { provider });
  return resolved.leg.mode === "road" ? segmentFromLeg(resolved.leg) : null;
}

async function mixedGatewayCandidate(
  leg: TripLeg,
  fromKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  toKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  provider?: RoadRoutingProvider,
): Promise<TransferJourneyCandidate | null> {
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  if (!from || !to || !provider) return null;
  const originGateway = fromKnowledge.airGateways.status === "known" ? fromKnowledge.airGateways.value[0] : undefined;
  const destinationGateway = toKnowledge.airGateways.status === "known" ? toKnowledge.airGateways.value[0] : undefined;
  if (!originGateway && !destinationGateway) return null;
  if (!originGateway && !hasDirectConnectivity(fromKnowledge, "air") && leg.mode !== "flight") return null;
  if (!destinationGateway && !hasDirectConnectivity(toKnowledge, "air") && leg.mode !== "flight") return null;

  const flightFrom = originGateway ? gatewayEndpoint(originGateway) : from;
  const flightTo = destinationGateway ? gatewayEndpoint(destinationGateway) : to;
  const flightDistance = haversineKm(flightFrom.coordinates ?? undefined, flightTo.coordinates ?? undefined);
  if (flightDistance === null || flightDistance < 80) return null;
  const originAccess = originGateway ? await routeGatewayAccess(from, flightFrom, provider) : null;
  if (originGateway && !originAccess) return null;
  const destinationAccess = destinationGateway ? await routeGatewayAccess(flightTo, to, provider) : null;
  if (destinationGateway && !destinationAccess) return null;

  // The gateway relationship establishes air feasibility. Reapplying the
  // legacy distance-based mode heuristic here can incorrectly turn a valid
  // domestic airport pair into rail and suppress the entire mixed journey.
  const flightDuration = roundPlanningMinutes(estimateFlightPlanningMinutes(flightDistance).totalMinutes);
  const flightSegment = segment({
    mode: "flight",
    fromEndpoint: flightFrom,
    toEndpoint: flightTo,
    distanceKm: haversineKm(flightFrom.coordinates ?? undefined, flightTo.coordinates ?? undefined),
    durationMinutes: flightDuration,
    provider: "Morrovia door-to-door flight planning estimate; verify current flights and connection timing.",
    provenance: "planning_estimate",
    confidence: "medium",
    scheduleNeedsChecking: true,
  }, originAccess ? 1 : 0);
  const segments = [originAccess, flightSegment, destinationAccess].filter((item): item is TransferSegment => Boolean(item));
  const totalDurationMinutes = segments.reduce((total, item) => total + (item.durationMinutes ?? 0), 0);
  const knownDistances = segments.map((item) => item.distanceKm).filter((value): value is number => value !== null);
  return candidate({
    id: "mixed:air-gateway",
    summaryMode: "mixed",
    segments,
    totalDurationMinutes,
    distanceKm: knownDistances.length === segments.length ? knownDistances.reduce((total, value) => total + value, 0) : null,
    confidence: "medium",
    provenance: "planning_estimate",
    evidence: "air_gateway_composition",
    baseScore: MULTIMODAL_SELECTION_RULES.scores.airGatewayComposition,
    reasons: ["Canonical gateway evidence prevents treating the non-airport destination as the flight endpoint.", "Provider-routed ground access completes the journey to the actual stop."],
  });
}

function shouldPreserve(leg: TripLeg) {
  const metadata = leg.routeMetadata as { source?: unknown; decisionOption?: unknown; userConfirmed?: unknown; confirmed?: unknown };
  if (metadata.decisionOption !== undefined || metadata.userConfirmed === true || metadata.confirmed === true) return true;
  if (metadata.source === "curated-route" || metadata.source === "traveller-authored" || metadata.source === "imported-booking") return true;
  if (leg.mode !== "unknown" && metadata.source === undefined) return true;
  if (leg.mode === "train" || leg.mode === "ferry" || leg.mode === "walk" || leg.mode === "mixed") return leg.durationMinutes !== null;
  return false;
}

function transportRules(leg: TripLeg) {
  const value = (leg.routeMetadata as { transportConstraints?: unknown }).transportConstraints;
  const rules = value && typeof value === "object" ? value as { avoidDriving?: unknown; excludedModes?: unknown; preferredModes?: unknown } : {};
  const excludedModes = new Set(Array.isArray(rules.excludedModes) ? rules.excludedModes.filter((mode): mode is string => typeof mode === "string") : []);
  if (rules.avoidDriving === true) excludedModes.add("road");
  const preferredModes = new Set(Array.isArray(rules.preferredModes) ? rules.preferredModes.filter((mode): mode is string => typeof mode === "string") : []);
  return { excludedModes, preferredModes };
}

function candidateAllowed(candidate: TransferJourneyCandidate, excludedModes: Set<string>) {
  return candidate.segments.every((item) => !excludedModes.has(item.mode));
}

function withPreferenceScore(candidate: TransferJourneyCandidate, preferredModes: Set<string>) {
  const preferences = new Set([...preferredModes].map((mode) => mode === "drive" ? "road" : mode));
  if (!candidate.segments.some((item) => preferences.has(item.mode))) return candidate;
  return { ...candidate, score: Number((candidate.score + 3).toFixed(2)), reasons: [...candidate.reasons, "This mode matches the traveller's stated transport preference."] };
}

function applyCandidate(leg: TripLeg, selected: TransferJourneyCandidate, diagnostic: TransferResolutionDiagnostic): TripLeg {
  const dominantMode = selected.summaryMode === "mixed" ? "flight" : selected.summaryMode === "train" ? "train" : selected.summaryMode;
  const transferImpact = estimateTransferImpact({
    mode: dominantMode === "walk" || dominantMode === "unknown" ? "road" : dominantMode,
    knownDoorToDoorMinutes: {
      status: "known",
      value: selected.totalDurationMinutes,
      confidence: selected.confidence === "high" ? "static" : "estimated",
      sources: [{ id: "morrovia:multimodal-resolution-v1", label: "Morrovia multimodal resolver", kind: "curated", supports: "Aggregated segment planning duration." }],
    },
    international: Boolean(leg.fromEndpoint && leg.toEndpoint && !sameCountry(leg.fromEndpoint, leg.toEndpoint)),
    connectionCount: Math.max(0, selected.segments.length - 1),
  });
  const onlySegment = selected.segments.length === 1 ? selected.segments[0] : null;
  return {
    ...leg,
    mode: selected.summaryMode,
    segments: selected.segments,
    durationMinutes: selected.totalDurationMinutes,
    doorToDoorMinutes: selected.totalDurationMinutes,
    headlineMinutes: selected.totalDurationMinutes,
    distanceKm: selected.distanceKm,
    routedDistanceKm: onlySegment?.mode === "road" ? onlySegment.distanceKm : null,
    routeGeometry: onlySegment?.routeGeometry,
    provider: selected.summaryMode === "mixed"
      ? "Morrovia multimodal planning estimate; verify each live service before booking."
      : selected.segments[0]?.provider ?? leg.provider,
    provenance: selected.provenance,
    confidence: selected.confidence,
    scheduleNeedsChecking: true,
    warnings: [],
    usableDayLoss: transferImpact.usableDayLoss.estimatedDayFraction,
    routeMetadata: {
      ...leg.routeMetadata,
      source: "multimodal-resolver",
      planningEstimate: true,
      roadFallbackEligible: false,
      transferImpact,
      multimodalResolution: diagnostic,
    },
  };
}

export async function resolveCanonicalTransferJourney(
  leg: TripLeg,
  options: { provider?: RoadRoutingProvider; knowledge?: TransferEvidenceProvider } = {},
): Promise<MultimodalResolutionResult> {
  const diagnostic: TransferResolutionDiagnostic = { version: 1, selected: "unresolved", candidates: [], rejected: [] };
  if (shouldPreserve(leg)) {
    diagnostic.selected = "preserved";
    return { leg, outcome: "preserved", diagnostic };
  }
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  if (!from || !to || !from.coordinates || !to.coordinates) {
    diagnostic.rejected.push("Canonical endpoint coordinates are missing.");
    return { leg, outcome: "unresolved", diagnostic };
  }
  const knowledge = options.knowledge ?? destinationKnowledge;
  const fromKnowledge = knowledge.forTransferResolution(from);
  const toKnowledge = knowledge.forTransferResolution(to);
  const { excludedModes, preferredModes } = transportRules(leg);
  const exact = exactTransferCandidate(leg, knowledge.findTransfer(from, to));
  const railDistanceKm = haversineKm(from.coordinates, to.coordinates);
  const railNetworkEvidence = railDistanceKm === null ? undefined : knowledge.findIntercityRailConnection(from, to, railDistanceKm);
  const rail = excludedModes.has("train") ? null : railCandidate(leg, fromKnowledge, toKnowledge, railNetworkEvidence);
  const directFlight = excludedModes.has("flight") ? null : directFlightCandidate(leg, fromKnowledge, toKnowledge);
  const mixed = excludedModes.has("flight") || excludedModes.has("road") ? null : await mixedGatewayCandidate(leg, fromKnowledge, toKnowledge, options.provider);
  const candidates = [exact, rail, mixed, directFlight]
    .filter((item): item is TransferJourneyCandidate => Boolean(item))
    .filter((item) => candidateAllowed(item, excludedModes))
    .map((item) => withPreferenceScore(item, preferredModes));

  // Strong exact/rail/gateway evidence makes a road-provider comparison unnecessary.
  const hasStrongCandidate = candidates.some((item) => item.evidence === "exact_transfer" || item.evidence === "intercity_rail_network" || item.evidence === "direct_rail_connectivity" || item.evidence === "air_gateway_composition");
  if (!hasStrongCandidate && !excludedModes.has("road")) {
    const road = await roadCandidate(leg, options.provider);
    if (road) candidates.push(withPreferenceScore(road, preferredModes));
    else diagnostic.rejected.push("No plausible provider-routed road candidate was available.");
  } else if (rail) {
    diagnostic.rejected.push("Road provider comparison skipped because strong rail evidence already resolves the journey.");
  }
  candidates.sort((left, right) => right.score - left.score || left.totalDurationMinutes - right.totalDurationMinutes || left.id.localeCompare(right.id));
  diagnostic.candidates = candidates.slice(0, MULTIMODAL_SELECTION_RULES.maximumCandidates).map(({ id, summaryMode, totalDurationMinutes, score, evidence, reasons }) => ({ id, summaryMode, totalDurationMinutes, score, evidence, reasons }));
  const selected = candidates[0];
  if (!selected) {
    const source = leg.routeMetadata.source;
    const gatewayContradictsDirectFlight = leg.mode === "flight"
      && (fromKnowledge.airGateways.status === "known" || toKnowledge.airGateways.status === "known");
    const unsupportedPlannerRoad = leg.mode === "road" && source === "morrovia-planner";
    if (gatewayContradictsDirectFlight || unsupportedPlannerRoad) {
      return {
        leg: {
          ...leg,
          mode: "unknown",
          durationMinutes: null,
          headlineMinutes: null,
          doorToDoorMinutes: null,
          usableDayLoss: null,
          provider: gatewayContradictsDirectFlight
            ? "A flight gateway is known, but its ground access could not be resolved."
            : "A plausible road route could not be established.",
          provenance: "unknown",
          confidence: "unknown",
          scheduleNeedsChecking: true,
          routeGeometry: undefined,
          segments: undefined,
          routeMetadata: { ...leg.routeMetadata, multimodalResolution: diagnostic },
        },
        outcome: "unresolved",
        diagnostic,
      };
    }
    return { leg, outcome: "unresolved", diagnostic };
  }
  diagnostic.selected = selected.summaryMode;
  diagnostic.selectedCandidateId = selected.id;
  return { leg: applyCandidate(leg, selected, diagnostic), outcome: "resolved", diagnostic };
}

export async function resolveCanonicalTransferJourneys(
  legs: readonly TripLeg[],
  options: { provider?: RoadRoutingProvider; knowledge?: TransferEvidenceProvider; maxLegs?: number } = {},
) {
  const maximum = Math.max(0, Math.min(8, options.maxLegs ?? 8));
  const output: TripLeg[] = [];
  for (const [index, leg] of legs.entries()) {
    output.push(index < maximum ? (await resolveCanonicalTransferJourney(leg, options)).leg : leg);
  }
  return output;
}

export async function resolveTripTransferJourneys(
  trip: EasyTTrip,
  options: { provider?: RoadRoutingProvider; knowledge?: TransferEvidenceProvider } = {},
): Promise<EasyTTrip> {
  const legs = await resolveCanonicalTransferJourneys(trip.legs, options);
  return legs.some((leg, index) => leg !== trip.legs[index]) ? { ...trip, legs } : trip;
}
