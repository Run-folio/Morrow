import assert from "node:assert/strict";
import test from "node:test";
import { australiaDiscoveryPlaces, AUSTRALIA_DISCOVERY_EVIDENCE } from "../lib/easyt/australia-discovery-content.ts";
import { discoveryPlaceForId, discoveryPlacesForMention, discoveryPlaceWithinMention } from "../lib/easyt/discovery-content.ts";
import { findCatalogPlaceById } from "../lib/easyt/place-catalog.ts";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
import { routeEditorialPhoto } from "../lib/easyt/route-images.ts";
import { adaptedDiscoveryPlaces } from "../lib/easyt/discovery-evidence-adapter.ts";

const resolvedMention = (name: string) => {
  const mention = resolvePlaceMentions(name).mentions[0];
  assert.ok(mention, `${name} should resolve`);
  return mention;
};

test("Australia has at least 20 distinct, geographically canonical and visitor-reviewed places", () => {
  const places = australiaDiscoveryPlaces();
  assert.ok(places.length >= 20);
  assert.equal(new Set(places.map(p => p.id)).size, places.length);
  for (const p of places) {
    const catalog = findCatalogPlaceById(p.id);
    assert.equal(catalog?.parentCountries.includes("Australia"), true, p.id);
    assert.ok(p.coordinates.every(Number.isFinite) && p.relevance.sources.length > 0, p.id);
    assert.ok(p.relevance.sources.every(source => source.url?.startsWith("https://") && source.reviewedAt && source.supports.trim()), p.id);
    assert.ok(p.relevance.en.trim() && p.relevance.es.trim(), p.id);
    assert.ok(p.imageKey === null || routeEditorialPhoto(p.imageKey), p.id);
    if (p.actionability === "overnight-base") {
      assert.ok(["city", "town", "transport_gateway"].includes(p.placeType), p.id);
      assert.ok(p.stayEvidence.length > 0, p.id);
    }
  }
  assert.equal(discoveryPlaceForId("port-douglas")?.actionability, "overnight-base");
  assert.equal(discoveryPlaceForId("kakadu")?.actionability, "visit");
  assert.equal(discoveryPlaceForId("uluru-kata-tjuta")?.actionability === "overnight-base", false);
});

test("the shared gate returns smaller and sparse countries without Australia's count threshold", () => {
  const tajikistan = discoveryPlacesForMention({ canonicalPlaceId: "tajikistan", canonicalName: "Tajikistan", placeType: "country", parentCountries: ["Tajikistan"] });
  const jordan = discoveryPlacesForMention({ canonicalPlaceId: "jordan", canonicalName: "Jordan", placeType: "country", parentCountries: ["Jordan"] });
  assert.ok(tajikistan.length > jordan.length && tajikistan.length < 20);
  assert.ok(jordan.length > 0 && jordan.length < 20);
  for (const place of [...tajikistan, ...jordan]) {
    assert.ok(findCatalogPlaceById(place.id)?.coordinates);
    assert.ok(place.relevance.sources.length > 0);
  }
});

test("existing reviewed country evidence reaches Adaptive Discovery without country-specific rows", () => {
  const expected = new Map([
    ["Namibia", ["windhoek", "swakopmund", "sossusvlei"]],
    ["Japan", ["tokyo", "kyoto"]],
    ["Italy", ["rome", "florence"]],
    ["Madagascar", ["antananarivo", "morondava"]],
    ["Thailand", ["bangkok", "chiang-mai"]],
  ]);
  for (const [country, placeIds] of expected) {
    const places = discoveryPlacesForMention(resolvedMention(country));
    assert.ok(places.length > 0, `${country} should expose reviewed existing evidence`);
    assert.ok(placeIds.some(id => places.some(place => place.id === id)), `${country} should include an expected canonical place`);
    assert.ok(places.every(place => place.country === country), `${country} must not leak cross-country candidates`);
    assert.ok(places.every(place => !place.id.startsWith("route-base:")), `${country} must only expose canonical identities`);
  }
});

test("continents aggregate the same eligible pool without selecting a default country", () => {
  const expectations = new Map([
    ["Africa", { minimum: 2, countries: ["Namibia", "Madagascar", "Tanzania"] }],
    ["Europe", { minimum: 2, countries: ["Italy"] }],
    ["Americas", { minimum: 2, countries: ["United States", "Canada", "Mexico", "Guatemala"] }],
  ]);
  for (const [name, expected] of expectations) {
    const places = discoveryPlacesForMention(resolvedMention(name));
    assert.ok(places.length >= expected.minimum, `${name} should aggregate existing reviewed evidence`);
    assert.ok(places.some(place => expected.countries.includes(place.country)), `${name} should contain a supported country`);
  }
});

