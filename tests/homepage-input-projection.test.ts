import assert from "node:assert/strict";
import test from "node:test";

import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { handoffRouteStops, homepageBuilderDateRange, homepageSnapshotForDescribePrompt, projectHomepageInput, type HomepageDestinationEntry, type HomepageInputSnapshot } from "../lib/easyt/home-trip-handoff.ts";
import { formatLocalDateRange } from "../lib/easyt/local-date.ts";
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

const neutralOrigin = { name: "City of London", canonicalPlaceId: "open-world:nominatim:relation:51800", country: "United Kingdom", coordinates: [-0.0919983, 51.5156177] as [number, number] };
const arrowPrompt = "Bangkok → Siem Reap → Hội An → Hanoi";

for (const sequence of ["origin then prompt", "prompt then origin"] as const) {
  test(`shared origin and bare arrow stays survive ${sequence}`, () => {
    let snapshot: HomepageInputSnapshot = { ...emptyHomepageInput(), mode: "describe" as const, tripType: { state: "selected" as const, value: "one_way" as const } };
    if (sequence === "origin then prompt") {
      snapshot = { ...snapshot, origin: { state: "selected", value: neutralOrigin }, originInput: neutralOrigin.name };
      snapshot = homepageSnapshotForDescribePrompt(snapshot, arrowPrompt);
    } else {
      snapshot = homepageSnapshotForDescribePrompt(snapshot, arrowPrompt);
      snapshot = { ...snapshot, origin: { state: "selected", value: neutralOrigin }, originInput: neutralOrigin.name };
    }
    assert.deepEqual(snapshot.origin, { state: "selected", value: neutralOrigin });
    assert.equal(snapshot.originInput, neutralOrigin.name);
    const capture = captureJourneyBrief(arrowPrompt), original = structuredClone(capture);
    const result = projectHomepageInput({ snapshot, capture, profile: null, handoffId: sequence });
    assert(result.ok);
    assert.equal(result.draft.origin, neutralOrigin.name);
    assert.equal(result.draft.routeIntent?.origin?.canonicalPlaceId, neutralOrigin.canonicalPlaceId);
    assert.deepEqual(result.draft.routeIntent?.destinations.map(d => d.sourceText), ["Bangkok", "Siem Reap", "Hội An", "Hanoi"]);
    assert.equal(result.draft.routeIntent?.orderAuthority, "explicit");
    assert.equal(result.draft.journeyEnd?.mode, "unknown");
    assert.deepEqual(handoffRouteStops(result.draft.locationMentions!, result.draft.journeyEnd).map(s => s.name), ["Bangkok", "Siem Reap", "Hoi An", "Hanoi"]);
    assert.deepEqual(result.draft.locationMentions?.map(m => m.mentionId), original.mentions.map(m => m.mentionId));
    assert.deepEqual(capture, original, "Contextual projection must not mutate the captured source");
  });
}

test("shared origin keeps both bare-arrow Bangkok occurrences without inventing a return endpoint", () => {
  const prompt = "Bangkok → Chiang Mai → Bangkok";
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt, origin: { state: "selected" as const, value: neutralOrigin }, originInput: neutralOrigin.name,
    tripType: { state: "selected" as const, value: "one_way" as const } };
  const result = projected(snapshot);
  assert(result.ok);
  assert.equal(result.draft.journeyEnd?.mode, "unknown");
  assert.deepEqual(result.draft.routeIntent?.destinations.map(d => d.sourceText), ["Bangkok", "Chiang Mai", "Bangkok"]);
  assert.equal(new Set(result.draft.routeIntent?.destinations.map(d => d.id)).size, 3);
  assert.equal(handoffRouteStops(result.draft.locationMentions!, result.draft.journeyEnd).length, 3);
  assert.equal(result.draft.routeIntent?.orderAuthority, "explicit");
});

test("prompt-only arrows retain their existing gateway interpretation", () => {
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt: arrowPrompt, tripType: { state: "selected" as const, value: "one_way" as const } };
  const result = projected(snapshot);
  assert(result.ok);
  assert.equal(result.draft.locationMentions?.[0].role, "origin");
  assert.deepEqual(result.draft.routeIntent?.destinations.map(d => d.sourceText), ["Siem Reap", "Hội An", "Hanoi"]);
});

