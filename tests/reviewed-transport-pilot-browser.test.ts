import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {capturedPhilippinesTrip} from './fixtures/philippines-captured.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import type {TripLeg} from '../lib/easyt/trip.ts';
import {effectiveTripLeg} from '../lib/easyt/transport-mode-choice.ts';

for(const browserName of ['chromium','webkit'] as const){
 test(`composed fixture reaches mounted Use and preserves its exact total on reopen (${browserName})`,{skip:!builderBrowserTestsEnabled,timeout:30_000},async()=>{
  const trip=capturedPhilippinesTrip();let requests=0;
  // Synthetic contract evidence, deliberately not a claim of Philippine rail coverage.
  const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,browserName,offlineOnly:true,transferRequest:async({legs})=>{
   requests++;const leg=legs[0] as TripLeg,from=leg.fromEndpoint!,to=leg.toEndpoint!;
   const evidence={id:'synthetic-component',url:'https://operator.example/service',reviewedAt:'2026-10-27',expiresAt:'2026-10-28',supports:'directional-service' as const};
   const template={id:'mounted-contract',from,to,components:[{id:'service',kind:'service' as const,mode:'train' as const,from,to,evidence,timing:{minutes:271.5,basis:'estimate' as const,scope:'component' as const,covers:['movement','departure-processing','arrival-processing'] as const,evidence:{...evidence,supports:'planning-estimate' as const}}}]};
   return {status:200,body:await compareCanonicalTransferJourney(leg,{reviewedJourneyTemplates:[template],reviewedJourneyContext:{asOf:'2026-10-27',travelDate:'2026-12-30'}})};
  }});
  view.page.setDefaultTimeout(5000);
  try{
   await view.page.locator('[data-transport-leg-id]').last().getByRole('button',{name:/View details:/}).click();await view.page.getByRole('button',{name:'Change transport mode'}).click();const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
   await dialog.getByRole('button',{name:'Refresh options',exact:true}).click();await dialog.locator('[data-transport-comparison-status="ready"]').waitFor();
   await dialog.getByRole('radio',{name:/Train/}).click();await dialog.getByRole('button',{name:'Use train',exact:true}).click();await dialog.waitFor({state:'hidden'});
   await view.page.reload();await view.page.locator('[data-transport-leg-id]').last().getByText(/Rail/).first().waitFor({timeout:5000});
   const docs=await view.page.evaluate((id:string)=>Object.entries(localStorage).filter(([key])=>key.startsWith('easyt:trip-recovery:v2:')&&key.includes(id)).map(([,raw])=>JSON.parse(raw).trip),trip.id);
   const saved=docs.find((t:any)=>effectiveTripLeg(t,t.legs.at(-1)).mode==='train');assert.ok(saved);assert.equal(effectiveTripLeg(saved,saved.legs.at(-1)).doorToDoorMinutes,271.5);assert.deepEqual(saved.stops,JSON.parse(JSON.stringify(trip.stops)));assert.equal(requests,1);assert.deepEqual(view.errors,[]);
  }finally{await view.close();}
 });
 test(`captured pilot refresh is read-only until explicit Use and survives reopen (${browserName})`,{skip:!builderBrowserTestsEnabled,timeout:45_000},async()=>{
  const trip=capturedPhilippinesTrip();let requests=0,accountWrites=0;
  const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,browserName,offlineOnly:true,
   accountRequest:()=>{accountWrites++;return {status:500,body:{error:'unexpected-account-write'}};},
   transferRequest:async({legs})=>{requests++;return {status:200,body:await compareCanonicalTransferJourney(legs[0] as TripLeg)};}});
  view.page.setDefaultTimeout(5000);
  try{
   const card=view.page.locator('[data-transport-leg-id]').last();await card.getByRole('button',{name:/View details:/}).click();
   await view.page.getByRole('button',{name:'Change transport mode'}).click();const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
   const storage=()=>view.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())));const before=await storage();
   await dialog.getByRole('button',{name:'Refresh options',exact:true}).click();await dialog.locator('[data-transport-comparison-status="ready"]').waitFor();
   assert.equal(requests,1);assert.equal(await storage(),before);assert.match(await dialog.innerText(),/Flight[\s\S]*4h/);
   await dialog.getByRole('radio',{name:/Flight.*4h/}).click();assert.equal(await storage(),before);
   await dialog.getByRole('button',{name:'Use flight',exact:true}).click();await dialog.waitFor({state:'hidden'});
   await card.getByText(/Flight.*4h/).first().waitFor();await view.page.reload();await view.page.locator('[data-transport-leg-id]').last().getByText(/Flight.*4h/).first().waitFor();
   const saved=await view.page.evaluate((id:string)=>Object.entries(localStorage).filter(([key])=>key.startsWith('easyt:trip-recovery:v2:')&&key.includes(id)).map(([,raw])=>JSON.parse(raw)),trip.id);
   assert.ok(saved.length);const docs=saved.map((r:any)=>r.trip).filter((r:any)=>Array.isArray(r?.stops));assert.ok(docs.length,'read back exact synthetic recovery document');
   const latest=docs.find((r:any)=>effectiveTripLeg(r,r.legs.at(-1)).mode==='flight');assert.ok(latest);assert.deepEqual(latest.stops,JSON.parse(JSON.stringify(trip.stops)));assert.equal(latest.id,trip.id);assert.equal(latest.startDate,trip.startDate);assert.equal(latest.endDate,trip.endDate);
   assert.equal(effectiveTripLeg(latest,latest.legs.at(-1)).doorToDoorMinutes,240);assert.equal(latest.legs.at(-1).mode,'unknown','explicit selection must preserve the original underlying recommendation');
   assert.equal(requests,1);assert.equal(accountWrites,0);assert.deepEqual(view.errors,[]);
  }finally{await view.close();}
 });
 test(`partial source guidance does not invent an option or write the trip (${browserName})`,{skip:!builderBrowserTestsEnabled,timeout:30_000},async()=>{
  const trip=capturedPhilippinesTrip();let requests=0;
  const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,browserName,offlineOnly:true,transferRequest:async({legs})=>{requests++;return {status:200,body:await compareCanonicalTransferJourney(legs[0] as TripLeg)};}});
  view.page.setDefaultTimeout(5000);
  try{
   await view.page.locator('[data-transport-leg-id]').first().getByRole('button',{name:/View details:/}).click();await view.page.getByRole('button',{name:'Change transport mode'}).click();const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
   const storage=()=>view.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())));const before=await storage();
   await dialog.getByRole('button',{name:'Refresh options',exact:true}).click();await dialog.locator('[data-transport-comparison-status="ready"]').waitFor();
   const guidance=dialog.locator('[data-reviewed-route-guidance]');await guidance.waitFor();assert.match(await guidance.innerText(),/Clark.*total time need checking/);
   assert.equal(await guidance.getByRole('radio').count(),0);assert.equal(await guidance.getByRole('button').count(),0);assert.equal(await storage(),before);assert.equal(requests,1);assert.deepEqual(view.errors,[]);
  }finally{await view.close();}
 });
}
