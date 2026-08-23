import assert from "node:assert/strict";
import test from "node:test";
import { buildBookingReadiness } from "../lib/easyt/booking-readiness.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1, id: "bookable", ownerId: null, title: "Bookable", status: "draft", startDate: "2026-10-01", endDate: "2026-10-06", travellers: 2, currency: "GBP",
  brief: { origin: "London, United Kingdom", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: { paris: ["Louvre"] }, decisionSelections: { routeOrder: "entered", transportByLeg: { leg: "fastest" } } },
  stops: [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
    { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 2 },
  ],
  legs: [{ id: "leg", fromStopId: "paris", toStopId: "rome", mode: "flight", distanceKm: 1100, durationMinutes: 330, provider: "Estimate", routeMetadata: { planningEstimate: true, decisionOption: "fastest" } }],
  planItems: Array.from({ length: 6 }, (_, index) => ({ id: `day-${index + 1}`, stopId: index < 3 ? "paris" : "rome", dayNumber: index + 1, date: `2026-10-0${index + 1}`, type: index === 0 || index === 3 ? "arrival" as const : "activity" as const, title: "Plan", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
  recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

test("creates contextual accommodation, activity, flight and connectivity actions from stable itinerary data", () => {
  const actions = buildBookingReadiness(trip());
  assert.equal(actions.filter((action) => action.category === "accommodation").length, 2);
  assert.equal(actions.some((action) => action.category === "activity" && action.stopId === "paris"), true);
  assert.equal(actions.some((action) => action.category === "flight"), true);
  assert.equal(actions.some((action) => action.category === "connectivity"), true);
  assert.match(actions.find((action) => action.id === "stay-paris")?.href ?? "", /checkin=2026-10-01/);
});

test("marks configured partner actions without claiming a live price", () => {
  const actions = buildBookingReadiness(trip(), { bookingUrl: "https://partner.example/stays", sailyUrl: "https://partner.example/esim" });
  const stay = actions.find((action) => action.id === "stay-paris");
  assert.equal(stay?.affiliate, true);
  assert.equal(stay?.provider, "booking.com");
  assert.equal(stay?.livePrice, false);
});

test("does not offer flights while a blocking schedule conflict remains", () => {
  const source = trip();
  source.brief.cascadeStatus = { conflicts: ["Paris is locked outside the route."], affectedBookingIds: [], affectedPlanItemCount: 0 };
  assert.equal(buildBookingReadiness(source).some((action) => action.category === "flight"), false);
});
