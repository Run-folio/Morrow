import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { catalogDayTripPlaces, dayTripPlacesFromProvider, MAXIMUM_DAY_TRIP_DISTANCE_KM } from "../lib/easyt/day-trip-discovery.ts";
import { exploreResultForLocalPlace } from "../lib/easyt/explore.ts";
import { outdoorPlacesFromOpenStreetMap, OUTDOOR_DISCOVERY_RADIUS_KM } from "../lib/easyt/outdoor-discovery.ts";
import { createPlanningConfidence } from "../lib/easyt/planning-confidence.ts";
import type { TripStop } from "../lib/easyt/trip.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const tokyo: TripStop = {
  id: "tokyo-stop",
  canonicalPlaceId: "tokyo",
  order: 0,
  name: "Tokyo",
  country: "Japan",
  latitude: 35.6762,
  longitude: 139.6503,
  arrivalDate: "2026-09-15",
  departureDate: "2026-09-18",
  nights: 3,
};

test("local restaurant projection preserves exact Google Place identity for photos and deduplication", () => {
  const result = exploreResultForLocalPlace(tokyo, {
    id: "google-ChIJRestaurantTokyo123",
    name: "Exact Tokyo restaurant",
    address: "1 Example Street, Tokyo, Japan",
    category: "Restaurant",
    coordinates: [139.7, 35.68],
    mapsUrl: "https://www.google.com/maps/place/?q=place_id:ChIJRestaurantTokyo123",
    provider: "google-places",
    providerProductId: "ChIJRestaurantTokyo123",
  });
  assert.equal(result.providerProductId, "ChIJRestaurantTokyo123");
  assert.equal(result.identity, "stop:tokyo-stop:provider:google-places:ChIJRestaurantTokyo123");
});

test("Day trips accept adjacent regions, remain bounded, and use only reviewed catalog fallback facts", () => {
  const provider = dayTripPlacesFromProvider("Tokyo", [{
    canonicalPlaceId: "open-world:kamakura",
    name: "Kamakura",
    label: "Kamakura · Kanagawa, Japan",
    country: "Japan",
    region: "Kanagawa",
    placeType: "city",
    coordinates: [139.5503, 35.3192],
    routability: "direct_destination",
    provenance: [],
    distanceKm: 43,
    containment: "country",
    confidence: createPlanningConfidence({ state: "inferred", level: "high", freshness: "current", scope: "general-route", sources: [], reason: "Provider identity" }),
    reason: "43 km from Tokyo",
  }]);
  assert.deepEqual(provider.map((place) => [place.title, place.discoverySource]), [["Kamakura", "live-place-provider"]]);
  assert.match(provider[0]!.description, /Check current transport options/);
  assert.doesNotMatch(provider[0]!.description, /(?:train|bus|fare|minutes?)/i);

  const fallback = catalogDayTripPlaces({
    destination: "Tokyo",
    country: "Japan",
    canonicalPlaceId: "tokyo",
    coordinates: [139.6503, 35.6762],
  });
  assert.equal(MAXIMUM_DAY_TRIP_DISTANCE_KM, 140);
  assert.equal(fallback.some((place) => place.title === "Nikko" && place.discoverySource === "reviewed-place-catalog"), true);
  assert.equal(fallback.every((place) => place.title !== "Tokyo"), true);
});

test("Outdoors projects explicit visitor features and rejects indoor, administrative, wrong-country and distant noise", () => {
  const places = outdoorPlacesFromOpenStreetMap({
    destination: "Tokyo",
    country: "Japan",
    coordinates: [139.6503, 35.6762],
    elements: [
      { id: 1, type: "way", center: { lat: 35.6852, lon: 139.7101 }, tags: { name: "Shinjuku Gyoen", leisure: "garden", "addr:country": "JP" } },
      { id: 2, type: "node", lat: 35.62, lon: 139.25, tags: { name: "Mountain viewpoint", tourism: "viewpoint", "addr:country": "Japan" } },
      { id: 3, type: "way", center: { lat: 35.68, lon: 139.7 }, tags: { name: "Tokyo administration", boundary: "administrative", leisure: "park" } },
      { id: 4, type: "way", center: { lat: 35.68, lon: 139.7 }, tags: { name: "Indoor theatre", amenity: "theatre" } },
      { id: 5, type: "way", center: { lat: 35.68, lon: 139.7 }, tags: { name: "Wrong-country park", leisure: "park", "addr:country": "France" } },
      { id: 6, type: "way", center: { lat: 36.7, lon: 139.7 }, tags: { name: "Distant park", leisure: "park", "addr:country": "Japan" } },
    ],
  });
  assert.equal(OUTDOOR_DISCOVERY_RADIUS_KM, 50);
  assert.deepEqual(places.map((place) => place.title), ["Shinjuku Gyoen", "Mountain viewpoint"]);
  assert.equal(places.every((place) => place.sourceUrl?.startsWith("https://www.openstreetmap.org/")), true);
  assert.equal(places.every((place) => /Check current access, conditions and suitability/.test(place.description)), true);
});

test("outdoor semantics stay destination-agnostic across Asia, Europe, and Africa", () => {
  const fixtures = [
    ["Tokyo", "Japan", [139.6503, 35.6762]],
    ["Kyoto", "Japan", [135.7681, 35.0116]],
    ["Barcelona", "Spain", [2.1734, 41.3851]],
    ["Cape Town", "South Africa", [18.4241, -33.9249]],
  ] as const;
  for (const [destination, country, coordinates] of fixtures) {
    const places = outdoorPlacesFromOpenStreetMap({
      destination,
      country,
      coordinates: [...coordinates],
      elements: [{
        id: 10,
        type: "way",
        center: { lat: coordinates[1] + 0.01, lon: coordinates[0] + 0.01 },
        tags: { name: `${destination} botanical garden`, leisure: "garden" },
      }],
    });
    assert.deepEqual(places.map((place) => place.type), ["Garden"], destination);
  }
});

test("Explore UI keeps photo retrieval exact, no-image restaurants compact, and source failures state-neutral", () => {
  const workspace = source("components/easyt/trip-explore-workspace.tsx");
  const styles = source("components/easyt/trip-explore-workspace.module.css");
  const dayTrips = source("app/api/journey-day-trips/route.ts");
  const outdoors = source("app/api/journey-outdoors/route.ts");
  assert.match(workspace, /useJourneyLocalPlacePhotos\(restaurantPhotoPlaces, \{ limit: 12, kind: "restaurant" \}\)/);
  assert.match(workspace, /data-image-state=\{compactNoImage \? "compact-none" : "media"\}/);
  assert.match(styles, /\.cardCompact \{ display: block; \}/);
  assert.match(dayTrips, /parentRegionId: undefined/);
  assert.match(dayTrips, /catalogFallback/);
  assert.match(outdoors, /searchStatus: places\.length \? "ready" : "empty"/);
  assert.match(outdoors, /searchStatus: "failed"/);
});
