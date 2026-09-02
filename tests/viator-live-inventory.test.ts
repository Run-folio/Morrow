import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { activityInventoryIdentity, itineraryIdeaForActivityInventory, rankActivityInventory, type ActivityInventoryItem } from "../lib/easyt/activity-inventory.ts";
import { ideaStateForPlace, removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";

const item = (id: string, title: string, overrides: Partial<ActivityInventoryItem> = {}): ActivityInventoryItem => ({
  provider: "viator", source: "viator", providerProductId: id, title,
  destination: { canonicalPlaceId: "paris", label: "Paris", providerDestinationId: "479" },
  productUrl: `https://www.viator.com/tours/Paris/${id}?pid=approved`,
  provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-01T12:00:00.000Z" },
  ...overrides,
});

function trip(): EasyTTrip {
  const intent = defaultTripIntent({ stopIds: ["paris-stop"], durationDays: 2 });
  return {
    schemaVersion: 1, id: "viator-trip", ownerId: "owner", title: "Paris", status: "draft", startDate: "2026-09-01", endDate: "2026-09-02", travellers: 2, currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: { ...intent, preferences: { ...intent.preferences, interests: ["food", "culture"] } } },
    stops: [{ id: "paris-stop", canonicalPlaceId: "paris", order: 0, name: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522, arrivalDate: "2026-09-01", departureDate: "2026-09-03", nights: 2 }], legs: [],
    planItems: [1, 2].map((dayNumber) => ({ id: `day-${dayNumber}`, stopId: "paris-stop", dayNumber, date: `2026-09-0${dayNumber}`, type: "activity" as const, title: "Explore Paris", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
    recommendations: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

test("live inventory maps to the canonical idea with exact identity, URL, provenance and no invented coordinates", () => {
  const product = item("P-123", "Louvre museum guided tour", { rating: 4.8, reviewCount: 312, duration: { fixedMinutes: 120 }, price: { amount: 54.25, currency: "GBP" } });
  const idea = itineraryIdeaForActivityInventory("paris-stop", product, ["culture"]);
  assert.equal(idea.id, "idea-paris-stop-viator-P-123");
  assert.equal(idea.placeId, "viator:P-123");
  assert.equal(idea.providerProductId, "P-123");
  assert.equal(idea.sourceUrl, product.productUrl);
  assert.equal(idea.coordinates, undefined);
  assert.deepEqual(idea.reasons, ["interest-relevance"]);
  assert.deepEqual(idea.providerMetadata?.provenance, product.provenance);
});

test("unknown categories remain neutral and affinity only supplies the existing bounded boost", () => {
  const generic = item("generic", "Evening orientation experience");
  const food = item("food", "Paris food market tasting");
  assert.deepEqual(itineraryIdeaForActivityInventory("paris-stop", generic, ["food"]).reasons, []);
  assert.deepEqual(rankActivityInventory([generic, food], ["food"]).map((entry) => entry.providerProductId), ["food", "generic"]);
  assert.deepEqual(rankActivityInventory([generic, food], []).map((entry) => entry.providerProductId), ["generic", "food"]);
});

test("Save and Add use canonical state, persist broad placement, and never create a false pin or booking", () => {
  const idea = itineraryIdeaForActivityInventory("paris-stop", item("P-456", "Montmartre culture walk"), ["culture"]);
  const saved = saveItineraryIdea(trip(), idea);
  assert.equal(ideaStateForPlace(saved, "paris-stop", activityInventoryIdentity({ provider: "viator", providerProductId: "P-456" })).state, "saved");
  const planned = scheduleItineraryIdea(saved, idea, "day-2", "afternoon");
  assert.equal(ideaStateForPlace(planned, "paris-stop", idea.placeId).state, "planned");
  assert.equal(planned.brief.itineraryIdeas?.[0]?.dayPart, "afternoon");
  assert.equal(planned.planItems[1]?.notes.includes(idea.title), true);
  assert.equal(planned.brief.mapPins?.length ?? 0, 0);
  assert.equal(planned.brief.bookings?.length ?? 0, 0);
  assert.equal(scheduleItineraryIdea(planned, idea, "day-2", "afternoon"), planned);
});

test("stable product identity prevents duplicate Save while similar titles from different products remain distinct", () => {
  const first = itineraryIdeaForActivityInventory("paris-stop", item("A", "Louvre highlights tour"));
  const second = itineraryIdeaForActivityInventory("paris-stop", item("B", "Louvre highlights guided tour"));
  const once = saveItineraryIdea(trip(), first);
  assert.equal(saveItineraryIdea(once, first), once);
  const twice = saveItineraryIdea(once, second);
  assert.deepEqual(twice.brief.itineraryIdeas?.map((idea) => idea.providerProductId), ["A", "B"]);
  const repeatedStop: EasyTTrip = {
    ...once,
    stops: [...once.stops, { ...once.stops[0]!, id: "paris-return", order: 1 }],
    planItems: [...once.planItems, { ...once.planItems[0]!, id: "day-3", stopId: "paris-return", dayNumber: 3, date: "2026-09-03" }],
  };
  const sameProductAtRepeatedStop = itineraryIdeaForActivityInventory("paris-return", item("A", "Louvre highlights tour"));
  assert.equal(saveItineraryIdea(repeatedStop, sameProductAtRepeatedStop), repeatedStop);
  assert.equal(scheduleItineraryIdea(repeatedStop, sameProductAtRepeatedStop, "day-3"), repeatedStop);
  assert.equal(ideaStateForPlace(repeatedStop, "paris-return", sameProductAtRepeatedStop.placeId).state, "saved");
});

test("selected provider metadata survives reload and moving/removing a coordinate-less activity cleans canonical day state", () => {
  const idea = itineraryIdeaForActivityInventory("paris-stop", item("MOVE", "Seine architecture cruise", { image: "https://images.example/cruise.jpg", duration: { fromMinutes: 60, toMinutes: 90 } }), ["cities"]);
  const dayOne = scheduleItineraryIdea(trip(), idea, "day-1", "midday");
  const reloaded = JSON.parse(JSON.stringify(dayOne)) as EasyTTrip;
  assert.equal(reloaded.brief.itineraryIdeas?.[0]?.sourceUrl, idea.sourceUrl);
  assert.deepEqual(reloaded.brief.itineraryIdeas?.[0]?.providerMetadata?.duration, { fromMinutes: 60, toMinutes: 90 });
  const moved = scheduleItineraryIdea(reloaded, idea, "day-2", "evening");
  assert.equal(moved.planItems[0]?.notes.includes(idea.title), false);
  assert.equal(moved.planItems[1]?.notes.includes(idea.title), true);
  const removed = removeItineraryIdea(moved, idea.id);
  assert.equal(removed.planItems[1]?.notes.includes(idea.title), false);
});

test("UI integration keeps Morrovia discovery, aborts stale requests, uses canonical affiliate handling and inherits one-page provider rules", () => {
  const inventory = readFileSync(new URL("../components/easyt/live-activity-inventory.tsx", import.meta.url), "utf8");
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/journey-itinerary-refinement.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/journey-activity-inventory/route.ts", import.meta.url), "utf8");
  assert.match(itinerary, /<ItineraryDaySuggestions[\s\S]*<LiveActivityInventory/);
  assert.match(map, /JourneyItineraryRefinement[\s\S]*LiveActivityInventory/);
  assert.match(inventory, /controller\.abort\(\)/);
  assert.match(inventory, /MorroviaAffiliateLink/);
  assert.match(inventory, /country:\s*stop\.country/);
  assert.match(inventory, /countryCode:\s*stop\.countryCode/);
  assert.match(inventory, /latitude:\s*stop\.latitude,\s*longitude:\s*stop\.longitude/);
  assert.match(inventory, /aliases:\s*placeMention\?\.aliases/);
  assert.match(inventory, /placeType:\s*placeMention\?\.placeType/);
  assert.doesNotMatch(inventory, /productUrl\s*\+|searchParams\.set|affiliate_click/);
  assert.doesNotMatch(inventory, /rawPrompt|traveller|notes|bookingReference|full itinerary/i);
  assert.match(route, /count:\s*4/);
  assert.doesNotMatch(route, /while\s*\(|for\s*\(.*start|database|repository/);
});

test("missing optional commercial fields remain missing and no unsupported availability copy is introduced", () => {
  const idea = itineraryIdeaForActivityInventory("paris-stop", item("MIN", "Small group walk", { productUrl: undefined }));
  assert.equal(idea.providerMetadata?.rating, undefined);
  assert.equal(idea.providerMetadata?.price, undefined);
  const inventory = readFileSync(new URL("../components/easyt/live-activity-inventory.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(inventory, /available today|instant confirmation|free cancellation|skip(?:-| )the(?:-| )line|guaranteed availability/i);
});
