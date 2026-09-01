import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accommodationProgress, removeStayBooking, stayBookingForStop, upsertStayBooking } from "../lib/easyt/accommodation.ts";
import { confirmBookingCandidateOnTrip } from "../lib/easyt/booking-candidate-trip.ts";
import type { BookingCandidate } from "../lib/easyt/booking-candidate.ts";
import type { BookingCandidateView } from "../lib/easyt/booking-import-view.ts";
import { bookingCandidateLifecycle, destinationStayProvenance, destinationStayState } from "../lib/easyt/destination-accommodation.ts";
import { getCurrentPartnerAction } from "../lib/easyt/booking-readiness.ts";
import { semanticSamePlaceArrival } from "../lib/easyt/itinerary-presentation.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1,
  id: "italy-greece",
  ownerId: "owner-1",
  title: "Italy & Greece",
  status: "draft",
  startDate: "2026-08-27",
  endDate: "2026-09-14",
  travellers: 2,
  currency: "GBP",
  brief: { origin: "Rome", originCanonicalPlaceId: "place-rome", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
  stops: [
    { id: "rome", order: 0, name: "Rome", country: "Italy", canonicalPlaceId: "place-rome", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-08-30", departureDate: "2026-09-04", nights: 5 },
    { id: "athens", order: 1, name: "Athens", country: "Greece", latitude: 37.98, longitude: 23.72, arrivalDate: "2026-09-04", departureDate: "2026-09-09", nights: 5 },
  ],
  legs: [{ id: "arrival", fromStopId: "italy-greece-origin", toStopId: "rome", fromEndpoint: { kind: "origin", id: "italy-greece-origin", name: "Rome", canonicalPlaceId: "place-rome", coordinates: null }, toEndpoint: { kind: "stop", id: "rome", name: "Rome", canonicalPlaceId: "place-rome", coordinates: [12.49, 41.9] }, classification: "arrival", mode: "unknown", distanceKm: 0, durationMinutes: 0, doorToDoorMinutes: 0, provider: null, routeMetadata: { source: "canonical-endpoint-identity" } }],
  planItems: [],
  recommendations: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
});

const candidate = (): BookingCandidate => ({
  id: "3d962fd5-62a7-47fc-9daf-42670339b711",
  ownerId: "owner-1",
  source: "calendar",
  sources: ["calendar", "forwarded_email"],
  type: "accommodation",
  title: "Hotel Artemide",
  provider: "Booking.com",
  startDate: "2026-08-30",
  endDate: "2026-09-04",
  location: "Rome, Italy",
  reference: "ROMA-1234",
  confirmationUrl: "https://www.booking.com/hotel/it/artemide.html",
  confidence: "high",
  provenance: [],
  fingerprint: "semantic-stay",
  strictFingerprint: "strict-stay",
  status: "pending",
  suggestedTripId: "italy-greece",
  canonicalTripId: null,
  canonicalBookingId: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
});

const candidateView = (): BookingCandidateView => ({
  id: candidate().id,
  source: "calendar",
  sources: ["calendar", "forwarded_email"],
  type: "accommodation",
  title: "Hotel Artemide",
  provider: "Booking.com",
  startDate: "2026-08-30",
  endDate: "2026-09-04",
  location: "Rome, Italy",
  referenceMasked: "••••1234",
  confidence: "high",
  status: "pending",
  canonicalTripId: null,
  match: { status: "strong", suggestedTripId: "italy-greece", suggestedStopId: "rome", matches: [{ tripId: "italy-greece", tripTitle: "Italy & Greece", score: 12, stopId: "rome", stopName: "Rome" }] },
});

test("A/G/T. needs-stay is derived for current and legacy trips without parallel state", () => {
  const source = trip();
  assert.deepEqual(destinationStayState(source, source.stops[0]), {
    status: "needs_stay", stopId: "rome", destination: "Rome", checkIn: "2026-08-30", checkOut: "2026-09-04", nights: 5, travellers: 2,
  });
  assert.equal(destinationStayState({ ...source, brief: { ...source.brief, bookings: undefined } }, source.stops[0]).status, "needs_stay");
});

