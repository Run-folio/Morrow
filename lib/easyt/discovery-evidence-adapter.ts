import { CURATED_DESTINATION_KNOWLEDGE, type KnowledgeSource } from "./destination-knowledge.ts";
import { findCatalogPlaceById, PLACE_CATALOG, type PlaceCatalogEntry, type PlaceTypeLiteral } from "./place-catalog.ts";
import { routeFamilies, routeFamilyByKey, type RouteFamily } from "./route-catalog.ts";

export type AdaptedDiscoveryPlace = {
  id: string;
  name: string;
  country: string;
  group: string;
  groupIds: readonly string[];
  tags: readonly string[];
  placeType: PlaceTypeLiteral;
  coordinates: readonly [number, number];
  relevance: { en: string; es: string; sources: readonly KnowledgeSource[] };
  stayEvidence: readonly KnowledgeSource[];
  accessEvidence: readonly KnowledgeSource[];
  actionability: "overnight-base" | "visit" | "browse-only";
  imageKey: null;
};

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
const validCoordinates = (coordinates: readonly [number, number] | undefined): coordinates is readonly [number, number] => Boolean(
  coordinates?.length === 2 && coordinates.every(Number.isFinite)
  && coordinates[0] >= -180 && coordinates[0] <= 180
  && coordinates[1] >= -90 && coordinates[1] <= 90,
);
const validReviewedSource = (source: KnowledgeSource | null | undefined): source is KnowledgeSource => Boolean(
  source?.url?.startsWith("https://") && source.reviewedAt?.match(/^\d{4}-\d{2}-\d{2}$/) && source.supports.trim(),
);

const browseOnlyRouteCopy: Readonly<Record<string, string>> = {
  "sacred-valley": "An Andean valley known for landscapes, villages and Inca heritage.",
  sossusvlei: "A major Namib desert landscape reached by a substantial road journey.",
  damaraland: "A remote desert-and-mountain region between Namibia's major highlights.",
  etosha: "One of Namibia's major wildlife areas, with access depending on the chosen gate and stay.",
  naxos: "A Cycladic island known for villages, beaches and mountain landscapes.",
};

const catalogByPhrase = new Map<string, PlaceCatalogEntry[]>();
for (const place of PLACE_CATALOG) {
  for (const phrase of [place.canonicalName, ...place.aliases]) {
    const key = normalized(phrase);
    catalogByPhrase.set(key, [...(catalogByPhrase.get(key) ?? []), place]);
  }
}
const canonicalCountryNames = new Set(PLACE_CATALOG.filter(place => place.placeType === "country").map(place => normalized(place.canonicalName)));
const countryPhrases = new Map(PLACE_CATALOG.filter(place => place.placeType === "country")
  .map(place => [normalized(place.canonicalName), [place.canonicalName, ...place.aliases].map(normalized)]));

function canonicalPlace(name: string, country: string) {
  const countryKey = normalized(country);
  return catalogByPhrase.get(normalized(name))?.find(place => place.parentCountries.length === 1
    && normalized(place.parentCountries[0] ?? "") === countryKey);
}

function phraseInEvidence(text: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(text);
}

function routeSource(route: RouteFamily, country: string, supports: string): KnowledgeSource | null {
  const countryKey = normalized(country);
  if (!route.countries.some(value => normalized(value) === countryKey)) return null;
  const phrases = countryPhrases.get(countryKey) ?? [countryKey];
  const source = route.sourceLinks.find(item => {
    if (!item.url.startsWith("https://")) return false;
    if (route.countries.length === 1) return true;
    const evidenceText = normalized(`${item.label} ${item.owner ?? ""} ${item.covers}`);
    return phrases.some(phrase => phraseInEvidence(evidenceText, phrase));
  });
  if (!source || !route.reviewedAt || !supports.trim()) return null;
  return {
    id: `route-catalog:${route.key}:${normalized(source.label).replaceAll(" ", "-")}`,
    label: source.label,
    kind: "curated",
    url: source.url,
    reviewedAt: route.reviewedAt,
    supports,
  };
}

function normalizedKnowledgeSource(source: KnowledgeSource, canonicalId: string, placeName: string, country: string): KnowledgeSource | null {
  if (validReviewedSource(source) && source.id.split(":").includes(canonicalId)) return source;
  const routeKey = source.id.startsWith("route-family:") ? source.id.slice("route-family:".length) : null;
  const route = routeKey ? routeFamilyByKey[routeKey] : undefined;
  return route ? routeSource(route, country, `${source.supports} This record applies to ${placeName}.`) : null;
}

