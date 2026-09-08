import { routeFamilyByKey } from "../../../../lib/easyt/route-catalog.ts";
import { publicRoutePublishedFamilies, type PublicRouteDetail } from "../../../../lib/easyt/public-route.ts";
import { routeDestinationPhoto, routeImageCredit } from "../../../../lib/easyt/route-images.ts";

export type RoutePhoto = NonNullable<ReturnType<typeof routeDestinationPhoto>>;
export type RouteNightGuide = { minimum: number | null; recommended: number | null; rationale?: string };

/** Presentation projection only. Never creates or edits planning facts. */
export function routeDetailPresentation(detail: PublicRouteDetail) {
  const family = routeFamilyByKey[detail.key];
  const photos = detail.stops.map(stop => routeDestinationPhoto(stop.name, stop.country));
  const heroCredit = routeImageCredit(detail.heroImage);
  const hero = heroCredit ? photos.find(photo => photo?.variants.some(variant => variant.src === detail.heroImage)) ?? null : null;
  const closing = photos.find(photo => photo && photo.key !== hero?.key) ?? hero;
  const comma = detail.title.indexOf(",");
  return {
    title: comma > 0 ? detail.title.slice(0, comma) : detail.title,
    emphasis: comma > 0 ? detail.title.slice(comma + 1).trim() : "",
    character: family?.character ?? detail.rhythm ?? detail.interestLabel,
    hero, closing, photos,
    nights: detail.stops.map(stop => {
      const source = family?.stops.find(item => item.name === stop.name && item.country === stop.country);
      return { minimum: source?.minimumNights ?? null, recommended: source?.recommendedNights ?? null, rationale: source?.nightGuidanceRationale } satisfies RouteNightGuide;
    }),
    release: family?.release,
  };
}

export function relatedRouteDetails(detail: PublicRouteDetail, hiddenKeys: readonly string[] = []) {
  const source = routeFamilyByKey[detail.key];
  return publicRoutePublishedFamilies()
    .filter(route => route.key !== detail.key && !hiddenKeys.includes(route.key))
    .map(route => ({ route, score: Number(route.region === source?.region) * 2 + route.interests.filter(interest => source?.interests.includes(interest)).length }))
    .sort((a, b) => b.score - a.score || a.route.key.localeCompare(b.route.key))
    .slice(0, 2)
    .map(({ route }) => ({ key: route.key, title: route.title, countries: [...new Set(route.stops.map(stop => stop.country))], stopCount: route.stops.length, href: `/journey/routes/${encodeURIComponent(route.key)}` }));
}

