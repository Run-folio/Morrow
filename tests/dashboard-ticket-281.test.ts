import assert from "node:assert/strict";
import test from "node:test";

import { dashboardLibraryTrips } from "../lib/easyt/dashboard-library.ts";
import { dashboardTripPhoto } from "../lib/easyt/dashboard-trip-image.ts";
import { nextTripUpdatedAt } from "../lib/easyt/trip-continuity.ts";
import type { EasyTTrip, TripStatus } from "../lib/easyt/trip.ts";

function trip(id: string, status: TripStatus = "planned", updatedAt = "2026-09-01T12:00:00.000Z"): EasyTTrip {
  return {
    schemaVersion: 1,
    id,
    ownerId: "ticket-281-owner",
    title: id,
    status,
    startDate: "2027-05-01",
    endDate: "2027-05-10",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops: [],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt,
  };
}

function stop(name: string, country: string, order: number) {
  return { id: `stop-${order}`, order, name, country, latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: 2 };
}

test("route and night saves advance the canonical revision and survive reload ordering", () => {
  const older = trip("older", "planned", "2026-09-01T12:00:00.000Z");
  const created = trip("created", "draft", "2026-09-02T12:00:00.000Z");
  const routeEdit = { ...created, stops: [stop("Paris", "France", 0)], updatedAt: nextTripUpdatedAt(created.updatedAt, new Date("2026-09-02T12:01:00.000Z")) };
  const nightEdit = { ...routeEdit, stops: [{ ...routeEdit.stops[0]!, nights: 4 }], updatedAt: nextTripUpdatedAt(routeEdit.updatedAt, new Date("2026-09-02T12:02:00.000Z")) };
  const reloaded = JSON.parse(JSON.stringify(nightEdit)) as EasyTTrip;
  const secondEdit = { ...reloaded, title: "created again", updatedAt: nextTripUpdatedAt(reloaded.updatedAt, new Date("2026-09-02T12:03:00.000Z")) };

  assert.ok(routeEdit.updatedAt > created.updatedAt);
  assert.ok(nightEdit.updatedAt > routeEdit.updatedAt);
  assert.equal(reloaded.updatedAt, nightEdit.updatedAt);
  assert.ok(secondEdit.updatedAt > reloaded.updatedAt);
  assert.deepEqual(dashboardLibraryTrips([older, reloaded], { view: "all", sort: "updated", query: "" }).map((item) => item.id), ["created", "older"]);
  assert.deepEqual(dashboardLibraryTrips([older, secondEdit], { view: "all", sort: "updated", query: "" }).map((item) => item.id), ["created", "older"]);
});

test("recent ordering is descending, deterministic on ties, and consistent for every status view", () => {
  const planned = trip("planned", "planned", "2026-09-03T12:00:00.000Z");
  const active = trip("active", "draft", "2026-09-04T12:00:00.000Z");
  const archived = trip("archived", "archived", "2026-09-02T12:00:00.000Z");
  const tieLaterCreated = { ...trip("tie-z", "planned", active.updatedAt), createdAt: "2026-09-02T10:00:00.000Z" };
  const tieEarlierCreatedB = { ...trip("tie-b", "planned", active.updatedAt), createdAt: "2026-09-01T10:00:00.000Z" };
  const tieEarlierCreatedA = { ...trip("tie-a", "planned", active.updatedAt), createdAt: "2026-09-01T10:00:00.000Z" };
  const trips = [archived, planned, tieEarlierCreatedB, active, tieEarlierCreatedA, tieLaterCreated];

  assert.deepEqual(dashboardLibraryTrips(trips, { view: "all", sort: "updated", query: "" }).map((item) => item.id), ["tie-z", "active", "tie-a", "tie-b", "planned", "archived"]);
  assert.deepEqual(dashboardLibraryTrips(trips, { view: "planned", sort: "updated", query: "" }).map((item) => item.id), ["tie-z", "tie-a", "tie-b", "planned"]);
  assert.deepEqual(dashboardLibraryTrips(trips, { view: "draft", sort: "updated", query: "" }).map((item) => item.id), ["active"]);
  assert.deepEqual(dashboardLibraryTrips(trips, { view: "archived", sort: "updated", query: "" }).map((item) => item.id), ["archived"]);
});

test("dashboard cards prefer reviewed destination photography and reject unknown media", () => {
  const europe = { ...trip("europe"), stops: [stop("Paris", "France", 0), stop("Amsterdam", "Netherlands", 1)] };
  const asia = { ...trip("asia"), stops: [stop("Tokyo", "Japan", 0), stop("Beijing", "China", 1)] };
  const established = { ...trip("established"), stops: [stop("Lisbon", "Portugal", 0)] };
  const noPhoto = {
    ...trip("fallback"),
    stops: [stop("Unreviewed place", "Nowhere", 0)],
    planItems: [{ id: "map", stopId: "stop-0", dayNumber: 1, date: "", type: "activity" as const, title: "Map", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image: "/journey/product-shots/tour/map-workspace-mobile.png" }],
  };

  assert.equal(dashboardTripPhoto(europe)?.place, "Paris");
  assert.match(dashboardTripPhoto(europe)?.src ?? "", /\/1920px-Paris_/);
  assert.equal(dashboardTripPhoto(asia)?.place, "Tokyo");
  assert.equal(dashboardTripPhoto(established)?.place, "Lisbon");
  assert.equal(dashboardTripPhoto(noPhoto), null);
});
