import { curatedConnectionFor, type CuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import { estimateLegForConstraints, haversineKm, type EstimatedLeg, type RoutePlanningConstraints } from "./planner.ts";
import type { TransferImpact } from "./transfer-impact.ts";
import type {
  CanonicalRouteEndpoint,
  EasyTTrip,
  TripLeg,
  TripLegClassification,
  TripStop,
} from "./trip.ts";

const normaliseIdentity = (value: string | undefined) => value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ?? "";

export const tripOriginEndpointId = (tripId: string) => `${tripId}-origin`;

function validCoordinates(value: [number, number] | null | undefined): value is [number, number] {
  return Boolean(value
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90);
}

export function originEndpointForTrip(trip: Pick<EasyTTrip, "id" | "brief">): CanonicalRouteEndpoint {
  const coordinates = validCoordinates(trip.brief.originCoordinates) ? trip.brief.originCoordinates : null;
  return {
    kind: "origin",
    id: tripOriginEndpointId(trip.id),
    name: trip.brief.origin,
    country: trip.brief.originCountry,
    canonicalPlaceId: trip.brief.originCanonicalPlaceId,
    providerId: trip.brief.originProviderId,
    coordinates,
  };
}

export function stopEndpoint(stop: TripStop): CanonicalRouteEndpoint {
  const coordinates: [number, number] | null = stop.longitude !== null && stop.latitude !== null
    ? [stop.longitude, stop.latitude]
    : null;
  return {
    kind: "stop",
    id: stop.id,
    name: stop.name,
    country: stop.country,
    canonicalPlaceId: stop.canonicalPlaceId,
    providerId: stop.providerId,
    coordinates: validCoordinates(coordinates) ? coordinates : null,
  };
}

export function routeEndpointForLeg(
  trip: Pick<EasyTTrip, "id" | "brief" | "stops">,
  leg: TripLeg,
  side: "from" | "to",
): CanonicalRouteEndpoint | null {
  const snapshot = side === "from" ? leg.fromEndpoint : leg.toEndpoint;
  if (snapshot) return snapshot;
  const stopId = side === "from" ? leg.fromStopId : leg.toStopId;
  const stop = trip.stops.find((item) => item.id === stopId);
  if (stop) return stopEndpoint(stop);
  if (stopId === tripOriginEndpointId(trip.id)) return originEndpointForTrip(trip);
  return null;
}

export function canonicalRouteEndpoints(trip: Pick<EasyTTrip, "id" | "brief" | "stops">) {
  return [originEndpointForTrip(trip), ...[...trip.stops].sort((left, right) => left.order - right.order).map(stopEndpoint)];
}

export function tripLegClassificationLabel(classification: TripLegClassification | undefined) {
  if (classification === "arrival") return "Arrival journey";
  if (classification === "international") return "International transfer";
  if (classification === "local") return "Local transfer";
  if (classification === "departure") return "Departure journey";
  return "Intercity transfer";
}

function knownMinutes(value: TransferImpact["headline"] | TransferImpact["doorToDoor"] | undefined) {
  return value?.status === "known" ? Math.round(value.value.planningMinutes) : null;
}

function classificationFor(from: CanonicalRouteEndpoint, to: CanonicalRouteEndpoint, distanceKm: number | null): TripLegClassification {
  if (from.kind === "origin") return "arrival";
  const sameCountry = Boolean(from.country && to.country && normaliseIdentity(from.country) === normaliseIdentity(to.country));
  if (!sameCountry) return "international";
  return distanceKm !== null && distanceKm <= 45 ? "local" : "intercity";
}

function sameEntity(from: CanonicalRouteEndpoint, to: CanonicalRouteEndpoint, distanceKm: number | null) {
  const sameCanonical = Boolean(from.canonicalPlaceId && to.canonicalPlaceId
    && normaliseIdentity(from.canonicalPlaceId) === normaliseIdentity(to.canonicalPlaceId));
  const sameProvider = Boolean(from.providerId && to.providerId && from.providerId === to.providerId);
  const sameNamedPoint = normaliseIdentity(from.name) === normaliseIdentity(to.name) && distanceKm !== null && distanceKm < 1;
  return sameCanonical || sameProvider || sameNamedPoint;
}

const maxPlausibleSpeedKmh: Partial<Record<TripLeg["mode"], number>> = {
  walk: 8,
  road: 140,
  train: 330,
  ferry: 90,
  flight: 1_100,
};

function validateEstimate(input: {
  from: CanonicalRouteEndpoint;
  to: CanonicalRouteEndpoint;
  estimate: EstimatedLeg;
  durationMinutes: number | null;
  headlineMinutes: number | null;
  doorToDoorMinutes: number | null;
  curated: boolean;
}) {
  const warnings: string[] = [];
  const coordinatesValid = validCoordinates(input.from.coordinates) && validCoordinates(input.to.coordinates);
  const distanceKm = coordinatesValid ? haversineKm(input.from.coordinates ?? undefined, input.to.coordinates ?? undefined) : null;
  if (!coordinatesValid) warnings.push("Both endpoints need validated coordinates before Morrovia can estimate this transfer.");
  if (sameEntity(input.from, input.to, distanceKm)) warnings.push("The leg endpoints resolve to the same place.");
  if (input.estimate.distanceKm !== null && distanceKm !== null && Math.abs(input.estimate.distanceKm - distanceKm) > Math.max(25, distanceKm * 0.08)) {
    warnings.push("The saved distance does not match the canonical endpoint coordinates.");
  }
  if (input.doorToDoorMinutes !== null && input.headlineMinutes !== null && input.doorToDoorMinutes < input.headlineMinutes) {
    warnings.push("Door-to-door time cannot be shorter than headline transport time.");
  }
  const speedLimit = maxPlausibleSpeedKmh[input.estimate.mode];
  const speedDuration = input.headlineMinutes ?? input.doorToDoorMinutes ?? input.durationMinutes;
  if (distanceKm !== null && speedLimit && speedDuration !== null && speedDuration > 0 && distanceKm / (speedDuration / 60) > speedLimit) {
    warnings.push(`The ${input.estimate.mode} duration would require an implausible average speed.`);
  }
  const international = Boolean(input.from.country && input.to.country
    && normaliseIdentity(input.from.country) !== normaliseIdentity(input.to.country));
  if (input.estimate.mode === "road" && international && !input.curated) {
    warnings.push("No supported cross-border road service or border allowance backs this estimate.");
  }
  if (input.estimate.mode === "unknown" && input.durationMinutes !== null) {
    warnings.push("A duration cannot be confirmed while the transport mode is unknown.");
  }
  return { distanceKm, warnings };
}

export type BuildCanonicalTripLegsInput = {
  tripId: string;
  origin: Omit<CanonicalRouteEndpoint, "kind" | "id">;
  stops: TripStop[];
  constraints?: RoutePlanningConstraints;
  curatedRoute?: CuratedRouteKnowledge;
};

/**
 * The single durable route-leg constructor. It consumes already-resolved
 * origin and stop entities; it never reparses prompt text or provider payloads.
 */
export function buildCanonicalTripLegs(input: BuildCanonicalTripLegsInput): TripLeg[] {
  const origin: CanonicalRouteEndpoint = {
    ...input.origin,
    kind: "origin",
    id: tripOriginEndpointId(input.tripId),
    coordinates: validCoordinates(input.origin.coordinates) ? input.origin.coordinates : null,
  };
  const endpoints = [origin, ...[...input.stops].sort((left, right) => left.order - right.order).map(stopEndpoint)];
  if (endpoints.length < 2) return [];
  return endpoints.slice(1).map((to, index) => {
    const from = endpoints[index];
    const directDistance = validCoordinates(from.coordinates) && validCoordinates(to.coordinates)
      ? haversineKm(from.coordinates ?? undefined, to.coordinates ?? undefined)
      : null;
    if (from.kind === "origin" && sameEntity(from, to, directDistance)) {
      return {
        id: `${input.tripId}-leg-${index + 1}`,
        fromStopId: from.id,
        toStopId: to.id,
        fromEndpoint: from,
        toEndpoint: to,
        classification: "arrival",
        mode: "walk",
        distanceKm: 0,
        straightLineDistanceKm: 0,
        routedDistanceKm: 0,
        durationMinutes: 0,
        headlineMinutes: 0,
        doorToDoorMinutes: 0,
        usableDayLoss: 0,
        provider: "The journey origin and first overnight stop are the same canonical place.",
        provenance: "planning_estimate",
        confidence: "high",
        scheduleNeedsChecking: false,
        warnings: [],
        routeMetadata: { planningEstimate: false, source: "canonical-endpoint-identity", classification: "arrival", validationWarnings: [] },
      } satisfies TripLeg;
    }
    const fromPlanner = {
      name: from.name,
      ...(from.country ? { country: from.country } : {}),
      canonicalPlaceId: from.canonicalPlaceId,
      providerId: from.providerId,
      coordinates: from.coordinates ?? undefined,
    };
    const toPlanner = {
      id: to.id,
      name: to.name,
      country: to.country ?? "",
      canonicalPlaceId: to.canonicalPlaceId,
      providerId: to.providerId,
      coordinates: to.coordinates ?? undefined,
    };
    const baseline = estimateLegForConstraints(fromPlanner, toPlanner, input.constraints);
    const curated = from.kind === "stop" && to.kind === "stop"
      ? curatedConnectionFor(input.curatedRoute, from.id, to.id)
      : undefined;
    const international = Boolean(from.country && to.country && normaliseIdentity(from.country) !== normaliseIdentity(to.country));
    const overlandPreferred = Boolean(input.constraints?.transportModes?.some((mode) => mode === "drive" || mode === "train")
      && !input.constraints?.transportModes?.includes("flight"));
    const unsupportedHeuristicRail = baseline.mode === "train"
      && !curated
      && baseline.planningConfidence?.availability.state !== "structured";
    const estimate: EstimatedLeg = unsupportedHeuristicRail
      ? {
          ...baseline,
          mode: "unknown",
          durationMinutes: null,
          note: "Rail could be considered for this distance, but Morrovia has no supported service fact for this exact leg.",
          confidence: "unconfirmed",
          transferImpact: undefined,
        }
      : international && overlandPreferred && directDistance !== null && directDistance <= 700 && baseline.mode === "flight"
      ? {
          ...baseline,
          mode: "unknown",
          durationMinutes: null,
          note: "Overland travel is preferred and may be practical regionally, but Morrovia has no supported road, rail or ferry service fact for this cross-border leg.",
          confidence: "unconfirmed",
          transferImpact: undefined,
        }
      : baseline;
    const impact = estimate.transferImpact;
    const headlineMinutes = knownMinutes(impact?.headline);
    const estimatedDoorToDoor = knownMinutes(impact?.doorToDoor) ?? estimate.durationMinutes;
    const rawDuration = curated?.planningMinutes ?? estimate.durationMinutes;
    const doorToDoorMinutes = curated?.planningMinutes ?? estimatedDoorToDoor;
    const validation = validateEstimate({
      from,
      to,
      estimate: { ...estimate, mode: curated?.mode ?? estimate.mode },
      durationMinutes: rawDuration,
      headlineMinutes,
      doorToDoorMinutes,
      curated: Boolean(curated),
    });
    const invalid = validation.warnings.length > 0;
    const confidence = invalid || estimate.confidence === "unconfirmed"
      ? "unknown" as const
      : international && !curated
        ? "low" as const
        : estimate.confidence;
    const classification = classificationFor(from, to, validation.distanceKm);
    const warningNote = validation.warnings.join(" ");
    return {
      id: `${input.tripId}-leg-${index + 1}`,
      fromStopId: from.id,
      toStopId: to.id,
      fromEndpoint: from,
      toEndpoint: to,
      classification,
      mode: invalid ? "unknown" : curated?.mode ?? estimate.mode,
      distanceKm: validation.distanceKm,
      straightLineDistanceKm: validation.distanceKm,
      routedDistanceKm: null,
      durationMinutes: invalid ? null : rawDuration,
      headlineMinutes: invalid ? null : headlineMinutes,
      doorToDoorMinutes: invalid ? null : doorToDoorMinutes,
      usableDayLoss: invalid ? null : impact?.usableDayLoss.estimatedDayFraction ?? null,
      provider: invalid ? warningNote : curated?.note ?? estimate.note,
      provenance: invalid ? "unknown" : "planning_estimate",
      confidence,
      scheduleNeedsChecking: true,
      warnings: validation.warnings,
      routeMetadata: {
        planningEstimate: true,
        source: curated ? "curated-route" : "morrovia-planner",
        ...(curated ? { curatedRouteTransfer: curated } : {}),
        label: estimate.label,
        routingConfidence: invalid ? "unconfirmed" : curated?.confidence ?? estimate.confidence,
        ...(invalid ? {} : { transferImpact: impact }),
        planningConfidence: estimate.planningConfidence,
        classification,
        validationWarnings: validation.warnings,
      },
    };
  });
}

export function canonicalLegIntegrityIssues(trip: Pick<EasyTTrip, "id" | "brief" | "stops" | "legs">) {
  const expectedEndpoints = canonicalRouteEndpoints(trip);
  const issues: Array<{ legId: string | null; message: string }> = [];
  if (!trip.brief.origin.trim()) issues.push({ legId: null, message: "The journey origin is missing." });
  if (!validCoordinates(trip.brief.originCoordinates)) issues.push({ legId: null, message: "The journey origin needs validated coordinates." });
  if (trip.stops.length && trip.legs.length !== trip.stops.length) {
    issues.push({ legId: null, message: "The canonical route must contain one arrival leg plus one leg between each overnight stop." });
  }
  trip.legs.forEach((leg, index) => {
    const expectedFrom = expectedEndpoints[index];
    const expectedTo = expectedEndpoints[index + 1];
    const from = routeEndpointForLeg(trip, leg, "from");
    const to = routeEndpointForLeg(trip, leg, "to");
    if (!from || !to || from.id !== expectedFrom?.id || to.id !== expectedTo?.id) {
      issues.push({ legId: leg.id, message: "This saved leg no longer matches the canonical route order." });
    }
    const coordinatesValid = validCoordinates(from?.coordinates) && validCoordinates(to?.coordinates);
    const straightLine = coordinatesValid ? haversineKm(from?.coordinates ?? undefined, to?.coordinates ?? undefined) : null;
    if (!coordinatesValid) issues.push({ legId: leg.id, message: "Both leg endpoints need validated coordinates." });
    if (from && to && from.kind !== "origin" && sameEntity(from, to, straightLine)) {
      issues.push({ legId: leg.id, message: "The leg endpoints resolve to the same place." });
    }
    if (straightLine !== null && leg.distanceKm !== null && Math.abs(straightLine - leg.distanceKm) > Math.max(25, straightLine * 0.08)) {
      issues.push({ legId: leg.id, message: "The saved distance does not match the canonical endpoint coordinates." });
    }
    const headline = leg.headlineMinutes ?? null;
    const doorToDoor = leg.doorToDoorMinutes ?? leg.durationMinutes;
    if (headline !== null && doorToDoor !== null && doorToDoor < headline) {
      issues.push({ legId: leg.id, message: "Door-to-door time cannot be shorter than headline transport time." });
    }
    const speedLimit = maxPlausibleSpeedKmh[leg.mode];
    const speedMinutes = headline ?? doorToDoor;
    if (straightLine !== null && speedLimit && speedMinutes !== null && speedMinutes > 0 && straightLine / (speedMinutes / 60) > speedLimit) {
      issues.push({ legId: leg.id, message: `The ${leg.mode} duration would require an implausible average speed.` });
    }
    const expectedClassification = from && to ? classificationFor(from, to, straightLine) : null;
    if (leg.classification && expectedClassification && leg.classification !== expectedClassification) {
      issues.push({ legId: leg.id, message: `The leg is classified as ${leg.classification}, but its canonical route context requires ${expectedClassification}.` });
    }
    if (leg.warnings?.length) issues.push(...leg.warnings.map((message) => ({ legId: leg.id, message })));
    if (leg.mode === "unknown" || leg.durationMinutes === null) {
      issues.push({ legId: leg.id, message: `${from?.name ?? "This endpoint"} → ${to?.name ?? "the next endpoint"} still needs a credible transport time.` });
    }
  });
  return issues;
}
