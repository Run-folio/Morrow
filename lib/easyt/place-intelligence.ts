import {
  PLACE_CATALOG,
  catalogAliasesForPlace,
  findCatalogMatches,
  findCatalogPlaceById,
  findCatalogPlacesByPhrase,
  matchCatalogPlace,
  type PlaceCatalogEntry,
  type PlaceTypeLiteral,
} from "./place-catalog.ts";
import {
  createPlanningConfidence,
  unknownPlanningConfidence,
  type PlanningConfidence,
  type PlanningConfidenceSource,
} from "./planning-confidence.ts";
import { routeFamilies, routeFamilyByKey, type RouteFamily } from "./route-catalog.ts";

export const PLACE_INTELLIGENCE_VERSION = 1 as const;
export const PLACE_INTELLIGENCE_PARSER_VERSION = "place-intelligence-v1-deterministic";

export type PlaceType = PlaceTypeLiteral;

/**
 * The repository normalizes provider settlements such as villages, hamlets,
 * municipalities, resort localities and island settlements to `town`.  A
 * usable overnight base therefore needs both that settlement identity and the
 * capability to participate directly in the route; geographic type alone is
 * not sufficient.
 */
export const OVERNIGHT_BASE_PLACE_TYPES = ["city", "town"] as const satisfies readonly PlaceType[];

export function isOvernightBaseEligible(
  place: Pick<PlaceResolutionCandidate, "placeType" | "routability">,
) {
  return place.routability === "direct_destination"
    && OVERNIGHT_BASE_PLACE_TYPES.includes(place.placeType as (typeof OVERNIGHT_BASE_PLACE_TYPES)[number]);
}

export type PlaceResolutionStatus = "resolved" | "partially_resolved" | "ambiguous" | "unresolved";
export type PlaceRoutability =
  | "direct_destination"
  | "planning_area"
  | "anchor_or_poi"
  | "needs_base_selection"
  | "non_routable_reference";
export type PlaceMentionRole =
  | "required"
  | "preferred"
  | "origin"
  | "fixed_start"
  | "fixed_end"
  | "gateway"
  | "anchor"
  | "optional"
  | "excluded";

export type GeographicBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type PlaceProvenance = {
  id: string;
  label: string;
  kind: "canonical" | "curated_alias" | "context" | "provider" | "unresolved" | "builder";
  supports: string;
  reviewedAt?: string;
};

export type PlaceResolutionCandidate = {
  canonicalPlaceId: string;
  canonicalName: string;
  aliases: string[];
  placeType: PlaceType;
  parentCountries: string[];
  parentRegionId?: string;
  /** Provider-backed locality or access place for an attraction. This is
   * routing context only; it never replaces the attraction's identity. */
  accessPlaceName?: string;
  bounds?: GeographicBounds;
  coordinates?: [number, number];
  routability: PlaceRoutability;
  confidence: PlanningConfidence;
  provenance: PlaceProvenance[];
};

export type ResolvedPlaceMention = {
  mentionId: string;
  sourceText: string;
  sourceTexts: string[];
  normalizedPhrase: string;
  canonicalName: string;
  canonicalPlaceId?: string;
  aliases: string[];
  placeType: PlaceType;
  status: PlaceResolutionStatus;
  confidence: PlanningConfidence;
  provenance: PlaceProvenance[];
  parentCountries: string[];
  parentRegionId?: string;
  /** Locality/access context retained separately from the named attraction. */
  accessPlaceName?: string;
  bounds?: GeographicBounds;
  coordinates?: [number, number];
  routability: PlaceRoutability;
  directlyRoutable: boolean;
  requiresBaseSelection: boolean;
  isAnchor: boolean;
  role: PlaceMentionRole;
  order: number;
  candidates: PlaceResolutionCandidate[];
};

export type PlaceIssueCode =
  | "unresolved_place"
  | "ambiguous_place"
  | "region_requires_base"
  | "unsupported_place_type"
  | "conflicting_place_roles"
  | "duplicate_alias"
  | "unsupported_containment"
  | "missing_routable_destination";

export type PlaceIssueOption = {
  kind: "candidate" | "base";
  canonicalPlaceId: string;
  label: string;
  country?: string;
  region?: string;
  placeType: PlaceType;
  coordinates?: [number, number];
  provenance: PlaceProvenance[];
};

export type PlaceResolutionIssue = {
  code: PlaceIssueCode;
  mentionId: string;
  canonicalPlaceId?: string;
  sourceText: string;
  reason: string;
  message: string;
  severity: "info" | "warning" | "error";
  blocksRoute: boolean;
  options: PlaceIssueOption[];
  provenance: PlaceProvenance[];
  confidence: PlanningConfidence;
};
export type PlaceIssue = PlaceResolutionIssue;

export type PlaceSelection = {
  mentionId: string;
  kind: "ambiguity" | "base" | "visit";
  selectedCanonicalPlaceId: string;
  selectedName: string;
  selectedPlaceType?: PlaceType;
  selectedParentCountries?: string[];
  routeStopId?: string;
  provenance: PlaceProvenance;
  /** A visit relationship preserves the attraction while binding its visit to
   * an existing overnight stop. It does not turn the attraction into a stop. */
  relationshipType?: "within-stop" | "visit-from-base" | "access-via";
  confidence?: PlanningConfidence;
};

export type AttractionVisitTarget = {
  routeStopId: string;
  name: string;
  canonicalPlaceId?: string;
  country?: string;
  coordinates?: [number, number];
};

export type AttractionVisitCandidate = {
  mentionId: string;
  target: AttractionVisitTarget;
  relationshipType: "within-stop" | "visit-from-base" | "access-via";
  confidence: PlanningConfidence;
  score: number;
  reason: string;
};

/** A city cannot be selected as the base for that same canonical city. This
 * normalizes legacy/manual state without touching genuine anchor/base pairs,
 * whose canonical identities differ. */
export function reconcileSelfBasePlaceState(
  mentions: readonly ResolvedPlaceMention[],
  selections: readonly PlaceSelection[],
) {
  const collapsedMentionIds = new Set<string>();
  for (const selection of selections) {
    if (selection.kind === "visit") continue;
    const mention = mentions.find((item) => item.mentionId === selection.mentionId);
    if (!mention) continue;
    const directType = isOvernightBaseEligible({
      placeType: selection.selectedPlaceType ?? mention.placeType,
      // A stored base selection is itself evidence that this selected entity
      // was resolved as a direct route destination.
      routability: "direct_destination",
    });
    const sameIdentity = Boolean(mention.canonicalPlaceId && mention.canonicalPlaceId === selection.selectedCanonicalPlaceId)
      || normalizePlacePhrase(mention.canonicalName) === normalizePlacePhrase(selection.selectedName)
      || normalizePlacePhrase(mention.sourceText) === normalizePlacePhrase(selection.selectedName);
    if (directType && sameIdentity) collapsedMentionIds.add(mention.mentionId);
  }
  return {
    collapsedMentionIds,
    selections: selections.filter((selection) => !collapsedMentionIds.has(selection.mentionId)),
    mentions: mentions.map((mention): ResolvedPlaceMention => collapsedMentionIds.has(mention.mentionId) ? {
      ...mention,
      canonicalPlaceId: selections.find((selection) => selection.mentionId === mention.mentionId)?.selectedCanonicalPlaceId ?? mention.canonicalPlaceId,
      canonicalName: selections.find((selection) => selection.mentionId === mention.mentionId)?.selectedName ?? mention.canonicalName,
      parentCountries: selections.find((selection) => selection.mentionId === mention.mentionId)?.selectedParentCountries ?? mention.parentCountries,
      placeType: selections.find((selection) => selection.mentionId === mention.mentionId)?.selectedPlaceType ?? mention.placeType,
      status: "resolved",
      routability: "direct_destination",
      directlyRoutable: true,
      requiresBaseSelection: false,
      isAnchor: false,
    } : mention),
  };
}

export type PlaceIntelligenceResult = {
  version: typeof PLACE_INTELLIGENCE_VERSION;
  parserVersion: typeof PLACE_INTELLIGENCE_PARSER_VERSION;
  sequenceKind: "ordered" | "unordered";
  mentions: ResolvedPlaceMention[];
  issues: PlaceResolutionIssue[];
};

export function placeMentionsNeedingReview(
  mentions: readonly ResolvedPlaceMention[],
  issues: readonly PlaceResolutionIssue[],
) {
  return mentions.filter((mention) => {
    const issue = issues.find((item) => item.mentionId === mention.mentionId
      && item.code !== "missing_routable_destination" && item.code !== "duplicate_alias");
    return Boolean(issue)
      || mention.status === "ambiguous"
      || mention.status === "unresolved"
      || mention.routability !== "direct_destination";
  });
}

export type PlaceResolutionContext = {
  countryNames?: string[];
  /** Country constraints stated by the traveller or an explicit UI choice.
   * Route-derived countryNames remain useful context, but must not outweigh a
   * bare exact canonical country/first-order geography. */
  explicitCountryNames?: string[];
  explicitPlaceTypes?: PlaceType[];
  selectedPlaces?: Array<Pick<PlaceResolutionCandidate, "canonicalPlaceId" | "canonicalName" | "placeType" | "parentCountries" | "routability" | "coordinates">>;
  /** Semantic intent for this individual lookup. It lets a gazetteer keep a
   * country/region broad when requested while preferring its locality identity
   * when the traveller is listing overnight stops. */
  travelIntent?: "route-stop" | "planning-area" | "anchor" | "unknown";
};

export type ExplicitPlaceMention = {
  sourceText: string;
  role: PlaceMentionRole;
  /** Optional semantic interpretation used only as a provider lookup phrase.
   * The provider must still establish the canonical geographic identity. */
  lookupText?: string;
  travelIntent?: PlaceResolutionContext["travelIntent"];
};

export type PlaceProviderCandidate = {
  providerId: string;
  providerSourceId?: string;
  providerSourceLabel?: string;
  canonicalName: string;
  aliases?: string[];
  placeType: PlaceType;
  /** Provider-normalized settlement granularity used only for nearby-base
   * suitability. Village/locality remain represented by the existing town
   * route-stop type while retaining their weaker base evidence. */
  settlementKind?: "city" | "town" | "village" | "locality";
  settlementPopulation?: number;
  parentCountries?: string[];
  parentRegionId?: string;
  accessPlaceName?: string;
  bounds?: GeographicBounds;
  coordinates?: [number, number];
  routability?: PlaceRoutability;
  /** Safe, provider-independent ranking evidence. Raw provider payloads never
   * cross the boundary. */
  matchQuality?: "exact" | "alias" | "partial";
  rankScore?: number;
  /** Provider-normalized evidence that an exact result is a recognised
   * sovereign or first-order geography, rather than merely any admin record. */
  geographicSignificance?: number;
  providerImportance?: number;
  providerRank?: number;
  administrativeLevel?: number;
  normalizationReason?: string;
};

export type NearbyBaseAnchor = {
  canonicalPlaceId?: string;
  canonicalName: string;
  placeType: PlaceType;
  parentCountries: string[];
  parentRegionId?: string;
  coordinates?: [number, number];
};

export type NearbyBaseSuggestion = CanonicalPlaceSuggestion & {
  distanceKm: number;
  containment: "country" | "region";
  confidence: PlanningConfidence;
  reason: string;
};

export type PlanningParentConstraint = {
  canonicalPlaceId?: string;
  canonicalName: string;
  placeType: PlaceType;
  parentCountries: string[];
  parentRegionId?: string;
  bounds?: GeographicBounds;
};

/** Base selection is stricter than ordinary place ranking. Once a traveller
 * has chosen a planning geography, a candidate must be canonically contained
 * by it; an in-country or nearby ranking boost is not sufficient. */
export function placeCandidateWithinPlanningParent(
  candidate: Pick<PlaceProviderCandidate, "canonicalName" | "placeType" | "parentCountries" | "parentRegionId" | "coordinates" | "routability">,
  parent: PlanningParentConstraint,
) {
  if (!isOvernightBaseEligible({
    placeType: candidate.placeType,
    routability: candidate.routability ?? "direct_destination",
  })) return false;
  const candidateCountries = (candidate.parentCountries ?? []).map(normalizePlacePhrase);
  const parentCountries = parent.parentCountries.map(normalizePlacePhrase);
  const parentName = normalizePlacePhrase(parent.canonicalName);
  const countryContained = parentCountries.length === 0
    || candidateCountries.some((country) => parentCountries.includes(country));
  if (!countryContained) return false;

  if (parent.placeType === "continent") return countryContained;

  if (parent.placeType === "country") {
    return candidateCountries.includes(parentName) || parentCountries.includes(parentName);
  }

  const candidateRegion = normalizePlacePhrase(candidate.parentRegionId ?? "");
  const namedAdministrativeParent = Boolean(candidateRegion && (
    candidateRegion === parentName
    || candidateRegion === normalizePlacePhrase(parent.parentRegionId ?? "")
  ));
  if (namedAdministrativeParent) return true;
  if (!candidate.coordinates || !parent.bounds) return false;
  return coordinatesWithinBounds(candidate.coordinates, parent.bounds);
}

/** Convert already-available provider hierarchy/rank facts into one bounded,
 * destination-agnostic signal. This deliberately excludes lower-order admin
 * records unless the provider itself ranks them as a major geography. */
export function recognizedHigherOrderGeographySignificance(evidence: {
  placeType: PlaceType;
  matchQuality?: PlaceProviderCandidate["matchQuality"];
  providerImportance?: number;
  providerRank?: number;
  administrativeLevel?: number;
}) {
  if (evidence.matchQuality !== "exact") return 0;
  const importance = typeof evidence.providerImportance === "number"
    ? Math.max(0, Math.min(1, evidence.providerImportance))
    : undefined;
  const providerRank = evidence.providerRank;
  if (evidence.placeType === "continent" || evidence.placeType === "country") return Math.max(0.9, importance ?? 0);
  if (evidence.placeType !== "region" && evidence.placeType !== "sub_region") return 0;

  const firstOrder = typeof evidence.administrativeLevel === "number" && evidence.administrativeLevel <= 4;
  const providerLeadingFirstOrder = firstOrder && typeof providerRank === "number" && providerRank <= 1;
  const independentlyImportant = typeof importance === "number" && importance >= 0.72;
  if (!providerLeadingFirstOrder && !independentlyImportant) return 0;
  return Math.max(0.72, importance ?? 0, providerLeadingFirstOrder ? 0.9 : 0);
}

/** A comma-qualified entity type is explicit traveller context, not part of
 * the provider place name. Keep the vocabulary generic and compact. */
export function providerLookupRequest(phrase: string, context: PlaceResolutionContext) {
  const qualifier = phrase.match(/^(.*?),\s*(country|state|province|region)\s*$/i);
  if (!qualifier?.[1] || !qualifier[2]) return { phrase, context };
  const placeType: PlaceType = qualifier[2].toLocaleLowerCase() === "country" ? "country" : "region";
  return {
    phrase: qualifier[1].trim(),
    context: {
      ...context,
      explicitPlaceTypes: [...new Set([...(context.explicitPlaceTypes ?? []), placeType])],
    },
  };
}

export type PlaceIntelligenceProvider = {
  id: string;
  label: string;
  /** Keep homepage capture bounded even when an enrichment provider stalls. */
  timeoutMs?: number;
  lookup: (phrase: string, context: PlaceResolutionContext) => Promise<PlaceProviderCandidate[]>;
  /** Optional provider-neutral spatial lookup. Implementations return only
   * compact canonical settlement facts; raw provider payloads stay server-side. */
  nearby?: (anchor: NearbyBaseAnchor, radiusKm: number) => Promise<PlaceProviderCandidate[]>;
};

