import { countryCodeFor } from "./country-registry.ts";

export function placeDistanceKm(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180;
  const deltaLat = (right[1] - left[1]) * radians;
  const deltaLon = (right[0] - left[0]) * radians;
  const area = Math.sin(deltaLat / 2) ** 2
    + Math.cos(left[1] * radians) * Math.cos(right[1] * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

function compatibleCountries(requestedCountry?: string, candidateCountry?: string) {
  if (!requestedCountry || !candidateCountry) return true;
  const requestedCode = countryCodeFor(requestedCountry);
  const candidateCode = countryCodeFor(candidateCountry);
  if (requestedCode && candidateCode) return requestedCode === candidateCode;
  return requestedCountry.toLocaleLowerCase().trim() === candidateCountry.toLocaleLowerCase().trim();
}

export function localPlaceWithinCanonicalScope(input: {
  anchor: [number, number];
  candidate: [number, number];
  radiusKm: number;
  requestedCountry?: string;
  candidateCountry?: string;
}) {
  return compatibleCountries(input.requestedCountry, input.candidateCountry)
    && placeDistanceKm(input.anchor, input.candidate) <= input.radiusKm;
}
