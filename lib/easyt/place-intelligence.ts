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
import { routeFamilyByKey, type RouteFamily } from "./route-catalog.ts";

export const PLACE_INTELLIGENCE_VERSION = 1 as const;
export const PLACE_INTELLIGENCE_PARSER_VERSION = "place-intelligence-v1-deterministic";

export type PlaceType = PlaceTypeLiteral;

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
  kind: "ambiguity" | "base";
  selectedCanonicalPlaceId: string;
  selectedName: string;
  selectedPlaceType?: PlaceType;
  selectedParentCountries?: string[];
  routeStopId?: string;
  provenance: PlaceProvenance;
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
    const mention = mentions.find((item) => item.mentionId === selection.mentionId);
    if (!mention?.canonicalPlaceId || mention.canonicalPlaceId !== selection.selectedCanonicalPlaceId) continue;
    const directType = ["city", "town", "transport_gateway"].includes(selection.selectedPlaceType ?? mention.placeType);
    if (directType) collapsedMentionIds.add(mention.mentionId);
  }
  return {
    collapsedMentionIds,
    selections: selections.filter((selection) => !collapsedMentionIds.has(selection.mentionId)),
    mentions: mentions.map((mention): ResolvedPlaceMention => collapsedMentionIds.has(mention.mentionId) ? {
      ...mention,
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
  canonicalName: string;
  aliases?: string[];
  placeType: PlaceType;
  parentCountries?: string[];
  parentRegionId?: string;
  bounds?: GeographicBounds;
  coordinates?: [number, number];
  routability?: PlaceRoutability;
  /** Safe, provider-independent ranking evidence. Raw provider payloads never
   * cross the boundary. */
  matchQuality?: "exact" | "alias" | "partial";
  rankScore?: number;
  normalizationReason?: string;
};

export type PlaceIntelligenceProvider = {
  id: string;
  label: string;
  /** Keep homepage capture bounded even when an enrichment provider stalls. */
  timeoutMs?: number;
  lookup: (phrase: string, context: PlaceResolutionContext) => Promise<PlaceProviderCandidate[]>;
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

export type CanonicalPlaceSuggestion = {
  canonicalPlaceId: string;
  name: string;
  label: string;
  country: string;
  region?: string;
  placeType: PlaceType;
  coordinates?: [number, number];
  provenance: PlaceProvenance[];
};

type RawCatalogMatch = { entry: PlaceCatalogEntry; alias: string; start: number; end: number; sourceText: string };

const ORDER_LANGUAGE = /(?:→|->|\bthen\b|\bnext\b|\bvia\b|\bthrough\b|\bto\b|\bfly(?:ing)? into\b|\bfrom\b.+\bto\b|\bstart(?:ing)?\b.+\b(?:finish|end)(?:ing)?\b)/i;
const UNKNOWN_CANDIDATE = /\b(?:the\s+)?[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*(?:\s+(?:de|del|la|las|los|of|the|[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*)){0,3}/gu;
const LOWERCASE_TYPO_CANDIDATE = /\b[\p{Ll}][\p{L}'’.-]{3,}\b/gu;
const DELIMITED_UNKNOWN_CANDIDATE = /(?:^|[,;])\s*([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,3})\s*(?=,|;|$)/gu;
const EXPLICIT_ORIGIN_CANDIDATE = /\b(?:fly(?:ing)?|depart(?:ing)?|leav(?:e|ing))?\s*(?:out of|from)\s+([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,3})/giu;
const NON_PLACE_PHRASES = new Set([
  "a", "about", "add", "avoid", "days", "do", "easter", "five", "fly", "flying", "finish", "finishing", "food", "for", "four", "from", "i", "is", "it",
  "keep", "keep the", "nature", "no", "one", "prefer", "relaxed", "road", "route", "skip", "start", "starting", "the", "three", "trip",
  "ten", "two", "we", "week", "weeks", "with", "without",
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
  if (/(?:^| )(?:finish|finishing|end|ending)(?: the trip)? (?:in|at)$|fly home from$|return(?:ing)? from$/.test(before)) return "fixed_end";
  if (/(?:^| )(?:start|starting|begin|beginning)(?: the trip)? (?:in|at)$/.test(before)) return "fixed_start";
  if (/(?:leaving from|departing from|depart from|fly(?:ing)? out of|from|desde|saliendo de)$/.test(before)) return "origin";
  if (!before && /^(?:to|through|via)\b[^.!?]*(?:,|\band\b)/.test(after)) return "origin";
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
    const end = start + match[0].length;
    if (intersectsKnownRange(start, end)) continue;
    const normalized = normalizePlacePhrase(sourceText).replace(/^the /, "");
    if (!normalized || NON_PLACE_PHRASES.has(normalized) || [...NON_PLACE_PHRASES].some((word) => normalized === `${word} trip`)) continue;
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
    candidates.push({ sourceText, start, end, reviewOnly: true });
  }
  return candidates;
}

const REGION_ROUTE_KEYS: Record<string, string[]> = {
  patagonia: ["patagonia-w-circuit"],
  "sacred-valley": ["inca-trail-sacred-valley"],
  "japanese-alps": ["japan-slow"],
  balkans: ["balkans-overland"],
};

const REVIEWED_BASE_IDS: Record<string, string[]> = {
  "lake-atitlan": ["panajachel", "san-pedro-la-laguna"],
  tikal: ["flores-guatemala", "el-remate"],
  belize: ["san-ignacio-belize", "caye-caulker", "belize-city"],
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
  const reviewed = (REVIEWED_BASE_IDS[canonicalPlaceId] ?? []).flatMap((baseId): RegionalBaseSuggestion[] => {
    const entry = findCatalogPlaceById(baseId);
    const coordinates = entry?.coordinates;
    const country = entry?.parentCountries[0];
    if (!entry || !coordinates || !country) return [];
    return [{
      mentionId,
      regionCanonicalPlaceId: canonicalPlaceId,
      canonicalPlaceId: entry.canonicalPlaceId,
      name: entry.canonicalName,
      country,
      placeType: entry.placeType,
      coordinates: [...coordinates] as [number, number],
      reason: `A reviewed overnight base for ${findCatalogPlaceById(canonicalPlaceId)?.canonicalName ?? canonicalPlaceId}.`,
      provenance: [{
        id: `morrovia-place-catalog:${entry.canonicalPlaceId}`,
        label: "Morrovia reviewed clarification base",
        kind: "canonical",
        supports: `${entry.canonicalName} is a real reviewed base candidate; the traveller still chooses whether to use it.`,
        reviewedAt: "2026-08-27",
      }],
    }];
  });
  const anchor = findCatalogPlaceById(canonicalPlaceId);
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
  const routeSuggestions = routeFamiliesForRegion(canonicalPlaceId).flatMap((route) => route.stops.flatMap((stop) => {
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
  return unique([...reviewed, ...linkedBase, ...routeSuggestions], (suggestion) => suggestion.canonicalPlaceId);
}

function issueOptionsForMention(mention: ResolvedPlaceMention): PlaceIssueOption[] {
  if (mention.status === "ambiguous") return mention.candidates.map((candidate) => ({
    kind: "candidate",
    canonicalPlaceId: candidate.canonicalPlaceId,
    label: candidate.canonicalName,
    country: candidate.parentCountries.length === 1 ? candidate.parentCountries[0] : undefined,
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
    } else if ((mention.requiresBaseSelection || (mention.routability === "anchor_or_poi"
      && !mentions.some((candidate) => candidate !== mention
        && candidate.routability === "direct_destination"
        && candidate.canonicalPlaceId === mention.parentRegionId))) && mention.role !== "excluded") {
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
      resolved.push({
        mentionId: `place-unresolved-${slug(candidate.sourceText)}-${candidate.start}`,
        sourceText: candidate.sourceText, sourceTexts: [candidate.sourceText], normalizedPhrase: normalizePlacePhrase(candidate.sourceText),
        canonicalName: candidate.sourceText, aliases: [], placeType: "unknown", status: "unresolved",
        confidence: unknownPlanningConfidence("Morrovia retained this possible place phrase but could not resolve it."), provenance,
        parentCountries: [], routability: "non_routable_reference", directlyRoutable: false, requiresBaseSelection: false,
        isAnchor: false, role, order: 0, candidates: [], _start: candidate.start, _end: candidate.end, _roles: [role],
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
  return {
    mentionId: `place-unresolved-${slug(input.sourceText)}-${order}`,
    sourceText: input.sourceText,
    sourceTexts: [input.sourceText],
    normalizedPhrase: normalizePlacePhrase(input.sourceText),
    canonicalName: input.sourceText,
    aliases: [],
    placeType: "unknown",
    status: "unresolved",
    confidence: unknownPlanningConfidence("Morrovia retained this semantic place mention but could not resolve it."),
    provenance,
    parentCountries: [],
    routability: "non_routable_reference",
    directlyRoutable: false,
    requiresBaseSelection: false,
    isAnchor: false,
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
): PlaceResolutionCandidate & Pick<PlaceProviderCandidate, "matchQuality" | "rankScore"> {
  const source: PlaceProvenance = {
    id: `${provider.id}:${candidate.providerId}`,
    label: provider.label,
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
    bounds: candidate.bounds,
    coordinates: candidate.coordinates,
    routability: candidate.routability ?? (candidate.placeType === "city" || candidate.placeType === "town" ? "direct_destination" : "planning_area"),
    confidence: inferredConfidence(source, "A provider supplied a typed candidate for an otherwise unresolved phrase."),
    provenance: [source],
    ...(candidate.matchQuality ? { matchQuality: candidate.matchQuality } : {}),
    ...(candidate.rankScore !== undefined ? { rankScore: candidate.rankScore } : {}),
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
  const exact = ranked.filter((candidate) => [candidate.canonicalName, ...candidate.aliases]
    .some((label) => normalizePlacePhrase(label) === normalized));
  const exactRoutable = exact.filter((candidate) => candidate.routability === "direct_destination");
  if (exactRoutable.length === 1) return exactRoutable[0];

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
  if (exact.length === 1) return exact[0];

  // Context can break a genuine same-name tie, but never filters the candidate
  // set or overrides a unique exact-name match.
  const contextCountries = new Set((context.countryNames ?? []).map(normalizePlacePhrase));
  const contextual = ranked.filter((candidate) => candidate.parentCountries
    .some((country) => contextCountries.has(normalizePlacePhrase(country))));
  if (contextual.length === 1) return contextual[0];

  const anchors = (context.selectedPlaces ?? []).flatMap((place) => place.coordinates ? [place.coordinates] : []);
  if (!anchors.length) return undefined;
  const proximityRanked = ranked
    .filter((candidate) => candidate.coordinates && candidate.routability === "direct_destination")
    .map((candidate) => ({
      candidate,
      distance: Math.min(...anchors.map((anchor) => coordinateDistanceKm(anchor, candidate.coordinates!))),
    }))
    .sort((left, right) => left.distance - right.distance);
  const best = proximityRanked[0];
  const proximityNext = proximityRanked[1];
  if (best && best.distance <= 3_500 && (!proximityNext || proximityNext.distance - best.distance >= 1_200 || proximityNext.distance >= best.distance * 1.75)) {
    return best.candidate;
  }
  return undefined;
}

const PROVIDER_PLACE_TYPES = new Set<PlaceType>([
  "country", "macro_region", "region", "sub_region", "island", "archipelago", "city", "town", "natural_area", "coast",
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
    if (rawCoordinates !== undefined && (!Array.isArray(rawCoordinates) || rawCoordinates.length !== 2 || !rawCoordinates.every((value) => typeof value === "number" && Number.isFinite(value)))) return [];
    const coordinates = Array.isArray(rawCoordinates)
      ? [rawCoordinates[0], rawCoordinates[1]] as [number, number]
      : undefined;
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
      ...(coordinates ? { coordinates } : {}),
      ...(routability ? { routability } : {}),
      ...(record.matchQuality === "exact" || record.matchQuality === "alias" || record.matchQuality === "partial" ? { matchQuality: record.matchQuality } : {}),
      ...(typeof record.rankScore === "number" && Number.isFinite(record.rankScore) ? { rankScore: record.rankScore } : {}),
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

export async function resolvePlaceMentionsWithProvider(
  prompt: string,
  provider: PlaceIntelligenceProvider,
  context: PlaceResolutionContext = {},
): Promise<PlaceIntelligenceResult> {
  const deterministic = resolvePlaceMentions(prompt, context);
  const cache = new Map<string, Promise<PlaceProviderCandidate[]>>();
  const unresolved = deterministic.mentions.filter((mention) => mention.status === "unresolved");
  const enriched = await Promise.all(deterministic.mentions.map(async (mention) => {
    if (mention.status !== "unresolved") return mention;
    const key = mention.normalizedPhrase;
    const lookupContext: PlaceResolutionContext = {
      ...context,
      travelIntent: mention.role === "anchor" ? "anchor" : context.travelIntent ?? "route-stop",
    };
    if (!cache.has(key)) cache.set(key, boundedProviderLookup(provider, mention.sourceText, lookupContext));
    const candidates = (await cache.get(key)!).map((candidate) => providerCandidate(candidate, provider));
    if (!candidates.length) return mention;
    const selected = decisiveProviderCandidate(candidates, mention.sourceText, lookupContext);
    if (!selected) return { ...mention, status: "ambiguous" as const, candidates };
    return { ...candidateToMention(selected, {
      sourceText: mention.sourceText,
      sourceTexts: mention.sourceTexts,
      order: mention.order,
      role: mention.role,
      mentionId: mention.mentionId,
      status: selected.routability === "direct_destination" ? "resolved" : "partially_resolved",
    }), candidates };
  }));
  if (!unresolved.length) return deterministic;
  const mentions = deduplicateProviderMentions(enriched);
  return { ...deterministic, mentions, issues: resultIssuesForMentions(mentions) };
}

export async function resolveExplicitPlaceMentionsWithProvider(
  inputs: ExplicitPlaceMention[],
  provider: PlaceIntelligenceProvider,
  context: PlaceResolutionContext = {},
): Promise<PlaceIntelligenceResult> {
  const deterministic = resolveExplicitPlaceMentions(inputs, context);
  const routeContextMentions = deterministic.mentions.filter((mention) => mention.canonicalPlaceId
    && mention.status === "resolved"
    && mention.role !== "excluded"
    && !["origin", "fixed_start"].includes(mention.role));
  const fallbackContextMentions = routeContextMentions.length
    ? routeContextMentions
    : deterministic.mentions.filter((mention) => mention.canonicalPlaceId && mention.status === "resolved" && mention.role !== "excluded");
  const providerContext: PlaceResolutionContext = {
    ...context,
    countryNames: unique([
      ...(context.countryNames ?? []),
      ...fallbackContextMentions.flatMap((mention) => mention.parentCountries),
    ], normalizePlacePhrase),
    selectedPlaces: unique([
      ...(context.selectedPlaces ?? []),
      ...fallbackContextMentions.flatMap((mention) => mention.canonicalPlaceId ? [{
        canonicalPlaceId: mention.canonicalPlaceId,
        canonicalName: mention.canonicalName,
        placeType: mention.placeType,
        parentCountries: mention.parentCountries,
        routability: mention.routability,
        coordinates: mention.coordinates,
      }] : []),
    ], (place) => place.canonicalPlaceId),
  };
  const cache = new Map<string, Promise<PlaceProviderCandidate[]>>();
  const enriched = await Promise.all(deterministic.mentions.map(async (mention) => {
    const input = inputs[mention.order];
    const lookupIntent = input?.travelIntent ?? (mention.role === "anchor" ? "anchor" : "route-stop");
    const normalizeBroadRouteStop = lookupIntent === "route-stop"
      && mention.routability === "planning_area"
      && (mention.placeType === "country" || mention.placeType === "region" || mention.placeType === "sub_region");
    if (mention.status !== "unresolved" && !normalizeBroadRouteStop) return mention;
    const lookupText = inputs[mention.order]?.lookupText?.trim() || mention.sourceText;
    const key = normalizePlacePhrase(lookupText);
    const lookupContext: PlaceResolutionContext = {
      ...providerContext,
      travelIntent: lookupIntent,
    };
    const cacheKey = `${key}|${lookupContext.travelIntent}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, boundedProviderLookup(provider, lookupText, lookupContext));
    const candidates = (await cache.get(cacheKey)!).map((candidate) => providerCandidate(candidate, provider));
    if (!candidates.length) return mention;
    const selected = decisiveProviderCandidate(candidates, lookupText, lookupContext);
    if (!selected) return mention.status === "unresolved" ? { ...mention, status: "ambiguous" as const, candidates } : mention;
    if (normalizeBroadRouteStop && selected.routability !== "direct_destination") return mention;
    return { ...candidateToMention(selected, {
      sourceText: mention.sourceText,
      sourceTexts: mention.sourceTexts,
      order: mention.order,
      role: mention.role,
      mentionId: mention.mentionId,
      status: selected.routability === "direct_destination" ? "resolved" : "partially_resolved",
    }), candidates };
  }));
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
