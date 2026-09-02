import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { composeItineraryDay } from "../lib/easyt/itinerary-day-composition.ts";
import { itineraryDayMapContext } from "../lib/easyt/itinerary-day-context.ts";
import {
  canonicalJourneyEndpointPlace,
  journeyEndpointIdentityIsCoherent,
  journeyEndpointPlaceFromSuggestion,
} from "../lib/easyt/journey-endpoints.ts";
import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import {
  isOvernightBaseEligible,
  placeCandidateSuitableAsNearbyBase,
  type CanonicalPlaceSuggestion,
  type NearbyBaseAnchor,
} from "../lib/easyt/place-intelligence.ts";
import { canonicalRouteEndpoints, tripOriginEndpointId } from "../lib/easyt/trip-legs.ts";
import { isEasyTTrip, tripFromBuilder, type BuilderTripInput } from "../lib/easyt/trip.ts";

const cancun = {
  name: "Cancún",
  country: "Mexico",
  canonicalPlaceId: "cancun",
  coordinates: [-86.8515, 21.1619] as [number, number],
};

const stops: BuilderTripInput["stops"] = [
  { id: "cancun-stop", ...cancun },
  { id: "tulum", name: "Tulum", country: "Mexico", canonicalPlaceId: "tulum", coordinates: [-87.4654, 20.2114] },
  { id: "antigua", name: "Antigua Guatemala", country: "Guatemala", canonicalPlaceId: "antigua-guatemala", coordinates: [-90.7339, 14.5586] },
  { id: "caye-caulker", name: "Caye Caulker", country: "Belize", canonicalPlaceId: "caye-caulker", coordinates: [-88.0246, 17.7425] },
  { id: "belize-city", name: "Belize City", country: "Belize", canonicalPlaceId: "belize-city", coordinates: [-88.1962, 17.5046] },
  { id: "flores", name: "Flores", country: "Guatemala", canonicalPlaceId: "open-world:nominatim:node:flores", coordinates: [-89.897, 16.9294] },
];

function acceptanceTrip() {
  return tripFromBuilder({
    id: "cancun-return-regression",
    origin: cancun.name,
    originCountry: cancun.country,
    originCanonicalPlaceId: cancun.canonicalPlaceId,
    originCoordinates: cancun.coordinates,
    journeyEnd: { mode: "same_as_start" },
    stops,
    startDate: "2026-10-01",
    endDate: "2026-10-06",
    picks: {},
    mustDo: "Cancún to Flores and back",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: Object.fromEntries(stops.map((stop) => [stop.id, 1])),
    draft: stops.map((stop, index) => ({
      number: String(index + 1),
      date: `2026-10-0${index + 1}`,
      destination: stop.name,
      title: index === 0 ? "Start in Cancún" : `Travel to ${stop.name}`,
      reason: "Canonical route regression fixture",
      items: [],
      type: index === 0 ? "arrival" : "activity",
    })),
  });
}

test("Tikal → Flores and Lake Atitlán → San Pedro complete at the selected overnight locality", () => {
  assert.equal(isOvernightBaseEligible({ placeType: "city", routability: "direct_destination" }), true);
  assert.equal(isOvernightBaseEligible({ placeType: "town", routability: "direct_destination" }), true);
  assert.equal(isOvernightBaseEligible({ placeType: "landmark", routability: "anchor_or_poi" }), false);
  assert.equal(isOvernightBaseEligible({ placeType: "natural_area", routability: "needs_base_selection" }), false);
  assert.equal(isOvernightBaseEligible({ placeType: "country", routability: "planning_area" }), false);
});

test("manual nearby search accepts a provider locality outside the curated suggestion catalogue", () => {
  const tikal: NearbyBaseAnchor = {
    canonicalPlaceId: "tikal",
    canonicalName: "Tikal",
    placeType: "landmark",
    parentCountries: ["Guatemala"],
    parentRegionId: "peten",
    coordinates: [-89.6237, 17.222],
  };
  const providerOnly = {
    providerId: "nominatim:node:el-remate",
    canonicalName: "El Remate",
    placeType: "town" as const,
    parentCountries: ["Guatemala"],
    parentRegionId: "peten",
    coordinates: [-89.6874, 16.9917] as [number, number],
    routability: "direct_destination" as const,
  };
  assert.ok(placeCandidateSuitableAsNearbyBase(tikal, providerOnly));
  assert.equal(isOvernightBaseEligible(providerOnly), true);
  const api = readFileSync(new URL("../app/api/journey-geocode/route.ts", import.meta.url), "utf8");
  assert.match(api, /searchOpenWorldTravelCandidates/);
  assert.match(api, /candidates\.slice\(0, 8\)/);
  assert.match(api, /placeType: candidate\.placeType/);
});

