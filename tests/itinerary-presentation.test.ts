import assert from "node:assert/strict";
import test from "node:test";

import { itineraryNotesForDisplay, semanticSamePlaceArrival } from "../lib/easyt/itinerary-presentation.ts";
import type { EasyTTrip, PlanItem, TripLeg } from "../lib/easyt/trip.ts";

test("a transfer summary removes only repeated generated route and estimate rows", () => {
  const leg = { fromStopId: "cusco", toStopId: "valley", durationMinutes: 57 } as TripLeg;
  const trip = { stops: [{ id: "cusco", name: "Cusco" }, { id: "valley", name: "Sacred Valley" }] } as Pick<EasyTTrip, "stops">;
  const day = {
    id: "valley-day-1",
    notes: [
      "Cusco → Sacred Valley",
      "Estimated door-to-door: about 0h 57m",
      "Check in, take a short walk nearby and keep dinner easy",
    ],
  } as Pick<PlanItem, "id" | "notes">;
  assert.deepEqual(itineraryNotesForDisplay(day, leg, trip), ["Check in, take a short walk nearby and keep dinner easy"]);
});

test("ordinary itinerary notes remain untouched without an incoming leg", () => {
  const notes = ["Keep the afternoon flexible"];
  assert.deepEqual(itineraryNotesForDisplay({ id: "day-1", notes }, null, { stops: [] }), notes);
});

test("an unknown canonical leg suppresses a stale generated duration note", () => {
  const leg = {
    fromStopId: "flores",
    toStopId: "san-ignacio",
    durationMinutes: null,
    fromEndpoint: { name: "Flores" },
    toEndpoint: { name: "San Ignacio" },
  } as TripLeg;
  const notes = ["Flores → San Ignacio", "Estimated door-to-door: about 4h 15m", "Check current border details"];
  assert.deepEqual(itineraryNotesForDisplay({ id: "day-1", notes }, leg, { stops: [] }), ["Check current border details"]);
});

test("a canonical same-place origin and opening stay suppress stale generated movement rows only", () => {
  const day = {
    id: "london-day-1",
    stopId: "london-stop",
    dayNumber: 1,
    notes: ["London → London", "Morrovia planning estimate: about 0h 35m door to door; check current schedules.", "Check in and keep dinner easy"],
  } as PlanItem;
  const trip = {
    brief: { origin: "London", originCanonicalPlaceId: "london", originCountry: "United Kingdom", originCoordinates: [-0.1276, 51.5072] },
    stops: [{ id: "london-stop", name: "London", country: "United Kingdom", canonicalPlaceId: "london", longitude: -0.1276, latitude: 51.5072 }],
    planItems: [day],
  } as Pick<EasyTTrip, "brief" | "stops" | "planItems">;
  assert.deepEqual(itineraryNotesForDisplay(day, null, trip), ["Check in and keep dinner easy"]);
});

test("a distinct origin and first stay retains its fallback transfer rows", () => {
  const day = {
    id: "paris-day-1",
    stopId: "paris",
    dayNumber: 1,
    notes: ["London → Paris", "Morrovia planning estimate: about 3h 15m door to door; check current schedules.", "Check in"],
  } as PlanItem;
  const trip = {
    brief: { origin: "London", originCanonicalPlaceId: "london", originCountry: "United Kingdom", originCoordinates: [-0.1276, 51.5072] },
    stops: [{ id: "paris", name: "Paris", country: "France", canonicalPlaceId: "paris", longitude: 2.3522, latitude: 48.8566 }],
    planItems: [day],
  } as Pick<EasyTTrip, "brief" | "stops" | "planItems">;
  assert.deepEqual(itineraryNotesForDisplay(day, null, trip), day.notes);
});

test("consecutive semantic stops at one canonical place do not recreate movement", () => {
  const first = { id: "rome-centre-day", stopId: "rome-centre", dayNumber: 1, notes: ["Explore Rome"] } as PlanItem;
  const second = {
    id: "roma-day",
    stopId: "roma-provider-role",
    dayNumber: 2,
    notes: ["Rome → Roma", "Estimated door-to-door: about 0h 30m", "Check in near the station"],
  } as PlanItem;
  const trip = {
    brief: { origin: "Paris" },
    stops: [
      { id: "rome-centre", name: "Rome", country: "Italy", canonicalPlaceId: "rome", longitude: 12.4964, latitude: 41.9028 },
      { id: "roma-provider-role", name: "Roma", country: "Italy", canonicalPlaceId: "rome", longitude: 12.4964, latitude: 41.9028 },
    ],
    planItems: [first, second],
  } as Pick<EasyTTrip, "brief" | "stops" | "planItems">;
  assert.deepEqual(itineraryNotesForDisplay(second, null, trip), ["Check in near the station"]);
});

test("same canonical city arrival is semantic and never presented as a zero-minute journey", () => {
  const leg = {
    id: "same-city", fromStopId: "origin", toStopId: "rome", classification: "arrival", mode: "walk",
    distanceKm: 0, durationMinutes: 0, doorToDoorMinutes: 0, provider: "The journey origin and first overnight stop are the same canonical place.",
    routeMetadata: { source: "canonical-endpoint-identity" },
    fromEndpoint: { kind: "origin", id: "origin", name: "Rome", canonicalPlaceId: "rome", coordinates: [12.49, 41.9] },
    toEndpoint: { kind: "stop", id: "rome", name: "Rome", canonicalPlaceId: "rome", coordinates: [12.49, 41.9] },
  } as TripLeg;
  const trip = { stops: [] } as unknown as EasyTTrip;
  assert.equal(semanticSamePlaceArrival(trip, leg), "Arrive in Rome");
  assert.doesNotMatch(semanticSamePlaceArrival(trip, leg) ?? "", /0m|Rome → Rome/);
  assert.equal(semanticSamePlaceArrival(trip, { ...leg, classification: "local" }), null);
});
