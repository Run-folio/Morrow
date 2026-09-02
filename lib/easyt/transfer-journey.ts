import type { TransferSegment, TripLeg } from "./trip.ts";

function normalized(value: string | undefined) {
  return value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ?? "";
}

function endpointIdentity(endpoint: NonNullable<TripLeg["fromEndpoint"]>) {
  return endpoint.canonicalPlaceId || endpoint.providerId || `${normalized(endpoint.country)}:${normalized(endpoint.name)}`;
}

export function canonicalTransferSegments(leg: TripLeg): TransferSegment[] {
  if (leg.segments?.length) return leg.segments;
  if (!leg.fromEndpoint || !leg.toEndpoint || leg.mode === "mixed") return [];
  return [{
    id: `${endpointIdentity(leg.fromEndpoint)}:${endpointIdentity(leg.toEndpoint)}:${leg.mode}:legacy`,
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
  }];
}

export function transferJourneyModeLabel(leg: Pick<TripLeg, "mode" | "segments">) {
  if (leg.mode === "mixed") {
    const modes = [...new Set((leg.segments ?? []).map((item) => item.mode))];
    return modes.length ? modes.map((mode, index) => {
      const label = mode === "train" ? "rail" : mode;
      return index === 0 ? label[0].toUpperCase() + label.slice(1) : label;
    }).join(" + ") : "Mixed transfer";
  }
  if (leg.mode === "train") return "Rail";
  if (leg.mode === "road") return "Road";
  if (leg.mode === "flight") return "Flight";
  if (leg.mode === "ferry") return "Ferry";
  if (leg.mode === "walk") return "Walk";
  return "Unknown transport";
}

export function transferJourneySegmentSummary(leg: Pick<TripLeg, "segments">) {
  return (leg.segments ?? []).map((item) => {
    const action = item.mode === "train" ? "Rail" : item.mode === "road" ? "Ground transfer" : item.mode[0].toUpperCase() + item.mode.slice(1);
    return `${action} to ${item.toEndpoint.name}`;
  }).join(" · ");
}
