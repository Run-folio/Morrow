import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { builderStructuralSnapshot } from '../lib/easyt/trip-builder-edit.ts';
import { extractStructuredTripBrief } from '../lib/easyt/structured-trip-brief.ts';
import {createDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import { builderDetailsFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
const path = '../lib/easyt/trip-builder-handler-contract.ts';
const loaded = import(path).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ERR_MODULE_NOT_FOUND') return null; throw e; });
async function api(): Promise<typeof import('../lib/easyt/trip-builder-handler-contract.ts')> {
  const value = await loaded; assert.ok(value, 'Builder handler contract missing'); return value;
}
const fixture = () => requireReadableTripDocument(canonicalRouteFixture());
test('discovery_choices_are_durable_without_replacing_route_or_future_drafts',async()=>{
  const trip=fixture();trip.brief.structuredBrief=extractStructuredTripBrief('Japan');const mentionId=trip.brief.structuredBrief.placeMentions![0]!.mentionId;
  const draft={...createDiscoveryDraft(),shortlistIds:['place:kyoto']};
  const result=(await api()).prepareBuilderHandlerEdit(trip,{kind:'discovery-state',mentionId,draft,choiceIds:['place:kyoto']},builderDocumentFingerprint(trip));assert.ok(result.ok);
  assert.deepEqual(result.trip.brief.structuredBrief!.discoveryDraftByMentionId![mentionId],draft);assert.deepEqual(result.trip.brief.intent.route,trip.brief.intent.route);
  result.trip.brief.structuredBrief!.discoveryDraftByMentionId![mentionId]={...draft,version:99} as unknown as typeof draft;
  assert.equal((await api()).prepareBuilderHandlerEdit(result.trip,{kind:'discovery-state',mentionId,draft},builderDocumentFingerprint(result.trip)).ok,false);
});
test('origin_base_selection_binds_verified_origin_without_creating_destination_stay',async()=>{
  const trip=fixture();trip.brief.structuredBrief=extractStructuredTripBrief('Japan');
  trip.brief.structuredBrief.placeMentions![0]!.role='origin';
  const mention=trip.brief.structuredBrief.placeMentions!.find(m=>m.role==='origin')!;assert.ok(mention);
  const place={name:'Kyoto',canonicalPlaceId:'place:kyoto',country:'Japan',coordinates:[135.7681,35.0116] as [number,number]};
  const selection={mentionId:mention.mentionId,kind:'base' as const,selectedCanonicalPlaceId:place.canonicalPlaceId,selectedName:place.name,selectedPlaceType:'city' as const,selectedParentCountries:['Japan'],provenance:{id:'origin-choice',kind:'builder' as const,label:'Origin',supports:'Selected'}};
  const result=(await api()).prepareBuilderHandlerEdits(trip,[{kind:'origin',place},{kind:'planning-selection',selection}],builderDocumentFingerprint(trip));assert.ok(result.ok);
  assert.deepEqual(result.trip.stops.map(s=>s.id),trip.stops.map(s=>s.id));assert.equal(result.trip.brief.structuredBrief!.placeSelections![0]!.routeStopId,undefined);
});
test('transient_planning_mention_is_canonical_and_cancel_cannot_erase_committed_selections',async()=>{
  const trip=fixture();trip.brief.structuredBrief=extractStructuredTripBrief('');
  const mention=extractStructuredTripBrief('Japan').placeMentions![0]!;
  const added=(await api()).prepareBuilderHandlerEdit(trip,{kind:'planning-mention',mention,action:'add'},builderDocumentFingerprint(trip));assert.ok(added.ok);
  assert.deepEqual(added.trip.brief.structuredBrief!.placeMentions,JSON.parse(JSON.stringify([mention])));
  const cancelled=(await api()).prepareBuilderHandlerEdit(added.trip,{kind:'planning-mention',mention,action:'cancel'},builderDocumentFingerprint(added.trip));assert.ok(cancelled.ok);assert.deepEqual(cancelled.trip.brief.structuredBrief!.placeMentions,[]);
  added.trip.brief.structuredBrief!.placeSelections=[{mentionId:mention.mentionId,kind:'base',selectedCanonicalPlaceId:trip.stops[1]!.canonicalPlaceId!,selectedName:'Kyoto',selectedPlaceType:'city',selectedParentCountries:['Japan'],routeStopId:'kyoto',provenance:{id:'selection',label:'Selected',kind:'builder',supports:'Chosen'}}];
  assert.equal((await api()).prepareBuilderHandlerEdit(added.trip,{kind:'planning-mention',mention,action:'cancel'},builderDocumentFingerprint(added.trip)).ok,false);
});
test('date_inverse_owns_dates_only_when_the_captured_action_changed_them', async () => {
  const trip=fixture(), snapshot=builderStructuralSnapshot(trip);
  const changed=(await api()).prepareBuilderHandlerEdit(trip,{kind:'dates',startDate:'2026-11-01',endDate:'2026-11-14'},builderDocumentFingerprint(trip)); assert.ok(changed.ok);
  const ordinary=(await api()).prepareBuilderHandlerEdit(changed.trip,{kind:'structural-inverse',snapshot},builderDocumentFingerprint(changed.trip)); assert.ok(ordinary.ok); assert.equal(ordinary.trip.startDate,'2026-11-01');
  const owned=(await api()).prepareBuilderHandlerEdit(changed.trip,{kind:'structural-inverse',snapshot,restoreDates:true},builderDocumentFingerprint(changed.trip)); assert.ok(owned.ok);
  assert.equal(owned.trip.startDate,trip.startDate); assert.equal(owned.trip.endDate,trip.endDate); assert.deepEqual(owned.trip.brief.intent.timing,trip.brief.intent.timing);
});
test('planning_area_complete_reopen_and_remove_are_durable_exact_commands', async () => {
  const trip=fixture();trip.brief.structuredBrief=extractStructuredTripBrief('Japan');
  const mention=trip.brief.structuredBrief.placeMentions![0]!;
  trip.brief.structuredBrief.placeSelections=[{mentionId:mention.mentionId,kind:'base',selectedCanonicalPlaceId:trip.stops[1]!.canonicalPlaceId!,selectedName:'Kyoto',selectedPlaceType:'city',selectedParentCountries:['Japan'],routeStopId:'kyoto',provenance:{id:'selected-kyoto',label:'Chosen',kind:'builder',supports:'Selected'}}];
  let result=(await api()).prepareBuilderHandlerEdit(trip,{kind:'planning-area',mentionId:mention.mentionId,action:'complete'},builderDocumentFingerprint(trip)); assert.ok(result.ok);
  assert.ok(result.trip.brief.structuredBrief!.completedPlanningAreaMentionIds?.includes(mention.mentionId));
  result=(await api()).prepareBuilderHandlerEdit(result.trip,{kind:'planning-area',mentionId:mention.mentionId,action:'reopen'},builderDocumentFingerprint(result.trip));assert.ok(result.ok);
  assert.equal(result.trip.brief.structuredBrief!.completedPlanningAreaMentionIds?.includes(mention.mentionId),false);
  const removed=(await api()).prepareBuilderHandlerEdits(result.trip,[(await api()).builderRemoveCommand(result.trip,'kyoto')!,{kind:'planning-area',mentionId:mention.mentionId,action:'remove'}],builderDocumentFingerprint(result.trip)); assert.ok(removed.ok);
  assert.ok(removed.trip.brief.structuredBrief!.removedPlaceMentionIds?.includes(mention.mentionId));assert.equal(removed.trip.brief.structuredBrief!.placeSelections?.length,0);
  assert.deepEqual(removed.trip.stops.map(s=>s.id),['tokyo','hiroshima']);
});
test('details_form_emits_explicit_commands_and_rejects_stale_owned_fields', async () => {
  const trip = fixture();
  const draft = { journeyOrigin: trip.brief.intent.route.origin!, journeyEnd: trip.brief.intent.route.journeyEnd,
    startDate: trip.startDate, endDate: trip.endDate, travellers: 4, budget: 'high' as const };
  const command = (await api()).builderDetailsCommands(trip, draft, builderDetailsFingerprint(trip));
  assert.ok(command.ok); assert.deepEqual(command.edits.map(edit => edit.kind), ['travellers', 'budget']);
  const result = (await api()).prepareBuilderHandlerEdits(trip, command.edits, builderDocumentFingerprint(trip));
  assert.ok(result.ok); assert.equal(result.trip.travellers, 4);
  assert.deepEqual(result.trip.brief.intent.route, trip.brief.intent.route);
  const changed = structuredClone(trip); changed.travellers = changed.brief.intent.travellers = 3;
  assert.equal((await api()).builderDetailsCommands(changed, draft, builderDetailsFingerprint(trip)).ok, false);
});
test('details_form_can_edit_an_existing_explicit_legacy_finish_but_cannot_create_one', async () => {
  const trip = fixture();
  const place = { name: 'Osaka', country: 'Japan', canonicalPlaceId: 'place:osaka', coordinates: [135.5, 34.7] as [number, number] };
  const draft = { journeyOrigin: trip.brief.intent.route.origin!, journeyEnd: { mode: 'explicit' as const, place },
    startDate: trip.startDate, endDate: trip.endDate, travellers: trip.travellers, budget: trip.brief.budgetBand };
  assert.equal((await api()).builderDetailsCommands(trip, draft, builderDetailsFingerprint(trip)).ok, false);
  trip.brief.intent.route.journeyEnd = trip.brief.journeyEnd = { mode: 'explicit', place: { ...place, name: 'Old Osaka' } };
  trip.brief.intent.route.tripType = 'one_way';
  const command = (await api()).builderDetailsCommands(trip, draft, builderDetailsFingerprint(trip)); assert.ok(command.ok);
  const result = (await api()).prepareBuilderHandlerEdits(trip, command.edits, builderDocumentFingerprint(trip)); assert.ok(result.ok);
  assert.deepEqual(result.trip.brief.intent.route.journeyEnd, draft.journeyEnd);
});
test('a_second_planning_area_child_preserves_the_parent_and_first_occurrence', async () => {
  const trip = fixture(); const intent = trip.brief.intent.route.destinations[1]!;
  intent.kind = 'planning_area'; intent.selectedPlace = { name: 'Japan', canonicalPlaceId: 'country:japan' };
  const place = { name: 'Osaka', country: 'Japan', canonicalPlaceId: 'place:osaka', coordinates: [135.5, 34.7] as [number, number] };
  const command = (await api()).builderPlaceCommand(trip, { intentId: intent.id, stopId: 'second-child', place }); assert.ok(command);
  const result = (await api()).prepareBuilderHandlerEdit(trip, command, builderDocumentFingerprint(trip)); assert.ok(result.ok);
  const parent = result.trip.brief.intent.route.destinations.find(item => item.id === intent.id)!;
  assert.deepEqual(parent.stopIds, ['kyoto', 'second-child']); assert.deepEqual(parent.selectedPlace, intent.selectedPlace);
});
test('row_nights_and_remove_bind_the_exact_occurrence_not_a_display_label', async () => {
  const trip = fixture(); trip.stops[2]!.name = trip.stops[0]!.name;
  assert.deepEqual((await api()).builderNightsCommand(trip, 'hiroshima', 3), { kind: 'nights', intentId: 'intent:hiroshima', stopId: 'hiroshima', nights: 3 });
  assert.deepEqual((await api()).builderRemoveCommand(trip, 'hiroshima'), { kind: 'remove-destination', intentId: 'intent:hiroshima' });
  assert.equal((await api()).builderRemoveCommand(trip, 'foreign-stop'), null);
});
test('dormant_handler_preparation_has_coherent_children_and_preserves_retained_source_for_Undo', async () => {
  const trip = fixture(); const snapshot = builderStructuralSnapshot(trip);
  const removed = (await api()).prepareBuilderHandlerEdit(trip, (await api()).builderRemoveCommand(trip, 'hiroshima')!, builderDocumentFingerprint(trip));
  assert.ok(removed.ok); assert.ok(removed.trip.brief.retainedAuthoredContent?.entries.length);
  assert.ok(removed.trip.planItems.every(day => removed.trip.stops.some(stop => stop.id === day.stopId)));
  const inverse = (await api()).prepareBuilderHandlerEdit(removed.trip, { kind: 'structural-inverse', snapshot }, builderDocumentFingerprint(removed.trip));
  assert.ok(inverse.ok); assert.deepEqual(inverse.trip.stops.map(s => s.id), trip.stops.map(s => s.id));
  assert.equal(inverse.trip.brief.retainedAuthoredContent?.entries.length ?? 0, 0);
});
test('place_replacement_keeps_occurrence_and_requested_nights_while_new_add_appends_without_chip_authority', async () => {
  const trip = fixture(); const place = { name: 'Osaka', country: 'Japan', canonicalPlaceId: 'place:osaka', coordinates: [135.5, 34.7] as [number, number] };
  const command = (await api()).builderPlaceCommand(trip, { stopId: 'kyoto', place }); assert.ok(command);
  assert.equal(command.kind, 'replace-destination');
  const next = (await api()).prepareBuilderHandlerEdit(trip, command, builderDocumentFingerprint(trip)); assert.ok(next.ok);
  assert.deepEqual(next.trip.stops.map(s => s.id), trip.stops.map(s => s.id)); assert.equal(next.trip.stops[1]!.nights, trip.stops[1]!.nights);
  const add = (await api()).builderPlaceCommand(trip, { stopId: 'new-occurrence', place }); assert.ok(add);
  const added = (await api()).prepareBuilderHandlerEdit(trip, add, builderDocumentFingerprint(trip)); assert.ok(added.ok);
  assert.equal(added.trip.stops.at(-1)!.id, 'new-occurrence'); assert.equal(added.trip.brief.intent.route.orderAuthority, 'manual');
});
test('clarification_uses_captured_intent_and_slot_without_turning_unordered_chips_into_order', async () => {
  const trip = fixture(); trip.brief.intent.route.destinations.push({ id: 'pending-original', sourceText: 'Mostar', kind: 'overnight_place',
    selectedPlace: null, resolution: 'unresolved', requestedNights: 2, routeMembership: 'required', stopIds: [] });
  const command = (await api()).builderPlaceCommand(trip, { stopId: 'mostar-occurrence', intentId: 'pending-original', beforeStopId: 'kyoto',
    place: { name: 'Mostar', country: 'Bosnia and Herzegovina', canonicalPlaceId: 'place:mostar', coordinates: [17.8, 43.34] } });
  assert.ok(command); assert.equal(command.kind, 'resolve-destination');
  const next = (await api()).prepareBuilderHandlerEdit(trip, command, builderDocumentFingerprint(trip)); assert.ok(next.ok);
  assert.deepEqual(next.trip.stops.map(s => s.id), ['tokyo', 'mostar-occurrence', 'kyoto', 'hiroshima']);
  assert.equal(next.trip.stops[1]!.nights, 2); assert.equal(next.trip.brief.intent.route.orderAuthority, 'manual');
});
test('stale_handler_source_and_unproven_intent_mapping_are_rejected', async () => {
  const trip = fixture(); const command = (await api()).builderPlaceCommand(trip, { stopId: 'kyoto', intentId: 'intent:tokyo', place: { name: 'Osaka', canonicalPlaceId: 'place:osaka' } });
  assert.equal(command, null);
  assert.deepEqual((await api()).prepareBuilderHandlerEdit(trip, { kind: 'travellers', travellers: 3 }, 'old-source'), { ok: false, reason: 'stale-source' });
});
test('removing_one_planning_area_child_keeps_its_sibling_and_parent_night_request', async () => {
  const trip = fixture(); trip.brief.intent.route.destinations = trip.brief.intent.route.destinations.filter(i => !['intent:tokyo', 'intent:kyoto'].includes(i.id));
  trip.brief.intent.route.destinations.push({ id: 'area:japan', sourceText: 'Japan 7 nights', kind: 'planning_area',
    selectedPlace: { name: 'Japan', canonicalPlaceId: 'place:japan' }, resolution: 'resolved', requestedNights: 7, routeMembership: 'required', stopIds: ['tokyo', 'kyoto'] });
  const command = (await api()).builderRemoveCommand(trip, 'kyoto');
  assert.deepEqual(command, { kind: 'remove-destination', intentId: 'area:japan', stopId: 'kyoto' });
  const result = (await api()).prepareBuilderHandlerEdit(trip, command!, builderDocumentFingerprint(trip)); assert.ok(result.ok);
  assert.deepEqual(result.trip.stops.map(s => s.id), ['tokyo', 'hiroshima']);
  assert.deepEqual(result.trip.brief.intent.route.destinations.find(i => i.id === 'area:japan')!.stopIds, ['tokyo']);
  assert.equal(result.trip.brief.intent.route.destinations.find(i => i.id === 'area:japan')!.requestedNights, 7);
  assert.ok(result.trip.planItems.some(d => d.stopId === 'tokyo')); assert.equal(result.releasedNights, 3);
});
test('remove_and_Undo_preserve_clarification_bindings_without_restoring_later_preferences', async () => {
  const trip = fixture();
  trip.brief.structuredBrief = { ...extractStructuredTripBrief('Hiroshima'), destinations: [{ id: 'hiroshima', name: 'Hiroshima', placeMentionId: 'intent:hiroshima', role: 'preferred', priority: 'normal',
    provenance: { source: 'builder', kind: 'explicit', confidence: 'high' } }], mustVisit: [],
    hardConstraints: [], interests: [], source: { inputs: ['builder'] },
    placeSelections: [{ mentionId: 'intent:hiroshima', kind: 'base', selectedCanonicalPlaceId: 'place:hiroshima', selectedName: 'Hiroshima', routeStopId: 'hiroshima',
      provenance: { id: 'selection', kind: 'builder', label: 'Traveller', supports: 'Explicit selected base' } }], countryDiscoveryChoices: { 'intent:hiroshima': ['place:hiroshima'] } };
  const snapshot = builderStructuralSnapshot(trip);
  const result = (await api()).prepareBuilderHandlerEdit(trip, (await api()).builderRemoveCommand(trip, 'hiroshima')!, builderDocumentFingerprint(trip)); assert.ok(result.ok);
  assert.equal(result.trip.brief.structuredBrief!.placeSelections!.length, 0);
  assert.equal(result.trip.brief.structuredBrief!.destinations.length, 0);
  assert.deepEqual(result.trip.brief.structuredBrief!.countryDiscoveryChoices!['intent:hiroshima'], []);
  result.trip.brief.intent.preferences.interests = ['nature'];
  const restored = (await api()).prepareBuilderHandlerEdit(result.trip, { kind: 'structural-inverse', snapshot }, builderDocumentFingerprint(result.trip)); assert.ok(restored.ok);
  assert.deepEqual(restored.trip.brief.structuredBrief!.placeSelections, trip.brief.structuredBrief!.placeSelections);
  assert.deepEqual(restored.trip.brief.structuredBrief!.destinations, trip.brief.structuredBrief!.destinations);
  assert.deepEqual(restored.trip.brief.intent.preferences.interests, ['nature']);
});
test('manual_drag_clears_recommended_display_choice_without_losing_manual_authority', async () => {
  const trip = fixture(); trip.brief.decisionSelections = { transportByLeg: {}, routeOrder: 'recommended' };
  const next = (await api()).prepareBuilderHandlerEdit(trip, { kind: 'order', stopIds: ['hiroshima', 'tokyo', 'kyoto'] }, builderDocumentFingerprint(trip)); assert.ok(next.ok);
  assert.equal(next.trip.brief.intent.route.orderAuthority, 'manual'); assert.equal(next.trip.brief.decisionSelections!.routeOrder, 'entered');
});
test('existing_advanced_controls_use_owned_commands_and_invalidate_schedule_constraints', async () => {
  const trip = fixture(); const constrained = (await api()).prepareBuilderHandlerEdit(trip, { kind: 'constraints', constraints: {
    optionalStopIds: ['hiroshima'], fixedCommitments: [{ id: 'dated', label: 'Kyoto reservation', stopId: 'kyoto', date: '2026-10-15' }] } }, builderDocumentFingerprint(trip));
  assert.ok(constrained.ok); assert.deepEqual(constrained.trip.brief.intent.hardConstraints.optionalStopIds, ['hiroshima']);
  assert.equal(constrained.trip.brief.intent.route.destinations.find(i => i.id === 'intent:hiroshima')!.routeMembership, 'optional');
  assert.ok(constrained.trip.brief.cascadeStatus!.routeReconciliation!.residual.some(unit => unit.kind === 'schedule'));
  const picked = (await api()).prepareBuilderHandlerEdit(trip, { kind: 'picks', stopId: 'kyoto', titles: ['Eastern Kyoto'] }, builderDocumentFingerprint(trip));
  assert.ok(picked.ok); assert.deepEqual(picked.trip.brief.selectedPlaces.kyoto, ['Eastern Kyoto']);
  assert.deepEqual(picked.trip.legs, trip.legs); assert.ok(picked.trip.brief.cascadeStatus!.routeReconciliation!.residual.every(unit => unit.kind === 'recommendation'));
});
test('planning_selection_is_bound_to_known_source_and_real_occurrence', async () => {
  const trip = fixture(); const selection = { mentionId: 'intent:kyoto', kind: 'base' as const, selectedCanonicalPlaceId: 'place:kyoto', selectedName: 'Kyoto', routeStopId: 'kyoto',
    provenance: { id: 'chosen-base', kind: 'builder' as const, label: 'Traveller', supports: 'Explicit chosen base' } };
  const saved = (await api()).prepareBuilderHandlerEdit(trip, { kind: 'planning-selection', selection }, builderDocumentFingerprint(trip));
  assert.ok(saved.ok); assert.deepEqual(saved.trip.brief.structuredBrief!.placeSelections, [selection]);
  assert.deepEqual(saved.trip.stops, trip.stops);
  assert.equal((await api()).prepareBuilderHandlerEdit(trip, { kind: 'planning-selection', selection: { ...selection, routeStopId: 'foreign-stop' } }, builderDocumentFingerprint(trip)).ok, false);
});
test('build_status_uses_the_same_guarded_document_and_does_not_restore_archived_trips', async () => {
  const trip = fixture(); const planned = (await api()).prepareBuilderHandlerEdit(trip, { kind: 'build-status' }, builderDocumentFingerprint(trip));
  assert.ok(planned.ok); assert.equal(planned.trip.status, 'planned'); assert.deepEqual(planned.trip.stops, trip.stops);
  trip.status = 'archived'; assert.equal((await api()).prepareBuilderHandlerEdit(trip, { kind: 'build-status' }, builderDocumentFingerprint(trip)).ok, false);
});

test('identity_clarification_replaces_only_its_exact_captured_mention',async()=>{
  const trip=fixture();trip.brief.structuredBrief=extractStructuredTripBrief('Japan');
  const prior=trip.brief.structuredBrief.placeMentions![0]!;
  const selected={...prior,canonicalName:'Japan selected',canonicalPlaceId:'place:japan'};
  const result=(await api()).prepareBuilderHandlerEdit(trip,{kind:'planning-mention',action:'replace',mention:selected,expectedMention:prior},builderDocumentFingerprint(trip));
  assert.ok(result.ok);assert.equal(result.trip.brief.structuredBrief!.placeMentions![0]!.canonicalName,'Japan selected');
  assert.deepEqual(result.trip.brief.intent.route,trip.brief.intent.route);
  const stale=(await api()).prepareBuilderHandlerEdit(result.trip,{kind:'planning-mention',action:'replace',mention:selected,expectedMention:prior},builderDocumentFingerprint(result.trip));assert.equal(stale.ok,false);
});

test('accepted_fixed_commitments_update_structured_presentation_without_losing_unrelated_constraints',async()=>{
 const trip=fixture();trip.brief.structuredBrief=extractStructuredTripBrief('Japan no driving');
 const fixedCommitments=[{id:'requested-stay',label:'Kyoto 3 nights',place:{name:'Kyoto',canonicalPlaceId:'place:kyoto'},fixedNights:3}];
 const result=(await api()).prepareBuilderHandlerEdit(trip,{kind:'constraints',constraints:{fixedCommitments}},builderDocumentFingerprint(trip));assert.ok(result.ok);
 assert.ok(result.trip.brief.structuredBrief!.hardConstraints.some(c=>c.type==='fixed-commitment' && c.fixedNights===3));
 assert.equal(result.trip.brief.structuredBrief!.source.rawPrompt,trip.brief.structuredBrief.source.rawPrompt);
});