test("shared origin retains explicit finish wording in an arrow route", () => {
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt: "Bangkok → Hanoi → finish in Bangkok",
    origin: { state: "selected" as const, value: neutralOrigin }, originInput: neutralOrigin.name,
    tripType: { state: "selected" as const, value: "one_way" as const } };
  const result = projected(snapshot);
  assert(result.ok);
  assert.equal(result.draft.journeyEnd?.mode, "explicit");
  if (result.draft.journeyEnd?.mode === "explicit") assert.equal(result.draft.journeyEnd.place.canonicalPlaceId, "bangkok");
  assert.deepEqual(result.draft.routeIntent?.destinations.map(d => d.sourceText), ["Bangkok", "Hanoi"]);
});

test("shared-origin arrow projection retains source-bound nights and commitments", () => {
  const prompt = `${arrowPrompt}. Siem Reap 2 nights, Hội An 4 nights, Hanoi 3 nights.`;
  const capture = captureJourneyBrief(prompt);
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, prompt,
    origin: { state: "selected" as const, value: neutralOrigin }, originInput: neutralOrigin.name,
    tripType: { state: "selected" as const, value: "one_way" as const } };
  const result = projectHomepageInput({ snapshot, capture, profile: null, handoffId: "arrow-nights" });
  assert(result.ok);
  assert.deepEqual(result.draft.routeIntent?.destinations.map(d => [d.id, d.requestedNights]),
    capture.mentions.map((mention, index) => [mention.mentionId, [null, 2, 4, 3][index]]));
  assert.deepEqual(result.draft.structuredBrief?.hardConstraints.filter(c => c.type === "fixed-commitment"),
    capture.structuredBrief.hardConstraints.filter(c => c.type === "fixed-commitment"));
  assert.equal(result.draft.routeIntent?.orderAuthority, "explicit");
  assert.equal(result.draft.routeIntent?.origin?.canonicalPlaceId, neutralOrigin.canonicalPlaceId);
});

for (const prompt of ["From Madrid to Tokyo for 5 nights", "Start from Sydney then Melbourne and finish in Cairns", "Fly from Bangkok to Hanoi",
  "Bangkok → Hanoi; start in Bangkok", "Bangkok → Hanoi; fly from Bangkok"]) {
  test(`explicit endpoint words still retire the prior shared origin: ${prompt}`, () => {
    const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, origin: { state: "selected" as const, value: neutralOrigin }, originInput: neutralOrigin.name };
    const edited = homepageSnapshotForDescribePrompt(snapshot, prompt);
    assert.equal(edited.origin.state, "untouched");
    assert.equal(edited.originInput, "");
  });
}

test("a negated later departure does not turn arrow order into an origin override", () => {
  const prompt = "Bangkok → Hanoi; do not start in Bangkok";
  const snapshot = { ...emptyHomepageInput(), mode: "describe" as const,
    origin: { state: "selected" as const, value: neutralOrigin }, originInput: neutralOrigin.name };
  assert.deepEqual(homepageSnapshotForDescribePrompt(snapshot, prompt).origin, snapshot.origin);
});

