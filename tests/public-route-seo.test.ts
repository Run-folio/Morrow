import assert from "node:assert/strict";
import test from "node:test";
import { routeFamilies } from "../lib/easyt/route-catalog.ts";
import { publicRouteDetailFor, publicRouteSitemapKeys } from "../lib/easyt/public-route.ts";
import { publicRouteMetadataFor } from "../lib/easyt/public-route-seo.ts";

function robotsIndex(metadata: ReturnType<typeof publicRouteMetadataFor>) {
  return typeof metadata.robots === "object" && metadata.robots !== null ? metadata.robots.index : undefined;
}

test("route metadata is specific, canonical and branded only by the layout", () => {
  const metadata = publicRouteMetadataFor("andean-highlands");
  assert.equal(metadata.title, "Andean highlands, gently");
  assert.equal(metadata.description, publicRouteDetailFor("andean-highlands")?.summary);
  assert.deepEqual(metadata.alternates, { canonical: "/journey/routes/andean-highlands" });
  assert.equal((metadata.openGraph as { url?: string }).url, "/journey/routes/andean-highlands");
  assert.equal(robotsIndex(metadata), true);
});

test("legacy, unknown and review-needed metadata have safe canonical/index behavior", () => {
  assert.deepEqual(publicRouteMetadataFor("portugal-coast").alternates, { canonical: "/journey/routes/portugal-atlantic" });
  assert.equal(robotsIndex(publicRouteMetadataFor("not-real")), false);
  assert.equal(robotsIndex(publicRouteMetadataFor("vietnam-cambodia")), false);
});

test("metadata indexability cannot drift from sitemap eligibility", () => {
  const sitemapKeys = new Set(publicRouteSitemapKeys());
  for (const route of routeFamilies) {
    assert.equal(robotsIndex(publicRouteMetadataFor(route.key)), sitemapKeys.has(route.key), route.key);
  }
});
