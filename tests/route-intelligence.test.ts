import assert from "node:assert/strict";
import test from "node:test";
import { assessRouteIntelligence, assessRouteOrder, estimateLeg, legDecisionAlternatives, recommendStopDurations, routeTransferSavingMinutes, usableStopDays } from "../lib/easyt/planner.ts";
import { transferHeadlineMinutes } from "../lib/easyt/transfer-impact.ts";

const origin = { name: "Start", coordinates: [0, 0] as [number, number] };

test("route saving claims require a genuine positive comparison", () => {
  assert.equal(routeTransferSavingMinutes({ currentTransferMinutes: 360, recommendedTransferMinutes: 240 }), 120);
  assert.equal(routeTransferSavingMinutes({ currentTransferMinutes: 240, recommendedTransferMinutes: 240 }), null);
  assert.equal(routeTransferSavingMinutes({ currentTransferMinutes: null, recommendedTransferMinutes: 240 }), null);
  assert.equal(routeTransferSavingMinutes({ currentTransferMinutes: 240, recommendedTransferMinutes: null }), null);
});

test("recommends a clearly more direct order when it removes material backtracking", () => {
  const stops = [
    { id: "c", name: "C", country: "Testland", coordinates: [20, 0] as [number, number] },
    { id: "a", name: "A", country: "Testland", coordinates: [1, 0] as [number, number] },
    { id: "b", name: "B", country: "Testland", coordinates: [10, 0] as [number, number] },
  ];
  const assessment = assessRouteOrder({ origin, stops });

  assert.equal(assessment.state, "recommendation");
  assert.deepEqual(assessment.recommendedStopIds, ["a", "b", "c"]);
  assert.ok((assessment.improvementMinutes ?? 0) >= 90);
});

test("accepts a small estimated-time tradeoff when the scorer removes material backtracking", () => {
  const assessment = assessRouteOrder({
    origin: { name: "Ljubljana", coordinates: [14.5058, 46.0569] },
    stops: [
      { id: "ljubljana", name: "Ljubljana", country: "Slovenia", coordinates: [14.5058, 46.0569] },
      { id: "sarajevo", name: "Sarajevo", country: "Bosnia and Herzegovina", coordinates: [18.4131, 43.8563] },
      { id: "zagreb", name: "Zagreb", country: "Croatia", coordinates: [15.9819, 45.815] },
      { id: "split", name: "Split", country: "Croatia", coordinates: [16.4402, 43.5081] },
      { id: "dubrovnik", name: "Dubrovnik", country: "Croatia", coordinates: [18.0944, 42.6507] },
    ],
    constraints: {
      fixedStartStopId: "ljubljana",
      fixedEndStopId: "dubrovnik",
      requiredStopIds: ["ljubljana", "sarajevo", "zagreb", "split", "dubrovnik"],
    },
  });

  assert.equal(assessment.state, "recommendation");
  assert.deepEqual(assessment.recommendedStopIds, ["ljubljana", "zagreb", "sarajevo", "split", "dubrovnik"]);
  assert.match(assessment.reasons.join(" "), /backtracking/i);
  assert.ok((assessment.recommendedTransferMinutes ?? 0) - (assessment.currentTransferMinutes ?? 0) <= 60);
});

test("does not make an order recommendation without verified coordinates", () => {
  const assessment = assessRouteOrder({
    origin,
    stops: [
      { id: "a", name: "A", country: "Testland", coordinates: [1, 0] },
      { id: "b", name: "B", country: "Testland" },
    ],
  });

  assert.equal(assessment.state, "insufficient-data");
});

test("can flag backtracking before a departure airport is known", () => {
  const assessment = assessRouteOrder({
    origin: { name: "" },
    stops: [
      { id: "c", name: "C", country: "Testland", coordinates: [5, 0] },
      { id: "a", name: "A", country: "Testland", coordinates: [0.1, 0] },
      { id: "b", name: "B", country: "Testland", coordinates: [2, 0] },
    ],
  });

  assert.equal(assessment.state, "recommendation");
  assert.notDeepEqual(assessment.recommendedStopIds, ["c", "a", "b"]);
});

test("compares a bounded set instead of hitting a seven-stop quality cliff", () => {
  const assessment = assessRouteOrder({
    origin,
    stops: Array.from({ length: 7 }, (_, index) => ({ id: `stop-${index}`, name: `Stop ${index}`, country: "Testland", coordinates: [index + 1, 0] as [number, number] })),
  });

  assert.notEqual(assessment.state, "insufficient-data");
  assert.ok((assessment.candidates?.length ?? 0) >= 5);
  assert.ok((assessment.candidates?.length ?? 0) <= 20);
});

test("route intelligence only recommends orders that preserve fixed gateways", () => {
  const assessment = assessRouteOrder({
    origin,
    stops: [
      { id: "start", name: "Start", country: "Testland", coordinates: [0, 0] },
      { id: "end", name: "End", country: "Testland", coordinates: [20, 0] },
      { id: "middle", name: "Middle", country: "Testland", coordinates: [10, 0] },
    ],
    constraints: { fixedStartStopId: "start", fixedEndStopId: "end", requiredStopIds: ["middle"] },
  });

  assert.deepEqual(assessment.recommendedStopIds, ["start", "middle", "end"]);
  assert.equal(assessment.candidates?.every((candidate) => candidate.stops[0]?.id === "start" && candidate.stops.at(-1)?.id === "end"), true);
});

