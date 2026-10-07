import assert from "node:assert/strict";
import test from "node:test";
import { canonicalRouteFixture, legacyRouteFixture } from "./fixtures/batch14-route-documents.ts";
import { requireReadableTripDocument, projectCanonicalRouteEndpoints } from "../lib/easyt/trip-document.ts";
import { builderDocumentFingerprint } from "../lib/easyt/trip-builder-document-commit.ts";
import type { CanonicalEasyTTrip } from "../lib/easyt/trip.ts";
import { stopEndpoint } from "../lib/easyt/trip-legs.ts";
import { supportedTransportChoicesForLeg } from "../lib/easyt/transport-mode-choice.ts";

// Lazy loading lets every named contract fail explicitly at the RED checkpoint.
// Once the module exists, these tests exercise its real edits, not a fallback.
const modulePath = "../lib/easyt/trip-builder-edit.ts";
const modulePromise = import(modulePath).catch((error: NodeJS.ErrnoException) => {
  if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("trip-builder-edit.ts")) return null;
  throw error;
});
async function edits() {
  const api = await modulePromise;
  assert.ok(api, "Task 1 accepted-edit adapter is not implemented");
  assert.equal(typeof api.prepareAcceptedBuilderEdit, "function");
  return api;
}
function fixture(): CanonicalEasyTTrip {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  trip.brief.intent.route.projectionInputKey = "last-successful-projection";
  return trip;
}
function repeatedFixture(): CanonicalEasyTTrip {
  const trip = fixture();
  const second = trip.stops[2]!;
  Object.assign(second, { name: "Tokyo", canonicalPlaceId: "place:tokyo" });
  const intent = trip.brief.intent.route.destinations.find(item => item.stopIds.includes(second.id))!;
  intent.sourceText = "Tokyo";
  intent.selectedPlace = { name: "Tokyo", canonicalPlaceId: "place:tokyo" };
  return requireReadableTripDocument(trip);
}
function checkCanonical(trip: CanonicalEasyTTrip) {
  const projected = projectCanonicalRouteEndpoints(trip);
  assert.equal(requireReadableTripDocument(trip).id, trip.id);
  assert.equal(trip.brief.origin, projected.brief.origin);
  assert.deepEqual(trip.brief.journeyEnd, projected.brief.journeyEnd);
  assert.deepEqual(trip.brief.intent.route.orderedStopIds, trip.stops.map(stop => stop.id));
}

test("same_name_repeated_stop_edits_by_intent_and_stop_id", async () => {
  const api = await edits();
  const trip = repeatedFixture();
  const before = structuredClone(trip);
  const target = trip.stops[2]!;
  const intent = trip.brief.intent.route.destinations.find(item => item.stopIds.includes(target.id))!;
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "nights", stopId: target.id, intentId: intent.id, nights: 5 }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.equal(result.trip.stops[2].nights, 5);
  assert.equal(result.trip.brief.intent.route.destinations.find((item: { id: string }) => item.id === intent.id).requestedNights, 5);
  assert.deepEqual(result.trip.stops[0], before.stops[0]);
  assert.deepEqual(result.trip.brief.intent.route.destinations[0], before.brief.intent.route.destinations[0]);
  assert.deepEqual(result.trip.stops.map((stop: { id: string }) => stop.id), before.stops.map(stop => stop.id));
  assert.equal(result.trip.brief.intent.route.orderAuthority, "manual");
  assert.equal(result.trip.brief.intent.route.projectionInputKey, "last-successful-projection");
  assert.deepEqual(trip, before);
  checkCanonical(result.trip);
});

