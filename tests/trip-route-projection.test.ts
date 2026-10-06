import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import { cascadeTripSchedule } from "../lib/easyt/cascade.ts";
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { commitAcceptedRouteProjection, routeProjectionInputKey, routeProjectionStatus, routeOrderReviewIssue } from '../lib/easyt/trip-route-intent.ts';
import { buildBuilderRoutePreview } from '../lib/easyt/trip-builder-route-preview.ts';
import { tripFromBuilder } from '../lib/easyt/trip.ts';
import { preserveBuilderCanonicalState } from '../lib/easyt/trip-builder-preservation.ts';
import { mergeTripMutationDocuments } from '../lib/easyt/trip-mutation-persistence.ts';
function current(){const trip=requireReadableTripDocument(canonicalRouteFixture());trip.brief.bookings=[];trip.legs=buildCanonicalTripLegs({tripId:trip.id,origin:{name:"London",coordinates:null},journeyEnd:trip.brief.journeyEnd,stops:trip.stops});return trip;}
function proposal(trip=current()) {const stops=[...trip.stops].reverse().map((stop,order)=>({...stop,order}));return cascadeTripSchedule({...trip,stops,legs:buildCanonicalTripLegs({tripId:trip.id,origin:{name:"London",coordinates:null},journeyEnd:trip.brief.journeyEnd,stops})}).trip;}
test('automatic_reconciliation_cannot_change_authoritative_order',()=>{
 for(const authority of ['explicit','manual','legacy_preserved'] as const){
  const trip=current();trip.brief.intent.route.orderAuthority=authority;trip.brief.intent.route.explicitIntentIds=authority==='explicit'?trip.brief.intent.route.destinations.map(intent=>intent.id):null;
  assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:proposal(trip),reason:'necessary_reconciliation'}),{kind:'rejected',reason:'authoritative_order'});
 }
});
test('accepted_optimization_requires_current_input_key_and_establishes_manual_authority',()=>{
 const trip=current();assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:'stale',projectedTrip:proposal(trip),reason:'accepted_optimization'}),{kind:'rejected',reason:'stale_inputs'});
 const result=commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:proposal(trip),reason:'accepted_optimization'});
 assert.equal(result.kind,'accepted');if(result.kind!=='accepted')return;
 assert.equal(result.trip.brief.intent.route.orderAuthority,'manual');assert.equal(routeProjectionStatus(result.trip),'current');
 assert.deepEqual(requireReadableTripDocument(JSON.parse(JSON.stringify(result.trip))).brief.intent.route.orderedStopIds,result.trip.stops.map(stop=>stop.id));
});
test('ambiguous_order_blocks_automatic_reorder_but_allows_necessary_dependencies',()=>{
 const trip=current();trip.brief.intent.route.orderAuthority='optimizable';
 trip.brief.capturedIntent={originalBrief:'Route: maybe Tokyo then Kyoto then Hiroshima?',parserVersion:'test',regions:[],routeHints:[],mentions:[]};
 assert.ok(routeOrderReviewIssue(trip));
 assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:proposal(trip),reason:'necessary_reconciliation'}),{kind:'rejected',reason:'authoritative_order'});
 const result=commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:{...trip,legs:trip.legs.map(leg=>({...leg,provider:"Refreshed"}))},reason:'necessary_reconciliation'});
 assert.equal(result.kind,'accepted');
 const accepted=commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:proposal(trip),reason:'manual_order'});
 assert.equal(accepted.kind,'accepted');if(accepted.kind==='accepted')assert.equal(routeOrderReviewIssue(accepted.trip),null);
});
test('preview_does_not_mutate_canonical_authority_and_remains_a_valid_pending_document',()=>{
 const trip=current();const before=JSON.stringify(trip);const preview=buildBuilderRoutePreview(trip,trip.stops.map(stop=>stop.id).reverse());
 assert.equal(preview.ok,true);assert.equal(JSON.stringify(trip),before);
 if(preview.ok){const read=requireReadableTripDocument(preview.trip);assert.equal(read.brief.intent.route.orderAuthority,'manual');assert.equal(read.brief.intent.route.projectionInputKey,null);}
});
test('projection_rejects_foreign_owner_intent_changes_and_requested_night_loss',()=>{
 const trip=current();for(const projectedTrip of [{...trip,ownerId:'other'}, {...trip,stops:trip.stops.map((stop,index)=>index?stop:{...stop,nights:0})}]){
  assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip,reason:'necessary_reconciliation'}),{kind:'rejected',reason:'invalid_projection'});
 }
});
test('builder_rebuild_preserves_unresolved_intent_and_requested_nights',()=>{
 const trip=current();trip.brief.intent.route.destinations.push({id:'pending-mostar',sourceText:'Mostar',kind:'overnight_place',selectedPlace:null,resolution:'unavailable',requestedNights:2,routeMembership:'required',stopIds:[]});
 const built=tripFromBuilder({id:trip.id,origin:'London',stops:trip.stops.map(stop=>({...stop})),startDate:trip.startDate,endDate:trip.endDate,picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],intent:trip.brief.intent,routeIntent:trip.brief.intent.route,nightAllocations:Object.fromEntries(trip.stops.map(stop=>[stop.id,stop.nights!]))});
 assert.equal(built.schemaVersion,2);assert.deepEqual(built.brief.intent.route.destinations.find(intent=>intent.id==='pending-mostar'),trip.brief.intent.route.destinations.at(-1));
 assert.equal(built.brief.intent.route.orderAuthority,'manual');assert.equal(built.brief.intent.route.projectionInputKey,null);
});
test('authored_items_and_bookings_survive_replacement_for_review',()=>{
 const trip=current();const stop=trip.stops[0];trip.brief.bookings=[{id:`stay-${stop.id}`,type:'stay',title:`Hotel ${stop.name}`,date:stop.arrivalDate,confirmation:'booked',url:null}];
 trip.brief.itineraryIdeas=[{id:'authored-idea',stopId:stop.id,placeId:'authored',title:'Keep my visit',category:'activity',source:'personalised-recommendation',reasons:[],dayId:trip.planItems[0]?.id}];
 const rebuilt=current();rebuilt.stops=rebuilt.stops.slice(1);rebuilt.brief.intent.route.destinations=rebuilt.brief.intent.route.destinations.slice(1);rebuilt.brief.intent.route.orderedStopIds=rebuilt.stops.map(stop=>stop.id);
 const result=preserveBuilderCanonicalState(trip,rebuilt);
 assert.deepEqual(result.brief.bookings,trip.brief.bookings);assert.equal(result.brief.itineraryIdeas?.some(idea=>idea.id==='authored-idea'),true);assert.ok(result.brief.cascadeStatus?.conflicts.length);
});
test('concurrent_order_and_preference_merge_is_atomic',()=>{
 const base=current();const canonical=proposal(base);canonical.brief=structuredClone(base.brief);canonical.brief.intent!.route!.orderedStopIds=canonical.stops.map(stop=>stop.id);canonical.brief.intent!.route!.orderAuthority='manual';
 const authored=structuredClone(base);authored.brief.intent.preferences.pace='packed';
 const merged=requireReadableTripDocument(mergeTripMutationDocuments(base,authored,canonical));
 assert.deepEqual(merged.stops.map(stop=>stop.id),canonical.stops.map(stop=>stop.id));assert.equal(merged.brief.intent.preferences.pace,'packed');
 const competing=structuredClone(base);competing.stops=[competing.stops[1],competing.stops[0],competing.stops[2]].map((stop,order)=>({...stop,order}));competing.brief.intent.route.orderedStopIds=competing.stops.map(stop=>stop.id);
 assert.throws(()=>mergeTripMutationDocuments(base,competing,canonical),/route|conflict/i);
});

