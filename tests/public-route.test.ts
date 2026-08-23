import assert from "node:assert/strict";
import test from "node:test";
import { routeFamilies, routeFamilyByKey } from "../lib/easyt/route-catalog.ts";
import {
  LEGACY_PUBLIC_ROUTE_SLUGS,
  canonicalPublicRouteSlug,
  publicRouteDetailFor,
  publicRouteSitemapKeys,
} from "../lib/easyt/public-route.ts";

test("legacy public slugs resolve to one canonical route", () => {
  assert.equal(canonicalPublicRouteSlug("portugal-coast"), "portugal-atlantic");
  assert.equal(publicRouteDetailFor("portugal-coast")?.key, "portugal-atlantic");
});

test("every catalog route derives without mutating curated data and preserves route order", () => {
  for (const route of routeFamilies) {
    const before = structuredClone(route);
    const detail = publicRouteDetailFor(route.key);
    assert.ok(detail, `${route.key} should derive`);
    assert.deepEqual(route, before, `${route.key} must remain immutable`);
    assert.deepEqual(detail.stops.map((stop) => stop.name), route.stops.map((stop) => stop.name));
    assert.deepEqual(detail.planDraft.destinations.map((stop) => stop.name), route.stops.map((stop) => stop.name));
    assert.equal(detail.stops.reduce((sum, stop) => sum + stop.nights, 0), detail.totalNights);
    assert.equal(detail.stops.reduce((sum, stop) => sum + stop.days, 0), detail.durationDays);
    assert.equal(detail.totalNights, detail.durationDays - 1);
    assert.equal(detail.stops.at(-1)?.dayEnd, detail.durationDays);
    assert.equal(Object.values(detail.planDraft.nightAllocations).reduce((sum, nights) => sum + nights, 0), detail.totalNights);
    assert.equal(detail.planDraft.structuredBrief.placeIssues?.some((issue) => issue.blocksRoute), false, `${route.key} route CTA should remain operational`);
    detail.stops.forEach((stop, index) => {
      const next = detail.stops[index + 1];
      if (!next) assert.equal(stop.onward, null);
      else {
        assert.equal(stop.onward?.from, stop.name);
        assert.equal(stop.onward?.to, next.name);
      }
    });
  }
});

test("Andean route reconciles the approved nine-day story to supported stays and facts", () => {
  const detail = publicRouteDetailFor("andean-highlands");
  assert.ok(detail);
  assert.equal(detail.durationDays, 9);
  assert.equal(detail.totalNights, 8);
  assert.deepEqual(detail.stops.map((stop) => stop.nights), [3, 3, 2]);
  assert.deepEqual(detail.countries, ["Peru"]);
  assert.deepEqual(detail.stops.map((stop) => stop.dayLabel), ["Days 1–3", "Days 4–6", "Days 7–9"]);
  assert.deepEqual(detail.attractions.map(({ name, stopName }) => [name, stopName]), [
    ["Cusco’s historic centre", "Cusco"],
    ["Pisac and Ollantaytambo", "Sacred Valley"],
    ["Machu Picchu", "Sacred Valley"],
    ["Arequipa and the volcanic landscape", "Arequipa"],
  ]);
  assert.equal(detail.stops[0].onward?.durationLabel, "Approx. 2h");
  assert.equal(detail.stops[1].onward?.durationLabel, "Approx. 6h");
  assert.equal(detail.stops[1].onward?.confidence, "needs-review");
  const sacredValley = detail.planDraft.structuredBrief.destinations.find((destination) => destination.name === "Sacred Valley");
  assert.equal(sacredValley?.canonicalPlaceId, "sacred-valley");
  assert.equal(sacredValley?.routability, "needs_base_selection");
  const baseAdvisory = detail.planDraft.structuredBrief.placeIssues?.find((issue) => issue.code === "region_requires_base");
  assert.equal(baseAdvisory?.blocksRoute, false);
  assert.equal(baseAdvisory?.severity, "warning");
  assert.deepEqual(detail.planDraft.structuredBrief.transportPreferences, []);
  assert.equal(detail.planDraft.structuredBrief.budget, undefined);
});

test("published route minima remain authoritative on the public allocation", () => {
  const detail = publicRouteDetailFor("portugal-atlantic");
  assert.ok(detail);
  assert.deepEqual(detail.stops.map((stop) => stop.nights), [2, 2, 2]);
  assert.equal(detail.dataIssues.includes("allocation-compromise"), false);
});

test("unknown transfers and missing editorial data are omitted instead of fabricated", () => {
  const unknownDetail = publicRouteDetailFor("thailand-laos");
  assert.ok(unknownDetail);
  const unknown = unknownDetail.stops.find((stop) => stop.onward?.confidence === "unknown")?.onward;
  assert.ok(unknown);
  assert.equal(unknown.mode, null);
  assert.equal(unknown.planningMinutes, null);
  assert.equal(unknown.durationLabel, "Transport to confirm");
  assert.ok(unknownDetail.dataIssues.includes("unknown-transfer"));
  assert.deepEqual(unknownDetail.attractions, []);
  assert.ok(unknownDetail.dataIssues.includes("missing-attractions"));
});

test("sitemap eligibility is canonical, unique and review-safe", () => {
  const keys = publicRouteSitemapKeys();
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.some((key) => key in LEGACY_PUBLIC_ROUTE_SLUGS), false);
  for (const key of keys) {
    const route = routeFamilyByKey[key];
    assert.ok(route);
    assert.notEqual(route.confidence, "needs-review");
    assert.ok(route.stops.length >= 2);
    assert.ok(route.sourceLinks.length > 0);
    assert.ok(publicRouteDetailFor(key));
  }
});
