import assert from "node:assert/strict";
import test from "node:test";
import { cascadeTripSchedule } from "../lib/easyt/cascade.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1, id: "cascade", ownerId: null, title: "Cascade", status: "draft", startDate: "2026-09-01", endDate: "2026-09-06", travellers: 2, currency: "GBP",
  brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, scheduleLocks: { stopIds: [], arrivalDates: {} } },
  stops: [
    { id: "a", order: 0, name: "Kyoto", country: "Japan", latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: 2 },
    { id: "b", order: 1, name: "Takayama", country: "Japan", latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: 1 },
  ],
  legs: [],
  planItems: [
    { id: "a1", stopId: "a", dayNumber: 1, date: "2026-09-01", type: "arrival", title: "Arrive Kyoto", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "a2", stopId: "a", dayNumber: 2, date: "2026-09-02", type: "activity", title: "Kyoto", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "b1", stopId: "b", dayNumber: 3, date: "2026-09-03", type: "arrival", title: "Arrive Takayama", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
  ],
  recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

test("propagates dates from nights rather than treating stops independently", () => {
  const result = cascadeTripSchedule(trip()).trip;
  assert.equal(result.stops[0].arrivalDate, "2026-09-01");
  assert.equal(result.stops[1].arrivalDate, "2026-09-04");
  assert.equal(result.planItems[2].date, "2026-09-04");
  assert.equal(result.planItems[2].dayNumber, 4);
});

test("keeps an explicitly locked arrival and reports the resulting conflict", () => {
  const source = trip();
  source.brief.scheduleLocks = { stopIds: ["b"], arrivalDates: { b: "2026-09-05" } };
  const result = cascadeTripSchedule(source);
  assert.equal(result.trip.stops[1].arrivalDate, "2026-09-05");
  assert.equal(result.status.conflicts.length, 1);
});

test("never rewrites a booking while flagging a date outside the trip", () => {
  const source = trip();
  source.brief.bookings = [{ id: "stay", type: "stay", title: "Hotel", date: "2026-09-08", confirmation: "ABC", url: null }];
  const result = cascadeTripSchedule(source);
  assert.equal(result.trip.brief.bookings?.[0].date, "2026-09-08");
  assert.deepEqual(result.status.affectedBookingIds, ["stay"]);
});
