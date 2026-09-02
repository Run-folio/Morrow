import assert from "node:assert/strict";
import test from "node:test";

import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import { buildCanonicalTripLegs, canonicalLegIntegrityIssues, canonicalRouteEndpoints } from "../lib/easyt/trip-legs.ts";
import type { EasyTTrip, TripStop } from "../lib/easyt/trip.ts";

const stop = (id: string, order: number, name: string, country: string, coordinates?: [number, number]): TripStop => ({
  id,
  order,
  name,
  country,
  canonicalPlaceId: id,
  latitude: coordinates?.[1] ?? null,
  longitude: coordinates?.[0] ?? null,
  arrivalDate: null,
  departureDate: null,
  nights: 3,
});

const acceptanceStops = [
  stop("cancun", 0, "Cancún", "Mexico", [-86.8515, 21.1619]),
  stop("tulum", 1, "Tulum", "Mexico", [-87.4654, 20.2114]),
  stop("mexico-city", 2, "Mexico City", "Mexico", [-99.1332, 19.4326]),
  stop("antigua-guatemala", 3, "Antigua Guatemala", "Guatemala", [-90.7343, 14.5586]),
  stop("panajachel", 4, "Panajachel", "Guatemala", [-91.1565, 14.7417]),
  stop("flores", 5, "Flores", "Guatemala", [-89.897, 16.929]),
];

test("London is a first-class route endpoint without becoming an overnight stop", () => {
  const legs = buildCanonicalTripLegs({
    tripId: "acceptance",
    origin: { name: "London", country: "United Kingdom", canonicalPlaceId: "london", coordinates: [-0.1276, 51.5072] },
    stops: acceptanceStops,
    constraints: { transportModes: ["train", "drive"] },
  });
  assert.equal(legs.length, acceptanceStops.length);
  assert.equal(legs[0]?.fromEndpoint?.kind, "origin");
  assert.equal(legs[0]?.fromEndpoint?.name, "London");
  assert.equal(legs[0]?.toEndpoint?.name, "Cancún");
  assert.equal(legs[0]?.classification, "arrival");
  assert.equal(legs[0]?.mode, "flight");
  assert.notEqual(legs[0]?.classification, "local");
  assert.equal(acceptanceStops.some((item) => item.name === "London"), false);
  assert.equal(acceptanceStops.some((item) => item.name === "Guatemala City"), false);

  const tulumMexicoCity = legs.find((leg) => leg.fromEndpoint?.name === "Tulum" && leg.toEndpoint?.name === "Mexico City");
  assert.equal(tulumMexicoCity?.mode, "flight");
  assert.notEqual(tulumMexicoCity?.mode, "road");
  assert.equal(tulumMexicoCity?.warnings?.length, 0);

  const panajachelFlores = legs.find((leg) => leg.fromEndpoint?.name === "Panajachel" && leg.toEndpoint?.name === "Flores");
  assert.equal(panajachelFlores?.mode, "unknown");
  assert.equal(panajachelFlores?.durationMinutes, null);
  assert.match(panajachelFlores?.provider ?? "", /no supported service fact/i);
});

test("overland preference does not invent an unsupported cross-border service", () => {
  const from = stop("antigua-guatemala", 0, "Antigua Guatemala", "Guatemala", [-90.7343, 14.5586]);
  const to = stop("belize-city", 1, "Belize City", "Belize", [-88.1962, 17.5046]);
  const legs = buildCanonicalTripLegs({
    tripId: "overland",
    origin: { name: "Antigua Guatemala", country: "Guatemala", canonicalPlaceId: "antigua-guatemala", coordinates: [-90.7343, 14.5586] },
    stops: [from, to],
    constraints: { transportModes: ["train", "drive"] },
  });
  assert.equal(legs.length, 1);
  assert.equal(legs[0]?.classification, "international");
  assert.equal(legs[0]?.mode, "unknown");
  assert.equal(legs[0]?.durationMinutes, null);
  assert.match(legs[0]?.provider ?? "", /no supported road, rail or ferry service fact/i);
});

