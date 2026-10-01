import type { MapResultPlace } from "./map-result-selection.ts";
import type { GoogleCanvasPlace } from "./google-trip-map-adapter.ts";

function hasReliableCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && Math.abs(value[0]) <= 180
    && Math.abs(value[1]) <= 90
    && !(value[0] === 0 && value[1] === 0);
}

/** Project the exact Morrovia inventory into Google-canvas pins; no provider name matching. */
export function googleCanvasPlacesForMapResults(results: readonly MapResultPlace[]): GoogleCanvasPlace[] {
  return results.filter((result) => hasReliableCoordinates(result.coordinates)).map((result) => ({
    id: result.selectionId,
    sourceId: result.sourceId,
    stopId: result.stopId,
    name: result.name,
    category: result.kind,
    coordinates: result.coordinates,
  }));
}
