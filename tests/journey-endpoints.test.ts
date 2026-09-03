import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canBuildTrip, type CanBuildTripInput } from "../lib/easyt/can-build-trip.ts";
import { createHomeTripDraft, homeTripDraftIsDurable, routableHandoffMentions } from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief, captureJourneyBriefWithProvider } from "../lib/easyt/journey-capture.ts";
import {
  isSameCanonicalPlace,
  normalizeJourneyEnd,
  originPlaceFromBrief,
  resolvedJourneyEndPlace,
} from "../lib/easyt/journey-endpoints.ts";
import type { NightAllocationResult } from "../lib/easyt/night-allocation.ts";
import { placeAutocompleteKeyAction } from "../lib/easyt/place-autocomplete.ts";
import type { PlaceIntelligenceProvider } from "../lib/easyt/place-intelligence.ts";
import { assessRouteOrder, type EstimatedLeg, type PlannerStop } from "../lib/easyt/planner.ts";
import { generateRouteCandidates } from "../lib/easyt/route-candidates.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { preserveBuilderCanonicalState } from "../lib/easyt/trip-builder-preservation.ts";
import { buildCanonicalTripLegs, canonicalRouteEndpoints, endEndpointForTrip } from "../lib/easyt/trip-legs.ts";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import {
  loadLocalTripFromStorage,
  saveTripRecoveryToStorage,
  type EasyTBrowserStorage,
} from "../lib/easyt/storage.ts";
import { extractStructuredTripBrief, routeConstraintsFromStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import {
  isEasyTTrip,
  tripFromBuilder,
  tripIntentForTrip,
  type BuilderTripInput,
  type EasyTTrip,
  type JourneyEndSelection,
} from "../lib/easyt/trip.ts";

const london = { name: "London", country: "United Kingdom", canonicalPlaceId: "london", coordinates: [-0.1276, 51.5072] as [number, number] };
const seoul = { name: "Seoul", country: "South Korea", canonicalPlaceId: "seoul", coordinates: [126.978, 37.5665] as [number, number] };
const singapore = { name: "Singapore", country: "Singapore", canonicalPlaceId: "singapore", coordinates: [103.8198, 1.3521] as [number, number] };
const japanStops: BuilderTripInput["stops"] = [
  { id: "tokyo", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] },
  { id: "kyoto", name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto", coordinates: [135.7681, 35.0116] },
  { id: "osaka", name: "Osaka", country: "Japan", canonicalPlaceId: "osaka", coordinates: [135.5023, 34.6937] },
];

test("canonical place equivalence uses strong identity evidence and stays symmetric", () => {
  const delhiOrigin = { name: "Delhi", country: "India", canonicalPlaceId: "fixture:delhi", coordinates: [77.1025, 28.7041] as [number, number] };
  const delhiStop = { ...delhiOrigin, canonicalPlaceId: "fixture:delhi-stop" };
  const tokyoOrigin = { name: "Tokyo", country: "Japan", canonicalPlaceId: "fixture:tokyo", coordinates: [139.6917, 35.6895] as [number, number] };
  const tokyoStop = { ...tokyoOrigin, canonicalPlaceId: "fixture:tokyo-stop" };

  assert.equal(isSameCanonicalPlace({ ...delhiOrigin, canonicalPlaceId: "delhi" }, { ...delhiStop, canonicalPlaceId: "delhi" }), true);
  assert.equal(isSameCanonicalPlace(delhiOrigin, delhiStop), true);
  assert.equal(isSameCanonicalPlace(delhiStop, delhiOrigin), true);
  assert.equal(isSameCanonicalPlace(tokyoOrigin, tokyoStop), true);
  assert.equal(isSameCanonicalPlace(
    { ...tokyoOrigin, providerId: "nominatim:relation:175805" },
    { ...tokyoStop, providerId: "photon:R:175805" },
  ), true);
  assert.equal(isSameCanonicalPlace(
    { ...tokyoOrigin, providerId: "trusted:tokyo" },
    { ...tokyoStop, providerId: "trusted:tokyo" },
  ), true);
});

test("canonical place equivalence rejects weak name or proximity coincidences", () => {
  assert.equal(isSameCanonicalPlace(
    { name: "San José", country: "Costa Rica", coordinates: [-84.0907, 9.9281] },
    { name: "San José", country: "United States", coordinates: [-121.8863, 37.3382] },
  ), false);
  assert.equal(isSameCanonicalPlace(
    { name: "San Pedro", country: "Guatemala", coordinates: [-91.272, 14.691] },
    { name: "San Juan", country: "Guatemala", coordinates: [-91.286, 14.695] },
  ), false);
  assert.equal(isSameCanonicalPlace(
    { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] },
    { name: "Tokyo Marathon", country: "Japan", canonicalPlaceId: "tokyo-marathon", coordinates: [139.6918, 35.6896] },
  ), false);
  assert.equal(isSameCanonicalPlace(
    { name: "Springfield", country: "United States", canonicalPlaceId: "provider:one", coordinates: [-89.6501, 39.7817] },
    { name: "Springfield", country: "United States", canonicalPlaceId: "provider:two", coordinates: [-72.5898, 42.1015] },
  ), false);
});

