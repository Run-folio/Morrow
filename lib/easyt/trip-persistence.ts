import type { EasyTTrip } from "./trip.ts";

/** Map canonical route endpoints onto the normalized relational leg shape. */
export function normalizedLegEndpoints(tripId: string, leg: EasyTTrip["legs"][number]) {
  const originId = `${tripId}-origin`;
  const fromKind = leg.fromEndpoint?.kind ?? (leg.fromStopId === originId ? "origin" : "stop");
  const toKind = leg.toEndpoint?.kind ?? (leg.toStopId === originId ? "origin" : "stop");
  return {
    fromEndpointId: leg.fromStopId,
    toEndpointId: leg.toStopId,
    fromEndpointKind: fromKind,
    toEndpointKind: toKind,
    fromStopId: fromKind === "stop" ? leg.fromStopId : null,
    toStopId: toKind === "stop" ? leg.toStopId : null,
  } as const;
}