export type RegionalBaseSuggestion = {
  mentionId?: string;
  regionCanonicalPlaceId: string;
  canonicalPlaceId: string;
  name: string;
  country: string;
  placeType: PlaceType;
  coordinates: [number, number];
  reason: string;
  provenance: PlaceProvenance[];
};

export type GuidedPlanningAreaSuggestion = RegionalBaseSuggestion & {
  routeFamilyKey?: string;
  anchorMatched: boolean;
};

export type GuidedPlanningAreaShape = {
  id: string;
  mentionId: string;
  routeFamilyKey: string;
  title: string;
  placeSummary: string;
  reason: string;
  places: GuidedPlanningAreaSuggestion[];
  matchedInterestIds: string[];
  anchorMentionId?: string;
  reviewedAt: string;
};

export type GuidedPlanningAreaContext = {
  mentions?: readonly ResolvedPlaceMention[];
  interests?: readonly string[];
  durationDays?: number;
  pace?: "relaxed" | "balanced" | "packed";
};

const MULTI_PLACE_PLANNING_TYPES = new Set<PlaceType>([
  "continent", "country", "macro_region", "region", "sub_region", "island", "archipelago",
  "natural_area", "coast", "mountain_range", "valley", "travel_corridor",
]);

export function placeMentionSupportsMultipleSelections(
  mention: Pick<ResolvedPlaceMention, "placeType" | "routability" | "requiresBaseSelection">,
) {
  return (mention.requiresBaseSelection || mention.routability === "planning_area")
    && MULTI_PLACE_PLANNING_TYPES.has(mention.placeType);
}

export type CanonicalPlaceSuggestion = {
  canonicalPlaceId: string;
  name: string;
  label: string;
  country: string;
  region?: string;
  placeType: PlaceType;
  coordinates?: [number, number];
  bounds?: GeographicBounds;
  routability?: PlaceRoutability;
  provenance: PlaceProvenance[];
};

const planningAreaPlaceTypes = new Set<PlaceType>([
  "continent", "country", "macro_region", "region", "sub_region", "island", "archipelago",
  "natural_area", "coast", "mountain_range", "valley", "travel_corridor",
]);

export function placeSuggestionRequiresBaseSelection(suggestion: CanonicalPlaceSuggestion) {
  if (suggestion.routability === "planning_area" || suggestion.routability === "needs_base_selection" || suggestion.routability === "anchor_or_poi") return true;
  if (suggestion.routability === "direct_destination" || suggestion.routability === "non_routable_reference") return false;
  return planningAreaPlaceTypes.has(suggestion.placeType);
}

type RawCatalogMatch = { entry: PlaceCatalogEntry; alias: string; start: number; end: number; sourceText: string };