function buildTrip(journeyEnd: JourneyEndSelection = { mode: "unknown" }, overrides: Partial<BuilderTripInput> = {}) {
  return tripFromBuilder({
    id: "endpoint-trip",
    origin: london.name,
    originCountry: london.country,
    originCanonicalPlaceId: london.canonicalPlaceId,
    originCoordinates: london.coordinates,
    journeyEnd,
    stops: japanStops,
    startDate: "2026-10-01",
    endDate: "2026-10-10",
    picks: {},
    mustDo: "Japan route",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: { tokyo: 3, kyoto: 3, osaka: 3 },
    draft: japanStops.map((stop, index) => ({
      number: String(index + 1),
      date: `2026-10-0${index + 1}`,
      destination: stop.name,
      title: stop.name,
      reason: "Traveller-selected stop",
      items: [],
    })),
    ...overrides,
  });
}

function allocatedNightResult(allocations: Record<string, number>): NightAllocationResult {
  const total = Object.values(allocations).reduce((sum, nights) => sum + nights, 0);
  return {
    version: 1,
    configVersion: "journey-endpoint-test",
    state: "allocated",
    totalAvailableNights: total,
    totalAllocatedNights: total,
    allocations,
    stops: [],
    conflicts: [],
    notices: [],
  };
}

function validBuildInput(journeyEnd: JourneyEndSelection = { mode: "unknown" }): CanBuildTripInput {
  const allocations = { tokyo: 1, kyoto: 1 };
  return {
    origin: london.name,
    originCoordinates: london.coordinates,
    journeyEnd,
    stops: japanStops.slice(0, 2),
    placeIssues: [],
    routeConstraintIssues: [],
    requiredStopIds: ["tokyo", "kyoto"],
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    durationDays: 3,
    expectedDurationDays: 3,
    structuredBriefIssues: [],
    nightAllocation: allocatedNightResult(allocations),
    allocations,
    document: {
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      stops: [{ id: "tokyo" }, { id: "kyoto" }],
      planItems: ["tokyo", "kyoto", "kyoto"].map((stopId, index) => ({ stopId, dayNumber: index + 1, date: `2026-10-0${index + 1}` })),
    } as CanBuildTripInput["document"],
  };
}

class MemoryStorage implements EasyTBrowserStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

test("01 Start London / End London keeps Japan as the only overnight stops", () => {
  const trip = buildTrip({ mode: "explicit", place: london });
  assert.deepEqual(trip.stops.map((stop) => stop.name), ["Tokyo", "Kyoto", "Osaka"]);
  assert.equal(trip.legs.at(-1)?.toEndpoint?.name, "London");
  assert.equal(trip.legs.at(-1)?.classification, "departure");
});

test("02 Start London / End Seoul creates terminal context without a Seoul stay", () => {
  const trip = buildTrip({ mode: "explicit", place: seoul });
  assert.equal(trip.stops.some((stop) => stop.canonicalPlaceId === "seoul"), false);
  assert.equal(endEndpointForTrip(trip)?.canonicalPlaceId, "seoul");
});

test("03 Start London / End unknown has no fabricated terminal leg", () => {
  const trip = buildTrip();
  assert.equal(trip.brief.journeyEnd?.mode, "unknown");
  assert.equal(trip.legs.length, trip.stops.length);
  assert.equal(endEndpointForTrip(trip), null);
});

test("04 Same as start remains a relationship in canonical state", () => {
  const trip = buildTrip({ mode: "same_as_start" });
  assert.deepEqual(trip.brief.journeyEnd, { mode: "same_as_start" });
  assert.equal(endEndpointForTrip(trip)?.canonicalPlaceId, "london");
});

