import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalMapTransportMode,
  conciseMapDescription,
  geographicRouteBearing,
  mapCopilotPrompts,
  mapRouteBearing,
  mapRouteLegsFromTrip,
  mapRouteMarkerCoordinates,
} from "../lib/easyt/map-spatial-context.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const trip = {
  stops: [
    { id: "rome", order: 0, name: "Rome", country: "Italy", latitude: 41.9028, longitude: 12.4964, arrivalDate: null, departureDate: null, nights: 4 },
    { id: "athens", order: 1, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: null, departureDate: null, nights: 5 },
    { id: "naxos", order: 2, name: "Naxos", country: "Greece", latitude: 37.1036, longitude: 25.3777, arrivalDate: null, departureDate: null, nights: 4 },
  ],
  legs: [
    {
      id: "rome-athens",
      fromStopId: "rome",
      toStopId: "athens",
      mode: "flight",
      distanceKm: 1051,
      durationMinutes: 263,
      provider: "Door-to-door flight estimate; verify schedules before booking.",
      routeMetadata: {
        planningEstimate: true,
        transferImpact: {
          headline: { status: "known", value: { planningMinutes: 123 } },
          doorToDoor: { status: "known", value: { planningMinutes: 263 } },
        },
      },
    },
    {
      id: "athens-naxos",
      fromStopId: "athens",
      toStopId: "naxos",
      mode: "unknown",
      distanceKm: null,
      durationMinutes: null,
      provider: null,
      routeMetadata: {},
    },
  ],
} as unknown as Pick<EasyTTrip, "stops" | "legs">;

test("canonical map legs retain supported transport facts and honest planning provenance", () => {
  const [flight] = mapRouteLegsFromTrip(trip);
  assert.equal(flight.modeLabel, "Flight");
  assert.equal(flight.distanceKm, 1051);
  assert.equal(flight.headlineMinutes, 123);
  assert.equal(flight.doorToDoorMinutes, 263);
  assert.equal(flight.provenanceLabel, "Morrovia planning estimate");
  assert.equal(flight.scheduleNeedsChecking, true);
});

test("canonical mixed transfers preserve their ordered journey-mode detail", () => {
  const mixedTrip = {
    stops: trip.stops.slice(0, 2),
    legs: [{
      id: "rome-athens-mixed",
      fromStopId: "rome",
      toStopId: "athens",
      mode: "mixed",
      distanceKm: null,
      durationMinutes: 320,
      provider: "Saved transfer",
      routeMetadata: {},
      segments: [
        {
          id: "rome-airport-flight",
          mode: "flight",
          fromEndpoint: { kind: "stop", id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
          toEndpoint: { kind: "gateway", id: "athens-airport", name: "Athens airport", country: "Greece", coordinates: [23.9445, 37.9364] },
        },
        {
          id: "athens-airport-road",
          mode: "road",
          fromEndpoint: { kind: "gateway", id: "athens-airport", name: "Athens airport", country: "Greece", coordinates: [23.9445, 37.9364] },
          toEndpoint: { kind: "stop", id: "athens", name: "Athens", country: "Greece", coordinates: [23.7275, 37.9838] },
        },
      ],
    }],
  } as unknown as Pick<EasyTTrip, "stops" | "legs">;

  const [mixed] = mapRouteLegsFromTrip(mixedTrip);
  assert.equal(mixed.mode, "mixed");
  assert.equal(mixed.modeLabel, "Flight + road");
});

test("every mappable canonical stop participates in the whole route in saved order", () => {
  const legs = mapRouteLegsFromTrip(trip);
  assert.deepEqual(
    legs.map((leg) => [leg.fromStopId, leg.toStopId]),
    [["rome", "athens"], ["athens", "naxos"]],
  );
  assert.deepEqual(
    new Set(legs.flatMap((leg) => [leg.fromStopId, leg.toStopId])),
    new Set(trip.stops.map((stop) => stop.id)),
  );
  assert.deepEqual(legs[0]?.fromCoordinates, [12.4964, 41.9028]);
  assert.deepEqual(legs[0]?.toCoordinates, [23.7275, 37.9838]);
});

test("an unknown canonical mode remains unknown on the map", () => {
  const unknown = mapRouteLegsFromTrip(trip)[1];
  assert.equal(unknown.mode, "unknown");
  assert.equal(unknown.modeLabel, "Unknown transport");
  assert.equal(unknown.headlineMinutes, null);
  assert.equal(unknown.doorToDoorMinutes, null);
});

test("known rail aliases normalize at the Map presentation boundary without inference", () => {
  for (const alias of ["rail", "high_speed_rail", "high-speed-rail", "highspeedrail", "intercity-rail", "metro", "metro_rail"]) {
    assert.equal(canonicalMapTransportMode(alias), "train", alias);
  }
  assert.equal(canonicalMapTransportMode("looks-like-rail"), "unknown");
  assert.equal(canonicalMapTransportMode(undefined), "unknown");
});

test("route marker bearings follow ordered geometry and cross the dateline correctly", () => {
  assert.ok(Math.abs(geographicRouteBearing([0, 0], [0, 10])) < 0.001);
  assert.ok(Math.abs(geographicRouteBearing([0, 0], [10, 0]) - 90) < 0.001);
  assert.ok(Math.abs(Math.abs(geographicRouteBearing([0, 0], [0, -10])) - 180) < 0.001);
  assert.ok(Math.abs(geographicRouteBearing([0, 0], [-10, 0]) + 90) < 0.001);
  assert.ok(geographicRouteBearing([0, 0], [10, 10]) > 40 && geographicRouteBearing([0, 0], [10, 10]) < 50);
  assert.ok(geographicRouteBearing([179, 0], [-179, 0]) > 89);

  const curved = {
    fromCoordinates: [0, 0] as [number, number],
    toCoordinates: [30, 0] as [number, number],
    routeGeometry: [[0, 0], [10, 0], [10, 10], [10, 20], [30, 0]] as Array<[number, number]>,
  };
  assert.deepEqual(mapRouteMarkerCoordinates(curved), [10, 10]);
  assert.ok(Math.abs(mapRouteBearing(curved) ?? 999) < 1, "the marker follows the local northbound segment, not the endpoint chord");
});

test("map context projection and co-pilot prompts cannot mutate TripDocument", () => {
  const before = structuredClone(trip);
  mapRouteLegsFromTrip(trip);
  assert.deepEqual(mapCopilotPrompts("whole-trip"), ["Explain this route", "Where is the trip most tiring?", "Could this route flow better?"]);
  assert.deepEqual(mapCopilotPrompts("selected-transfer"), ["Explain this transfer", "Is there an easier alternative?", "How much of the day will this take?"]);
  assert.deepEqual(trip, before);
});

test("provider descriptions are kept concise for destination detail", () => {
  const description = "Athens is the capital of Greece. ".repeat(20);
  const concise = conciseMapDescription(description, 120);
  assert.ok(concise.length <= 121);
  assert.match(concise, /\.$/);
});
