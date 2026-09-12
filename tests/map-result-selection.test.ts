import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { addMappedPlaceToTrip, removeMappedPlaceFromTrip } from "../lib/easyt/map-place-itinerary.ts";
import { saveItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import {
  mapResultForDiscoveryPlace,
  mapResultForLocalPlace,
  mergeMapResults,
  projectPersistedMapResults,
} from "../lib/easyt/map-result-selection.ts";
import type { EasyTTrip, ItineraryIdea } from "../lib/easyt/trip.ts";

function tripFixture(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "selection-trip",
    ownerId: null,
    title: "Selection trip",
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    travellers: 2,
    currency: "GBP",
    status: "draft",
    stops: [{ id: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 }],
    legs: [],
    planItems: [{ id: "tokyo-day-1", stopId: "tokyo", dayNumber: 1, date: "2026-10-01", type: "open", title: "Tokyo", reason: "Open day", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, mapPins: [], itineraryIdeas: [] },
    recommendations: [],
  } as EasyTTrip;
}

const tokyoStayA = {
  id: "tokyo-hotel-a",
  name: "Tokyo Stay A",
  address: "1 Tokyo",
  category: "hotel",
  coordinates: [139.701, 35.681] as [number, number],
  mapsUrl: "https://maps.example/a",
  provider: "booking-demand" as const,
};
const tokyoStayB = { ...tokyoStayA, id: "tokyo-hotel-b", name: "Tokyo Stay B", coordinates: [139.711, 35.691] as [number, number], mapsUrl: "https://maps.example/b" };

test("rapid Stay and Eat result switching keeps the latest exact result as canonical selection", () => {
  const selections = [
    mapResultForLocalPlace(tokyoStayA, "stay"),
    mapResultForLocalPlace(tokyoStayB, "stay"),
    mapResultForLocalPlace({ ...tokyoStayA, id: "tokyo-eat-a", name: "Tokyo Eat A" }, "eat"),
  ];
  let selected = null as (typeof selections)[number] | null;
  for (const result of selections) selected = result;
  assert.equal(selected?.sourceId, "tokyo-eat-a");
  assert.equal(selected?.kind, "eat");
  assert.deepEqual(selected?.coordinates, tokyoStayA.coordinates);
});

test("a saved stay projects once at trustworthy coordinates before and after reload", () => {
  const saved = addMappedPlaceToTrip(tripFixture(), tokyoStayA, "stay", 1, "tokyo");
  const first = projectPersistedMapResults(saved);
  assert.equal(first.results.length, 1);
  assert.equal(first.results[0]?.kind, "stay");
  assert.deepEqual(first.results[0]?.coordinates, tokyoStayA.coordinates);
  assert.equal(first.plannerPins.length, 0, "the same saved stay is not also emitted as a generic pin");

  const reloaded = JSON.parse(JSON.stringify(saved)) as EasyTTrip;
  const afterReload = projectPersistedMapResults(reloaded);
  assert.deepEqual(afterReload.results, first.results);
  assert.equal(new Set(afterReload.results.map((result) => result.selectionId)).size, 1);
});

test("provider Stay and Eat results merge with their saved projections without duplicate markers", () => {
  for (const [kind, category] of [["stay", "stay"], ["eat", "restaurant"]] as const) {
    const place = kind === "stay" ? tokyoStayA : { ...tokyoStayA, id: "tokyo-restaurant-a", name: "Tokyo Restaurant A" };
    const saved = addMappedPlaceToTrip(tripFixture(), place, category, 1, "tokyo");
    const persisted = projectPersistedMapResults(saved);
    const merged = mergeMapResults(persisted.results, [mapResultForLocalPlace(place, kind)], 1);
    assert.equal(merged.length, 1, kind);
    assert.equal(merged[0]?.sourceId, place.id, kind);
    assert.equal(merged[0]?.state, "saved", kind);
    assert.deepEqual(merged[0]?.coordinates, place.coordinates, kind);
  }
});

test("Eat keeps every distinct canonical restaurant across projection and reload", () => {
  const restaurantA = { ...tokyoStayA, id: "tokyo-restaurant-a", name: "Tokyo Restaurant A", provider: "google-places" as const };
  const restaurantB = { ...tokyoStayB, id: "tokyo-restaurant-b", name: "Tokyo Restaurant B", provider: "google-places" as const };
  const first = addMappedPlaceToTrip(tripFixture(), restaurantA, "restaurant", 1, "tokyo");
  const saved = addMappedPlaceToTrip(first, restaurantB, "restaurant", 1, "tokyo");
  assert.equal(saved.brief.mapPins?.filter((pin) => pin.category === "restaurant").length, 2);
  assert.deepEqual(saved.brief.customActivities?.[1], [restaurantA.name, restaurantB.name]);
  assert.equal(addMappedPlaceToTrip(saved, restaurantA, "restaurant", 1, "tokyo"), saved, "stable identity deduplicates only the same restaurant");

  const projection = projectPersistedMapResults(JSON.parse(JSON.stringify(saved)) as EasyTTrip);
  const restaurants = projection.results.filter((result) => result.kind === "eat");
  assert.equal(restaurants.length, 2);
  assert.equal(new Set(restaurants.map((result) => result.persistedPinId)).size, 2);
  assert.equal(projection.plannerPins.length, 0, "saved restaurants are not repeated as generic companion pins");
  const merged = mergeMapResults(projection.results, [
    mapResultForLocalPlace(restaurantA, "eat"),
    mapResultForLocalPlace(restaurantB, "eat"),
  ], 1);
  assert.equal(merged.filter((result) => result.kind === "eat").length, 2);
  assert.ok(merged.filter((result) => result.kind === "eat").every((result) => result.state === "saved"));
});

test("replacing a saved stay is one canonical remove-and-add projection", () => {
  const first = addMappedPlaceToTrip(tripFixture(), tokyoStayA, "stay", 1, "tokyo");
  const replaced = addMappedPlaceToTrip(
    removeMappedPlaceFromTrip(first, tokyoStayA, "stay", 1, "tokyo"),
    tokyoStayB,
    "stay",
    1,
    "tokyo",
  );
  const projection = projectPersistedMapResults(replaced);
  assert.equal(projection.results.length, 1);
  assert.equal(projection.results[0]?.name, tokyoStayB.name);
  assert.equal(replaced.brief.bookings?.filter((booking) => booking.id === "stay-tokyo").length, 1);
});

test("See results, saved ideas, and scheduled ideas share selection but retain canonical state", () => {
  const place = { id: "sensoji", title: "Sensō-ji", area: "Asakusa", type: "Landmark", coordinates: [139.7967, 35.7148] as [number, number] };
  const transient = mapResultForDiscoveryPlace(place);
  assert.ok(transient);
  const idea: ItineraryIdea = {
    id: "idea-tokyo-sensoji",
    stopId: "tokyo",
    placeId: place.id,
    title: place.title,
    category: "activity",
    coordinates: place.coordinates,
    area: place.area,
    placeType: place.type,
    source: "personalised-recommendation",
    reasons: [],
  };
  const savedTrip = { ...tripFixture(), brief: { ...tripFixture().brief, itineraryIdeas: [idea] } };
  const saved = projectPersistedMapResults(savedTrip);
  assert.equal(saved.results[0]?.state, "saved");
  assert.equal(mergeMapResults(saved.results, [transient], 1).length, 1);

  const scheduledIdea = { ...idea, dayId: "tokyo-day-1", dayPart: "morning" as const };
  const withPin = addMappedPlaceToTrip({ ...savedTrip, brief: { ...savedTrip.brief, itineraryIdeas: [scheduledIdea] } }, { id: place.id, name: place.title, coordinates: place.coordinates }, "activity", 1, "tokyo");
  const scheduled = projectPersistedMapResults(withPin);
  assert.equal(scheduled.results.length, 1);
  assert.equal(scheduled.results[0]?.state, "scheduled");
  assert.equal(scheduled.plannerPins.length, 0, "the scheduled idea's companion pin is not duplicated");
});

test("See keeps multiple distinct saved activities and projects each trustworthy location after reload", () => {
  const first: ItineraryIdea = {
    id: "idea-tokyo-sensoji", stopId: "tokyo", placeId: "sensoji", title: "Sensō-ji", category: "activity",
    coordinates: [139.7967, 35.7148], source: "personalised-recommendation", reasons: [],
  };
  const second: ItineraryIdea = {
    id: "idea-tokyo-meiji", stopId: "tokyo", placeId: "meiji", title: "Meiji Shrine", category: "activity",
    coordinates: [139.6993, 35.6764], source: "personalised-recommendation", reasons: [],
  };
  const saved = saveItineraryIdea(saveItineraryIdea(tripFixture(), first), second);
  assert.equal(saved.brief.itineraryIdeas?.length, 2);
  const projection = projectPersistedMapResults(JSON.parse(JSON.stringify(saved)) as EasyTTrip);
  assert.deepEqual(projection.results.filter((result) => result.kind === "see").map((result) => result.sourceId), ["sensoji", "meiji"]);
});

test("only Stay asks the canonical mutation owner to replace a previous local choice", () => {
  const finder = readFileSync(new URL("../components/journey-local-finder.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  assert.match(finder, /const replaced = kind === "stay" && saved && saved\.id !== chosen\.id/);
  assert.doesNotMatch(finder, /Replace restaurant/);
  assert.match(workspace, /const replacedStay = category === "stay" \? replaced : undefined/);
  assert.match(workspace, /replacedStay \? removeMappedPlaceFromTrip/);
});

test("coordinate-less activities stay saved but are never fabricated as markers", () => {
  const idea: ItineraryIdea = {
    id: "idea-tokyo-unmapped",
    stopId: "tokyo",
    placeId: "provider-unmapped",
    title: "Flexible food tour",
    category: "activity",
    source: "live-provider-inventory",
    reasons: [],
  };
  const trip = tripFixture();
  trip.brief.itineraryIdeas = [idea];
  const projection = projectPersistedMapResults(trip);
  assert.deepEqual(projection.results, []);
  assert.deepEqual(projection.plannerPins, []);
  assert.equal(mapResultForDiscoveryPlace({ id: "bad", title: "Bad coordinate", area: "Tokyo", type: "Activity", coordinates: [999, 999] }), null);
});

test("manual transport and custom pins remain under the existing pin owner", () => {
  const trip = tripFixture();
  trip.brief.mapPins = [
    { id: "pin-transfer", title: "Station", category: "transport", dayNumber: 1, longitude: 139.7, latitude: 35.68 },
    { id: "pin-note", title: "Meet here", category: "custom", dayNumber: 1, longitude: 139.71, latitude: 35.69 },
  ];
  const projection = projectPersistedMapResults(trip);
  assert.equal(projection.results.length, 0);
  assert.deepEqual(projection.plannerPins.map((pin) => pin.id), ["pin-transfer", "pin-note"]);
});
