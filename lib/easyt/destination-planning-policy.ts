import { countries, countryCodeFor } from './country-registry.ts';
import { PLACE_CATALOG, findCatalogPlaceById, type PlaceTypeLiteral, type RoutabilityLiteral, type PlaceCatalogEntry } from './place-catalog.ts';
import { REFERENCE_SNAPSHOT_ID, referenceCountrySeeds, referenceGeographicAcceptanceMatches, referenceSeedRetired } from './place-reference.ts';

export type DestinationPlanningBehavior = 'direct-stop' | 'choose-base' | 'confirm';
export type DestinationPlanningIntent = 'fresh-stop' | 'explicit-area' | 'existing-selection';
export type DestinationPlanningInput = {
  canonicalPlaceId?: string;
  name?: string;
  canonicalName?: string;
  placeType: PlaceTypeLiteral;
  routability?: RoutabilityLiteral;
  country?: string;
  parentCountries?: readonly string[];
  coordinates?: readonly [number, number];
  providerId?: string;
  referenceProviderId?: string;
  referenceSnapshotId?: string;
  status?: string;
  provenance?: readonly { id: string; kind?: string }[] | { id: string; kind?: string };
};
export type DestinationPlanningOptions = { intent?: DestinationPlanningIntent };
export type DestinationPlanningDecision = {
  behavior: DestinationPlanningBehavior;
  reason: string;
  /** A selection recommendation, never an identity equivalence or saved-data migration. */
  targetCanonicalPlaceId?: string;
  duplicateGroupId?: string;
};

type ReviewedStopPolicy = {
  countryCode: string;
  groupId?: string;
  targetCanonicalPlaceId: string;
  sourceCanonicalPlaceIds: readonly string[];
  reviewedAt: string;
  reason: string;
};

/** Reviewed ordinary stop-entry preferences. Political boundaries remain distinct
 * from settlement identities. Additions require a deliberate planning decision
 * and a maintained target with accepted point/proof, not just a matching name.
 * SM intentionally retains the broad default: the local capital record
 * alone does not justify replacing the traveller's country intent. */
export const COMPACT_DESTINATION_POLICIES: readonly ReviewedStopPolicy[] = Object.freeze([
  { countryCode: 'MC', targetCanonicalPlaceId: 'reference:geonames:2993458', sourceCanonicalPlaceIds: ['monaco', 'reference:geonames:2993458'], reviewedAt: '2026-10-21', reason: 'Reviewed Monaco city-state stop entry uses the maintained Monaco settlement.' },
  { countryCode: 'SG', targetCanonicalPlaceId: 'reference:geonames:1880252', sourceCanonicalPlaceIds: ['singapore', 'reference:geonames:1880252'], reviewedAt: '2026-10-21', reason: 'Reviewed Singapore ordinary stop entry uses the maintained Singapore settlement.' },
  { countryCode: 'HK', targetCanonicalPlaceId: 'reference:geonames:1819729', sourceCanonicalPlaceIds: ['jurisdiction-hk', 'hong-kong', 'reference:geonames:1819729'], reviewedAt: '2026-10-21', reason: 'Reviewed Hong Kong ordinary stop entry uses the maintained HK settlement; the legacy China tuple is not reused.' },
]);

/** Reviewed cross-source settlement links, established from the local catalogue
 * and active GeoNames records. This is explicit data; matching names or nearby
 * points never generate additional links at runtime. */
