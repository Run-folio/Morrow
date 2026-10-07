import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
test('retired day full content autosaves, reloads and has truthful surviving-stop review',{skip:!enabled,timeout:35000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
 const day=cloud.planItems.filter(d=>d.stopId===cloud.stops[1].id).at(-1)!;day.notes=['Ticket reminder'];day.startsAt='09:00';day.endsAt='11:00';day.bookingUrl='https://example.invalid/booking';cloud.brief.dayNotes={[day.dayNumber]:['Bring the tickets']};cloud.brief.mapPins=[{id:'retired-pin',dayNumber:day.dayNumber,title:'Meeting point',category:'activity',latitude:35,longitude:135}];
 cloud.brief.itineraryIdeas=[{id:'google-retired',stopId:day.stopId,dayId:day.id,category:'activity',source:'google-place-reference',providerReference:{provider:'google',placeId:'ChIJ-calendar-retired'},userNote:'Do not lose this reference'}];
 const source=structuredClone(cloud);const writes:typeof cloud[]=[];
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{if(method==='GET')return {status:200,body:{trip:cloud}};const candidate=requireReadableTripDocument(trip);if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed'}};writes.push(structuredClone(candidate));cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}}}});
 async function until(fn:()=>boolean){for(let i=0;i<70&&!fn();i++)await view.page.waitForTimeout(100);assert.ok(fn())}
 try{await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.getByRole('button',{name:/Remove one night from Kyoto/}).click();await until(()=>cloud.stops[1].nights===2&&Boolean(cloud.brief.retainedAuthoredContent));
 const entry=cloud.brief.retainedAuthoredContent!.entries.find(e=>e.days.some(d=>d.sourceDay.id===day.id))!;assert.deepEqual(entry.days[0].sourceDay,source.planItems.find(d=>d.id===day.id));assert.deepEqual(entry.mapPins,source.brief.mapPins);assert.deepEqual(entry.itineraryIdeas,source.brief.itineraryIdeas);assert.equal(cloud.planItems.some(d=>d.id===day.id),false);assert.equal(cloud.brief.itineraryIdeas?.length,0);assert.ok(writes.every(t=>new Set(t.planItems.map(d=>d.dayNumber)).size===t.planItems.length));
 await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();const review=view.page.getByRole('region',{name:'Retained trip content',exact:true});await review.getByText('Content from removed stops or retired days is still saved.',{exact:true}).waitFor();await review.locator('summary').filter({hasText:'Kyoto'}).click();await review.getByRole('heading',{name:day.title,exact:true}).waitFor();assert.match(await review.innerText(),/Ticket reminder[\s\S]*Bring the tickets/);assert.match(await review.innerText(),/ChIJ-calendar-retired/);assert.equal(cloud.brief.retainedAuthoredContent!.entries.some(e=>e.id===entry.id),true);assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
