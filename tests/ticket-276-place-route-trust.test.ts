import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalPlaceEnrichmentIsCompatible } from "../lib/easyt/canonical-place-enrichment.ts";
import { routableHandoffMentions } from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief, captureJourneyBriefFromSemanticIntent, captureJourneyBriefWithProvider } from "../lib/easyt/journey-capture.ts";
import { localPlaceWithinCanonicalScope } from "../lib/easyt/local-place-geography.ts";
import { createOpenWorldPlaceProvider } from "../lib/easyt/open-world-place.server.ts";
import type { PlaceIntelligenceProvider, PlaceProviderCandidate } from "../lib/easyt/place-intelligence.ts";
import {
  SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  type SemanticTripIntent,
} from "../lib/easyt/semantic-trip-intent.ts";
import { canonicalRouteEndpoints } from "../lib/easyt/trip-legs.ts";
import { isEasyTTrip, tripFromBuilder } from "../lib/easyt/trip.ts";

const ROUTE_A = "London → Tokyo → Kanazawa → Shirakawa-go → Takayama → Hirayu → Matsumoto → Chengdu → Zhangjiajie → Fenghuang → Fanjingshan → Hong Kong → London";
const ROUTE_B = "London → Hanoi → Ha Long Bay → Ninh Binh → Hue → Hoi An → Ho Chi Minh City → London";
const routeASources = ["London", "Tokyo", "Kanazawa", "Shirakawa-go", "Takayama", "Hirayu", "Matsumoto", "Chengdu", "Zhangjiajie", "Fenghuang", "Fanjingshan", "Hong Kong", "London"];
const routeBSources = ["London", "Hanoi", "Ha Long Bay", "Ninh Binh", "Hue", "Hoi An", "Ho Chi Minh City", "London"];

function candidate(
  providerId: string,
  canonicalName: string,
  country: string,
  placeType: PlaceProviderCandidate["placeType"],
  coordinates: [number, number],
  options: Partial<PlaceProviderCandidate> = {},
): PlaceProviderCandidate {
  const direct = placeType === "city" || placeType === "town" || placeType === "transport_gateway";
  return {
    providerId, canonicalName, placeType, parentCountries: [country], coordinates,
    routability: direct ? "direct_destination" : placeType === "landmark" ? "anchor_or_poi" : "needs_base_selection",
    matchQuality: "exact", rankScore: 100, ...options,
  };
}

const fixtureCandidates: Record<string, PlaceProviderCandidate[]> = {
  "shirakawa-go": [candidate("node:shirakawa", "Shirakawa-gō", "Japan", "landmark", [136.9068, 36.2573], { aliases: ["Shirakawa-go"] })],
  hirayu: [candidate("node:hirayu", "Hirayu Onsen", "Japan", "town", [137.5537, 36.1915], { aliases: ["Hirayu", "平湯温泉"] })],
  matsumoto: [candidate("relation:matsumoto", "Matsumoto", "Japan", "city", [137.9687, 36.2382])],
  fenghuang: [candidate("node:fenghuang", "Fenghuang", "China", "city", [109.5942, 27.9513])],
  fanjingshan: [
    candidate("node:exact-mountain", "Fanjingshan", "China", "natural_area", [108.6917, 27.91], { rankScore: 98 }),
    candidate("node:fuzzy-town", "Fanjiashan", "China", "town", [104.0961, 35.8126], { aliases: ["Fanjingshan"], matchQuality: "alias", rankScore: 118 }),
  ],
  "ha-long-bay": [
    candidate("relation:bay", "Ha Long Bay Heritage Site", "Vietnam", "natural_area", [107.2096, 20.8274], { aliases: ["Ha Long Bay"], matchQuality: "alias", rankScore: 71 }),
    candidate("node:pearl-farm", "Ha Long Bay Pearl Farm", "Vietnam", "landmark", [107.1793, 20.9106], { aliases: ["Ha Long Bay"], matchQuality: "alias", rankScore: 68 }),
  ],
};

function fixtureProvider(overrides: Record<string, PlaceProviderCandidate[]> = {}): PlaceIntelligenceProvider {
  return {
    id: "ticket-276-fixture", label: "Ticket 276 fixture", timeoutMs: 100,
    lookup: async (phrase) => ({ ...fixtureCandidates, ...overrides })[phrase.toLocaleLowerCase().replace(/\s+/g, "-")] ?? [],
  };
}

