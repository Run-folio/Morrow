import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  firstItineraryDayForStop,
  exploreWorkspaceHref,
  firstTripWorkspaceHref,
  isCanonicalTripWorkspaceHref,
  isFirstTripWorkspaceArrival,
  itineraryDayForRecommendation,
  itineraryWorkspaceHref,
  initialMapCameraMode,
  mapWorkspaceHref,
  mapWorkspaceSelectionForTarget,
  parseItineraryWorkspaceTarget,
  parseMapWorkspaceTarget,
  parseStayWorkspaceTarget,
  shouldResetOverviewEntry,
  tripBuilderHref,
  tripSaveSignInHref,
  tripWorkspaceHref,
  stayWorkspaceHref,
  transportWorkspaceHref,
  workspaceViewFromPathname,
  workspaceVisitKey,
} from "../lib/easyt/trip-workspace-links.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = {
  id: "trip-real",
  stops: [
    { id: "cusco", order: 0, name: "Cusco", nights: 2 },
    { id: "sacred-valley", order: 1, name: "Sacred Valley", nights: 3 },
  ],
  planItems: [
    { id: "day-1", stopId: "cusco", dayNumber: 1 },
    { id: "day-2", stopId: "cusco", dayNumber: 2 },
    { id: "day-3", stopId: "sacred-valley", dayNumber: 3 },
  ],
} as Pick<EasyTTrip, "id" | "stops" | "planItems">;

