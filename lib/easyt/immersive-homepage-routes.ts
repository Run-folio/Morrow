import { homepageEligibleRouteCards, selectHomepageRouteCards } from "./homepage-routes.ts";
import { publicRouteDetailFor, type PublicRouteDetail } from "./public-route.ts";
import { routeFamilyByKey } from "./route-catalog.ts";

/** Presentation keys, not route definitions. Publication remains canonical. */
export const immersiveRouteKeys = ["japan-slow", "balkans-overland", "vietnam-cambodia", "iceland-ring-road"] as const;
export type ImmersiveRoute = PublicRouteDetail & {
  dayRange: { min: number; max: number };
  minimumNights: number[];
  href: string;
};

export function immersiveHomepageRoutes(): ImmersiveRoute[] {
  const eligible = homepageEligibleRouteCards();
  return immersiveRouteKeys.flatMap((key) => {
    const card = eligible.find((item) => item.routeKey === key);
    const detail = card ? publicRouteDetailFor(key) : null;
    if (!card || !detail) return [];
    return [{ ...detail, dayRange: card.dayRange, href: card.href,
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

export function nextHomepageRoute(index: number, direction: number, count: number) {
  return count > 0 ? ((index + direction) % count + count) % count : 0;
}

export function routeScrollCorrection(beforeTop: number, afterTop: number) {
  const delta = afterTop - beforeTop;
  return Number.isFinite(delta) && Math.abs(delta) > 1 ? delta : 0;
}
