import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync} from 'node:fs';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {gatewayReturnTrip} from './fixtures/gateway-return.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {missingReturnJourney} from '../lib/easyt/missing-return-journey.ts';

for(const browserName of ['chromium','webkit'] as const)for(const language of ['en','es'] as const)for(const account of [false,true]){
 test(`${browserName} ${language} ${account?'account fixture':'guest'} restores a missing return, preserves booking and reloads two journeys`,{skip:!builderBrowserTestsEnabled,timeout:90_000},async()=>{
  const generated=gatewayReturnTrip(),booked=markTransportLegBooked(generated,generated.legs[0].id,{confirmation:'KEEP-OUTBOUND',note:'Preserve this synthetic note'});
  booked.legs=booked.legs.slice(0,-1);let cloud=account?canonicalTripForOwner('owner-a',booked):requireReadableTripDocument(booked),puts=0;
  const before=JSON.parse(JSON.stringify(cloud)),plan=missingReturnJourney(cloud);assert.equal(plan.kind,'repairable');if(plan.kind!=='repairable')return;
  const view=await renderBuilder({initialTrip:account?undefined:cloud,shellCanonicalTrip:account?()=>cloud:undefined,seedRecovery:!account,ownerId:account?'owner-a':undefined,
   path:`/journey/${cloud.id}/transport`,browserName,styled:true,language,offlineOnly:true,
   accountRequest:({method,trip})=>{if(method==='GET')return {status:200,body:{trip:cloud}};puts++;cloud=requireReadableTripDocument({...trip as object,updatedAt:nextTripUpdatedAt(cloud.updatedAt)});return {status:200,body:{trip:cloud}};}});
  try{
   const page=view.page;await page.setViewportSize({width:320,height:1000});const cards=page.locator('[data-transport-leg-id]');await cards.first().waitFor();assert.equal(await cards.count(),1);assert.equal(puts,0);
   const name=language==='es'?'Añadir trayecto de regreso':'Add return journey',repair=page.getByRole('button',{name,exact:true});await repair.waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>/^(Add return journey|Añadir trayecto de regreso)$/.test(button.textContent??'')&&!button.disabled));
   await repair.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelectorAll('[data-transport-leg-id]').length===2);
   const last=page.locator(`[data-transport-leg-id="${plan.legId}"]`);await last.locator('[data-tone="attention"]').waitFor();assert.equal(await last.getAttribute('data-presentation-state'),'needs-checking');
   await page.waitForFunction((id:string)=>document.activeElement?.closest('[data-transport-leg-id]')?.getAttribute('data-transport-leg-id')===id,plan.legId);
   assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
   assert.equal(await last.locator('a[data-affiliate-provider]').count(),0,'unknown restored transport must not become a booking search');
   await last.getByRole('button',{name:'Change transport mode',exact:true}).waitFor();
   if(account){await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent?.includes('Saved to your account')));assert.equal(puts,1);assert.deepEqual(JSON.parse(JSON.stringify(cloud.legs[0])),before.legs[0]);assert.deepEqual(JSON.parse(JSON.stringify(cloud.brief.bookings)),before.brief.bookings);}
   await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-transport-leg-id]').length===2);assert.equal(await cards.count(),2);await last.locator('[data-tone="attention"]').waitFor();assert.equal(await last.getAttribute('data-presentation-state'),'needs-checking');assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
   const documents=await page.evaluate((id:string)=>Object.keys(localStorage).flatMap(key=>{try{const record=JSON.parse(localStorage.getItem(key)!);const trip=record?.trip??record;return trip?.id===id&&trip.legs?.length===2?[trip]:[];}catch{return [];}}),cloud.id);
   assert.ok(documents.length,'reload must have a retained two-leg document');
   for(const document of documents){assert.equal(document.brief.bookings[0].confirmation,'KEEP-OUTBOUND');assert.equal(document.brief.bookings[0].travellerMarkedBooked,true);assert.deepEqual(document.legs[0],before.legs[0]);}
   assert.equal(puts,account?1:0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(view.errors,[]);
   const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifacts){mkdirSync(artifacts,{recursive:true});const summary=last.locator('[data-transport-summary] button');if(await summary.getAttribute('aria-expanded')==='false')await summary.press('Enter');await page.screenshot({path:`${artifacts}/return-repaired-${browserName}-${language}-${account?'account':'guest'}-320.png`,fullPage:true});}
  }finally{await view.close();}
 });
}

for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: one-way and orphan-booking states cannot expose a repair write`,{skip:!builderBrowserTestsEnabled,timeout:60_000},async()=>{
 for(const kind of ['one-way','orphan-booking']){
  const complete=gatewayReturnTrip(kind==='one-way'?{mode:'unknown'}:{mode:'same_as_start'});
  const trip=kind==='one-way'?complete:markTransportLegBooked(complete,complete.legs.at(-1)!.id,{confirmation:'PROTECTED-RETURN'});if(kind!=='one-way')trip.legs=trip.legs.slice(0,-1);
  let writes=0;const view=await renderBuilder({initialTrip:trip,path:`/journey/${trip.id}/transport`,browserName,styled:true,offlineOnly:true,accountRequest:()=>{writes++;return {status:500,body:{}};}});
  try{await view.page.locator('[data-transport-leg-id]').first().waitFor();assert.equal(await view.page.getByRole('button',{name:'Add return journey',exact:true}).count(),0);assert.equal(writes,0);
   if(kind==='orphan-booking')await view.page.getByRole('link',{name:'Review route',exact:true}).waitFor();
   await view.page.reload();await view.page.locator('[data-transport-leg-id]').first().waitFor();assert.equal(await view.page.locator('[data-transport-leg-id]').count(),1);assert.equal(writes,0);assert.deepEqual(view.errors,[]);
  }finally{await view.close();}
 }
});

for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: refused device storage cannot apply a repair or alter the saved source`,{skip:!builderBrowserTestsEnabled,timeout:60_000},async()=>{
 const generated=gatewayReturnTrip(),trip=markTransportLegBooked(generated,generated.legs[0].id,{confirmation:'PRESERVE-FAILED-REPAIR'});trip.legs=trip.legs.slice(0,-1);let writes=0;
 const view=await renderBuilder({initialTrip:trip,path:`/journey/${trip.id}/transport`,browserName,styled:true,offlineOnly:true,accountRequest:({method})=>{if(method!=='GET')writes++;return {status:404,body:{}};}});
 try{
  const page=view.page,repair=page.getByRole('button',{name:'Add return journey',exact:true});await repair.waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Add return journey'&&!button.disabled));
  const before=await page.evaluate(()=>Object.entries(localStorage).sort());
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key:string,value:string){if(key.startsWith('easyt:trip-recovery:v2:'))throw new DOMException('Synthetic test refusal','SecurityError');return original.call(this,key,value);};});
  await repair.press('Enter');await page.getByText(/Browser storage is unavailable, so this change was not applied/).waitFor();
  assert.equal(await page.locator('[data-transport-leg-id]').count(),1);assert.equal(writes,0);
  assert.deepEqual(await page.evaluate(()=>Object.entries(localStorage).sort()),before);assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});
