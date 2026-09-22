import type {
  EasyTTrip,
  TransferSegment,
  TripLeg,
  TripLegProvenance,
  TripLegTransportChoice,
  TripTransferMode,
} from "./trip.ts";

const supportedModes = new Set<TripTransferMode>(["flight", "train", "road", "ferry", "walk", "mixed"]);
const supportedProvenance = new Set<TripLegProvenance>(["provider", "canonical_schedule", "routing_engine", "planning_estimate"]);

export type SupportedTransportChoice = {
  identity: string;
  candidateId: string;
  mode: TripTransferMode;
  evidence: string;
  durationMinutes: number;
  distanceKm: number | null;
  confidence: "high" | "medium" | "low";
  provenance: TripLegProvenance;
  connectionCount: number | null;
  reasons: string[];
  segments: TransferSegment[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function endpointIds(leg: TripLeg) {
  return {
    from: leg.fromEndpoint?.id ?? leg.fromStopId,
    to: leg.toEndpoint?.id ?? leg.toStopId,
  };
}

function candidateIdentity(candidate: Pick<SupportedTransportChoice, "candidateId" | "mode" | "evidence">) {
  return JSON.stringify([
    "transport-choice-v1",
    candidate.candidateId,
    candidate.mode,
    candidate.evidence,
  ]);
}

function validSegment(value: unknown): value is TransferSegment {
  const candidate = record(value);
  const from = record(candidate?.fromEndpoint);
  const to = record(candidate?.toEndpoint);
  return Boolean(candidate
    && typeof candidate.id === "string"
    && typeof candidate.mode === "string"
    && candidate.mode !== "mixed"
    && supportedModes.has(candidate.mode as TripTransferMode)
    && typeof from?.id === "string"
    && typeof to?.id === "string"
    && (candidate.durationMinutes === null || typeof candidate.durationMinutes === "number")
    && typeof candidate.provenance === "string"
    && supportedProvenance.has(candidate.provenance as TripLegProvenance));
}

function supportedCandidateForLeg(leg: TripLeg, value: unknown): SupportedTransportChoice | null {
  const candidate = record(value);
  if (!candidate
    || typeof candidate.id !== "string"
    || typeof candidate.summaryMode !== "string"
    || !supportedModes.has(candidate.summaryMode as TripTransferMode)
    || typeof candidate.evidence !== "string"
    || typeof candidate.totalDurationMinutes !== "number"
    || !Number.isFinite(candidate.totalDurationMinutes)
    || candidate.totalDurationMinutes <= 0
    || typeof candidate.provenance !== "string"
    || !supportedProvenance.has(candidate.provenance as TripLegProvenance)
    || !Array.isArray(candidate.segments)
    || !candidate.segments.length
    || !candidate.segments.every(validSegment)) return null;

  const segments = candidate.segments as TransferSegment[];
  const endpoints = endpointIds(leg);
  if (segments[0]?.fromEndpoint.id !== endpoints.from
    || segments.at(-1)?.toEndpoint.id !== endpoints.to) return null;

  const partial = {
    candidateId: candidate.id,
    mode: candidate.summaryMode as TripTransferMode,
    evidence: candidate.evidence,
  };
  const confidence = candidate.confidence === "high" || candidate.confidence === "low" ? candidate.confidence : "medium";
  return {
    ...partial,
    identity: candidateIdentity(partial),
    durationMinutes: Math.round(candidate.totalDurationMinutes),
    distanceKm: typeof candidate.distanceKm === "number" && Number.isFinite(candidate.distanceKm) ? candidate.distanceKm : null,
    confidence,
    provenance: candidate.provenance as TripLegProvenance,
    connectionCount: typeof candidate.connectionCount === "number" ? candidate.connectionCount : null,
    reasons: Array.isArray(candidate.reasons) ? candidate.reasons.filter((reason): reason is string => typeof reason === "string") : [],
    segments,
  };
}

export function supportedTransportChoicesForLeg(_trip: EasyTTrip, leg: TripLeg): SupportedTransportChoice[] {
  const diagnostic = record(leg.routeMetadata.multimodalResolution);
  if (!diagnostic || !Array.isArray(diagnostic.candidates)) return [];
  const seen = new Set<string>();
  return diagnostic.candidates.flatMap((candidate) => {
    const supported = supportedCandidateForLeg(leg, candidate);
    if (!supported || seen.has(supported.identity)) return [];
    seen.add(supported.identity);
    return [supported];
  });
}

export function selectedTransportChoiceForLeg(trip: EasyTTrip, leg: TripLeg) {
  const selections = trip.brief.decisionSelections?.transportByLeg ?? {};
  const direct = selections[leg.id];
  const endpoints = endpointIds(leg);
  const saved = direct ?? Object.entries(selections)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, selection]) => selection)
    .find((selection) => typeof selection !== "string"
      && selection.fromEndpointId === endpoints.from
      && selection.toEndpointId === endpoints.to);
  if (!saved) return null;
  const choices = supportedTransportChoicesForLeg(trip, leg);
  if (typeof saved === "string") {
    if (saved !== direct) return null;
    return choices.find((candidate) => candidate.candidateId === saved) ?? null;
  }
  if (saved.fromEndpointId !== endpoints.from || saved.toEndpointId !== endpoints.to) return null;
  const current = choices.find((candidate) => candidate.identity === saved.identity
    && candidate.candidateId === saved.candidateId
    && candidate.mode === saved.mode
    && candidate.evidence === saved.evidence);
  return current ?? null;
}

