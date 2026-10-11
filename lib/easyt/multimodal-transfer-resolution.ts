import {
  destinationKnowledge,
  type DestinationAirGateway,
  type DestinationKnowledgeStore,
  type DestinationTransferKnowledge,
  type IntercityRailConnectionEvidence,
  type KnowledgeFact,
} from "./destination-knowledge.ts";
import { estimateFlightPlanningMinutes, haversineKm } from "./planner.ts";
import { directRoadPlausibilityConflict, resolveCanonicalRoadFallback } from "./road-transfer-resolution.ts";
import type { RoadRoutingProvider } from "./road-routing.ts";
import { estimateTransferImpact } from "./transfer-impact.ts";
import { findSurfaceCrossing } from "./surface-crossing-evidence.ts";
import { reconcileLegacyTransportLeg } from "./transport-leg-compatibility.ts";
import type {
  CanonicalRouteEndpoint,
  EasyTTrip,
  TransferSegment,
  TripLeg,
  TripLegProvenance,
  RoadEstimateReference,
  TripTransferMode,
} from "./trip.ts";

export type TransferEvidenceKind =
  | "exact_transfer"
  | "intercity_rail_network"
  | "direct_rail_connectivity"
  | "routed_road"
  | "canonical_gateway_access"
  | "direct_air_connectivity"
  | "legacy_flight_estimate"
  | "air_gateway_composition";

export type TransferJourneyCandidate = {
  id: string;
  summaryMode: TripTransferMode;
  segments: TransferSegment[];
  totalDurationMinutes: number;
  /** Reviewed in-vehicle time when distinct from access/waiting allowances. */
  headlineMinutes?: number;
  headlineTiming?: KnowledgeFact<number>;
  distanceKm: number | null;
  confidence: "high" | "medium" | "low";
  provenance: TripLegProvenance;
  evidence: TransferEvidenceKind;
  /** Zero is direct; null keeps schedule-specific change count uncertain. */
  connectionCount: number | null;
  score: number;
  reasons: string[];
};

