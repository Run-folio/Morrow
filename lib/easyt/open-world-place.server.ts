import {
  searchNominatimTravelCandidates,
} from "./nominatim-place.server.ts";
import { searchPhotonTravelCandidates } from "./photon-place.server.ts";
import { searchOpenStreetMapNearbySettlements } from "./openstreetmap-nearby-place.server.ts";
import {
  providerLookupRequest,
  rankNearbyBaseCandidates,
  type NearbyBaseAnchor,
  type NearbyBaseSuggestion,
  type PlaceIntelligenceProvider,
  type PlaceProviderCandidate,
  type PlaceResolutionContext,
} from "./place-intelligence.ts";

export type OpenWorldPlaceSource = {
  id: string;
  label: string;
  search?: (phrase: string, context: PlaceResolutionContext) => Promise<OpenWorldTravelCandidate[]>;
  nearby?: (anchor: NearbyBaseAnchor, radiusKm: number) => Promise<OpenWorldTravelCandidate[]>;
};

export type OpenWorldTravelCandidate = PlaceProviderCandidate & {
  country?: string;
  countryCode?: string;
  region?: string;
  locality?: string;
  providerKind?: string;
};

export type OpenWorldCandidateCache = Map<string, { expiresAt: number; candidates: PlaceProviderCandidate[] }>;

const sharedCandidateCache: OpenWorldCandidateCache = new Map();

function normalized(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function validCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && value[0] >= -180 && value[0] <= 180
    && value[1] >= -90 && value[1] <= 90;
}

function validatedCandidate(candidate: PlaceProviderCandidate): PlaceProviderCandidate | undefined {
  if (!validCoordinates(candidate.coordinates)) return undefined;
  if (candidate.bounds) {
    const { south, west, north, east } = candidate.bounds;
    const validBounds = [south, west, north, east].every(Number.isFinite)
      && south >= -90 && north <= 90 && south <= north
      && west >= -180 && west <= 180 && east >= -180 && east <= 180;
    const [longitude, latitude] = candidate.coordinates;
    const longitudeInside = west <= east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east;
    if (!validBounds || latitude < south || latitude > north || !longitudeInside) return undefined;
  }
  return {
    ...candidate,
    coordinates: [...candidate.coordinates] as [number, number],
    aliases: candidate.aliases ? [...candidate.aliases] : undefined,
    parentCountries: candidate.parentCountries ? [...candidate.parentCountries] : undefined,
    bounds: candidate.bounds ? { ...candidate.bounds } : undefined,
  };
}

function cloneCandidates(candidates: PlaceProviderCandidate[]) {
  return candidates.flatMap((candidate) => {
    const validated = validatedCandidate(candidate);
    return validated ? [validated] : [];
  });
}

function cacheKey(phrase: string, context: PlaceResolutionContext) {
  return JSON.stringify({
    phrase: normalized(phrase),
    intent: context.travelIntent ?? "unknown",
    countries: [...(context.countryNames ?? [])].map(normalized).sort(),
    explicitCountries: [...(context.explicitCountryNames ?? [])].map(normalized).sort(),
    explicitPlaceTypes: [...(context.explicitPlaceTypes ?? [])].sort(),
    selected: [...(context.selectedPlaces ?? [])].map((place) => place.canonicalPlaceId).sort(),
  });
}

function defaultSources(fetchImpl?: typeof fetch): OpenWorldPlaceSource[] {
  return [
    {
      id: "nominatim",
      label: "OpenStreetMap Nominatim",
      search: (phrase, context) => searchNominatimTravelCandidates(phrase, context, fetchImpl),
    },
    {
      id: "photon",
      label: "Komoot Photon",
      search: (phrase, context) => searchPhotonTravelCandidates(phrase, context, fetchImpl),
    },
    {
      id: "openstreetmap-overpass",
      label: "OpenStreetMap Overpass",
      nearby: (anchor, radiusKm) => searchOpenStreetMapNearbySettlements(anchor, radiusKm, fetchImpl),
    },
  ];
}

