import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCandidates, type RouteCandidate } from "../lib/easyt/route-candidates.ts";
import { DEFAULT_ROUTE_SCORING_CONFIG, scoreRouteCandidates } from "../lib/easyt/route-scoring.ts";
import type { CountryContinuityConstraintProof } from "../lib/easyt/route-country-continuity.ts";
import { knownKnowledgeFact } from "../lib/easyt/destination-knowledge.ts";
import { TRANSFER_IMPACT_RULE_SOURCE, estimateTransferImpact, type TransferImpact } from "../lib/easyt/transfer-impact.ts";
import { estimateLegForConstraints, type EstimatedLeg, type PlannerStop } from "../lib/easyt/planner.ts";

const origin = { name: "Origin", coordinates: [0, 0] as [number, number] };
const stop = (id: string, longitude: number, intent?: PlannerStop["intent"]): PlannerStop => ({
  id,
  name: id.toUpperCase(),
  country: "Testland",
  coordinates: [longitude, 0],
  intent,
});
const countryStop = (id: string, country: string, countryCode: string | undefined): PlannerStop => ({
  id,
  name: id,
  country,
  ...(countryCode ? { countryCode } : {}),
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

const leg = (mode: EstimatedLeg["mode"], durationMinutes: number | null, distanceKm: number | null, confidence: EstimatedLeg["confidence"] = "high", transferImpact?: TransferImpact): EstimatedLeg => ({
  mode,
  durationMinutes,
  distanceKm,
  confidence,
  label: "Test connection",
  note: "Deterministic planning estimate; verify before booking.",
  transferImpact,
});

const geographicEstimator = (from: { coordinates?: [number, number] }, to: PlannerStop): EstimatedLeg => {
  const distanceKm = Math.abs((to.coordinates?.[0] ?? 0) - (from.coordinates?.[0] ?? 0)) * 100;
  return leg("train", distanceKm, distanceKm);
};

function pairEstimator(pairs: Record<string, EstimatedLeg>, fallback = leg("train", 0, 0)) {
  return (from: { name: string }, to: PlannerStop) => pairs[`${from.name}|${to.name}`] ?? fallback;
}

test("an obvious linear route wins with an auditable component breakdown", () => {
  const stops = [stop("c", 3), stop("a", 1), stop("b", 2)];
  const generation = generateRouteCandidates({ origin, stops, estimateLeg: geographicEstimator });
  const result = scoreRouteCandidates({ origin, candidates: generation.candidates, estimateLeg: geographicEstimator, availableDays: 8 });

  assert.equal(result.state, "selected");
  assert.deepEqual(result.winner?.stopIds, ["a", "b", "c"]);
  assert.equal(result.winner?.components.length, 5);
  assert.ok(result.explanation.length > 0);
  assert.equal(result.winner?.baseScore, Number((result.winner?.components.reduce((total, component) => total + component.weightedScore, 0) ?? 0).toFixed(1)));
});

test("a geographic zigzag receives an explicit backtracking penalty", () => {
  const stops = [stop("c", 3), stop("a", 1), stop("b", 2)];
  const generation = generateRouteCandidates({ origin, stops, estimateLeg: geographicEstimator });
  const result = scoreRouteCandidates({ origin, candidates: generation.candidates, estimateLeg: geographicEstimator });
  const entered = result.rankedCandidates.find((item) => item.matchesOriginalOrder);

  assert.equal(entered?.state, "scored");
  assert.equal(entered?.penalties.some((penalty) => penalty.code === "unnecessary-backtracking"), true);
});

test("backtracking penalties scale with objective detour severity", () => {
  const stops = [stop("d", 4), stop("a", 1), stop("c", 3), stop("b", 2)];
  const generation = generateRouteCandidates({ origin, stops, estimateLeg: geographicEstimator });
  const result = scoreRouteCandidates({ origin, candidates: generation.candidates, estimateLeg: geographicEstimator });
  const entered = result.rankedCandidates.find((item) => item.matchesOriginalOrder);
  const penalty = entered?.penalties.find((item) => item.code === "unnecessary-backtracking");

  assert.equal(entered?.state, "scored");
  assert.ok((penalty?.points ?? 0) > 10);
  assert.ok((penalty?.points ?? 0) <= 30);
});

test("whole-route scoring penalizes a substantial geographic reversal even below the old ratio threshold", () => {
  const london = { name: "London", coordinates: [-0.1276, 51.5072] as [number, number] };
  const stops: PlannerStop[] = [
    { id: "airlie-beach", name: "Airlie Beach", country: "Australia", coordinates: [148.718, -20.2678] },
    { id: "sydney", name: "Sydney", country: "Australia", coordinates: [151.2093, -33.8688] },
    { id: "port-douglas", name: "Port Douglas", country: "Australia", coordinates: [145.467, -16.484] },
  ];
  const estimate = (from: { name: string; coordinates?: [number, number] } | PlannerStop, to: PlannerStop) => estimateLegForConstraints(from, to);
  const generation = generateRouteCandidates({ origin: london, stops, estimateLeg: estimate });
  const result = scoreRouteCandidates({
    origin: london,
    candidates: generation.candidates,
    estimateLeg: estimate,
    availableDays: 10,
    preferences: { pace: "relaxed", preferredModes: ["flight", "train"] },
  });
  const obviousReversal = result.rankedCandidates.find((item) => item.stopIds.join("|") === "port-douglas|sydney|airlie-beach");

  assert.equal(obviousReversal?.state, "scored");
  assert.ok(obviousReversal?.penalties.some((penalty) => penalty.code === "unnecessary-backtracking"));
  assert.notDeepEqual(result.winner?.stopIds, ["port-douglas", "sydney", "airlie-beach"]);
});

test("relaxed pacing avoids one excessive leg while fast pacing can accept it", () => {
  const [a, b, c] = [stop("a", 1), stop("b", 2), stop("c", 3)];
  const candidates = [candidate([a, b, c], 0), candidate([a, c, b], 1, false)];
  const estimate = pairEstimator({
    "Origin|A": leg("train", 0, 0),
    "A|B": leg("train", 620, 100),
    "B|C": leg("train", 30, 100),
    "A|C": leg("train", 405, 100),
    "C|B": leg("train", 405, 100),
  });
  const relaxed = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate, availableDays: 10, preferences: { pace: "relaxed" } });
  const fast = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate, availableDays: 10, preferences: { pace: "fast" } });

  assert.equal(relaxed.winner?.candidateIndex, 1);
  assert.equal(fast.winner?.candidateIndex, 0);
  const relaxedEnteredPacing = relaxed.rankedCandidates.find((item) => item.candidateIndex === 0 && item.state === "scored")?.components.find((item) => item.id === "pacing")?.score;
  const fastEnteredPacing = fast.rankedCandidates.find((item) => item.candidateIndex === 0 && item.state === "scored")?.components.find((item) => item.id === "pacing")?.score;
  assert.ok((fastEnteredPacing ?? 0) > (relaxedEnteredPacing ?? 0));
});

