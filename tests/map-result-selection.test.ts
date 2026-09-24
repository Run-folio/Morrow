import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { addMappedPlaceToTrip, removeMappedPlaceFromTrip } from "../lib/easyt/map-place-itinerary.ts";
import { saveItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import {
  mapResultForDiscoveryPlace,
  mapResultForHandoffTarget,
  mapResultForLocalPlace,
  mapResultHandoffForExploreResult,
  mapResultHandoffForLocalPlace,
  mergeMapResults,
  projectPersistedMapResults,
  reconcileMapResultSelection,
  mapResultForSourceAtStop,
  mapResultPlanItem,
  reconcilePlannerPinSelection,
} from "../lib/easyt/map-result-selection.ts";
import { mapWorkspaceHref, parseMapWorkspaceTarget } from "../lib/easyt/trip-workspace-links.ts";
import type { ExploreResult } from "../lib/easyt/explore.ts";
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

test("a disappeared result clears, while a pending exact handoff remains selectable", () => {
  const first = mapResultForLocalPlace(tokyoStayA, "stay", { stopId: "tokyo", dayNumber: 1 });
  const second = mapResultForLocalPlace(tokyoStayB, "stay", { stopId: "tokyo", dayNumber: 1 });
  assert.equal(reconcileMapResultSelection(first, [second], first.selectionId), null);
  assert.equal(reconcileMapResultSelection(second, [], first.selectionId), second, "a newly selected handoff can precede inventory");
  assert.equal(reconcileMapResultSelection(second, [first, second], first.selectionId), second);
  assert.equal(reconcileMapResultSelection(null, [first], first.selectionId), null);
});

test("result reconciliation never aliases the same venue across repeated stops", () => {
  const first = mapResultForLocalPlace(tokyoStayA, "stay", { stopId: "tokyo-first", dayNumber: 1 });
  const repeated = mapResultForLocalPlace(tokyoStayA, "stay", { stopId: "tokyo-return", dayNumber: 8 });
  assert.equal(reconcileMapResultSelection(first, [repeated], first.selectionId), null);
  assert.notEqual(first.selectionId, repeated.selectionId);
});

test("finder rows select the current occurrence even when an earlier saved result shares the provider ID", () => {
  const first = mapResultForLocalPlace(tokyoStayA, "stay", { stopId: "tokyo-first", dayNumber: 1 });
  const repeated = mapResultForLocalPlace(tokyoStayA, "stay", { stopId: "tokyo-return", dayNumber: 8 });
  assert.equal(mapResultForSourceAtStop([first, repeated], "stay", tokyoStayA.id, "tokyo-return", 8), repeated);
  assert.equal(mapResultForSourceAtStop([first], "stay", tokyoStayA.id, "tokyo-return", 8), null);
});

test("Eat and See finder rows never jump to an earlier day at the same stop", () => {
  const firstEat = mapResultForLocalPlace(tokyoStayA, "eat", { stopId: "tokyo", dayNumber: 1 });
  const secondEat = mapResultForLocalPlace(tokyoStayA, "eat", { stopId: "tokyo", dayNumber: 2 });
  const firstSee = mapResultForDiscoveryPlace({ id: "venue", title: "Venue", area: "Tokyo", type: "Culture", coordinates: [139.7, 35.6] }, { stopId: "tokyo", dayNumber: 1 })!;
  assert.equal(mapResultForSourceAtStop([firstEat], "eat", tokyoStayA.id, "tokyo", 2), null);
  assert.equal(mapResultForSourceAtStop([firstEat, secondEat], "eat", tokyoStayA.id, "tokyo", 2), secondEat);
  assert.equal(mapResultForSourceAtStop([firstSee], "see", "venue", "tokyo", 2), null);
});

test("a cross-stop result pin resolves its own canonical day, including a repeated destination", () => {
  const trip = tripFixture();
  trip.stops.push({ ...trip.stops[0]!, id: "tokyo-return", order: 1 });
  trip.planItems.push({ ...trip.planItems[0]!, id: "tokyo-return-day-8", stopId: "tokyo-return", dayNumber: 8 });
  const first = mapResultForLocalPlace(tokyoStayA, "stay", { stopId: "tokyo", dayNumber: 1 });
  const repeated = mapResultForLocalPlace(tokyoStayA, "stay", { stopId: "tokyo-return", dayNumber: 8 });
  assert.equal(mapResultPlanItem(trip, first)?.id, "tokyo-day-1");
  assert.equal(mapResultPlanItem(trip, repeated)?.id, "tokyo-return-day-8");
  assert.equal(mapResultPlanItem(trip, { ...repeated, stopId: "missing" }), null);
});

test("a selected saved pin follows canonical edits and clears when removed", () => {
  const pin = { id: "saved-pin", title: "Old title", category: "activity" as const, dayNumber: 1, longitude: 139.7, latitude: 35.6 };
  const renamed = { ...pin, title: "New title" };
  assert.equal(reconcilePlannerPinSelection(pin, [renamed]), renamed);
  assert.equal(reconcilePlannerPinSelection(pin, []), null);
});

test("navigation handoff makes the exact target selectable before unrelated inventory arrives", () => {
  const trip = tripFixture();
  const enrichedMappedStay = {
    ...tokyoStayA,
    provider: "google-places" as const,
    commercialProvider: "booking-demand" as const,
    commercialProviderProductId: "booking-tokyo-a",
  };
  const handoff = mapResultHandoffForLocalPlace(enrichedMappedStay, "stay", "tokyo", 1);
  const href = mapWorkspaceHref(trip.id, "tokyo", "stay", 1, handoff.selectionId, handoff);
  const parsed = parseMapWorkspaceTarget(trip, new URL(href, "https://morrovia.example").searchParams);
  assert.deepEqual(parsed.resultHandoff, handoff);

  const initial = mapResultForHandoffTarget(parsed.resultHandoff!);
  const enriched = mapResultForLocalPlace({ ...enrichedMappedStay, rating: 4.8, reviewCount: 400 }, "stay", { stopId: "tokyo", dayNumber: 1 });
  const merged = mergeMapResults([], [initial, enriched], 1);
  assert.equal(merged.length, 1, "later provider inventory enriches rather than duplicates the target");
  assert.equal(merged[0]?.selectionId, handoff.selectionId);
  assert.equal(merged[0]?.sourceId, tokyoStayA.id);
  assert.deepEqual(merged[0]?.coordinates, tokyoStayA.coordinates);
  assert.equal(merged[0]?.rating, 4.8);
  assert.equal(merged[0]?.provider, "google-places");
  assert.equal(merged[0]?.commercialProvider, "booking-demand");
  assert.equal(merged[0]?.commercialProviderProductId, "booking-tokyo-a");

  const noCoordinates = new URLSearchParams("stop=tokyo&mode=stay&day=1&result=result%3Astay%3Atokyo%3Atokyo-hotel-a&targetId=tokyo-hotel-a&targetName=Tokyo+Stay+A&targetKind=stay");
  assert.equal(parseMapWorkspaceTarget(trip, noCoordinates).resultHandoff, undefined, "partial handoff context never fabricates a zero-coordinate marker");
  const orphanCommercialProduct = new URL(href, "https://morrovia.example").searchParams;
  orphanCommercialProduct.set("targetCommercialProvider", "other");
  orphanCommercialProduct.set("targetCommercialProduct", "untrusted");
  assert.equal(parseMapWorkspaceTarget(trip, orphanCommercialProduct).resultHandoff, undefined, "commercial product identity requires its allowlisted provider");
});

test("activity and tour handoffs preserve exact stop, coordinates and provider product identity", () => {
  const idea: ItineraryIdea = {
    id: "idea-tokyo-tour", stopId: "tokyo", placeId: "viator:TOKYO-42", title: "Tokyo architecture tour",
    category: "activity", coordinates: [139.71, 35.68], source: "live-provider-inventory", provider: "viator",
    providerProductId: "TOKYO-42", reasons: [],
  };
  const result: ExploreResult = {
    identity: "stop:tokyo:provider:viator:TOKYO-42", stopId: "tokyo", sourceId: "viator:TOKYO-42",
    kind: "tour", title: idea.title, location: "Tokyo", category: "Tour", tags: ["Culture"],
    coordinates: idea.coordinates, provider: "viator", providerProductId: "TOKYO-42", idea,
  };
  const handoff = mapResultHandoffForExploreResult(result, "result:see:tokyo:viator:TOKYO-42", 1)!;
  assert.equal(handoff.kind, "see");
  assert.equal(handoff.stopId, "tokyo");
  assert.equal(handoff.provider, "viator");
  assert.equal(handoff.providerProductId, "TOKYO-42");
  assert.deepEqual(handoff.coordinates, [139.71, 35.68]);
  assert.equal(mapResultHandoffForExploreResult({ ...result, coordinates: undefined }, handoff.selectionId, 1), null);

  const restaurant = mapResultHandoffForExploreResult({ ...result, identity: "stop:tokyo:place:restaurant-7", sourceId: "restaurant-7", kind: "restaurant", provider: "google-places", providerProductId: undefined }, "result:eat:tokyo:restaurant-7", 1)!;
  assert.equal(restaurant.kind, "eat");
  assert.equal(restaurant.provider, "google-places");
});

test("rapid navigation and repeated destinations keep the latest exact stop-scoped handoff", () => {
  const repeated = tripFixture();
  repeated.stops.push({ ...repeated.stops[0]!, id: "tokyo-return", order: 1, arrivalDate: "2026-10-04", departureDate: "2026-10-05", nights: 1 });
  repeated.planItems.push({ ...repeated.planItems[0]!, id: "tokyo-return-day", stopId: "tokyo-return", dayNumber: 4, date: "2026-10-04" });
  const outbound = mapResultHandoffForLocalPlace(tokyoStayA, "stay", "tokyo", 1);
  const returned = mapResultHandoffForLocalPlace(tokyoStayA, "stay", "tokyo-return", 4);
  const hrefs = [
    mapWorkspaceHref(repeated.id, "tokyo", "stay", 1, outbound.selectionId, outbound),
    mapWorkspaceHref(repeated.id, "tokyo-return", "stay", 4, returned.selectionId, returned),
  ];
  const latest = parseMapWorkspaceTarget(repeated, new URL(hrefs.at(-1)!, "https://morrovia.example").searchParams);
  assert.equal(latest.stopId, "tokyo-return");
  assert.equal(latest.resultSelectionId, "result:stay:tokyo-return:tokyo-hotel-a");
  assert.deepEqual(latest.resultHandoff?.coordinates, tokyoStayA.coordinates);
  assert.notEqual(outbound.selectionId, returned.selectionId);
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
  assert.match(workspace, /replacedStay \? removeMappedStayForStop/);
  assert.match(workspace, /selectMappedStayForStop/);
  assert.match(workspace, /handoffMapResult\?\.kind === shapeDayTab \? \[handoffMapResult, \.\.\.discovered\] : discovered/);
  assert.match(workspace, /mapResults\.find\(\(candidate\) => candidate\.selectionId === target\.resultSelectionId\)/);
  assert.match(workspace, /setSelectedMapResult\(result\)/);
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
