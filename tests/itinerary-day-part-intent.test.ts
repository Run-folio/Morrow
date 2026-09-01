import assert from "node:assert/strict";
import test from "node:test";

import { composeItineraryDayWithExplicitPeriods } from "../lib/easyt/itinerary-day-part-intent.ts";
import { assignItineraryActivityDayPart } from "../lib/easyt/itinerary-mutations.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function tripFixture(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "explicit-day-part-intent",
    ownerId: null,
    title: "Kyoto",
    status: "draft",
    startDate: "2026-10-04",
    endDate: "2026-10-04",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "Tokyo",
      mustDo: "Kyoto",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      customActivities: { 1: ["Tea in Higashiyama"] },
      itineraryIdeas: [{
        id: "idea-market",
        stopId: "kyoto",
        placeId: "market",
        title: "Nishiki Market",
        category: "restaurant",
        coordinates: [135.764, 35.005],
        source: "personalised-recommendation",
        reasons: ["interest-relevance"],
        dayId: "kyoto-1",
        dayPart: null,
      }],
      bookings: [],
    },
    stops: [{ id: "kyoto", order: 0, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-04", departureDate: "2026-10-05", nights: 1 }],
    legs: [],
    planItems: [{
      id: "kyoto-1",
      stopId: "kyoto",
      dayNumber: 1,
      date: "2026-10-04",
      type: "activity",
      title: "Kyoto day",
      reason: "Keep the day coherent.",
      notes: ["Unslotted generated plan", "Tea in Higashiyama", "Nishiki Market"],
      noteDayParts: [null, "afternoon", null],
      startsAt: null,
      endsAt: null,
      bookingUrl: null,
      latitude: null,
      longitude: null,
    }],
    recommendations: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

test("only persisted day-part intent enters a period; fallback ordering stays unslotted", () => {
  const composition = composeItineraryDayWithExplicitPeriods(tripFixture(), "kyoto-1");
  assert.ok(composition);
  assert.deepEqual(composition.planned.afternoon.map((activity) => activity.title), ["Tea in Higashiyama"]);
  assert.deepEqual(composition.planned.morning, []);
  assert.deepEqual(composition.planned.evening, []);
  assert.deepEqual(composition.unslotted.map((activity) => activity.title), ["Unslotted generated plan", "Nishiki Market"]);
});

test("clearing an authored period returns the same canonical item to planned-time-not-set", () => {
  const source = tripFixture();
  const cleared = assignItineraryActivityDayPart(source, {
    dayNumber: 1,
    noteIndex: 1,
    title: "Tea in Higashiyama",
  }, null);
  assert.equal(cleared.changed, true);
  const composition = composeItineraryDayWithExplicitPeriods(cleared.trip, "kyoto-1");
  assert.equal(composition?.unslotted.some((activity) => activity.title === "Tea in Higashiyama"), true);
  assert.equal(composition?.planned.afternoon.some((activity) => activity.title === "Tea in Higashiyama"), false);
});