test("a strong rail preference influences score without invalidating a flight candidate", () => {
  const [a, b, c] = [stop("a", 1), stop("b", 2), stop("c", 3)];
  const candidates = [candidate([a, b, c], 0), candidate([a, c, b], 1, false)];
  const estimate = pairEstimator({
    "Origin|A": leg("road", 0, 0),
    "A|B": leg("flight", 200, 200),
    "B|C": leg("train", 200, 200),
    "A|C": leg("train", 205, 200),
    "C|B": leg("train", 205, 200),
  });
  const result = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate, preferences: { preferredModes: ["train"] } });
  const flightCandidate = result.rankedCandidates.find((item) => item.candidateIndex === 0);

  assert.equal(result.winner?.candidateIndex, 1);
  assert.equal(flightCandidate?.state, "scored");
  assert.equal(flightCandidate?.penalties.some((penalty) => penalty.code === "unnecessary-flight"), true);
});

test("travel efficiency uses realistic impact while preserving the existing scorer boundary", () => {
  const [a, b, c] = [stop("a", 1), stop("b", 2), stop("c", 3)];
  const candidates = [candidate([a, b, c], 0), candidate([a, c, b], 1, false)];
  const impact = (mode: "flight" | "train") => estimateTransferImpact({
    mode,
    headlineMinutes: knownKnowledgeFact(90, "estimated", TRANSFER_IMPACT_RULE_SOURCE),
    international: false,
    connectionCount: 0,
  });
  const estimate = pairEstimator({
    "Origin|A": leg("road", 0, 0),
    "A|B": leg("flight", 90, 100, "high", impact("flight")),
    "B|C": leg("train", 90, 100, "high", impact("train")),
    "A|C": leg("train", 90, 100, "high", impact("train")),
    "C|B": leg("train", 90, 100, "high", impact("train")),
  });

  const result = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate, availableDays: 8 });
  const entered = result.rankedCandidates.find((item) => item.candidateIndex === 0);
  assert.equal(result.winner?.candidateIndex, 1);
  assert.ok((entered?.metrics.transferMinutes ?? 0) > 180);
  assert.notEqual(entered?.metrics.headlineTransferMinutes, entered?.metrics.transferMinutes);
});

