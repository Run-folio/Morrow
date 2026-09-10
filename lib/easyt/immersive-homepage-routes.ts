import { homepageEligibleRouteCards, selectHomepageRouteCards } from "./homepage-routes.ts";
import { publicRouteDetailFor, type PublicRouteDetail } from "./public-route.ts";
import { routeFamilyByKey } from "./route-catalog.ts";
import { routeEditorialImagery } from "./route-editorial-imagery.ts";
import { routeEditorialPhoto, type RoutePhotoRecord } from "./route-images.ts";
import { routeStopPhotoCandidates } from "./route-stop-photography.ts";
import generatedInventory from "../../public/journey/immersive/asset-inventory.json" with { type: "json" };
export { nextHomepageRoute, routeScrollCorrection } from "./homepage-navigation.ts";

/** Presentation keys, not route definitions. Publication remains canonical. */
export const immersiveRouteKeys = [
  "japan-south-korea",
  "iceland-ring-road",
  "balkans-overland",
  "vietnam-cambodia",
  "namibia-self-drive",
  "peru-bolivia",
  "mexico-guatemala",
] as const;
export type ImmersiveRoute = PublicRouteDetail & {
  dayRange: { min: number; max: number };
  minimumNights: number[];
  href: string;
  heroPhoto: { variants: Array<{ src: string; width: number; height?: number; bytes?: number }>; credit: string; creditEs: string; country: string; rights: string; source: string } | null;
  photos: Array<RoutePhotoRecord | null>;
  photoCandidates: Array<RoutePhotoRecord[]>;
};

export type HomepageRouteStopCard = {
  index: number;
  photo: RoutePhotoRecord | null;
};

const normalizedPlace = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function responsivePhotoSource(photo: RoutePhotoRecord) {
  return photo.sourceUrl || photo.key;
}

function candidatesForStop(routeKey: string, stop: PublicRouteDetail["stops"][number]) {
  const route = routeFamilyByKey[routeKey];
  const base = routeEditorialImagery[routeKey]?.bases[stop.name];
  const configuredPhotoKey = base?.panelPhotoKey === null ? null : base?.panelPhotoKey ?? base?.photoKey;
  return route ? routeStopPhotoCandidates(route, stop, { configuredPhotoKey }) : [];
}

/** Homepage-only projection. Route detail, planning and persistence keep the full stop list. */
export function homepageRouteStopIndexes(route: Pick<ImmersiveRoute, "key" | "stops">) {
  const configured = routeEditorialImagery[route.key]?.panelStopIndexes;
  if (configured?.length) return configured.filter(index => index >= 0 && index < route.stops.length).slice(0, 7);
  const lastIsCircularReturn = route.stops.length > 1 && normalizedPlace(route.stops[0].name) === normalizedPlace(route.stops.at(-1)!.name);
  const available = Array.from({ length: lastIsCircularReturn ? route.stops.length - 1 : route.stops.length }, (_, index) => index);
  if (available.length <= 7) return available;
  const target = 6;
  return Array.from({ length: target }, (_, index) => available[Math.round(index * (available.length - 1) / (target - 1))]);
}

/** Assigns visible cards by underlying credited source, not responsive derivative URL. */
export function homepageRouteStopCards(route: ImmersiveRoute): HomepageRouteStopCard[] {
  const indexes = homepageRouteStopIndexes(route);
  const exactOwners = new Map<string, number>();
  for (const index of indexes) {
    const stop = route.stops[index];
    for (const photo of route.photoCandidates[index] ?? []) {
      if (normalizedPlace(photo.place) === normalizedPlace(stop.name)) exactOwners.set(responsivePhotoSource(photo), index);
    }
  }
  const used = new Set<string>();
  const heroSources = new Set([
    routeEditorialPhoto(routeEditorialImagery[route.key]?.hero ?? "")?.sourceUrl,
    route.heroPhoto?.source,
  ].filter((source): source is string => Boolean(source)));
  return indexes.map(index => {
    const candidates = (route.photoCandidates[index] ?? []).filter(photo => {
      const owner = exactOwners.get(responsivePhotoSource(photo));
      return owner === undefined || owner === index;
    });
    const unused = candidates.filter(photo => !used.has(responsivePhotoSource(photo)));
    const photo = unused.find(candidate => !heroSources.has(responsivePhotoSource(candidate))) ?? unused[0] ?? null;
    if (photo) used.add(responsivePhotoSource(photo));
    return { index, photo };
  });
}

function heroFor(key: string): ImmersiveRoute["heroPhoto"] {
  const featured = routeEditorialImagery[key]?.homepageHero;
  if (!featured) return null;
  if ("generatedAsset" in featured) {
    const generated = generatedInventory.find(image => image.file === featured.generatedAsset);
    if (!generated?.label) return null;
    return { variants: generated.variants, credit: featured.credit, creditEs: featured.creditEs, country: generated.label, rights: generated.rights, source: generated.source };
  }
  const photo = routeEditorialPhoto(featured.photoKey);
  if (!photo) return null;
  const credit = `${photo.place} · ${photo.author} · ${photo.license}`;
  return { variants: photo.variants, credit, creditEs: credit, country: photo.country, rights: photo.license, source: photo.sourceUrl };
}

export function immersiveHomepageRoutes(): ImmersiveRoute[] {
  const eligible = homepageEligibleRouteCards();
  return immersiveRouteKeys.flatMap((key) => {
    const card = eligible.find((item) => item.routeKey === key);
    const detail = card ? publicRouteDetailFor(key) : null;
    if (!card || !detail) return [];
    const photoCandidates = detail.stops.map(stop => candidatesForStop(key, stop));
    return [{ ...detail, heroPhoto: heroFor(key), dayRange: card.dayRange, href: card.href, photoCandidates,
      photos: detail.stops.map((stop) => routeStopPhotoCandidates(routeFamilyByKey[key], stop)[0] ?? null),
      // Unresolved legacy hero rights: use the attributed destination-photo
      // owner until canonical release metadata explicitly clears the asset.
      heroImage: routeFamilyByKey[key].release?.image?.asset === detail.heroImage ? detail.heroImage : "",
      minimumNights: routeFamilyByKey[key].stops.map((stop) => stop.minimumNights),
    }];
  });
}

/** Reuses the existing server selection algorithm; serialized into client props. */
export function initialImmersiveRouteIndex(routes: readonly ImmersiveRoute[], random = Math.random) {
  const cards = homepageEligibleRouteCards().filter((card) => routes.some((route) => route.key === card.routeKey));
  const chosen = selectHomepageRouteCards(cards, 1, random)[0];
  return Math.max(0, routes.findIndex((route) => route.key === chosen?.routeKey));
}