test("type_change_conflict_requires_explicit_replacement_acceptance", async () => {
  const api = await edits();
  const trip = fixture();
  // A separate Rome stay remains distinct from the explicit finish selection.
  const stay = trip.stops[2]!;
  Object.assign(stay, { name: "Rome", canonicalPlaceId: "place:rome" });
  const intent = trip.brief.intent.route.destinations[2]!;
  Object.assign(intent, { sourceText: "Rome", selectedPlace: { name: "Rome", canonicalPlaceId: "place:rome" } });
  trip.brief.intent.route.journeyEnd = { mode: "explicit", place: { name: "Rome", canonicalPlaceId: "place:rome" } };
  const current = projectCanonicalRouteEndpoints(trip);
  const before = structuredClone(current);
  const fingerprint = builderDocumentFingerprint(current);
  const rejected = api.prepareAcceptedBuilderEdit(current, { kind: "type", tripType: "return_to_start" }, fingerprint);
  assert.deepEqual(rejected, { ok: false, reason: "endpoint-conflict" });
  const accepted = api.prepareAcceptedBuilderEdit(current, { kind: "type", tripType: "return_to_start", acceptEndpointReplacement: true }, fingerprint);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.trip.brief.intent.route.journeyEnd, { mode: "same_as_start" });
  assert.equal(accepted.trip.brief.intent.route.tripType, "return_to_start");
  assert.deepEqual(accepted.trip.stops, before.stops);
  assert.deepEqual(accepted.trip.brief.intent.route.destinations, before.brief.intent.route.destinations);
  assert.deepEqual(accepted.trip.brief.bookings, before.brief.bookings);
  assert.deepEqual(current, before);
  checkCanonical(accepted.trip);
});

test("area_base_resolution_retains_parent_total_and_identity", async () => {
  const api = await edits();
  const trip = fixture();
  const route = trip.brief.intent.route;
  route.destinations = [{ id: "intent:japan", sourceText: "Japan", kind: "planning_area", selectedPlace: { name: "Japan", canonicalPlaceId: "country:japan" }, resolution: "needs_base", requestedNights: 12, routeMembership: "required", stopIds: trip.stops.map(stop => stop.id) }];
  const before = structuredClone(trip);
  const stop = { ...trip.stops[2]!, name: "Osaka", canonicalPlaceId: "place:osaka", latitude: 34.69, longitude: 135.5 };
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "resolve-destination", intentId: "intent:japan", stopId: stop.id, place: { name: "Osaka", canonicalPlaceId: "place:osaka", country: "Japan", coordinates: [135.5, 34.69] }, stop }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  const parent = result.trip.brief.intent.route.destinations[0];
  assert.equal(parent.id, "intent:japan");
  assert.equal(parent.kind, "planning_area");
  assert.equal(parent.requestedNights, 12);
  assert.deepEqual(parent.selectedPlace, before.brief.intent.route.destinations[0]!.selectedPlace);
  assert.deepEqual(parent.stopIds, before.stops.map(item => item.id));
  assert.deepEqual(result.trip.stops.slice(0, 2), before.stops.slice(0, 2));
  assert.deepEqual(trip, before);
  checkCanonical(result.trip);
});

test("legacy_unknown_is_not_default_return", async () => {
  const api = await edits();
  const source = legacyRouteFixture();
  delete source.brief.journeyEnd;
  delete source.brief.intent!.journeyEnd;
  const trip = requireReadableTripDocument(source);
  const before = structuredClone(trip);
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "budget", budget: "high" }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.equal(result.trip.brief.intent.route.tripType, "unknown_legacy");
  assert.deepEqual(result.trip.brief.journeyEnd, { mode: "unknown" });
  assert.equal(result.trip.brief.intent.route.orderAuthority, "legacy_preserved");
  assert.deepEqual(result.trip.stops, before.stops);
  assert.deepEqual(trip, before);
  checkCanonical(result.trip);
});

test("explicit_remove_releases_nights_without_redistribution", async () => {
  const api = await edits();
  const trip = fixture();
  const before = structuredClone(trip);
  const removed = trip.brief.intent.route.destinations[2]!;
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "remove-destination", intentId: removed.id }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.equal(result.releasedNights, removed.requestedNights);
  assert.deepEqual(result.trip.stops, before.stops.slice(0, 2));
  assert.deepEqual(result.trip.brief.intent.route.destinations, before.brief.intent.route.destinations.slice(0, 2));
  assert.equal(result.trip.brief.nightAllocations.tokyo, before.brief.nightAllocations!.tokyo);
  assert.equal(result.trip.brief.nightAllocations.kyoto, before.brief.nightAllocations!.kyoto);
  assert.deepEqual(result.trip.brief.bookings, before.brief.bookings);
  // Task 1 is an intermediate candidate; Task 2 owns child/leg cleanup before persistence.
  assert.deepEqual(result.trip.planItems, before.planItems);
  assert.deepEqual(trip, before);
  checkCanonical(result.trip);
});