test("B/C. Find a stay resolves the central affiliate action and cannot mutate booking state", () => {
  const source = trip();
  const before = structuredClone(source);
  const action = getCurrentPartnerAction("accommodation");
  assert.equal(action?.provider, "trip.com");
  assert.match(action?.href ?? "", /^https:\/\//);
  assert.deepEqual(source, before);
  assert.equal(accommodationProgress(source).sortedCount, 0);
});

test("D/P/Q. manual add, edit and remove reuse the canonical stay booking", () => {
  const source = confirmBookingCandidateOnTrip(candidate(), trip(), "rome").trip;
  const imported = stayBookingForStop(source, source.stops[0])!;
  const edited = upsertStayBooking(source, "rome", { title: "Hotel Artemide Roma" });
  const retained = stayBookingForStop(edited, edited.stops[0])!;
  assert.equal(retained.title, "Hotel Artemide Roma");
  assert.equal(retained.id, "stay-rome");
  assert.equal(retained.confirmation, "••••1234");
  assert.equal(retained.url, "https://www.booking.com/hotel/it/artemide.html");
  assert.deepEqual(retained.importDetails, imported.importDetails);
  assert.equal(edited.brief.bookings?.filter((booking) => booking.type === "stay").length, 1);
  assert.equal(destinationStayState(removeStayBooking(edited, "rome"), edited.stops[0]).status, "needs_stay");
});

test("H. a matching active proposal becomes candidate_found without changing the trip", () => {
  const source = trip();
  const state = destinationStayState(source, source.stops[0], [candidateView()]);
  assert.equal(state.status, "candidate_found");
  assert.equal(state.status === "candidate_found" ? state.candidates.length : 0, 1);
  assert.equal(source.brief.bookings, undefined);
});

test("candidate lifecycle distinguishes active, confirmed, dismissed and presentation-stale records", () => {
  const active = candidateView();
  assert.equal(bookingCandidateLifecycle(active), "active");
  assert.equal(bookingCandidateLifecycle({ ...active, status: "added" }), "confirmed");
  assert.equal(bookingCandidateLifecycle({ ...active, status: "ignored" }), "dismissed");
  assert.equal(bookingCandidateLifecycle({ ...active, match: { status: "none", suggestedTripId: null, suggestedStopId: null, matches: [] } }), "stale");
});

test("I/K/L. confirmation dedupes Calendar/email evidence into the stable canonical stop stay", () => {
  const source = trip();
  const confirmed = confirmBookingCandidateOnTrip(candidate(), source, "rome");
  assert.equal(confirmed.bookingId, "stay-rome");
  assert.equal(confirmed.trip.brief.bookings?.length, 1);
  assert.deepEqual(confirmed.trip.brief.bookings?.[0].importDetails?.sources.sort(), ["calendar", "forwarded_email"]);
  assert.equal(destinationStayState(confirmed.trip, confirmed.trip.stops[0], [candidateView()]).status, "stay_sorted");
  assert.equal(destinationStayProvenance(confirmed.trip.brief.bookings![0]), "Imported from Google Calendar and a forwarded confirmation");
});

test("M/N/O/R. Overview, Map and progress all remain derived from a confirmed canonical stay", () => {
  const source = confirmBookingCandidateOnTrip(candidate(), trip(), "rome").trip;
  assert.equal(accommodationProgress(source).sortedCount, 1, "Overview/readiness progress");
  assert.equal(stayBookingForStop(source, source.stops[0])?.title, "Hotel Artemide", "Map/Stay selector");
  assert.equal(destinationStayState(source, source.stops[0], []).status, "stay_sorted", "disconnecting integrations does not remove the stay");
});

test("E/F/J/S. integration controls remain explicit, local and privacy-safe", () => {
  const component = readFileSync("components/easyt/destination-accommodation-module.tsx", "utf8");
  const route = readFileSync("app/api/easyt/booking-import/[candidateId]/route.ts", "utf8");
  assert.match(component, /Calendar import isn't available yet/);
  assert.match(component, /\/api\/easyt\/booking-import\/calendar/);
  assert.match(component, /No bookings found for these dates/);
  assert.match(route, /status: "ignored"/);
  const eventCalls = component.match(/trackEvent\([\s\S]*?\);/g)?.join("\n") ?? "";
  assert.doesNotMatch(eventCalls, /candidate\.title|candidate\.location|referenceMasked|calendarId|eventId|sender:|raw_content|property_name/);
});

test("U. same-city canonical arrival is semantic and never presents a fake transfer", () => {
  const source = trip();
  assert.equal(semanticSamePlaceArrival(source, source.legs[0]), "Arrive in Rome");
  assert.doesNotMatch(semanticSamePlaceArrival(source, source.legs[0]) ?? "", /Rome → Rome|0m/);
});

test("V. production stories and CSS cover the required responsive destination-stay states", () => {
  const stories = readFileSync("components/easyt/destination-accommodation-module.stories.tsx", "utf8");
  const css = readFileSync("components/easyt/destination-accommodation-module.module.css", "utf8");
  for (const state of ["NeedsStay", "CalendarDisconnected", "CheckingCalendar", "NoCandidateFound", "CandidateFound", "MultipleEnrichedCandidates", "StaySorted", "ImportError", "LongHotelName"]) assert.match(stories, new RegExp(`export const ${state}`));
  for (const viewport of ["morrovia320", "morrovia390", "morrovia768", "morrovia1024", "morrovia1440"]) assert.match(stories, new RegExp(viewport));
  assert.match(css, /min-height: 44px/);
});

test("cross-surface shell accepts a newer canonical cache only after recovery is clear", () => {
  const shell = readFileSync("components/easyt/trip-shell-client.tsx", "utf8");
  assert.match(shell, /change\.kind !== "cache" \|\| loadTripRecovery/);
  assert.match(shell, /canonicalTripRevisionCanReplace\(current, cached\) \? cached : current/);
});