const handoffTrip = {
  id: "trip-japan-korea",
  stops: [
    { id: "tokyo-primary", order: 0, name: "Tokyo", nights: 2 },
    { id: "seoul-primary", order: 1, name: "Seoul", nights: 3 },
  ],
  planItems: [
    { id: "tokyo-day-1", stopId: "tokyo-primary", dayNumber: 1 },
    { id: "tokyo-day-2", stopId: "tokyo-primary", dayNumber: 2 },
    { id: "seoul-day-3", stopId: "seoul-primary", dayNumber: 3 },
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

test("generic Overview entry resets position while intentional section deep links remain native", () => {
  assert.equal(shouldResetOverviewEntry(""), true);
  assert.equal(shouldResetOverviewEntry("#"), true);
  assert.equal(shouldResetOverviewEntry("#before-you-go"), false);
  assert.equal(shouldResetOverviewEntry("#overview-progress-title"), false);
});

test("back and forward targets derive scroll policy from the URL being restored", () => {
  const history = [
    "/journey/trip-real",
    "/journey/trip-real#before-you-go",
    "/journey/trip-real/map",
  ].map((href) => new URL(href, "https://morrovia.test"));
  assert.equal(shouldResetOverviewEntry(history[0]!.hash), true);
  assert.equal(shouldResetOverviewEntry(history[1]!.hash), false);
  assert.equal(shouldResetOverviewEntry(history[0]!.hash), true);
});

test("dashboard and TripShell generic Overview links share the canonical hash-free owner", () => {
  const href = tripWorkspaceHref("trip-real");
  assert.equal(href, "/journey/trip-real");
  assert.equal(new URL(href, "https://morrovia.test").hash, "");
});

test("a generated guest trip opens before auth and an explicit save returns to the same ID", () => {
  const id = "trip-first with spaces";
  const arrival = firstTripWorkspaceHref(id);
  assert.equal(arrival, "/journey/trip-first%20with%20spaces?created=1");
  const signIn = tripSaveSignInHref(id);
  assert.equal(signIn, `/journey/login?next=${encodeURIComponent(`${arrival}&saved=1`)}`);
  assert.equal(new URLSearchParams(signIn.split("?", 2)[1]).get("next"), `${arrival}&saved=1`);
});

test("Builder re-entry keeps device recovery explicit only for guest trips", () => {
  assert.equal(
    tripBuilderHref("trip-guest with spaces", null),
    "/journey/new?trip=trip-guest%20with%20spaces&recover=1",
  );
  assert.equal(
    tripBuilderHref("trip-account with spaces", "owner-a"),
    "/journey/new?trip=trip-account%20with%20spaces",
  );
});

test("a generated arrival remains distinguishable from normal workspace navigation", () => {
  assert.equal(isFirstTripWorkspaceArrival("?created=1&saved=1"), true);
  assert.equal(isFirstTripWorkspaceArrival("?created=0"), false);
});

test("login return links accept canonical trip workspaces but not account surfaces", () => {
  assert.equal(isCanonicalTripWorkspaceHref("/journey/trip-123?created=1&saved=1"), true);
  assert.equal(isCanonicalTripWorkspaceHref("/journey/trip-123/map?stop=tokyo"), true);
  assert.equal(isCanonicalTripWorkspaceHref("/journey/trip-123/explore?stop=tokyo&day=2"), true);
  assert.equal(isCanonicalTripWorkspaceHref("/journey/trip-123/stay?stop=tokyo"), true);
  assert.equal(isCanonicalTripWorkspaceHref("/journey/trip-123/transport"), true);
  assert.equal(isCanonicalTripWorkspaceHref("/journey/dashboard"), false);
  assert.equal(isCanonicalTripWorkspaceHref("https://example.com/journey/trip-123"), false);
});

test("Transport has a canonical direct workspace href and pathname identity", () => {
  assert.equal(transportWorkspaceHref("trip-real"), "/journey/trip-real/transport");
  assert.equal(workspaceViewFromPathname("/journey/trip-real/transport", "trip-real"), "transport");
  assert.equal(workspaceViewFromPathname("/journey/trip-real/itinerary", "trip-real"), "itinerary");
});

test("Stay links preserve stop-scoped property identity", () => {
  const selectionId = "result:stay:sacred-valley:booking-42";
  assert.equal(stayWorkspaceHref(trip.id, "sacred-valley", selectionId), `/journey/trip-real/stay?stop=sacred-valley&result=${encodeURIComponent(selectionId)}`);
  assert.deepEqual(parseStayWorkspaceTarget(trip, new URLSearchParams(`stop=sacred-valley&result=${encodeURIComponent(selectionId)}`)), { stopId: "sacred-valley", resultSelectionId: selectionId });
  assert.deepEqual(parseStayWorkspaceTarget(trip, new URLSearchParams("stop=missing&result=bad value")), { stopId: "cusco", resultSelectionId: null });
});

test("Overview preparation stay actions target the stable Map stop in Stay mode", () => {
  assert.equal(mapWorkspaceHref(trip.id, "sacred-valley", "stay"), "/journey/trip-real/map?stop=sacred-valley&mode=stay");
  assert.deepEqual(
    parseMapWorkspaceTarget(trip, new URLSearchParams("stop=sacred-valley&mode=stay")),
    { stopId: "sacred-valley", mode: "stay", dayNumber: null, resultSelectionId: null },
  );
  assert.equal(mapWorkspaceHref(trip.id, "sacred-valley", "see", 3), "/journey/trip-real/map?stop=sacred-valley&mode=see&day=3");
  assert.deepEqual(
    parseMapWorkspaceTarget(trip, new URLSearchParams("stop=sacred-valley&mode=see&day=3")),
    { stopId: "sacred-valley", mode: "see", dayNumber: 3, resultSelectionId: null },
  );
});

test("invalid Map and Itinerary deep links fall back to the first canonical context", () => {
  assert.deepEqual(parseMapWorkspaceTarget(trip, new URLSearchParams("stop=missing&mode=hotel")), { stopId: "cusco", mode: "plan", dayNumber: null, resultSelectionId: null });
  assert.deepEqual(parseMapWorkspaceTarget(trip, new URLSearchParams("stop=sacred-valley&day=2")), { stopId: "sacred-valley", mode: "plan", dayNumber: null, resultSelectionId: null });
  assert.deepEqual(parseItineraryWorkspaceTarget(trip, new URLSearchParams("day=3junk")), { dayNumber: 1 });
  assert.deepEqual(parseItineraryWorkspaceTarget(trip, new URLSearchParams("day=99")), { dayNumber: 1 });
});

test("Map camera opens route-first unless the traveller explicitly targets a valid stop", () => {
  assert.equal(initialMapCameraMode(trip, new URLSearchParams()), "overview");
  assert.equal(initialMapCameraMode(trip, new URLSearchParams("stop=missing")), "overview");
  assert.equal(initialMapCameraMode(trip, new URLSearchParams("stop=sacred-valley")), "detail");
});

test("Map handoffs settle on the exact canonical stop while direct entry keeps the normal default", () => {
  const direct = mapWorkspaceSelectionForTarget(handoffTrip, new URLSearchParams());
  assert.equal(direct.target.stopId, "tokyo-primary");
  assert.equal(direct.selectedDay?.id, "tokyo-day-1");

  const exploreSeoul = mapWorkspaceSelectionForTarget(handoffTrip, new URLSearchParams("stop=seoul-primary&mode=see&day=3&result=result:see:seoul-primary:myeongdong-cathedral"));
  assert.equal(exploreSeoul.target.stopId, "seoul-primary");
  assert.equal(exploreSeoul.target.mode, "see");
  assert.equal(exploreSeoul.target.resultSelectionId, "result:see:seoul-primary:myeongdong-cathedral");
  assert.equal(exploreSeoul.selectedDay?.id, "seoul-day-3");

  const stayTokyo = mapWorkspaceSelectionForTarget(handoffTrip, new URLSearchParams("stop=tokyo-primary&mode=stay&day=1&result=result:stay:tokyo-primary:keio-plaza"));
  assert.equal(stayTokyo.target.stopId, "tokyo-primary");
  assert.equal(stayTokyo.target.mode, "stay");
  assert.equal(stayTokyo.target.resultSelectionId, "result:stay:tokyo-primary:keio-plaza");
  assert.equal(stayTokyo.selectedDay?.id, "tokyo-day-1");

  const mapWorkspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
  assert.match(mapWorkspace, /providedTrip \? mapWorkspaceSelectionForTarget\(providedTrip, searchParams\) : null/, "the explicit handoff owns initial render state");
  assert.match(mapWorkspace, /if \(!customBrief \|\| isShellPresentation\) return;/, "the preview default cannot overwrite an explicit TripShell handoff after hydration");
});

test("repeated destination instances settle by stop ID rather than destination name", () => {
  const repeated = {
    ...handoffTrip,
    stops: [...handoffTrip.stops, { ...handoffTrip.stops[1]!, id: "seoul-return", order: 2 }],
    planItems: [...handoffTrip.planItems, { ...handoffTrip.planItems[2]!, id: "seoul-day-6", stopId: "seoul-return", dayNumber: 6 }],
  };
  const settled = mapWorkspaceSelectionForTarget(repeated, new URLSearchParams("stop=seoul-return&mode=see&day=6&result=result:see:seoul-return:viewpoint"));
  assert.equal(settled.target.stopId, "seoul-return");
  assert.equal(settled.selectedDay?.id, "seoul-day-6");
});

test("Trip Health and route cards use deterministic itinerary days", () => {
  assert.equal(firstItineraryDayForStop(trip, "sacred-valley"), 3);
  assert.equal(itineraryDayForRecommendation(trip, { affectedDays: [9, 3] }), 3);
  assert.equal(itineraryDayForRecommendation(trip, { affectedDays: [9] }), null);
  assert.equal(itineraryWorkspaceHref(trip.id, 3), "/journey/trip-real/itinerary?day=3");
  assert.equal(exploreWorkspaceHref(trip.id, "sacred-valley", 3), "/journey/trip-real/explore?stop=sacred-valley&day=3");
});

test("query-only deep-link changes retain one workspace analytics visit key", () => {
  const first = "/journey/trip-real/map?stop=cusco&mode=plan";
  const second = "/journey/trip-real/map?stop=sacred-valley&mode=stay";
  assert.equal(workspaceVisitKey(first), workspaceVisitKey(second));
  assert.equal(workspaceViewFromPathname(first, trip.id), "map");
  assert.equal(workspaceViewFromPathname("/journey/trip-real/explore?stop=cusco", trip.id), "explore");
  assert.equal(workspaceViewFromPathname("/journey/trip-real/stay?stop=cusco", trip.id), "stay");
  assert.equal(workspaceViewFromPathname("/journey/trip-real/prep", trip.id), "overview");
});
