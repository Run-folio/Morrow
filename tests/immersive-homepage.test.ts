import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { immersiveHomepageEnabled } from "../lib/easyt/immersive-homepage-config.ts";
import { immersiveHomepageRoutes, initialImmersiveRouteIndex, nextHomepageRoute, routeScrollCorrection } from "../lib/easyt/immersive-homepage-routes.ts";
import { isPublishedPublicRouteKey, publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { createHomepageDemo, homepageDemoReducer, homepageDemoDay } from "../lib/easyt/homepage-demo.ts";
import { homepageAffiliateImage } from "../lib/easyt/homepage-affiliate-imagery.ts";
import { existsSync } from "node:fs";

test("homepage switch fails closed, without browser-dependent routing", () => {
  for (const value of [undefined, "", "false", "1", "TRUE"]) assert.equal(immersiveHomepageEnabled(value), false);
  assert.equal(immersiveHomepageEnabled("true"), true);
  const page = readFileSync(new URL("../app/journey/home/page.tsx", import.meta.url), "utf8");
  assert.match(page, /process\.env\.IMMERSIVE_HOMEPAGE_V2/);
  assert.match(page, /initialIndex=\{initialImmersiveRouteIndex\(journeys\)\}/);
});
test("route chapters cannot publish prototype data or silently change canonical Japan", () => {
  for (const route of immersiveHomepageRoutes()) {
    assert.equal(isPublishedPublicRouteKey(route.key), true);
    assert.deepEqual(route.stops, publicRouteDetailFor(route.key)!.stops);
    assert.equal(route.href, `/journey/routes/${route.key}`);
    assert.equal(route.minimumNights.length, route.stops.length);
  }
  assert.equal(immersiveHomepageRoutes().some((route) => route.key === "iceland-ring-road"), false);
});
test("random choice is injectable and stable, navigation wraps, scroll correction stays local", () => {
  const routes = immersiveHomepageRoutes();
  assert.equal(initialImmersiveRouteIndex(routes, () => .25), initialImmersiveRouteIndex(routes, () => .25));
  assert.equal(nextHomepageRoute(3, 1, 4), 0);
  assert.equal(nextHomepageRoute(0, -1, 4), 3);
  assert.equal(nextHomepageRoute(0, 1, 0), 0);
  assert.equal(routeScrollCorrection(-250, -220), 30);
  assert.equal(routeScrollCorrection(-250, -250.5), 0);
});
test("hero composes real capture and current handoff owners", () => {
  const hero = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
  const capture = readFileSync(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url), "utf8");
  assert.match(hero, /<HomeTripStarter \/>/);
  assert.match(hero, /<EasyTNavigation current="home" landing deferPrefetch \/>/);
  assert.match(capture, /<MorroviaTripCapture/);
  assert.match(capture, /<JourneyEndpointsEditor/);
  assert.match(capture, /router\.push\("\/journey\/new\?homeDraft=1"\)/);
  assert.doesNotMatch(hero, /capture-receipt|setSubmitted|Math\.random|Voice\.jsx/);
});

test("one night decision persists between demo views without changing catalogue data", () => {
  const routes = immersiveHomepageRoutes();
  const route = routes[0];
  const original = structuredClone(route);
  let state = createHomepageDemo(routes);
  const before = homepageDemoDay(state.nights[route.key], 1);
  state = homepageDemoReducer(state, { type: "night", route, index: 0, value: route.stops[0].nights + 1 });
  for (const view of ["itinerary", "map", "builder"] as const) {
    state = homepageDemoReducer(state, { type: "view", view });
    assert.equal(state.view, view);
    assert.equal(homepageDemoDay(state.nights[route.key], 1), before + 1);
  }
  assert.deepEqual(route, original);
  assert.equal(homepageDemoReducer(state, { type: "night", route, index: 0, value: NaN }), state);
  state = homepageDemoReducer(state, { type: "night", route, index: 0, value: -1 });
  assert.equal(state.nights[route.key][0], route.minimumNights[0]);
  state = homepageDemoReducer(state, { type: "reset", route });
  assert.deepEqual(state.nights[route.key], route.stops.map((stop) => stop.nights));
});

test("demo has no account, storage, analytics or mutation dependency and lazy-loads the map", () => {
  for (const name of ["lib/easyt/homepage-demo.ts", "app/journey/home/immersive/product-demo.tsx", "app/journey/home/immersive/demo-map.tsx"]) {
    const source = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|trackEvent|fetch\(|repository|TripDocument/);
  }
  const product = readFileSync(new URL("../app/journey/home/immersive/product-demo.tsx", import.meta.url), "utf8");
  assert.match(product, /dynamic\(\(\) => import\("\.\/demo-map"\)/);
  assert.ok(product.indexOf("styles.canvasNavigation") < product.indexOf("styles.productExamples"));
});

test("all sixteen affiliate states have provenance, distinct files and responsive variants", () => {
  const files = new Set<string>();
  for (const key of ["japan-slow", "balkans-overland", "vietnam-cambodia", "iceland-ring-road"]) for (const category of ["accommodation", "activities", "transport", "connectivity"] as const) {
    const image = homepageAffiliateImage(key, category);
    assert.ok(image);
    assert.equal(image.status, "generated-project-asset");
    assert.match(image.source, /OpenAI image generation/);
    assert.ok(image.alt && image.rights);
    assert.equal(files.has(image.file), false);
    files.add(image.file);
    for (const variant of image.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
  }
  assert.equal(files.size, 16);
  assert.equal(homepageAffiliateImage("not-a-route", "transport"), null);
});

test("affiliate chapter delegates clicks to canonical owner without writing readiness state", () => {
  const source = readFileSync(new URL("../app/journey/home/immersive/affiliate-chapter.tsx", import.meta.url), "utf8");
  assert.match(source, /getCurrentPartnerAction\(need.category\)/);
  assert.match(source, /<MorroviaAffiliateLink/);
  assert.doesNotMatch(source, /trackEvent|localStorage|setBooked|repository|fetch\(/);
  assert.equal((source.match(/Partner links · Morrovia may earn/g) ?? []).length, 1);
});


test("destination imagery is matched to canonical places with explicit source rights", () => {
  for (const route of immersiveHomepageRoutes()) for (const [index, stop] of route.stops.entries()) {
    const photo = route.photos[index];
    assert.ok(photo, `Missing credited image for ${stop.name}`);
    assert.equal(photo.place, stop.name);
    assert.equal(photo.country, stop.country);
    assert.ok(photo.author && photo.licenseUrl && photo.sourceUrl);
    for (const variant of photo.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
  }
});

test("quiet view stops scroll work and the final action focuses the original prompt", () => {
  const route = readFileSync(new URL("../app/journey/home/immersive/route-chapters.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/journey/home/immersive/immersive.module.css", import.meta.url), "utf8");
  const closing = readFileSync(new URL("../app/journey/home/immersive/closing-chapter.tsx", import.meta.url), "utf8");
  assert.match(route, /if \(quiet\) return/);
  assert.match(route, /desktop.addEventListener\("change", listen\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(closing, /#start-building textarea/);
  assert.match(closing, /focus\(\{ preventScroll: true \}\)/);
});
