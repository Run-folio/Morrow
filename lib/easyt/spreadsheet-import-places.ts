import { countryNameFor } from './country-registry.ts';
import { acceptedGeographicPlace } from './geographic-binding.ts';
import { normalizeCatalogPhrase } from './place-catalog.ts';
import { mergeEquivalentPlaceSuggestions } from './place-autocomplete.ts';
import type { CanonicalPlaceSuggestion, GeographicBounds, PlaceRoutability, PlaceType, PlanningParentConstraint } from './place-intelligence.ts';
import type { ResolvedImportOrigin } from './spreadsheet-import.ts';

export type ImportPlaceCandidate = Omit<ResolvedImportOrigin, 'coordinates'> & {
  coordinates?: [number, number];
  placeType?: PlaceType;
  kind?: PlaceType;
  routability?: PlaceRoutability;
  bounds?: GeographicBounds;
  referenceSnapshotId?: string;
};

export function importPlaceRequest(name: string, mappedCountry: string) {
  const parts = name.split(',').map(value => value.trim()).filter(Boolean);
  const trailingCountry = parts.length > 1 ? countryNameFor(parts.at(-1)) : null;
  const columnCountry = countryNameFor(mappedCountry) ?? mappedCountry.trim();
  const country = columnCountry || trailingCountry || '';
  const conflict = Boolean(columnCountry && trailingCountry && normalizeCatalogPhrase(columnCountry) !== normalizeCatalogPhrase(trailingCountry));
  return {
    query: trailingCountry || !country ? name.trim() : `${name.trim()}, ${country}`,
    name: parts[0] ?? '', country,
    regions: parts.slice(1, trailingCountry ? -1 : undefined), conflict,
  };
}

export function acceptImportPlace(candidate: ImportPlaceCandidate, role: 'stop' | 'endpoint' = 'stop'): ResolvedImportOrigin | null {
  const accepted = acceptedGeographicPlace(candidate, candidate, role);
  return accepted?.coordinates ? { ...candidate, ...accepted, coordinates: accepted.coordinates } : null;
}

export function importPlanningParent(candidate: ImportPlaceCandidate): PlanningParentConstraint | undefined {
  if (!candidate.placeType || !['planning_area', 'needs_base_selection'].includes(candidate.routability ?? '')) return undefined;
  return { canonicalPlaceId: candidate.canonicalPlaceId, canonicalName: candidate.name, placeType: candidate.placeType,
    parentCountries: candidate.country ? [candidate.country] : [], ...(candidate.bounds ? { bounds: candidate.bounds } : {}) };
}

export function importCandidateFromSuggestion(suggestion: CanonicalPlaceSuggestion): ImportPlaceCandidate {
  return { ...suggestion, providerId: suggestion.provenance.find(source => source.kind === 'provider')?.id };
}

/** A provider's rank is not a meaning decision. Distinct identities stay visible. */
export function assessImportPlaceCandidates(request: ReturnType<typeof importPlaceRequest>, input: ImportPlaceCandidate[], role: 'stop' | 'endpoint' = 'stop') {
  const normalized = normalizeCatalogPhrase;
  const candidates = request.conflict ? [] : mergeEquivalentPlaceSuggestions(input).filter(candidate =>
    (!request.country || normalized(candidate.country) === normalized(request.country))
    && request.regions.every(region => [candidate.region, ...(candidate.administrativeHierarchy ?? []), ...(importPlanningParent(candidate) ? [candidate.name] : [])]
      .some(value => value && normalized(value) === normalized(region))));
  const exact = candidates.filter(candidate => normalized(candidate.name) === normalized(request.name)
    || ['region', 'sub_region'].includes(candidate.placeType ?? '')
      && normalized(candidate.name.replace(/\s+(?:region|province|state)$/i, '')) === normalized(request.name));
  const result = exact.length === 1 ? acceptImportPlace(exact[0]!, role) : null;
  return { result, candidates };
}

/** Search the full qualified label so reference city/airport hits cannot hide an area. */
export async function resolveSpreadsheetImportPlace(name: string, country: string, role: 'stop' | 'endpoint' = 'stop', signal?: AbortSignal) {
  const request = importPlaceRequest(name, country);
  if (request.conflict) return { result: null, candidates: [] as ImportPlaceCandidate[] };
  const params = new URLSearchParams({ place: request.query, candidates: '1' });
  if (request.country) params.set('country', request.country);
  const response = await fetch(`/api/journey-geocode?${params}`, { signal });
  if (!response.ok) throw new Error('Place checking unavailable');
  const payload = await response.json() as { candidates?: ImportPlaceCandidate[] };
  return assessImportPlaceCandidates(request, payload.candidates ?? [], role);
}
