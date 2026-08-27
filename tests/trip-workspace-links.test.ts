import assert from "node:assert/strict";
import test from "node:test";

import {
  firstItineraryDayForStop,
  firstTripWorkspaceHref,
  isCanonicalTripWorkspaceHref,
  isFirstTripWorkspaceArrival,
  itineraryDayForRecommendation,
  itineraryWorkspaceHref,
  initialMapCameraMode,
  mapWorkspaceHref,
  parseItineraryWorkspaceTarget,
  parseMapWorkspaceTarget,
  shouldShowFirstTripOrientation,
  tripSaveSignInHref,
  tripWorkspaceHref,
  workspaceViewFromPathname,
  workspaceVisitKey,
} from "../lib/easyt/trip-workspace-links.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = {
  id: "trip-real",
  stops: [
    { id: "cusco", order: 0, name: "Cusco" },
    { id: "sacred-valley", order: 1, name: "Sacred Valley" },
  ],
  planItems: [
    { id: "day-1", stopId: "cusco", dayNumber: 1 },
    { id: "day-2", stopId: "cusco", dayNumber: 2 },
    { id: "day-3", stopId: "sacred-valley", dayNumber: 3 },
  ],
} as Pick<EasyTTrip, "id" | "stops" | "planItems">;

test("normal trip entry targets the canonical Trip Workspace Overview", () => {
  assert.equal(
    tripWorkspaceHref("trip-9c3ea847-d1e7-4ceb-a2ff-e9817460a5c6"),
    "/journey/trip-9c3ea847-d1e7-4ceb-a2ff-e9817460a5c6",
  );
  assert.equal(
    tripWorkspaceHref("trip-00000000-0000-4000-8000-000000000001"),
    "/journey/trip-00000000-0000-4000-8000-000000000001",
  );
});

test("a generated guest trip opens before auth and an explicit save returns to the same ID", () => {
  const id = "trip-first with spaces";
  const arrival = firstTripWorkspaceHref(id);
  assert.equal(arrival, "/journey/trip-first%20with%20spaces?created=1");
  const signIn = tripSaveSignInHref(id);
  assert.equal(signIn, `/journey/login?next=${encodeURIComponent(`${arrival}&saved=1`)}`);
  assert.equal(new URLSearchParams(signIn.split("?", 2)[1]).get("next"), `${arrival}&saved=1`);
});

test("first-trip orientation is scoped to the generated arrival and shown once", () => {
  assert.equal(isFirstTripWorkspaceArrival("?created=1&saved=1"), true);
  assert.equal(isFirstTripWorkspaceArrival("?created=0"), false);
  assert.equal(shouldShowFirstTripOrientation(true, false), true);
  assert.equal(shouldShowFirstTripOrientation(true, true), false);
  assert.equal(shouldShowFirstTripOrientation(false, false), false);
});

test("login return links accept canonical trip workspaces but not account surfaces", () => {
  assert.equal(isCanonicalTripWorkspaceHref("/journey/trip-123?created=1&saved=1"), true);
  assert.equal(isCanonicalTripWorkspaceHref("/journey/trip-123/map?stop=tokyo"), true);
  assert.equal(isCanonicalTripWorkspaceHref("/journey/dashboard"), false);
  assert.equal(isCanonicalTripWorkspaceHref("https://example.com/journey/trip-123"), false);
});

test("Overview and Prep stay actions target the stable Map stop in Stay mode", () => {
  assert.equal(mapWorkspaceHref(trip.id, "sacred-valley", "stay"), "/journey/trip-real/map?stop=sacred-valley&mode=stay");
  assert.deepEqual(
    parseMapWorkspaceTarget(trip, new URLSearchParams("stop=sacred-valley&mode=stay")),
    { stopId: "sacred-valley", mode: "stay" },
  );
});

test("invalid Map and Itinerary deep links fall back to the first canonical context", () => {
  assert.deepEqual(parseMapWorkspaceTarget(trip, new URLSearchParams("stop=missing&mode=hotel")), { stopId: "cusco", mode: "plan" });
  assert.deepEqual(parseItineraryWorkspaceTarget(trip, new URLSearchParams("day=3junk")), { dayNumber: 1 });
  assert.deepEqual(parseItineraryWorkspaceTarget(trip, new URLSearchParams("day=99")), { dayNumber: 1 });
});

test("Map camera opens route-first unless the traveller explicitly targets a valid stop", () => {
  assert.equal(initialMapCameraMode(trip, new URLSearchParams()), "overview");
  assert.equal(initialMapCameraMode(trip, new URLSearchParams("stop=missing")), "overview");
  assert.equal(initialMapCameraMode(trip, new URLSearchParams("stop=sacred-valley")), "detail");
});

test("Trip Health and route cards use deterministic itinerary days", () => {
  assert.equal(firstItineraryDayForStop(trip, "sacred-valley"), 3);
  assert.equal(itineraryDayForRecommendation(trip, { affectedDays: [9, 3] }), 3);
  assert.equal(itineraryDayForRecommendation(trip, { affectedDays: [9] }), null);
  assert.equal(itineraryWorkspaceHref(trip.id, 3), "/journey/trip-real/itinerary?day=3");
});

test("query-only deep-link changes retain one workspace analytics visit key", () => {
  const first = "/journey/trip-real/map?stop=cusco&mode=plan";
  const second = "/journey/trip-real/map?stop=sacred-valley&mode=stay";
  assert.equal(workspaceVisitKey(first), workspaceVisitKey(second));
  assert.equal(workspaceViewFromPathname(first, trip.id), "map");
  assert.equal(workspaceViewFromPathname("/journey/trip-real/prep", trip.id), "prep");
});
