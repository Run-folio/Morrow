import { routeFamilyByKey } from "../../../../lib/easyt/route-catalog.ts";
import { publicRoutePublishedFamilies, type PublicRouteDetail } from "../../../../lib/easyt/public-route.ts";
import { discoveryCatalogue } from "../../../../lib/easyt/discovery-catalogue.ts";
import { routeDestinationPhoto, routePhotoForSource, routeEditorialPhoto } from "../../../../lib/easyt/route-images.ts";

import { routeEditorialImagery } from "../../../../lib/easyt/route-editorial-imagery.ts";

export type RoutePhoto = NonNullable<ReturnType<typeof routePhotoForSource>>;
export type RouteNightGuide = { minimum: number | null; recommended: number | null; rationale?: string };
export type RouteExperience = PublicRouteDetail["attractions"][number] & {
  photo: RoutePhoto | null;
  photoQualification: string | null;
};

function attractionStopIndex(detail: PublicRouteDetail, stopName?: string, attractionName = "") {
  const named = stopName?.toLocaleLowerCase();
  if (named) {
    const exact = detail.stops.findIndex(stop => stop.name.toLocaleLowerCase() === named);
    if (exact >= 0) return exact;
  }
  const normalized = attractionName.toLocaleLowerCase();
  return detail.stops.findIndex(stop => normalized.includes(stop.name.toLocaleLowerCase()));
}

/** Presentation projection only. Never creates or edits planning facts. */
export function routeDetailPresentation(detail: PublicRouteDetail) {
  const family = routeFamilyByKey[detail.key];
  const editorial = routeEditorialImagery[detail.key];
  const photos = detail.stops.map(stop => routeEditorialPhoto(editorial?.bases[stop.name]?.photoKey ?? "") ?? routeDestinationPhoto(stop.name, stop.country));
  const hero = routePhotoForSource(detail.heroImage);
  const closing = routeEditorialPhoto(editorial?.closing ?? "") ?? photos.find(photo => photo && photo.key !== hero?.key) ?? hero;
  const comma = detail.title.indexOf(",");
  return {
    title: comma > 0 ? detail.title.slice(0, comma) : detail.title,
    emphasis: comma > 0 ? detail.title.slice(comma + 1).trim() : "",
    character: family?.character ?? detail.rhythm ?? detail.interestLabel,
    hero, closing, photos,
    photoCaptions: detail.stops.map(stop => editorial?.bases[stop.name]?.caption ?? null),
    nights: detail.stops.map(stop => {
      const source = family?.stops.find(item => item.name === stop.name && item.country === stop.country);
      return { minimum: source?.minimumNights ?? null, recommended: source?.recommendedNights ?? null, rationale: source?.nightGuidanceRationale } satisfies RouteNightGuide;
    }),
    release: family?.release,
    experiences: editorial ? editorial.moments.map(moment => ({ ...moment, photo: routeEditorialPhoto(moment.photoKey), photoQualification: moment.context })) : detail.attractions.slice(0, 6).map(attraction => {
      const stopIndex = attractionStopIndex(detail, attraction.stopName, attraction.name);
      const destinationPhoto = stopIndex >= 0 ? photos[stopIndex] : null;
      const stop = stopIndex >= 0 ? detail.stops[stopIndex] : null;
      const heroFallback = !destinationPhoto && stop && hero?.place === stop.name ? hero : null;
      const photo = destinationPhoto ?? heroFallback;
      const photoQualification = photo && /food/i.test(attraction.name) && !/food|market|restaurant|cuisine/i.test(photo.alt)
        ? `Destination context pictured; a subject-specific photo for ${attraction.name} is pending editorial review.`
        : null;
      return { ...attraction, photo, photoQualification } satisfies RouteExperience;
    }),
  };
}

export function relatedRouteDetails(detail: PublicRouteDetail, hiddenKeys: readonly string[] = []) {
  const source = routeFamilyByKey[detail.key];
  const relatedFamilies = publicRoutePublishedFamilies()
    .filter(route => route.key !== detail.key && !hiddenKeys.includes(route.key))
    .map(route => ({ route, score: Number(route.region === source?.region) * 2 + route.interests.filter(interest => source?.interests.includes(interest)).length }))
    .sort((a, b) => b.score - a.score || a.route.key.localeCompare(b.route.key))
    .slice(0, 2)
    .map(({ route }) => route);
  return discoveryCatalogue(relatedFamilies);
}