test("05 changing Start while Same as start is active changes the resolved End", () => {
  const selection = { mode: "same_as_start" } as const;
  assert.equal(resolvedJourneyEndPlace(london, selection)?.name, "London");
  assert.equal(resolvedJourneyEndPlace({ ...london, name: "Manchester", canonicalPlaceId: "manchester" }, selection)?.name, "Manchester");
});

test("06 an explicit End remains stable when Start changes", () => {
  const selection = { mode: "explicit", place: seoul } as const;
  assert.equal(resolvedJourneyEndPlace(london, selection)?.name, "Seoul");
  assert.equal(resolvedJourneyEndPlace({ ...london, name: "Manchester", canonicalPlaceId: "manchester" }, selection)?.name, "Seoul");
});

test("07 clearing an explicit End normalizes to unknown", () => {
  assert.deepEqual(normalizeJourneyEnd({ mode: "explicit", place: { name: "   " } }), { mode: "unknown" });
});

test("08 natural language from London and back to London preserves Same as start", () => {
  assert.equal(captureJourneyBrief("Two weeks in Japan from London and back to London").journeyEnd.mode, "same_as_start");
});

test("09 natural language fly into Tokyo and out of Osaka separates the endpoint", () => {
  const capture = captureJourneyBrief("Fly into Tokyo and out of Osaka");
  assert.deepEqual(capture.journeyEnd, { mode: "explicit", place: { name: "Osaka", canonicalPlaceId: "osaka", country: "Japan", coordinates: undefined } });
  assert.equal(routableHandoffMentions(capture.mentions).some((mention) => mention.canonicalPlaceId === "osaka"), false);
});

test("10 natural language start Guatemala, finish Mexico City captures a fixed end", () => {
  const capture = captureJourneyBrief("Start in Guatemala and finish in Mexico City");
  assert.equal(capture.journeyEnd.mode, "explicit");
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "mexico-city");
});

test("11 natural language ending in Singapore does not turn Ending into geography", () => {
  const capture = captureJourneyBrief("Ending in Singapore");
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.name, "Singapore");
  assert.equal(capture.mentions.some((mention) => mention.sourceText === "Ending"), false);
});

test("12 natural language one way to Sydney captures Sydney as End only", () => {
  const capture = captureJourneyBrief("One way to Sydney");
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "sydney");
  assert.equal(routableHandoffMentions(capture.mentions).length, 0);
});

test("13 then home resolves safely when an explicit Start is known", () => {
  assert.equal(captureJourneyBrief("London to Thailand then home").journeyEnd.mode, "same_as_start");
});

test("14 home without a known Start remains unknown and creates no false place", () => {
  const capture = captureJourneyBrief("Thailand then home");
  assert.equal(capture.journeyEnd.mode, "unknown");
  assert.equal(capture.mentions.some((mention) => /home/i.test(mention.sourceText)), false);
});

