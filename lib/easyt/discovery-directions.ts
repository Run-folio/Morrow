import type { DiscoveryPlace } from "./discovery-content.ts";
import type { ResolvedPlaceMention } from "./place-intelligence.ts";
import { routeFamilies } from "./route-catalog.ts";

/** Direction membership is editorial geography, not a transfer or route claim. */
export type DiscoveryDirection = {
  id: string;
  titleKey: string;
  /** Reviewed route-family identity. Curated translated groups keep titleKey only. */
  title?: string;
  summary?: string;
  placeIds: string[];
  imageKey: string | null;
};

const australiaDirectionTitles = [
  ["australia-east-coast", "discovery.direction.australiaEastCoast"],
  ["australia-south", "discovery.direction.australiaSouth"],
  ["australia-tasmania", "discovery.direction.australiaTasmania"],
  ["australia-west", "discovery.direction.australiaWest"],
  ["australia-north-interior", "discovery.direction.australiaNorthInterior"],
] as const;

/** Only groups with at least three individually evidenced children become cards. */
export function discoveryDirectionsForPlaces(places: readonly DiscoveryPlace[], mention?: ResolvedPlaceMention): DiscoveryDirection[] {
  const australia = australiaDirectionTitles.flatMap(([id, titleKey]) => {
    const members = places.filter(place => place.country === "Australia" && place.groupIds.includes(id));
    if (members.length < 3) return [];
    return [{ id, titleKey, placeIds: members.map(place => place.id), imageKey: null }];
  });
  if (australia.length) return australia;
  if (mention?.placeType !== "continent" && mention?.placeType !== "macro_region") return [];
  const reviewedFamilies = routeFamilies.flatMap(route => {
    if (!route.reviewedAt) return [];
    const id = `route-family:${route.key}`;
    const members = places.filter(place => place.groupIds.includes(id));
    if (members.length < 3) return [];
    return [{
      id,
      titleKey: id,
      title: route.title,
      summary: members.slice(0, 4).map(place => place.name).join(" · "),
      placeIds: members.map(place => place.id),
      imageKey: route.key,
    }];
  });
  // A single route family is not a meaningful direction choice.
  return reviewedFamilies.length >= 2 ? reviewedFamilies : [];
}
