import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBriefWithProvider } from "../lib/easyt/journey-capture.ts";
import {
  resolveExplicitPlaceMentionsWithProvider,
  resolvePlaceMentions,
  type PlaceIntelligenceProvider,
  type PlaceProviderCandidate,
} from "../lib/easyt/place-intelligence.ts";

const candidate = (
  providerId: string,
  canonicalName: string,
  placeType: PlaceProviderCandidate["placeType"],
  country: string,
  coordinates: [number, number],
  routability: PlaceProviderCandidate["routability"] = "direct_destination",
): PlaceProviderCandidate => ({
  providerId,
  canonicalName,
  placeType,
  parentCountries: [country],
  coordinates,
  routability,
  matchQuality: "exact",
  rankScore: 180,
});

test("deterministic capture retains generic collective geography with a likely broad type", () => {
  const cases = new Map([
    ["the fjords", "natural_area"],
    ["the coast", "coast"],
    ["wine country", "region"],
    ["the islands", "archipelago"],
    ["the desert", "natural_area"],
    ["the Riviera", "coast"],
  ] as const);

  for (const [phrase, placeType] of cases) {
    const first = resolvePlaceMentions(phrase);
    const second = resolvePlaceMentions(phrase);
    const mention = first.mentions[0];
    assert.deepEqual(first, second, `${phrase} should be deterministic`);
    assert.equal(mention?.sourceText, phrase);
    assert.equal(mention?.canonicalPlaceId, undefined);
    assert.equal(mention?.placeType, placeType);
    assert.equal(mention?.status, "unresolved");
    assert.equal(mention?.routability, "needs_base_selection");
    assert.equal(mention?.directlyRoutable, false);
    assert.notEqual(mention?.confidence.level, "high");
    assert.equal(first.issues.some((issue) => issue.blocksRoute), true);
  }
});

test("explicit canonical regions remain broad canonical intent with their original scope", () => {
  const cases = [
    ["The French Alps", "french-alps", "mountain_range", ["France"]],
    ["the Scottish Highlands", "scottish-highlands", "region", ["United Kingdom"]],
    ["Patagonia", "patagonia", "region", ["Argentina", "Chile"]],
    ["the Lake District", "lake-district", "natural_area", ["United Kingdom"]],
    ["the Greek Islands", "greek-islands", "archipelago", ["Greece"]],
  ] as const;

  for (const [phrase, canonicalPlaceId, placeType, countries] of cases) {
    const mention = resolvePlaceMentions(phrase).mentions[0];
    assert.equal(mention?.sourceText, phrase);
    assert.equal(mention?.canonicalPlaceId, canonicalPlaceId);
    assert.equal(mention?.placeType, placeType);
    assert.equal(mention?.routability, "needs_base_selection");
    assert.equal(mention?.directlyRoutable, false);
    assert.deepEqual(mention?.parentCountries, [...countries]);
  }

  const highlands = resolvePlaceMentions("the Highlands").mentions[0];
  assert.equal(highlands?.status, "ambiguous");
  assert.equal(highlands?.canonicalPlaceId, undefined);
});

test("provider context ranks real options but cannot promote a generic phrase to a stop", async () => {
  const requests: Array<{ phrase: string; intent: string | undefined; countries: string[] }> = [];
  const provider: PlaceIntelligenceProvider = {
    id: "live-shape-fixture",
    label: "Captured global-provider shape",
    async lookup(phrase, context) {
      requests.push({ phrase, intent: context.travelIntent, countries: [...(context.countryNames ?? [])] });
      if (phrase === "Flåm") return [candidate("flam", "Flåm", "town", "Norway", [7.1147, 60.8628])];
      if (phrase === "the fjords") return [
        candidate("geiranger", "Geiranger", "town", "Norway", [7.2064, 62.1015]),
        candidate("bergen", "Bergen", "city", "Norway", [5.3221, 60.3929]),
      ];
      return [];
    },
  };

  const capture = await captureJourneyBriefWithProvider("Flåm and the fjords", provider, { countryNames: ["Norway"] });
  const flam = capture.mentions.find((mention) => mention.sourceText === "Flåm");
  const fjords = capture.mentions.find((mention) => mention.sourceText === "the fjords");

  assert.equal(flam?.canonicalName, "Flåm");
  assert.equal(flam?.directlyRoutable, true);
  assert.equal(fjords?.canonicalName, "the fjords");
  assert.equal(fjords?.canonicalPlaceId, undefined);
  assert.equal(fjords?.status, "ambiguous");
  assert.equal(fjords?.placeType, "natural_area");
  assert.equal(fjords?.directlyRoutable, false);
  assert.notEqual(fjords?.confidence.level, "high");
  assert.deepEqual(fjords?.parentCountries, ["Norway"]);
  assert.deepEqual(fjords?.candidates.map((option) => option.canonicalName), ["Geiranger", "Bergen"]);
  assert.equal(capture.structuredBrief.destinations.some((stop) => stop.name === "Geiranger" || stop.name === "Bergen"), false);
  assert.equal(capture.structuredBrief.destinations.find((stop) => stop.sourceLabel === "the fjords")?.name, "the fjords");
  assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.sourceText === "the fjords" && issue.blocksRoute), true);
  assert.deepEqual(requests.find((request) => request.phrase === "the fjords"), {
    phrase: "the fjords", intent: "planning-area", countries: ["Norway"],
  });
});

test("a single routable provider result cannot falsely settle broad place intent", async () => {
  const phrases = ["the fjords", "the coast", "the islands", "the Riviera"];
  const provider: PlaceIntelligenceProvider = {
    id: "false-precision-fixture",
    label: "False precision fixture",
    lookup: async (phrase) => [candidate(`only-${phrase}`, phrase.replace(/^the /, ""), "city", "Exampleland", [10, 20])],
  };
  const result = await resolveExplicitPlaceMentionsWithProvider(
    phrases.map((sourceText) => ({ sourceText, role: "preferred" as const, travelIntent: "route-stop" as const })),
    provider,
  );

  assert.equal(result.mentions.every((mention) => mention.canonicalPlaceId === undefined), true);
  assert.equal(result.mentions.every((mention) => mention.status === "ambiguous" && !mention.directlyRoutable), true);
  assert.equal(result.mentions.every((mention) => mention.confidence.level !== "high"), true);
  assert.equal(result.issues.filter((issue) => issue.blocksRoute).length >= phrases.length, true);
});

test("provider failure preserves broad intent and truthful Builder gating", async () => {
  const deterministic = resolvePlaceMentions("the fjords");
  const capture = await captureJourneyBriefWithProvider("the fjords", {
    id: "offline-fixture",
    label: "Offline fixture",
    lookup: async () => { throw new Error("offline"); },
  });

  assert.deepEqual(capture.mentions, deterministic.mentions);
  assert.equal(capture.mentions[0]?.placeType, "natural_area");
  assert.equal(capture.mentions[0]?.canonicalPlaceId, undefined);
  assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.blocksRoute), true);
});
