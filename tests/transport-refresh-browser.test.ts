import assert from 'node:assert/strict';import test from 'node:test';import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {japanTrip} from './fixtures/transport-choice.ts';import {explicit} from './helpers/transport-revision-server.ts';
import {supportedTransportChoicesForLeg,selectTripLegTransportChoice,effectiveTripLeg} from '../lib/easyt/transport-mode-choice.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';import{nextTripUpdatedAt}from'../lib/easyt/trip-continuity.ts';
import{resolve}from'node:path';import{authoredContentKey}from'../lib/easyt/trip-retained-authored-content.ts';
import type{TripLeg}from'../lib/easyt/trip.ts';
for(const browserName of ['chromium','webkit']as const)for(const ownerId of [null,'revision-owner'])test(`saved390/new480 stay separately selectable and reopen (${browserName}/${ownerId??'guest'})`,{skip:!builderBrowserTestsEnabled,timeout:45000},async()=>{
 let trip=japanTrip();const choice=supportedTransportChoicesForLeg(trip,trip.legs[0]).find(c=>c.candidateId==='road:routed')!;trip=selectTripLegTransportChoice(trip,trip.legs[0].id,choice.identity);if(ownerId)trip=canonicalTripForOwner(ownerId,trip);
 let cloud=trip,requests=0,writes=0,phase='start';const observed:any[]=[];const sourceOverrides=process.env.MORROVIA_REFRESH_BROWSER_BASELINE?new Map(['lib/easyt/transport-comparison.ts','lib/easyt/transport-comparison-client.ts'].map(p=>[resolve(p),readFileSync(resolve(process.env.MORROVIA_REFRESH_BROWSER_BASELINE!,p),'utf8')])):undefined;const oldCandidates=JSON.parse(JSON.stringify((trip.legs[0].routeMetadata.multimodalResolution as any).candidates));
 const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,browserName,ownerId:ownerId??undefined,offlineOnly:true,styled:true,sourceOverrides,
 transferRequest:async({legs})=>{requests++;return{status:200,body:await explicit(legs[0]as TripLeg)}},
 accountRequest:async({method,trip:payload})=>{if(method==='GET')return{status:200,body:{trip:cloud}};assert.equal(method,'PUT');const submitted=requireReadableTripDocument(payload);assert.equal(submitted.updatedAt,cloud.updatedAt,'exact CAS revision required');writes++;observed.push({phase,before:JSON.parse(JSON.stringify(cloud)),submitted:JSON.parse(JSON.stringify(submitted))});cloud=canonicalTripForOwner(ownerId!,submitted,nextTripUpdatedAt(cloud.updatedAt));return{status:200,body:{trip:cloud}}}});
 try{
  const card=view.page.locator('[data-transport-leg-id]').first();await card.getByRole('button',{name:/View details:/}).click();await view.page.getByRole('button',{name:'Change transport mode'}).click();const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
  const records=()=>view.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort()))),before=await records();
  await dialog.getByRole('button',{name:'Refresh options',exact:true}).click();await dialog.locator('[data-transport-comparison-status="ready"]').waitFor();
  assert.equal(requests,1);assert.equal(writes,0);assert.equal(await records(),before);assert.match(await dialog.innerText(),/6h 30m/);assert.match(await dialog.innerText(),/8h/);
  await dialog.getByRole('radio',{name:/Road.*8h/}).click();assert.equal(await records(),before);assert.equal(writes,0);
  mkdirSync('../screenshots',{recursive:true});await view.page.screenshot({path:`../screenshots/refresh-${browserName}-${ownerId??'guest'}-before-use.png`});
  phase='use';await dialog.getByRole('button',{name:'Use road',exact:true}).click();await dialog.waitFor({state:'hidden'});await card.getByText(/Road.*8h/).first().waitFor();
  observed.push({phase:'after-use',writes});phase='reopen';await view.page.reload();await view.page.locator('[data-transport-leg-id]').first().getByText(/Road.*8h/).first().waitFor();assert.equal(requests,1);
  if(ownerId){assert.equal(writes,2,'pending retained account copy is ACKed before the explicit choice; no additional write on reopen');const submitted=observed.filter(v=>v.submitted).map(v=>v.submitted);assert.equal((submitted[0].legs[0].routeMetadata.multimodalResolution as any).candidates.length,2);assert.equal((submitted[1].legs[0].routeMetadata.multimodalResolution as any).candidates.length,3);assert.equal(effectiveTripLeg(cloud,cloud.legs[0]).durationMinutes,480);assert.deepEqual(JSON.parse(JSON.stringify((cloud.legs[0].routeMetadata.multimodalResolution as any).candidates.slice(0,2))),oldCandidates)}
  assert.deepEqual(view.errors,[]);
 }finally{writeFileSync(`../mounted-${browserName}-${ownerId??'guest'}${sourceOverrides?'-baseline':''}.json`,JSON.stringify({writes,requests,observed},null,2));await view.close()}
});
