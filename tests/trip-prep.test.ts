import assert from "node:assert/strict";
import test from "node:test";

import { deriveTripPrepTasks, groupTripPrepTasks } from "../lib/easyt/trip-prep.ts";
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
  assert.deepEqual(groupTripPrepTasks(tasks).must.map((task) => task.id), ["traveller-passport", "accommodation", "travel-insurance", "trip-flights"]);
  assert.deepEqual(groupTripPrepTasks(tasks).nice.map((task) => task.id), ["checklist-offline"]);
});

test("completed canonical state produces only completed preparation tasks", () => {
  const source = trip();
  source.brief.bookings = [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-10-01", confirmation: null, url: null }];
  source.brief.checklist = source.brief.checklist?.map((item) => ({ ...item, complete: true }));
  const tasks = deriveTripPrepTasks({
    trip: source,
    profile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-01" },
    bookingActions: [],
    readinessCards: [],
  });
  assert.ok(tasks.length > 0);
  assert.equal(tasks.every((task) => task.status === "complete"), true);
});

test("missing and invalid dates remain visible blocking preparation tasks", () => {
  const source = trip();
  source.startDate = "";
  source.endDate = "";
  source.stops[0] = { ...source.stops[0], arrivalDate: null, departureDate: null };
  const tasks = deriveTripPrepTasks({
    trip: source,
    profile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-01" },
    bookingActions: [],
    readinessCards: [],
    now: new Date("2026-09-01T12:00:00"),
  });
  assert.equal(tasks.find((task) => task.id === "trip-dates")?.status, "to-do");
  assert.match(tasks.find((task) => task.id === "accommodation")?.detail ?? "", /confirm the missing stop dates/i);
  assert.equal(tasks.some((task) => task.status !== "complete"), true);

  source.startDate = "2026-02-31";
  source.endDate = "2026-02-20";
  assert.equal(deriveTripPrepTasks({ trip: source, profile: { nationalities: [], residenceCountry: "", passportExpiryMonth: "" }, bookingActions: [], readinessCards: [] })[0]?.id, "trip-dates");
});

test("an explicit passport checklist never claims missing traveller context was saved", () => {
  const source = trip();
  source.brief.checklist = [{ id: "passport", label: "Review passport validity", complete: true }];
  const passport = deriveTripPrepTasks({
    trip: source,
    profile: { nationalities: [], residenceCountry: "", passportExpiryMonth: "" },
    bookingActions: [],
    readinessCards: [],
  }).find((task) => task.id === "traveller-passport");
  assert.equal(passport?.title, "Review passport validity");
  assert.match(passport?.detail ?? "", /saved trip checklist/i);
  assert.doesNotMatch(passport?.detail ?? "", /traveller context is saved/i);
});

test("ended trips retain records without urgent pre-departure passport work", () => {
  const source = trip();
  source.startDate = "2026-08-01";
  source.endDate = "2026-08-05";
  const tasks = deriveTripPrepTasks({
    trip: source,
    profile: { nationalities: [], residenceCountry: "", passportExpiryMonth: "" },
    bookingActions: [],
    readinessCards: [],
    now: new Date(2026, 8, 1, 12),
  });
  assert.notEqual(tasks.find((task) => task.id === "traveller-passport")?.status, "urgent");
});

test("missing traveller details are urgent on departure day but not months in advance", () => {
  const source = trip();
  source.startDate = "2026-09-01";
  source.endDate = "2026-09-06";
  source.brief.checklist = source.brief.checklist?.filter((item) => !/passport|visa|entry/i.test(`${item.id} ${item.label}`));
  const profile = { nationalities: [], residenceCountry: "", passportExpiryMonth: "" };
  const departureDay = deriveTripPrepTasks({ trip: source, profile, bookingActions: [], readinessCards: [], now: new Date("2026-09-01T12:00:00") });
  const farFuture = deriveTripPrepTasks({ trip: source, profile, bookingActions: [], readinessCards: [], now: new Date("2026-01-01T12:00:00") });
  assert.equal(departureDay.find((task) => task.id === "traveller-passport")?.status, "urgent");
  assert.equal(farFuture.find((task) => task.id === "traveller-passport")?.status, "to-do");
});

test("avoid-driving excludes generated driving work from readiness progress", () => {
  const source = trip();
  source.brief.bookings = [{ id: "stay-cusco", type: "stay", title: "Cusco stay", date: "2026-10-01", confirmation: null, url: null }];
  source.brief.checklist = source.brief.checklist?.map((item) => ({ ...item, complete: true }));
  source.brief.intent = {
    version: 1,
    travellers: 2,
    timing: { flexibility: "fixed", durationDays: 6 },
    hardConstraints: { originRequired: true, mustSeeStopIds: ["cusco"], optionalStopIds: [], fixedCommitments: [], avoidDriving: true },
    preferences: { budgetSensitivity: "mid", transportModes: ["train", "flight"], pace: "balanced", interests: [], dislikes: [] },
  };
  const tasks = deriveTripPrepTasks({
    trip: source,
    profile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-01" },
    bookingActions: [],
    readinessCards: [{ id: "driving", priority: "useful", title: "If you plan to drive", detail: "Should not block this trip." }],
  });
  assert.equal(tasks.some((task) => task.id === "driving-readiness"), false);
  assert.equal(tasks.every((task) => task.status === "complete"), true);
});
