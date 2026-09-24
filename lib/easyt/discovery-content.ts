import { AUSTRALIA_DISCOVERY_EVIDENCE } from "./australia-discovery-content.ts";
import { CURATED_DESTINATION_KNOWLEDGE, type KnowledgeSource } from "./destination-knowledge.ts";
import { findCatalogPlaceById, findCatalogPlacesByPhrase, type PlaceTypeLiteral } from "./place-catalog.ts";
import { routeDestinationPhoto, routeEditorialPhoto, routeImageCredit } from "./route-images.ts";

export type DiscoveryActionability = "overnight-base" | "visit" | "browse-only";
export type DiscoveryEvidenceRow = {
  id: string;
  group: string;
  tags: readonly string[];
  relevance: { en: string; es: string; sources: readonly KnowledgeSource[] };
  stayEvidence: readonly KnowledgeSource[];
  accessEvidence: readonly KnowledgeSource[];
  /** Deliberately null when no attributed and licensed image has been selected. */
  imageKey: string | null;
};
export type DiscoveryPlace = {
  id: string;
  name: string;
  country: string;
  group: string;
  tags: readonly string[];
  placeType: PlaceTypeLiteral;
  coordinates: readonly [number, number];
  relevance: DiscoveryEvidenceRow["relevance"];
  stayEvidence: readonly KnowledgeSource[];
  accessEvidence: readonly KnowledgeSource[];
  actionability: DiscoveryActionability;
  imageKey: string | null;
};
export type DiscoveryMention = {
  canonicalPlaceId?: string;
  canonicalName: string;
  placeType: PlaceTypeLiteral;
  parentCountries: readonly string[];
};

const reviewedSource = (source: KnowledgeSource) =>
  source.kind === "official"
  && typeof source.url === "string"
  && source.url.startsWith("https://")
  && Boolean(source.reviewedAt && /^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt))
  && Boolean(source.supports.trim());

const translatedTags: Record<string, string> = {
  nature: "naturaleza", wildlife: "fauna", beach: "playas", culture: "cultura",
  food: "gastronomía", hiking: "senderismo", heritage: "patrimonio",
};

// Existing destination roles and route-family nights are not stay evidence.
// Only destination records carrying an official, dated source with visitor
// context enter this read-only collection. A route stop's evidence stays scoped
// to that route family and is never promoted to global base actionability.
const existingReviewedRows: DiscoveryEvidenceRow[] = CURATED_DESTINATION_KNOWLEDGE.flatMap(destination => {
  if (destination.experienceTags.status !== "known" || !destination.experienceTags.value.length) return [];
  const sources = destination.experienceTags.sources.filter(reviewedSource);
  if (!sources.length) return [];
  const tags = destination.experienceTags.value.filter(tag => translatedTags[tag]);
  if (!tags.length) return [];
  const catalog = findCatalogPlaceById(destination.canonicalId);
  if (!catalog || !catalog.parentCountries.includes(destination.country.status === "known" ? destination.country.value : "")) return [];
  const photo = routeDestinationPhoto(catalog.canonicalName, catalog.parentCountries[0] ?? "");
  const imageKey = photo && photo.variants.some(variant => routeImageCredit(variant.src)) ? photo.key : null;
  return [{
    id: destination.canonicalId,
    group: catalog.parentCountries[0] ?? "",
    tags,
    relevance: {
      en: `Explore ${destination.name} for ${tags.join(" and ")}.`,
      es: `Explora ${destination.name} por ${tags.map(tag => translatedTags[tag]).join(" y ")}.`,
      sources,
    },
    stayEvidence: [], accessEvidence: [], imageKey,
  }];
});

const otherReviewedRows: DiscoveryEvidenceRow[] = [{
  id: "petra", group: "Jordan", tags: ["heritage"], imageKey: null,
  relevance: {
    en: "Visit Petra's Nabataean rock-cut city and walking trails.",
    es: "Visita la ciudad nabatea excavada en roca y los senderos de Petra.",
    sources: [{
      id: "jordan-tourism:petra", label: "Jordan Tourism Board", kind: "official",
      url: "https://international.visitjordan.com/wheretogo/petra/", reviewedAt: "2026-09-24",
      supports: "The Jordan Tourism Board describes Petra's Nabataean city and walking trails.",
    }],
  },
  stayEvidence: [], accessEvidence: [{
    id: "jordan-tourism:petra-access", label: "Jordan Tourism Board", kind: "official",
    url: "https://international.visitjordan.com/blog/external/7644/petra-jordan-how-to-get-there/", reviewedAt: "2026-09-24",
    supports: "Wadi Musa is Petra's entry town; this supports a visit relationship, not an overnight claim for the Petra site.",
  }],
}];

let reviewedIndex: { rows: Map<string, DiscoveryEvidenceRow>; duplicates: Set<string> } | null = null;
function indexReviewedRows() {
  if (reviewedIndex) return reviewedIndex;
  const rows = new Map<string, DiscoveryEvidenceRow>();
  const duplicates = new Set<string>();
  for (const row of [...AUSTRALIA_DISCOVERY_EVIDENCE, ...otherReviewedRows, ...existingReviewedRows]) {
    if (rows.has(row.id)) duplicates.add(row.id);
    else rows.set(row.id, row);
  }
  reviewedIndex = { rows, duplicates };
  return reviewedIndex;
}

