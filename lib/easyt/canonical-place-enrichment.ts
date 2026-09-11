import { placeDistanceKm } from "./local-place-geography.ts";

type CanonicalPlaceScope = {
  country?: string;
  coordinates?: [number, number];
};

type PlaceEnrichment = {
  extract?: string;
  coordinates?: [number, number];
};

/** Enrichment may decorate an existing canonical identity, never replace it.
 * Coordinates are the authoritative join key when the caller has them. */
export function canonicalPlaceEnrichmentIsCompatible(
  enrichment: PlaceEnrichment | null,
  canonical: CanonicalPlaceScope,
) {
  if (!enrichment) return false;
  if (canonical.coordinates) {
    return Boolean(enrichment.coordinates
      && placeDistanceKm(canonical.coordinates, enrichment.coordinates) <= 50);
  }
  return Boolean(!canonical.country
    || enrichment.extract?.toLocaleLowerCase().includes(canonical.country.toLocaleLowerCase()));
}
