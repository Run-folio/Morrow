import assert from "node:assert/strict";
import test from "node:test";
import {
  regionalBaseSuggestions,
  resolvePlaceMentions,
  resolvePlaceMentionsWithProvider,
  selectPlaceCandidate,
  type PlaceIntelligenceProvider,
} from "../lib/easyt/place-intelligence.ts";

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
