import assert from "node:assert/strict";
import test from "node:test";

import { itineraryAddSourceForIdea, newlyScheduledItineraryIdea } from "../lib/easyt/itinerary-add-analytics.ts";
import { scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import type { EasyTTrip, ItineraryIdea } from "../lib/easyt/trip.ts";

const idea = (overrides: Partial<ItineraryIdea> = {}): ItineraryIdea => ({
  id: "idea-stop-museum", stopId: "stop", placeId: "museum", title: "Private museum name",
  category: "activity", source: "personalised-recommendation", reasons: [], coordinates: [10, 20], ...overrides,
});

const trip = (ideas: ItineraryIdea[] = []): EasyTTrip => ({
  schemaVersion: 1, id: "opaque-trip", ownerId: null, title: "Private trip", status: "draft",
  startDate: "2026-10-05", endDate: "2026-10-07", travellers: 2, currency: "GBP",
  brief: { origin: "Private origin", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, itineraryIdeas: ideas },
  stops: [{ id: "stop", order: 0, name: "Private stop", country: "Somewhere", latitude: 20, longitude: 10, arrivalDate: "2026-10-05", departureDate: "2026-10-07", nights: 2 }],
  legs: [],
  planItems: [1, 2].map((number) => ({ id: `day-${number}`, stopId: "stop", dayNumber: number, date: `2026-10-0${number + 4}`, type: "activity" as const, title: "Day", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
  recommendations: [], createdAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
});

test("canonical scheduling counts a new or saved idea once, not a duplicate or move", () => {
  const candidate = idea();
  const empty = trip();
  const first = scheduleItineraryIdea(empty, candidate, "day-1", "morning");
  assert.equal(newlyScheduledItineraryIdea(empty, first, candidate), true);
  assert.equal(newlyScheduledItineraryIdea(first, scheduleItineraryIdea(first, candidate, "day-1", "morning"), candidate), false);
  assert.equal(newlyScheduledItineraryIdea(first, scheduleItineraryIdea(first, candidate, "day-2", "afternoon"), candidate), false);
  const saved = trip([candidate]);
  assert.equal(newlyScheduledItineraryIdea(saved, scheduleItineraryIdea(saved, candidate, "day-1", "morning"), candidate), true);
  assert.equal(newlyScheduledItineraryIdea(empty, empty, candidate), false);
});

test("provider duplicate identity and source classification stay categorical", () => {
  const viator = idea({ id: "viator-one", placeId: "one", source: "live-provider-inventory", provider: "viator", providerProductId: "PRODUCT-1" });
  const duplicate = idea({ ...viator, id: "viator-two", placeId: "two" });
  const first = scheduleItineraryIdea(trip(), viator, "day-1");
  assert.equal(newlyScheduledItineraryIdea(first, scheduleItineraryIdea(first, duplicate, "day-1"), duplicate), false);
  assert.equal(itineraryAddSourceForIdea(viator), "viator");
  assert.equal(itineraryAddSourceForIdea(idea({ category: "restaurant", source: "personalised-recommendation" })), "food_place");
  assert.equal(itineraryAddSourceForIdea(idea()), "suggestion");
});
