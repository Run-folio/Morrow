import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { createHomeTripDraft, handoffStopOccurrenceId, type HomeTripDraft } from "../lib/easyt/home-trip-handoff.ts";
import { routeIntentFromHandoff, routeOrderReviewIssue, applyHandoffRouteResolution, routeNightBudget } from "../lib/easyt/trip-route-intent.ts";
import { requireReadableTripDocument } from "../lib/easyt/trip-document.ts";
import type { TripStop } from "../lib/easyt/trip.ts";
import { canonicalRouteFixture } from "./fixtures/batch14-route-documents.ts";

function intake(names: string[], nights: number[], unresolvedIndex = -1, prompt = names.join(", ")) {
  const capture = captureJourneyBrief("Tokyo and Kyoto");
  const base = capture.mentions.find(mention => mention.canonicalName === "Tokyo")!;
  const mentions = names.map((name, index) => ({
    ...structuredClone(base), mentionId: `input-${index}`, order: index + 1,
    sourceText: name, sourceTexts: [name], canonicalName: name, normalizedPhrase: name.toLocaleLowerCase(),
    canonicalPlaceId: index === unresolvedIndex ? undefined : `place:${name}`, coordinates: index === unresolvedIndex ? undefined : [index + 1, index + 2] as [number, number],
    parentCountries: ["Fixture country"], role: "preferred" as const,
    status: index === unresolvedIndex ? "unresolved" as const : "resolved" as const,
    directlyRoutable: index !== unresolvedIndex, placeType: "city" as const,
  }));
  const stops: TripStop[] = mentions.flatMap((mention, index) => index === unresolvedIndex ? [] : [{
    id: handoffStopOccurrenceId(mention, {}), name: mention.canonicalName, country: "Fixture country",
    canonicalPlaceId: mention.canonicalPlaceId, order: index, nights: nights[index]!,
    latitude: index + 2, longitude: index + 1, arrivalDate: null, departureDate: null,
  }]);
  const structured = structuredClone(capture.structuredBrief);
  structured.placeMentions = mentions;
  structured.source.rawPrompt = prompt;
  structured.hardConstraints = mentions.map((mention, index) => ({
    type: "fixed-commitment", value: `${mention.canonicalName} stay`,
    place: { name: mention.canonicalName, canonicalPlaceId: mention.canonicalPlaceId }, fixedNights: nights[index],
    provenance: { source: "prompt", kind: "explicit", confidence: "high", sourceText: `${mention.sourceText} ${nights[index]} nights` },
  }));
  const draft: HomeTripDraft = { brief: prompt, locationMentions: mentions, structuredBrief: structured, journeyEnd: { mode: "unknown" } };
  return { draft, stops };
}

function tripFor(draft: HomeTripDraft, stops: TripStop[]) {
  const trip = canonicalRouteFixture();
  trip.stops = stops;
  trip.brief.intent!.route = routeIntentFromHandoff(draft, stops);
  trip.brief.structuredBrief = draft.structuredBrief;
  trip.brief.capturedIntent = { originalBrief: draft.brief ?? "", regions: [], routeHints: [], mentions: [] };
  return requireReadableTripDocument(trip);
}

test("chip_sequence_does_not_set_explicit_authority", () => {
  const { draft, stops } = intake(["Tokyo", "Kyoto"], [4, 3]);
  draft.homepage = { version: 1, ownerId: "owner-a", revision: 1, mode: "stops", occurrenceMentionIds: {}, choices: { dates: { state: "untouched" }, budget: { state: "untouched" }, interests: { state: "untouched" }, travellers: { state: "untouched" }, origin: { state: "untouched" }, journeyEnd: { state: "untouched" } } };
  draft.brief = "Tokyo then Kyoto"; // Structured chips' incidental serialization is not textual authority.
  const route = routeIntentFromHandoff(draft, stops);
  assert.equal(route.orderAuthority, "optimizable");
  assert.equal(route.explicitIntentIds, null);
  assert.equal(routeOrderReviewIssue(tripFor(draft, stops)), null);
});

test("explicit_itinerary_sets_authority_without_reordering", () => {
  const { draft, stops } = intake(["Tokyo", "Kyoto"], [4, 3], -1, "First Tokyo, then Kyoto");
  const route = routeIntentFromHandoff(draft, stops);
  assert.equal(route.orderAuthority, "explicit");
  assert.deepEqual(route.explicitIntentIds, ["input-0", "input-1"]);
  assert.deepEqual(route.orderedStopIds, stops.map(stop => stop.id));
});

