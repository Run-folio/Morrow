import type { NearbyBaseSuggestion } from "./place-intelligence.ts";
import { PLACE_CATALOG, normalizeCatalogPhrase } from "./place-catalog.ts";
import { placeDistanceKm } from "./local-place-geography.ts";
import type { ItineraryDiscoveryPlace } from "./itinerary-day-context.ts";

export const MINIMUM_DAY_TRIP_DISTANCE_KM = 20;
export const MAXIMUM_DAY_TRIP_DISTANCE_KM = 140;

export type DayTripDiscoveryPlace = ItineraryDiscoveryPlace & {
  discoverySource: "live-place-provider" | "reviewed-place-catalog";
};

function dayTripPlace(input: {
  id: string;
  name: string;
  area: string;
  placeType: string;
  coordinates: [number, number];
  distanceKm: number;
  destination: string;
  source: DayTripDiscoveryPlace["discoverySource"];
}): DayTripDiscoveryPlace {
  const distance = Math.max(1, Math.round(input.distanceKm));
  return {
    id: `day-trip-${input.id.replace(/[^a-z0-9_-]+/gi, "-")}`,
    title: input.name,
    area: input.area,
    type: "Day trip",
    tags: ["Day trip", "day-trips"],
    description: `A ${input.source === "reviewed-place-catalog" ? "reviewed" : "provider-identified"} nearby ${input.placeType} ${distance} km from ${input.destination}. Check current transport options before adding it to a day.`,
    coordinates: input.coordinates,
    qualityScore: Math.max(6, 14 - Math.round(input.distanceKm / 20)),
    discoverySource: input.source,
  };
}

export function dayTripPlacesFromProvider(
  destination: string,
  suggestions: readonly NearbyBaseSuggestion[],
): DayTripDiscoveryPlace[] {
  return suggestions
    .filter((suggestion) => suggestion.coordinates
      && suggestion.distanceKm >= MINIMUM_DAY_TRIP_DISTANCE_KM
      && suggestion.distanceKm <= MAXIMUM_DAY_TRIP_DISTANCE_KM)
    .slice(0, 8)
    .map((suggestion) => dayTripPlace({
      id: suggestion.canonicalPlaceId,
      name: suggestion.name,
      area: suggestion.label,
      placeType: suggestion.placeType,
      coordinates: suggestion.coordinates!,
      distanceKm: suggestion.distanceKm,
      destination,
      source: "live-place-provider",
    }));
}

/**
 * A deterministic fallback may use only reviewed catalogue identities with
 * trustworthy coordinates and direct-destination semantics. It cannot invent
 * a route, duration, fare, or claim that transport is available.
 */
export function catalogDayTripPlaces(input: {
  destination: string;
  country: string;
  canonicalPlaceId?: string;
  coordinates: [number, number];
}): DayTripDiscoveryPlace[] {
  const country = normalizeCatalogPhrase(input.country);
  const destination = normalizeCatalogPhrase(input.destination);
  return PLACE_CATALOG.flatMap((place) => {
    if (!place.coordinates || place.routability !== "direct_destination"
      || !["city", "town", "natural_area", "region"].includes(place.placeType)
      || place.canonicalPlaceId === input.canonicalPlaceId
      || normalizeCatalogPhrase(place.canonicalName) === destination
      || !place.parentCountries.some((candidate) => normalizeCatalogPhrase(candidate) === country)) return [];
    const coordinates: [number, number] = [place.coordinates[0], place.coordinates[1]];
    const distanceKm = placeDistanceKm(input.coordinates, coordinates);
    if (distanceKm < MINIMUM_DAY_TRIP_DISTANCE_KM || distanceKm > MAXIMUM_DAY_TRIP_DISTANCE_KM) return [];
    return [dayTripPlace({
      id: `catalog-${place.canonicalPlaceId}`,
      name: place.canonicalName,
      area: `${place.canonicalName}${place.parentRegionId ? ` · ${place.parentRegionId}` : ""}, ${input.country}`,
      placeType: place.placeType,
      coordinates,
      distanceKm,
      destination: input.destination,
      source: "reviewed-place-catalog",
    })];
  }).sort((left, right) => placeDistanceKm(input.coordinates, left.coordinates) - placeDistanceKm(input.coordinates, right.coordinates))
    .slice(0, 8);
}