test("avoid-flight remains soft but overrides a conflicting fallback flight mode", () => {
  const [a, b, c] = [stop("a", 1), stop("b", 2), stop("c", 3)];
  const candidates = [candidate([a, b, c], 0), candidate([a, c, b], 1, false)];
  const estimate = pairEstimator({
    "Origin|A": leg("road", 0, 0),
    "A|B": leg("flight", 200, 200),
    "B|C": leg("train", 200, 200),
    "A|C": leg("train", 205, 200),
    "C|B": leg("train", 205, 200),
  });
  const result = scoreRouteCandidates({
    origin,
    candidates,
    estimateLeg: estimate,
    preferences: { preferredModes: ["flight", "train"], avoidFlights: true },
  });

  assert.equal(result.winner?.candidateIndex, 1);
  assert.equal(result.rankedCandidates.find((item) => item.candidateIndex === 0)?.state, "scored");
});

test("fixed gateways and required anchors remain present in every scored candidate", () => {
  const stops = [stop("start", 0), stop("anchor", 2, "landmark"), stop("middle", 1), stop("end", 3)];
  const generation = generateRouteCandidates({
    origin,
    stops,
    constraints: { fixedStartStopId: "start", fixedEndStopId: "end", requiredStopIds: ["anchor"] },
    estimateLeg: geographicEstimator,
  });
  const result = scoreRouteCandidates({
    origin,
    candidates: generation.candidates,
    estimateLeg: geographicEstimator,
    requiredStopIds: ["anchor"],
    fixedStartStopId: "start",
    fixedEndStopId: "end",
  });

  assert.ok(result.winner);
  assert.equal(result.rankedCandidates.every((item) => item.stopIds[0] === "start" && item.stopIds.at(-1) === "end" && item.stopIds.includes("anchor")), true);
});

test("exact ties are deterministic and preserve the entered order", () => {
  const [a, b, c] = [stop("a", 1), stop("b", 2), stop("c", 3)];
  const candidates = [candidate([a, b, c], 0), candidate([a, c, b], 1, false)];
  const equalEstimator = () => leg("train", 100, 100);
  const first = scoreRouteCandidates({ origin, candidates, estimateLeg: equalEstimator });
  const second = scoreRouteCandidates({ origin, candidates, estimateLeg: equalEstimator });

  assert.equal(first.winner?.candidateIndex, 0);
  assert.deepEqual(first, second);
  assert.match(first.explanation, /entered order/i);
});

test("a hard-constraint contradiction produces no scoring winner", () => {
  const stops = [stop("a", 1), stop("b", 2), stop("c", 3)];
  const generation = generateRouteCandidates({
    origin,
    stops,
    constraints: { requiredStopIds: ["a", "b", "c"], maximumStops: 2 },
    estimateLeg: geographicEstimator,
  });
  const result = scoreRouteCandidates({ origin, candidates: generation.candidates, estimateLeg: geographicEstimator });

  assert.equal(generation.constraintIssues.some((issue) => issue.code === "required-stops-exceed-maximum"), true);
  assert.equal(result.state, "insufficient-data");
  assert.equal(result.winner, null);
});