const ORDER_LANGUAGE = /(?:→|->|\bthen\b|\bnext\b|\bvia\b|\bthrough\b|\bto\b|\bfly(?:ing)? into\b|\bfrom\b.+\bto\b|\bstart(?:ing)?\b.+\b(?:finish|end)(?:ing)?\b)/i;
const UNKNOWN_CANDIDATE = /\b(?:the\s+)?[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*(?:\s+(?:de|del|la|las|los|of|the|[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*)){0,3}/gu;
const LOWERCASE_TYPO_CANDIDATE = /\b[\p{Ll}][\p{L}'’.-]{3,}\b/gu;
const DELIMITED_UNKNOWN_CANDIDATE = /(?:^|[,;])\s*([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,3})\s*(?=,|;|$)/gu;
const EXPLICIT_ORIGIN_CANDIDATE = /\b(?:fly(?:ing)?|depart(?:ing)?|leav(?:e|ing))?\s*from\s+([\p{L}'’.-]+(?:\s+(?!(?:to|through|via|then|and|drive|fly|take|travel|go)\b)[\p{L}'’.-]+){0,3})/giu;
const BROAD_PLANNING_CANDIDATE = /\b(?:the\s+)?(?:fjords?|alps|highlands|coast|wine\s+country|islands?|desert|patagonia|riviera|lake\s+district)\b/giu;
const NON_PLACE_PHRASES = new Set([
  "a", "about", "add", "avoid", "avoiding", "begin", "by", "days", "do", "drive", "easter", "five", "flight", "flights", "fly", "flying", "finish", "finishing", "food", "for", "four", "from", "home", "i", "is", "it",
  "keep", "keep the", "nature", "no", "one", "prefer", "relaxed", "road", "route", "skip", "start", "starting", "the", "three", "trip",
  "back", "end", "ending", "finish", "finishing", "home", "ill", "jaw", "know", "not", "open", "out", "return", "returning", "sure", "where", "yet",
  "luxury", "take", "ten", "travel", "two", "we", "week", "weeks", "with", "without",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "spring", "summer", "autumn", "fall", "winter", "wet season", "dry season", "high season", "low season", "shoulder season",
  "culture", "cities", "beach", "beaches", "hiking", "mountains", "history", "architecture", "wildlife", "wine", "nightlife",
  "slow", "balanced", "packed", "flexible", "important", "must", "please", "ideally", "maybe",
  "overland", "public", "transport", "practical", "possible", "sensible", "road trip",
]);

export function normalizePlacePhrase(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type BroadPlanningIntent = { placeType: PlaceType; routability: "needs_base_selection" };

/** These phrases describe geographic scope or an experience, not an overnight
 * endpoint. Qualified canonical entities are resolved by the catalogue first;
 * this guard applies only when the traveller's surviving phrase is generic. */
function broadPlanningIntentForPhrase(value: string): BroadPlanningIntent | undefined {
  const phrase = normalizePlacePhrase(value).replace(/^the\s+/, "");
  const placeType = ({
    fjord: "natural_area",
    fjords: "natural_area",
    alps: "mountain_range",
    highlands: "region",
    coast: "coast",
    "wine country": "region",
    island: "archipelago",
    islands: "archipelago",
    desert: "natural_area",
    patagonia: "region",
    riviera: "coast",
    "lake district": "natural_area",
  } satisfies Partial<Record<string, PlaceType>>)[phrase];
  return placeType ? { placeType, routability: "needs_base_selection" } : undefined;
}

function broadIntentShape(sourceText: string) {
  const broad = broadPlanningIntentForPhrase(sourceText);
  return broad ? {
    placeType: broad.placeType,
    routability: broad.routability,
    requiresBaseSelection: true,
    isAnchor: true,
  } : {
    placeType: "unknown" as const,
    routability: "non_routable_reference" as const,
    requiresBaseSelection: false,
    isAnchor: false,
  };
}

function slug(value: string) {
  return normalizePlacePhrase(value).replace(/\s+/g, "-") || "place";
}

function unique<T>(values: T[], key: (value: T) => string) {
  return values.filter((value, index, all) => all.findIndex((other) => key(other) === key(value)) === index);
}

function sourceFromCatalog(entry: PlaceCatalogEntry, alias: string): PlaceProvenance {
  const canonicalAlias = normalizePlacePhrase(alias) === normalizePlacePhrase(entry.canonicalName);
  return {
    id: entry.provenance.id,
    label: entry.provenance.label,
    kind: canonicalAlias ? "canonical" : "curated_alias",
    supports: entry.provenance.supports,
    reviewedAt: entry.provenance.reviewedAt,
  };
}

function planningSource(source: PlaceProvenance): PlanningConfidenceSource {
  return {
    id: source.id,
    label: source.label,
    kind: source.kind === "provider" ? "provider" : "curated",
    supports: source.supports,
    reviewedAt: source.reviewedAt,
  };
}

function structuredConfidence(source: PlaceProvenance, reason: string) {
  return createPlanningConfidence({
    state: "structured",
    level: "high",
    freshness: source.reviewedAt ? "reviewed" : "unknown",
    scope: "general-route",
    sources: [planningSource(source)],
    reason,
  });
}

function inferredConfidence(source: PlaceProvenance, reason: string) {
  return createPlanningConfidence({
    state: "inferred",
    level: "medium",
    freshness: source.reviewedAt ? "reviewed" : "unknown",
    scope: "general-route",
    sources: [planningSource(source)],
    reason,
    confirmationReason: "Confirm this contextual place interpretation if it changes the route.",
  });
}

function catalogCandidate(entry: PlaceCatalogEntry, source: PlaceProvenance, contextual = false): PlaceResolutionCandidate {
  return {
    canonicalPlaceId: entry.canonicalPlaceId,
    canonicalName: entry.canonicalName,
    aliases: [...entry.aliases],
    placeType: entry.placeType,
    parentCountries: [...entry.parentCountries],
    parentRegionId: entry.parentRegionId,
    coordinates: entry.coordinates ? [...entry.coordinates] as [number, number] : undefined,
    routability: entry.routability,
    confidence: contextual
      ? inferredConfidence(source, "Nearby explicit geography provides meaningful context for this interpretation.")
      : structuredConfidence(source, "The phrase matches Morrovia's curated canonical place data."),
    provenance: [source],
  };
}

function displayRegion(parentRegionId?: string) {
  return parentRegionId
    ?.split("-")
    .map((part) => part ? `${part[0]?.toLocaleUpperCase()}${part.slice(1)}` : part)
    .join(" ");
}

/**
 * Morrovia-authored suggestions are identities, not search strings. Ambiguous
 * or non-routable phrases stay out of the suggestion rail until the existing
 * Place Intelligence boundary can identify one canonical destination.
 */
export function canonicalPlaceSuggestionFor(
  phrase: string,
  contextCountries: string[] = [],
): CanonicalPlaceSuggestion | null {
  const direct = findCatalogPlacesByPhrase(phrase).filter((entry) =>
    entry.routability === "direct_destination" && entry.parentCountries.length === 1);
  const context = new Set(contextCountries.map(normalizePlacePhrase));
  const contextual = direct.filter((entry) => entry.parentCountries.some((country) => context.has(normalizePlacePhrase(country))));
  const entry = contextual.length === 1 ? contextual[0] : direct.length === 1 ? direct[0] : undefined;
  if (!entry) return null;
  const alias = [entry.canonicalName, ...entry.aliases]
    .find((candidate) => normalizePlacePhrase(candidate) === normalizePlacePhrase(phrase))
    ?? entry.canonicalName;
  const source = sourceFromCatalog(entry, alias);
  const country = entry.parentCountries[0];
  const region = displayRegion(entry.parentRegionId);
  return {
    canonicalPlaceId: entry.canonicalPlaceId,
    name: entry.canonicalName,
    label: `${entry.canonicalName}${region ? ` · ${region}` : ""}, ${country}`,
    country,
    region,
    placeType: entry.placeType,
    coordinates: entry.coordinates ? [...entry.coordinates] as [number, number] : undefined,
    provenance: [source],
  };
}

/**
 * Canonical autocomplete uses the same catalog and normalization boundary as
 * prompt capture. Results are route-ready identities, never display strings
 * that need to be interpreted again after selection.
 */
export function canonicalPlaceSuggestionsForQuery(
  query: string,
  contextCountries: string[] = [],
  limit = 8,
): CanonicalPlaceSuggestion[] {
  const normalizedQuery = normalizePlacePhrase(query);
  if (normalizedQuery.length < 2) return [];
  const context = new Set(contextCountries.map(normalizePlacePhrase));
  const ranked: Array<{ score: number; suggestion: CanonicalPlaceSuggestion }> = [];
  for (const entry of PLACE_CATALOG) {
      if (entry.routability !== "direct_destination" || entry.parentCountries.length !== 1) continue;
      const labels = [entry.canonicalName, ...entry.aliases].map((label) => ({ label, normalized: normalizePlacePhrase(label) }));
      const exact = labels.some(({ normalized }) => normalized === normalizedQuery);
      const prefix = labels.some(({ normalized }) => normalized.startsWith(normalizedQuery));
      const wordPrefix = labels.some(({ normalized }) => normalized.split(" ").some((word) => word.startsWith(normalizedQuery)));
      const contains = labels.some(({ normalized }) => normalized.includes(normalizedQuery));
      if (!contains && !wordPrefix) continue;
      const contextual = entry.parentCountries.some((country) => context.has(normalizePlacePhrase(country)));
      const score = (exact ? 0 : prefix ? 10 : wordPrefix ? 20 : 30) - (contextual ? 3 : 0);
      const source = sourceFromCatalog(entry, labels.find(({ normalized }) => normalized === normalizedQuery)?.label ?? entry.canonicalName);
      const country = entry.parentCountries[0]!;
      const region = displayRegion(entry.parentRegionId);
      ranked.push({
        score,
        suggestion: {
          canonicalPlaceId: entry.canonicalPlaceId,
          name: entry.canonicalName,
          label: `${entry.canonicalName}${region ? ` · ${region}` : ""}, ${country}`,
          country,
          region,
          placeType: entry.placeType,
          coordinates: entry.coordinates ? [...entry.coordinates] as [number, number] : undefined,
          provenance: [source],
        } satisfies CanonicalPlaceSuggestion,
      });
  }
  return ranked
    .sort((left, right) => left.score - right.score || left.suggestion.name.localeCompare(right.suggestion.name))
    .slice(0, Math.max(1, limit))
    .map(({ suggestion }) => suggestion);
}

function coordinateDistanceKm(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180;
  const [leftLon, leftLat] = left;
  const [rightLon, rightLat] = right;
  const deltaLat = (rightLat - leftLat) * radians;
  const deltaLon = (rightLon - leftLon) * radians;
  const area = Math.sin(deltaLat / 2) ** 2
    + Math.cos(leftLat * radians) * Math.cos(rightLat * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

export function nearbyBaseSearchPreposition(anchor: Pick<NearbyBaseAnchor, "placeType">) {
  return ["natural_area", "island", "archipelago", "coast", "mountain_range", "valley", "travel_corridor"].includes(anchor.placeType)
    ? "around"
    : "near";
}

export function nearbyBaseAnchorForMention(
  mention: Pick<ResolvedPlaceMention, "canonicalPlaceId" | "canonicalName" | "placeType" | "parentCountries" | "parentRegionId" | "coordinates" | "routability">,
): NearbyBaseAnchor | undefined {
  if (mention.routability === "direct_destination" || !mention.coordinates || !validPlaceCoordinates(mention.coordinates)) return undefined;
  if (!["landmark", "natural_area", "island", "archipelago", "coast", "mountain_range", "valley", "travel_corridor"].includes(mention.placeType)) return undefined;
  return {
    canonicalPlaceId: mention.canonicalPlaceId,
    canonicalName: mention.canonicalName,
    placeType: mention.placeType,
    parentCountries: [...mention.parentCountries],
    parentRegionId: mention.parentRegionId,
    coordinates: [...mention.coordinates] as [number, number],
  };
}

export function placeCandidateSuitableAsNearbyBase(
  anchor: NearbyBaseAnchor,
  candidate: Pick<PlaceProviderCandidate, "providerId" | "canonicalName" | "placeType" | "parentCountries" | "parentRegionId" | "coordinates" | "routability">,
  maximumDistanceKm = 140,
) {
  if (!anchor.coordinates || !validPlaceCoordinates(anchor.coordinates) || !candidate.providerId.trim()
    || !candidate.canonicalName.trim() || !candidate.coordinates || !validPlaceCoordinates(candidate.coordinates)) return undefined;
  if (!isOvernightBaseEligible({
    placeType: candidate.placeType,
    routability: candidate.routability ?? "direct_destination",
  })) return undefined;
  const anchorCountries = new Set(anchor.parentCountries.map(normalizePlacePhrase));
  const candidateCountries = (candidate.parentCountries ?? []).map(normalizePlacePhrase).filter(Boolean);
  if (!candidateCountries.length || (anchorCountries.size && !candidateCountries.some((country) => anchorCountries.has(country)))) return undefined;
  const distanceKm = coordinateDistanceKm(anchor.coordinates, candidate.coordinates);
  if (!Number.isFinite(distanceKm) || distanceKm > maximumDistanceKm) return undefined;
  const anchorIdentity = normalizePlacePhrase(anchor.canonicalPlaceId ?? anchor.canonicalName);
  const candidateIdentity = normalizePlacePhrase(candidate.providerId);
  const sameName = normalizePlacePhrase(anchor.canonicalName) === normalizePlacePhrase(candidate.canonicalName);
  if (candidateIdentity === anchorIdentity || (sameName && distanceKm <= 5)) return undefined;

  const anchorRegion = normalizePlacePhrase(anchor.parentRegionId ?? "");
  const candidateRegion = normalizePlacePhrase(candidate.parentRegionId ?? "");
  const sameRegion = Boolean(anchorRegion && candidateRegion && anchorRegion === candidateRegion);
  // Explicitly contradictory regional evidence is unsafe unless the settlement
  // is close enough to be the attraction's containing urban locality. Missing
  // regional metadata is accepted only for a tightly nearby, country-contained
  // settlement rather than a distant city in the same country.
  if (anchorRegion && candidateRegion && !sameRegion && distanceKm > 30) return undefined;
  if (anchorRegion && !candidateRegion && distanceKm > 60) return undefined;
  return { distanceKm, containment: sameRegion ? "region" as const : "country" as const };
}

/** Rank a provider shortlist using only canonical containment, settlement
 * suitability, provider confidence and trustworthy coordinates. Distance is
 * deliberately dominant; provider prominence cannot pull in a distant city. */
export function rankNearbyBaseCandidates(
  anchor: NearbyBaseAnchor,
  candidates: readonly PlaceProviderCandidate[],
  options: { limit?: number; maximumDistanceKm?: number } = {},
): NearbyBaseSuggestion[] {
  const maximumDistanceKm = Math.max(10, Math.min(options.maximumDistanceKm ?? 140, 200));
  const limit = Math.max(1, Math.min(options.limit ?? 5, 5));
  const conflictedProviderIds = new Set<string>();
  const byProviderId = new Map<string, PlaceProviderCandidate[]>();
  for (const candidate of candidates) byProviderId.set(candidate.providerId, [...(byProviderId.get(candidate.providerId) ?? []), candidate]);
  for (const [providerId, records] of byProviderId) {
    if (records.some((record, index) => records.slice(index + 1).some((other) => {
      if (normalizePlacePhrase(record.canonicalName) !== normalizePlacePhrase(other.canonicalName)) return true;
      const recordCountry = normalizePlacePhrase(record.parentCountries?.[0] ?? "");
      const otherCountry = normalizePlacePhrase(other.parentCountries?.[0] ?? "");
      if (recordCountry !== otherCountry) return true;
      return Boolean(record.coordinates && other.coordinates && coordinateDistanceKm(record.coordinates, other.coordinates) > 5);
    }))) conflictedProviderIds.add(providerId);
  }

  const ranked = candidates.flatMap((candidate) => {
    if (conflictedProviderIds.has(candidate.providerId)) return [];
    const suitability = placeCandidateSuitableAsNearbyBase(anchor, candidate, maximumDistanceKm);
    if (!suitability || !candidate.coordinates) return [];
    const country = candidate.parentCountries?.[0];
    if (!country) return [];
    const distanceScore = Math.max(0, 90 - suitability.distanceKm * 0.65);
    const containmentScore = suitability.containment === "region" ? 20 : 11;
    const settlementKind = candidate.settlementKind ?? candidate.placeType;
    const population = candidate.settlementPopulation;
    const settlementScore = settlementKind === "city" ? 26
      : settlementKind === "town" ? 21
        : settlementKind === "village"
          ? population && population >= 1_000 ? 16 : population && population >= 500 ? 10 : 8
          : population && population >= 1_000 ? 12 : 7;
    const providerEvidence = Math.max(0, Math.min(8, (candidate.rankScore ?? 0) / 25));
    const score = distanceScore + containmentScore + settlementScore + providerEvidence;
    const roundedDistance = Math.max(1, Math.round(suitability.distanceKm));
    const source: PlaceProvenance = {
      id: candidate.providerId,
      label: candidate.providerSourceLabel ?? "Global place provider",
      kind: "provider",
      supports: `Provider-identified ${candidate.placeType} ${roundedDistance} km from ${anchor.canonicalName}; ${suitability.containment}-level containment was retained.`,
    };
    const reason = `${roundedDistance} km from ${anchor.canonicalName} · Verified ${candidate.placeType}`;
    return [{
      score,
      suggestion: {
        canonicalPlaceId: candidate.providerId.startsWith("open-world:") ? candidate.providerId : `open-world:${candidate.providerId}`,
        name: candidate.canonicalName,
        label: `${candidate.canonicalName}${candidate.parentRegionId ? ` · ${candidate.parentRegionId}` : ""}, ${country}`,
        country,
        region: candidate.parentRegionId,
        placeType: candidate.placeType,
        coordinates: [...candidate.coordinates] as [number, number],
        routability: "direct_destination" as const,
        provenance: [source],
        distanceKm: suitability.distanceKm,
        containment: suitability.containment,
        confidence: createPlanningConfidence({
          state: "inferred",
          level: suitability.containment === "region" || suitability.distanceKm <= 60 ? "high" : "medium",
          freshness: "current",
          scope: "general-route",
          sources: [{ id: source.id, label: source.label, kind: "provider", supports: source.supports }],
          reason,
          ...(suitability.containment === "country" && suitability.distanceKm > 60
            ? { confirmationReason: "The traveller should confirm this country-contained but more remote base." }
            : {}),
        }),
        reason,
      } satisfies NearbyBaseSuggestion,
    }];
  }).sort((left, right) => right.score - left.score
    || left.suggestion.distanceKm - right.suggestion.distanceKm
    || left.suggestion.name.localeCompare(right.suggestion.name));

  return ranked
    .filter((item, index, all) => !all.slice(0, index).some((prior) => (
      prior.suggestion.canonicalPlaceId === item.suggestion.canonicalPlaceId
      || (normalizePlacePhrase(prior.suggestion.name) === normalizePlacePhrase(item.suggestion.name)
        && normalizePlacePhrase(prior.suggestion.country) === normalizePlacePhrase(item.suggestion.country)
        && coordinateDistanceKm(prior.suggestion.coordinates!, item.suggestion.coordinates!) <= 10)
    )))
    .slice(0, limit)
    .map(({ suggestion }) => suggestion);
}

function sameCountryForVisit(mention: ResolvedPlaceMention, target: AttractionVisitTarget) {
  if (!target.country || !mention.parentCountries.length) return true;
  return mention.parentCountries.some((country) => normalizePlacePhrase(country) === normalizePlacePhrase(target.country ?? ""));
}

function attractionVisitCandidate(
  mention: ResolvedPlaceMention,
  target: AttractionVisitTarget,
): AttractionVisitCandidate | undefined {
  if (!sameCountryForVisit(mention, target)) return undefined;
  const targetCatalog = target.canonicalPlaceId ? findCatalogPlaceById(target.canonicalPlaceId) : undefined;
  const anchorParent = normalizePlacePhrase(mention.parentRegionId ?? "");
  const accessPlace = normalizePlacePhrase(mention.accessPlaceName ?? "");
  const targetIdentity = normalizePlacePhrase(target.canonicalPlaceId ?? "");
  const targetName = normalizePlacePhrase(target.name);
  const targetParent = normalizePlacePhrase(targetCatalog?.parentRegionId ?? "");
  let score = 0;
  let relationshipType: AttractionVisitCandidate["relationshipType"] = "visit-from-base";
  let reason = "";

  if (anchorParent && (anchorParent === targetIdentity || anchorParent === targetName)) {
    score = 125;
    relationshipType = "within-stop";
    reason = "The attraction's canonical parent is already an overnight stop.";
  } else if (accessPlace && accessPlace === targetName) {
    score = 120;
    relationshipType = "within-stop";
    reason = "Provider-backed locality evidence places the attraction at this existing stop.";
  } else if (anchorParent && targetParent && anchorParent === targetParent) {
    score = 110;
    relationshipType = "visit-from-base";
    reason = "The attraction and overnight stop share reviewed canonical containment.";
  } else if (mention.coordinates && target.coordinates) {
    const distance = coordinateDistanceKm(mention.coordinates, target.coordinates);
    if (distance <= 12) {
      score = 105;
      relationshipType = "within-stop";
      reason = "Validated coordinates place the attraction within the existing destination context.";
    } else if (distance <= 90) {
      score = Math.max(65, 96 - Math.round(distance / 3));
      relationshipType = "access-via";
      reason = "Validated coordinates make this an access candidate, but the relationship still needs confirmation.";
    }
  }
  if (!score) return undefined;
  const source: PlanningConfidenceSource = {
    id: `attraction-visit:${mention.mentionId}:${target.routeStopId}`,
    label: "Morrovia attraction relationship",
    kind: "curated",
    supports: reason,
  };
  return {
    mentionId: mention.mentionId,
    target,
    relationshipType,
    score,
    reason,
    confidence: createPlanningConfidence({
      state: "inferred",
      level: score >= 100 ? "high" : "medium",
      freshness: "current",
      scope: "general-route",
      sources: [source],
      reason,
      ...(score < 100 ? { confirmationReason: "Confirm the proposed attraction access base before relying on it." } : {}),
    }),
  };
}

/** Rank existing overnight stops for a named attraction without inventing a
 * second place identity. Canonical containment/locality evidence wins;
 * proximity alone remains a proposal rather than an automatic relationship. */
export function rankAttractionVisitTargets(
  mention: ResolvedPlaceMention,
  targets: readonly AttractionVisitTarget[],
) {
  if (mention.status !== "resolved" || mention.routability !== "anchor_or_poi" || mention.placeType !== "landmark") return [];
  return targets
    .flatMap((target) => attractionVisitCandidate(mention, target) ?? [])
    .sort((left, right) => right.score - left.score || left.target.name.localeCompare(right.target.name));
}

/** Preserve explicit choices, discard only relationships whose stop no longer
 * exists, and auto-bind attractions only when one high-confidence target is
 * materially stronger than every alternative. */
export function inferAttractionVisitSelections(
  mentions: readonly ResolvedPlaceMention[],
  targets: readonly AttractionVisitTarget[],
  selections: readonly PlaceSelection[] = [],
) {
  const targetIds = new Set(targets.map((target) => target.routeStopId));
  const retained = selections.filter((selection) => selection.kind !== "visit"
    || !selection.routeStopId
    || targetIds.has(selection.routeStopId));
  const byMention = new Map(retained.map((selection) => [selection.mentionId, selection]));
  for (const mention of mentions) {
    if (mention.status !== "resolved" || mention.routability !== "anchor_or_poi" || mention.placeType !== "landmark") continue;
    const existing = byMention.get(mention.mentionId);
    if (existing?.routeStopId && targetIds.has(existing.routeStopId)) {
      if (existing.kind === "base") {
        const target = targets.find((item) => item.routeStopId === existing.routeStopId)!;
        const ranked = attractionVisitCandidate(mention, target);
        const upgraded: PlaceSelection = {
          ...existing,
          kind: "visit",
          relationshipType: ranked?.relationshipType ?? "visit-from-base",
          confidence: ranked?.confidence ?? existing.confidence,
        };
        byMention.set(mention.mentionId, upgraded);
      }
      continue;
    }
    const ranked = rankAttractionVisitTargets(mention, targets);
    const best = ranked[0];
    const next = ranked[1];
    if (!best || best.score < 100 || (next && best.score - next.score < 15)) continue;
    const targetCatalog = best.target.canonicalPlaceId ? findCatalogPlaceById(best.target.canonicalPlaceId) : undefined;
    const provenance: PlaceProvenance = {
      id: `attraction-visit:${mention.mentionId}:${best.target.routeStopId}`,
      label: "Morrovia attraction relationship",
      kind: "context",
      supports: `${best.reason} ${mention.canonicalName} remains a named visit; ${best.target.name} remains the overnight stop.`,
    };
    byMention.set(mention.mentionId, {
      mentionId: mention.mentionId,
      kind: "visit",
      selectedCanonicalPlaceId: best.target.canonicalPlaceId ?? `route-stop:${best.target.routeStopId}`,
      selectedName: best.target.name,
      selectedPlaceType: targetCatalog?.placeType ?? "town",
      selectedParentCountries: best.target.country ? [best.target.country] : undefined,
      routeStopId: best.target.routeStopId,
      provenance,
      relationshipType: best.relationshipType,
      confidence: best.confidence,
    });
  }
  return [...byMention.values()];
}

export function validPlaceCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && value[0] >= -180 && value[0] <= 180
    && value[1] >= -90 && value[1] <= 90;
}

function coordinatesWithinBounds(coordinates: [number, number], bounds: GeographicBounds | undefined) {
  if (!bounds) return true;
  const [longitude, latitude] = coordinates;
  const longitudeInside = bounds.west <= bounds.east
    ? longitude >= bounds.west && longitude <= bounds.east
    : longitude >= bounds.west || longitude <= bounds.east;
  return latitude >= bounds.south && latitude <= bounds.north && longitudeInside;
}

/** Reject provider enrichment that contradicts an already canonical identity. */
export function canonicalPlaceFactsMatch(
  canonicalPlaceId: string,
  facts: { country?: string; coordinates?: [number, number] },
) {
  const entry = findCatalogPlaceById(canonicalPlaceId);
  if (!entry) return true;
  if (facts.country && entry.parentCountries.length
    && !entry.parentCountries.some((country) => normalizePlacePhrase(country) === normalizePlacePhrase(facts.country ?? ""))) return false;
  if (entry.coordinates && facts.coordinates
    && coordinateDistanceKm([...entry.coordinates] as [number, number], facts.coordinates) > 200) return false;
  return true;
}

function candidateToMention(
  candidate: PlaceResolutionCandidate,
  input: { sourceText: string; sourceTexts?: string[]; order: number; role: PlaceMentionRole; mentionId?: string; status?: PlaceResolutionStatus },
): ResolvedPlaceMention {
  return {
    mentionId: input.mentionId ?? `place-${candidate.canonicalPlaceId}-${input.order}`,
    sourceText: input.sourceText,
    sourceTexts: input.sourceTexts ?? [input.sourceText],
    normalizedPhrase: normalizePlacePhrase(input.sourceText),
    canonicalName: candidate.canonicalName,
    canonicalPlaceId: candidate.canonicalPlaceId,
    aliases: [...candidate.aliases],
    placeType: candidate.placeType,
    status: input.status ?? "resolved",
    confidence: candidate.confidence,
    provenance: [...candidate.provenance],
    parentCountries: [...candidate.parentCountries],
    parentRegionId: candidate.parentRegionId,
    accessPlaceName: candidate.accessPlaceName,
    bounds: candidate.bounds,
    coordinates: candidate.coordinates,
    routability: candidate.routability,
    directlyRoutable: candidate.routability === "direct_destination",
    requiresBaseSelection: candidate.routability === "needs_base_selection" || candidate.routability === "planning_area",
    isAnchor: candidate.routability === "anchor_or_poi",
    role: input.role,
    order: input.order,
    candidates: [],
  };
}

function rawCatalogMatches(prompt: string): RawCatalogMatch[] {
  return findCatalogMatches(prompt).flatMap((match) => match.entries.map((entry) => {
    const alias = [entry.canonicalName, ...entry.aliases]
      .find((label) => normalizePlacePhrase(label) === match.normalizedPhrase)
      ?? entry.canonicalName;
    return { entry, alias, start: match.start, end: match.end, sourceText: match.sourceText };
  }));
}

function roleAt(prompt: string, sourceText: string, start: number, placeType: PlaceType): PlaceMentionRole {
  const before = normalizePlacePhrase(prompt.slice(Math.max(0, start - 64), start));
  const after = normalizePlacePhrase(prompt.slice(start + sourceText.length, Math.min(prompt.length, start + sourceText.length + 45)));
  if (/(?:do not|dont|not|never)(?: want to)? visit$|(?:skip|exclude|excluding|avoid)$/.test(before)) return "excluded";
  if (/(?:^| )(?:finish|finishing|end|ending)(?: the trip)? (?:in|at)$|fly(?:ing)? (?:home|back)? from$|(?:fly(?:ing)? )?out of$|(?:back|return(?:ing)?) to$|one way to$/.test(before)) return "fixed_end";
  if (/(?:^| )(?:start|starting|begin|beginning)(?: the trip)?(?: (?:in|at))?$/.test(before)) return "fixed_start";
  if (/(?:leaving from|departing from|depart from|from|desde|saliendo de)$/.test(before)) return "origin";
  if (!before && /^(?:to|through|via)\b/.test(after)) return "origin";
  if (/(?:fly|flying) into$|(?:arrive|arriving) (?:in|at)$/.test(before)) return "gateway";
  if (/^(?:is )?(?:essential|required|a must|non negotiable|the priority|definitely)/.test(after)
    || /(?:must visit|cannot miss|cant miss|essential|non negotiable|definitely)[^,.]{0,24}$/.test(before)
    || /(?:spend|spending)(?: the)?(?: whole)? trip (?:in|at)$/.test(before)) return "required";
  if (/(?:would be nice|nice to have|if it fits|if possible|maybe|perhaps|optional)[^,.]{0,26}$/.test(before)
    || /^(?:would be nice|if it fits|if possible|maybe|perhaps|is optional)/.test(after)) return "optional";
  if (placeType === "landmark" || placeType === "natural_area") return "anchor";
  return "preferred";
}

function contextChoice(entries: PlaceCatalogEntry[], promptIds: Set<string>, context: PlaceResolutionContext) {
  if (entries.length <= 1) return entries[0];
  const contextIds = new Set([...promptIds, ...(context.selectedPlaces ?? []).map((place) => place.canonicalPlaceId)]);
  const selectedMatches = entries.filter((entry) => (context.selectedPlaces ?? []).some((place) => place.canonicalPlaceId === entry.canonicalPlaceId));
  if (selectedMatches.length === 1) return selectedMatches[0];
  const countries = new Set([
    ...(context.countryNames ?? []).map(normalizePlacePhrase),
    ...(context.selectedPlaces ?? []).flatMap((place) => place.parentCountries.map(normalizePlacePhrase)),
  ]);
  if (entries.some((entry) => entry.canonicalPlaceId === "georgia-country") && (contextIds.has("armenia") || countries.has("armenia"))) {
    return entries.find((entry) => entry.canonicalPlaceId === "georgia-country");
  }
  if (entries.some((entry) => entry.canonicalPlaceId === "georgia-us-state") && (contextIds.has("florida") || contextIds.has("united-states") || countries.has("united states"))) {
    return entries.find((entry) => entry.canonicalPlaceId === "georgia-us-state");
  }
  if (contextIds.has("spain") || countries.has("spain")) {
    const spanish = entries.filter((entry) => entry.parentCountries.some((country) => normalizePlacePhrase(country) === "spain"));
    if (spanish.length === 1) return spanish[0];
    return spanish.find((entry) => entry.placeType === "city");
  }
  if (entries.some((entry) => entry.canonicalPlaceId === "antigua-guatemala")
    && (contextIds.has("guatemala") || contextIds.has("lake-atitlan") || contextIds.has("tikal")
      || countries.has("guatemala"))) {
    return entries.find((entry) => entry.canonicalPlaceId === "antigua-guatemala");
  }
  if (entries.some((entry) => entry.canonicalPlaceId === "antigua-island")
    && (contextIds.has("antigua-and-barbuda") || countries.has("antigua and barbuda"))) {
    return entries.find((entry) => entry.canonicalPlaceId === "antigua-island");
  }
  return undefined;
}

function levenshtein(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let index = 0; index <= left.length; index += 1) rows[index][0] = index;
  for (let index = 0; index <= right.length; index += 1) rows[0][index] = index;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + Number(left[row - 1] !== right[column - 1]),
      );
    }
  }
  return rows[left.length][right.length];
}

