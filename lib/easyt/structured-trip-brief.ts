import { parseTripBrief } from "./trip-brief.ts";
import {
  resolvePlaceMentions,
  placeResolutionIssuesForMentions,
  placeMentionSupportsMultipleSelections,
  reconcileSelfBasePlaceState,
  type PlaceIntelligenceResult,
  type PlaceIssue,
  type PlaceRoutability,
  type PlaceResolutionStatus,
  type PlaceSelection,
  type PlaceType,
  type ResolvedPlaceMention,
} from "./place-intelligence.ts";
import {
  aggregatePlanningConfidence,
  planningConfidenceFromIntentProvenance,
  unknownPlanningConfidence,
  type PlanningConfidence,
} from "./planning-confidence.ts";
import { normalizeTripInterests } from "./trip-interest.ts";

export const STRUCTURED_TRIP_BRIEF_VERSION = 1 as const;

export type TripBriefSource = "prompt" | "builder" | "saved" | "morrovia-default";
export type TripBriefConfidence = "high" | "medium" | "low";
export type TripBriefProvenance = {
  source: TripBriefSource;
  kind: "explicit" | "inferred" | "default";
  confidence: TripBriefConfidence;
  sourceText?: string;
};

export type SourcedTripValue<T> = { value: T; provenance: TripBriefProvenance };
export type TripBriefDuration = SourcedTripValue<number> & {
  unit: "days" | "nights";
  precision: "exact" | "approximate";
};
export type TripBriefDestination = {
  /** Operational route-stop identity. Never use a geographic identity here. */
  id?: string;
  name: string;
  /** Stable geographic identity is deliberately separate from the route-stop id. */
  canonicalPlaceId?: string;
  placeMentionId?: string;
  placeType?: PlaceType;
  resolutionStatus?: PlaceResolutionStatus;
  routability?: PlaceRoutability;
  sourceLabel?: string;
  parentCountries?: string[];
  parentCanonicalPlaceId?: string;
  role: "arrival-gateway" | "departure-gateway" | "must-visit" | "preferred" | "suggested" | "trip-anchor" | "excluded";
  priority: "required" | "high" | "normal";
  provenance: TripBriefProvenance;
};
export type TripBriefDates = {
  start?: SourcedTripValue<string>;
  end?: SourcedTripValue<string>;
  fixed?: SourcedTripValue<boolean>;
};
export type TripBriefHardConstraint =
  | { type: "duration"; duration: TripBriefDuration }
  | { type: "start-at" | "end-at" | "must-visit" | "excluded-destination"; value: string; provenance: TripBriefProvenance }
  | { type: "no-driving"; value: true; provenance: TripBriefProvenance }
  | { type: "no-flying"; value: true; provenance: TripBriefProvenance }
  | { type: "maximum-stops"; value: number; provenance: TripBriefProvenance }
  | { type: "maximum-transfer-time"; value: number; unit: "minutes"; provenance: TripBriefProvenance }
  | { type: "fixed-commitment"; value: string; date?: string; provenance: TripBriefProvenance };
export type TripBriefSoftPreference = {
  type: "transport" | "pace" | "interest" | "accommodation" | "budget" | "region";
  value: string;
  provenance: TripBriefProvenance;
};
export type TripBriefValidationIssue = {
  code: "END_BEFORE_START" | "DURATION_DATE_MISMATCH" | "INVALID_TRAVELLERS" | "REQUIRED_DESTINATION_EXCLUDED" | "MAX_STOPS_BELOW_REQUIRED" | "UNSUPPORTED_TOTAL_BUDGET_CONSTRAINT";
  severity: "error" | "warning";
  message: string;
  fields: string[];
};

/**
 * The canonical normalized traveller intent. Operational planner settings are
 * derived from this record; raw prose is retained only as provenance.
 */
export type StructuredTripBrief = {
  version: typeof STRUCTURED_TRIP_BRIEF_VERSION;
  duration?: TripBriefDuration;
  destinations: TripBriefDestination[];
  mustVisit: TripBriefDestination[];
  /** Explicit country scope is retained even when city stops are more actionable. */
  countries: Array<SourcedTripValue<string>>;
  preferredRegions: Array<SourcedTripValue<string>>;
  travellers?: SourcedTripValue<number>;
  dates: TripBriefDates;
  pace?: SourcedTripValue<"relaxed" | "balanced" | "packed">;
  interests: Array<SourcedTripValue<string>>;
  transportPreferences: Array<SourcedTripValue<"flight" | "train" | "drive" | "ground" | "avoid-flight">>;
  accommodationPreferences: Array<SourcedTripValue<string>>;
  budget?: SourcedTripValue<"value" | "mid" | "high">;
  hardConstraints: TripBriefHardConstraint[];
  softPreferences: TripBriefSoftPreference[];
  source: { rawPrompt?: string; parserVersion?: string; inputs: TripBriefSource[] };
  confidence: TripBriefConfidence;
  issues: TripBriefValidationIssue[];
  /** Full geographic intent, including broad, ambiguous and unresolved phrases. */
  placeMentions?: ResolvedPlaceMention[];
  /** Geographic resolution issues are separate from brief consistency issues. */
  placeIssues?: PlaceIssue[];
  /** Explicit traveller choices that resolve an ambiguity or choose a regional base. */
  placeSelections?: PlaceSelection[];
  /** Broad planning areas remain open for multiple child selections until the
   * traveller explicitly says that the route has enough places. */
  completedPlanningAreaMentionIds?: string[];
  /** Explicit removals preserve auditability without silently losing prompt intent. */
  removedPlaceMentionIds?: string[];
};

