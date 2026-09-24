import { AUSTRALIA_DISCOVERY_EVIDENCE } from "./australia-discovery-content.ts";
import { CURATED_DESTINATION_KNOWLEDGE, type KnowledgeSource } from "./destination-knowledge.ts";
import { findCatalogPlaceById, findCatalogPlacesByPhrase, type PlaceTypeLiteral } from "./place-catalog.ts";
import { routeEditorialPhoto, routeImageCredit } from "./route-images.ts";

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
  /** Reviewed editorial group memberships; these are browse filters, not routes. */
  groupIds: readonly string[];
  tags: readonly string[];
  placeType: PlaceTypeLiteral;
  coordinates: readonly [number, number];
  relevance: DiscoveryEvidenceRow["relevance"];
  stayEvidence: readonly KnowledgeSource[];
  accessEvidence: readonly KnowledgeSource[];
  actionability: DiscoveryActionability;
  imageKey: string | null;
};

const australiaEditorialGroups: Record<string, readonly string[]> = {
  "New South Wales": ["australia-east-coast"],
  Queensland: ["australia-east-coast"],
  Victoria: ["australia-south"],
  "South Australia": ["australia-south"],
  Tasmania: ["australia-tasmania"],
  "Western Australia": ["australia-west"],
  "Northern Territory": ["australia-north-interior"],
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

// A knowledge record is an input, not blanket proof for all its tags. Only
// explicitly reviewed claims below enter Discovery. Existing route roles and
// nights never become global stay or access evidence.
function curatedSource(id: string, url: string): KnowledgeSource | null {
  const record = CURATED_DESTINATION_KNOWLEDGE.find(value => value.canonicalId === id);
  if (record?.experienceTags.status !== "known") return null;
  return record.experienceTags.sources.find(source => source.url === url && reviewedSource(source)) ?? null;
}

function visitorRow(id: string, group: string, tags: readonly string[], en: string, es: string, source: KnowledgeSource | null): DiscoveryEvidenceRow[] {
  return source ? [{ id, group, tags, relevance: { en, es, sources: [source] }, stayEvidence: [], accessEvidence: [], imageKey: null }] : [];
}

const existingReviewedRows: DiscoveryEvidenceRow[] = [
  ...visitorRow("arusha", "Tanzania", ["safari"],
    "Starting point for nearby national park visits.",
    "Punto de partida para visitar parques nacionales cercanos.",
    curatedSource("arusha", "https://tanzaniaparks.go.tz/uploads/publications/en-1581671752-TANAPA%20GENERAL%20BROCHURES%202020-WEBSITE%20%281%29.pdf")),
  ...visitorRow("puerto-princesa", "Philippines", ["nature"],
    "Subterranean river national park.",
    "Parque nacional del río subterráneo.",
    curatedSource("puerto-princesa", "https://philippines.travel/destinations/palawan/index")),
  ...visitorRow("el-nido", "Philippines", ["beach", "nature"],
    "Island hopping, lagoons and beaches.",
    "Excursiones entre islas, lagunas y playas.",
    curatedSource("el-nido", "https://philippines.travel/destinations/palawan/index")),
  ...visitorRow("dushanbe", "Tajikistan", ["culture"],
    "Museums and city parks.",
    "Museos y parques urbanos.",
    { id: "tajikistan-tourism:dushanbe-tour", label: "Travel to Tajikistan", kind: "official",
      url: "https://traveltajikistan.tj/en/dushanbe-city-tour/", reviewedAt: "2026-09-24",
      supports: "The Dushanbe city tour lists the National Museum and Kurushi Kabir Park; it does not substantiate food as a visitor reason." }),
  ...visitorRow("khujand", "Tajikistan", ["heritage"],
    "Fortress and cultural park.",
    "Fortaleza y parque cultural.",
    { id: "tajikistan-tourism:khujand-fortress", label: "Travel to Tajikistan", kind: "official",
      url: "https://traveltajikistan.tj/en/historical-cultural-and-archeological-complex-of-khujand-fortress-in-khujand/", reviewedAt: "2026-09-24",
      supports: "The Khujand visitor page describes the fortress complex and Kamoli Khujandi cultural park." }),
  ...visitorRow("panjakent", "Tajikistan", ["heritage"],
    "Historical sites and nearby Sarazm settlement.",
    "Sitios históricos y el cercano asentamiento de Sarazm.",
    { id: "tajikistan-tourism:ancient-sarazm", label: "Travel to Tajikistan", kind: "official",
      url: "https://traveltajikistan.tj/en/ancient-sarazm/", reviewedAt: "2026-09-24",
      supports: "The page links Penjikent/Panjakent with its historical sites and ancient Sarazm; it does not substantiate hiking." }),
];

const otherReviewedRows: DiscoveryEvidenceRow[] = [{
  id: "petra", group: "Jordan", tags: ["heritage"], imageKey: null,
  relevance: {
    en: "Nabataean rock-cut city and walking trails.",
    es: "Ciudad nabatea excavada en roca y senderos.",
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

// Coarse admin-0/admin-1 envelopes reject misplaced points, not points just
// across a border. Add a reviewed envelope whenever a new country is curated.
const geographySource = "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/";
const geographyReviewedAt = "2026-09-24";
const geographicEnvelopes: Record<string, {
  bounds: readonly [number, number, number, number]; sourceUrl: string; reviewedAt: string;
}> = Object.fromEntries(Object.entries({
  "New South Wales": [140, -38, 154, -28], Victoria: [140, -39.5, 150, -33.5],
  Tasmania: [143, -44, 149, -39], "South Australia": [129, -38.5, 142, -25],
  Queensland: [138, -29, 154, -10], "Northern Territory": [129, -26, 138, -10],
  "Western Australia": [112, -35.5, 129, -13],
  Jordan: [34.8, 29, 39.4, 33.5], Tajikistan: [67, 36, 75, 41],
  Tanzania: [29, -12, 41, -1], Philippines: [116, 4, 127, 22],
} satisfies Record<string, readonly [number, number, number, number]>).map(([name, bounds]) =>
  [name, { bounds, sourceUrl: geographySource, reviewedAt: geographyReviewedAt }]));

function validContainment(country: string, group: string, coordinates: readonly [number, number]) {
  if (!findCatalogPlacesByPhrase(country).some(entry => entry.placeType === "country" && entry.canonicalName === country)) return false;
  if (country !== "Australia" && group !== country) return false;
  const expectedGroup = country === "Australia" ? group : country;
  const evidence = geographicEnvelopes[expectedGroup];
  if (!evidence?.sourceUrl.startsWith("https://") || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.reviewedAt)) return false;
  const [west, south, east, north] = evidence.bounds;
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
    groupIds: catalog.parentCountries[0] === "Australia" ? (australiaEditorialGroups[row.group] ?? []) : [],
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
