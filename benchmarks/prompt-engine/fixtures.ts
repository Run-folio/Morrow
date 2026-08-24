import type { PlannerStop } from "../../lib/easyt/planner.ts";
import type { TripBriefHardConstraint } from "../../lib/easyt/structured-trip-brief.ts";

export const PROMPT_ENGINE_DIMENSIONS = ["intent", "constraints", "route", "time-realism", "state-preservation", "uncertainty", "explanation"] as const;
export type PromptEngineDimension = typeof PROMPT_ENGINE_DIMENSIONS[number];

type RecordedPlan = {
  origin: { name: string; coordinates: [number, number] };
  stops: PlannerStop[];
};

export type PromptEngineCase = {
  id: string;
  name: string;
  rawPrompt: string;
  /** Facts which are machine-checked against the captured StructuredTripBrief. */
  expectedHardFacts: {
    durationDays?: number;
    durationUnit?: "days" | "nights";
    pace?: "relaxed" | "balanced" | "packed";
    interests?: string[];
    hardConstraints?: Array<TripBriefHardConstraint["type"]>;
    canonicalPlaceIds?: string[];
    unknownFields?: Array<"duration" | "travellers" | "budget" | "pace">;
  };
  /** Outcome sets intentionally allow legitimate route ordering changes. */
  acceptableVariations: string[];
  prohibitedOutcomes: string[];
  expectedWarningsOrConflicts: string[];
  reviewNotes: string[];
  /** Recorded resolved stops are test data, never a geocoder or model call. */
  recordedPlan?: RecordedPlan;
};

const stop = (id: string, name: string, country: string, coordinates: [number, number]): PlannerStop => ({ id, name, country, coordinates });

/**
 * High-signal prompt interpretation gauntlet. Add cases here; the harness is
 * deliberately data-driven so growing to 40–60 cases does not change it.
 */
