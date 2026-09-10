import type { DiscoveryImage, DiscoveryRoute } from "./discovery-catalogue.ts";
import { publicDiscoveryDraft } from "./discovery-catalogue.ts";
import type { PublicRoutePlanDraft } from "./public-route.ts";
import { routeEditorialPhoto } from "./route-images.ts";
import { routeEditorialImagery } from "./route-editorial-imagery.ts";

/** Presentation order only. The supplied canonical catalogue owns eligibility and facts. */
export const routesOverviewChapters = [
  { key: "japan-south-korea", title: "Japan + Korea,", emphasis: "a world between.", photoKeys: ["kyoto", "tokyo"] },
  { key: "iceland-ring-road", title: "Iceland’s open road,", emphasis: "at your pace.", photoKeys: ["glacier-lagoon", "skogafoss"] },
  { key: "balkans-overland", title: "Across borders,", emphasis: "along the Adriatic.", photoKeys: ["kotor", "dubrovnik"] },
  { key: "vietnam-cambodia", title: "Vietnam to Angkor,", emphasis: "with room to linger.", photoKeys: ["angkor-wat", "trang-an"] },
  { key: "namibia-self-drive", title: "Namibia,", emphasis: "wide open.", photoKeys: ["sossusvlei", "etosha"] },
  { key: "peru-bolivia", title: "Through the Andes,", emphasis: "above the everyday.", photoKeys: ["uyuni"] },
  { key: "mexico-guatemala", title: "Mexico to Guatemala,", emphasis: "another kind of rhythm.", photoKeys: ["atitlan", "oaxaca"] },
] as const;

export const routesOverviewHeroPhotoKeys = ["scotland-islands", "thingvellir"] as const;

export type RoutesEditorialChapter = { route: DiscoveryRoute; draft: PublicRoutePlanDraft; title: string; emphasis: string; image: DiscoveryImage | null };
export type RoutesOverviewEditorial = { hero: DiscoveryImage | null; chapters: RoutesEditorialChapter[] };

/** Keep the single catalogue and its facts, choosing a fresh thumbnail when available. */
export function catalogueWithEditorialImages(routes: readonly DiscoveryRoute[], editorial: RoutesOverviewEditorial): DiscoveryRoute[] {
  const used = new Set([editorial.hero, ...editorial.chapters.map(chapter => chapter.image)].flatMap(image => image ? [image.sourceUrl] : []));
  return routes.map(route => ({ ...route, image: preferUnusedPhotograph([
    route.image, route.supportingImage,
    ...(routeEditorialImagery[route.key]?.moments ?? []).map(moment => photograph(moment.photoKey)),
  ], used) }));
}

function photograph(key: string): DiscoveryImage | null {
  const photo = routeEditorialPhoto(key);
  return photo ? { variants: photo.variants, alt: photo.alt, credit: `${photo.author} · ${photo.license}`, sourceUrl: photo.sourceUrl, license: photo.license, licenseUrl: photo.licenseUrl } : null;
}

/** Source URL identifies the asset across responsive sizes, not a particular WebP. */
export function preferUnusedPhotograph(candidates: readonly (DiscoveryImage | null | undefined)[], used: Set<string>) {
  const photos = candidates.filter((photo): photo is DiscoveryImage => Boolean(photo?.variants.length));
  const selected = photos.find(photo => !used.has(photo.sourceUrl)) ?? photos[0] ?? null;
  if (selected) used.add(selected.sourceUrl);
  return selected;
}

export function routesOverviewEditorial(routes: readonly DiscoveryRoute[]): RoutesOverviewEditorial {
  const used = new Set<string>();
  // routesOverviewHero: explicit reviewed candidates, independent of catalogue order.
  const hero = preferUnusedPhotograph(routesOverviewHeroPhotoKeys.map(photograph), used);
  const chapters = routesOverviewChapters.flatMap(spec => {
    const route = routes.find(candidate => candidate.key === spec.key);
    const draft = route ? publicDiscoveryDraft(route.key, routes) : null;
    if (!route || !draft) return [];
    // routeFeature: explicit subject choices before the canonical photographic fallback.
    const image = preferUnusedPhotograph([...spec.photoKeys.map(photograph), route.image, route.supportingImage], used);
    return [{ route, draft, title: spec.title, emphasis: spec.emphasis, image }];
  });
  return { hero, chapters };
}
