import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {routeProjectionInputKey} from '../lib/easyt/trip-route-intent.ts';
import {createBuilderEditSession} from '../lib/easyt/trip-builder-edit-session.ts';
import {createBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {extractStructuredTripBrief} from '../lib/easyt/structured-trip-brief.ts';
import {assessRouteOrder} from '../lib/easyt/planner.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import type {TripStop,PlanItem} from '../lib/easyt/trip.ts';
import type {BuilderAcceptedEdit} from '../lib/easyt/trip-builder-edit.ts';
const path='../lib/easyt/trip-builder-route-proposal.ts';
const loaded=import(path).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ERR_MODULE_NOT_FOUND')return null;throw e});
async function api():Promise<typeof import('../lib/easyt/trip-builder-route-proposal.ts')>{const module=await loaded;assert.ok(module,'Task5 proposal guards are missing');return module}
function fixture(){const trip=requireReadableTripDocument(canonicalRouteFixture());trip.planItems.at(-1)!.contextNotes=[...trip.planItems.at(-1)!.notes];trip.planItems.at(-1)!.notes=[];trip.brief.bookings=[];trip.brief.intent.hardConstraints.fixedCommitments=[];trip.brief.scheduleLocks={stopIds:[],arrivalDates:{}};return trip}
const scope={ownerId:'owner-a',tripId:'batch14-trip',inputRevision:7};
const candidate=['tokyo','hiroshima','kyoto'];
async function proposal(trip=fixture()){const result=(await api()).createBuilderOptimizationProposal(trip,scope,candidate,'proposal-a');assert.equal(result.kind,'proposal');if(result.kind!=='proposal')throw Error('Expected a proposal');return result.proposal}
test('update_route_proposal_does_not_save_or_apply_order_and_is_immutable',async()=>{
 const trip=fixture(),bytes=JSON.stringify(trip);const p=await proposal(trip);assert.equal(JSON.stringify(trip),bytes);assert.equal(p.inputKey,routeProjectionInputKey(trip));assert.deepEqual(p.projectedTrip.stops.map(stop=>stop.id),candidate);assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.projectedTrip.stops));
});
test('explicit_manual_legacy_and_optimizable_orders_require_acceptance',async()=>{
 for(const authority of ['explicit','manual','legacy_preserved','optimizable'] as const){const trip=fixture();trip.brief.intent.route.orderAuthority=authority;trip.brief.intent.route.explicitIntentIds=authority==='explicit'?trip.brief.intent.route.destinations.map(i=>i.id):null;const bytes=JSON.stringify(trip);const p=await proposal(trip);assert.equal(JSON.stringify(trip),bytes);const result=(await api()).acceptBuilderOptimization(trip,p,scope);assert.ok(result.ok);if(result.ok){assert.equal(result.trip.brief.intent.route.orderAuthority,'manual');assert.deepEqual(result.command,{kind:'order',source:'route-check',stopIds:candidate});}}
});
test('ambiguous_source_requires_acceptance_without_inventing_explicit_order',async()=>{
 const trip=fixture();trip.brief.intent.route.orderAuthority='legacy_preserved';trip.brief.structuredBrief=extractStructuredTripBrief('Maybe Tokyo then Kyoto then Hiroshima, not sure');const bytes=JSON.stringify(trip);const p=await proposal(trip);assert.equal(JSON.stringify(trip),bytes);assert.ok((await api()).acceptBuilderOptimization(trip,p,scope).ok);
});
for(const [label,edit] of Object.entries({
 nights:{kind:'nights',intentId:'intent:kyoto',stopId:'kyoto',nights:2},
 origin:{kind:'origin',place:{name:'Paris',canonicalPlaceId:'place:paris',country:'France',coordinates:[2.35,48.85]}},
 destination:{kind:'replace-destination',intentId:'intent:kyoto',stopId:'kyoto',place:{name:'Osaka',canonicalPlaceId:'place:osaka',country:'Japan',coordinates:[135.5,34.7]}},
 order:{kind:'order',stopIds:['hiroshima','tokyo','kyoto']},
} satisfies Record<string,BuilderAcceptedEdit>))test(`stale_proposal_after_${label}_edit_is_rejected`,async()=>{
 const trip=fixture(),p=await proposal(trip);const changed=prepareBuilderHandlerEdit(trip,edit,builderDocumentFingerprint(trip));assert.ok(changed.ok);if(!changed.ok)return;const bytes=JSON.stringify(changed.trip);
 assert.deepEqual((await api()).acceptBuilderOptimization(changed.trip,p,scope),{ok:false,reason:'stale-source'});assert.deepEqual((await api()).acceptBuilderOptimization(changed.trip,p,{...scope,inputRevision:8}),{ok:false,reason:'stale-source'});assert.equal(JSON.stringify(changed.trip),bytes);
});
test('foreign_scope_and_newer_raw_input_reject_the_proposal',async()=>{
 const trip=fixture(),p=await proposal(trip);for(const next of [{...scope,ownerId:'other'},{...scope,tripId:'other'},{...scope,inputRevision:8}])assert.deepEqual((await api()).acceptBuilderOptimization(trip,p,next),{ok:false,reason:'stale-source'});
});
test('return_and_explicit_legacy_finish_remain_the_same_after_acceptance',async()=>{
 for(const end of [{mode:'same_as_start' as const},{mode:'explicit' as const,place:{name:'Tokyo',country:'Japan',canonicalPlaceId:'place:tokyo',coordinates:[139.69,35.68] as [number,number]}}]){const trip=fixture();trip.brief.intent.route.tripType=end.mode==='same_as_start'?'return_to_start':'one_way';trip.brief.intent.route.journeyEnd=end;trip.brief.journeyEnd=end;const p=await proposal(trip),result=(await api()).acceptBuilderOptimization(trip,p,scope);assert.ok(result.ok);if(result.ok){assert.deepEqual(result.trip.brief.intent.route.origin,trip.brief.intent.route.origin);assert.deepEqual(result.trip.brief.intent.route.journeyEnd,end);assert.equal(result.trip.brief.intent.route.tripType,trip.brief.intent.route.tripType)}}
});
test('unchanged_order_and_unavailable_geometry_leave_canonical_bytes_unchanged',async()=>{
 const trip=fixture(),bytes=JSON.stringify(trip);assert.equal((await api()).createBuilderOptimizationProposal(trip,scope,trip.stops.map(s=>s.id),'same').kind,'no-improvement');trip.stops[0]!.latitude=null;trip.stops[0]!.longitude=null;const unknown=JSON.stringify(trip);assert.equal((await api()).calculateBuilderOptimization(trip,scope,'unknown').kind,'unavailable');assert.equal(JSON.stringify(trip),unknown);assert.notEqual(bytes,unknown);
});
test('repeated_destination_occurrences_are_never_conflated_by_a_proposal',async()=>{
 const trip=fixture(),repeat=trip.stops[2]!,first=trip.stops[0]!;Object.assign(repeat,{name:first.name,country:first.country,canonicalPlaceId:first.canonicalPlaceId,latitude:first.latitude,longitude:first.longitude});Object.assign(trip.brief.intent.route.destinations[2]!,{sourceText:first.name,selectedPlace:structuredClone(trip.brief.intent.route.destinations[0]!.selectedPlace)});
 const p=await proposal(trip),result=(await api()).acceptBuilderOptimization(trip,p,scope);assert.ok(result.ok);if(result.ok){assert.deepEqual(result.trip.stops.map(s=>s.id),candidate);assert.deepEqual(result.trip.stops.filter(s=>s.name===first.name).map(s=>[s.id,s.nights]),[[first.id,first.nights],[repeat.id,repeat.nights]])}
});
test('a protected booked date refuses a proposal rather than moving the booking',async()=>{
 const trip=fixture();trip.planItems.find(d=>d.stopId==='kyoto')!.bookingUrl='https://example.invalid/fixed-visit';const bytes=JSON.stringify(trip);
 assert.equal((await api()).createBuilderOptimizationProposal(trip,scope,candidate,'booked').kind,'unavailable');assert.equal(JSON.stringify(trip),bytes);
});
test('calculation_uses_current_canonical_preferences_instead_of_stale_captured_preferences',async()=>{
 const trip=fixture();trip.brief.structuredBrief=extractStructuredTripBrief('Tokyo, Kyoto and Hiroshima by car at a relaxed pace');trip.brief.intent.preferences.transportModes=['train'];trip.brief.intent.preferences.pace='packed';trip.brief.intent.hardConstraints.avoidDriving=true;
 const result=(await api()).calculateBuilderOptimization(trip,scope,'canonical-preferences');
 const expected=assessRouteOrder({origin:{name:'London'},stops:trip.stops.map(s=>({id:s.id,name:s.name,country:s.country,canonicalPlaceId:s.canonicalPlaceId,coordinates:[s.longitude!,s.latitude!]})),availableDays:10,allocations:Object.fromEntries(trip.stops.map(s=>[s.id,s.nights!])),picks:trip.brief.selectedPlaces,constraints:{fixedCommitments:[],optionalStopIds:trip.brief.intent.hardConstraints.optionalStopIds,avoidDriving:true,excludedTransportModes:['road'],transportModes:['train']},scoringPreferences:{pace:'packed',preferredModes:['train'],interests:trip.brief.intent.preferences.interests}});
 assert.equal(result.assessment?.currentTransferMinutes,expected.currentTransferMinutes);assert.deepEqual(result.assessment?.recommendedStopIds,expected.recommendedStopIds);assert.deepEqual(result.assessment?.scoring?.rankedCandidates,expected.scoring?.rankedCandidates);
});
test('accepted_projection_preserves_occurrences_requests_authored_content_bookings_and_endpoints',async()=>{
 const trip=fixture();const first=trip.stops[0]!;trip.brief.bookings=[{id:`stay-${first.id}`,type:'stay',title:'My hotel',date:first.arrivalDate,confirmation:'booked',url:'https://example.invalid/hotel'}];trip.brief.intent.hardConstraints.fixedCommitments=[{id:'fixed-tokyo',label:'My Tokyo stay',stopId:first.id,date:first.arrivalDate!,fixedNights:first.nights!}] as typeof trip.brief.intent.hardConstraints.fixedCommitments;
 const p=await proposal(trip),result=(await api()).acceptBuilderOptimization(trip,p,scope);assert.ok(result.ok);if(!result.ok)return;
 for(const prior of trip.stops){const next:TripStop=result.trip.stops.find(s=>s.id===prior.id)!;assert.equal(next.canonicalPlaceId,prior.canonicalPlaceId);assert.equal(next.nights,prior.nights)}
 assert.deepEqual(result.trip.brief.intent.route.destinations,trip.brief.intent.route.destinations);assert.deepEqual(result.trip.brief.intent.route.origin,trip.brief.intent.route.origin);assert.deepEqual(result.trip.brief.intent.route.journeyEnd,trip.brief.intent.route.journeyEnd);assert.deepEqual(result.trip.brief.bookings,trip.brief.bookings);
 for(const item of trip.planItems){const next:PlanItem|undefined=result.trip.planItems.find(d=>d.id===item.id);if(next)assert.deepEqual({...next,date:item.date,dayNumber:item.dayNumber},item);else {assert.equal(item.notes.length,0);assert.deepEqual(result.trip.brief.retainedAuthoredContent!.entries.flatMap(e=>e.days).find(d=>d.sourceDay.id===item.id)!.sourceDay,item)}}
 const forged=structuredClone(p);forged.projectedTrip.stops[1]!.nights=0;assert.equal((await api()).acceptBuilderOptimization(trip,forged,scope).ok,false);
});
test('accepted_proposal_uses_one_existing_session_edit_and_normal_autosave_then_ordinary_edits_keep_order',async()=>{
 const trip=fixture(),timers:Array<{callback:()=>void;delay:number;active:boolean}>=[],writes:unknown[]=[],recovery:unknown[]=[];
 const session=createBuilderEditSession({initialTrip:trip,getOwnerId:()=>trip.ownerId,readDraft:()=>({kind:'readable',draft:createBuilderInputDraft(trip)}),writeDraft:()=>({ok:true}),saveRecovery:(next)=>{recovery.push(next);return {stored:true,blockedByExistingRecovery:false,handle:{ownerId:trip.ownerId,tripId:trip.id,writeId:`write-${recovery.length}`}}},acknowledgeRecovery:()=>({outcome:'acknowledged',remainingRecovery:null}),persistAccount:async next=>{writes.push(next);return {...next,updatedAt:nextTripUpdatedAt(next.updatedAt)}},reconcile:()=>new Promise(()=>{}),now:()=>trip.updatedAt,schedule:(callback,delay)=>{const t={callback,delay,active:true};timers.push(t);return()=>{t.active=false}}});
 try{const snap=session.getSnapshot();const prepared=(await api()).createBuilderOptimizationProposal(trip,{...scope,inputRevision:snap.inputRevision},candidate,'session-proposal');assert.equal(prepared.kind,'proposal');if(prepared.kind!=='proposal')return;const p=prepared.proposal;assert.equal(recovery.length,0);assert.equal(writes.length,0);const accepted=(await api()).acceptBuilderOptimization(trip,p,{...scope,inputRevision:snap.inputRevision});assert.ok(accepted.ok);if(!accepted.ok)return;assert.ok(session.accept(accepted.command,snap.inputRevision).ok);assert.equal(session.getSnapshot().acceptedRevision,1);assert.equal(recovery.length,1);
 for(const t of [...timers])if(t.active&&t.delay===450){t.active=false;t.callback()}for(let i=0;i<30;i++)await Promise.resolve();assert.equal(writes.length,1);assert.equal(session.getSnapshot().canonicalSaveState,'cloud');
 for(const edit of [{kind:'budget',budget:'high'},{kind:'dates',startDate:'2026-10-10',endDate:'2026-10-20'},{kind:'nights',intentId:'intent:kyoto',stopId:'kyoto',nights:2},{kind:'origin',place:{name:'Paris',canonicalPlaceId:'place:paris',country:'France',coordinates:[2.35,48.85]}}] satisfies BuilderAcceptedEdit[]){assert.ok(session.accept(edit,session.getSnapshot().inputRevision).ok);assert.deepEqual(session.getSnapshot().trip.brief.intent.route.orderedStopIds,candidate);assert.equal(session.getSnapshot().trip.brief.intent.route.orderAuthority,'manual')}
 }finally{session.dispose()}
});

test('a proposal cannot retire an authored final day under the unchanged full route guard',async()=>{const trip=fixture();trip.planItems.at(-1)!.notes=['My explicit departure plan'];const bytes=JSON.stringify(trip);assert.equal((await api()).createBuilderOptimizationProposal(trip,scope,candidate,'authored-retirement').kind,'unavailable');assert.equal(JSON.stringify(trip),bytes);});
