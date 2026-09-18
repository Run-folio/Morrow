import assert from "node:assert/strict";
import test from "node:test";

import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { projectHomepageInput, type HomepageDestinationEntry } from "../lib/easyt/home-trip-handoff.ts";
import { findCatalogPlaceById } from "../lib/easyt/place-catalog.ts";
import type { CanonicalPlaceSuggestion } from "../lib/easyt/place-intelligence.ts";
import { defaultTravelProfile } from "../lib/easyt/travel-profile.ts";
import { emptyHomepageInput, selectedEntry } from "./fixtures/homepage-dual-entry.ts";

function cataloguedEntry(id: string, canonicalPlaceId: string): HomepageDestinationEntry {
  const place = findCatalogPlaceById(canonicalPlaceId);
  assert(place, `Expected ${canonicalPlaceId} in the catalogue fixture`);
  const selection: CanonicalPlaceSuggestion = {
    canonicalPlaceId: place.canonicalPlaceId,
    name: place.canonicalName,
    label: `${place.canonicalName}, ${place.parentCountries[0] ?? ""}`,
    country: place.parentCountries[0] ?? "",
    placeType: place.placeType,
    coordinates: place.coordinates ? [...place.coordinates] : undefined,
    routability: place.routability,
    provenance: [{
      ...place.provenance,
      kind: place.provenance.kind === "curated" ? "curated_alias" : "canonical",
    }],
  };
  return { id, text: selection.label, selection };
}

function projected(snapshot = emptyHomepageInput(), handoffId = "h1") {
  return projectHomepageInput({ snapshot, profile: null, handoffId });
}

test("stops projection retains selected occurrence IDs and ignores inactive prompt", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto"), selectedEntry("c", "Tokyo")];
  snapshot.prompt = "An inactive trip to Peru";

  const result = projected(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.draft.destinations?.map((stop) => stop.id), ["a", "b", "c"]);
  assert.deepEqual(result.draft.structuredBrief?.destinations.map((destination) => destination.id), ["a", "b", "c"]);
  assert.equal(result.draft.structuredBrief?.source.rawPrompt, undefined);
  assert.equal(result.draft.decisionSelections?.routeOrder, "entered");
  assert.deepEqual(result.draft.homepage?.occurrenceMentionIds && Object.keys(result.draft.homepage.occurrenceMentionIds), ["a", "b", "c"]);
});

test("describe projection ignores inactive entries and requires a prompt", () => {
  const snapshot = emptyHomepageInput();
  snapshot.mode = "describe";
  snapshot.entries = [selectedEntry("a", "Tokyo")];
  snapshot.prompt = "Two weeks in Peru with food and hiking";

  const result = projected(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.brief, snapshot.prompt);
  assert.deepEqual(result.draft.destinations, undefined);

  snapshot.prompt = " ";
  const invalid = projected(snapshot, "h2");
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.deepEqual(invalid.issues, [{ field: "prompt", code: "required" }]);
});

test("stops projection retains planning areas and anchors without inventing route stops", () => {
  const japan = emptyHomepageInput();
  japan.entries = [cataloguedEntry("japan", "japan")];
  const japanResult = projected(japan);
  assert.equal(japanResult.ok, true);
  if (!japanResult.ok) return;
  assert.deepEqual(japanResult.draft.destinations, []);
  assert.equal(japanResult.draft.structuredBrief?.placeMentions?.[0]?.routability, "planning_area");

  const anchor = emptyHomepageInput();
  anchor.entries = [cataloguedEntry("machu", "machu-picchu")];
  const anchorResult = projected(anchor);
  assert.equal(anchorResult.ok, true);
  if (!anchorResult.ok) return;
  assert.deepEqual(anchorResult.draft.destinations, []);
  assert.equal(anchorResult.draft.structuredBrief?.placeMentions?.[0]?.routability, "anchor_or_poi");
  assert.equal(anchorResult.draft.structuredBrief?.placeIssues?.some((issue) => issue.code === "region_requires_base"), true);
});

test("stops projection preserves mixed area and city order without reinterpreting selections", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [cataloguedEntry("japan", "japan"), selectedEntry("tokyo", "Tokyo"), selectedEntry("kyoto", "Kyoto")];
  const result = projected(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.draft.structuredBrief?.placeMentions?.map((mention) => mention.canonicalPlaceId), ["japan", "tokyo", "kyoto"]);
  assert.deepEqual(result.draft.destinations?.map((destination) => destination.id), ["tokyo", "kyoto"]);
});

test("stops projection blocks unknown free text until a canonical selection exists", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [{ id: "unknown", text: "Mystery Coast", selection: null }];
  const result = projected(snapshot);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [{ field: "destinations", code: "unresolved", entryId: "unknown" }]);
});

test("an explicit end does not erase an independently selected matching stop", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto"), selectedEntry("c", "Tokyo")];
  const tokyo = selectedEntry("end", "Tokyo").selection!;
  snapshot.journeyEnd = { state: "selected", value: { mode: "explicit", place: { name: tokyo.name, canonicalPlaceId: tokyo.canonicalPlaceId, country: tokyo.country, coordinates: tokyo.coordinates } } };
  const result = projected(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.draft.destinations?.map((stop) => stop.id), ["a", "b", "c"]);
  assert.equal(result.draft.journeyEnd?.mode, "explicit");
});

