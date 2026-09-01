import assert from "node:assert/strict";
import test from "node:test";
import { destinationHighlightCandidates, personalisedItineraryCandidates, type ItineraryDiscoveryPlace } from "../lib/easyt/itinerary-day-context.ts";
import { ideaStateForPlace, itineraryIdeaDayOptions, itineraryIdeaForPlace, preferredItineraryIdeaDay, reconcileItineraryIdeas, removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea, validIdeaDays } from "../lib/easyt/itinerary-ideas.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";

const places: ItineraryDiscoveryPlace[] = [
  { id: "temple", title: "Kiyomizu-dera", area: "Kyoto", type: "Culture", tags: ["Cities"], description: "A historic temple and cultural landmark.", coordinates: [135.785, 34.994], qualityScore: 11 },
  { id: "market", title: "Nishiki Market", area: "Kyoto", type: "Food", tags: ["Food"], description: "A food market for regional ingredients.", coordinates: [135.764, 35.005], qualityScore: 7 },
  { id: "unknown", title: "Unclassified lane", area: "Kyoto", type: "Experience", tags: [], description: "A named mapped place.", coordinates: [135.76, 35.01] },
];

function trip(): EasyTTrip {
  const intent = defaultTripIntent({ stopIds: ["kyoto"], durationDays: 2 });
  return {
    schemaVersion: 1, id: "ideas-trip", ownerId: null, title: "Kyoto", status: "draft",
    startDate: "2026-10-01", endDate: "2026-10-02", travellers: 2, currency: "GBP",
    brief: { origin: "Tokyo", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: { ...intent, preferences: { ...intent.preferences, interests: ["food"] } } },
    stops: [{ id: "kyoto", order: 0, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 }], legs: [],
    planItems: [1, 2].map((dayNumber) => ({ id: `day-${dayNumber}`, stopId: "kyoto", dayNumber, date: `2026-10-0${dayNumber}`, type: "activity" as const, title: "Explore Kyoto", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
    recommendations: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

test("destination significance and interest relevance remain distinct and sparse evidence is neutral", () => {
  assert.deepEqual(destinationHighlightCandidates(places).map((place) => place.id), ["temple", "market"]);
  assert.deepEqual(personalisedItineraryCandidates(places, ["food"]).map((place) => place.id), ["market"]);
  assert.deepEqual(personalisedItineraryCandidates(places, []).map((place) => place.id), []);
});

test("saves an unscheduled stop-bound idea and removes it safely", () => {
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: places[1], reasons: ["interest-relevance"] });
  const saved = saveItineraryIdea(trip(), idea);
  assert.equal(saved.brief.itineraryIdeas?.[0]?.dayId, undefined);
  assert.equal(ideaStateForPlace(saved, "kyoto", "market").state, "saved");
  assert.equal(removeItineraryIdea(saved, idea.id).brief.itineraryIdeas?.length, 0);
});

test("schedules only onto a valid day, persists identity, and prevents exact same-day duplicates", () => {
  const base = trip();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: places[1], reasons: ["destination-significance", "interest-relevance"] });
  assert.deepEqual(validIdeaDays(base, "kyoto").map((day) => day.id), ["day-1", "day-2"]);
  const scheduled = scheduleItineraryIdea(saveItineraryIdea(base, idea), idea, "day-2");
  assert.equal(ideaStateForPlace(scheduled, "kyoto", "market").day?.dayNumber, 2);
  assert.equal(scheduled.planItems[1].notes.filter((note) => note === "Nishiki Market").length, 1);
  assert.equal(scheduleItineraryIdea(scheduled, idea, "day-2"), scheduled);
  assert.equal(scheduleItineraryIdea(base, idea, "missing-day"), base);
  const reassigned = scheduleItineraryIdea(scheduled, idea, "day-1");
  assert.equal(ideaStateForPlace(reassigned, "kyoto", "market").day?.dayNumber, 1);
  assert.equal(reassigned.planItems[1].notes.includes("Nishiki Market"), false);
  assert.equal(reassigned.planItems[0].notes.includes("Nishiki Market"), true);
});

test("eligible days use canonical stop identity and prefer a lighter non-protected day", () => {
  const base = trip();
  const otherStopDay: EasyTTrip["planItems"][number] = {
    ...base.planItems[0]!, id: "day-3", stopId: "osaka", dayNumber: 3, date: "2026-10-03", title: "Explore Kyoto elsewhere", notes: [],
  };
  const scored: EasyTTrip = {
    ...base,
    stops: [...base.stops, { ...base.stops[0]!, id: "osaka", order: 1, name: "Osaka" }],
    planItems: [
      { ...base.planItems[0]!, type: "arrival", title: "Arrive in Kyoto", notes: [] },
      { ...base.planItems[1]!, type: "activity", notes: ["Temple", "Market"] },
      { ...base.planItems[1]!, id: "day-4", dayNumber: 4, date: "2026-10-04", type: "activity", notes: ["Garden"] },
      otherStopDay,
    ],
  };

  assert.deepEqual(itineraryIdeaDayOptions(scored, "kyoto").map(({ day, itemCount, protectedDay }) => ({
    id: day.id, itemCount, protectedDay,
  })), [
    { id: "day-1", itemCount: 0, protectedDay: true },
    { id: "day-2", itemCount: 2, protectedDay: false },
    { id: "day-4", itemCount: 1, protectedDay: false },
  ]);
  assert.equal(preferredItineraryIdeaDay(scored, "kyoto")?.id, "day-4");
});

test("transfer days are de-prioritised and chronological order breaks equal-load ties", () => {
  const base = trip();
  const scored: EasyTTrip = {
    ...base,
    planItems: [
      { ...base.planItems[0]!, type: "transport", notes: [] },
      { ...base.planItems[1]!, type: "open", notes: ["One item"] },
      { ...base.planItems[1]!, id: "day-3", dayNumber: 3, date: "2026-10-03", type: "activity", notes: ["One item"] },
    ],
  };
  assert.equal(preferredItineraryIdeaDay(scored, "kyoto")?.id, "day-2");
});

test("route reorder preserves stop/day identity and stop removal drops orphaned ideas", () => {
  const base = trip();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: places[0], reasons: ["destination-significance"] });
  const scheduled = scheduleItineraryIdea(base, idea, "day-1");
  const reordered = reconcileItineraryIdeas({ ...scheduled, planItems: [...scheduled.planItems].reverse() });
  assert.equal(reordered.brief.itineraryIdeas?.[0]?.dayId, "day-1");
  const removed = reconcileItineraryIdeas({ ...scheduled, stops: [], planItems: [] });
  assert.deepEqual(removed.brief.itineraryIdeas, []);
});
