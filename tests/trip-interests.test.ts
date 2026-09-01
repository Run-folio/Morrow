import assert from "node:assert/strict";
import test from "node:test";

import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import {
  createHomeTripDraft,
  tripInterestsFromHomeDraft,
} from "../lib/easyt/home-trip-handoff.ts";
import { allocateTripNights } from "../lib/easyt/night-allocation.ts";
import { assessRouteIntelligence, type EstimatedLeg, type PlannerStop } from "../lib/easyt/planner.ts";
import type { RouteCandidate } from "../lib/easyt/route-candidates.ts";
import { scoreRouteCandidates } from "../lib/easyt/route-scoring.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import {
  defaultTripIntent,
  isEasyTTrip,
  tripFromBuilder,
  tripIntentForTrip,
  type EasyTTrip,
} from "../lib/easyt/trip.ts";
import {
  matchingTripInterests,
  normalizeTripInterests,
  tripInterestIds,
} from "../lib/easyt/trip-interest.ts";

const plannerStop = (id: string, longitude: number, canonicalPlaceId = id): PlannerStop => ({
  id,
  name: id,
  country: "Testland",
  canonicalPlaceId,
  coordinates: [longitude, 0],
});

const candidate = (stops: PlannerStop[], candidateIndex: number, matchesOriginalOrder = candidateIndex === 0): RouteCandidate => ({
  stops,
  source: matchesOriginalOrder ? "existing" : "permutation",
  constraintsSatisfied: true,
  constraintIssues: [],
  metadata: {
    reordered: !matchesOriginalOrder,
    candidateIndex,
    matchesOriginalOrder,
    generatedByMorrovia: !matchesOriginalOrder,
    derivedFromCurrentRouteIntelligence: false,
    routeComparisonAvailable: true,
    estimatedTransferMinutes: null,
  },
});

const leg = (durationMinutes: number): EstimatedLeg => ({
  mode: "train",
  distanceKm: durationMinutes,
  durationMinutes,
  label: "Supported test transfer",
  note: "Deterministic test evidence.",
  confidence: "high",
});

function builderTrip(interests: ReturnType<typeof normalizeTripInterests>, structuredInterests: string[] = interests): EasyTTrip {
  const intent = defaultTripIntent({ travellers: 2, durationDays: 4, stopIds: ["a", "b"] });
  const structuredBrief = mergeStructuredTripBrief(extractStructuredTripBrief("Start to A and B."), {
    interests: structuredInterests,
  });
  return tripFromBuilder({
    id: "trip-interests",
    origin: "Start",
    originCoordinates: [0, 0],
    stops: [
      { id: "a", name: "A", country: "Testland", coordinates: [1, 0] },
      { id: "b", name: "B", country: "Testland", coordinates: [2, 0] },
    ],
    startDate: "2026-09-01",
    endDate: "2026-09-04",
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    dayAllocations: { a: 2, b: 2 },
    draft: [
      { number: "01", date: "Sep 1", destination: "A", title: "A", reason: "", items: [], type: "arrival" },
      { number: "02", date: "Sep 2", destination: "A", title: "A day", reason: "", items: [], type: "activity" },
      { number: "03", date: "Sep 3", destination: "B", title: "B", reason: "", items: [], type: "arrival" },
      { number: "04", date: "Sep 4", destination: "B", title: "B day", reason: "", items: [], type: "activity" },
    ],
    intent: { ...intent, preferences: { ...intent.preferences, interests } },
    structuredBrief,
  });
}

test("the canonical vocabulary uses stable machine IDs and normalizes only explicit compatibility aliases", () => {
  assert.deepEqual(tripInterestIds, ["food", "culture", "nature", "cities", "beach", "hiking"]);
  assert.deepEqual(normalizeTripInterests(["coast", "Food", "history", "city", "coast"]), ["beach", "food", "cities"]);
});

test("Homepage handoff retains selected interests and preserves an explicit empty deselection", () => {
  const capture = captureJourneyBrief("London to Paris for food and museums.");
  const selected = createHomeTripDraft({
    capture,
    handoffId: "selected-interests",
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: false,
    interests: ["culture", "beach"],
    interestsExplicit: true,
  });
  assert.deepEqual(tripInterestsFromHomeDraft(selected, capture.structuredBrief.interests.map((item) => item.value)), ["culture", "beach"]);

  const deselected = createHomeTripDraft({
    capture,
    handoffId: "deselected-interests",
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: false,
    interests: [],
    interestsExplicit: true,
  });
  assert.deepEqual(tripInterestsFromHomeDraft(deselected, ["food", "culture"]), []);
});