export function effectiveTripLeg(trip: EasyTTrip, leg: TripLeg): TripLeg {
  const selected = selectedTransportChoiceForLeg(trip, leg);
  if (!selected) return leg;
  const provider = [...new Set(selected.segments.flatMap((segment) => segment.provider ? [segment.provider] : []))].join(" ") || null;
  const singleRoad = selected.segments.length === 1 && selected.segments[0]?.mode === "road" ? selected.segments[0] : null;
  return {
    ...leg,
    mode: selected.mode,
    segments: selected.segments,
    durationMinutes: selected.durationMinutes,
    headlineMinutes: selected.durationMinutes,
    doorToDoorMinutes: selected.durationMinutes,
    distanceKm: selected.distanceKm,
    routedDistanceKm: singleRoad?.distanceKm ?? null,
    routeGeometry: singleRoad?.routeGeometry,
    provider,
    provenance: selected.provenance,
    confidence: selected.confidence,
    scheduleNeedsChecking: selected.segments.some((segment) => segment.scheduleNeedsChecking),
    warnings: [],
    routeMetadata: {
      ...leg.routeMetadata,
      effectiveTransportChoice: {
        identity: selected.identity,
        candidateId: selected.candidateId,
        evidence: selected.evidence,
        recommendationMode: leg.mode,
      },
    },
  };
}

export function tripWithEffectiveTransportChoices(trip: EasyTTrip): EasyTTrip {
  const legs = trip.legs.map((leg) => effectiveTripLeg(trip, leg));
  return legs.some((leg, index) => leg !== trip.legs[index]) ? { ...trip, legs } : trip;
}

export function selectTripLegTransportChoice(trip: EasyTTrip, legId: string, identity: string): EasyTTrip {
  const leg = trip.legs.find((candidate) => candidate.id === legId);
  if (!leg) return trip;
  const candidate = supportedTransportChoicesForLeg(trip, leg).find((option) => option.identity === identity);
  if (!candidate) return trip;
  const endpoints = endpointIds(leg);
  const choice: TripLegTransportChoice = {
    identity: candidate.identity,
    candidateId: candidate.candidateId,
    mode: candidate.mode,
    evidence: candidate.evidence,
    fromEndpointId: endpoints.from,
    toEndpointId: endpoints.to,
  };
  const retainedSelections = Object.fromEntries(Object.entries(trip.brief.decisionSelections?.transportByLeg ?? {})
    .filter(([key, selection]) => key !== leg.id && (typeof selection === "string"
      || selection.fromEndpointId !== endpoints.from
      || selection.toEndpointId !== endpoints.to)));
  return {
    ...trip,
    brief: {
      ...trip.brief,
      decisionSelections: {
        routeOrder: trip.brief.decisionSelections?.routeOrder,
        transportByLeg: {
          ...retainedSelections,
          [leg.id]: choice,
        },
      },
    },
  };
}

export function clearTripLegTransportChoice(trip: EasyTTrip, legId: string): EasyTTrip {
  const current = trip.brief.decisionSelections?.transportByLeg ?? {};
  const leg = trip.legs.find((candidate) => candidate.id === legId);
  const endpoints = leg ? endpointIds(leg) : null;
  const transportByLeg = Object.fromEntries(Object.entries(current).filter(([key, selection]) => key !== legId
    && (!endpoints || typeof selection === "string"
      || selection.fromEndpointId !== endpoints.from
      || selection.toEndpointId !== endpoints.to)));
  if (Object.keys(transportByLeg).length === Object.keys(current).length) return trip;
  return {
    ...trip,
    brief: {
      ...trip.brief,
      decisionSelections: {
        routeOrder: trip.brief.decisionSelections?.routeOrder,
        transportByLeg,
      },
    },
  };
}
