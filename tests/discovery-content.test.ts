import assert from "node:assert/strict";
import test from "node:test";
import { australiaDiscoveryPlaces, AUSTRALIA_DISCOVERY_EVIDENCE } from "../lib/easyt/australia-discovery-content.ts";
import { discoveryPlaceForId, discoveryPlacesForMention } from "../lib/easyt/discovery-content.ts";
import { findCatalogPlaceById } from "../lib/easyt/place-catalog.ts";
import { routeEditorialPhoto } from "../lib/easyt/route-images.ts";

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

test("an unsupported catalog identity never becomes discovery content", () => {
  assert.equal(discoveryPlaceForId("london"), null);
  assert.deepEqual(discoveryPlacesForMention({ canonicalPlaceId: "unknown", canonicalName: "Unknown", placeType: "country", parentCountries: [] }), []);
});

test("continent and macro-region discovery use canonical containment even without mention countries", () => {
  const africa = discoveryPlacesForMention({ canonicalPlaceId: "continent-africa", canonicalName: "Africa", placeType: "continent", parentCountries: [] });
  const southeastAsia = discoveryPlacesForMention({ canonicalPlaceId: "southeast-asia", canonicalName: "Southeast Asia", placeType: "macro_region", parentCountries: [] });
  assert.ok(africa.some(place => place.id === "arusha"));
  assert.ok(southeastAsia.some(place => place.id === "el-nido"));
});

test("unverified per-place themes and unreachable event sources are not promoted as visitor reasons", () => {
  assert.equal(discoveryPlaceForId("morondava"), null);
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
