import type {
  PlaceIntelligenceProvider,
  PlaceProviderCandidate,
  PlaceResolutionContext,
  PlaceRoutability,
  PlaceType,
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
  address?: {
    country?: string;
    country_code?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
  };
};

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function taxonomy(result: NominatimResult): { placeType: PlaceType; routability: PlaceRoutability } {
  const kind = `${result.addresstype ?? ""} ${result.type ?? ""} ${result.category ?? ""}`.toLocaleLowerCase();
  if (/\bcountry\b/.test(kind)) return { placeType: "country", routability: "planning_area" };
  if (/\b(?:city|town|village|hamlet|municipality|suburb|neighbourhood)\b/.test(kind)) return { placeType: /city/.test(kind) ? "city" : "town", routability: "direct_destination" };
  if (/\b(?:island|islet)\b/.test(kind)) return { placeType: "island", routability: "needs_base_selection" };
  if (/\b(?:lake|reservoir|national_park|nature_reserve|protected_area|park)\b/.test(kind)) return { placeType: "natural_area", routability: "needs_base_selection" };
  if (/\b(?:archaeological_site|attraction|historic|monument|museum|ruins)\b/.test(kind)) return { placeType: "landmark", routability: "anchor_or_poi" };
  if (/\b(?:state|province|region|county|administrative)\b/.test(kind)) return { placeType: "region", routability: "planning_area" };
  if (/\b(?:airport|aerodrome)\b/.test(kind)) return { placeType: "transport_gateway", routability: "direct_destination" };
  return { placeType: "unknown", routability: "non_routable_reference" };
}

function contextScore(candidate: NominatimResult, context: PlaceResolutionContext) {
  const country = normalize(candidate.address?.country ?? "");
  const countries = new Set([
    ...(context.countryNames ?? []),
    ...(context.selectedPlaces ?? []).flatMap((place) => place.parentCountries),
  ].map(normalize));
  return countries.has(country) ? 20 : 0;
}

/** Compact global-gazetteer boundary. Only identity facts needed by Morrovia
 * cross this boundary; provider display payloads are discarded. */
export async function searchNominatimPlaceCandidates(
  phrase: string,
  context: PlaceResolutionContext = {},
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceProviderCandidate[]> {
  const params = new URLSearchParams({ q: phrase, format: "jsonv2", limit: "8", addressdetails: "1", dedupe: "1", "accept-language": "en" });
  const response = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "Morrovia trip planner/1.0 (https://morrovia.com)" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!response.ok) return [];
  const requested = normalize(phrase);
  const seen = new Set<string>();
  return (await response.json() as NominatimResult[])
    .map((result) => {
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      const name = result.name?.trim() || result.display_name?.split(",")[0]?.trim() || "";
      const country = result.address?.country?.trim();
      const identity = result.osm_type && result.osm_id ? `${result.osm_type}:${result.osm_id}` : "";
      const facts = taxonomy(result);
      const nameKey = normalize(name);
      const score = (nameKey === requested ? 60 : nameKey.includes(requested) || requested.includes(nameKey) ? 30 : 0)
        + contextScore(result, context)
        + (facts.placeType === "unknown" ? -30 : 10);
      return { result, name, country, identity, latitude, longitude, score, facts };
    })
    .filter((item) => item.identity && item.name && item.country && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.score > 0)
    .sort((left, right) => right.score - left.score)
    .filter((item) => {
      const key = `${normalize(item.name)}|${normalize(item.country!)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(({ result, name, country, identity, latitude, longitude, facts }) => ({
      providerId: identity,
      canonicalName: name,
      placeType: facts.placeType,
      parentCountries: [country!],
      parentRegionId: result.address?.state ?? result.address?.county,
      coordinates: [longitude, latitude],
      routability: facts.routability,
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