test("local movement is local only at genuinely local distance", () => {
  const legs = buildCanonicalTripLegs({
    tripId: "local",
    origin: { name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
    stops: [
      stop("rome", 0, "Rome", "Italy", [12.4964, 41.9028]),
      // Use a genuinely local same-country place. Vatican City carries its own
      // canonical country identity, so labelling it Italy correctly fails the
      // destination-integrity boundary before local-mode classification.
      stop("trastevere", 1, "Trastevere", "Italy", [12.4663, 41.8897]),
    ],
  });
  assert.equal(legs[0]?.classification, "arrival");
  assert.equal(legs[1]?.classification, "local");
  assert.equal(legs[1]?.mode, "road");
});

test("missing geography invalidates timing and usable-day loss", () => {
  const legs = buildCanonicalTripLegs({
    tripId: "missing",
    origin: { name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
    stops: [stop("unknown", 0, "Unknown base", "Unknown")],
  });
  assert.equal(legs[0]?.mode, "unknown");
  assert.equal(legs[0]?.durationMinutes, null);
  assert.equal(legs[0]?.doorToDoorMinutes, null);
  assert.equal(legs[0]?.usableDayLoss, null);
  assert.equal(legs[0]?.confidence, "unknown");
  assert.match(legs[0]?.warnings?.[0] ?? "", /validated coordinates/i);
});

test("saved impossible timing and stale route order are detected without replacement estimates", () => {
  const trip = {
    id: "stale",
    brief: { origin: "London", originCountry: "United Kingdom", originCoordinates: [-0.1276, 51.5072] },
    stops: [stop("tulum", 0, "Tulum", "Mexico", [-87.4654, 20.2114])],
    legs: [{
      id: "stale-leg",
      fromStopId: "wrong-origin",
      toStopId: "tulum",
      fromEndpoint: { kind: "origin", id: "wrong-origin", name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
      toEndpoint: { kind: "stop", id: "tulum", name: "Tulum", country: "Mexico", coordinates: [-87.4654, 20.2114] },
      classification: "local",
      mode: "road",
      distanceKm: 8_200,
      durationMinutes: 150,
      headlineMinutes: 120,
      doorToDoorMinutes: 100,
      provider: null,
      routeMetadata: {},
    }],
  } as unknown as Pick<EasyTTrip, "id" | "brief" | "stops" | "legs">;
  const issues = canonicalLegIntegrityIssues(trip);
  assert.equal(issues.some((issue) => /no longer matches/.test(issue.message)), true);
  assert.equal(issues.some((issue) => /implausible average speed/.test(issue.message)), true);
  assert.equal(issues.some((issue) => /Door-to-door time/.test(issue.message)), true);
  assert.equal(issues.some((issue) => /requires arrival/.test(issue.message)), true);
});

test("Map consumes the same origin-inclusive canonical legs", () => {
  const legs = buildCanonicalTripLegs({
    tripId: "map-origin",
    origin: { name: "London", country: "United Kingdom", canonicalPlaceId: "london", coordinates: [-0.1276, 51.5072] },
    stops: acceptanceStops.slice(0, 2),
  });
  const trip = {
    id: "map-origin",
    brief: { origin: "London", originCountry: "United Kingdom", originCanonicalPlaceId: "london", originCoordinates: [-0.1276, 51.5072] },
    stops: acceptanceStops.slice(0, 2),
    legs,
  } as Pick<EasyTTrip, "id" | "brief" | "stops" | "legs">;
  assert.deepEqual(canonicalRouteEndpoints(trip).map((endpoint) => endpoint.name), ["London", "Cancún", "Tulum"]);
  assert.deepEqual(mapRouteLegsFromTrip(trip).map((leg) => [leg.fromName, leg.toName]), [["London", "Cancún"], ["Cancún", "Tulum"]]);
});

test("different IDs for the same origin and first overnight city create no transfer", () => {
  for (const [name, country, originId, stopId, coordinates] of [
    ["Delhi", "India", "fixture:delhi", "fixture:delhi-stop", [77.1025, 28.7041]],
    ["Tokyo", "Japan", "fixture:tokyo", "fixture:tokyo-stop", [139.6917, 35.6895]],
  ] as const) {
    const first = stop(stopId, 0, name, country, [...coordinates]);
    const next = stop(`${stopId}-next`, 1, name === "Delhi" ? "Jaipur" : "Kanazawa", country, name === "Delhi" ? [75.7873, 26.9124] : [136.6562, 36.5613]);
    const legs = buildCanonicalTripLegs({
      tripId: `${name}-identity`,
      origin: { name, country, canonicalPlaceId: originId, coordinates: [...coordinates] },
      stops: [first, next],
    });
    assert.equal(legs.length, 1);
    assert.equal(legs[0]?.fromStopId, first.id);
    assert.equal(legs[0]?.toStopId, next.id);
    assert.equal(first.nights, 3);
  }
});

test("an equivalent final stop and journey return create no zero-distance departure leg", () => {
  const delhi = stop("fixture:delhi-stop", 0, "Delhi", "India", [77.1025, 28.7041]);
  const jaipur = stop("jaipur", 1, "Jaipur", "India", [75.7873, 26.9124]);
  const legs = buildCanonicalTripLegs({
    tripId: "same-return",
    origin: { name: "Delhi", country: "India", canonicalPlaceId: "fixture:delhi", coordinates: [77.1025, 28.7041] },
    journeyEnd: { mode: "explicit", place: { name: "Jaipur", country: "India", canonicalPlaceId: "provider:jaipur-return", coordinates: [75.7873, 26.9124] } },
    stops: [delhi, jaipur],
  });
  assert.equal(legs.length, 1);
  assert.equal(legs[0]?.fromStopId, delhi.id);
  assert.equal(legs[0]?.toStopId, jaipur.id);
  assert.equal(jaipur.nights, 3);
});