test('ambiguous_order_reaches_existing_build_feedback_after_reload',async()=>{
 const {canBuildTrip}=await import('../lib/easyt/can-build-trip.ts');
 const trip=current();trip.brief.intent.route.orderAuthority='optimizable';trip.brief.capturedIntent={originalBrief:'Route: maybe Tokyo then Kyoto then Hiroshima?',parserVersion:'test',regions:[],routeHints:[],mentions:[]};
 const document=requireReadableTripDocument(JSON.parse(JSON.stringify(trip)));
 const result=canBuildTrip({origin:'London',originCoordinates:[0,51],stops:trip.stops.map(stop=>({...stop,coordinates:[stop.longitude!,stop.latitude!]})),startDate:trip.startDate,endDate:trip.endDate,durationDays:10,allocations:{tokyo:4,kyoto:3,hiroshima:2},nightAllocation:{state:'valid',allocations:{tokyo:4,kyoto:3,hiroshima:2},conflicts:[]} as unknown as import('../lib/easyt/night-allocation.ts').NightAllocationResult,document});
 assert.ok(result.conflicts.some(issue=>issue.code==='route-order-review-required'&&issue.stage==='places'));
});
test('night_edit_keeps_place_and_authority_and_only_updates_bound_request',async()=>{
 const {applyResolvedTripCopilotAction}=await import('../lib/easyt/trip-copilot-actions.ts');
 const trip=current();const result=requireReadableTripDocument(applyResolvedTripCopilotAction(trip,{action:'change_stop_nights',stopId:'hiroshima',nights:3,resolution:{type:'extend_trip',days:1}}));
 assert.equal(result.brief.intent.route.orderAuthority,trip.brief.intent.route.orderAuthority);
 assert.equal(result.brief.intent.route.destinations.find(intent=>intent.stopIds.includes('hiroshima'))?.requestedNights,3);
 assert.deepEqual(result.brief.intent.route.destinations.filter(intent=>!intent.stopIds.includes('hiroshima')),trip.brief.intent.route.destinations.filter(intent=>!intent.stopIds.includes('hiroshima')));
 assert.deepEqual(result.stops.map(stop=>stop.id),trip.stops.map(stop=>stop.id));
});
test('same_place_label_edit_preserves_key_and_gateway_edit_preserves_intercity_legs',()=>{
 const build=(origin:string,coordinates:[number,number],route?:import('../lib/easyt/trip.ts').RouteIntent)=>tripFromBuilder({id:'dependency-test',origin,originCoordinates:coordinates,originCanonicalPlaceId:origin.toLowerCase(),stops:[{id:'tokyo',name:'Tokyo',country:'Japan',canonicalPlaceId:'tokyo',coordinates:[139.65,35.67]},{id:'kyoto',name:'Kyoto',country:'Japan',canonicalPlaceId:'kyoto',coordinates:[135.77,35.01]}],startDate:'2026-10-01',endDate:'2026-10-06',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],nightAllocations:{tokyo:3,kyoto:2},routeIntent:route});
 const before=build('London',[0,51]);const after=build('Paris',[2,48],before.brief.intent.route);
 assert.notEqual(routeProjectionInputKey(before),routeProjectionInputKey(after));assert.deepEqual(before.legs.slice(1),after.legs.slice(1));assert.deepEqual(before.stops,after.stops);
 const label=structuredClone(before);label.stops[0].name='Tokyo city';label.brief.intent.route.destinations[0].selectedPlace!.name='Tokyo city';
 assert.equal(routeProjectionInputKey(label),routeProjectionInputKey(before));
});
test('remove_intent_releases_held_nights_without_redistribution',async()=>{
 const {routeIntentFromHandoff,routeNightBudget}=await import('../lib/easyt/trip-route-intent.ts');
 const trip=current();trip.brief.intent.route.destinations.push({id:'pending',sourceText:'Mostar',kind:'overnight_place',selectedPlace:null,resolution:'unresolved',requestedNights:2,routeMembership:'required',stopIds:[]});
 const route=routeIntentFromHandoff({routeIntent:trip.brief.intent.route,structuredBrief:{removedPlaceMentionIds:['pending']} as import('../lib/easyt/structured-trip-brief.ts').StructuredTripBrief},trip.stops);
 const next={...trip,brief:{...trip.brief,intent:{...trip.brief.intent,route}}};
 assert.equal(routeNightBudget(next,11).held,0);assert.deepEqual(next.stops,trip.stops);assert.equal(routeNightBudget(next,11).unallocated,2);
});
test('Overview_and_Itinerary_do_not_claim_stale_projection_complete',async()=>{
 const {deriveItineraryCoverage}=await import('../lib/easyt/trip-facts.ts');
 const {tripReadinessSummary}=await import('../lib/easyt/trip-readiness-summary.ts');
 const trip=current();trip.brief.intent.route.projectionInputKey=routeProjectionInputKey(trip);
 assert.equal(deriveItineraryCoverage(trip).state,'complete');
 trip.brief.intent.route.origin!.canonicalPlaceId='changed-origin';
 assert.equal(routeProjectionStatus(trip),'pending');assert.notEqual(deriveItineraryCoverage(trip).state,'complete');
 assert.equal(tripReadinessSummary(trip).signals.find(signal=>signal.id==='route')?.complete,false);
});

