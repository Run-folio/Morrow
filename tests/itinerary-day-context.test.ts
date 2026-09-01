import assert from "node:assert/strict";
import test from "node:test";

import {
  itineraryDayLegs,
  itineraryDayMapContext,
  itineraryDayMapSelection,
  itinerarySelectionForMapPin,
  itinerarySuggestionCandidates,
  type ItineraryDiscoveryPlace,
} from "../lib/easyt/itinerary-day-context.ts";
import { addMappedPlaceToTrip, mappedPlacePinId } from "../lib/easyt/map-place-itinerary.ts";
import type { EasyTTrip, PlanItem } from "../lib/easyt/trip.ts";

function day(dayNumber: number, stopId: string, title: string, coordinates: [number, number] | null = null): PlanItem {
  return {
    id: `day-${dayNumber}`,
    stopId,
    dayNumber,
    date: `2026-09-0${dayNumber}`,
    type: "activity",
    title,
    reason: "Keep the day coherent.",
    notes: dayNumber === 1 ? ["Colosseum"] : ["Acropolis"],
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    longitude: coordinates?.[0] ?? null,
    latitude: coordinates?.[1] ?? null,
  };
}

function tripFixture(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "itinerary-context-trip",
    ownerId: "owner-a",
    title: "Rome and Athens",
    status: "planned",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      originCountry: "United Kingdom",
      originCoordinates: [-0.1276, 51.5072],
      mustDo: "Colosseum",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: { rome: ["Pantheon"] },
      customActivities: {},
      dayNotes: { 1: ["Book timed entry"] },
      mapPins: [
        { id: "hotel-rome", title: "Hotel Artemide", category: "stay", dayNumber: 1, longitude: 12.493, latitude: 41.9 },
        { id: "athens-pin", title: "Agora", category: "activity", dayNumber: 2, longitude: 23.722, latitude: 37.975 },
      ],
      bookings: [],
    },
    stops: [
      { id: "rome", order: 0, name: "Rome", country: "Italy", longitude: 12.4964, latitude: 41.9028, arrivalDate: "2026-09-01", departureDate: "2026-09-02", nights: 1 },
      { id: "athens", order: 1, name: "Athens", country: "Greece", longitude: 23.7275, latitude: 37.9838, arrivalDate: "2026-09-02", departureDate: "2026-09-03", nights: 1 },
    ],
    legs: [
      { id: "arrival-rome", fromStopId: "itinerary-context-trip-origin", toStopId: "rome", mode: "flight", distanceKm: 1434, durationMinutes: 270, provider: "Saved flight", routeMetadata: {}, classification: "arrival" },
      { id: "rome-athens", fromStopId: "rome", toStopId: "athens", mode: "flight", distanceKm: 1050, durationMinutes: 230, provider: "Saved flight", routeMetadata: {}, classification: "international" },
    ],
    planItems: [day(1, "rome", "Rome highlights", [12.4922, 41.8902]), day(2, "athens", "Athens highlights")],
    recommendations: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "revision-1",
  };
}

const discovery: ItineraryDiscoveryPlace[] = [
  { id: "wiki-colosseum", title: "Colosseum", area: "Rome", type: "Landmark", tags: ["Cities"], description: "Already planned", coordinates: [12.4922, 41.8902] },
  { id: "wiki-pantheon", title: "Pantheon", area: "Rome", type: "Landmark", tags: ["Cities"], description: "Already selected", coordinates: [12.4768, 41.8986] },
  { id: "wiki-borghese", title: "Borghese Gallery", area: "Rome", type: "Culture", tags: ["Cities"], description: "A nearby gallery", coordinates: [12.4923, 41.9142] },
  { id: "wiki-borghese-copy", title: "  borghese   gallery ", area: "Rome", type: "Culture", tags: ["Cities"], description: "Duplicate provider result", coordinates: [12.4924, 41.9143] },
];