export type StructuredTripBriefBuilderInput = {
  duration?: { value: number; unit: "days" | "nights"; precision?: "exact" | "approximate" };
  destinations?: Array<{
    id?: string;
    name: string;
    canonicalPlaceId?: string;
    placeMentionId?: string;
    placeType?: PlaceType;
    resolutionStatus?: PlaceResolutionStatus;
    routability?: PlaceRoutability;
    sourceLabel?: string;
    parentCountries?: string[];
    parentCanonicalPlaceId?: string;
    role?: TripBriefDestination["role"];
    priority?: TripBriefDestination["priority"];
  }>;
  mustVisit?: string[];
  countries?: string[];
  preferredRegions?: string[];
  travellers?: number;
  dates?: { start?: string; end?: string; fixed?: boolean };
  pace?: "relaxed" | "balanced" | "packed";
  interests?: string[];
  transportPreferences?: Array<"flight" | "train" | "drive" | "ground" | "avoid-flight">;
  accommodationPreferences?: string[];
  budget?: "value" | "mid" | "high";
  maximumStops?: number;
  maximumTransferMinutes?: number;
  excludedDestinations?: string[];
  fixedCommitments?: Array<{ label: string; date?: string }>;
  avoidDriving?: boolean;
  avoidFlying?: boolean;
  placeSelections?: PlaceSelection[];
  completedPlanningAreaMentionIds?: string[];
  removedPlaceMentionIds?: string[];
};

/** Concise confidence in the normalized intent without changing its schema. */
export function structuredTripBriefPlanningConfidence(brief: StructuredTripBrief): PlanningConfidence {
  const provenances: TripBriefProvenance[] = [
    ...(brief.duration ? [brief.duration.provenance] : []),
    ...brief.destinations.map((item) => item.provenance),
    ...brief.mustVisit.map((item) => item.provenance),
    ...(brief.countries ?? []).map((item) => item.provenance),
    ...brief.preferredRegions.map((item) => item.provenance),
    ...(brief.travellers ? [brief.travellers.provenance] : []),
    ...(brief.dates.start ? [brief.dates.start.provenance] : []),
    ...(brief.dates.end ? [brief.dates.end.provenance] : []),
    ...(brief.dates.fixed ? [brief.dates.fixed.provenance] : []),
    ...(brief.pace ? [brief.pace.provenance] : []),
    ...brief.interests.map((item) => item.provenance),
    ...brief.transportPreferences.map((item) => item.provenance),
    ...brief.accommodationPreferences.map((item) => item.provenance),
    ...(brief.budget ? [brief.budget.provenance] : []),
    ...brief.hardConstraints.map((constraint) => constraint.type === "duration" ? constraint.duration.provenance : constraint.provenance),
    ...brief.softPreferences.map((preference) => preference.provenance),
  ];
  if (!provenances.length) return unknownPlanningConfidence("The trip brief contains no confidence-bearing structured value yet.");
  return aggregatePlanningConfidence(provenances.map(planningConfidenceFromIntentProvenance), {
    scope: "traveller-intent",
    reason: "Confidence in the normalized traveller intent reflects its least-certain material input.",
  });
}

const promptExplicit = (sourceText?: string): TripBriefProvenance => ({ source: "prompt", kind: "explicit", confidence: "high", sourceText });
const promptInferred = (sourceText?: string): TripBriefProvenance => ({ source: "prompt", kind: "inferred", confidence: "medium", sourceText });
const builderExplicit = (): TripBriefProvenance => ({ source: "builder", kind: "explicit", confidence: "high" });
const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const unique = <T>(values: T[], key: (value: T) => string) => values.filter((value, index, all) => all.findIndex((other) => key(other) === key(value)) === index);

function sourceExcerpt(prompt: string, name: string) {
  const index = normalize(prompt).indexOf(normalize(name));
  if (index < 0) return name;
  return prompt.slice(Math.max(0, index - 36), Math.min(prompt.length, index + name.length + 48)).trim();
}

function explicitGateway(prompt: string, kind: "start" | "end") {
  const pattern = kind === "start"
    ? /(?:start|begin)(?:ing)?\s+(?:(?:in|at)\s+)?([^,.\n;]+?)(?=\s+(?:and\s+)?(?:then\s+)?(?:travel|go|continue|head|fly|take|finish|end)\b|[,.;\n]|$)/i
    : /(?:finish|end)(?:ing)?\s+(?:in|at)\s+([^,.\n;]+)/i;
  return pattern.exec(prompt)?.[1]?.trim();
}

function durationFromPrompt(prompt: string, fallbackDays?: number): TripBriefDuration | undefined {
  const text = normalize(prompt);
  const nights = text.match(/\b(\d{1,3})\s+nights?\b/);
  const approximate = /\b(about|around|roughly|approximately|approx\.?|probably|more or less)\b/.test(text);
  if (nights) return { value: Number(nights[1]), unit: "nights", precision: approximate ? "approximate" : "exact", provenance: promptExplicit(nights[0]) };
  if (!fallbackDays) return undefined;
  return { value: fallbackDays, unit: "days", precision: approximate ? "approximate" : "exact", provenance: promptExplicit(sourceExcerpt(prompt, `${fallbackDays}`)) };
}