test('projection_cannot_erase_authored_containers_or_overwrite_traveller_metadata',()=>{
 const trip=current();trip.brief.bookings=[{id:'booking',type:'stay',title:'Keep booking',date:null,confirmation:'confirmed',url:null}];trip.brief.dayNotes={1:['Keep note']};
 const dropped=structuredClone(trip);dropped.planItems=[];dropped.brief.bookings=[];dropped.brief.dayNotes={};
 assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:dropped,reason:'necessary_reconciliation'}),{kind:'rejected',reason:'invalid_projection'});
 const candidate=structuredClone(trip);candidate.brief.bookings=[];candidate.brief.dayNotes={};candidate.title='Provider replacement';
 const result=commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:candidate,reason:'necessary_reconciliation'});
 assert.equal(result.kind,'accepted');if(result.kind==='accepted'){assert.deepEqual(result.trip.brief.bookings,trip.brief.bookings);assert.deepEqual(result.trip.brief.dayNotes,trip.brief.dayNotes);assert.equal(result.trip.title,trip.title);}
});
test('transport_inputs_invalidate_projection_without_reordering',()=>{
 const trip=current();trip.brief.intent.route.projectionInputKey=routeProjectionInputKey(trip);
 for(const change of [(copy:typeof trip)=>{copy.brief.intent.preferences.transportModes=['drive'];},(copy:typeof trip)=>{copy.brief.intent.hardConstraints.avoidDriving=!copy.brief.intent.hardConstraints.avoidDriving;}]){const copy=structuredClone(trip);change(copy);assert.equal(routeProjectionStatus(copy),'pending');assert.deepEqual(copy.stops,trip.stops);}
});