export type TransferResolutionDiagnostic = {
  version: 1;
  selected: TripTransferMode | "preserved" | "unresolved";
  selectedCandidateId?: string;
  /** Complete evidence-backed plans allow a traveller choice to be projected
   * without replacing or reconstructing Morrovia's recommended TripLeg. */
  candidates: TransferJourneyCandidate[];
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
  minimumUnverifiedInternationalFlightKm: 1_200,
  inferredRailStationAllowanceMinutes: 30,
  inferredRailSpeedKmh: 200,
  maximumCandidates: 8,
  scoring: {
    maximumScore: 100,
    minutesPerDurationPoint: 30,
    unknownChangesPenalty: 3,
    changePenalty: 6,
    airportComplexityPenalty: 4,
    mixedJourneyPenalty: 2,
    preferenceBonus: 5,
    strongRailMaximumMinutes: 360,
    competitiveRailMaximumMinutes: 480,
    competitiveRailCloseToAirMinutes: 90,
    competitiveRailMaximumAirGapMinutes: 150,
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

function sameEndpointIdentity(left: CanonicalRouteEndpoint, right: CanonicalRouteEndpoint) {
  return normalized(endpointIdentity(left)) === normalized(endpointIdentity(right));
}

function gatewayAccessPlanningMinutes(distanceKm: number) {
  return roundPlanningMinutes(45 + (distanceKm / 55) * 60);
}

function inferredGatewayAccessSegment(
  from: CanonicalRouteEndpoint,
  to: CanonicalRouteEndpoint,
): TransferSegment | null {
  const distanceKm = haversineKm(from.coordinates ?? undefined, to.coordinates ?? undefined);
  if (distanceKm === null || distanceKm < 1 || distanceKm > 700) return null;
  return segment({
    mode: "road",
    fromEndpoint: from,
    toEndpoint: to,
    distanceKm,
    durationMinutes: gatewayAccessPlanningMinutes(distanceKm),
    provider: "Canonical air-gateway access relationship; conservative Morrovia ground-transfer estimate, verify the live service.",
    provenance: "planning_estimate",
    confidence: "medium",
    scheduleNeedsChecking: true,
  });
}

function reviewedRailAccessSegment(
  from: CanonicalRouteEndpoint,
  to: CanonicalRouteEndpoint,
  durationMinutes: number,
  index: number,
) {
  const distanceKm = haversineKm(from.coordinates ?? undefined, to.coordinates ?? undefined);
  return segment({
    mode: "road",
    fromEndpoint: from,
    toEndpoint: to,
    distanceKm,
    durationMinutes,
    provider: "Reviewed rail-gateway access; Morrovia planning allowance, verify the live ground connection.",
    provenance: "planning_estimate",
    confidence: "medium",
    scheduleNeedsChecking: true,
  }, index);
}

function gatewayAccessCandidate(
  leg: TripLeg,
  fromKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  toKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
): TransferJourneyCandidate | null {
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  if (!from || !to || !sameCountry(from, to)) return null;
  const fromGateways = fromKnowledge.airGateways.status === "known" ? fromKnowledge.airGateways.value : [];
  const toGateways = toKnowledge.airGateways.status === "known" ? toKnowledge.airGateways.value : [];
  const relationship = fromGateways.some((gateway) => sameEndpointIdentity(gatewayEndpoint(gateway), to))
    || toGateways.some((gateway) => sameEndpointIdentity(gatewayEndpoint(gateway), from));
  if (!relationship) return null;
  const accessSegment = inferredGatewayAccessSegment(from, to);
  if (!accessSegment || accessSegment.durationMinutes === null) return null;
  return candidate({
    id: "road:canonical-gateway-access",
    summaryMode: "road",
    segments: [accessSegment],
    totalDurationMinutes: accessSegment.durationMinutes,
    distanceKm: accessSegment.distanceKm,
    confidence: "medium",
    provenance: "planning_estimate",
    evidence: "canonical_gateway_access",
    connectionCount: 0,
    reasons: ["A reviewed canonical gateway relationship establishes ground access between these endpoints.", "The duration is a conservative planning estimate because live road routing is unavailable."],
  });
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

function candidate(input: Omit<TransferJourneyCandidate, "score">): TransferJourneyCandidate {
  return { ...input, score: 0 };
}

function exactTransferCandidate(
  leg: TripLeg,
  transfer: DestinationTransferKnowledge | undefined,
): TransferJourneyCandidate | null {
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  if (!from || !to || !transfer || transfer.mode.status !== "known" || transfer.planningMinutes.status !== "known") return null;
  const mode = transfer.mode.value;
  const stationTime = transfer.durationBasis.value === "headline";
  const impact = stationTime ? estimateTransferImpact({
    mode, headlineMinutes: transfer.planningMinutes, international: !sameCountry(from, to),
  }) : null;
  const duration = roundPlanningMinutes(impact?.doorToDoor.value?.planningMinutes ?? transfer.planningMinutes.value);
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
    ...(stationTime ? { headlineMinutes: transfer.planningMinutes.value, headlineTiming: transfer.planningMinutes } : {}),
    summaryMode: mode,
    segments: [exactSegment],
    totalDurationMinutes: duration,
    distanceKm: exactSegment.distanceKm,
    confidence: "high",
    provenance: "planning_estimate",
    evidence: "exact_transfer",
    connectionCount: mode === "road" ? 0 : null,
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
    || (!networkEvidence && distanceKm > MULTIMODAL_SELECTION_RULES.maximumInferredRailKm)) return null;
  const legacyEndpointEvidence = sameCountry(from, to)
    && hasDirectConnectivity(fromKnowledge, "rail")
    && hasDirectConnectivity(toKnowledge, "rail");
  if (!networkEvidence && !legacyEndpointEvidence) return null;
  const duration = networkEvidence?.planningMinutes ?? roundPlanningMinutes(
    MULTIMODAL_SELECTION_RULES.inferredRailStationAllowanceMinutes
      + (distanceKm / MULTIMODAL_SELECTION_RULES.inferredRailSpeedKmh) * 60,
  );
  const railFrom = networkEvidence?.fromAccessGateway ? gatewayEndpoint(networkEvidence.fromAccessGateway) : from;
  const railTo = networkEvidence?.toAccessGateway ? gatewayEndpoint(networkEvidence.toAccessGateway) : to;
  const originAccess = networkEvidence?.fromAccessGateway
    ? reviewedRailAccessSegment(from, railFrom, networkEvidence.fromAccessGateway.planningMinutes, 0)
    : null;
  const railDistanceKm = haversineKm(railFrom.coordinates ?? undefined, railTo.coordinates ?? undefined) ?? distanceKm;
  const railSegment = segment({
    mode: "train",
    fromEndpoint: railFrom,
    toEndpoint: railTo,
    distanceKm: railDistanceKm,
    durationMinutes: duration,
    provider: networkEvidence
      ? `${networkEvidence.networkLabel}; Morrovia planning estimate, verify the live timetable.`
      : "Morrovia rail planning estimate from canonical intercity connectivity; verify the live timetable.",
    provenance: "planning_estimate",
    confidence: "medium",
    scheduleNeedsChecking: true,
  }, originAccess ? 1 : 0);
  const destinationAccess = networkEvidence?.toAccessGateway
    ? reviewedRailAccessSegment(railTo, to, networkEvidence.toAccessGateway.planningMinutes, originAccess ? 2 : 1)
    : null;
  const segments = [originAccess, railSegment, destinationAccess].filter((item): item is TransferSegment => Boolean(item));
  const totalDurationMinutes = segments.reduce((total, item) => total + (item.durationMinutes ?? 0), 0);
  const knownDistances = segments.map((item) => item.distanceKm).filter((value): value is number => value !== null);
  return candidate({
    id: networkEvidence ? `rail:network:${networkEvidence.networkId}` : "rail:direct-connectivity",
    summaryMode: segments.length > 1 ? "mixed" : "train",
    segments,
    totalDurationMinutes,
    distanceKm: knownDistances.length === segments.length ? knownDistances.reduce((total, value) => total + value, 0) : distanceKm,
    confidence: "medium",
    provenance: "planning_estimate",
    evidence: networkEvidence ? "intercity_rail_network" : "direct_rail_connectivity",
    connectionCount: networkEvidence?.connectionCount === null || networkEvidence?.connectionCount === undefined
      ? null
      : networkEvidence.connectionCount + Math.max(0, segments.length - 1),
    reasons: networkEvidence
      ? [`Both canonical endpoints share reviewed strong intercity evidence on the ${networkEvidence.networkLabel}.`,
        `Evidence: ${networkEvidence.source.label}${networkEvidence.source.url ? ` (${networkEvidence.source.url})` : ""}.`,
        "Rail avoids airport and driving friction for this intercity distance."]
      : ["Both canonical endpoints have direct national or regional rail connectivity.", "Rail avoids airport and driving friction for this intercity distance."],
  });
}

async function roadCandidate(leg: TripLeg, provider?: RoadRoutingProvider): Promise<{ candidate: TransferJourneyCandidate; estimate: RoadEstimateReference } | null> {
  const routed = leg.mode === "road" && leg.durationMinutes !== null && leg.provenance === "routing_engine"
    ? { leg, outcome: "resolved" as const, estimate: leg.roadEstimate }
    : await resolveCanonicalRoadFallback({
        ...leg,
        mode: "unknown",
        durationMinutes: null,
        routeMetadata: { ...leg.routeMetadata, source: "morrovia-planner", roadFallbackEligible: true, decisionOption: undefined },
      }, { provider, allowCrossBorderEstimate: true });
  const existing = routed.leg;
  if (existing.mode !== "road" || existing.durationMinutes === null || !routed.estimate) return null;
  const roadSegment = segmentFromLeg(existing);
  if (!roadSegment || roadSegment.durationMinutes === null) return null;
  return {
    candidate: candidate({
      id: "road:routed",
      summaryMode: "road",
      segments: [roadSegment],
      totalDurationMinutes: roadSegment.durationMinutes,
      distanceKm: roadSegment.distanceKm,
      confidence: existing.confidence === "high" ? "high" : existing.confidence === "low" ? "low" : "medium",
      provenance: "routing_engine",
      evidence: "routed_road",
      connectionCount: 0,
      reasons: ["The road provider returned a plausible routed journey between the actual endpoints. This is a driving estimate, not evidence of passenger service."],
    }),
    estimate: routed.estimate,
  };
}

function attachRoadEstimate(leg: TripLeg, estimate: RoadEstimateReference | undefined): TripLeg {
  if (!estimate) return leg;
  return {
    ...leg,
    roadEstimate: estimate,
    warnings: [...new Set([...(leg.warnings ?? []), ...estimate.warnings])],
  };
}

function directFlightCandidate(
  leg: TripLeg,
  fromKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  toKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
): TransferJourneyCandidate | null {
  if (!leg.fromEndpoint || !leg.toEndpoint) return null;
  const destinationRequiresGateway = toKnowledge.airGateways.status === "known" && toKnowledge.airGateways.value.length > 0;
  const originRequiresGateway = fromKnowledge.airGateways.status === "known" && fromKnowledge.airGateways.value.length > 0;
  if (destinationRequiresGateway || originRequiresGateway) return null;
  const directEvidence = hasDirectConnectivity(fromKnowledge, "air") && hasDirectConnectivity(toKnowledge, "air");
  const international = !sameCountry(leg.fromEndpoint, leg.toEndpoint);
  const distanceKm = leg.straightLineDistanceKm ?? leg.distanceKm;
  if (distanceKm === null) return null;
  if (!directEvidence && (leg.mode !== "flight" || leg.durationMinutes === null)) return null;
  if (!directEvidence && international
    && (distanceKm === null || distanceKm < MULTIMODAL_SELECTION_RULES.minimumUnverifiedInternationalFlightKm)) return null;
  const durationMinutes = leg.mode === "flight" && leg.durationMinutes !== null
    ? leg.doorToDoorMinutes ?? leg.durationMinutes
    : roundPlanningMinutes(estimateFlightPlanningMinutes(distanceKm).totalMinutes);
  const flightSegment = leg.mode === "flight"
    ? segmentFromLeg(leg)
    : segment({
        mode: "flight",
        fromEndpoint: leg.fromEndpoint,
        toEndpoint: leg.toEndpoint,
        distanceKm,
        durationMinutes,
        provider: "Morrovia door-to-door flight planning estimate from reviewed endpoint air connectivity; verify the live service.",
        provenance: "planning_estimate",
        confidence: "medium",
        scheduleNeedsChecking: true,
      });
  if (!flightSegment || flightSegment.durationMinutes === null) return null;
  // Direct access to airports is not evidence of a nonstop service between them.
  flightSegment.provider = "Morrovia door-to-door flight planning estimate; a connection may be required, so verify the complete live journey.";
  return candidate({
    id: directEvidence ? "flight:direct-connectivity" : "flight:legacy-estimate",
    summaryMode: "flight",
    segments: [flightSegment],
    totalDurationMinutes: flightSegment.durationMinutes,
    distanceKm: flightSegment.distanceKm,
    confidence: directEvidence ? "medium" : "low",
    provenance: "planning_estimate",
    evidence: directEvidence ? "direct_air_connectivity" : "legacy_flight_estimate",
    connectionCount: null,
    reasons: directEvidence
      ? ["Both actual endpoints have air access evidence; the service and any connections need checking.",
        ...[fromKnowledge, toKnowledge].flatMap((place) => place.connectivity.status === "known"
          ? place.connectivity.sources.map((source) => `Evidence: ${source.label}${source.url ? ` (${source.url})` : ""}.`)
          : [])]
      : ["The legacy planner supports a flight estimate and no gateway contradiction is known."],
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
  if (resolved.leg.mode === "road") return segmentFromLeg(resolved.leg);
  return inferredGatewayAccessSegment(from, to);
}

async function mixedGatewayCandidate(
  leg: TripLeg,
  fromKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  toKnowledge: ReturnType<TransferEvidenceProvider["forTransferResolution"]>,
  provider?: RoadRoutingProvider,
): Promise<TransferJourneyCandidate | null> {
  const from = leg.fromEndpoint;
  const to = leg.toEndpoint;
  if (!from || !to) return null;
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
    connectionCount: Math.max(0, segments.length - 1),
    reasons: [
      "Canonical gateway evidence prevents treating the non-airport destination as the flight endpoint.",
      segments.some((item) => item.mode === "road" && item.provenance !== "routing_engine")
        ? "The reviewed gateway relationship supplies a conservative ground-access fallback because routed evidence is unavailable."
        : "Provider-routed ground access completes the journey to the actual stop.",
    ],
  });
}

/** Surface topology can be supported while sailing timing remains unknown. */
async function boundedFerryJourney(leg: TripLeg, provider?: RoadRoutingProvider): Promise<TripLeg | null> {
  const from = leg.fromEndpoint, to = leg.toEndpoint;
  if (!from || !to) return null;
  const crossing = findSurfaceCrossing(from, to, "ferry");
  if (!crossing) return null;
  const endpoint = (side: typeof crossing.origin): CanonicalRouteEndpoint => ({
    kind: "gateway", id: `crossing:${crossing.id}:${side.name}`, canonicalPlaceId: `crossing:${crossing.id}:${side.name}`,
    name: side.name, country: side.country, coordinates: side.coordinates,
  });
  const portFrom = endpoint(crossing.origin), portTo = endpoint(crossing.destination);
  const access = async (a: CanonicalRouteEndpoint, b: CanonicalRouteEndpoint, index: number) => {
    // Access is a new evidence unit, not a projection of saved whole-leg
    // timing or geometry. Only traveller constraints carry into its resolver.
    const temporary: TripLeg = {
      id: `${leg.id}:crossing-access:${index}`, fromStopId: a.id, toStopId: b.id,
      fromEndpoint: a, toEndpoint: b, mode: "unknown", durationMinutes: null,
      distanceKm: haversineKm(a.coordinates ?? undefined, b.coordinates ?? undefined), provider: null,
      routeMetadata: { source: "morrovia-planner", roadFallbackEligible: true,
        transportConstraints: leg.routeMetadata.transportConstraints },
    };
    const routed = await resolveCanonicalRoadFallback(temporary, { provider });
    // Named ports have no verified physical point yet. Retain the explicit
    // access component without claiming geometry, a routed service or time.
    return segmentFromLeg(routed.leg.mode === "road" ? routed.leg : {
      ...temporary, mode: "road", distanceKm: haversineKm(a.coordinates ?? undefined, b.coordinates ?? undefined),
      provider: "Ground access to the reviewed ferry port needs route and timing checks.", confidence: "unknown", provenance: "unknown",
    }, index)!;
  };
  const segments = [await access(from, portFrom, 0), segment({ mode: "ferry", fromEndpoint: portFrom, toEndpoint: portTo,
    distanceKm: haversineKm(portFrom.coordinates ?? undefined, portTo.coordinates ?? undefined), durationMinutes: null,
    provider: `${crossing.source.label} (${crossing.source.url}); verify the sailing and crossing time.`,
    confidence: "medium", provenance: "planning_estimate", scheduleNeedsChecking: true,
  }, 1), await access(portTo, to, 2)];
  const retainedMetadata = { ...leg.routeMetadata };
  delete retainedMetadata.transferImpact;
  delete retainedMetadata.roadRouting;
  delete retainedMetadata.routingConfidence;
  return { ...leg, mode: "mixed", segments, durationMinutes: null, headlineMinutes: null, doorToDoorMinutes: null,
    usableDayLoss: null, distanceKm: null, straightLineDistanceKm: null, routedDistanceKm: null,
    routeGeometry: undefined, roadEstimate: undefined,
    provider: `${crossing.source.label}; road access and sailing timing need checking.`, confidence: "medium",
    provenance: "planning_estimate", scheduleNeedsChecking: true,
    warnings: ["Ferry service timing and port access must be checked before booking."],
    routeMetadata: { ...retainedMetadata, source: "multimodal-resolver", planningEstimate: true, roadFallbackEligible: false,
      surfaceCrossingEvidence: { id: crossing.id, ...crossing.source } },
  };
}

function shouldPreserve(leg: TripLeg) {
  const metadata = leg.routeMetadata as { source?: unknown; routingConfidence?: unknown; roadFallbackEligible?: unknown; decisionOption?: unknown; userConfirmed?: unknown; confirmed?: unknown };
  if (metadata.decisionOption !== undefined || metadata.userConfirmed === true || metadata.confirmed === true) return true;
  if (metadata.source === "spreadsheet-import-unconfirmed" && leg.mode === "unknown" && metadata.roadFallbackEligible === false) return true;
  if (metadata.source === "curated-route" || metadata.source === "traveller-authored" || metadata.source === "imported-booking") return true;
  const { excludedModes } = transportRules(leg);
  if ((metadata.source === "morrovia-planner" || metadata.source === "multimodal-resolver")
    && (excludedModes.has(leg.mode) || leg.segments?.some((segment) => excludedModes.has(segment.mode)))) return false;
  if (leg.mode !== "unknown" && metadata.source === undefined) return true;
  if (leg.mode === "train" || leg.mode === "ferry" || leg.mode === "walk" || leg.mode === "mixed") {
    const deterministicNetworkEstimateNeedsResolution = leg.mode === "train"
      && metadata.source === "morrovia-planner"
      && metadata.routingConfidence !== "high";
    return leg.durationMinutes !== null && !deterministicNetworkEstimateNeedsResolution;
  }
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

function candidateMatchesPreference(candidate: TransferJourneyCandidate, preferredModes: Set<string>) {
  const preferences = new Set([...preferredModes].map((mode) => mode === "drive" ? "road" : mode));
  return candidate.segments.some((item) => preferences.has(item.mode));
}

function evidenceAdjustment(evidence: TransferEvidenceKind) {
  if (evidence === "exact_transfer") return 6;
  if (evidence === "intercity_rail_network") return 4;
  if (evidence === "routed_road") return 3;
  if (evidence === "direct_rail_connectivity" || evidence === "direct_air_connectivity" || evidence === "air_gateway_composition") return 2;
  if (evidence === "canonical_gateway_access") return 1;
  if (evidence === "legacy_flight_estimate") return -6;
  return -8;
}

function isRailJourney(candidate: TransferJourneyCandidate) {
  return candidate.segments.some((segment) => segment.mode === "train");
}

function scoreCandidate(
  candidate: TransferJourneyCandidate,
  preferredModes: Set<string>,
  fastestAirMinutes: number | null,
) {
  const rules = MULTIMODAL_SELECTION_RULES.scoring;
  const durationPenalty = Math.min(45, candidate.totalDurationMinutes / rules.minutesPerDurationPoint);
  const connectionPenalty = candidate.connectionCount === null
    ? rules.unknownChangesPenalty
    : candidate.connectionCount * rules.changePenalty;
  const confidenceAdjustment = candidate.confidence === "high" ? 4 : candidate.confidence === "low" ? -10 : 0;
  const airportPenalty = candidate.segments.some((segment) => segment.mode === "flight") ? rules.airportComplexityPenalty : 0;
  const roadMinutes = candidate.segments.filter((segment) => segment.mode === "road").reduce((total, segment) => total + (segment.durationMinutes ?? 0), 0);
  const drivingPenalty = candidate.summaryMode === "road" ? Math.min(8, roadMinutes / 120) : 0;
  const mixedPenalty = candidate.summaryMode === "mixed" ? rules.mixedJourneyPenalty : 0;
  const preferred = candidateMatchesPreference(candidate, preferredModes);
  let railBonus = 0;
  if (isRailJourney(candidate) && candidate.confidence !== "low" && (candidate.connectionCount === null || candidate.connectionCount <= 1)) {
    const pureRailFactor = candidate.summaryMode === "train" ? 1 : 0.5;
    if (candidate.totalDurationMinutes <= 240) railBonus = 10 * pureRailFactor;
    else if (candidate.totalDurationMinutes <= rules.strongRailMaximumMinutes) railBonus = 8 * pureRailFactor;
    else if (candidate.totalDurationMinutes <= rules.competitiveRailMaximumMinutes) {
      const airGap = fastestAirMinutes === null ? null : candidate.totalDurationMinutes - fastestAirMinutes;
      railBonus = (airGap === null
        ? 4
        : airGap <= rules.competitiveRailCloseToAirMinutes
          ? 6
          : airGap <= rules.competitiveRailMaximumAirGapMinutes
            ? 2
            : 0) * pureRailFactor;
    }
  }
  const raw = rules.maximumScore
    - durationPenalty
    - connectionPenalty
    - airportPenalty
    - drivingPenalty
    - mixedPenalty
    + confidenceAdjustment
    + evidenceAdjustment(candidate.evidence)
    + (preferred ? rules.preferenceBonus : 0)
    + railBonus;
  const score = Number(Math.max(0, Math.min(rules.maximumScore, raw)).toFixed(2));
  const reasons = [...candidate.reasons];
  if (preferred) reasons.push("This mode matches the traveller's stated transport preference.");
  if (railBonus > 0) reasons.push(candidate.totalDurationMinutes <= rules.strongRailMaximumMinutes
    ? `Rail is likely simplest here: about ${Math.round(candidate.totalDurationMinutes / 5) * 5} minutes door to door with credible intercity evidence.`
    : "Rail remains competitive because its door-to-door time and change burden are close to flying.");
  return { ...candidate, score, reasons };
}

function rankCandidates(candidates: TransferJourneyCandidate[], preferredModes: Set<string>) {
  const airMinutes = candidates
    .filter((item) => item.segments.some((segment) => segment.mode === "flight"))
    .map((item) => item.totalDurationMinutes);
  const fastestAirMinutes = airMinutes.length ? Math.min(...airMinutes) : null;
  return candidates
    .map((item) => scoreCandidate(item, preferredModes, fastestAirMinutes))
    .sort((left, right) => right.score - left.score || left.totalDurationMinutes - right.totalDurationMinutes || left.id.localeCompare(right.id));
}

function formatPlanningDuration(minutes: number) {
  const rounded = Math.max(15, Math.round(minutes / 5) * 5);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function selectionRationale(selected: TransferJourneyCandidate, diagnostic: TransferResolutionDiagnostic) {
  if (isRailJourney(selected)) {
    return `Train is likely simplest here: about ${formatPlanningDuration(selected.totalDurationMinutes)} door to door.`;
  }
  if (selected.segments.some((segment) => segment.mode === "flight")) {
    const rail = diagnostic.candidates.find((candidate) => candidate.id.startsWith("rail:"));
    if (rail && rail.totalDurationMinutes - selected.totalDurationMinutes >= MULTIMODAL_SELECTION_RULES.scoring.competitiveRailMaximumAirGapMinutes) {
      return "Flying is materially faster for this leg.";
    }
  }
  return null;
}

function applyCandidate(leg: TripLeg, selected: TransferJourneyCandidate, diagnostic: TransferResolutionDiagnostic, roadEstimate?: RoadEstimateReference): TripLeg {
  const dominantMode = selected.summaryMode === "mixed"
    ? selected.segments.some((segment) => segment.mode === "flight")
      ? "flight"
      : selected.segments.some((segment) => segment.mode === "train")
        ? "train"
        : "road"
    : selected.summaryMode === "train" ? "train" : selected.summaryMode;
  const transferImpact = estimateTransferImpact({
    mode: dominantMode === "walk" || dominantMode === "unknown" ? "road" : dominantMode,
    headlineMinutes: selected.headlineTiming,
    knownDoorToDoorMinutes: {
      status: "known",
      value: selected.totalDurationMinutes,
      confidence: selected.confidence === "high" ? "static" : "estimated",
      sources: [{ id: "morrovia:multimodal-resolution-v1", label: "Morrovia multimodal resolver", kind: "curated", supports: "Aggregated segment planning duration." }],
    },
    international: Boolean(leg.fromEndpoint && leg.toEndpoint && !sameCountry(leg.fromEndpoint, leg.toEndpoint)),
    connectionCount: selected.evidence === "legacy_flight_estimate" ? null : selected.connectionCount,
  });
  const onlySegment = selected.segments.length === 1 ? selected.segments[0] : null;
  return attachRoadEstimate({
    ...leg,
    mode: selected.summaryMode,
    segments: selected.segments,
    durationMinutes: selected.totalDurationMinutes,
    doorToDoorMinutes: selected.totalDurationMinutes,
    headlineMinutes: selected.headlineMinutes ?? selected.totalDurationMinutes,
    distanceKm: selected.distanceKm,
    routedDistanceKm: onlySegment?.mode === "road" ? onlySegment.distanceKm : null,
    routeGeometry: onlySegment?.routeGeometry,
    provider: [
      selectionRationale(selected, diagnostic),
      selected.summaryMode === "mixed"
        ? "Morrovia multimodal planning estimate; verify each live service before booking."
        : selected.segments[0]?.provider ?? leg.provider,
    ].filter(Boolean).join(" "),
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
  }, roadEstimate);
}

export async function resolveCanonicalTransferJourney(
  leg: TripLeg,
  options: { provider?: RoadRoutingProvider; knowledge?: TransferEvidenceProvider } = {},
): Promise<MultimodalResolutionResult> {
  leg = reconcileLegacyTransportLeg(leg);
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
  const canonicalGatewayAccess = excludedModes.has("road") ? null : gatewayAccessCandidate(leg, fromKnowledge, toKnowledge);
  const candidates = [exact, rail, mixed, directFlight]
    .filter((item): item is TransferJourneyCandidate => Boolean(item))
    .filter((item) => candidateAllowed(item, excludedModes));

  const travellerPrefersRoad = preferredModes.has("road") || preferredModes.has("drive");
  const credibleLowChangeRailDominatesRoad = Boolean(rail
    && rail.confidence !== "low"
    && rail.totalDurationMinutes <= MULTIMODAL_SELECTION_RULES.scoring.strongRailMaximumMinutes
    && (rail.connectionCount === null || rail.connectionCount <= 1)
    && !travellerPrefersRoad);
  let roadEstimate: RoadEstimateReference | undefined;
  if (!excludedModes.has("road") && !credibleLowChangeRailDominatesRoad) {
    // A complete gateway composition has already routed its ground access;
    // avoid a second, unrelated origin-to-destination driving request.
    const road = mixed ? null : await roadCandidate(leg, options.provider);
    roadEstimate = road?.estimate;
    // A driving route alone does not establish a cross-border passenger
    // connection. Preserve the existing reference-only policy unless driving
    // was explicitly preferred or a reviewed fixed link backs this pair.
    if (road && (sameCountry(from, to) || travellerPrefersRoad || findSurfaceCrossing(from, to, "road"))) {
      candidates.push(road.candidate);
    } else if (road) {
      diagnostic.rejected.push("Cross-border driving evidence is retained as a road reference; no passenger connection is established.");
    }
    if (canonicalGatewayAccess) candidates.push(canonicalGatewayAccess);
    if (!road && !canonicalGatewayAccess) diagnostic.rejected.push("No plausible routed road estimate or canonical gateway access was available.");
  } else if (credibleLowChangeRailDominatesRoad) {
    diagnostic.rejected.push("Road lookup skipped because credible low-change rail is under six hours and the traveller has no road preference.");
  }
  const rankedCandidates = rankCandidates(candidates, preferredModes);
  diagnostic.candidates = rankedCandidates.slice(0, MULTIMODAL_SELECTION_RULES.maximumCandidates);
  const selected = rankedCandidates[0];
  if (!selected) {
    const ferry = excludedModes.has("ferry") || excludedModes.has("road") ? null : await boundedFerryJourney(leg, options.provider);
    if (ferry) {
      diagnostic.selected = "mixed";
      diagnostic.rejected.push("The reviewed crossing has no verified sailing duration; total journey timing remains unknown.");
      return { leg: { ...ferry, routeMetadata: { ...ferry.routeMetadata, multimodalResolution: diagnostic } }, outcome: "unresolved", diagnostic };
    }
    const source = leg.routeMetadata.source;
    const gatewayContradictsDirectFlight = leg.mode === "flight"
      && (fromKnowledge.airGateways.status === "known" || toKnowledge.airGateways.status === "known");
    const unsupportedPlannerRoad = leg.mode === "road" && source === "morrovia-planner";
    const unsupportedPlannerFlight = leg.mode === "flight" && source === "morrovia-planner" && !directFlight;
    const excludedGeneratedMode = (source === "morrovia-planner" || source === "multimodal-resolver")
      && (excludedModes.has(leg.mode) || leg.segments?.some((segment) => excludedModes.has(segment.mode)));
    if (gatewayContradictsDirectFlight || unsupportedPlannerRoad || unsupportedPlannerFlight || excludedGeneratedMode) {
      const unresolvedMetadata = { ...leg.routeMetadata };
      if (excludedGeneratedMode) {
        delete unresolvedMetadata.surfaceCrossingEvidence;
        delete unresolvedMetadata.transferImpact;
        delete unresolvedMetadata.roadRouting;
        delete unresolvedMetadata.routingConfidence;
      }
      return {
        leg: attachRoadEstimate({
          ...leg,
          ...(excludedGeneratedMode ? {
            distanceKm: null,
            routedDistanceKm: null,
            straightLineDistanceKm: null,
            roadEstimate: undefined,
          } : {}),
          mode: "unknown",
          durationMinutes: null,
          headlineMinutes: null,
          doorToDoorMinutes: null,
          usableDayLoss: null,
          provider: gatewayContradictsDirectFlight
            ? "A flight gateway is known, but its ground access could not be resolved."
            : excludedGeneratedMode
              ? "The inferred transport mode conflicts with a hard traveller constraint, and no supported compliant alternative is known."
              : unsupportedPlannerFlight
              ? "Air is plausible, but Morrovia has no direct-service or complete multimodal evidence for this regional cross-border journey."
            : "A plausible road route could not be established.",
          provenance: "unknown",
          confidence: "unknown",
          scheduleNeedsChecking: true,
          routeGeometry: undefined,
          segments: undefined,
          routeMetadata: { ...unresolvedMetadata, source: "multimodal-resolver", multimodalResolution: diagnostic },
        }, excludedGeneratedMode ? undefined : roadEstimate),
        outcome: "unresolved",
        diagnostic,
      };
    }
    return { leg: attachRoadEstimate(leg, roadEstimate), outcome: "unresolved", diagnostic };
  }
  diagnostic.selected = selected.summaryMode;
  diagnostic.selectedCandidateId = selected.id;
  return { leg: applyCandidate(leg, selected, diagnostic, roadEstimate), outcome: "resolved", diagnostic };
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
  // A save/load must retain the Builder's safe prefix. Its scoped necessary
  // worker owns completion; the single-leg/batch engine remains available to it.
  const legs: TripLeg[] = [];
  for (const [index, leg] of trip.legs.entries()) {
    const pendingPrefix = leg.routeMetadata.source === "necessary-reconciliation" && leg.routeMetadata.pending === true;
    legs.push(index < 8 && !pendingPrefix ? (await resolveCanonicalTransferJourney(leg, options)).leg : leg);
  }
  return legs.some((leg, index) => leg !== trip.legs[index]) ? { ...trip, legs } : trip;
}
