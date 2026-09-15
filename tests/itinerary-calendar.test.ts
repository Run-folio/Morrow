import assert from "node:assert/strict";
import test from "node:test";

import { itineraryCalendarDays, itineraryCalendarNightBands, itineraryCalendarWeeks } from "../lib/easyt/itinerary-calendar.ts";
import type { EasyTTrip, PlanItem, TripLeg } from "../lib/easyt/trip.ts";

const day = (id: string, stopId: string, dayNumber: number, date: string, title: string, type: PlanItem["type"] = "activity"): PlanItem => ({
  id,
  stopId,
  dayNumber,
  date,
  type,
  title,
  reason: "",
  notes: [],
  startsAt: null,
  endsAt: null,
  bookingUrl: null,
  latitude: null,
  longitude: null,
});

function representativeTrip(): EasyTTrip {
  const legs: TripLeg[] = [
    {
      id: "arrival-tokyo-first", fromStopId: "calendar-trip-origin", toStopId: "tokyo-first", classification: "arrival", mode: "flight", distanceKm: 9500, durationMinutes: 900, doorToDoorMinutes: 1020, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: {},
      fromEndpoint: { kind: "origin", id: "calendar-trip-origin", name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
      toEndpoint: { kind: "stop", id: "tokyo-first", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
    },
    {
      id: "tokyo-kyoto", fromStopId: "tokyo-first", toStopId: "kyoto", classification: "intercity", mode: "train", distanceKm: 450, durationMinutes: 150, doorToDoorMinutes: 210, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: {},
      fromEndpoint: { kind: "stop", id: "tokyo-first", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
      toEndpoint: { kind: "stop", id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
    },
    {
      id: "kyoto-tokyo-return", fromStopId: "kyoto", toStopId: "tokyo-return", classification: "intercity", mode: "unknown", distanceKm: 450, durationMinutes: null, doorToDoorMinutes: null, provider: null, provenance: "unknown", confidence: "unknown", scheduleNeedsChecking: true, warnings: ["Live service needs confirmation."], routeMetadata: {},
      fromEndpoint: { kind: "stop", id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
      toEndpoint: { kind: "stop", id: "tokyo-return", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
    },
  ];
  return {
    schemaVersion: 1,
    id: "calendar-trip",
    ownerId: "traveller",
    title: "Tokyo, Kyoto and Tokyo",
    status: "draft",
    startDate: "2026-08-29",
    endDate: "2026-09-02",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      originCountry: "United Kingdom",
      originCoordinates: [-0.1276, 51.5072],
      originCanonicalPlaceId: "london",
      journeyEnd: { mode: "unknown" },
      mustDo: "Markets and temples",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      itineraryIdeas: [
        { id: "market", stopId: "tokyo-first", placeId: "toyosu-market", title: "Toyosu Market", area: "Tokyo", category: "activity", source: "personalised-recommendation", sourceUrl: "https://example.com/market", reasons: ["interest-relevance"], dayId: "tokyo-day-2", dayPart: "morning" },
        { id: "kyoto-tour", stopId: "kyoto", placeId: "kyoto-tour", title: "Kyoto full-day tour", area: "Kyoto", category: "activity", source: "live-provider-inventory", sourceUrl: "https://example.com/tour", reasons: ["destination-significance"], dayId: "kyoto-day-3", dayPart: null, provider: "viator", providerProductId: "tour-1", providerMetadata: { duration: { fixedMinutes: 600 }, provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-08-01T12:00:00.000Z" } } },
        { id: "dinner", stopId: "kyoto", placeId: "gion-dinner", title: "Gion dinner", area: "Kyoto", category: "restaurant", source: "personalised-recommendation", sourceUrl: "https://example.com/dinner", reasons: ["interest-relevance"], dayId: "kyoto-day-4", dayPart: "evening", startsAt: "19:30" },
        { id: "return-walk", stopId: "tokyo-return", placeId: "return-walk", title: "Return neighbourhood walk", area: "Tokyo", category: "activity", source: "traveller-visit-intent", sourceUrl: "https://example.com/walk", reasons: ["interest-relevance"], dayId: "tokyo-return-day-5", dayPart: null },
      ],
      bookings: [
        { id: "stay-tokyo-first", type: "stay", title: "Tokyo Station Hotel", date: "2026-08-29", endDate: "2026-08-31", confirmation: "TOKYO-1", url: null },
        { id: "transport-tokyo-kyoto", type: "transport", title: "Tokyo to Kyoto train", date: "2026-08-31", confirmation: "TRAIN-1", url: "https://example.com/train" },
        { id: "dinner-booking", type: "reservation", title: "Tea ceremony", date: "2026-09-01", confirmation: null, url: null },
        { id: "stay-tokyo-return", type: "stay", title: "Shinjuku Hotel", date: "2026-09-02", endDate: "2026-09-03", confirmation: "TOKYO-2", url: null },
      ],
    },
    stops: [
      { id: "tokyo-first", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2026-08-29", departureDate: "2026-08-31", nights: 2 },
      { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-08-31", departureDate: "2026-09-02", nights: 2 },
      { id: "tokyo-return", order: 2, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2026-09-02", departureDate: "2026-09-03", nights: 1 },
    ],
    legs,
    planItems: [
      day("tokyo-day-1", "tokyo-first", 1, "2026-08-29", "Arrive in Tokyo", "arrival"),
      day("tokyo-day-2", "tokyo-first", 2, "2026-08-30", "Explore Tokyo"),
      day("kyoto-day-3", "kyoto", 3, "2026-08-31", "Travel to Kyoto", "transport"),
      day("kyoto-day-4", "kyoto", 4, "2026-09-01", "Explore Kyoto"),
      day("tokyo-return-day-5", "tokyo-return", 5, "2026-09-02", "Return to Tokyo", "transport"),
    ],
    recommendations: [],
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  };
}

test("projects canonical days and repeated destinations by stable IDs without mutating the trip", () => {
  const trip = representativeTrip();
  const before = JSON.stringify(trip);
  const days = itineraryCalendarDays(trip);
  assert.deepEqual(days.map((item) => item.id), ["tokyo-day-1", "tokyo-day-2", "kyoto-day-3", "kyoto-day-4", "tokyo-return-day-5"]);
  assert.deepEqual(days.filter((item) => item.stop?.name === "Tokyo").map((item) => item.stop?.id), ["tokyo-first", "tokyo-first", "tokyo-return"]);
  assert.equal(JSON.stringify(trip), before);
});

test("night bands preserve repeated occurrence IDs and exclude departure nights", () => {
  const trip = representativeTrip();
  const bands = itineraryCalendarWeeks(trip).flatMap(itineraryCalendarNightBands);
  assert.deepEqual(bands.map((band) => [band.stop.id, band.span]), [["tokyo-first", 2], ["kyoto", 2], ["tokyo-return", 1]]);
  trip.stops[2]!.departureDate = "2026-09-02";
  assert.equal(itineraryCalendarWeeks(trip).flatMap(itineraryCalendarNightBands).some((band) => band.stop.id === "tokyo-return"), false);
});

test("legacy day context is retained outside events while identical authored text remains planned", () => {
  const trip = representativeTrip();
  const text = "Choose one walkable neighbourhood";
  trip.planItems[0]!.notes = [text];
  trip.planItems[1]!.notes = [text];
  trip.brief.customActivities = { 2: [text] };
  const days = itineraryCalendarDays(trip);
  assert.equal(days[0]!.contextNotes[0]!.title, text);
  assert.equal(days[0]!.items.some((item) => item.kind === "activity" && item.activity.title === text), false);
  assert.equal(days[1]!.items.some((item) => item.kind === "activity" && item.activity.title === text), true);
  assert.equal(trip.planItems[0]!.notes[0], text);
});

test("night bands mark continuation over a Monday boundary without adding nights", () => {
  const trip = representativeTrip();
  trip.stops[0]!.departureDate = "2026-09-02";
  trip.planItems[2]!.stopId = "tokyo-first";
  const bands = itineraryCalendarWeeks(trip).flatMap(itineraryCalendarNightBands).filter((band) => band.stop.id === "tokyo-first");
  assert.deepEqual(bands.map((band) => [band.span, band.continued]), [[2, false], [1, true]]);
});

test("projects each canonical transfer once with truthful booked and unknown state", () => {
  const transfers = itineraryCalendarDays(representativeTrip()).flatMap((day) => day.items.filter((item) => item.kind === "transfer"));
  assert.deepEqual(transfers.map((item) => item.agenda.leg.id), ["arrival-tokyo-first", "tokyo-kyoto", "kyoto-tokyo-return"]);
  assert.deepEqual(transfers.map((item) => item.agenda.status), ["available", "booked", "confirm"]);
  assert.equal(transfers[2]?.agenda.leg.durationMinutes, null);
});

test("keeps a canonical final departure visible on the last owned day without inventing a new day", () => {
  const trip = representativeTrip();
  trip.brief.journeyEnd = { mode: "explicit", place: { name: "London", country: "United Kingdom", canonicalPlaceId: "london", coordinates: [-0.1276, 51.5072] } };
  trip.endDate = "2026-09-03";
  trip.legs.push({
    id: "tokyo-return-london", fromStopId: "tokyo-return", toStopId: "calendar-trip-end", classification: "departure", mode: "flight", distanceKm: 9500, durationMinutes: 900, doorToDoorMinutes: 1020, provider: "Planning estimate", provenance: "planning_estimate", confidence: "medium", routeMetadata: {},
    fromEndpoint: { kind: "stop", id: "tokyo-return", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
    toEndpoint: { kind: "end", id: "calendar-trip-end", name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
  });
  const days = itineraryCalendarDays(trip);
  assert.equal(days.at(-1)?.items.some((item) => item.kind === "transfer" && item.agenda.leg.id === "tokyo-return-london"), true);
  assert.equal(days.at(-1)?.departure, true);
});

test("preserves day parts, explicit times, full-day duration and time-not-set semantics", () => {
  const activities = itineraryCalendarDays(representativeTrip()).flatMap((day) => day.items.filter((item) => item.kind === "activity"));
  assert.deepEqual(activities.map((item) => [item.activity.id, item.schedule]), [
    ["market", { kind: "day-part", dayPart: "morning" }],
    ["kyoto-tour", { kind: "full-day" }],
    ["dinner", { kind: "time", startsAt: "19:30" }],
    ["return-walk", { kind: "time-not-set" }],
  ]);
});

test("projects accommodation and dated bookings without duplicating a transport booking", () => {
  const days = itineraryCalendarDays(representativeTrip());
  assert.equal(days[0]?.items.some((item) => item.kind === "accommodation" && item.booking.id === "stay-tokyo-first"), true);
  assert.equal(days[3]?.items.some((item) => item.kind === "booking" && item.booking.id === "dinner-booking"), true);
  assert.equal(days.flatMap((day) => day.items).filter((item) => item.kind === "transfer" && item.agenda.booking?.id === "transport-tokyo-kyoto").length, 1);
  assert.equal(days.flatMap((day) => day.items).filter((item) => item.kind === "booking" && item.booking.id === "transport-tokyo-kyoto").length, 0);
});

test("keeps a continuous week projection across month boundaries", () => {
  const weeks = itineraryCalendarWeeks(representativeTrip());
  assert.deepEqual(weeks.map((week) => week.startDate), ["2026-08-24", "2026-08-31"]);
  assert.deepEqual(weeks.flatMap((week) => week.days).filter(Boolean).map((day) => day!.day.date), ["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
});

test("represents every canonical day in a five-week month-crossing trip without pagination", () => {
  const trip = representativeTrip();
  trip.legs = [];
  trip.brief.bookings = [];
  trip.brief.itineraryIdeas = [];
  trip.startDate = "2026-08-20";
  trip.endDate = "2026-09-23";
  trip.stops = [{ ...trip.stops[0]!, arrivalDate: trip.startDate, departureDate: trip.endDate, nights: 34 }];
  trip.planItems = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 20 + index)).toISOString().slice(0, 10);
    return day(`long-day-${index + 1}`, trip.stops[0]!.id, index + 1, date, index === 0 ? "Arrive in Tokyo" : "Explore Tokyo", index === 0 ? "arrival" : "activity");
  });

  const weeks = itineraryCalendarWeeks(trip);
  const projectedDates = weeks.flatMap((week) => week.days).filter(Boolean).map((item) => item!.day.date);
  assert.equal(weeks.length, 6);
  assert.equal(projectedDates.length, 35);
  assert.equal(projectedDates[0], "2026-08-20");
  assert.equal(projectedDates.at(-1), "2026-09-23");
});

test("keeps every day reachable in a 65-day trip across month boundaries", () => {
  const trip = representativeTrip();
  trip.legs = [];
  trip.brief.bookings = [];
  trip.brief.itineraryIdeas = [];
  trip.startDate = "2026-08-21";
  trip.endDate = "2026-10-24";
  trip.stops = [{ ...trip.stops[0]!, arrivalDate: trip.startDate, departureDate: "2026-10-25", nights: 65 }];
  trip.planItems = Array.from({ length: 65 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 21 + index)).toISOString().slice(0, 10);
    return day(`extended-day-${index + 1}`, trip.stops[0]!.id, index + 1, date, index === 0 ? "Arrive in Tokyo" : "Explore Tokyo", index === 0 ? "arrival" : "activity");
  });

  const weeks = itineraryCalendarWeeks(trip);
  const projectedDays = weeks.flatMap((week) => week.days).filter(Boolean).map((item) => item!.day);
  assert.equal(weeks.length, 10);
  assert.equal(projectedDays.length, 65);
  assert.equal(projectedDays[0]?.id, "extended-day-1");
  assert.equal(projectedDays.at(-1)?.id, "extended-day-65");
  assert.equal(projectedDays.at(-1)?.date, "2026-10-24");
});
