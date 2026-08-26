import { routePlannerPayload } from "./public-route-handoff.ts";
import { publicRouteDetailFor, publicRoutePublishedFamilies } from "./public-route.ts";

export type HomepageRouteCard = {
  key: string;
  routeKey: string;
  title: string;
  detail: string;
  href: string;
  bases: string;
  query: string[];
  stopCount: number;
  dayRange: { min: number; max: number };
};

const handoffCheckDate = new Date(2026, 0, 1, 12);

function hasUsableHandoff(routeKey: string, detail: NonNullable<ReturnType<typeof publicRouteDetailFor>>) {
  try {
    const payload = routePlannerPayload(detail.planDraft, handoffCheckDate);
    return payload.sourceRouteKey === routeKey
      && payload.destinations.length === detail.stops.length
      && payload.destinations.length >= 2
      && payload.destinations.every((stop) => Boolean(stop.name && stop.country && stop.coordinates.length === 2))
      && payload.structuredBrief.placeIssues?.some((issue) => issue.blocksRoute) !== true;
  } catch {
    return false;
  }
}

/**
 * Homepage cards are a view of the public-route publication boundary, never a
 * parallel catalogue. A route disappears safely if its detail or planner
 * handoff stops being usable.
 */
export function homepageEligibleRouteCards(): HomepageRouteCard[] {
  return publicRoutePublishedFamilies().flatMap((route) => {
    const detail = publicRouteDetailFor(route.key);
    if (!detail || !hasUsableHandoff(route.key, detail)) return [];
    const routeNames = detail.stops.map((stop) => stop.name);
    return [{
      key: `home-${route.key}`,
      routeKey: route.key,
      title: route.title,
      detail: detail.summary,
      href: `/journey/routes/${detail.key}`,
      bases: routeNames.join(" → "),
      query: [route.imageQuery ?? "", `${routeNames[0]} ${detail.countries[0] ?? ""} travel`, `${routeNames.at(-1)} travel`].filter(Boolean),
      stopCount: detail.stops.length,
      dayRange: { min: route.suggestedDays.min, max: route.suggestedDays.max },
    }];
  });
}

/** Fisher–Yates selection. Injecting random keeps catalogue coverage exact. */
export function selectHomepageRouteCards(
  routes: readonly HomepageRouteCard[],
  count = 3,
  random: () => number = Math.random,
) {
  const shuffled = routes.map((route) => ({ ...route, query: [...route.query], dayRange: { ...route.dayRange } }));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.max(0, Math.min(0.9999999999999999, random())) * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled.slice(0, Math.max(0, count));
}