function placeIsImportant(prompt: string, name: string) {
  const excerpt = normalize(sourceExcerpt(prompt, name));
  return /\b(must|essential|definitely|whole reason|main reason|non-negotiable|cannot miss|can't miss)\b/.test(excerpt);
}

function extractedInterests(prompt: string) {
  const text = normalize(prompt);
  return [
    ["food", /\b(food|eating|meals|restaurants|cuisine)\b/],
    ["nature", /\b(nature|outdoors|wildlife)\b/],
    ["culture", /\b(culture|museums?|heritage|history)\b/],
    ["mountains", /\b(mountains?|alps)\b/],
    ["hiking", /\b(hiking|trekking)\b/],
    ["coast", /\b(coasts?|beaches?|seaside|ocean)\b/],
  ].flatMap(([value, pattern]) => (pattern as RegExp).test(text) ? [value as string] : []);
}

function budgetFromPrompt(prompt: string): StructuredTripBrief["budget"] {
  const text = normalize(prompt);
  const matches: Array<{ value: "value" | "mid" | "high"; pattern: RegExp }> = [
    { value: "high", pattern: /\b(?:luxury|luxurious|five[- ]star|premium|no budget limit|budget is not (?:a )?concern|best available)\b/ },
    { value: "mid", pattern: /\b(?:mid[- ]range|moderate budget|moderately priced)\b/ },
    { value: "value", pattern: /\b(?:on a (?:tight )?budget|budget[- ]conscious|low[- ]cost|good value|affordable)\b/ },
  ];
  const match = matches.find((candidate) => candidate.pattern.test(text));
  if (!match) return undefined;
  const sourceText = match.pattern.exec(text)?.[0];
  return { value: match.value, provenance: promptInferred(sourceText) };
}

function maximumStopsFromPrompt(prompt: string) {
  const text = normalize(prompt);
  const match = /\b(?:no more than|at most|maximum(?: of)?|max(?:imum)?(?: of)?|only)\s+(\d{1,2})\s+(?:stops?|bases?|destinations?)\b/.exec(text);
  return match ? { value: Number(match[1]), sourceText: match[0] } : undefined;
}

function maximumTransferMinutesFromPrompt(prompt: string) {
  const text = normalize(prompt);
  const match = /\b(?:(?:no|avoid)\s+(?:individual\s+)?transfers?\s+(?:over|above|longer than)|max(?:imum)?\s+(?:transfer(?: time)?|leg)(?:\s+of)?|transfers?\s+(?:must be|under|below|no more than))\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  const minutes = /^h/.test(match[2]) ? Math.round(value * 60) : Math.round(value);
  return minutes > 0 ? { value: minutes, sourceText: match[0] } : undefined;
}

const regionPlaceTypes = new Set<PlaceType>([
  "continent", "macro_region", "region", "sub_region", "archipelago", "natural_area", "coast", "mountain_range", "valley", "travel_corridor",
]);

function placeProvenance(mention: ResolvedPlaceMention): TripBriefProvenance {
  const inferred = mention.status === "partially_resolved" || mention.confidence.state === "inferred";
  const confidence: TripBriefConfidence = mention.confidence.level === "high"
    ? "high"
    : mention.confidence.level === "medium" ? "medium" : "low";
  return {
    source: "prompt",
    kind: inferred ? "inferred" : "explicit",
    confidence,
    sourceText: mention.sourceText,
  };
}

function mentionMatches(mention: ResolvedPlaceMention, value?: string) {
  if (!value) return false;
  const key = normalize(value);
  return [mention.canonicalName, mention.sourceText, ...mention.sourceTexts, ...mention.aliases]
    .some((candidate) => normalize(candidate) === key);
}

function destinationRoleForMention(
  mention: ResolvedPlaceMention,
  prompt: string,
  startText?: string,
  endText?: string,
  hasExplicitStartMention = false,
  hasExplicitEndMention = false,
): Pick<TripBriefDestination, "role" | "priority"> {
  if (mention.role === "fixed_start" || mention.role === "origin" || (!hasExplicitStartMention && mentionMatches(mention, startText))) {
    return { role: "arrival-gateway", priority: "required" };
  }
  if (mention.role === "fixed_end" || (!hasExplicitEndMention && mentionMatches(mention, endText))) {
    return { role: "departure-gateway", priority: "required" };
  }
  if (mention.role === "excluded") return { role: "excluded", priority: "normal" };
  if (mention.role === "required" || placeIsImportant(prompt, mention.sourceText)) {
    return { role: mention.isAnchor ? "trip-anchor" : "must-visit", priority: "required" };
  }
  if (mention.role === "anchor" || mention.isAnchor) return { role: "trip-anchor", priority: "high" };
  if (mention.role === "optional") return { role: "suggested", priority: "normal" };
  return { role: "preferred", priority: "normal" };
}

function destinationFromMention(
  mention: ResolvedPlaceMention,
  prompt: string,
  startText?: string,
  endText?: string,
  hasExplicitStartMention = false,
  hasExplicitEndMention = false,
): TripBriefDestination | undefined {
  // Exclusions remain first-class place mentions and hard constraints, but
  // are not positive destinations for routing or builder hydration.
  if (mention.role === "excluded") return undefined;
  return {
    name: mention.canonicalName,
    canonicalPlaceId: mention.canonicalPlaceId,
    placeMentionId: mention.mentionId,
    placeType: mention.placeType,
    resolutionStatus: mention.status,
    routability: mention.routability,
    sourceLabel: mention.sourceText,
    parentCountries: [...mention.parentCountries],
    parentCanonicalPlaceId: mention.parentRegionId,
    ...destinationRoleForMention(mention, prompt, startText, endText, hasExplicitStartMention, hasExplicitEndMention),
    provenance: placeProvenance(mention),
  };
}

function destinationIdentity(destination: Pick<TripBriefDestination, "canonicalPlaceId" | "name">) {
  const role = "role" in destination
    ? destination.role === "arrival-gateway" ? "origin"
      : destination.role === "departure-gateway" ? "end"
        : destination.role === "excluded" ? "excluded" : "stay"
    : "stay";
  return `${role}:${destination.canonicalPlaceId ? `place:${destination.canonicalPlaceId}` : `name:${normalize(destination.name)}`}`;
}

export function extractStructuredTripBrief(
  prompt: string,
  parserVersion?: string,
  suppliedPlaceIntelligence?: PlaceIntelligenceResult,
): StructuredTripBrief {
  const sourcePrompt = prompt;
  const rawPrompt = prompt.trim();
  // Capture may supply this result so the provider-neutral boundary runs only
  // once. Direct callers receive the same deterministic behavior here.
  const placeIntelligence = suppliedPlaceIntelligence ?? resolvePlaceMentions(rawPrompt);
  const placeMentions = placeIntelligence.mentions;
  const parsed = parseTripBrief(rawPrompt, placeIntelligence);
  const startText = explicitGateway(rawPrompt, "start") ?? parsed.origin;
  const endText = explicitGateway(rawPrompt, "end");
  const hasExplicitStartMention = placeMentions.some((mention) => mention.role === "origin" || mention.role === "fixed_start");
  const hasExplicitEndMention = placeMentions.some((mention) => mention.role === "fixed_end");
  const duration = durationFromPrompt(rawPrompt, parsed.durationDays);
  const countries = unique([
    ...placeMentions
      .filter((mention) => mention.placeType === "country" && mention.status !== "ambiguous" && mention.status !== "unresolved")
      .map((mention) => ({ value: mention.canonicalName, provenance: placeProvenance(mention) })),
    ...parsed.countries.map((value) => ({ value, provenance: promptExplicit(sourceExcerpt(rawPrompt, value)) })),
  ], (country) => normalize(country.value));
  const resolvedDestinations = placeMentions
    .map((mention) => destinationFromMention(mention, rawPrompt, startText, endText, hasExplicitStartMention, hasExplicitEndMention))
    .filter((destination): destination is TripBriefDestination => Boolean(destination));
  const fallbackNames = unique(
    [...(startText ? [startText] : []), ...parsed.stops, ...(endText ? [endText] : [])]
      .map((name) => name.trim())
      .filter((name) => Boolean(name) && !placeMentions.some((mention) => mentionMatches(mention, name))),
    (name) => normalize(name),
  );
  const fallbackDestinations = fallbackNames.map((name): TripBriefDestination => {
    const excerpt = sourceExcerpt(rawPrompt, name);
    if (startText && normalize(name) === normalize(startText)) return { name, role: "arrival-gateway", priority: "required", provenance: promptExplicit(excerpt) };
    if (endText && normalize(name) === normalize(endText)) return { name, role: "departure-gateway", priority: "required", provenance: promptExplicit(excerpt) };
    if (placeIsImportant(rawPrompt, name)) return { name, role: "trip-anchor", priority: "required", provenance: promptExplicit(excerpt) };
    return { name, role: "preferred", priority: "normal", provenance: promptExplicit(excerpt) };
  });
  const destinations = unique([...resolvedDestinations, ...fallbackDestinations], destinationIdentity);
  const mustVisit = destinations.filter((destination) => destination.priority === "required"
    && destination.role !== "arrival-gateway"
    && destination.role !== "departure-gateway"
    && destination.role !== "excluded");
  const hardConstraints: TripBriefHardConstraint[] = [];
  if (duration?.precision === "exact") hardConstraints.push({ type: "duration", duration });
  const startDestination = destinations.find((destination) => destination.role === "arrival-gateway");
  const endDestination = destinations.find((destination) => destination.role === "departure-gateway");
  if (startDestination) hardConstraints.push({ type: "start-at", value: startDestination.name, provenance: startDestination.provenance });
  if (endDestination) hardConstraints.push({ type: "end-at", value: endDestination.name, provenance: endDestination.provenance });
  mustVisit.forEach((destination) => hardConstraints.push({ type: "must-visit", value: destination.name, provenance: destination.provenance }));
  placeMentions.filter((mention) => mention.role === "excluded" && mention.status !== "ambiguous" && mention.status !== "unresolved")
    .forEach((mention) => hardConstraints.push({ type: "excluded-destination", value: mention.canonicalName, provenance: placeProvenance(mention) }));
  const noDriving = parsed.avoidDriving
    || /\bno[-\s]+driving\b/i.test(rawPrompt)
    || /\b(?:i\s+)?(?:don't|dont|do not|won't|will not)\s+(?:want to\s+)?driv(?:e|ing)\b/i.test(rawPrompt);
  if (noDriving) hardConstraints.push({ type: "no-driving", value: true, provenance: promptExplicit("no driving") });
  const noFlying = /\b(?:no|without)\s+(?:flights?|flying)\b/i.test(rawPrompt)
    || /\b(?:i\s+)?(?:don't|dont|do not|won't|will not)\s+(?:want to\s+)?fly\b/i.test(rawPrompt);
  if (noFlying) hardConstraints.push({ type: "no-flying", value: true, provenance: promptExplicit("no flights") });
  const maximumStops = maximumStopsFromPrompt(rawPrompt);
  if (maximumStops) hardConstraints.push({ type: "maximum-stops", value: maximumStops.value, provenance: promptExplicit(maximumStops.sourceText) });
  const maximumTransferMinutes = maximumTransferMinutesFromPrompt(rawPrompt);
  if (maximumTransferMinutes) hardConstraints.push({ type: "maximum-transfer-time", value: maximumTransferMinutes.value, unit: "minutes", provenance: promptExplicit(maximumTransferMinutes.sourceText) });

  const transportPreferences: StructuredTripBrief["transportPreferences"] = [];
  const avoidsFlights = noFlying || /\b(?:instead of|rather than|avoid)\s+(?:taking\s+)?flights?\b/i.test(rawPrompt);
  (parsed.transportModes ?? []).filter((mode) => (!noDriving || mode !== "drive") && (!avoidsFlights || mode !== "flight")).forEach((mode) => transportPreferences.push({ value: mode, provenance: promptInferred(sourceExcerpt(rawPrompt, mode)) }));
  const overlandPreference = /\b(?:prefer(?:red|ring)?\s+(?:to\s+travel\s+)?overland|travel\s+overland|overland\s+(?:where|when)\s+(?:practical|possible|sensible)|by\s+(?:public\s+)?ground\s+transport|ground transport|public transport|road trip)\b/i.exec(rawPrompt)?.[0];
  if (overlandPreference) transportPreferences.push({ value: "ground", provenance: promptInferred(overlandPreference) });
  if (/\b(prefer|rather|instead of).{0,28}train|trains?.{0,28}(when practical|where sensible|if practical)/i.test(rawPrompt)) {
    transportPreferences.push({ value: "train", provenance: promptInferred("train preference") });
  }
  if (avoidsFlights) transportPreferences.push({ value: "avoid-flight", provenance: promptInferred("flight preference") });

  const accommodationPreferences: StructuredTripBrief["accommodationPreferences"] = [];
  if (/\b(?:don't|do not|dont|avoid)\s+(?:want to be\s+)?mov(?:e|ing)\s+(?:hotels?\s+)?every day|fewer hotel changes|one base\b/i.test(rawPrompt)) {
    accommodationPreferences.push({ value: "fewer-hotel-changes", provenance: promptInferred("avoid moving every day") });
  }
  const pace = parsed.pace ? { value: parsed.pace, provenance: promptInferred(sourceExcerpt(rawPrompt, parsed.pace)) } as StructuredTripBrief["pace"] : undefined;
  const interests = extractedInterests(rawPrompt).map((value) => ({ value, provenance: promptInferred(sourceExcerpt(rawPrompt, value)) }));
  const resolvedRegions = placeMentions
    .filter((mention) => regionPlaceTypes.has(mention.placeType) && mention.status !== "ambiguous" && mention.status !== "unresolved" && mention.role !== "excluded")
    .map((mention) => ({ value: mention.canonicalName, provenance: placeProvenance(mention) }));
  const hasExactMountainRegion = placeMentions.some((mention) => mention.placeType === "mountain_range"
    || /\balps?\b/i.test(mention.canonicalName));
  const preferredRegions = unique([
    ...resolvedRegions,
    ...parsed.regions.map((value) => ({ value, provenance: promptInferred(sourceExcerpt(rawPrompt, value)) })),
    ...(interests.some((interest) => interest.value === "mountains") && !hasExactMountainRegion
      ? [{ value: "Mountains", provenance: promptInferred(sourceExcerpt(rawPrompt, "mountains")) }]
      : []),
  ], (region) => normalize(region.value));
  const travellers = parsed.travellerCount
    ? { value: parsed.travellerCount, provenance: promptExplicit(sourceExcerpt(rawPrompt, String(parsed.travellerCount))) }
    : undefined;
  const budget = budgetFromPrompt(rawPrompt);
  const softPreferences: TripBriefSoftPreference[] = [
    ...transportPreferences.map((item) => ({ type: "transport" as const, value: item.value, provenance: item.provenance })),
    ...(pace ? [{ type: "pace" as const, value: pace.value, provenance: pace.provenance }] : []),
    ...interests.map((item) => ({ type: "interest" as const, value: item.value, provenance: item.provenance })),
    ...accommodationPreferences.map((item) => ({ type: "accommodation" as const, value: item.value, provenance: item.provenance })),
    ...preferredRegions.map((item) => ({ type: "region" as const, value: item.value, provenance: item.provenance })),
    ...(budget ? [{ type: "budget" as const, value: budget.value, provenance: budget.provenance }] : []),
  ];
  const brief: StructuredTripBrief = {
    version: STRUCTURED_TRIP_BRIEF_VERSION,
    duration,
    destinations,
    mustVisit,
    countries,
    preferredRegions,
    travellers,
    dates: {},
    pace,
    interests,
    transportPreferences: unique(transportPreferences, (item) => item.value),
    accommodationPreferences,
    budget,
    hardConstraints,
    softPreferences,
    source: { rawPrompt: sourcePrompt, parserVersion: parserVersion ?? placeIntelligence.parserVersion, inputs: ["prompt"] },
    confidence: destinations.length || duration || travellers ? "high" : "low",
    issues: [],
    placeMentions,
    placeIssues: placeIntelligence.issues,
    placeSelections: [],
    completedPlanningAreaMentionIds: [],
    removedPlaceMentionIds: [],
  };
  return { ...brief, issues: validateStructuredTripBrief(brief) };
}

function fact<T>(value: T): SourcedTripValue<T> {
  return { value, provenance: builderExplicit() };
}

export function mergeStructuredTripBrief(base: StructuredTripBrief, input: StructuredTripBriefBuilderInput): StructuredTripBrief {
  const removedPlaceMentionIds = unique(input.removedPlaceMentionIds ?? base.removedPlaceMentionIds ?? [], (value) => value);
  const removedMentionIdSet = new Set(removedPlaceMentionIds);
  const removedMentions = (base.placeMentions ?? []).filter((mention) => removedMentionIdSet.has(mention.mentionId));
  const removedNames = new Set(removedMentions.flatMap((mention) => [mention.canonicalName, mention.sourceText, ...mention.sourceTexts].map(normalize)));
  const priorSelections = base.placeSelections ?? [];
  const multiPlaceMentionIds = new Set((base.placeMentions ?? [])
    .filter(placeMentionSupportsMultipleSelections)
    .map((mention) => mention.mentionId));
  const proposedPlaceSelections = (input.placeSelections
    ? unique([...input.placeSelections, ...priorSelections], (selection) => multiPlaceMentionIds.has(selection.mentionId)
      ? `${selection.mentionId}|${selection.kind}|${selection.selectedCanonicalPlaceId}`
      : selection.mentionId)
    : priorSelections).filter((selection) => !removedMentionIdSet.has(selection.mentionId));
  const completedPlanningAreaMentionIds = unique(
    input.completedPlanningAreaMentionIds ?? base.completedPlanningAreaMentionIds ?? [],
    (value) => value,
  ).filter((mentionId) => !removedMentionIdSet.has(mentionId));
  const completedPlanningAreaMentionIdSet = new Set(completedPlanningAreaMentionIds);
  const selfBaseState = reconcileSelfBasePlaceState(base.placeMentions ?? [], proposedPlaceSelections);
  let placeSelections = selfBaseState.selections;
  let staleVisitMentionIds = new Set<string>();
  let activeRouteCanonicalPlaceIds: Set<string> | undefined;
  const selectedDestinations = input.destinations?.map((destination): TripBriefDestination => {
    const prior = base.destinations.find((item) => (destination.canonicalPlaceId && item.canonicalPlaceId === destination.canonicalPlaceId)
      || normalize(item.name) === normalize(destination.name))
      ?? (!destination.canonicalPlaceId
        ? base.destinations.find((item) => destination.placeMentionId && item.placeMentionId === destination.placeMentionId)
        : undefined);
    const selection = placeSelections.find((item) => item.mentionId === destination.placeMentionId
      && (item.routeStopId === destination.id || item.selectedCanonicalPlaceId === destination.canonicalPlaceId))
      ?? placeSelections.find((item) => item.mentionId === destination.placeMentionId);
    return {
      ...prior,
      ...destination,
      id: destination.id ?? selection?.routeStopId ?? prior?.id,
      role: destination.role ?? prior?.role ?? "preferred",
      priority: destination.priority ?? prior?.priority ?? "normal",
      provenance: builderExplicit(),
    };
  }).filter((destination) => !destination.placeMentionId || !removedMentionIdSet.has(destination.placeMentionId));
  const selectedIdentities = new Set((selectedDestinations ?? []).map(destinationIdentity));
  const preservedDestinations = base.destinations.filter((destination) => !destination.placeMentionId || !removedMentionIdSet.has(destination.placeMentionId))
    .filter((destination) => !selectedIdentities.has(destinationIdentity(destination)));
  const destinations = unique(
    selectedDestinations ? [...selectedDestinations, ...preservedDestinations] : preservedDestinations,
    destinationIdentity,
  );
  if (input.destinations) {
    const activeRouteStopIds = new Set(input.destinations.flatMap((destination) => destination.id ? [destination.id] : []));
    activeRouteCanonicalPlaceIds = new Set(input.destinations.flatMap((destination) => destination.canonicalPlaceId ? [destination.canonicalPlaceId] : []));
    staleVisitMentionIds = new Set(placeSelections.filter((selection) => selection.kind === "visit"
      && selection.routeStopId
      && !activeRouteStopIds.has(selection.routeStopId)).map((selection) => selection.mentionId));
    placeSelections = placeSelections.filter((selection) => selection.kind !== "visit"
      || !selection.routeStopId
      || activeRouteStopIds.has(selection.routeStopId));
  }
  const mustVisitNames = input.mustVisit ?? base.mustVisit.map((destination) => destination.name);
  const mustVisit = mustVisitNames
    .filter((name) => !removedNames.has(normalize(name)))
    .map((name) => destinations.find((destination) => normalize(destination.name) === normalize(name)) ?? {
      name, role: "must-visit" as const, priority: "required" as const, provenance: builderExplicit(),
    });
  const duration = input.duration ? { ...input.duration, precision: input.duration.precision ?? "exact", provenance: builderExplicit() } : base.duration;
  const dates: TripBriefDates = input.dates ? {
    start: input.dates.start ? fact(input.dates.start) : base.dates.start,
    end: input.dates.end ? fact(input.dates.end) : base.dates.end,
    fixed: input.dates.fixed !== undefined ? fact(input.dates.fixed) : base.dates.fixed,
  } : base.dates;
  const hardConstraints = base.hardConstraints.filter((constraint) => ![
    "duration", "start-at", "end-at", "must-visit", "no-driving", "no-flying", "maximum-stops", "maximum-transfer-time", "excluded-destination", "fixed-commitment",
  ].includes(constraint.type));
  if (duration?.precision === "exact") hardConstraints.push({ type: "duration", duration });
  const destinationIsActive = (destination: TripBriefDestination) => !destination.placeMentionId
    || !removedMentionIdSet.has(destination.placeMentionId);
  const selectedStart = destinations.find((destination) => destination.role === "arrival-gateway" && destinationIsActive(destination));
  const selectedEnd = destinations.find((destination) => destination.role === "departure-gateway" && destinationIsActive(destination));
  const priorStart = base.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "start-at"; value: string } => constraint.type === "start-at");
  const priorEnd = base.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "end-at"; value: string } => constraint.type === "end-at");
  if (selectedStart) hardConstraints.push({ type: "start-at", value: selectedStart.name, provenance: selectedStart.provenance });
  else if (priorStart && !removedNames.has(normalize(priorStart.value))) hardConstraints.push(priorStart);
  if (selectedEnd) hardConstraints.push({ type: "end-at", value: selectedEnd.name, provenance: selectedEnd.provenance });
  else if (priorEnd && !removedNames.has(normalize(priorEnd.value))) hardConstraints.push(priorEnd);
  mustVisit.forEach((destination) => hardConstraints.push({ type: "must-visit", value: destination.name, provenance: destination.provenance }));
  const existingNoDriving = base.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "no-driving" } => constraint.type === "no-driving");
  if (input.avoidDriving ?? Boolean(existingNoDriving)) hardConstraints.push({ type: "no-driving", value: true, provenance: existingNoDriving?.provenance ?? builderExplicit() });
  const existingNoFlying = base.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "no-flying" } => constraint.type === "no-flying");
  if (input.avoidFlying ?? Boolean(existingNoFlying)) hardConstraints.push({ type: "no-flying", value: true, provenance: existingNoFlying?.provenance ?? builderExplicit() });
  const priorMaximum = base.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-stops" }> => constraint.type === "maximum-stops");
  if (input.maximumStops !== undefined) hardConstraints.push({ type: "maximum-stops", value: input.maximumStops, provenance: builderExplicit() });
  else if (priorMaximum) hardConstraints.push(priorMaximum);
  const priorMaximumTransfer = base.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-transfer-time" }> => constraint.type === "maximum-transfer-time");
  if (input.maximumTransferMinutes !== undefined) hardConstraints.push({ type: "maximum-transfer-time", value: input.maximumTransferMinutes, unit: "minutes", provenance: builderExplicit() });
  else if (priorMaximumTransfer) hardConstraints.push(priorMaximumTransfer);
  if (input.excludedDestinations) input.excludedDestinations.forEach((value) => hardConstraints.push({ type: "excluded-destination", value, provenance: builderExplicit() }));
  else hardConstraints.push(...base.hardConstraints.filter((constraint) => constraint.type === "excluded-destination" && !removedNames.has(normalize(constraint.value))));
  if (input.fixedCommitments) input.fixedCommitments.forEach((item) => hardConstraints.push({ type: "fixed-commitment", value: item.label, date: item.date, provenance: builderExplicit() }));
  else hardConstraints.push(...base.hardConstraints.filter((constraint) => constraint.type === "fixed-commitment"));

  const pace = input.pace ? fact(input.pace) : base.pace;
  const interests = input.interests ? input.interests.map(fact) : base.interests;
  const transportPreferences = input.transportPreferences ? input.transportPreferences.map(fact) : base.transportPreferences;
  const accommodationPreferences = input.accommodationPreferences ? input.accommodationPreferences.map(fact) : base.accommodationPreferences;
  const countries = input.countries
    ? input.countries.map(fact)
    : (base.countries ?? []).filter((country) => !removedNames.has(normalize(country.value)));
  const preferredRegions = input.preferredRegions
    ? input.preferredRegions.map(fact)
    : base.preferredRegions.filter((region) => !removedNames.has(normalize(region.value)));
  const budget = input.budget ? fact(input.budget) : base.budget;
  const softPreferences: TripBriefSoftPreference[] = [
    ...transportPreferences.map((item) => ({ type: "transport" as const, value: item.value, provenance: item.provenance })),
    ...(pace ? [{ type: "pace" as const, value: pace.value, provenance: pace.provenance }] : []),
    ...interests.map((item) => ({ type: "interest" as const, value: item.value, provenance: item.provenance })),
    ...accommodationPreferences.map((item) => ({ type: "accommodation" as const, value: item.value, provenance: item.provenance })),
    ...preferredRegions.map((item) => ({ type: "region" as const, value: item.value, provenance: item.provenance })),
    ...(budget ? [{ type: "budget" as const, value: budget.value, provenance: budget.provenance }] : []),
  ];
  const merged: StructuredTripBrief = {
    ...base,
    duration,
    destinations,
    mustVisit,
    countries,
    preferredRegions,
    travellers: input.travellers !== undefined ? fact(input.travellers) : base.travellers,
    dates,
    pace,
    interests,
    transportPreferences,
    accommodationPreferences,
    budget,
    hardConstraints,
    softPreferences,
    placeMentions: selfBaseState.mentions.length ? selfBaseState.mentions : base.placeMentions,
    placeIssues: unique([...(base.placeIssues ?? []), ...placeResolutionIssuesForMentions((base.placeMentions ?? []).filter((mention) => staleVisitMentionIds.has(mention.mentionId)
      || !activeRouteCanonicalPlaceIds
      || Boolean(mention.canonicalPlaceId && activeRouteCanonicalPlaceIds.has(mention.canonicalPlaceId))))
      .filter((issue) => staleVisitMentionIds.has(issue.mentionId))], (issue) => `${issue.code}|${issue.mentionId}`).filter((issue) => {
      if (removedMentionIdSet.has(issue.mentionId)) return false;
      if (selfBaseState.collapsedMentionIds.has(issue.mentionId) && issue.code === "region_requires_base") return false;
      if (issue.code === "missing_routable_destination" && destinations.some((destination) => Boolean(destination.id))) return false;
      const selection = placeSelections.find((item) => item.mentionId === issue.mentionId);
      if (!selection) return true;
      const mention = (base.placeMentions ?? []).find((item) => item.mentionId === issue.mentionId);
      if (issue.code === "region_requires_base" && mention
        && placeMentionSupportsMultipleSelections(mention)
        && !completedPlanningAreaMentionIdSet.has(issue.mentionId)) return true;
      return issue.code === "duplicate_alias" || issue.code === "conflicting_place_roles" || issue.code === "unsupported_containment";
    }),
    placeSelections,
    completedPlanningAreaMentionIds,
    removedPlaceMentionIds,
    source: { ...base.source, inputs: unique([...base.source.inputs, "builder"], (value) => value) },
  };
  return { ...merged, issues: validateStructuredTripBrief(merged) };
}

