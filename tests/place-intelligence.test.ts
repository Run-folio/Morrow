import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalPlaceFactsMatch,
  canonicalPlaceSuggestionFor,
  canonicalPlaceSuggestionsForQuery,
  placeMentionsNeedingReview,
  regionalBaseSuggestions,
  resolveExplicitPlaceMentions,
  resolveExplicitPlaceMentionsWithProvider,
  resolvePlaceMentions,
  resolvePlaceMentionsWithProvider,
  selectPlaceCandidate,
  type PlaceIntelligenceProvider,
} from "../lib/easyt/place-intelligence.ts";
import { isDuplicatePlaceIdentity, placeAutocompleteKeyAction } from "../lib/easyt/place-autocomplete.ts";
import { NIKKO_CANONICAL_FIXTURE } from "./fixtures/prebeta-place-trip-state.ts";

test("Nikko suggestions and prompt capture converge on one canonical identity", () => {
  const suggestion = canonicalPlaceSuggestionFor("Nikko", ["Japan"]);
  const mention = resolvePlaceMentions("Tokyo and Nikko").mentions.find((item) => item.canonicalPlaceId === "nikko");

  assert.ok(suggestion);
  assert.equal(suggestion.label, "Nikko · Tochigi, Japan");
  assert.deepEqual({
    canonicalPlaceId: suggestion.canonicalPlaceId,
    name: suggestion.name,
    country: suggestion.country,
    region: suggestion.region,
    coordinates: suggestion.coordinates,
  }, NIKKO_CANONICAL_FIXTURE);
  assert.equal(mention?.canonicalPlaceId, suggestion.canonicalPlaceId);
  assert.equal(canonicalPlaceFactsMatch("nikko", { country: "Japan", coordinates: NIKKO_CANONICAL_FIXTURE.coordinates }), true);
  assert.equal(canonicalPlaceFactsMatch("nikko", { country: "Japan", coordinates: [-66.1568, -16.2902] }), false);
});

test("canonical autocomplete returns contextual route identities and supports keyboard selection", () => {
  const morocco = canonicalPlaceSuggestionsForQuery("chef", ["Morocco"]);
  assert.deepEqual(morocco.map(({ canonicalPlaceId, name, country }) => ({ canonicalPlaceId, name, country })), [
    { canonicalPlaceId: "chefchaouen", name: "Chefchaouen", country: "Morocco" },
  ]);
  assert.deepEqual(placeAutocompleteKeyAction("ArrowDown", -1, 3), { activeIndex: 0, choose: false, close: false });
  assert.deepEqual(placeAutocompleteKeyAction("ArrowUp", 0, 3), { activeIndex: 2, choose: false, close: false });
  assert.deepEqual(placeAutocompleteKeyAction("Enter", -1, 3), { activeIndex: 0, choose: true, close: true });
  assert.deepEqual(placeAutocompleteKeyAction("Escape", 1, 3), { activeIndex: -1, choose: false, close: true });
  assert.equal(isDuplicatePlaceIdentity(
    [{ name: "Chefchaouen", canonicalPlaceId: "chefchaouen" }],
    { name: "Chaouen", canonicalPlaceId: "chefchaouen" },
  ), true);
  assert.equal(isDuplicatePlaceIdentity([{ name: "Fes" }], { name: " fes " }), true);
  assert.equal(isDuplicatePlaceIdentity([{ name: "Fes" }], { name: "Faro", canonicalPlaceId: "faro" }), false);
});

test("geography review omits confident route destinations and retains only attention states", () => {
  const known = resolvePlaceMentions("Marrakech, Fes and Chefchaouen");
  assert.deepEqual(placeMentionsNeedingReview(known.mentions, known.issues), []);

  const mixed = resolvePlaceMentions("Marrakech and Totallyunknownville");
  const review = placeMentionsNeedingReview(mixed.mentions, mixed.issues);
  assert.equal(review.some((mention) => mention.canonicalPlaceId === "marrakech"), false);
  assert.equal(review.some((mention) => mention.status === "unresolved"), true);
});

