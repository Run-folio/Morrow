import {
  recognizedHigherOrderGeographySignificance,
  type PlaceProviderCandidate,
  type PlaceResolutionContext,
  type PlaceRoutability,
  type PlaceType,
} from "./place-intelligence.ts";

type PhotonFeature = {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    extra?: { admin_level?: string | number };
  };
  geometry?: { coordinates?: unknown };
};

type PhotonResponse = { features?: PhotonFeature[] };

export type PhotonTravelCandidate = PlaceProviderCandidate & {
  country: string;
  countryCode?: string;
  region?: string;
  locality?: string;
  providerKind: string;
};

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) current[column] = Math.min(
      current[column - 1]! + 1,
      previous[column]! + 1,
      previous[column - 1]! + Number(left[row - 1] !== right[column - 1]),
    );
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function matchQuality(name: string, phrase: string) {
  const candidate = normalize(name);
  const requested = normalize(phrase);
  if (candidate === requested) return "exact" as const;
  const longest = Math.max(candidate.length, requested.length);
  if (longest >= 5 && editDistance(candidate, requested) <= Math.max(1, Math.floor(longest * 0.2))) return "alias" as const;
  if (candidate.includes(requested) || requested.includes(candidate)) return "alias" as const;
  return "partial" as const;
}

function taxonomy(feature: PhotonFeature, context: PlaceResolutionContext): { placeType: PlaceType; routability: PlaceRoutability; reason: string } {
  const properties = feature.properties ?? {};
  const kind = `${properties.osm_key ?? ""} ${properties.osm_value ?? ""} ${properties.type ?? ""}`.toLocaleLowerCase();
  if (/\b(?:city|town|village|hamlet|municipality|suburb|neighbourhood|locality)\b/.test(properties.osm_value?.toLocaleLowerCase() ?? "")) {
    const placeType = properties.osm_value === "city" ? "city" : "town";
    return { placeType, routability: "direct_destination", reason: `provider locality (${properties.osm_value}) is directly routable` };
  }
  if (/\bcountry\b/.test(kind)) return { placeType: "country", routability: "planning_area", reason: "provider sovereign identity remains broad" };
  if (/\b(?:island|islet)\b/.test(kind)) return { placeType: "island", routability: "needs_base_selection", reason: "provider island identity needs an overnight base" };
  if (/\b(?:lake|reservoir|national_park|nature_reserve|protected_area|park|bare_rock|peak|volcano|cliff|waterfall|glacier)\b/.test(kind)) return { placeType: "natural_area", routability: "needs_base_selection", reason: "provider natural-area identity remains an anchor" };
  if (/\b(?:archaeological_site|attraction|historic|monument|museum|ruins|tourism)\b/.test(kind)) return { placeType: "landmark", routability: "anchor_or_poi", reason: "provider landmark identity remains an anchor" };
  if (/\b(?:airport|aerodrome)\b/.test(kind)) return { placeType: "transport_gateway", routability: "direct_destination", reason: "provider transport gateway is directly routable" };
  if (/\b(?:state|province|region|county|administrative)\b/.test(kind)) return { placeType: "region", routability: "planning_area", reason: "provider administrative identity remains a planning area" };
  return { placeType: "unknown", routability: "non_routable_reference", reason: "provider taxonomy has no supported travel-entity mapping" };
}

function localitySpecificity(placeType: PlaceType, providerKind: string | undefined) {
  if (placeType === "city") return 10;
  if (providerKind === "town") return 8;
  if (providerKind === "village" || providerKind === "municipality") return 5;
  if (providerKind === "hamlet" || providerKind === "neighbourhood") return 3;
  return 0;
}

/** Fuzzy global-search adapter. Photon supplies provider coordinates and OSM
 * identity; Morrovia never synthesizes either fact from the query text. */
export async function searchPhotonTravelCandidates(
  phrase: string,
  context: PlaceResolutionContext = {},
  fetchImpl: typeof fetch = fetch,
): Promise<PhotonTravelCandidate[]> {
  const params = new URLSearchParams({ q: phrase, limit: "8", lang: "en" });
  const response = await fetchImpl(`https://photon.komoot.io/api/?${params}`, {
    headers: { "User-Agent": "Morrovia trip planner/1.0 (https://morrovia.com)" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!response.ok) return [];
  const features = (await response.json() as PhotonResponse).features ?? [];
  const contextCountries = new Set((context.countryNames ?? []).map(normalize));
  return features.flatMap((feature, index): PhotonTravelCandidate[] => {
    const properties = feature.properties ?? {};
    const rawCoordinates = feature.geometry?.coordinates;
    const coordinates = Array.isArray(rawCoordinates) && rawCoordinates.length >= 2
      && typeof rawCoordinates[0] === "number" && Number.isFinite(rawCoordinates[0])
      && typeof rawCoordinates[1] === "number" && Number.isFinite(rawCoordinates[1])
      ? [rawCoordinates[0], rawCoordinates[1]] as [number, number]
      : undefined;
    const name = properties.name?.trim() ?? "";
    const country = properties.country?.trim() ?? "";
    const providerId = properties.osm_type && properties.osm_id ? `${properties.osm_type}:${properties.osm_id}` : "";
    if (!coordinates || !name || !country || !providerId) return [];
    const facts = taxonomy(feature, context);
    if (facts.placeType === "unknown") return [];
    const quality = matchQuality(name, phrase);
    if (quality === "partial") return [];
    const rawAdministrativeLevel = Number(properties.extra?.admin_level);
    const administrativeLevel = Number.isFinite(rawAdministrativeLevel) ? rawAdministrativeLevel : undefined;
    const geographicSignificance = recognizedHigherOrderGeographySignificance({
      placeType: facts.placeType,
      matchQuality: quality,
      providerRank: index,
      administrativeLevel,
    });
    const routeScore = context.travelIntent === "route-stop"
      ? facts.routability === "direct_destination" ? 35 : -10
      : context.travelIntent === "anchor"
        ? facts.routability === "anchor_or_poi" || facts.routability === "needs_base_selection" ? 30 : -5
        : 5;
    return [{
      providerId,
      canonicalName: name,
      ...(quality === "alias" ? { aliases: [phrase] } : {}),
      placeType: facts.placeType,
      parentCountries: [country],
      parentRegionId: properties.state ?? properties.county,
      accessPlaceName: properties.city,
      coordinates,
      routability: facts.routability,
      matchQuality: quality,
      rankScore: (quality === "exact" ? 80 : 55)
        + routeScore
        + (contextCountries.has(normalize(country)) ? 20 : 0)
        + localitySpecificity(facts.placeType, properties.osm_value)
        + Math.max(0, 8 - index),
      ...(geographicSignificance ? { geographicSignificance } : {}),
      providerRank: index,
      ...(administrativeLevel !== undefined ? { administrativeLevel } : {}),
      normalizationReason: `${facts.reason}; ${quality} name match; ${context.travelIntent ?? "unknown"} intent${geographicSignificance ? `; recognised higher-order geography (${geographicSignificance.toFixed(2)})` : ""}`,
      country,
      countryCode: properties.countrycode?.toUpperCase(),
      region: properties.state ?? properties.county,
      locality: properties.city,
      providerKind: properties.osm_value ?? properties.type ?? properties.osm_key ?? "place",
    }];
  });
}