test("unconfirmed connections cannot outrank a fully estimated candidate", () => {
  const [a, b, c] = [stop("a", 1), stop("b", 2), stop("c", 3)];
  const candidates = [candidate([a, b, c], 0), candidate([a, c, b], 1, false)];
  const estimate = pairEstimator({
    "Origin|A": leg("road", 0, 0),
    "A|B": leg("train", null, 200, "unconfirmed"),
    "B|C": leg("train", 100, 100),
    "A|C": leg("train", 180, 180),
    "C|B": leg("train", 100, 100),
  });
  const result = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate });

  assert.equal(result.winner?.candidateIndex, 1);
  assert.equal(result.rankedCandidates.find((item) => item.candidateIndex === 0)?.state, "insufficient-data");
});

test("stay penalties require explicit allocations and protect a one-day anchor", () => {
  const anchor = stop("anchor", 1, "landmark");
  const next = stop("next", 2);
  const candidates = [candidate([anchor, next], 0)];
  const estimate = pairEstimator({
    "Origin|ANCHOR": leg("train", 400, 300),
    "ANCHOR|NEXT": leg("train", 400, 300),
  });
  const withoutAllocations = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate, requiredStopIds: ["anchor"] });
  const withAllocations = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate, requiredStopIds: ["anchor"], allocations: { anchor: 1, next: 3 } });

  assert.equal(withoutAllocations.winner?.penalties.some((penalty) => penalty.code === "one-night-anchor"), false);
  assert.equal(withAllocations.winner?.penalties.some((penalty) => penalty.code === "one-night-anchor"), true);
  assert.equal(withAllocations.winner?.penalties.some((penalty) => penalty.code === "arrival-or-departure-consumes-stay"), true);
});

test("an observed India re-entry receives the centralized penalty and loses a close comparison", () => {
  const mumbai = countryStop("Mumbai", "India", "IN");
  const agra = countryStop("Agra", "India", "IN");
  const dubai = countryStop("Dubai", "United Arab Emirates", "AE");
  const dushanbe = countryStop("Dushanbe", "Tajikistan", "TJ");
  const candidates = [
    candidate([mumbai, dubai, dushanbe, agra], 0),
    candidate([mumbai, agra, dubai, dushanbe], 1, false),
  ];
  const estimate = pairEstimator({
    "Origin|Mumbai": leg("train", 0, 0),
    "Mumbai|Dubai": leg("train", 100, 0),
    "Dubai|Dushanbe": leg("train", 150, 0),
    "Dushanbe|Agra": leg("train", 150, 0),
    "Mumbai|Agra": leg("train", 120, 0),
    "Agra|Dubai": leg("train", 160, 0),
  });
  const result = scoreRouteCandidates({ origin, candidates, estimateLeg: estimate });
  const split = result.rankedCandidates.find((item) => item.candidateIndex === 0);

  assert.deepEqual(result.winner?.stopIds, ["Mumbai", "Agra", "Dubai", "Dushanbe"]);
  assert.equal(DEFAULT_ROUTE_SCORING_CONFIG.penalties["country-reentry"], 12);
  assert.equal(split?.penalties.find((penalty) => penalty.code === "country-reentry")?.points, 12);
  assert.equal(split?.metrics.observedAvoidableCountryReentryCount, 1);
  assert.deepEqual(split?.metrics.repeatedCountryCodes, ["IN"]);
  assert.equal(split?.metrics.countryBlockCount, 4);
  assert.equal(split?.metrics.countryReentryCount, 1);
  assert.match(result.explanation, /fewer avoidable country re-entries/i);
});