test("deterministic resolution preserves stable identity, order and exact source wording", () => {
  const prompt = "The French Alps and Lake Annecy, then Venice";
  const first = resolvePlaceMentions(prompt);
  const second = resolvePlaceMentions(prompt);

  assert.deepEqual(first, second);
  assert.equal(first.sequenceKind, "ordered");
  assert.deepEqual(first.mentions.map((mention) => ({
    sourceText: mention.sourceText,
    canonicalPlaceId: mention.canonicalPlaceId,
    parentRegionId: mention.parentRegionId,
    order: mention.order,
  })), [
    { sourceText: "The French Alps", canonicalPlaceId: "french-alps", parentRegionId: "alps", order: 0 },
    { sourceText: "Lake Annecy", canonicalPlaceId: "lake-annecy", parentRegionId: "french-alps", order: 1 },
    { sourceText: "Venice", canonicalPlaceId: "venice", parentRegionId: undefined, order: 2 },
  ]);
});

test("diacritics, multilingual aliases, alias deduplication and nested geography remain distinct", () => {
  const result = resolvePlaceMentions("Perú, Cusco and Valle Sagrado; Rapa Nui and Easter Island");

  assert.deepEqual(result.mentions.map((mention) => mention.canonicalPlaceId), [
    "peru",
    "cusco",
    "sacred-valley",
    "rapa-nui",
  ]);
  const valley = result.mentions.find((mention) => mention.canonicalPlaceId === "sacred-valley");
  assert.equal(valley?.sourceText, "Valle Sagrado");
  assert.equal(valley?.placeType, "valley");
  assert.deepEqual(valley?.parentCountries, ["Peru"]);

  const island = result.mentions.find((mention) => mention.canonicalPlaceId === "rapa-nui");
  assert.equal(island?.sourceText, "Rapa Nui");
  assert.deepEqual(island?.sourceTexts, ["Rapa Nui", "Easter Island"]);
  assert.equal(result.mentions.filter((mention) => mention.canonicalPlaceId === "rapa-nui").length, 1);
  assert.equal(result.issues.some((issue) => issue.code === "duplicate_alias" && issue.mentionId === island?.mentionId), true);
});

test("ambiguity uses meaningful context and otherwise remains explicit", () => {
  const isolated = resolvePlaceMentions("Georgia");
  const ambiguous = isolated.mentions[0];
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.canonicalPlaceId, undefined);
  assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.canonicalPlaceId).sort(), [
    "georgia-country",
    "georgia-us-state",
  ]);
  assert.equal(isolated.issues.some((issue) => issue.code === "ambiguous_place" && issue.blocksRoute), true);

  assert.equal(
    resolvePlaceMentions("Georgia and Armenia").mentions.find((mention) => mention.sourceText === "Georgia")?.canonicalPlaceId,
    "georgia-country",
  );
  assert.equal(
    resolvePlaceMentions("Georgia and Florida").mentions.find((mention) => mention.sourceText === "Georgia")?.canonicalPlaceId,
    "georgia-us-state",
  );

  const savedSelection = ambiguous.candidates.find((candidate) => candidate.canonicalPlaceId === "georgia-country");
  assert.ok(savedSelection);
  assert.equal(resolvePlaceMentions("Georgia", { selectedPlaces: [savedSelection] }).mentions[0]?.canonicalPlaceId, "georgia-country");
});

test("an exact saved builder selection resolves before the unresolved fallback", () => {
  const result = resolvePlaceMentions("Mystery Base", {
    selectedPlaces: [{
      canonicalPlaceId: "saved:mystery-base",
      canonicalName: "Mystery Base",
      placeType: "town",
      parentCountries: ["Exampleland"],
      routability: "direct_destination",
    }],
  });

  assert.equal(result.mentions[0]?.canonicalPlaceId, "saved:mystery-base");
  assert.equal(result.mentions[0]?.status, "resolved");
  assert.equal(result.mentions[0]?.provenance[0]?.kind, "builder");
  assert.equal(result.issues.some((issue) => issue.code === "unresolved_place"), false);
});

test("an unsupported phrase remains visible without a fabricated identity", () => {
  const result = resolvePlaceMentions("Venice and Mystery Coast");
  const unknown = result.mentions.find((mention) => mention.sourceText === "Mystery Coast");

  assert.ok(unknown);
  assert.equal(unknown.status, "unresolved");
  assert.equal(unknown.canonicalPlaceId, undefined);
  assert.equal(unknown.placeType, "unknown");
  assert.equal(unknown.routability, "non_routable_reference");
  assert.equal(unknown.confidence.state, "unknown");
  assert.equal(result.issues.some((issue) => issue.code === "unresolved_place" && issue.mentionId === unknown.mentionId), true);
  assert.equal(result.mentions.some((mention) => mention.canonicalName !== "Venice" && mention.directlyRoutable), false);
});

