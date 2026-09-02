import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applySelectedOriginToJourneyCapture, composeJourneyCaptureBrief } from "../lib/easyt/journey-capture-client.ts";
import { captureJourneyBriefWithProvider } from "../lib/easyt/journey-capture.ts";
import {
  placeCandidateWithinPlanningParent,
  type PlaceIntelligenceProvider,
  type PlanningParentConstraint,
} from "../lib/easyt/place-intelligence.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("manual From and Where to compose into the canonical capture brief in source order", () => {
  assert.equal(composeJourneyCaptureBrief({
    origin: "London, United Kingdom",
    destinations: ["Lisbon, Portugal", "Comporta, Portugal", "Lagos, Portugal"],
  }), "Starting from London, United Kingdom.\nI want to visit Lisbon, Portugal, then Comporta, Portugal, then Lagos, Portugal, in that order.");

  const combined = composeJourneyCaptureBrief({
    prompt: "Two relaxed weeks with good food.",
    origin: "London, United Kingdom",
    destinations: ["Iran, country"],
  });
  assert.match(combined, /^Two relaxed weeks with good food\.\nStarting from London/);
  assert.match(combined, /I want to visit Iran, country\.$/);
});

test("manual and natural-language country requests converge on the same base requirement", async () => {
  const provider: PlaceIntelligenceProvider = {
    id: "manual-parity",
    label: "Manual parity fixture",
    lookup: async (phrase) => phrase.toLocaleLowerCase().includes("iran") ? [{
      providerId: "iran-country",
      canonicalName: "Iran",
      placeType: "country",
      parentCountries: ["Iran"],
      coordinates: [53.69, 32.43],
      routability: "planning_area",
      matchQuality: "exact",
      geographicSignificance: 0.95,
      rankScore: 150,
    }] : [],
  };
  const natural = await captureJourneyBriefWithProvider("Two weeks in Iran", provider);
  const manual = await captureJourneyBriefWithProvider(composeJourneyCaptureBrief({ destinations: ["Iran, country"] }), provider);
  const semantics = (capture: Awaited<ReturnType<typeof captureJourneyBriefWithProvider>>) => capture.mentions.map((mention) => ({
    canonicalName: mention.canonicalName,
    placeType: mention.placeType,
    routability: mention.routability,
    requiresBaseSelection: mention.requiresBaseSelection,
    directlyRoutable: mention.directlyRoutable,
  }));
  assert.deepEqual(semantics(manual), semantics(natural));
  assert.equal(manual.structuredBrief.placeIssues?.some((issue) => issue.code === "region_requires_base"), true);
});

test("a selected manual departure remains the chosen direct canonical origin", async () => {
  const provider: PlaceIntelligenceProvider = {
    id: "manual-origin",
    label: "Manual origin fixture",
    lookup: async (phrase) => phrase.toLocaleLowerCase().includes("london") ? [{
      providerId: "uk-country",
      canonicalName: "United Kingdom",
      placeType: "country",
      parentCountries: ["United Kingdom"],
      coordinates: [-3.43, 55.38],
      routability: "planning_area",
      matchQuality: "exact",
      rankScore: 150,
    }] : [],
  };
  const captured = await captureJourneyBriefWithProvider("Starting from London.", provider);
  const corrected = applySelectedOriginToJourneyCapture(captured, {
    canonicalPlaceId: "open-world:london",
    name: "London",
    label: "London, United Kingdom",
    country: "United Kingdom",
    region: "England",
    placeType: "city",
    coordinates: [-0.1276, 51.5072],
    provenance: [{ id: "manual:london", label: "Manual departure selection", kind: "builder", supports: "The traveller selected London." }],
  });
  const origin = corrected.mentions.find((mention) => mention.role === "origin");
  assert.equal(origin?.canonicalName, "London");
  assert.equal(origin?.canonicalPlaceId, "open-world:london");
  assert.equal(origin?.routability, "direct_destination");
  assert.equal(origin?.requiresBaseSelection, false);
  assert.equal(corrected.structuredBrief.placeIssues?.some((issue) => issue.mentionId === origin?.mentionId), false);
});

