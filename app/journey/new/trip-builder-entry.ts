import type { Stop } from "./trip-builder";

/** Endpoint context never makes an overnight route. Match the existing
 * canonical route-input validity contract without gating on origin or dates. */
export function hasUsefulRouteSkeleton(stops: readonly Stop[]): boolean {
  return stops.some((stop) => Boolean(stop.id.trim() && stop.name.trim() && stop.country.trim()
    && (stop.coordinates
      ? stop.coordinates.length === 2 && stop.coordinates.every(Number.isFinite)
      : stop.canonicalPlaceId?.trim())));
}