test("unrelated_first_then_instructions_do_not_make_wishlist_explicit", () => {
  const { draft, stops } = intake(["Tokyo", "Kyoto"], [4, 3], -1, "Tokyo and Kyoto are my wishlist. First check prices then book hotels.");
  assert.equal(routeIntentFromHandoff(draft, stops).orderAuthority, "optimizable");
});

test("negated_sequence_requires_review_instead_of_false_explicit_order", () => {
  const { draft, stops } = intake(["Tokyo", "Kyoto"], [4, 3], -1, "Tokyo then Kyoto, not necessarily in that order");
  assert.equal(routeIntentFromHandoff(draft, stops).orderAuthority, "optimizable");
  assert.equal(routeOrderReviewIssue(tripFor(draft, stops))?.code, "route_order_requires_clarification");
});

test("ambiguous_order_preserves_source_without_explicit_provenance", () => {
  const { draft, stops } = intake(["Tokyo", "Kyoto"], [4, 3], -1, "Maybe Tokyo then Kyoto, or the other way around");
  const route = routeIntentFromHandoff(draft, stops);
  assert.equal(route.orderAuthority, "optimizable");
  assert.equal(route.explicitIntentIds, null);
  assert.deepEqual(route.orderedStopIds, stops.map(stop => stop.id));
  assert.equal(routeOrderReviewIssue(tripFor(draft, stops))?.code, "route_order_requires_clarification");
});

test("ambiguous_order_review_survives_reload", () => {
  const { draft, stops } = intake(["Tokyo", "Kyoto"], [4, 3], -1, "Maybe Tokyo then Kyoto, or the other way around");
  const trip = tripFor(draft, stops);
  assert.deepEqual(routeOrderReviewIssue(requireReadableTripDocument(JSON.parse(JSON.stringify(trip)))), routeOrderReviewIssue(trip));
  assert.ok(routeOrderReviewIssue(trip));
});

test("planning_area_keeps_parent_and_selected_bases", () => {
  const { draft, stops } = intake(["Paris", "Lyon"], [3, 4]);
  const parent = { ...draft.locationMentions![0]!, mentionId: "france", canonicalName: "France", sourceText: "France", placeType: "country" as const, routability: "planning_area" as const, directlyRoutable: false, requiresBaseSelection: true };
  draft.locationMentions = [parent];
  draft.structuredBrief!.placeMentions = [parent];
  draft.structuredBrief!.hardConstraints = [{ type: "fixed-commitment", value: "France stay", place: { name: "France" }, fixedNights: 9, provenance: { source: "prompt", kind: "explicit", confidence: "high" } }];
  draft.structuredBrief!.placeSelections = stops.map(stop => ({ mentionId: "france", kind: "base", selectedCanonicalPlaceId: stop.canonicalPlaceId!, selectedName: stop.name, routeStopId: stop.id, provenance: { id: stop.id, label: "Selected", kind: "builder", supports: "Traveller choice" } }));
  const route = routeIntentFromHandoff(draft, stops);
  assert.equal(route.destinations.length, 1);
  assert.equal(route.destinations[0]!.id, "france");
  assert.equal(route.destinations[0]!.kind, "planning_area");
  assert.equal(route.destinations[0]!.requestedNights, 9);
  assert.deepEqual(route.destinations[0]!.stopIds, stops.map(stop => stop.id));
  assert.equal(routeNightBudget(tripFor(draft, stops), 9).held, 2);
});

test("poi_stays_in_activity_capture", () => {
  const { draft, stops } = intake(["Tokyo", "Kyoto"], [4, 3]);
  draft.locationMentions!.push({ ...draft.locationMentions![0]!, mentionId: "poi", canonicalName: "Temple", sourceText: "Temple", placeType: "landmark", role: "anchor", routability: "anchor_or_poi", isAnchor: true });
  const route = routeIntentFromHandoff(draft, stops);
  assert.deepEqual(route.destinations.map(intent => intent.id), ["input-0", "input-1"]);
  assert.equal(draft.locationMentions!.length, 3);
});

