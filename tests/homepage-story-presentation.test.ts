import assert from "node:assert/strict";
import test from "node:test";
import * as navigation from "../lib/easyt/homepage-navigation.ts";
import { immersiveHomepageRoutes } from "../lib/easyt/immersive-homepage-routes.ts";

test("featured route hierarchy uses travel style, country names and ordered stops without changing route truth", () => {
  assert.equal(typeof navigation.homepageStoryPresentation, "function");
  for (const route of immersiveHomepageRoutes()) {
    const before = JSON.stringify(route);
    const result = navigation.homepageStoryPresentation(route);
    assert.equal(result.title, route.countries.join(" + "));
    assert.equal(result.eyebrow, navigation.homepageJourneyLabel(route.key, route.title).theme || route.interestLabel);
    assert.equal(result.stops, route.stops.map(stop => stop.name).join(" → "));
    assert.equal(JSON.stringify(route), before);
  }
  const multi = immersiveHomepageRoutes().find(route => route.key === "balkans-overland")!;
  assert.equal(navigation.homepageStoryPresentation(multi).title, "Croatia + Montenegro + Albania + North Macedonia");
});
