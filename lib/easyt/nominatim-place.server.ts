import {
  recognizedHigherOrderGeographySignificance,
  type PlaceIntelligenceProvider,
  type PlaceProviderCandidate,
  type PlaceResolutionContext,
  type PlaceRoutability,
  type PlaceType,
} from "./place-intelligence.ts";

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  type?: string;
  category?: string;
  addresstype?: string;
  osm_type?: string;
  osm_id?: number;
  importance?: number;
  place_rank?: number;
  boundingbox?: [string, string, string, string];
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
  address?: {
    country?: string;
    country_code?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    suburb?: string;
    neighbourhood?: string;
    county?: string;
    state?: string;
  };
};

export type NominatimTravelCandidate = PlaceProviderCandidate & {
  country: string;
  countryCode?: string;
  region?: string;
  locality?: string;
  providerKind: string;
};

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function editDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) rows[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) for (let column = 1; column <= right.length; column += 1) {
    rows[row][column] = Math.min(
      rows[row - 1][column] + 1,
      rows[row][column - 1] + 1,
      rows[row - 1][column - 1] + Number(left[row - 1] !== right[column - 1]),
    );
  }
  return rows[left.length][right.length];
}

function typoEquivalent(left: string, right: string) {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  return longest >= 5 && editDistance(normalizedLeft, normalizedRight) <= Math.max(1, Math.floor(longest * 0.2));
}

function taxonomy(
  result: NominatimResult,
  context: PlaceResolutionContext,
): { placeType: PlaceType; routability: PlaceRoutability; reason: string } {
  const addressType = result.addresstype?.toLocaleLowerCase() ?? "";
  const kind = `${addressType} ${result.type ?? ""} ${result.category ?? ""}`.toLocaleLowerCase();
  const linkedPlace = `${result.extratags?.linked_place ?? ""} ${result.extratags?.place ?? ""}`.toLocaleLowerCase();
  const routeStop = context.travelIntent === "route-stop";

  if (/\b(?:city|town|village|hamlet|municipality|suburb|neighbourhood)\b/.test(addressType)) {
    const placeType = /\bcity\b/.test(addressType) ? "city" : "town";
    return { placeType, routability: "direct_destination", reason: `provider locality (${addressType}) is directly routable` };
  }
  if (/\bcountry\b/.test(kind)) return { placeType: "country", routability: "planning_area", reason: "provider sovereign identity remains broad" };
  if (/\b(?:island|islet)\b/.test(kind)) return { placeType: "island", routability: "needs_base_selection", reason: "provider island identity needs an overnight base" };
  if (/\b(?:lake|reservoir|national_park|nature_reserve|protected_area|park|bare_rock|peak|volcano|cliff|waterfall|glacier)\b/.test(kind)) return { placeType: "natural_area", routability: "needs_base_selection", reason: "provider natural-area identity remains an anchor" };
  if (/\b(?:archaeological_site|attraction|historic|monument|museum|ruins)\b/.test(kind)) return { placeType: "landmark", routability: "anchor_or_poi", reason: "provider landmark identity remains an anchor" };
  if (/\b(?:state|province|region|county|administrative)\b/.test(kind)) {
    // Some gazetteers encode a capital/metropolitan locality as its coextensive
    // administrative boundary. linked_place is explicit provider evidence of
    // that overlap; route-stop intent decides whether it is the overnight node.
    if (routeStop && /\b(?:city|town|village|municipality)\b/.test(linkedPlace)) {
      const placeType = /\bcity\b/.test(linkedPlace) ? "city" : "town";
      return { placeType, routability: "direct_destination", reason: `coextensive administrative boundary links to a ${placeType}` };
    }
    return { placeType: "region", routability: "planning_area", reason: "provider administrative identity remains a planning area" };
  }
  if (/\b(?:airport|aerodrome)\b/.test(kind)) return { placeType: "transport_gateway", routability: "direct_destination", reason: "provider transport gateway is directly routable" };
  return { placeType: "unknown", routability: "non_routable_reference", reason: "provider taxonomy has no supported travel-entity mapping" };
}

function contextScore(candidate: NominatimResult, context: PlaceResolutionContext) {
  const country = normalize(candidate.address?.country ?? "");
  const countries = new Set([
    ...(context.countryNames ?? []),
    ...(context.selectedPlaces ?? []).flatMap((place) => place.parentCountries),
  ].map(normalize));
  return countries.has(country) ? 20 : 0;
}

function matchQuality(name: string, phrase: string, queryMode: "freeform" | "city", aliases: string[] = []) {
  const candidate = normalize(name);
  const requested = normalize(phrase);
  if (candidate === requested || aliases.some((alias) => normalize(alias) === requested)) return "exact" as const;
  if (typoEquivalent(candidate, requested)) return "alias" as const;
  if (candidate.includes(requested) || requested.includes(candidate) || (queryMode === "city" && candidate.startsWith(requested))) return "alias" as const;
  return "partial" as const;
}