export const REVIEWED_CITY_DESTINATION_POLICIES: readonly ReviewedStopPolicy[] = Object.freeze([
  { countryCode: 'CN', groupId: 'city-stop:beijing', targetCanonicalPlaceId: 'reference:geonames:1816670', sourceCanonicalPlaceIds: ['beijing', 'reference:geonames:1816670'], reviewedAt: '2026-10-21', reason: 'Reviewed Beijing legacy and maintained settlement representations use the maintained target for fresh stop selection.' },
  { countryCode: 'FR', groupId: 'city-stop:paris', targetCanonicalPlaceId: 'reference:geonames:2988507', sourceCanonicalPlaceIds: ['paris', 'reference:geonames:2988507'], reviewedAt: '2026-10-21', reason: 'Reviewed Paris legacy and maintained settlement representations use the maintained target for fresh stop selection.' },
  { countryCode: 'KR', groupId: 'city-stop:seoul', targetCanonicalPlaceId: 'reference:geonames:1835848', sourceCanonicalPlaceIds: ['seoul', 'reference:geonames:1835848'], reviewedAt: '2026-10-21', reason: 'Reviewed Seoul legacy and maintained settlement representations use the maintained target for fresh stop selection.' },
  { countryCode: 'PH', groupId: 'city-stop:manila', targetCanonicalPlaceId: 'reference:geonames:1701668', sourceCanonicalPlaceIds: ['manila', 'reference:geonames:1701668'], reviewedAt: '2026-10-21', reason: 'Reviewed Manila legacy and maintained settlement representations use the maintained target for fresh stop selection.' },
  { countryCode: 'ES', groupId: 'city-stop:madrid', targetCanonicalPlaceId: 'reference:geonames:3117735', sourceCanonicalPlaceIds: ['madrid', 'reference:geonames:3117735'], reviewedAt: '2026-10-21', reason: 'Reviewed Madrid legacy and maintained settlement representations use the maintained target for fresh stop selection.' },
  { countryCode: 'PT', groupId: 'city-stop:lisbon', targetCanonicalPlaceId: 'reference:geonames:2267057', sourceCanonicalPlaceIds: ['lisbon', 'reference:geonames:2267057'], reviewedAt: '2026-10-21', reason: 'Reviewed Lisbon legacy and maintained settlement representations use the maintained target for fresh stop selection.' },
  { countryCode: 'PT', groupId: 'city-stop:porto', targetCanonicalPlaceId: 'reference:geonames:2735943', sourceCanonicalPlaceIds: ['porto', 'reference:geonames:2735943'], reviewedAt: '2026-10-21', reason: 'Reviewed Porto legacy and maintained settlement representations use the maintained target for fresh stop selection.' },
]);
const reviewedStopPolicies = [...COMPACT_DESTINATION_POLICIES, ...REVIEWED_CITY_DESTINATION_POLICIES];

export const COUNTRY_DESTINATION_POLICIES = Object.freeze(Object.fromEntries(countries.map(country => [country.code, Object.freeze({
  countryCode: country.code,
  behavior: 'choose-base' as const,
  freshStopTargetCanonicalPlaceId: COMPACT_DESTINATION_POLICIES.find(policy => policy.countryCode === country.code)?.targetCanonicalPlaceId,
})])));

/** The catalogue owns the supported continent identities (currently five travel
 * regions). Do not introduce a competing continent list in planning consumers. */
export const CONTINENT_DESTINATION_POLICIES = Object.freeze(Object.fromEntries(PLACE_CATALOG
  .filter(place => place.placeType === 'continent')
  .map(place => [place.canonicalPlaceId, Object.freeze({ behavior: 'choose-base' as const })])));

const broadTypes = new Set<PlaceTypeLiteral>(['continent', 'country', 'macro_region', 'region', 'sub_region', 'island', 'archipelago', 'natural_area', 'coast', 'mountain_range', 'valley', 'travel_corridor']);
const directTypes = new Set<PlaceTypeLiteral>(['city', 'town', 'transport_gateway']);
const validPoint = (point: DestinationPlanningInput['coordinates']) => Array.isArray(point) && point.length === 2
  && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
const inputCountries = (input: DestinationPlanningInput) => [...(input.country ? [input.country] : []), ...(input.parentCountries ?? [])];
const countryMatches = (input: DestinationPlanningInput, code: string) => {
  const values = inputCountries(input);
  return values.length > 0 && values.every(value => countryCodeFor(value) === code);
};
const provenanceFor = (input: DestinationPlanningInput): readonly { id: string; kind?: string }[] =>
  Array.isArray(input.provenance) ? input.provenance : input.provenance ? [input.provenance as { id: string; kind?: string }] : [];
