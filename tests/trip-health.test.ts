import assert from "node:assert/strict";
import test from "node:test";
import { knownKnowledgeFact } from "../lib/easyt/destination-knowledge.ts";
import { allocateTripNights } from "../lib/easyt/night-allocation.ts";
import type { PlaceIssue } from "../lib/easyt/place-intelligence.ts";
import { unknownPlanningConfidence } from "../lib/easyt/planning-confidence.ts";
import { reviewTrip, tripHealth } from "../lib/easyt/review.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { estimateTransferImpact } from "../lib/easyt/transfer-impact.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const baseTrip = (): EasyTTrip => ({
  schemaVersion: 1, id: "health", ownerId: null, title: "Health", status: "draft", startDate: "2026-09-01", endDate: "2026-09-05", travellers: 2, currency: "GBP",
  brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: { version: 1, travellers: 2, timing: { flexibility: "fixed", durationDays: 5 }, hardConstraints: { originRequired: true, mustSeeStopIds: ["a", "b"], optionalStopIds: [], fixedCommitments: [], avoidDriving: false }, preferences: { budgetSensitivity: "mid", transportModes: ["train"], pace: "balanced", interests: [], dislikes: [] } }, scheduleLocks: { stopIds: [], arrivalDates: {} } },
  stops: [
    { id: "a", order: 0, name: "A", country: "Test", latitude: 0, longitude: 0, arrivalDate: "2026-09-01", departureDate: "2026-09-03", nights: 1 },
    { id: "b", order: 1, name: "B", country: "Test", latitude: 0, longitude: 10, arrivalDate: "2026-09-03", departureDate: "2026-09-05", nights: 1 },
  ],
  legs: [{ id: "leg", fromStopId: "a", toStopId: "b", mode: "road", distanceKm: 800, durationMinutes: 600, provider: "Planning estimate", routeMetadata: { planningEstimate: true } }],
  planItems: [
    { id: "a", stopId: "a", dayNumber: 1, date: "2026-09-01", type: "arrival", title: "A", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "b", stopId: "b", dayNumber: 3, date: "2026-09-03", type: "arrival", title: "B", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
  ], recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});

const readyTrip = (): EasyTTrip => {
  const trip = baseTrip();
  trip.brief.originCoordinates = [-0.1276, 51.5072];
  trip.brief.originCountry = "United Kingdom";
  trip.brief.pace = "full";
  trip.brief.intent = {
    ...trip.brief.intent!,
    hardConstraints: { ...trip.brief.intent!.hardConstraints, mustSeeStopIds: ["a"] },
  };
  trip.stops = [{ ...trip.stops[0], departureDate: "2026-09-05", nights: 4 }];
  trip.legs = [{
    id: "health-leg-1",
    fromStopId: "health-origin",
    toStopId: "a",
    fromEndpoint: { kind: "origin", id: "health-origin", name: "London", country: "United Kingdom", coordinates: [-0.1276, 51.5072] },
    toEndpoint: { kind: "stop", id: "a", name: "A", country: "Test", coordinates: [0, 0] },
    classification: "arrival",
    mode: "flight",
    distanceKm: 5_728,
    straightLineDistanceKm: 5_728,
    routedDistanceKm: null,
    durationMinutes: 600,
    headlineMinutes: 480,
    doorToDoorMinutes: 600,
    usableDayLoss: 1,
    provider: "Verified fixture schedule",
    provenance: "provider",
    confidence: "high",
    scheduleNeedsChecking: false,
    warnings: [],
    routeMetadata: { planningEstimate: false, decisionOption: "fixture", routingConfidence: "high" },
  }];
  trip.planItems = Array.from({ length: 5 }, (_, index) => ({
    id: `ready-${index + 1}`,
    stopId: "a",
    dayNumber: index + 1,
    date: `2026-09-0${index + 1}`,
    type: "activity" as const,
    title: `Day ${index + 1}`,
    reason: "",
    notes: [],
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    latitude: null,
    longitude: null,
  }));
  return trip;
};