test("planning_area_source_nights_are_held_without_city_only_commitment", () => {
  const { draft } = intake(["France"], [9], 0, "12 nights: France 9, Spain 3");
  draft.locationMentions![0]!.placeType = "country";
  draft.locationMentions![0]!.requiresBaseSelection = true;
  draft.structuredBrief!.hardConstraints = [];
  draft.structuredBrief!.duration = { value: 12, unit: "nights", precision: "exact", provenance: { source: "prompt", kind: "explicit", confidence: "high" } };
  const route = routeIntentFromHandoff(draft, []);
  assert.equal(route.destinations[0]!.requestedNights, 9);
  assert.equal(route.destinations[0]!.resolution, "needs_base");
});

test("empty_timeout_error_then_selection_retains_original_intent", () => {
  const { draft, stops } = intake(["Tokyo", "Missing place"], [4, 2], 1);
  const original = routeIntentFromHandoff(draft, stops);
  const scope = { ownerId: "owner-a", tripId: "trip-a", inputRevision: 1 };
  for (const status of ["empty", "timeout", "error", "ambiguous", "needs_base"] as const) {
    const route = applyHandoffRouteResolution({ route: original, intentId: "input-1", expectedScope: scope, currentScope: scope, outcome: { status } });
    assert.equal(route.destinations[1]!.resolution, status === "empty" ? "unresolved" : status === "timeout" || status === "error" ? "unavailable" : status);
    const selected = applyHandoffRouteResolution({ route, intentId: "input-1", expectedScope: scope, currentScope: scope, outcome: { status: "selected", place: { name: "Missing place", canonicalPlaceId: "selected:place" }, stopId: "selected-occurrence" } });
    assert.equal(selected.destinations[1]!.id, "input-1");
    assert.equal(selected.destinations[1]!.requestedNights, 2);
    assert.deepEqual(selected.destinations[1]!.stopIds, ["selected-occurrence"]);
    assert.equal(selected.destinations.length, 2);
    assert.deepEqual(original.destinations[1]!.stopIds, []);
  }
});

test("removed_or_selected_intent_ignores_late_resolution", () => {
  const { draft, stops } = intake(["Tokyo", "Missing place"], [4, 2], 1);
  const route = routeIntentFromHandoff(draft, stops);
  const scope = { ownerId: "owner-a", tripId: "trip-a", inputRevision: 1 };
  const input = { route, intentId: "input-1", expectedScope: scope, currentScope: scope, outcome: { status: "selected" as const, place: { name: "Selected", canonicalPlaceId: "chosen" }, stopId: "selected" } };
  for (const currentScope of [{ ...scope, inputRevision: 2 }, { ...scope, ownerId: "owner-b" }, { ...scope, tripId: "trip-b" }]) assert.equal(applyHandoffRouteResolution({ ...input, currentScope }), route);
  const removed = { ...route, destinations: route.destinations.slice(0, 1) };
  assert.equal(applyHandoffRouteResolution({ ...input, route: removed }), removed);
  const selected = applyHandoffRouteResolution(input);
  assert.equal(applyHandoffRouteResolution({ ...input, route: selected, outcome: { status: "empty" } }), selected);
});

test("home_draft_carries_canonical_intent_before_builder_filters", () => {
  const capture = captureJourneyBrief("Tokyo 4 nights then Kyoto 3 nights");
  const draft = createHomeTripDraft({ capture, handoffId: "handoff", datesExplicit: false, startDate: "", endDate: "", travellers: 2, travellersExplicit: false, interests: [] });
  assert.ok(draft.routeIntent);
  assert.equal(draft.routeIntent!.destinations.length, 2);
  assert.deepEqual(draft.routeIntent!.destinations.map(intent => intent.requestedNights), [4, 3]);
});