test("provider failure preserves deterministic unknowns and deduplicates provider work", async () => {
  let calls = 0;
  const unavailableProvider: PlaceIntelligenceProvider = {
    id: "offline-fixture",
    label: "Offline fixture",
    lookup: async () => {
      calls += 1;
      throw new Error("provider unavailable");
    },
  };

  const prompt = "Mystery Coast and Mystery Coast";
  const deterministic = resolvePlaceMentions(prompt);
  const enriched = await resolvePlaceMentionsWithProvider(prompt, unavailableProvider);

  assert.equal(calls, 1);
  assert.deepEqual(enriched, deterministic);
  assert.equal(enriched.mentions.every((mention) => mention.status === "unresolved"), true);
});

test("provider enrichment is bounded and deduplicates repeated canonical results", async () => {
  const timedOut = await resolvePlaceMentionsWithProvider("Mystery Coast", {
    id: "stalling-fixture",
    label: "Stalling fixture",
    timeoutMs: 5,
    lookup: () => new Promise(() => undefined),
  });
  assert.equal(timedOut.mentions[0]?.status, "unresolved");
  assert.equal(timedOut.mentions[0]?.sourceText, "Mystery Coast");

  let calls = 0;
  const enriched = await resolvePlaceMentionsWithProvider("Mystery Coast and Mystery Coast", {
    id: "fixed-fixture",
    label: "Fixed fixture",
    lookup: async () => {
      calls += 1;
      return [{
        providerId: "coast-1",
        canonicalName: "Mystery Coast",
        placeType: "coast",
        parentCountries: ["Exampleland"],
        routability: "needs_base_selection",
      }];
    },
  });
  assert.equal(calls, 1);
  assert.equal(enriched.mentions.length, 1);
  assert.equal(enriched.mentions[0]?.canonicalPlaceId, "fixed-fixture:coast-1");
  assert.equal(enriched.mentions[0]?.sourceTexts.length, 1);
});

test("malformed provider payloads remain deterministic unresolved data", async () => {
  const deterministic = resolvePlaceMentions("Mystery Coast");
  const malformed = await resolvePlaceMentionsWithProvider("Mystery Coast", {
    id: "malformed-fixture",
    label: "Malformed fixture",
    lookup: async () => [
      null,
      { providerId: 42, canonicalName: "Injected", placeType: "city" },
      { providerId: "bad-type", canonicalName: "Injected", placeType: "script" },
      { providerId: "bad-coordinates", canonicalName: "Injected", placeType: "city", coordinates: ["x", 1] },
    ] as unknown as ReturnType<PlaceIntelligenceProvider["lookup"]> extends Promise<infer T> ? T : never,
  });

  assert.deepEqual(malformed, deterministic);
});

test("curated regional base suggestions are traceable and never invented for unsupported regions", () => {
  const expectedRoutes = new Map([
    ["patagonia", "route-catalog:patagonia-w-circuit"],
    ["sacred-valley", "route-catalog:inca-trail-sacred-valley"],
    ["balkans", "route-catalog:balkans-overland"],
    ["japanese-alps", "route-catalog:japan-slow"],
  ]);

  for (const [regionId, sourceId] of expectedRoutes) {
    const suggestions = regionalBaseSuggestions(regionId);
    assert.ok(suggestions.length > 0, `${regionId} should expose reviewed route-catalog bases`);
    assert.equal(suggestions.every((suggestion) => suggestion.regionCanonicalPlaceId === regionId), true);
    assert.equal(suggestions.every((suggestion) => suggestion.provenance[0]?.id === sourceId), true);
    assert.equal(suggestions.every((suggestion) => suggestion.provenance[0]?.supports.includes("not a universal recommendation")), true);
  }

  assert.deepEqual(
    regionalBaseSuggestions("patagonia").map((suggestion) => suggestion.canonicalPlaceId),
    ["puerto-natales", "torres-del-paine", "el-calafate", "el-chalten"],
  );
  assert.deepEqual(regionalBaseSuggestions("dolomites"), []);
});

