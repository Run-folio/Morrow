import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { discoveryCatalogue, publicDiscoveryDraft } from "../lib/easyt/discovery-catalogue.ts";
import { publicRouteDetailFor, publicRoutePublishedFamilies } from "../lib/easyt/public-route.ts";
import { routeFamilies } from "../lib/easyt/route-catalog.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { filterDiscoveryRoutes, initialDiscoveryFilters as initial, resetDiscoveryFilter, discoverySequence, discoveryShape } from "../lib/easyt/route-discovery.ts";
const published = publicRoutePublishedFamilies();
const routes = discoveryCatalogue();
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("projection contains exactly the public catalogue, canonical identity, complete stops and no eager drafts", () => {
  assert.deepEqual(routes.map(r => r.key), published.map(r => r.key));
  assert.ok(routes.length >= 12);
  for (const route of routes) {
    const detail = publicRouteDetailFor(route.key)!;
    assert.equal(route.href, `/journey/routes/${detail.key}`);
    assert.deepEqual(route.stops.map(s => s.id), detail.stops.map(s => s.id));
    assert.deepEqual(route.countries, detail.countries);
    assert.equal("planDraft" in route, false);
  }
});
test("unreviewed input and administratively hidden keys cannot enter projection or draft adapter", () => {
  assert.deepEqual(discoveryCatalogue(routeFamilies).map(r => r.key), routes.map(r => r.key));
  const visible = published.slice(1);
  assert.equal(publicDiscoveryDraft(published[0].key, visible), null);
  for (const route of routeFamilies.filter(r => !published.some(p => p.key === r.key))) assert.equal(publicDiscoveryDraft(route.key, routeFamilies), null);
  assert.deepEqual(discoveryCatalogue([]), []);
  assert.equal(publicDiscoveryDraft("unknown", published), null);
});
test("every discovery draft uses the exact public handoff including endpoint identity and ordered allocation", () => {
  const now = new Date(2026, 8, 8, 12);
  for (const route of routes) {
    const draft = publicDiscoveryDraft(route.key, published)!;
    assert.deepEqual(draft, publicRouteDetailFor(route.key)!.planDraft);
    assert.deepEqual(routePlannerPayload(draft, now), routePlannerPayload(publicRouteDetailFor(route.key)!.planDraft, now));
  }
});
test("search matches real title, country, destination and region with accent/case folding and AND terms", () => {
  for (const query of ["JAPAN", "Tokyo"]) assert.ok(filterDiscoveryRoutes(routes, {...initial, search:query}).some(r => r.key === "japan-slow"));
  assert.ok(filterDiscoveryRoutes(routes, {...initial, search:"merida"}).some(r => r.key === "mexico-yucatan"));
  assert.ok(filterDiscoveryRoutes(routes, {...initial, search:"asia tokyo"}).some(r => r.key === "japan-slow"));
  assert.equal(filterDiscoveryRoutes(routes, {...initial, search:"tokyo peru"}).length, 0);
  assert.deepEqual(filterDiscoveryRoutes(routes, {...initial, search:"   "}), routes);
});
test("combined filters intersect, individual removal preserves other state and reset restores catalogue", () => {
  const filters = {...initial, search:"Italy", region:"europe" as const, country:"Italy", multi:true};
  const result = filterDiscoveryRoutes(routes, filters);
  assert.ok(result.length);
  assert.ok(result.every(r => r.countries.includes("Italy") && r.countries.length > 1));
  const removed = resetDiscoveryFilter(filters,"multi");
  assert.equal(removed.search,"Italy"); assert.equal(removed.country,"Italy"); assert.equal(removed.multi,false);
  assert.ok(filterDiscoveryRoutes(routes,removed).length >= result.length);
  assert.deepEqual(filterDiscoveryRoutes(routes, initial),routes);
  assert.equal(filterDiscoveryRoutes(routes,{...filters, search:"no such place"}).length,0);
});
test("duration overlap, transport style and combined Americas preserve supported semantics", () => {
  for (const length of ["short","medium","long"] as const) {
    const expected = routes.filter(r => length === "short" ? r.suggestedDays.min <= 10 : length === "medium" ? r.suggestedDays.min <= 21 && r.suggestedDays.max >= 10 : r.suggestedDays.max >= 21);
    assert.deepEqual(filterDiscoveryRoutes(routes,{...initial,length}),expected);
  }
  assert.ok(filterDiscoveryRoutes(routes,{...initial,style:"rail"}).every(r => r.interests.includes("rail")));
  assert.ok(filterDiscoveryRoutes(routes,{...initial,region:"americas"}).every(r => r.region.endsWith("america")));
});
test("3, 4, 5 and 8 stop shapes expose every name without a Tokyo + N truncation", () => {
  const names = ["Tokyo","Kanazawa","Takayama","Kyoto","Osaka","Hiroshima","Fukuoka","Nagasaki"];
  for (const count of [3,4,5,8]) {
    const route = {stops:names.slice(0,count).map(name=>({name})),countries:["Japan"]};
    assert.equal(discoverySequence(route),names.slice(0,count).join(" → "));
    assert.equal(discoveryShape(route),`${count} stops · 1 country`);
  }
});
test("every published route has local photography with documented source, rights and responsive variants", () => {
  for (const route of routes) {
    assert.ok(route.image, route.key);
    assert.ok(route.image!.license); assert.match(route.image!.sourceUrl,/^https:\/\//);
    assert.ok(route.image!.alt); assert.ok(route.image!.variants.every(v=>v.width > 0));
  }
});
test("preview delegates Start, restores browsing focus/scroll, and has finite failure and keyboard exit", () => {
  const preview = source("app/journey/discover/route-preview.tsx");
  assert.match(preview,/<RoutePlanLink draft={draft} placement="discovery"/);
  assert.doesNotMatch(preview,/routePlannerPayload|trackEvent\(/);
  for (const contract of ["showModal()", "onCancel=", "preventScroll: true", "top: scrollY", "AbortSignal.timeout", "route.stops.map", "href={route.href}"]) assert.ok(preview.includes(contract),contract);
});
test("preview stop selector owns a contained, stable selected state", () => {
  const preview = source("app/journey/discover/route-preview.tsx");
  const css = source("app/journey/discover/discover.module.css");
  assert.match(preview, /<ol className=\{styles\["stop-order"\]\} aria-label="Route stops in order">/);
  assert.match(preview, /aria-pressed=\{index === stop\}/);
  assert.doesNotMatch(css, /\.stop-order\{[^}]*border-top:1px/);
  assert.match(css, /\.stop-order button\{[^}]*padding:14px 20px[^}]*grid-template-columns:auto minmax\(0,1fr\)[^}]*min-height:72px/);
  assert.match(css, /\.stop-order button\[aria-pressed=true\]\{background:var\(--morrovia-lilac\)\}/);
  assert.match(css, /\.stop-order button\[aria-pressed=true\]::before\{[^}]*left:14px;right:14px[^}]*background:var\(--morrovia-signal\)/);
  assert.doesNotMatch(css, /\.stop-order button\[aria-pressed=true\]\{[^}]*margin-top/);
});
test("map and preview stay behind dynamic imports, with no eager catalogue or map module on client", () => {
  const browser=source("app/journey/discover/discovery-browser.tsx");
  assert.match(browser,/dynamic\(\(\) => import\("\.\/discovery-map"\)/);
  assert.match(browser,/dynamic\(\(\) => import\("\.\/route-preview"\)/);
  assert.doesNotMatch(browser,/from "maplibre-gl"|from "world-atlas|publicRoutePublishedFamilies|Math.random/);
  assert.match(browser,/import type \{ DiscoveryRoute \}/);
});
test("fallback, mobile actions, reduced motion and no-results recovery remain explicit", () => {
  const css=source("app/journey/discover/discover.module.css");
  const browser=source("app/journey/discover/discovery-browser.tsx");
  const photo=source("app/journey/discover/discovery-photo.tsx");
  assert.match(css,/prefers-reduced-motion:reduce/); assert.match(css,/\.atlas-actions\{position:sticky;bottom:0/);
  assert.match(css,/max-width:700px/); assert.match(css,/min-width:44px;min-height:44px/);
  for (const text of ["Clear filters", "Start your own trip", "Active filters", "Reset all"]) assert.ok(browser.includes(text));
  for (const text of ["Photography pending editorial review", "ResilientImage", '"lazy"']) assert.ok(photo.includes(text));
  assert.doesNotMatch(photo,/findRoutePhotos|route-photo-cache|IntersectionObserver/);
});
test("analytics is emitted by deliberate canonical Start only, never preview, hydration or hover", () => {
  for (const file of ["discovery-browser.tsx","discovery-photo.tsx","route-preview.tsx","discovery-map.tsx"]) assert.doesNotMatch(source(`app/journey/discover/${file}`),/trackEvent\(|route_started/);
  const link=source("app/journey/routes/[slug]/route-plan-link.tsx");
  assert.equal(link.match(/trackEvent\("route_started"/g)?.length,1);
  assert.match(link,/onClick=/);
});
