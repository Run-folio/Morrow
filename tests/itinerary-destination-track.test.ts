import assert from "node:assert/strict";
import test from "node:test";

import { itineraryDestinationTrack } from "../lib/easyt/trip-workspace-links.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = {
  stops: [
    { id: "tokyo-return", order: 2, name: "Tokyo" },
    { id: "tokyo-first", order: 0, name: "Tokyo" },
    { id: "kyoto", order: 1, name: "Kyoto" },
  ],
  planItems: [
    { id: "day-4", stopId: "kyoto", dayNumber: 4 },
    { id: "day-6", stopId: "tokyo-return", dayNumber: 6 },
    { id: "day-2", stopId: "tokyo-first", dayNumber: 2 },
    { id: "day-5", stopId: "tokyo-return", dayNumber: 5 },
    { id: "day-1", stopId: "tokyo-first", dayNumber: 1 },
    { id: "day-3", stopId: "kyoto", dayNumber: 3 },
  ],
} as Pick<EasyTTrip, "stops" | "planItems">;

test("destination track follows canonical occurrence order and selects the second Tokyo by day ID", () => {
  const before = JSON.stringify(trip);
  const track = itineraryDestinationTrack(trip, "day-6");
  assert.deepEqual(track.map(({ stop, firstDayNumber, active }) => [stop.id, firstDayNumber, active]), [
    ["tokyo-first", 1, false],
    ["kyoto", 3, false],
    ["tokyo-return", 5, true],
  ]);
  assert.equal(JSON.stringify(trip), before, "projection must not mutate canonical stops or days");
});

test("later days keep their occurrence active and an undated stop remains visible but unavailable", () => {
  const expanded = { ...trip, stops: [...trip.stops, { id: "osaka", order: 3, name: "Osaka" }] } as Pick<EasyTTrip, "stops" | "planItems">;
  assert.deepEqual(itineraryDestinationTrack(expanded, "day-5").map(({ stop, active }) => [stop.id, active]), [
    ["tokyo-first", false], ["kyoto", false], ["tokyo-return", true], ["osaka", false],
  ]);
  assert.equal(itineraryDestinationTrack(expanded, "day-5")[3]?.firstDayNumber, null);
  assert.equal(itineraryDestinationTrack(expanded, "missing").some(({ active }) => active), false);
});