test("selected-day map context uses stable route, plan-item, and pin identities", () => {
  const trip = tripFixture();
  const active = trip.planItems[0]!;
  assert.deepEqual(itineraryDayLegs(trip, active).map((leg) => leg.id), ["arrival-rome", "rome-athens"]);

  const transfer = itineraryDayMapContext(trip, active, "leg-rome-athens");
  assert.equal(transfer.selectedLegId, "rome-athens");
  assert.deepEqual(transfer.legs.map((leg) => leg.id), ["arrival-rome", "rome-athens"]);
  assert.deepEqual(transfer.stops.map((stop) => stop.id), ["itinerary-context-trip-origin", "rome", "athens"]);
  assert.deepEqual(transfer.pins.map((pin) => pin.id), ["plan-item-day-1", "hotel-rome"]);

  const selectedPin = itineraryDayMapContext(trip, active, "map-pin:hotel-rome");
  assert.equal(selectedPin.selectedPlannerPinId, "hotel-rome");
  assert.deepEqual(selectedPin.focusCoordinates, [12.493, 41.9]);
  assert.equal(itinerarySelectionForMapPin(selectedPin.pins[1]!, active), "map-pin:hotel-rome");
});

test("map linkage never selects a pin by a matching timeline title", () => {
  const trip = tripFixture();
  trip.planItems[0] = { ...trip.planItems[0]!, notes: ["Hotel Artemide"] };
  const context = itineraryDayMapContext(trip, trip.planItems[0]!, "day-1-note-0");
  assert.equal(context.selectedPlannerPinId, null);
  assert.equal(context.focusCoordinates, null);
});

test("presentational map selection preserves spatial array identity", () => {
  const trip = tripFixture();
  const active = trip.planItems[0]!;
  const spatial = itineraryDayMapContext(trip, active, null);
  const timelineOnly = itineraryDayMapSelection(spatial, active, "day-1-note-0");
  const selectedPin = itineraryDayMapSelection(spatial, active, "map-pin:hotel-rome");

  assert.equal(timelineOnly.stops, spatial.stops);
  assert.equal(timelineOnly.legs, spatial.legs);
  assert.equal(timelineOnly.pins, spatial.pins);
  assert.equal(timelineOnly.selectedPlannerPinId, null);
  assert.equal(selectedPin.stops, spatial.stops);
  assert.equal(selectedPin.legs, spatial.legs);
  assert.equal(selectedPin.pins, spatial.pins);
  assert.equal(selectedPin.selectedPlannerPinId, "hotel-rome");
  assert.deepEqual(selectedPin.focusCoordinates, [12.493, 41.9]);
});

test("contextual suggestions omit planned and duplicate places, then disappear after the canonical Map add", () => {
  const trip = tripFixture();
  const active = trip.planItems[0]!;
  const candidates = itinerarySuggestionCandidates(trip, active, discovery);
  assert.deepEqual(candidates.map((place) => place.id), ["wiki-borghese"]);

  const added = addMappedPlaceToTrip(
    trip,
    { id: candidates[0]!.id, name: candidates[0]!.title, coordinates: candidates[0]!.coordinates },
    "activity",
    active.dayNumber,
    active.stopId,
  );
  assert.equal(added.planItems[0]?.notes.includes("Borghese Gallery"), true);
  assert.equal(added.brief.customActivities?.[1]?.includes("Borghese Gallery"), true);
  assert.equal(added.brief.mapPins?.some((pin) => pin.id === mappedPlacePinId(1, "activity", { id: "wiki-borghese", name: "Borghese Gallery", coordinates: [12.4923, 41.9142] })), true);
  assert.deepEqual(itinerarySuggestionCandidates(added, active, discovery), []);
  assert.equal(addMappedPlaceToTrip(added, { id: "wiki-borghese", name: "Borghese Gallery", coordinates: [12.4923, 41.9142] }, "activity", 1, "rome"), added, "rapid duplicate adds fail closed without a second mutation");
});