test("a singleton produced by an unrelated planning boundary remains unproven-protected", () => {
  const split = candidate([
    countryStop("Mumbai", "India", "IN"),
    countryStop("Dubai", "United Arab Emirates", "AE"),
    countryStop("Agra", "India", "IN"),
    countryStop("Mystery", "Unknown", undefined),
  ], 0);
  const result = scoreRouteCandidates({ origin, candidates: [split], estimateLeg: () => leg("train", 60, 10) });
  const scored = result.winner;

  assert.equal(scored?.penalties.some((penalty) => penalty.code === "country-reentry"), false);
  assert.deepEqual(scored?.metrics.provenConstraintDrivenCountryCodes, []);
  assert.deepEqual(scored?.metrics.unprovenProtectedCountryCodes, ["IN"]);
  assert.deepEqual(scored?.metrics.unknownCountryStopIds, ["Mystery"]);
  assert.equal(scored?.metrics.countryContinuityAssessments[0]?.status, "unproven-protected");
  assert.doesNotMatch(result.explanation, /constraint-driven|every hard-constraint-safe/i);
});

test("typed gateway proof is recorded without manufacturing an avoidable penalty", () => {
  const split = candidate([
    countryStop("Mumbai", "India", "IN"),
    countryStop("Dubai", "United Arab Emirates", "AE"),
    countryStop("Agra", "India", "IN"),
  ], 0);
  const proof: CountryContinuityConstraintProof = {
    countryCode: "IN",
    kind: "fixed-gateway-position",
    provenReentryCount: 1,
    stopIds: ["Mumbai", "Dubai", "Agra"],
    constraintIds: ["fixed-start:Mumbai", "fixed-end:Agra"],
  };
  const result = scoreRouteCandidates({
    origin,
    candidates: [split],
    estimateLeg: () => leg("train", 60, 10),
    countryContinuityProofs: [proof],
  });

  assert.deepEqual(result.winner?.metrics.provenConstraintDrivenCountryCodes, ["IN"]);
  assert.deepEqual(result.winner?.metrics.unprovenProtectedCountryCodes, []);
  assert.equal(result.winner?.metrics.countryContinuityAssessments[0]?.proof?.kind, "fixed-gateway-position");
  assert.equal(result.winner?.penalties.some((penalty) => penalty.code === "country-reentry"), false);
  assert.match(result.winner?.reasons.join(" ") ?? "", /fixed gateway positions require/i);
});

test("a large supported hub advantage can retain an avoidable split despite the soft penalty", () => {
  const a1 = countryStop("A1", "India", "IN");
  const hub = countryStop("Hub", "United Arab Emirates", "AE");
  const a2 = countryStop("A2", "India", "IN");
  const split = candidate([a1, hub, a2], 0);
  const contiguous = candidate([a1, a2, hub], 1, false);
  const estimate = pairEstimator({
    "Origin|A1": leg("flight", 0, 0),
    "A1|Hub": leg("flight", 40, 0),
    "Hub|A2": leg("flight", 40, 0),
    "A1|A2": leg("train", 600, 0),
    "A2|Hub": leg("flight", 600, 0),
  });
  const result = scoreRouteCandidates({ origin, candidates: [split, contiguous], estimateLeg: estimate });

  assert.equal(result.winner?.candidateIndex, 0);
  assert.equal(result.winner?.metrics.countryContinuityAssessments[0]?.status, "avoidable");
  assert.equal(result.winner?.penalties.find((penalty) => penalty.code === "country-reentry")?.points, 12);
});

test("country-reentry reasons pluralize multiple observed re-entries truthfully", () => {
  const a1 = countryStop("A1", "India", "IN");
  const a2 = countryStop("A2", "India", "IN");
  const a3 = countryStop("A3", "India", "IN");
  const b = countryStop("B", "China", "CN");
  const c = countryStop("C", "Japan", "JP");
  const result = scoreRouteCandidates({
    origin,
    candidates: [
      candidate([a1, b, a2, c, a3], 0),
      candidate([a1, a2, a3, b, c], 1, false),
    ],
    estimateLeg: () => leg("train", 60, 0),
  });
  const split = result.rankedCandidates.find((item) => item.candidateIndex === 0);

  assert.match(split?.penalties.find((penalty) => penalty.code === "country-reentry")?.reason ?? "", /2 avoidable country re-entries/);
});
