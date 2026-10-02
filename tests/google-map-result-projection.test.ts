import assert from "node:assert/strict";
import test from "node:test";
import { googleCanvasPlacesForMapResults } from "../lib/easyt/google-map-result-projection.ts";
import type { MapResultPlace } from "../lib/easyt/map-result-selection.ts";
import type { PlannerMapPin } from "../lib/easyt/trip.ts";

const result = (selectionId: string, stopId: string | null, coordinates: [number, number]): MapResultPlace => ({
  selectionId, sourceId: "booking-hotel-42", stopId, dayNumber: 3, dayPart: null,
  name: "Same Hotel Name", coordinates, kind: "stay", state: "result", address: "Mumbai", category: "Hotel", mapsUrl: "https://maps.example.test",
  provider: "booking-demand", commercialProvider: "booking-demand", commercialProviderProductId: "product-42",
});

test("Google recommendation pins project the exact displayed Morrovia result identity and stop occurrence", () => {
  const first = result("result:stay:mumbai-first:booking-hotel-42", "mumbai-first", [72.8777, 19.076]);
  const second = result("result:stay:mumbai-return:booking-hotel-42", "mumbai-return", [72.8777, 19.076]);
  assert.deepEqual(googleCanvasPlacesForMapResults([first, second]), [
    { id: first.selectionId, sourceId: first.sourceId, stopId: first.stopId, name: first.name, category: "stay", coordinates: first.coordinates },
    { id: second.selectionId, sourceId: second.sourceId, stopId: second.stopId, name: second.name, category: "stay", coordinates: second.coordinates },
  ]);
});

test("Mumbai, Dushanbe, and Swakopmund recommendations retain their source geography", () => {
  const fixtures = [
    result("result:stay:mumbai:hotel", "mumbai", [72.8777, 19.076]),
    result("result:stay:dushanbe:hotel", "dushanbe", [68.787, 38.5598]),
    result("result:stay:swakopmund:hotel", "swakopmund", [14.5266, -22.6784]),
  ];
  const projected = googleCanvasPlacesForMapResults(fixtures);
  assert.deepEqual(projected.map(({ id, coordinates }) => [id, coordinates]), fixtures.map(({ selectionId, coordinates }) => [selectionId, coordinates]));
});

test("results without reliable coordinates stay out of pins without being name-matched", () => {
  const withBadCoordinates = { ...result("result:stay:one:hotel", "one", [0, 0]), coordinates: [NaN, 200] as [number, number] };
  const valid = result("result:stay:two:hotel", "two", [72.8777, 19.076]);
  assert.deepEqual(googleCanvasPlacesForMapResults([withBadCoordinates, valid]).map((place) => place.id), [valid.selectionId]);
});

test("saved custom pins reach the Google canvas with their canonical pin identity and coordinates", () => {
  const pin: PlannerMapPin = { id: "custom-favourite-7", title: "Our lookout", category: "custom", dayNumber: 5, latitude: -22.6784, longitude: 14.5053 };
  assert.deepEqual(googleCanvasPlacesForMapResults([], [pin]), [{
    id: pin.id,
    sourceId: pin.id,
    stopId: null,
    name: pin.title,
    category: "custom",
    coordinates: [pin.longitude, pin.latitude],
    plannerPin: true,
  }]);
});

test("persisted result identity and canonical stop occurrence stay attached to saved Google overlays", () => {
  const saved: MapResultPlace = { ...result("saved:idea-17", "swakopmund", [14.5053, -22.6784]), state: "scheduled" };
  assert.deepEqual(googleCanvasPlacesForMapResults([saved]), [{
    id: saved.selectionId, sourceId: saved.sourceId, stopId: saved.stopId, name: saved.name,
    category: saved.kind, coordinates: saved.coordinates, state: "scheduled",
  }]);
});
