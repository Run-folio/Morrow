import type { MapResultPlace } from "./map-result-selection.ts";
import type { GoogleCanvasPlace } from "./google-trip-map-adapter.ts";
import type { PlannerMapPin } from "./trip.ts";

function hasReliableCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && Math.abs(value[0]) <= 180
    && Math.abs(value[1]) <= 90
    && !(value[0] === 0 && value[1] === 0);
}

/** Project the exact Morrovia inventory into Google-canvas pins; no provider name matching. */
export function googleCanvasPlacesForMapResults(
  results: readonly MapResultPlace[],
  plannerPins: readonly (PlannerMapPin & { stopId?: string | null })[] = [],
): GoogleCanvasPlace[] {
  const resultPlaces = results.filter((result) => hasReliableCoordinates(result.coordinates)).map((result) => ({
    id: result.selectionId,
    sourceId: result.sourceId,
    stopId: result.stopId,
    name: result.name,
    category: result.kind,
    coordinates: result.coordinates,
    ...(result.state !== "result" ? { state: result.state } : {}),
  }));
  const pinPlaces = plannerPins.filter((pin) => hasReliableCoordinates([pin.longitude, pin.latitude])).map((pin) => ({
    id: pin.id,
    sourceId: pin.id,
    stopId: pin.stopId ?? null,
    name: pin.title,
    category: pin.category === "stay" ? "stay" as const
      : pin.category === "restaurant" ? "eat" as const
        : pin.category === "activity" ? "see" as const
          : pin.category === "transport" ? "transport" as const : "custom" as const,
    coordinates: [pin.longitude, pin.latitude] as [number, number],
    plannerPin: true as const,
  }));
  return [...resultPlaces, ...pinPlaces];
}
