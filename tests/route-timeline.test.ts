import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  routeTimelineScopeId,
  routeTimelineSelectionId,
  routeTimelineStopsForTrip,
} from "../lib/easyt/route-timeline.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";

function trip(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "timeline-trip",
    ownerId: null,
    title: "Athens, Naxos and Athens",
    status: "draft",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      intent: defaultTripIntent({ stopIds: ["athens-out", "naxos", "athens-return"], durationDays: 5 }),
    },
    stops: [
      { id: "athens-return", canonicalPlaceId: "athens-gr", order: 2, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-09-05", departureDate: "2026-09-06", nights: 1 },
      { id: "athens-out", canonicalPlaceId: "athens-gr", order: 0, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-09-01", departureDate: "2026-09-03", nights: 2 },
      { id: "naxos", canonicalPlaceId: "naxos-gr", order: 1, name: "Naxos", country: "Greece", latitude: 37.1036, longitude: 25.3764, arrivalDate: "2026-09-03", departureDate: "2026-09-05", nights: 2 },
    ],
    legs: [],
    planItems: [
      { id: "day-5", stopId: "athens-return", dayNumber: 5, date: "2026-09-05", type: "activity", title: "Athens return", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-3", stopId: "naxos", dayNumber: 3, date: "2026-09-03", type: "activity", title: "Naxos", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-1", stopId: "athens-out", dayNumber: 1, date: "2026-09-01", type: "activity", title: "Athens", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image: "/athens.jpg" },
      { id: "day-4", stopId: "naxos", dayNumber: 4, date: "2026-09-04", type: "activity", title: "Naxos", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-2", stopId: "athens-out", dayNumber: 2, date: "2026-09-02", type: "activity", title: "Athens", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    ],
    recommendations: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

test("the shared route model owns origin, order, day ranges, images and repeated-stop identity", () => {
  const source = trip();
  const timeline = routeTimelineStopsForTrip(source, { scopeId: "athens-return", imageByStopId: { naxos: "/naxos.jpg" } });
  assert.deepEqual(timeline.map((item) => item.id), ["timeline-trip-origin", "athens-out", "naxos", "athens-return"]);
  assert.deepEqual(timeline.map((item) => item.dayLabel), ["From London", "Days 1–2", "Days 3–4", "Day 5"]);
  assert.equal(timeline[0]?.name, "All trip");
  assert.equal(timeline[0]?.kind, "origin");
  assert.equal(timeline[1]?.image, "/athens.jpg");
  assert.equal(timeline[2]?.image, "/naxos.jpg");
  assert.equal(timeline[3]?.active, true);
  assert.notEqual(timeline[1]?.id, timeline[3]?.id);
});

test("Map and Explore share selection identity semantics", () => {
  assert.equal(routeTimelineSelectionId("timeline-trip", "all"), "timeline-trip-origin");
  assert.equal(routeTimelineScopeId("timeline-trip", "timeline-trip-origin"), "all");
  assert.equal(routeTimelineScopeId("timeline-trip", "naxos"), "naxos");
});

test("Map and Explore consume the same route model and scrolling component while actions remain local", () => {
  const model = readFileSync(new URL("../lib/easyt/route-timeline.ts", import.meta.url), "utf8");
  const strip = readFileSync(new URL("../components/journey-planner-strip.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  const explore = readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/journey-planner-strip.module.css", import.meta.url), "utf8");
  assert.match(model, /routeTimelineStopsForTrip/);
  assert.match(map, /routeTimelineStopsForTrip\(customTrip/);
  assert.match(explore, /routeTimelineStopsForTrip\(workingTrip/);
  assert.match(strip, /export function JourneyStopNavigation/);
  assert.match(map, /<JourneyPlannerStrip/);
  assert.match(explore, /<JourneyStopNavigation/);
  assert.match(styles, /overflow-x:\s*auto/);
  assert.match(explore, />Open map<\/EasyTLinkButton>/);
  assert.doesNotMatch(explore, />Add stop<|>Whole route<|Fullscreen map/);
});
