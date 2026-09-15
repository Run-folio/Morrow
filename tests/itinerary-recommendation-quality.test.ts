import assert from "node:assert/strict";
import test from "node:test";

import type { ActivityInventoryItem } from "../lib/easyt/activity-inventory.ts";
import { discoveryVisitorRelevance } from "../lib/easyt/discovery-quality.ts";
import { exploreResultForActivity, exploreResultForPlace } from "../lib/easyt/explore.ts";
import { itinerarySuggestionCandidates, type ItineraryDiscoveryPlace } from "../lib/easyt/itinerary-day-context.ts";
import { scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import { rankItineraryRecommendations } from "../lib/easyt/itinerary-recommendations.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";

function place(id: string, title: string, type: string, description: string, qualityScore = 11): ItineraryDiscoveryPlace {
  return { id, title, area: "Cancún", type, tags: [type], description, qualityScore, coordinates: [-86.85 + id.length / 1000, 21.16] };
}

function tour(id: string, title: string, duration: ActivityInventoryItem["duration"], rating = 4.8): ActivityInventoryItem {
  return {
    provider: "viator", source: "viator", providerProductId: id, title,
    destination: { canonicalPlaceId: "place:tokyo", label: "Tokyo" },
    duration, rating, reviewCount: 800, productUrl: `https://www.viator.com/tours/${id}`,
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T12:00:00.000Z" },
  };
}

test("shared visitor relevance rejects weak infrastructure but retains strongly evidenced landmarks", () => {
  const trip = tripCopilotFixture();
  const day = trip.planItems[1]!;
  const candidates = [
    place("road-bridge", "Nichupté Vehicular Bridge", "Landmark", "A vehicular bridge carrying local road traffic.", 30),
    place("stadium", "Estadio Cancún 86", "Landmark", "A local football stadium."),
    place("tower-bridge", "Tower Bridge", "Landmark", "An iconic historic landmark and visitor attraction.", 16),
    place("notable-stadium", "National Stadium", "Landmark", "A notable cultural landmark and home of the national team.", 15),
    place("museum", "Maya Museum", "Museum", "A major museum of Maya history.", 17),
  ];
  assert.deepEqual(itinerarySuggestionCandidates(trip, day, candidates).map((candidate) => candidate.id), ["museum", "tower-bridge", "notable-stadium"]);
  assert.equal(discoveryVisitorRelevance({ title: "Ordinary office", category: "Administrative", description: "Municipal office" }).eligible, false);
});

test("visitor relevance rejects generic stations, regions, events and theatres before interest ranking", () => {
  const fixtures = [
    { title: "Hoehyeon station", category: "Culture", tags: ["Culture"], description: "A subway station in central Seoul.", qualityScore: 30 },
    { title: "Ishikawa Prefecture", category: "Culture", tags: ["Culture"], description: "An administrative region of Japan.", qualityScore: 30 },
    { title: "Bombing of Tokyo", category: "Historic site", tags: ["Culture"], description: "A historical event article.", qualityScore: 30 },
    { title: "New National Theatre Tokyo", category: "Culture", tags: ["Culture"], description: "A theatre building and performance venue.", qualityScore: 30 },
  ];
  for (const fixture of fixtures) assert.equal(discoveryVisitorRelevance({ ...fixture, kind: "activity" }).eligible, false, fixture.title);
  assert.equal(discoveryVisitorRelevance({ title: "Tokyo National Museum", category: "Museum", description: "A major visitor museum.", kind: "activity" }).eligible, true);
  assert.equal(discoveryVisitorRelevance({ title: "Tower Bridge", category: "Landmark", description: "An iconic landmark and visitor attraction.", kind: "activity" }).eligible, true);
  assert.equal(discoveryVisitorRelevance({ title: "Historic theatre", category: "Theatre", description: "A visitor attraction with guided architecture tours.", kind: "activity" }).eligible, true);
});

test("visitor relevance rejects institutions and incidents while preserving varied visitable places", () => {
  const rejected = [
    { title: "Korea Science Academy of KAIST", category: "Place", description: "A science school and educational institution." },
    { title: "Busan National University of Education", category: "Place", description: "A public university." },
    { title: "Kinmon incident", category: "Historic site", description: "A historical incident represented as an encyclopedia article.", qualityScore: 30 },
    { title: "Regional planning corporation", category: "Place", description: "A generic organization and government agency." },
  ];
  for (const candidate of rejected) assert.equal(discoveryVisitorRelevance({ ...candidate, kind: "activity" }).eligible, false, candidate.title);
  const preserved = [
    { title: "Myeongdong Cathedral", category: "Church", description: "A cathedral open to visitors." },
    { title: "University Church", category: "Church", description: "A university church open to visitors." },
    { title: "Busan Museum", category: "Museum", description: "A public visitor museum." },
    { title: "Gamcheon Culture Village", category: "Neighbourhood", description: "A walkable cultural neighbourhood." },
    { title: "Underground olive press", category: "Attraction", description: "An unusual visitor attraction with guided tours." },
  ];
  for (const candidate of preserved) assert.equal(discoveryVisitorRelevance({ ...candidate, kind: "activity" }).eligible, true, candidate.title);
});

test("one usefulness-ranked rail can contain organic and commercial results without a commercial boost", () => {
  const trip = tripCopilotFixture();
  const day = { ...trip.planItems[3]!, notes: [] };
  const openTrip = { ...trip, planItems: trip.planItems.map((item) => item.id === day.id ? day : item) };
  const stop = openTrip.stops[0]!;
  const organic = exploreResultForPlace(stop, place("museum", "Maya Museum", "Museum", "A major visitor museum.", 20));
  const commercial = exploreResultForActivity(stop, tour("guided", "Guided cultural walk", { fixedMinutes: 180 }), openTrip);
  const ranked = rankItineraryRecommendations(openTrip, day, [commercial, organic]);
  assert.deepEqual(ranked.map((result) => result.kind), ["activity", "tour"]);
  assert.equal(ranked[1]?.provider, "viator");
  assert.equal(ranked[1]?.providerProductId, "guided");
});

test("day fit conservatively demotes a known full-day tour for evening or a busy day", () => {
  const trip = tripCopilotFixture();
  const day = { ...trip.planItems[3]!, notes: [] };
  const openTrip = { ...trip, planItems: trip.planItems.map((item) => item.id === day.id ? day : item) };
  const stop = openTrip.stops[0]!;
  const long = exploreResultForActivity(stop, tour("long", "Ten-hour day tour", { fixedMinutes: 600 }), openTrip);
  const short = exploreResultForActivity(stop, tour("short", "Two-hour cultural walk", { fixedMinutes: 120 }), openTrip);
  assert.equal(rankItineraryRecommendations(openTrip, day, [long, short]).some((result) => result.sourceId === long.sourceId), true, "a full day remains available on an open day");
  const eveningOnlyDay = { ...day, notes: ["Breakfast", "Museum", "Lunch"], noteDayParts: ["morning", "midday", "afternoon"] as Array<"morning" | "midday" | "afternoon"> };
  const eveningOnlyTrip = { ...openTrip, planItems: openTrip.planItems.map((item) => item.id === day.id ? eveningOnlyDay : item) };
  assert.equal(rankItineraryRecommendations(eveningOnlyTrip, eveningOnlyDay, [long, short])[0]?.sourceId, short.sourceId);

  const busyDay = { ...day, notes: ["Museum", "Lunch"], noteDayParts: ["morning", "midday"] as Array<"morning" | "midday"> };
  const busyTrip = { ...openTrip, planItems: openTrip.planItems.map((item) => item.id === day.id ? busyDay : item) };
  assert.equal(rankItineraryRecommendations(busyTrip, busyDay, [long, short])[0]?.sourceId, short.sourceId);
});

test("an exact planned identity is excluded while a distinct tour about the same landmark remains", () => {
  const trip = tripCopilotFixture();
  const day = trip.planItems[1]!;
  const stop = trip.stops[0]!;
  const attraction = exploreResultForPlace(stop, place("temple", "Historic Temple", "Historic site", "A major historic visitor attraction.", 18));
  const tourResult = exploreResultForActivity(stop, tour("temple-tour", "Historic Temple guided tour", { fixedMinutes: 120 }), trip);
  const scheduled = scheduleItineraryIdea(trip, attraction.idea, day.id, "morning");
  const ranked = rankItineraryRecommendations(scheduled, day, [attraction, tourResult]);
  assert.deepEqual(ranked.map((result) => result.sourceId), [tourResult.sourceId]);
});
