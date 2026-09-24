import assert from "node:assert/strict";
import test from "node:test";
import { discoveryPlacesForMention, type DiscoveryPlace } from "../lib/easyt/discovery-content.ts";
import { createDiscoveryDraft, reduceDiscoveryDraft } from "../lib/easyt/discovery-draft.ts";
import { projectDiscovery } from "../lib/easyt/discovery-projection.ts";
import { resolvePlaceMentions, type ResolvedPlaceMention } from "../lib/easyt/place-intelligence.ts";

const mention = (name: string) => {
  const result = resolvePlaceMentions(name).mentions[0];
  assert.ok(result, `${name} resolves`);
  return result;
};
const context = { interests: [] as string[], existingPlaceIds: [] as string[] };

// Fixtures exercise relationships not yet supported by production evidence.
// Their synthetic source is deliberately confined to this test file.
const fixtureSource = { id: "test:reviewed", label: "Typed test evidence", kind: "official" as const,
  url: "https://example.test/reviewed", reviewedAt: "2026-09-24", supports: "Fixture only." };
const fixturePlace = (id: string, country: string, group: string, options: {
  actionability?: DiscoveryPlace["actionability"]; placeType?: DiscoveryPlace["placeType"];
  tags?: string[]; groupIds?: string[]; coordinates?: readonly [number, number];
} = {}): DiscoveryPlace => ({
  id, name: id, country, group, groupIds: options.groupIds ?? [], tags: options.tags ?? [],
  placeType: options.placeType ?? "city", coordinates: options.coordinates ?? [10, 10],
  relevance: { en: `${id} visitor reason`, es: `${id} motivo de visita`, sources: [fixtureSource] },
  stayEvidence: options.actionability === "overnight-base" ? [fixtureSource] : [],
  accessEvidence: options.actionability === "visit" ? [fixtureSource] : [],
  actionability: options.actionability ?? "browse-only", imageKey: null,
});
const fixtureMention = (name: string, type: ResolvedPlaceMention["placeType"]): ResolvedPlaceMention =>
  ({ ...mention("Australia"), canonicalPlaceId: `fixture:${name}`, canonicalName: name,
    placeType: type, parentCountries: type === "continent" ? [] : [name] });

test("Australia keeps all evidenced places through ranking and initially exposes only a page", () => {
  const input = mention("Australia");
  const source = discoveryPlacesForMention(input);
  const result = projectDiscovery({ mention: input, draft: createDiscoveryDraft(), context });
  assert.ok(source.length >= 20);
  assert.deepEqual(result.counts, { source: source.length, eligible: source.length, ranked: source.length, displayed: 6 });
  assert.equal(result.totalEligible, source.length);
  assert.equal(result.places.length, source.length);
  assert.equal(result.rejected.length, 0);
  assert.equal(new Set(result.places.map(place => place.id)).size, source.length);
  assert.ok(result.directions.length >= 4);
  assert.ok(result.directions.every(direction => direction.placeIds.length >= 3));
  assert.ok(result.recommendedIds.length < result.visiblePlaceIds.length);
  assert.ok(result.places.some(place => place.id !== "sydney" && place.actionability === "overnight-base"));
  assert.ok(result.places.every(place => !place.id.startsWith("route-base:")));
  assert.ok(!JSON.stringify(result).includes("fits the current plan"));
});

test("Australian editorial directions filter presentation without changing the shortlist or proposal", () => {
  const input = mention("Australia");
  const draft = reduceDiscoveryDraft(
    reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "sydney" }),
    { type: "change-direction", directionId: "australia-west" });
  const result = projectDiscovery({ mention: input, draft, context });
  assert.deepEqual(draft.shortlistIds, ["sydney"]);
  assert.ok(result.visiblePlaceIds.every(id => result.directions.find(direction => direction.id === "australia-west")?.placeIds.includes(id)));
  assert.ok(!result.visiblePlaceIds.includes("sydney"));
  assert.ok(result.places.some(place => place.id === "sydney"));
  assert.deepEqual(result.recommendedIds,
    projectDiscovery({ mention: input, draft: createDiscoveryDraft(), context }).recommendedIds);
});

test("duration, anchors, interests and explicit removal alter proposals without shrinking browse", () => {
  const input = mention("Australia");
  const variants = [
    context,
    { ...context, durationDays: 6 }, { ...context, durationDays: 24 },
    { ...context, existingPlaceIds: ["sydney"] },
    { ...context, existingPlaceIds: ["sydney", "melbourne"] },
    { ...context, existingPlaceIds: ["tokyo"] },
    { ...context, interests: ["nature", "coast"] },
  ];
  const results = variants.map(value => projectDiscovery({ mention: input, draft: createDiscoveryDraft(), context: value }));
  assert.ok(results.every(result => result.places.length >= 20 && result.counts.displayed === 6));
  assert.ok(results[2]!.recommendedIds.length >= results[1]!.recommendedIds.length);
  assert.ok(!results[3]!.recommendedIds.includes("sydney"));
  assert.ok(!results[4]!.recommendedIds.includes("sydney") && !results[4]!.recommendedIds.includes("melbourne"));
  assert.deepEqual(results[0]!.recommendedIds, results[5]!.recommendedIds);
  assert.notDeepEqual(results[0]!.visiblePlaceIds, results[6]!.visiblePlaceIds);
  const removed = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "remove-shortlist", placeId: results[0]!.recommendedIds[0]! });
  const afterRemoval = projectDiscovery({ mention: input, draft: removed, context });
  assert.equal(afterRemoval.places.length, results[0]!.places.length);
  assert.ok(!afterRemoval.recommendedIds.includes(removed.removedIds[0]!));
});

