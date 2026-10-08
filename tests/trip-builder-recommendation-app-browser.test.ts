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
  const targetRow=h.view.page.locator('[data-builder-route-workspace]').getByRole('row').filter({has:h.view.page.getByText(h.cloud().stops.find(stop=>stop.id===target)!.name,{exact:true})});
  assert.equal(await targetRow.getByRole('button',{name:'Try again',exact:true}).count(),1,'retry belongs to its affected stop row');assert.equal(await h.view.page.getByRole('button',{name:'Review trip',exact:true}).count(),0);
  await targetRow.getByRole('button',{name:'Try again',exact:true}).click();await until(h.view,()=>failed(h.cloud()).length===2&&remaining(h.cloud()).length===2);
  assert.deepEqual(h.cloud().planItems.filter(d=>d.stopId!==target),untouched.planItems.filter(d=>d.stopId!==target));
  assert.ok(h.cloud().planItems.some(d=>d.stopId===target&&d.contextNotes?.includes('Recovered provider guidance')));
  for(const count of [1,0]){await h.view.page.getByRole('button',{name:'Try again',exact:true}).first().click();await until(h.view,()=>remaining(h.cloud()).length===count)}
  assert.deepEqual(authored(h.cloud()),authored(untouched));assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('failed gateway with pending recommendation group persists exact residual and resumes only pending after reload',{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
 let phase='initial';let transferCalls=0;const discoveries:string[]=[];let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,
 geocodeCandidates:{Paris:[{name:'Paris',country:'France',canonicalPlaceId:'paris',coordinates:[2.3522,48.8566],placeType:'city',routability:'direct_destination'}]},
 transferRequest:({legs})=>{if(legs.length===1)transferCalls++;return {status:503,body:{error:'Fixture transfer unavailable'}}},
 discoveryRequest:async (destination,context)=>{if(context.cacheControl!=='no-cache')return {status:200,body:{places:[]}};discoveries.push(destination);if(phase==='initial')return {status:200,body:{places:[]}};
   if(destination==='Hiroshima'&&phase==='edit')await held;
   return {status:200,body:destination==='Kyoto'?{places:[],unavailable:true}:{places:[{title:'Museum',area:'Centre',type:'Museum',cost:0.5,tags:['Cities'],description:'Current recovered guidance'}]}};
 },accountRequest:({method,trip})=>{if(method==='GET')return {status:200,body:{trip:cloud}};const candidate=requireReadableTripDocument(trip);if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed'}};cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}}}});
 const residual=()=>cloud.brief.cascadeStatus?.routeReconciliation?.residual??[];
 const untilCondition=async(condition:()=>boolean)=>{for(let i=0;i<70&&!condition();i++)await view.page.waitForTimeout(100);assert.ok(condition(),JSON.stringify(residual()))};
 try{
 await view.page.locator('[data-builder-edit-session="active"]').waitFor();phase='edit';
 await view.page.locator('#builder-origin').getByRole('combobox',{name:'Start from',exact:true}).fill('Paris');await view.page.getByRole('option',{name:/^Paris.*France/}).first().click();
 await untilCondition(()=>residual().some(u=>u.kind==='leg'&&u.phase==='failed'));
 await view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
 await untilCondition(()=>cloud.brief.budgetBand==='high'&&residual().filter(u=>u.kind==='recommendation'&&u.phase==='pending').length===3);
 const saved=structuredClone(residual());assert.equal(saved.filter(u=>u.phase==='pending').length,3);assert.ok(saved.some(u=>u.kind==='leg'&&u.phase==='failed'));
 assert.equal(await view.page.getByText('Route details up to date',{exact:true}).count(),0);
 const callsBefore=transferCalls;const requestsBefore=discoveries.length;phase='reload';
 await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();
 await untilCondition(()=>residual().every(u=>u.phase==='failed'));
 assert.deepEqual(residual().filter(u=>u.kind==='leg'),saved.filter(u=>u.kind==='leg'));assert.deepEqual(residual().filter(u=>u.kind==='recommendation').map(u=>({kind:u.kind,targetId:u.targetId,phase:u.phase})),[{kind:'recommendation',targetId:cloud.stops.find(s=>s.name==='Kyoto')!.id,phase:'failed'}]);assert.equal(transferCalls,callsBefore,'failed gateway is never retried automatically');
 assert.deepEqual(discoveries.slice(requestsBefore).sort(),['Hiroshima','Kyoto','Tokyo'],'only the pending recommendation group resumes');
 assert.deepEqual(view.errors,[]);
 }finally{release();await view.close()}
});
