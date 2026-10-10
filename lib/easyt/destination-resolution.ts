import { requiresPhysicalIslandVerification } from './island-geography.ts';
import { countryCodeFor } from './country-registry.ts';
import { isOvernightBaseEligible, validPlaceCoordinates, type CanonicalPlaceSuggestion, type PlanningParentConstraint } from './place-intelligence.ts';

const normalise = (value: string) => value.toLocaleLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Revalidate every island base, including catalog/guided choices, through
 * the existing server's physical-polygon guard. Never substitute its point
 * or identity for the traveller's selected settlement. */
export async function verifyPhysicalIslandSuggestion(parent: PlanningParentConstraint, suggestion: CanonicalPlaceSuggestion, options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<CanonicalPlaceSuggestion | null> {
  if (!requiresPhysicalIslandVerification(parent)) return suggestion;
  if (!validPlaceCoordinates(suggestion.coordinates) || !isOvernightBaseEligible({ placeType: suggestion.placeType, routability: suggestion.routability ?? 'direct_destination' })) return null;
  const params = new URLSearchParams({ place: suggestion.name, country: suggestion.country, candidates: '1', parentName: parent.canonicalName, parentType: parent.placeType });
  if (parent.canonicalPlaceId) params.set('parentId', parent.canonicalPlaceId);
  parent.parentCountries.forEach(country => params.append('parentCountry', country));
  try {
    const response = await (options.fetchImpl ?? fetch)(`/api/journey-geocode?${params}`, { signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(18_000)]) : AbortSignal.timeout(18_000) });
    if (!response.ok) return null;
    const payload = await response.json() as { candidates?: Array<{ canonicalPlaceId?: string; providerId?: string; country?: string; coordinates?: [number, number]; region?: string; normalizationReason?: string; placeType?: string; routability?: string }> };
    const chosenProviderId = suggestion.provenance.find(source => source.kind === 'provider')?.id;
    const selected = payload.candidates?.find(c => c.canonicalPlaceId === suggestion.canonicalPlaceId
      && (!chosenProviderId || c.providerId === chosenProviderId) && c.placeType === suggestion.placeType
      && c.routability === 'direct_destination' && Boolean(countryCodeFor(suggestion.country)) && countryCodeFor(c.country) === countryCodeFor(suggestion.country)
      && validPlaceCoordinates(c.coordinates) && c.coordinates[0] === suggestion.coordinates![0] && c.coordinates[1] === suggestion.coordinates![1]);
    const parentKey = (name: string) => normalise(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    if (!selected?.region || !selected.normalizationReason || parentKey(selected.region) !== parentKey(parent.canonicalName)) return null;
    return { ...suggestion, region: selected.region, provenance: suggestion.provenance.length
      ? suggestion.provenance.map((source, index) => index === 0 ? { ...source, supports: selected.normalizationReason! } : source)
      : [{ id: selected.providerId ?? selected.canonicalPlaceId!, label: 'Verified settlement geography', kind: 'provider', supports: selected.normalizationReason }] };
  } catch { return null; }
}

export function geocodeNearbyContext(params: URLSearchParams): [number,number] | undefined {
  const lat=params.get('nearLat'),lon=params.get('nearLon');
  if (!lat?.trim() || !lon?.trim()) return undefined;
  const latitude=Number(lat),longitude=Number(lon);
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?[longitude,latitude]:undefined;
}

/** A global name match is not enough to become a routing identity. */
export function needsDestinationConfirmation(countries: Iterable<string>, hasNearbyContext = false) {
  return new Set([...countries].map(normalise).filter(Boolean)).size > 1 && !hasNearbyContext;
}

export function isWithinDestinationRadius(
  destination: [number, number],
  candidate: [number, number],
  radiusKm = 12,
) {
  const [destinationLon, destinationLat] = destination;
  const [candidateLon, candidateLat] = candidate;
  const radians = Math.PI / 180;
  const deltaLat = (candidateLat - destinationLat) * radians;
  const deltaLon = (candidateLon - destinationLon) * radians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(destinationLat * radians) * Math.cos(candidateLat * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area)) <= radiusKm;
}
