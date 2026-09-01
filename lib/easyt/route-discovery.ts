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
