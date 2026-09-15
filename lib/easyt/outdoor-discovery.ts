import type { ItineraryDiscoveryPlace } from "./itinerary-day-context.ts";
import { localPlaceWithinCanonicalScope, placeDistanceKm } from "./local-place-geography.ts";
import { resolveOsmPlaceDisplayName } from "./place-display-name.ts";

export const OUTDOOR_DISCOVERY_RADIUS_KM = 50;

export type OutdoorMapElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function outdoorCategory(tags: Record<string, string>) {
  if (tags.tourism === "viewpoint") return "Viewpoint";
  if (tags.natural === "beach") return "Beach";
  if (tags.natural === "peak") return "Mountain";
  if (tags.route === "hiking") return "Hike";
  if (tags.leisure === "garden") return "Garden";
  if (tags.leisure === "park") return "Park";
  if (tags.boundary === "national_park" || /\bnational park\b/i.test(tags.name ?? "")) return "National park";
  if (/\bregional park\b/i.test(tags.name ?? "")) return "Regional park";
  if (tags.leisure === "nature_reserve" || tags.boundary === "protected_area") return "Nature reserve";
  if (tags.natural === "wood" || tags.landuse === "forest") return "Forest";
  if (tags.natural === "water" && /^(?:lake|reservoir)$/i.test(tags.water ?? "")) return "Lake";
  return null;
}

function outdoorQuality(category: string, distanceKm: number) {
  const semantic = ["National park", "Regional park", "Nature reserve", "Hike", "Mountain"].includes(category) ? 13 : 11;
  return Math.max(8, semantic - Math.floor(distanceKm / 20));
}

/** Projects only explicitly tagged outdoor features; settlement and
 * administrative records have no path into this result type. */
export function outdoorPlacesFromOpenStreetMap(input: {
  destination: string;
  country: string;
  coordinates: [number, number];
  locale?: string;
  elements: readonly OutdoorMapElement[];
}): ItineraryDiscoveryPlace[] {
  const seen = new Set<string>();
  return input.elements.flatMap((element) => {
    const tags = element.tags ?? {};
    if (tags.boundary === "administrative" || tags.admin_level || tags.place) return [];
    const category = outdoorCategory(tags);
    const display = category ? resolveOsmPlaceDisplayName(tags, input.locale ?? "en") : null;
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (!category || !display || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const coordinates: [number, number] = [longitude!, latitude!];
    if (!localPlaceWithinCanonicalScope({
      anchor: input.coordinates,
      candidate: coordinates,
      radiusKm: OUTDOOR_DISCOVERY_RADIUS_KM,
      requestedCountry: input.country,
      candidateCountry: tags["addr:country"],
    })) return [];
    const normalizedName = display.name.trim().toLocaleLowerCase();
    if (!normalizedName || normalizedName === input.destination.trim().toLocaleLowerCase() || seen.has(normalizedName)) return [];
    seen.add(normalizedName);
    const distanceKm = placeDistanceKm(input.coordinates, coordinates);
    const locality = tags["addr:city"] || tags["addr:municipality"] || tags["addr:county"] || input.destination;
    return [{
      id: `osm-outdoors-${element.type}-${element.id}`,
      title: display.name,
      area: [locality, input.country].filter(Boolean).join(", "),
      type: category,
      tags: ["Nature", category],
      description: `A mapped ${category.toLocaleLowerCase()} ${Math.max(1, Math.round(distanceKm))} km from ${input.destination}. Check current access, conditions and suitability before adding it to a day.`,
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      coordinates,
      qualityScore: outdoorQuality(category, distanceKm),
    }];
  }).sort((left, right) => (right.qualityScore ?? 0) - (left.qualityScore ?? 0)
    || placeDistanceKm(input.coordinates, left.coordinates) - placeDistanceKm(input.coordinates, right.coordinates))
    .slice(0, 12);
}