for (const prompt of ["Do not start in Bangkok; visit Bangkok then Hanoi", "Maybe Bangkok → Hanoi", "Could Bangkok and Hanoi work?"]) {
  test(`refused or uncertain endpoint does not clear the shared origin: ${prompt}`, () => {
    const snapshot = { ...emptyHomepageInput(), mode: "describe" as const, origin: { state: "selected" as const, value: neutralOrigin }, originInput: neutralOrigin.name };
    const edited = homepageSnapshotForDescribePrompt(snapshot, prompt);
    assert.deepEqual(edited.origin, snapshot.origin);
    assert.equal(edited.originInput, snapshot.originInput);
  });
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

test("editing a described trip replaces stale endpoint choices when the prompt names new endpoints", () => {
  const snapshot = emptyHomepageInput();
  snapshot.mode = "describe";
  snapshot.origin = { state: "selected", value: { name: "Greater London" } };
  snapshot.journeyEnd = { state: "selected", value: { mode: "explicit", place: { name: "Seoul" } } };
  const prompt = "Three weeks in Australia, starting in Sydney and ending in Cairns.";
  const edited = homepageSnapshotForDescribePrompt(snapshot, prompt);
  assert.equal(edited.origin.state, "untouched");
  assert.equal(edited.journeyEnd.state, "untouched");
  const result = projectHomepageInput({ snapshot: edited, capture: captureJourneyBrief(prompt), profile: null, handoffId: "new-endpoints" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.notEqual(result.draft.origin, "Greater London");
  assert.equal(result.draft.locationMentions?.find((mention) => mention.role === "fixed_start")?.canonicalName, "Sydney");
  assert.equal(result.draft.journeyEnd?.mode, "explicit");
  if (result.draft.journeyEnd?.mode === "explicit") assert.equal(result.draft.journeyEnd.place.name, "Cairns");
});

test("fresh fixed endpoints win over saved choices for the complex acceptance prompts", () => {
  const scenarios = [
    { prompt: "Three weeks exploring Japan and China: Tokyo, Kyoto and Osaka by train, then fly to Shanghai, take the train to Hangzhou and finish in Beijing.", end: "Beijing" },
    { prompt: "Three weeks in South Africa and Namibia: start in Cape Town, see the Garden Route, then travel north to Sossusvlei, Swakopmund, Etosha and finish in Windhoek.", start: "Cape Town", end: "Windhoek" },
    { prompt: "About 2 weeks in Japan, first time, Tokyo and Kyoto definitely, somewhere quieter in between, flying into Tokyo and out of Osaka.", end: "Osaka" },
  ];
  for (const { prompt, start, end } of scenarios) {
    const snapshot = emptyHomepageInput();
    snapshot.mode = "describe";
    snapshot.origin = { state: "selected", value: { name: "Greater London" } };
    snapshot.journeyEnd = { state: "selected", value: { mode: "explicit", place: { name: "Seoul" } } };
    const edited = homepageSnapshotForDescribePrompt(snapshot, prompt);
    const result = projectHomepageInput({ snapshot: edited, capture: captureJourneyBrief(prompt), profile: null, handoffId: "fresh-endpoint" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    if (start) {
      assert.notEqual(result.draft.origin, "Greater London");
      assert.equal(result.draft.locationMentions?.find(mention => mention.role === "fixed_start")?.canonicalName, start);
    }
    assert.equal(result.draft.journeyEnd?.mode, "explicit");
    if (result.draft.journeyEnd?.mode === "explicit") assert.equal(result.draft.journeyEnd.place.name, end);
  }
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

test("dates reject reversed ranges while a selected start alone remains flexible", () => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [selectedEntry("a", "Tokyo")];
  snapshot.dates = { state: "selected", value: { start: "2026-07-10", end: "2026-07-01" } };
  snapshot.travellers = { state: "selected", value: 1 };
  let result = projected(snapshot);
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.issues, [{ field: "dates", code: "invalid" }]);

  snapshot.dates = { state: "selected", value: { start: "2026-07-01", end: "" } };
  result = projected(snapshot);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.draft.startDate, "2026-07-01");
    assert.equal(result.draft.endDate, undefined);
    assert.equal(result.draft.datesExplicit, false);
    assert.equal(result.draft.durationDays, undefined);
  }

  snapshot.dates = { state: "untouched" };
  snapshot.travellers = { state: "selected", value: 12 };
  result = projected(snapshot);
  assert.equal(result.ok, true);
});

test("start-only dates show their anchor and distinguish suggested duration from stated duration", () => {
  assert.equal(formatLocalDateRange("2026-11-10", "", "en", "Add dates"), "From 10 Nov 2026");
  assert.equal(formatLocalDateRange("2026-11-10", "", "es", "Añadir fechas"), "Desde el 10 nov 2026");
  assert.deepEqual(homepageBuilderDateRange({ startDate: "2026-11-10" }, 7), {
    endDate: "2026-11-16", durationSuggested: true,
  });
  assert.deepEqual(homepageBuilderDateRange({ startDate: "2026-11-10", durationDays: 14 }, 7), {
    endDate: "2026-11-23", durationSuggested: false,
  });
  assert.deepEqual(homepageBuilderDateRange({ startDate: "2026-11-10", endDate: "2026-11-27", durationDays: 14 }, 7), {
    endDate: "2026-11-27", durationSuggested: false,
  });
});

test("a Central Asia start-only prompt retains its stated two weeks without fixing an end date", () => {
  const snapshot = emptyHomepageInput();
  snapshot.mode = "describe";
  snapshot.prompt = "Kazakhstan, Uzbekistan, Kyrgyzstan, 2 weeks";
  snapshot.dates = { state: "selected", value: { start: "2026-11-10", end: "" } };
  const result = projected(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.startDate, "2026-11-10");
  assert.equal(result.draft.endDate, undefined);
  assert.equal(result.draft.durationDays, 14);
  assert.equal(result.draft.datesExplicit, false);
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