test("protects fixed commitments instead of silently reordering around them", () => {
  const assessment = assessRouteOrder({
    origin,
    stops: [
      { id: "c", name: "C", country: "Testland", coordinates: [20, 0] },
      { id: "a", name: "A", country: "Testland", coordinates: [1, 0] },
      { id: "b", name: "B", country: "Testland", coordinates: [10, 0] },
    ],
    constraints: { fixedCommitments: [{ label: "Wedding in B", date: "2026-09-10" }] },
  });

  assert.equal(assessment.state, "current-order");
  assert.match(assessment.summary, /protected/i);
});

test("protects a full day when a transfer is travel-heavy", () => {
  const durations = recommendStopDurations({
    origin,
    stops: [{ id: "far", name: "Far", country: "Elsewhere", coordinates: [20, 0] }],
    picks: {},
  });

  assert.equal(durations.far.arrivalLoad, "travel-heavy");
  assert.equal(durations.far.minimumDays, 2);
  assert.ok(durations.far.usableDays >= 1);
});

test("does not count a substantial arrival as a full destination day", () => {
  const durations = recommendStopDurations({
    origin,
    stops: [{ id: "connected", name: "Connected", country: "Elsewhere", coordinates: [2, 0] }],
    picks: {},
  });

  assert.equal(durations.connected.arrivalLoad, "substantial");
  assert.equal(durations.connected.minimumDays, 2);
  assert.ok(usableStopDays(1, durations.connected.arrivalLoad) < 1);
  assert.ok(durations.connected.usableDays >= 1);
});

test("exposes the time shortfall instead of hiding it in the allocation", () => {
  const assessment = assessRouteIntelligence({
    origin,
    stops: [
      { id: "far", name: "Far", country: "Elsewhere", coordinates: [20, 0] },
      { id: "landmark", name: "Landmark", country: "Elsewhere", coordinates: [21, 0], intent: "landmark" },
    ],
    picks: { landmark: ["One", "Two", "Three"] },
    availableDays: 3,
  });

  assert.ok(assessment.comfortableDays > 3);
  assert.ok(assessment.shortfallDays > 0);
});

test("suggests cutting an optional stop when the route is overloaded", () => {
  const assessment = assessRouteIntelligence({
    origin,
    stops: [
      { id: "must", name: "Must", country: "Elsewhere", coordinates: [20, 0] },
      { id: "optional", name: "Optional", country: "Elsewhere", coordinates: [21, 0] },
    ],
    picks: {},
    availableDays: 2,
    constraints: { optionalStopIds: ["optional"] },
  });

  assert.equal(assessment.overload?.suggestedCutStopId, "optional");
});

test("keeps mixed train and flight preferences compatible with matching estimates", () => {
  const assessment = assessRouteOrder({
    origin: { name: "London", coordinates: [-0.1276, 51.5072] },
    stops: [
      { id: "paris", name: "Paris", country: "France", coordinates: [2.3522, 48.8566] },
      { id: "rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    ],
    constraints: { transportModes: ["train", "flight"], avoidDriving: true },
  });

  assert.deepEqual(assessment.tradeoffs, []);
});

test("offers lightweight transport trade-offs only for a meaningful intercity leg", () => {
  const options = legDecisionAlternatives(
    { id: "madrid", name: "Madrid", country: "Spain", coordinates: [-3.7038, 40.4168] },
    { id: "barcelona", name: "Barcelona", country: "Spain", coordinates: [2.1734, 41.3851] },
  );
  assert.ok(options.length >= 2);
  assert.equal(options.filter((option) => option.recommended).length, 1);
  assert.ok(options.every((option) => option.tradeoff.length > 0));
  assert.deepEqual(legDecisionAlternatives(
    { id: "a", name: "A", country: "Test", coordinates: [0, 0] },
    { id: "b", name: "B", country: "Test", coordinates: [0.1, 0] },
  ), []);
});

test("does not offer a forbidden road alternative or invent a replacement mode", () => {
  const options = legDecisionAlternatives(
    { id: "a", name: "A", country: "Testland", coordinates: [0, 0] },
    { id: "b", name: "B", country: "Testland", coordinates: [1, 0] },
    { avoidDriving: true, excludedTransportModes: ["road"] },
  );
  assert.deepEqual(options, []);
});

test("short heuristic flights keep a conservative airborne floor without claiming a schedule", () => {
  const leg = estimateLeg(
    { name: "Airport arrival", coordinates: [140.3929, 35.772] },
    { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
  );

  assert.equal(leg.mode, "flight");
  assert.ok((transferHeadlineMinutes(leg.transferImpact) ?? 0) >= 60);
  assert.ok((leg.durationMinutes ?? 0) > (transferHeadlineMinutes(leg.transferImpact) ?? 0));
  assert.match(leg.note, /estimate|verify/i);
});
