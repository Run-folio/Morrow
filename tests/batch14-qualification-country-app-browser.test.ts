import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderBuilder} from './helpers/builder-render.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {routeIntentFromHandoff} from '../lib/easyt/trip-route-intent.ts';
import {eligibleCountryContextIntentIds} from '../lib/easyt/trip-country-context.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-country.json',import.meta.url),'utf8'));
for(const key of ['A02','A15'])test(`${key} mounted existing-v2 context correction uses normal scoped autosave and survives reload`,{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(structuredClone(fixtures[key].trip))));const before=structuredClone(cloud),country=key==='A02'?'Italy':'Nicaragua',countryId=cloud.brief.intent.route.destinations.find(i=>i.sourceText===country)!.id;let writes=0;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};const next=requireReadableTripDocument(trip);assert.equal(next.id,before.id);assert.equal(next.ownerId,before.ownerId);assert.equal(next.updatedAt,cloud.updatedAt);writes++;cloud={...next,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});view.page.setDefaultTimeout(5000);
 try{
  await view.page.locator('[data-builder-edit-session="active"]').waitFor();for(let i=0;i<50&&cloud.brief.intent.route.destinations.some(d=>d.id===countryId);i++)await view.page.waitForTimeout(100);
  assert(!cloud.brief.intent.route.destinations.some(i=>i.id===countryId),'A proven context correction must persist through the existing accepted-edit queue');assert(writes>0);
  assert.deepEqual(cloud.legs,before.legs);assert.deepEqual(cloud.stops,before.stops);assert.deepEqual(cloud.planItems,before.planItems);assert.deepEqual(cloud.brief.intent.hardConstraints,before.brief.intent.hardConstraints);assert.deepEqual(cloud.brief.intent.route.journeyEnd,before.brief.intent.route.journeyEnd);assert.equal(cloud.brief.intent.route.orderAuthority,before.brief.intent.route.orderAuthority);assert.deepEqual(cloud.brief.structuredBrief!.placeMentions,before.brief.structuredBrief!.placeMentions);assert.deepEqual(cloud.brief.structuredBrief!.countries,before.brief.structuredBrief!.countries);
  await view.page.waitForFunction(()=>document.body.textContent?.includes('Saved to your account'));await view.page.reload();await view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await view.page.locator(`[data-destination-intent-id="${countryId}"]`).count(),0);assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
test('A15 a later authored country-night request stays visible and is never auto-corrected',{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(structuredClone(fixtures.A15.trip))));const intent=cloud.brief.intent.route.destinations.find(i=>i.sourceText==='Nicaragua')!;intent.requestedNights=4;const before=structuredClone(cloud);let writes=0;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method})=>{if(method==='GET')return {status:200,body:{trip:cloud}};writes++;throw new Error('Authored country must remain preserved');}});
 try{await view.page.locator('[data-builder-top-controls]').waitFor();await view.page.waitForTimeout(500);assert.equal(await view.page.locator(`[data-destination-intent-id="${intent.id}"]`).count(),1);assert.deepEqual(cloud,before);assert.equal(writes,0);assert.deepEqual(view.errors,[]);}finally{await view.close()}
});
for(const suffix of ['', ' 4 nights', ' is essential'])test(`A15 successive actual city choices preserve occurrence intent${suffix||' context'} after both resolve`,{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(structuredClone(fixtures.A15.beforeClarificationTrip))));
 if(suffix){
  const brief=cloud.brief.structuredBrief!;brief.source.rawPrompt=brief.source.rawPrompt!.replace('in Nicaragua,','in Nicaragua'+suffix+',');
  if(suffix===' is essential')brief.placeMentions!.find(m=>m.sourceText==='Nicaragua')!.role='required';
  cloud.brief.intent.route.destinations=routeIntentFromHandoff({structuredBrief:brief,brief:brief.source.rawPrompt},cloud.stops).destinations;
  cloud=requireReadableTripDocument(cloud);
 }
 const before=structuredClone(cloud),countryId=cloud.brief.intent.route.destinations.find(i=>i.sourceText==='Nicaragua')!.id;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,geocodeCandidates:fixtures.A15.geocodeCandidates,accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};const next=requireReadableTripDocument(trip);assert.equal(next.updatedAt,cloud.updatedAt);cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',next,nextTripUpdatedAt(cloud.updatedAt)));return {status:200,body:{trip:cloud}};
 }});view.page.setDefaultTimeout(5000);
 try{
  await view.page.locator('[data-builder-top-controls]').waitFor();
  for(const source of ['Granada','León']){
   const dialog=view.page.getByRole('dialog').last();
   if(await dialog.isVisible().catch(()=>false))await dialog.getByRole('button',{name:'Finish later',exact:true}).click();
   await view.page.getByRole('button',{name:new RegExp('^Choose place.*'+source,'i')}).first().click();await dialog.waitFor();
   if(!await dialog.getByRole('combobox').first().isVisible().catch(()=>false))await dialog.getByRole('button').filter({hasText:/Search.*specific|Search for a place/i}).first().click();
   await dialog.getByRole('combobox').first().fill(source);await view.page.getByRole('option').filter({hasText:source}).filter({hasText:'Nicaragua'}).first().click();
   for(let i=0;i<50&&!cloud.brief.intent.route.destinations.some(d=>d.sourceText===source&&d.resolution==='resolved'&&d.stopIds.length);i++)await view.page.waitForTimeout(100);
   assert(cloud.brief.intent.route.destinations.some(d=>d.sourceText===source&&d.resolution==='resolved'&&d.stopIds.length));
   if(source==='Granada')assert(cloud.brief.intent.route.destinations.some(d=>d.id===countryId),'One unresolved city is insufficient geographic proof');
   if(await dialog.isVisible().catch(()=>false))await dialog.getByRole('button',{name:'Finish later',exact:true}).click();
  }
  if(suffix){
   await view.page.waitForTimeout(400);const country=cloud.brief.intent.route.destinations.find(d=>d.id===countryId);assert(country,'An attached country request must remain actionable');assert.equal(country.routeMembership,'required');
   if(suffix===' 4 nights')assert.equal(country.requestedNights,4);
  }else{
   for(let i=0;i<50&&cloud.brief.intent.route.destinations.some(d=>d.id===countryId);i++)await view.page.waitForTimeout(100);
   assert(!cloud.brief.intent.route.destinations.some(d=>d.id===countryId),'The accepted correction must follow completed ordinary clarification');
  }
  assert.equal(cloud.stops.length,2);assert(cloud.stops.every(s=>s.country==='Nicaragua'));assert.equal(cloud.brief.structuredBrief!.source.rawPrompt,before.brief.structuredBrief!.source.rawPrompt);assert.equal(cloud.brief.intent.route.orderAuthority,before.brief.intent.route.orderAuthority);assert.deepEqual(cloud.brief.intent.route.journeyEnd,before.brief.intent.route.journeyEnd);
  await view.page.getByText('Saved to your account',{exact:true}).waitFor();const stops=structuredClone(cloud.stops);await view.page.reload();await view.page.locator('[data-builder-top-controls]').waitFor();assert.deepEqual(cloud.stops,stops);assert.equal(await view.page.locator(`[data-destination-intent-id="${countryId}"]`).count(),suffix?1:0);assert.deepEqual(view.errors,[]);
 }catch(error){throw new Error(`${String(error)}; eligible=${JSON.stringify(eligibleCountryContextIntentIds(cloud))}; country=${JSON.stringify(cloud.brief.intent.route.destinations.find(d=>d.id===countryId))}; body=${(await view.page.locator('body').innerText()).slice(-1800)}`,{cause:error})}finally{await view.close()}
});