test("an explicit city and parent remains a direct destination without another base prompt", async () => {
  const provider: PlaceIntelligenceProvider = {
    id: "explicit-city",
    label: "Explicit city fixture",
    lookup: async (phrase) => phrase.toLocaleLowerCase().includes("shiraz") ? [{
      providerId: "shiraz-city",
      canonicalName: "Shiraz",
      placeType: "city",
      parentCountries: ["Iran"],
      parentRegionId: "Fars",
      coordinates: [52.58, 29.61],
      routability: "direct_destination",
      matchQuality: "exact",
      rankScore: 150,
    }] : [],
  };
  const capture = await captureJourneyBriefWithProvider("Shiraz, Iran", provider);
  assert.equal(capture.mentions.some((mention) => mention.canonicalName === "Shiraz" && mention.directlyRoutable), true);
  assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.code === "region_requires_base"), false);
});

test("country parent containment is a hard filter", () => {
  const iran: PlanningParentConstraint = {
    canonicalName: "Iran",
    placeType: "country",
    parentCountries: ["Iran"],
  };
  assert.equal(placeCandidateWithinPlanningParent({
    canonicalName: "Shiraz",
    placeType: "city",
    parentCountries: ["Iran"],
    parentRegionId: "Fars",
    coordinates: [52.58, 29.61],
  }, iran), true);
  assert.equal(placeCandidateWithinPlanningParent({
    canonicalName: "Shiraz",
    placeType: "town",
    parentCountries: ["United States"],
    parentRegionId: "Texas",
    coordinates: [-98, 31],
  }, iran), false);
  assert.equal(placeCandidateWithinPlanningParent({
    canonicalName: "Taipei",
    placeType: "city",
    parentCountries: ["Taiwan"],
    coordinates: [121.56, 25.04],
  }, iran), false);
});

test("region and state parents require matching canonical administration", () => {
  const scotland: PlanningParentConstraint = {
    canonicalName: "Scotland",
    placeType: "region",
    parentCountries: ["United Kingdom"],
  };
  assert.equal(placeCandidateWithinPlanningParent({
    canonicalName: "Glasgow",
    placeType: "city",
    parentCountries: ["United Kingdom"],
    parentRegionId: "Scotland",
    coordinates: [-4.25, 55.86],
  }, scotland), true);
  assert.equal(placeCandidateWithinPlanningParent({
    canonicalName: "Scotland",
    placeType: "town",
    parentCountries: ["United States"],
    parentRegionId: "Texas",
    coordinates: [-98.47, 33.66],
  }, scotland), false);

  const georgiaCountry: PlanningParentConstraint = { canonicalName: "Georgia", placeType: "country", parentCountries: ["Georgia"] };
  const georgiaState: PlanningParentConstraint = { canonicalName: "Georgia", placeType: "region", parentCountries: ["United States"] };
  const tbilisi = { canonicalName: "Tbilisi", placeType: "city" as const, parentCountries: ["Georgia"], parentRegionId: "Tbilisi", coordinates: [44.8, 41.72] as [number, number] };
  const atlanta = { canonicalName: "Atlanta", placeType: "city" as const, parentCountries: ["United States"], parentRegionId: "Georgia", coordinates: [-84.39, 33.75] as [number, number] };
  assert.equal(placeCandidateWithinPlanningParent(tbilisi, georgiaCountry), true);
  assert.equal(placeCandidateWithinPlanningParent(atlanta, georgiaCountry), false);
  assert.equal(placeCandidateWithinPlanningParent(atlanta, georgiaState), true);
  assert.equal(placeCandidateWithinPlanningParent(tbilisi, georgiaState), false);
});