/**
 * Backward-compatible normalization for saved trips that predate structured
 * place metadata. It derives only from persisted selections and never
 * reinterprets the old free-form prompt on each load.
 */
export function structuredTripBriefFromSavedSelections(input: StructuredTripBriefBuilderInput): StructuredTripBrief {
  const empty = extractStructuredTripBrief("");
  const merged = mergeStructuredTripBrief(empty, input);
  return {
    ...merged,
    source: { parserVersion: "saved-selection-compat-v1", inputs: ["saved"] },
    confidence: input.destinations?.length ? "high" : "low",
    placeMentions: undefined,
    placeIssues: undefined,
    placeSelections: undefined,
    completedPlanningAreaMentionIds: undefined,
    removedPlaceMentionIds: undefined,
  };
}

export function validateStructuredTripBrief(brief: Omit<StructuredTripBrief, "issues"> | StructuredTripBrief): TripBriefValidationIssue[] {
  const issues: TripBriefValidationIssue[] = [];
  const start = brief.dates.start?.value;
  const end = brief.dates.end?.value;
  if (start && end) {
    const startTime = +new Date(`${start}T00:00:00`);
    const endTime = +new Date(`${end}T00:00:00`);
    if (endTime < startTime) issues.push({ code: "END_BEFORE_START", severity: "error", message: "The end date is before the start date.", fields: ["dates.start", "dates.end"] });
    else if (brief.duration?.precision === "exact") {
      const dateNights = Math.round((endTime - startTime) / 86400000);
      const expectedNights = brief.duration.unit === "nights" ? brief.duration.value : Math.max(0, brief.duration.value - 1);
      if (dateNights !== expectedNights) issues.push({ code: "DURATION_DATE_MISMATCH", severity: "error", message: `The fixed dates span ${dateNights} nights, but the brief requires ${brief.duration.value} ${brief.duration.unit}.`, fields: ["duration", "dates"] });
    }
  }
  if (brief.travellers && (!Number.isInteger(brief.travellers.value) || brief.travellers.value < 1)) issues.push({ code: "INVALID_TRAVELLERS", severity: "error", message: "Traveller count must be at least one.", fields: ["travellers"] });
  const excluded = brief.hardConstraints.filter((constraint): constraint is TripBriefHardConstraint & { type: "excluded-destination"; value: string } => constraint.type === "excluded-destination");
  const conflict = brief.mustVisit.find((required) => excluded.some((item) => {
    const excludedIdentity = normalize(item.value);
    return excludedIdentity === normalize(required.name)
      || (required.parentCountries ?? []).some((country) => normalize(country) === excludedIdentity);
  }));
  if (conflict) issues.push({ code: "REQUIRED_DESTINATION_EXCLUDED", severity: "error", message: `${conflict.name} is required but lies inside an explicitly excluded destination.`, fields: ["mustVisit", "hardConstraints"] });
  const maxStops = brief.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-stops" }> => constraint.type === "maximum-stops");
  if (maxStops && maxStops.value < brief.mustVisit.length) issues.push({ code: "MAX_STOPS_BELOW_REQUIRED", severity: "error", message: `The maximum of ${maxStops.value} stops cannot include all ${brief.mustVisit.length} required places.`, fields: ["mustVisit", "hardConstraints.maximumStops"] });
  const rawPrompt = brief.source.rawPrompt ?? "";
  const explicitTotalBudget = /(?:[£$€]\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:gbp|usd|eur|pounds?|dollars?|euros?))\b/i.test(rawPrompt)
    && /\b(?:total|all[- ]in|entire trip|whole trip|maximum|max|budget)\b/i.test(rawPrompt);
  if (explicitTotalBudget) issues.push({
    code: "UNSUPPORTED_TOTAL_BUDGET_CONSTRAINT",
    severity: "error",
    message: "Morrovia cannot verify an exact total-trip budget from its current non-live pricing evidence.",
    fields: ["budget", "source.rawPrompt"],
  });
  return issues;
}