const placeIssue = (input: Pick<PlaceIssue, "code" | "severity" | "blocksRoute" | "mentionId" | "sourceText" | "reason">): PlaceIssue => ({
  ...input,
  canonicalPlaceId: undefined,
  message: input.reason,
  options: [],
  confidence: unknownPlanningConfidence(input.reason),
  provenance: [{ id: `test:${input.mentionId}`, label: "Trip Health test", kind: "unresolved", supports: input.reason }],
});

const retainPlaceIssues = (trip: EasyTTrip, issues: PlaceIssue[]) => {
  trip.brief.structuredBrief = Object.assign(extractStructuredTripBrief("A short trip."), { placeIssues: issues });
  return trip;
};

test("flags a one-night stop reached by a heavy transfer as blocking", () => {
  const issues = reviewTrip(baseTrip());
  assert.equal(issues.some((item) => item.rule === "short-stop-heavy-transfer" && item.severity === "critical"), true);
});

test("Trip Health uses realistic transfer impact when it is richer than the legacy allowance", () => {
  const trip = baseTrip();
  trip.legs[0] = {
    ...trip.legs[0],
    mode: "flight",
    durationMinutes: 120,
    routeMetadata: {
      planningEstimate: true,
      transferImpact: estimateTransferImpact({
        mode: "flight",
        headlineMinutes: knownKnowledgeFact(360, "verified", {
          id: "provider:trip-health-test",
          label: "Verified Trip Health fixture",
          kind: "provider",
          supports: "Headline duration for the persisted transfer-impact test.",
          reviewedAt: "2026-08-23",
        }),
        international: false,
        connectionCount: 0,
      }),
    },
  };

  assert.equal(reviewTrip(trip).some((item) => item.rule === "travel-day-impact" && item.severity === "warning"), true);
});

test("Trip Health exposes a structured minimum-night compromise", () => {
  const trip = baseTrip();
  trip.brief.nightAllocation = allocateTripNights({
    totalNights: 2,
    stops: [
      { id: "a", name: "A", anchor: true, required: true },
      { id: "b", name: "B", anchor: true, required: true },
    ],
  });

  assert.equal(reviewTrip(trip).some((item) => item.rule === "night-allocation-compromise" && item.severity === "warning"), true);
});

test("Trip Health exposes unresolved independent final-plan validation", () => {
  const trip = baseTrip();
  const issues = reviewTrip(trip);
  assert.equal(issues.some((item) => item.rule === "post-generation-total-nights-mismatch" && item.severity === "critical"), true);
});

test("treats a fixed commitment outside the trip dates as blocking", () => {
  const trip = baseTrip();
  trip.brief.intent!.hardConstraints.fixedCommitments = [{ id: "fixed", label: "Wedding", date: "2026-09-08" }];
  assert.equal(tripHealth(trip).blockingCount > 0, true);
  assert.equal(reviewTrip(trip).some((item) => item.rule === "fixed-date-conflict"), true);
});

test("Trip Health preserves a structured fixed commitment without the legacy intent object", () => {
  const trip = baseTrip();
  trip.brief.intent = undefined;
  trip.brief.structuredBrief = mergeStructuredTripBrief(extractStructuredTripBrief("A short trip."), {
    fixedCommitments: [{ label: "Wedding", date: "2026-09-08" }],
  });

  assert.equal(reviewTrip(trip).some((item) => item.rule === "fixed-date-conflict"), true);
});

test("does not call a trip ready while a major transport decision is still a planning estimate", () => {
  assert.equal(tripHealth(baseTrip()).isReady, false);
});

test("does not warn when the final stay ends on the canonical trip end date", () => {
  const trip = readyTrip();
  assert.equal(reviewTrip(trip).some((item) => item.rule === "trip-end-mismatch"), false);
});

test("warns when the final stay actually ends before the canonical trip end date", () => {
  const trip = readyTrip();
  trip.stops[0].departureDate = "2026-09-04";
  assert.equal(reviewTrip(trip).some((item) => item.rule === "trip-end-mismatch"), true);
});

