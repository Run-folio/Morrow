import assert from "node:assert/strict";
import test from "node:test";

import { createPlanningConfidence } from "../lib/easyt/planning-confidence.ts";
import type { PlaceResolutionIssue, ResolvedPlaceMention } from "../lib/easyt/place-intelligence.ts";
import type { StructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { reviewTrip } from "../lib/easyt/review.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";

const confidence = createPlanningConfidence({
  state: "inferred",
  level: "high",
  freshness: "current",
  scope: "general-route",
  sources: [],
  reason: "Provider-confirmed protected area.",
});

const provider = {
  id: "provider:kruger-national-park",
  label: "Controlled global place provider",
  kind: "provider" as const,
  supports: "Provider-confirmed protected area identity and coordinates.",
};

const krugerMention: ResolvedPlaceMention = {
  mentionId: "place-kruger-national-park",
  sourceText: "Kruger National Park",
  sourceTexts: ["Kruger National Park"],
  normalizedPhrase: "kruger national park",
  canonicalName: "Kruger National Park",
  canonicalPlaceId: "provider:kruger-national-park",
  aliases: [],
  placeType: "natural_area",
  status: "resolved",
  confidence,
  provenance: [provider],
  parentCountries: ["South Africa"],
  parentRegionId: "Mpumalanga",
  accessPlaceName: "Hazyview",
  coordinates: [31.485, -24.994],
  routability: "needs_base_selection",
  directlyRoutable: false,
  requiresBaseSelection: true,
  isAnchor: true,
  role: "preferred",
  order: 2,
  candidates: [],
};

const krugerIssue: PlaceResolutionIssue = {
  code: "region_requires_base",
  mentionId: krugerMention.mentionId,
  canonicalPlaceId: krugerMention.canonicalPlaceId,
  sourceText: krugerMention.sourceText,
  reason: "The protected area needs a verified overnight base.",
  message: "Choose where to stay for Kruger National Park before Morrovia adds it to the route.",
  severity: "error",
  blocksRoute: true,
  options: [{
    kind: "base",
    canonicalPlaceId: "provider:hazyview",
    label: "Hazyview",
    country: "South Africa",
    region: "Mpumalanga",
    placeType: "town",
    coordinates: [31.131, -25.043],
    provenance: [provider],
  }],
  provenance: [provider],
  confidence,
};

function structuredBrief(): StructuredTripBrief {
  return {
    version: 1,
    destinations: [],
    mustVisit: [],
    countries: [],
    preferredRegions: [],
    dates: {},
    interests: [],
    transportPreferences: [],
    accommodationPreferences: [],
    hardConstraints: [],
    softPreferences: [],
    source: { rawPrompt: "Kruger National Park", parserVersion: "fixture", inputs: ["prompt"] },
    confidence: "high",
    issues: [],
    placeMentions: [krugerMention],
    placeIssues: [krugerIssue],
    placeSelections: [],
    completedPlanningAreaMentionIds: [],
    removedPlaceMentionIds: [],
  };
}

function trip(brief = structuredBrief()): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-unresolved-intent",
    ownerId: null,
    title: "South Africa",
    status: "planned",
    startDate: "2027-05-01",
    endDate: "2027-05-04",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "Johannesburg",
      mustDo: "Kruger National Park",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: { capeTown: [] },
      structuredBrief: brief,
    },
    stops: [{
      id: "capeTown",
      order: 0,
      name: "Cape Town",
      country: "South Africa",
      canonicalPlaceId: "cape-town",
      latitude: -33.9249,
      longitude: 18.4241,
      arrivalDate: "2027-05-01",
      departureDate: "2027-05-04",
      nights: 3,
    }],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
  };
}

test("projects retained unresolved place truth without creating a route stop", async () => {
  const module = await import("../lib/easyt/unresolved-place-intent.ts").catch(() => ({}));
  const project = (module as { unresolvedPlaceIntentsForTrip?: (trip: EasyTTrip) => Array<{
    mention: ResolvedPlaceMention;
    issue: PlaceResolutionIssue;
  }> }).unresolvedPlaceIntentsForTrip;

  assert.equal(typeof project, "function");
  if (!project) return;

  const intents = project(trip());
  assert.equal(intents.length, 1);
  assert.equal(intents[0]?.mention, krugerMention);
  assert.equal(intents[0]?.issue, krugerIssue);
  assert.equal(intents[0]?.mention.sourceText, "Kruger National Park");
  assert.deepEqual(intents[0]?.mention.coordinates, [31.485, -24.994]);
  assert.equal(intents[0]?.mention.parentRegionId, "Mpumalanga");
  assert.equal(intents[0]?.mention.accessPlaceName, "Hazyview");
  assert.equal(intents[0]?.issue.reason, "The protected area needs a verified overnight base.");
  assert.equal(intents[0]?.issue.options[0]?.canonicalPlaceId, "provider:hazyview");
  assert.equal(trip().stops.some((stop) => stop.canonicalPlaceId === krugerMention.canonicalPlaceId), false);

  const duplicateIssueBrief = structuredBrief();
  duplicateIssueBrief.placeIssues = [krugerIssue, { ...krugerIssue, code: "unresolved_place" }];
  assert.equal(project(trip(duplicateIssueBrief)).length, 1);
});

