import assert from "node:assert/strict";
import test from "node:test";

import { canonicalTripForOwner, duplicateTripDocument, tripBuildDocumentsCanonicalEquivalent, tripStopReferenceInvariantIssues } from "../lib/easyt/trip-promotion.ts";
import { tripFromBuilder, type EasyTTrip } from "../lib/easyt/trip.ts";
import { requireReadableTripDocument } from "../lib/easyt/trip-document.ts";
import { routeProjectionInputKey, routeProjectionStatus } from "../lib/easyt/trip-route-intent.ts";
import { canonicalRouteFixture, legacyRouteFixture } from "./fixtures/batch14-route-documents.ts";

const testConfidence = {
  version: 1 as const, state: "estimated" as const, level: "low" as const,
  freshness: "unknown" as const, scope: "planning-rule" as const, sources: [], reason: "test",
  confirmation: { needed: false, reason: null },
};

test("promotion_remaps_route_stop_bindings_but_not_intent_or_place_ids", () => {
  const source = requireReadableTripDocument(canonicalRouteFixture());
  const intent = source.brief.intent.route.destinations[0]!;
  intent.id = source.stops[0]!.id;
  Object.assign(intent, { canonicalPlaceId: "independent:geography" });
  Object.assign(intent.selectedPlace!, { id: source.stops[0]!.id });
  source.brief.intent.route.projectionInputKey = routeProjectionInputKey(source);
  const saved = canonicalTripForOwner("owner-a", source);
  assert.equal(saved.schemaVersion, 2);
  assert.deepEqual(saved.brief.intent!.route!.orderedStopIds, saved.stops.map(stop => stop.id));
  assert.deepEqual(saved.brief.intent!.route!.destinations[0]!.stopIds, [saved.stops[0]!.id]);
  assert.equal(saved.brief.intent!.route!.destinations[0]!.id, intent.id);
  assert.deepEqual(saved.brief.intent!.route!.destinations[0]!.selectedPlace, intent.selectedPlace);
  assert.deepEqual(tripStopReferenceInvariantIssues(saved), []);
  assert.equal(routeProjectionStatus(requireReadableTripDocument(saved)), "current");
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), saved);
});

test("duplicate_preserves_unresolved_intents_nights_and_authored_items", () => {
  const source = requireReadableTripDocument(canonicalRouteFixture());
  source.brief.intent.route.destinations.push({ id: "missing", sourceText: "Mostar", kind: "overnight_place", selectedPlace: null, resolution: "unavailable", requestedNights: 2, routeMembership: "required", stopIds: [] });
  let n = 0;
  const copy = duplicateTripDocument(source, { id: "copied", now: "2026-10-12T12:00:00.000Z", nextId: () => String(++n) });
  assert.equal(copy.schemaVersion, 2);
  assert.equal(copy.brief.intent!.route!.destinations.at(-1)!.requestedNights, 2);
  assert.equal(copy.brief.intent!.route!.destinations.at(-1)!.id, "missing");
  assert.deepEqual(copy.brief.intent!.route!.orderedStopIds, copy.stops.map(stop => stop.id));
  assert.deepEqual(copy.stops.map(stop => stop.nights), source.stops.map(stop => stop.nights));
  assert.notEqual(copy.stops[0]!.id, source.stops[0]!.id);
  assert.notEqual(copy.planItems[0]!.id, source.planItems[0]!.id);
  assert.equal(copy.planItems[0]!.stopId, copy.stops[0]!.id);
  copy.brief.intent!.route!.destinations.at(-1)!.sourceText = "Edited copy";
  assert.equal(source.brief.intent.route.destinations.at(-1)!.sourceText, "Mostar");
  assert.deepEqual(tripStopReferenceInvariantIssues(copy), []);
});

test("representation_only_migration_is_canonically_equivalent", () => {
  const source = legacyRouteFixture();
  const migrated = requireReadableTripDocument(source);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(source, migrated, "owner-a"), true);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(source, canonicalTripForOwner("owner-a", migrated), "owner-a"), true);
});

