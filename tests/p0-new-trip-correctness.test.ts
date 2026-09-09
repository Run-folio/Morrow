import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fixedCommitmentDisplayLabel, projectFixedCommitmentsToStops } from "../lib/easyt/fixed-commitment.ts";
import { routableHandoffMentions } from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief, captureJourneyBriefFromSemanticIntent, captureJourneyBriefWithProvider } from "../lib/easyt/journey-capture.ts";
import { requestJourneyCapture } from "../lib/easyt/journey-capture-client.ts";
import { assessRouteIntelligence } from "../lib/easyt/planner.ts";
import { validateFinalPlan } from "../lib/easyt/plan-validator.ts";
import type { PlaceIntelligenceProvider } from "../lib/easyt/place-intelligence.ts";
import {
  SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  type SemanticTripIntent,
} from "../lib/easyt/semantic-trip-intent.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { isEasyTTrip, tripFromBuilder, tripIntentForTrip, type FixedTripCommitment } from "../lib/easyt/trip.ts";

const MULTI_PLACE_PROMPT = "Los angeles denver mexico city tulum and cancun with a visit to chitchen itza";
const EXPECTED_BASES = ["Los Angeles", "Denver", "Mexico City", "Tulum", "Cancún"];

const denverProvider: PlaceIntelligenceProvider = {
  id: "p0-denver-fixture",
  label: "P0 Denver fixture",
  lookup: async (phrase) => phrase.toLocaleLowerCase() === "denver" ? [{
    providerId: "denver",
    canonicalName: "Denver",
    placeType: "city",
    parentCountries: ["United States"],
    coordinates: [-104.9849, 39.7392],
    routability: "direct_destination",
    matchQuality: "exact",
    rankScore: 100,
  }] : [],
};

function captureFetcher(capture: Awaited<ReturnType<typeof captureJourneyBriefWithProvider>>) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { brief: MULTI_PLACE_PROMPT });
    return new Response(JSON.stringify(capture), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

test("homepage and direct Builder preserve every base plus the Chichén Itzá visit intent", async () => {
  const deterministic = captureJourneyBrief(MULTI_PLACE_PROMPT);
  assert.deepEqual(deterministic.mentions.map((mention) => mention.sourceText), [
    "Los angeles", "denver", "mexico city", "tulum", "cancun", "chitchen itza",
  ]);
  assert.equal(deterministic.mentions.find((mention) => mention.sourceText === "denver")?.status, "unresolved");
  assert.equal(deterministic.mentions.find((mention) => mention.sourceText === "chitchen itza")?.canonicalPlaceId, "chichen-itza");

  const canonical = await captureJourneyBriefWithProvider(MULTI_PLACE_PROMPT, denverProvider);
  const homepage = await requestJourneyCapture(MULTI_PLACE_PROMPT, { fetcher: captureFetcher(canonical) });
  const directBuilder = await requestJourneyCapture(MULTI_PLACE_PROMPT, { fetcher: captureFetcher(canonical) });
  for (const capture of [homepage, directBuilder]) {
    assert.deepEqual(routableHandoffMentions(capture.mentions).map((mention) => mention.canonicalName), EXPECTED_BASES);
    const visit = capture.mentions.find((mention) => mention.canonicalPlaceId === "chichen-itza");
    assert.ok(visit);
    assert.equal(visit.canonicalName, "Chichén Itzá");
    assert.equal(visit.routability, "anchor_or_poi");
    assert.equal(visit.role, "anchor");
    assert.equal(capture.structuredBrief.placeIssues?.some((issue) => issue.mentionId === visit.mentionId && issue.code === "region_requires_base"), true);
    assert.equal(capture.mentionCoverage.complete, true);
  }
});

test("common Chichén Itzá spelling and punctuation variants share one canonical identity", () => {
  for (const phrase of ["Chichen Itza", "Chichén Itzá", "Chichen-Itza", "chitchen itza"]) {
    const capture = captureJourneyBrief(`Cancún with a visit to ${phrase}`);
    const visit = capture.mentions.find((mention) => mention.canonicalPlaceId === "chichen-itza");
    assert.ok(visit, phrase);
    assert.equal(visit.canonicalName, "Chichén Itzá", phrase);
    assert.equal(visit.routability, "anchor_or_poi", phrase);
  }
});

test("explicit visit language outranks a semantic route-stop classification for Chichén Itzá", async () => {
  const intent: SemanticTripIntent = {
    schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
    rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: null, certainty: null },
    journeyEnd: { sourceText: null, interpretedText: null, mode: "unknown", certainty: null },
    duration: { sourceText: null, value: null, unit: null },
    explicitDateTexts: [],
    destinationCandidates: ["Los angeles", "denver", "mexico city", "tulum", "cancun", "chitchen itza"].map((sourceText) => ({
      sourceText,
      interpretedText: sourceText === "chitchen itza" ? "Chichen-Itza" : null,
      role: "route-stop" as const,
      certainty: "explicit" as const,
    })),
    pointsOfInterest: [],
    transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
    pace: { sourceText: null, value: null },
    interests: [],
    constraints: [],
    ambiguities: [],
    unresolvedMeaningfulText: [],
  };
  const capture = await captureJourneyBriefFromSemanticIntent(MULTI_PLACE_PROMPT, intent, denverProvider);
  const visit = capture.mentions.find((mention) => mention.canonicalPlaceId === "chichen-itza");
  assert.ok(visit);
  assert.equal(visit.canonicalName, "Chichén Itzá");
  assert.equal(visit.role, "anchor");
  assert.equal(visit.routability, "anchor_or_poi");
  assert.equal(capture.mentions.some((mention) => mention.canonicalName === "Chichen-Itza"), false);
});

