import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { publicRoutePublishedFamilies } from "../lib/easyt/public-route.ts";
import { routeImagePhoto, routeImages } from "../lib/easyt/route-images.ts";
import { checkRouteVisualReadiness } from "../lib/easyt/route-visual-readiness.ts";
import { immersiveRouteKeys } from "../lib/easyt/immersive-homepage-routes.ts";

const canonical = new Set(["japan-slow", ...immersiveRouteKeys]);

test("every published route has a local, responsive and provenanced opening hero", () => {
  const published = publicRoutePublishedFamilies();
  assert.equal(published.length, 25);
  for (const route of published) {
    const readiness = checkRouteVisualReadiness(route);
    const photo = routeImagePhoto(route.key);
    assert.equal(readiness.heroImageAvailable, true, route.key);
    assert.equal(readiness.heroImageProvenanced, true, route.key);
    assert.notEqual(readiness.status, "missing-hero", route.key);
    assert.ok(photo?.author && photo.sourceUrl && photo.license && photo.licenseUrl, route.key);
    assert.equal(routeImages[route.key], photo?.variants.at(-1)?.src, route.key);
    for (const variant of photo!.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)), `${route.key}: ${variant.src}`);
  }
});

test("canonical routes remain fully visual while legacy routes expose partial destination coverage", () => {
  for (const route of publicRoutePublishedFamilies()) {
    const readiness = checkRouteVisualReadiness(route);
    if (canonical.has(route.key)) {
      assert.equal(readiness.status, "fully-visual", route.key);
      assert.equal(readiness.destinationImageCount, route.stops.length, route.key);
      assert.equal(readiness.fallbackBehaviour, "none", route.key);
    } else {
      assert.equal(readiness.status, "hero-ready", route.key);
      assert.equal(readiness.fallbackBehaviour, "compact destination fallback", route.key);
    }
  }
});

test("readiness validation surfaces a missing hero without changing publication", () => {
  const before = publicRoutePublishedFamilies().map(route => route.key);
  const missing = checkRouteVisualReadiness({ key: "unpictured-editorial-route", stops: [{ name: "Nowhere", country: "Unknown" }] });
  assert.equal(missing.status, "missing-hero");
  assert.equal(missing.fallbackBehaviour, "compact route fallback");
  assert.deepEqual(publicRoutePublishedFamilies().map(route => route.key), before);
});

test("discovery and Route Detail read the shared route image owner", () => {
  const discovery = readFileSync(new URL("../lib/easyt/discovery-catalogue.ts", import.meta.url), "utf8");
  const presentation = readFileSync(new URL("../app/journey/routes/[slug]/route-detail-presentation.ts", import.meta.url), "utf8");
  assert.match(discovery, /routeImagePhoto/);
  assert.match(presentation, /routePhotoForSource/);
  assert.doesNotMatch(discovery, /route-photo-cache|destination-inventory\.json/);
});
