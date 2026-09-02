import type { NearbyBaseAnchor, PlaceProviderCandidate } from "./place-intelligence.ts";

type OverpassElement = {
  type?: "node" | "way" | "relation";
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements?: OverpassElement[] };

function validCoordinates(value: [number | undefined, number | undefined]): value is [number, number] {
  return value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && value[0]! >= -180 && value[0]! <= 180
    && value[1]! >= -90 && value[1]! <= 90;
}

function overpassString(value: string) {
  return JSON.stringify(value.replace(/[\u0000-\u001f]/g, " ").slice(0, 100));
}

function usableSettlementKind(tags: Record<string, string>) {
  const kind = tags.place?.toLocaleLowerCase();
  if (kind === "city" || kind === "town" || kind === "village") return kind;
  if (kind !== "locality") return undefined;
  const population = Number(tags.population?.replace(/[^\d.]/g, ""));
  return Number.isFinite(population) && population > 0 ? kind : undefined;
}

function settlementPopulation(tags: Record<string, string>) {
  const population = Number(tags.population?.replace(/[^\d.]/g, ""));
  return Number.isFinite(population) && population > 0 ? population : undefined;
}

function settlementEvidenceScore(tags: Record<string, string>, kind: "city" | "town" | "village" | "locality") {
  const base = kind === "city" ? 160 : kind === "town" ? 145 : kind === "village" ? 75 : 45;
  const population = settlementPopulation(tags);
  const populationEvidence = population
    ? Math.min(20, Math.log10(population + 1) * 5)
    : 0;
  const civicEvidence = tags.capital ? 12 : tags.importance ? 5 : 0;
  return base + populationEvidence + civicEvidence;
}

/** Spatial OpenStreetMap adapter used behind the existing open-world source
 * boundary. Country containment is part of the provider query, so callers do
 * not infer a country from proximity alone. */
export async function searchOpenStreetMapNearbySettlements(
  anchor: NearbyBaseAnchor,
  radiusKm: number,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceProviderCandidate[]> {
  if (!anchor.coordinates || anchor.parentCountries.length !== 1) return [];
  const [longitude, latitude] = anchor.coordinates;
  if (!validCoordinates([longitude, latitude])) return [];
  const country = anchor.parentCountries[0]!.trim();
  if (!country) return [];
  const radiusMetres = Math.round(Math.max(10, Math.min(radiusKm, 200)) * 1_000);
  const villageRadiusMetres = Math.min(radiusMetres, 60_000);
  const localityRadiusMetres = Math.min(radiusMetres, 40_000);
  const query = `[out:json][timeout:9];area["boundary"="administrative"]["admin_level"="2"]["name"=${overpassString(country)}]->.country;(nwr(area.country)(around:${radiusMetres},${latitude},${longitude})["place"~"^(city|town)$"];nwr(area.country)(around:${villageRadiusMetres},${latitude},${longitude})["place"="village"];nwr(area.country)(around:${localityRadiusMetres},${latitude},${longitude})["place"="locality"]["population"];);out center tags 200;`;
  const response = await fetchImpl("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Morrovia trip planner/1.0 (https://morrovia.com)",
    },
    body: new URLSearchParams({ data: query }),
    cache: "no-store",
    signal: AbortSignal.timeout(9_500),
  });
  if (!response.ok) throw new Error("OpenStreetMap nearby lookup unavailable");
  const payload = await response.json() as OverpassResponse;
  return (payload.elements ?? []).flatMap((element, providerRank): PlaceProviderCandidate[] => {
    const tags = element.tags ?? {};
    const name = (tags["name:en"] ?? tags.name ?? "").trim();
    const kind = usableSettlementKind(tags);
    const candidateCoordinates: [number | undefined, number | undefined] = [element.lon ?? element.center?.lon, element.lat ?? element.center?.lat];
    const providerId = element.type && Number.isFinite(element.id) ? `${element.type}:${element.id}` : "";
    if (!providerId || !name || !validCoordinates(candidateCoordinates) || !kind) return [];
    const placeType = kind === "city" ? "city" as const : "town" as const;
    const population = settlementPopulation(tags);
    const region = (tags["addr:state"] ?? tags["is_in:state"] ?? tags["is_in:region"] ?? tags["addr:region"])?.trim();
    return [{
      providerId,
      canonicalName: name,
      aliases: [tags.name, tags["official_name"], tags["alt_name"]].filter((value): value is string => Boolean(value && value !== name)),
      placeType,
      settlementKind: kind,
      ...(population ? { settlementPopulation: population } : {}),
      parentCountries: [country],
      ...(region ? { parentRegionId: region } : {}),
      coordinates: candidateCoordinates,
      routability: "direct_destination",
      matchQuality: "exact",
      rankScore: settlementEvidenceScore(tags, kind),
      providerRank,
      normalizationReason: `OpenStreetMap ${kind} retrieved spatially inside ${country}`,
    }];
  });
}
