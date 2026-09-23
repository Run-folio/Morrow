import assert from "node:assert/strict";
import test from "node:test";

import * as routePresentation from "../app/journey/routes/[slug]/route-detail-presentation.ts";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routeEditorialImagery } from "../lib/easyt/route-editorial-imagery.ts";

type DiscoveryProjection = {
  isRich: boolean;
  story: { promise: string; arc: string | null; rhythm: string | null; bestFor: string; styleSignals: string[] };
  highlights: Array<{ id: string; title: string; stopName: string; context: string; photo: { author: string; licenseUrl: string; sourceUrl: string; variants: Array<{ src: string }> } }>;
  experiences: Array<{ name: string; stopName: string; context: string; photo: { author: string; licenseUrl: string; sourceUrl: string } }>;
  practical: string[];
  additions: unknown[];
};

function project(key: string) {
  const factory = (routePresentation as Record<string, unknown>).routeDiscoveryPresentation;
  assert.equal(typeof factory, "function", "Route Detail must expose the reviewed discovery projection");
  return (factory as (detail: NonNullable<ReturnType<typeof publicRouteDetailFor>>) => DiscoveryProjection)(publicRouteDetailFor(key)!);
}

test("the eight reviewed editorial routes qualify for bounded attributed highlights", () => {
  assert.equal(Object.keys(routeEditorialImagery).length, 8);
  for (const key of Object.keys(routeEditorialImagery)) {
    const detail = publicRouteDetailFor(key)!;
    const discovery = project(key);
    assert.equal(discovery.isRich, true, key);
    assert.ok(discovery.highlights.length >= 6 && discovery.highlights.length <= 10, key);
    assert.equal(discovery.highlights.length, Math.min(10, Math.max(6, detail.stops.length)), `${key} should add only enough reviewed moments to meet readiness`);
    assert.equal(new Set(discovery.highlights.map(item => item.id)).size, discovery.highlights.length, key);
    assert.ok(discovery.experiences.length >= 3, key);
    for (const item of [...discovery.highlights, ...discovery.experiences]) {
      assert.ok(item.context && item.stopName, key);
      assert.ok(item.photo.author && item.photo.licenseUrl && item.photo.sourceUrl, key);
      if ("variants" in item.photo) {
        assert.ok(item.photo.variants.length > 0, key);
        assert.ok(item.photo.variants.every(variant => !variant.src.includes("res.cloudinary.com")), `${key} must not promote a homepage-only asset`);
      }
    }
    assert.deepEqual(discovery.additions, [], `${key} must not invent an addition or detour`);
  }
});

test("sparse published routes degrade to factual content without highlight or image placeholders", () => {
  for (const key of ["india-golden-triangle", "portugal-atlantic"]) {
    const discovery = project(key);
    assert.equal(discovery.isRich, false, key);
    assert.deepEqual(discovery.highlights, [], key);
    assert.deepEqual(discovery.experiences, [], key);
    assert.ok(discovery.story.promise, key);
    assert.ok(discovery.story.bestFor, key);
    assert.ok(discovery.story.styleSignals.length > 0, key);
    assert.ok(discovery.practical.every(item => !/pending|placeholder|not recorded/i.test(item)), key);
  }
});

test("discovery projection selects existing truth without mutating Route Detail or Builder draft", () => {
  for (const key of ["japan-slow", "india-golden-triangle", "vietnam-cambodia", "balkans-overland", "portugal-atlantic"]) {
    const detail = publicRouteDetailFor(key)!;
    const before = JSON.stringify(detail);
    const discovery = project(key);
    assert.equal(discovery.story.promise, detail.summary, key);
    assert.equal(JSON.stringify(detail), before, key);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(detail.planDraft)), key);
  }
});