test("a successful canonical base selection resolves only its exact retained mention", async () => {
  const module = await import("../lib/easyt/unresolved-place-intent.ts");
  const project = module.unresolvedPlaceIntentsForTrip;
  const selectedBrief: StructuredTripBrief = {
    ...structuredBrief(),
    placeSelections: [{
      mentionId: krugerMention.mentionId,
      kind: "base",
      selectedCanonicalPlaceId: "provider:hazyview",
      selectedName: "Hazyview",
      selectedPlaceType: "town",
      selectedParentCountries: ["South Africa"],
      routeStopId: "hazyview-occurrence",
      provenance: provider,
    }],
  };
  const resolved = trip(selectedBrief);
  resolved.stops.push({
    id: "hazyview-occurrence",
    order: 1,
    name: "Hazyview",
    country: "South Africa",
    canonicalPlaceId: "provider:hazyview",
    latitude: -25.043,
    longitude: 31.131,
    arrivalDate: "2027-05-04",
    departureDate: "2027-05-05",
    nights: 1,
  });

  assert.deepEqual(project(resolved), []);

  const failedRecovery = trip(selectedBrief);
  assert.deepEqual(project(failedRecovery).map((intent) => intent.mention.mentionId), [krugerMention.mentionId]);
});

test("dismissal is an explicit durable structured-brief mutation and never creates or removes a stop", async () => {
  const module = await import("../lib/easyt/unresolved-place-intent.ts");
  const dismiss = (module as typeof module & {
    dismissUnresolvedPlaceIntent?: (trip: EasyTTrip, mentionId: string) => EasyTTrip;
  }).dismissUnresolvedPlaceIntent;

  assert.equal(typeof dismiss, "function");
  if (!dismiss) return;

  const before = trip();
  const dismissed = dismiss(before, krugerMention.mentionId);
  assert.notEqual(dismissed, before);
  assert.deepEqual(dismissed.stops, before.stops);
  assert.deepEqual(dismissed.brief.structuredBrief?.placeMentions, before.brief.structuredBrief?.placeMentions);
  assert.deepEqual(dismissed.brief.structuredBrief?.placeIssues, before.brief.structuredBrief?.placeIssues);
  assert.deepEqual(dismissed.brief.structuredBrief?.removedPlaceMentionIds, [krugerMention.mentionId]);
  assert.deepEqual(module.unresolvedPlaceIntentsForTrip(dismissed), []);

  const reloaded = JSON.parse(JSON.stringify(dismissed)) as EasyTTrip;
  assert.deepEqual(module.unresolvedPlaceIntentsForTrip(reloaded), []);
  assert.deepEqual(reloaded.brief.structuredBrief?.removedPlaceMentionIds, [krugerMention.mentionId]);
  assert.equal(dismiss(before, "different-occurrence"), before);
});

test("the Overview recovery projection suppresses only its matching generic place warning", async () => {
  const module = await import("../lib/easyt/unresolved-place-intent.ts");
  const represented = (module as typeof module & {
    recommendationIsRepresentedByUnresolvedPlaceIntent?: (
      recommendation: ReturnType<typeof reviewTrip>[number],
      intents: ReturnType<typeof module.unresolvedPlaceIntentsForTrip>,
    ) => boolean;
  }).recommendationIsRepresentedByUnresolvedPlaceIntent;
  assert.equal(typeof represented, "function");
  if (!represented) return;

  const unresolvedTrip = trip();
  const intents = module.unresolvedPlaceIntentsForTrip(unresolvedTrip);
  const recommendations = reviewTrip(unresolvedTrip);
  const placeIssue = recommendations.find((recommendation) => recommendation.rule.includes("region-requires-base"));
  assert.ok(placeIssue);
  assert.equal(represented(placeIssue, intents), true);

  const unrelated = { ...placeIssue, proposedChange: { action: "resolve-place-intent", mentionId: "another-occurrence" } };
  assert.equal(represented(unrelated, intents), false);
});

test("guest-to-account promotion preserves unresolved and explicitly dismissed states", async () => {
  const module = await import("../lib/easyt/unresolved-place-intent.ts");
  const unresolved = canonicalTripForOwner("owner-a", trip());
  assert.deepEqual(module.unresolvedPlaceIntentsForTrip(unresolved).map((intent) => intent.mention.mentionId), [krugerMention.mentionId]);

  const dismissedGuest = module.dismissUnresolvedPlaceIntent(trip(), krugerMention.mentionId);
  const dismissedAccount = canonicalTripForOwner("owner-a", dismissedGuest);
  assert.deepEqual(module.unresolvedPlaceIntentsForTrip(dismissedAccount), []);
  assert.deepEqual(dismissedAccount.brief.structuredBrief?.removedPlaceMentionIds, [krugerMention.mentionId]);
});

export { krugerIssue, krugerMention, structuredBrief, trip };