export const PROMPT_ENGINE_CASES: PromptEngineCase[] = [
  {
    id: "japan-explicit-constraints",
    name: "Japan — explicit gateways, pace and transport",
    rawPrompt: "About 12 nights in Japan. Start in Tokyo, Kyoto is essential, finish in Osaka. Two travellers want a relaxed pace, food, trains, an affordable trip, no driving and no more than 4 stops.",
    expectedHardFacts: { durationDays: 12, durationUnit: "nights", pace: "relaxed", interests: ["food"], hardConstraints: ["duration", "start-at", "end-at", "must-visit", "no-driving", "maximum-stops"], canonicalPlaceIds: ["japan", "tokyo", "kyoto", "osaka"] },
    acceptableVariations: ["Tokyo–Kyoto–Osaka may retain the entered order or receive a supported reordering.", "Train is a soft preference while no-driving remains hard."],
    prohibitedOutcomes: ["Drop Kyoto.", "Turn no-driving into a route suggestion.", "Add an unmentioned Japanese city."],
    expectedWarningsOrConflicts: [],
    reviewNotes: ["Does the route explanation distinguish the hard Kyoto commitment from train preference?"],
    recordedPlan: { origin: { name: "Tokyo", coordinates: [139.6917, 35.6895] }, stops: [stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895]), stop("kyoto", "Kyoto", "Japan", [135.7681, 35.0116]), stop("osaka", "Osaka", "Japan", [135.5023, 34.6937])] },
  },
  {
    id: "patagonia-regions-unknown-bases",
    name: "Patagonia — broad regions need a base choice",
    rawPrompt: "3 weeks through Patagonia, Tierra del Fuego and Easter Island. We like nature, prefer a relaxed pace and do not want to drive.",
    expectedHardFacts: { durationDays: 21, durationUnit: "days", pace: "relaxed", interests: ["nature"], hardConstraints: ["duration", "no-driving"], canonicalPlaceIds: ["patagonia", "tierra-del-fuego", "rapa-nui"] },
    acceptableVariations: ["The brief may suggest reviewed bases only after a traveller choice.", "No plan is produced until regions are operationally resolved."],
    prohibitedOutcomes: ["Invent El Calafate, Ushuaia or Puerto Natales as prompt destinations.", "Pretend a no-driving route is verified."],
    expectedWarningsOrConflicts: ["region_requires_base"],
    reviewNotes: ["Are base-choice warnings clear enough for a traveller to resolve without losing their broad intent?"],
  },
  {
    id: "unknown-place-remains-unknown",
    name: "Unknown geography — no fabricated identity",
    rawPrompt: "Ten days from Venice to Mystery Coast, with a relaxed pace.",
    expectedHardFacts: { durationDays: 10, durationUnit: "days", pace: "relaxed", canonicalPlaceIds: ["venice"] },
    acceptableVariations: ["Venice can be interpreted as the start gateway.", "Mystery Coast can remain an unresolved mention."],
    prohibitedOutcomes: ["Create a route stop or country for Mystery Coast.", "Silently remove Mystery Coast from the captured intent."],
    expectedWarningsOrConflicts: ["unresolved_place"],
    reviewNotes: ["Does the warning ask for the missing geographic detail rather than guessing?"],
  },
  {
    id: "georgia-ambiguity",
    name: "Georgia — ambiguity is explicit",
    rawPrompt: "A relaxed two-week trip to Georgia with food and mountains.",
    expectedHardFacts: { durationDays: 14, durationUnit: "days", pace: "relaxed", interests: ["food", "mountains"], unknownFields: ["travellers", "budget"] },
    acceptableVariations: ["Georgia can expose country and US-state candidates.", "No plan is generated before selection."],
    prohibitedOutcomes: ["Choose Georgia the country without context.", "Choose Georgia the US state without context."],
    expectedWarningsOrConflicts: ["ambiguous_place"],
    reviewNotes: ["Is the disambiguation request concise and useful?"],
  },
  {
    id: "peru-anchor-and-region",
    name: "Peru — landmark and planning area",
    rawPrompt: "Two weeks in Lima, Cusco, the Sacred Valley and Machu Picchu. Machu Picchu is the whole reason for the trip.",
    expectedHardFacts: { durationDays: 14, durationUnit: "days", hardConstraints: ["duration", "must-visit"], canonicalPlaceIds: ["lima", "cusco", "sacred-valley", "machu-picchu"] },
    acceptableVariations: ["Machu Picchu remains a protected anchor.", "Sacred Valley requests a base rather than becoming a fabricated town."],
    prohibitedOutcomes: ["Drop Machu Picchu.", "Replace Sacred Valley with an unstated base."],
    expectedWarningsOrConflicts: ["region_requires_base"],
    reviewNotes: ["Does the explanation protect the landmark while explaining the base decision?"],
  },
  {
    id: "italy-exclusion",
    name: "Italy — exclusion remains a hard fact",
    rawPrompt: "Skip Venice but include the Dolomites. We have 8 days and do not want to drive.",
    expectedHardFacts: { durationDays: 8, durationUnit: "days", hardConstraints: ["duration", "excluded-destination", "no-driving"], canonicalPlaceIds: ["venice", "dolomites"] },
    acceptableVariations: ["Dolomites can request a base selection.", "Venice stays visible as excluded intent."],
    prohibitedOutcomes: ["Route through Venice.", "Treat Dolomites as a directly routable town."],
    expectedWarningsOrConflicts: ["region_requires_base"],
    reviewNotes: ["Is the exclusion retained visibly while the region remains unresolved?"],
  },
  {
    id: "alias-deduplication",
    name: "Chile — aliases collapse without losing wording",
    rawPrompt: "10 days around Rapa Nui, Easter Island and mainland Chile. We want nature and a relaxed pace.",
    expectedHardFacts: { durationDays: 10, durationUnit: "days", pace: "relaxed", interests: ["nature"], canonicalPlaceIds: ["rapa-nui", "chile"] },
    acceptableVariations: ["Rapa Nui and Easter Island become one canonical mention with both source phrases."],
    prohibitedOutcomes: ["Create two island stops.", "Drop the mainland Chile context."],
    expectedWarningsOrConflicts: ["duplicate_alias", "region_requires_base"],
    reviewNotes: ["Does the copy make alias consolidation intelligible?"],
  },
  {
    id: "french-alps-nesting",
    name: "French Alps — nested geography survives",
    rawPrompt: "A week in the French Alps and Lake Annecy, then Venice. We prefer trains over flights.",
    expectedHardFacts: { durationDays: 7, durationUnit: "days", hardConstraints: ["duration"], canonicalPlaceIds: ["french-alps", "lake-annecy", "venice"] },
    acceptableVariations: ["Lake Annecy remains nested under French Alps.", "Train stays a soft preference."],
    prohibitedOutcomes: ["Flatten Lake Annecy into an unrelated country.", "Claim rail availability is confirmed."],
    expectedWarningsOrConflicts: ["region_requires_base"],
    reviewNotes: ["Does the plan explain what must be selected before routing the Alps?"],
  },
  {
    id: "southeast-asia-fixed-anchor",
    name: "Southeast Asia — protected landmark and ground preference",
    rawPrompt: "We have 11 nights from Bangkok and Angkor Wat is the whole reason for the trip. We would also like Cambodia and southern Vietnam, using ground transport where it makes sense. Two travellers.",
    expectedHardFacts: { durationDays: 11, durationUnit: "nights", hardConstraints: ["duration", "start-at", "must-visit"], canonicalPlaceIds: ["bangkok", "angkor-wat", "cambodia", "vietnam"] },
    acceptableVariations: ["Ground transport is preferred, not promised for every leg.", "Cambodia and Vietnam may remain broader intent alongside concrete stops."],
    prohibitedOutcomes: ["Drop Angkor Wat.", "Present an unverified ground transfer as confirmed."],
    expectedWarningsOrConflicts: [],
    reviewNotes: ["Does the explanation separate a route preference from service certainty?"],
    recordedPlan: { origin: { name: "Bangkok", coordinates: [100.5018, 13.7563] }, stops: [stop("bangkok", "Bangkok", "Thailand", [100.5018, 13.7563]), stop("angkor", "Angkor Wat", "Cambodia", [103.867, 13.4125]), stop("hcmc", "Ho Chi Minh City", "Vietnam", [106.6297, 10.8231])] },
  },
  {
    id: "maximum-stops-conflict",
    name: "Japan — explicit maximum conflicts with anchors",
    rawPrompt: "Tokyo, Kanazawa and Kyoto are all essential, but we only want 2 stops in 6 days.",
    expectedHardFacts: { durationDays: 6, durationUnit: "days", hardConstraints: ["duration", "must-visit", "maximum-stops"], canonicalPlaceIds: ["tokyo", "kanazawa", "kyoto"] },
    acceptableVariations: ["The contradiction remains visible instead of silently dropping an essential stop."],
    prohibitedOutcomes: ["Discard one of the three essential places without a conflict.", "Pretend two stops satisfy three required places."],
    expectedWarningsOrConflicts: ["MAX_STOPS_BELOW_REQUIRED", "required-stops-exceed-maximum"],
    reviewNotes: ["Does the explanation frame the decision as traveller control rather than an engine failure?"],
    recordedPlan: { origin: { name: "Tokyo", coordinates: [139.6917, 35.6895] }, stops: [stop("tokyo", "Tokyo", "Japan", [139.6917, 35.6895]), stop("kanazawa", "Kanazawa", "Japan", [136.6562, 36.5613]), stop("kyoto", "Kyoto", "Japan", [135.7681, 35.0116])] },
  },
  {
    id: "minimal-intent-unknowns",
    name: "Cambodia and Vietnam — missing choices stay unknown",
    rawPrompt: "I want to visit Cambodia and Vietnam.",
    expectedHardFacts: { canonicalPlaceIds: ["cambodia", "vietnam"], unknownFields: ["duration", "travellers", "budget", "pace"] },
    acceptableVariations: ["The product can ask for dates and pace before suggesting a route."],
    prohibitedOutcomes: ["Invent dates, traveller count, budget or pace.", "Produce a confident city sequence from countries alone."],
    expectedWarningsOrConflicts: ["region_requires_base"],
    reviewNotes: ["Does the next question remove the most important planning uncertainty?"],
  },
  {
    id: "budget-question-is-not-budget",
    name: "Budget question — unknown remains unknown",
    rawPrompt: "Tokyo and Kyoto. Tell me what budget I might need.",
    expectedHardFacts: { canonicalPlaceIds: ["tokyo", "kyoto"], unknownFields: ["duration", "travellers", "budget", "pace"] },
    acceptableVariations: ["The system may ask a budget follow-up."],
    prohibitedOutcomes: ["Infer value, mid or high budget from a question.", "Treat advice-seeking wording as a constraint."],
    expectedWarningsOrConflicts: [],
    reviewNotes: ["Does the explanation acknowledge that a budget is not yet supplied?"],
  },
  {
    id: "caucasus-context-resolves-georgia",
    name: "Caucasus — context resolves Georgia",
    rawPrompt: "12 days in Georgia and Armenia for food, culture and mountains. We do not want to drive.",
    expectedHardFacts: { durationDays: 12, durationUnit: "days", interests: ["food", "culture", "mountains"], hardConstraints: ["duration", "no-driving"], canonicalPlaceIds: ["georgia-country", "armenia"] },
    acceptableVariations: ["Georgia resolves to the country because Armenia supplies context."],
    prohibitedOutcomes: ["Leave Georgia ambiguous despite Armenian context.", "Choose the US state."],
    expectedWarningsOrConflicts: ["region_requires_base"],
    reviewNotes: ["Does the system show enough context for the Georgia resolution to be trusted?"],
  },
  {
    id: "short-italy-time-realism",
    name: "Italy — short itinerary stays visibly compressed",
    rawPrompt: "4 days from Paris to Rome, Venice and Milan. We love food and museums.",
    expectedHardFacts: { durationDays: 4, durationUnit: "days", interests: ["food", "culture"], canonicalPlaceIds: ["paris", "rome", "venice", "milan"] },
    acceptableVariations: ["The assessment may retain the entered sequence or recommend a more direct one."],
    prohibitedOutcomes: ["Present four cities in four days as unqualified.", "Hide the shortfall."],
    expectedWarningsOrConflicts: ["shortfall"],
    reviewNotes: ["Does the time explanation make the trade-off tangible rather than merely showing a warning?"],
    recordedPlan: { origin: { name: "Paris", coordinates: [2.3522, 48.8566] }, stops: [stop("rome", "Rome", "Italy", [12.4964, 41.9028]), stop("venice", "Venice", "Italy", [12.3155, 45.4408]), stop("milan", "Milan", "Italy", [9.19, 45.4642])] },
  },
  {
    id: "spanish-aliases-and-origin",
    name: "Spanish prompt — aliases preserve intent",
    rawPrompt: "Desde Londres, dos semanas por Japón: Tokio, Kioto y Osaka. Sin conducir y con ritmo relajado.",
    expectedHardFacts: { durationDays: 14, durationUnit: "days", pace: "relaxed", hardConstraints: ["duration", "no-driving"], canonicalPlaceIds: ["japan", "tokyo", "kyoto", "osaka"] },
    acceptableVariations: ["London can be retained as origin context while Japanese stops remain ordered intent."],
    prohibitedOutcomes: ["Lose the no-driving request.", "Translate cities into new identities."],
    expectedWarningsOrConflicts: [],
    reviewNotes: ["Is the traveller’s language represented accurately in the explanation?"],
  },
];