test('projection_requires_complete_schedule_before_stamping_current',()=>{
 const trip=current();const candidate=structuredClone(trip);candidate.stops=candidate.stops.map(stop=>({...stop,arrivalDate:null,departureDate:null}));
 assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:candidate,reason:'necessary_reconciliation'}),{kind:'rejected',reason:'invalid_projection'});
});
test('accepted_base_night_edit_updates_one_parent_budget_by_delta',async()=>{
 const {applyResolvedTripCopilotAction}=await import('../lib/easyt/trip-copilot-actions.ts');const {routeNightBudget}=await import('../lib/easyt/trip-route-intent.ts');
 const trip=current();trip.brief.intent.route.destinations=[{id:'japan',sourceText:'Japan',kind:'planning_area',selectedPlace:{name:'Japan'},resolution:'resolved',requestedNights:9,routeMembership:'required',stopIds:trip.stops.map(stop=>stop.id)}];
 const next=requireReadableTripDocument(applyResolvedTripCopilotAction(trip,{action:'change_stop_nights',stopId:'hiroshima',nights:3,resolution:{type:'extend_trip',days:1}}));assert.equal(next.brief.intent.route.destinations[0].requestedNights,10);assert.equal(routeNightBudget(next,10).overallocated,0);
});
test('concurrent_leg_edit_never_moves_provider_choice_to_different_endpoints',()=>{
 const base=current();const authored=structuredClone(base);authored.legs[1].provider='My explicit provider';
 const canonical=proposal(base);canonical.brief=structuredClone(base.brief);canonical.brief.intent!.route!.orderedStopIds=canonical.stops.map(stop=>stop.id);canonical.brief.intent!.route!.projectionInputKey=routeProjectionInputKey(canonical);
 assert.throws(()=>mergeTripMutationDocuments(base,authored,canonical),/leg|transport|conflict/i);
});