test("same-place origin, opening stay and return persist while movement skips the same-place transition", () => {
  const cancun = { name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619] as [number, number] };
  const trip = tripFromBuilder({
    id: "endpoint-stay-round-trip",
    origin: cancun.name,
    originCountry: cancun.country,
    originCanonicalPlaceId: cancun.canonicalPlaceId,
    originCoordinates: cancun.coordinates,
    journeyEnd: { mode: "same_as_start" },
    stops: [
      { id: "cancun-stay", ...cancun },
      { id: "tulum", name: "Tulum", country: "Mexico", canonicalPlaceId: "tulum", coordinates: [-87.4654, 20.2114] },
      { id: "antigua", name: "Antigua Guatemala", country: "Guatemala", canonicalPlaceId: "antigua-guatemala", coordinates: [-90.734, 14.557] },
      { id: "caye-caulker", name: "Caye Caulker", country: "Belize", canonicalPlaceId: "caye-caulker", coordinates: [-88.0329, 17.7425] },
      { id: "belize-city", name: "Belize City", country: "Belize", canonicalPlaceId: "belize-city", coordinates: [-88.1962, 17.5046] },
      { id: "flores", name: "Flores", country: "Guatemala", canonicalPlaceId: "flores-guatemala", coordinates: [-89.897, 16.9294] },
    ],
    startDate: "2026-10-01", endDate: "2026-10-22", picks: {}, mustDo: "Round trip with an opening Cancún stay",
    pace: "slow", hotels: "few", budget: "mid", nightAllocations: {
      "cancun-stay": 4, tulum: 4, antigua: 4, "caye-caulker": 3, "belize-city": 3, flores: 3,
    }, draft: [],
  });
  assert.equal(trip.brief.origin, "Cancún");
  assert.deepEqual(trip.stops.map((stop) => stop.name), ["Cancún", "Tulum", "Antigua Guatemala", "Caye Caulker", "Belize City", "Flores"]);
  assert.equal(trip.stops.reduce((total, stop) => total + (stop.nights ?? 0), 0), 21);
  assert.deepEqual(trip.brief.journeyEnd, { mode: "same_as_start" });
  assert.deepEqual(trip.legs.map((leg) => [leg.fromEndpoint?.name, leg.toEndpoint?.name]), [
    ["Cancún", "Tulum"],
    ["Tulum", "Antigua Guatemala"],
    ["Antigua Guatemala", "Caye Caulker"],
    ["Caye Caulker", "Belize City"],
    ["Belize City", "Flores"],
    ["Flores", "Cancún"],
  ]);
  assert.equal(trip.legs.some((leg) => leg.fromEndpoint?.name === "Cancún" && leg.toEndpoint?.name === "Cancún"), false);

  const reloaded = JSON.parse(JSON.stringify(canonicalTripForOwner("owner-endpoint-stay", trip))) as EasyTTrip;
  assert.equal(isEasyTTrip(reloaded), true);
  assert.equal(reloaded.brief.origin, "Cancún");
  assert.deepEqual(reloaded.stops.map((stop) => stop.name), ["Cancún", "Tulum", "Antigua Guatemala", "Caye Caulker", "Belize City", "Flores"]);
  assert.equal(reloaded.stops.reduce((total, stop) => total + (stop.nights ?? 0), 0), 21);
  assert.deepEqual(reloaded.brief.journeyEnd, { mode: "same_as_start" });
  assert.deepEqual(reloaded.legs.map((leg) => [leg.fromEndpoint?.name, leg.toEndpoint?.name]), [
    ["Cancún", "Tulum"],
    ["Tulum", "Antigua Guatemala"],
    ["Antigua Guatemala", "Caye Caulker"],
    ["Caye Caulker", "Belize City"],
    ["Belize City", "Flores"],
    ["Flores", "Cancún"],
  ]);
});

test("an explicit initial London stay survives without a London-to-London leg", () => {
  const capture = captureJourneyBrief("Start in London, stay 2 nights in London, then Paris and Amsterdam");
  assert.deepEqual(capture.mentions.filter((mention) => mention.canonicalPlaceId === "london").map((mention) => mention.role), ["fixed_start", "preferred"]);
  const trip = buildTrip({ mode: "unknown" }, {
    origin: "London", originCountry: "United Kingdom", originCanonicalPlaceId: "london", originCoordinates: [-0.1276, 51.5072],
    stops: [
      { id: "london-stay", name: "London", country: "United Kingdom", canonicalPlaceId: "london", coordinates: [-0.1276, 51.5072] },
      { id: "paris", name: "Paris", country: "France", canonicalPlaceId: "paris", coordinates: [2.3522, 48.8566] },
      { id: "amsterdam", name: "Amsterdam", country: "Netherlands", canonicalPlaceId: "amsterdam", coordinates: [4.9041, 52.3676] },
    ],
    nightAllocations: { "london-stay": 2, paris: 3, amsterdam: 4 },
  });
  assert.equal(trip.stops[0]?.nights, 2);
  assert.deepEqual(trip.legs.map((leg) => [leg.fromEndpoint?.name, leg.toEndpoint?.name]), [["London", "Paris"], ["Paris", "Amsterdam"]]);
});

