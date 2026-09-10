import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { omioBookingActionForLeg } from "../lib/easyt/booking-readiness.ts";
import { itineraryTransportAgenda } from "../lib/easyt/itinerary-transport-agenda.ts";
import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import { resolveCanonicalTransferJourney } from "../lib/easyt/multimodal-transfer-resolution.ts";
import { reconcileLegacyTransportLeg, reconcileLegacyTransportTrip } from "../lib/easyt/transport-leg-compatibility.ts";
import type { CanonicalRouteEndpoint, EasyTTrip, TripLeg } from "../lib/easyt/trip.ts";

const endpoint = (id: string, name: string, country: string, coordinates: [number, number], kind: CanonicalRouteEndpoint["kind"] = "stop"): CanonicalRouteEndpoint => ({
  kind, id, name, country, canonicalPlaceId: id, coordinates,
});

const athens = endpoint("athens", "Athens", "Greece", [23.7275, 37.9838]);
const naxos = endpoint("naxos", "Naxos", "Greece", [25.3777, 37.1036]);

function leg(from: CanonicalRouteEndpoint, to: CanonicalRouteEndpoint, values: Partial<TripLeg> = {}): TripLeg {
  return {
    id: `${from.id}-${to.id}`,
    fromStopId: from.id,
    toStopId: to.id,
    classification: "intercity",
    mode: "road",
    distanceKm: 175,
    durationMinutes: 217,
    headlineMinutes: 217,
    doorToDoorMinutes: 217,
    provider: "Legacy planning estimate",
    routeMetadata: {},
    fromEndpoint: from,
    toEndpoint: to,
    ...values,
  };
}