function semanticIntentForRoute(sources: string[]): SemanticTripIntent {
  return {
    schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
    rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: sources[0]!, certainty: "explicit" },
    journeyEnd: { sourceText: sources.at(-1)!, interpretedText: null, mode: "same_as_start", certainty: "explicit" },
    duration: { sourceText: null, value: null, unit: null }, explicitDateTexts: [],
    destinationCandidates: sources.slice(1).map((sourceText) => ({ sourceText, interpretedText: null, role: "route-stop" as const, certainty: "explicit" as const })),
    pointsOfInterest: [],
    transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
    pace: { sourceText: null, value: null }, interests: [], constraints: [], ambiguities: [], unresolvedMeaningfulText: [],
  };
}

test("the two exact arrow routes capture one origin, one final endpoint and preserve requested order", () => {
  for (const [raw, expected] of [[ROUTE_A, routeASources], [ROUTE_B, routeBSources]] as const) {
    const capture = captureJourneyBrief(raw);
    assert.deepEqual(capture.mentions.map((mention) => mention.sourceText), expected);
    assert.equal(capture.mentions[0]?.role, "origin");
    assert.equal(capture.mentions.at(-1)?.role, "fixed_end");
    assert.equal(capture.journeyEnd.mode, "explicit");
    assert.equal(capture.journeyEnd.mode === "explicit" ? capture.journeyEnd.place.canonicalPlaceId : undefined, "london");
    assert.equal(routableHandoffMentions(capture.mentions).slice(1).some((mention) => mention.canonicalPlaceId === "london"), false);
  }
});

test("semantic extraction cannot reintroduce the repeated endpoint as a stay or change route order", async () => {
  const capture = await captureJourneyBriefFromSemanticIntent(ROUTE_A, semanticIntentForRoute(routeASources), fixtureProvider());
  assert.deepEqual(capture.mentions.map((mention) => mention.sourceText), routeASources);
  assert.deepEqual(capture.mentions.map((mention) => mention.order), routeASources.map((_, index) => index));
  assert.deepEqual(capture.mentions.filter((mention) => mention.canonicalPlaceId === "london").map((mention) => mention.role), ["origin", "fixed_end"]);
});

test("Route A keeps geographic identities, localized aliases and natural-area intent without a fuzzy-town substitution", async () => {
  const capture = await captureJourneyBriefWithProvider(ROUTE_A, fixtureProvider());
  const shirakawa = capture.mentions.find((mention) => mention.sourceText === "Shirakawa-go");
  const hirayu = capture.mentions.find((mention) => mention.sourceText === "Hirayu");
  const fanjingshan = capture.mentions.find((mention) => mention.sourceText === "Fanjingshan");
  assert.deepEqual({ name: shirakawa?.canonicalName, type: shirakawa?.placeType, country: shirakawa?.parentCountries[0] }, { name: "Shirakawa-gō", type: "landmark", country: "Japan" });
  assert.deepEqual({ name: hirayu?.canonicalName, aliases: hirayu?.aliases }, { name: "Hirayu Onsen", aliases: ["Hirayu", "平湯温泉"] });
  assert.deepEqual({ name: fanjingshan?.canonicalName, type: fanjingshan?.placeType, status: fanjingshan?.status }, { name: "Fanjingshan", type: "natural_area", status: "partially_resolved" });
});

test("Route B keeps Ha Long Bay as the broad visit anchor and provider failure never drops the request", async () => {
  const resolved = await captureJourneyBriefWithProvider(ROUTE_B, fixtureProvider());
  const bay = resolved.mentions.find((mention) => mention.sourceText === "Ha Long Bay");
  assert.deepEqual({ name: bay?.canonicalName, type: bay?.placeType, routability: bay?.routability }, { name: "Ha Long Bay Heritage Site", type: "natural_area", routability: "needs_base_selection" });
  const unavailable = await captureJourneyBriefWithProvider(ROUTE_B, fixtureProvider({ "ha-long-bay": [] }));
  const retained = unavailable.mentions.find((mention) => mention.sourceText === "Ha Long Bay");
  assert.equal(retained?.status, "unresolved");
  assert.equal(retained?.canonicalName, "Ha Long Bay");
});

test("duplicate localized aliases with one provider identity converge to one place", async () => {
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [
    { id: "one", label: "One", search: async () => [candidate("node:99", "Hirayu-onsen", "Japan", "town", [137.5537, 36.1915], { aliases: ["Hirayu", "平湯温泉"] })] },
    { id: "two", label: "Two", search: async () => [candidate("N:99", "平湯温泉", "Japan", "town", [137.5537, 36.1915], { aliases: ["Hirayu", "Hirayu-onsen"] })] },
  ] });
  const candidates = await provider.lookup("Hirayu", { travelIntent: "route-stop", countryNames: ["Japan"] });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.coordinates?.[0], 137.5537);
});