function unresolvedCandidates(prompt: string, occupied: Array<{ start: number; end: number }>) {
  const candidates: Array<{ sourceText: string; start: number; end: number; fuzzy?: PlaceCatalogEntry; reviewOnly?: boolean; forcedRole?: PlaceMentionRole }> = [];
  const intersectsKnownRange = (start: number, end: number) => occupied.some((range) => range.start < end && range.end > start)
    || candidates.some((candidate) => candidate.start < end && candidate.end > start);
  const fuzzyMatchFor = (normalized: string, minimumCanonicalLength = 7) => {
    const fuzzyEntries = PLACE_CATALOG.filter((entry) => {
      const canonical = normalizePlacePhrase(entry.canonicalName);
      return canonical.length >= minimumCanonicalLength && levenshtein(normalized, canonical) === 1;
    });
    return fuzzyEntries.length === 1 ? fuzzyEntries[0] : undefined;
  };
  // Lower-case collective geography is easy for capitalisation-led extraction
  // to miss. Retain only this small class of known broad intent phrases; they
  // still require provider-backed clarification or a traveller-selected base.
  for (const match of prompt.matchAll(BROAD_PLANNING_CANDIDATE)) {
    const sourceText = match[0].trim();
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const prefix = prompt.slice(0, start);
    const introducedAsStandalonePhrase = /^the\s+/i.test(sourceText)
      || !prefix.trim()
      || /(?:[,;]|\b(?:and|then|through|around|in|to|visit|visiting))\s*$/i.test(prefix);
    if (!introducedAsStandalonePhrase) continue;
    if (intersectsKnownRange(start, end)) continue;
    candidates.push({ sourceText, start, end, reviewOnly: true, forcedRole: "preferred" });
  }
  for (const match of prompt.matchAll(EXPLICIT_ORIGIN_CANDIDATE)) {
    const captured = match[1];
    const relativeStart = match[0].lastIndexOf(captured);
    const start = (match.index ?? 0) + Math.max(0, relativeStart);
    const capturedEnd = start + captured.length;
    const nextKnownStart = occupied.map((range) => range.start).filter((value) => value >= start && value < capturedEnd).sort((left, right) => left - right)[0];
    const end = nextKnownStart ?? capturedEnd;
    const sourceText = prompt.slice(start, end).trim().replace(/\s+(?:to|through|via|for)$/i, "");
    if (!sourceText || occupied.some((range) => range.start < start + sourceText.length && range.end > start)) continue;
    const normalized = normalizePlacePhrase(sourceText);
    if (!normalized || normalized.split(" ").some((word) => NON_PLACE_PHRASES.has(word))) continue;
    candidates.push({ sourceText, start, end: start + sourceText.length, reviewOnly: true, forcedRole: "origin" });
  }
  for (const match of prompt.matchAll(UNKNOWN_CANDIDATE)) {
    const sourceText = match[0].trim();
    const start = match.index ?? 0;
    const end = start + sourceText.length;
    if (intersectsKnownRange(start, end)) continue;
    const normalized = normalizePlacePhrase(sourceText).replace(/^the /, "");
    if (!normalized || NON_PLACE_PHRASES.has(normalized) || ["begin", "by", "drive", "take", "travel"].includes(normalized.split(" ")[0] ?? "")
      || [...NON_PLACE_PHRASES].some((word) => normalized === `${word} trip`)) continue;
    if (/^\d|\b(?:day|days|week|weeks|night|nights|traveller|travellers)\b/.test(normalized)) continue;
    candidates.push({ sourceText, start, end, fuzzy: fuzzyMatchFor(normalized) });
  }
  for (const match of prompt.matchAll(LOWERCASE_TYPO_CANDIDATE)) {
    const sourceText = match[0].trim();
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (intersectsKnownRange(start, end)) continue;
    const normalized = normalizePlacePhrase(sourceText);
    if (!normalized || NON_PLACE_PHRASES.has(normalized)) continue;
    const fuzzy = fuzzyMatchFor(normalized, 4);
    // Lower-case prose is only retained when the curated catalogue gives one
    // safe spelling correction; arbitrary conversational words stay non-geographic.
    if (fuzzy) candidates.push({ sourceText, start, end, fuzzy });
  }
  // In a comma/semicolon list containing multiple known places, retain a
  // compact unknown list item for review instead of silently deleting it.
  // This does not resolve, fuzzy-match or make the phrase routable.
  if (occupied.length >= 2) for (const match of prompt.matchAll(DELIMITED_UNKNOWN_CANDIDATE)) {
    const sourceText = match[1].trim();
    const relativeStart = match[0].indexOf(match[1]);
    const start = (match.index ?? 0) + Math.max(0, relativeStart);
    const end = start + match[1].length;
    if (intersectsKnownRange(start, end)) continue;
    const normalized = normalizePlacePhrase(sourceText);
    const words = normalized.split(" ");
    if (!normalized || words.some((word) => NON_PLACE_PHRASES.has(word))) continue;
    if (/\b(?:day|days|week|weeks|wks?|night|nights|traveller|travellers|cheap|budget|affordable|museum|museums|somewhere|warm|cold|train|trains)\b/.test(normalized)) continue;
    candidates.push({ sourceText, start, end, reviewOnly: true, forcedRole: "preferred" });
  }
  return candidates;
}

const REGION_ROUTE_KEYS: Record<string, string[]> = {
  patagonia: ["patagonia-w-circuit"],
  "sacred-valley": ["inca-trail-sacred-valley"],
  "japanese-alps": ["japan-slow"],
  balkans: ["balkans-overland"],
};

function routeFamiliesForRegion(canonicalPlaceId: string) {
  return (REGION_ROUTE_KEYS[canonicalPlaceId] ?? [])
    .map((key) => routeFamilyByKey[key])
    .filter((route): route is RouteFamily => Boolean(route));
}

