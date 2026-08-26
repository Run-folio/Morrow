import assert from "node:assert/strict";
import test from "node:test";
import { affiliatePartners, buildBookingReadiness, getAccommodationBookingUrl, omioBookingActionForLeg } from "../lib/easyt/booking-readiness.ts";
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

test("creates Trip.com accommodation, activity, flight and connectivity actions from stable itinerary data", () => {
  const actions = buildBookingReadiness(trip());
  assert.equal(actions.filter((action) => action.category === "accommodation").length, 2);
  assert.equal(actions.some((action) => action.category === "activity" && action.stopId === "paris"), true);
  assert.equal(actions.some((action) => action.category === "flight"), true);
  assert.equal(actions.some((action) => action.category === "connectivity"), true);
  const stay = actions.find((action) => action.id === "stay-paris");
  assert.equal(stay?.href, affiliatePartners.tripCom.accommodationUrl);
  assert.equal(stay?.provider, "trip.com");
  assert.equal(stay?.cta, "Find accommodation on Trip.com");
  assert.equal(stay?.affiliate, true);
});

test("the generic Trip.com URL is never enriched with trip context", () => {
  const source = trip();
  const stop = source.stops[0]!;
  const href = getAccommodationBookingUrl({
    stop,
    dates: { checkIn: "2026-10-01", checkOut: "2026-10-04" },
    travellers: 2,
  });
  assert.equal(href, "https://www.trip.com/t/pdAWQqi56W2");
  assert.equal(new URL(href).search, "");

  const actions = buildBookingReadiness(source, { sailyUrl: "https://partner.example/esim" });
  const stay = actions.find((action) => action.id === "stay-paris");
  assert.equal(stay?.affiliate, true);
  assert.equal(stay?.provider, "trip.com");
  assert.equal(stay?.livePrice, false);
  assert.equal(stay?.href, affiliatePartners.tripCom.accommodationUrl);
});

test("uses the approved Viator general activities URL without adding trip parameters", () => {
  const action = buildBookingReadiness(trip(), {
    activitiesUrl: affiliatePartners.viator.activitiesUrl,
    activitiesProvider: affiliatePartners.viator.provider,
  }).find((candidate) => candidate.id === "activity-paris");

  assert.equal(action?.href, affiliatePartners.viator.activitiesUrl);
  assert.equal(action?.provider, "viator");
  assert.equal(action?.cta, "Find activities on Viator");
  assert.equal(action?.affiliate, true);
});

test("keeps existing Omio and Viator partner destinations unchanged", () => {
  assert.equal(affiliatePartners.omio.transportUrl, "https://omio.sjv.io/2RBeqD");
  assert.equal(affiliatePartners.viator.activitiesUrl, "https://www.viator.com/?pid=P00315646&mcid=42383&medium=link&campaign=morrovia-general-activities");
});

test("does not offer flights while a blocking schedule conflict remains", () => {
  const source = trip();
  source.brief.cascadeStatus = { conflicts: ["Paris is locked outside the route."], affectedBookingIds: [], affectedPlanItemCount: 0 };
  assert.equal(buildBookingReadiness(source).some((action) => action.category === "flight"), false);
});

test("offers the exact Omio link for unbooked major train, coach, flight and ferry transfers", () => {
  const modes = [
    { mode: "train" as const, provider: "Rail estimate" },
    { mode: "road" as const, provider: "Coach estimate" },
    { mode: "flight" as const, provider: "Flight estimate" },
    { mode: "ferry" as const, provider: "Ferry estimate" },
  ];
  for (const { mode, provider } of modes) {
    const source = trip();
    source.legs[0] = { ...source.legs[0], mode, provider };
    const action = omioBookingActionForLeg(source, source.legs[0]!, new Date("2026-09-01T12:00:00"));
    assert.equal(action?.href, affiliatePartners.omio.transportUrl);
    assert.equal(action?.transferId, "leg");
    assert.equal(action?.originStopId, "paris");
    assert.equal(action?.destinationStopId, "rome");
  }
});

test("does not offer Omio for booked, local, walking or driving transfers", () => {
  const source = trip();
  source.brief.bookings = [{ id: "transport-leg", type: "transport", title: "Paris to Rome flight", date: "2026-10-04", confirmation: "ABC", url: null }];
  assert.equal(omioBookingActionForLeg(source, source.legs[0]!, new Date("2026-09-01T12:00:00")), null);

  for (const leg of [
    { ...trip().legs[0]!, mode: "walk" as const, distanceKm: 2 },
    { ...trip().legs[0]!, mode: "road" as const, provider: "Driving estimate" },
    { ...trip().legs[0]!, mode: "train" as const, provider: "Local metro", distanceKm: 12 },
  ]) assert.equal(omioBookingActionForLeg(trip(), leg, new Date("2026-09-01T12:00:00")), null);
});

test("uses cautious Omio copy for a partial transfer and no booking actions after a trip ends", () => {
  const partial = trip();
  partial.legs[0] = { ...partial.legs[0], durationMinutes: null };
  assert.equal(omioBookingActionForLeg(partial, partial.legs[0]!, new Date("2026-09-01T12:00:00"))?.cta, "Check transport options on Omio");

  const ended = trip();
  ended.startDate = "2026-08-01";
  ended.endDate = "2026-08-05";
  assert.deepEqual(buildBookingReadiness(ended, {}, new Date("2026-09-01T12:00:00")), []);
});