test("round trips without an explicit origin stay do not invent one and different ends remain distinct", async () => {
  const provider: PlaceIntelligenceProvider = {
    id: "round-trip-endpoint-fixture", label: "Round-trip endpoint fixture",
    lookup: async (phrase) => phrase.toLocaleLowerCase() === "flores" ? [{
      providerId: "flores-guatemala", canonicalName: "Flores", placeType: "city", parentCountries: ["Guatemala"],
      coordinates: [-89.897, 16.9294], routability: "direct_destination", matchQuality: "exact", rankScore: 100,
    }] : [],
  };
  const roundTrip = await captureJourneyBriefWithProvider("Start in Cancún, visit Tulum and Flores, then return to Cancún", provider);
  assert.deepEqual(routableHandoffMentions(roundTrip.mentions).filter((mention) => !["origin", "fixed_start"].includes(mention.role)).map((mention) => mention.canonicalName), ["Tulum", "Flores"]);
  assert.equal(roundTrip.mentions.filter((mention) => mention.canonicalPlaceId === "cancun" && !["origin", "fixed_start", "fixed_end"].includes(mention.role)).length, 0);
  assert.deepEqual(roundTrip.journeyEnd, { mode: "same_as_start" });

  const openJaw = captureJourneyBrief("Start in Cancún, visit Tulum, finish in Mexico City");
  assert.equal(openJaw.journeyEnd.mode === "explicit" && openJaw.journeyEnd.place.canonicalPlaceId, "mexico-city");
  assert.deepEqual(routableHandoffMentions(openJaw.mentions).filter((mention) => !["origin", "fixed_start"].includes(mention.role)).map((mention) => mention.canonicalName), ["Tulum"]);
});

test("15 an explicit Homepage control overrides prompt inference", () => {
  const capture = captureJourneyBrief("Two weeks in Japan from London and back to London");
  const draft = createHomeTripDraft({
    capture,
    handoffId: "handoff-explicit",
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: false,
    interests: [],
    journeyEnd: { mode: "explicit", place: seoul },
  });
  assert.equal(draft.journeyEnd?.mode, "explicit");
  assert.equal(draft.journeyEnd?.mode === "explicit" && draft.journeyEnd.place.canonicalPlaceId, "seoul");
});

test("16 a prompt endpoint never becomes an overnight handoff stop", () => {
  const capture = captureJourneyBrief("Start London, Tokyo, Kyoto, fly back from Osaka");
  const routeMentions = routableHandoffMentions(capture.mentions);
  assert.deepEqual(routeMentions.map((mention) => mention.canonicalPlaceId), ["london", "tokyo", "kyoto"]);
  assert.equal(routeMentions.some((mention) => mention.role === "fixed_end"), false);
});

test("17 an End equal to the final route stop is removed from the travel sequence", () => {
  const trip = buildTrip({ mode: "explicit", place: { name: "Osaka", country: "Japan", canonicalPlaceId: "osaka", coordinates: [135.5023, 34.6937] } });
  assert.equal(trip.stops.filter((stop) => stop.canonicalPlaceId === "osaka").length, 1);
  assert.notEqual(trip.legs.at(-1)?.classification, "departure");
  assert.equal(canonicalRouteEndpoints(trip).at(-1)?.kind, "stop");
});

test("18 the known End can change deterministic candidate ordering", () => {
  const stops: PlannerStop[] = [
    { id: "a", name: "A", country: "X", coordinates: [2, 0] },
    { id: "b", name: "B", country: "X", coordinates: [8, 0] },
    { id: "c", name: "C", country: "X", coordinates: [5, 4] },
  ];
  const left = assessRouteOrder({ origin: { name: "Start", coordinates: [5, -5] }, end: { id: "end-left", name: "End left", country: "X", coordinates: [0, 0] }, stops });
  const right = assessRouteOrder({ origin: { name: "Start", coordinates: [5, -5] }, end: { id: "end-right", name: "End right", country: "X", coordinates: [10, 0] }, stops });
  assert.deepEqual(left.scoring?.winner?.stopIds, ["b", "c", "a"]);
  assert.deepEqual(right.scoring?.winner?.stopIds, ["a", "c", "b"]);
});

test("19 a hard explicit End participates in every candidate without being droppable", () => {
  const terminalCalls: string[] = [];
  const end: PlannerStop = { id: "hard-end", name: "Hard end", country: "X", coordinates: [10, 0] };
  const estimateLeg = (from: PlannerStop | { name: string }, to: PlannerStop): EstimatedLeg => {
    if (to.id === end.id) terminalCalls.push(from.name);
    return { mode: "road", distanceKm: 10, durationMinutes: to.id === end.id ? 50 : 10, label: "Test", note: "Deterministic test leg", confidence: "high" };
  };
  const generated = generateRouteCandidates({
    origin: { name: "Start", coordinates: [0, 0] },
    end,
    stops: japanStops.slice(0, 3),
    estimateLeg,
  });
  assert.equal(generated.candidates.length, 6);
  assert.equal(terminalCalls.length >= generated.candidates.length, true);
  assert.equal(generated.candidates.every((candidate) => !candidate.stops.some((stop) => stop.id === end.id)), true);
  assert.equal(generated.candidates.every((candidate) => candidate.metadata.estimatedTransferMinutes === 80), true);
});

