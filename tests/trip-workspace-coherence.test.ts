import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { itineraryIdeaForActivityInventory, type ActivityInventoryItem } from "../lib/easyt/activity-inventory.ts";
import { composeItineraryDay } from "../lib/easyt/itinerary-day-composition.ts";
import {
  assignItineraryIdeaDayPart,
  ideaStateForPlace,
  itineraryIdeaForLocalPlace,
  removeItineraryIdea,
  saveItineraryIdea,
  scheduleItineraryIdea,
} from "../lib/easyt/itinerary-ideas.ts";
import {
  dedupeExploreResults,
  exploreResultForIdea,
  exploreResultForLocalPlace,
  exploreResultForPlace,
  exploreResultState,
} from "../lib/easyt/explore.ts";
import {
  mapResultForDiscoveryPlace,
  mapResultForLocalPlace,
  mapResultSelectionId,
  mapResultSelectionIdForIdea,
  mergeMapResults,
  projectPersistedMapResults,
} from "../lib/easyt/map-result-selection.ts";
import { insertItineraryActivity, moveItineraryActivityToDay } from "../lib/easyt/itinerary-mutations.ts";
import { mapWorkspaceHref, parseMapWorkspaceTarget } from "../lib/easyt/trip-workspace-links.ts";
import type { EasyTTrip, PlanItem, TripStop } from "../lib/easyt/trip.ts";

const stop = (id: string, order: number, name: string, coordinates: [number, number]): TripStop => ({
  id,
  order,
  name,
  country: "Greece",
  longitude: coordinates[0],
  latitude: coordinates[1],
  arrivalDate: `2026-09-${String(10 + order).padStart(2, "0")}`,
  departureDate: `2026-09-${String(12 + order).padStart(2, "0")}`,
  nights: 2,
});

const day = (dayNumber: number, stopId: string): PlanItem => ({
  id: `day-${dayNumber}`,
  stopId,
  dayNumber,
  date: `2026-09-${String(dayNumber).padStart(2, "0")}`,
  type: "activity",
  title: `Explore on Day ${dayNumber}`,
  reason: "Keep the day coherent.",
  notes: [],
  startsAt: null,
  endsAt: null,
  bookingUrl: null,
  latitude: null,
  longitude: null,
});

function tripFixture(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "coherence-athens-naxos-athens",
    ownerId: "traveller-a",
    title: "Athens, Naxos and Athens",
    status: "draft",
    startDate: "2026-09-06",
    endDate: "2026-09-09",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      customActivities: {},
      mapPins: [],
      itineraryIdeas: [],
      bookings: [],
    },
    stops: [
      stop("athens-outbound", 0, "Athens", [23.7275, 37.9838]),
      stop("naxos", 1, "Naxos", [25.3764, 37.1036]),
      stop("athens-return", 2, "Athens", [23.7275, 37.9838]),
    ],
    legs: [],
    planItems: [
      day(6, "athens-outbound"),
      day(7, "athens-outbound"),
      day(8, "naxos"),
      day(9, "athens-return"),
    ],
    recommendations: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "revision-1",
  };
}

const lycabettusPlace = {
  id: "mount-lycabettus",
  title: "Mount Lycabettus",
  area: "Athens",
  type: "Viewpoint",
  tags: ["outdoors"],
  description: "A hilltop viewpoint above central Athens.",
  image: "/journey/immersive/route-italy-greece-1536.webp",
  sourceUrl: "https://en.wikipedia.org/wiki/Mount_Lycabettus",
  coordinates: [23.7438, 37.9819] as [number, number],
  qualityScore: 10,
};

const localRestaurant = {
  id: "athens-taverna-1",
  name: "Athens neighbourhood taverna",
  address: "Koukaki, Athens",
  category: "Greek restaurant",
  coordinates: [23.7247, 37.9647] as [number, number],
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=37.9647%2C23.7247",
  provider: "google-places" as const,
};

