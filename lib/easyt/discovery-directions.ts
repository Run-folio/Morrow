import type { DiscoveryPlace } from "./discovery-content.ts";

/** Direction membership is editorial geography, not a transfer or route claim. */
export type DiscoveryDirection = {
  id: string;
  titleKey: string;
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
export function discoveryDirectionsForPlaces(places: readonly DiscoveryPlace[]): DiscoveryDirection[] {
  return australiaDirectionTitles.flatMap(([id, titleKey]) => {
    const members = places.filter(place => place.country === "Australia" && place.groupIds.includes(id));
    if (members.length < 3) return [];
    return [{ id, titleKey, placeIds: members.map(place => place.id), imageKey: null }];
  });
}
