import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {repeatedTokyoTrip} from './fixtures/repeated-tokyo-stay.ts';

for(const browserName of ['chromium','webkit'] as const)for(const returning of [true,false])test(`${browserName}: repeated Tokyo stay nights/removal persist; ${returning?'return endpoint remains separate':'one-way stays one-way'}`,{skip:!builderBrowserTestsEnabled,timeout:60000},async()=>{
 const trip=repeatedTokyoTrip(returning),bookings=JSON.stringify(trip.brief.bookings);
 const view=await renderBuilder({initialTrip:trip,query:`?trip=${trip.id}&recover=1`,browserName,styled:true,offlineOnly:true});
 const page=view.page;page.setDefaultTimeout(10000);
 try{
  await page.locator('[data-builder-edit-session="active"]').waitFor();
  const rows=page.locator('[data-builder-stop-id]'),last=page.locator('[data-builder-stop-id="tokyo-return-stay"]');await last.waitFor();
  assert.equal(await rows.count(),4);assert.equal(await rows.first().getByRole('button',{name:/Add one night/}).isDisabled(),true,'booked first occurrence stays protected');
  const plus=last.getByRole('button',{name:/Add one night/});assert.equal(await plus.isEnabled(),true);await plus.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-builder-stop-id="tokyo-return-stay"] [data-builder-nights] strong')?.textContent==='1');
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();await last.locator('[data-builder-nights] strong').filter({hasText:'1'}).waitFor();
  const endpoint=page.locator('[data-builder-endpoint-leg-id]');assert.equal(await endpoint.count(),returning?1:0);
  if(returning){assert.match(await endpoint.innerText(),/Return[\s\S]*London/);assert.equal(await endpoint.getByRole('button',{name:/Add one night|Remove stop/}).count(),0);}
  await page.setViewportSize({width:320,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const dir=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(dir){mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/tokyo-editable-${browserName}-${returning?'return':'one-way'}-320.png`,fullPage:true});}
  await last.getByRole('button',{name:/Remove one night/}).click();await page.waitForFunction(()=>document.querySelector('[data-builder-stop-id="tokyo-return-stay"] [data-builder-nights] strong')?.textContent==='0');
  await last.getByLabel('Actions for Tokyo',{exact:true}).click();await last.getByRole('button',{name:'Remove stop',exact:true}).click();
  const confirm=page.getByRole('button',{name:'Remove Tokyo',exact:true});if(await confirm.isVisible())await confirm.click();
  await last.waitFor({state:'detached'});assert.equal(await rows.count(),3);
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();assert.equal(await rows.count(),3);assert.equal(await last.count(),0);assert.equal(await endpoint.count(),returning?1:0);
  const retained=await page.evaluate((id:string)=>Object.values(localStorage).flatMap(raw=>{try{const record=JSON.parse(raw),t=record?.trip??record;return t?.id===id&&Array.isArray(t.stops)&&t.stops.length===3?[t]:[]}catch{return []}}),trip.id);
  assert.ok(retained.length);for(const saved of retained)assert.equal(JSON.stringify(saved.brief.bookings),bookings);assert.deepEqual(view.errors,[]);
 }catch(error){const dir=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/failure-${browserName}-${returning}.txt`,await page.locator('body').innerText());await page.screenshot({path:`${dir}/failure-${browserName}-${returning}.png`,fullPage:true});}throw error;}finally{await view.close();}
});
for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: account fixture saves the repeated visit's nights and removal without changing the booked occurrence`,{skip:!builderBrowserTestsEnabled,timeout:60000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',repeatedTokyoTrip())),puts=0;const before=JSON.stringify(cloud.brief.bookings),id=cloud.stops.at(-1)!.id;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,browserName,styled:true,offlineOnly:true,
  accountRequest:({method,trip})=>{if(method==='GET')return {status:200,body:{trip:cloud}};puts++;cloud=requireReadableTripDocument({...trip as object,updatedAt:nextTripUpdatedAt(cloud.updatedAt)});return {status:200,body:{trip:cloud}};}});
 try{
  const page=view.page;page.setDefaultTimeout(10000);await page.locator('[data-builder-edit-session="active"]').waitFor();const row=page.locator(`[data-builder-stop-id="${id}"]`);
  await row.getByRole('button',{name:/Add one night/}).click();for(let i=0;i<100&&cloud.stops.at(-1)!.nights!==1;i++)await page.waitForTimeout(50);assert.equal(cloud.stops.at(-1)!.nights,1);assert.ok(puts>0);assert.equal(JSON.stringify(cloud.brief.bookings),before);
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();await row.locator('[data-builder-nights] strong').filter({hasText:'1'}).waitFor();
  await row.getByLabel('Actions for Tokyo',{exact:true}).click();await row.getByRole('button',{name:'Remove stop',exact:true}).click();const confirm=page.getByRole('button',{name:'Remove Tokyo',exact:true});if(await confirm.isVisible())await confirm.click();await row.waitFor({state:'detached'});
  for(let i=0;i<100&&cloud.stops.some(s=>s.id===id);i++)await page.waitForTimeout(50);assert.equal(cloud.stops.some(s=>s.id===id),false);assert.equal(JSON.stringify(cloud.brief.bookings),before);
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();assert.equal(await row.count(),0);assert.equal(await page.locator('[data-builder-endpoint-leg-id]').count(),1);assert.deepEqual(view.errors,[]);
 }catch(error){const dir=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/failure-account-or-recovery-${browserName}.txt`,await view.page.locator('body').innerText());}throw error;}finally{await view.close();}
});
for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: recovery refusal leaves the repeated stay and its booking source intact`,{skip:!builderBrowserTestsEnabled,timeout:60000},async()=>{
 const trip=repeatedTokyoTrip(),view=await renderBuilder({initialTrip:trip,query:`?trip=${trip.id}&recover=1`,browserName,offlineOnly:true});
 try{
  const page=view.page;page.setDefaultTimeout(10000);await page.locator('[data-builder-edit-session="active"]').waitFor();const row=page.locator('[data-builder-stop-id="tokyo-return-stay"]');await row.waitFor();const before=await page.evaluate(()=>Object.entries(localStorage).sort());
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic refusal','QuotaExceededError')};IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic refusal','QuotaExceededError')};});
  await row.getByRole('button',{name:/Add one night/}).click();await page.getByText(/This edit could not be accepted\. Your current trip remains unchanged/).waitFor();assert.equal(await row.locator('[data-builder-nights] strong').innerText(),'0');assert.deepEqual(await page.evaluate(()=>Object.entries(localStorage).sort()),before);assert.deepEqual(view.errors,[]);
 }catch(error){const dir=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/failure-account-or-recovery-${browserName}.txt`,await view.page.locator('body').innerText());}throw error;}finally{await view.close();}
});

for(const browserName of ['chromium','webkit'] as const)for(const broken of ['deleted-endpoint','deleted-leg','contradictory-endpoint','stale-leg-snapshot','stale-imported-leg'] as const)test(`${browserName}: ${broken} booking identity keeps booked and ambiguous visits protected`,{skip:!builderBrowserTestsEnabled,timeout:60000},async()=>{
 const trip=repeatedTokyoTrip(),booking=trip.brief.bookings![0]!;
 if(broken==='deleted-endpoint')booking.transportLegBinding!.toEndpointId='old-deleted-stop';
 if(broken==='deleted-leg'){booking.transportLegBinding!.legId='old-deleted-leg';booking.transportLegBinding!.toEndpointId='tokyo-return-stay';}
 if(broken==='contradictory-endpoint')booking.transportLegBinding!.toEndpointId=trip.stops[1]!.id;
 if(broken==='stale-leg-snapshot'){const leg=trip.legs.find(item=>item.id===booking.transportLegBinding!.legId)!;leg.toStopId='old-deleted-stop';leg.toEndpoint={...leg.toEndpoint!,id:'old-deleted-stop'};booking.transportLegBinding!.toEndpointId='old-deleted-stop';}
 if(broken==='stale-imported-leg'){const leg=trip.legs[0]!;delete booking.transportLegBinding;booking.id='imported-outbound';leg.routeMetadata.importedBookingId=booking.id;leg.toStopId='old-deleted-stop';leg.toEndpoint={...leg.toEndpoint!,id:'old-deleted-stop'};}
 const source=JSON.stringify(trip),view=await renderBuilder({initialTrip:trip,query:`?trip=${trip.id}`,browserName,styled:true,offlineOnly:true});
 try{
  const page=view.page;page.setDefaultTimeout(10000);await page.locator('[data-builder-edit-session="active"]').waitFor();
  const first=page.locator(`[data-builder-stop-id="${trip.stops[0]!.id}"]`),last=page.locator('[data-builder-stop-id="tokyo-return-stay"]');
  assert.equal(await first.getByRole('button',{name:/Add one night/}).isDisabled(),true,'stale identity must never unlock the booked arrival');
  assert.equal(await last.getByRole('button',{name:/Add one night/}).isDisabled(),true,'ambiguous repeated title remains protected pending review');
  await last.getByLabel('Actions for Tokyo',{exact:true}).click();assert.equal(await last.getByRole('button',{name:'Remove stop',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();assert.equal(await first.getByRole('button',{name:/Add one night/}).isDisabled(),true);assert.equal(await last.getByRole('button',{name:/Add one night/}).isDisabled(),true);
  assert.equal(JSON.stringify(trip),source);assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});