test("stale_or_wrong_occurrence_edit_rejects_before_mutation", async () => {
  const api = await edits();
  const trip = repeatedFixture();
  const before = structuredClone(trip);
  const edit = { kind: "nights", stopId: trip.stops[0]!.id, intentId: trip.brief.intent.route.destinations[0]!.id, nights: 3 };
  assert.deepEqual(api.prepareAcceptedBuilderEdit(trip, edit, "stale"), { ok: false, reason: "stale-source" });
  assert.deepEqual(api.prepareAcceptedBuilderEdit(trip, { ...edit, intentId: trip.brief.intent.route.destinations[2]!.id }, builderDocumentFingerprint(trip)), { ok: false, reason: "binding-conflict" });
  assert.deepEqual(trip, before);
});

test("selected_origin_projects_compatibility_without_reordering", async () => {
  const api = await edits();
  const trip = fixture();
  const before = structuredClone(trip);
  const origin = { name: "Madrid", canonicalPlaceId: "place:madrid", country: "Spain", coordinates: [-3.7, 40.4] };
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "origin", place: origin }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.deepEqual(result.trip.brief.intent.route.origin, origin);
  assert.equal(result.trip.brief.origin, "Madrid");
  assert.equal(result.trip.brief.originCanonicalPlaceId, "place:madrid");
  assert.deepEqual(result.trip.stops, before.stops);
  assert.equal(result.scope.endpointChanged, true);
  assert.equal(result.trip.brief.intent.route.projectionInputKey, "last-successful-projection");
  assert.deepEqual(trip, before);
  checkCanonical(result.trip);
});

test("add_pending_destination_holds_nights_without_creating_fake_stop", async () => {
  const api = await edits();
  const trip = fixture();
  const intent = { id: "missing-mostar", sourceText: "Mostar", kind: "overnight_place", selectedPlace: null, resolution: "unavailable", requestedNights: 2, routeMembership: "required", stopIds: [] };
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "add-destination", intent }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.deepEqual(result.trip.brief.intent.route.destinations.at(-1), intent);
  assert.deepEqual(result.trip.stops, trip.stops);
  assert.equal(result.trip.brief.intent.route.orderAuthority, trip.brief.intent.route.orderAuthority);
  checkCanonical(result.trip);
});

test("resolve_pending_occurrence_reuses_owned_ids_nights_and_position", async () => {
  const api = await edits();
  const trip = fixture();
  trip.brief.intent.route.destinations.splice(1, 0, { id: "missing-mostar", sourceText: "Mostar", kind: "overnight_place", selectedPlace: null, resolution: "unavailable", requestedNights: 2, routeMembership: "required", stopIds: [] });
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "resolve-destination", intentId: "missing-mostar", stopId: "mostar-occurrence", beforeStopId: "kyoto", place: { name: "Mostar", canonicalPlaceId: "place:mostar", country: "Bosnia and Herzegovina", coordinates: [17.81, 43.34] } }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.equal(result.trip.stops[1].id, "mostar-occurrence");
  assert.equal(result.trip.stops[1].nights, 2);
  assert.deepEqual(result.trip.brief.intent.route.destinations[1].stopIds, ["mostar-occurrence"]);
  assert.equal(result.trip.brief.intent.route.destinations[1].requestedNights, 2);
  assert.deepEqual(result.trip.stops.filter((stop: { id: string }) => stop.id !== "mostar-occurrence").map((stop: { id: string }) => stop.id), trip.stops.map(stop => stop.id));
  checkCanonical(result.trip);
});

test("dates_preferences_and_travellers_change_only_owned_inputs", async () => {
  const api = await edits();
  const trip = fixture();
  for (const edit of [{ kind: "dates", startDate: "2026-11-01", endDate: "2026-11-10" }, { kind: "travellers", travellers: 3 }, { kind: "preferences", preferences: { interests: ["nature"], pace: "packed" } }]) {
    const result = api.prepareAcceptedBuilderEdit(trip, edit, builderDocumentFingerprint(trip));
    assert.equal(result.ok, true);
    assert.deepEqual(result.trip.stops, trip.stops);
    assert.deepEqual(result.trip.planItems, trip.planItems);
    assert.deepEqual(result.trip.brief.bookings, trip.brief.bookings);
    assert.deepEqual(result.trip.brief.intent.route, trip.brief.intent.route);
    if (edit.kind === "dates") assert.equal(result.trip.startDate, "2026-11-01");
    if (edit.kind === "travellers") assert.equal(result.trip.brief.intent.travellers, 3);
    if (edit.kind === "preferences") assert.deepEqual(result.trip.brief.intent.preferences.interests, ["nature"]);
  }
});

