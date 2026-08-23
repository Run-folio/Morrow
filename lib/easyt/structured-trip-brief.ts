import { parseTripBrief } from "./trip-brief.ts";
import {
  aggregatePlanningConfidence,
  planningConfidenceFromIntentProvenance,
  unknownPlanningConfidence,
  type PlanningConfidence,
} from "./planning-confidence.ts";

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
  id?: string;
  name: string;
  role: "arrival-gateway" | "departure-gateway" | "must-visit" | "preferred" | "suggested" | "trip-anchor";
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
  | { type: "maximum-stops"; value: number; provenance: TripBriefProvenance }
  | { type: "fixed-commitment"; value: string; date?: string; provenance: TripBriefProvenance };
export type TripBriefSoftPreference = {
  type: "transport" | "pace" | "interest" | "accommodation" | "budget" | "region";
  value: string;
  provenance: TripBriefProvenance;
};
export type TripBriefValidationIssue = {
  code: "END_BEFORE_START" | "DURATION_DATE_MISMATCH" | "INVALID_TRAVELLERS" | "REQUIRED_DESTINATION_EXCLUDED" | "MAX_STOPS_BELOW_REQUIRED";
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
};

export type StructuredTripBriefBuilderInput = {
  duration?: { value: number; unit: "days" | "nights"; precision?: "exact" | "approximate" };
  destinations?: Array<{ id?: string; name: string; role?: TripBriefDestination["role"]; priority?: TripBriefDestination["priority"] }>;
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
  excludedDestinations?: string[];
  fixedCommitments?: Array<{ label: string; date?: string }>;
  avoidDriving?: boolean;
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
    ? /(?:start|begin)(?:ing)?\s+(?:in|at)\s+([^,.\n;]+)/i
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
    ["mountains", /\b(mountains?|alps|hiking|trekking)\b/],
    ["coast", /\b(coast|beach|seaside|ocean)\b/],
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

export function extractStructuredTripBrief(prompt: string, parserVersion = "structured-brief-v1-deterministic"): StructuredTripBrief {
  const rawPrompt = prompt.trim();
  const parsed = parseTripBrief(rawPrompt);
  const startText = explicitGateway(rawPrompt, "start") ?? parsed.origin;
  const endText = explicitGateway(rawPrompt, "end");
  const duration = durationFromPrompt(rawPrompt, parsed.durationDays);
  const countries = parsed.countries.map((value) => ({ value, provenance: promptExplicit(sourceExcerpt(rawPrompt, value)) }));
  const destinationNames = unique(
    [...(startText ? [startText] : []), ...parsed.stops, ...(endText ? [endText] : [])].map((name) => name.trim()).filter(Boolean),
    (name) => normalize(name),
  );
  const destinations = destinationNames.map((name): TripBriefDestination => {
    const excerpt = sourceExcerpt(rawPrompt, name);
    if (startText && normalize(name) === normalize(startText)) return { name, role: "arrival-gateway", priority: "required", provenance: promptExplicit(excerpt) };
    if (endText && normalize(name) === normalize(endText)) return { name, role: "departure-gateway", priority: "required", provenance: promptExplicit(excerpt) };
    if (placeIsImportant(rawPrompt, name)) return { name, role: "trip-anchor", priority: "required", provenance: promptExplicit(excerpt) };
    return { name, role: "preferred", priority: "normal", provenance: promptExplicit(excerpt) };
  });
  const mustVisit = destinations.filter((destination) => destination.priority === "required" && destination.role !== "arrival-gateway" && destination.role !== "departure-gateway");
  const hardConstraints: TripBriefHardConstraint[] = [];
  if (duration?.precision === "exact") hardConstraints.push({ type: "duration", duration });
  if (startText) hardConstraints.push({ type: "start-at", value: startText, provenance: promptExplicit(sourceExcerpt(rawPrompt, startText)) });
  if (endText) hardConstraints.push({ type: "end-at", value: endText, provenance: promptExplicit(sourceExcerpt(rawPrompt, endText)) });
  mustVisit.forEach((destination) => hardConstraints.push({ type: "must-visit", value: destination.name, provenance: destination.provenance }));
  const noDriving = parsed.avoidDriving || /\b(?:i\s+)?(?:don't|dont|do not|won't|will not)\s+(?:want to\s+)?driv(?:e|ing)\b/i.test(rawPrompt);
  if (noDriving) hardConstraints.push({ type: "no-driving", value: true, provenance: promptExplicit("no driving") });
  const maximumStops = maximumStopsFromPrompt(rawPrompt);
  if (maximumStops) hardConstraints.push({ type: "maximum-stops", value: maximumStops.value, provenance: promptExplicit(maximumStops.sourceText) });

  const transportPreferences: StructuredTripBrief["transportPreferences"] = [];
  const avoidsFlights = /\b(?:instead of|rather than|avoid)\s+(?:taking\s+)?flights?\b/i.test(rawPrompt);
  (parsed.transportModes ?? []).filter((mode) => (!noDriving || mode !== "drive") && (!avoidsFlights || mode !== "flight")).forEach((mode) => transportPreferences.push({ value: mode, provenance: promptInferred(sourceExcerpt(rawPrompt, mode)) }));
  if (/\bground transport\b/i.test(rawPrompt)) transportPreferences.push({ value: "ground", provenance: promptInferred("ground transport") });
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
  const preferredRegions = unique(
    [...parsed.regions, ...(interests.some((interest) => interest.value === "mountains") ? ["Mountains"] : [])]
      .map((value) => ({ value, provenance: promptInferred(sourceExcerpt(rawPrompt, value)) })),
    (region) => normalize(region.value),
  );
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
    source: { rawPrompt, parserVersion, inputs: ["prompt"] },
    confidence: destinations.length || duration || travellers ? "high" : "low",
    issues: [],
  };
  return { ...brief, issues: validateStructuredTripBrief(brief) };
}

