import { homepageEligibleRouteCards, selectHomepageRouteCards } from "./homepage-routes.ts";
import { publicRouteDetailFor, type PublicRouteDetail } from "./public-route.ts";
import { routeFamilyByKey } from "./route-catalog.ts";
import destinationInventory from "../../public/journey/immersive/destination-inventory.json" with { type: "json" };
export { nextHomepageRoute, routeScrollCorrection } from "./homepage-navigation.ts";

/** Presentation keys, not route definitions. Publication remains canonical. */
export const immersiveRouteKeys = ["japan-slow", "balkans-overland", "vietnam-cambodia", "iceland-ring-road"] as const;
export type ImmersiveRoute = PublicRouteDetail & {
  dayRange: { min: number; max: number };
  minimumNights: number[];
  href: string;
  photos: Array<(typeof destinationInventory)[number] | null>;
};

export function immersiveHomepageRoutes(): ImmersiveRoute[] {
  const eligible = homepageEligibleRouteCards();
  return immersiveRouteKeys.flatMap((key) => {
    const card = eligible.find((item) => item.routeKey === key);
    const detail = card ? publicRouteDetailFor(key) : null;
    if (!card || !detail) return [];
    return [{ ...detail, dayRange: card.dayRange, href: card.href,
      photos: detail.stops.map((stop) => destinationInventory.find((image) => image.country === stop.country && image.place.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === stop.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) ?? null),
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
