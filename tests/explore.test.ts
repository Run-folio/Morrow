import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeExploreResults,
  exploreDestinationOptions,
  exploreOpportunityForTrip,
  exploreResultForActivity,
  exploreResultForIdea,
  exploreResultForLocalPlace,
  exploreResultForPlace,
  exploreResultState,
  exploreScheduleTarget,
  filterExploreResults,
} from "../lib/easyt/explore.ts";
import { saveItineraryIdea, scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";
import type { ActivityInventoryItem } from "../lib/easyt/activity-inventory.ts";

function trip(): EasyTTrip {
  const intent = defaultTripIntent({ stopIds: ["athens", "naxos"], durationDays: 3 });
  return {
    schemaVersion: 1,
    id: "explore-trip",
    ownerId: null,
    title: "Athens and Naxos",
    status: "draft",
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Greek history and food",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      intent: { ...intent, preferences: { ...intent.preferences, interests: ["culture", "food", "hiking"] } },
    },
    stops: [
      { id: "athens", canonicalPlaceId: "athens-gr", order: 0, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-09-10", departureDate: "2026-09-12", nights: 2 },
      { id: "naxos", canonicalPlaceId: "naxos-gr", order: 1, name: "Naxos", country: "Greece", latitude: 37.1036, longitude: 25.3764, arrivalDate: "2026-09-12", departureDate: "2026-09-13", nights: 1 },
    ],
    legs: [],
    planItems: [
      { id: "day-1", stopId: "athens", dayNumber: 1, date: "2026-09-10", type: "arrival", title: "Arrive in Athens", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-2", stopId: "athens", dayNumber: 2, date: "2026-09-11", type: "activity", title: "Explore Athens", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
      { id: "day-3", stopId: "naxos", dayNumber: 3, date: "2026-09-12", type: "transport", title: "Travel to Naxos", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    ],
    recommendations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const place = {
  id: "athens-lycabettus",
  title: "Mount Lycabettus",
  area: "Athens",
  type: "Nature",
  tags: ["Nature"],
  description: "A mapped hill and viewpoint in Athens.",
  image: "https://images.example/lycabettus.jpg",
  sourceUrl: "https://en.wikipedia.org/?curid=1",
  coordinates: [23.743, 37.981] as [number, number],
  qualityScore: 10,
};

test("Explore destinations come only from the current trip and retain canonical stop identity", () => {
  const options = exploreDestinationOptions(trip());
  assert.deepEqual(options.map(({ id, label }) => ({ id, label })), [
    { id: "athens", label: "Athens" },
    { id: "naxos", label: "Naxos" },
  ]);
});

test("destination and category filtering never leaks unrelated trip locations", () => {
  const base = trip();
  const athens = exploreResultForPlace(base.stops[0]!, place);
  const naxos = exploreResultForPlace(base.stops[1]!, { ...place, id: "naxos-portara", title: "Portara", area: "Naxos", type: "Landmark", tags: ["Cities"], coordinates: [25.372, 37.105] });
  assert.deepEqual(filterExploreResults(base, [athens, naxos], "athens", "for-you").map((item) => item.title), ["Mount Lycabettus"]);
  assert.deepEqual(filterExploreResults(base, [athens, naxos], "all", "must-see").map((item) => item.title).sort(), ["Mount Lycabettus", "Portara"]);
  assert.deepEqual(filterExploreResults(base, [athens, naxos], "all", "food"), []);
});

test("exact stable place and provider identities deduplicate without fuzzy title matching", () => {
  const base = trip();
  const first = exploreResultForPlace(base.stops[0]!, place);
  const exact = exploreResultForPlace(base.stops[0]!, { ...place, title: "Mount Lycabettus, Athens" });
  const uncertain = exploreResultForPlace(base.stops[0]!, { ...place, id: "authored-lycabettus", title: "Mount Lycabettus" });
  assert.deepEqual(dedupeExploreResults([first, exact, uncertain]).map((item) => item.sourceId), [place.id, "authored-lycabettus"]);
});

test("restaurant results use the canonical itinerary idea model and remain unscheduled when saved", () => {
  const base = trip();
  const result = exploreResultForLocalPlace(base.stops[0]!, {
    id: "osm-restaurant-1",
    name: "Taverna Klimataria",
    address: "Athens, Greece",
    category: "greek",
    coordinates: [23.72, 37.98],
    mapsUrl: "https://maps.example/restaurant",
    provider: "openstreetmap",
  });
  const saved = saveItineraryIdea(base, result.idea);
  assert.equal(exploreResultState(saved, result).state, "saved");
  assert.equal(saved.brief.itineraryIdeas?.[0]?.dayId, undefined);
  assert.equal(saved.planItems.every((day) => !day.notes.includes(result.title)), true);
});

test("Add to Day schedules exactly one canonical item and survives JSON reload", () => {
  const base = trip();
  const result = exploreResultForPlace(base.stops[0]!, place);
  const target = exploreScheduleTarget(base, result);
  assert.equal(target?.day.id, "day-2");
  const scheduled = scheduleItineraryIdea(base, result.idea, target!.day.id, target!.dayPart);
  const repeated = scheduleItineraryIdea(scheduled, result.idea, target!.day.id, target!.dayPart);
  const reloaded = JSON.parse(JSON.stringify(repeated)) as EasyTTrip;
  assert.equal(reloaded.brief.itineraryIdeas?.filter((idea) => idea.placeId === place.id).length, 1);
  assert.equal(reloaded.planItems[1]!.notes.filter((note) => note === place.title).length, 1);
  assert.equal(exploreResultState(reloaded, result).state, "planned");
});

test("the opportunity callout is derived from an actual empty canonical day part", () => {
  const base = trip();
  const opportunity = exploreOpportunityForTrip(base, "athens");
  assert.equal(opportunity?.day.id, "day-2");
  assert.equal(opportunity?.dayPart, "afternoon");
  const result = exploreResultForPlace(base.stops[0]!, place);
  const scheduled = scheduleItineraryIdea(base, result.idea, "day-2", "afternoon");
  assert.notEqual(exploreOpportunityForTrip(scheduled, "athens")?.dayPart, "afternoon");
});

test("Viator results preserve provider identity, sourced metadata and affiliate handoff", () => {
  const base = trip();
  const item: ActivityInventoryItem = {
    provider: "viator",
    source: "viator",
    providerProductId: "tour-123",
    title: "Cape Sounion sunset tour",
    destination: { canonicalPlaceId: "athens-gr", label: "Athens" },
    image: "https://images.example/sounion.jpg",
    tags: ["day trip"],
    duration: { fromMinutes: 240, toMinutes: 300 },
    price: { amount: 75, currency: "GBP" },
    productUrl: "https://www.viator.com/tours/123",
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-12T00:00:00.000Z" },
  };
  const result = exploreResultForActivity(base.stops[0]!, item, base);
  assert.equal(result.identity, "provider:viator:tour-123");
  assert.equal(result.duration, "4 hrs–5 hrs");
  assert.equal(result.price, "From £75");
  assert.equal(result.providerUrl, item.productUrl);
  assert.deepEqual(filterExploreResults(base, [result], "all", "day-trips"), [result]);
});

test("persisted ideas project back into Explore without inventing missing geography", () => {
  const base = trip();
  const idea = { ...exploreResultForPlace(base.stops[0]!, place).idea, id: "saved-coordinate-less", placeId: "authored-note", coordinates: undefined, image: undefined, title: "Ask about a pottery workshop" };
  const saved = saveItineraryIdea(base, idea);
  const projected = exploreResultForIdea(saved, idea);
  assert.ok(projected);
  assert.equal(projected.coordinates, undefined);
  assert.equal(projected.image, undefined);
  assert.equal(exploreResultState(saved, projected!).state, "saved");
});