function validCoordinates(coordinates: readonly [number, number] | undefined): coordinates is readonly [number, number] {
  return Boolean(coordinates && coordinates.length === 2
    && coordinates.every(Number.isFinite)
    && coordinates[0] >= -180 && coordinates[0] <= 180
    && coordinates[1] >= -90 && coordinates[1] <= 90);
}

// Deliberately broad envelopes catch misplaced points, not access or precise
// boundaries. The catalog remains the identity/containment authority.
const geographicEnvelopes: Record<string, readonly [number, number, number, number]> = {
  "New South Wales": [140, -38, 154, -28], Victoria: [140, -39.5, 150, -33.5],
  Tasmania: [143, -44, 149, -39], "South Australia": [129, -38.5, 142, -25],
  Queensland: [138, -29, 154, -10], "Northern Territory": [129, -26, 138, -10],
  "Western Australia": [112, -35.5, 129, -13],
  Jordan: [34.8, 29, 39.4, 33.5], Tajikistan: [67, 36, 75, 41],
  Tanzania: [29, -12, 41, -1], Philippines: [116, 4, 127, 22],
  Madagascar: [43, -26, 51, -11],
};

function validContainment(country: string, group: string, coordinates: readonly [number, number]) {
  // This is an open catalogue: source-backed places in a newly reviewed
  // country must not disappear solely because it lacks a local bounds table.
  if (!findCatalogPlacesByPhrase(country).some(entry => entry.placeType === "country" && entry.canonicalName === country)) return false;
  if (country !== "Australia" && group !== country) return false;
  const expectedGroup = country === "Australia" ? group : country;
  const bounds = geographicEnvelopes[expectedGroup];
  if (!bounds) return country !== "Australia";
  const [west, south, east, north] = bounds;
  return coordinates[0] >= west && coordinates[0] <= east
    && coordinates[1] >= south && coordinates[1] <= north;
}

export function discoveryPlaceForId(id: string): DiscoveryPlace | null {
  const { rows, duplicates } = indexReviewedRows();
  if (duplicates.has(id)) return null;
  const row = rows.get(id);
  const catalog = findCatalogPlaceById(id);
  if (!row || !catalog || !validCoordinates(catalog.coordinates) || catalog.parentCountries.length !== 1
    || !validContainment(catalog.parentCountries[0]!, row.group, catalog.coordinates)) return null;
  if (!row.relevance.en.trim() || !row.relevance.es.trim()
    || !row.relevance.sources.length || !row.relevance.sources.every(reviewedSource)
    || !row.stayEvidence.every(reviewedSource) || !row.accessEvidence.every(reviewedSource)) return null;
  if (row.imageKey) {
    const photo = routeEditorialPhoto(row.imageKey);
    if (!photo || photo.place !== catalog.canonicalName || photo.country !== catalog.parentCountries[0]
      || !photo.author || !photo.alt.trim() || !photo.license || !photo.sourceUrl.startsWith("https://")
      || !photo.licenseUrl.startsWith("https://")
      || !photo.variants.some(variant => routeImageCredit(variant.src))) return null;
  }
  const overnight = ["city", "town", "transport_gateway"].includes(catalog.placeType) && row.stayEvidence.length > 0;
  return {
    id, name: catalog.canonicalName, country: catalog.parentCountries[0]!, group: row.group,
    tags: row.tags, placeType: catalog.placeType, coordinates: catalog.coordinates,
    relevance: row.relevance, stayEvidence: row.stayEvidence, accessEvidence: row.accessEvidence,
    actionability: overnight ? "overnight-base" : row.accessEvidence.length ? "visit" : "browse-only",
    imageKey: row.imageKey,
  };
}

function isWithin(placeId: string, ancestorId: string): boolean {
  if (placeId === ancestorId) return true;
  const seen = new Set<string>();
  let parentId = findCatalogPlaceById(placeId)?.parentRegionId;
  while (parentId && !seen.has(parentId)) {
    if (parentId === ancestorId) return true;
    seen.add(parentId);
    parentId = findCatalogPlaceById(parentId)?.parentRegionId;
  }
  return false;
}

export function discoveryPlacesForMention(mention: DiscoveryMention): DiscoveryPlace[] {
  const anchor = mention.canonicalPlaceId ? findCatalogPlaceById(mention.canonicalPlaceId) : null;
  if (!anchor || anchor.placeType !== mention.placeType) return [];
  const places = [...indexReviewedRows().rows.keys()].flatMap(id => {
    const place = discoveryPlaceForId(id);
    return place ? [place] : [];
  });
  if (anchor.placeType === "country") return places.filter(place => place.country === anchor.canonicalName);
  if (anchor.placeType === "continent" || anchor.placeType === "macro_region") {
    return places.filter(place => anchor.parentCountries.includes(place.country));
  }
  return places.filter(place => isWithin(place.id, anchor.canonicalPlaceId));
}
