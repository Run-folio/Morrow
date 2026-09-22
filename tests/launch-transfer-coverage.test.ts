import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import { resolveCanonicalTransferJourneys, resolveCanonicalTransferJourney } from "../lib/easyt/multimodal-transfer-resolution.ts";
import { omioBookingActionForLeg } from "../lib/easyt/booking-readiness.ts";
import type { EasyTTrip, TripStop } from "../lib/easyt/trip.ts";

function stop(name: string, country: string, longitude: number, latitude: number, order: number): TripStop {
  // Provider identities must still match reviewed evidence by name and country.
  return { id: `occurrence-${order}`, canonicalPlaceId: `provider:${name}`, name, country, longitude, latitude,
    order, nights: 3, arrivalDate: null, departureDate: null };
}

const centralAsia = () => buildCanonicalTripLegs({
  tripId: "launch-central-asia",
  origin: { name: "Madrid", country: "Spain", canonicalPlaceId: "madrid", coordinates: [-3.7038, 40.4168] },
  journeyEnd: { mode: "same_as_start" },
  stops: [stop("Almaty", "Kazakhstan", 76.886, 43.2389, 0), stop("Tashkent", "Uzbekistan", 69.2401, 41.2995, 1),
    stop("Samarkand", "Uzbekistan", 66.9597, 39.6542, 2), stop("Dushanbe", "Tajikistan", 68.787, 38.56, 3)],
});

test("provider city labels retain reviewed transport evidence after JSON handoff", async () => {
  const legs = centralAsia();
  for (const leg of legs) {
    for (const endpoint of [leg.fromEndpoint, leg.toEndpoint]) {
      if (endpoint?.name === "Samarkand") {
        endpoint.name = "Samarkand City";
        endpoint.canonicalPlaceId = "open-world:nominatim:relation:15589846";
        endpoint.coordinates = [66.9756954, 39.6550017];
      }
    }
  }
  const resolved = await resolveCanonicalTransferJourneys(JSON.parse(JSON.stringify(legs)));
  assert.deepEqual(resolved.map((leg) => leg.mode), ["flight", "flight", "train", "unknown", "flight"]);
  assert.equal(resolved[2].provenance, "planning_estimate");
  assert.match(JSON.stringify(resolved[2].routeMetadata.multimodalResolution), /adb\.org/);
  assert.equal(resolved[2].toEndpoint?.name, "Samarkand City", "knowledge lookup must not rewrite the traveller's endpoint");
});

test("Central Asia coverage includes arrival and same-as-start return without inventing the cross-border gap", async () => {
  const legs = await resolveCanonicalTransferJourneys(centralAsia());
  assert.deepEqual(legs.map((leg) => [leg.fromEndpoint?.name, leg.toEndpoint?.name, leg.mode]), [
    ["Madrid", "Almaty", "flight"], ["Almaty", "Tashkent", "flight"], ["Tashkent", "Samarkand", "train"],
    ["Samarkand", "Dushanbe", "unknown"], ["Dushanbe", "Madrid", "flight"],
  ]);
  for (const leg of legs.filter((leg) => leg.mode !== "unknown")) {
    assert.ok(leg.durationMinutes! > 0);
    assert.equal(leg.provenance, "planning_estimate");
    assert.equal(leg.scheduleNeedsChecking, true);
  }
  assert.equal(legs[3].durationMinutes, null);
  assert.equal(legs[3].confidence, "unknown");
  assert.match(legs[3].provider!, /no direct-service or complete multimodal evidence/);
  // The same canonical model survives serialization; no parallel recovery path.
  const reopened = await resolveCanonicalTransferJourneys(JSON.parse(JSON.stringify(legs)));
  assert.deepEqual(reopened.map((leg) => leg.mode), legs.map((leg) => leg.mode));
});

test("reviewed endpoint air access does not assert a nonstop flight or live availability", async () => {
  const { leg, diagnostic } = await resolveCanonicalTransferJourney(centralAsia()[1]);
  assert.equal(leg.mode, "flight");
  assert.match(leg.provider!, /connection may be required/);
  assert.match(JSON.stringify(diagnostic), /airastana\.com/);
});

test("new evidence can resolve a previously saved unknown without retaining unknown provenance", async () => {
  const previous = centralAsia()[1];
  const { leg } = await resolveCanonicalTransferJourney({ ...previous, mode: "unknown", durationMinutes: null,
    headlineMinutes: null, doorToDoorMinutes: null, provenance: "unknown", confidence: "unknown", segments: undefined,
    routeMetadata: { ...previous.routeMetadata, source: "multimodal-resolver" } });
  assert.equal(leg.mode, "flight");
  assert.equal(leg.provenance, "planning_estimate");
  assert.equal(leg.segments?.[0].provenance, "planning_estimate");
});

test("reviewed Uzbekistan rail wins over a coordinate-only road estimate", async () => {
  const { leg, diagnostic } = await resolveCanonicalTransferJourney(centralAsia()[2]);
  assert.equal(leg.mode, "train");
  assert.ok(leg.durationMinutes! >= 180 && leg.durationMinutes! <= 270);
  assert.equal(leg.confidence, "medium");
  assert.match(leg.provider!, /planning estimate.*verify the live timetable/);
  assert.match(JSON.stringify(diagnostic), /adb\.org/);
});

test("the unresolved cross-border leg retains the existing cautious transport search action", async () => {
  const legs = await resolveCanonicalTransferJourneys(centralAsia());
  const trip: EasyTTrip = {
    schemaVersion: 1, id: "launch-central-asia", ownerId: null, title: "Central Asia", status: "draft",
    startDate: "2027-04-01", endDate: "2027-04-13", travellers: 2, currency: "GBP",
    brief: { origin: "Madrid", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops: [stop("Almaty", "Kazakhstan", 76.886, 43.2389, 0), stop("Tashkent", "Uzbekistan", 69.2401, 41.2995, 1),
      stop("Samarkand", "Uzbekistan", 66.9597, 39.6542, 2), stop("Dushanbe", "Tajikistan", 68.787, 38.56, 3)],
    legs, planItems: [], recommendations: [], createdAt: "2026-09-22", updatedAt: "2026-09-22",
  };
  const action = omioBookingActionForLeg(trip, legs[3], new Date("2026-09-22T12:00:00Z"));
  assert.ok(action?.href);
  assert.match(action.cta, /Check transport options/);
  assert.match(action.detail, /coverage and schedules vary/);
  assert.equal(action.livePrice, false);
});

for (const [name, stops, modes] of [
  ["Japan", [stop("Hiroshima", "Japan", 132.4553, 34.3853, 0), stop("Kyoto", "Japan", 135.7681, 35.0116, 1), stop("Tokyo", "Japan", 139.6917, 35.6895, 2)], ["train", "train"]],
  ["Peru", [stop("Lima", "Peru", -77.0428, -12.0464, 0), stop("Paracas", "Peru", -76.247, -13.835, 1), stop("Huacachina", "Peru", -75.763, -14.087, 2)], ["road", "road"]],
] as const) {
  test(`${name} multi-stop sanity retains supported connections`, async () => {
    const first = stops[0];
    const legs = await resolveCanonicalTransferJourneys(buildCanonicalTripLegs({ tripId: name,
      origin: { name: first.name, country: first.country, canonicalPlaceId: first.canonicalPlaceId,
        coordinates: [first.longitude!, first.latitude!] }, stops: [...stops] }));
    assert.deepEqual(legs.map((leg) => leg.mode), modes);
  });
}