test("route_authority_or_requested_nights_change_is_not_equivalent", () => {
  const source = requireReadableTripDocument(canonicalRouteFixture());
  const altered = structuredClone(source);
  altered.brief.intent.route.orderAuthority = "optimizable";
  assert.equal(tripBuildDocumentsCanonicalEquivalent(source, altered, "owner-a"), false);
  altered.brief.intent.route.orderAuthority = "manual";
  altered.brief.intent.route.destinations[0]!.requestedNights = 8;
  assert.equal(tripBuildDocumentsCanonicalEquivalent(source, altered, "owner-a"), false);
});

test("v1_namespace_normalization_does_not_invent_new_intent_identity", () => {
  const source = legacyRouteFixture();
  const namespaced = { ...source, stops: source.stops.map(stop => ({ ...stop, id: `${source.id}-stop-${stop.id}` })) };
  assert.deepEqual(requireReadableTripDocument(namespaced).brief.intent.route.destinations.map(intent => intent.id), requireReadableTripDocument(source).brief.intent.route.destinations.map(intent => intent.id));
});

test("duplicate_finish_gateway_gets_new_trip_identity_with_overnight_stay_intact", () => {
  const source = requireReadableTripDocument(canonicalRouteFixture());
  const place = { name: "Tokyo", canonicalPlaceId: "place:tokyo" };
  source.brief.intent.route.journeyEnd = { mode: "explicit", place };
  source.brief.journeyEnd = { mode: "explicit", place };
  source.legs.push({ id: "finish", fromStopId: "hiroshima", toStopId: `${source.id}-end`, mode: "unknown", distanceKm: null, durationMinutes: null, provider: null, routeMetadata: {}, toEndpoint: { kind: "end", id: `${source.id}-end`, coordinates: null, ...place } });
  let n = 0;
  const copy = duplicateTripDocument(source, { id: "copy-finish", now: source.updatedAt, nextId: () => String(++n) });
  assert.equal(copy.legs.at(-1)!.toEndpoint!.id, "copy-finish-end");
  assert.equal(copy.legs.at(-1)!.toStopId, "copy-finish-end");
  assert.equal(copy.stops.length, source.stops.length);
  assert.deepEqual(copy.brief.intent!.route!.journeyEnd, source.brief.intent.route.journeyEnd);
  assert.deepEqual(tripStopReferenceInvariantIssues(copy), []);
});