test("manual_order_and_structural_inverse_restore_authority_and_requests", async () => {
  const api = await edits();
  const trip = fixture();
  trip.brief.intent.route.orderAuthority = "explicit";
  trip.brief.intent.route.explicitIntentIds = trip.brief.intent.route.destinations.map(intent => intent.id);
  const snapshot = api.builderStructuralSnapshot(trip);
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "order", stopIds: trip.stops.map(stop => stop.id).reverse() }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.equal(result.trip.brief.intent.route.orderAuthority, "manual");
  assert.deepEqual(result.trip.stops.map((stop: { nights: number }) => stop.nights), trip.stops.map(stop => stop.nights).reverse());
  const inverse = api.prepareAcceptedBuilderEdit(result.trip, { kind: "structural-inverse", snapshot }, builderDocumentFingerprint(result.trip));
  assert.equal(inverse.ok, true);
  assert.deepEqual(inverse.trip.stops, trip.stops);
  assert.deepEqual(inverse.trip.brief.intent.route, trip.brief.intent.route);
  checkCanonical(inverse.trip);
});

test("invalid_values_and_locked_order_are_rejected_without_mutation", async () => {
  const api = await edits();
  const trip = fixture();
  trip.brief.scheduleLocks = { stopIds: [trip.stops[0]!.id], arrivalDates: {} };
  const before = structuredClone(trip);
  const fingerprint = builderDocumentFingerprint(trip);
  for (const edit of [{ kind: "nights", stopId: "tokyo", intentId: "intent:tokyo", nights: -1 }, { kind: "nights", stopId: "tokyo", intentId: "intent:tokyo", nights: 2.5 }, { kind: "dates", startDate: "2026-02-30", endDate: "2026-03-10" }, { kind: "travellers", travellers: 0 }, { kind: "budget", budget: "bogus" }, { kind: "type", tripType: "bogus" }, { kind: "preferences", preferences: { interests: ["bogus"] } }, { kind: "order", stopIds: trip.stops.map(stop => stop.id).reverse() }]) {
    assert.equal(api.prepareAcceptedBuilderEdit(trip, edit, fingerprint).ok, false);
    assert.deepEqual(trip, before);
  }
});

test("same_verified_place_label_edit_retains_evidence_and_invalidates_no_geometry", async () => {
  const api = await edits();
  const trip = fixture();
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "replace-destination", intentId: "intent:tokyo", stopId: "tokyo", place: { ...trip.brief.intent.route.destinations[0]!.selectedPlace, name: "Tokyo label" } }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.equal(result.trip.stops[0].name, "Tokyo label");
  assert.equal(result.trip.stops[0].latitude, trip.stops[0]!.latitude);
  assert.equal(result.trip.stops[0].longitude, trip.stops[0]!.longitude);
  assert.deepEqual(result.scope, { legIds: [], scheduleStopIds: [], recommendationStopIds: [], endpointChanged: false, routeAssessment: false });
});

test("gateway_scope_uses_actual_legacy_leg_ids_and_preserves_unaffected_pairs", async () => {
  const api = await edits();
  const trip = fixture();
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "replace-destination", intentId: "intent:hiroshima", stopId: "hiroshima", place: { name: "Osaka", canonicalPlaceId: "place:osaka", country: "Japan", coordinates: [135.5, 34.69] } }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.ok(result.scope.legIds.includes("kyoto-hiroshima"));
  assert.ok(!result.scope.legIds.includes("tokyo-kyoto"));
});

