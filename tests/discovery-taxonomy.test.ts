import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  discoveryCategories,
  discoveryCategoryMatches,
  mapSeeDiscoveryCategories,
} from "../lib/easyt/discovery-taxonomy.ts";

test("Explore and Map See share one public discovery taxonomy while Map Eat owns Food", () => {
  assert.deepEqual(discoveryCategories, ["for-you", "must-see", "food", "tours", "day-trips", "outdoors"]);
  assert.deepEqual(mapSeeDiscoveryCategories, ["for-you", "must-see", "tours", "day-trips", "outdoors"]);
  const map = readFileSync("components/journey-itinerary-refinement.tsx", "utf8");
  assert.match(map, /mapSeeDiscoveryCategories/);
  assert.doesNotMatch(map, /\["All", "Food", "Nature", "Cities", "Beach"\]/);
  const mapWorkspace = readFileSync("components/journey-map-planner-workspace.tsx", "utf8");
  assert.match(mapWorkspace, /shapeDayTabs: ShapeDayTab\[\] = \["plan", "stay", "eat", "see"\]/);
  assert.match(mapWorkspace, /shapeDayTab === "eat"[\s\S]*localFinderKind/);
  assert.match(mapWorkspace, /localFinderKind === "restaurant"/);
  assert.equal(discoveryCategoryMatches({ kind: "restaurant" }, "food"), true);
});

test("outdoors requires semantic type or tag evidence and rejects incidental prose or names", () => {
  assert.equal(discoveryCategoryMatches({ category: "Culture", tags: ["Cities"] }, "outdoors"), false);
  assert.equal(discoveryCategoryMatches({ category: "Place", tags: ["Cities"] }, "outdoors"), false, "Ginza Sony Park-style names are not evidence");
  assert.equal(discoveryCategoryMatches({ category: "Theatre", tags: ["Cities"] }, "outdoors"), false, "Imperial Theatre-style venues stay indoors");
  assert.equal(discoveryCategoryMatches({ category: "Nature", tags: ["Nature"] }, "outdoors"), true);
  assert.equal(discoveryCategoryMatches({ category: "Viewpoint", tags: [] }, "outdoors"), true);
  for (const category of ["Restaurant", "Train station", "Office", "Commercial building", "Museum"]) {
    assert.equal(discoveryCategoryMatches({ category, tags: [] }, "outdoors"), false, category);
  }
  for (const category of ["Mountain", "Park", "Natural area", "Hike", "Trail", "Beach", "Coast"]) {
    assert.equal(discoveryCategoryMatches({ category, tags: [] }, "outdoors"), true, category);
  }
});

test("must-see requires strong provider evidence and day trips require explicit classification", () => {
  assert.equal(discoveryCategoryMatches({ category: "Museum", qualityScore: 5 }, "must-see"), false);
  assert.equal(discoveryCategoryMatches({ category: "Museum", qualityScore: 11 }, "must-see"), true);
  assert.equal(discoveryCategoryMatches({ category: "Day trip", tags: ["day-trips"], qualityScore: 12 }, "must-see"), false);
  assert.equal(discoveryCategoryMatches({ kind: "tour", category: "Tour", tags: ["full day"] }, "day-trips"), false);
  assert.equal(discoveryCategoryMatches({ kind: "tour", category: "Day trip", tags: ["day-trips"] }, "day-trips"), true);
});

test("organic day trips are spatially bounded, settlement-only and independent from Viator", () => {
  const route = readFileSync("app/api/journey-day-trips/route.ts", "utf8");
  const explore = readFileSync("components/easyt/trip-explore-workspace.tsx", "utf8");
  assert.match(route, /MINIMUM_DAY_TRIP_DISTANCE_KM = 20/);
  assert.match(route, /MAXIMUM_DAY_TRIP_DISTANCE_KM = 80/);
  assert.match(route, /searchOpenWorldNearbyBaseSuggestions/);
  assert.doesNotMatch(route, /duration|hour|minute|Viator/i);
  assert.match(explore, /plan\.dayTrips[\s\S]*loadDayTrips/);
  assert.match(explore, /routeStops\.has/);
});

test("Outdoors remains organic while commercial tour inventory stays category-scoped", () => {
  const inventory = readFileSync("components/easyt/live-activity-inventory.tsx", "utf8");
  assert.match(inventory, /usesCommercialInventory = discoveryCategory !== "outdoors"/);
  assert.match(inventory, /if \(!usesCommercialInventory\) \{ setItems\(\[\]\); setStatus\("ready"\); return; \}/);
});
