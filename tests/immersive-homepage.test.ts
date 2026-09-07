import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { immersiveHomepageEnabled } from "../lib/easyt/immersive-homepage-config.ts";
import { immersiveHomepageRoutes, initialImmersiveRouteIndex, nextHomepageRoute, routeScrollCorrection } from "../lib/easyt/immersive-homepage-routes.ts";
import { isPublishedPublicRouteKey, publicRouteDetailFor } from "../lib/easyt/public-route.ts";

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
  assert.match(hero, /<EasyTNavigation current="home" landing \/>/);
  assert.match(capture, /<MorroviaTripCapture/);
  assert.match(capture, /<JourneyEndpointsEditor/);
  assert.match(capture, /router\.push\("\/journey\/new\?homeDraft=1"\)/);
  assert.doesNotMatch(hero, /capture-receipt|setSubmitted|Math\.random|Voice\.jsx/);
});