test("selected endpoints become structured gateway facts while preserving selected stops", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto"), selectedEntry("c", "Tokyo")];
  const tokyo = selectedEntry("origin", "Tokyo").selection!;
  const kyoto = selectedEntry("end", "Kyoto").selection!;
  snapshot.origin = { state: "selected", value: { name: tokyo.name, canonicalPlaceId: tokyo.canonicalPlaceId, country: tokyo.country, coordinates: tokyo.coordinates } };
  snapshot.journeyEnd = { state: "selected", value: { mode: "explicit", place: { name: kyoto.name, canonicalPlaceId: kyoto.canonicalPlaceId, country: kyoto.country, coordinates: kyoto.coordinates } } };
  const result = projected(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.draft.destinations?.map((stop) => stop.id), ["a", "b", "c"]);
  assert.equal(result.draft.structuredBrief?.destinations.some((destination) => destination.role === "arrival-gateway" && destination.name === "Tokyo"), true);
  assert.equal(result.draft.structuredBrief?.destinations.some((destination) => destination.role === "departure-gateway" && destination.name === "Kyoto"), true);
  assert.equal(result.draft.structuredBrief?.hardConstraints.some((constraint) => constraint.type === "start-at" && constraint.value === "Tokyo"), true);
  assert.equal(result.draft.structuredBrief?.hardConstraints.some((constraint) => constraint.type === "end-at" && constraint.value === "Kyoto"), true);
});

test("explicit clears override captured and profile values without removing captured duration", () => {
  const snapshot = emptyHomepageInput();
  snapshot.mode = "describe";
  snapshot.prompt = "Three weeks in Peru with culture";
  snapshot.interests = { state: "cleared" };
  snapshot.budget = { state: "cleared" };
  snapshot.dates = { state: "cleared" };
  const capture = captureJourneyBrief(snapshot.prompt);
  const profile = { ...defaultTravelProfile, budget: "high" as const, usualInterests: ["food" as const] };
  const result = projectHomepageInput({ snapshot, capture, profile, handoffId: "h-clear" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.draft.interests, []);
  assert.equal(result.draft.interestsExplicit, true);
  assert.equal(result.draft.budget, undefined);
  assert.equal(result.draft.datesExplicit, false);
  assert.equal(result.draft.startDate, undefined);
  assert.equal(result.draft.endDate, undefined);
  assert.equal(result.draft.durationDays, 21);
  assert.deepEqual(result.draft.structuredBrief?.interests, []);
  assert.equal(result.draft.structuredBrief?.budget, undefined);
  assert.deepEqual(result.draft.structuredBrief?.dates, {});
});

test("dates and travellers reject malformed values outside supported ranges", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("a", "Tokyo")];
  snapshot.dates = { state: "selected", value: { start: "2026-13-01", end: "2026-02-20" } };
  snapshot.travellers = { state: "selected", value: 13 };
  const result = projected(snapshot);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [
    { field: "dates", code: "invalid" },
    { field: "travellers", code: "invalid" },
  ]);
});

test("dates reject partial and reversed ranges while accepting the 1 to 12 traveller bounds", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("a", "Tokyo")];
  snapshot.dates = { state: "selected", value: { start: "2026-07-10", end: "2026-07-01" } };
  snapshot.travellers = { state: "selected", value: 1 };
  let result = projected(snapshot);
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.issues, [{ field: "dates", code: "invalid" }]);

  snapshot.dates = { state: "selected", value: { start: "2026-07-01", end: "" } };
  result = projected(snapshot);
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.issues, [{ field: "dates", code: "invalid" }]);

  snapshot.dates = { state: "untouched" };
  snapshot.travellers = { state: "selected", value: 12 };
  result = projected(snapshot);
  assert.equal(result.ok, true);
});

test("selected dates, travellers and budget take precedence over capture and profile", () => {
  const snapshot = emptyHomepageInput();
  snapshot.mode = "describe";
  snapshot.prompt = "A relaxed week in Peru";
  snapshot.dates = { state: "selected", value: { start: "2026-06-01", end: "2026-06-07" } };
  snapshot.travellers = { state: "selected", value: 12 };
  snapshot.budget = { state: "selected", value: "value" };
  const result = projectHomepageInput({ snapshot, capture: captureJourneyBrief(snapshot.prompt), profile: { ...defaultTravelProfile, budget: "high" }, handoffId: "h-selected" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.startDate, "2026-06-01");
  assert.equal(result.draft.endDate, "2026-06-07");
  assert.equal(result.draft.travellers, 12);
  assert.equal(result.draft.budget, "value");
  assert.equal(result.draft.structuredBrief?.budget?.value, "value");
});

test("every selected budget band wins after a later profile loads", () => {
  for (const budget of ["value", "mid", "high"] as const) {
    const snapshot = emptyHomepageInput();
    snapshot.entries = [selectedEntry("a", "Tokyo")];
    snapshot.budget = { state: "selected", value: budget };
    const result = projectHomepageInput({ snapshot, profile: { ...defaultTravelProfile, budget: budget === "high" ? "value" : "high" }, handoffId: `h-${budget}` });
    assert.equal(result.ok, true, budget);
    if (!result.ok) continue;
    assert.equal(result.draft.budget, budget);
    assert.equal(result.draft.structuredBrief?.budget?.value, budget);
    assert.equal(result.draft.structuredBrief?.budget?.provenance.kind, "explicit");
  }
});

test("an untouched budget retains the operational fallback without becoming a selected preference", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("a", "Tokyo")];
  const result = projected(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.budget, "mid");
  assert.equal(result.draft.structuredBrief?.budget?.provenance.source, "morrovia-default");
  assert.equal(result.draft.structuredBrief?.budget?.provenance.kind, "default");
  assert.equal(result.draft.homepage?.choices.budget.state, "untouched");
});
