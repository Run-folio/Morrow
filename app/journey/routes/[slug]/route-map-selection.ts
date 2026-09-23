export type EditorialJourneySelection =
  | { kind: "route" }
  | { kind: "stop"; stopId: string }
  | { kind: "connection"; connectionId: string };

export type RouteMapSelection = EditorialJourneySelection;

type EditorialSelectionStop = {
  id: string;
  onward?: { id?: string | null } | null;
};

export function editorialConnectionId(fromStopId: string, toStopId: string, legId?: string | null) {
  return legId ?? `connection:${fromStopId}:${toStopId}`;
}

function connectionIdAt(stops: readonly EditorialSelectionStop[], index: number) {
  const from = stops[index];
  const to = stops[index + 1];
  return from && to ? editorialConnectionId(from.id, to.id, from.onward?.id) : null;
}

export function validRouteSelection(selection: EditorialJourneySelection, stops: readonly EditorialSelectionStop[]): EditorialJourneySelection {
  if (selection.kind === "route") return selection;
  if (selection.kind === "stop") return stops.some((stop) => stop.id === selection.stopId) ? selection : { kind: "route" };
  return stops.some((_, index) => connectionIdAt(stops, index) === selection.connectionId) ? selection : { kind: "route" };
}

/** Public hashes remain index-shaped for stable no-JS links; runtime selection uses canonical IDs. */
export function routeMapSelectionFromHash(hash: string, stops: readonly EditorialSelectionStop[]): EditorialJourneySelection {
  const match = /^#route-map-(stop|connection)-(\d+)$/.exec(hash);
  if (!match) return { kind: "route" };
  const index = Number(match[2]);
  if (match[1] === "stop") return stops[index] ? { kind: "stop", stopId: stops[index].id } : { kind: "route" };
  const connectionId = connectionIdAt(stops, index);
  return connectionId ? { kind: "connection", connectionId } : { kind: "route" };
}

export function routeMapHashForSelection(selection: EditorialJourneySelection, stops: readonly EditorialSelectionStop[]) {
  if (selection.kind === "route") return "#route-map";
  if (selection.kind === "stop") {
    const index = stops.findIndex((stop) => stop.id === selection.stopId);
    return index >= 0 ? `#route-map-stop-${index}` : "#route-map";
  }
  const index = stops.findIndex((_, candidate) => connectionIdAt(stops, candidate) === selection.connectionId);
  return index >= 0 ? `#route-map-connection-${index}` : "#route-map";
}
