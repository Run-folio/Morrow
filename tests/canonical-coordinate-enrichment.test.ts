import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveExplicitPlaceMentions,
  resolveExplicitPlaceMentionsWithProvider,
  resolvePlaceMentions,
  resolvePlaceMentionsWithProvider,
  type ExplicitPlaceMention,
  type PlaceIntelligenceProvider,
  type PlaceProviderCandidate,
} from "../lib/easyt/place-intelligence.ts";

const inputs: ExplicitPlaceMention[] = [
  { sourceText: "Cancún", role: "preferred", travelIntent: "route-stop" },
  { sourceText: "Mexico City", role: "preferred", travelIntent: "route-stop" },
  { sourceText: "Ollantaytambo", role: "preferred", travelIntent: "route-stop" },
  { sourceText: "Bali", role: "preferred", travelIntent: "route-stop" },
  { sourceText: "Lake Annecy", role: "anchor", travelIntent: "anchor" },
];

const candidates: Record<string, PlaceProviderCandidate[]> = {
  "Cancún": [{ providerId: "cancun", canonicalName: "Cancun", placeType: "city", parentCountries: ["Mexico"], coordinates: [-86.8515, 21.1619], routability: "direct_destination", matchQuality: "exact", rankScore: 150 }],
  "Mexico City": [{ providerId: "mexico-city", canonicalName: "Mexico City", placeType: "city", parentCountries: ["Mexico"], coordinates: [-99.1332, 19.4326], routability: "direct_destination", matchQuality: "exact", rankScore: 150 }],
  Ollantaytambo: [{ providerId: "ollantaytambo", canonicalName: "Ollantaytambo", placeType: "town", parentCountries: ["Peru"], coordinates: [-72.263, -13.258], routability: "direct_destination", matchQuality: "exact", rankScore: 150 }],
  Bali: [{ providerId: "bali", canonicalName: "Bali", placeType: "island", parentCountries: ["Indonesia"], coordinates: [115.1889, -8.4095], routability: "direct_destination", matchQuality: "exact", rankScore: 150 }],
  "Lake Annecy": [{ providerId: "lake-annecy", canonicalName: "Lake Annecy", placeType: "natural_area", parentCountries: ["France"], coordinates: [6.155, 45.86], routability: "anchor_or_poi", matchQuality: "exact", rankScore: 150 }],
};

function fixtureProvider(lookup: (phrase: string) => PlaceProviderCandidate[]): PlaceIntelligenceProvider {
  return { id: "coordinate-fixture", label: "Coordinate fixture", lookup: async (phrase) => lookup(phrase) };
}

test("trusted city, rural town, island and natural-area identities gain only validated coordinates and provenance", async () => {
  const deterministic = resolveExplicitPlaceMentions(inputs);
  assert.equal(deterministic.mentions.every((mention) => mention.status === "resolved" && !mention.coordinates), true);

  const enriched = await resolveExplicitPlaceMentionsWithProvider(inputs, fixtureProvider((phrase) => candidates[phrase] ?? []));
  assert.deepEqual(enriched.mentions.map((mention) => mention.canonicalPlaceId), deterministic.mentions.map((mention) => mention.canonicalPlaceId));
  assert.deepEqual(enriched.mentions.map((mention) => mention.canonicalName), deterministic.mentions.map((mention) => mention.canonicalName));
  assert.deepEqual(enriched.mentions.map((mention) => mention.placeType), deterministic.mentions.map((mention) => mention.placeType));
  assert.deepEqual(enriched.mentions.map((mention) => mention.routability), deterministic.mentions.map((mention) => mention.routability));
  assert.deepEqual(enriched.mentions.map((mention) => mention.coordinates), [
    [-86.8515, 21.1619], [-99.1332, 19.4326], [-72.263, -13.258], [115.1889, -8.4095], [6.155, 45.86],
  ]);
  assert.equal(enriched.mentions.every((mention, index) => mention.confidence.state === deterministic.mentions[index]?.confidence.state), true);
  assert.equal(enriched.mentions.every((mention) => mention.provenance.some((source) => source.kind === "provider" && source.supports.includes("canonical name, type and containment remain unchanged"))), true);
});

test("coordinate-rich canonical records remain stable and do not trigger provider work", async () => {
  const deterministic = resolvePlaceMentions("Lake Atitlán");
  let calls = 0;
  const enriched = await resolvePlaceMentionsWithProvider("Lake Atitlán", fixtureProvider(() => {
    calls += 1;
    return [{ providerId: "wrong", canonicalName: "Lake Atitlán", placeType: "natural_area", parentCountries: ["Guatemala"], coordinates: [0, 0] }];
  }));
  assert.equal(calls, 0);
  assert.deepEqual(enriched, deterministic);
});

test("ambiguous duplicate names and conflicting provider coordinates fail closed", async () => {
  let ambiguousCalls = 0;
  const ambiguous = await resolvePlaceMentionsWithProvider("Antigua", fixtureProvider(() => {
    ambiguousCalls += 1;
    return candidates["Cancún"] ?? [];
  }));
  assert.equal(ambiguousCalls, 0);
  assert.equal(ambiguous.mentions[0]?.status, "ambiguous");
  assert.equal(ambiguous.mentions[0]?.coordinates, undefined);

  const conflicting = await resolveExplicitPlaceMentionsWithProvider([inputs[0]!], fixtureProvider(() => [
    candidates["Cancún"]![0]!,
    { ...candidates["Cancún"]![0]!, providerId: "cancun-namesake", coordinates: [-100.3, 25.7], rankScore: 149 },
  ]));
  assert.equal(conflicting.mentions[0]?.canonicalName, "Cancún");
  assert.equal(conflicting.mentions[0]?.coordinates, undefined);
  assert.equal(conflicting.mentions[0]?.provenance.some((source) => source.kind === "provider"), false);
});

test("invalid, contradictory, metadata-only and failed provider results leave coordinates unknown", async () => {
  const deterministic = resolveExplicitPlaceMentions([inputs[1]!]);
  const variants: PlaceIntelligenceProvider[] = [
    fixtureProvider(() => [{ ...candidates["Mexico City"]![0]!, coordinates: [181, 91] }]),
    fixtureProvider(() => [{ ...candidates["Mexico City"]![0]!, parentCountries: ["United States"] }]),
    fixtureProvider(() => [{ ...candidates["Mexico City"]![0]!, coordinates: undefined, normalizationReason: "metadata only" }]),
    { id: "offline", label: "Offline fixture", lookup: async () => { throw new Error("offline"); } },
  ];
  for (const provider of variants) {
    const result = await resolveExplicitPlaceMentionsWithProvider([inputs[1]!], provider);
    assert.deepEqual(result, deterministic);
  }
});