function canonicalCandidate(input: {
  catalog: PlaceCatalogEntry;
  country: string;
  coordinates?: readonly [number, number];
  groupIds?: readonly string[];
  tags: readonly string[];
  relevance: { en: string; es: string; source: KnowledgeSource };
  staySource?: KnowledgeSource | null;
}): AdaptedDiscoveryPlace | null {
  const { catalog, country, tags, relevance, staySource } = input;
  const coordinates = validCoordinates(catalog.coordinates) ? catalog.coordinates : input.coordinates;
  if (catalog.canonicalPlaceId.startsWith("route-base:") || catalog.parentCountries.length !== 1
    || normalized(catalog.parentCountries[0] ?? "") !== normalized(country)
    || !validCoordinates(coordinates) || !validReviewedSource(relevance.source)) return null;
  if (!canonicalCountryNames.has(normalized(country))) return null;
  const safeStay: KnowledgeSource[] = validReviewedSource(staySource)
    && ["city", "town", "transport_gateway"].includes(catalog.placeType) ? [staySource] : [];
  return {
    id: catalog.canonicalPlaceId,
    name: catalog.canonicalName,
    country: catalog.parentCountries[0]!,
    group: catalog.parentCountries[0]!,
    groupIds: [...(input.groupIds ?? [])],
    tags: [...new Set(tags)],
    placeType: catalog.placeType,
    coordinates,
    relevance: { en: relevance.en, es: relevance.es, sources: [relevance.source] },
    stayEvidence: safeStay,
    accessEvidence: [],
    actionability: safeStay.length ? "overnight-base" : "browse-only",
    imageKey: null,
  };
}

function routeCandidates() {
  return routeFamilies.flatMap(route => route.stops.flatMap(stop => {
    const catalog = canonicalPlace(stop.name, stop.country);
    const relevanceSource = routeSource(route, stop.country, `${stop.name}: ${stop.reason}`);
    if (!catalog || !relevanceSource) return [];
    const isExplicitBase = route.bases.some(base => normalized(base) === normalized(stop.name))
      && stop.minimumNights > 0;
    const staySource = isExplicitBase ? routeSource(route, stop.country,
      `${route.title} explicitly uses ${stop.name} as an overnight base with a ${stop.minimumNights}-night minimum.`) : null;
    const supportsOvernightAction = isExplicitBase && ["city", "town", "transport_gateway"].includes(catalog.placeType);
    const candidate = canonicalCandidate({
      catalog,
      country: stop.country,
      coordinates: stop.coordinates,
      groupIds: [`route-family:${route.key}`],
      tags: route.interests,
      relevance: {
        en: supportsOvernightAction ? stop.reason : browseOnlyRouteCopy[catalog.canonicalPlaceId] ?? stop.reason,
        es: `${stop.name} forma parte de una ruta revisada de Morrovia.`,
        source: relevanceSource,
      },
      staySource,
    });
    return candidate ? [candidate] : [];
  }));
}

function knowledgeCandidates() {
  return CURATED_DESTINATION_KNOWLEDGE.flatMap(record => {
    if (record.country.status !== "known" || record.coordinates.status !== "known"
      || record.experienceTags.status !== "known" || !record.experienceTags.value.length) return [];
    const country = record.country.value;
    const catalog = findCatalogPlaceById(record.canonicalId);
    if (!catalog) return [];
    const relevanceSource = record.experienceTags.sources
      .map(source => normalizedKnowledgeSource(source, record.canonicalId, record.name, country)).find(validReviewedSource);
    if (!relevanceSource) return [];
    const hasStayRole = record.roles.status === "known"
      && record.roles.value.some(role => role === "base" || role === "hub" || role === "anchor");
    const stayFact = hasStayRole && record.minimumNights.status === "known" && record.minimumNights.value > 0
      ? record.minimumNights.sources.map(source => normalizedKnowledgeSource(source, record.canonicalId, record.name, country)).find(validReviewedSource) : null;
    const candidate = canonicalCandidate({
      catalog,
      country,
      coordinates: record.coordinates.value,
      tags: record.experienceTags.value,
      relevance: {
        en: `${record.name} has reviewed visitor relevance in Morrovia's destination knowledge.`,
        es: `${record.name} tiene relevancia turística revisada en la información de destinos de Morrovia.`,
        source: relevanceSource,
      },
      staySource: stayFact,
    });
    return candidate ? [candidate] : [];
  });
}

function mergeCandidate(existing: AdaptedDiscoveryPlace, next: AdaptedDiscoveryPlace): AdaptedDiscoveryPlace {
  const uniqueSources = (sources: readonly KnowledgeSource[]) => [...new Map(sources.map(source => [source.id, source])).values()];
  const stayEvidence = uniqueSources([...existing.stayEvidence, ...next.stayEvidence]);
  const accessEvidence = uniqueSources([...existing.accessEvidence, ...next.accessEvidence]);
  return {
    ...existing,
    groupIds: [...new Set([...existing.groupIds, ...next.groupIds])],
    tags: [...new Set([...existing.tags, ...next.tags])],
    relevance: { ...existing.relevance, sources: uniqueSources([...existing.relevance.sources, ...next.relevance.sources]) },
    stayEvidence,
    accessEvidence,
    actionability: stayEvidence.length ? "overnight-base" : accessEvidence.length ? "visit" : "browse-only",
  };
}

/** Deterministic read-only adapter over existing reviewed Morrovia evidence. */
let adaptedCache: readonly AdaptedDiscoveryPlace[] | null = null;
export function adaptedDiscoveryPlaces(): readonly AdaptedDiscoveryPlace[] {
  if (adaptedCache) return adaptedCache;
  const byId = new Map<string, AdaptedDiscoveryPlace>();
  for (const candidate of [...routeCandidates(), ...knowledgeCandidates()]) {
    const existing = byId.get(candidate.id);
    byId.set(candidate.id, existing ? mergeCandidate(existing, candidate) : candidate);
  }
  adaptedCache = [...byId.values()];
  return adaptedCache;
}