function fact<T>(value: T): SourcedTripValue<T> {
  return { value, provenance: builderExplicit() };
}

export function mergeStructuredTripBrief(base: StructuredTripBrief, input: StructuredTripBriefBuilderInput): StructuredTripBrief {
  const selectedDestinations = input.destinations?.map((destination): TripBriefDestination => {
    const prior = base.destinations.find((item) => normalize(item.name) === normalize(destination.name));
    return {
      ...destination,
      role: destination.role ?? prior?.role ?? "preferred",
      priority: destination.priority ?? prior?.priority ?? "normal",
      provenance: builderExplicit(),
    };
  });
  const destinations = selectedDestinations ?? base.destinations;
  const mustVisitNames = input.mustVisit ?? base.mustVisit.map((destination) => destination.name);
  const mustVisit = mustVisitNames.map((name) => destinations.find((destination) => normalize(destination.name) === normalize(name)) ?? {
    name, role: "must-visit" as const, priority: "required" as const, provenance: builderExplicit(),
  });
  const duration = input.duration ? { ...input.duration, precision: input.duration.precision ?? "exact", provenance: builderExplicit() } : base.duration;
  const dates: TripBriefDates = input.dates ? {
    start: input.dates.start ? fact(input.dates.start) : base.dates.start,
    end: input.dates.end ? fact(input.dates.end) : base.dates.end,
    fixed: input.dates.fixed !== undefined ? fact(input.dates.fixed) : base.dates.fixed,
  } : base.dates;
  const hardConstraints = base.hardConstraints.filter((constraint) => ![
    "duration", "must-visit", "no-driving", "maximum-stops", "excluded-destination", "fixed-commitment",
  ].includes(constraint.type));
  if (duration?.precision === "exact") hardConstraints.push({ type: "duration", duration });
  mustVisit.forEach((destination) => hardConstraints.push({ type: "must-visit", value: destination.name, provenance: destination.provenance }));
  const existingNoDriving = base.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "no-driving" } => constraint.type === "no-driving");
  if (input.avoidDriving ?? Boolean(existingNoDriving)) hardConstraints.push({ type: "no-driving", value: true, provenance: existingNoDriving?.provenance ?? builderExplicit() });
  const priorMaximum = base.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-stops" }> => constraint.type === "maximum-stops");
  if (input.maximumStops !== undefined) hardConstraints.push({ type: "maximum-stops", value: input.maximumStops, provenance: builderExplicit() });
  else if (priorMaximum) hardConstraints.push(priorMaximum);
  if (input.excludedDestinations) input.excludedDestinations.forEach((value) => hardConstraints.push({ type: "excluded-destination", value, provenance: builderExplicit() }));
  else hardConstraints.push(...base.hardConstraints.filter((constraint) => constraint.type === "excluded-destination"));
  if (input.fixedCommitments) input.fixedCommitments.forEach((item) => hardConstraints.push({ type: "fixed-commitment", value: item.label, date: item.date, provenance: builderExplicit() }));
  else hardConstraints.push(...base.hardConstraints.filter((constraint) => constraint.type === "fixed-commitment"));

  const pace = input.pace ? fact(input.pace) : base.pace;
  const interests = input.interests ? input.interests.map(fact) : base.interests;
  const transportPreferences = input.transportPreferences ? input.transportPreferences.map(fact) : base.transportPreferences;
  const accommodationPreferences = input.accommodationPreferences ? input.accommodationPreferences.map(fact) : base.accommodationPreferences;
  const countries = input.countries ? input.countries.map(fact) : (base.countries ?? []);
  const preferredRegions = input.preferredRegions ? input.preferredRegions.map(fact) : base.preferredRegions;
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
    source: { ...base.source, inputs: unique([...base.source.inputs, "builder"], (value) => value) },
  };
  return { ...merged, issues: validateStructuredTripBrief(merged) };
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
  const conflict = brief.mustVisit.find((required) => excluded.some((item) => normalize(item.value) === normalize(required.name)));
  if (conflict) issues.push({ code: "REQUIRED_DESTINATION_EXCLUDED", severity: "error", message: `${conflict.name} is both required and excluded.`, fields: ["mustVisit", "hardConstraints"] });
  const maxStops = brief.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-stops" }> => constraint.type === "maximum-stops");
  if (maxStops && maxStops.value < brief.mustVisit.length) issues.push({ code: "MAX_STOPS_BELOW_REQUIRED", severity: "error", message: `The maximum of ${maxStops.value} stops cannot include all ${brief.mustVisit.length} required places.`, fields: ["mustVisit", "hardConstraints.maximumStops"] });
  return issues;
}