test("treats a persisted transport alternative as a decision while retaining the planning estimate", () => {
  const trip = baseTrip();
  trip.legs[0].routeMetadata.decisionOption = "fastest";
  assert.equal(reviewTrip(trip).some((item) => item.rule === "missing-transport-decision"), false);
});

test("blocks route readiness when a declared domestic stop is geographically implausible", () => {
  const trip = baseTrip();
  trip.stops[0] = { ...trip.stops[0], name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917 };
  trip.stops[1] = { ...trip.stops[1], name: "Nikko", country: "Japan", latitude: -16.2902, longitude: -66.1568 };
  assert.equal(reviewTrip(trip).some((item) => item.rule === "destination-identity" && item.severity === "critical"), true);
  assert.equal(tripHealth(trip).isReady, false);
});

test("Trip Health surfaces structured place issues with deterministic recommendation severity and identity", () => {
  const trip = retainPlaceIssues(readyTrip(), [
    placeIssue({
      code: "unresolved_place",
      severity: "error",
      blocksRoute: true,
      mentionId: "patagonia",
      sourceText: "Patagonia",
      reason: "Confirm Patagonia before relying on this route.",
    }),
    placeIssue({
      code: "unsupported_containment",
      severity: "warning",
      blocksRoute: false,
      mentionId: "alps",
      sourceText: "the Alps",
      reason: "The country scope for the Alps still needs review.",
    }),
    placeIssue({
      code: "duplicate_alias",
      severity: "info",
      blocksRoute: false,
      mentionId: "rapa-nui",
      sourceText: "Rapa Nui",
      reason: "Rapa Nui and Easter Island resolve to the same place.",
    }),
  ]);

  const first = tripHealth(trip);
  const critical = first.issues.find((item) => item.rule === "place-intelligence-unresolved-place-patagonia");
  const warning = first.issues.find((item) => item.rule === "place-intelligence-unsupported-containment-alps");
  const info = first.issues.find((item) => item.rule === "place-intelligence-duplicate-alias-rapa-nui");

  assert.equal(critical?.severity, "critical");
  assert.equal(critical?.message, "Confirm Patagonia before relying on this route.");
  assert.equal(warning?.severity, "warning");
  assert.equal(info?.severity, "info");
  assert.equal(first.isReady, false);

  const secondIds = tripHealth(trip).issues.filter((item) => item.rule.startsWith("place-intelligence-")).map((item) => item.id);
  const firstIds = first.issues.filter((item) => item.rule.startsWith("place-intelligence-")).map((item) => item.id);
  assert.deepEqual(secondIds, firstIds);
});

test("Trip Health readiness follows place issue route blocking without blocking optional unresolved intent", () => {
  const ready = tripHealth(readyTrip());
  assert.equal(ready.isReady, true, JSON.stringify(ready.issues.map((issue) => ({ rule: issue.rule, severity: issue.severity, message: issue.message }))));

  for (const code of ["unresolved_place", "ambiguous_place", "region_requires_base"] as const) {
    const blocking = retainPlaceIssues(readyTrip(), [placeIssue({
      code,
      severity: "warning",
      blocksRoute: true,
      mentionId: code,
      sourceText: code.replaceAll("_", " "),
      reason: `Resolve ${code.replaceAll("_", " ")} before routing.`,
    })]);
    assert.equal(tripHealth(blocking).isReady, false, `${code} should block when blocksRoute is true`);
  }

  const optional = retainPlaceIssues(readyTrip(), [placeIssue({
    code: "unresolved_place",
    severity: "warning",
    blocksRoute: false,
    mentionId: "optional-region",
    sourceText: "an optional region",
    reason: "This optional region can be resolved later.",
  })]);
  assert.equal(tripHealth(optional).isReady, true);
  assert.equal(tripHealth(optional).issues.some((item) => item.rule === "place-intelligence-unresolved-place-optional-region"), true);
});