test("canonical trip interests survive JSON save and reload", () => {
  const source = builderTrip(["food", "nature"]);
  const saved: unknown = JSON.parse(JSON.stringify(canonicalTripForOwner("owner-interests", source, "2026-08-30T10:00:00.000Z")));
  assert.equal(isEasyTTrip(saved), true);
  if (!isEasyTTrip(saved)) return;
  assert.deepEqual(saved.brief.intent?.preferences.interests, ["food", "nature"]);
  assert.deepEqual(tripIntentForTrip(saved).preferences.interests, ["food", "nature"]);
});

test("route replan and day-order replan preserve canonical interests", () => {
  const source = builderTrip(["culture", "hiking"]);
  const reordered = [source.planItems[2], source.planItems[3], source.planItems[0], source.planItems[1]];
  const result = replanTripAfterDayOrder(source, reordered);
  assert.equal(result.state, "recalculated");
  if (result.state !== "recalculated") return;
  assert.deepEqual(result.trip.stops.map((stop) => stop.id), ["b", "a"]);
  assert.deepEqual(result.trip.brief.intent?.preferences.interests, ["culture", "hiking"]);
  assert.deepEqual(tripIntentForTrip(result.trip).preferences.interests, ["culture", "hiking"]);
});

test("an explicit empty interest selection overrides older structured capture values", () => {
  const source = builderTrip([], ["food", "culture"]);
  assert.deepEqual(source.brief.intent?.preferences.interests, []);
  assert.deepEqual(source.brief.structuredBrief?.interests, []);
  assert.deepEqual(tripIntentForTrip(source).preferences.interests, []);
});

test("legacy trips with no interest data remain compatible and neutral", () => {
  const source = builderTrip([]);
  delete source.brief.intent;
  delete source.brief.structuredBrief;
  assert.equal(isEasyTTrip(source), true);
  assert.deepEqual(tripIntentForTrip(source).preferences.interests, []);
});

test("planner context receives canonical interests and uses only curated destination evidence", () => {
  const assessment = assessRouteIntelligence({
    origin: { name: "Tokyo", coordinates: [139.6917, 35.6895] },
    stops: [
      { id: "tokyo", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] },
      { id: "takayama", name: "Takayama", country: "Japan", canonicalPlaceId: "takayama", coordinates: [137.2523, 36.146] },
    ],
    picks: {},
    availableDays: 7,
    scoringPreferences: { interests: ["food"] },
  });
  const interestReason = assessment.route.scoring?.winner?.components
    .find((component) => component.id === "destination-fit")?.reasons
    .find((reason) => /curated experience evidence/i.test(reason));
  assert.ok(interestReason);
});

test("interest fit breaks an otherwise exact tie without invalidating either route", () => {
  const generic = plannerStop("generic", 1);
  const coast = plannerStop("coast", 1);
  const candidates = [candidate([generic], 0), candidate([coast], 1, false)];
  const estimate = () => leg(100);
  const neutral = scoreRouteCandidates({ origin: { name: "Origin", coordinates: [0, 0] }, candidates, estimateLeg: estimate });
  const beach = scoreRouteCandidates({
    origin: { name: "Origin", coordinates: [0, 0] },
    candidates,
    estimateLeg: estimate,
    preferences: { interests: ["beach"] },
    interestTagsByStopId: { generic: ["food"], coast: ["coast"] },
  });

  assert.equal(neutral.winner?.candidateIndex, 0);
  assert.equal(beach.winner?.candidateIndex, 1);
  assert.equal(beach.rankedCandidates.every((item) => item.state === "scored"), true);
});

test("interest fit cannot override a clearly more efficient route", () => {
  const coast = plannerStop("coast", 3);
  const direct = plannerStop("direct", 1);
  const candidates = [candidate([coast], 0), candidate([direct], 1, false)];
  const estimate = (_from: { name: string }, to: PlannerStop) => leg(to.id === "coast" ? 300 : 100);
  const result = scoreRouteCandidates({
    origin: { name: "Origin", coordinates: [0, 0] },
    candidates,
    estimateLeg: estimate,
    preferences: { interests: ["beach"] },
    interestTagsByStopId: { coast: ["coast"], direct: ["food"] },
  });

  assert.equal(result.winner?.candidateIndex, 1);
  assert.ok((result.winner?.metrics.transferMinutes ?? Number.POSITIVE_INFINITY) < 300);
});

test("evidenced interest fit modestly changes equal stay allocation priority", () => {
  const matched = matchingTripInterests(["beach"], ["coast"]);
  const result = allocateTripNights({
    totalNights: 3,
    stops: [
      { id: "generic", name: "Generic", preferenceWeight: 0 },
      { id: "coast", name: "Coast", preferenceWeight: matched.length },
    ],
  });
  assert.notEqual(result.state, "conflict");
  assert.deepEqual(result.allocations, { generic: 1, coast: 2 });
});
