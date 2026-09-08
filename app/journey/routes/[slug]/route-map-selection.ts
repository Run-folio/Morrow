export type RouteMapSelection = { type: "stop" | "connection"; index: number } | null;

export function validRouteSelection(selection: RouteMapSelection, stopCount: number): RouteMapSelection {
  if (!selection || !Number.isInteger(selection.index) || selection.index < 0) return null;
  return selection.index < stopCount - (selection.type === "connection" ? 1 : 0) ? selection : null;
}

/** Declarative deep links work without hydration and preserve keyboard navigation. */
export function routeMapSelectionFromHash(hash: string, stopCount: number): RouteMapSelection {
  const match = /^#route-map-(stop|connection)-(\d+)$/.exec(hash);
  return match ? validRouteSelection({ type: match[1] as "stop" | "connection", index: Number(match[2]) }, stopCount) : null;
}