test("20 unknown End does not block the authoritative Builder gate", () => {
  assert.equal(canBuildTrip(validBuildInput()).canBuildTrip, true);
});

test("21 an unresolved explicit End remains actionable instead of being silently dropped", () => {
  const result = canBuildTrip(validBuildInput({ mode: "explicit", place: { name: "Springfield" } }));
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "end-unverified" && conflict.stage === "places"), true);
});

test("22 broad Thailand scope remains separate from London start/end", () => {
  const capture = captureJourneyBrief("London to Thailand then home");
  assert.equal(capture.mentions.find((mention) => mention.canonicalPlaceId === "thailand")?.routability, "planning_area");
  assert.equal(capture.journeyEnd.mode, "same_as_start");
  assert.equal(routableHandoffMentions(capture.mentions).some((mention) => mention.canonicalPlaceId === "thailand"), false);
});

test("23 broad Thailand with Singapore End does not make Singapore a Thailand child stop", () => {
  const trip = buildTrip({ mode: "explicit", place: singapore }, { stops: japanStops.slice(0, 2) });
  assert.equal(trip.stops.some((stop) => stop.canonicalPlaceId === "singapore"), false);
  assert.equal(endEndpointForTrip(trip)?.canonicalPlaceId, "singapore");
});

test("24 curated route evidence survives external journey endpoints", () => {
  const curatedRoute = {
    version: 1 as const,
    routeKey: "reviewed-japan",
    routeTitle: "Reviewed Japan",
    confidence: "high" as const,
    reviewedAt: "2026-08-01",
    freshness: "reviewed" as const,
    sources: [],
    canonicalStopIds: japanStops.map((stop) => stop.id),
    stops: japanStops.map((stop) => ({ stopId: stop.id, name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId, minimumNights: 1, recommendedNights: 3, reason: "Reviewed", sourceIds: [] })),
    connections: [],
    coverage: { state: "fully-supported" as const, reason: "Reviewed" },
  };
  const trip = buildTrip({ mode: "explicit", place: seoul }, { sourceRouteKey: "reviewed-japan", curatedRoute });
  assert.equal(trip.brief.curatedRoute?.routeKey, "reviewed-japan");
  assert.deepEqual(trip.brief.curatedRoute?.canonicalStopIds, japanStops.map((stop) => stop.id));
  assert.equal(trip.stops.some((stop) => stop.canonicalPlaceId === "seoul"), false);
});

test("25 save/reload preserves canonical End identity", () => {
  const reloaded = JSON.parse(JSON.stringify(buildTrip({ mode: "explicit", place: seoul }))) as EasyTTrip;
  assert.equal(isEasyTTrip(reloaded), true);
  assert.deepEqual(reloaded.brief.journeyEnd, { mode: "explicit", place: seoul });
});

test("26 local recovery preserves canonical End identity", () => {
  const storage = new MemoryStorage();
  const trip = buildTrip({ mode: "explicit", place: seoul });
  const saved = saveTripRecoveryToStorage(storage, trip, { writeId: "endpoint-write", now: "2026-09-01T00:00:00.000Z" });
  assert.equal(saved.stored, true);
  const recoveredEnd = loadLocalTripFromStorage(storage, trip.id, null, { recoveryOnly: true })?.brief.journeyEnd;
  assert.equal(recoveredEnd?.mode, "explicit");
  assert.equal(recoveredEnd?.mode === "explicit" && recoveredEnd.place.canonicalPlaceId, "seoul");
});

test("27 route replan recomputes and preserves the endpoint leg", () => {
  const trip = buildTrip({ mode: "explicit", place: seoul });
  const ordered = [...trip.planItems].reverse().map((item, index) => ({ ...item, dayNumber: index + 1, date: `2026-10-0${index + 1}` }));
  const result = replanTripAfterDayOrder(trip, ordered);
  assert.equal(result.state, "recalculated");
  if (result.state !== "recalculated") return;
  assert.equal(result.trip.brief.journeyEnd?.mode, "explicit");
  assert.equal(result.trip.legs.at(-1)?.toEndpoint?.canonicalPlaceId, "seoul");
});

