import { publicRouteDetailFor, publicRoutePublishedFamilies, type PublicRoutePlanDraft } from "./public-route.ts";
import { discoveryCharacter } from "./route-discovery.ts";
import type { RouteFamily } from "./route-catalog.ts";
import { routeDestinationPhoto, routeImagePhoto, type RoutePhotoRecord } from "./route-images.ts";

export type DiscoveryImage = { variants: { src: string; width: number; height?: number }[]; alt: string; credit: string; sourceUrl: string; license: string; licenseUrl?: string };
export type DiscoveryRoute = Pick<RouteFamily, "key" | "title" | "region" | "interests" | "bestFor" | "suggestedDays"> & {
  href: string; countries: string[]; character: string; imageQuery: string;
  stops: { id: string; name: string; country: string; coordinates: [number, number]; reason: string }[];
  image: DiscoveryImage | null; supportingImage: DiscoveryImage | null;
};
function discoveryImage(photo: RoutePhotoRecord | null): DiscoveryImage | null {
  return photo ? { variants: photo.variants, alt: photo.alt, credit: `${photo.author} · ${photo.license}`, sourceUrl: photo.sourceUrl, license: photo.license, licenseUrl: photo.licenseUrl } : null;
}

/** Resolve through the same licensed image owner used by immersive Route Detail. */
export function discoveryImageFor(route: RouteFamily, supporting = false): DiscoveryImage | null {
  const hero = routeImagePhoto(route.key);
  if (!supporting) return discoveryImage(hero);
  const photo = route.stops.map(stop => routeDestinationPhoto(stop.name, stop.country)).find(candidate => candidate && candidate.key !== hero?.key) ?? null;
  return discoveryImage(photo);
}

/** A presentation projection, called only on the server. No catalogue fixture or new publication rule. */
export function discoveryCatalogue(visibleRoutes: readonly RouteFamily[] = publicRoutePublishedFamilies()): DiscoveryRoute[] {
  const publicKeys = new Set(publicRoutePublishedFamilies().map((route) => route.key));
  return visibleRoutes.flatMap((route) => {
    if (!publicKeys.has(route.key)) return [];
    const detail = publicRouteDetailFor(route.key);
    if (!detail) return [];
    return [{ key: route.key, title: detail.title, href: `/journey/routes/${detail.key}`, region: route.region, countries: detail.countries, interests: route.interests, bestFor: route.bestFor,
      suggestedDays: route.suggestedDays, character: discoveryCharacter({ ...route, countries: detail.countries }, detail.rhythm),
      stops: detail.stops.map(({ id, name, country, coordinates, reason }) => ({ id, name, country, coordinates, reason })),
      imageQuery: route.imageQuery ?? `${detail.stops[0].name} ${detail.stops[0].country} travel`,
      image: discoveryImageFor(route), supportingImage: discoveryImageFor(route, true),
    }];
  });
}
export function publicDiscoveryDraft(key: string, visibleRoutes: readonly { key: string }[]): PublicRoutePlanDraft | null {
  if (!visibleRoutes.some((route) => route.key === key) || !publicRoutePublishedFamilies().some((route) => route.key === key)) return null;
  return publicRouteDetailFor(key)?.planDraft ?? null;
}
