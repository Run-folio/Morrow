import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  journeyCaptureFailureMessage,
  journeyCaptureValidationMessage,
  validateJourneyCaptureSubmission,
} from "../lib/easyt/journey-capture-client.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const supplementaryStates = [
  { label: "default state", dates: undefined, travellers: 2, interests: [] },
  { label: "dates", dates: ["2026-09-03", "2026-09-17"], travellers: 2, interests: [] },
  { label: "changed travellers", dates: undefined, travellers: 4, interests: [] },
  { label: "interests", dates: undefined, travellers: 2, interests: ["food"] },
  { label: "dates, travellers and interests", dates: ["2026-09-03", "2026-09-17"], travellers: 4, interests: ["food", "culture"] },
] as const;

for (const supplementary of supplementaryStates) {
  test(`Homepage: empty prompt with ${supplementary.label} remains blocked`, () => {
    const before = structuredClone(supplementary);
    const issue = validateJourneyCaptureSubmission({ prompt: "" });
    assert.deepEqual(issue, { code: "missing_trip_intent", field: "prompt" });
    assert.deepEqual(supplementary, before, "capture validation must not mutate supplementary selections");
  });
}

test("Homepage: whitespace-only prompt remains blocked", () => {
  assert.deepEqual(validateJourneyCaptureSubmission({ prompt: " \n\t " }), { code: "missing_trip_intent", field: "prompt" });
});

test("Homepage: meaningful prompt submits normally and clears the empty-prompt issue", () => {
  assert.equal(validateJourneyCaptureSubmission({ prompt: "Two weeks through Japan." }), null);
});

test("shared missing-intent and failure copy is entry-point independent", () => {
  const issue = validateJourneyCaptureSubmission({ prompt: "" });
  assert.ok(issue);
  assert.equal(journeyCaptureValidationMessage(issue, "en"), "Tell us where you'd like to go or what kind of trip you're planning.");
  assert.equal(journeyCaptureFailureMessage("network", "en"), "We couldn't check those places right now. Try again.");
  assert.equal(journeyCaptureFailureMessage("interpretation", "en"), "We couldn't identify a place in that trip yet. Try adding a city, country or region.");
});

test("New Builder: empty prompt without canonical manual structure is blocked", () => {
  assert.ok(validateJourneyCaptureSubmission({ prompt: "", allowEmptyPrompt: false }));
});

test("New Builder: canonical manual origin and stops satisfy capture intent", () => {
  assert.equal(validateJourneyCaptureSubmission({ prompt: "", allowEmptyPrompt: true }), null);
});

test("New Builder: meaningful prompt remains valid without manual entry", () => {
  assert.equal(validateJourneyCaptureSubmission({ prompt: "A food-focused trip through Bologna and Rome.", allowEmptyPrompt: false }), null);
});

test("shared capture surface owns field association, focus, announcement and clearing", () => {
  const capture = read("components/easyt/morrovia-trip-capture.tsx");
  const styles = read("components/easyt/morrovia-trip-capture.module.css");
  assert.match(capture, /validateJourneyCaptureSubmission\(\{ prompt: value, allowEmptyPrompt \}\)/);
  assert.match(capture, /textareaRef\.current\?\.focus\(\)/);
  assert.match(capture, /aria-describedby=\{promptError \? promptErrorId : undefined\}/);
  assert.match(capture, /aria-invalid=\{promptError \? true : undefined\}/);
  assert.match(capture, /className=\{styles\.promptError\} role="alert"/);
  assert.match(capture, /if \(validationIssue && !validateJourneyCaptureSubmission/);
  assert.match(styles, /\.promptFieldError[\s\S]*?border-color: var\(--morrovia-danger\)/);
});

test("Homepage and Builder consume one capture validator while Builder keeps structural gates separate", () => {
  const homepage = read("app/journey/home/home-trip-starter.tsx");
  const builder = read("app/journey/new/trip-builder.tsx");
  const capture = read("components/easyt/morrovia-trip-capture.tsx");
  assert.match(homepage, /<MorroviaTripCapture/);
  assert.match(builder, /<MorroviaTripCapture/);
  assert.match(capture, /validateJourneyCaptureSubmission/);
  assert.doesNotMatch(homepage, /missing_trip_intent|validateJourneyCaptureSubmission/);
  assert.match(builder, /allowEmptyPrompt=\{Boolean\(manualOriginSuggestion && manualDestinations\.length\)\}/);
  assert.doesNotMatch(builder, /disabled=\{!tripBrief\.trim\(\)/);
  assert.match(homepage, /requestJourneyCapture\(tripBrief,/);
  assert.match(builder, /requestJourneyCapture\(brief,/);
  assert.match(builder, /buildInvariant\.canBuildTrip/,
    "Builder-only structural validation must remain with the Builder gate");
});

test("Homepage and Builder share provider-failure recovery semantics without clearing entered state", () => {
  const homepage = read("app/journey/home/home-trip-starter.tsx");
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(homepage, /journeyCaptureFailureMessage\(responseReceived \? "interpretation" : "network", language\)/);
  assert.match(builder, /journeyCaptureFailureMessage\(responseReceived \? "interpretation" : "network", language\)/);
  assert.match(homepage, /onValueChange=\{\(value\) => \{ setBrief\(value\); setCaptureError\(""\); \}\}/);
  assert.match(builder, /onValueChange=\{\(value\) => \{ setTripBrief\(value\); setTripBriefCaptureError\(""\); \}\}/);
  assert.doesNotMatch(homepage, /setStartDate\([^)]*\)[\s\S]{0,120}setCaptureError/);
});
