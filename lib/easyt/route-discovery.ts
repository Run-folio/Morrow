import type { RouteFamily, RouteInterest } from "./route-catalog";

export const featuredDiscoveryRouteKeys = [
  "japan-slow",
  "andean-highlands",
  "portugal-atlantic",
  "italy-table",
] as const;

export const discoveryWonderMappings = [
  {
    key: "machu-picchu",
    placeId: "machu-picchu",
    title: "Machu Picchu",
    country: "Peru",
    primaryRouteKey: "andean-highlands",
    relatedRouteKeys: ["andean-highlands"],
    image: "/journey/peru-sacred-valley-route.jpg",
  },
  {
    key: "grand-canyon",
    placeId: "grand-canyon",
    title: "Grand Canyon",
    country: "United States",
    primaryRouteKey: "usa-southwest",
    relatedRouteKeys: ["usa-southwest"],
    image: "/journey/discovery/grand-canyon.webp",
  },
  {
    key: "taj-mahal",
    placeId: "taj-mahal",
    title: "Taj Mahal",
    country: "India",
    primaryRouteKey: "india-golden-triangle",
    relatedRouteKeys: ["india-golden-triangle"],
    image: "/journey/discovery/taj-mahal.webp",
  },
  {
    key: "colosseum",
    placeId: "colosseum",
    title: "Colosseum",
    country: "Italy",
    primaryRouteKey: "italy-greece",
    relatedRouteKeys: ["italy-greece"],
    image: "/journey/discovery/colosseum.webp",
  },
] as const;

export const discoveryStyleDefinitions: ReadonlyArray<{
  key: string;
  label: string;
  interest: RouteInterest;
}> = [
  { key: "food-led", label: "Food-led routes", interest: "food" },
  { key: "rail", label: "Rail journeys", interest: "rail" },
  { key: "nature", label: "Nature routes", interest: "nature" },
  { key: "coast", label: "Coastal calm", interest: "coast" },
  { key: "heritage", label: "Heritage routes", interest: "heritage" },
];

export function featuredDiscoveryRoutes(routes: RouteFamily[]) {
  const byKey = new Map(routes.map((route) => [route.key, route]));
  const configured = featuredDiscoveryRouteKeys.flatMap((key) => {
    const route = byKey.get(key);
    return route ? [route] : [];
  });
  return configured.length ? configured : routes.slice(0, 4);
}

export function publishedDiscoveryWonders(routes: RouteFamily[]) {
  const byKey = new Map(routes.map((route) => [route.key, route]));
  return discoveryWonderMappings.flatMap((wonder) => {
    const route = byKey.get(wonder.primaryRouteKey);
    if (!route) return [];
    const relatedRoutes = wonder.relatedRouteKeys.flatMap((key) => {
      const related = byKey.get(key);
      return related ? [related] : [];
    });
    return [{ ...wonder, route, relatedRoutes }];
  });
}

export function publishedDiscoveryStyles(routes: RouteFamily[]) {
  return discoveryStyleDefinitions.flatMap((style) => {
    const matchingRoutes = routes.filter((route) => route.interests.includes(style.interest));
    return matchingRoutes.length ? [{ ...style, route: matchingRoutes[0], matchingRoutes }] : [];
  });
}

export type DiscoveryFilters = {
  search: string;
  region: RouteFamily["region"] | "all" | "americas";
  country: string;
  style: RouteInterest | "all" | "slow";
  length: "all" | "short" | "medium" | "long";
  multi: boolean;
};
export const initialDiscoveryFilters: DiscoveryFilters = { search: "", region: "all", country: "all", style: "all", length: "all", multi: false };
export const discoveryRegions = [["all", "Anywhere"], ["asia", "Asia"], ["europe", "Europe"], ["americas", "Americas"], ["africa", "Africa"], ["oceania", "Oceania"]] as const;
export const discoveryStyles = [["all", "Any style"], ["food", "Food"], ["rail", "Rail"], ["nature", "Nature"], ["coast", "Coast"], ["culture", "Culture"], ["heritage", "Heritage"], ["slow", "Slow travel"]] as const;
export const discoveryLengths = [["all", "Any duration"], ["short", "Up to 10 days"], ["medium", "10–21 days"], ["long", "21+ days"]] as const;

type SearchableRoute = Pick<RouteFamily, "title" | "region" | "countries" | "interests" | "bestFor" | "suggestedDays"> & { stops: ReadonlyArray<{ name: string }> };
export function normalizeDiscoveryText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
export function filterDiscoveryRoutes<T extends SearchableRoute>(routes: readonly T[], filters: DiscoveryFilters): T[] {
  const terms = normalizeDiscoveryText(filters.search).split(/\s+/).filter(Boolean);
  return routes.filter((route) => {
    const text = normalizeDiscoveryText([route.title, route.region.replaceAll("-", " "), ...route.countries, ...route.stops.map((stop) => stop.name)].join(" "));
    const region = filters.region === "all" || (filters.region === "americas" ? route.region.endsWith("america") : route.region === filters.region);
    const style = filters.style === "all" || (filters.style === "slow" ? route.bestFor.toLowerCase().includes("slow") || route.suggestedDays.ideal >= 12 : route.interests.includes(filters.style));
    const length = filters.length === "all" || (filters.length === "short" ? route.suggestedDays.min <= 10 : filters.length === "medium" ? route.suggestedDays.min <= 21 && route.suggestedDays.max >= 10 : route.suggestedDays.max >= 21);
    return terms.every((term) => text.includes(term)) && region && style && length && (filters.country === "all" || route.countries.includes(filters.country)) && (!filters.multi || route.countries.length > 1);
  });
}
export function resetDiscoveryFilter(filters: DiscoveryFilters, key: keyof DiscoveryFilters): DiscoveryFilters {
  return { ...filters, [key]: initialDiscoveryFilters[key] };
}
export function discoverySequence(route: { stops: readonly { name: string }[] }) { return route.stops.map((stop) => stop.name).join(" → "); }
export function discoveryShape(route: { stops: readonly unknown[]; countries: readonly string[] }) { return `${route.stops.length} stops · ${route.countries.length} ${route.countries.length === 1 ? "country" : "countries"}`; }
export function discoveryDuration(route: { suggestedDays: { min: number; max: number } }) { return `${route.suggestedDays.min}–${route.suggestedDays.max} days`; }

/** Presentation describes existing facts; it does not infer new transport feasibility. */
export function discoveryCharacter(route: RouteFamily, rhythm?: string) {
  if (rhythm === "Altitude-aware") return "Mountains + altitude";
  if (route.connections.length && route.connections.every((connection) => connection.mode === "train")) return "Rail + pacing";
  if (route.connections.some((connection) => connection.mode === "ferry")) return "Islands + ferries";
  if (route.countries.length > 1) return "Borders + mixed connections";
  if (route.connections.length && route.connections.every((connection) => connection.mode === "road")) return "Driving + nightly pacing";
  if (route.interests.includes("coast")) return "Cities + coast";
  if (route.interests.includes("food")) return "Food + city chapters";
  return "Places + connections";
}