function travelScore(placeType: PlaceType, routability: PlaceRoutability, context: PlaceResolutionContext) {
  if (context.travelIntent === "route-stop") {
    if (routability === "direct_destination") return placeType === "city" ? 48 : 40;
    return routability === "planning_area" || routability === "needs_base_selection" ? -5 : -12;
  }
  if (context.travelIntent === "planning-area") return routability === "planning_area" || routability === "needs_base_selection" ? 35 : -8;
  if (context.travelIntent === "anchor") return routability === "anchor_or_poi" || routability === "needs_base_selection" ? 40 : -10;
  return routability === "direct_destination" ? 20 : 5;
}

function localitySpecificity(addressType: string | undefined) {
  if (addressType === "city") return 10;
  if (addressType === "town") return 8;
  if (addressType === "village" || addressType === "municipality") return 5;
  if (addressType === "hamlet") return 3;
  return 0;
}

function coordinateDistanceKm(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180;
  const deltaLat = (right[1] - left[1]) * radians;
  const deltaLon = (right[0] - left[0]) * radians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(left[1] * radians) * Math.cos(right[1] * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

async function fetchResults(params: URLSearchParams, fetchImpl: typeof fetch): Promise<NominatimResult[]> {
  const response = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "Morrovia trip planner/1.0 (https://morrovia.com)" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  return response.ok ? await response.json() as NominatimResult[] : [];
}

/** Shared provider-taxonomy → Morrovia-travel-entity boundary used by prompt
 * capture and Builder search. Results are deduplicated by provider identity,
 * never by display name, because city-states legitimately share labels. */
export async function searchNominatimTravelCandidates(
  phrase: string,
  context: PlaceResolutionContext = {},
  fetchImpl: typeof fetch = fetch,
): Promise<NominatimTravelCandidate[]> {
  const common = { format: "jsonv2", limit: "8", addressdetails: "1", extratags: "1", namedetails: "1", dedupe: "1", "accept-language": "en" };
  const freeform = new URLSearchParams({ q: phrase, ...common });
  const freeformResults = await fetchResults(freeform, fetchImpl);
  const responses: Array<{ mode: "freeform" | "city"; results: NominatimResult[] }> = [{ mode: "freeform", results: freeformResults }];
  const contextCountries = [...new Set((context.countryNames ?? []).map((country) => country.trim()).filter(Boolean))];
  const contextualCountry = contextCountries.length === 1 ? contextCountries[0] : undefined;
  const hasContextCountryResult = contextualCountry && freeformResults.some((result) => normalize(result.address?.country ?? "") === normalize(contextualCountry));
  if (contextualCountry && !hasContextCountryResult) {
    const contextual = new URLSearchParams({ q: `${phrase}, ${contextualCountry}`, ...common });
    responses.push({ mode: "freeform", results: await fetchResults(contextual, fetchImpl) });
  }
  const hasStrongDirectLocality = responses.flatMap((response) => response.results).some((result) => {
    const name = result.name?.trim() || result.display_name?.split(",")[0]?.trim() || "";
    const providerAliases = Object.values(result.namedetails ?? {}).filter(Boolean);
    return taxonomy(result, context).routability === "direct_destination"
      && matchQuality(name, phrase, "freeform", providerAliases) !== "partial";
  });
  if (context.travelIntent === "route-stop" && !hasStrongDirectLocality) {
    const city = new URLSearchParams({ city: phrase, ...common });
    responses.push({ mode: "city", results: await fetchResults(city, fetchImpl) });
  }
  const requested = normalize(phrase);
  const byIdentity = new Map<string, NominatimTravelCandidate>();

  for (const { mode, results } of responses) {
    for (const [providerRank, result] of results.entries()) {
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      const name = result.name?.trim() || result.display_name?.split(",")[0]?.trim() || "";
      const country = result.address?.country?.trim() ?? "";
      const providerId = result.osm_type && result.osm_id ? `${result.osm_type}:${result.osm_id}` : "";
      if (!providerId || !name || !country || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const facts = taxonomy(result, context);
      const providerAliases = Object.values(result.namedetails ?? {}).filter((value) => value && normalize(value) !== normalize(name));
      const quality = matchQuality(name, phrase, mode, providerAliases);
      if (quality === "partial" && !normalize(name).includes(requested) && !requested.includes(normalize(name))) continue;
      if (facts.placeType === "unknown") continue;
      const rawAdministrativeLevel = Number(result.extratags?.admin_level);
      const administrativeLevel = Number.isFinite(rawAdministrativeLevel) ? rawAdministrativeLevel : undefined;
      const geographicSignificance = recognizedHigherOrderGeographySignificance({
        placeType: facts.placeType,
        matchQuality: quality,
        providerImportance: result.importance,
        providerRank,
        administrativeLevel,
      });
      const score = (quality === "exact" ? 80 : quality === "alias" ? 55 : 20)
        + travelScore(facts.placeType, facts.routability, context)
        + contextScore(result, context)
        + Math.max(0, Math.min(30, (result.importance ?? 0) * 30))
        + localitySpecificity(result.addresstype)
        + (mode === "city" && facts.routability === "direct_destination" ? 12 : 0)
        + (/\b(?:city|town)\b/.test(result.extratags?.linked_place ?? "") ? 10 : 0);
      const aliases = [...new Set([...(quality === "alias" ? [phrase] : []), ...providerAliases])].slice(0, 12);
      const candidate: NominatimTravelCandidate = {
        providerId,
        canonicalName: name,
        ...(aliases.length ? { aliases } : {}),
        placeType: facts.placeType,
        parentCountries: [country],
        parentRegionId: result.address?.state ?? result.address?.county,
        accessPlaceName: result.address?.city ?? result.address?.town ?? result.address?.village ?? result.address?.hamlet
          ?? result.address?.municipality ?? result.address?.suburb ?? result.address?.neighbourhood,
        ...(result.boundingbox && result.boundingbox.length === 4 ? (() => {
          const south = Number(result.boundingbox[0]);
          const north = Number(result.boundingbox[1]);
          const west = Number(result.boundingbox[2]);
          const east = Number(result.boundingbox[3]);
          return [south, west, north, east].every(Number.isFinite) ? { bounds: { south, west, north, east } } : {};
        })() : {}),
        coordinates: [longitude, latitude],
        routability: facts.routability,
        matchQuality: quality,
        rankScore: score,
        ...(geographicSignificance ? { geographicSignificance } : {}),
        ...(typeof result.importance === "number" ? { providerImportance: result.importance } : {}),
        providerRank,
        ...(administrativeLevel !== undefined ? { administrativeLevel } : {}),
        normalizationReason: `${facts.reason}; ${quality} name match; ${context.travelIntent ?? "unknown"} intent${geographicSignificance ? `; recognised higher-order geography (${geographicSignificance.toFixed(2)})` : ""}`,
        country,
        countryCode: result.address?.country_code?.toUpperCase(),
        region: result.address?.state ?? result.address?.county,
        locality: result.address?.city ?? result.address?.town ?? result.address?.village ?? result.address?.hamlet
          ?? result.address?.municipality ?? result.address?.suburb ?? result.address?.neighbourhood,
        providerKind: result.addresstype ?? result.type ?? result.category ?? "place",
      };
      const existing = byIdentity.get(providerId);
      if (!existing || (candidate.rankScore ?? 0) > (existing.rankScore ?? 0)) byIdentity.set(providerId, candidate);
    }
  }
  const ranked = [...byIdentity.values()].sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0));
  // Nominatim can expose a locality node and its coextensive locality boundary
  // as separate OSM identities. Collapse only same-name, same-country, nearby
  // direct localities; city/country pairs remain distinct for semantic ranking.
  return ranked.filter((candidate, index, all) => !all.slice(0, index).some((prior) => (
    prior.routability === "direct_destination"
    && candidate.routability === "direct_destination"
    && normalize(prior.canonicalName) === normalize(candidate.canonicalName)
    && normalize(prior.country) === normalize(candidate.country)
    && Boolean(prior.coordinates && candidate.coordinates)
    && coordinateDistanceKm(prior.coordinates!, candidate.coordinates!) <= 25
  ))).slice(0, 8);
}

/** Compact global-gazetteer boundary. Only identity facts needed by Morrovia
 * cross this boundary; provider display payloads are discarded. */
export async function searchNominatimPlaceCandidates(
  phrase: string,
  context: PlaceResolutionContext = {},
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceProviderCandidate[]> {
  return (await searchNominatimTravelCandidates(phrase, context, fetchImpl)).map((candidate) => ({
    providerId: candidate.providerId,
    canonicalName: candidate.canonicalName,
    aliases: candidate.aliases,
    placeType: candidate.placeType,
    parentCountries: candidate.parentCountries,
    parentRegionId: candidate.parentRegionId,
    accessPlaceName: candidate.accessPlaceName,
    bounds: candidate.bounds,
    coordinates: candidate.coordinates,
    routability: candidate.routability,
    matchQuality: candidate.matchQuality,
    rankScore: candidate.rankScore,
    geographicSignificance: candidate.geographicSignificance,
    providerImportance: candidate.providerImportance,
    providerRank: candidate.providerRank,
    administrativeLevel: candidate.administrativeLevel,
    normalizationReason: candidate.normalizationReason,
  }));
}

export function createNominatimPlaceProvider(fetchImpl?: typeof fetch): PlaceIntelligenceProvider {
  return {
    id: "nominatim",
    label: "OpenStreetMap Nominatim",
    timeoutMs: 3_500,
    lookup: (phrase, context) => searchNominatimPlaceCandidates(phrase, context, fetchImpl),
  };
}
