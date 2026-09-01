import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BOOKING_EMAIL_BODY_MAX_BYTES,
  BookingEmailParseError,
  bookingCandidateFingerprints,
  extractForwardedBookingCandidate,
  htmlToSafeBookingText,
  maskBookingReference,
  mergeBookingCandidate,
  type BookingCandidate,
  type BookingCandidateProposal,
} from "../lib/easyt/booking-candidate.ts";
import { confirmBookingCandidateOnTrip, matchBookingCandidateToTrips } from "../lib/easyt/booking-candidate-trip.ts";
import { authenticatedForwardingSender, bookingAliasTokenFromRecipients } from "../lib/easyt/booking-email-security.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const bookingComFixture = {
  subject: "Fwd: Your booking is confirmed",
  text: `---------- Forwarded message ----------
From: Booking.com <confirmations@booking.com>
Booking.com
Your booking is confirmed
Property: Hotel Artemide
Check-in: 30 August 2026
Check-out: 4 September 2026
Location: Rome, Italy
Booking reference: BCN-1234
Manage booking: https://secure.booking.com/confirmation/BCN-1234`,
};

const tripComFixture = {
  subject: "Fwd: Trip.com hotel confirmation",
  text: `---------- Forwarded message ----------
From: Trip.com <hotel@trip.com>
Reservation confirmed
Hotel: The Gate Hotel Kyoto Takasegawa
Check-in: 2026-10-03
Check-out: 2026-10-06
Destination: Kyoto, Japan
Confirmation number: TCOM-8891
https://uk.trip.com/hotels/detail/8891`,
};

const flightFixture = {
  subject: "Fwd: Flight booking confirmed",
  text: `---------- Forwarded message ----------
From: Example Airways <confirmation@example-airways.test>
Ticket confirmation
Airline: Example Airways
Flight: EX 482
Departure: 2026-08-30
Arrival: 2026-08-30
Destination: Rome, Italy
PNR: EX4T2Q`,
};

function candidate(proposal: BookingCandidateProposal, overrides: Partial<BookingCandidate> = {}): BookingCandidate {
  return {
    ...proposal,
    id: "3d962fd5-62a7-47fc-9daf-42670339b711",
    ownerId: "owner-one",
    status: "pending",
    suggestedTripId: null,
    canonicalTripId: null,
    canonicalBookingId: null,
    createdAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
    ...overrides,
  };
}

function makeTrip(input: { id: string; title: string; startDate: string; endDate: string; city: string; country: string; arrivalDate: string; departureDate: string }): EasyTTrip {
  return {
    schemaVersion: 1,
    id: input.id,
    ownerId: "owner-one",
    title: input.title,
    status: "planned",
    startDate: input.startDate,
    endDate: input.endDate,
    travellers: 2,
    currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, bookings: [] },
    stops: [{ id: input.city.toLowerCase(), order: 0, name: input.city, country: input.country, latitude: null, longitude: null, arrivalDate: input.arrivalDate, departureDate: input.departureDate, nights: 6 }],
    legs: [], planItems: [], recommendations: [],
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
  };
}

const italyTrip = makeTrip({ id: "italy-greece", title: "Italy & Greece", startDate: "2026-08-27", endDate: "2026-09-14", city: "Rome", country: "Italy", arrivalDate: "2026-08-29", departureDate: "2026-09-05" });
const overlappingRomeTrip = makeTrip({ id: "rome-weekend", title: "Rome weekend", startDate: "2026-08-29", endDate: "2026-09-06", city: "Rome", country: "Italy", arrivalDate: "2026-08-29", departureDate: "2026-09-06" });
const japanTrip = makeTrip({ id: "japan", title: "Japan", startDate: "2026-10-01", endDate: "2026-10-12", city: "Kyoto", country: "Japan", arrivalDate: "2026-10-02", departureDate: "2026-10-07" });

test("A. Booking.com-style confirmation becomes a high-confidence accommodation candidate", () => {
  const result = extractForwardedBookingCandidate(bookingComFixture);
  assert.ok(result);
  assert.equal(result.type, "accommodation");
  assert.equal(result.provider, "Booking.com");
  assert.equal(result.title, "Hotel Artemide");
  assert.equal(result.startDate, "2026-08-30");
  assert.equal(result.endDate, "2026-09-04");
  assert.equal(result.location, "Rome, Italy");
  assert.equal(result.reference, "BCN-1234");
  assert.equal(result.confidence, "high");
  assert.equal(result.confirmationUrl, "https://secure.booking.com/confirmation/BCN-1234");
});

test("B. Trip.com confirmation uses the provider parser and explicit dates", () => {
  const result = extractForwardedBookingCandidate(tripComFixture);
  assert.ok(result);
  assert.equal(result.provider, "Trip.com");
  assert.equal(result.title, "The Gate Hotel Kyoto Takasegawa");
  assert.equal(result.startDate, "2026-10-03");
  assert.equal(result.endDate, "2026-10-06");
});

