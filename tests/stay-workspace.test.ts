import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { removeMappedStayForStop, selectMappedStayForStop, stayBookingForStop } from "../lib/easyt/accommodation.ts";
import { accommodationInventoryPayload, type JourneyLocalPlace } from "../lib/easyt/local-place.ts";
import { mapResultForLocalPlace, mapResultSelectionId } from "../lib/easyt/map-result-selection.ts";
import { recommendationDetailForMapResult, recommendationDetailForStayResult } from "../lib/easyt/recommendation-detail.ts";
import { isStayCandidate, rankedStayShortlist, stayAreaGuidance, stayCandidateFit, stayWorkspaceContext } from "../lib/easyt/stay-workspace.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function tripFixture(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "stay-trip",
    ownerId: null,
    title: "Tokyo return",
    status: "draft",
    startDate: "2027-03-03",
    endDate: "2027-03-11",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Food and culture",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      itineraryIdeas: [
        { id: "idea-1", stopId: "tokyo-first", dayId: "day-1", dayPart: "morning", placeId: "museum", title: "Museum", category: "activity", coordinates: [139.7005, 35.6897], description: "", source: "personalised-recommendation", reasons: [] },
        { id: "idea-2", stopId: "tokyo-first", dayId: "day-2", dayPart: "afternoon", placeId: "garden", title: "Garden", category: "activity", coordinates: [139.706, 35.693], description: "", source: "personalised-recommendation", reasons: [] },
        { id: "saved-only", stopId: "tokyo-first", placeId: "later", title: "Saved only", category: "activity", coordinates: [140.1, 36.1], description: "", source: "personalised-recommendation", reasons: [] },
        { id: "idea-return", stopId: "tokyo-return", dayId: "day-8", dayPart: "morning", placeId: "market", title: "Market", category: "restaurant", coordinates: [139.77, 35.68], description: "", source: "personalised-recommendation", reasons: [] },
      ],
    },
    stops: [
      { id: "tokyo-first", order: 0, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-03-03", departureDate: "2027-03-06", nights: 3 },
      { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-03-06", departureDate: "2027-03-09", nights: 3 },
      { id: "tokyo-return", order: 2, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-03-09", departureDate: "2027-03-11", nights: 2 },
    ],
    legs: [],
    planItems: [
      { id: "day-1", stopId: "tokyo-first", dayNumber: 1, date: "2027-03-03", type: "activity", title: "Tokyo", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-2", stopId: "tokyo-first", dayNumber: 2, date: "2027-03-04", type: "activity", title: "Tokyo", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-4", stopId: "kyoto", dayNumber: 4, date: "2027-03-06", type: "activity", title: "Kyoto", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-8", stopId: "tokyo-return", dayNumber: 8, date: "2027-03-09", type: "activity", title: "Tokyo", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    ],
    recommendations: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

const mappedHotel = (overrides: Partial<JourneyLocalPlace> = {}): JourneyLocalPlace => ({
  id: "google-hotel-a",
  name: "Hotel A",
  address: "Shinjuku, Tokyo",
  category: "Hotel",
  coordinates: [139.704, 35.691],
  mapsUrl: "https://maps.example/hotel-a",
  availability: "check",
  provider: "google-places",
  rating: 4.5,
  reviewCount: 800,
  ...overrides,
});

test("selected stop controls exact nights, dates and repeated-destination identity", () => {
  const trip = tripFixture();
  const first = stayWorkspaceContext(trip, "tokyo-first")!;
  const returned = stayWorkspaceContext(trip, "tokyo-return")!;
  assert.equal(first.nights, 3);
  assert.equal(first.dateLabel, "3 Mar–6 Mar");
  assert.equal(returned.nights, 2);
  assert.equal(returned.dateLabel, "9 Mar–11 Mar");
  assert.notEqual(first.key, returned.key);
  assert.equal(first.plannedCoordinates.length, 2, "saved-only ideas do not affect the planned cluster");
  assert.equal(returned.plannedCoordinates.length, 1);
});

test("area guidance uses mapped itinerary geometry and degrades without enough evidence", () => {
  const trip = tripFixture();
  const first = stayWorkspaceContext(trip, "tokyo-first")!;
  const returned = stayWorkspaceContext(trip, "tokyo-return")!;
  assert.deepEqual(stayAreaGuidance(first), {
    kind: "cluster",
    title: "Best placed for your current plans",
    reason: "2 planned places form a mapped cluster in Tokyo. Stay options are ranked partly by their distance from its centre.",
  });
  assert.equal(stayAreaGuidance(returned), null);
  assert.doesNotMatch(JSON.stringify(stayAreaGuidance(first)), /nightlife|quiet|safe|walkable|minutes/i);
});

test("shortlist rejects malformed/non-stays, dedupes exact properties and keeps similar distinct hotels", () => {
  const context = stayWorkspaceContext(tripFixture(), "tokyo-first")!;
  const duplicate = mappedHotel({ id: "osm-duplicate", coordinates: [139.70405, 35.69105] });
  const similar = mappedHotel({ id: "google-hotel-annex", name: "Hotel A Annex", coordinates: [139.705, 35.691] });
  const live = mappedHotel({ id: "booking-42", name: "Live Hotel", provider: "booking-demand", providerProductId: "42", availability: "available", price: { total: 420, currency: "GBP" } });
  const restaurant = mappedHotel({ id: "restaurant", name: "Restaurant", category: "Restaurant" });
  assert.equal(isStayCandidate(restaurant), false);
  const shortlist = rankedStayShortlist([mappedHotel(), duplicate, similar, live, restaurant], context, 6);
  assert.equal(shortlist[0]?.id, "booking-42");
  assert.equal(shortlist.some((place) => place.id === "osm-duplicate"), false);
  assert.equal(shortlist.some((place) => place.id === "google-hotel-annex"), true);
  assert.ok(shortlist.length <= 6);
  const malformedInventory = accommodationInventoryPayload({ properties: [live, { ...live, id: "bad-price", price: { total: -1, currency: "GBP" } }, { ...live, id: "bad-rating", rating: 8 }] });
  assert.deepEqual(malformedInventory.properties.map((place) => place.id), ["booking-42"]);
  assert.equal(malformedInventory.unavailable, true);
});

test("mapped and live details distinguish check-required availability from current provider truth", () => {
  const trip = tripFixture();
  const context = stayWorkspaceContext(trip, "tokyo-first")!;
  const base = recommendationDetailForStayResult({ trip, place: mappedHotel(), stayContext: context, surface: "stay" });
  const livePlace = mappedHotel({ id: "booking-42", provider: "booking-demand", providerProductId: "42", availability: "available", price: { total: 420, currency: "GBP" }, cancellation: "free_cancellation" });
  const live = recommendationDetailForStayResult({ trip, place: livePlace, stayContext: context, surface: "stay" });
  assert.equal(base.price, null);
  assert.match(base.practical!.find((fact) => fact.label === "Availability")!.value, /Check current availability/);
  assert.equal(live.price, "£420.00");
  assert.equal(live.providerProductId, "42");
  assert.match(live.practical!.find((fact) => fact.label === "Availability")!.value, /current provider response/);
  assert.doesNotMatch(JSON.stringify(live), /breakfast|pool|gym|wifi|room type|travel time/i);
});

test("Stay workspace and Map Stay project the same shared property identity", () => {
  const trip = tripFixture();
  const context = stayWorkspaceContext(trip, "tokyo-first")!;
  const place = mappedHotel();
  const stayDetail = recommendationDetailForStayResult({ trip, place, stayContext: context, surface: "stay" });
  const mapDetail = recommendationDetailForMapResult({ trip, result: mapResultForLocalPlace(place, "stay", { stopId: "tokyo-first", dayNumber: 1 }), context: { surface: "map" } });
  assert.deepEqual([mapDetail.id, mapDetail.title, mapDetail.location, mapDetail.kind], [stayDetail.id, stayDetail.title, stayDetail.location, stayDetail.kind]);
  assert.equal(mapResultSelectionId("stay", place.id, "tokyo-first"), "result:stay:tokyo-first:google-hotel-a");
});

test("saving a stay is stop-scoped and never schedules it as a daypart activity", () => {
  const trip = tripFixture();
  const first = selectMappedStayForStop(trip, "tokyo-first", mappedHotel());
  const returned = selectMappedStayForStop(first, "tokyo-return", mappedHotel({ id: "return-hotel", name: "Return Hotel" }));
  assert.equal(stayBookingForStop(returned, returned.stops[0]!)?.title, "Hotel A");
  assert.equal(stayBookingForStop(returned, returned.stops[2]!)?.title, "Return Hotel");
  assert.equal(returned.brief.customActivities, undefined);
  assert.ok(returned.planItems.every((day) => day.notes.length === 0));
  assert.equal(returned.brief.mapPins?.filter((pin) => pin.category === "stay").length, 2);
  const removed = removeMappedStayForStop(returned, "tokyo-first", mappedHotel());
  assert.equal(stayBookingForStop(removed, removed.stops[0]!), undefined);
  assert.equal(stayBookingForStop(removed, removed.stops[2]!)?.title, "Return Hotel");
});

test("fit copy exposes straight-line geometry without inventing neighbourhood or travel-time claims", () => {
  const context = stayWorkspaceContext(tripFixture(), "tokyo-first")!;
  const fit = stayCandidateFit(mappedHotel(), context);
  assert.match(fit, /km straight-line/);
  assert.match(fit, /2 mapped plans/);
  assert.doesNotMatch(fit, /minutes|near your hotel|easy transport|perfect|nightlife|quiet|safe/i);
});

test("Stay production surface reuses shared owners and keeps commercial action secondary", () => {
  const workspace = readFileSync(new URL("../components/easyt/trip-stay-workspace.tsx", import.meta.url), "utf8");
  const finder = readFileSync(new URL("../components/journey-local-finder.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /<JourneyStopNavigation/);
  assert.match(workspace, /<JourneyLocalFinder/);
  assert.match(workspace, /recommendationDetailForStayResult/);
  assert.match(workspace, /<ItineraryItemDetail/);
  assert.match(workspace, /useTripShellMutation/);
  assert.match(workspace, /selectMappedStayForStop/);
  assert.doesNotMatch(workspace, /useTripMutationPersistence|OpenAI|LLM|Best Value|More comfortable/);
  assert.match(workspace, /key=\{context\.key\}/);
  assert.match(finder, /controller\.abort\(\)/);
  assert.match(finder, /if \(!active\) return/);
  assert.doesNotMatch(finder, /label: "Central"|label: "Character"|label: "Comfort"/);
  assert.match(map, /const shapeDayTabs: ShapeDayTab\[\] = \["plan", "stay", "eat", "see"\]/);
  assert.match(map, /const selectedRecommendationDetail = customTrip && selectedLocalPlace\s*\? recommendationDetailForMapResult/);
  assert.doesNotMatch(map, /const selectedRecommendationDetail = customTrip && selectedLocalPlace && selectedLocalPlace\.kind !== "stay"/);
});

test("Stay stories cover the required evidence, provider and compact viewport matrix", () => {
  const stories = readFileSync(new URL("../components/easyt/trip-stay-workspace.stories.tsx", import.meta.url), "utf8");
  for (const story of [
    "TokyoThreeNightStay", "RepeatedTokyoStay", "StrongAreaEvidence", "NoNeighbourhoodFallback",
    "SixOptionShortlist", "MappedResultsBookingLoading", "BookingEnriched", "ProviderUnavailableMappedBaseReady",
    "NoPropertyImage", "SparsePropertyDetail", "RichPropertyDetail", "Mobile320", "Mobile390", "Mobile430",
  ]) assert.match(stories, new RegExp(`export const ${story}`));
  for (const viewport of ["morrovia320", "morrovia390", "morrovia430"]) assert.match(stories, new RegExp(viewport));
  assert.doesNotMatch(stories, /https:\/\/images\.unsplash|generic Tokyo image/i);
});
