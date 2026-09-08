import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { publicRouteDetailFor, isPublishedPublicRouteKey } from "../lib/easyt/public-route.ts";
import { routeFamilyByKey } from "../lib/easyt/route-catalog.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { routeDetailPresentation, relatedRouteDetails } from "../app/journey/routes/[slug]/route-detail-presentation.ts";
import { nightLabel, transferStatus } from "../app/journey/routes/[slug]/route-detail-labels.ts";
import { routeMapSelectionFromHash, validRouteSelection } from "../app/journey/routes/[slug]/route-map-selection.ts";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const owner = "app/journey/routes/[slug]/";
const keys = ["japan-slow", "balkans-overland", "vietnam-cambodia", "iceland-ring-road"];

test("presentation cannot change published identities, stop order or the canonical Builder draft", () => {
  for (const key of keys) {
    const detail = publicRouteDetailFor(key)!;
    const before = JSON.stringify(detail);
    const presentation = routeDetailPresentation(detail);
    assert.ok(isPublishedPublicRouteKey(key));
    assert.deepEqual(detail.stops.map(stop => stop.name), routeFamilyByKey[key].stops.map(stop => stop.name));
    assert.equal(JSON.stringify(detail), before);
    assert.equal(`${presentation.title}${presentation.emphasis ? `, ${presentation.emphasis}` : ""}`, detail.title);
    const payload = routePlannerPayload(detail.planDraft, new Date(2026, 8, 8, 12));
    assert.deepEqual(payload.destinations.map(stop => stop.name), detail.stops.map(stop => stop.name));
    assert.equal(payload.sourceRouteKey, key);
  }
});

test("minimum and reviewed night guidance stay distinct from example allocation", () => {
  const detail = publicRouteDetailFor("japan-slow")!;
  const presentation = routeDetailPresentation(detail);
  assert.equal(presentation.nights[0].minimum, 3);
  assert.equal(presentation.nights[0].recommended, 4);
  const changedAllocation = { ...detail, stops: detail.stops.map(stop => ({ ...stop, nights: 30 })) };
  assert.deepEqual(routeDetailPresentation(changedAllocation).nights, presentation.nights);
  assert.equal(nightLabel(1), "1 night");
  assert.equal(nightLabel(3), "3 nights");
  assert.equal(routeDetailPresentation(publicRouteDetailFor("andean-highlands")!).nights[0].recommended, null);
});

test("known modes with unknown durations never become timed or verified transfers", () => {
  const connection = publicRouteDetailFor("japan-slow")!.stops[0].onward!;
  assert.equal(connection.planningMinutes, null);
  assert.match(transferStatus(connection), /details to confirm/);
  assert.equal(transferStatus({ ...connection, mode: null, confidence: "unknown" }), "Unknown transfer");
  assert.match(transferStatus({ ...connection, planningMinutes: 120, confidence: "medium" }), /planning estimate/);
  assert.match(transferStatus({ ...connection, planningMinutes: 120, confidence: "needs-review" }), /details to confirm/);
});

test("selection deep links keep indices in bounds and do not mutate route data", () => {
  assert.deepEqual(routeMapSelectionFromHash("#route-map-stop-4", 5), { type: "stop", index: 4 });
  assert.deepEqual(routeMapSelectionFromHash("#route-map-connection-3", 5), { type: "connection", index: 3 });
  for (const hash of ["#route-map", "#route-map-stop-5", "#route-map-connection-4", "#route-map-stop--1", "#route-map-stop-1.5", "#other"]) assert.equal(routeMapSelectionFromHash(hash, 5), null);
  assert.equal(validRouteSelection({ type: "stop", index: NaN }, 5), null);
});

test("photography resolves only to licensed canonical destinations and preserves attribution", () => {
  for (const key of keys) {
    const detail = publicRouteDetailFor(key)!;
    const visual = routeDetailPresentation(detail);
    assert.ok(visual.hero);
    assert.ok(visual.closing);
    assert.notEqual(visual.hero.key, visual.closing.key);
    visual.photos.forEach((photo, index) => {
      assert.ok(photo, detail.stops[index].name);
      assert.equal(photo.country, detail.stops[index].country);
      assert.ok(photo.author && photo.sourceUrl && photo.license);
      for (const variant of photo.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
    });
    assert.equal(routeDetailPresentation({ ...detail, heroImage: "/unknown-rights.jpg" }).hero, null);
  }
  const photo = read(owner + "route-detail-photo.tsx");
  assert.match(photo, /ResilientImage/);
  assert.match(photo, /Photography pending editorial review/);
  assert.match(photo, /fetchPriority=\{eager \? "high" : "auto"\}/);
  assert.doesNotMatch(photo, /findRoutePhotos|backgroundImage/);
});

test("related journeys stay published, exclude the current route and respect admin hiding", () => {
  const detail = publicRouteDetailFor("japan-slow")!;
  const related = relatedRouteDetails(detail);
  assert.ok(related.length <= 2);
  for (const route of related) { assert.ok(isPublishedPublicRouteKey(route.key)); assert.notEqual(route.key, detail.key); assert.equal(route.href, `/journey/routes/${route.key}`); }
  const hidden = related.map(route => route.key);
  assert.ok(relatedRouteDetails(detail, hidden).every(route => !hidden.includes(route.key)));
  assert.match(read(owner + "page.tsx"), /if \(!isPublishedPublicRouteKey\(canonicalSlug\)\) notFound\(\)/);
});

test("the map library remains behind intersection and selection never recreates the map", () => {
  const map = read(owner + "route-live-map.tsx");
  assert.match(map, /await import\("maplibre-gl"\)/);
  assert.match(map, /IntersectionObserver/);
  assert.match(map, /\}, \[stops, title\]\)/);
  assert.match(map, /event.stopPropagation\(\)/);
  assert.match(map, /duration: 0/);
  assert.match(read(owner + "route-map-summary.tsx"), /aria-live="polite"/);
});

test("actions reuse canonical handoff and analytics while mobile and motion keep equivalent content", () => {
  const view = read(owner + "route-detail-view.tsx");
  const action = read(owner + "route-plan-link.tsx");
  assert.match(action, /routePlannerPayload\(draft\)/);
  assert.match(action, /prefetch=\{false\}/);
  assert.equal((action.match(/trackEvent\("route_started"/g) ?? []).length, 1);
  assert.match(action, /\/journey\/new\?homeDraft=1&inspire=/);
  assert.doesNotMatch(view, /trackEvent|useEffect|localStorage|routePlannerPayload/);
  assert.equal((view.match(/>Start with this route<\/RoutePlanLink>/g) ?? []).length, 3);
  assert.match(view, /href="#route-map"/);
  assert.match(view, /Shape the nights in Builder/);
  assert.match(read(owner + "route-overview.module.css"), /prefers-reduced-motion:reduce/);
  assert.match(read("components/analytics.tsx"), /lastPageViewRef.current === pathname/);
});