function tripWith(legs: TripLeg[]): EasyTTrip {
  const stops = [athens, naxos].map((place, order) => ({
    id: place.id,
    order,
    name: place.name,
    country: place.country ?? "",
    canonicalPlaceId: place.canonicalPlaceId,
    latitude: place.coordinates?.[1] ?? null,
    longitude: place.coordinates?.[0] ?? null,
    arrivalDate: order === 0 ? "2026-10-01" : "2026-10-04",
    departureDate: order === 0 ? "2026-10-04" : "2026-10-07",
    nights: 3,
  }));
  return {
    schemaVersion: 1,
    id: "legacy-trip",
    ownerId: "owner",
    title: "Athens and Naxos",
    status: "draft",
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "Athens", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, journeyEnd: { mode: "unknown" } },
    stops,
    legs,
    planItems: [{ id: "naxos-arrival", stopId: "naxos", dayNumber: 4, date: "2026-10-04", type: "transport", title: "Travel to Naxos", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    recommendations: [],
    createdAt: "2026-08-27T12:00:00.000Z",
    updatedAt: "2026-08-27T12:00:00.000Z",
  };
}

test("legacy Athens to Naxos road certainty is downgraded once for every projection", async () => {
  const stored = tripWith([leg(athens, naxos)]);
  const before = JSON.stringify(stored);
  const current = reconcileLegacyTransportTrip(stored);
  const normalized = current.legs[0]!;

  assert.equal(JSON.stringify(stored), before, "read reconciliation must not mutate stored input");
  assert.notEqual(current, stored);
  assert.equal(normalized.mode, "unknown");
  assert.equal(normalized.durationMinutes, null);
  assert.equal(normalized.headlineMinutes, null);
  assert.equal(normalized.doorToDoorMinutes, null);
  assert.equal(normalized.routeMetadata.source, "legacy-road-compatibility");
  assert.equal((normalized.routeMetadata.legacyTransportCompatibility as { conflict?: string }).conflict, "land_separation");
  assert.equal(reconcileLegacyTransportTrip(current), current, "compatibility projection must be idempotent");

  assert.equal(mapRouteLegsFromTrip(current)[0]?.mode, "unknown");
  assert.equal(mapRouteLegsFromTrip(current)[0]?.doorToDoorMinutes, null);
  assert.equal(itineraryTransportAgenda(current)[0]?.status, "confirm");
  assert.equal(omioBookingActionForLeg(current, normalized, new Date("2026-09-10T12:00:00Z")), null);

  const resolved = await resolveCanonicalTransferJourney(stored.legs[0]!);
  assert.equal(resolved.leg.mode, "unknown", "canonical resolution must begin at the same compatibility boundary");
  assert.equal(resolved.leg.durationMinutes, null);
});

test("current rail, valid mainland road, local road and current unresolved legs are unchanged", () => {
  const paris = endpoint("paris", "Paris", "France", [2.3522, 48.8566]);
  const brussels = endpoint("brussels", "Brussels", "Belgium", [4.3517, 50.8503]);
  const amsterdam = endpoint("amsterdam", "Amsterdam", "Netherlands", [4.9041, 52.3676]);
  const lyon = endpoint("lyon", "Lyon", "France", [4.8357, 45.764]);
  const grenoble = endpoint("grenoble", "Grenoble", "France", [5.7245, 45.1885]);
  const currentRail = leg(paris, brussels, { mode: "train", distanceKm: 320, durationMinutes: 135, routeMetadata: { source: "multimodal-resolver" } });
  const secondRail = leg(brussels, amsterdam, { mode: "train", distanceKm: 210, durationMinutes: 120, routeMetadata: { source: "multimodal-resolver" } });
  const validRoad = leg(lyon, grenoble, { distanceKm: 113, durationMinutes: 90 });
  const localRoad = leg(lyon, endpoint("lyon-airport", "Lyon Airport", "France", [5.0811, 45.7256], "gateway"), { classification: "local", distanceKm: 29, durationMinutes: 35 });
  const unresolved = leg(endpoint("uyuni", "Uyuni", "Bolivia", [-66.825, -20.46]), endpoint("cusco", "Cusco", "Peru", [-71.9675, -13.5319]), { mode: "unknown", durationMinutes: null, distanceKm: 655, routeMetadata: { source: "multimodal-resolver" } });

  for (const value of [currentRail, secondRail, validRoad, localRoad, unresolved]) {
    assert.equal(reconcileLegacyTransportLeg(value), value);
  }

  const railTrip = tripWith([currentRail]);
  railTrip.stops = [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
    { id: "brussels", order: 1, name: "Brussels", country: "Belgium", latitude: 50.8503, longitude: 4.3517, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 3 },
  ];
  assert.equal(omioBookingActionForLeg(railTrip, currentRail, new Date("2026-09-10T12:00:00Z"))?.provider, "omio");
  railTrip.legs = [secondRail];
  railTrip.stops = [
    { id: "brussels", order: 0, name: "Brussels", country: "Belgium", latitude: 50.8503, longitude: 4.3517, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
    { id: "amsterdam", order: 1, name: "Amsterdam", country: "Netherlands", latitude: 52.3676, longitude: 4.9041, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 3 },
  ];
  assert.equal(omioBookingActionForLeg(railTrip, secondRail, new Date("2026-09-10T12:00:00Z"))?.provider, "omio");
});

test("explicit end identity and confirmed legacy transport survive compatibility reconciliation", () => {
  const rome = endpoint("rome", "Rome", "Italy", [12.4964, 41.9028]);
  const explicitEnd = { ...endpoint("legacy-trip-end", "Rome", "Italy", [12.4964, 41.9028], "end"), canonicalPlaceId: "rome" };
  const confirmed = leg(athens, naxos, { routeMetadata: { userConfirmed: true }, provider: "Traveller confirmed transfer" });
  const departure = leg(naxos, explicitEnd, { mode: "flight", distanceKm: 1500, durationMinutes: 300, classification: "departure", routeMetadata: { source: "morrovia-planner" } });
  const source = tripWith([confirmed, departure]);
  source.brief.journeyEnd = { mode: "explicit", place: { name: rome.name, country: rome.country, canonicalPlaceId: rome.canonicalPlaceId, coordinates: rome.coordinates ?? undefined } };

  assert.equal(reconcileLegacyTransportTrip(source), source);
  assert.equal(source.legs[1]?.toEndpoint?.kind, "end");
  assert.equal(source.legs[1]?.toEndpoint?.canonicalPlaceId, "rome");
});

test("repository hydration uses the pure compatibility boundary without a read-time write", () => {
  const repository = readFileSync(new URL("../lib/easyt/repository.ts", import.meta.url), "utf8");
  const compatibility = readFileSync(new URL("../lib/easyt/transport-leg-compatibility.ts", import.meta.url), "utf8");
  assert.match(repository, /filter\(isEasyTTrip\)\.map\(reconcileLegacyTransportTrip\)/);
  assert.match(repository, /resolveTripTransferJourneys\(rows\[0\]\.document\)/);
  assert.doesNotMatch(compatibility, /getEasyTDatabase|insert\s+into|update\s+easyt_trips|fetch\(/i);
});