test("candidate selection records builder provenance and recomputes issues without mutating input", () => {
  const ambiguous = resolvePlaceMentions("Georgia");
  const original = structuredClone(ambiguous);
  const mentionId = ambiguous.mentions[0].mentionId;
  const selected = selectPlaceCandidate(ambiguous, mentionId, "georgia-country");

  assert.deepEqual(ambiguous, original);
  assert.equal(selected.mentions[0].mentionId, mentionId);
  assert.equal(selected.mentions[0].canonicalPlaceId, "georgia-country");
  assert.equal(selected.mentions[0].status, "resolved");
  assert.equal(selected.mentions[0].provenance[0]?.kind, "builder");
  assert.equal(selected.mentions[0].confidence.state, "structured");
  assert.equal(selected.issues.some((issue) => issue.code === "ambiguous_place"), false);
  assert.equal(selected.issues.some((issue) => issue.code === "region_requires_base"), true);
});

test("Antigua uses itinerary context without collapsing Antigua and Barbuda", () => {
  const centralAmerica = resolvePlaceMentions("Tikal, Lake Atitlán and Antigua");
  assert.equal(centralAmerica.mentions.find((mention) => mention.sourceText === "Antigua")?.canonicalPlaceId, "antigua-guatemala");
  assert.equal(centralAmerica.mentions.find((mention) => mention.sourceText === "Antigua")?.status, "resolved");

  const islandCountry = resolvePlaceMentions("Visit Antigua and Barbuda");
  assert.deepEqual(islandCountry.mentions.map((mention) => mention.canonicalPlaceId), ["antigua-and-barbuda"]);

  const isolated = resolvePlaceMentions("Antigua");
  assert.equal(isolated.mentions[0]?.status, "ambiguous");
  assert.deepEqual(isolated.mentions[0]?.candidates.map((candidate) => candidate.canonicalPlaceId), ["antigua-guatemala", "antigua-island"]);
});

test("explicit semantic mentions preserve lower-case small towns and provider failures", async () => {
  const inputs = [
    { sourceText: "London", role: "origin" as const },
    { sourceText: "albarracín", role: "preferred" as const },
  ];
  const deterministic = resolveExplicitPlaceMentions(inputs);
  assert.deepEqual(deterministic.mentions.map((mention) => mention.sourceText), ["London", "albarracín"]);
  assert.equal(deterministic.mentions[1]?.status, "unresolved");

  const enriched = await resolveExplicitPlaceMentionsWithProvider(inputs, {
    id: "global-fixture",
    label: "Global fixture",
    lookup: async (phrase) => phrase === "albarracín" ? [{
      providerId: "town-1",
      canonicalName: "Albarracín",
      placeType: "town",
      parentCountries: ["Spain"],
      coordinates: [-1.444, 40.407],
      routability: "direct_destination",
    }] : [],
  });
  assert.equal(enriched.mentions[1]?.canonicalPlaceId, "global-fixture:town-1");
  assert.equal(enriched.mentions[1]?.status, "resolved");

  const unavailable = await resolveExplicitPlaceMentionsWithProvider(inputs, {
    id: "offline-fixture",
    label: "Offline fixture",
    lookup: async () => { throw new Error("offline"); },
  });
  assert.equal(unavailable.mentions[1]?.sourceText, "albarracín");
  assert.equal(unavailable.mentions[1]?.status, "unresolved");
});

test("reviewed anchor bases are contextual and keep the original anchor", () => {
  assert.deepEqual(regionalBaseSuggestions("lake-atitlan").map((suggestion) => suggestion.name), ["Panajachel", "San Pedro La Laguna"]);
  assert.deepEqual(regionalBaseSuggestions("tikal").map((suggestion) => suggestion.name), ["Flores", "El Remate"]);
  assert.deepEqual(regionalBaseSuggestions("belize").map((suggestion) => suggestion.name), ["San Ignacio", "Caye Caulker", "Belize City"]);
  assert.deepEqual(regionalBaseSuggestions("angkor-wat").map((suggestion) => suggestion.name), ["Siem Reap"]);
  const result = resolvePlaceMentions("Lake Atitlán, Tikal and Belize");
  assert.deepEqual(result.mentions.map((mention) => mention.canonicalPlaceId), ["lake-atitlan", "tikal", "belize"]);
  assert.deepEqual(result.issues.filter((issue) => issue.code === "region_requires_base").map((issue) => issue.sourceText), ["Lake Atitlán", "Tikal", "Belize"]);
});
