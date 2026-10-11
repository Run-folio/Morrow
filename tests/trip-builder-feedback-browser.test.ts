import assert from 'node:assert/strict';
import test from 'node:test';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';

async function fixture() {
  const trip=canonicalTripForOwner('feedback-owner',canonicalRouteFixture());trip.id='feedback-fixture';trip.brief.bookings=[];
  let writes=0;
  const view=await renderBuilder({initialTrip:trip,ownerId:'feedback-owner',query:`?trip=${trip.id}&recover=1`,accountRequest:({method})=>{if(method!=='GET')writes++;return{status:200,body:{trip}}}});
  await view.page.locator('[data-builder-edit-session="active"]').waitFor();
  const document=()=>view.page.evaluate((id: string)=>{
    const records=Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')&&k.includes(id)).map(k=>localStorage.getItem(k)!);
    return records.map(raw=>({raw,trip:JSON.parse(raw).trip}));
  },trip.id);
  const night=async()=>{for(const button of await view.page.getByRole('button',{name:/^Add one night to/}).all())if(await button.isEnabled()){await button.click();return;}throw new Error('No editable night control');};
  return {...view,document,night,writes:()=>writes};
}
for(const denial of ['QuotaExceededError','SecurityError'])test(`rejected ${denial} night edit retains recovery and emits no success or Undo`,{skip:!builderBrowserTestsEnabled,timeout:30000},async()=>{
 const v=await fixture();try{
  const before=await v.document();
  await v.page.evaluate((name: string)=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('easyt:trip-recovery:'))throw new DOMException('Fixture denied',name);return original.call(this,key,value)}},denial);
  await v.night();assert.deepEqual(await v.document(),before);assert.equal(v.writes(),0);
  assert.equal(await v.page.getByText('Trip updated',{exact:true}).count(),0);assert.equal(await v.page.getByRole('button',{name:'Undo',exact:true}).count(),0);
  assert.match((await v.page.getByRole('alert').allTextContents()).join(' '),/could not be saved on this device/);
 }finally{await v.close()}
});
test('accepted nights Undo preserves dates and activities; rejected retry retains the previous usable Undo', {skip:!builderBrowserTestsEnabled,timeout:30000},async()=>{
 const v=await fixture();try{
  const before=(await v.document())[0].trip;await v.night();
  assert.equal(await v.page.getByText('Trip updated',{exact:true}).count(),1);
  const changed=(await v.document())[0].trip;assert.notDeepEqual(changed.stops.map((s:any)=>s.nights),before.stops.map((s:any)=>s.nights));
  await v.page.evaluate(()=>{const original=Storage.prototype.setItem;(window as any).restoreFeedbackStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(key,value){if(key.startsWith('easyt:trip-recovery:'))throw new DOMException('Fixture denied','SecurityError');return original.call(this,key,value)}});
  await v.night();assert.deepEqual((await v.document())[0].trip,changed);await v.page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await v.document())[0].trip,changed);
  await v.page.evaluate(()=>(window as any).restoreFeedbackStorage());await v.page.getByRole('button',{name:'Undo',exact:true}).click();
  const restored=(await v.document())[0].trip;
  assert.deepEqual(restored.stops.map((s:any)=>[s.id,s.nights]),before.stops.map((s:any)=>[s.id,s.nights]));
  assert.equal(restored.startDate,before.startDate);assert.equal(restored.endDate,before.endDate);assert.deepEqual(restored.planItems,before.planItems);
  assert.equal(await v.page.getByRole('button',{name:'Undo',exact:true}).count(),0);assert.equal(v.writes(),0);
 }finally{await v.close()}
});
test('rapid accepted night clicks bind Undo to the latest accepted operation', {skip:!builderBrowserTestsEnabled,timeout:30000},async()=>{
 const v=await fixture();try{
  await v.night();const beforeLatest=(await v.document())[0].trip;await v.night();
  assert.equal(await v.page.getByText('Trip updated',{exact:true}).count(),1);
  await v.page.getByRole('button',{name:'Undo',exact:true}).click();const restored=(await v.document())[0].trip;
  assert.deepEqual(restored.stops.map((s:any)=>[s.id,s.nights]),beforeLatest.stops.map((s:any)=>[s.id,s.nights]));
  assert.equal(restored.startDate,beforeLatest.startDate);assert.equal(restored.endDate,beforeLatest.endDate);assert.deepEqual(restored.planItems,beforeLatest.planItems);
 }finally{await v.close()}
});