test("Oaxaca fixed commitment survives route projection, validation, build payload and persisted trip", () => {
  const stepOneCommitment: FixedTripCommitment = {
    id: "fixed-oaxaca",
    label: "Oaxaca",
    date: "2026-09-30",
    commitmentType: "fixed-date",
    place: {
      name: "Oaxaca",
      canonicalPlaceId: "oaxaca-city",
      country: "Mexico",
      coordinates: [-96.7266, 17.0732],
    },
  };
  assert.equal(fixedCommitmentDisplayLabel(stepOneCommitment), "Oaxaca · 30 Sept 2026");

  const cancunOnly = [{ id: "cancun", name: "Cancún", canonicalPlaceId: "cancun" }];
  const stepTwoState = projectFixedCommitmentsToStops([stepOneCommitment], cancunOnly);
  assert.equal(stepTwoState[0]?.place?.canonicalPlaceId, "oaxaca-city");
  assert.equal(stepTwoState[0]?.stopId, undefined);

  const unresolvedBrief = mergeStructuredTripBrief(extractStructuredTripBrief("Cancún"), {
    dates: { start: "2026-09-28", end: "2026-10-04", fixed: true },
    destinations: [{ id: "cancun", name: "Cancún", canonicalPlaceId: "cancun" }],
    fixedCommitments: stepTwoState,
  });
  const unresolvedConstraints = routeConstraintsFromStructuredTripBrief(unresolvedBrief, ["cancun"]);
  assert.deepEqual(unresolvedConstraints.fixedCommitments?.[0]?.place, stepOneCommitment.place);
  const unresolvedValidation = validateFinalPlan({
    plan: {
      version: 1,
      origin: { name: "Mexico City", coordinates: [-99.1332, 19.4326] },
      stops: [{ id: "cancun", name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619], nights: 6, arrivalDate: "2026-09-28", departureDate: "2026-10-04" }],
      totalNights: 6,
      startDate: "2026-09-28",
      endDate: "2026-10-04",
      constraints: unresolvedConstraints,
    },
    structuredBrief: unresolvedBrief,
  });
  const missingRouteConflict = unresolvedValidation.issues.find((issue) => issue.code === "fixed-date-conflict");
  assert.match(missingRouteConflict?.message ?? "", /Oaxaca · 30 Sept 2026 is not represented in the route/);
  assert.match(missingRouteConflict?.message ?? "", /Add Oaxaca to the route/);

  const routeStops = [
    { id: "oaxaca", name: "Oaxaca", country: "Mexico", canonicalPlaceId: "oaxaca-city", coordinates: [-96.7266, 17.0732] as [number, number] },
    { id: "cancun", name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619] as [number, number] },
  ];
  const routeCommitments = projectFixedCommitmentsToStops([stepOneCommitment], routeStops);
  assert.equal(routeCommitments[0]?.stopId, "oaxaca");
  const routeAssessment = assessRouteIntelligence({
    origin: { name: "Mexico City", coordinates: [-99.1332, 19.4326] },
    stops: routeStops,
    picks: {},
    availableDays: 7,
    constraints: { fixedCommitments: routeCommitments },
  });
  assert.equal(routeAssessment.route.state, "current-order");
  assert.match(routeAssessment.route.summary, /fixed commitments are protected/i);

  const canonicalBrief = mergeStructuredTripBrief(unresolvedBrief, {
    destinations: routeStops.map((stop) => ({ id: stop.id, name: stop.name, canonicalPlaceId: stop.canonicalPlaceId })),
    fixedCommitments: routeCommitments,
  });
  assert.equal(routeConstraintsFromStructuredTripBrief(canonicalBrief, routeStops.map((stop) => stop.id)).fixedCommitments?.[0]?.stopId, "oaxaca");
  const intent = {
    version: 1 as const,
    travellers: 2,
    timing: { flexibility: "fixed" as const, durationDays: 7 },
    hardConstraints: { originRequired: true, mustSeeStopIds: routeStops.map((stop) => stop.id), optionalStopIds: [], fixedCommitments: routeCommitments, avoidDriving: false },
    preferences: { budgetSensitivity: "mid" as const, transportModes: ["flight" as const], pace: "balanced" as const, interests: [], dislikes: [] },
  };
  const trip = tripFromBuilder({
    id: "fixed-oaxaca-trip",
    origin: "Mexico City",
    originCanonicalPlaceId: "mexico-city",
    originCountry: "Mexico",
    originCoordinates: [-99.1332, 19.4326],
    stops: routeStops,
    startDate: "2026-09-28",
    endDate: "2026-10-04",
    picks: {},
    mustDo: "Oaxaca on 30 Sep 2026",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: { oaxaca: 3, cancun: 3 },
    draft: Array.from({ length: 7 }, (_, index) => ({
      number: String(index + 1).padStart(2, "0"),
      date: new Date(Date.UTC(2026, 8, 28 + index)).toISOString().slice(0, 10),
      destination: index < 3 ? "Oaxaca" : "Cancún",
      title: index === 0 ? "Arrive in Oaxaca" : "Open day",
      reason: "Regression fixture",
      items: [],
    })),
    intent,
    structuredBrief: canonicalBrief,
  });
  const persisted = JSON.parse(JSON.stringify(trip));
  assert.equal(isEasyTTrip(persisted), true);
  assert.deepEqual(persisted.brief.intent.hardConstraints.fixedCommitments[0], routeCommitments[0]);
  assert.deepEqual(
    persisted.brief.structuredBrief.hardConstraints.find((constraint: { type: string }) => constraint.type === "fixed-commitment").place,
    stepOneCommitment.place,
  );
  assert.deepEqual(tripIntentForTrip(persisted).hardConstraints.fixedCommitments[0]?.place, stepOneCommitment.place);
});

test("Builder keeps fixed commitments visible on Step 2 with direct resolution actions", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  assert.match(builder, /projectFixedCommitmentsToStops/);
  assert.match(builder, /FIXED COMMITMENTS/);
  assert.match(builder, /Add \$\{suggestion\.name\} to route/);
  assert.match(builder, /fixedCommitments: projectedFixedCommitments/,
    "the build payload must use the same projected commitment state shown on Step 2");
});
