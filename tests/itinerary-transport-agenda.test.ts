import assert from "node:assert/strict";
import test from "node:test";
import { omioBookingActionForLeg } from "../lib/easyt/booking-readiness.ts";
import { itineraryTransportAgenda, itineraryTransportAgendaStatus } from "../lib/easyt/itinerary-transport-agenda.ts";
import type { EasyTTrip, TripLeg } from "../lib/easyt/trip.ts";

function trip(): EasyTTrip {
  const id = "transport-agenda-trip";
  const legs: TripLeg[] = [
    {
      id: "arrival-london-paris", fromStopId: `${id}-origin`, toStopId: "paris", classification: "arrival", mode: "train", distanceKm: 460, durationMinutes: 240, doorToDoorMinutes: 300, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: {},
      fromEndpoint: { kind: "origin", id: `${id}-origin`, name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
      toEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.3522, 48.8566] },
    },
    {
      id: "paris-rome", fromStopId: "paris", toStopId: "rome", classification: "international", mode: "train", distanceKm: 1420, durationMinutes: 660, doorToDoorMinutes: 720, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: { planningEstimate: true },
      fromEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.3522, 48.8566] },
      toEndpoint: { kind: "stop", id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    },
    {
      id: "rome-athens", fromStopId: "rome", toStopId: "athens", classification: "international", mode: "flight", distanceKm: 1050, durationMinutes: 285, doorToDoorMinutes: 285, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: {},
      fromEndpoint: { kind: "stop", id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
      toEndpoint: { kind: "stop", id: "athens", name: "Athens", country: "Greece", coordinates: [23.7275, 37.9838] },
    },
    {
      id: "athens-london", fromStopId: "athens", toStopId: `${id}-end`, classification: "departure", mode: "unknown", distanceKm: 2390, durationMinutes: null, doorToDoorMinutes: null, provider: null, provenance: "unknown", confidence: "unknown", scheduleNeedsChecking: true, warnings: ["Live transport needs confirmation."], routeMetadata: {},
      fromEndpoint: { kind: "stop", id: "athens", name: "Athens", country: "Greece", coordinates: [23.7275, 37.9838] },
      toEndpoint: { kind: "end", id: `${id}-end`, name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
    },
  ];
  return {
    schemaVersion: 1, id, ownerId: "traveller", title: "London, Paris, Rome and Athens", status: "draft", startDate: "2026-10-01", endDate: "2026-10-10", travellers: 2, currency: "GBP",
    brief: {
      origin: "London", originCountry: "United Kingdom", originCoordinates: [-0.1276, 51.5072], originCanonicalPlaceId: "london", journeyEnd: { mode: "same_as_start" }, mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {},
      bookings: [{ id: "transport-rome-athens", type: "transport", title: "Rome to Athens flight", date: "2026-10-07", confirmation: "CONFIRMED", url: "https://example.com/booking" }],
    },
    stops: [
      { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
      { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9028, longitude: 12.4964, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 3 },
      { id: "athens", order: 2, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-10-07", departureDate: "2026-10-10", nights: 3 },
    ],
    legs,
    planItems: [
      { id: "day-1", stopId: "paris", dayNumber: 1, date: "2026-10-01", type: "arrival", title: "Arrive in Paris", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-4", stopId: "rome", dayNumber: 4, date: "2026-10-04", type: "transport", title: "Travel to Rome", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-7", stopId: "athens", dayNumber: 7, date: "2026-10-07", type: "transport", title: "Travel to Athens", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    ],
    recommendations: [], createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z",
  };
}

test("projects the full canonical journey in leg order without mutating trip state", () => {
  const source = trip();
  const before = JSON.stringify(source);
  const agenda = itineraryTransportAgenda(source);
  assert.deepEqual(agenda.map((item) => `${item.from.name} → ${item.to.name}`), [
    "London → Paris", "Paris → Rome", "Rome → Athens", "Athens → London",
  ]);
  assert.deepEqual(agenda.map((item) => item.date), ["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"]);
  assert.deepEqual(agenda.map((item) => item.dayNumber), [1, 4, 7, null]);
  assert.equal(JSON.stringify(source), before);
});

test("uses canonical transport bookings as the only booked truth", () => {
  const source = trip();
  const agenda = itineraryTransportAgenda(source);
  assert.deepEqual(agenda.map((item) => item.status), ["available", "available", "booked", "confirm"]);

  const leg = source.legs[1]!;
  assert.equal(itineraryTransportAgendaStatus(leg, null), "available");
  assert.equal(itineraryTransportAgendaStatus({ ...leg, scheduleNeedsChecking: true }, null), "confirm");
  assert.equal(itineraryTransportAgendaStatus({ ...leg, mode: "unknown", durationMinutes: null }, null), "confirm");
  assert.equal(itineraryTransportAgendaStatus(leg, { id: leg.id, type: "reservation", title: "Dinner", date: null, confirmation: null, url: null }), "available");
});

test("omits a fabricated final movement when the journey end is unknown", () => {
  const source = trip();
  source.brief.journeyEnd = { mode: "unknown" };
  assert.deepEqual(itineraryTransportAgenda(source).map((item) => item.leg.id), [
    "arrival-london-paris", "paris-rome", "rome-athens",
  ]);
});

test("falls back to canonical stop arrival dates and never invents a clock time", () => {
  const source = trip();
  source.planItems = source.planItems.filter((day) => day.stopId !== "rome");
  const item = itineraryTransportAgenda(source).find((candidate) => candidate.leg.id === "paris-rome");
  assert.equal(item?.date, "2026-10-04");
  assert.equal(item?.dayNumber, null);
  assert.equal("time" in (item ?? {}), false);
});

test("uses the existing Omio eligibility resolver and suppresses handoff for booked or endpoint legs", () => {
  const source = trip();
  const before = JSON.stringify(source);
  const intercity = source.legs[1]!;
  assert.equal(omioBookingActionForLeg(source, intercity, new Date("2026-09-10T12:00:00Z"))?.provider, "omio");
  assert.equal(JSON.stringify(source), before);

  source.brief.bookings = [{ id: `transport-${intercity.id}`, type: "transport", title: "Paris to Rome", date: "2026-10-04", confirmation: null, url: null }];
  assert.equal(omioBookingActionForLeg(source, intercity, new Date("2026-09-10T12:00:00Z")), null);
  assert.equal(omioBookingActionForLeg(source, source.legs[0]!, new Date("2026-09-10T12:00:00Z")), null);
  assert.equal(omioBookingActionForLeg(source, source.legs[3]!, new Date("2026-09-10T12:00:00Z")), null);
});

test("preserves unresolved island and multimodal evidence without inventing a direct road mode", () => {
  const source = trip();
  source.stops = [
    { id: "athens", order: 0, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
    { id: "naxos", order: 1, name: "Naxos", country: "Greece", latitude: 37.1036, longitude: 25.3777, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 3 },
  ];
  source.planItems = [{ id: "naxos-day", stopId: "naxos", dayNumber: 4, date: "2026-10-04", type: "transport", title: "Travel to Naxos", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }];
  source.legs = [{
    id: "athens-naxos", fromStopId: "athens", toStopId: "naxos", mode: "unknown", distanceKm: 175, durationMinutes: null, provider: null, provenance: "unknown", confidence: "unknown", scheduleNeedsChecking: true, warnings: ["Ferry or multimodal service needs confirmation."], routeMetadata: {},
    fromEndpoint: { kind: "stop", id: "athens", name: "Athens", country: "Greece", coordinates: [23.7275, 37.9838] },
    toEndpoint: { kind: "stop", id: "naxos", name: "Naxos", country: "Greece", coordinates: [25.3777, 37.1036] },
  }];
  const item = itineraryTransportAgenda(source)[0];
  assert.equal(item?.leg.mode, "unknown");
  assert.equal(item?.status, "confirm");
  assert.deepEqual(item?.leg.warnings, ["Ferry or multimodal service needs confirmation."]);
});

test("uses a different explicit end normally and leaves a simple trip empty", () => {
  const source = trip();
  source.brief.journeyEnd = { mode: "explicit", place: { name: "Milan", country: "Italy", canonicalPlaceId: "milan", coordinates: [9.19, 45.4642] } };
  source.legs[3] = {
    ...source.legs[3]!,
    id: "athens-milan",
    mode: "flight",
    durationMinutes: 300,
    doorToDoorMinutes: 300,
    confidence: "medium",
    scheduleNeedsChecking: false,
    toEndpoint: { kind: "end", id: `${source.id}-end`, name: "Milan", country: "Italy", canonicalPlaceId: "milan", coordinates: [9.19, 45.4642] },
  };
  assert.equal(itineraryTransportAgenda(source).at(-1)?.to.name, "Milan");

  source.legs = [];
  source.stops = source.stops.slice(0, 1);
  assert.deepEqual(itineraryTransportAgenda(source), []);
});