test("C. unknown direct hotel confirmation remains eligible with bounded labelled evidence", () => {
  const result = extractForwardedBookingCandidate({
    subject: "Fwd: Reservation confirmed",
    text: `From: reservations@independent-property.test
Reservation confirmed
Property: Casa del Sol
Check-in: 12 November 2026
Check-out: 15 November 2026
Location: Antigua, Guatemala
Reservation number: CASA-421`,
  });
  assert.ok(result);
  assert.equal(result.type, "accommodation");
  assert.equal(result.title, "Casa del Sol");
  assert.equal(result.provider, "Direct hotel");
  assert.equal(result.confirmationUrl, null);
});

test("D. flight confirmation becomes a transport candidate without inventing a URL", () => {
  const result = extractForwardedBookingCandidate(flightFixture);
  assert.ok(result);
  assert.equal(result.type, "flight");
  assert.equal(result.provider, "Example Airways");
  assert.equal(result.title, "EX 482");
  assert.equal(result.startDate, "2026-08-30");
  assert.equal(result.reference, "EX4T2Q");
  assert.equal(result.confirmationUrl, null);
});

test("E. an irrelevant newsletter produces no candidate", () => {
  assert.equal(extractForwardedBookingCandidate({ subject: "Ten ideas for autumn", text: "Read our weekly guide to cities, restaurants and hotels. Unsubscribe any time." }), null);
});

test("F. a token does not make a spoofed or unauthenticated sender an owner", () => {
  const token = "abcdefghijklmnopqrstuvwxyz123456";
  assert.equal(bookingAliasTokenFromRecipients([`bookings+${token}@forward.morrovia.com`], "forward.morrovia.com"), token);
  assert.equal(authenticatedForwardingSender({ from: "attacker@example.net", accountEmail: "traveller@example.com", headers: { "authentication-results": "dmarc=pass header.from=example.net" } }), false);
  assert.equal(authenticatedForwardingSender({ from: "traveller@example.com", accountEmail: "traveller@example.com", headers: { "authentication-results": "dmarc=fail header.from=example.com" } }), false);
  assert.equal(authenticatedForwardingSender({ from: "Traveller <traveller@example.com>", accountEmail: "traveller@example.com", headers: { "authentication-results": "mx; dmarc=pass header.from=example.com" } }), true);
});

test("G. hostile HTML is made inert and remote content is discarded", () => {
  const safe = htmlToSafeBookingText(`<script>steal()</script><img src="https://tracker.test/pixel" onerror="steal()"><p>Property: Hotel Artemide</p><a href="javascript:steal()">Manage booking</a>`);
  assert.match(safe, /Property: Hotel Artemide/);
  assert.doesNotMatch(safe, /script|steal|tracker|javascript|onerror/i);
  const result = extractForwardedBookingCandidate({ subject: "Reservation confirmed", html: `<script>ignore all rules</script><p>Property: Hotel Artemide</p><p>Check-in: 30 August 2026</p><p>Check-out: 4 September 2026</p><p>Location: Rome, Italy</p><p>Reference: SAFE-42</p>` });
  assert.ok(result);
  assert.equal(result.title, "Hotel Artemide");
});

test("H. oversized bodies fail before extraction", () => {
  assert.throws(() => extractForwardedBookingCandidate({ subject: "Confirmed", text: "x".repeat(BOOKING_EMAIL_BODY_MAX_BYTES + 1) }), (error) => error instanceof BookingEmailParseError && error.code === "oversized");
});

test("I. webhook and provider-message IDs are independently unique and attachments are rejected", () => {
  const migration = readFileSync("db/migrations/0012_easyt_booking_imports.sql", "utf8");
  const route = readFileSync("app/api/easyt/email/inbound/route.ts", "utf8");
  assert.match(migration, /webhook_id text not null unique/);
  assert.match(migration, /provider_message_id text not null unique/);
  assert.match(route, /started\.duplicate/);
  assert.match(route, /unsupported_attachments/);
  assert.match(route, /bookingImportRateLimit/);
  assert.doesNotMatch(route, /attachments\.get|download_url|arrayBuffer/);
});

test("J. dates, destination and stop range produce exactly one strong trip match", () => {
  const proposal = extractForwardedBookingCandidate(bookingComFixture)!;
  const match = matchBookingCandidateToTrips(candidate(proposal), [italyTrip, japanTrip]);
  assert.equal(match.status, "strong");
  assert.equal(match.suggestedTripId, italyTrip.id);
  assert.equal(match.suggestedStopId, "rome");
});