function providerIdFor(input: DestinationPlanningInput) {
  if (input.providerId !== undefined) return input.providerId;
  if (input.referenceProviderId !== undefined) return input.referenceProviderId;
  return provenanceFor(input).find(source => source.id.startsWith('reference:'))?.id;
}
const normalizedName = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
function catalogEvidenceMatches(input: DestinationPlanningInput, source: PlaceCatalogEntry) {
  const names = [source.canonicalName, ...source.aliases].map(normalizedName);
  if ([input.name, input.canonicalName].some(name => name !== undefined && !names.includes(normalizedName(name)))) return false;
  if (input.status !== undefined && input.status !== 'active') return false;
  if (source.referenceProviderId) {
    if ([input.providerId, input.referenceProviderId].some(proof => proof !== undefined && proof !== source.referenceProviderId)) return false;
    if (input.referenceSnapshotId !== undefined && input.referenceSnapshotId !== REFERENCE_SNAPSHOT_ID) return false;
  } else if (input.providerId !== undefined || input.referenceProviderId !== undefined || input.referenceSnapshotId !== undefined) return false;
  if (provenanceFor(input).some(proof => proof.id !== source.provenance.id)) return false;
  return true;
}
function referenceAccepted(input: DestinationPlanningInput) {
  const proof = providerIdFor(input);
  return referenceGeographicAcceptanceMatches({ canonicalPlaceId: input.canonicalPlaceId, providerId: proof,
    referenceSnapshotId: input.referenceSnapshotId ?? (input.referenceProviderId ? REFERENCE_SNAPSHOT_ID : undefined),
    country: input.country ?? input.parentCountries?.[0], placeType: input.placeType, coordinates: input.coordinates });
}
function reviewedPolicyFor(input: DestinationPlanningInput) {
  const policy = reviewedStopPolicies.find(row => row.sourceCanonicalPlaceIds.includes(input.canonicalPlaceId ?? ''));
  if (!policy) return undefined;
  const source = findCatalogPlaceById(input.canonicalPlaceId!);
  // Validate the actual old identity including legacy HK/China; no country alias
  // or name match can grant permission to participate in a compact stop group.
  if (!source || source.placeType !== input.placeType || source.routability !== input.routability || !catalogEvidenceMatches(input, source)) return undefined;
  const code = countryCodeFor(source.parentCountries[0]);
  if (!code || !countryMatches(input, code)) return undefined;
  if (source.coordinates && (!validPoint(input.coordinates) || source.coordinates.some((value, i) => value !== input.coordinates![i]))) return undefined;
  if (!source.coordinates && input.coordinates !== undefined) return undefined;
  if (source.canonicalPlaceId.startsWith('reference:') && !referenceAccepted(input)) return undefined;
  return policy;
}
function targetAccepted(input: DestinationPlanningInput, policy: ReviewedStopPolicy) {
  const maintained = referenceCountrySeeds(policy.countryCode).find(row => row.canonicalPlaceId === policy.targetCanonicalPlaceId);
  return Boolean(maintained && catalogEvidenceMatches(input, maintained) && !referenceSeedRetired(policy.targetCanonicalPlaceId)
    && (input.status === undefined || input.status === 'active')
    && input.canonicalPlaceId === policy.targetCanonicalPlaceId && input.placeType === maintained.placeType
    && input.routability === 'direct_destination' && countryMatches(input, policy.countryCode)
    && validPoint(input.coordinates) && maintained.coordinates?.every((value, i) => value === input.coordinates![i])
    && providerIdFor(input) === maintained.referenceProviderId && referenceAccepted(input));
}

/** Classify planning behavior independently of political/geographic place type.
 * Existing selections are the safe default. A fresh target recommendation still
 * needs freshDestinationTarget before any selection or duplicate suppression. */