function referenceHeavyTrip(): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-remap",
    ownerId: null,
    title: "Two places",
    status: "draft",
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "Origin",
      mustDo: "Keep both stops",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: { alpha: ["Old town"], beta: ["Harbour"] },
      dayAllocations: { alpha: 3, beta: 3 },
      nightAllocations: { alpha: 2, beta: 3 },
      manualNightStopIds: ["alpha"],
      nightAllocation: {
        version: 1, configVersion: "test", state: "allocated", totalAvailableNights: 5, totalAllocatedNights: 5,
        allocations: { alpha: 2, beta: 3 },
        stops: [
          { stopId: "alpha", name: "Alpha", nights: 2, minimumNights: 1, idealNights: 2, targetNights: 2, minimumSource: "planner-fallback", idealSource: "planner-fallback", roles: [], isAnchor: true, isRequired: true, isFixed: false, transferDayLoss: null, confidence: { minimumNights: testConfidence, idealNights: testConfidence, allocation: testConfidence }, reasons: [] },
          { stopId: "beta", name: "Beta", nights: 3, minimumNights: 1, idealNights: 3, targetNights: 3, minimumSource: "planner-fallback", idealSource: "planner-fallback", roles: [], isAnchor: false, isRequired: false, isFixed: false, transferDayLoss: null, confidence: { minimumNights: testConfidence, idealNights: testConfidence, allocation: testConfidence }, reasons: [] },
        ],
        conflicts: [{ code: "one-night-anchor", severity: "warning", message: "test", stopIds: ["alpha", "beta"] }], notices: [],
      },
      scheduleLocks: { stopIds: ["alpha"], arrivalDates: { beta: "2026-10-04" } },
      intent: { version: 1, travellers: 2, timing: { flexibility: "fixed", durationDays: 7 }, hardConstraints: { originRequired: true, mustSeeStopIds: ["alpha"], optionalStopIds: ["beta"], fixedCommitments: [], avoidDriving: false }, preferences: { budgetSensitivity: "mid", transportModes: ["train"], pace: "balanced", interests: [], dislikes: [] } },
      structuredBrief: {
        version: 1, destinations: [{ id: "alpha", name: "Alpha", role: "must-visit", priority: "required", provenance: { source: "builder", kind: "explicit", confidence: "high" } }], mustVisit: [{ id: "beta", name: "Beta", role: "must-visit", priority: "required", provenance: { source: "builder", kind: "explicit", confidence: "high" } }], countries: [], preferredRegions: [], dates: {}, interests: [], transportPreferences: [], accommodationPreferences: [], hardConstraints: [], softPreferences: [], source: { inputs: ["builder"] }, confidence: "high", issues: [], placeSelections: [{ mentionId: "mention-alpha", kind: "base", selectedCanonicalPlaceId: "alpha-place", selectedName: "Alpha", routeStopId: "alpha", provenance: { id: "builder", label: "Builder", kind: "builder", supports: "traveller selection" } }],
      },
      routeAssessment: {
        route: { state: "recommendation", currentStopIds: ["alpha", "beta"], recommendedStopIds: ["beta", "alpha"], currentTransferMinutes: 300, recommendedTransferMinutes: 240, improvementMinutes: 60, reasons: [], tradeoffs: [], summary: "test", constraintIssues: [{ code: "required-stop-missing", message: "test", stopIds: ["alpha"] }], candidates: [{ stops: [{ id: "alpha", name: "Alpha", country: "A" }, { id: "beta", name: "Beta", country: "B" }], source: "existing", constraintsSatisfied: true, constraintIssues: [], metadata: { reordered: false, candidateIndex: 0, matchesOriginalOrder: true, generatedByMorrovia: true, derivedFromCurrentRouteIntelligence: true, routeComparisonAvailable: true, estimatedTransferMinutes: 300 } }] },
        durations: { alpha: { stopId: "alpha", minimumDays: 2, recommendedDays: 3, usableDays: 3, arrivalMinutes: 60, arrivalLoad: "light", reason: "test" }, beta: { stopId: "beta", minimumDays: 2, recommendedDays: 3, usableDays: 3, arrivalMinutes: 60, arrivalLoad: "light", reason: "test" } }, comfortableDays: 6, shortfallDays: 0, overload: { suggestedCutStopId: "beta", daysRecovered: 2, reason: "test" },
      },
    },
    stops: [
      { id: "alpha", order: 0, name: "Alpha", country: "A", canonicalPlaceId: "place-alpha", latitude: 1, longitude: 1, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 },
      { id: "beta", order: 1, name: "Beta", country: "B", latitude: 2, longitude: 2, arrivalDate: "2026-10-03", departureDate: "2026-10-06", nights: 3 },
    ],
    legs: [{ id: "leg", fromStopId: "alpha", toStopId: "beta", mode: "train", distanceKm: 100, durationMinutes: 120, provider: null, routeMetadata: { stopId: "beta", stopIds: ["alpha", "beta"] } }],
    planItems: [{ id: "item", stopId: "alpha", dayNumber: 1, date: "2026-10-01", type: "activity", title: "Walk", reason: "test", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    recommendations: [{ id: "recommendation", rule: "test", severity: "warning", message: "test", evidence: "test", affectedDays: [1], confidence: "high", checkedAt: "2026-01-01", proposedChange: { stopIds: ["alpha"], nested: { suggestedCutStopId: "beta" } }, status: "open" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("promotion remaps every durable nested stop reference and remains JSON-idempotent", () => {
  const canonical = canonicalTripForOwner("owner-a", referenceHeavyTrip());
  const alpha = "trip-remap-stop-alpha";
  const beta = "trip-remap-stop-beta";
  assert.deepEqual(tripStopReferenceInvariantIssues(canonical), []);
  assert.deepEqual(canonical.brief.nightAllocations, { [alpha]: 2, [beta]: 3 });
  assert.deepEqual(canonical.brief.manualNightStopIds, [alpha]);
  assert.equal(canonical.stops[0]?.canonicalPlaceId, "place-alpha");
  assert.equal(canonical.brief.nightAllocation?.stops[0]?.stopId, alpha);
  assert.deepEqual(canonical.brief.scheduleLocks, { stopIds: [alpha], arrivalDates: { [beta]: "2026-10-04" } });
  assert.deepEqual(canonical.brief.intent?.hardConstraints.mustSeeStopIds, [alpha]);
  assert.equal(canonical.brief.routeAssessment?.route.candidates?.[0]?.stops[1]?.id, beta);
  assert.deepEqual(canonical.legs[0]?.routeMetadata, { stopId: beta, stopIds: [alpha, beta] });
  assert.deepEqual(canonical.recommendations[0]?.proposedChange, { stopIds: [alpha], nested: { suggestedCutStopId: beta } });
  assert.deepEqual(canonicalTripForOwner("owner-a", canonical), canonical);
  assert.deepEqual(JSON.parse(JSON.stringify(canonical)), canonical);
});

test("duplication uses the same remapper before canonical persistence", () => {
  const source = canonicalTripForOwner("owner-a", referenceHeavyTrip());
  let sequence = 0;
  const duplicate = duplicateTripDocument(source, { id: "trip-copy", now: "2026-02-01T00:00:00.000Z", nextId: () => `n${++sequence}` });
  assert.equal(duplicate.ownerId, null);
  assert.deepEqual(tripStopReferenceInvariantIssues(duplicate), []);
  assert.equal(duplicate.brief.scheduleLocks?.stopIds[0], duplicate.stops[0]?.id);
  assert.notEqual(duplicate.stops[0]?.id, source.stops[0]?.id);
  assert.deepEqual(tripStopReferenceInvariantIssues(canonicalTripForOwner("owner-a", duplicate)), []);
});

test("builder edit round-trip preserves canonical nights, locks, intent and route intelligence", () => {
  const canonical = canonicalTripForOwner("owner-a", referenceHeavyTrip());
  const rebuilt = tripFromBuilder({
    id: canonical.id,
    origin: canonical.brief.origin,
    stops: canonical.stops.map((stop) => ({ id: stop.id, name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId, coordinates: [stop.longitude ?? 0, stop.latitude ?? 0] })),
    startDate: canonical.startDate,
    endDate: canonical.endDate,
    picks: canonical.brief.selectedPlaces,
    mustDo: canonical.brief.mustDo,
    pace: canonical.brief.pace,
    hotels: canonical.brief.hotelChanges,
    budget: canonical.brief.budgetBand,
    nightAllocations: canonical.brief.nightAllocations,
    manualNightStopIds: canonical.brief.manualNightStopIds,
    nightAllocation: canonical.brief.nightAllocation,
    scheduleLocks: canonical.brief.scheduleLocks,
    intent: canonical.brief.intent,
    structuredBrief: canonical.brief.structuredBrief,
    routeAssessment: canonical.brief.routeAssessment,
    draft: canonical.planItems.map((item) => ({ number: String(item.dayNumber), date: item.date, destination: canonical.stops.find((stop) => stop.id === item.stopId)?.name ?? "", title: item.title, reason: item.reason, items: item.notes })),
  });
  assert.deepEqual(rebuilt.brief.nightAllocations, canonical.brief.nightAllocations);
  assert.deepEqual(rebuilt.brief.manualNightStopIds, canonical.brief.manualNightStopIds);
  assert.deepEqual(rebuilt.brief.scheduleLocks, canonical.brief.scheduleLocks);
  assert.deepEqual(rebuilt.brief.intent, canonical.brief.intent);
  assert.deepEqual(rebuilt.brief.routeAssessment, canonical.brief.routeAssessment);
  assert.equal(rebuilt.stops[0]?.canonicalPlaceId, "place-alpha");
  assert.deepEqual(tripStopReferenceInvariantIssues(rebuilt), []);
});