test("persisted route endpoints contain no stay after the final London endpoint", async () => {
  const capture = await captureJourneyBriefWithProvider(ROUTE_B, fixtureProvider());
  const directStops = routableHandoffMentions(capture.mentions).filter((mention) => mention.role !== "origin");
  const trip = tripFromBuilder({
    id: "ticket-276-route-b", origin: "London", originCanonicalPlaceId: "london", originCountry: "United Kingdom", originCoordinates: [-0.1278, 51.5074],
    journeyEnd: capture.journeyEnd,
    stops: directStops.map((mention) => ({ id: mention.mentionId, name: mention.canonicalName, country: mention.parentCountries[0] ?? "", canonicalPlaceId: mention.canonicalPlaceId, coordinates: mention.coordinates })),
    startDate: "2026-10-01", endDate: "2026-10-06", picks: {}, mustDo: ROUTE_B, pace: "slow", hotels: "few", budget: "mid",
    nightAllocations: Object.fromEntries(directStops.map((mention) => [mention.mentionId, 1])), draft: [],
  });
  assert.equal(isEasyTTrip(JSON.parse(JSON.stringify(trip))), true);
  assert.deepEqual(trip.stops.map((stop) => stop.name), ["Hanoi", "Ninh Bình", "Hue", "Hoi An", "Ho Chi Minh City"]);
  assert.deepEqual(canonicalRouteEndpoints(trip).map((endpoint) => endpoint.name), ["London", "Hanoi", "Ninh Bình", "Hue", "Hoi An", "Ho Chi Minh City", "London"]);
});

test("canonical enrichment rejects a person collision and stale coordinates", () => {
  const shirakawa = { country: "Japan", coordinates: [136.9068, 36.2573] as [number, number] };
  assert.equal(canonicalPlaceEnrichmentIsCompatible({ extract: "Hideki Shirakawa is a Japanese person." }, shirakawa), false);
  assert.equal(canonicalPlaceEnrichmentIsCompatible({ extract: "A place in Japan", coordinates: [139.6917, 35.6895] }, shirakawa), false);
  assert.equal(canonicalPlaceEnrichmentIsCompatible({ extract: "A place in Japan", coordinates: [136.9069, 36.2574] }, shirakawa), true);
});

test("nearby results must stay within the canonical radius and cannot cross countries", () => {
  const anchor: [number, number] = [136.9068, 36.2573];
  assert.equal(localPlaceWithinCanonicalScope({ anchor, candidate: [136.91, 36.26], radiusKm: 5, requestedCountry: "Japan", candidateCountry: "Japan" }), true);
  assert.equal(localPlaceWithinCanonicalScope({ anchor, candidate: [136.91, 36.26], radiusKm: 5, requestedCountry: "Vietnam", candidateCountry: "Viet Nam" }), true);
  assert.equal(localPlaceWithinCanonicalScope({ anchor, candidate: [-75.5, 10.4], radiusKm: 5, requestedCountry: "Japan", candidateCountry: "Colombia" }), false);
  assert.equal(localPlaceWithinCanonicalScope({ anchor, candidate: [-82.4, 23.1], radiusKm: 5, requestedCountry: "Japan", candidateCountry: "Cuba" }), false);
});

test("Map and Overview send canonical coordinates and provider fallbacks apply shared geography guards", () => {
  const placeRoute = readFileSync(new URL("../app/api/journey-place/route.ts", import.meta.url), "utf8");
  const localRoute = readFileSync(new URL("../app/api/journey-local-search/route.ts", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../components/easyt/trip-overview-workspace.tsx", import.meta.url), "utf8");
  assert.match(placeRoute, /canonicalPlaceEnrichmentIsCompatible/);
  assert.match(localRoute, /localPlaceWithinCanonicalScope/);
  for (const consumer of [map, overview]) {
    assert.match(consumer, /params\.set\("lon"/);
    assert.match(consumer, /params\.set\("lat"/);
  }
});

test("an explicit origin stay remains separate from origin and return endpoint roles", () => {
  const capture = captureJourneyBrief("Start in London, stay 2 nights in London, then Paris, then return to London");
  const londonRoles = capture.mentions.filter((mention) => mention.canonicalPlaceId === "london").map((mention) => mention.role);
  assert.deepEqual(londonRoles, ["fixed_start", "preferred", "fixed_end"]);
  assert.equal(routableHandoffMentions(capture.mentions).filter((mention) => mention.canonicalPlaceId === "london").length, 2);
});