test("transport_choice_requires_current_geographic_evidence_not_only_occurrence_ids", async () => {
  const api = await edits();
  const trip = fixture();
  const leg = trip.legs[0]!;
  const segment = { id: "rail-segment", mode: "train", fromEndpoint: stopEndpoint(trip.stops[0]!), toEndpoint: stopEndpoint(trip.stops[1]!), durationMinutes: 210, distanceKm: 450, provider: "Fixture rail", provenance: "canonical_schedule", confidence: "high", scheduleNeedsChecking: true };
  leg.routeMetadata = { multimodalResolution: { candidates: [{ id: "rail-a", summaryMode: "train", evidence: "fixture:rail", totalDurationMinutes: 210, provenance: "canonical_schedule", segments: [segment] }] } };
  const choice = supportedTransportChoicesForLeg(trip, leg)[0]!;
  assert.ok(choice);
  const edit = { kind: "transport", legId: leg.id, identity: choice.identity };
  const selected = api.prepareAcceptedBuilderEdit(trip, edit, builderDocumentFingerprint(trip));
  assert.equal(selected.ok, true);
  assert.equal(selected.trip.brief.decisionSelections.transportByLeg[leg.id].identity, choice.identity);
  assert.deepEqual(selected.trip.legs, trip.legs);
  assert.deepEqual(selected.scope.legIds, [leg.id]);
  Object.assign(trip.stops[0]!, { name: "Osaka", canonicalPlaceId: "place:osaka", longitude: 135.5, latitude: 34.69 });
  trip.brief.intent.route.destinations[0]!.selectedPlace = { name: "Osaka", canonicalPlaceId: "place:osaka", coordinates: [135.5, 34.69] };
  assert.deepEqual(api.prepareAcceptedBuilderEdit(trip, edit, builderDocumentFingerprint(trip)), { ok: false, reason: "binding-conflict" });
});

test("new_area_base_preserves_allocation_without_replacing_parent_request", async () => {
  const api = await edits();
  const trip = fixture();
  trip.brief.intent.route.destinations = [{ id: "intent:japan", sourceText: "Japan", kind: "planning_area", selectedPlace: { name: "Japan", canonicalPlaceId: "country:japan" }, resolution: "needs_base", requestedNights: 12, routeMembership: "required", stopIds: trip.stops.map(stop => stop.id) }];
  const stop = { ...trip.stops[2]!, id: "osaka-base", nights: 3 };
  const result = api.prepareAcceptedBuilderEdit(trip, { kind: "resolve-destination", intentId: "intent:japan", stopId: stop.id, stop, beforeStopId: "hiroshima", place: { name: "Osaka", canonicalPlaceId: "place:osaka", country: "Japan", coordinates: [135.5, 34.69] } }, builderDocumentFingerprint(trip));
  assert.equal(result.ok, true);
  assert.equal(result.trip.stops.find((item: { id: string }) => item.id === stop.id).nights, 3);
  assert.equal(result.trip.brief.intent.route.destinations[0].requestedNights, 12);
  assert.equal(result.trip.brief.intent.route.destinations[0].selectedPlace.canonicalPlaceId, "country:japan");
  assert.equal(result.trip.stops.filter((item: { id: string }) => item.id !== stop.id).reduce((sum: number, item: { nights: number }) => sum + item.nights, 0), 9);
});

test("structural_inverse_keeps_unrelated_accepted_endpoint_dates_and_preferences", async () => {
  const api = await edits();
  const trip = fixture();
  const snapshot = api.builderStructuralSnapshot(trip);
  const reordered = api.prepareAcceptedBuilderEdit(trip, { kind: "order", stopIds: trip.stops.map(stop => stop.id).reverse() }, builderDocumentFingerprint(trip)).trip;
  let current = api.prepareAcceptedBuilderEdit(reordered, { kind: "origin", place: { name: "Madrid", canonicalPlaceId: "place:madrid", country: "Spain", coordinates: [-3.7, 40.4] } }, builderDocumentFingerprint(reordered)).trip;
  current = api.prepareAcceptedBuilderEdit(current, { kind: "dates", startDate: "2026-11-01", endDate: "2026-11-10" }, builderDocumentFingerprint(current)).trip;
  current = api.prepareAcceptedBuilderEdit(current, { kind: "preferences", preferences: { interests: ["nature"] }, avoidDriving: false }, builderDocumentFingerprint(current)).trip;
  const result = api.prepareAcceptedBuilderEdit(current, { kind: "structural-inverse", snapshot }, builderDocumentFingerprint(current));
  assert.equal(result.ok, true);
  assert.deepEqual(result.trip.brief.intent.route.orderedStopIds, trip.stops.map(stop => stop.id));
  assert.deepEqual(result.trip.brief.intent.route.origin, current.brief.intent.route.origin);
  assert.equal(result.trip.startDate, current.startDate);
  assert.equal(result.trip.endDate, current.endDate);
  assert.deepEqual(result.trip.brief.intent.timing, current.brief.intent.timing);
  assert.equal(result.trip.brief.intent.hardConstraints.avoidDriving, false);
  assert.deepEqual(result.trip.brief.intent.preferences, current.brief.intent.preferences);
});
