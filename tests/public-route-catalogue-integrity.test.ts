import assert from "node:assert/strict";
import test from "node:test";
import { publicRouteDetailFor, publicRoutePublishedFamilies } from "../lib/easyt/public-route.ts";
import { filterDiscoveryRoutes, initialDiscoveryFilters } from "../lib/easyt/route-discovery.ts";

test("public duration ranges can accommodate every overnight minimum", () => {
  const conflicts = publicRoutePublishedFamilies().flatMap(route => {
    const minimumDays = 1 + route.stops.reduce((total, stop) => total + stop.minimumNights, 0);
    return route.suggestedDays.min < minimumDays ? [`${route.key}: ${route.suggestedDays.min} days cannot hold ${minimumDays - 1} nights`] : [];
  });
  assert.deepEqual(conflicts, []);
});

test("short-route discovery does not offer Italy's eleven-day-minimum route as an eight-day trip", () => {
  const italy = publicRoutePublishedFamilies().filter(route => route.key === "italy-table");
  assert.equal(italy.length, 1);
  assert.deepEqual(filterDiscoveryRoutes(italy, { ...initialDiscoveryFilters, length: "short" }), []);
});

test("public country facets match the overnight route without mismatch warnings", () => {
  for (const route of publicRoutePublishedFamilies()) {
    assert.deepEqual(route.countries, [...new Set(route.stops.map(stop => stop.country))], route.key);
    assert.ok(!publicRouteDetailFor(route.key)?.dataIssues.includes("country-mismatch"), route.key);
  }
});

test("Taiwan's high-speed planning context names its actual network and city access", () => {
  const taiwan = publicRouteDetailFor("taiwan-rail")!;
  assert.ok(taiwan.sources.some(source => new URL(source.url).hostname === "eng.taiwan.net.tw" && source.covers.includes("THSR")));
  assert.ok(taiwan.sources.some(source => new URL(source.url).hostname === "en.thsrc.com.tw" && source.covers.includes("Shalun")));
});

test("an independent Cambodia guide is not represented as ministry evidence", () => {
  const source = publicRouteDetailFor("vietnam-cambodia")!.sources.find(source => source.url.includes("tourismcambodia.org"))!;
  assert.ok(source);
  assert.match(source.owner ?? "", /independent/i);
  assert.doesNotMatch(`${source.owner} ${source.covers} ${source.limitations}`, /ministry|official destination/i);
});
