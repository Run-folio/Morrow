import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { exploreResultForActivity, exploreResultForLocalPlace } from "../lib/easyt/explore.ts";
import { mapResultForLocalPlace } from "../lib/easyt/map-result-selection.ts";
import {
  recommendationDetailContextKey,
  recommendationDetailForExploreResult,
  recommendationDetailForMapResult,
} from "../lib/easyt/recommendation-detail.ts";
import { scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";

function tripFixture(): EasyTTrip {
  const intent = defaultTripIntent({ durationDays: 2, stopIds: ["cusco"] });
  return {
    schemaVersion: 1, id: "detail-trip", ownerId: null, title: "Cusco", status: "draft",
    startDate: "2026-10-01", endDate: "2026-10-02", travellers: 2, currency: "GBP",
    brief: { origin: "Lima", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, itineraryIdeas: [], intent: { ...intent, preferences: { ...intent.preferences, interests: ["food", "culture"] } } },
    stops: [{ id: "cusco", order: 0, name: "Cusco", country: "Peru", latitude: -13.532, longitude: -71.967, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 }],
    legs: [],
    planItems: [
      { id: "day-open", stopId: "cusco", dayNumber: 1, date: "2026-10-01", type: "open", title: "Open Cusco day", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-busy", stopId: "cusco", dayNumber: 2, date: "2026-10-02", type: "activity", title: "Cusco plans", reason: "", notes: ["Museum visit", "Market walk"], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    ],
    recommendations: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function fullDayResult(trip: EasyTTrip) {
  return exploreResultForActivity(trip.stops[0]!, {
    provider: "viator", source: "viator", providerProductId: "CUSCO-11H", title: "Sacred Valley culture tour",
    description: "A guided visit using provider-supplied itinerary details.", destination: { canonicalPlaceId: "cusco", label: "Cusco" },
    tags: ["culture", "day trip"], rating: 4.8, reviewCount: 420, duration: { fixedMinutes: 660 },
    price: { amount: 89, currency: "GBP" }, productUrl: "https://www.viator.com/tours/Cusco/CUSCO-11H",
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T00:00:00.000Z" },
  }, trip);
}

test("full-day fit distinguishes open, busy and evening contexts without exact timing claims", () => {
  const trip = tripFixture();
  const result = fullDayResult(trip);
  const open = recommendationDetailForExploreResult({ trip, result, context: { surface: "explore", activeDayId: "day-open", activeDayPart: "morning" } });
  const busy = recommendationDetailForExploreResult({ trip, result, context: { surface: "itinerary", activeDayId: "day-busy", activeDayPart: "morning" } });
  const evening = recommendationDetailForExploreResult({ trip, result, context: { surface: "itinerary", activeDayId: "day-busy", activeDayPart: "evening" } });
  assert.match(open.whyFit!, /no other activities or transfers/);
  assert.match(busy.whyFit!, /may overlap with other plans/);
  assert.match(busy.whyFit!, /will not replace them/);
  assert.match(evening.whyFit!, /does not fit an evening slot/);
  assert.doesNotMatch([open.whyFit, busy.whyFit, evening.whyFit].join(" "), /minutes away|near your hotel|will fit exactly/i);
});

test("a persisted full-day activity remains day-level and explains that it needs most of the day", () => {
  const trip = tripFixture();
  const result = fullDayResult(trip);
  const scheduled = scheduleItineraryIdea(trip, result.idea, "day-open", null);
  const reloaded = JSON.parse(JSON.stringify(scheduled)) as EasyTTrip;
  const planned = recommendationDetailForExploreResult({ trip: reloaded, result, context: { surface: "explore", activeDayId: "day-open", activeDayPart: "afternoon" } });
  assert.match(planned.whyFit!, /^Needs most of the day\. Already planned for Day 1\./);
  assert.doesNotMatch(planned.whyFit!, /Afternoon/);
});

test("provider facts, product identity and image provenance survive shared projection", () => {
  const trip = tripFixture();
  const result = fullDayResult(trip);
  const detail = recommendationDetailForExploreResult({ trip, result, context: { surface: "explore", activeDayId: "day-open", activeDayPart: "morning" } });
  assert.equal(detail.kind, "tour");
  assert.equal(detail.providerProductId, "CUSCO-11H");
  assert.equal(detail.duration, "11h");
  assert.equal(detail.price, "From £89");
  assert.equal(detail.image, undefined);
  assert.deepEqual(detail.practical, [
    { label: "Source", value: "Viator" },
    { label: "Product", value: "CUSCO-11H" },
    { label: "Rating", value: "4.8 · 420 reviews" },
    { label: "Map", value: "Unavailable · No trustworthy coordinates are attached to this recommendation yet." },
  ]);
});

test("restaurant detail omits unknown cuisine, hours, price and imagery", () => {
  const trip = tripFixture();
  const result = exploreResultForLocalPlace(trip.stops[0]!, {
    id: "market-kitchen", name: "Market kitchen", address: "San Pedro, Cusco", category: "Restaurant",
    coordinates: [-71.982, -13.52], mapsUrl: "https://maps.example/market", provider: "google-places", rating: 4.6, reviewCount: 318,
  });
  const detail = recommendationDetailForExploreResult({ trip, result, context: { surface: "explore", activeDayId: "day-open", activeDayPart: "evening" } });
  assert.equal(detail.image, undefined);
  assert.equal(detail.price, undefined);
  assert.equal(detail.category, "Restaurant");
  assert.doesNotMatch(JSON.stringify(detail), /cuisine|opening hours|nearby/i);
});

test("Map Eat and Explore use the same identity and sourced fact shape", () => {
  const trip = tripFixture();
  const local = { id: "market-kitchen", name: "Market kitchen", address: "San Pedro, Cusco", category: "Restaurant", coordinates: [-71.982, -13.52] as [number, number], mapsUrl: "https://maps.example/market", provider: "google-places" as const, rating: 4.6, reviewCount: 318 };
  const explore = exploreResultForLocalPlace(trip.stops[0]!, local);
  const map = mapResultForLocalPlace(local, "eat", { stopId: "cusco", dayNumber: 1 });
  const exploreDetail = recommendationDetailForExploreResult({ trip, result: explore, context: { surface: "explore", activeDayId: "day-open", activeDayPart: "evening" } });
  const mapDetail = recommendationDetailForMapResult({ trip, result: map, context: { surface: "map", activeDayId: "day-open", activeDayPart: "evening" } });
  assert.deepEqual([mapDetail.title, mapDetail.location, mapDetail.category, mapDetail.practical?.slice(0, 2)], [exploreDetail.title, exploreDetail.location, exploreDetail.category, exploreDetail.practical?.slice(0, 2)]);
});

test("context keys isolate trip, stop, product, day and part against stale detail", () => {
  const base = { tripId: "trip", stopId: "stop", resultId: "result", providerProductId: "product", activeDayId: "day" };
  const morning = recommendationDetailContextKey({ ...base, activeDayPart: "morning" });
  const evening = recommendationDetailContextKey({ ...base, activeDayPart: "evening" });
  const otherProduct = recommendationDetailContextKey({ ...base, providerProductId: "other", activeDayPart: "morning" });
  assert.notEqual(morning, evening);
  assert.notEqual(morning, otherProduct);
});

test("a forced full-day slot request stays day-level and preserves existing rows", () => {
  const trip = tripFixture();
  const result = fullDayResult(trip);
  const next = scheduleItineraryIdea(trip, result.idea, "day-busy", "morning");
  assert.deepEqual(next.planItems.find((day) => day.id === "day-busy")?.notes.slice(0, 2), ["Museum visit", "Market walk"]);
  assert.equal(next.brief.itineraryIdeas?.find((idea) => idea.providerProductId === "CUSCO-11H")?.dayPart, null);
});

test("a six-hour activity uses extended day-level reasoning rather than standard-slot copy", () => {
  const trip = tripFixture();
  const result = exploreResultForActivity(trip.stops[0]!, {
    provider: "viator", source: "viator", providerProductId: "CUSCO-6H", title: "Six-hour valley visit",
    destination: { canonicalPlaceId: "cusco", label: "Cusco" }, duration: { fixedMinutes: 360 },
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T00:00:00.000Z" },
  }, trip);
  const detail = recommendationDetailForExploreResult({ trip, result, context: { surface: "itinerary", activeDayId: "day-open", activeDayPart: null } });
  assert.match(detail.whyFit!, /needs a large part of Day 1/i);
  assert.match(detail.whyFit!, /kept at day level/i);
  assert.doesNotMatch(detail.whyFit!, /Choose a part of day/i);
  const scheduled = scheduleItineraryIdea(trip, result.idea, "day-open", "afternoon");
  assert.equal(scheduled.brief.itineraryIdeas?.find((idea) => idea.id === result.idea.id)?.dayPart, null);
});

test("all entry surfaces use one presentation and one canonical mutation path", () => {
  const explore = readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../components/easyt/itinerary-item-detail.tsx", import.meta.url), "utf8");
  const planner = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.tsx", import.meta.url), "utf8");
  assert.match(explore, /recommendationDetailForExploreResult/);
  assert.match(itinerary, /recommendationDetailForExploreResult/);
  assert.match(itinerary, /selectedResultId=\{selectedRecommendation\?\.identity \?\? null\}/);
  assert.match(itinerary, /onSelectedDetailRefresh/);
  assert.match(itinerary, /className=\{styles\.contextRailBody\} hidden=\{Boolean\(selectedDetail\)\}/);
  assert.match(map, /recommendationDetailForMapResult/);
  assert.match(explore, /useTripShellMutation/);
  assert.match(itinerary, /useOptionalTripShellMutation/);
  assert.match(map, /canonicalMutation/);
  assert.doesNotMatch(detail, /mutateTrip|saveItineraryIdea|scheduleItineraryIdea/);
  assert.match(planner, /activityAllowsDayPart/);
  assert.match(planner, /Needs a large part of the day/);
  assert.match(detail, /onClick=\{\(\) => setMapPending\(true\)\}/);
  assert.match(detail, /mapPending \? "Opening map…" : "View on map"/);
  assert.doesNotMatch(map, /\"Nearby\"|category} near/);
});

test("Recommendation Detail stories cover variants, states, surfaces and compact viewports", () => {
  const stories = readFileSync(new URL("../components/easyt/recommendation-detail.stories.tsx", import.meta.url), "utf8");
  for (const name of ["ExploreRichActivity", "ExploreSparseActivity", "OpenDayElevenHourTour", "BusyDayElevenHourTourSoftConflict", "ViatorCommercial", "RestaurantWithSourcedImage", "RestaurantWithoutImage", "SparseRestaurant", "SavedRecommendation", "AlreadyPlanned", "MapEmbedded", "ItinerarySelectedDay", "MapHandoffPending", "Mobile320", "Mobile390", "Mobile430"]) {
    assert.match(stories, new RegExp(`export const ${name}`));
  }
});