test("endpoint replacement drops every stale East Asian identity field", () => {
  const stale = canonicalJourneyEndpointPlace({
    name: "Seoul",
    canonicalPlaceId: "seoul",
    country: "South Korea",
    providerId: "old:seoul",
    coordinates: [126.978, 37.5665],
  });
  const suggestion: CanonicalPlaceSuggestion = {
    canonicalPlaceId: "cancun",
    name: "Cancún",
    label: "Cancún, Mexico",
    country: "Mexico",
    placeType: "city",
    coordinates: cancun.coordinates,
    routability: "direct_destination",
    provenance: [{ id: "nominatim:cancun", label: "Global place provider", kind: "provider", supports: "Selected place" }],
  };
  const replacement = journeyEndpointPlaceFromSuggestion(suggestion);
  assert.notDeepEqual(replacement, stale);
  assert.deepEqual(replacement, { ...cancun, providerId: "nominatim:cancun" });
  assert.equal(journeyEndpointIdentityIsCoherent(replacement), true);
  assert.equal(journeyEndpointIdentityIsCoherent({ ...replacement, coordinates: stale.coordinates }), false);
});

test("origin, overnight stops and return form one deduplicated travel sequence", () => {
  const trip = acceptanceTrip();
  assert.deepEqual(canonicalRouteEndpoints(trip).map((endpoint) => endpoint.name), [
    "Cancún", "Tulum", "Antigua Guatemala", "Caye Caulker", "Belize City", "Flores", "Cancún",
  ]);
  assert.equal(trip.legs.some((leg) => leg.fromEndpoint?.name === "Cancún" && leg.toEndpoint?.name === "Cancún"), false);
  assert.deepEqual([trip.legs.at(-1)?.fromEndpoint?.name, trip.legs.at(-1)?.toEndpoint?.name], ["Flores", "Cancún"]);
  assert.equal(trip.legs.at(-1)?.classification, "departure");
  assert.equal(trip.stops.length, 6);
  assert.equal(trip.stops.reduce((total, stop) => total + (stop.nights ?? 0), 0), 6);
});

test("Map ignores a stale saved leg snapshot and fits the canonical Cancún return", () => {
  const trip = acceptanceTrip();
  trip.legs[0] = {
    ...trip.legs[0]!,
    fromStopId: tripOriginEndpointId(trip.id),
    fromEndpoint: { kind: "origin", id: tripOriginEndpointId(trip.id), name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [126.978, 37.5665] },
  };
  const mapped = mapRouteLegsFromTrip(trip);
  assert.deepEqual(mapped[0]?.fromCoordinates, cancun.coordinates);
  assert.deepEqual(mapped.at(-1)?.toCoordinates, cancun.coordinates);
  assert.equal(mapped.some((leg) => leg.fromCoordinates[0] > 100), false);
});

test("Itinerary has no fake first-day arrival and retains the final return transfer", () => {
  const trip = acceptanceTrip();
  const first = composeItineraryDay(trip, trip.planItems[0]!.id);
  const last = composeItineraryDay(trip, trip.planItems.at(-1)!.id);
  assert.equal(first?.transfers.some((transfer) => transfer.origin === "Cancún" && transfer.destination === "Cancún"), false);
  assert.equal(last?.transfers.some((transfer) => transfer.direction === "departing" && transfer.origin === "Flores" && transfer.destination === "Cancún"), true);
  assert.equal(last?.tonight.destination, "Flores");
  assert.equal(itineraryDayMapContext(trip, trip.planItems.at(-1)!, null).legs.some((leg) => leg.fromName === "Flores" && leg.toName === "Cancún"), true);
});

test("origin and return survive persistence while legacy trips without return stay valid", () => {
  const reloaded = JSON.parse(JSON.stringify(acceptanceTrip())) as ReturnType<typeof acceptanceTrip>;
  assert.equal(isEasyTTrip(reloaded), true);
  assert.equal(reloaded.brief.originCanonicalPlaceId, "cancun");
  assert.deepEqual(reloaded.brief.originCoordinates, cancun.coordinates);
  assert.deepEqual(reloaded.brief.journeyEnd, { mode: "same_as_start" });
  assert.deepEqual(reloaded.legs.at(-1)?.toEndpoint?.coordinates, cancun.coordinates);
  delete reloaded.brief.journeyEnd;
  if (reloaded.brief.intent) delete reloaded.brief.intent.journeyEnd;
  assert.equal(isEasyTTrip(reloaded), true);
});
