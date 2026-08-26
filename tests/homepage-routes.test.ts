import assert from "node:assert/strict";
import test from "node:test";
import { homepageEligibleRouteCards, selectHomepageRouteCards } from "../lib/easyt/homepage-routes.ts";
import { isPublishedPublicRouteKey, publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";

test("every homepage-eligible route resolves to published detail and a usable planner payload", () => {
  const routes = homepageEligibleRouteCards();
  assert.ok(routes.length > 3, "the homepage needs enough eligible routes to vary its selection");
  assert.equal(new Set(routes.map((route) => route.routeKey)).size, routes.length);

  for (const route of routes) {
    assert.equal(isPublishedPublicRouteKey(route.routeKey), true, route.routeKey);
    const detail = publicRouteDetailFor(route.routeKey);
    assert.ok(detail, `${route.routeKey} must resolve Route Detail`);
    assert.equal(route.href, `/journey/routes/${detail.key}`);
    assert.equal(route.stopCount, detail.stops.length);
    assert.equal(route.bases, detail.stops.map((stop) => stop.name).join(" → "));

    const payload = routePlannerPayload(detail.planDraft, new Date(2026, 0, 1, 12));
    assert.equal(payload.sourceRouteKey, route.routeKey);
    assert.deepEqual(payload.destinations.map((stop) => stop.name), detail.stops.map((stop) => stop.name));
    assert.equal(payload.structuredBrief.placeIssues?.some((issue) => issue.blocksRoute), false);
  }
});

test("unpublished Southeast Asia catalogue entries cannot leak onto the homepage", () => {
  assert.equal(isPublishedPublicRouteKey("thailand-vietnam-cambodia"), false);
  assert.equal(homepageEligibleRouteCards().some((route) => route.routeKey === "thailand-vietnam-cambodia"), false);
});

test("selection randomises once from immutable eligible data and remains deterministic under a supplied source", () => {
  const pool = homepageEligibleRouteCards();
  const first = selectHomepageRouteCards(pool, 3, () => 0).map((route) => route.routeKey);
  const repeated = selectHomepageRouteCards(pool, 3, () => 0).map((route) => route.routeKey);
  const alternate = selectHomepageRouteCards(pool, 3, () => 0.999999).map((route) => route.routeKey);

  assert.deepEqual(repeated, first);
  assert.notDeepEqual(alternate, first);
  assert.equal(new Set(first).size, first.length);
  assert.equal(new Set(alternate).size, alternate.length);
  assert.equal(pool.length, homepageEligibleRouteCards().length, "selection must not mutate the shared pool");
});
