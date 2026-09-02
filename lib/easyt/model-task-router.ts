import type { JourneyCaptureResult } from "./journey-capture.ts";
import { SEMANTIC_INTENT_MODELS } from "./semantic-trip-intent.ts";

export type MorroviaModelTask =
  | "planning_intent_simple"
  | "planning_intent_complex"
  | "planning_destination_expansion"
  | "planning_route_shape"
  | "planning_repair"
  | "assistant_chat"
  | "simple_extraction"
  | "deterministic_place_validation"
  | "deterministic_transfer_resolution"
  | "deterministic_night_allocation";

export type PlanningComplexitySignal =
  | "broad-geography"
  | "visit-intent-without-base"
  | "recommendation-request"
  | "unresolved-geography"
  | "multiple-interacting-constraints"
  | "route-coherence-tension";

export type ModelTaskDecision = {
  task: MorroviaModelTask;
  routingClass: "high-value-planning" | "bounded-helper" | "deterministic";
  complexity: "none" | "low" | "high";
  selectedModel: string | null;
  fallbackModel: string | null;
  reasoningEffort: "low" | "medium" | null;
  reason: string;
  signals: PlanningComplexitySignal[];
};

const recommendationPattern = /\b(?:recommend|suggest|somewhere|where should|help (?:me|us) choose|don['’]?t know where|ideas? for|what should)\b/i;

function distanceKm(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180;
  const deltaLat = (right[1] - left[1]) * radians;
  const deltaLon = (right[0] - left[0]) * radians;
  const area = Math.sin(deltaLat / 2) ** 2
    + Math.cos(left[1] * radians) * Math.cos(right[1] * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

function hasRouteCoherenceTension(capture: JourneyCaptureResult) {
  const directPlaces = capture.mentions.filter((mention) => mention.routability === "direct_destination");
  const routePlaces = directPlaces.filter((mention) => mention.coordinates);
  const shortForStops = capture.durationDays !== undefined
    && directPlaces.length >= 3
    && capture.durationDays <= directPlaces.length * 2;
  const geographicallyDispersed = routePlaces.some((place, index) => routePlaces.slice(index + 1)
    .some((other) => distanceKm(place.coordinates!, other.coordinates!) >= 4_000));
  const countryCount = new Set(directPlaces.flatMap((place) => place.parentCountries).map((country) => country.toLocaleLowerCase())).size;
  return shortForStops && (geographicallyDispersed || countryCount >= 3);
}

/** Small deterministic complexity gate. It classifies planning need from
 * general semantic/geographic signals; it never contains destination-name
 * conditionals and never asks a model to redo deterministic work. */
export function classifyPlanningComplexity(input: {
  rawPrompt: string;
  deterministic: JourneyCaptureResult;
}) {
  const { deterministic } = input;
  const signals: PlanningComplexitySignal[] = [];
  const broad = deterministic.mentions.some((mention) => mention.routability === "planning_area"
    || mention.routability === "needs_base_selection"
    || ["continent", "country", "macro_region", "region", "archipelago"].includes(mention.placeType));
  const anchor = deterministic.mentions.some((mention) => mention.role === "anchor"
    || mention.routability === "anchor_or_poi"
    || ["landmark", "natural_area", "coast", "mountain_range", "valley"].includes(mention.placeType));
  const unresolved = deterministic.mentions.some((mention) => mention.status === "unresolved" || mention.status === "ambiguous");
  const recommendation = recommendationPattern.test(input.rawPrompt);
  const interactingConstraints = (deterministic.structuredBrief.hardConstraints.length
    + deterministic.structuredBrief.interests.length
    + deterministic.structuredBrief.transportPreferences.length) >= 4;
  const routeTension = hasRouteCoherenceTension(deterministic);
  if (broad) signals.push("broad-geography");
  if (anchor) signals.push("visit-intent-without-base");
  if (recommendation) signals.push("recommendation-request");
  const explicitRouteCanRecoverThroughProviders = deterministic.mentions.filter((mention) => mention.routability === "direct_destination").length >= 2
    && !broad && !anchor && !recommendation && !routeTension;
  if (unresolved && !explicitRouteCanRecoverThroughProviders) signals.push("unresolved-geography");
  if (interactingConstraints) signals.push("multiple-interacting-constraints");
  if (routeTension) signals.push("route-coherence-tension");
  const high = signals.length > 0;
  const task: MorroviaModelTask = routeTension
    ? "planning_repair"
    : broad || anchor
      ? "planning_destination_expansion"
      : high ? "planning_intent_complex" : "planning_intent_simple";
  return { complexity: high ? "high" as const : "low" as const, task, signals };
}

export function routeModelTask(input: {
  task: MorroviaModelTask;
  complexity?: "low" | "high";
  signals?: PlanningComplexitySignal[];
}): ModelTaskDecision {
  const signals = input.signals ?? [];
  if (input.task.startsWith("deterministic_")) return {
    task: input.task,
    routingClass: "deterministic",
    complexity: "none",
    selectedModel: null,
    fallbackModel: null,
    reasoningEffort: null,
    reason: "Canonical code is authoritative for this task.",
    signals,
  };
  const highValue = ["planning_intent_complex", "planning_destination_expansion", "planning_route_shape", "planning_repair"].includes(input.task)
    && input.complexity !== "low";
  return highValue ? {
    task: input.task,
    routingClass: "high-value-planning",
    complexity: "high",
    selectedModel: SEMANTIC_INTENT_MODELS.escalation.model,
    fallbackModel: SEMANTIC_INTENT_MODELS.primary.model,
    reasoningEffort: SEMANTIC_INTENT_MODELS.escalation.reasoningEffort,
    reason: signals.length ? `Higher reasoning is warranted by: ${signals.join(", ")}.` : "This task requires semantic planning judgement.",
    signals,
  } : {
    task: input.task,
    routingClass: "bounded-helper",
    complexity: input.complexity ?? "low",
    selectedModel: SEMANTIC_INTENT_MODELS.primary.model,
    fallbackModel: null,
    reasoningEffort: SEMANTIC_INTENT_MODELS.primary.reasoningEffort,
    reason: "A bounded extraction or assistant task does not justify the higher-cost planning tier.",
    signals,
  };
}

export function routeTripCaptureModel(input: {
  rawPrompt: string;
  deterministic: JourneyCaptureResult;
}) {
  const classification = classifyPlanningComplexity(input);
  return routeModelTask(classification);
}
