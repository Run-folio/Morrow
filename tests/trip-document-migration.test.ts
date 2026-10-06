import assert from "node:assert/strict";
import test from "node:test";
import { isEasyTTrip, tripIntentForTrip } from "../lib/easyt/trip.ts";
import { canonicalRouteFixture, legacyRouteFixture } from "./fixtures/batch14-route-documents.ts";
import { readTripDocument, requireReadableTripDocument, prepareTripDocumentForWrite, TripDocumentReadError } from "../lib/easyt/trip-document.ts";
import { routeNightBudget, routeProjectionInputKey, routeProjectionStatus } from "../lib/easyt/trip-route-intent.ts";

test("supported_v2_is_readable_by_compatibility_guard", () => {
  assert.equal(isEasyTTrip(canonicalRouteFixture()), true);
});

test("v1_migration_is_pure_idempotent_and_keeps_cas_token", () => {
  const original = legacyRouteFixture();
  const snapshot = structuredClone(original);
  const result = readTripDocument(original);
  assert.equal(result.kind, "readable");
  if (result.kind !== "readable") return;
  assert.equal(result.sourceSchemaVersion, 1);
  assert.equal(result.trip.schemaVersion, 2);
  assert.equal(result.trip.brief.intent.version, 2);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(result.trip.stops, original.stops);
  for (const key of ["ownerId", "createdAt", "updatedAt"] as const) assert.equal(result.trip[key], original[key]);
  assert.deepEqual(requireReadableTripDocument(result.trip), result.trip);
  assert.deepEqual(prepareTripDocumentForWrite(original), result.trip);
  assert.equal(result.trip.brief.intent.route.projectionInputKey, null);
  assert.equal(result.trip.brief.intent.route.orderAuthority, "legacy_preserved");
});

test("absent_end_remains_unknown_legacy", () => {
  const trip = requireReadableTripDocument(legacyRouteFixture());
  assert.equal(trip.brief.intent.route.tripType, "unknown_legacy");
  assert.deepEqual(trip.brief.intent.route.journeyEnd, { mode: "unknown" });
  assert.equal(routeProjectionStatus(trip), "legacy_unverified");
  const legacy = legacyRouteFixture();
  legacy.brief.journeyEnd = { mode: "same_as_start" };
  assert.equal(requireReadableTripDocument(legacy).brief.intent.route.tripType, "return_to_start");
});

test("explicit_finish_is_distinct_from_overnight_occurrence", () => {
  const legacy = legacyRouteFixture();
  legacy.brief.journeyEnd = { mode: "explicit", place: { name: "Tokyo", canonicalPlaceId: "place:tokyo" } };
  const trip = requireReadableTripDocument(legacy);
  assert.equal(trip.brief.intent.route.tripType, "one_way");
  assert.deepEqual(trip.brief.intent.route.journeyEnd, legacy.brief.journeyEnd);
  assert.equal(trip.stops.length, 3);
  assert.equal(trip.stops[0]!.nights, 4);
});

test("repeated_city_finish_and_ambiguous_commitment_are_preserved", () => {
  const legacy = legacyRouteFixture();
  legacy.stops.push({ ...legacy.stops[0]!, id: "tokyo-return", order: 3, nights: 2 });
  legacy.brief.intent!.hardConstraints.fixedCommitments.push({ id: "booking", label: "Tokyo hotel", fixedNights: 2, place: { name: "Tokyo" } });
  legacy.brief.journeyEnd = { mode: "explicit", place: { name: "Tokyo", canonicalPlaceId: "place:tokyo" } };
  const result = readTripDocument(legacy);
  assert.equal(result.kind, "readable");
  if (result.kind !== "readable") return;
  assert.deepEqual(result.trip.stops, legacy.stops);
  const intents = result.trip.brief.intent.route.destinations;
  assert.equal(new Set(intents.map(i => i.id)).size, 4);
  assert.deepEqual(intents.map(i => i.stopIds[0]), legacy.stops.map(s => s.id));
  assert.deepEqual(result.trip.brief.intent.hardConstraints.fixedCommitments, legacy.brief.intent!.hardConstraints.fixedCommitments);
  assert.ok(result.issues.some(issue => issue.code === "ambiguous_commitment_binding" && issue.severity === "blocking"));
});

test("malformed_optional_metadata_keeps_source_and_reports_issue", () => {
  const legacy = legacyRouteFixture();
  const invalid = { ...legacy, brief: { ...legacy.brief, structuredBrief: { version: 1, destinations: "broken", source: { rawPrompt: "Keep this" } } } };
  const snapshot = structuredClone(invalid);
  const result = readTripDocument(invalid);
  assert.equal(result.kind, "readable");
  if (result.kind !== "readable") return;
  assert.deepEqual(invalid, snapshot);
  assert.deepEqual(result.trip.brief.structuredBrief, invalid.brief.structuredBrief);
  assert.ok(result.issues.some(issue => issue.path === "brief.structuredBrief"));
});

