import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
async function fixture(discoveryRequest?:NonNullable<Parameters<typeof renderBuilder>[0]>['discoveryRequest']) {
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
 cloud.planItems[1]={...cloud.planItems[1]!,notes:['My booked museum'],noteDayParts:['morning'],startsAt:'10:00',endsAt:'12:00',bookingUrl:'https://example.invalid/booking',contextNotes:['Old generated guidance']};
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,discoveryRequest,accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};
  const candidate=requireReadableTripDocument(trip);
  if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'Changed'}};
  cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});
 await view.page.locator('[data-builder-edit-session="active"]').waitFor();
 return {view,cloud:()=>cloud};
}
async function until(view:Awaited<ReturnType<typeof renderBuilder>>,condition:()=>boolean){for(let i=0;i<60;i++){if(condition())return;await view.page.waitForTimeout(100)}assert.ok(condition(),'Cloud projection did not reach the expected state')}
const failed=(trip:ReturnType<typeof requireReadableTripDocument>)=>trip.brief.cascadeStatus?.routeReconciliation?.residual.filter(unit=>unit.kind==='recommendation'&&unit.phase==='failed')??[];
const remaining=(trip:ReturnType<typeof requireReadableTripDocument>)=>trip.brief.cascadeStatus?.routeReconciliation?.residual.filter(unit=>unit.kind==='recommendation')??[];
const authored=(trip:ReturnType<typeof requireReadableTripDocument>)=>trip.planItems.map(({contextNotes,...day})=>day);
test('review budget reproduction completes with an available empty shortlist and autosaves generated context',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();const before=structuredClone(h.cloud());
 try{
  await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
  await until(h.view,()=>h.cloud().brief.budgetBand==='high'&&remaining(h.cloud()).length===0);
  assert.deepEqual(authored(h.cloud()),authored(before));assert.deepEqual(h.cloud().stops,before.stops);assert.deepEqual(h.cloud().legs,before.legs);
  assert.notDeepEqual(h.cloud().planItems[1]!.contextNotes,before.planItems[1]!.contextNotes);
  await h.view.page.getByText('Saved to your account',{exact:true}).first().waitFor();
  await h.view.page.reload();await h.view.page.locator('[data-builder-edit-session="active"]').waitFor();
  assert.equal(remaining(h.cloud()).length,0);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('budget and travellers refresh discovered day guidance while preserving manual route and authored choices',{skip:!enabled,timeout:30000},async()=>{
 let requests=0;let description='Budget generation';
 const h=await fixture(()=>{requests++;return {status:200,body:{places:[{title:'Museum',area:'Centre',type:'Museum',cost:0.5,tags:['Cities'],description}]}}});const before=structuredClone(h.cloud());
 try{
  await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
  await until(h.view,()=>h.cloud().brief.budgetBand==='high'&&remaining(h.cloud()).length===0);
  assert.ok(h.cloud().planItems.some(d=>d.contextNotes?.includes('Budget generation')));
  const afterBudget=requests;description='Traveller generation';await h.view.page.getByRole('button',{name:/Increase travellers/}).click();
  await until(h.view,()=>h.cloud().travellers===3&&remaining(h.cloud()).length===0);
  assert.ok(requests>=afterBudget+3);assert.ok(h.cloud().planItems.some(d=>d.contextNotes?.includes('Traveller generation')));
  assert.deepEqual(authored(h.cloud()),authored(before));assert.deepEqual(h.cloud().legs,before.legs);assert.deepEqual(h.cloud().stops,before.stops);
  assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);assert.deepEqual(h.cloud().brief.bookings,before.brief.bookings);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('real unavailable result survives save and reload then targeted retry succeeds without clearing sibling failures',{skip:!enabled,timeout:30000},async()=>{
 let unavailable=false;
 const h=await fixture(()=>({status:200,body:unavailable?{places:[],unavailable:true}:{places:[{title:'Museum',area:'Centre',type:'Museum',cost:0.5,tags:['Cities'],description:'Recovered provider guidance'}]}}));
 try{
  unavailable=true;await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
  await until(h.view,()=>h.cloud().brief.budgetBand==='high'&&failed(h.cloud()).length===3);
  await h.view.page.getByText('Saved to your account',{exact:true}).first().waitFor();
  const untouched=structuredClone(h.cloud());await h.view.page.reload();await h.view.page.locator('[data-builder-edit-session="active"]').waitFor();
  assert.equal(failed(h.cloud()).length,3);unavailable=false;
  const target=failed(h.cloud())[0]!.targetId;
  await h.view.page.getByRole('button',{name:'Try again',exact:true}).first().click();await until(h.view,()=>failed(h.cloud()).length===2&&remaining(h.cloud()).length===2);
  assert.deepEqual(h.cloud().planItems.filter(d=>d.stopId!==target),untouched.planItems.filter(d=>d.stopId!==target));
  assert.ok(h.cloud().planItems.some(d=>d.stopId===target&&d.contextNotes?.includes('Recovered provider guidance')));
  for(const count of [1,0]){await h.view.page.getByRole('button',{name:'Try again',exact:true}).first().click();await until(h.view,()=>remaining(h.cloud()).length===count)}
  assert.deepEqual(authored(h.cloud()),authored(untouched));assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