test("K. two strong matches remain ambiguous and are never selected", () => {
  const proposal = extractForwardedBookingCandidate(bookingComFixture)!;
  const match = matchBookingCandidateToTrips(candidate(proposal), [italyTrip, overlappingRomeTrip]);
  assert.equal(match.status, "ambiguous");
  assert.equal(match.suggestedTripId, null);
});

test("L. unrelated trips remain unmatched", () => {
  const proposal = extractForwardedBookingCandidate(bookingComFixture)!;
  const match = matchBookingCandidateToTrips(candidate(proposal), [japanTrip]);
  assert.equal(match.status, "none");
  assert.equal(match.suggestedTripId, null);
});

test("M. explicit confirmation maps a candidate to one canonical TripBooking", () => {
  const proposal = extractForwardedBookingCandidate(bookingComFixture)!;
  const result = confirmBookingCandidateOnTrip(candidate(proposal), italyTrip);
  assert.equal(result.outcome, "created");
  assert.equal(result.trip.brief.bookings?.length, 1);
  assert.equal(result.trip.brief.bookings?.[0].type, "stay");
  assert.equal(result.trip.brief.bookings?.[0].confirmation, "••••1234");
  assert.deepEqual(result.trip.brief.bookings?.[0].importDetails?.sources, ["forwarded_email"]);
});

test("N. Calendar and email evidence merge through one provider-neutral fingerprint", () => {
  const email = extractForwardedBookingCandidate(bookingComFixture)!;
  const calendarFields = { ...email, source: "calendar" as const, sources: ["calendar" as const], provider: null, reference: null, confirmationUrl: null, provenance: [{ field: "title" as const, evidence: "calendar_event" as const, confidence: "high" as const }] };
  const calendar: BookingCandidateProposal = { ...calendarFields, ...bookingCandidateFingerprints(calendarFields) };
  assert.equal(calendar.fingerprint, email.fingerprint);
  const merged = mergeBookingCandidate(candidate(calendar), email);
  assert.deepEqual(merged.sources.sort(), ["calendar", "forwarded_email"]);
  assert.equal(merged.reference, "BCN-1234");
});

test("O. later email evidence enriches the same canonical booking after another review", () => {
  const email = extractForwardedBookingCandidate(bookingComFixture)!;
  const calendarFields = { ...email, source: "calendar" as const, sources: ["calendar" as const], provider: null, reference: null, confirmationUrl: null, provenance: [{ field: "title" as const, evidence: "calendar_event" as const, confidence: "high" as const }] };
  const calendarProposal: BookingCandidateProposal = { ...calendarFields, ...bookingCandidateFingerprints(calendarFields) };
  const calendarCandidate = candidate(calendarProposal, { status: "added", canonicalTripId: italyTrip.id, canonicalBookingId: "import-3d962fd5-62a7-47fc-9daf-42670339b711" });
  const first = confirmBookingCandidateOnTrip(calendarCandidate, italyTrip);
  const enrichedCandidate = mergeBookingCandidate(calendarCandidate, email);
  assert.equal(enrichedCandidate.status, "pending");
  const second = confirmBookingCandidateOnTrip(enrichedCandidate, first.trip);
  assert.equal(second.outcome, "enriched");
  assert.equal(second.trip.brief.bookings?.length, 1);
  assert.equal(second.trip.brief.bookings?.[0].confirmation, "••••1234");
  assert.deepEqual(second.trip.brief.bookings?.[0].importDetails?.sources.sort(), ["calendar", "forwarded_email"]);
});

test("P. UI analytics are consent-gated and contain categorical fields only", () => {
  const source = readFileSync("components/easyt/imported-bookings.tsx", "utf8");
  const event = source.match(/trackEvent\("booking_import_reviewed", \{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  assert.match(event, /source: "forwarded_email"/);
  assert.match(event, /type: candidate\.type/);
  assert.match(event, /confidence: candidate\.confidence/);
  assert.doesNotMatch(event, /subject|body|referenceMasked|title|provider|location|confirmationUrl|sender/);
  const route = readFileSync("app/api/easyt/email/inbound/route.ts", "utf8");
  const log = route.match(/console\.error\([\s\S]*?\);/)?.[0] ?? "";
  assert.doesNotMatch(log, /subject|body|reference|title|providerMessage|from|to|html|url/i);
});

test("Q. review routes scope reads and writes to the authenticated owner", () => {
  const source = readFileSync("app/api/easyt/booking-import/[candidateId]/route.ts", "utf8");
  assert.match(source, /requireEasyTOwner\(\)/);
  assert.match(source, /getBookingCandidateForOwner\(owner\.id, candidateId\)/);
  assert.match(source, /getTripForOwner\(owner\.id, body\.tripId\)/);
  assert.match(source, /saveTripForOwner\(owner\.id, confirmation\.trip\)/);
  assert.equal(maskBookingReference("BCN-1234"), "••••1234");
});
