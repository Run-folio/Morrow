import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeExploreResults,
  conciseExploreDescription,
  exploreDiscoveryRequestKey,
  exploreDestinationOptions,
  exploreDiscoveryCategory,
  exploreOpportunityForTrip,
  exploreResultEligible,
  exploreResultForActivity,
  exploreResultForIdea,
  exploreResultForLocalPlace,
  exploreResultForPlace,
  exploreResultState,
  exploreScheduleTarget,
  filterExploreResults,
  projectExploreResults,
  resolveExploreDestinationId,
  trustedExploreImage,
} from "../lib/easyt/explore.ts";
import { removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
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

test("Explore keeps repeated cities as separate stopIds and excludes stops without itinerary days", () => {
  const base = trip();
  base.stops.push(
    { ...base.stops[0]!, id: "athens-return", canonicalPlaceId: "athens-gr", order: 2, arrivalDate: "2026-09-13", departureDate: "2026-09-14" },
    { ...base.stops[0]!, id: "london-origin-only", canonicalPlaceId: "london-gb", name: "London", country: "United Kingdom", order: 3 },
  );
  base.planItems.push({ ...base.planItems[1]!, id: "day-4", stopId: "athens-return", dayNumber: 4, date: "2026-09-13" });
  const options = exploreDestinationOptions(base);
  assert.deepEqual(options.map(({ id, dayLabel }) => ({ id, dayLabel })), [
    { id: "athens", dayLabel: "Days 1–2" },
    { id: "naxos", dayLabel: "Day 3" },
    { id: "athens-return", dayLabel: "Day 4" },
  ]);
});

test("Explore selects only real canonical stops and preserves explicit repeated-stop selection across reload", () => {
  const base = trip();
  base.stops.push({
    ...base.stops[0]!,
    id: "athens-return",
    canonicalPlaceId: "athens-gr",
    order: 2,
    arrivalDate: "2026-09-13",
    departureDate: "2026-09-14",
  });
  base.planItems.push({ ...base.planItems[1]!, id: "day-4", stopId: "athens-return", dayNumber: 4, date: "2026-09-13" });
  const reloaded = JSON.parse(JSON.stringify(base)) as EasyTTrip;
  const destinations = exploreDestinationOptions(reloaded);

  assert.equal(resolveExploreDestinationId(destinations), "athens", "initial entry selects the first canonical stop");
  assert.equal(resolveExploreDestinationId(destinations, "naxos"), "naxos", "a later stop remains selectable");
  assert.equal(resolveExploreDestinationId(destinations, "athens-return"), "athens-return", "a repeated place keeps its occurrence ID after reload");
  assert.equal(resolveExploreDestinationId(destinations, "all"), "athens", "legacy aggregate input cannot become Explore state");
  assert.equal(resolveExploreDestinationId([], "all"), null, "a trip without valid stops has no fabricated destination");
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

test("canonical duplicate venues collapse across sources while distant same-name branches remain", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const mapped = exploreResultForPlace(stop, { ...place, id: "mapped-taverna", title: "Taverna Athena", area: "12 Market Street, Athens", type: "Restaurant", tags: ["Food"], coordinates: [23.72, 37.98] });
  const localDuplicate = exploreResultForLocalPlace(stop, { id: "google-taverna", name: "Taverna Athena", address: "12 Market Street, Athens", category: "restaurant", coordinates: [23.7205, 37.98], mapsUrl: "https://maps.example/taverna", provider: "google-places" });
  const distantBranch = exploreResultForLocalPlace(stop, { id: "google-taverna-port", name: "Taverna Athena", address: "Port Road, Athens", category: "restaurant", coordinates: [23.75, 37.98], mapsUrl: "https://maps.example/taverna-port", provider: "google-places" });
  const results = dedupeExploreResults([mapped, localDuplicate, distantBranch]);
  assert.equal(results.length, 2);
  assert.equal(results.some((result) => result.sourceId === "google-taverna-port"), true);
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
  assert.equal(target?.dayPart, null, "missing duration stays day-level instead of fabricating a slot fit");
  const scheduled = scheduleItineraryIdea(base, result.idea, target!.day.id, target!.dayPart);
  const repeated = scheduleItineraryIdea(scheduled, result.idea, target!.day.id, target!.dayPart);
  const reloaded = JSON.parse(JSON.stringify(repeated)) as EasyTTrip;
  assert.equal(reloaded.brief.itineraryIdeas?.filter((idea) => idea.placeId === place.id).length, 1);
  assert.equal(reloaded.planItems[1]!.notes.filter((note) => note === place.title).length, 1);
  assert.equal(exploreResultState(reloaded, result).state, "planned");
});

test("an eleven-hour activity is persisted as day-level rather than an afternoon-only fit", () => {
  const base = trip();
  const result = exploreResultForActivity(base.stops[0]!, {
    provider: "viator", source: "viator", providerProductId: "full-day-11h", title: "Eleven-hour regional tour",
    destination: { canonicalPlaceId: "athens-gr", label: "Athens" }, duration: { fixedMinutes: 660 },
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T00:00:00.000Z" },
  }, base);
  const target = exploreScheduleTarget(base, result, 2);
  assert.equal(target?.day.id, "day-2");
  assert.equal(target?.dayPart, null);
  const scheduled = scheduleItineraryIdea(base, result.idea, target!.day.id, target!.dayPart);
  const reloaded = JSON.parse(JSON.stringify(scheduled)) as EasyTTrip;
  const stored = reloaded.brief.itineraryIdeas?.find((idea) => idea.id === result.idea.id);
  assert.equal(stored?.dayPart, null);
  assert.deepEqual(stored?.providerMetadata?.duration, { fixedMinutes: 660 });
});

test("Save and Add update card state without changing the active provider order", () => {
  const base = trip();
  const source = ["A", "B", "C", "D", "E"].map((title, index) => exploreResultForPlace(base.stops[0]!, {
    ...place,
    id: `stable-${title.toLocaleLowerCase()}`,
    title,
    type: "Landmark",
    description: `${title} is a visitor attraction and major landmark.`,
    qualityScore: 20 - index,
  }));
  const selected = source[2]!;
  const selectedIdentity = selected.identity;
  assert.equal(projectExploreResults(source, [], []).find((result) => result.identity === selectedIdentity)?.title, "C", "selection never changes eligibility or order");
  const savedTrip = saveItineraryIdea(base, selected.idea);
  const savedProjection = projectExploreResults(source, [], (savedTrip.brief.itineraryIdeas ?? []).flatMap((idea) => exploreResultForIdea(savedTrip, idea) ?? []));
  assert.deepEqual(savedProjection.map((result) => result.title), ["A", "B", "C", "D", "E"]);
  assert.equal(exploreResultState(savedTrip, savedProjection[2]!).state, "saved");

  const occupied = { ...savedTrip, planItems: savedTrip.planItems.map((day) => day.id === "day-2" ? { ...day, notes: ["Existing afternoon plan"], noteDayParts: ["afternoon" as const] } : day) };
  const scheduledTrip = scheduleItineraryIdea(occupied, selected.idea, "day-2", "afternoon");
  const scheduledProjection = projectExploreResults(source, [], (scheduledTrip.brief.itineraryIdeas ?? []).flatMap((idea) => exploreResultForIdea(scheduledTrip, idea) ?? []));
  assert.deepEqual(scheduledProjection.map((result) => result.title), ["A", "B", "C", "D", "E"]);
  assert.equal(exploreResultState(scheduledTrip, scheduledProjection[2]!).state, "planned");
  assert.deepEqual(scheduledTrip.planItems.find((day) => day.id === "day-2")?.notes, ["Existing afternoon plan", "C"], "Add inserts without replacing an occupied daypart");
  assert.equal(savedProjection[2]!.identity, scheduledProjection[2]!.identity);
  assert.equal(exploreDiscoveryRequestKey(base), exploreDiscoveryRequestKey(savedTrip));
  assert.equal(exploreDiscoveryRequestKey(base), exploreDiscoveryRequestKey(scheduledTrip));

  const removedTrip = removeItineraryIdea(scheduledTrip, selected.idea.id);
  const removedProjection = projectExploreResults(source, [], (removedTrip.brief.itineraryIdeas ?? []).flatMap((idea) => exploreResultForIdea(removedTrip, idea) ?? []));
  assert.deepEqual(removedProjection.map((result) => result.title), ["A", "B", "C", "D", "E"]);
  assert.equal(exploreResultState(removedTrip, removedProjection[2]!).state, "available");
});

test("late commercial enrichment preserves an organic card identity and ordering", () => {
  const base = trip();
  const organic = [
    exploreResultForPlace(base.stops[0]!, { ...place, id: "a", title: "A landmark", type: "Landmark", description: "A major visitor landmark." }),
    exploreResultForPlace(base.stops[0]!, { ...place, id: "b", title: "B museum", type: "Museum", description: "A visitor museum." }),
  ];
  const enriched = exploreResultForActivity(base.stops[0]!, {
    provider: "viator", source: "viator", providerProductId: "a-ticket", title: "A landmark entry ticket",
    destination: { canonicalPlaceId: "athens-gr", label: "Athens" }, rating: 4.8, reviewCount: 200,
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T00:00:00.000Z" },
  }, base);
  const before = projectExploreResults(organic, [], []);
  const after = projectExploreResults(organic, [enriched], []);
  assert.deepEqual(after.map((result) => result.identity), before.map((result) => result.identity));
  assert.equal(after[0]?.providerProductId, "a-ticket");
  assert.equal(after.find((result) => result.identity === before[1]!.identity)?.title, "B museum", "late commercial enrichment preserves the active sibling selection");

  const lateImage = { ...organic[1]!, image: "/journey/late-museum.jpg" };
  const imageProjection = projectExploreResults(dedupeExploreResults([...organic, lateImage]), [], []);
  assert.deepEqual(imageProjection.map((result) => result.identity), before.map((result) => result.identity));
  assert.equal(imageProjection[1]?.image, "/journey/late-museum.jpg");

  const lateOrganic = exploreResultForPlace(base.stops[0]!, { ...place, id: "c", title: "C park", type: "Park", description: "A visitor park." });
  const organicProjection = projectExploreResults([...organic, lateOrganic], [], []);
  assert.deepEqual(organicProjection.slice(0, 2).map((result) => result.identity), before.map((result) => result.identity));
  assert.equal(organicProjection.some((result) => result.identity === before[1]!.identity), true);
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
    rating: 4.7,
    reviewCount: 842,
    duration: { fromMinutes: 240, toMinutes: 300 },
    price: { amount: 75, currency: "GBP" },
    productUrl: "https://www.viator.com/tours/123",
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-12T00:00:00.000Z" },
  };
  const result = exploreResultForActivity(base.stops[0]!, item, base);
  assert.equal(result.identity, "stop:athens:provider:viator:tour-123");
  assert.equal(result.duration, "4h–5h");
  assert.equal(result.price, "From £75");
  assert.equal(result.rating, 4.7);
  assert.equal(result.reviewCount, 842);
  assert.equal(result.providerUrl, item.productUrl);
  assert.equal(exploreScheduleTarget(base, result, 2)?.dayPart, "morning", "a sourced 4–5h activity keeps the existing slot model");
  assert.deepEqual(filterExploreResults(base, [result], "all", "day-trips"), [result]);
});

test("eligibility rejects the destination and administrative records but keeps useful places", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const city = exploreResultForPlace(stop, { ...place, id: "city", title: "Athens", type: "City" });
  const region = exploreResultForPlace(stop, { ...place, id: "attica", title: "Attica", type: "Administrative region", tags: [] });
  const neighbourhood = exploreResultForPlace(stop, { ...place, id: "plaka", title: "Plaka", type: "Neighbourhood", tags: ["Cities"] });
  const attraction = exploreResultForPlace(stop, { ...place, id: "agora", title: "Ancient Agora", type: "Historic site" });
  const restaurant = exploreResultForLocalPlace(stop, { id: "taverna", name: "Taverna", address: "Plaka", category: "restaurant", coordinates: [23.7, 37.9], mapsUrl: "https://maps.example/taverna", provider: "openstreetmap" });
  const tour = exploreResultForActivity(stop, { provider: "viator", source: "viator", providerProductId: "walk", title: "Athens walking tour", destination: { canonicalPlaceId: "athens-gr", label: "Athens" }, provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-12T00:00:00.000Z" } }, base);
  assert.equal(exploreResultEligible(base, city), false);
  assert.equal(exploreResultEligible(base, region), false);
  for (const result of [neighbourhood, attraction, restaurant, tour]) assert.equal(exploreResultEligible(base, result), true);
  assert.deepEqual(filterExploreResults(base, [city, region, neighbourhood, attraction, restaurant, tour], "all", "for-you").map((result) => result.title).sort(), ["Ancient Agora", "Athens walking tour", "Plaka"]);
  assert.deepEqual(filterExploreResults(base, [restaurant], "all", "food").map((result) => result.title), ["Taverna"]);
});

test("For you filters non-visitable entities and ranks traveller-useful places ahead of weak generic records", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const candidates = [
    exploreResultForPlace(stop, { ...place, id: "university", title: "Athens Technical University", type: "Education", tags: ["Cities"], description: "A public university and educational institution.", qualityScore: 30 }),
    exploreResultForPlace(stop, { ...place, id: "incident", title: "Tokyo subway sarin attack", type: "Place", tags: ["Cities"], description: "A domestic chemical terrorist attack and historical incident represented as an encyclopedia article.", qualityScore: 30 }),
    exploreResultForPlace(stop, { ...place, id: "admin", title: "Attica Regional Authority", type: "Administrative entity", tags: ["Cities"], description: "A government administrative entity.", qualityScore: 30 }),
    exploreResultForPlace(stop, { ...place, id: "generic", title: "Central Star", type: "Place", tags: ["Cities"], description: "Four residential skyscrapers under construction, including a residential tower.", qualityScore: 20 }),
    exploreResultForPlace(stop, { ...place, id: "artefact", title: "Municipal reference record", type: "Place", tags: ["Cities"], description: "A non-visitable data artefact and encyclopedia article.", qualityScore: 28 }),
    exploreResultForPlace(stop, { ...place, id: "organisation", title: "Regional trade council", type: "Place", tags: ["Cities"], description: "A professional association and generic organization.", qualityScore: 28 }),
    exploreResultForPlace(stop, { ...place, id: "memorial", title: "Subway attack memorial", type: "Memorial", tags: ["Culture"], description: "A visitor memorial about the historical terrorist attack.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "church", title: "Small hillside church", type: "Church", tags: ["Culture"], description: "A local church open to visitors.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "museum", title: "City Museum", type: "Museum", tags: ["Culture"], description: "A visitor museum.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "neighbourhood", title: "Old artisan quarter", type: "Neighbourhood", tags: ["Cities"], description: "A walkable neighbourhood.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "market", title: "Central produce market", type: "Market", tags: ["Food"], description: "A covered market visited for local produce.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "park", title: "Hilltop park", type: "Park", tags: ["Nature"], description: "A public park with a city viewpoint.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "unusual", title: "Underground olive press", type: "Attraction", tags: ["Culture"], description: "An unusual but genuine visitor attraction with guided tours.", qualityScore: 12 }),
  ];
  const ranked = filterExploreResults(base, candidates, "all", "for-you");
  for (const rejected of ["Athens Technical University", "Tokyo subway sarin attack", "Attica Regional Authority", "Central Star", "Municipal reference record", "Regional trade council", "Central produce market"]) {
    assert.equal(ranked.some((result) => result.title === rejected), false, rejected);
  }
  for (const preserved of ["Subway attack memorial", "Small hillside church", "City Museum", "Old artisan quarter", "Hilltop park", "Underground olive press"]) {
    assert.equal(ranked.some((result) => result.title === preserved), true, preserved);
  }
});

test("For you excludes administrative nearby settlements while preserving the dedicated day-trip lane", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const nearby = [
    exploreResultForPlace(stop, { ...place, id: "jangan", title: "Jangan-eup", type: "Day trip", tags: ["Day trip", "day-trips"], description: "A verified nearby town 20 km from Busan.", qualityScore: 13 }),
    exploreResultForPlace(stop, { ...place, id: "seosaeng", title: "Seosaeng-myeon", type: "Day trip", tags: ["Day trip", "day-trips"], description: "A verified nearby town 30 km from Busan.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "onyang", title: "Onyang-eup", type: "Day trip", tags: ["Day trip", "day-trips"], description: "A verified nearby town 40 km from Busan.", qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "changwon", title: "Changwon", type: "Day trip", tags: ["Day trip", "day-trips"], description: "A verified nearby city 41 km from Busan.", qualityScore: 12 }),
  ];
  assert.deepEqual(filterExploreResults(base, nearby, "all", "for-you"), []);
  assert.deepEqual(filterExploreResults(base, nearby, "all", "day-trips").map((result) => result.title), ["Changwon"], "the city remains discoverable only when the traveller asks for day trips");
});

test("raw city entities do not become attractions, while quality score changes final Explore order", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const city = exploreResultForPlace(stop, { ...place, id: "piraeus", title: "Piraeus", type: "City", tags: ["Cities"], description: "A municipality and city inside the wider destination.", qualityScore: 30 });
  const lower = exploreResultForPlace(stop, { ...place, id: "small-museum", title: "Small museum", type: "Museum", tags: ["Culture"], description: "A visitor museum.", qualityScore: 7 });
  const higher = exploreResultForPlace(stop, { ...place, id: "major-museum", title: "Major museum", type: "Museum", tags: ["Culture"], description: "A visitor museum.", qualityScore: 18 });
  const ranked = filterExploreResults(base, [lower, city, higher], "all", "for-you");
  assert.deepEqual(ranked.map((result) => result.title), ["Major museum", "Small museum"]);
});

test("category classification favors truthful place anatomy over incidental prose", () => {
  assert.equal(exploreDiscoveryCategory("Kamakura", "Day trip", "A provider-identified nearby city."), "Day trip");
  assert.equal(exploreDiscoveryCategory("Piazza del Campidoglio", "", "A square on Capitoline Hill."), "Landmark");
  assert.equal(exploreDiscoveryCategory("Unknown stop", "", "Limited source detail."), "Place");
  assert.equal(exploreDiscoveryCategory("Acropolis Museum", "attraction", ""), "Museum");
});

test("descriptions stay concise and technical or untrusted imagery falls back", () => {
  const long = "A useful first sentence. A useful second sentence. This third sentence should not be exposed on the card.";
  assert.equal(conciseExploreDescription(long), "A useful first sentence. A useful second sentence.");
  assert.equal(trustedExploreImage("https://upload.wikimedia.org/photo.jpg"), "https://upload.wikimedia.org/photo.jpg");
  assert.equal(trustedExploreImage("https://upload.wikimedia.org/route-map.png"), undefined);
  assert.equal(trustedExploreImage("https://unknown.example/photo.jpg"), undefined);
  assert.equal(trustedExploreImage("https://provider.example/photo.jpg", "provider"), "https://provider.example/photo.jpg");
});

test("For you keeps organic results and mixes commercial inventory without replacing it", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const organic = ["Agora", "Plaka", "Museum"].map((title, index) => exploreResultForPlace(stop, { ...place, id: `organic-${index}`, title, type: index === 2 ? "Museum" : "Landmark", qualityScore: 20 - index }));
  const commercial = ["Entry ticket", "Food tour"].map((title, index) => exploreResultForActivity(stop, { provider: "viator", source: "viator", providerProductId: `paid-${index}`, title, destination: { canonicalPlaceId: "athens-gr", label: "Athens" }, rating: 5, provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-12T00:00:00.000Z" } }, base));
  const mixed = filterExploreResults(base, [...commercial, ...organic], "all", "for-you");
  assert.equal(mixed.filter((result) => !result.providerProductId).length, 3);
  assert.equal(mixed.filter((result) => result.providerProductId).length, 2);
  assert.equal(mixed.slice(0, 3).some((result) => result.providerProductId), true);
});

test("For you excludes newly discovered restaurants while retaining deterministic attraction diversity", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const restaurants = Array.from({ length: 15 }, (_, index) => exploreResultForLocalPlace(stop, {
    id: `restaurant-${index}`,
    name: index < 12 ? "Athens Fish Restaurant" : `Distinct taverna ${index}`,
    address: `${index + 1} Different Street, Athens`,
    category: "restaurant",
    coordinates: [23.72 + index * 0.002, 37.98],
    mapsUrl: `https://maps.example/restaurant-${index}`,
    provider: "openstreetmap",
  }));
  const alternatives = [
    exploreResultForPlace(stop, { ...place, id: "museum-choice", title: "Acropolis Museum", type: "Museum", tags: ["Culture"], qualityScore: 18 }),
    exploreResultForPlace(stop, { ...place, id: "museum-choice-2", title: "Benaki Museum", type: "Museum", tags: ["Culture"], qualityScore: 14 }),
    exploreResultForPlace(stop, { ...place, id: "market-choice", title: "Central Market", type: "Market", tags: ["Food"], qualityScore: 17 }),
    exploreResultForPlace(stop, { ...place, id: "market-choice-2", title: "Monastiraki Market", type: "Market", tags: ["Food"], qualityScore: 13 }),
    exploreResultForPlace(stop, { ...place, id: "park-choice", title: "National Garden", type: "Park", tags: ["Nature"], qualityScore: 16 }),
    exploreResultForPlace(stop, { ...place, id: "park-choice-2", title: "Philopappos Hill", type: "Viewpoint", tags: ["Nature"], qualityScore: 12 }),
    exploreResultForPlace(stop, { ...place, id: "historic-choice", title: "Ancient Agora", type: "Historic site", tags: ["Culture"], qualityScore: 15 }),
    exploreResultForPlace(stop, { ...place, id: "historic-choice-2", title: "Roman Agora", type: "Historic site", tags: ["Culture"], qualityScore: 11 }),
  ];
  const input = [...restaurants, ...alternatives];
  const first = filterExploreResults(base, input, "all", "for-you");
  const second = filterExploreResults(base, input, "all", "for-you");
  const leading = first.slice(0, 12);
  assert.deepEqual(second.map((result) => result.identity), first.map((result) => result.identity));
  assert.equal(leading.every((result) => result.kind !== "restaurant"), true);
  assert.equal(new Set(leading.map((result) => result.category)).size >= 4, true);
  assert.equal(first.length, alternatives.length - 2);
});

test("Food retains distinct restaurants and provider quality ordering without mixed-feed diversification", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const restaurants = Array.from({ length: 15 }, (_, index) => exploreResultForLocalPlace(stop, {
    id: `food-${index}`,
    name: index === 14 ? "Distinctive provider favourite" : `Athens restaurant ${index + 1}`,
    address: `${index + 1} Food Street, Athens`,
    category: "restaurant",
    coordinates: [23.72 + index * 0.002, 37.98],
    mapsUrl: `https://maps.example/food-${index}`,
    provider: "openstreetmap",
    ...(index === 14 ? { rating: 4.9, reviewCount: 2_000 } : {}),
  }));
  const food = filterExploreResults(base, restaurants, "all", "food");
  assert.equal(food.length, 15);
  assert.equal(food[0]?.title, "Distinctive provider favourite");
  assert.deepEqual(food.slice(1).map((result) => result.sourceId), restaurants.slice(0, 14).map((result) => result.sourceId));
  assert.deepEqual(filterExploreResults(base, restaurants, "all", "for-you"), []);
});

test("legitimate non-food visitor places survive For you while food places stay Food-only", () => {
  const base = trip();
  const stop = base.stops[0]!;
  const controls = [
    exploreResultForPlace(stop, { ...place, id: "seoul-palace", title: "Gyeongbokgung Palace", type: "Landmark", tags: ["Culture"], qualityScore: 18 }),
    exploreResultForPlace(stop, { ...place, id: "kyoto-market", title: "Nishiki Market", type: "Market", tags: ["Food"], qualityScore: 17 }),
    exploreResultForPlace(stop, { ...place, id: "amsterdam-museum", title: "Rijksmuseum", type: "Museum", tags: ["Culture"], qualityScore: 19 }),
  ];
  assert.deepEqual(filterExploreResults(base, controls, "all", "for-you").map((result) => result.title), ["Rijksmuseum", "Gyeongbokgung Palace"]);
  assert.deepEqual(filterExploreResults(base, controls, "all", "food").map((result) => result.title), ["Nishiki Market"]);
});

test("commercial metadata remains absent when the provider does not source it", () => {
  const base = trip();
  const result = exploreResultForActivity(base.stops[0]!, { provider: "viator", source: "viator", providerProductId: "minimal", title: "Guided walk", destination: { canonicalPlaceId: "athens-gr", label: "Athens" }, provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-12T00:00:00.000Z" } }, base);
  assert.equal(result.rating, undefined);
  assert.equal(result.reviewCount, undefined);
  assert.equal(result.price, undefined);
  assert.equal(result.duration, undefined);
});

test("stale or ambiguous day context never schedules into another stop or silently guesses", () => {
  const base = trip();
  const result = exploreResultForPlace(base.stops[0]!, place);
  assert.equal(exploreScheduleTarget(base, result, 3)?.day.id, "day-2", "a stale Naxos day falls back only to a grounded Athens opportunity");
  base.planItems[1] = { ...base.planItems[1]!, notes: ["Morning", "Lunch", "Afternoon", "Evening"], noteDayParts: ["morning", "midday", "afternoon", "evening"] };
  base.planItems.push({ ...base.planItems[1]!, id: "day-4", dayNumber: 4, date: "2026-09-13" });
  assert.equal(exploreScheduleTarget(base, result), null, "multiple valid days without a free part require a traveller choice");
  assert.equal(exploreScheduleTarget(base, result, 4)?.day.id, "day-4");
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