export function routePreferencesFromStructuredBrief(brief: StructuredTripBrief) {
  const avoidDriving = brief.hardConstraints.some((constraint) => constraint.type === "no-driving");
  const avoidFlights = brief.hardConstraints.some((constraint) => constraint.type === "no-flying")
    || brief.transportPreferences.some((preference) => preference.value === "avoid-flight");
  const modes = brief.transportPreferences
    .flatMap((preference) => preference.value === "ground" ? ["train" as const, "drive" as const] : preference.value === "avoid-flight" ? [] : [preference.value])
    .filter((mode) => !avoidDriving || mode !== "drive");
  return {
    avoidDriving,
    avoidFlights,
    transportModes: unique(modes.filter((mode): mode is "flight" | "train" | "drive" => mode === "flight" || mode === "train" || mode === "drive"), (mode) => mode),
  };
}

/** Soft route preferences influence scoring but never make a candidate invalid. */
export function routeScoringPreferencesFromStructuredBrief(brief: StructuredTripBrief) {
  const preferences = routePreferencesFromStructuredBrief(brief);
  return {
    pace: brief.pace?.value,
    preferredModes: preferences.transportModes.map((mode) => mode === "drive" ? "road" as const : mode),
    avoidFlights: preferences.avoidFlights,
    interests: normalizeTripInterests(brief.interests.map((interest) => interest.value)),
  };
}