test("derived actionability separates browse, visit and overnight evidence", () => {
  const namibia = discoveryPlacesForMention(resolvedMention("Namibia"));
  const sossusvlei = namibia.find(place => place.id === "sossusvlei");
  const windhoek = namibia.find(place => place.id === "windhoek");
  assert.ok(sossusvlei);
  assert.equal(sossusvlei.actionability, "browse-only");
  assert.equal(sossusvlei.stayEvidence.length, 0);
  assert.ok(windhoek);
  assert.equal(windhoek.actionability, "overnight-base");
  assert.ok(windhoek.stayEvidence.length > 0);

  const petra = discoveryPlaceForId("petra");
  assert.equal(petra?.actionability, "visit");
  assert.ok((petra?.accessEvidence.length ?? 0) > 0);
  for (const place of [...namibia, ...(petra ? [petra] : [])]) {
    if (place.actionability === "overnight-base") assert.ok(place.stayEvidence.length > 0, place.id);
    if (place.actionability === "visit") assert.ok(place.accessEvidence.length > 0, place.id);
  }
});

test("route-derived browse-only descriptions do not imply unsupported stay actionability", () => {
  const namibia = discoveryPlacesForMention(resolvedMention("Namibia"));
  const expectedBrowseOnly = ["Sossusvlei", "Damaraland", "Etosha National Park", "Waterberg"];
  for (const name of expectedBrowseOnly) {
    const place = namibia.find(candidate => candidate.name === name);
    assert.ok(place, name);
    assert.equal(place.actionability, "browse-only", `${name} actionability must remain unchanged`);
    assert.equal(place.stayEvidence.length, 0, `${name} must not gain stay evidence`);
    assert.doesNotMatch(place.relevance.en, /\b(base|overnight|multi-night)\b|ready to stay|suitable for \d+ nights?/i, name);
  }
  assert.match(namibia.find(place => place.id === "damaraland")!.relevance.en, /desert-and-mountain region/i);
  assert.match(namibia.find(place => place.id === "etosha")!.relevance.en, /access depending on the chosen gate/i);
  for (const place of adaptedDiscoveryPlaces().filter(candidate => candidate.actionability === "browse-only" && candidate.groupIds.length)) {
    assert.doesNotMatch(place.relevance.en, /\b(base|overnight|multi-night)\b|ready to stay|suitable for \d+ nights?/i, place.id);
  }
});

test("multi-country route evidence is bound to the candidate country before it can authorize a stay", () => {
  const expectedSources = new Map([
    ["panajachel", "Guatemala tourism"],
    ["quito", "Ecuador Travel"],
    ["hoi-an", "Vietnam tourism"],
    ["siem-reap", "Cambodia tourism"],
    ["seville", "Spain Travel"],
  ]);
  for (const [placeId, expectedLabel] of expectedSources) {
    const place = discoveryPlaceForId(placeId);
    assert.ok(place, placeId);
    assert.equal(place.relevance.sources[0]?.label, expectedLabel, `${place.name} relevance must use matching country evidence`);
    if (place.actionability === "overnight-base") {
      assert.equal(place.stayEvidence[0]?.label, expectedLabel, `${place.name} stay evidence must use matching country evidence`);
    }
  }
});

test("generic containment accepts global places and rejects cross-country leakage", () => {
  const japan = resolvedMention("Japan");
  const namibia = resolvedMention("Namibia");
  const tokyo = discoveryPlaceForId("tokyo");
  const windhoek = discoveryPlaceForId("windhoek");
  assert.ok(tokyo && windhoek);
  assert.equal(discoveryPlaceWithinMention(tokyo.id, japan), true);
  assert.equal(discoveryPlaceWithinMention(windhoek.id, japan), false);
  assert.equal(discoveryPlaceWithinMention(tokyo.id, namibia), false);
  assert.equal(discoveryPlaceWithinMention(windhoek.id, namibia), true);
});

test("curated Australia remains authoritative over derived evidence", () => {
  const places = discoveryPlacesForMention(resolvedMention("Australia"));
  assert.equal(places.length, 24);
  assert.deepEqual(places.map(place => place.id), australiaDiscoveryPlaces().map(place => place.id));
  assert.equal(places.find(place => place.id === "port-douglas")?.actionability, "overnight-base");
  assert.equal(places.find(place => place.id === "kakadu")?.actionability, "visit");
});