function distanceKm(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180;
  const deltaLat = (right[1] - left[1]) * radians;
  const deltaLon = (right[0] - left[0]) * radians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(left[1] * radians) * Math.cos(right[1] * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

function osmIdentity(providerId: string) {
  const parts = providerId.split(":");
  const rawType = parts.at(-2)?.toLocaleLowerCase();
  const rawId = parts.at(-1);
  const type = rawType === "n" || rawType === "node"
    ? "node"
    : rawType === "w" || rawType === "way"
      ? "way"
      : rawType === "r" || rawType === "relation"
        ? "relation"
        : undefined;
  return type && rawId && /^\d+$/.test(rawId) ? `${type}:${rawId}` : undefined;
}

function compatibleLocalityFacts(left: PlaceProviderCandidate, right: PlaceProviderCandidate) {
  return left.routability === "direct_destination"
    && right.routability === "direct_destination"
    && (left.placeType === "city" || left.placeType === "town")
    && (right.placeType === "city" || right.placeType === "town");
}

function sameCanonicalFact(left: PlaceProviderCandidate, right: PlaceProviderCandidate) {
  // Nominatim and Photon expose the same OSM feature with different type
  // spellings (node/N, way/W, relation/R) and occasionally different localized
  // display labels. Stable provider identity is stronger evidence than label
  // equality, so check it before the cross-provider canonical-fact heuristic.
  const leftOsmIdentity = osmIdentity(left.providerId);
  if (leftOsmIdentity && leftOsmIdentity === osmIdentity(right.providerId)) return true;

  if (normalized(left.canonicalName) !== normalized(right.canonicalName)
    || normalized(left.parentCountries?.[0] ?? "") !== normalized(right.parentCountries?.[0] ?? "")
    || !left.coordinates || !right.coordinates) return false;

  const distance = distanceKm(left.coordinates, right.coordinates);
  if (left.placeType === right.placeType && distance <= 5) return true;

  // A settlement point and its same-name municipal boundary can have centroids
  // several kilometres apart. Shared country + parent region + locality
  // semantics is sufficient to collapse that provider duplication, while
  // distant same-name settlements remain distinct candidates.
  const leftRegion = normalized(left.parentRegionId ?? "");
  const rightRegion = normalized(right.parentRegionId ?? "");
  const sameRegion = Boolean(leftRegion && rightRegion && leftRegion === rightRegion);
  const directAndAdministrative = (compatibleLocalityFacts(left, right)
    || (left.routability === "direct_destination" && right.routability === "planning_area")
    || (right.routability === "direct_destination" && left.routability === "planning_area"));
  return sameRegion && directAndAdministrative && distance <= 50;
}

function coextensiveDirectEndpoint(
  geography: PlaceProviderCandidate,
  candidates: PlaceProviderCandidate[],
) {
  const geographyName = normalized(geography.canonicalName);
  return candidates.some((candidate) => {
    if (candidate.routability !== "direct_destination" || !candidate.coordinates || !geography.coordinates) return false;
    if (normalized(candidate.parentCountries?.[0] ?? "") !== normalized(geography.parentCountries?.[0] ?? "")) return false;
    const candidateNames = [candidate.canonicalName, ...(candidate.aliases ?? [])].map(normalized);
    const sameNameFamily = candidateNames.some((name) => name === geographyName || name.startsWith(`${geographyName} `));
    return sameNameFamily && distanceKm(candidate.coordinates, geography.coordinates) <= 12;
  });
}

/** One shared final ranking pass for capture and Builder search. Provider
 * scores retain their normal route/locality evidence; this adds only bounded
 * hierarchy evidence for a bare exact major geography and explicit country
 * constraints supplied by the traveller/UI. */
function rankCanonicalCandidates(
  candidates: PlaceProviderCandidate[],
  context: PlaceResolutionContext,
) {
  const explicitCountries = new Set((context.explicitCountryNames ?? []).map(normalized));
  const explicitPlaceTypes = new Set(context.explicitPlaceTypes ?? []);
  return candidates.map((candidate) => {
    const rankingReason = candidate.normalizationReason ?? "";
    const explicitContextBoost = !rankingReason.includes("; explicit country context")
      && candidate.parentCountries?.some((country) => explicitCountries.has(normalized(country))) ? 200 : 0;
    const explicitTypeBoost = !rankingReason.includes("; explicit entity type")
      && explicitPlaceTypes.has(candidate.placeType) ? 200 : 0;
    const significance = candidate.geographicSignificance
      ?? (candidate.placeType === "country" && candidate.matchQuality === "exact" ? 0.9 : 0);
    const geographyBoost = significance && !rankingReason.includes("; exact canonical geography prior")
      && !coextensiveDirectEndpoint(candidate, candidates)
      ? Math.round(significance * 100)
      : 0;
    if (!explicitContextBoost && !explicitTypeBoost && !geographyBoost) return candidate;
    return {
      ...candidate,
      rankScore: (candidate.rankScore ?? 0) + explicitContextBoost + explicitTypeBoost + geographyBoost,
      normalizationReason: `${candidate.normalizationReason ?? "provider travel entity"}${explicitContextBoost ? "; explicit country context" : ""}${explicitTypeBoost ? "; explicit entity type" : ""}${geographyBoost ? "; exact canonical geography prior" : ""}`,
    };
  }).sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0));
}