/** Hard route constraints are derived separately from soft transport preferences. */
export function routeConstraintsFromStructuredTripBrief(brief: StructuredTripBrief, routeStopIds?: readonly string[]) {
  const activeRouteStopIds = routeStopIds ? new Set(routeStopIds) : null;
  const destinationId = (name: string, matchesRole: (destination: TripBriefDestination) => boolean) => {
    const id = brief.destinations.find((destination) => destination.id
      && normalize(destination.name) === normalize(name)
      && matchesRole(destination))?.id;
    return id && (!activeRouteStopIds || activeRouteStopIds.has(id)) ? id : undefined;
  };
  const activeStayId = (name: string) => destinationId(name, (destination) => destination.role !== "arrival-gateway"
    && destination.role !== "departure-gateway"
    && destination.role !== "excluded");
  const start = brief.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "start-at"; value: string } => constraint.type === "start-at");
  const end = brief.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "end-at"; value: string } => constraint.type === "end-at");
  const maximum = brief.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-stops" }> => constraint.type === "maximum-stops");
  const maximumTransfer = brief.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-transfer-time" }> => constraint.type === "maximum-transfer-time");
  const fixedCommitments = brief.hardConstraints
    .filter((constraint): constraint is Extract<TripBriefHardConstraint, { type: "fixed-commitment" }> => constraint.type === "fixed-commitment")
    .map((constraint) => ({ label: constraint.value, date: constraint.date }));
  const requiredStopIds = brief.hardConstraints
    .filter((constraint): constraint is TripBriefHardConstraint & { type: "must-visit"; value: string } => constraint.type === "must-visit")
    .flatMap((constraint) => activeStayId(constraint.value) ?? []);
  const excludedStopIds = brief.hardConstraints
    .filter((constraint): constraint is TripBriefHardConstraint & { type: "excluded-destination"; value: string } => constraint.type === "excluded-destination")
    .flatMap((constraint) => activeStayId(constraint.value) ?? []);
  const preferences = routePreferencesFromStructuredBrief(brief);
  const noFlying = brief.hardConstraints.some((constraint) => constraint.type === "no-flying");
  return {
    fixedStartStopId: start ? destinationId(start.value, (destination) => destination.role === "arrival-gateway") : undefined,
    fixedEndStopId: end ? destinationId(end.value, (destination) => destination.role === "departure-gateway") : undefined,
    requiredStopIds: unique(requiredStopIds, (id) => id),
    excludedStopIds: unique(excludedStopIds, (id) => id),
    maximumStops: maximum?.value,
    maximumTransferMinutes: maximumTransfer?.value,
    fixedCommitments,
    avoidDriving: preferences.avoidDriving,
    excludedTransportModes: [
      ...(preferences.avoidDriving ? ["road" as const] : []),
      ...(noFlying ? ["flight" as const] : []),
    ],
    transportModes: preferences.transportModes,
  };
}