test("future_version_is_unsupported_not_empty", () => {
  assert.deepEqual(readTripDocument({ ...legacyRouteFixture(), schemaVersion: 3 }), { kind: "unsupported", sourceSchemaVersion: 3 });
  assert.throws(() => requireReadableTripDocument({ ...legacyRouteFixture(), schemaVersion: 3 }), error => error instanceof TripDocumentReadError && error.code === "unsupported_trip_version");
  assert.equal(readTripDocument({ schemaVersion: 1, stops: [] }).kind, "invalid");
});

test("malformed_v2_route_is_invalid_not_legacy_migrated", () => {
  const trip = canonicalRouteFixture();
  assert.equal(readTripDocument({ ...trip, brief: { ...trip.brief, intent: { ...trip.brief.intent, route: null } } }).kind, "invalid");
  trip.brief.intent!.route!.orderedStopIds = ["missing"];
  assert.equal(readTripDocument(trip).kind, "invalid");
});

test("requested_nights_require_manual_or_captured_provenance", () => {
  const trip = requireReadableTripDocument(legacyRouteFixture());
  assert.deepEqual(trip.brief.intent.route.destinations.map(i => i.requestedNights), [null, 3, null]);
});

test("absent_intent_preserves_actual_trip_duration", () => {
  const source = legacyRouteFixture();
  delete source.brief.intent;
  assert.equal(requireReadableTripDocument(source).brief.intent.timing.durationDays, 10);
});

test("requested_area_budget_is_not_copied_per_base", () => {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  trip.brief.intent.route.destinations = [{ id: "japan", sourceText: "Japan", kind: "planning_area", selectedPlace: { name: "Japan" }, resolution: "resolved", requestedNights: 12, routeMembership: "required", stopIds: trip.stops.map(s => s.id) }];
  const budget = routeNightBudget(trip, 14);
  assert.deepEqual({ allocated: budget.allocated, held: budget.held, unallocated: budget.unallocated, overallocated: budget.overallocated }, { allocated: 9, held: 3, unallocated: 2, overallocated: 0 });
});

test("zero_requested_nights_remain_explicit", () => {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  trip.brief.intent.route.destinations[0]!.requestedNights = 0;
  assert.equal(requireReadableTripDocument(trip).brief.intent.route.destinations[0]!.requestedNights, 0);
});

test("unknown_dates_do_not_invent_available_nights", () => {
  const budget = routeNightBudget(requireReadableTripDocument(canonicalRouteFixture()), null);
  assert.equal(budget.unallocated, null);
});

test("unknown_allocated_nights_do_not_report_false_free_budget", () => {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  trip.stops[0]!.nights = null;
  const budget = routeNightBudget(trip, 14);
  assert.equal(budget.unallocated, null);
  assert.ok(budget.issues.length);
});

test("label_and_timestamp_do_not_change_projection_key", () => {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  const key = routeProjectionInputKey(trip);
  trip.updatedAt = "2099-01-01T00:00:00.000Z";
  trip.stops[0]!.name = "Tokyo renamed";
  trip.brief.intent.route.destinations[0]!.selectedPlace!.name = "Tokyo renamed";
  trip.brief.intent.route.destinations[0]!.sourceText = "Tokyo renamed";
  assert.equal(routeProjectionInputKey(trip), key);
  trip.brief.intent.route.destinations.reverse();
  assert.equal(routeProjectionInputKey(trip), key);
});

test("unresolved_source_change_invalidates_projection_key", () => {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  const intent = trip.brief.intent.route.destinations[0]!;
  intent.selectedPlace = null;
  intent.resolution = "unresolved";
  const key = routeProjectionInputKey(trip);
  intent.sourceText = "A different place";
  assert.notEqual(routeProjectionInputKey(trip), key);
});

test("relevant_input_change_marks_projection_pending", () => {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  trip.brief.intent.route.projectionInputKey = routeProjectionInputKey(trip);
  assert.equal(routeProjectionStatus(trip), "current");
  trip.brief.intent.route.destinations[0]!.requestedNights = 7;
  assert.equal(routeProjectionStatus(trip), "pending");
  trip.brief.intent.route.destinations[0]!.resolution = "unavailable";
  assert.equal(routeProjectionStatus(trip), "provisional");
});

test("v2_intent_is_not_replaced_by_default", () => {
  const trip = canonicalRouteFixture();
  const intent = tripIntentForTrip(trip);
  assert.equal(intent.version, 2);
  assert.deepEqual(intent.preferences.dislikes, ["frequent hotel changes"]);
  assert.deepEqual((intent as unknown as { route: unknown }).route, (trip.brief.intent as unknown as { route: unknown }).route);
  assert.equal("journeyEnd" in intent, false);
});
