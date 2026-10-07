import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBrief, captureJourneyBriefFromSemanticIntent } from "../lib/easyt/journey-capture.ts";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { canonicalPlaceSuggestionFor, resolveExplicitPlaceMentions } from "../lib/easyt/place-intelligence.ts";
import { journeyEndFromCapturedIntent } from "../lib/easyt/journey-endpoints.ts";
import { homepageCapturedRouteEvidence } from "../lib/easyt/home-route-choice.ts";
import { homepagePreflightIssues, projectHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { emptyHomepageInput } from "./fixtures/homepage-dual-entry.ts";
import { SEMANTIC_TRIP_INTENT_SCHEMA_VERSION, SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION, type SemanticTripIntent } from "../lib/easyt/semantic-trip-intent.ts";

function snapshot(prompt: string) {
  const lima = canonicalPlaceSuggestionFor("Lima")!;
  return { ...emptyHomepageInput(), mode: "describe" as const, prompt,
    origin: { state: "selected" as const, value: { name: lima.name, canonicalPlaceId: lima.canonicalPlaceId, country: lima.country, coordinates: lima.coordinates } },
    originInput: "Lima", tripType: { state: "selected" as const, value: "one_way" as const } };
}
function endpoints(prompt: string) {
  return extractStructuredTripBrief(prompt).hardConstraints.filter(item => item.type === "start-at" || item.type === "end-at")
    .map(item => ({ type: item.type, value: "value" in item ? item.value : null }));
}

test("negated starts select the affirmative replacement with exact provenance", () => {
  for (const refusal of ["Do not", "Don't", "Never", "I do not want to"]) {
    const prompt = `${refusal} start in Lima, start in Cusco.`;
    const capture = captureJourneyBrief(prompt);
    assert.deepEqual(endpoints(prompt), [{ type: "start-at", value: "Cusco" }], prompt);
    assert.equal(capture.mentions.some(mention => mention.canonicalName === "Lima"), false, prompt);
    const start = capture.structuredBrief.hardConstraints.find(item => item.type === "start-at");
    assert.ok(start?.type === "start-at");
    assert.equal(start.provenance.sourceText, "Cusco");
  }
});

test("negated finish cannot pass preflight as the canonical end instead of the positive replacement", () => {
  const prompt = "Start in Lima, do not finish in Cusco, finish in Arequipa.";
  const capture = captureJourneyBrief(prompt), input = snapshot(prompt);
  assert.deepEqual(endpoints(prompt), [{ type: "start-at", value: "Lima" }, { type: "end-at", value: "Arequipa" }]);
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "arequipa");
  assert.equal(capture.mentions.some(mention => mention.canonicalName === "Cusco"), false);
  assert.deepEqual(homepagePreflightIssues(input, homepageCapturedRouteEvidence(prompt, capture)), []);
  const projected = projectHomepageInput({ snapshot: input, capture, profile: null, handoffId: "negated-end" });
  assert.ok(projected.ok);
  assert.equal(projected.draft.routeIntent?.journeyEnd.mode === "explicit" && projected.draft.routeIntent.journeyEnd.place.canonicalPlaceId, "arequipa");
});

test("trip and auxiliary refusal wording cannot hide the affirmative finish", () => {
  for (const refusal of ["I do not want the trip to finish in Cusco", "we will not be finishing in Cusco"]) {
    const capture = captureJourneyBrief(`Start in Lima, ${refusal}, finish in Arequipa.`);
    assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "arequipa", refusal);
    assert.equal(capture.mentions.some(mention => mention.canonicalName === "Cusco"), false);
  }
  assert.equal(captureJourneyBrief("No driving. Start in Lima, we will be finishing in Arequipa.").journeyEnd.mode, "explicit");
});

test("negating an endpoint keeps a separately requested stay and its fixed nights", () => {
  const prompt = "10 nights: Start in Lima, Cusco 2, Arequipa 8. Do not finish in Cusco, finish in Arequipa.";
  const capture = captureJourneyBrief(prompt);
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "arequipa");
  assert.equal(capture.mentions.filter(mention => mention.canonicalName === "Cusco").length, 1);
  assert.equal(capture.mentions.find(mention => mention.canonicalName === "Cusco")?.role, "preferred");
  assert.ok(capture.structuredBrief.hardConstraints.some(item => item.type === "fixed-commitment" && item.place?.canonicalPlaceId === "cusco" && item.fixedNights === 2));
  assert.equal(capture.structuredBrief.hardConstraints.some(item => item.type === "excluded-destination" && item.value === "Cusco"), false);
});

test("negated endpoint and return relationship fallbacks never resurrect an explicit or return finish", () => {
  for (const suffix of ["do not finish in Lima", "don't return to Lima", "do not go back home", "never fly home from Lima"]) {
    const prompt = `Start in Lima, Cusco 2 nights, ${suffix}.`;
    const capture = captureJourneyBrief(prompt);
    assert.deepEqual(capture.journeyEnd, { mode: "unknown" }, prompt);
    assert.equal(capture.structuredBrief.hardConstraints.some(item => item.type === "end-at"), false, prompt);
  }
});

test("existing Spanish departure wording scopes refusal without losing the affirmative origin", () => {
  for (const prompt of ["No salir desde Lima, salir desde Cusco.", "No quiero salir desde Lima, saliendo de Cusco."]) {
    assert.deepEqual(endpoints(prompt), [{ type: "start-at", value: "Cusco" }], prompt);
    assert.equal(captureJourneyBrief(prompt).mentions.some(mention => mention.canonicalName === "Lima"), false, prompt);
  }
});

