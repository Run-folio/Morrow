import { countryNameFor } from './country-registry.ts';
import { acceptedGeographicPlace } from './geographic-binding.ts';
import { verifyPhysicalIslandSuggestion } from './destination-resolution.ts';
import { normalizeCatalogPhrase } from './place-catalog.ts';
import { mergeEquivalentPlaceSuggestions } from './place-autocomplete.ts';
import { placeCandidateWithinPlanningParent, type CanonicalPlaceSuggestion, type GeographicBounds, type PlaceRoutability, type PlaceType, type PlanningParentConstraint } from './place-intelligence.ts';
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

/** Intake choices must keep the existing parent and physical-island guards,
 * including catalog suggestions that did not come from a constrained request. */
export async function verifySpreadsheetImportBase(candidate: ImportPlaceCandidate, parent: PlanningParentConstraint, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!acceptImportPlace(candidate)) return null;
  const suggestion: CanonicalPlaceSuggestion = {
    ...candidate, label: candidate.name, placeType: candidate.placeType ?? candidate.kind ?? 'unknown',
    provenance: candidate.providerId ? [{ id: candidate.providerId, label: 'Selected place', kind: 'provider', supports: 'Explicit import base selection' }] : [],
  };
  let unavailable = false;
  const importFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    url.searchParams.set('consumer', 'spreadsheet-import');
    url.searchParams.set('mode', 'resolve');
    try {
      const response = await fetch(`${url.pathname}${url.search}`, init);
      if (!response.ok) { unavailable = true; return response; }
      const payload = await response.clone().json() as { candidates?: unknown } | null;
      if (!payload || !Array.isArray(payload.candidates)) unavailable = true;
      return response;
    } catch (error) { unavailable = true; throw error; }
  };
  const verified = await verifyPhysicalIslandSuggestion(parent, suggestion, { signal, fetchImpl: importFetch });
  signal?.throwIfAborted();
  if (unavailable) throw new Error('Place checking unavailable');
  if (!verified || !placeCandidateWithinPlanningParent({
    canonicalName: verified.name, parentCountries: [verified.country], parentRegionId: verified.region,
    placeType: verified.placeType, coordinates: verified.coordinates, routability: verified.routability,
  }, parent)) return null;
  return acceptImportPlace(importCandidateFromSuggestion(verified));
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
export async function resolveSpreadsheetImportPlace(name: string, country: string, role: 'stop' | 'endpoint' = 'stop', signal?: AbortSignal,
  options: { mode?: 'resolve'; parent?: PlanningParentConstraint } = {}) {
  const request = importPlaceRequest(name, country);
  if (request.conflict) return { result: null, candidates: [] as ImportPlaceCandidate[] };
  const params = new URLSearchParams({ place: request.query, candidates: '1', consumer: 'spreadsheet-import' });
  if (request.country) params.set('country', request.country);
  if (options.mode) params.set('mode', options.mode);
  const parent = options.parent;
  if (parent) {
    params.set('parentName', parent.canonicalName);
    params.set('parentType', parent.placeType);
    if (parent.canonicalPlaceId) params.set('parentId', parent.canonicalPlaceId);
    parent.parentCountries.forEach(value => params.append('parentCountry', value));
    if (parent.bounds) for (const key of ['south', 'west', 'north', 'east'] as const)
      params.set(`parent${key[0].toUpperCase()}${key.slice(1)}`, String(parent.bounds[key]));
  }
  const lookup = async (query: string) => {
    signal?.throwIfAborted();
    params.set('place', query);
    const response = await fetch(`/api/journey-geocode?${params}`, { signal });
    signal?.throwIfAborted();
    if (!response.ok) throw new Error('Place checking unavailable');
    const payload = await response.json() as { candidates?: ImportPlaceCandidate[] } | null;
    signal?.throwIfAborted();
    if (!payload || !Array.isArray(payload.candidates)) throw new Error('Place checking unavailable');
    return payload.candidates;
  };
  let available = await lookup(request.query);
  // Explicit base retries may remove a redundant country from the phrase,
  // while keeping it and every parent constraint in the same API request.
  // A failed request or a rejected nonempty response never opens this path.
  if (options.mode === 'resolve' && parent && request.country && Array.isArray(available) && available.length === 0) {
    const parts = name.split(',').map(value => value.trim()).filter(Boolean);
    const fallback = parts.length > 1 && countryNameFor(parts.at(-1)) ? parts.slice(0, -1).join(', ') : name.trim();
    if (fallback && fallback !== request.query) available = await lookup(fallback);
  }
  const candidates = (available ?? []).filter(candidate => !parent || placeCandidateWithinPlanningParent({
    canonicalName: candidate.name, parentCountries: [candidate.country], parentRegionId: candidate.region,
    placeType: candidate.placeType ?? candidate.kind ?? 'unknown', coordinates: candidate.coordinates, routability: candidate.routability,
  }, parent));
  return assessImportPlaceCandidates(request, candidates, role);
}