test('projection_rejects_chronologically_impossible_and_missing_authored_day',()=>{
 const trip=current();for(const mutate of [(candidate:typeof trip)=>{candidate.stops[1].arrivalDate='2026-12-01';candidate.stops[1].departureDate='2026-12-04';},(candidate:typeof trip)=>{candidate.planItems=candidate.planItems.slice(1);}]){const candidate=structuredClone(trip);mutate(candidate);assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:candidate,reason:'necessary_reconciliation'}),{kind:'rejected',reason:'invalid_projection'});}
});
test('parent_budget_excess_is_a_visible_binding_conflict',async()=>{
 const {routeNightBudget}=await import('../lib/easyt/trip-route-intent.ts');const trip=current();trip.brief.intent.route.destinations=[{id:'japan',sourceText:'Japan',kind:'planning_area',selectedPlace:{name:'Japan'},resolution:'resolved',requestedNights:8,routeMembership:'required',stopIds:trip.stops.map(stop=>stop.id)}];
 assert.ok(routeNightBudget(trip,9).issues.some(issue=>issue.code==='requested_night_budget_exceeded'&&issue.severity==='blocking'));
});
test('redistribution_within_parent_keeps_total_and_between_parents_changes_each_once',async()=>{
 const {applyResolvedTripCopilotAction}=await import('../lib/easyt/trip-copilot-actions.ts');const trip=current();trip.brief.intent.route.destinations=[{id:'japan',sourceText:'Japan',kind:'planning_area',selectedPlace:{name:'Japan'},resolution:'resolved',requestedNights:9,routeMembership:'required',stopIds:trip.stops.map(stop=>stop.id)}];
 const same=requireReadableTripDocument(applyResolvedTripCopilotAction(trip,{action:'change_stop_nights',stopId:'hiroshima',nights:3,resolution:{type:'reduce_stop',stopId:'kyoto',nights:2}}));assert.equal(same.brief.intent.route.destinations[0].requestedNights,9);
 trip.brief.intent.route.destinations=[{...trip.brief.intent.route.destinations[0],id:'area-a',stopIds:['tokyo','kyoto'],requestedNights:7},{...trip.brief.intent.route.destinations[0],id:'area-b',stopIds:['hiroshima'],requestedNights:2}];
 const separate=requireReadableTripDocument(applyResolvedTripCopilotAction(trip,{action:'change_stop_nights',stopId:'hiroshima',nights:3,resolution:{type:'reduce_stop',stopId:'kyoto',nights:2}}));assert.deepEqual(separate.brief.intent.route.destinations.map(intent=>intent.requestedNights),[6,3]);
});

test('necessary_schedule_can_remove_an_empty_generated_day_after_accepted_night_reduction',()=>{
 const trip=current();trip.planItems=trip.planItems.map(item=>({...item,notes:[]}));trip.stops[0].nights=3;trip.brief.nightAllocations!.tokyo=3;trip.brief.intent.route.destinations[0].requestedNights=3;trip.endDate='2026-10-18';
 const candidate=cascadeTripSchedule({...trip,planItems:trip.planItems.filter(item=>item.id!=='japan-day-4')}).trip;
 assert.equal(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:candidate,reason:'necessary_reconciliation'}).kind,'accepted');
});

test('late_projection_preserves_newer_authored_plan_item_times_and_booking_link',()=>{
 const trip=current();const candidate=structuredClone(trip);trip.planItems[1].startsAt='09:00';trip.planItems[1].endsAt='10:30';trip.planItems[1].bookingUrl='https://example.invalid/my-booking';
 const result=commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:candidate,reason:'necessary_reconciliation'});assert.equal(result.kind,'accepted');if(result.kind==='accepted')assert.deepEqual(result.trip.planItems[1],trip.planItems[1]);
});

test('projection_cannot_stamp_current_after_moving_known_booked_stay_outside_booking_dates',()=>{
 const trip=current();trip.brief.bookings=[{id:'stay-tokyo',type:'stay',title:'Tokyo hotel',date:'2026-10-11',confirmation:'paid',url:null}];
 const stops=[trip.stops[1],trip.stops[0],trip.stops[2]].map((stop,order)=>({...stop,order}));const candidate=cascadeTripSchedule({...trip,stops,legs:buildCanonicalTripLegs({tripId:trip.id,origin:{name:'London',coordinates:null},journeyEnd:trip.brief.journeyEnd,stops})}).trip;
 assert.deepEqual(commitAcceptedRouteProjection(trip,{basedOnInputKey:routeProjectionInputKey(trip),projectedTrip:candidate,reason:'manual_order'}),{kind:'rejected',reason:'invalid_projection'});
});