export function routePreferencesFromStructuredBrief(brief: StructuredTripBrief) {
  const avoidDriving = brief.hardConstraints.some((constraint) => constraint.type === "no-driving");
  const avoidFlights = brief.transportPreferences.some((preference) => preference.value === "avoid-flight");
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
  };
}

/** Hard route constraints are derived separately from soft transport preferences. */
export function routeConstraintsFromStructuredTripBrief(brief: StructuredTripBrief) {
  const destinationId = (name: string) => brief.destinations.find((destination) => destination.id && normalize(destination.name) === normalize(name))?.id;
  const start = brief.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "start-at"; value: string } => constraint.type === "start-at");
  const end = brief.hardConstraints.find((constraint): constraint is TripBriefHardConstraint & { type: "end-at"; value: string } => constraint.type === "end-at");
  const maximum = brief.hardConstraints.find((constraint): constraint is Extract<TripBriefHardConstraint, { type: "maximum-stops" }> => constraint.type === "maximum-stops");
  const fixedCommitments = brief.hardConstraints
    .filter((constraint): constraint is Extract<TripBriefHardConstraint, { type: "fixed-commitment" }> => constraint.type === "fixed-commitment")
    .map((constraint) => ({ label: constraint.value, date: constraint.date }));
  const requiredStopIds = brief.hardConstraints
    .filter((constraint): constraint is TripBriefHardConstraint & { type: "must-visit"; value: string } => constraint.type === "must-visit")
    .flatMap((constraint) => destinationId(constraint.value) ?? []);
  const excludedStopIds = brief.hardConstraints
    .filter((constraint): constraint is TripBriefHardConstraint & { type: "excluded-destination"; value: string } => constraint.type === "excluded-destination")
    .flatMap((constraint) => destinationId(constraint.value) ?? []);
  const preferences = routePreferencesFromStructuredBrief(brief);
  return {
    fixedStartStopId: start ? destinationId(start.value) : undefined,
    fixedEndStopId: end ? destinationId(end.value) : undefined,
    requiredStopIds: unique(requiredStopIds, (id) => id),
    excludedStopIds: unique(excludedStopIds, (id) => id),
    maximumStops: maximum?.value,
    fixedCommitments,
    avoidDriving: preferences.avoidDriving,
    excludedTransportModes: preferences.avoidDriving ? ["road" as const] : [],
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
