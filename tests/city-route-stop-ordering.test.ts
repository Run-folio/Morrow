import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPlaceSuggestionsForQuery, type CanonicalPlaceSuggestion } from "../lib/easyt/place-intelligence.ts";
import { mergeEquivalentPlaceSuggestions, placeAutocompleteKeyAction, prioritizeRouteStopSuggestions } from "../lib/easyt/place-autocomplete.ts";
import { projectHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { journeyEndpointPlaceFromSuggestion } from "../lib/easyt/journey-endpoints.ts";
import { referenceGeographicAcceptanceMatches } from "../lib/easyt/place-reference.ts";
import { emptyHomepageInput } from "./fixtures/homepage-dual-entry.ts";

const choices = (query: string) => canonicalPlaceSuggestionsForQuery(query, [], 30, true);
const ranked = (query: string, candidates = choices(query)) => prioritizeRouteStopSuggestions(mergeEquivalentPlaceSuggestions(candidates), "route-stop", query);

test("ordinary Hong Kong stays a city before reference evidence arrives", () => {
  const candidates = choices("Hong Kong").filter(item => !item.canonicalPlaceId.startsWith("reference:"));
  assert.deepEqual(ranked("Hong Kong", candidates).map(item => item.canonicalPlaceId), ["hong-kong", "jurisdiction-hk"]);
  assert.equal(ranked("Hong Kong", candidates)[0]?.coordinates, undefined, "ordering does not invent geographic proof");
});

for (const [query, referenceId] of [
  ["Hong Kong", "reference:geonames:1819729"], ["Beijing", "reference:geonames:1816670"],
  ["Seoul", "reference:geonames:1835848"], ["Tokyo", "reference:geonames:1850147"],
  ["Paris", "reference:geonames:2988507"], ["Berlin", "reference:geonames:2950159"],
  ["Singapore", "reference:geonames:1880252"], ["Monaco", "reference:geonames:2993458"],
] as const) {
  test(`${query} prefers its unique exact accepted reference city while retaining every identity`, () => {
    const candidates = choices(query), before = structuredClone(candidates);
    const result = ranked(query, candidates);
    assert.equal(result[0]?.canonicalPlaceId, referenceId);
    assert.equal(result[0]?.placeType, "city");
    assert.equal(result[0]?.routability, "direct_destination");
    assert.deepEqual(result.map(item => item.canonicalPlaceId).sort(), candidates.map(item => item.canonicalPlaceId).sort());
    assert.deepEqual(candidates, before, "ranking cannot rewrite source geography");
    assert.ok(journeyEndpointPlaceFromSuggestion(result[0]!)?.geographicBinding, "selected proof survives the existing projection");
    const projection = projectHomepageInput({
      snapshot: { ...emptyHomepageInput(), tripType: { state: "selected", value: "one_way" }, entries: [{ id: "city", text: query, selection: result[0]! }] },
      profile: null, handoffId: "city-selection-route-test",
    });
    assert.ok(projection.ok);
    assert.equal(projection.draft.routeIntent?.destinations[0]?.kind, "overnight_place");
    assert.equal(projection.draft.routeIntent?.destinations[0]?.stopIds.length, 1);
    assert.ok(projection.draft.destinations?.[0]?.geographicBinding);
    assert.equal(projection.draft.structuredBrief?.placeMentions?.[0]?.requiresBaseSelection, false);
  });
}

test("Hong Kong reference and legacy country identities stay separate through explicit selection", () => {
  const result = ranked("Hong Kong");
  const reference = result.find(item => item.canonicalPlaceId === "reference:geonames:1819729")!;
  const legacy = result.find(item => item.canonicalPlaceId === "hong-kong")!;
  const area = result.find(item => item.canonicalPlaceId === "jurisdiction-hk")!;
  assert.equal(legacy.country, "China");
  assert.equal(reference.country, "Hong Kong");
  const project = (selection: CanonicalPlaceSuggestion) => projectHomepageInput({
    snapshot: { ...emptyHomepageInput(), tripType: { state: "selected", value: "one_way" }, entries: [{ id: "selected", text: "Hong Kong", selection }] },
    profile: null, handoffId: "city-ordering-test",
  });
  const cityProjection = project(reference), areaProjection = project(area);
  assert.ok(cityProjection.ok); assert.ok(areaProjection.ok);
  assert.equal(cityProjection.draft.routeIntent?.destinations[0]?.kind, "overnight_place");
  assert.equal(cityProjection.draft.routeIntent?.destinations[0]?.stopIds.length, 1);
  assert.equal(cityProjection.draft.destinations?.[0]?.geographicBinding?.canonicalPlaceId, reference.canonicalPlaceId);
  assert.equal(areaProjection.draft.routeIntent?.destinations[0]?.kind, "planning_area");
  assert.equal(areaProjection.draft.routeIntent?.destinations[0]?.resolution, "needs_base");
  assert.deepEqual(areaProjection.draft.routeIntent?.destinations[0]?.stopIds, []);
});

for (const [query, areaId] of [["Japan", "japan"], ["Hokkaido", "hokkaido"], ["Northern Patagonia", "northern-patagonia"]] as const) {
  test(`an exact direct city beats ${query}'s administrative intent without suppressing it`, () => {
    const area = choices(query).find(item => item.canonicalPlaceId === areaId)!;
    assert.ok(area);
    const city: CanonicalPlaceSuggestion = { ...area, canonicalPlaceId: "provider:distinct-city", placeType: "city", routability: "direct_destination" };
    assert.deepEqual(ranked(query, [area, city]).map(item => item.canonicalPlaceId), ["provider:distinct-city", areaId]);
    assert.deepEqual(prioritizeRouteStopSuggestions([area, city], "planning-area", query), [area, city]);
  });
  test(`an exact direct town beats ${query}'s administrative intent without suppressing it`, () => {
    const area = choices(query).find(item => item.canonicalPlaceId === areaId)!;
    assert.ok(area);
    // Test-only namesake: this exercises ordering, not a geographic equivalence.
    const town: CanonicalPlaceSuggestion = { ...area, canonicalPlaceId: "test:distinct-town", placeType: "town", routability: "direct_destination" };
    assert.deepEqual(ranked(query, [area, town]).map(item => item.canonicalPlaceId), ["test:distinct-town", areaId]);
    assert.deepEqual(prioritizeRouteStopSuggestions([area, town], "planning-area", query), [area, town]);
  });
}

test("a qualified administrative query keeps its explicit area choice ahead of the locality", () => {
  const candidates = choices("Granada");
  const area = candidates.find(item => item.canonicalPlaceId === "granada-province")!;
  const city = candidates.find(item => item.canonicalPlaceId === "granada-spain") ?? { ...area, canonicalPlaceId: "provider:granada-city", name: "Granada", placeType: "city" as const, routability: "direct_destination" as const };
  assert.ok(area);
  assert.equal(ranked("Granada", [area, city])[0], city);
  assert.equal(ranked("Granada Province", [area, city])[0], area);
});

for (const query of ["Bali", "Greek Islands", "Tikal", "France"]) {
  test(`${query} retains its existing broad or attraction planning path`, () => {
    const area = choices(query).find(item => item.name === query)!;
    assert.ok(area);
    const namesake: CanonicalPlaceSuggestion = { ...area, canonicalPlaceId: "provider:unrelated-settlement", name: query === "France" ? "Franceville" : query, placeType: "city", routability: "direct_destination" };
    assert.equal(ranked(query, [namesake, area])[0], area);
  });
}

test("invalid snapshot, point, country, type, identity or provider provenance cannot earn reference priority", () => {
  const candidates = choices("Hong Kong");
  const legacy = candidates.find(item => item.canonicalPlaceId === "hong-kong")!;
  const area = candidates.find(item => item.canonicalPlaceId === "jurisdiction-hk")!;
  const reference = candidates.find(item => item.canonicalPlaceId === "reference:geonames:1819729")!;
  const corruptions: CanonicalPlaceSuggestion[] = [
    { ...reference, referenceSnapshotId: "future-snapshot" }, { ...reference, referenceSnapshotId: undefined },
    { ...reference, coordinates: [0, 0] }, { ...reference, country: "China" },
    { ...reference, placeType: "region" }, { ...reference, canonicalPlaceId: "reference:geonames:1" },
    { ...reference, provenance: reference.provenance.map(source => ({ ...source, kind: "canonical" })) },
    { ...reference, provenance: [] },
  ];
  for (const invalid of corruptions) {
    assert.equal(referenceGeographicAcceptanceMatches({ ...invalid, providerId: invalid.provenance.find(source => source.kind === "provider")?.id }), false);
    assert.equal(ranked("Hong Kong", [legacy, invalid])[0], legacy);
    assert.equal(ranked("Hong Kong", [area, invalid])[0], area, "rejected reference evidence cannot displace a valid explicit area");
  }
});

test("multiple distinct accepted same-name cities stay explicit choices in their original city order", () => {
  const reference = choices("Oranjestad").find(item => item.canonicalPlaceId === "reference:geonames:3577154")!;
  const other = choices("Oranjestad").find(item => item.canonicalPlaceId === "reference:geonames:3513426")!;
  assert.ok(reference); assert.ok(other);
  const legacy: CanonicalPlaceSuggestion = { ...reference, canonicalPlaceId: "test:unverified-oranjestad", coordinates: undefined, provenance: [] };
  assert.equal(referenceGeographicAcceptanceMatches({ ...other, providerId: other.provenance[0]!.id }), true);
  const candidates = [legacy, other, reference];
  assert.deepEqual(ranked("Oranjestad", candidates), candidates);
  assert.deepEqual(prioritizeRouteStopSuggestions(candidates, "planning-area", "Oranjestad"), candidates);
});

test("self-consistent reference keys cannot earn priority for unknown identities or invented maintained points", () => {
  const source = choices("Hong Kong");
  const reference = source.find(item => item.canonicalPlaceId === "reference:geonames:1819729")!;
  const legacy = source.find(item => item.canonicalPlaceId === "hong-kong")!;
  const area = source.find(item => item.canonicalPlaceId === "jurisdiction-hk")!;
  for (const [canonicalPlaceId, coordinates] of [
    ["reference:geonames:999999999999", [0, 0]], [reference.canonicalPlaceId, [114.2, 22.3]],
  ] as const) {
    const forged: CanonicalPlaceSuggestion = { ...reference, canonicalPlaceId, coordinates: [...coordinates],
      provenance: reference.provenance.map(item => ({ ...item, id: `${canonicalPlaceId}@${reference.referenceSnapshotId}:HK:city:${coordinates.join(":")}` })) };
    assert.equal(referenceGeographicAcceptanceMatches({ ...forged, providerId: forged.provenance[0]!.id }), true, "the response-shape gate alone cannot prove this record exists");
    assert.equal(ranked("Hong Kong", [legacy, forged, area])[0], legacy);
    assert.equal(ranked("Hong Kong", [area, forged])[0], area);
  }
});

test("reference rows outside the maintained client catalog remain selectable in provider relevance order", () => {
  const reference = choices("Hong Kong").find(item => item.canonicalPlaceId === "reference:geonames:1819729")!;
  const unknown: CanonicalPlaceSuggestion = { ...reference, canonicalPlaceId: "reference:geonames:999999999999",
    provenance: reference.provenance.map(item => ({ ...item, id: `reference:geonames:999999999999@${reference.referenceSnapshotId}:HK:city:114.17469:22.27832` })) };
  const preceding: CanonicalPlaceSuggestion = { ...reference, canonicalPlaceId: "test:provider-first", name: "Hong Kong Harbour", provenance: [] };
  assert.deepEqual(ranked("Hong Kong", [preceding, unknown]), [preceding, unknown]);
});

test("exact IATA and ICAO evidence keeps priority above a city sharing the query", () => {
  for (const [query, field] of [["HKG", "matchedAirportCode"], ["VHHH", "matchedIcaoCode"]] as const) {
    const city = { name: query, placeType: "city", routability: "direct_destination" };
    const airport = { name: "Hong Kong International Airport", placeType: "transport_gateway", routability: "direct_destination", [field]: query };
    assert.equal(prioritizeRouteStopSuggestions([city, airport], "route-stop", query)[0], airport);
  }
});

test("keyboard default selects the city and arrows can still reach the explicit jurisdiction", () => {
  const result = ranked("Hong Kong");
  const enter = placeAutocompleteKeyAction("Enter", -1, result.length);
  assert.equal(result[enter.activeIndex]?.canonicalPlaceId, "reference:geonames:1819729");
  const last = placeAutocompleteKeyAction("ArrowUp", -1, result.length);
  assert.equal(result[last.activeIndex]?.canonicalPlaceId, "jurisdiction-hk");
  assert.equal(placeAutocompleteKeyAction("Enter", last.activeIndex, result.length).activeIndex, last.activeIndex);
});