test("28 endpoint edits preserve nights, activities, bookings and stable stop IDs", () => {
  const source = buildTrip({ mode: "explicit", place: london });
  source.brief.customActivities = { 2: ["Tea ceremony"] };
  source.brief.bookings = [{ id: "stay-kyoto", type: "stay", title: "Kyoto stay", date: "2026-10-04", confirmation: "KYO-1", url: null }];
  const rebuilt = buildTrip({ mode: "explicit", place: seoul });
  const result = preserveBuilderCanonicalState(source, rebuilt);
  assert.deepEqual(result.stops.map((stop) => [stop.id, stop.nights]), source.stops.map((stop) => [stop.id, stop.nights]));
  assert.deepEqual(Object.values(result.brief.customActivities ?? {}).flat(), ["Tea ceremony"]);
  assert.deepEqual(result.brief.bookings, source.brief.bookings);
  assert.equal(result.brief.journeyEnd?.mode === "explicit" && result.brief.journeyEnd.place.canonicalPlaceId, "seoul");
});

test("29 a legacy trip with no End stays valid and normalizes to unknown", () => {
  const legacy = buildTrip();
  delete legacy.brief.journeyEnd;
  if (legacy.brief.intent) delete legacy.brief.intent.journeyEnd;
  assert.equal(isEasyTTrip(legacy), true);
  assert.deepEqual(normalizeJourneyEnd(tripIntentForTrip(legacy).journeyEnd), { mode: "unknown" });
});

test("30 Homepage to Builder draft handoff preserves explicit Start and End", () => {
  const capture = captureJourneyBrief("Two weeks in Japan");
  const draft = createHomeTripDraft({
    capture,
    handoffId: "homepage-builder",
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: false,
    interests: [],
    origin: london,
    journeyEnd: { mode: "explicit", place: seoul },
  });
  assert.equal(draft.originCanonicalPlaceId, "london");
  assert.equal(draft.journeyEnd?.mode === "explicit" && draft.journeyEnd.place.canonicalPlaceId, "seoul");
});

test("31 direct Builder entry writes End to brief, intent and canonical legs", () => {
  const trip = buildTrip({ mode: "explicit", place: seoul });
  assert.deepEqual(trip.brief.intent?.journeyEnd, trip.brief.journeyEnd);
  assert.equal(trip.legs.at(-1)?.toEndpoint?.kind, "end");
});

test("32 the production endpoint editor has a 390px stack state without horizontal layout", () => {
  const styles = readFileSync(new URL("../components/easyt/journey-endpoints-editor.module.css", import.meta.url), "utf8");
  const stories = readFileSync(new URL("../components/easyt/journey-endpoints-editor.stories.tsx", import.meta.url), "utf8");
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.fields \{ grid-template-columns: 1fr;/);
  assert.match(styles, /\.root \{[^}]*min-width: 0;/);
  assert.match(stories, /BuilderAt390[\s\S]*morrovia390/);
});

test("33 shared canonical autocomplete retains keyboard navigation and selection", () => {
  assert.deepEqual(placeAutocompleteKeyAction("ArrowDown", -1, 3), { activeIndex: 0, choose: false, close: false });
  assert.deepEqual(placeAutocompleteKeyAction("ArrowUp", 0, 3), { activeIndex: 2, choose: false, close: false });
  assert.deepEqual(placeAutocompleteKeyAction("Enter", 1, 3), { activeIndex: 1, choose: true, close: true });
  assert.deepEqual(placeAutocompleteKeyAction("Escape", 1, 3), { activeIndex: -1, choose: false, close: true });
});

test("34 canonical endpoints do not duplicate the End as a route stop", () => {
  const trip = buildTrip({ mode: "explicit", place: { name: "Osaka", country: "Japan", canonicalPlaceId: "osaka", coordinates: [135.5023, 34.6937] } });
  assert.equal(trip.stops.filter((stop) => stop.canonicalPlaceId === "osaka").length, 1);
  assert.deepEqual(canonicalRouteEndpoints(trip).map((endpoint) => endpoint.kind), ["origin", "stop", "stop", "stop"]);
  const overview = readFileSync(new URL("../components/easyt/trip-overview-workspace.tsx", import.meta.url), "utf8");
  assert.match(overview, /journeyEndIsLastStop/);
  assert.match(overview, /Journey end/);
});