test("Builder manual and inline-base interactions reuse canonical owners", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const geocode = read("app/api/journey-geocode/route.ts");
  const styles = read("app/journey/new/trip-builder.module.css");
  const capture = read("components/easyt/morrovia-trip-capture.module.css");

  assert.match(builder, /composeJourneyCaptureBrief\(/);
  assert.match(builder, /applySelectedOriginToJourneyCapture\(/);
  assert.match(builder, /requestJourneyCapture\(brief,/,
    "manual and prompt entry must use the existing capture request");
  assert.equal(builder.match(/type ManualPlaceEntry/g)?.length, 1,
    "manual controls may retain input values but must not create another trip document");
  assert.match(builder, /parentConstraint=\{planningParentForMention\(mention\)\}/);
  assert.match(builder, /placeCandidateWithinPlanningParent\(/,
    "selection must be checked again before mutating Builder state");
  assert.match(geocode, /filter\(\(candidate\) => !planningParent \|\| placeCandidateWithinPlanningParent\(candidate, planningParent\)\)/,
    "the API must remove foreign candidates rather than only reranking them");
  assert.doesNotMatch(geocode, /Iran|Scotland|Georgia|Wales|Ireland/,
    "parent-bound search must not use destination-specific lookup tables");

  assert.match(capture, /\.promptField:focus-within\s*\{\s*border-color: var\(--morrovia-signal\)/);
  assert.match(capture, /box-shadow: var\(--morrovia-focus-shadow\)/);
  assert.match(capture, /textarea:focus-visible\s*\{ outline: none; \}/);
  assert.match(styles, /\.summaryEditorOn\{scroll-margin-top:40px\}/);
  assert.doesNotMatch(styles, /\.summaryEditorOn\{[^}]*box-shadow/);
  assert.match(styles, /\.inlineEditor input:focus-visible\{border-color:var\(--morrovia-focus-ring\)\}/);
});

test("base replacement preserves the planning mention relationship and does not create a trip early", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /kind: selectionDraft\?\.kind \?\? \(targetMention\?\.routability === "anchor_or_poi"[\s\S]*?\? "base"/);
  assert.match(builder, /mentionId: targetMentionId,[\s\S]*?routeStopId: id/);
  assert.match(builder, /replaceableRouteStopId[\s\S]*?current\.map\(\(stop\) => stop\.id === replaceableRouteStopId \? addedStop : stop\)/);
  assert.match(builder, /setHasPromptContext\(true\)/);
  assert.doesNotMatch(builder.slice(builder.indexOf("const submitInitialTripBrief"), builder.indexOf("const moveStop")), /tripFromBuilder|persistGeneratedTrip|buildTrip\(/,
    "initial capture must stop at normal Builder review");
});

test("Builder review keeps origin visible and broad areas open for explicit multi-place completion", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const endpoints = read("components/easyt/journey-endpoints-editor.tsx");
  const dialog = read("components/easyt/builder-clarification-dialog.tsx");
  const dialogStyles = read("components/easyt/builder-clarification-dialog.module.css");
  assert.match(builder, /<JourneyEndpointsEditor/);
  assert.match(endpoints, /City or airport you are leaving from/);
  assert.match(builder, /<BuilderClarificationDialog/);
  assert.match(builder, /guidedPlanningAreaSuggestions\(activeClarificationMention/);
  assert.match(builder, /Done with \$\{clarificationParentName\}/);
  assert.match(dialog, /SELECTED PLACES/);
  assert.match(builder, /areas to shape/);
  assert.match(builder, /identities to confirm/);
  assert.doesNotMatch(builder, /\$\{stops\.length\} resolved · \$\{pendingPlaceCount\} to confirm/);
  assert.match(builder, /completedPlanningAreaMentionIds/);
  assert.match(builder, /Search within \$\{clarificationParentName\}/);
  assert.match(dialog, /aria-live="polite"/);
  assert.match(dialogStyles, /\.suggestions/);
  assert.match(dialogStyles, /@media \(max-width: 620px\)[\s\S]*?\.choices,.suggestions > div \{ grid-template-columns: 1fr; \}/);
});
