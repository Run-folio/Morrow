import assert from "node:assert/strict";
import test from "node:test";
import { affiliatePartners, buildBookingReadiness, getAccommodationBookingUrl, getBookingAction, omioBookingActionForLeg } from "../lib/easyt/booking-readiness.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1, id: "bookable", ownerId: null, title: "Bookable", status: "draft", startDate: "2026-10-01", endDate: "2026-10-06", travellers: 2, currency: "GBP",
  brief: { origin: "London, United Kingdom", originCountry: "United Kingdom", originCoordinates: [-0.1276, 51.5072], mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: { paris: ["Louvre"] }, decisionSelections: { routeOrder: "entered", transportByLeg: { arrival: "fastest", leg: "fastest" } } },
  stops: [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
    { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 2 },
  ],
  legs: [
    { id: "arrival", fromStopId: "bookable-origin", toStopId: "paris", fromEndpoint: { kind: "origin", id: "bookable-origin", name: "London, United Kingdom", country: "United Kingdom", coordinates: [-0.1276, 51.5072] }, toEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.35, 48.85] }, classification: "arrival", mode: "train", distanceKm: 344, durationMinutes: 270, provider: "Estimate", routeMetadata: { planningEstimate: true, decisionOption: "fastest" } },
    { id: "leg", fromStopId: "paris", toStopId: "rome", fromEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.35, 48.85] }, toEndpoint: { kind: "stop", id: "rome", name: "Rome", country: "Italy", coordinates: [12.49, 41.9] }, classification: "international", mode: "flight", distanceKm: 1100, durationMinutes: 330, provider: "Estimate", routeMetadata: { planningEstimate: true, decisionOption: "fastest" } },
  ],
  planItems: Array.from({ length: 6 }, (_, index) => ({ id: `day-${index + 1}`, stopId: index < 3 ? "paris" : "rome", dayNumber: index + 1, date: `2026-10-0${index + 1}`, type: index === 0 || index === 3 ? "arrival" as const : "activity" as const, title: "Plan", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
  recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

const mainLeg = (source: EasyTTrip) => source.legs.find((leg) => leg.id === "leg")!;

test("creates current-partner accommodation, activity and connectivity actions from stable itinerary data", () => {
  const actions = buildBookingReadiness(trip());
  assert.equal(actions.filter((action) => action.category === "accommodation").length, 2);
  assert.equal(actions.some((action) => action.category === "activity" && action.stopId === "paris"), true);
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

test("central Trip.com category actions use exact generated URLs and reject unsupported generic handoffs", () => {
  const source = trip();
  const input = { trip: source, stop: source.stops[0], dates: { checkIn: "2026-10-01", checkOut: "2026-10-04" } };
  const expected = {
    accommodation: affiliatePartners.tripCom.accommodationUrl,
    car_rental: affiliatePartners.tripCom.carRentalUrl,
    activities: affiliatePartners.tripCom.activitiesUrl,
    airport_transfer: affiliatePartners.tripCom.airportTransferUrl,
  } as const;
  for (const [category, href] of Object.entries(expected)) {
    const action = getBookingAction({ category: category as keyof typeof expected, ...input });
    assert.equal(action?.href, href);
    assert.equal(new URL(action?.href ?? "").search, "");
  }
  assert.equal(getBookingAction({ category: "flight", ...input }), undefined);
  assert.equal(getBookingAction({ category: "train", ...input }), undefined);
  assert.equal(getBookingAction({ category: "car_rental", ...input }, { provider: "trip.com" }), undefined);
});

test("uses the approved Viator general activities URL without adding trip parameters", () => {
  const action = buildBookingReadiness(trip(), {
    activitiesUrl: affiliatePartners.viator.activitiesUrl,
    activitiesProvider: affiliatePartners.viator.provider,
  }).find((candidate) => candidate.id === "activity-paris");

  assert.equal(action?.href, affiliatePartners.viator.activitiesUrl);
  assert.equal(action?.provider, "viator");
  assert.equal(action?.cta, "Browse tours and activities");
  assert.equal(action?.affiliate, true);
});

test("uses Trip.com tours only as the activities fallback when Viator is unavailable", () => {
  const action = buildBookingReadiness(trip(), { activitiesUrl: "" }).find((candidate) => candidate.id === "activity-paris");
  assert.equal(action?.href, affiliatePartners.tripCom.activitiesUrl);
  assert.equal(action?.provider, "trip.com");
  assert.equal(action?.cta, "Browse experiences");
  assert.equal(action?.affiliateCategory, "activities");
});

test("uses Trip.com car rental only when a driving route actually calls for a car", () => {
  const source = trip();
  source.legs[1] = { ...mainLeg(source), mode: "road", distanceKm: 180, provider: "Road estimate" };
  source.brief.decisionSelections = { routeOrder: "entered", transportByLeg: { leg: "simplest" } };
  const carRental = buildBookingReadiness(source).find((action) => action.id === "car-leg");
  assert.deepEqual({ href: carRental?.href, provider: carRental?.provider, cta: carRental?.cta, affiliate: carRental?.affiliate }, {
    href: affiliatePartners.tripCom.carRentalUrl, provider: "trip.com", cta: "Find a rental car on Trip.com", affiliate: true,
  });

  source.brief.intent = {
    version: 1, travellers: 2, timing: { flexibility: "fixed", durationDays: 6 },
    hardConstraints: { originRequired: true, mustSeeStopIds: ["paris", "rome"], optionalStopIds: [], fixedCommitments: [], avoidDriving: true },
    preferences: { budgetSensitivity: "mid", transportModes: ["train", "flight"], pace: "balanced", interests: [], dislikes: [] },
  };
  assert.equal(buildBookingReadiness(source).some((action) => action.category === "car-rental"), false);
});

test("keeps an existing configured car-hire partner ahead of the Trip.com fallback", () => {
  const source = trip();
  source.legs[1] = { ...mainLeg(source), mode: "road", distanceKm: 180, provider: "Road estimate" };
  source.brief.decisionSelections = { routeOrder: "entered", transportByLeg: { leg: "simplest" } };
  const action = buildBookingReadiness(source, { carHireUrl: "https://partner.example/car" }).find((candidate) => candidate.id === "car-leg");
  assert.equal(action?.provider, "car-hire-partner");
  assert.match(action?.href ?? "", /^https:\/\/partner\.example\/car\?/);
  assert.notEqual(action?.href, affiliatePartners.tripCom.carRentalUrl);
});

test("valid configured partner context preserves existing attribution parameters", () => {
  const source = trip();
  source.legs[1] = { ...mainLeg(source), mode: "road", distanceKm: 180, provider: "Road estimate" };
  source.brief.decisionSelections = { routeOrder: "entered", transportByLeg: { leg: "simplest" } };
  const action = buildBookingReadiness(source, { carHireUrl: "https://partner.example/car?ref=approved&campaign=keep" }).find((candidate) => candidate.id === "car-leg");
  const url = new URL(action?.href ?? "");
  assert.equal(url.searchParams.get("ref"), "approved");
  assert.equal(url.searchParams.get("campaign"), "keep");
  assert.equal(url.searchParams.get("pickup"), "Paris");
  assert.equal(url.searchParams.get("dropoff"), "Rome");
});

test("malformed direct partner configuration falls back without exposing a broken action", () => {
  const source = trip();
  source.legs[1] = { ...mainLeg(source), mode: "road", distanceKm: 180, provider: "Road estimate" };
  source.brief.decisionSelections = { routeOrder: "entered", transportByLeg: { leg: "simplest" } };
  const actions = buildBookingReadiness(source, {
    activitiesUrl: "javascript:alert(1)",
    activitiesProvider: "viator",
    carHireUrl: "data:text/html,unsafe",
    sailyUrl: "/relative/connectivity",
    groundTransportUrl: "not a URL",
  });
  const activity = actions.find((action) => action.id === "activity-paris");
  const car = actions.find((action) => action.id === "car-leg");
  const connectivity = actions.find((action) => action.id === "trip-connectivity");
  assert.deepEqual({ href: activity?.href, provider: activity?.provider }, { href: affiliatePartners.tripCom.activitiesUrl, provider: "trip.com" });
  assert.deepEqual({ href: car?.href, provider: car?.provider }, { href: affiliatePartners.tripCom.carRentalUrl, provider: "trip.com" });
  assert.equal(connectivity?.href.startsWith("https://saily.com/"), true);
  assert.equal(connectivity?.affiliate, false);
  assert.equal(actions.some((action) => action.provider === "ground-transport-partner"), false);
  assert.equal(actions.every((action) => ["http:", "https:"].includes(new URL(action.href).protocol)), true);
});

test("does not create an airport-transfer action without an existing airport context", () => {
  assert.equal(buildBookingReadiness(trip()).some((action) => action.category === "ground-transport"), false);
});

test("keeps existing Omio and Viator partner destinations unchanged", () => {
  assert.equal(affiliatePartners.omio.transportUrl, "https://omio.sjv.io/2RBeqD");
  assert.equal(affiliatePartners.viator.activitiesUrl, "https://vi.me/IiuWB");
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
    source.legs[1] = { ...mainLeg(source), mode, provider };
    const action = omioBookingActionForLeg(source, mainLeg(source), new Date("2026-09-01T12:00:00"));
    assert.equal(action?.href, affiliatePartners.omio.transportUrl);
    assert.equal(action?.transferId, "leg");
    assert.equal(action?.originStopId, "paris");
    assert.equal(action?.destinationStopId, "rome");
  }
});

test("does not offer Omio for booked, local, walking or driving transfers", () => {
  const source = trip();
  source.brief.bookings = [{ id: "transport-leg", type: "transport", title: "Paris to Rome flight", date: "2026-10-04", confirmation: "ABC", url: null }];
  assert.equal(omioBookingActionForLeg(source, mainLeg(source), new Date("2026-09-01T12:00:00")), null);

  for (const leg of [
    { ...mainLeg(trip()), mode: "walk" as const, distanceKm: 2 },
    { ...mainLeg(trip()), mode: "road" as const, provider: "Driving estimate" },
    { ...mainLeg(trip()), mode: "train" as const, provider: "Local metro", distanceKm: 12 },
  ]) assert.equal(omioBookingActionForLeg(trip(), leg, new Date("2026-09-01T12:00:00")), null);
});

test("uses cautious Omio copy for a partial transfer and no booking actions after a trip ends", () => {
  const partial = trip();
  partial.legs[1] = { ...mainLeg(partial), durationMinutes: null };
  assert.equal(omioBookingActionForLeg(partial, mainLeg(partial), new Date("2026-09-01T12:00:00"))?.cta, "Check transport options on Omio");

  const ended = trip();
  ended.startDate = "2026-08-01";
  ended.endDate = "2026-08-05";
  assert.deepEqual(buildBookingReadiness(ended, {}, new Date("2026-09-01T12:00:00")), []);
});
