import type { RouteFamily } from "./route-catalog.ts";
import { routeImagePhoto, routeImages } from "./route-images.ts";
import { routeStopPhoto } from "./route-stop-photography.ts";

export type RouteVisualReadiness = {
  routeKey: string;
  heroImageAvailable: boolean;
  heroImageProvenanced: boolean;
  destinationImageCount: number;
  destinationCount: number;
  status: "fully-visual" | "hero-ready" | "missing-hero";
  fallbackBehaviour: "none" | "compact destination fallback" | "compact route fallback";
};

/** Validation only: publication remains an explicit editorial decision. */
export function checkRouteVisualReadiness(route: Pick<RouteFamily, "key" | "visitIntents"> & { stops: ReadonlyArray<Pick<RouteFamily["stops"][number], "name" | "country">> }): RouteVisualReadiness {
  const destinationImageCount = route.stops.filter(stop => routeStopPhoto(route, stop)).length;
  const hero = routeImagePhoto(route.key);
  const heroImageAvailable = Boolean(routeImages[route.key]);
  const heroImageProvenanced = Boolean(hero?.author && hero.sourceUrl && hero.license && hero.variants.length);
  const status = !heroImageAvailable || !heroImageProvenanced
    ? "missing-hero"
    : destinationImageCount === route.stops.length ? "fully-visual" : "hero-ready";
  return {
    routeKey: route.key,
    heroImageAvailable,
    heroImageProvenanced,
    destinationImageCount,
    destinationCount: route.stops.length,
    status,
    fallbackBehaviour: status === "fully-visual" ? "none" : status === "hero-ready" ? "compact destination fallback" : "compact route fallback",
  };
}