export function regionalBaseSuggestions(
  place: string | Pick<ResolvedPlaceMention, "mentionId" | "canonicalPlaceId">,
): RegionalBaseSuggestion[] {
  const canonicalPlaceId = typeof place === "string" ? place : place.canonicalPlaceId;
  if (!canonicalPlaceId) return [];
  const mentionId = typeof place === "string" ? undefined : place.mentionId;
  const seen = new Set<string>();
  const anchor = findCatalogPlaceById(canonicalPlaceId);
  const relatedPlanningIds = unique([canonicalPlaceId, ...(anchor?.parentRegionId ? [anchor.parentRegionId] : [])], (value) => value);
  const linkedLocality = anchor?.parentRegionId ? findCatalogPlaceById(anchor.parentRegionId) : undefined;
  const linkedBase = linkedLocality?.coordinates
    && linkedLocality.parentCountries[0]
    && (linkedLocality.placeType === "city" || linkedLocality.placeType === "town")
    ? [{
      mentionId,
      regionCanonicalPlaceId: canonicalPlaceId,
      canonicalPlaceId: linkedLocality.canonicalPlaceId,
      name: linkedLocality.canonicalName,
      country: linkedLocality.parentCountries[0],
      placeType: linkedLocality.placeType,
      coordinates: [...linkedLocality.coordinates] as [number, number],
      reason: `${linkedLocality.canonicalName} is the canonical routable locality linked to ${anchor?.canonicalName ?? canonicalPlaceId}.`,
      provenance: [{
        id: `morrovia-place-catalog:${linkedLocality.canonicalPlaceId}`,
        label: "Morrovia canonical anchor locality",
        kind: "canonical" as const,
        supports: "The anchor's reviewed parent identity is itself a directly routable locality.",
        reviewedAt: "2026-08-27",
      }],
    }]
    : [];
  const routeSuggestions = relatedPlanningIds.flatMap(routeFamiliesForRegion).flatMap((route) => route.stops.flatMap((stop) => {
    const key = `${normalizePlacePhrase(stop.name)}|${normalizePlacePhrase(stop.country)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const catalogPlace = matchCatalogPlace(stop.name);
    return [{
      mentionId,
      regionCanonicalPlaceId: canonicalPlaceId,
      canonicalPlaceId: catalogPlace?.canonicalPlaceId ?? `route-base:${slug(stop.country)}:${slug(stop.name)}`,
      name: stop.name,
      country: stop.country,
      placeType: catalogPlace?.placeType ?? "town",
      coordinates: [...stop.coordinates] as [number, number],
      reason: stop.reason,
      provenance: [{
        id: `route-catalog:${route.key}`,
        label: route.title,
        kind: "canonical" as const,
        supports: `Existing curated route family lists ${stop.name} as one supported base; it is not a universal recommendation.`,
        reviewedAt: route.reviewedAt,
      }],
    }];
  }));
  return unique([...linkedBase, ...routeSuggestions], (suggestion) => suggestion.canonicalPlaceId);
}

/** Guided choices for a recognised broad place. Every option comes from
 * canonical containment or an existing reviewed route family; this helper
 * never invents a locality or silently turns the parent area into a stop. */
export function guidedPlanningAreaSuggestions(
  mention: ResolvedPlaceMention,
  context: GuidedPlanningAreaContext = {},
): GuidedPlanningAreaSuggestion[] {
  const parentCountries = new Set(mention.parentCountries.map(normalizePlacePhrase));
  const parentName = normalizePlacePhrase(mention.canonicalName);
  const broadByCountry = mention.placeType === "continent" || mention.placeType === "country"
    || mention.placeType === "macro_region" || mention.parentCountries.length > 1;
  const anchorCountries = new Set((context.mentions ?? [])
    .filter((candidate) => candidate.mentionId !== mention.mentionId
      && (candidate.isAnchor || candidate.routability === "anchor_or_poi" || candidate.role === "anchor"
        || candidate.placeType === "natural_area" || candidate.placeType === "landmark"))
    .flatMap((candidate) => candidate.parentCountries)
    .map(normalizePlacePhrase)
    .filter((country) => !parentCountries.size || parentCountries.has(country)));
  const interests = new Set((context.interests ?? []).map(normalizePlacePhrase));

  const routeOptions = routeFamilies.flatMap((route) => {
    const routeCountries = route.countries.map(normalizePlacePhrase);
    const routeFits = mention.placeType === "country"
      ? routeCountries.includes(parentName)
      : broadByCountry && routeCountries.some((country) => parentCountries.has(country));
    if (!routeFits) return [];
    const interestScore = route.interests.filter((interest) => interests.has(normalizePlacePhrase(interest))).length * 8;
    return route.stops.flatMap((stop, stopIndex): Array<GuidedPlanningAreaSuggestion & { score: number }> => {
      const country = normalizePlacePhrase(stop.country);
      if (mention.placeType === "country" && country !== parentName) return [];
      if (mention.placeType !== "country" && parentCountries.size && !parentCountries.has(country)) return [];
      const anchorMatched = anchorCountries.has(country);
      const catalog = matchCatalogPlace(stop.name);
      return [{
        mentionId: mention.mentionId,
        regionCanonicalPlaceId: mention.canonicalPlaceId ?? `planning-area:${slug(mention.canonicalName)}`,
        canonicalPlaceId: catalog?.canonicalPlaceId ?? `route-base:${slug(stop.country)}:${slug(stop.name)}`,
        name: stop.name,
        country: stop.country,
        placeType: catalog?.placeType ?? "town",
        coordinates: [...stop.coordinates] as [number, number],
        reason: stop.reason,
        provenance: [{
          id: `route-catalog:${route.key}`,
          label: route.title,
          kind: "canonical" as const,
          supports: `This reviewed route family supports ${stop.name} as one possible route place within ${mention.canonicalName}; the traveller still chooses.`,
          reviewedAt: route.reviewedAt,
        }],
        routeFamilyKey: route.key,
        anchorMatched,
        score: (anchorMatched ? 100 : 0) + interestScore + Math.max(0, 12 - stopIndex),
      }];
    });
  });

  const canonicalOptions = PLACE_CATALOG.flatMap((entry): Array<GuidedPlanningAreaSuggestion & { score: number }> => {
    if (!entry.coordinates || !["city", "town", "transport_gateway"].includes(entry.placeType)) return [];
    const countries = entry.parentCountries.map(normalizePlacePhrase);
    const contained = mention.placeType === "country"
      ? countries.includes(parentName)
      : broadByCountry && countries.some((country) => parentCountries.has(country));
    if (!contained) return [];
    const country = entry.parentCountries[0];
    if (!country) return [];
    const anchorMatched = countries.some((value) => anchorCountries.has(value));
    return [{
      mentionId: mention.mentionId,
      regionCanonicalPlaceId: mention.canonicalPlaceId ?? `planning-area:${slug(mention.canonicalName)}`,
      canonicalPlaceId: entry.canonicalPlaceId,
      name: entry.canonicalName,
      country,
      placeType: entry.placeType,
      coordinates: [...entry.coordinates] as [number, number],
      reason: anchorMatched
        ? `In the same country as a specific place you asked to include.`
        : `A canonical route place within ${mention.canonicalName}.`,
      provenance: [{
        ...entry.provenance,
        kind: entry.provenance.kind === "curated" ? "curated_alias" as const : "canonical" as const,
      }],
      anchorMatched,
      score: anchorMatched ? 90 : 4,
    }];
  });

  const ranked = unique([
    ...regionalBaseSuggestions(mention).map((suggestion) => ({ ...suggestion, anchorMatched: false, score: 120 })),
    ...routeOptions,
    ...canonicalOptions,
  ].sort((left, right) => right.score - left.score), (suggestion) => suggestion.canonicalPlaceId);
  const anchorScoped = anchorCountries.size && ranked.some((suggestion) => suggestion.anchorMatched)
    ? ranked.filter((suggestion) => suggestion.anchorMatched)
    : ranked;
  return anchorScoped
    .slice(0, 6)
    .map(({ score: _score, ...suggestion }) => suggestion);
}

const routeInterestMatches = (route: RouteFamily, interests: readonly string[]) => {
  const aliases: Record<string, string[]> = {
    beach: ["coast"],
    culture: ["culture", "heritage"],
    nature: ["nature", "wildlife"],
  };
  return interests.filter((interest) => {
    const values = aliases[normalizePlacePhrase(interest)] ?? [normalizePlacePhrase(interest)];
    return route.interests.some((routeInterest) => values.includes(normalizePlacePhrase(routeInterest)));
  }).filter((interest, index, all) => all.indexOf(interest) === index);
};

const planningAreaAnchorMentions = (mention: ResolvedPlaceMention, mentions: readonly ResolvedPlaceMention[]) => {
  const parentCountries = new Set(mention.parentCountries.map(normalizePlacePhrase));
  return mentions.filter((candidate) => candidate.mentionId !== mention.mentionId
    && (candidate.isAnchor || candidate.routability === "anchor_or_poi" || candidate.role === "anchor"
      || candidate.placeType === "natural_area" || candidate.placeType === "landmark")
    && candidate.parentCountries.some((country) => !parentCountries.size || parentCountries.has(normalizePlacePhrase(country))));
};

const routeMatchesAnchorText = (route: RouteFamily, anchor: ResolvedPlaceMention) => {
  const routeText = normalizePlacePhrase([
    route.title,
    route.bestFor,
    ...route.bases,
    ...route.stops.map((stop) => stop.name),
    ...(route.highlights ?? []),
  ].join(" "));
  const anchorLabels = unique([
    anchor.sourceText,
    anchor.canonicalName,
    ...anchor.sourceTexts,
    ...anchor.aliases,
  ].map(normalizePlacePhrase).filter((label) => label.length >= 4), (label) => label);
  const genericAnchorWords = new Set(["area", "island", "mountain", "national", "park", "region", "river"]);
  return anchorLabels.some((label) => routeText.includes(label)
    || label.split(" ").some((token) => token.length >= 6 && !genericAnchorWords.has(token) && routeText.includes(token)));
};

/** A small, review-only route direction derived from an existing editorial
 * route family. It proposes canonical places but never mutates the trip or
 * marks the parent area complete. */
export function guidedPlanningAreaShapes(
  mention: ResolvedPlaceMention,
  context: GuidedPlanningAreaContext = {},
): GuidedPlanningAreaShape[] {
  if (!placeMentionSupportsMultipleSelections(mention)) return [];
  const parentCountries = new Set(mention.parentCountries.map(normalizePlacePhrase));
  const parentName = normalizePlacePhrase(mention.canonicalName);
  const anchors = planningAreaAnchorMentions(mention, context.mentions ?? []);
  const anchorCountries = new Set(anchors.flatMap((anchor) => anchor.parentCountries).map(normalizePlacePhrase));
  const interests = context.interests ?? [];

  const candidates = routeFamilies.flatMap((route) => {
    if (!route.reviewedAt) return [];
    const routeCountries = route.countries.map(normalizePlacePhrase);
    const routeFits = mention.placeType === "country"
      ? routeCountries.includes(parentName)
      : routeCountries.some((country) => parentCountries.has(country));
    if (!routeFits) return [];
    const containedStops = route.stops.filter((stop) => mention.placeType === "country"
      ? normalizePlacePhrase(stop.country) === parentName
      : !parentCountries.size || parentCountries.has(normalizePlacePhrase(stop.country)));
    if (containedStops.length < 2) return [];
    const exactAnchor = anchors.find((anchor) => routeMatchesAnchorText(route, anchor));
    const countryAnchor = exactAnchor ? undefined : anchors.find((anchor) => anchor.parentCountries
      .some((country) => routeCountries.includes(normalizePlacePhrase(country))));
    const matchedInterests = routeInterestMatches(route, interests);
    const limit = context.pace === "relaxed" || (context.durationDays !== undefined && context.durationDays <= 8)
      ? 2
      : Math.min(4, containedStops.length);
    const places = containedStops.slice(0, limit).map((stop): GuidedPlanningAreaSuggestion => {
      const catalog = matchCatalogPlace(stop.name);
      return {
        mentionId: mention.mentionId,
        regionCanonicalPlaceId: mention.canonicalPlaceId ?? `planning-area:${slug(mention.canonicalName)}`,
        canonicalPlaceId: catalog?.canonicalPlaceId ?? `route-base:${slug(stop.country)}:${slug(stop.name)}`,
        name: stop.name,
        country: stop.country,
        placeType: catalog?.placeType ?? "town",
        coordinates: [...stop.coordinates] as [number, number],
        reason: stop.reason,
        provenance: [{
          id: `route-catalog:${route.key}`,
          label: route.title,
          kind: "canonical",
          supports: `This reviewed route family supports ${stop.name} as one possible route place within ${mention.canonicalName}; the traveller still chooses.`,
          reviewedAt: route.reviewedAt,
        }],
        routeFamilyKey: route.key,
        anchorMatched: Boolean(exactAnchor || countryAnchor),
      };
    });
    const reason = exactAnchor
      ? `Responds to your ${exactAnchor.sourceText} request using reviewed route knowledge.`
      : matchedInterests.length
        ? `Good match for ${matchedInterests.map((interest) => interest.charAt(0).toUpperCase() + interest.slice(1)).join(" + ")}.`
        : context.pace === "relaxed" && places.length === 2
          ? "Fewer bases for a slower trip."
          : context.durationDays !== undefined
            && context.durationDays >= route.suggestedDays.min
            && context.durationDays <= route.suggestedDays.max
            ? "Reviewed for a trip around this length."
            : route.bestFor;
    const score = (exactAnchor ? 300 : countryAnchor ? 180 : 0)
      + matchedInterests.length * 20
      + (context.durationDays !== undefined
        && context.durationDays >= route.suggestedDays.min
        && context.durationDays <= route.suggestedDays.max ? 8 : 0)
      + (context.pace === "relaxed" && places.length === 2 ? 5 : 0)
      + (route.confidence === "high" ? 2 : route.confidence === "medium" ? 1 : 0);
    const containsWholeRoute = places.length === route.stops.length;
    return [{
      id: `route-shape:${mention.mentionId}:${route.key}`,
      mentionId: mention.mentionId,
      routeFamilyKey: route.key,
      title: containsWholeRoute ? route.title : places.map((place) => place.name).join(" + "),
      placeSummary: containsWholeRoute
        ? places.map((place) => place.name).join(" + ")
        : route.interests.slice(0, 3).map((interest) => interest.charAt(0).toUpperCase() + interest.slice(1)).join(" · "),
      reason,
      places,
      matchedInterestIds: matchedInterests,
      anchorMentionId: exactAnchor?.mentionId ?? countryAnchor?.mentionId,
      reviewedAt: route.reviewedAt,
      score,
      exactAnchor: Boolean(exactAnchor),
      countryAnchor: Boolean(countryAnchor),
    }];
  });

  const anchorScoped = anchors.length
    ? candidates.some((candidate) => candidate.exactAnchor)
      ? candidates.filter((candidate) => candidate.exactAnchor)
      : candidates.filter((candidate) => candidate.countryAnchor)
    : candidates;
  return unique(anchorScoped.sort((left, right) => right.score - left.score), (shape) => shape.places
    .map((place) => place.canonicalPlaceId).join("|"))
    .slice(0, 3)
    .map(({ score: _score, exactAnchor: _exactAnchor, countryAnchor: _countryAnchor, ...shape }) => shape);
}

function issueOptionsForMention(mention: ResolvedPlaceMention): PlaceIssueOption[] {
  if (mention.status === "ambiguous") return mention.candidates.map((candidate) => ({
    kind: "candidate",
    canonicalPlaceId: candidate.canonicalPlaceId,
    label: candidate.canonicalName,
    country: candidate.parentCountries.length === 1 ? candidate.parentCountries[0] : undefined,
    region: candidate.parentRegionId,
    placeType: candidate.placeType,
    coordinates: candidate.coordinates,
    provenance: candidate.provenance,
  }));
  return regionalBaseSuggestions(mention).map((suggestion) => ({
    kind: "base",
    canonicalPlaceId: suggestion.canonicalPlaceId,
    label: suggestion.name,
    country: suggestion.country,
    placeType: suggestion.placeType,
    coordinates: suggestion.coordinates,
    provenance: suggestion.provenance,
  }));
}

function blockingRole(role: PlaceMentionRole) {
  return role !== "optional" && role !== "excluded";
}

function issuesForMentions(mentions: ResolvedPlaceMention[]) {
  const issues: PlaceResolutionIssue[] = [];
  for (const mention of mentions) {
    const blocksRoute = blockingRole(mention.role);
    const countryQualifiedByDirectPlace = mention.placeType === "country"
      && mentions.some((candidate) => candidate.mentionId !== mention.mentionId
        && candidate.role !== "excluded"
        && candidate.routability === "direct_destination"
        && candidate.parentCountries.some((country) => normalizePlacePhrase(country) === normalizePlacePhrase(mention.canonicalName)));
    if (mention.status === "ambiguous") {
      issues.push({
        code: "ambiguous_place", mentionId: mention.mentionId, sourceText: mention.sourceText,
        reason: "More than one supported geographic identity matches this phrase.",
        message: `Confirm which ${mention.sourceText} you mean.`, severity: blocksRoute ? "error" : "warning", blocksRoute,
        options: issueOptionsForMention(mention), provenance: mention.provenance, confidence: mention.confidence,
      });
    } else if (mention.status === "unresolved") {
      issues.push({
        code: "unresolved_place", mentionId: mention.mentionId, sourceText: mention.sourceText,
        reason: "The phrase was preserved but does not yet have a supported geographic identity.",
        message: `Confirm ${mention.sourceText} before Morrovia uses it in the route.`, severity: blocksRoute ? "error" : "warning", blocksRoute,
        options: [], provenance: mention.provenance, confidence: mention.confidence,
      });
    } else if (!countryQualifiedByDirectPlace && (mention.requiresBaseSelection || (mention.routability === "anchor_or_poi"
      && !mentions.some((candidate) => candidate !== mention
        && candidate.routability === "direct_destination"
        && (candidate.canonicalPlaceId === mention.parentRegionId
          || (mention.accessPlaceName && normalizePlacePhrase(candidate.canonicalName) === normalizePlacePhrase(mention.accessPlaceName)))))) && mention.role !== "excluded") {
      issues.push({
        code: "region_requires_base", mentionId: mention.mentionId, canonicalPlaceId: mention.canonicalPlaceId, sourceText: mention.sourceText,
        reason: "This is valid planning geography, but no overnight base or route endpoint has been selected.",
        message: mention.placeType === "country"
          ? `Which part of ${mention.sourceText} should Morrovia plan around?`
          : mention.routability === "anchor_or_poi"
            ? `Keep ${mention.sourceText} as the trip anchor and choose a nearby base.`
            : `Where would you like to stay around ${mention.sourceText}?`,
        severity: blocksRoute ? "error" : "warning", blocksRoute, options: issueOptionsForMention(mention),
        provenance: mention.provenance, confidence: mention.confidence,
      });
    }
    if (mention.sourceTexts.length > 1) {
      issues.push({
        code: "duplicate_alias", mentionId: mention.mentionId, canonicalPlaceId: mention.canonicalPlaceId, sourceText: mention.sourceText,
        reason: "Multiple explicit labels refer to the same canonical place identity.",
        message: `${mention.sourceTexts.join(" and ")} are retained as one place identity.`, severity: "info", blocksRoute: false,
        options: [], provenance: mention.provenance, confidence: mention.confidence,
      });
    }
  }
  const active = mentions.filter((mention) => mention.role !== "excluded");
  const routeRequired = active.filter((mention) => blockingRole(mention.role));
  if (routeRequired.length && !active.some((mention) => mention.status === "resolved" && mention.directlyRoutable)) {
    const first = active[0];
    issues.push({
      code: "missing_routable_destination", mentionId: first.mentionId, canonicalPlaceId: first.canonicalPlaceId, sourceText: first.sourceText,
      reason: "The traveller's geography is preserved, but no confirmed route stop exists yet.",
      message: "Add or choose at least one concrete base before Morrovia builds the route.", severity: "error", blocksRoute: true,
      options: issueOptionsForMention(first), provenance: first.provenance, confidence: first.confidence,
    });
  }
  return unique(issues, (issue) => `${issue.code}|${issue.mentionId}`);
}

function resultIssuesForMentions(mentions: ResolvedPlaceMention[]) {
  const issues = issuesForMentions(mentions);
  for (const mention of mentions) {
    if (!mention.provenance.some((source) => source.id.startsWith("role-conflict:"))) continue;
    issues.push({
      code: "conflicting_place_roles", mentionId: mention.mentionId, canonicalPlaceId: mention.canonicalPlaceId, sourceText: mention.sourceText,
      reason: "The same canonical place is both included and excluded.", message: `Confirm whether ${mention.canonicalName} belongs in the trip.`,
      severity: "error", blocksRoute: true, options: [], provenance: mention.provenance, confidence: mention.confidence,
    });
  }
  return unique(issues, (issue) => `${issue.code}|${issue.mentionId}`);
}

/** Re-evaluate canonical place issues after a durable relationship is removed.
 * This uses the preserved mention inventory; it does not reinterpret prose. */
export function placeResolutionIssuesForMentions(mentions: readonly ResolvedPlaceMention[]) {
  return resultIssuesForMentions([...mentions]);
}

/**
 * Promote an explicit Builder identity choice into the same planning-area
 * mention and issue model used by natural-language capture. This records a
 * valid requested geography; it deliberately does not invent a route stop.
 */
export function appendSelectedPlanningAreaMention(
  result: PlaceIntelligenceResult,
  suggestion: CanonicalPlaceSuggestion,
  role: PlaceMentionRole = "preferred",
) {
  const existing = result.mentions.find((mention) => mention.canonicalPlaceId === suggestion.canonicalPlaceId
    && mention.role === role);
  if (existing) return { result, mention: existing };
  const builderSource: PlaceProvenance = {
    id: `builder:planning-area:${suggestion.canonicalPlaceId}`,
    label: "Traveller builder selection",
    kind: "builder",
    supports: "The traveller explicitly selected this planning geography in the Builder.",
  };
  const routability = suggestion.routability === "needs_base_selection" || suggestion.routability === "anchor_or_poi"
    ? suggestion.routability
    : "planning_area";
  const mention = candidateToMention({
    canonicalPlaceId: suggestion.canonicalPlaceId,
    canonicalName: suggestion.name,
    aliases: [],
    placeType: suggestion.placeType,
    parentCountries: suggestion.country ? [suggestion.country] : [],
    parentRegionId: suggestion.region,
    bounds: suggestion.bounds,
    coordinates: suggestion.coordinates,
    routability,
    confidence: createPlanningConfidence({
      state: "structured",
      level: "high",
      freshness: "current",
      scope: "traveller-intent",
      sources: [{ id: builderSource.id, label: builderSource.label, kind: "traveller", supports: builderSource.supports }],
      reason: "The traveller explicitly selected this geographic identity.",
    }),
    provenance: [builderSource, ...suggestion.provenance],
  }, {
    sourceText: suggestion.name,
    order: result.mentions.length,
    role,
  });
  const mentions = [...result.mentions, mention];
  return {
    result: { ...result, mentions, issues: resultIssuesForMentions(mentions) },
    mention,
  };
}

function buildDeterministicMentions(prompt: string, context: PlaceResolutionContext) {
  const rawMatches = rawCatalogMatches(prompt);
  const promptIds = new Set(rawMatches.map((match) => match.entry.canonicalPlaceId));
  const groups = new Map<string, RawCatalogMatch[]>();
  rawMatches.forEach((match) => {
    const key = `${match.start}:${match.end}:${normalizePlacePhrase(match.sourceText)}`;
    groups.set(key, [...(groups.get(key) ?? []), match]);
  });
  const resolved: Array<ResolvedPlaceMention & { _start: number; _end: number; _roles: PlaceMentionRole[] }> = [];
  for (const matches of groups.values()) {
    const first = matches[0];
    const entries = unique(matches.map((match) => match.entry), (entry) => entry.canonicalPlaceId);
    const chosen = contextChoice(entries, promptIds, context);
    const role = roleAt(prompt, first.sourceText, first.start, chosen?.placeType ?? entries[0]?.placeType ?? "unknown");
    if (!chosen && entries.length > 1) {
      const candidates = entries.map((entry) => catalogCandidate(entry, sourceFromCatalog(entry, first.alias)));
      const provenance: PlaceProvenance[] = [{ id: `ambiguity:${slug(first.sourceText)}`, label: "Morrovia ambiguity guard", kind: "context", supports: "The catalog contains more than one credible identity for this exact phrase." }];
      resolved.push({
        mentionId: `place-ambiguous-${slug(first.sourceText)}-${first.start}`,
        sourceText: first.sourceText, sourceTexts: [first.sourceText], normalizedPhrase: normalizePlacePhrase(first.sourceText),
        canonicalName: first.sourceText, aliases: [], placeType: "unknown", status: "ambiguous",
        confidence: unknownPlanningConfidence("This place phrase needs contextual confirmation."), provenance,
        parentCountries: [], routability: "non_routable_reference", directlyRoutable: false, requiresBaseSelection: false,
        isAnchor: false, role, order: 0, candidates, _start: first.start, _end: first.end, _roles: [role],
      });
      continue;
    }
    const entry = chosen ?? entries[0];
    if (!entry) continue;
    const match = matches.find((item) => item.entry.canonicalPlaceId === entry.canonicalPlaceId) ?? first;
    const source = sourceFromCatalog(entry, match.alias);
    const mention = candidateToMention(catalogCandidate(entry, source, Boolean(chosen && entries.length > 1)), {
      sourceText: first.sourceText, order: 0, role,
    });
    resolved.push({ ...mention, _start: first.start, _end: first.end, _roles: [role] });
  }

  const occupied = resolved.map((mention) => ({ start: mention._start, end: mention._end }));
  for (const candidate of unresolvedCandidates(prompt, occupied)) {
    const savedSelection = (context.selectedPlaces ?? []).find((place) => normalizePlacePhrase(place.canonicalName) === normalizePlacePhrase(candidate.sourceText));
    const role = candidate.forcedRole ?? (candidate.reviewOnly
      ? "anchor"
      : roleAt(prompt, candidate.sourceText, candidate.start, savedSelection?.placeType ?? candidate.fuzzy?.placeType ?? "unknown"));
    if (savedSelection) {
      const source: PlaceProvenance = {
        id: `builder-context:${savedSelection.canonicalPlaceId}`,
        label: "Saved traveller place selection",
        kind: "builder",
        supports: "The phrase exactly matches a canonical place identity the traveller already selected.",
      };
      const mention = candidateToMention({
        canonicalPlaceId: savedSelection.canonicalPlaceId,
        canonicalName: savedSelection.canonicalName,
        aliases: [],
        placeType: savedSelection.placeType,
        parentCountries: [...savedSelection.parentCountries],
        routability: savedSelection.routability,
        confidence: createPlanningConfidence({
          state: "structured", level: "high", freshness: "current", scope: "traveller-intent",
          sources: [{ id: source.id, label: source.label, kind: "traveller", supports: source.supports }],
          reason: "The phrase matches the traveller's existing canonical place selection.",
        }),
        provenance: [source],
      }, { sourceText: candidate.sourceText, order: 0, role });
      resolved.push({ ...mention, _start: candidate.start, _end: candidate.end, _roles: [role] });
    } else if (candidate.fuzzy) {
      const source: PlaceProvenance = {
        id: `fuzzy:${candidate.fuzzy.canonicalPlaceId}`, label: "Morrovia safe spelling match", kind: "context",
        supports: "A single curated place identity is one edit away from this complete candidate phrase.", reviewedAt: candidate.fuzzy.provenance.reviewedAt,
      };
      const mention = candidateToMention(catalogCandidate(candidate.fuzzy, source, true), {
        sourceText: candidate.sourceText, order: 0, role, status: "partially_resolved",
      });
      resolved.push({ ...mention, _start: candidate.start, _end: candidate.end, _roles: [role] });
    } else {
      const provenance: PlaceProvenance[] = [{ id: `unresolved:${slug(candidate.sourceText)}`, label: "Traveller phrase", kind: "unresolved", supports: "The exact phrase was retained without claiming a geographic identity." }];
      const broad = broadIntentShape(candidate.sourceText);
      resolved.push({
        mentionId: `place-unresolved-${slug(candidate.sourceText)}-${candidate.start}`,
        sourceText: candidate.sourceText, sourceTexts: [candidate.sourceText], normalizedPhrase: normalizePlacePhrase(candidate.sourceText),
        canonicalName: candidate.sourceText, aliases: [], placeType: broad.placeType, status: "unresolved",
        confidence: unknownPlanningConfidence("Morrovia retained this possible place phrase but could not resolve it."), provenance,
        parentCountries: [], routability: broad.routability, directlyRoutable: false, requiresBaseSelection: broad.requiresBaseSelection,
        isAnchor: broad.isAnchor, role, order: 0, candidates: [], _start: candidate.start, _end: candidate.end, _roles: [role],
      });
    }
  }

  const sorted = resolved.sort((left, right) => left._start - right._start || right._end - left._end);
  const deduped: typeof sorted = [];
  for (const mention of sorted) {
    const existing = mention.canonicalPlaceId
      ? deduped.find((item) => item.canonicalPlaceId === mention.canonicalPlaceId)
      : undefined;
    if (!existing) {
      deduped.push(mention);
      continue;
    }
    const overlaps = existing._start < mention._end && existing._end > mention._start;
    if (!overlaps) existing.sourceTexts = [...existing.sourceTexts, mention.sourceText];
    if (!overlaps) existing._roles.push(mention.role);
    if (existing.role === "preferred" && mention.role !== "preferred") existing.role = mention.role;
  }
  return deduped.map((mention, order) => {
    const { _start, _end, _roles, ...publicMention } = mention;
    if (new Set(_roles).has("excluded") && _roles.some((role) => role === "required" || role === "preferred" || role === "anchor")) {
      publicMention.provenance = [...publicMention.provenance, { id: `role-conflict:${publicMention.mentionId}`, label: "Morrovia role guard", kind: "context", supports: "The same canonical place was both included and excluded." }];
    }
    return { ...publicMention, order };
  });
}

export function resolvePlaceMentions(prompt: string, context: PlaceResolutionContext = {}): PlaceIntelligenceResult {
  const mentions = buildDeterministicMentions(prompt.trim(), context);
  return {
    version: PLACE_INTELLIGENCE_VERSION,
    parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION,
    sequenceKind: ORDER_LANGUAGE.test(prompt) ? "ordered" : "unordered",
    mentions,
    issues: resultIssuesForMentions(mentions),
  };
}

function unresolvedExplicitMention(input: ExplicitPlaceMention, order: number): ResolvedPlaceMention {
  const provenance: PlaceProvenance[] = [{
    id: `unresolved:${slug(input.sourceText)}`,
    label: "Traveller phrase",
    kind: "unresolved",
    supports: "The exact semantic place mention was retained without claiming a geographic identity.",
  }];
  const broad = broadIntentShape(input.sourceText);
  return {
    mentionId: `place-unresolved-${slug(input.sourceText)}-${order}`,
    sourceText: input.sourceText,
    sourceTexts: [input.sourceText],
    normalizedPhrase: normalizePlacePhrase(input.sourceText),
    canonicalName: input.sourceText,
    aliases: [],
    placeType: broad.placeType,
    status: "unresolved",
    confidence: unknownPlanningConfidence("Morrovia retained this semantic place mention but could not resolve it."),
    provenance,
    parentCountries: [],
    routability: broad.routability,
    directlyRoutable: false,
    requiresBaseSelection: broad.requiresBaseSelection,
    isAnchor: broad.isAnchor,
    role: input.role,
    order,
    candidates: [],
  };
}

/** Resolve only phrases already classified as geography by semantic extraction. */
export function resolveExplicitPlaceMentions(
  inputs: ExplicitPlaceMention[],
  context: PlaceResolutionContext = {},
): PlaceIntelligenceResult {
  const synthetic = inputs.map((input) => input.sourceText.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase())).join(", ");
  const deterministic = resolvePlaceMentions(synthetic, context);
  const available = [...deterministic.mentions];
  const mentions = inputs.map((input, order) => {
    const normalized = normalizePlacePhrase(input.sourceText);
    const index = available.findIndex((mention) => mention.normalizedPhrase === normalized
      || normalizePlacePhrase(mention.canonicalName) === normalized
      || mention.aliases.some((alias) => normalizePlacePhrase(alias) === normalized));
    const matched = index >= 0 ? available.splice(index, 1)[0] : undefined;
    if (!matched) return unresolvedExplicitMention(input, order);
    return {
      ...matched,
      sourceText: input.sourceText,
      sourceTexts: [input.sourceText],
      normalizedPhrase: normalized,
      role: input.role,
      order,
    };
  });
  return {
    ...deterministic,
    sequenceKind: "ordered",
    mentions,
    issues: resultIssuesForMentions(mentions),
  };
}

function providerCandidate(
  candidate: PlaceProviderCandidate,
  provider: PlaceIntelligenceProvider,
): PlaceResolutionCandidate & Pick<PlaceProviderCandidate, "matchQuality" | "rankScore" | "geographicSignificance"> {
  const source: PlaceProvenance = {
    id: candidate.providerSourceId ? candidate.providerId : `${provider.id}:${candidate.providerId}`,
    label: candidate.providerSourceLabel ?? provider.label,
    kind: "provider",
    supports: candidate.normalizationReason
      ? `Provider result normalized as a Morrovia travel entity: ${candidate.normalizationReason}`
      : "Provider result mapped into Morrovia's compact place taxonomy; no arbitrary provider payload is retained.",
  };
  return {
    canonicalPlaceId: `${provider.id}:${candidate.providerId}`,
    canonicalName: candidate.canonicalName,
    aliases: [...(candidate.aliases ?? [])],
    placeType: candidate.placeType,
    parentCountries: [...(candidate.parentCountries ?? [])],
    parentRegionId: candidate.parentRegionId,
    accessPlaceName: candidate.accessPlaceName,
    bounds: candidate.bounds,
    coordinates: validPlaceCoordinates(candidate.coordinates) ? [...candidate.coordinates] as [number, number] : undefined,
    routability: candidate.routability ?? (candidate.placeType === "city" || candidate.placeType === "town" ? "direct_destination" : "planning_area"),
    confidence: inferredConfidence(source, "A provider supplied a typed candidate for an otherwise unresolved phrase."),
    provenance: [source],
    ...(candidate.matchQuality ? { matchQuality: candidate.matchQuality } : {}),
    ...(candidate.rankScore !== undefined ? { rankScore: candidate.rankScore } : {}),
    ...(candidate.geographicSignificance !== undefined ? { geographicSignificance: candidate.geographicSignificance } : {}),
  };
}

function compatibleCoordinatePlaceType(canonical: PlaceType, provider: PlaceType) {
  if (canonical === provider) return true;
  return (canonical === "city" || canonical === "town") && (provider === "city" || provider === "town");
}

function providerCoordinatesMatchCanonicalIdentity(
  mention: ResolvedPlaceMention,
  candidate: PlaceResolutionCandidate & Pick<PlaceProviderCandidate, "matchQuality" | "rankScore">,
) {
  if (!candidate.coordinates || !validPlaceCoordinates(candidate.coordinates) || !coordinatesWithinBounds(candidate.coordinates, mention.bounds)) return false;
  if (!compatibleCoordinatePlaceType(mention.placeType, candidate.placeType)) return false;
  const canonicalLabels = new Set([mention.canonicalName, ...mention.aliases, ...mention.sourceTexts].map(normalizePlacePhrase));
  const providerLabels = [candidate.canonicalName, ...candidate.aliases].map(normalizePlacePhrase);
  if (!providerLabels.some((label) => canonicalLabels.has(label))) return false;
  if (mention.parentCountries.length) {
    const countries = new Set(mention.parentCountries.map(normalizePlacePhrase));
    if (!candidate.parentCountries.some((country) => countries.has(normalizePlacePhrase(country)))) return false;
  }
  return canonicalPlaceFactsMatch(mention.canonicalPlaceId ?? "", {
    country: candidate.parentCountries[0],
    coordinates: candidate.coordinates,
  });
}

/** Add coordinates to an already trusted identity without accepting provider
 * names, types, containment or routability as replacements for canonical data. */
function enrichCanonicalMentionCoordinates(
  mention: ResolvedPlaceMention,
  candidates: Array<PlaceResolutionCandidate & Pick<PlaceProviderCandidate, "matchQuality" | "rankScore">>,
) {
  if (mention.coordinates || mention.status !== "resolved" || !mention.canonicalPlaceId) return mention;
  const compatible = candidates.filter((candidate) => providerCoordinatesMatchCanonicalIdentity(mention, candidate));
  if (!compatible.length) return mention;
  if (compatible.some((candidate, index) => compatible.slice(index + 1)
    .some((other) => coordinateDistanceKm(candidate.coordinates!, other.coordinates!) > 50))) return mention;
  const selected = [...compatible].sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0))[0];
  if (!selected?.coordinates) return mention;
  const coordinateSources = compatible.flatMap((candidate) => candidate.provenance.map((source): PlaceProvenance => ({
    ...source,
    id: `${source.id}:coordinates:${mention.canonicalPlaceId}`,
    supports: `Validated coordinates for the existing ${mention.canonicalName} identity; canonical name, type and containment remain unchanged.`,
  })));
  return {
    ...mention,
    coordinates: [...selected.coordinates] as [number, number],
    provenance: unique([...mention.provenance, ...coordinateSources], (source) => source.id),
  };
}

function sharedCandidateCountries(candidates: PlaceResolutionCandidate[]) {
  if (!candidates.length || candidates.some((candidate) => candidate.parentCountries.length === 0)) return [];
  const first = candidates[0]!.parentCountries;
  return first.filter((country) => candidates.every((candidate) => candidate.parentCountries
    .some((other) => normalizePlacePhrase(other) === normalizePlacePhrase(country))));
}

/** Provider results may clarify the scope or supply real bases for a generic
 * regional phrase, but cannot replace that phrase with one concrete stop. */
function retainBroadPlanningIntent(
  mention: ResolvedPlaceMention,
  candidates: PlaceResolutionCandidate[],
) {
  const broad = !mention.canonicalPlaceId ? broadPlanningIntentForPhrase(mention.sourceText) : undefined;
  if (!broad) return undefined;
  if (!candidates.length) return mention;
  const countries = sharedCandidateCountries(candidates);
  const guard: PlaceProvenance = {
    id: `broad-intent:${slug(mention.sourceText)}`,
    label: "Morrovia broad-place guard",
    kind: "context",
    supports: "Provider results are clarification candidates only; the traveller's regional wording has not been replaced by a city or base.",
  };
  return {
    ...mention,
    canonicalName: mention.sourceText,
    placeType: broad.placeType,
    status: "ambiguous" as const,
    confidence: unknownPlanningConfidence("This broad geographic intent needs a specific area or overnight base before routing."),
    provenance: unique([...mention.provenance, guard], (source) => source.id),
    parentCountries: countries,
    routability: broad.routability,
    directlyRoutable: false,
    requiresBaseSelection: true,
    isAnchor: true,
    candidates,
  };
}

function decisiveProviderCandidate(
  candidates: PlaceResolutionCandidate[],
  phrase: string,
  context: PlaceResolutionContext,
) {
  const ranked = [...candidates].sort((left, right) => {
    const leftScore = (left as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0;
    const rightScore = (right as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0;
    return rightScore - leftScore;
  });
  if (ranked.length === 1) return ranked[0];
  const normalized = normalizePlacePhrase(phrase);
  const exact = ranked.filter((candidate) => {
    const quality = (candidate as PlaceResolutionCandidate & { matchQuality?: PlaceProviderCandidate["matchQuality"] }).matchQuality;
    return quality === "exact" || (!quality && [candidate.canonicalName, ...candidate.aliases]
      .some((label) => normalizePlacePhrase(label) === normalized));
  });
  const intentCompatible = (candidate: PlaceResolutionCandidate) => context.travelIntent === "route-stop"
    ? candidate.routability === "direct_destination"
    : context.travelIntent === "anchor"
      ? candidate.routability === "anchor_or_poi" || candidate.routability === "needs_base_selection"
      : context.travelIntent === "planning-area"
        ? candidate.routability === "planning_area" || candidate.routability === "needs_base_selection"
        : true;
  const exactForIntent = exact.filter(intentCompatible);
  const exactRouteDestinations = ranked.filter((candidate) => candidate.routability === "direct_destination"
    && (exact.includes(candidate) || normalizePlacePhrase(candidate.canonicalName).startsWith(`${normalized} `)));
  const exactSameNameRoutes = exactRouteDestinations.filter((candidate) => normalizePlacePhrase(candidate.canonicalName) === normalized);
  const exactBroadGeographies = exact.filter((candidate) => (candidate.routability === "planning_area" || candidate.routability === "needs_base_selection")
    && ["continent", "country", "region", "sub_region", "island", "coast", "natural_area"].includes(candidate.placeType));
  const contextCountries = new Set((context.countryNames ?? []).map(normalizePlacePhrase));
  const exactContextualForIntent = exactForIntent.filter((candidate) => candidate.parentCountries
    .some((country) => contextCountries.has(normalizePlacePhrase(country))));
  const rankedExactContext = [...exactContextualForIntent].sort((left, right) => ((right as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)
    - ((left as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0));
  const contextualScoreLead = rankedExactContext.length > 1
    ? ((rankedExactContext[0] as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)
      - ((rankedExactContext[1] as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)
    : undefined;
  const hasDecisiveExactContext = rankedExactContext.length === 1 || (typeof contextualScoreLead === "number" && contextualScoreLead >= 12);
  const explicitCountries = new Set((context.explicitCountryNames ?? []).map(normalizePlacePhrase));
  const explicitPlaceTypes = new Set(context.explicitPlaceTypes ?? []);
  const rankedExplicitType = exact.filter((candidate) => explicitPlaceTypes.has(candidate.placeType))
    .sort((left, right) => ((right as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)
      - ((left as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0));
  const rankedExplicitContext = exact.filter((candidate) => candidate.parentCountries
    .some((country) => explicitCountries.has(normalizePlacePhrase(country))))
    .sort((left, right) => ((right as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)
      - ((left as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0));
  const coextensiveExactScope = exactRouteDestinations.length === 1 && exactBroadGeographies.length > 0
    && exactBroadGeographies.every((candidate) => {
    const routeCandidate = exactRouteDestinations[0];
    return Boolean(routeCandidate.coordinates && candidate.coordinates
      && routeCandidate.parentCountries.some((country) => candidate.parentCountries
        .some((candidateCountry) => normalizePlacePhrase(candidateCountry) === normalizePlacePhrase(country)))
      && coordinateDistanceKm(routeCandidate.coordinates, candidate.coordinates) <= 12);
  });
  const hasDistinctExactGeographicScope = exactRouteDestinations.length > 0 && exactBroadGeographies.length > 0 && !coextensiveExactScope;
  if (rankedExplicitType.length === 1
    || (rankedExplicitType.length > 1
      && (((rankedExplicitType[0] as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)
        - ((rankedExplicitType[1] as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)) >= 12)) {
    return rankedExplicitType[0];
  }
  if (rankedExplicitContext.length === 1
    || (rankedExplicitContext.length > 1
      && (((rankedExplicitContext[0] as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)
        - ((rankedExplicitContext[1] as PlaceResolutionCandidate & { rankScore?: number }).rankScore ?? 0)) >= 12)) {
    return rankedExplicitContext[0];
  }
  const recognizedExactGeographies = exactBroadGeographies.filter((candidate) => candidate.placeType === "continent" || candidate.placeType === "country"
    || ((candidate as PlaceResolutionCandidate & { geographicSignificance?: number }).geographicSignificance ?? 0) >= 0.72);
  // Entity identity precedes route-node suitability. A single provider-backed
  // major geography wins a bare exact name, while coextensive city-states keep
  // their direct endpoint and multiple major geographies still fail closed.
  if (!coextensiveExactScope && recognizedExactGeographies.length === 1) return recognizedExactGeographies[0];
  // Explicit anchor intent is meaningful disambiguating evidence: an exact
  // natural feature or POI should not lose to an exact same-name settlement.
  if (exactForIntent.length === 1 && (context.travelIntent === "anchor" || !hasDistinctExactGeographicScope)) return exactForIntent[0];

  // Trusted route coordinates are stronger evidence than a modest raw
  // provider-score advantage between exact same-name localities. Apply that
  // evidence before the score shortcut so a large/distant namesake cannot win
  // merely because the provider regards it as more globally important.
  const anchors = (context.selectedPlaces ?? []).flatMap((place) => place.coordinates ? [place.coordinates] : []);
  const contextualRoutePool = exactForIntent.filter((candidate) => intentCompatible(candidate)
    && candidate.coordinates
    && candidate.routability === "direct_destination");
  const proximityRanked = anchors.length ? contextualRoutePool
    .map((candidate) => ({
      candidate,
      distance: Math.min(...anchors.map((anchor) => coordinateDistanceKm(anchor, candidate.coordinates!))),
    }))
    .sort((left, right) => left.distance - right.distance) : [];
  const best = proximityRanked[0];
  const proximityNext = proximityRanked[1];
  if (best && best.distance <= 3_500
    && (!proximityNext || proximityNext.distance - best.distance >= 1_200 || proximityNext.distance >= best.distance * 1.75)) {
    return best.candidate;
  }

  // The adapter's bounded score may settle an alias-versus-admin lookalike
  // only when the direct locality has a clear lead.
  const scored = ranked.map((candidate) => ({
    candidate,
    score: (candidate as PlaceResolutionCandidate & { rankScore?: number }).rankScore,
    matchQuality: (candidate as PlaceResolutionCandidate & { matchQuality?: PlaceProviderCandidate["matchQuality"] }).matchQuality,
  }));
  const top = scored[0];
  const next = scored[1];
  if (context.travelIntent === "route-stop"
    && top?.candidate.routability === "direct_destination"
    && (top.matchQuality === "exact" || top.matchQuality === "alias")
    && typeof top.score === "number"
    && (!next || typeof next.score !== "number" || top.score - next.score >= 12)) return top.candidate;

  // A route-stop-shaped sentence is not evidence that an exact city/state,
  // city/country, or city/region namesake means the city. Likewise, proximity
  // alone cannot settle two genuinely distinct exact same-name localities.
  // A provider-owned score may still settle a locality versus a weak admin or
  // business result above, after equivalent records have been deduplicated.
  if ((hasDistinctExactGeographicScope && !hasDecisiveExactContext)
    || (context.travelIntent !== "route-stop" && exactSameNameRoutes.length > 1)) return undefined;

  // Fuzzy retrieval intentionally has broad recall. Only alternatives within
  // the resolver's confidence margin may participate in contextual tie-breaks;
  // a nearby hotel or similarly named hamlet must not manufacture ambiguity
  // against a substantially stronger destination result.
  const plausible = typeof top?.score === "number"
    ? scored.filter((item) => typeof item.score !== "number" || top.score! - item.score <= 12).map((item) => item.candidate)
    : ranked;

  // Context may settle genuinely distinct same-name candidates after provider
  // duplicates have collapsed. It cannot turn a weak entity type into the
  // requested route-stop/anchor/planning-area kind.
  const compatible = plausible.filter(intentCompatible);
  const contextualPool = compatible.length ? compatible : plausible;
  const contextual = contextualPool.filter((candidate) => candidate.parentCountries
    .some((country) => contextCountries.has(normalizePlacePhrase(country))));
  if (contextual.length === 1) return contextual[0];

  const contextualProximityRanked = contextualPool
    .filter((candidate) => candidate.coordinates && candidate.routability === "direct_destination")
    .map((candidate) => ({
      candidate,
      distance: Math.min(...anchors.map((anchor) => coordinateDistanceKm(anchor, candidate.coordinates!))),
    }))
    .sort((left, right) => left.distance - right.distance);
  const contextualBest = contextualProximityRanked[0];
  const contextualNext = contextualProximityRanked[1];
  if (anchors.length && contextualBest && contextualBest.distance <= 3_500
    && (!contextualNext || contextualNext.distance - contextualBest.distance >= 1_200 || contextualNext.distance >= contextualBest.distance * 1.75)) {
    return contextualBest.candidate;
  }
  return undefined;
}

function materialClarificationCandidates(candidates: RankedProviderCandidate[]) {
  const recognizedGeographies = candidates.filter((candidate) => candidate.matchQuality === "exact"
    && (candidate.placeType === "country" || (candidate.geographicSignificance ?? 0) >= 0.72));
  return recognizedGeographies.length > 1 ? recognizedGeographies : candidates;
}

const PROVIDER_PLACE_TYPES = new Set<PlaceType>([
  "continent", "country", "macro_region", "region", "sub_region", "island", "archipelago", "city", "town", "natural_area", "coast",
  "mountain_range", "valley", "travel_corridor", "landmark", "transport_gateway", "unknown",
]);
const PROVIDER_ROUTABILITY = new Set<PlaceRoutability>([
  "direct_destination", "planning_area", "anchor_or_poi", "needs_base_selection", "non_routable_reference",
]);

function providerCandidatesFromUnknown(value: unknown): PlaceProviderCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): PlaceProviderCandidate[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const providerId = typeof record.providerId === "string" ? record.providerId.trim() : "";
    const canonicalName = typeof record.canonicalName === "string" ? record.canonicalName.trim() : "";
    const placeType = typeof record.placeType === "string" && PROVIDER_PLACE_TYPES.has(record.placeType as PlaceType)
      ? record.placeType as PlaceType
      : null;
    if (!providerId || !canonicalName || !placeType) return [];
    const aliases = Array.isArray(record.aliases) ? record.aliases.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()) : undefined;
    const parentCountries = Array.isArray(record.parentCountries) ? record.parentCountries.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()) : undefined;
    const rawCoordinates = record.coordinates;
    if (rawCoordinates !== undefined && !validPlaceCoordinates(rawCoordinates)) return [];
    const coordinates = validPlaceCoordinates(rawCoordinates) ? [...rawCoordinates] as [number, number] : undefined;
    const routability = typeof record.routability === "string" && PROVIDER_ROUTABILITY.has(record.routability as PlaceRoutability)
      ? record.routability as PlaceRoutability
      : undefined;
    return [{
      providerId,
      canonicalName,
      placeType,
      ...(aliases ? { aliases } : {}),
      ...(parentCountries ? { parentCountries } : {}),
      ...(typeof record.parentRegionId === "string" && record.parentRegionId.trim() ? { parentRegionId: record.parentRegionId.trim() } : {}),
      ...(typeof record.accessPlaceName === "string" && record.accessPlaceName.trim() ? { accessPlaceName: record.accessPlaceName.trim().slice(0, 160) } : {}),
      ...(typeof record.providerSourceId === "string" && record.providerSourceId.trim() ? { providerSourceId: record.providerSourceId.trim().slice(0, 80) } : {}),
      ...(typeof record.providerSourceLabel === "string" && record.providerSourceLabel.trim() ? { providerSourceLabel: record.providerSourceLabel.trim().slice(0, 120) } : {}),
      ...(coordinates ? { coordinates } : {}),
      ...(routability ? { routability } : {}),
      ...(record.matchQuality === "exact" || record.matchQuality === "alias" || record.matchQuality === "partial" ? { matchQuality: record.matchQuality } : {}),
      ...(typeof record.rankScore === "number" && Number.isFinite(record.rankScore) ? { rankScore: record.rankScore } : {}),
      ...(typeof record.geographicSignificance === "number" && Number.isFinite(record.geographicSignificance)
        ? { geographicSignificance: Math.max(0, Math.min(1, record.geographicSignificance)) }
        : {}),
      ...(typeof record.providerImportance === "number" && Number.isFinite(record.providerImportance)
        ? { providerImportance: Math.max(0, Math.min(1, record.providerImportance)) }
        : {}),
      ...(typeof record.providerRank === "number" && Number.isFinite(record.providerRank) && record.providerRank >= 0
        ? { providerRank: Math.floor(record.providerRank) }
        : {}),
      ...(typeof record.administrativeLevel === "number" && Number.isFinite(record.administrativeLevel) && record.administrativeLevel >= 0
        ? { administrativeLevel: Math.floor(record.administrativeLevel) }
        : {}),
      ...(typeof record.normalizationReason === "string" && record.normalizationReason.trim() ? { normalizationReason: record.normalizationReason.trim().slice(0, 240) } : {}),
    }];
  });
}

function boundedProviderLookup(
  provider: PlaceIntelligenceProvider,
  phrase: string,
  context: PlaceResolutionContext,
): Promise<PlaceProviderCandidate[]> {
  const timeoutMs = Math.max(1, Math.min(provider.timeoutMs ?? 1_500, 5_000));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (candidates: PlaceProviderCandidate[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(candidates);
    };
    const timeout = setTimeout(() => finish([]), timeoutMs);
    Promise.resolve()
      .then(() => provider.lookup(phrase, context))
      .then((candidates) => finish(providerCandidatesFromUnknown(candidates)))
      .catch(() => finish([]));
  });
}

function providerLookupCacheKey(phrase: string, context: PlaceResolutionContext) {
  return JSON.stringify({
    phrase: normalizePlacePhrase(phrase),
    intent: context.travelIntent ?? "unknown",
    countries: [...(context.countryNames ?? [])].map(normalizePlacePhrase).sort(),
    explicitCountries: [...(context.explicitCountryNames ?? [])].map(normalizePlacePhrase).sort(),
    explicitPlaceTypes: [...(context.explicitPlaceTypes ?? [])].sort(),
    selected: [...(context.selectedPlaces ?? [])].map((place) => place.canonicalPlaceId).sort(),
  });
}

function providerContextFromMentions(
  context: PlaceResolutionContext,
  mentions: readonly ResolvedPlaceMention[],
) {
  const routeMentions = mentions.filter((mention) => mention.canonicalPlaceId
    && mention.status === "resolved"
    && mention.role !== "excluded"
    && !["origin", "fixed_start"].includes(mention.role));
  const contextualMentions = routeMentions.length
    ? routeMentions
    : mentions.filter((mention) => mention.canonicalPlaceId && mention.status === "resolved" && mention.role !== "excluded");
  return {
    ...context,
    countryNames: unique([
      ...(context.countryNames ?? []),
      ...contextualMentions.flatMap((mention) => mention.parentCountries),
    ], normalizePlacePhrase),
    selectedPlaces: unique([
      ...(context.selectedPlaces ?? []),
      ...contextualMentions.flatMap((mention) => mention.canonicalPlaceId ? [{
        canonicalPlaceId: mention.canonicalPlaceId,
        canonicalName: mention.canonicalName,
        placeType: mention.placeType,
        parentCountries: mention.parentCountries,
        routability: mention.routability,
        coordinates: mention.coordinates,
      }] : []),
    ], (place) => place.canonicalPlaceId),
  } satisfies PlaceResolutionContext;
}

function deduplicateProviderMentions(mentions: ResolvedPlaceMention[]) {
  const deduplicated: ResolvedPlaceMention[] = [];
  for (const mention of mentions) {
    const existingIndex = mention.canonicalPlaceId
      ? deduplicated.findIndex((item) => item.canonicalPlaceId === mention.canonicalPlaceId)
      : -1;
    if (existingIndex < 0) {
      deduplicated.push({ ...mention, sourceTexts: [...mention.sourceTexts], provenance: [...mention.provenance] });
      continue;
    }
    const existing = deduplicated[existingIndex];
    const roleConflict = (existing.role === "excluded") !== (mention.role === "excluded");
    const nextRole = existing.role === "preferred" && mention.role !== "preferred" ? mention.role : existing.role;
    const conflictSource: PlaceProvenance | undefined = roleConflict ? {
      id: `role-conflict:${existing.mentionId}`,
      label: "Morrovia role guard",
      kind: "context",
      supports: "The same provider-resolved identity was both included and excluded.",
    } : undefined;
    deduplicated[existingIndex] = {
      ...existing,
      sourceTexts: unique([...existing.sourceTexts, ...mention.sourceTexts], normalizePlacePhrase),
      role: nextRole,
      provenance: unique([...existing.provenance, ...mention.provenance, ...(conflictSource ? [conflictSource] : [])], (source) => source.id),
    };
  }
  return deduplicated.map((mention, order) => ({ ...mention, order }));
}

type RankedProviderCandidate = PlaceResolutionCandidate & Pick<PlaceProviderCandidate, "matchQuality" | "rankScore" | "geographicSignificance">;
type ProviderMentionSpec = {
  lookupText: string;
  fallbackLookupText?: string;
  lookupIntent: PlaceResolutionContext["travelIntent"];
  normalizeBroadRouteStop: boolean;
};

function applyProviderCandidatesToMention(
  mention: ResolvedPlaceMention,
  candidates: RankedProviderCandidate[],
  lookupContext: PlaceResolutionContext,
  spec: ProviderMentionSpec,
) {
  if (!candidates.length) return mention;
  const retainedBroadIntent = retainBroadPlanningIntent(mention, candidates);
  if (retainedBroadIntent) return retainedBroadIntent;
  const selected = decisiveProviderCandidate(candidates, spec.lookupText, lookupContext);
  const clarificationCandidates = materialClarificationCandidates(candidates);
  if (!selected) return mention.status === "unresolved"
    ? { ...mention, status: "ambiguous" as const, candidates: clarificationCandidates }
    : { ...mention, candidates: clarificationCandidates };
  if (spec.normalizeBroadRouteStop && selected.routability !== "direct_destination") {
    const sameExistingScope = normalizePlacePhrase(selected.canonicalName) === normalizePlacePhrase(mention.canonicalName)
      && selected.parentCountries.some((country) => mention.parentCountries
        .some((existingCountry) => normalizePlacePhrase(existingCountry) === normalizePlacePhrase(country)));
    if (sameExistingScope) return mention;
  }
  return {
    ...candidateToMention(selected, {
      sourceText: mention.sourceText,
      sourceTexts: mention.sourceTexts,
      order: mention.order,
      role: mention.role,
      mentionId: mention.mentionId,
      status: selected.routability === "direct_destination" ? "resolved" : "partially_resolved",
    }),
    candidates,
  };
}

/** Resolve intrinsically clear provider facts first, then rerank the remaining
 * uncertainty after those results have become trusted route context. This is
 * deliberately bounded to two passes: it lets one unambiguous open-world stop
 * clarify a namesake without turning tentative candidates into recursive facts. */
async function resolveProviderMentionsInTwoPass(
  mentions: ResolvedPlaceMention[],
  context: PlaceResolutionContext,
  lookup: (phrase: string, context: PlaceResolutionContext) => Promise<RankedProviderCandidate[]>,
  specForMention: (mention: ResolvedPlaceMention) => ProviderMentionSpec,
) {
  const runPass = async (current: ResolvedPlaceMention[], passContext: PlaceResolutionContext, pendingOnly: boolean) => Promise.all(current.map(async (mention) => {
    const spec = specForMention(mention);
    const eligible = mention.status === "unresolved" || mention.status === "ambiguous" || spec.normalizeBroadRouteStop;
    if (!eligible || (pendingOnly && mention.status !== "unresolved" && mention.status !== "ambiguous")) return mention;
    const lookupContext: PlaceResolutionContext = {
      ...passContext,
      countryNames: unique([...(passContext.countryNames ?? []), ...mention.parentCountries], normalizePlacePhrase),
      travelIntent: spec.lookupIntent,
    };
    const primaryRequest = providerLookupRequest(spec.lookupText, lookupContext);
    const primaryCandidates = await lookup(primaryRequest.phrase, primaryRequest.context);
    const normalizedLookup = normalizePlacePhrase(primaryRequest.phrase);
    const sourceNameMatches = primaryCandidates.filter((candidate) => candidate.matchQuality === "exact"
      || candidate.matchQuality === "alias"
      || [candidate.canonicalName, ...candidate.aliases].some((label) => normalizePlacePhrase(label) === normalizedLookup));
    const recognizedSourceGeographies = sourceNameMatches.filter((candidate) => candidate.placeType === "country"
      || (candidate.geographicSignificance ?? 0) >= 0.72);
    const sourceIsDecisive = recognizedSourceGeographies.length === 1
      || (primaryCandidates.length === 1 && sourceNameMatches.length === 1);
    const fallbackRequest = spec.fallbackLookupText ? providerLookupRequest(spec.fallbackLookupText, primaryRequest.context) : undefined;
    const fallbackCandidates = !sourceIsDecisive && fallbackRequest
      ? await lookup(fallbackRequest.phrase, fallbackRequest.context)
      : [];
    const appliedContext = sourceIsDecisive || !fallbackCandidates.length ? primaryRequest.context : fallbackRequest?.context ?? primaryRequest.context;
    return applyProviderCandidatesToMention(mention, sourceIsDecisive || !fallbackCandidates.length ? primaryCandidates : fallbackCandidates, appliedContext, spec);
  }));

  const initialContext = providerContextFromMentions(context, mentions);
  const firstPass = await runPass(mentions, initialContext, false);
  const enrichedContext = providerContextFromMentions(context, firstPass);
  return runPass(firstPass, enrichedContext, true);
}

export async function resolvePlaceMentionsWithProvider(
  prompt: string,
  provider: PlaceIntelligenceProvider,
  context: PlaceResolutionContext = {},
): Promise<PlaceIntelligenceResult> {
  const resolutionContext: PlaceResolutionContext = {
    ...context,
    explicitCountryNames: context.explicitCountryNames ?? context.countryNames ?? [],
  };
  const deterministic = resolvePlaceMentions(prompt, resolutionContext);
  const cache = new Map<string, Promise<PlaceProviderCandidate[]>>();
  const lookup = async (phrase: string, lookupContext: PlaceResolutionContext) => {
    const key = providerLookupCacheKey(phrase, lookupContext);
    if (!cache.has(key)) cache.set(key, boundedProviderLookup(provider, phrase, lookupContext));
    return (await cache.get(key)!).map((candidate) => providerCandidate(candidate, provider));
  };
  const initialContext = providerContextFromMentions(resolutionContext, deterministic.mentions);
  const coordinateEnriched = await Promise.all(deterministic.mentions.map(async (mention) => {
    if (mention.status !== "resolved" || !mention.canonicalPlaceId || mention.coordinates) return mention;
    const lookupContext: PlaceResolutionContext = {
      ...initialContext,
      countryNames: unique([...(initialContext.countryNames ?? []), ...mention.parentCountries], normalizePlacePhrase),
      travelIntent: mention.role === "anchor" ? "anchor" : "route-stop",
    };
    const candidates = await lookup(mention.canonicalName, lookupContext);
    return enrichCanonicalMentionCoordinates(mention, candidates);
  }));
  const enriched = await resolveProviderMentionsInTwoPass(coordinateEnriched, resolutionContext, lookup, (mention) => {
    const broadIntent = !mention.canonicalPlaceId ? broadPlanningIntentForPhrase(mention.sourceText) : undefined;
    return {
      lookupText: mention.sourceText,
      lookupIntent: broadIntent ? "planning-area" : mention.role === "anchor" ? "anchor" : resolutionContext.travelIntent ?? "route-stop",
      normalizeBroadRouteStop: false,
    };
  });
  const mentions = deduplicateProviderMentions(enriched);
  return { ...deterministic, mentions, issues: resultIssuesForMentions(mentions) };
}

export async function resolveExplicitPlaceMentionsWithProvider(
  inputs: ExplicitPlaceMention[],
  provider: PlaceIntelligenceProvider,
  context: PlaceResolutionContext = {},
): Promise<PlaceIntelligenceResult> {
  const resolutionContext: PlaceResolutionContext = {
    ...context,
    explicitCountryNames: context.explicitCountryNames ?? context.countryNames ?? [],
  };
  const deterministic = resolveExplicitPlaceMentions(inputs, resolutionContext);
  const cache = new Map<string, Promise<PlaceProviderCandidate[]>>();
  const lookup = async (phrase: string, lookupContext: PlaceResolutionContext) => {
    const key = providerLookupCacheKey(phrase, lookupContext);
    if (!cache.has(key)) cache.set(key, boundedProviderLookup(provider, phrase, lookupContext));
    return (await cache.get(key)!).map((candidate) => providerCandidate(candidate, provider));
  };
  const initialContext = providerContextFromMentions(resolutionContext, deterministic.mentions);
  const coordinateEnriched = await Promise.all(deterministic.mentions.map(async (mention) => {
    const input = inputs[mention.order];
    const broadIntent = !mention.canonicalPlaceId ? broadPlanningIntentForPhrase(mention.sourceText) : undefined;
    const lookupIntent = broadIntent ? "planning-area" : input?.travelIntent ?? (mention.role === "anchor" ? "anchor" : "route-stop");
    const normalizeBroadRouteStop = lookupIntent === "route-stop"
      && mention.routability === "planning_area"
      && (mention.placeType === "country" || mention.placeType === "region" || mention.placeType === "sub_region");
    if (normalizeBroadRouteStop || mention.status !== "resolved" || !mention.canonicalPlaceId || mention.coordinates) return mention;
    const lookupContext: PlaceResolutionContext = {
      ...initialContext,
      countryNames: unique([...(initialContext.countryNames ?? []), ...mention.parentCountries], normalizePlacePhrase),
      travelIntent: lookupIntent,
    };
    const candidates = await lookup(mention.canonicalName, lookupContext);
    return enrichCanonicalMentionCoordinates(mention, candidates);
  }));
  const enriched = await resolveProviderMentionsInTwoPass(coordinateEnriched, resolutionContext, lookup, (mention) => {
    const input = inputs[mention.order];
    const broadIntent = !mention.canonicalPlaceId ? broadPlanningIntentForPhrase(mention.sourceText) : undefined;
    const lookupIntent = broadIntent ? "planning-area" : input?.travelIntent ?? (mention.role === "anchor" ? "anchor" : "route-stop");
    const normalizeBroadRouteStop = lookupIntent === "route-stop"
      && mention.routability === "planning_area"
      && (mention.placeType === "country" || mention.placeType === "region" || mention.placeType === "sub_region");
    return {
      lookupText: mention.sourceText,
      ...(inputs[mention.order]?.lookupText?.trim()
        && normalizePlacePhrase(inputs[mention.order]!.lookupText!) !== normalizePlacePhrase(mention.sourceText)
        ? { fallbackLookupText: inputs[mention.order]!.lookupText!.trim() }
        : {}),
      lookupIntent,
      normalizeBroadRouteStop,
    };
  });
  const mentions = deduplicateProviderMentions(enriched);
  return { ...deterministic, mentions, issues: resultIssuesForMentions(mentions) };
}

export function selectPlaceCandidate(
  result: PlaceIntelligenceResult,
  mentionId: string,
  canonicalPlaceId: string,
): PlaceIntelligenceResult {
  const mentions = result.mentions.map((mention) => {
    if (mention.mentionId !== mentionId) return mention;
    const candidate = mention.candidates.find((item) => item.canonicalPlaceId === canonicalPlaceId);
    if (!candidate) return mention;
    const builderSource: PlaceProvenance = {
      id: `builder:${mentionId}:${canonicalPlaceId}`,
      label: "Traveller builder selection",
      kind: "builder",
      supports: "The traveller explicitly selected this candidate in the builder.",
    };
    return candidateToMention({
      ...candidate,
      provenance: [builderSource, ...candidate.provenance],
      confidence: createPlanningConfidence({
        state: "structured", level: "high", freshness: "current", scope: "traveller-intent",
        sources: [{ id: builderSource.id, label: builderSource.label, kind: "traveller", supports: builderSource.supports }],
        reason: "The traveller explicitly selected this geographic identity.",
      }),
    }, {
      sourceText: mention.sourceText,
      sourceTexts: mention.sourceTexts,
      order: mention.order,
      role: mention.role,
      mentionId: mention.mentionId,
    });
  });
  return { ...result, mentions, issues: resultIssuesForMentions(mentions) };
}

export {
  PLACE_CATALOG,
  catalogAliasesForPlace,
  findCatalogMatches,
  findCatalogPlaceById,
  findCatalogPlacesByPhrase,
  matchCatalogPlace,
};
