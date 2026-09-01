import assert from "node:assert/strict";
import test from "node:test";
import {
  discoveryStyleDefinitions,
  discoveryWonderMappings,
  featuredDiscoveryRoutes,
  publishedDiscoveryStyles,
  publishedDiscoveryWonders,
} from "../lib/easyt/route-discovery.ts";
import { publicRouteDetailFor, publicRoutePublishedFamilies } from "../lib/easyt/public-route.ts";

const publishedRoutes = publicRoutePublishedFamilies();
const publishedKeys = new Set(publishedRoutes.map((route) => route.key));

test("featured discovery journeys are drawn only from published routes", () => {
  const featured = featuredDiscoveryRoutes(publishedRoutes);
  assert.equal(featured.length, 4);
  assert.equal(new Set(featured.map((route) => route.key)).size, featured.length);
  featured.forEach((route) => assert.equal(publishedKeys.has(route.key), true));
});

test("every surfaced wonder resolves to a real published route that includes that attraction", () => {
  const wonders = publishedDiscoveryWonders(publishedRoutes);
  assert.equal(wonders.length, discoveryWonderMappings.length);
  for (const wonder of wonders) {
    assert.equal(publishedKeys.has(wonder.primaryRouteKey), true, wonder.title);
    assert.equal(wonder.route.key, wonder.primaryRouteKey);
    assert.ok(wonder.placeId, `${wonder.title} needs a stable editorial place identity`);
    assert.ok(publicRouteDetailFor(wonder.primaryRouteKey)?.attractions.some((attraction) => attraction.name === wonder.title), `${wonder.title} must exist in its published route detail`);
    wonder.relatedRouteKeys.forEach((key) => assert.equal(publishedKeys.has(key), true));
  }
});

test("unsupported wonder mappings are omitted rather than linked to an unpublished route", () => {
  const withoutAndes = publishedRoutes.filter((route) => route.key !== "andean-highlands");
  assert.equal(publishedDiscoveryWonders(withoutAndes).some((wonder) => wonder.key === "machu-picchu"), false);
});

test("travel styles are backed by the published route interest taxonomy", () => {
  const styles = publishedDiscoveryStyles(publishedRoutes);
  assert.ok(styles.length > 0);
  for (const style of styles) {
    assert.ok(style.matchingRoutes.length > 0);
    style.matchingRoutes.forEach((route) => {
      assert.equal(publishedKeys.has(route.key), true);
      assert.equal(route.interests.includes(style.interest), true);
    });
  }
});

test("travel styles without a supporting route are not surfaced", () => {
  const japanOnly = publishedRoutes.filter((route) => route.key === "japan-slow");
  const styles = publishedDiscoveryStyles(japanOnly);
  const supported = new Set(japanOnly.flatMap((route) => route.interests));
  assert.deepEqual(styles.map((style) => style.interest), discoveryStyleDefinitions.filter((style) => supported.has(style.interest)).map((style) => style.interest));
});
