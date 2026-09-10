import type { RouteFamily } from "./route-catalog.ts";
import { routeEditorialImagery } from "./route-editorial-imagery.ts";
import { routeDestinationPhoto, routeEditorialPhoto, type RoutePhotoRecord } from "./route-images.ts";
import { reviewedPhotoMatchesStop } from "./published-route-image-pipeline.ts";

function stopLandmarks(route: Pick<RouteFamily, "visitIntents">, stopName: string) {
  return route.visitIntents?.filter((visit) => visit.base === stopName).map((visit) => visit.name) ?? [];
}

/** A route's reviewed editorial choice wins when it depicts this stop or an explicitly attached landmark. */
export function routeStopPhotoCandidates(
  route: Pick<RouteFamily, "key" | "visitIntents">,
  stop: Pick<RouteFamily["stops"][number], "name" | "country">,
  options?: { configuredPhotoKey?: string | null },
): RoutePhotoRecord[] {
  const exact = routeDestinationPhoto(stop.name, stop.country);
  const configuredKey = options && "configuredPhotoKey" in options
    ? options.configuredPhotoKey ?? ""
    : routeEditorialImagery[route.key]?.bases[stop.name]?.photoKey ?? "";
  const configured = routeEditorialPhoto(configuredKey);
  const landmarks = stopLandmarks(route, stop.name);
  return [configured, exact].filter((photo, index, photos): photo is RoutePhotoRecord => (
    Boolean(photo)
    && reviewedPhotoMatchesStop({ name: stop.name, country: stop.country, attachedLandmarks: landmarks }, photo!)
    && photos.findIndex((candidate) => candidate?.sourceUrl === photo?.sourceUrl) === index
  ));
}

export function routeStopPhoto(route: Pick<RouteFamily, "key" | "visitIntents">, stop: Pick<RouteFamily["stops"][number], "name" | "country">) {
  return routeStopPhotoCandidates(route, stop)[0] ?? null;
}
