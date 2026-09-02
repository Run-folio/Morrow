import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { classifyPlanningComplexity, routeModelTask, routeTripCaptureModel } from "../lib/easyt/model-task-router.ts";
import { evaluatePlanningModel, type PlanningModelProvider } from "../lib/easyt/planning-model-runtime.ts";
import { PLANNING_MODEL_OUTPUT_VERSION, validatePlanningModelOutput, type PlanningModelOutput } from "../lib/easyt/planning-model-output.ts";
import { canonicalizePlanningSuggestions } from "../lib/easyt/planning-suggestion-validation.server.ts";
import { SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION, SEMANTIC_TRIP_INTENT_SCHEMA_VERSION } from "../lib/easyt/semantic-trip-intent.ts";
import type { PlaceIntelligenceProvider } from "../lib/easyt/place-intelligence.ts";
import { createHomeTripDraft } from "../lib/easyt/home-trip-handoff.ts";

const emptyIntent = (promptPlace: string, role: "route-stop" | "planning-area" = "planning-area"): PlanningModelOutput["intent"] => ({
  schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  origin: { sourceText: null, certainty: null },
  journeyEnd: { sourceText: null, interpretedText: null, mode: "unknown", certainty: null },
  duration: { sourceText: null, value: null, unit: null },
  explicitDateTexts: [],
  destinationCandidates: [{ sourceText: promptPlace, interpretedText: null, role, certainty: "explicit" }],
  pointsOfInterest: [],
  transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
  pace: { sourceText: null, value: null },
  interests: [],
  constraints: [],
  ambiguities: [],
  unresolvedMeaningfulText: [],
});

const planningOutput = (place = "Thailand"): PlanningModelOutput => ({
  version: PLANNING_MODEL_OUTPUT_VERSION,
  intent: emptyIntent(place),
  suggestions: [{
    parentSourceText: place,
    name: "Bangkok",
    country: "Thailand",
    role: "gateway-candidate",
    rationale: "A bounded candidate for trip shaping.",
    confidence: "high",
  }],
  assessment: { coherence: "coherent", warning: null },
});

test("complexity gate sends broad and experience-first intent to Terra without destination-name conditionals", () => {
  for (const prompt of ["Thailand for 12 days.", "I would like to go to Africa to see the Serengeti.", "Lake Atitlán."]) {
    const decision = routeTripCaptureModel({ rawPrompt: prompt, deterministic: captureJourneyBrief(prompt) });
    assert.equal(decision.routingClass, "high-value-planning", prompt);
    assert.equal(decision.selectedModel, "gpt-5.6-terra", prompt);
  }
});

test("explicit routes stay on Luna while semantic route tension selects Terra repair", () => {
  for (const prompt of ["Paris, Amsterdam and Brussels for 8 days.", "Tokyo, Kanazawa, Takayama, Kyoto."]) {
    const decision = routeTripCaptureModel({ rawPrompt: prompt, deterministic: captureJourneyBrief(prompt) });
    assert.equal(decision.task, "planning_intent_simple", prompt);
    assert.equal(decision.selectedModel, "gpt-5.6-luna", prompt);
  }
  const ambitious = "London, Tokyo, Bali and New York in 7 days.";
  const classification = classifyPlanningComplexity({ rawPrompt: ambitious, deterministic: captureJourneyBrief(ambitious) });
  assert.equal(classification.task, "planning_repair");
  assert.ok(classification.signals.includes("route-coherence-tension"));
});

test("cheap assistant work remains Luna and deterministic engines have no model", () => {
  assert.equal(routeModelTask({ task: "assistant_chat", complexity: "low" }).selectedModel, "gpt-5.6-luna");
  for (const task of ["deterministic_place_validation", "deterministic_transfer_resolution", "deterministic_night_allocation"] as const) {
    assert.equal(routeModelTask({ task }).selectedModel, null);
  }
});

test("planning output accepts bounded structured suggestions and rejects forbidden or malformed facts", () => {
  assert.equal(validatePlanningModelOutput(planningOutput(), "Thailand").valid, true);
  const forbidden = planningOutput() as unknown as { suggestions: Array<Record<string, unknown>> };
  forbidden.suggestions[0]!.coordinates = [100, 13];
  assert.equal(validatePlanningModelOutput(forbidden, "Thailand").valid, false);
});

test("planning runtime rejects malformed and empty complex results", async () => {
  const provider = (value: unknown): PlanningModelProvider => ({ model: "gpt-5.6-terra", plan: async () => ({ value }) });
  assert.equal((await evaluatePlanningModel({ rawPrompt: "Thailand", provider: provider({ nope: true }) })).status, "invalid-response");
  const empty = { ...planningOutput(), suggestions: [] };
  assert.equal((await evaluatePlanningModel({ rawPrompt: "Thailand", provider: provider(empty) })).status, "empty-result");
});

test("model suggestions only survive provider-backed canonical and containment validation", async () => {
  const capture = captureJourneyBrief("Thailand");
  const provider: PlaceIntelligenceProvider = {
    id: "fixture",
    label: "Fixture provider",
    lookup: async () => [{
      providerId: "fixture:bangkok",
      canonicalName: "Bangkok",
      placeType: "city",
      parentCountries: ["Thailand"],
      coordinates: [100.5018, 13.7563],
      routability: "direct_destination",
      matchQuality: "exact",
    }],
  };
  const canonical = await canonicalizePlanningSuggestions({ suggestions: planningOutput().suggestions, capture, provider });
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0]?.name, "Bangkok");
  const wrongCountry = { ...planningOutput().suggestions[0]!, country: "France" };
  assert.equal((await canonicalizePlanningSuggestions({ suggestions: [wrongCountry], capture, provider })).length, 0);
  const enrichedCapture = { ...capture, planningSuggestions: canonical };
  const draft = createHomeTripDraft({
    capture: enrichedCapture,
    handoffId: "planning-handoff",
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: false,
    interests: [],
  });
  assert.deepEqual(draft.planningSuggestions, canonical);
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  assert.match(builder, /setPlanningSuggestions\(homeDraft\.planningSuggestions \?\? \[\]\)/);
});

test("fallback order is Terra to Luna to provider-backed deterministic capture and display surfaces do not call models", () => {
  const route = readFileSync(new URL("../app/api/journey-capture/route.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("deduplicatedPlanningRequest") < route.indexOf("createOpenAISemanticIntentProvider({ tier: \"primary\" })"));
  assert.ok(route.indexOf("createOpenAISemanticIntentProvider({ tier: \"primary\" })") < route.indexOf("providerFallback(routing.selectedModel!"));
  for (const file of [
    "../components/easyt/trip-map-workspace.tsx",
    "../components/easyt/trip-itinerary-workspace.tsx",
    "../lib/easyt/trip-legs.ts",
    "../lib/easyt/road-transfer-resolution.ts",
    "../lib/easyt/multimodal-transfer-resolution.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /openai|planning-model|journey-capture\/route/i, file);
  }
});
