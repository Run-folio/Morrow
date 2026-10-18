import assert from "node:assert/strict";
import test from "node:test";
import type { EasyTTrip, TripLeg, TripStop } from "../lib/easyt/trip.ts";
import { isPassengerServiceLeg, markTransportLegBooked, travellerTransportBookingForLeg, travellerTransportBookingMismatchForLeg, unmarkTransportBooking, unmatchedTravellerTransportBookings, updateTravellerTransportBookingDetails } from "../lib/easyt/transport-booking.ts";

function fixture(): EasyTTrip {
  const origin: TripStop = { id: "origin", order: 0, name: "Paris", country: "France", latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: null };
  const first: TripStop = { ...origin, id: "berlin-a", order: 1, name: "Berlin", country: "Germany" };
  const second: TripStop = { ...origin, id: "berlin-b", order: 2, name: "Berlin", country: "Germany" };
  const leg = (id: string, from: TripStop, to: TripStop, mode: TripLeg["mode"] = "train"): TripLeg => ({
    id, fromStopId: from.id, toStopId: to.id, mode, distanceKm: 800, durationMinutes: 240, provider: null, routeMetadata: {},
    fromEndpoint: { kind: "stop", id: from.id, name: from.name, country: from.country, coordinates: null },
    toEndpoint: { kind: "stop", id: to.id, name: to.name, country: to.country, coordinates: null },
  });
  return {
    id: "trip-fixture", ownerId: null, schemaVersion: 2, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    startDate: "2026-11-01", endDate: "2026-11-10", title: "Fixture", status: "planned", travellers: 2, currency: "EUR",
    stops: [origin, first, second], legs: [leg("occurrence-a", origin, first), leg("occurrence-b", origin, second)], planItems: [], recommendations: [],
    brief: { origin: "Paris", mustDo: "", pace: "slow", budgetBand: "mid", selectedPlaces: {}, bookings: [] },
  } as unknown as EasyTTrip;
}

test("manual transport booking can be marked without details, edited, explicitly unmarked, and re-marked without losing details", () => {
  const trip = fixture();
  const marked = markTransportLegBooked(trip, "occurrence-a");
  const booking = travellerTransportBookingForLeg(marked, marked.legs[0]);
  assert.ok(booking);
  assert.equal(booking.travellerMarkedBooked, true);
  assert.equal(booking.confirmation, null);
  assert.equal(booking.transportLegBinding?.legId, "occurrence-a");
  assert.equal(travellerTransportBookingForLeg(marked, marked.legs[1]), null);

  const edited = updateTravellerTransportBookingDetails(marked, "occurrence-a", { confirmation: " AB 123 ", url: "https://rail.example/booking", note: "Window seat" });
  const withDetails = travellerTransportBookingForLeg(edited, edited.legs[0]);
  assert.equal(withDetails?.confirmation, "AB 123");
  assert.equal(withDetails?.notes?.[0], "Window seat");
  assert.equal(withDetails?.url, "https://rail.example/booking");

  const unmarked = unmarkTransportBooking(edited, withDetails!.id);
  const retained = unmarked.brief.bookings?.[0];
  assert.equal(retained?.travellerMarkedBooked, false);
  assert.equal(retained?.confirmation, "AB 123");
  assert.equal(retained?.notes?.[0], "Window seat");
  assert.equal(retained?.url, "https://rail.example/booking");
  const remarked = markTransportLegBooked(unmarked, "occurrence-a");
  assert.equal(travellerTransportBookingForLeg(remarked, remarked.legs[0])?.travellerMarkedBooked, true);
  assert.equal(remarked.brief.bookings?.length, 1);
});

test("a route or mode mismatch retains the saved booking and never rebinds it to a new leg", () => {
  const trip = fixture();
  const marked = markTransportLegBooked(trip, "occurrence-a", { confirmation: "KEEP-ME" });
  const changed = structuredClone(marked);
  changed.legs[0].mode = "flight";
  changed.legs[0].fromEndpoint = { ...changed.legs[0].fromEndpoint!, id: "new-origin", name: "Lyon" };
  assert.equal(travellerTransportBookingForLeg(changed, changed.legs[0]), null);
  assert.equal(travellerTransportBookingMismatchForLeg(changed, changed.legs[0])?.confirmation, "KEEP-ME");
  assert.equal(unmatchedTravellerTransportBookings(changed).length, 0, "a changed occurrence is surfaced on its current row");
  assert.equal(markTransportLegBooked(changed, "occurrence-a"), changed, "a stale binding cannot be silently replaced");
  assert.equal(changed.brief.bookings?.[0]?.confirmation, "KEEP-ME");
});

test("a removed occurrence leaves its booking as an unmatched review item", () => {
  const trip = markTransportLegBooked(fixture(), "occurrence-a", { confirmation: "KEEP-ME" });
  const removed = { ...trip, legs: trip.legs.filter((leg) => leg.id !== "occurrence-a") };
  assert.equal(unmatchedTravellerTransportBookings(removed).length, 1);
  assert.equal(removed.brief.bookings?.[0]?.confirmation, "KEEP-ME");
});

test("unsafe optional booking URLs are not persisted", () => {
  const marked = markTransportLegBooked(fixture(), "occurrence-a", { url: "javascript:alert(1)" });
  assert.equal(travellerTransportBookingForLeg(marked, marked.legs[0])?.url, null);
});

test("only passenger service legs get a manual transport booking control; own-car road legs stay distinct", () => {
  const trip = fixture();
  const train = trip.legs[0];
  const ownCar: TripLeg = { ...train, id: "own-car", mode: "road", provider: "Self drive estimate." };
  const coach: TripLeg = { ...ownCar, id: "coach", provider: "Regional coach service." };
  assert.equal(isPassengerServiceLeg(train), true);
  assert.equal(isPassengerServiceLeg(ownCar), false);
  assert.equal(isPassengerServiceLeg(coach), true);
  const ownCarTrip = { ...trip, legs: [ownCar] };
  assert.equal(markTransportLegBooked(ownCarTrip, "own-car"), ownCarTrip, "own-car routes are not ticket booking records");
});

test("a new manual record never replaces an existing imported transport record", () => {
  const trip = fixture();
  const imported = { id: "imported-trip-ticket", type: "transport" as const, title: "Existing rail ticket", date: "2026-11-03", confirmation: "IMPORTED-1", url: null,
    transportDetails: { mode: "train" as const, from: "Paris", to: "Berlin" }, importDetails: { candidateId: "candidate-1", fingerprint: "hash-1", sources: ["calendar"] as Array<"calendar">, provider: "Rail provider", endDate: null, location: null, confidence: "high" as const } };
  trip.brief.bookings = [imported];
  const updated = markTransportLegBooked(trip, "occurrence-b");
  assert.equal(updated.brief.bookings?.length, 2);
  assert.deepEqual(updated.brief.bookings?.[0], imported);
  assert.equal(updated.brief.bookings?.[1]?.transportLegBinding?.legId, "occurrence-b");
});
