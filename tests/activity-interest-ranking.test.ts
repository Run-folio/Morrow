import assert from "node:assert/strict";
import test from "node:test";

import {
  itineraryInterestAffinity,
  itineraryInterestReason,
  itinerarySuggestionCandidates,
  rankItineraryDiscoveryPlaces,
  type ItineraryDiscoveryPlace,
} from "../lib/easyt/itinerary-day-context.ts";
import { recommendNearbyPlace } from "../lib/easyt/recommendations.ts";
import { tripInterestIds, type TripInterest } from "../lib/easyt/trip-interest.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";

const candidate = (
  id: string,
  title: string,
  type: string,
  tags: string[],
  description: string,
  qualityScore = 11,
): ItineraryDiscoveryPlace => ({
  id,
  title,
  area: "Tokyo",
  type,
  tags,
  description,
  coordinates: [139.65 + id.length / 10_000, 35.67 + id.length / 10_000],
  qualityScore,
});

const pool = [
  candidate("generic", "Orientation loop", "Experience", [], "A general introduction with no classified activity evidence."),
  candidate("market", "Tsukiji food market", "Food", ["Food"], "A market visit with regional tastings."),
  candidate("museum", "National heritage museum", "Culture", ["Culture"], "A museum covering local history and art."),
  candidate("trail", "Mountain park trail", "Nature", ["Nature"], "A scenic outdoor hike on a marked trail."),
  candidate("garden", "Botanical garden", "Nature", ["Nature"], "A garden with regional plants and natural scenery."),
  candidate("beach", "Island beach kayaking", "Beach", ["Beach"], "A coastal water activity around beaches and an island."),
  candidate("viewpoint", "City skyline viewpoint", "Cities", ["Cities"], "An urban viewpoint across the city."),
  candidate("coastal", "Coastal neighbourhood architecture walk", "Cities", ["Cities", "Beach"], "A city walking tour through a seaside neighbourhood."),
];

const rankedIds = (interests: TripInterest[]) => rankItineraryDiscoveryPlaces(pool, interests).map((place) => place.id);

test("the same candidate pool produces distinct Food + Culture, Nature + Hiking, and Beach + Cities ordering", () => {
  assert.deepEqual(rankedIds(["food", "culture"]).slice(0, 3), ["market", "museum", "coastal"]);
  assert.deepEqual(rankedIds(["nature", "hiking"]).slice(0, 3), ["trail", "garden", "generic"]);
  assert.deepEqual(rankedIds(["beach", "cities"]).slice(0, 3), ["coastal", "beach", "viewpoint"]);
});

test("deselection and no interests restore normal provider/base ordering", () => {
  assert.equal(rankedIds(["food"])[0], "market");
  assert.deepEqual(rankedIds([]), pool.map((place) => place.id));
});

test("unclassified activities stay eligible and interest affinity cannot overpower clearly stronger baseline quality", () => {
  const strongGeneric = candidate("strong-generic", "Exceptional orientation", "Experience", [], "A highly relevant general introduction.", 20);
  const weakerFood = candidate("weaker-food", "Food market tasting", "Food", ["Food"], "A culinary market visit.", 10);
  assert.deepEqual(rankItineraryDiscoveryPlaces([strongGeneric, weakerFood], ["food"]).map((place) => place.id), ["strong-generic", "weaker-food"]);
  assert.equal(rankItineraryDiscoveryPlaces(pool, ["hiking"]).some((place) => place.id === "generic"), true);
});

test("rationales are emitted only for evidenced canonical matches", () => {
  assert.deepEqual(itineraryInterestAffinity(pool[3], ["nature", "hiking"]).matchedInterests, ["nature", "hiking"]);
  assert.equal(itineraryInterestReason(pool[3], ["nature", "hiking"]), "Good fit for Nature + Hiking");
  assert.equal(itineraryInterestReason(pool[0], ["food", "culture"]), null);
  assert.deepEqual(tripInterestIds, ["food", "culture", "nature", "cities", "beach", "hiking"]);
});

test("the itinerary shortlist reads interests from the canonical trip and updates after deselection", () => {
  const trip = tripCopilotFixture();
  const day = trip.planItems[1];
  assert.deepEqual(itinerarySuggestionCandidates(trip, day, pool).slice(0, 2).map((place) => place.id), ["market", "museum"]);
  const deselected = {
    ...trip,
    brief: {
      ...trip.brief,
      intent: {
        ...trip.brief.intent!,
        preferences: { ...trip.brief.intent!.preferences, interests: [] },
      },
    },
  };
  assert.deepEqual(itinerarySuggestionCandidates(deselected, day, pool).map((place) => place.id), pool.map((place) => place.id));
});

test("mapped restaurant ranking uses the trip's canonical Food interest without changing provider facts", () => {
  const place = { id: "market-cafe", name: "Local Market Cafe", category: "restaurant", address: "Mapped address", distanceKm: 1 };
  const withFood = recommendNearbyPlace(place, { kind: "restaurant", mood: "surprise", interests: ["food"] });
  const withoutFood = recommendNearbyPlace(place, { kind: "restaurant", mood: "surprise", interests: [] });
  assert.ok(withFood.score > withoutFood.score);
  assert.equal(withFood.reasons.includes("matches your Food interest"), true);
});
