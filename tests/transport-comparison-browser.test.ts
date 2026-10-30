import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {japanTrip} from './fixtures/transport-choice.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {syntheticRoad} from './fixtures/transport-comparison.ts';
import type {TripLeg} from '../lib/easyt/trip.ts';

for(const browserName of ['chromium','webkit'] as const)test(`explicit refresh keeps saved choice until Use, then survives reopen (${browserName})`,{skip:!builderBrowserTestsEnabled,timeout:45_000},async()=>{
 const trip=japanTrip();
 // Baseline has one saved rail recommendation. The refreshed road is genuinely new;
 // a changed same-ID saved road must remain protected (covered by adoption test).
 const saved=trip.legs[0].routeMetadata.multimodalResolution as {candidates:{summaryMode:string}[]};
 saved.candidates=saved.candidates.filter(candidate=>candidate.summaryMode==='train');
 let requests=0;let release:(()=>void)|undefined;
 const held=new Promise<void>(r=>release=r);
 const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,browserName,offlineOnly:true,
  transferRequest:async({legs})=>{requests++;if(requests===1)await held;return {status:200,body:await compareCanonicalTransferJourney(legs[0] as TripLeg,{provider:syntheticRoad()})};}});
 try{
  const card=view.page.locator('[data-transport-leg-id]').first();await card.getByRole('button',{name:/View details:/}).click();
  await view.page.getByRole('button',{name:'Change transport mode'}).click();
  const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
  const storage=()=>view.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())));
  const before=await storage();assert.equal(requests,0);
  const refresh=dialog.getByRole('button',{name:'Refresh options',exact:true});
  await refresh.click({timeout:5000});await view.page.waitForFunction(()=>document.querySelector('[data-transport-comparison-status]')?.getAttribute('data-transport-comparison-status')==='checking');
  assert.equal(await refresh.isDisabled(),true);assert.equal(requests,1);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();release!();
  await view.page.getByRole('button',{name:'Change transport mode'}).click();
  assert.equal(await storage(),before,'cancelled refresh must not write storage');
  await refresh.click();await dialog.locator('[data-transport-comparison-status="ready"]').waitFor();
  assert.equal(requests,2);assert.equal(await storage(),before,'successful refresh must not save or change a choice');
  assert.match(await dialog.innerText(),/Road[\s\S]*8h/);
  await dialog.getByRole('radio',{name:/Road.*8h/}).click({timeout:5000});assert.equal(await storage(),before,'draft selection must not save');
  await dialog.getByRole('button',{name:'Use road',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await card.getByText(/Road.*8h/).first().waitFor();
  await view.page.reload();await view.page.locator('[data-transport-leg-id]').first().getByText(/Road.*8h/).first().waitFor();
  assert.equal(requests,2,'save/reopen must not start comparison');assert.deepEqual(view.errors,[]);
 }finally{release?.();await view.close();}
});

test('refresh failure permits one manual retry; account transition discards a pending result without writes',{skip:!builderBrowserTestsEnabled,timeout:25_000},async()=>{
 const trip=japanTrip();let requests=0,release:(()=>void)|undefined;const held=new Promise<void>(r=>release=r);
 const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,offlineOnly:true,transferRequest:async({legs})=>{
  requests++;if(requests===1)return {status:503,body:{error:'synthetic-unavailable'}};
  await held;return {status:200,body:await compareCanonicalTransferJourney(legs[0] as TripLeg,{provider:syntheticRoad()})};
 }});
 try{
  await view.page.locator('[data-transport-leg-id]').first().getByRole('button',{name:/View details:/}).click();
  await view.page.getByRole('button',{name:'Change transport mode'}).click();const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
  const storage=()=>view.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())));const before=await storage();
  await dialog.getByRole('button',{name:'Refresh options',exact:true}).click();await dialog.locator('[data-transport-comparison-status="error"]').waitFor({timeout:5000});
  assert.equal(requests,1);assert.equal(await storage(),before);
  await dialog.getByRole('button',{name:'Refresh options',exact:true}).click();await dialog.locator('[data-transport-comparison-status="checking"]').waitFor({timeout:5000});
  await view.page.evaluate(()=>{(window as any).__BUILDER_TEST_OWNER__='other-synthetic-owner';window.dispatchEvent(new Event('builder-test-owner'));});
  release!();await view.page.waitForFunction(()=>!document.querySelector('[data-transport-comparison-status="checking"]'));
  assert.equal(await view.page.locator('[data-transport-comparison-status="ready"]').count(),0);assert.equal(requests,2);
  // Authentication may remember its owner; exact trip records must remain unchanged.
  const after=await storage();const records=(raw:string)=>Object.fromEntries(Object.entries(JSON.parse(raw)).filter(([key])=>key.includes(trip.id)));
  assert.deepEqual(records(after),records(before));assert.deepEqual(view.errors,[]);
 }finally{release?.();await view.close();}
});

test('signing in does not disable an existing guest transport choice or silently claim the trip',{skip:!builderBrowserTestsEnabled,timeout:20_000},async()=>{
 const trip=japanTrip();let accountWrites=0;
 const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,offlineOnly:true,accountRequest:()=>{accountWrites++;return {status:500,body:{error:'unexpected-account-write'}};}});
 try{
  await view.page.locator('[data-transport-leg-id]').first().getByRole('button',{name:/View details:/}).click();
  await view.page.getByRole('button',{name:'Change transport mode'}).click();const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
  await view.page.evaluate(()=>{(window as any).__BUILDER_TEST_OWNER__='signed-in-owner';window.dispatchEvent(new Event('builder-test-owner'));});
  await dialog.getByRole('radio',{name:/Road/}).click();
  assert.equal(await dialog.getByRole('button',{name:'Use road',exact:true}).isDisabled(),false,'guest choice remains a device edit after sign-in');
  await dialog.getByRole('button',{name:'Use road',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:5000});
  assert.equal(accountWrites,0,'no automatic claim/account write');
  const owners=await view.page.evaluate((id:string)=>Object.entries(localStorage).filter(([key])=>key.startsWith('easyt:trip-recovery:v2:')&&key.includes(id)).map(([,raw])=>JSON.parse(raw).ownerId),trip.id);
  assert.ok(owners.length);assert.ok(owners.every((owner:unknown)=>owner===null));assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});
