import assert from "node:assert/strict";
import test from "node:test";

import { tripReadinessSummary } from "../lib/easyt/trip-readiness-summary.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function trip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1, id: "readiness-summary", ownerId: "owner-a", title: "Readiness", status: "planned", startDate: "2026-10-01", endDate: "2026-10-03", travellers: 2, currency: "GBP",
    brief: { origin: "London", originCountry: "United Kingdom", originCoordinates: [-0.1276, 51.5072], mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, checklist: [{ id: "documents", label: "Check documents", complete: false }] },
    stops: [{ id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 2 }],
    legs: [{ id: "arrival", fromStopId: "readiness-summary-origin", toStopId: "paris", fromEndpoint: { kind: "origin", id: "readiness-summary-origin", name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] }, toEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.35, 48.85] }, classification: "arrival", mode: "train", distanceKm: 344, durationMinutes: 270, provider: "Verified fixture", provenance: "provider", confidence: "high", scheduleNeedsChecking: false, warnings: [], routeMetadata: { planningEstimate: false, decisionOption: "fixture" } }], planItems: [], recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
    ...overrides,
  };
}

const signal = (source: EasyTTrip, id: "itinerary" | "stays" | "route" | "prep") => tripReadinessSummary(source).signals.find((item) => item.id === id)!;

test("summary distinguishes empty and partial itineraries from complete coverage", () => {
  const empty = trip();
  assert.equal(signal(empty, "itinerary").complete, false);
  const partial = trip({ planItems: [{ id: "day-1", stopId: "paris", dayNumber: 1, date: "2026-10-01", type: "activity", title: "Day one", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }] });
  assert.equal(signal(partial, "itinerary").complete, false);
  const complete = trip({ planItems: [1, 2, 3].map((dayNumber) => ({ id: `day-${dayNumber}`, stopId: "paris", dayNumber, date: `2026-10-0${dayNumber}`, type: "activity" as const, title: `Day ${dayNumber}`, reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })) });
  assert.equal(signal(complete, "itinerary").complete, true);
});

test("summary derives stays and Prep only from saved canonical facts", () => {
  const source = trip();
  assert.equal(signal(source, "stays").complete, false);
  assert.equal(signal(source, "prep").complete, false);
  source.brief.bookings = [{ id: "stay-paris", type: "stay", title: "Paris stay", date: "2026-10-01", confirmation: null, url: null }];
  source.brief.checklist = [{ id: "documents", label: "Check documents", complete: true }];
  assert.equal(signal(source, "stays").complete, true);
  assert.equal(signal(source, "prep").complete, true);
});

test("a critical route issue blocks the route signal without changing trip status", () => {
  const source = trip({ recommendations: [{ id: "critical-route", rule: "route-conflict", severity: "critical", message: "Route conflict", evidence: "Test", affectedDays: [], confidence: "high", proposedChange: {}, status: "open", checkedAt: "2026-08-01" }] });
  assert.equal(signal(source, "route").blocked, true);
  assert.equal(source.status, "planned");
});

test("planned but incomplete is not presented as ready, while fully covered facts are", () => {
  const incomplete = trip();
  assert.equal(tripReadinessSummary(incomplete).isReady, false);
  const complete = trip({
    planItems: [1, 2, 3].map((dayNumber) => ({ id: `day-${dayNumber}`, stopId: "paris", dayNumber, date: `2026-10-0${dayNumber}`, type: "activity" as const, title: `Day ${dayNumber}`, reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
    brief: { ...incomplete.brief, checklist: [{ id: "documents", label: "Check documents", complete: true }], bookings: [{ id: "stay-paris", type: "stay", title: "Paris stay", date: "2026-10-01", confirmation: null, url: null }] },
  });
  assert.deepEqual(tripReadinessSummary(complete).signals.map((item) => [item.id, item.complete, item.blocked, item.label]), [
    ["itinerary", true, false, "3 days planned"],
    ["stays", true, false, "1 of 1 stays sorted"],
    ["route", true, false, "Route checks clear"],
    ["prep", true, false, "1 of 1 saved Prep tasks complete"],
  ]);
  assert.equal(tripReadinessSummary(complete).isReady, true);
});