export function formatStructuredTripBriefDebug(brief: StructuredTripBrief) {
  const line = <T>(label: string, value?: SourcedTripValue<T>) => `${label}: ${value ? `${String(value.value)} — ${value.provenance.source}/${value.provenance.kind}` : "unknown"}`;
  return [
    brief.duration ? `Duration: ${brief.duration.value} ${brief.duration.unit} — ${brief.duration.provenance.source}/${brief.duration.provenance.kind}` : "Duration: unknown",
    `Must visit: ${brief.mustVisit.length ? brief.mustVisit.map((place) => `${place.name} — ${place.provenance.source}/${place.provenance.kind}`).join(", ") : "unknown"}`,
    `Countries: ${brief.countries?.length ? brief.countries.map((country) => `${country.value} — ${country.provenance.source}/${country.provenance.kind}`).join(", ") : "unknown"}`,
    `Start: ${brief.destinations.find((place) => place.role === "arrival-gateway")?.name ?? "unknown"}`,
    `End: ${brief.destinations.find((place) => place.role === "departure-gateway")?.name ?? "unknown"}`,
    line("Pace", brief.pace),
    `Transport: ${brief.transportPreferences.length ? brief.transportPreferences.map((item) => `${item.value} — ${item.provenance.source}/${item.provenance.kind}`).join(", ") : "unknown"}`,
    line("Travellers", brief.travellers),
    line("Budget", brief.budget),
    `Issues: ${brief.issues.length ? brief.issues.map((issue) => issue.code).join(", ") : "none"}`,
  ].join("\n");
}
