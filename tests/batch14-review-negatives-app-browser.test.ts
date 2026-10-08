import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderBuilder} from './helpers/builder-render.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const f=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-country.json',import.meta.url),'utf8')).A15;
for(const variant of ['must-visit','nested-choice','destination-metadata','item-reference','combined'] as const)test(`review mounted: preserve later authored country ${variant} on opening and reload`,{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-review',requireReadableTripDocument(structuredClone(f.trip))));
 const intent=cloud.brief.intent.route.destinations.find(i=>i.sourceText==='Nicaragua')!,id=intent.id,brief=cloud.brief.structuredBrief!,destination=brief.destinations.find(d=>d.placeMentionId===id)!;
 if(variant==='must-visit'||variant==='combined')brief.mustVisit.push({...destination,role:'must-visit',priority:'required',provenance:{kind:'explicit',source:'builder',confidence:'high'}});
 if(variant==='nested-choice'||variant==='combined')Object.assign(intent.selectedPlace!,{futureTravellerChoice:{keep:'saved-country-plan'}});
 if(variant==='destination-metadata'||variant==='combined')Object.assign(destination,{futureTravellerChoice:{keep:'saved-country-plan'}});
 if(variant==='item-reference'||variant==='combined')Object.assign(cloud.planItems[0]!,{intentId:id});
 cloud=requireReadableTripDocument(cloud);const before=structuredClone(cloud);let writes=0;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-review',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};writes++;cloud={...requireReadableTripDocument(trip),updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});
 try{await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.waitForTimeout(600);assert.equal(writes,0,'Protected country state must never enqueue a correction');assert.deepEqual(cloud,before);assert.equal(await view.page.locator(`[data-destination-intent-id="${id}"]`).count(),1);await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.waitForTimeout(300);assert.equal(writes,0);assert.deepEqual(cloud,before);assert.equal(await view.page.locator(`[data-destination-intent-id="${id}"]`).count(),1);assert.deepEqual(view.errors,[]);}finally{await view.close()}
});
