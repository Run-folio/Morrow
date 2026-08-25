import assert from "node:assert/strict";
import test from "node:test";
import { accommodationDatesReady, accommodationProgress, bookingDemandHandoffUrl, stayBookingForStop } from "../lib/easyt/accommodation.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1, id: "accommodation", ownerId: null, title: "Accommodation", status: "draft", startDate: "2026-10-01", endDate: "2026-10-06", travellers: 2, currency: "GBP",
  brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
  stops: [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 },
    { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-10-03", departureDate: "2026-10-06", nights: 3 },
  ],
  legs: [], planItems: [], recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

test("derives accommodation completion only from canonical saved stay bookings", () => {
  const source = trip();
  assert.deepEqual(accommodationProgress(source), { stops: source.stops, sortedCount: 0, datesReadyCount: 2, complete: false });

  source.brief.bookings = [{ id: "stay-paris", type: "stay", title: "Hotel Paris", date: "2026-10-01", confirmation: null, url: null }];
  assert.equal(accommodationProgress(source).sortedCount, 1);
  assert.equal(stayBookingForStop(source, source.stops[0])?.title, "Hotel Paris");

  source.brief.bookings.push({ id: "stay-rome", type: "stay", title: "Hotel Rome", date: "2026-10-03", confirmation: null, url: null });
  assert.equal(accommodationProgress(source).complete, true);
});

test("positive-night stops with missing or invalid dates remain in readiness", () => {
  const source = trip();
  source.stops[0] = { ...source.stops[0], arrivalDate: null, departureDate: null };
  source.stops[1] = { ...source.stops[1], arrivalDate: "2026-02-31", departureDate: "2026-02-20" };
  source.brief.bookings = [{ id: "stay-paris", type: "stay", title: "Paris stay", date: null, confirmation: null, url: null }];

  const progress = accommodationProgress(source);
  assert.equal(progress.stops.length, 2);
  assert.equal(progress.sortedCount, 1);
  assert.equal(progress.datesReadyCount, 0);
  assert.equal(progress.complete, false);
  assert.equal(accommodationDatesReady(source.stops[0]), false);
  assert.equal(accommodationDatesReady(source.stops[1]), false);
});

test("Booking.com Demand handoffs prefer attributable deep links and reject unsafe URLs", () => {
  assert.equal(bookingDemandHandoffUrl({
    deepLinkUrl: "https://booking.example/affiliate-property?aid=123",
    searchUrl: "https://booking.example/search-property",
    detailWebUrl: "https://booking.example/generic-property",
  }), "https://booking.example/affiliate-property?aid=123");
  assert.equal(bookingDemandHandoffUrl({
    deepLinkUrl: "javascript:alert(1)",
    detailWebUrl: "https://booking.example/safe-property",
  }), "https://booking.example/safe-property");
  assert.equal(bookingDemandHandoffUrl({ deepLinkUrl: "not a URL", detailUrl: "data:text/html,unsafe" }), undefined);
});