/** Shared provider-neutral boundary for automatic capture and Builder Search.
 * The bounded cache retains compact canonical facts only—never prompts, model
 * output, or raw provider responses. */
export function createOpenWorldPlaceProvider(options: {
  sources?: OpenWorldPlaceSource[];
  fetchImpl?: typeof fetch;
  cache?: OpenWorldCandidateCache;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  sourceTimeoutMs?: number;
} = {}): PlaceIntelligenceProvider {
  const sources = options.sources ?? defaultSources(options.fetchImpl);
  const cache = options.cache ?? sharedCandidateCache;
  const cacheTtlMs = Math.max(1, options.cacheTtlMs ?? 86_400_000);
  const maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 500);
  const sourceTimeoutMs = Math.max(1, Math.min(options.sourceTimeoutMs ?? 3_500, 5_000));
  const nearbySourceTimeoutMs = Math.max(1, Math.min(options.sourceTimeoutMs ?? 10_000, 11_000));
  return {
    id: "open-world",
    label: "Morrovia open-world place resolver",
    timeoutMs: 4_500,
    async lookup(phrase, context) {
      const request = providerLookupRequest(phrase, context);
      const key = cacheKey(phrase, request.context);
      const cached = cache.get(key);
      if (cached?.expiresAt && cached.expiresAt > Date.now()) {
        const validated = cloneCandidates(cached.candidates);
        if (validated.length === cached.candidates.length) return rankCanonicalCandidates(validated, request.context);
      }
      if (cached) cache.delete(key);

      const searchSources = sources.filter((source) => source.search);
      const settled = await Promise.allSettled(searchSources.map((source) => new Promise<PlaceProviderCandidate[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${source.id} lookup timed out`)), sourceTimeoutMs);
        source.search!(request.phrase, request.context).then(
          (sourceCandidates) => {
            clearTimeout(timer);
            resolve(sourceCandidates.flatMap((candidate): PlaceProviderCandidate[] => {
              const validated = validatedCandidate(candidate);
              if (!validated) return [];
              return [{
                ...validated,
                providerId: `${source.id}:${validated.providerId}`,
                providerSourceId: source.id,
                providerSourceLabel: source.label,
                aliases: [...new Set([...(validated.aliases ?? []), ...(normalized(validated.canonicalName) !== normalized(phrase) ? [phrase] : [])])],
                normalizationReason: `${validated.normalizationReason ?? "provider travel entity"}; source=${source.label}`,
              }];
            }));
          },
          (error) => { clearTimeout(timer); reject(error); },
        );
      })));
      const deduplicated = settled.flatMap((result) => result.status === "fulfilled" ? result.value : [])
        .filter((candidate, index, all) => all.findIndex((other) => other.providerId === candidate.providerId) === index)
        .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0))
        .filter((candidate, index, all) => !all.slice(0, index).some((prior) => sameCanonicalFact(prior, candidate)));
      const candidates = rankCanonicalCandidates(deduplicated, request.context);
      // A provider outage or a transient empty response must not poison later
      // capture/search attempts. Cache only positive canonical facts.
      if (candidates.length > 0) {
        cache.set(key, { expiresAt: Date.now() + cacheTtlMs, candidates: cloneCandidates(candidates) });
        while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value!);
      }
      return cloneCandidates(candidates);
    },
    async nearby(anchor, radiusKm) {
      const nearbySources = sources.filter((source) => source.nearby);
      if (!nearbySources.length) return [];
      const key = JSON.stringify({
        nearby: normalized(anchor.canonicalPlaceId ?? anchor.canonicalName),
        countries: anchor.parentCountries.map(normalized).sort(),
        region: normalized(anchor.parentRegionId ?? ""),
        coordinates: anchor.coordinates?.map((coordinate) => Number(coordinate.toFixed(4))),
        radiusKm: Math.round(radiusKm),
      });
      const cached = cache.get(key);
      if (cached?.expiresAt && cached.expiresAt > Date.now()) {
        const validated = cloneCandidates(cached.candidates);
        if (validated.length === cached.candidates.length) return validated;
      }
      if (cached) cache.delete(key);

      const settled = await Promise.allSettled(nearbySources.map((source) => new Promise<PlaceProviderCandidate[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${source.id} nearby lookup timed out`)), nearbySourceTimeoutMs);
        source.nearby!(anchor, radiusKm).then(
          (sourceCandidates) => {
            clearTimeout(timer);
            resolve(sourceCandidates.flatMap((candidate): PlaceProviderCandidate[] => {
              const validated = validatedCandidate(candidate);
              if (!validated) return [];
              return [{
                ...validated,
                providerId: `${source.id}:${validated.providerId}`,
                providerSourceId: source.id,
                providerSourceLabel: source.label,
                normalizationReason: `${validated.normalizationReason ?? "provider nearby settlement"}; source=${source.label}`,
              }];
            }));
          },
          (error) => { clearTimeout(timer); reject(error); },
        );
      })));
      if (!settled.some((result) => result.status === "fulfilled")) throw new Error("Nearby place providers unavailable");
      const candidates = settled.flatMap((result) => result.status === "fulfilled" ? result.value : [])
        .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0))
        .filter((candidate, index, all) => !all.slice(0, index).some((prior) => sameCanonicalFact(prior, candidate)));
      if (candidates.length) {
        cache.set(key, { expiresAt: Date.now() + cacheTtlMs, candidates: cloneCandidates(candidates) });
        while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value!);
      }
      return cloneCandidates(candidates);
    },
  };
}

export async function searchOpenWorldTravelCandidates(
  phrase: string,
  context: PlaceResolutionContext = {},
  provider: PlaceIntelligenceProvider = createOpenWorldPlaceProvider(),
) {
  return provider.lookup(phrase, context);
}

export async function searchOpenWorldNearbyBaseSuggestions(
  anchor: NearbyBaseAnchor,
  options: { limit?: number; maximumDistanceKm?: number } = {},
  provider: PlaceIntelligenceProvider = createOpenWorldPlaceProvider(),
): Promise<NearbyBaseSuggestion[]> {
  if (!provider.nearby || !anchor.coordinates) return [];
  const maximumDistanceKm = options.maximumDistanceKm ?? 140;
  const candidates = await provider.nearby(anchor, maximumDistanceKm);
  return rankNearbyBaseCandidates(anchor, candidates, { ...options, maximumDistanceKm });
}
