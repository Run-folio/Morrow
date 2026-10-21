import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { createHomeTripDraft, handoffRouteStops, projectHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { placeMentionSupportsMultipleSelections, resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
import { emptyHomepageInput } from "./fixtures/homepage-dual-entry.ts";
import { geographicallyReady } from "../lib/easyt/geographic-binding.ts";
import { REFERENCE_SNAPSHOT_ID } from "../lib/easyt/place-reference.ts";

for (const [name, id] of [["Singapore", "reference:geonames:1880252"], ["Monaco", "reference:geonames:2993458"]] as const) {
  test(`ordinary ${name} capture reaches the route as its known settlement without area discovery`, () => {
    const prompt = `7 days in ${name}`;
    const capture = captureJourneyBrief(prompt);
    const mention = capture.mentions.find(item => item.sourceText === name)!;
    assert.ok(mention);
    assert.equal(mention.canonicalPlaceId, id);
    assert.equal(mention.placeType, "city");
    assert.equal(mention.directlyRoutable, true);
    assert.equal(placeMentionSupportsMultipleSelections(mention), false);
    assert.equal(capture.structuredBrief.placeIssues?.some(issue => issue.code === "region_requires_base") ?? false, false);
    assert.equal(handoffRouteStops(capture.mentions)[0]?.canonicalPlaceId, id);
    assert.equal(geographicallyReady(handoffRouteStops(capture.mentions)[0]), true, "the selected reference point survives without another lookup");
    const projection = projectHomepageInput({
      snapshot: { ...emptyHomepageInput(), mode: "describe", prompt, tripType: { state: "selected", value: "one_way" } },
      capture, profile: null, handoffId: "ordinary-city-capture-test",
    });
    assert.ok(projection.ok);
    assert.equal(projection.draft.routeIntent?.destinations[0]?.kind, "overnight_place");
    assert.equal(projection.draft.routeIntent?.destinations[0]?.resolution, "resolved");
    assert.equal(projection.draft.routeIntent?.destinations[0]?.stopIds.length, 1);
  });

  test(`${name} retains explicit planning area intent from wording, type and selected context`, () => {
    for (const prompt of [`the country of ${name}`, `${name} country`, `the region of ${name}`, `${name} (country)`, `${name} as a country`]) {
      const mention = resolvePlaceMentions(prompt).mentions.find(item => item.canonicalName === name)!;
      assert.ok(mention);
      assert.equal(mention.placeType, "country", prompt);
      assert.equal(placeMentionSupportsMultipleSelections(mention), true, prompt);
    }
    for (const context of [
      { travelIntent: "planning-area" as const }, { explicitPlaceTypes: ["country" as const] },
      { selectedPlaces: [{ canonicalPlaceId: name.toLowerCase(), canonicalName: name, placeType: "country" as const, parentCountries: [name], routability: "planning_area" as const }] },
    ]) {
      const mention = resolvePlaceMentions(name, context).mentions[0]!;
      assert.equal(mention.placeType, "country");
      assert.equal(placeMentionSupportsMultipleSelections(mention), true);
    }
  });

  test(`${name} keeps an explicit endpoint separate from overnight route stops`, () => {
    const capture = captureJourneyBrief(`Start in Berlin, finish in ${name}`);
    const mention = capture.mentions.find(item => item.canonicalName === name)!;
    assert.equal(mention.canonicalPlaceId, id);
    assert.equal(mention.role, "fixed_end");
    assert.equal(capture.journeyEnd.mode, "explicit");
    if (capture.journeyEnd.mode === "explicit") assert.equal(capture.journeyEnd.place.canonicalPlaceId, id);
    assert.deepEqual(handoffRouteStops(capture.mentions, capture.journeyEnd), []);
  });

  test(`${name} preserves an adjacent explicit country qualifier through punctuation and optional articles`, () => {
    for (const suffix of [" (the country)", ", the country", " — the country", ": the country", " as the country", " (a country)", " - country", ", a country", " [the country]", ", (the country)"]) {
      const mention = resolvePlaceMentions(name + suffix).mentions.find(item => item.canonicalName === name)!;
      assert.equal(mention.canonicalPlaceId, name.toLowerCase(), suffix);
      assert.equal(mention.placeType, "country", suffix);
      assert.equal(placeMentionSupportsMultipleSelections(mention), true, suffix);
    }
    for (const suffix of [", then visit the country of France", " and the country of France", " (after visiting the country of France)", ", the countryside", " as a city"]) {
      const mention = resolvePlaceMentions(name + suffix).mentions.find(item => item.canonicalName === name)!;
      assert.equal(mention.canonicalPlaceId, id, "a later country word cannot change this settlement: " + suffix);
      assert.equal(placeMentionSupportsMultipleSelections(mention), false, suffix);
    }
  });
}

for (const [name, canonicalPlaceId] of [
  ["Hong Kong", "hong-kong"], ["Beijing", "beijing"],
  ["Seoul", "seoul"], ["Tokyo", "tokyo"], ["Paris", "paris"], ["Berlin", "berlin"],
] as const) {
  test(`ordinary ${name} capture keeps its city out of area discovery`, () => {
    const capture = captureJourneyBrief(`7 days in ${name}`);
    const mention = capture.mentions.find(item => item.canonicalName === name)!;
    assert.ok(mention);
    assert.equal(mention.placeType, "city");
    assert.equal(mention.directlyRoutable, true);
    assert.equal(mention.canonicalPlaceId, canonicalPlaceId, "existing settlement identities remain stable");
    assert.equal(placeMentionSupportsMultipleSelections(mention), false);
    assert.equal(handoffRouteStops(capture.mentions)[0]?.name, name);
  });
}

test("physical islands, country-only inputs, qualified regions and ambiguous geography retain their original scope", () => {
  for (const [prompt, id, type] of [
    ["Bali", "bali", "island"], ["France", "france", "country"],
    ["Granada Province", "granada-province", "region"], ["Northern Thailand", undefined, "region"],
  ] as const) {
    const mention = resolvePlaceMentions(prompt).mentions[0]!;
    assert.ok(mention);
    assert.equal(mention.canonicalPlaceId, id);
    assert.equal(mention.placeType, type);
    assert.equal(placeMentionSupportsMultipleSelections(mention), true);
    assert.deepEqual(handoffRouteStops([mention]), []);
  }
  const georgia = resolvePlaceMentions("Georgia").mentions[0]!;
  assert.equal(georgia.status, "ambiguous");
  assert.equal(georgia.canonicalPlaceId, undefined);
});

test("an administrative name cannot silently adopt a same-name city in another country", () => {
  const mention = resolvePlaceMentions("Liberia").mentions[0]!;
  assert.equal(mention.canonicalPlaceId, "liberia");
  assert.equal(mention.placeType, "country");
  assert.equal(placeMentionSupportsMultipleSelections(mention), true);
  const explicit = resolvePlaceMentions("Singapore", { explicitCountryNames: ["France"] }).mentions[0]!;
  assert.equal(explicit.canonicalPlaceId, "singapore");
});

test("fresh city proof cannot overwrite an explicit selected identity, type or country context", () => {
  const selected = { canonicalPlaceId: "hong-kong", canonicalName: "Hong Kong", placeType: "city" as const, parentCountries: ["China"], routability: "direct_destination" as const };
  for (const context of [{ selectedPlaces: [selected] }, { explicitCountryNames: ["China"] }, { explicitPlaceTypes: ["country" as const] }]) {
    assert.equal(resolvePlaceMentions("Hong Kong", context).mentions[0]?.canonicalPlaceId, "hong-kong");
  }
  assert.equal(resolvePlaceMentions("Granada", { countryNames: ["Spain"] }).mentions[0]?.canonicalPlaceId, "granada-spain");
});

test("handoff route seeds preserve only the exact accepted reference tuple already present in capture", () => {
  const mention = captureJourneyBrief("Singapore").mentions[0]!;
  const before = structuredClone(mention);
  const seed = handoffRouteStops([mention])[0]!;
  assert.equal(seed.geographicBinding?.source, "provider");
  assert.equal(seed.geographicBinding?.canonicalPlaceId, "reference:geonames:1880252");
  assert.equal(seed.providerId, mention.provenance.find(source => source.kind === "provider")?.id);
  assert.equal(geographicallyReady(seed), true);
  assert.deepEqual(mention, before);
  for (const invalid of [
    { ...mention, coordinates: [0, 0] as [number, number] },
    { ...mention, parentCountries: ["China"] },
    { ...mention, canonicalPlaceId: "reference:geonames:1" },
    { ...mention, provenance: mention.provenance.map(source => ({ ...source, id: source.id.replace(/@[^:]+:/, "@future-snapshot:") })) },
    { ...mention, provenance: mention.provenance.filter(source => source.kind !== "provider") },
    { ...mention, provenance: mention.provenance.map(source => ({ ...source, kind: "canonical" as const })) },
  ]) {
    const invalidSeed = handoffRouteStops([invalid])[0]!;
    assert.equal(invalidSeed.geographicBinding, undefined);
    assert.equal(invalidSeed.providerId, undefined);
    assert.deepEqual(invalidSeed.coordinates, invalid.coordinates, "rejection cannot rewrite captured geography");
  }
});

for (const [label, canonicalPlaceId, coordinates] of [
  ["nonexistent identity", "reference:geonames:999999999999", [0, 0]],
  ["invented point for a maintained identity", "reference:geonames:1880252", [103.95, 1.4]],
] as const) {
  test(`handoff cannot create reference proof from a self-consistent ${label}`, () => {
    const mention = captureJourneyBrief("Singapore").mentions[0]!;
    const providerId = `${canonicalPlaceId}@${REFERENCE_SNAPSHOT_ID}:SG:city:${coordinates.join(":")}`;
    const forged = { ...mention, canonicalPlaceId, coordinates: [...coordinates] as [number, number],
      provenance: mention.provenance.map(source => source.kind === "provider" ? { ...source, id: providerId } : source) };
    const stop = handoffRouteStops([forged])[0]!;
    assert.equal(stop.geographicBinding, undefined);
    assert.equal(stop.providerId, undefined);
    assert.equal(geographicallyReady(stop), false);
    assert.equal(stop.canonicalPlaceId, canonicalPlaceId, "rejected evidence remains readable without identity adoption");
    assert.deepEqual(stop.coordinates, coordinates);
  });
}

test("repeated Singapore stays keep occurrence IDs, night quantities, order and independent reference bindings", () => {
  const capture = captureJourneyBrief("Singapore 2n -> Berlin 3n -> Singapore 1n.");
  const before = structuredClone(capture);
  const stops = handoffRouteStops(capture.mentions, capture.journeyEnd);
  assert.deepEqual(stops.map(stop => stop.id), ["singapore-0", "berlin-1", "singapore-2"]);
  assert.deepEqual(stops.map(stop => stop.name), ["Singapore", "Berlin", "Singapore"]);
  assert.equal(geographicallyReady(stops[0]), true);
  assert.equal(geographicallyReady(stops[2]), true);
  const draft = createHomeTripDraft({ capture, handoffId: "repeated-reference-capture", datesExplicit: true,
    startDate: "2026-11-01", endDate: "2026-11-07", travellers: 2, travellersExplicit: true, interests: [] });
  assert.deepEqual(draft.routeIntent?.destinations.map(intent => intent.requestedNights), [2, 3, 1]);
  assert.equal(draft.startDate, "2026-11-01");
  assert.equal(draft.endDate, "2026-11-07");
  assert.deepEqual(capture, before);
});