test("35 the final endpoint leg stays unknown without transport/geographic evidence", () => {
  const legs = buildCanonicalTripLegs({
    tripId: "unknown-end-leg",
    origin: london,
    journeyEnd: { mode: "explicit", place: { name: "Remote departure point" } },
    stops: [{ id: "tokyo", order: 0, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.6895, longitude: 139.6917, arrivalDate: null, departureDate: null, nights: 3 }],
  });
  const departure = legs.at(-1);
  assert.equal(departure?.classification, "departure");
  assert.equal(departure?.mode, "unknown");
  assert.equal(departure?.durationMinutes, null);
});

test("36 Flying home from Bangkok identifies Bangkok as the departure endpoint", () => {
  const capture = captureJourneyBrief("Flying home from Bangkok");
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "bangkok");
});

test("37 open jaw into Tokyo and out of Seoul preserves distinct endpoint intent", () => {
  const capture = captureJourneyBrief("Open jaw into Tokyo and out of Seoul");
  assert.equal(capture.journeyEnd.mode === "explicit" && capture.journeyEnd.place.canonicalPlaceId, "seoul");
  assert.equal(capture.mentions.some((mention) => mention.canonicalPlaceId === "tokyo" && mention.role !== "fixed_end"), true);
});

test("38 account promotion preserves the selected endpoint", () => {
  const promoted = canonicalTripForOwner("owner-1", buildTrip({ mode: "explicit", place: seoul }));
  assert.equal(promoted.ownerId, "owner-1");
  assert.equal(promoted.brief.journeyEnd?.mode, "explicit");
  assert.equal(promoted.brief.journeyEnd?.mode === "explicit" && promoted.brief.journeyEnd.place.canonicalPlaceId, "seoul");
});

test("39 a durable Homepage draft includes its canonical endpoint", () => {
  const capture = captureJourneyBrief("From London, Japan, ending in Seoul");
  const draft = createHomeTripDraft({ capture, handoffId: "durable", datesExplicit: false, startDate: "", endDate: "", travellers: 2, travellersExplicit: false, interests: [] });
  const trip = buildTrip(draft.journeyEnd, { capturedIntent: { originalBrief: capture.rawBrief, parserVersion: capture.parserVersion, regions: [], routeHints: [], mentions: [] } });
  assert.equal(homeTripDraftIsDurable(draft, trip, false), true);
});

test("40 spreadsheet-style and other legacy documents do not infer End from their last stop", () => {
  const trip = buildTrip();
  delete trip.brief.journeyEnd;
  assert.equal(normalizeJourneyEnd(tripIntentForTrip(trip).journeyEnd).mode, "unknown");
  assert.notEqual(normalizeJourneyEnd(tripIntentForTrip(trip).journeyEnd).mode, "explicit");
});

test("41 start and end controls expose distinct labels and non-truncating place detail", () => {
  const editor = readFileSync(new URL("../components/easyt/journey-endpoints-editor.tsx", import.meta.url), "utf8");
  const autocompleteStyles = readFileSync(new URL("../components/easyt/canonical-place-autocomplete.module.css", import.meta.url), "utf8");
  assert.match(editor, /start: "Starting from"/);
  assert.match(editor, /end: "Ending at"/);
  assert.match(editor, /role="group" aria-label=.*Journey end options/);
  assert.match(autocompleteStyles, /\.menu small \{[^}]*white-space: normal;/);
});

test("42 an external structured fixed end cannot become a missing route-stop constraint", () => {
  const extracted = extractStructuredTripBrief("Fly from Hong Kong to Hanoi, then finish in Ho Chi Minh City");
  const brief = {
    ...extracted,
    destinations: extracted.destinations.map((destination) => ({
      ...destination,
      id: destination.canonicalPlaceId === "hanoi" ? "stop-hanoi"
        : destination.canonicalPlaceId === "ho-chi-minh-city" ? "legacy-end-stop"
          : destination.id,
    })),
  };
  assert.equal(routeConstraintsFromStructuredTripBrief(brief).fixedEndStopId, "legacy-end-stop");
  const routeScoped = routeConstraintsFromStructuredTripBrief(brief, ["stop-hanoi"]);
  assert.equal(routeScoped.fixedEndStopId, undefined);
  assert.equal(routeScoped.requiredStopIds?.every((id) => id === "stop-hanoi"), true);
});