export function destinationPlanningDecision(input: DestinationPlanningInput, options: DestinationPlanningOptions = {}): DestinationPlanningDecision {
  if (input.routability === 'non_routable_reference') return { behavior: 'confirm', reason: 'A reference-only record is not a planning destination.' };
  const compact = options.intent === 'fresh-stop' ? reviewedPolicyFor(input) : undefined;
  if (compact) return { behavior: 'direct-stop', targetCanonicalPlaceId: compact.targetCanonicalPlaceId,
    duplicateGroupId: compact.groupId ?? `compact-stop:${compact.countryCode}`, reason: compact.reason };
  if (input.placeType === 'country') {
    const code = countryCodeFor(input.country ?? input.parentCountries?.[0]);
    if (!code || !COUNTRY_DESTINATION_POLICIES[code] || !countryMatches(input, code)) {
      return { behavior: 'confirm', reason: 'The country identity is unsupported or contradictory.' };
    }
  }
  if (input.placeType === 'continent' && !CONTINENT_DESTINATION_POLICIES[input.canonicalPlaceId ?? '']) {
    return { behavior: 'confirm', reason: 'The continent identity is not in the canonical registry.' };
  }
  // Preserve the catalogue's authored direct-island distinction. Broad islands
  // still require a base; explicit area intent always stays broad. This grants
  // no new identity or routing proof.
  if (options.intent !== 'explicit-area' && input.placeType === 'island' && input.routability === 'direct_destination') {
    const authored = input.canonicalPlaceId ? findCatalogPlaceById(input.canonicalPlaceId) : undefined;
    if (authored?.placeType === 'island' && authored.routability === 'direct_destination'
      && countryMatches(input, countryCodeFor(authored.parentCountries[0]) ?? '') && catalogEvidenceMatches(input, authored)) {
      return { behavior: 'direct-stop', reason: 'Preserve the explicit authored direct island selection.' };
    }
  }
  if (broadTypes.has(input.placeType)) return { behavior: 'choose-base', reason: 'A broad destination requires an explicit base selection.' };
  if (input.placeType === 'landmark' || input.routability === 'anchor_or_poi') return { behavior: 'choose-base', reason: 'A visit anchor requires a stay or access base.' };
  if (!directTypes.has(input.placeType) || !input.canonicalPlaceId) {
    return { behavior: 'confirm', reason: 'A recognized routable destination has not been established.' };
  }
  const catalog = findCatalogPlaceById(input.canonicalPlaceId);
  const country = input.country ?? input.parentCountries?.[0];
  const code = countryCodeFor(country);
  const coherentCountry = Boolean(code && countryMatches(input, code));
  const recognizedCatalog = catalog?.placeType === input.placeType && catalog.routability === 'direct_destination'
    && coherentCountry && countryCodeFor(catalog.parentCountries[0]) === code;
  const recognizedPoint = input.routability === 'direct_destination' && validPoint(input.coordinates) && coherentCountry;
  const reference = input.canonicalPlaceId.startsWith('reference:');
  if ((input.routability === undefined || input.routability === 'direct_destination')
    && (reference ? recognizedPoint && referenceAccepted(input) : recognizedCatalog || recognizedPoint)
    && (input.status === undefined || input.status === 'active') && !referenceSeedRetired(input.canonicalPlaceId)) {
    return { behavior: 'direct-stop', reason: 'The selected settlement or gateway is a direct destination.' };
  }
  return { behavior: 'confirm', reason: 'The destination identity or routing evidence requires confirmation.' };
}

/** Returns the original accepted target object. Never copies a point or proof
 * onto a source identity and never transforms an existing saved selection. */
export function freshDestinationTarget<T extends DestinationPlanningInput>(input: DestinationPlanningInput, candidates: readonly T[], options: DestinationPlanningOptions = {}): T | null {
  if (options.intent !== 'fresh-stop') return null;
  const policy = reviewedPolicyFor(input);
  if (!policy) return null;
  return candidates.find(candidate => targetAccepted(candidate, policy)) ?? null;
}

/** For fresh autocomplete only. No same-label, distance, or parent-country
 * heuristics: suppression requires an explicit source map and accepted target. */
export function destinationPlanningGroupKey(input: DestinationPlanningInput, candidates: readonly DestinationPlanningInput[], options: DestinationPlanningOptions = {}): string | undefined {
  if (freshDestinationTarget(input, candidates, options)) return destinationPlanningDecision(input, options).duplicateGroupId;
  return input.canonicalPlaceId;
}

/** Consolidate only reviewed fresh stop groups with a validated target already
 * present. Keep all unmapped/conflicting objects intact and in relative order. */
export function consolidateFreshDestinationSuggestions<T extends DestinationPlanningInput>(candidates: readonly T[], options: DestinationPlanningOptions = {}): T[] {
  if (options.intent !== 'fresh-stop') return [...candidates];
  const emitted = new Set<string>();
  const result: T[] = [];
  for (const candidate of candidates) {
    const target = freshDestinationTarget(candidate, candidates, options);
    if (!target) { result.push(candidate); continue; }
    const key = destinationPlanningDecision(candidate, options).duplicateGroupId!;
    if (emitted.has(key)) continue;
    emitted.add(key);
    result.push(target);
  }
  return result;
}
