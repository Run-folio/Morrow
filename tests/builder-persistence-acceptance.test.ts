import assert from "node:assert/strict";
import test from "node:test";

import { defaultTripIntent, isEasyTTrip, tripFromBuilder } from "../lib/easyt/trip.ts";
import { canonicalTripForOwner, tripBuildDocumentsCanonicalEquivalent } from "../lib/easyt/trip-promotion.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

test("the open-world Builder acceptance trip round-trips every reviewed decision", () => {
  const prompt = "cancun, tulum, belize, tikal, antigua, lake atitlan, starting from London. Prefer nature.";
  const source = extractStructuredTripBrief(prompt);
  const chooseBase = (sourceText: string, selectedName: string, selectedCanonicalPlaceId: string, routeStopId: string) => {
    const place = source.placeMentions?.find((mention) => mention.sourceText.toLocaleLowerCase() === sourceText);
    assert.ok(place);
    return {
      mentionId: place.mentionId,
      kind: "base" as const,
      selectedCanonicalPlaceId,
      selectedName,
      routeStopId,
      provenance: { id: `acceptance:${routeStopId}`, label: "Acceptance selection", kind: "builder" as const, supports: "Traveller explicitly selected this base." },
    };
  };
  const intent = defaultTripIntent({
    travellers: 2,
    durationDays: 22,
    stopIds: ["cancun", "tulum", "caye-caulker", "flores", "san-pedro-la-laguna", "antigua"],
  });
  const reviewed = tripFromBuilder({
    id: "trip-open-world-persistence",
    origin: "London",
    originCountry: "United Kingdom",
    originCanonicalPlaceId: "london",
    originCoordinates: [-0.1276, 51.5072],
    stops: [
      { id: "cancun", name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619] },
      { id: "tulum", name: "Tulum", country: "Mexico", canonicalPlaceId: "tulum", coordinates: [-87.4654, 20.2114] },
      { id: "caye-caulker", name: "Caye Caulker", country: "Belize", canonicalPlaceId: "caye-caulker", coordinates: [-88.0246, 17.7425] },
      { id: "flores", name: "Flores", country: "Guatemala", canonicalPlaceId: "flores-guatemala", coordinates: [-89.897, 16.9294] },
      { id: "san-pedro-la-laguna", name: "San Pedro La Laguna", country: "Guatemala", canonicalPlaceId: "san-pedro-la-laguna", coordinates: [-91.272, 14.6928] },
      { id: "antigua", name: "Antigua Guatemala", country: "Guatemala", canonicalPlaceId: "antigua-guatemala", coordinates: [-90.734, 14.5586] },
    ],
    startDate: "2026-09-03",
    endDate: "2026-09-24",
    picks: {},
    mustDo: prompt,
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: { cancun: 3, tulum: 3, "caye-caulker": 4, flores: 4, "san-pedro-la-laguna": 3, antigua: 4 },
    draft: [],
    status: "planned",
    intent: { ...intent, preferences: { ...intent.preferences, interests: ["nature"] } },
    structuredBrief: mergeStructuredTripBrief(source, { placeSelections: [
      chooseBase("belize", "Caye Caulker", "caye-caulker", "caye-caulker"),
      chooseBase("tikal", "Flores", "flores-guatemala", "flores"),
      chooseBase("lake atitlan", "San Pedro La Laguna", "san-pedro-la-laguna", "san-pedro-la-laguna"),
    ] }),
    decisionSelections: { routeOrder: "recommended", transportByLeg: {} },
  });
  const parsed: unknown = JSON.parse(JSON.stringify(canonicalTripForOwner("owner-acceptance", reviewed, "2026-08-27T20:00:00.000Z")));
  assert.ok(isEasyTTrip(parsed));
  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, parsed, "owner-acceptance"), true);
  assert.equal(parsed.brief.origin, "London");
  assert.deepEqual(parsed.stops.map((stop) => stop.name), ["Cancún", "Tulum", "Caye Caulker", "Flores", "San Pedro La Laguna", "Antigua Guatemala"]);
  assert.deepEqual(parsed.stops.map((stop) => stop.nights), [3, 3, 4, 4, 3, 4]);
  assert.equal(parsed.travellers, 2);
  assert.deepEqual(parsed.brief.intent?.preferences.interests, ["nature"]);
  assert.deepEqual(parsed.brief.structuredBrief?.placeSelections?.map((selection) => selection.selectedName), ["Caye Caulker", "Flores", "San Pedro La Laguna"]);
  assert.equal(parsed.brief.decisionSelections?.routeOrder, "recommended");
  assert.equal(parsed.legs.length, 6);
  assert.equal(parsed.legs[0]?.fromEndpoint?.kind, "origin");
  assert.equal(parsed.legs[0]?.fromEndpoint?.name, "London");
});

