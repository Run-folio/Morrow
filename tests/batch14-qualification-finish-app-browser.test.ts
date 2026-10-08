import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderBuilder} from './helpers/builder-render.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-finish.json',import.meta.url),'utf8'));
const fold=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
test('A20 actual Hanoi/Hà Nội finish choice fills endpoint facts only after deliberate acceptance and survives save/reload',{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(structuredClone(fixtures.A20.trip))));let writes=0;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,geocodeCandidates:fixtures.A20.geocodeCandidates,accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};const next=requireReadableTripDocument(trip);assert.equal(next.id,cloud.id);assert.equal(next.ownerId,cloud.ownerId);
  if(next.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed'}};
  writes++;cloud={...next,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});view.page.setDefaultTimeout(5000);
 try{
  await view.page.locator('[data-builder-top-controls]').waitFor();const before=structuredClone(cloud),beforeWrites=writes;
  await view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).click();const dialog=view.page.getByRole('dialog');
  const option=dialog.getByRole('button').filter({hasText:'Hà Nội'}).filter({hasText:'Vietnam'});
  await view.page.waitForFunction(()=>{const dialog=document.querySelector('[role=dialog]');return dialog?.textContent?.includes("We couldn't confirm this place")||[...dialog?.querySelectorAll('button')??[]].some(button=>button.textContent?.includes('Hà Nội'));});
  assert.equal(view.geocodeRequests().Hanoi,1,'The actual captured candidate must reach the mounted confirmation lookup');
  assert.equal(await option.count(),1,'The proven actual Hanoi/Hà Nội city identity must be offered for deliberate confirmation');assert.equal(writes,beforeWrites,'A lookup must not save before acceptance');assert.deepEqual(cloud,before);
  await option.click();for(let i=0;i<50;i++){const end=cloud.brief.intent.route.journeyEnd;if(end.mode==='explicit'&&end.place.coordinates)break;await view.page.waitForTimeout(100);}
  const end=cloud.brief.intent.route.journeyEnd;assert.equal(end.mode,'explicit');assert(end.mode==='explicit');assert.equal(end.place.name,'Hanoi');assert.equal(end.place.canonicalPlaceId,before.brief.intent.route.journeyEnd.mode==='explicit'&&before.brief.intent.route.journeyEnd.place.canonicalPlaceId);
  assert.deepEqual(end.place.coordinates,[105.854041,21.0283334]);assert.deepEqual(cloud.stops,before.stops);assert.deepEqual(cloud.planItems,before.planItems);assert.deepEqual(cloud.brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);assert.equal(cloud.brief.intent.route.orderAuthority,before.brief.intent.route.orderAuthority);
  await view.page.reload();await view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).count(),0);assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
for(const invalid of ['foreign-country','incompatible-geography','different-place'] as const)test(`A20 confirmation rejects ${invalid} while retaining the unconfirmed source finish`,{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(structuredClone(fixtures.A20.trip))));let writes=0;
 const candidate=structuredClone(fixtures.A20.geocodeCandidates.Hanoi[0]);
 if(invalid==='foreign-country')candidate.country='Canada';
 if(invalid==='incompatible-geography')candidate.coordinates=[-79.4,43.7];
 if(invalid==='different-place'){candidate.name='Hạ Long';candidate.canonicalPlaceId='open-world:nominatim:relation:999999';candidate.providerId='nominatim:relation:999999';candidate.coordinates=[107.08,20.95];}
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,geocodeCandidates:{Hanoi:[candidate]},accountRequest:({method})=>{if(method==='GET')return {status:200,body:{trip:cloud}};writes++;throw new Error('Invalid confirmation must never write');}});view.page.setDefaultTimeout(5000);
 try{
  await view.page.locator('[data-builder-top-controls]').waitFor();const before=structuredClone(cloud);
  await view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).click();const dialog=view.page.getByRole('dialog');
  await dialog.getByText("We couldn't confirm this place. Close and try again.",{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button').filter({hasText:/Hà Nội|Hạ Long/}).count(),0);assert.equal(writes,0);assert.deepEqual(cloud,before);assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
