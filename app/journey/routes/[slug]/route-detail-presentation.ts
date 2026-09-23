import { routeFamilyByKey } from "../../../../lib/easyt/route-catalog.ts";
import { publicRoutePublishedFamilies, type PublicRouteDetail } from "../../../../lib/easyt/public-route.ts";
import { discoveryCatalogue } from "../../../../lib/easyt/discovery-catalogue.ts";
import { routePhotoForSource, routeEditorialPhoto } from "../../../../lib/easyt/route-images.ts";
import { routeStopPhoto } from "../../../../lib/easyt/route-stop-photography.ts";

import { routeEditorialImagery } from "../../../../lib/easyt/route-editorial-imagery.ts";

export type RoutePhoto = NonNullable<ReturnType<typeof routePhotoForSource>>;
export type RouteNightGuide = { minimum: number | null; recommended: number | null; rationale?: string };
export type RouteExperience = PublicRouteDetail["attractions"][number] & {
  photo: RoutePhoto | null;
  photoQualification: string | null;
};
export type RouteDiscoveryHighlight = {
  id: string;
  title: string;
  stopName: string;
  context: string;
  photo: RoutePhoto;
};
export type RouteDiscoveryExperience = {
  name: string;
  stopName: string;
  context: string;
  photo: RoutePhoto;
};
export type RouteDiscoveryPresentation = {
  isRich: boolean;
  story: {
    promise: string;
    arc: string | null;
    rhythm: string | null;
    bestFor: string;
    styleSignals: string[];
  };
  highlights: RouteDiscoveryHighlight[];
  experiences: RouteDiscoveryExperience[];
  practical: string[];
  additions: [];
};

const unique = <T,>(values: T[]) => values.filter((value, index, all) => all.indexOf(value) === index);

function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function isRouteDetailPhoto(photo: RoutePhoto | null): photo is RoutePhoto {
  return Boolean(photo?.author && photo.licenseUrl && photo.sourceUrl
    && photo.variants.length
    && !photo.approvedRoles?.includes("homepage-featured-route"));
}

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
  const photos = detail.stops.map(stop => family ? routeStopPhoto(family, stop) : null);
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

/** Selects only reviewed route story and imagery; it never creates travel facts. */
export function routeDiscoveryPresentation(detail: PublicRouteDetail): RouteDiscoveryPresentation {
  const family = routeFamilyByKey[detail.key];
  const editorial = routeEditorialImagery[detail.key];
  const photos = detail.stops.map(stop => family ? routeStopPhoto(family, stop) : null);
  const stopHighlights = detail.stops.flatMap((stop, index): RouteDiscoveryHighlight[] => {
    const photo = photos[index];
    return isRouteDetailPhoto(photo) ? [{
      id: `stop-${stop.id}`,
      title: stop.name,
      stopName: stop.name,
      context: stop.reason,
      photo,
    }] : [];
  });
  const momentHighlights = (editorial?.moments ?? []).flatMap((moment, index): RouteDiscoveryHighlight[] => {
    const photo = routeEditorialPhoto(moment.photoKey);
    return isRouteDetailPhoto(photo) ? [{
      id: `moment-${index}-${moment.photoKey}`,
      title: moment.name,
      stopName: moment.stopName,
      context: moment.context,
      photo,
    }] : [];
  });
  const experiences = (editorial?.moments ?? []).flatMap((moment): RouteDiscoveryExperience[] => {
    const photo = routeEditorialPhoto(moment.photoKey);
    return isRouteDetailPhoto(photo) ? [{ ...moment, photo }] : [];
  });
  const candidates = [...stopHighlights, ...momentHighlights].slice(0, 10);
  const isRich = Boolean(editorial)
    && (editorial?.moments.length ?? 0) >= 3
    && photos.length > 0
    && photos.every(isRouteDetailPhoto)
    && candidates.length >= 6
    && experiences.length >= 3;

  return {
    isRich,
    story: {
      promise: detail.summary,
      arc: family?.release?.routeOrderRationale ?? detail.countryContext ?? null,
      rhythm: family?.character ?? detail.rhythm ?? null,
      bestFor: family?.bestFor ?? detail.summary,
      styleSignals: (family?.interests ?? []).map(titleCase),
    },
    highlights: isRich ? candidates : [],
    experiences: isRich ? experiences : [],
    practical: unique([detail.conditions, ...detail.seasonalNotes].filter((item): item is string => Boolean(item))),
    additions: [],
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
