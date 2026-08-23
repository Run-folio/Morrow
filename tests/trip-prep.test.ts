import assert from "node:assert/strict";
import test from "node:test";

import { deriveTripPrepTasks, nextTripPrepTask, tripDepartureCountdown, tripPrepProgress } from "../lib/easyt/trip-prep.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1,
  id: "prep-trip",
  ownerId: null,
  title: "Peru",
  status: "draft",
  startDate: "2026-10-01",
  endDate: "2026-10-06",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "London",
    mustDo: "",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: {},
    checklist: [{ id: "offline", label: "Save offline maps", complete: false }],
  },
  stops: [{ id: "cusco", order: 0, name: "Cusco", country: "Peru", latitude: -13.53, longitude: -71.97, arrivalDate: "2026-10-01", departureDate: "2026-10-06", nights: 5 }],
  legs: [],
  planItems: [],
  recommendations: [],
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
});

test("derives directive prep tasks from canonical readiness and checklist state", () => {
  const tasks = deriveTripPrepTasks({
    trip: trip(),
    profile: { nationalities: [], residenceCountry: "", passportExpiryMonth: "" },
    bookingActions: [{ id: "trip-flights", category: "flight", provider: "google-flights", title: "Check flights", detail: "Live fares stay with the provider.", cta: "Check flights", href: "https://example.test/flights", tripId: "prep-trip", affiliate: false, livePrice: false }],
    readinessCards: [{ id: "insurance", priority: "useful", title: "Travel insurance", detail: "Review cover." }],
    now: new Date("2026-09-10T12:00:00"),
  });
  assert.deepEqual(tasks.map((task) => task.id), ["traveller-passport", "accommodation", "travel-insurance", "trip-flights", "checklist-offline"]);
  assert.equal(tasks.find((task) => task.id === "traveller-passport")?.status, "urgent");
  assert.equal(tasks.find((task) => task.id === "accommodation")?.action?.href, "/journey/prep-trip/map?stop=cusco&mode=stay");
  assert.equal(tasks.find((task) => task.id === "checklist-offline")?.category, "nice");
  assert.equal(nextTripPrepTask(tasks)?.id, "traveller-passport");
});

test("progress is derived rather than persisted", () => {
  const source = trip();
  source.brief.bookings = [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-10-01", confirmation: null, url: null }];
  source.brief.checklist = source.brief.checklist?.map((item) => ({ ...item, complete: true }));
  const tasks = deriveTripPrepTasks({
    trip: source,
    profile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-01" },
    bookingActions: [],
    readinessCards: [],
  });
  assert.deepEqual(tripPrepProgress(tasks), { complete: 3, inProgress: 0, toDo: 0, total: 3, percent: 100 });
  assert.equal(nextTripPrepTask(tasks), null);
});

test("countdown handles dated, missing, today and started trips without fake values", () => {
  assert.equal(tripDepartureCountdown("2026-10-01", new Date("2026-09-01T12:00:00")).label, "30 days to go");
  assert.equal(tripDepartureCountdown("", new Date("2026-09-01T12:00:00")).days, null);
  assert.equal(tripDepartureCountdown("2026-09-01", new Date("2026-09-01T12:00:00")).label, "Departure is today.");
  assert.equal(tripDepartureCountdown("2026-08-31", new Date("2026-09-01T12:00:00")).label, "This trip has started.");
});