test("Explore → Itinerary → Map preserves one Mount Lycabettus identity, placement and pin through reload", () => {
  const source = tripFixture();
  const result = exploreResultForPlace(source.stops[0]!, lycabettusPlace);
  const scheduled = scheduleItineraryIdea(source, result.idea, "day-6", "midday");

  const exploreState = exploreResultState(scheduled, result);
  assert.equal(exploreState.state, "planned");
  assert.equal(exploreState.day.dayNumber, 6);
  assert.equal(exploreState.idea.id, result.idea.id);
  assert.equal(exploreState.idea.dayPart, "midday");
  assert.equal(scheduleItineraryIdea(scheduled, result.idea, "day-6", "midday"), scheduled, "duplicate Add fails closed");

  const persistedResult = exploreResultForIdea(scheduled, scheduled.brief.itineraryIdeas![0]!)!;
  assert.equal(persistedResult.identity, result.identity);
  assert.equal(dedupeExploreResults([persistedResult, result]).length, 1);

  const itinerary = composeItineraryDay(scheduled, "day-6")!;
  assert.equal(itinerary.planned.midday.length, 1);
  const plannedItem = itinerary.planned.midday[0]!;
  assert.equal(plannedItem.id, result.idea.id);
  assert.equal(plannedItem.title, lycabettusPlace.title);
  assert.equal(plannedItem.category, "activity");
  assert.equal(plannedItem.image, lycabettusPlace.image);
  assert.equal(plannedItem.area, lycabettusPlace.area);
  assert.equal(plannedItem.placeId, lycabettusPlace.id);

  const projected = projectPersistedMapResults(scheduled);
  assert.equal(projected.results.length, 1);
  assert.equal(projected.plannerPins.length, 0, "the companion itinerary pin is not emitted twice");
  assert.deepEqual(projected.results[0]?.coordinates, lycabettusPlace.coordinates);
  assert.equal(projected.results[0]?.selectionId, mapResultSelectionIdForIdea(result.idea.id));
  assert.equal(projected.results[0]?.stopId, "athens-outbound");
  assert.equal(projected.results[0]?.dayNumber, 6);
  assert.equal(projected.results[0]?.dayPart, "midday");

  const reloaded = JSON.parse(JSON.stringify(scheduled)) as EasyTTrip;
  assert.deepEqual(projectPersistedMapResults(reloaded), projected);
  assert.equal(exploreResultState(reloaded, result).state, "planned");
  assert.equal(composeItineraryDay(reloaded, "day-6")?.planned.midday.length, 1);
});

test("saved-for-later remains unscheduled in Itinerary and projects once as distinguishable Map truth", () => {
  const source = tripFixture();
  const result = exploreResultForPlace(source.stops[0]!, lycabettusPlace);
  const saved = saveItineraryIdea(source, result.idea);

  assert.equal(exploreResultState(saved, result).state, "saved");
  assert.equal(composeItineraryDay(saved, "day-6")?.planned.midday.length, 0);
  assert.equal(saved.planItems.every((item) => !item.notes.includes(result.title)), true);
  const projection = projectPersistedMapResults(JSON.parse(JSON.stringify(saved)) as EasyTTrip);
  assert.equal(projection.results.length, 1);
  assert.equal(projection.results[0]?.state, "saved");
  assert.equal(projection.results[0]?.dayNumber, null);
  assert.equal(projection.plannerPins.length, 0);
});

