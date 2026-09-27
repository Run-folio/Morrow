import assert from "node:assert/strict";
import test from "node:test";

import { itineraryRouteTrackStops } from "../lib/easyt/itinerary-route-track.ts";
import { itineraryWorkspaceHref, parseItineraryWorkspaceTarget } from "../lib/easyt/trip-workspace-links.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = {
  stops: [
    { id: "tokyo-return", name: "Tokyo", order: 2 },
    { id: "undated", name: "Osaka", order: 3 },
    { id: "kyoto", name: "Kyoto", order: 1 },
    { id: "tokyo-first", name: "Tokyo", order: 0 },
  ],
  planItems: [
    { id: "day-6", dayNumber: 6, stopId: "tokyo-return" },
    { id: "day-1", dayNumber: 1, stopId: "tokyo-first" },
    { id: "day-5", dayNumber: 5, stopId: "tokyo-return" },
    { id: "day-2", dayNumber: 2, stopId: "tokyo-first" },
    { id: "day-3", dayNumber: 3, stopId: "kyoto" },
  ],
} as Pick<EasyTTrip, "stops" | "planItems">;

test("shared route track keeps repeated occurrences, ranges, images and disabled undated stops", () => {
  const stops = itineraryRouteTrackStops(trip, "day-6", { "tokyo-first": { src: "/first.jpg", alt: "First" }, "tokyo-return": { src: "/return.jpg", alt: "Return" } }, "en");
  assert.deepEqual(stops.map(({ id, kind, dayLabel, active, disabled, image }) => [id, kind, dayLabel, active, disabled ?? false, image ?? null]), [
    ["tokyo-first", "stop", "Days 1–2", false, false, "/first.jpg"],
    ["kyoto", "stop", "Day 3", false, false, null],
    ["tokyo-return", "stop", "Days 5–6", true, false, "/return.jpg"],
    ["undated", "stop", "Dates to confirm", false, true, null],
  ]);
  assert.equal(stops.some(({ kind, name }) => kind === "origin" || name === "All trip"), false);
  assert.equal(itineraryRouteTrackStops(trip, "day-1", {}, "es")[0]?.dayLabel, "Días 1–2");
});

test("numeric day deep link preserves the later Tokyo occurrence", () => {
  const href = itineraryWorkspaceHref("trip-repeat", 6);
  const query = new URL(href, "https://morrovia.invalid").searchParams;
  assert.equal(query.get("day"), "6");
  assert.deepEqual(parseItineraryWorkspaceTarget(trip, query), { dayNumber: 6 });
  assert.equal(trip.planItems.find((day) => day.dayNumber === 6)?.stopId, "tokyo-return");
  assert.equal([...query.keys()].includes("itineraryDay"), false);
});