test("Tajikistan is smaller and a two-place country has no fabricated directions", () => {
  const tajikistan = projectDiscovery({ mention: mention("Tajikistan"), draft: createDiscoveryDraft(), context });
  assert.ok(tajikistan.places.length > 0 && tajikistan.places.length < 20);
  assert.equal(tajikistan.visiblePlaceIds.length, tajikistan.places.length);
  const fourPlaceFixture = projectDiscovery({ mention: mention("Tajikistan"), draft: createDiscoveryDraft(), context,
    evidence: { places: ["t1", "t2", "t3", "t4"].map(id => fixturePlace(id, "Tajikistan", "Tajikistan")), directions: [] } });
  assert.equal(fourPlaceFixture.places.length, 4);
  assert.equal(fourPlaceFixture.visiblePlaceIds.length, 4);
  const sparse = projectDiscovery({ mention: fixtureMention("Sparse Country", "country"), draft: createDiscoveryDraft(), context,
    evidence: { places: [fixturePlace("sparse-a", "Sparse Country", "Sparse Country"), fixturePlace("sparse-b", "Sparse Country", "Sparse Country")], directions: [] } });
  assert.equal(sparse.places.length, 2);
  assert.deepEqual(sparse.directions, []);
  assert.equal(sparse.visiblePlaceIds.length, 2);
});

test("Africa's supported directions do not choose a country or add stops", () => {
  const places = [
    ...["a1", "a2", "a3"].map(id => fixturePlace(id, "Country A", "Area A", { groupIds: ["africa-a"] })),
    ...["b1", "b2", "b3"].map(id => fixturePlace(id, "Country B", "Area B", { groupIds: ["africa-b"] })),
  ];
  const directions = [
    { id: "africa-a", titleKey: "fixture.africa.a", placeIds: ["a1", "a2", "a3"], imageKey: null },
    { id: "africa-b", titleKey: "fixture.africa.b", placeIds: ["b1", "b2", "b3"], imageKey: null },
  ];
  const result = projectDiscovery({ mention: fixtureMention("Africa", "continent"), draft: createDiscoveryDraft(), context,
    evidence: { places, directions } });
  assert.equal(result.directions.length, 2);
  assert.deepEqual(result.recommendedIds, []);
  assert.equal(result.places.length, 6);
  assert.equal(result.directions[0]?.placeIds.length, 3);
});

test("landmark, park and natural-area identities retain visit/base distinctions", () => {
  const cases = [
    { name: "Taj Mahal", type: "landmark" as const, anchor: "taj-mahal", base: "agra" },
    { name: "Kruger National Park", type: "natural_area" as const, anchor: "kruger", base: "skukuza", extra: "gateway" },
    { name: "Lake Atitlán", type: "natural_area" as const, anchor: "lake-atitlan", base: "panajachel" },
  ];
  for (const item of cases) {
    const places = [
      fixturePlace(item.anchor, "Fixture Country", "Fixture Area", { placeType: item.type, actionability: "visit" }),
      fixturePlace(item.base, "Fixture Country", "Fixture Area", { actionability: "overnight-base" }),
      ...(item.extra ? [fixturePlace(item.extra, "Fixture Country", "Fixture Area", { actionability: "browse-only" })] : []),
    ];
    const result = projectDiscovery({ mention: { ...fixtureMention(item.name, item.type), canonicalPlaceId: item.anchor },
      draft: createDiscoveryDraft(), context, evidence: { places, directions: [] } });
    assert.ok(result.places.some(place => place.id === item.anchor && place.actionability === "visit"));
    assert.ok(result.places.some(place => place.id === item.base && place.actionability === "overnight-base"));
    assert.ok(!result.recommendedIds.includes(item.anchor));
    assert.ok(result.recommendedIds.includes(item.base));
    assert.equal(result.visiblePlaceIds[0], item.anchor);
    assert.ok(result.visiblePlaceIds.includes(item.anchor));
    if (item.extra) assert.ok(result.places.some(place => place.id === item.extra && place.id !== item.anchor && place.id !== item.base));
  }
});

test("a direction cannot claim eligible places without reviewed group membership", () => {
  const places = ["a", "b", "c"].map(id => fixturePlace(id, "Fixture", "Fixture"));
  const result = projectDiscovery({ mention: fixtureMention("Fixture", "country"), draft: createDiscoveryDraft(), context,
    evidence: { places, directions: [{ id: "invented", titleKey: "fixture.invented", placeIds: ["a", "b", "c"], imageKey: null }] } });
  assert.deepEqual(result.directions, []);
});

test("invalid fixture rows have explicit rejection reasons and stable ID ties", () => {
  const valid = [fixturePlace("z", "Fixture", "Fixture"), fixturePlace("a", "Fixture", "Fixture")];
  const invalid = fixturePlace("route-base:fake", "Fixture", "Fixture");
  const result = projectDiscovery({ mention: fixtureMention("Fixture", "country"), draft: createDiscoveryDraft(), context,
    evidence: { places: [valid[0]!, invalid, valid[1]!], directions: [] } });
  assert.deepEqual(result.places.map(place => place.id), ["a", "z"]);
  assert.deepEqual(result.rejected, [{ id: "route-base:fake", reason: "noncanonical-id" }]);
  assert.deepEqual(result.counts, { source: 3, eligible: 2, ranked: 2, displayed: 2 });
});
