import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
async function fixture(legacy=false,configure?:(trip:ReturnType<typeof requireReadableTripDocument>)=>void) {
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
 if(legacy){cloud.brief.intent.route.journeyEnd={mode:'explicit',place:{name:'Hiroshima',country:'Japan',canonicalPlaceId:'place:hiroshima'}};cloud.brief.journeyEnd=cloud.brief.intent.route.journeyEnd}
 configure?.(cloud);
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
 if(method==='GET')return {status:200,body:{trip:cloud}};const next=requireReadableTripDocument(trip);
 if(next.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed'}};
 cloud={...next,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});view.page.setDefaultTimeout(5000);await view.page.locator('[data-builder-top-controls]').waitFor();return {view,cloud:()=>cloud};
}
async function until(h:Awaited<ReturnType<typeof fixture>>,condition:()=>boolean){for(let i=0;i<50;i++){if(condition())return;await h.view.page.waitForTimeout(100)}assert.ok(condition())}
test('top controls have two type choices, unordered chips, one add owner and collapsed Personalize',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 const top=h.view.page.locator('[data-builder-top-controls]');assert.equal(await top.getByRole('group',{name:'Trip type',exact:true}).getByRole('button').count(),2);
 assert.equal(await h.view.page.getByRole('button',{name:'Save changes',exact:true}).count(),0);assert.equal(await h.view.page.getByRole('combobox',{name:'Finishing in',exact:true}).count(),0);
 assert.equal(await h.view.page.getByRole('button',{name:'Add destination',exact:true}).count(),1);assert.equal(await h.view.page.getByRole('combobox',{name:'Add a stop',exact:true}).count(),0);
 assert.equal(await top.locator('[data-destination-intent-id]').count(),3);assert.equal(await top.locator('[draggable]').count(),0);
 assert.equal(await top.locator('details[open]').count(),0);await top.locator('summary').click();assert.equal(await top.getByRole('button',{name:'Relaxed',exact:true}).count(),1);
 assert.equal(await top.getByRole('button',{name:'Update route',exact:true}).isDisabled(),true,'proposal task remains held');assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('partial origin and exact intent replacement input survive budget save and reload without changing canonical places',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 const before=structuredClone(h.cloud());const top=h.view.page.locator('[data-builder-top-controls]');await top.getByRole('combobox',{name:'Starting from',exact:true}).fill('Lon partial');
 await top.getByRole('button',{name:'Edit Tokyo',exact:true}).click();await top.getByRole('combobox',{name:'Destination',exact:true}).fill('Tok partial');
 await top.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');await h.view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
 assert.deepEqual(h.cloud().brief.intent.route.origin,before.brief.intent.route.origin);assert.deepEqual(h.cloud().stops,before.stops);
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await h.view.page.getByRole('combobox',{name:'Starting from',exact:true}).inputValue(),'Lon partial');assert.equal(await h.view.page.getByRole('combobox',{name:'Destination',exact:true}).inputValue(),'Tok partial');assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('single Add opens existing flow and its partial input survives reload independently of accepted places',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 await h.view.page.getByRole('button',{name:'Add destination',exact:true}).click();await h.view.page.getByRole('combobox',{name:'Add a stop',exact:true}).fill('Os partial');
 await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');await h.view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await h.view.page.getByRole('combobox',{name:'Add a stop',exact:true}).inputValue(),'Os partial');assert.equal(h.cloud().stops.length,3);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('legacy finish is visible and explicit replacement requires acceptance without removing its stay',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(true);try{
 const before=structuredClone(h.cloud().stops);await h.view.page.locator('[data-builder-top-controls]').getByText('Saved finish:',{exact:false}).waitFor();await h.view.page.getByRole('button',{name:'Return to start',exact:true}).click();
 const dialog=h.view.page.getByRole('dialog');await dialog.getByRole('button',{name:'Keep finish',exact:true}).click();assert.equal(h.cloud().brief.intent.route.journeyEnd.mode,'explicit');
 await h.view.page.getByRole('button',{name:'Return to start',exact:true}).click();await dialog.getByRole('button',{name:'Return to start',exact:true}).click();await until(h,()=>h.cloud().brief.intent.route.journeyEnd.mode==='same_as_start');assert.deepEqual(h.cloud().stops,before);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('retained review discloses full day content and deliberate removal consumes only the selected day',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 await h.view.page.getByLabel('Actions for Hiroshima',{exact:true}).click();await h.view.page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Remove stop',exact:true}).last().click();await h.view.page.getByRole('dialog').getByRole('button',{name:'Remove Hiroshima',exact:true}).click();
 const review=h.view.page.getByRole('region',{name:'Retained trip content',exact:true});await review.locator('summary').click();await until(h,()=>Boolean(h.cloud().brief.retainedAuthoredContent?.entries.length));const entry=h.cloud().brief.retainedAuthoredContent!.entries[0]!;const day=entry.days[0]!.sourceDay;
 await review.getByRole('heading',{name:day.title,exact:true}).waitFor();assert.match(await review.innerText(),/2026-10-17|2026-10-18/);const count=entry.days.length;
 await review.getByRole('button',{name:`Remove content ${day.title}`,exact:true}).click();await h.view.page.getByRole('dialog').getByRole('button',{name:'Remove selected content',exact:true}).click();await until(h,()=>h.cloud().brief.retainedAuthoredContent?.entries[0]?.days.length===count-1);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('unaccepted typed dates survive preference autosave and reload without changing canonical dates',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 const before=[h.cloud().startDate,h.cloud().endDate];await h.view.page.getByRole('button',{name:/Travel dates/}).click();await h.view.page.getByRole('dialog').getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true}).fill('2026-10-');await h.view.page.getByRole('button',{name:'Close calendar',exact:true}).last().click();
 await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');await h.view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();await h.view.page.getByRole('button',{name:/Travel dates/}).click();assert.equal(await h.view.page.getByRole('dialog').getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true}).inputValue(),'2026-10-');assert.deepEqual([h.cloud().startDate,h.cloud().endDate],before);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('retained day move preserves full content and siblings while fixed date moves remain retained',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{
 const target=trip.planItems.find(day=>day.stopId===trip.stops.find(stop=>stop.name==='Tokyo')!.id)!;target.notes=[];target.startsAt=null;target.endsAt=null;target.bookingUrl=null;
 const removed=trip.planItems.filter(day=>day.stopId===trip.stops.find(stop=>stop.name==='Hiroshima')!.id);
 Object.assign(removed[0]!,{notes:['Traveller activity','Keep this evening free'],noteDayParts:['morning','evening'],contextNotes:['Bring tickets'],startsAt:null,endsAt:null});
 Object.assign(removed[1]!,{notes:['Reserved activity'],startsAt:'09:00',endsAt:'11:00',bookingUrl:'https://example.invalid/reservation'});
 trip.brief.itineraryIdeas=[{id:'retained-provider',stopId:removed[0]!.stopId,placeId:'tour:fixture',title:'Saved walking tour',category:'activity',source:'live-provider-inventory',reasons:['interest-relevance'],description:'Original saved description',provider:'viator',providerProductId:'product:fixture',providerMetadata:{duration:{fixedMinutes:90},price:{amount:45,currency:'GBP'},provenance:{kind:'live_provider_search',provider:'viator',checkedAt:'2026-10-07T12:00:00.000Z'}},sourceUrl:'https://example.invalid/tour'},
 {id:'retained-google',source:'google-place-reference',stopId:removed[0]!.stopId,category:'activity',providerReference:{provider:'google',placeId:'ChIJ-retained-reference',lastResolvedAt:'2026-10-07T12:00:00.000Z'},userNote:'Remember this saved place'}];
 trip.brief.mapPins=[{id:'retained-pin',title:'Saved meeting point',category:'custom',dayNumber:removed[0]!.dayNumber,latitude:34.3853,longitude:132.4553}];
 (trip.brief.dayNotes??={})[removed[0]!.dayNumber]=['Authored reminder'];(trip.brief.customActivities??={})[removed[0]!.dayNumber]=['Lunch with friends'];
 });try{
 await h.view.page.getByLabel('Actions for Hiroshima',{exact:true}).click();await h.view.page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Remove stop',exact:true}).last().click();await h.view.page.getByRole('dialog').getByRole('button',{name:'Remove Hiroshima',exact:true}).click();
 const review=h.view.page.getByRole('region',{name:'Retained trip content',exact:true});await review.locator('summary').click();await until(h,()=>Boolean(h.cloud().brief.retainedAuthoredContent?.entries.length));
 const before=structuredClone(h.cloud().brief.retainedAuthoredContent!.entries[0]!);const source=before.days[0]!;const fixed=before.days[1]!;const target=h.cloud().planItems.find(day=>day.stopId.endsWith('tokyo'))!;
 for(const text of [...source.sourceDay.notes,...source.sourceDay.contextNotes!,...source.dayNotes!,...source.customActivities!])assert.ok((await review.innerText()).includes(text));
 const detail=await review.innerText();for(const text of ['Saved walking tour','Original saved description','90 minutes','45 GBP','ChIJ-retained-reference','Remember this saved place','Saved meeting point'])assert.ok(detail.includes(text));assert.doesNotMatch(detail,/undefined/);assert.equal(await review.getByRole('article').filter({has:h.view.page.getByRole('heading',{name:'Saved meeting point',exact:true})}).getByRole('link',{name:'View saved location',exact:true}).getAttribute('href'),'https://www.google.com/maps/search/?api=1&query=34.3853,132.4553');
 assert.equal(await review.getByRole('link',{name:'Saved booking',exact:true}).getAttribute('href'),fixed.sourceDay.bookingUrl);
 const fixedArticle=review.getByRole('article').filter({has:h.view.page.getByRole('heading',{name:fixed.sourceDay.title,exact:true})});await fixedArticle.getByRole('combobox').selectOption(target.id);await fixedArticle.getByRole('button',{name:'Move content',exact:true}).click();
 await review.getByText('This content remains retained',{exact:true}).waitFor();assert.deepEqual(h.cloud().brief.retainedAuthoredContent!.entries[0],before);
 const movable=review.getByRole('article').filter({has:h.view.page.getByRole('heading',{name:source.sourceDay.title,exact:true})});await movable.getByRole('combobox').selectOption(target.id);await movable.getByRole('button',{name:'Move content',exact:true}).click();
 await until(h,()=>h.cloud().brief.retainedAuthoredContent?.entries[0]?.days.length===before.days.length-1);
 const moved=h.cloud().planItems.find(day=>day.id===target.id)!;assert.deepEqual(moved,{...source.sourceDay,id:target.id,stopId:target.stopId,dayNumber:target.dayNumber,date:target.date,notes:[...source.sourceDay.notes,...source.customActivities!],noteDayParts:[...source.sourceDay.noteDayParts!,null]});assert.deepEqual(h.cloud().brief.dayNotes?.[target.dayNumber],source.dayNotes);assert.deepEqual(h.cloud().brief.customActivities?.[target.dayNumber],source.customActivities);
 assert.deepEqual(h.cloud().brief.retainedAuthoredContent!.entries[0]!.days,before.days.slice(1));assert.deepEqual(h.cloud().brief.retainedAuthoredContent!.entries[0]!.itineraryIdeas,before.itineraryIdeas);assert.deepEqual(h.cloud().brief.retainedAuthoredContent!.entries[0]!.mapPins,before.mapPins);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('removing a parent destination confirms its mapped stays and Undo restores their exact content',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{const route=trip.brief.intent.route;const [a,b,c]=route.destinations;route.destinations=[{...a!,id:'intent:japan',sourceText:'Japan',kind:'planning_area',selectedPlace:{name:'Japan',country:'Japan',canonicalPlaceId:'country:japan'},stopIds:[...a!.stopIds,...b!.stopIds],requestedNights:(a!.requestedNights??0)+(b!.requestedNights??0)},c!]});try{
 await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high'&&h.cloud().planItems.every(day=>Boolean(day.contextNotes?.length)));
 const before=structuredClone(h.cloud());await h.view.page.getByRole('button',{name:'Remove Japan',exact:true}).click();const dialog=h.view.page.getByRole('dialog');await dialog.getByRole('heading',{name:'Remove Japan and its stays?',exact:true}).waitFor();assert.match(await dialog.innerText(),/Tokyo[\s\S]*Kyoto/);
 await dialog.getByRole('button',{name:'Keep destination',exact:true}).click();assert.deepEqual(h.cloud(),before);
 await h.view.page.getByRole('button',{name:'Remove Japan',exact:true}).click();await dialog.getByRole('button',{name:'Remove destination',exact:true}).click();await until(h,()=>h.cloud().stops.length===1);assert.equal(h.cloud().stops[0]!.name,'Hiroshima');assert.equal(h.cloud().brief.retainedAuthoredContent?.entries.length,2);
 await h.view.page.getByRole('button',{name:'Undo',exact:true}).click();await until(h,()=>h.cloud().stops.length===3);assert.deepEqual(h.cloud().stops,before.stops);assert.deepEqual(h.cloud().planItems,before.planItems);assert.deepEqual(h.cloud().brief.intent.route.destinations,before.brief.intent.route.destinations);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('unknown legacy ending keeps both type options unselected until a deliberate choice',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{trip.brief.intent.route.tripType='unknown_legacy'});try{
 const top=h.view.page.locator('[data-builder-top-controls]');assert.equal(await top.getByRole('button',{name:'Return to start',exact:true}).getAttribute('aria-pressed'),'false');assert.equal(await top.getByRole('button',{name:'One way',exact:true}).getAttribute('aria-pressed'),'false');await top.getByText('This saved trip’s ending is unconfirmed.',{exact:true}).waitFor();
 await top.getByRole('button',{name:'One way',exact:true}).click();await until(h,()=>h.cloud().brief.intent.route.tripType==='one_way');assert.equal(h.cloud().brief.intent.route.journeyEnd.mode,'unknown');assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
