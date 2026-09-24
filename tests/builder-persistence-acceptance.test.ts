import assert from "node:assert/strict";
import test from "node:test";

import { defaultTripIntent, isEasyTTrip, tripFromBuilder } from "../lib/easyt/trip.ts";
import { canonicalTripForOwner, tripBuildDocumentsCanonicalEquivalent } from "../lib/easyt/trip-promotion.ts";
import { normalizedLegEndpoints } from "../lib/easyt/trip-persistence.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { createDiscoveryDraft, readDiscoveryDraft, reduceDiscoveryDraft } from "../lib/easyt/discovery-draft.ts";
import { loadTripRecoveryFromStorage, saveTripRecoveryToStorage, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";

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
    journeyEnd: { mode: "same_as_start" },
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
  assert.equal(parsed.legs.length, 7);
  assert.equal(parsed.legs[0]?.fromEndpoint?.kind, "origin");
  assert.equal(parsed.legs[0]?.fromEndpoint?.name, "London");
  assert.equal(parsed.brief.journeyEnd?.mode, "same_as_start");
  assert.equal(parsed.legs.at(-1)?.toEndpoint?.kind, "end");
  assert.equal(parsed.legs.at(-1)?.toEndpoint?.name, "London");
  assert.deepEqual(normalizedLegEndpoints(parsed.id, parsed.legs.at(-1)!), {
    fromEndpointId: parsed.stops.at(-1)!.id,
    toEndpointId: `${parsed.id}-end`,
    fromEndpointKind: "stop",
    toEndpointKind: "end",
    fromStopId: parsed.stops.at(-1)!.id,
    toStopId: null,
  });
});

test("Builder trip persistence retains an explicit empty Discovery draft through owner canonicalization", () => {
  const source = extractStructuredTripBrief("Australia");
  const mentionId = source.placeMentions?.[0]?.mentionId ?? "mention-australia";
  const draft = reduceDiscoveryDraft(
    reduceDiscoveryDraft(createDiscoveryDraft(), { type: "add-shortlist", placeId: "sydney" }),
    { type: "remove-shortlist", placeId: "sydney" },
  );
  const structuredBrief = { ...source, countryDiscoveryChoices: { [mentionId]: ["sydney"] }, discoveryDraftByMentionId: { [mentionId]: draft } };
  const trip = tripFromBuilder({
    id: "trip-discovery-draft-persistence",
    origin: "London",
    stops: [],
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    picks: {},
    mustDo: "Australia",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    draft: [],
    status: "planned",
    structuredBrief,
  });
  const parsed: unknown = JSON.parse(JSON.stringify(canonicalTripForOwner("owner-discovery", trip, "2026-09-24T00:00:00.000Z")));
  assert.ok(isEasyTTrip(parsed));
  assert.equal(tripBuildDocumentsCanonicalEquivalent(trip, parsed, "owner-discovery"), true);
  const read = readDiscoveryDraft(parsed.brief.structuredBrief!, mentionId);
  assert.equal(read.status, "current");
  assert.deepEqual(read.draft.shortlistIds, []);
  assert.deepEqual(read.draft.removedIds, ["sydney"]);

  const values = new Map<string, string>();
  const storage: EasyTBrowserStorage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, parsed, { writeId: "discovery-draft-recovery" }).stored, true);
  const recovered = loadTripRecoveryFromStorage(storage, parsed.id, "owner-discovery")?.trip;
  assert.ok(recovered?.brief.structuredBrief);
  const resumed = readDiscoveryDraft(recovered.brief.structuredBrief, mentionId);
  assert.equal(resumed.status, "current");
  assert.deepEqual(resumed.draft.shortlistIds, []);
  assert.deepEqual(resumed.draft.removedIds, ["sydney"]);
});

test("Discovery direction, step, base and visit choices resume under the same owner without replacement", () => {
  const source = extractStructuredTripBrief("Australia and Petra");
  const firstId = source.placeMentions![0]!.mentionId;
  const secondId = source.placeMentions![1]!.mentionId;
  let first = createDiscoveryDraft();
  first = reduceDiscoveryDraft(first, { type: "change-direction", directionId: "australia-south" });
  first = reduceDiscoveryDraft(first, { type: "add-shortlist", placeId: "melbourne" });
  first = reduceDiscoveryDraft(first, { type: "choose-base", intentId: firstId, baseId: "melbourne" });
  first = reduceDiscoveryDraft(first, { type: "set-step", step: "review" });
  const second = reduceDiscoveryDraft(createDiscoveryDraft(), { type: "choose-visit-base", intentId: secondId, baseId: "wadi-musa" });
  const trip = tripFromBuilder({ id: "trip-discovery-resume", origin: "London", stops: [], startDate: "2026-09-01", endDate: "2026-09-14",
    picks: {}, mustDo: "Australia and Petra", pace: "slow", hotels: "few", budget: "mid", draft: [], status: "planned",
    structuredBrief: { ...source, discoveryDraftByMentionId: { [firstId]: first, [secondId]: second } } });
  const parsed: unknown = JSON.parse(JSON.stringify(canonicalTripForOwner("owner-resume", trip, "2026-09-24T00:00:00.000Z")));
  assert.ok(isEasyTTrip(parsed));
  const values = new Map<string, string>();
  const storage: EasyTBrowserStorage = {
    get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, parsed, { writeId: "resume-1" }).stored, true);
  const recovered = loadTripRecoveryFromStorage(storage, parsed.id, "owner-resume")!.trip;
  assert.deepEqual(readDiscoveryDraft(recovered.brief.structuredBrief!, firstId).draft, first);
  assert.deepEqual(readDiscoveryDraft(recovered.brief.structuredBrief!, secondId).draft, second);
  assert.equal(loadTripRecoveryFromStorage(storage, parsed.id, "another-owner"), null);
  const blocked = saveTripRecoveryToStorage(storage, { ...parsed, brief: { ...parsed.brief, mustDo: "changed" } }, { writeId: "resume-2" });
  assert.equal(blocked.stored, false);
  assert.equal(blocked.blockedByExistingRecovery, true);
});
