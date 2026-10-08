import assert from 'node:assert/strict';
import test from 'node:test';
import type {Route} from 'playwright';
import {renderBuilder} from './helpers/builder-render.ts';
import {a17TripFixture} from './fixtures/batch14-a17-trip.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {resolveTripTransferJourneys,resolveCanonicalTransferJourneys} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import type {TripLeg} from '../lib/easyt/trip.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
async function fixture(legacy=false,configure?:(trip:ReturnType<typeof requireReadableTripDocument>)=>void,geocodeCandidates:Record<string,unknown[]>={}) {
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
 if(legacy){cloud.brief.intent.route.journeyEnd={mode:'explicit',place:{name:'Hiroshima',country:'Japan',canonicalPlaceId:'place:hiroshima'}};cloud.brief.journeyEnd=cloud.brief.intent.route.journeyEnd}
 configure?.(cloud);
 let writes=0;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,geocodeCandidates,accountRequest:({method,trip})=>{
 if(method==='GET')return {status:200,body:{trip:cloud}};const next=requireReadableTripDocument(trip);
 if(next.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed'}};
 writes++;cloud={...next,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});view.page.setDefaultTimeout(5000);await view.page.locator('[data-builder-top-controls]').waitFor();return {view,cloud:()=>cloud,writes:()=>writes};
}
async function until(h:Awaited<ReturnType<typeof fixture>>,condition:()=>boolean){for(let i=0;i<50;i++){if(condition())return;await h.view.page.waitForTimeout(100)}assert.ok(condition())}
test('unresolved saved finish is confirmed deliberately without adding a stay or changing authoritative order',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(true,trip=>{trip.brief.intent.route.journeyEnd={mode:'explicit',place:{name:'Osaka',country:'Japan',canonicalPlaceId:'place:osaka'}};trip.brief.journeyEnd=trip.brief.intent.route.journeyEnd},
 {Osaka:[{name:'Osaka',country:'Japan',canonicalPlaceId:'osaka',coordinates:[135.5023,34.6937]}]});
 try{
 const before=structuredClone(h.cloud());await h.view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).click();
 const dialog=h.view.page.getByRole('dialog');await dialog.getByRole('button',{name:/Osaka/}).waitFor();
 assert.equal(h.writes(),0,'provider result must await traveller choice');
 await dialog.getByRole('button',{name:'Finish later',exact:true}).click();assert.deepEqual(h.cloud(),before);
 await h.view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).click();await dialog.getByRole('button',{name:/Osaka/}).click();
 await until(h,()=>{const end=h.cloud().brief.intent.route.journeyEnd;return end.mode==='explicit'&&Boolean(end.place.coordinates)});
 assert.deepEqual(h.cloud().stops,before.stops);assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
 assert.equal(h.cloud().brief.intent.route.orderAuthority,before.brief.intent.route.orderAuthority);
 const end=h.cloud().brief.intent.route.journeyEnd;assert.equal(end.mode==='explicit'&&end.place.canonicalPlaceId,'place:osaka');
 const finishLeg=h.cloud().legs.find(leg=>leg.toEndpoint?.kind==='end');assert.ok(finishLeg,'accepted finish must update its dependent gateway leg');assert.deepEqual(finishLeg.toEndpoint?.coordinates,[135.5023,34.6937]);
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await h.view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).count(),0);
 assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('saved finish rejects mismatched names and invalid coordinates without saving',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(true,trip=>{trip.brief.intent.route.journeyEnd={mode:'explicit',place:{name:'Osaka',country:'Japan',canonicalPlaceId:'place:osaka'}};trip.brief.journeyEnd=trip.brief.intent.route.journeyEnd},
 {Osaka:[{name:'Tokyo',country:'Japan',coordinates:[139.6917,35.6895]},{name:'Osaka',country:'Japan',coordinates:[999,99]}]});
 try{
 const before=structuredClone(h.cloud());await h.view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).click();
 await h.view.page.getByRole('dialog').getByText("We couldn't confirm this place. Close and try again.",{exact:true}).waitFor();
 assert.equal(await h.view.page.getByRole('dialog').getByRole('button',{name:/Osaka|Tokyo/}).count(),0);assert.equal(h.writes(),0);assert.deepEqual(h.cloud(),before);
 assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('late saved finish lookup cannot restore an endpoint after dismissal and accepted type change',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(true,trip=>{trip.brief.intent.route.journeyEnd={mode:'explicit',place:{name:'Osaka',country:'Japan',canonicalPlaceId:'place:osaka'}};trip.brief.journeyEnd=trip.brief.intent.route.journeyEnd});
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});let requested=false;
 try{
 await h.view.page.route('**/api/journey-geocode?*',async (route:{fulfill:(response:{status:number;contentType:string;body:string})=>Promise<void>})=>{requested=true;await held;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({candidates:[{name:'Osaka',country:'Japan',coordinates:[135.5023,34.6937]}]})}).catch(()=>{})});
 await h.view.page.getByRole('button',{name:'Confirm saved finish',exact:true}).click();await until(h,()=>requested);
 await h.view.page.getByRole('dialog').getByRole('button',{name:'Finish later',exact:true}).click();
 await h.view.page.getByRole('button',{name:'Return to start',exact:true}).click();await h.view.page.getByRole('dialog').getByRole('button',{name:'Return to start',exact:true}).click();
 await until(h,()=>h.cloud().brief.intent.route.journeyEnd.mode==='same_as_start');const accepted=structuredClone(h.cloud());
 release();await h.view.page.waitForTimeout(200);assert.deepEqual(h.cloud(),accepted);assert.equal(await h.view.page.getByRole('dialog').count(),0);assert.deepEqual(h.view.errors,[]);
 }finally{release();await h.view.close()}
});
test('top controls have two type choices, unordered chips, one add owner and no optional preference controls',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 const top=h.view.page.locator('[data-builder-top-controls]');assert.equal(await top.getByRole('group',{name:'Trip type',exact:true}).getByRole('button').count(),2);
 assert.equal(await h.view.page.getByRole('button',{name:'Save changes',exact:true}).count(),0);assert.equal(await h.view.page.getByRole('combobox',{name:'Finishing in',exact:true}).count(),0);
 assert.equal(await h.view.page.getByRole('button',{name:'Add destination',exact:true}).count(),1);assert.equal(await h.view.page.getByRole('combobox',{name:'Add a stop',exact:true}).count(),0);
 assert.equal(await top.locator('[data-destination-intent-id]').count(),3);assert.equal(await top.locator('[draggable="true"]').count(),3);
 assert.equal(await top.getByText('Personalize',{exact:true}).count(),0);assert.equal(await top.getByRole('combobox',{name:'Pace',exact:true}).count(),0);assert.equal(await top.getByRole('button',{name:'Avoid driving',exact:true}).count(),0);
 assert.equal(await top.getByText('MUST KEEP',{exact:true}).count(),0);assert.equal(await top.getByText('MUST-SEE STOPS',{exact:true}).count(),0);
 assert.equal(await top.getByRole('button',{name:'Update route',exact:true}).isDisabled(),false,'optional proposal action is available');assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('partial origin and exact intent replacement input survive budget save and reload without changing canonical places',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 const before=structuredClone(h.cloud());const top=h.view.page.locator('[data-builder-top-controls]');await top.getByRole('combobox',{name:'Start from',exact:true}).fill('Lon partial');
 await top.getByRole('button',{name:'Edit Tokyo',exact:true}).click();await top.getByRole('combobox',{name:'Destination',exact:true}).fill('Tok partial');
 await top.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');await h.view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
 assert.deepEqual(h.cloud().brief.intent.route.origin,before.brief.intent.route.origin);assert.deepEqual(h.cloud().stops,before.stops);
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await h.view.page.getByRole('combobox',{name:'Start from',exact:true}).inputValue(),'Lon partial');assert.equal(await h.view.page.getByRole('combobox',{name:'Destination',exact:true}).inputValue(),'Tok partial');assert.deepEqual(h.view.errors,[]);
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
test('accepted stop removal retains every authored day through reload without a general review interface',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 await h.view.page.getByLabel('Actions for Hiroshima',{exact:true}).click();await h.view.page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Remove stop',exact:true}).last().click();await h.view.page.getByRole('dialog').getByRole('button',{name:'Remove Hiroshima',exact:true}).click();
 await until(h,()=>Boolean(h.cloud().brief.retainedAuthoredContent?.entries.length));const retained=structuredClone(h.cloud().brief.retainedAuthoredContent);
 assert.equal(await h.view.page.getByRole('button',{name:'Review trip',exact:true}).count(),0);assert.equal(await h.view.page.getByRole('region',{name:'Retained trip content',exact:true}).count(),0);
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.deepEqual(h.cloud().brief.retainedAuthoredContent,retained);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('unaccepted typed dates survive preference autosave and reload without changing canonical dates',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
 const before=[h.cloud().startDate,h.cloud().endDate];await h.view.page.getByRole('button',{name:/Travel dates/}).click();await h.view.page.getByRole('dialog').getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true}).fill('2026-10-');await h.view.page.getByRole('button',{name:'Close calendar',exact:true}).last().click();
 await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');await h.view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();await h.view.page.getByRole('button',{name:/Travel dates/}).click();assert.equal(await h.view.page.getByRole('dialog').getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true}).inputValue(),'2026-10-');assert.deepEqual([h.cloud().startDate,h.cloud().endDate],before);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('retired stop preserves authored activities, bookings and provider references without duplicate review cards',{skip:!enabled,timeout:30000},async()=>{
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
 await until(h,()=>Boolean(h.cloud().brief.retainedAuthoredContent?.entries.length));const retained=structuredClone(h.cloud().brief.retainedAuthoredContent!);const entry=retained.entries[0]!;
 assert.deepEqual(entry.days[0]!.sourceDay.notes,['Traveller activity','Keep this evening free']);assert.deepEqual(entry.days[0]!.dayNotes,['Authored reminder']);assert.deepEqual(entry.days[0]!.customActivities,['Lunch with friends']);
 assert.equal(entry.days[1]!.sourceDay.bookingUrl,'https://example.invalid/reservation');assert.equal(entry.days[1]!.sourceDay.startsAt,'09:00');
 assert.equal(entry.itineraryIdeas.length,2);const provider=entry.itineraryIdeas.find(idea=>idea.source==='live-provider-inventory');assert.ok(provider&&provider.source==='live-provider-inventory');assert.equal(provider.title,'Saved walking tour');assert.equal(provider.providerProductId,'product:fixture');const google=entry.itineraryIdeas.find(idea=>idea.source==='google-place-reference');assert.ok(google&&google.source==='google-place-reference');assert.equal(google.providerReference.placeId,'ChIJ-retained-reference');assert.equal(entry.mapPins[0]!.title,'Saved meeting point');
 assert.equal(await h.view.page.getByRole('button',{name:'Review trip',exact:true}).count(),0);assert.equal(await h.view.page.getByRole('region',{name:'Retained trip content',exact:true}).count(),0);
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.deepEqual(h.cloud().brief.retainedAuthoredContent,retained);assert.deepEqual(h.view.errors,[]);
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

test('chip keyboard reorder establishes manual authority, autosaves and survives reload',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{trip.brief.bookings=[]});try{
 const before=structuredClone(h.cloud());const top=h.view.page.locator('[data-builder-top-controls]');
 const grip=top.getByRole('button',{name:'Reorder Tokyo',exact:true});await grip.focus();await grip.press('Space');await grip.press('ArrowRight');assert.equal(await top.locator('span.sr-only[aria-live="polite"]').textContent(),'Moving Tokyo to stop 2');await grip.press('Enter');
 const expected=[before.stops[1]!.id,before.stops[0]!.id,before.stops[2]!.id];await until(h,()=>h.cloud().brief.intent.route.orderedStopIds[0]===expected[0]);assert.equal(h.cloud().brief.intent.route.orderAuthority,'manual');assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,expected);
 assert.deepEqual(h.cloud().brief.intent.route.destinations,before.brief.intent.route.destinations);assert.deepEqual(h.cloud().stops.map(s=>[s.id,s.nights]).sort(),before.stops.map(s=>[s.id,s.nights]).sort());
 await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.deepEqual(await h.view.page.locator('[data-destination-intent-id]').evaluateAll((nodes:Element[])=>nodes.map(n=>n.getAttribute('data-destination-intent-id'))),[before.brief.intent.route.destinations[1]!.id,before.brief.intent.route.destinations[0]!.id,before.brief.intent.route.destinations[2]!.id]);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('unresolved or shared parent chips keep reorder in the occurrence table',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{trip.brief.intent.route.destinations[0]!.kind='planning_area'});try{
 assert.equal(await h.view.page.locator('[data-builder-top-controls] [draggable="true"]').count(),0);
 assert.ok(await h.view.page.locator('[data-builder-route-workspace] [draggable="true"]').count()>0);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

for(const authority of ['optimizable','legacy_preserved','explicit','manual'] as const)for(const repeated of [false,true])test(`chip gesture uses canonical occurrence order for ${authority}${repeated?' with repeated places':''}`,{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{
  const route=trip.brief.intent.route;route.orderAuthority=authority;
  route.explicitIntentIds=authority==='explicit'?route.destinations.map(intent=>intent.id):null;
  if(repeated){
   Object.assign(trip.stops[2],{name:trip.stops[0].name,country:trip.stops[0].country,canonicalPlaceId:trip.stops[0].canonicalPlaceId,latitude:trip.stops[0].latitude,longitude:trip.stops[0].longitude});
   route.destinations[2].selectedPlace={...route.destinations[0].selectedPlace!};
  }
  [route.destinations[1],route.destinations[2]]=[route.destinations[2],route.destinations[1]];
 });try{
 const before=structuredClone(h.cloud()),route=before.brief.intent.route;
 const top=h.view.page.locator('[data-builder-top-controls]'),chips=top.locator('[data-destination-intent-id]');
 const visibleIds=await chips.evaluateAll((nodes:Element[])=>nodes.map(node=>node.getAttribute('data-destination-intent-id')!));
 const requestedIntentIds=[visibleIds[0],visibleIds[2],visibleIds[1]];
 const requestedStopIds=requestedIntentIds.map(id=>route.destinations.find(intent=>intent.id===id)!.stopIds[0]);
 const grip=chips.nth(1).locator('[draggable="true"]');await grip.focus();await grip.press('Space');await grip.press('ArrowRight');await grip.press('Enter');
 for(let i=0;i<50&&h.cloud().brief.intent.route.orderAuthority!=='manual';i++)await h.view.page.waitForTimeout(100);
 assert.equal(h.cloud().brief.intent.route.orderAuthority,'manual',`visible gesture must be accepted; writes=${h.writes()}, chips=${visibleIds.join(',')}`);
 await until(h,()=>h.writes()>0&&h.cloud().brief.intent.route.orderedStopIds.join('|')===requestedStopIds.join('|'));
 assert.deepEqual(visibleIds,route.orderedStopIds.map(stopId=>route.destinations.find(intent=>intent.stopIds[0]===stopId)!.id),'initial chips project canonical order without changing intent source order');
 assert.deepEqual(h.cloud().brief.intent.route.destinations,route.destinations);
 assert.deepEqual(h.cloud().stops.map(stop=>[stop.id,stop.nights]).sort(),before.stops.map(stop=>[stop.id,stop.nights]).sort());
 const savedDays=new Map(h.cloud().planItems.map(day=>[day.id,day]));for(const day of before.planItems){const saved=savedDays.get(day.id);if(saved){assert.deepEqual(saved.notes,day.notes);assert.equal(saved.bookingUrl,day.bookingUrl)}else{const retained=h.cloud().brief.retainedAuthoredContent?.entries.flatMap(entry=>entry.days).find(item=>item.sourceDay.id===day.id);assert.deepEqual(retained?.sourceDay,day,'a day retired by the existing calendar projection retains its complete payload')}}
 const accepted=structuredClone(h.cloud());await h.view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
 await h.view.page.reload();await top.waitFor();assert.deepEqual(await chips.evaluateAll((nodes:Element[])=>nodes.map(node=>node.getAttribute('data-destination-intent-id'))),requestedIntentIds);
 assert.equal(h.cloud().brief.intent.route.orderAuthority,'manual');assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,requestedStopIds);assert.deepEqual(h.cloud().brief.intent.route.destinations,route.destinations);assert.deepEqual(h.cloud().stops,accepted.stops);
 assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('canonical chip reorder retains a locked occurrence in place when intent order differs',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{
  const route=trip.brief.intent.route;route.orderAuthority='optimizable';[route.destinations[1],route.destinations[2]]=[route.destinations[2],route.destinations[1]];
  trip.brief.scheduleLocks={stopIds:[trip.stops[1].id],arrivalDates:{}};
 });try{
 const before=structuredClone(h.cloud()),top=h.view.page.locator('[data-builder-top-controls]');
 assert.equal(await top.getByRole('button',{name:'Reorder Kyoto',exact:true}).isDisabled(),true);
 const grip=top.getByRole('button',{name:'Reorder Tokyo',exact:true});await grip.focus();await grip.press('Space');await grip.press('ArrowRight');await grip.press('Enter');await h.view.page.waitForTimeout(600);
 assert.equal(h.writes(),0);assert.deepEqual(h.cloud(),before);assert.equal(await top.locator('span.sr-only[aria-live="polite"]').textContent(),'');assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('A19 verified new country is reviewed inline; cancel preserves raw draft and Add accepts once',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>Object.assign(trip,canonicalTripForOwner('owner-a',a17TripFixture())),{Istanbul:[{name:'Istanbul',country:'Turkey',canonicalPlaceId:'istanbul',coordinates:[28.9784,41.0082],kind:'city'}]});
 try{
  const before=structuredClone(h.cloud());await h.view.page.getByRole('button',{name:'Add destination',exact:true}).click();const input=h.view.page.getByRole('combobox',{name:'Add a stop',exact:true});
  await input.fill('Istanbul');await h.view.page.getByRole('option',{name:/Istanbul/}).first().click();
  await h.view.page.getByText('Istanbul, Turkey · Adds Turkey to this trip',{exact:true}).waitFor();assert.equal(await h.view.page.getByRole('dialog').count(),0);assert.deepEqual(h.cloud(),before);
  const review=h.view.page.getByRole('group',{name:'Review destination',exact:true});await review.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await input.inputValue(),'Istanbul');assert.deepEqual(h.cloud(),before);
  await input.fill('Istanbul');await input.press('ArrowDown');await h.view.page.getByRole('option',{name:/Istanbul/}).first().click();await review.getByRole('button',{name:'Add Istanbul',exact:true}).click();
  await until(h,()=>h.cloud().stops.some(stop=>stop.name==='Istanbul'));const saved=h.cloud();assert.equal(saved.stops.filter(stop=>stop.name==='Istanbul').length,1);
  assert.deepEqual(saved.stops.slice(0,before.stops.length).map(stop=>[stop.id,stop.nights]),before.stops.map(stop=>[stop.id,stop.nights]));assert.equal(saved.brief.intent.route.orderAuthority,before.brief.intent.route.orderAuthority);assert.deepEqual(saved.brief.intent.route.origin,before.brief.intent.route.origin);
  await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(h.cloud().stops.filter(stop=>stop.name==='Istanbul').length,1);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

 test('A19 pending country review expires on an accepted trip edit and leaves its raw input editable',{skip:!enabled,timeout:30000},async()=>{
  const h=await fixture(false,undefined,{Istanbul:[{name:'Istanbul',country:'Turkey',canonicalPlaceId:'istanbul',coordinates:[28.9784,41.0082],kind:'city'}]});
  try{await h.view.page.getByRole('button',{name:'Add destination',exact:true}).click();const input=h.view.page.getByRole('combobox',{name:'Add a stop',exact:true});await input.fill('Istanbul');await h.view.page.getByRole('option',{name:/Istanbul/}).first().click();await h.view.page.getByRole('button',{name:'Add Istanbul',exact:true}).waitFor();
   await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');assert.equal(await h.view.page.getByRole('button',{name:'Add Istanbul',exact:true}).count(),0);assert.equal(await input.inputValue(),'Istanbul');assert.equal(h.cloud().stops.some(stop=>stop.name==='Istanbul'),false);assert.deepEqual(h.view.errors,[]);
  }finally{await h.view.close()}
 });

test('A17 mounted actual resolver saves the pending removal and reloads the active recovery URL',{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',a17TripFixture()));const original=structuredClone(cloud),writes:typeof cloud[]=[];let release!:()=>void;
 const workerGate=new Promise<void>(resolve=>release=resolve);
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}&recover=1`,accountRequest:async({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};const candidate=requireReadableTripDocument(trip);if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed'}};
  cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',await resolveTripTransferJourneys(candidate),nextTripUpdatedAt(cloud.updatedAt)));writes.push(structuredClone(cloud));return {status:200,body:{trip:cloud}};
 },transferRequest:async({legs})=>{await workerGate;return {status:200,body:{legs:await resolveCanonicalTransferJourneys(legs as TripLeg[])}}}});
 view.page.setDefaultTimeout(6000);
 const waitFor=async(predicate:()=>boolean)=>{for(let i=0;i<60&&!predicate();i++)await view.page.waitForTimeout(100);assert.ok(predicate())};
 try{
  await view.page.locator('[data-builder-top-controls]').waitFor();await view.page.getByRole('combobox',{name:'Start from',exact:true}).fill(' origin unfinished ');
  await view.page.getByRole('button',{name:'Remove Hue',exact:true}).click();await view.page.getByRole('dialog').getByRole('button',{name:'Remove Hue',exact:true}).click();
  await waitFor(()=>cloud.stops.length===3);assert.ok(writes.some(trip=>trip.legs.some(leg=>leg.routeMetadata.source==='necessary-reconciliation'&&leg.routeMetadata.pending===true)));
  assert.deepEqual(cloud.stops.map(stop=>stop.nights),[3,4,3]);assert.deepEqual(cloud.brief.bookings,original.brief.bookings);
  await view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
  release();await waitFor(()=>cloud.legs.every(leg=>leg.routeMetadata.pending!==true));await view.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('easyt:trip-recovery:v2:')));
  const saved=structuredClone(cloud);await view.page.waitForFunction(()=>document.body.textContent?.includes('Saved to your account'));
  await view.page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set('recover','1');history.replaceState(null,'',url)});assert.match(view.page.url(),/recover=1/);await view.page.reload();await view.page.locator('[data-builder-top-controls]').waitFor();
  assert.deepEqual(cloud,saved);assert.equal(await view.page.getByRole('combobox',{name:'Start from',exact:true}).inputValue(),' origin unfinished ');assert.equal(await view.page.getByRole('button',{name:'Remove Hue',exact:true}).count(),0);assert.deepEqual(view.errors,[]);
 }finally{release();await view.close()}
});

test('verified place in known trip geography keeps the existing direct Add selection',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,undefined,{Osaka:[{name:'Osaka',country:'Japan',canonicalPlaceId:'osaka',coordinates:[135.5023,34.6937],kind:'city'}]});
 try{await h.view.page.getByRole('button',{name:'Add destination',exact:true}).click();await h.view.page.getByRole('combobox',{name:'Add a stop',exact:true}).fill('Osaka');await h.view.page.getByRole('option',{name:/Osaka/}).first().click();await until(h,()=>h.cloud().stops.some(stop=>stop.name==='Osaka'));assert.equal(await h.view.page.getByRole('group',{name:'Review destination',exact:true}).count(),0);assert.equal(h.cloud().stops.filter(stop=>stop.name==='Osaka').length,1);assert.deepEqual(h.view.errors,[]);}finally{await h.view.close()}
});

test('A19 outdated lookup failure cannot replace the current Add draft feedback',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();let release!:()=>void,started!:()=>void;const held=new Promise<void>(resolve=>release=resolve),requested=new Promise<void>(resolve=>started=resolve);
 try{
  const before=structuredClone(h.cloud());await h.view.page.route('**/api/journey-geocode?place=Missing*',async(route:Route)=>{started();await held;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:null})})});
  await h.view.page.getByRole('button',{name:'Add destination',exact:true}).click();const input=h.view.page.getByRole('combobox',{name:'Add a stop',exact:true});await input.fill('Missing Place');await input.press('Enter');await requested;
  await input.fill('Istanbul unfinished');release();await h.view.page.waitForTimeout(200);
  assert.equal(await h.view.page.getByText(/We couldn't verify “Missing Place”/).count(),0);assert.equal(await input.inputValue(),'Istanbul unfinished');assert.deepEqual(h.cloud(),before);assert.equal(await h.view.page.getByRole('group',{name:'Review destination',exact:true}).count(),0);assert.deepEqual(h.view.errors,[]);
 }finally{release();await h.view.close()}
});

test('A19 existing explicit finish country is known geography rather than a new country extension',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(true,trip=>{
  trip.brief.intent.route.journeyEnd={mode:'explicit',place:{name:'Istanbul',country:'Turkey',canonicalPlaceId:'istanbul',coordinates:[28.9784,41.0082]}};trip.brief.journeyEnd=trip.brief.intent.route.journeyEnd;
  trip.legs=buildCanonicalTripLegs({tripId:trip.id,origin:{...trip.brief.intent.route.origin!,coordinates:trip.brief.intent.route.origin?.coordinates??null},journeyEnd:trip.brief.intent.route.journeyEnd,stops:trip.stops});
 },{Istanbul:[{name:'Istanbul',country:'Turkey',canonicalPlaceId:'istanbul',coordinates:[28.9784,41.0082],kind:'city'}]});
 try{await h.view.page.getByRole('button',{name:'Add destination',exact:true}).click();await h.view.page.getByRole('combobox',{name:'Add a stop',exact:true}).fill('Istanbul');await h.view.page.getByRole('option',{name:/Istanbul/}).first().click();await until(h,()=>h.cloud().stops.some(stop=>stop.name==='Istanbul'));assert.equal(await h.view.page.getByRole('group',{name:'Review destination',exact:true}).count(),0);assert.equal(h.cloud().brief.intent.route.journeyEnd.mode,'explicit');assert.deepEqual(h.view.errors,[]);}finally{await h.view.close()}
});

test('genuine planning-area children are individual occurrence chips, with guarded child removal and retained sibling nights',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(false,trip=>{
  trip.brief.bookings=[];trip.brief.intent.hardConstraints.fixedCommitments=[];
  const [a,b,c]=trip.brief.intent.route.destinations;
  trip.brief.intent.route.destinations=[{...a!,id:'area:japan',kind:'planning_area',sourceText:'Japan',selectedPlace:{name:'Japan',country:'Japan',canonicalPlaceId:'country:japan'},stopIds:[...a!.stopIds,...b!.stopIds]},c!];
 });try{
  const before=structuredClone(h.cloud()),top=h.view.page.locator('[data-builder-top-controls]');
  const removed=before.stops.find(stop=>stop.name==='Tokyo')!,sibling=before.stops.find(stop=>stop.name==='Kyoto')!;
  const parent=top.locator('[data-destination-intent-id="area:japan"]');
  assert.equal(await parent.getByRole('group',{name:'Japan',exact:true}).count(),1);
  assert.equal(await parent.getByRole('button',{name:'Edit Tokyo',exact:true}).count(),1);
  assert.equal(await parent.getByRole('button',{name:'Edit Kyoto',exact:true}).count(),1);
  assert.equal(await top.locator('[data-destination-stop-id]').count(),2);
  await parent.getByRole('button',{name:'Remove Tokyo',exact:true}).click();
  await h.view.page.getByRole('dialog').getByRole('button',{name:'Remove Tokyo',exact:true}).click();
  await until(h,()=>!h.cloud().stops.some(stop=>stop.id===removed.id));
  const kept=h.cloud().stops.find(stop=>stop.id===sibling.id)!;
  assert.equal(kept.nights,sibling.nights);assert.equal(kept.canonicalPlaceId,sibling.canonicalPlaceId);
  assert.deepEqual(h.cloud().brief.manualNightStopIds,before.brief.manualNightStopIds);
  assert.equal(h.cloud().brief.intent.route.orderAuthority,'manual');
  assert.deepEqual(h.cloud().brief.intent.route.destinations.find(intent=>intent.id==='area:japan')?.stopIds,[sibling.id]);
  await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();
  assert.equal(await h.view.page.getByRole('button',{name:'Edit Kyoto',exact:true}).count(),1);
  assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});

test('individually added cities have no inferred country group and Update route remains secondary',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture();try{
  const top=h.view.page.locator('[data-builder-top-controls]');
  assert.equal(await top.locator('[data-destination-parent-group]').count(),0);
  const action=top.getByRole('button',{name:'Update route',exact:true});
  assert.equal(await action.getAttribute('data-route-action'),'optional-optimization');
  const before=structuredClone(h.cloud());
  await top.getByRole('button',{name:/Increase travellers/}).click();await until(h,()=>h.cloud().travellers===before.travellers+1);
  await top.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');
  assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
  assert.deepEqual(h.cloud().stops,before.stops);assert.ok(h.writes()>=2);
  await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();
  assert.equal(await top.getByRole('combobox',{name:'Budget',exact:true}).inputValue(),'high');
  const budget=top.getByRole('combobox',{name:'Budget',exact:true});await budget.focus();assert.equal(await budget.evaluate((node:Element)=>document.activeElement===node),true);
  const quantity=top.getByRole('button',{name:/Increase travellers/});await quantity.focus();await quantity.press('ArrowLeft');await until(h,()=>h.cloud().travellers===before.travellers);
  assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
  assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
