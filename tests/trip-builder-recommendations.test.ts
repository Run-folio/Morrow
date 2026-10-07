import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { prepareAcceptedBuilderEdit } from '../lib/easyt/trip-builder-edit.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { prepareBuilderNecessaryProjection, mergeBuilderProjectionResponse, pendingBuilderReconciliationUnits } from '../lib/easyt/trip-builder-reconciliation.ts';
import { builderRecommendationProjection, resolveBuilderRecommendation } from '../lib/easyt/trip-builder-recommendations.ts';
import { routeProjectionInputKey } from '../lib/easyt/trip-route-intent.ts';
const place = { title:'Museum', area:'Centre', type:'Museum', cost:0.5, tags:['Cities'], description:'Fresh museum guidance.' };
function fixture() {
 const before=requireReadableTripDocument(canonicalRouteFixture());
 const edited=prepareAcceptedBuilderEdit(before,{kind:'budget',budget:'high'},builderDocumentFingerprint(before));assert.ok(edited.ok);
 const prepared=prepareBuilderNecessaryProjection(before,edited.trip,edited.scope);assert.ok(prepared.ok);return prepared.trip;
}
function merge(trip:ReturnType<typeof fixture>, projections?:unknown) {
 const dispatched=pendingBuilderReconciliationUnits(trip).filter(unit=>unit.kind==='recommendation').slice(0,1);
 const scope={ownerId:trip.ownerId,tripId:trip.id,inputRevision:1};
 return mergeBuilderProjectionResponse(trip,{scope,inputKey:routeProjectionInputKey(trip),requestId:'r',dispatched,
 results:dispatched.map(unit=>({...unit,phase:'complete'})),legs:[],recommendationProjections:projections as any},{scope,requestId:'r',dispatched});
}
test('recommendation completion requires an exact occurrence and every live day; marker-only success is rejected',()=>{
 const trip=fixture();const unit=pendingBuilderReconciliationUnits(trip).find(u=>u.kind==='recommendation')!;
 const projection=builderRecommendationProjection(trip,unit.targetId,[place]);
 for(const invalid of [undefined,[],[projection,projection],[{...projection,stopId:'foreign'}],[{...projection,days:[]}],
 [{...projection,days:projection.days.map(d=>({...d,id:'foreign'}))}],[{...projection,days:projection.days.map(d=>({...d,contextNotes:[null]}))}]])
 assert.deepEqual(merge(trip,invalid),{ok:false,reason:'invalid'});
});
test('successful dispatched recommendation replaces only generated context and retires only that unit',()=>{
 const trip=fixture();const unit=pendingBuilderReconciliationUnits(trip).find(u=>u.kind==='recommendation')!;
 const before=structuredClone(trip);const projection=builderRecommendationProjection(trip,unit.targetId,[place]);
 const result=merge(trip,[{...projection,days:projection.days.map(d=>({...d,title:'Injected title',notes:['Injected activity'],bookingUrl:'Injected booking'}))}]);assert.ok(result.ok);
 assert.deepEqual(result.trip.stops,before.stops);assert.deepEqual(result.trip.legs,before.legs);assert.deepEqual(result.trip.brief.bookings,before.brief.bookings);
 assert.deepEqual(result.trip.planItems.map(({contextNotes,...day})=>day),before.planItems.map(({contextNotes,...day})=>day));
 assert.deepEqual(result.trip.planItems.filter(d=>d.stopId!==unit.targetId),before.planItems.filter(d=>d.stopId!==unit.targetId));
 assert.ok(result.trip.planItems.some(d=>d.contextNotes?.includes(place.description)));
 assert.deepEqual(result.trip.brief.cascadeStatus?.routeReconciliation?.residual.filter(u=>u.kind==='recommendation'),before.brief.cascadeStatus?.routeReconciliation?.residual.filter(u=>u.kind==='recommendation'&&u.targetId!==unit.targetId));
});
test('provider unavailable, malformed, and successful empty results remain distinct',async()=>{
 const original=globalThis.fetch;const trip=fixture();const stop=trip.stops[0]!;
 try {
  for(const body of [{places:[],unavailable:true},{places:[{...place,cost:'money'}]},{places:[{...place,coordinates:[999,0]}]},{}]) {
   globalThis.fetch=async()=>Response.json(body);await assert.rejects(resolveBuilderRecommendation(trip,stop.id,new AbortController().signal));
  }
  globalThis.fetch=async()=>Response.json({places:[]});const empty=await resolveBuilderRecommendation(trip,stop.id,new AbortController().signal);
  assert.deepEqual(empty,builderRecommendationProjection(trip,stop.id,[]));
  globalThis.fetch=async()=>Response.json({places:[place]});const populated=await resolveBuilderRecommendation(trip,stop.id,new AbortController().signal);
  assert.ok(populated.days.some(d=>d.contextNotes.includes(place.description)));
 }finally{globalThis.fetch=original}
});
test('aborted discovery cannot return a projection even if a provider ignores cancellation',async()=>{
 const original=globalThis.fetch;const trip=fixture();const controller=new AbortController();
 try{globalThis.fetch=async()=>{controller.abort();return Response.json({places:[place]})};await assert.rejects(resolveBuilderRecommendation(trip,trip.stops[0]!.id,controller.signal),{name:'AbortError'})}finally{globalThis.fetch=original}
});