test("curated Australia retains reviewed route-family stay evidence without promoting unsupported settlements", () => {
  const places = new Map(discoveryPlacesForMention(resolvedMention("Australia")).map(place => [place.id, place]));
  for (const [id, nights] of [["byron-bay", 3], ["cairns", 4]] as const) {
    const place = places.get(id);
    assert.ok(place, id);
    assert.equal(place.actionability, "overnight-base", `${id} is explicitly a reviewed route-family base`);
    assert.ok(place.stayEvidence.some(source => source.id === "route-catalog:australia-east-coast:tourism-australia-east-coast-itinerary"
      && source.supports.includes(`${nights}-night minimum`)), `${id} should carry its explicit route-family stay evidence`);
  }
  for (const id of ["brisbane", "noosa"] as const) {
    const place = places.get(id);
    assert.ok(place, id);
    assert.equal(place.actionability, "browse-only", `${id} lacks explicit reviewed stay evidence`);
    assert.deepEqual(place.stayEvidence, [], `${id} must not infer a stay from settlement type`);
  }
  assert.equal(places.get("sydney")?.actionability, "overnight-base");
  assert.equal(places.get("airlie-beach")?.actionability, "overnight-base");
  assert.equal(places.get("port-douglas")?.actionability, "overnight-base");
  assert.equal(places.get("kakadu")?.actionability, "visit", "an explicit route family must not promote a natural area to overnight-base");
});

test("existing anchor relationships surface canonical bases while uncatalogued Kruger stays unresolved", () => {
  const taj = discoveryPlacesForMention(resolvedMention("Taj Mahal"));
  const atitlan = discoveryPlacesForMention(resolvedMention("Lake Atitlán"));
  const kruger = discoveryPlacesForMention(resolvedMention("Kruger National Park"));
  assert.ok(taj.some(place => place.id === "agra" && place.actionability === "overnight-base"));
  assert.ok(atitlan.some(place => place.id === "panajachel" && place.actionability === "overnight-base"));
  assert.deepEqual(kruger, []);
});

test("an unsupported or synthetic identity never becomes discovery content", () => {
  assert.equal(discoveryPlaceForId("route-base:namibia:windhoek"), null);
  assert.deepEqual(discoveryPlacesForMention({ canonicalPlaceId: "unknown", canonicalName: "Unknown", placeType: "country", parentCountries: [] }), []);
});

test("continent and macro-region discovery use canonical containment even without mention countries", () => {
  const africa = discoveryPlacesForMention({ canonicalPlaceId: "continent-africa", canonicalName: "Africa", placeType: "continent", parentCountries: [] });
  const southeastAsia = discoveryPlacesForMention({ canonicalPlaceId: "southeast-asia", canonicalName: "Southeast Asia", placeType: "macro_region", parentCountries: [] });
  assert.ok(africa.some(place => place.id === "arusha"));
  assert.ok(southeastAsia.some(place => place.id === "el-nido"));
});

test("place-specific official knowledge is browseable without promoting unsupported roles or themes", () => {
  const morondava = discoveryPlaceForId("morondava");
  assert.equal(morondava?.actionability, "browse-only");
  assert.equal(morondava?.stayEvidence.length, 0);
  const dushanbe = discoveryPlaceForId("dushanbe");
  assert.ok(dushanbe);
  assert.doesNotMatch(dushanbe.relevance.en, /food/i);
  assert.equal(dushanbe.relevance.sources[0]?.url, "https://traveltajikistan.tj/en/dushanbe-city-tour/");
  assert.equal(discoveryPlaceForId("khorog"), null);
});

test("a newly added country needs reviewed geographic containment before its place is published", () => {
  const catalog = findCatalogPlaceById("sydney");
  const row = AUSTRALIA_DISCOVERY_EVIDENCE.find(value => value.id === "sydney");
  assert.ok(catalog && row);
  const originalCountries = catalog.parentCountries;
  const originalCoordinates = catalog.coordinates;
  const originalGroup = row.group;
  try {
    catalog.parentCountries = ["Germany"];
    catalog.coordinates = [120, -30];
    row.group = "Germany";
    assert.equal(discoveryPlaceForId("sydney"), null);
  } finally {
    catalog.parentCountries = originalCountries;
    catalog.coordinates = originalCoordinates;
    row.group = originalGroup;
  }
});
