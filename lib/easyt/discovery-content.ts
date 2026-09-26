import { AUSTRALIA_DISCOVERY_EVIDENCE } from "./australia-discovery-content.ts";
import { adaptedDiscoveryPlaces } from "./discovery-evidence-adapter.ts";
import { CURATED_DESTINATION_KNOWLEDGE, type KnowledgeSource } from "./destination-knowledge.ts";
import { findCatalogPlaceById, PLACE_CATALOG, type PlaceTypeLiteral } from "./place-catalog.ts";
import { placeCandidateSuitableAsNearbyBase } from "./place-intelligence.ts";
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

const canonicalCountryNames = new Set(PLACE_CATALOG.filter(place => place.placeType === "country").map(place => place.canonicalName));
function validContainment(id: string, country: string, group: string) {
  if (!canonicalCountryNames.has(country)) return false;
  if (AUSTRALIA_DISCOVERY_EVIDENCE.some(row => row.id === id)) {
    return country === "Australia" && Boolean(australiaEditorialGroups[group]);
  }
  return group === country;
}

export function discoveryPlaceForId(id: string): DiscoveryPlace | null {
  const { rows, duplicates } = indexReviewedRows();
  if (duplicates.has(id)) return null;
  const row = rows.get(id);
  const catalog = findCatalogPlaceById(id);
  if (!row) return (adaptedDiscoveryPlaces().find(place => place.id === id) as DiscoveryPlace | undefined) ?? null;
  if (!catalog || !validCoordinates(catalog.coordinates) || catalog.parentCountries.length !== 1
    || !validContainment(id, catalog.parentCountries[0]!, row.group)) return null;
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
  // Curated rows own their visitor content, but they must not hide separately
  // reviewed stay evidence from the global adapter (for example, an explicit
  // route-family base). The adapter has already validated canonical identity,
  // geography, provenance and settlement type before its evidence is merged.
  const adaptedStayEvidence = adaptedDiscoveryPlaces().find(place => place.id === id)?.stayEvidence ?? [];
  const stayEvidence = [...new Map([...row.stayEvidence, ...adaptedStayEvidence].map(source => [source.id, source])).values()];
  const overnight = ["city", "town", "transport_gateway"].includes(catalog.placeType) && stayEvidence.length > 0;
  return {
    id, name: catalog.canonicalName, country: catalog.parentCountries[0]!, group: row.group,
    groupIds: catalog.parentCountries[0] === "Australia" ? (australiaEditorialGroups[row.group] ?? []) : [],
    tags: row.tags, placeType: catalog.placeType, coordinates: catalog.coordinates,
    relevance: row.relevance, stayEvidence, accessEvidence: row.accessEvidence,
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

/** Canonical geography for a reviewed shortlist item, independent of overnight suitability. */
export function discoveryPlaceWithinMention(placeId: string, mention: DiscoveryMention): boolean {
  const anchor = mention.canonicalPlaceId ? findCatalogPlaceById(mention.canonicalPlaceId) : null;
  const place = findCatalogPlaceById(placeId);
  if (!anchor || !place || anchor.placeType !== mention.placeType) return false;
  if (anchor.placeType === "country") return place.parentCountries.includes(anchor.canonicalName);
  if (anchor.placeType === "continent" || anchor.placeType === "macro_region") {
    return place.parentCountries.some(country => anchor.parentCountries.includes(country));
  }
  return isWithin(placeId, anchor.canonicalPlaceId);
}

/** A base may be the attraction's parent settlement or a reviewed nearby gateway. */
export function discoveryBaseSuitableForMention(place: DiscoveryPlace, mention: DiscoveryMention): boolean {
  const anchor = mention.canonicalPlaceId ? findCatalogPlaceById(mention.canonicalPlaceId) : null;
  const base = findCatalogPlaceById(place.id);
  if (!anchor || !base || !["landmark", "natural_area"].includes(anchor.placeType)
    || place.actionability !== "overnight-base" || !place.stayEvidence.length
    || !["city", "town", "transport_gateway"].includes(base.placeType)
    || base.canonicalName !== place.name || !base.parentCountries.includes(place.country)
    || !anchor.parentCountries.includes(place.country)) return false;
  if (anchor.parentRegionId === base.canonicalPlaceId) return true;
  if (!anchor.coordinates) return false;
  return Boolean(placeCandidateSuitableAsNearbyBase({
    canonicalPlaceId: anchor.canonicalPlaceId, canonicalName: anchor.canonicalName,
    placeType: anchor.placeType, parentCountries: [...anchor.parentCountries],
    parentRegionId: anchor.parentRegionId, coordinates: [...anchor.coordinates] as [number, number],
  }, {
    providerId: base.canonicalPlaceId, canonicalName: base.canonicalName,
    placeType: base.placeType, parentCountries: [...base.parentCountries],
    parentRegionId: base.parentRegionId, coordinates: [...place.coordinates] as [number, number],
    routability: base.routability,
  }));
}

export function discoveryPlacesForMention(mention: DiscoveryMention): DiscoveryPlace[] {
  const anchor = mention.canonicalPlaceId ? findCatalogPlaceById(mention.canonicalPlaceId) : null;
  if (!anchor || anchor.placeType !== mention.placeType) return [];
  const curatedIndex = indexReviewedRows();
  const curated = [...curatedIndex.rows.keys()].flatMap(id => {
    const place = discoveryPlaceForId(id);
    return place ? [place] : [];
  });
  // Curated rows are richer and authoritative. Existing reviewed evidence
  // expands global coverage only where no curated row owns the ID. An invalid
  // curated row fails closed instead of falling through to weaker evidence.
  const places = [...curated, ...adaptedDiscoveryPlaces().filter(place => !curatedIndex.rows.has(place.id))] as DiscoveryPlace[];
  if (anchor.placeType === "country") return places.filter(place => place.country === anchor.canonicalName);
  if (anchor.placeType === "continent" || anchor.placeType === "macro_region") {
    return places.filter(place => anchor.parentCountries.includes(place.country));
  }
  return places.filter(place => isWithin(place.id, anchor.canonicalPlaceId)
    || ((anchor.placeType === "landmark" || anchor.placeType === "natural_area")
      && discoveryBaseSuitableForMention(place, mention)));
}