for (const [name, names, nights, index, held] of [
  ["mostar_retention_is_not_resolution", ["Ljubljana", "Zagreb", "Split", "Mostar", "Kotor", "Dubrovnik"], [2, 2, 3, 2, 3, 4], 3, 2],
  ["san_pedro_empty_lookup_holds_three_nights", ["Lima", "Cusco", "La Paz", "Uyuni", "San Pedro de Atacama", "Santiago"], [2, 4, 3, 2, 3, 4], 4, 3],
] as const) test(name, () => {
  const { draft, stops } = intake([...names], [...nights], index);
  const trip = tripFor(draft, stops);
  assert.equal(trip.brief.intent.route.destinations.length, 6);
  assert.equal(trip.stops.length, 5);
  assert.equal(routeNightBudget(trip, nights.reduce((sum, n) => sum + n, 0)).held, held);
  const reloaded = requireReadableTripDocument(JSON.parse(JSON.stringify(trip)));
  assert.equal(reloaded.brief.intent.route.destinations[index]!.requestedNights, held);
  assert.equal(reloaded.brief.intent.route.destinations[index]!.resolution, "unresolved");
  const scope = { ownerId: "owner-a", tripId: trip.id, inputRevision: 1 };
  const mention = draft.locationMentions![index]!;
  const id = handoffStopOccurrenceId(mention, {});
  const recoveredRoute = applyHandoffRouteResolution({ route: reloaded.brief.intent.route, intentId: mention.mentionId,
    expectedScope: scope, currentScope: scope, outcome: { status: "selected", place: { name: names[index]!, canonicalPlaceId: `place:${names[index]}` }, stopId: id } });
  const recoveredStops = [...stops];
  recoveredStops.splice(index, 0, { id, name: names[index]!, country: "Fixture country", canonicalPlaceId: `place:${names[index]}`, order: index, nights: held, latitude: index + 2, longitude: index + 1, arrivalDate: null, departureDate: null });
  draft.routeIntent = recoveredRoute;
  const recovered = tripFor(draft, recoveredStops);
  const saved = requireReadableTripDocument(JSON.parse(JSON.stringify(recovered)));
  assert.equal(saved.stops.length, 6);
  assert.equal(saved.brief.intent.route.destinations[index]!.id, mention.mentionId);
  assert.equal(saved.brief.intent.route.destinations[index]!.resolution, "resolved");
  assert.equal(saved.brief.intent.route.destinations[index]!.requestedNights, held);
  assert.deepEqual(saved.stops.map(stop => stop.nights), [...nights]);
  assert.equal(routeNightBudget(saved, nights.reduce((sum, n) => sum + n, 0)).held, 0);
});

test("legacy_structured_unresolved_intent_keeps_stable_id_and_requested_nights", () => {
  const { draft, stops } = intake(["Tokyo", "Mostar"], [4, 2], 1);
  const source = tripFor(draft, stops);
  const { route: _route, ...intent } = source.brief.intent;
  const legacy = { ...source, schemaVersion: 1, brief: { ...source.brief, intent: { ...intent, version: 1 } } };
  const migrated = requireReadableTripDocument(legacy);
  const held = migrated.brief.intent.route.destinations.find(intent => intent.id === "input-1");
  assert.equal(held?.requestedNights, 2);
  assert.equal(held?.resolution, "unresolved");
  assert.equal(routeNightBudget(migrated, 6).held, 2);
  assert.deepEqual(migrated.stops, source.stops);
  assert.equal(migrated.brief.intent.route.orderAuthority, "legacy_preserved");
});

test('first_then_finally_and_finish_sequences_protect_authoritative_order',()=>{
 for(const prompt of ['First Tokyo, then Kyoto, finally Hiroshima','First Tokyo, then Kyoto, finish in Hiroshima']){const {draft,stops}=intake(['Tokyo','Kyoto','Hiroshima'],[4,3,2],-1,prompt);assert.equal(routeIntentFromHandoff(draft,stops).orderAuthority,'explicit');}
});
test('replaced_area_bases_keep_parent_and_budget_without_guessing_new_bindings',()=>{
 const {draft,stops}=intake(['Paris','Lyon'],[3,4]);const route=routeIntentFromHandoff(draft,stops);route.destinations=[{id:'france',sourceText:'France',kind:'planning_area',selectedPlace:{name:'France'},resolution:'resolved',requestedNights:9,routeMembership:'required',stopIds:stops.map(stop=>stop.id)}];
 const replaced=stops.map(stop=>({...stop,id:'new-'+stop.id}));const next=routeIntentFromHandoff({routeIntent:route},replaced);const parent=next.destinations.find(intent=>intent.id==='france');assert.ok(parent);assert.equal(parent.requestedNights,9);assert.equal(parent.resolution,'needs_base');assert.deepEqual(parent.stopIds,[]);
});

test('ordinal_or_finish_order_hints_require_review_when_not_fully_proven',()=>{
 const {draft,stops}=intake(['Tokyo','Kyoto'],[4,3],-1,'First Tokyo, Kyoto second, finish in Osaka');const trip=tripFor(draft,stops);
 assert.ok(trip.brief.intent.route.orderAuthority==='explicit'||routeOrderReviewIssue(trip));
});