test("Map restaurant Add uses the canonical idea path and projects scheduled state back into Explore", () => {
  const source = tripFixture();
  const result = exploreResultForLocalPlace(source.stops[0]!, localRestaurant);
  const mapIdea = itineraryIdeaForLocalPlace("athens-outbound", localRestaurant);
  assert.equal(mapIdea.id, result.idea.id);

  const scheduled = scheduleItineraryIdea(source, mapIdea, "day-6", "midday");
  assert.equal(exploreResultState(scheduled, result).state, "planned");
  assert.equal(composeItineraryDay(scheduled, "day-6")?.planned.midday[0]?.category, "restaurant");

  const persisted = projectPersistedMapResults(scheduled);
  assert.equal(persisted.results.length, 1);
  assert.equal(persisted.results[0]?.kind, "eat");
  assert.equal(persisted.results[0]?.state, "scheduled");
  assert.equal(persisted.results[0]?.stopId, "athens-outbound");
  const transient = mapResultForLocalPlace(localRestaurant, "eat", { stopId: "athens-outbound", dayNumber: 6 });
  const merged = mergeMapResults(persisted.results, [transient], 6);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.selectionId, mapResultSelectionIdForIdea(mapIdea.id));

  const movedPart = assignItineraryIdeaDayPart(scheduled, mapIdea.id, "afternoon");
  assert.equal(exploreResultState(movedPart, result).idea?.dayPart, "afternoon");
  assert.equal(projectPersistedMapResults(movedPart).results[0]?.dayPart, "afternoon");

  const secondRestaurant = { ...localRestaurant, id: "athens-taverna-2", name: "A second Athens taverna", coordinates: [23.729, 37.969] as [number, number] };
  const withSecond = scheduleItineraryIdea(movedPart, itineraryIdeaForLocalPlace("athens-outbound", secondRestaurant), "day-6", "evening");
  assert.equal(withSecond.brief.itineraryIdeas?.filter((idea) => idea.category === "restaurant").length, 2);
  assert.equal(projectPersistedMapResults(withSecond).results.filter((item) => item.kind === "eat").length, 2);

  const reloaded = JSON.parse(JSON.stringify(withSecond)) as EasyTTrip;
  const removed = removeItineraryIdea(reloaded, mapIdea.id);
  assert.equal(exploreResultState(removed, result).state, "available");
  assert.equal(composeItineraryDay(removed, "day-6")?.planned.afternoon.length, 0);
  assert.equal(projectPersistedMapResults(removed).results.filter((item) => item.kind === "eat").length, 1);
});

test("traveller-authored activities move between canonical days without a second Map owner", () => {
  const source = tripFixture();
  const inserted = insertItineraryActivity(source, 6, 0, "Walk the National Garden", "midday");
  assert.equal(inserted.changed, true);
  const moved = moveItineraryActivityToDay(inserted.trip, { dayNumber: 6, noteIndex: 0, title: "Walk the National Garden" }, 7, 0);
  assert.equal(moved.changed, true);
  assert.deepEqual(moved.trip.planItems.find((item) => item.id === "day-6")?.notes, []);
  assert.deepEqual(moved.trip.planItems.find((item) => item.id === "day-7")?.notes, ["Walk the National Garden"]);
  assert.deepEqual(moved.trip.planItems.find((item) => item.id === "day-7")?.noteDayParts, ["midday"]);
  assert.deepEqual(moved.trip.brief.customActivities?.[6], []);
  assert.deepEqual(moved.trip.brief.customActivities?.[7], ["Walk the National Garden"]);
  assert.equal(projectPersistedMapResults(moved.trip).results.length, 0, "authored text does not invent a location");
  assert.deepEqual(JSON.parse(JSON.stringify(moved.trip)), moved.trip);
});

