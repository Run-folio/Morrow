import { countryCodeFor } from './country-registry.ts';
import { searchPhotonTravelCandidates } from './photon-place.server.ts';
import { isOvernightBaseEligible, type PlaceProviderCandidate, type PlanningParentConstraint } from './place-intelligence.ts';

import { normalizeIslandName as normalize, sameCountry, validIslandPoint as validPoint, physicalGeometry, physicalContains } from './physical-island-geometry.ts';
import { normalizeBundledIslandCandidates } from './island-geography.server.ts';
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const maximumBodyBytes = 4_000_000;
async function geometryBody(response: Response) {
  if (!response.ok) throw new Error('Existing island geometry provider unavailable');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Existing island geometry provider unavailable');
  const decoder = new TextDecoder(); let text = '', bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBodyBytes) throw new Error('Island geometry exceeds the bounded lookup limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { await reader.cancel().catch(() => {}); }
}

/** Existing-provider fact normalization only. No requested parent label, admin
 * hierarchy, rectangle or proximity can replace the physical polygon check. */
export async function normalizePhysicalIslandBaseCandidates(candidates: PlaceProviderCandidate[], parent: PlanningParentConstraint, options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<PlaceProviderCandidate[]> {
  if (!['island', 'archipelago'].includes(parent.placeType)) return candidates;
  if (candidates.length > 16 || parent.parentCountries.length !== 1 || !countryCodeFor(parent.parentCountries[0])) return [];
  const bundled = normalizeBundledIslandCandidates(candidates, parent);
  if (bundled !== undefined) return bundled;
  return normalizeLivePhysicalIslandBaseCandidates(candidates, parent, options);
}

/** Retained bounded live source path for uncovered islands. Covered identities
 * must never reach this fallback when their accepted bundle is invalid. */
export async function normalizeLivePhysicalIslandBaseCandidates(candidates: PlaceProviderCandidate[], parent: PlanningParentConstraint, options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<PlaceProviderCandidate[]> {
  if (parent.placeType !== 'island') return candidates;
  if (candidates.length > 16 || parent.parentCountries.length !== 1 || !countryCodeFor(parent.parentCountries[0])) return [];
  const eligible = candidates.filter(c => validPoint(c.coordinates) && isOvernightBaseEligible({ placeType: c.placeType, routability: c.routability ?? 'direct_destination' })
    && parent.parentCountries.length === 1 && c.parentCountries?.some(country => sameCountry(country, parent.parentCountries[0]!)));
  if (!eligible.length) return [];
  const fetchImpl = options.fetchImpl ?? fetch, deadline = Date.now() + 15_000;
  const signalFor = (ms: number) => options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  const found = await searchPhotonTravelCandidates(parent.canonicalName, { travelIntent: 'planning-area', explicitCountryNames: parent.parentCountries, countryNames: parent.parentCountries }, fetchImpl, { signal: signalFor(2_500) });
  const islands = found.filter(c => c.placeType === 'island' && c.matchQuality === 'exact' && normalize(c.canonicalName) === normalize(parent.canonicalName)
    && c.parentCountries?.some(country => sameCountry(country, parent.parentCountries[0]!)) && /^[RW]:\d+$/.test(c.providerId));
  const identities = new Set(islands.map(c => c.providerId)); if (identities.size !== 1) return [];
  const island = islands[0]!, [kind, rawId] = island.providerId.split(':'), type = kind === 'R' ? 'relation' : 'way', id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0 || Date.now() > deadline) return [];
  const query = `[out:json][timeout:8];${type}(${id});out geom;`;
  const results = await Promise.allSettled(endpoints.map(async endpoint => geometryBody(await fetchImpl(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'Morrovia trip planner/1.0 (https://morrovia.com)' },
    body: new URLSearchParams({ data: query }), signal: signalFor(10_000), next: { revalidate: 86_400 },
  }))));
  const available = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  if (!available.length) throw new Error('Existing island geometry providers unavailable');
  const geometries = available.map(body => physicalGeometry(body, { id, type, name: island.canonicalName, country: parent.parentCountries[0]! }, deadline));
  if (geometries.some(g => !g) || Date.now() > deadline) return [];
  return eligible.flatMap(candidate => {
    const point = candidate.coordinates!;
    if (!geometries.every(g => physicalContains(g!, point))) return [];
    const timestamp = geometries.map(g => g!.timestamp).sort().at(-1)!;
    // Essential evidence precedes the name and fits the existing 240-char
    // normalization boundary. The settlement identity/point are unchanged.
    const proof = `Physical island verified: OSM ${type}:${id}; timestamp=${timestamp}; point=${point.join(',')}; country=${countryCodeFor(parent.parentCountries[0]!)}; result=strict-inside/outside-holes; name=${island.canonicalName}`;
    return [{ ...candidate, parentRegionId: island.canonicalName, providerSourceLabel: `${candidate.providerSourceLabel ?? 'Settlement geography'} + OpenStreetMap`, normalizationReason: proof.slice(0, 240) }];
  });
}