test("conflicting affirmative endpoints require review rather than choosing the first", () => {
  const prompt = "Start in Lima, finish in Cusco, finish in Arequipa.";
  const capture = captureJourneyBrief(prompt), input = snapshot(prompt);
  assert.deepEqual(capture.journeyEnd, { mode: "unknown" });
  assert.equal(capture.structuredBrief.hardConstraints.some(item => item.type === "end-at"), false);
  const evidence = homepageCapturedRouteEvidence(prompt, capture);
  assert.equal(evidence.status, "requires_review");
  assert.ok(homepagePreflightIssues(input, evidence).length);
  assert.equal(projectHomepageInput({ snapshot: input, capture, profile: null, handoffId: "contradictory-end" }).ok, false);
});

test("semantic endpoint guesses cannot reintroduce a source-negated finish", async () => {
  for (const stay of [false, true]) {
    const prompt = `Start in Lima, ${stay ? "Cusco 2 nights, " : ""}do not finish in Cusco, finish in Arequipa.`;
    const intent: SemanticTripIntent = { schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION, rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
      origin: { sourceText: "Lima", certainty: "explicit" },
      journeyEnd: { sourceText: "Cusco", interpretedText: null, mode: "explicit_place", certainty: "explicit" },
      duration: { sourceText: null, value: null, unit: null }, explicitDateTexts: [],
      destinationCandidates: [{ sourceText: "Cusco", interpretedText: null, role: "route-stop", certainty: "explicit" }],
      pointsOfInterest: [], transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
      pace: { sourceText: null, value: null }, interests: [], constraints: [], ambiguities: [], unresolvedMeaningfulText: [] };
    const capture = await captureJourneyBriefFromSemanticIntent(prompt, intent);
    assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "arequipa");
    assert.equal(capture.mentions.some(mention => mention.canonicalName === "Cusco" && mention.role === "fixed_end"), false);
    assert.equal(capture.mentions.some(mention => mention.canonicalName === "Cusco"), stay);
  }
});

test("a model landmark guess cannot turn a refused endpoint into an invented visit", async () => {
  const prompt = "Start in Lima, do not finish in Cusco, finish in Arequipa.";
  const intent: SemanticTripIntent = { schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION, rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: "Lima", certainty: "explicit" }, journeyEnd: { sourceText: null, interpretedText: null, mode: "unknown", certainty: null },
    duration: { sourceText: null, value: null, unit: null }, explicitDateTexts: [], destinationCandidates: [],
    pointsOfInterest: [{ sourceText: "Cusco", interpretedText: null, likelyDestinationSourceText: null, certainty: "explicit" }],
    transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
    pace: { sourceText: null, value: null }, interests: [], constraints: [], ambiguities: [], unresolvedMeaningfulText: [] };
  const capture = await captureJourneyBriefFromSemanticIntent(prompt, intent);
  assert.equal(capture.mentions.some(mention => mention.canonicalName === "Cusco"), false);
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "arequipa");
});

test("endpoint owners reject supplied positive roles for a source-negated endpoint", () => {
  const prompt = "Start in Lima, do not finish in Cusco, finish in Arequipa.";
  const supplied = resolveExplicitPlaceMentions([
    { sourceText: "Lima", role: "fixed_start" }, { sourceText: "Cusco", role: "fixed_end" }, { sourceText: "Arequipa", role: "fixed_end" },
  ]);
  const brief = extractStructuredTripBrief(prompt, supplied.parserVersion, supplied);
  const end = brief.hardConstraints.find(item => item.type === "end-at");
  assert.ok(end?.type === "end-at");
  assert.equal(end.value, "Arequipa");
  const selection = journeyEndFromCapturedIntent(prompt, supplied.mentions);
  assert.equal(selection.mode === "explicit" && selection.place.canonicalPlaceId, "arequipa");
  const refusedStart = extractStructuredTripBrief("Do not start in Lima, Cusco 2 nights.", supplied.parserVersion,
    resolveExplicitPlaceMentions([{ sourceText: "Lima", role: "fixed_start" }, { sourceText: "Cusco", role: "preferred" }]));
  assert.equal(refusedStart.hardConstraints.some(item => item.type === "start-at"), false);
});

test("Spanish source negation rejects refused supplied endpoints and retains the affirmative choice", () => {
  const prompt = "Salimos desde Lima, no quiero terminar en Cusco, terminar en Arequipa.";
  const supplied = resolveExplicitPlaceMentions([
    { sourceText: "Lima", role: "origin" }, { sourceText: "Cusco", role: "fixed_end" }, { sourceText: "Arequipa", role: "fixed_end" },
  ]);
  const brief = extractStructuredTripBrief(prompt, supplied.parserVersion, supplied);
  const end = brief.hardConstraints.find(item => item.type === "end-at");
  assert.ok(end?.type === "end-at");
  assert.equal(end.value, "Arequipa");
  assert.equal(brief.destinations.some(destination => destination.canonicalPlaceId === "cusco"), false);
  const journeyEnd = journeyEndFromCapturedIntent(prompt, supplied.mentions);
  assert.equal(journeyEnd.mode === "explicit" && journeyEnd.place.canonicalPlaceId, "arequipa");
});

test("affirmative English endpoints, return relationships and Spanish trip choices remain supported", () => {
  assert.deepEqual(endpoints("Start in Lima, finish in Arequipa."), [{ type: "start-at", value: "Lima" }, { type: "end-at", value: "Arequipa" }]);
  assert.deepEqual(captureJourneyBrief("Start in Lima, visit Cusco, then back home.").journeyEnd, { mode: "same_as_start" });
  assert.equal(homepageCapturedRouteEvidence("Un viaje de solo ida por Tokio y Kioto").tripType, "one_way");
  assert.equal(homepageCapturedRouteEvidence("No será un viaje de solo ida").status, "requires_review");
});