test("day-part and same-stop day moves update every projection without changing place identity", () => {
  const source = tripFixture();
  const result = exploreResultForPlace(source.stops[0]!, lycabettusPlace);
  const midday = scheduleItineraryIdea(source, result.idea, "day-6", "midday");
  const evening = assignItineraryIdeaDayPart(midday, result.idea.id, "evening");
  assert.equal(exploreResultState(evening, result).idea?.dayPart, "evening");
  assert.equal(composeItineraryDay(evening, "day-6")?.planned.evening[0]?.id, result.idea.id);
  const eveningMap = projectPersistedMapResults(evening).results[0]!;
  assert.equal(eveningMap.dayPart, "evening");

  const daySeven = scheduleItineraryIdea(evening, result.idea, "day-7", "evening");
  assert.equal(composeItineraryDay(daySeven, "day-6")?.planned.evening.length, 0);
  assert.equal(composeItineraryDay(daySeven, "day-7")?.planned.evening[0]?.id, result.idea.id);
  const movedMap = projectPersistedMapResults(daySeven);
  assert.equal(movedMap.results.length, 1);
  assert.equal(movedMap.results[0]?.selectionId, eveningMap.selectionId);
  assert.deepEqual(movedMap.results[0]?.coordinates, eveningMap.coordinates);
  assert.equal(movedMap.results[0]?.dayNumber, 7);
  assert.equal(daySeven.brief.mapPins?.length, 1);
});

test("removing a scheduled item clears all projections but not its discovery inventory", () => {
  const source = tripFixture();
  const result = exploreResultForPlace(source.stops[0]!, lycabettusPlace);
  const scheduled = scheduleItineraryIdea(source, result.idea, "day-6", "midday");
  const removed = removeItineraryIdea(scheduled, result.idea.id);

  assert.equal(composeItineraryDay(removed, "day-6")?.planned.midday.length, 0);
  assert.equal(projectPersistedMapResults(removed).results.length, 0);
  assert.equal(exploreResultState(removed, result).state, "available");
  assert.equal(result.title, "Mount Lycabettus", "the source discovery result remains available");
});

test("commercial inventory keeps product provenance separate from booking and never invents a Map marker", () => {
  const item: ActivityInventoryItem = {
    provider: "viator",
    source: "viator",
    providerProductId: "ATHENS-TICKET-1",
    title: "Acropolis and Parthenon entry ticket",
    destination: { canonicalPlaceId: "athens", label: "Athens" },
    productUrl: "https://www.viator.com/tours/Athens/ATHENS-TICKET-1?pid=approved",
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T00:00:00.000Z" },
    rating: 4.8,
    reviewCount: 1248,
  };
  const source = tripFixture();
  const idea = itineraryIdeaForActivityInventory("athens-outbound", item);
  const scheduled = scheduleItineraryIdea(source, idea, "day-6", "afternoon");

  assert.equal(scheduled.brief.itineraryIdeas?.[0]?.providerProductId, item.providerProductId);
  assert.deepEqual(scheduled.brief.itineraryIdeas?.[0]?.providerMetadata?.provenance, item.provenance);
  assert.equal(scheduled.brief.bookings?.length, 0, "planning and affiliate handoff are not booking truth");
  assert.equal(composeItineraryDay(scheduled, "day-6")?.planned.afternoon.length, 1);
  assert.deepEqual(projectPersistedMapResults(scheduled).results, [], "missing coordinates stay unmapped");
});

