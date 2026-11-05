import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {gatewayReturnTrip} from './fixtures/gateway-return.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: a current-head repair refusal is visible and preserves source without an unhandled rejection`,{skip:!builderBrowserTestsEnabled,timeout:45_000},async()=>{
 const complete=gatewayReturnTrip(),source=markTransportLegBooked(complete,complete.legs[0].id,{confirmation:'PRESERVE-STALE-REPAIR'});source.legs=source.legs.slice(0,-1);const before=structuredClone(source);
 const path=new URL('../lib/easyt/trip-builder-handler-contract.ts',import.meta.url),code=readFileSync(path,'utf8'),needle='if(builderDocumentFingerprint(trip)!==expectedFingerprint)';assert(code.includes(needle));
 const overrides=new Map([[path.pathname,code.replace(needle,'if((globalThis as any).__REFUSE_RETURN_REPAIR__ || builderDocumentFingerprint(trip)!==expectedFingerprint)')]]);
 let writes=0;const view=await renderBuilder({initialTrip:source,path:`/journey/${source.id}/transport`,browserName,styled:true,offlineOnly:true,sourceOverrides:overrides,accountRequest:()=>{writes++;return{status:500,body:{}}}});
 try{const page=view.page,repair=page.getByRole('button',{name:'Add return journey',exact:true});await repair.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Add return journey'&&!b.disabled));const stored=await page.evaluate(()=>Object.entries(localStorage).sort());
  await page.evaluate(()=>(window as any).__REFUSE_RETURN_REPAIR__=true);await repair.click();
  await page.getByText('This route changed. Review the return journey before adding it.',{exact:true}).waitFor({timeout:2500});
  assert.equal(await page.locator('[data-transport-leg-id]').count(),1);assert.equal(writes,0);assert.deepEqual(await page.evaluate(()=>Object.entries(localStorage).sort()),stored);assert.deepEqual(view.errors,[]);assert.deepEqual(source,before);
 }finally{await view.close();}
});

for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: a queued edit retires stale repair intent and an explicit retry preserves it`,{skip:!builderBrowserTestsEnabled,timeout:60_000},async()=>{
 const complete=gatewayReturnTrip(),source=markTransportLegBooked(complete,complete.legs[0].id,{confirmation:'PRESERVE-QUEUED-BOOKING',note:'Keep this authored queued booking note'});source.legs=source.legs.slice(0,-1);const before=structuredClone(source);
 const hookPath=new URL('../components/easyt/use-trip-mutation-persistence.ts',import.meta.url).pathname,storagePath=new URL('../lib/easyt/storage.ts',import.meta.url).pathname;
 const hook=readFileSync(hookPath,'utf8'),storage=readFileSync(storagePath,'utf8');assert(hook.includes('const next = update(editable);'));assert(storage.includes('  const candidate=prepareTripDocumentForWrite(structuredClone(trip)),ownerId='));
 const overrides=new Map([[hookPath,hook.replace('const next = update(editable);',"const next = pendingKey==='p0-title'?{...editable,brief:{...editable.brief,budgetBand:'high'}}:update(editable);")],[storagePath,storage.replace('  const candidate=prepareTripDocumentForWrite(structuredClone(trip)),ownerId=',"  await (window as any).__heldWrite;\n  const candidate=prepareTripDocumentForWrite(structuredClone(trip)),ownerId=")]]);
 let writes=0;const view=await renderBuilder({initialTrip:source,path:`/journey/${source.id}/transport`,browserName,styled:true,offlineOnly:true,mutationControls:true,sourceOverrides:overrides,accountRequest:()=>{writes++;return{status:500,body:{}}}});
 try{const page=view.page,repair=page.getByRole('button',{name:'Add return journey',exact:true});await repair.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Add return journey'&&!b.disabled));
  await page.evaluate(()=>{(window as any).__heldWrite=new Promise<void>(resolve=>(window as any).__releaseWrite=resolve);(window as any).__repairRejections=[];window.addEventListener('unhandledrejection',(event:PromiseRejectionEvent)=>(window as any).__repairRejections.push(String(event.reason)));});
  await page.getByRole('button',{name:'Apply synthetic title edit',exact:true}).click();await repair.click();await page.evaluate(()=>(window as any).__releaseWrite());
  await page.getByText('This route changed. Review the return journey before adding it.',{exact:true}).waitFor();assert.equal(await page.locator('[data-transport-leg-id]').count(),1);assert.equal(writes,0);assert.deepEqual(view.errors,[]);assert.deepEqual(await page.evaluate(()=>(window as any).__repairRejections),[]);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Add return journey'&&!b.disabled));await repair.click();await page.waitForFunction(()=>document.querySelectorAll('[data-transport-leg-id]').length===2);assert.equal(await page.getByText('This route changed. Review the return journey before adding it.',{exact:true}).count(),0);
  const docs=await page.evaluate((id:string)=>Object.keys(localStorage).flatMap(key=>{try{const value=JSON.parse(localStorage.getItem(key)!);const trip=value?.trip??value;return trip?.id===id&&trip.legs?.length===2?[trip]:[]}catch{return[]}}),source.id);assert(docs.length);for(const trip of docs){assert.equal(trip.brief.budgetBand,'high');assert.deepEqual(trip.legs[0],before.legs[0]);assert.deepEqual(trip.brief.bookings,before.brief.bookings);}assert.equal(writes,0);assert.deepEqual(view.errors,[]);assert.deepEqual(source,before);
 }finally{await view.page.evaluate(()=>(window as any).__releaseWrite?.()).catch(()=>{});await view.close();}
});
