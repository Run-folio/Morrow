import assert from "node:assert/strict";
import test from "node:test";
import { tripFromBuilder, type BuilderTripInput } from "../lib/easyt/trip.ts";
import { renameTripIdentity, tripCustomTitle, tripDisplayTitle } from "../lib/easyt/trip-display.ts";
import { preserveBuilderCanonicalState } from "../lib/easyt/trip-builder-preservation.ts";
import { duplicateTripDocument, tripStopReferenceInvariantIssues } from "../lib/easyt/trip-promotion.ts";

const names = ["Hong Kong", "Coron", "Honolulu", "Mexico City", "Oaxaca", "San Juan"];
function input(destinations = names): BuilderTripInput {
  return {
    id: "destination-title", origin: "London Heathrow Airport", originProviderId: "airport-lhr",
    originCoordinates: [-0.4543, 51.47], journeyEnd: { mode: "same_as_start" },
    stops: destinations.map((name, index) => ({ id: `destination-${index}`, name, country: "", coordinates: [index, index] })),
    startDate: "2027-02-01", endDate: "2027-02-13", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid", draft: [],
    nightAllocations: Object.fromEntries(destinations.map((_, index) => [`destination-${index}`, 2])),
  };
}

test("fresh six-stop round trip displays the first three destinations and retains every stop and airport endpoint", () => {
  const trip = tripFromBuilder(input());
  assert.equal(trip.title, "Hong Kong & Coron & Honolulu");
  assert.equal(tripDisplayTitle(trip), "Hong Kong & Coron & Honolulu");
  assert.equal(tripCustomTitle(trip), null);
  assert.deepEqual(trip.stops.map(stop => stop.name), names);
  assert.equal(trip.legs.length, 7);
  assert.equal(trip.brief.origin, "London Heathrow Airport");
  assert.equal(trip.brief.originProviderId, "airport-lhr");
  assert.equal(trip.brief.intent?.route?.origin?.name, "London Heathrow Airport");
  assert.equal(trip.legs[0]?.fromEndpoint?.name, "London Heathrow Airport");
  assert.equal(trip.legs.at(-1)?.toEndpoint?.name, "London Heathrow Airport");
});

test("generated title retains a genuine origin-city destination, intentional repeats and airport-like destination text", () => {
  const trip = tripFromBuilder(input(["London", "Coron", "London", "Honolulu"]));
  assert.equal(trip.title, "London & Coron & London");
  assert.equal(tripFromBuilder(input(["Airport Mesa", "東京"])).title, "Airport Mesa & 東京");
});

test("explicitly clearing a custom name regenerates a destination-only title without changing the route", () => {
  const source = renameTripIdentity(tripFromBuilder(input()), "London Heathrow Airport to adventure");
  assert.equal(tripDisplayTitle(source), "London Heathrow Airport to adventure");
  const cleared = renameTripIdentity(source, " ");
  assert.equal(cleared.title, "Hong Kong & Coron & Honolulu");
  assert.equal(tripCustomTitle(cleared), null);
  assert.equal(tripDisplayTitle(cleared), "Hong Kong & Coron & Honolulu");
  assert.deepEqual(cleared.stops, source.stops);
  assert.deepEqual(cleared.legs, source.legs);
});

test("builder regeneration preserves explicit custom names and unknown saved-title provenance", () => {
  const generated = tripFromBuilder(input());
  const rebuilt = tripFromBuilder(input(["Tokyo", "Kyoto", "Osaka"]));
  const custom = renameTripIdentity(generated, "London Heathrow Airport escape");
  const result = preserveBuilderCanonicalState(custom, rebuilt);
  assert.equal(result.title, "London Heathrow Airport escape");
  assert.equal(result.brief.customTitle, "London Heathrow Airport escape");
  assert.equal(tripDisplayTitle(result), "London Heathrow Airport escape");
  const unknown = { ...generated, title: "London Heathrow Airport to my adventure", brief: { ...generated.brief } };
  delete unknown.brief.customTitle;
  const retained = preserveBuilderCanonicalState(unknown, rebuilt);
  assert.equal(retained.title, "London Heathrow Airport to my adventure");
  assert.equal(tripDisplayTitle(retained), "London Heathrow Airport to my adventure");
});

test("known generated titles regenerate from new destinations during an explicit builder rebuild", () => {
  const generated = tripFromBuilder(input());
  const rebuilt = tripFromBuilder(input(["Tokyo", "Kyoto", "Osaka"]));
  assert.equal(preserveBuilderCanonicalState(generated, rebuilt).title, "Tokyo & Kyoto & Osaka");
  const legacy = { ...generated, title: "London Heathrow Airport to Hong Kong & Coron & Honolulu & Mexico City & Oaxaca & San Juan", brief: { ...generated.brief } };
  delete legacy.brief.customTitle;
  assert.equal(preserveBuilderCanonicalState(legacy, rebuilt).title, "Tokyo & Kyoto & Osaka");
});

test("legacy generated display reads destinations without rewriting saved identity or route data", () => {
  const trip = tripFromBuilder(input());
  trip.title = "London Heathrow Airport to Hong Kong & Coron & Honolulu & Mexico City & Oaxaca & San Juan";
  delete trip.brief.customTitle;
  const before = structuredClone(trip);
  assert.equal(tripDisplayTitle(trip), "Hong Kong & Coron & Honolulu");
  assert.deepEqual(trip, before);
});

test("automatic display follows accepted stop order and handles an empty route", () => {
  const trip = tripFromBuilder(input(["東京", "Coron", "Honolulu", "London"]));
  trip.stops = [trip.stops[3]!, trip.stops[1]!, trip.stops[0]!, trip.stops[2]!];
  assert.equal(tripDisplayTitle(trip), "東京 & Coron & Honolulu");
  assert.equal(tripDisplayTitle({ ...trip, stops: [] }), "Untitled trip");
});

for (const fixture of [
  { customTitle: null, title: undefined, expected: "Hong Kong & Coron & Honolulu copy" },
  { customTitle: "Airport adventures", title: undefined, expected: "Airport adventures copy" },
  { customTitle: "Airport adventures", title: "Summer route alternative", expected: "Summer route alternative" },
]) {
  test(`duplicate displays its explicit title: ${fixture.expected}`, () => {
    const generated = tripFromBuilder(input());
    const source = { ...(fixture.customTitle ? renameTripIdentity(generated, fixture.customTitle) : generated), ownerId: "source-owner" };
    const before = structuredClone(source);
    let nextId = 0;
    const copied = duplicateTripDocument(source, {
      id: "copied-destination-title", now: "2026-10-21T12:00:00.000Z", nextId: () => String(++nextId), title: fixture.title,
    });
    assert.equal(copied.title, fixture.expected);
    assert.equal(tripDisplayTitle(copied), fixture.expected);
    assert.equal(copied.brief.customTitle, fixture.expected);
    assert.deepEqual(source, before);
    assert.equal(copied.ownerId, null);
    assert.equal(copied.id, "copied-destination-title");
    assert.equal(copied.status, "draft");
    assert.deepEqual(copied.stops.map(stop => stop.name), names);
    assert.equal(copied.legs.length, 7);
    assert.ok(copied.stops.every(stop => !source.stops.some(original => original.id === stop.id)));
    assert.ok(copied.legs.every(leg => !source.legs.some(original => original.id === leg.id)));
    assert.deepEqual(tripStopReferenceInvariantIssues(copied), []);
  });
}