test("repeated Athens stops retain distinct organic and provider identities in Explore and Map", () => {
  const source = tripFixture();
  const outbound = exploreResultForPlace(source.stops[0]!, lycabettusPlace);
  const returned = exploreResultForPlace(source.stops[2]!, lycabettusPlace);
  assert.notEqual(outbound.identity, returned.identity);
  assert.notEqual(outbound.idea.id, returned.idea.id);

  const both = saveItineraryIdea(saveItineraryIdea(source, outbound.idea), returned.idea);
  assert.equal(ideaStateForPlace(both, "athens-outbound", lycabettusPlace.id).idea?.stopId, "athens-outbound");
  assert.equal(ideaStateForPlace(both, "athens-return", lycabettusPlace.id).idea?.stopId, "athens-return");
  const projected = projectPersistedMapResults(both);
  assert.equal(projected.results.length, 2);
  assert.equal(new Set(projected.results.map((result) => result.selectionId)).size, 2);

  const transientReturn = mapResultForDiscoveryPlace(lycabettusPlace, { stopId: "athens-return", dayNumber: 9 })!;
  const merged = mergeMapResults(projected.results, [transientReturn], 9);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((result) => result.stopId === "athens-return")?.selectionId, mapResultSelectionIdForIdea(returned.idea.id));

  const providerItem: ActivityInventoryItem = {
    provider: "viator",
    source: "viator",
    providerProductId: "ATHENS-RETURN",
    title: "Athens neighbourhood walk",
    destination: { canonicalPlaceId: "athens", label: "Athens" },
    productUrl: "https://www.viator.com/tours/Athens/ATHENS-RETURN?pid=approved",
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T00:00:00.000Z" },
  };
  const firstVisit = itineraryIdeaForActivityInventory("athens-outbound", providerItem);
  const returnVisit = itineraryIdeaForActivityInventory("athens-return", providerItem);
  const providerStops = saveItineraryIdea(saveItineraryIdea(source, firstVisit), returnVisit);
  assert.deepEqual(providerStops.brief.itineraryIdeas?.map((idea) => idea.stopId), ["athens-outbound", "athens-return"]);
});

test("explicit Map handoffs carry exact item identity while generic tab links do not", () => {
  const trip = tripFixture();
  const selectionId = mapResultSelectionId("see", lycabettusPlace.id, "athens-outbound");
  const href = mapWorkspaceHref(trip.id, "athens-outbound", "see", 6, selectionId);
  const url = new URL(href, "https://morrovia.example");
  assert.equal(url.searchParams.get("result"), selectionId);
  assert.deepEqual(parseMapWorkspaceTarget(trip, url.searchParams), {
    stopId: "athens-outbound",
    mode: "see",
    dayNumber: 6,
    resultSelectionId: selectionId,
  });

  const generic = new URL(mapWorkspaceHref(trip.id), "https://morrovia.example");
  assert.equal(generic.searchParams.get("result"), null);
  assert.equal(parseMapWorkspaceTarget(trip, new URLSearchParams("stop=athens-return&day=6&result=malformed value")).dayNumber, null);
  assert.equal(parseMapWorkspaceTarget(trip, new URLSearchParams("stop=athens-return&day=6&result=malformed value")).resultSelectionId, null);
});

test("production handoffs, Map mutations and unavailable-location language use the shared coherence owners", () => {
  const explore = readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  const finder = readFileSync(new URL("../components/journey-local-finder.tsx", import.meta.url), "utf8");
  const exploreStories = readFileSync(new URL("../components/easyt/trip-explore-workspace.stories.tsx", import.meta.url), "utf8");
  const mapStories = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");

  assert.match(explore, /mapResultSelectionIdForIdea\(state\.idea\.id\)/);
  assert.match(itinerary, /mapResultSelectionIdForIdea\(selectedActivity\.id\)/);
  assert.match(map, /itineraryIdeaForLocalPlace\(selectedPlanItem\.stopId, venue\)/);
  assert.match(map, /if \(!recovery\.stored\) \{[\s\S]*return false;[\s\S]*setCustomTrip\(next\)/);
  assert.match(map, /This change was not applied; your existing plan remains unchanged/);
  assert.match(map, /return moveItineraryActivityToDay/);
  assert.match(explore, /const mapHref = selectedResult\.coordinates[\s\S]*: null;/);
  assert.match(itinerary, /No trustworthy coordinates are attached to this item yet/);
  assert.match(finder, /Add to Day \$\{dayNumber\}/);
  assert.doesNotMatch(finder, /"Add to today"/);
  assert.match(exploreStories, /RepeatedAthensOutbound/);
  assert.match(exploreStories, /RepeatedAthensReturnMobile390/);
  assert.match(mapStories, /ScheduledResultHandoff/);
  assert.match(mapStories, /selectedMapResultId: "idea:tour-idea-qorikancha"/);
});
