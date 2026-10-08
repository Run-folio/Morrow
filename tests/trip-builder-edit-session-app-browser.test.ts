import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {stopEndpoint} from '../lib/easyt/trip-legs.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
test('undated stay requests permit deliberate night and order edits while booked stays stay protected',{skip:!enabled,timeout:30000},async()=>{
  let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
  cloud.brief.intent.hardConstraints.fixedCommitments=cloud.stops.map(stop=>({id:`request:${stop.id}`,label:`${stop.name} ${stop.nights} nights`,stopId:stop.id,fixedNights:stop.nights!}));
  const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
    if(method==='GET')return {status:200,body:{trip:cloud}};
    cloud={...requireReadableTripDocument(trip),updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
  }});
  try{
    await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    const kyoto=view.page.getByRole('button',{name:/Add one night to Kyoto/});
    assert.equal(await kyoto.isEnabled(),true,'an undated quantity is not a date or booking lock');
    assert.equal(await view.page.getByRole('button',{name:/Add one night to Tokyo/}).isDisabled(),true);
    await kyoto.click();
    await view.page.getByLabel('Actions for Hiroshima',{exact:true}).click();
    await view.page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Earlier',exact:true}).last().click();
    for(let i=0;i<50&&(cloud.stops[1]!.name!=='Hiroshima'||cloud.stops.find(stop=>stop.name==='Kyoto')!.nights!==4);i++)await view.page.waitForTimeout(100);
    assert.equal(cloud.stops[1]!.name,'Hiroshima');assert.equal(cloud.stops.find(stop=>stop.name==='Kyoto')!.nights,4);
    assert.equal(cloud.brief.intent.route.orderAuthority,'manual');
    await view.page.waitForFunction(()=>document.body.textContent?.includes('Saved to your account'));
    await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.equal(await view.page.getByRole('button',{name:/Add one night to Kyoto; 4 nights/}).count(),1);assert.deepEqual(view.errors,[]);
  }finally{await view.close()}
});
for(const repeated of [false,true])test(`A20 mounted removal confirms the same occurrence after held canonical identity ACK${repeated?' with a same-name sibling':''}`, {skip:!enabled,timeout:30000},async()=>{
  let cloud=requireReadableTripDocument(canonicalRouteFixture());
  if(repeated){
    const sibling=cloud.stops[1]!,target=cloud.stops[2]!;
    sibling.name=target.name;sibling.canonicalPlaceId=target.canonicalPlaceId;sibling.latitude=target.latitude;sibling.longitude=target.longitude;
    const intent=cloud.brief.intent.route.destinations[1]!;intent.sourceText=target.name;intent.selectedPlace={...intent.selectedPlace!,name:target.name,canonicalPlaceId:target.canonicalPlaceId};
  }
  const original=structuredClone(cloud),writes:typeof cloud[]=[];
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});
  const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:async({method,trip})=>{
    if(method==='GET')return {status:200,body:{trip:cloud}};
    const candidate=requireReadableTripDocument(trip);writes.push(candidate);
    if(writes.length===1)await held;
    cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',candidate,nextTripUpdatedAt(cloud.updatedAt)));
    return {status:200,body:{trip:cloud}};
  }});
  try{
    await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    await view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
    for(let i=0;i<50&&!writes.length;i++)await view.page.waitForTimeout(100);assert.equal(writes.length,1);
    await view.page.getByLabel('Actions for Hiroshima',{exact:true}).last().click();
    await view.page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Remove stop',exact:true}).last().click();
    await view.page.getByRole('dialog').waitFor();release();
    await view.page.waitForFunction(()=>document.querySelector('[data-builder-stop-id="batch14-trip-stop-hiroshima"]'));
    await view.page.getByRole('dialog').getByRole('button',{name:'Remove Hiroshima',exact:true}).click();
    for(let i=0;i<50&&cloud.stops.length!==2;i++)await view.page.waitForTimeout(100);
    assert.equal(cloud.stops.length,2,'pending removal must follow the acknowledged occurrence ID');
    assert.equal(cloud.stops.filter(stop=>stop.canonicalPlaceId==='place:hiroshima').length,repeated?1:0);
    if(repeated)assert.equal(cloud.stops[1]!.id,'batch14-trip-stop-kyoto','stable sibling identity must survive');
    assert.equal(cloud.brief.retainedAuthoredContent?.entries[0]?.sourceStop.canonicalPlaceId,'place:hiroshima');
    assert.deepEqual(cloud.brief.bookings,original.brief.bookings);
    await view.page.waitForFunction(()=>document.body.textContent?.includes('Saved to your account'));
    await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.equal(await view.page.getByLabel('Actions for Hiroshima',{exact:true}).count(),repeated?1:0);assert.deepEqual(view.errors,[]);
  }finally{release();await view.close()}
});
test('mounted_Build_promotes_exact_guest_recovery_then_uses_owned_CAS_and_navigation', {skip:!enabled,timeout:30000},async()=>{
  const initial=requireReadableTripDocument(canonicalRouteFixture());initial.ownerId=null;
  const first=initial.stops[0]!;const origin={name:first.name,country:first.country,canonicalPlaceId:first.canonicalPlaceId,coordinates:[first.longitude!,first.latitude!] as [number,number]};
  initial.brief.intent.route.origin=origin;initial.brief.origin=origin.name;initial.brief.originCanonicalPlaceId=origin.canonicalPlaceId;initial.brief.originCountry=origin.country;initial.brief.originCoordinates=origin.coordinates;
  initial.brief.intent.hardConstraints.avoidDriving=false;initial.brief.intent.preferences.transportModes=['flight','train','drive'];
  let cloud:typeof initial|null=null;const writes:{method:string;path:string;trip:typeof initial}[]=[];
  const view=await renderBuilder({initialTrip:initial,ownerId:'owner-a',query:`?trip=${initial.id}&recover=1`,accountRequest:({method,path,trip})=>{
    if(method==='GET')return cloud?{status:200,body:{trip:cloud}}:{status:404,body:{error:'Not found'}};
    const candidate=requireReadableTripDocument(trip);writes.push({method,path,trip:candidate});
    if(path.endsWith('/promote')){assert.equal(candidate.ownerId,null);assert.equal(candidate.status,'draft');cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',candidate,nextTripUpdatedAt(candidate.updatedAt)));return {status:201,body:{trip:cloud,outcome:'promoted'}};}
    assert.ok(cloud);assert.equal(candidate.ownerId,'owner-a');assert.equal(candidate.updatedAt,cloud.updatedAt);cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
  }});
  try{
    await view.page.locator('[data-builder-edit-session="active"]').waitFor({timeout:5000});await view.page.waitForTimeout(600);assert.equal(writes.length,0,'read/login alone never promote');
    await view.page.getByRole('button',{name:/^Build trip/}).click({timeout:3000});
    const attention=view.page.getByRole('dialog');if(await attention.count())await attention.getByRole('button',{name:/Build|Continue/}).click({timeout:3000});
    await view.page.waitForURL(new RegExp(`/journey/${initial.id}\\?created=1`),{timeout:7000});
    assert.equal(writes.filter(w=>w.path.endsWith('/promote')).length,1);assert.equal(writes.filter(w=>w.method==='PUT').length,1);assert.equal(cloud!.status,'planned');
    assert.equal(cloud!.stops.length,3);
    await view.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
    assert.equal(await view.page.getByText('Trip unavailable',{exact:true}).count(),0);
    const built=structuredClone(cloud!);
    for(const suffix of ['/itinerary','','/itinerary']){
      await view.page.goto(new URL(`/journey/${initial.id}${suffix}`,view.page.url()).href);
      await view.page.getByRole('region',{name:suffix?'Trip itinerary':'Trip overview',exact:true}).waitFor();
      await view.page.reload();
      await view.page.getByRole('region',{name:suffix?'Trip itinerary':'Trip overview',exact:true}).waitFor();
      assert.deepEqual(cloud!.stops,built.stops);assert.deepEqual(cloud!.planItems,built.planItems);
      assert.deepEqual(cloud!.brief.intent.route.orderedStopIds,built.brief.intent.route.orderedStopIds);
    }
    assert.deepEqual(view.errors,[]);
  }catch(error){throw new Error(`${String(error)}; mounted=${await view.page.evaluate(()=>document.querySelector('[data-builder-root]')?.getAttribute('data-builder-edit-session'))}; body=${(await view.page.locator('body').innerText()).slice(-2500)}; writes=${JSON.stringify(writes.map(w=>({method:w.method,path:w.path,status:w.trip.status})))}; errors=${JSON.stringify(view.errors)}; storage=${await view.page.evaluate(()=>JSON.stringify(Object.keys(localStorage)))}`,{cause:error})}finally{await view.close()}
});
test('mounted_new_trip_navigation_keeps_latest_edit_and_flushes_same_queue', {skip:!enabled,timeout:30000},async()=>{
  let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));let writes=0;
  const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
    if(method==='GET')return {status:200,body:{trip:cloud}};writes++;const candidate=requireReadableTripDocument(trip);assert.equal(candidate.updatedAt,cloud.updatedAt);cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
  }});
  try{
    await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.getByRole('button',{name:/Add one night to Kyoto/}).click();
    const allowed=await view.page.evaluate(()=>window.dispatchEvent(new Event('easyt-before-new-trip',{cancelable:true})));assert.equal(allowed,true);
    for(let i=0;i<50&&!writes;i++)await view.page.waitForTimeout(100);assert.ok(writes>0);assert.equal(cloud.stops.find(s=>s.name==='Kyoto')!.nights,4);assert.deepEqual(view.errors,[]);
  }finally{await view.close()}
});
test('mounted_two_current_sessions_CAS_conflict_retains_B_input_recovery_and_reload', {skip:!enabled,timeout:30000},async()=>{
  let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
  const initial=structuredClone(cloud);let puts=0;
  const accountRequest=({method,trip}:{method:string;trip:unknown})=>{
    if(method==='GET')return {status:200,body:{trip:cloud}};
    const candidate=requireReadableTripDocument(trip);puts++;
    if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'This trip changed in the cloud.'}};
    cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
  };
  const a=await renderBuilder({initialTrip:initial,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest});
  const b=await renderBuilder({initialTrip:initial,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest});
  try{
    await a.page.locator('[data-builder-edit-session="active"]').waitFor();await b.page.locator('[data-builder-edit-session="active"]').waitFor();
    await a.page.getByRole('button',{name:/Add one night to Kyoto/}).click();
    for(let attempt=0;attempt<50 && cloud.stops.find(s=>s.name==='Kyoto')!.nights!==4;attempt++)await a.page.waitForTimeout(100);
    const raw='  B unfinished origin  ';await b.page.locator('#builder-origin').getByRole('combobox').first().fill(raw);
    await b.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
    await b.page.getByText('This device trip conflicts with the account trip. Review recovery before continuing.',{exact:true}).waitFor({timeout:5000});
    assert.equal(cloud.brief.budgetBand,'mid');assert.equal(cloud.stops.find(s=>s.name==='Kyoto')!.nights,4);
    assert.equal(new URL(b.page.url()).searchParams.get('recover'),'1');
    const recovery=await b.page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:')).map(key=>JSON.parse(localStorage.getItem(key)!)).find(record=>record.trip.brief.budgetBand==='high'));
    assert.ok(recovery);assert.equal(recovery.state,'conflict');const attempts=puts;await b.page.waitForTimeout(700);assert.equal(puts,attempts,'conflicts cannot automatically retry');
    await b.page.reload();await b.page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.equal(await b.page.getByRole('combobox',{name:'Budget',exact:true}).inputValue(),'high');assert.equal(await b.page.locator('#builder-origin').getByRole('combobox').first().inputValue(),raw);
    assert.equal(cloud.brief.budgetBand,'mid');assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
  }finally{await a.close();await b.close()}
});
test('mounted_partial_origin_survives_budget_autosave_and_reload', {skip:!enabled,timeout:30000},async()=>{
  let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
  const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
    if(method==='GET')return {status:200,body:{trip:cloud}};
    const candidate=requireReadableTripDocument(trip);if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'Changed'}};
    cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
  }});
  try{
    await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    const origin=view.page.locator('#builder-origin').getByRole('combobox').first();await origin.fill('  unfinished origin  ');
    await view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
    await view.page.waitForFunction(()=>document.body.textContent?.includes('Saved on this device'),undefined,{timeout:5000});
    for(let attempt=0;attempt<50 && cloud.brief.budgetBand!=='high';attempt++)await view.page.waitForTimeout(100);
    assert.equal(cloud.brief.budgetBand,'high');assert.equal(cloud.brief.origin,'London');
    await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.equal(await view.page.locator('#builder-origin').getByRole('combobox').first().inputValue(),'  unfinished origin  ');assert.deepEqual(view.errors,[]);
  }finally{await view.close()}
});
test('mounted_second_edit_Undo_delayed_ACK_and_reload_preserve_latest_canonical', {skip:!enabled,timeout:30000},async()=>{
  let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
  const writes:typeof cloud[]=[];let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});
  const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:async({method,trip})=>{
    if(method==='GET')return {status:200,body:{trip:cloud}};
    const candidate=requireReadableTripDocument(trip);writes.push(candidate);if(writes.length===1)await held;
    if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'Changed'}};
    cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
  }});
  try{
    await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    await view.page.getByRole('button',{name:/Add one night to Kyoto/}).click();
    for(let attempt=0;attempt<50 && !writes.length;attempt++)await view.page.waitForTimeout(100);assert.equal(writes.length,1);
    await view.page.getByRole('button',{name:/Add one night to Hiroshima/}).click();
    await view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
    await view.page.getByRole('button',{name:'Undo',exact:true}).click();
    assert.equal(writes.length,1,'only one request may be in flight');
    release();
    for(let attempt=0;attempt<50 && writes.length<2;attempt++)await view.page.waitForTimeout(100);
    await view.page.waitForFunction(()=>document.body.textContent?.includes('Saved to your account'));
    assert.equal(cloud.stops.find(s=>s.name==='Kyoto')!.nights,4);assert.equal(cloud.stops.find(s=>s.name==='Hiroshima')!.nights,2);
    assert.ok(writes.length>=2);assert.equal(cloud.brief.budgetBand,'high');assert.ok(writes.slice(1).every(write=>write.ownerId==='owner-a'));
    await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.equal(await view.page.getByRole('button',{name:/Add one night to Kyoto; 4 nights/}).count(),1);
    assert.equal(await view.page.getByRole('button',{name:/Add one night to Hiroshima; 2 nights/}).count(),1);assert.deepEqual(view.errors,[]);
  }finally{release();await view.close()}
});
test('mounted_row_edit_autosaves_through_one_account_writer_without_Build', {skip:!enabled,timeout:30000},async()=>{
  let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
  const writes:typeof cloud[]=[];
  const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
    if(method==='GET')return {status:200,body:{trip:cloud}};
    const candidate=requireReadableTripDocument(trip);writes.push(candidate);
    if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'Changed'}};
    cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
  }});
  try{
    await view.page.locator('[data-builder-edit-session="active"]').waitFor({timeout:5000});
    const button=view.page.getByRole('button',{name:/Add one night to Kyoto/});await button.click();
    for(let attempt=0;attempt<50 && !writes.length;attempt++) await view.page.waitForTimeout(100);
    await view.page.waitForFunction(()=>document.body.textContent?.includes('Saved to your account'),undefined,{timeout:5000});
    assert.ok(writes.length>0,'ordinary row edit must autosave without Build');
    assert.equal(cloud.stops.find(s=>s.name==='Kyoto')!.nights,4);
    assert.deepEqual(view.errors,[]);
  }finally{await view.close()}
});

test('mounted_remove_order_Undo_preserve_full_authored_content_and_later_preferences', {skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));const original=structuredClone(cloud);
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};const candidate=requireReadableTripDocument(trip);if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'Changed'}};cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});
 try{
  await view.page.locator('[data-builder-edit-session="active"]').waitFor();
  await view.page.getByLabel('Actions for Hiroshima',{exact:true}).click();await view.page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Remove stop',exact:true}).last().click();
  await view.page.getByRole('dialog').getByRole('button',{name:'Remove Hiroshima',exact:true}).click();
  await view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
  for(let i=0;i<50&&cloud.stops.length!==2;i++)await view.page.waitForTimeout(100);assert.equal(cloud.stops.length,2);
  assert.ok(cloud.brief.retainedAuthoredContent?.entries.length);assert.deepEqual(cloud.brief.bookings,original.brief.bookings);
  await view.page.getByRole('button',{name:'Undo',exact:true}).click();
  for(let i=0;i<50&&(Number(cloud.stops.length)!==3||cloud.brief.budgetBand!=='high');i++)await view.page.waitForTimeout(100);
  assert.equal(cloud.stops.length,3);assert.equal(cloud.brief.budgetBand,'high');assert.equal(cloud.brief.retainedAuthoredContent?.entries.length??0,0);
  const restored=cloud.planItems.filter(item=>item.stopId===original.stops[2]!.id);
  const authoredDay=({contextNotes:_generated,...day}:typeof cloud.planItems[number])=>day;
  assert.deepEqual(restored.map(authoredDay),original.planItems.filter(item=>item.stopId===original.stops[2]!.id).map(authoredDay));
  assert.ok(restored.every(item=>item.contextNotes?.length),'restored slots receive current generated guidance without changing authored fields');
  await view.page.getByLabel('Actions for Hiroshima',{exact:true}).click();await view.page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Earlier',exact:true}).last().click();
  for(let i=0;i<50&&cloud.brief.intent.route.orderedStopIds[1]!==original.stops[2]!.id;i++)await view.page.waitForTimeout(100);
  assert.equal(cloud.brief.intent.route.orderAuthority,'manual');assert.equal(cloud.stops[1]!.id,original.stops[2]!.id);
  await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});

test('mounted_selected_origin_type_and_dates_autosave_dependencies_without_Save_or_Update_route',{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));
 const originalOrder=[...cloud.brief.intent.route.orderedStopIds];
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,geocodeCandidates:{Paris:[{name:'Paris',country:'France',canonicalPlaceId:'paris',coordinates:[2.3522,48.8566],placeType:'city',routability:'direct_destination'}]},accountRequest:({method,trip})=>{
 if(method==='GET')return {status:200,body:{trip:cloud}};const candidate=requireReadableTripDocument(trip);if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'Changed'}};cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});
 try{
 await view.page.locator('[data-builder-edit-session="active"]').waitFor();
 const origin=view.page.locator('#builder-origin').getByRole('combobox',{name:'Start from',exact:true});await origin.fill('Paris');await view.page.getByRole('option',{name:/^Paris.*France/}).first().click({timeout:5000});
 await view.page.getByRole('button',{name:'Return to start',exact:true}).click();
 await view.page.getByRole('button',{name:/Increase travellers/}).click();
 await view.page.getByRole('button',{name:/Travel dates/}).click();
 const dateDialog=view.page.getByRole('dialog');await dateDialog.locator('input').fill('2026-10-10');await dateDialog.locator('input').press('Enter');await dateDialog.locator('input').fill('2026-10-20');await dateDialog.locator('input').press('Enter');
 for(let i=0;i<50&&(cloud.endDate!=='2026-10-20'||cloud.brief.intent.route.tripType!=='return_to_start');i++)await view.page.waitForTimeout(100);
 assert.equal(cloud.brief.origin,'Paris');assert.equal(cloud.brief.intent.route.tripType,'return_to_start');assert.equal(cloud.endDate,'2026-10-20');assert.equal(cloud.travellers,3);assert.deepEqual(cloud.brief.intent.route.orderedStopIds,originalOrder);
 assert.ok(cloud.legs.some(leg=>leg.fromEndpoint?.kind==='origin'&&leg.fromEndpoint.canonicalPlaceId==='paris'));assert.ok(cloud.legs.some(leg=>leg.toEndpoint?.kind==='end'&&leg.toEndpoint.canonicalPlaceId==='paris'));
 await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});

test('mounted_storage_failure_blocks_navigation_and_account_write',{skip:!enabled,timeout:30000},async()=>{
 const cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));let writes=0;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method})=>{if(method!=='GET')writes++;return {status:200,body:{trip:cloud}}}});
 try{await view.page.locator('[data-builder-edit-session="active"]').waitFor();
 await view.page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('easyt:trip-recovery:'))throw new DOMException('Fixture storage blocked','QuotaExceededError');return original.call(this,key,value)}});
 await view.page.getByRole('button',{name:/Add one night to Kyoto/}).click();await view.page.getByText('The accepted edit could not safely replace this device recovery.',{exact:true}).waitFor({timeout:5000});
 assert.equal(await view.page.evaluate(()=>window.dispatchEvent(new Event('easyt-before-new-trip',{cancelable:true}))),false);await view.page.waitForTimeout(600);assert.equal(writes,0);assert.equal(cloud.stops.find(s=>s.name==='Kyoto')!.nights,3);assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});

test('mounted_owner_rotation_preserves_A_recovery_and_ignores_delayed_ACK',{skip:!enabled,timeout:30000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',requireReadableTripDocument(canonicalRouteFixture())));let writes=0;let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:async({method,trip})=>{
 if(method==='GET')return {status:200,body:{trip:cloud}};writes++;const candidate=requireReadableTripDocument(trip);await held;cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});
 try{await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.getByRole('button',{name:/Add one night to Kyoto/}).click();for(let i=0;i<50&&!writes;i++)await view.page.waitForTimeout(100);assert.equal(writes,1);
 await view.page.evaluate(()=>{(window as unknown as {__BUILDER_TEST_OWNER__:string}).__BUILDER_TEST_OWNER__='owner-b';window.dispatchEvent(new Event('builder-test-owner'))});
 await view.page.waitForURL(/\/journey\/dashboard$/,{timeout:5000});release();await view.page.waitForTimeout(600);
 const recoveries=await view.page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:')).map(key=>JSON.parse(localStorage.getItem(key)!)));assert.ok(recoveries.some((record:{ownerId:string;trip:{stops:{name:string;nights:number}[]}})=>record.ownerId==='owner-a'&&record.trip.stops.some((stop:{name:string;nights:number})=>stop.name==='Kyoto'&&stop.nights===4)));assert.equal(recoveries.some((record:{ownerId:string})=>record.ownerId==='owner-b'),false);assert.deepEqual(view.errors,[]);
 }finally{release();await view.close()}
});

test('mounted_supported_transport_choice_autosaves_and_survives_reload',{skip:!enabled,timeout:30000},async()=>{
 const initial=requireReadableTripDocument(canonicalRouteFixture());const leg=initial.legs[0]!,from=stopEndpoint(initial.stops[0]!),to=stopEndpoint(initial.stops[1]!);
 const candidates=([['train',210,'canonical_schedule','intercity_rail_network'],['road',390,'routing_engine','routed_road']] as const).map(([mode,minutes,provenance,evidence])=>({id:`fixture:${mode}`,summaryMode:mode,totalDurationMinutes:minutes,distanceKm:450,confidence:'high',provenance,evidence,connectionCount:0,reasons:['Fixture reviewed evidence'],segments:[{id:`fixture:${mode}:segment`,mode,fromEndpoint:from,toEndpoint:to,durationMinutes:minutes,distanceKm:450,provenance,confidence:'high',provider:'Fixture',scheduleNeedsChecking:true}]}));
 leg.fromEndpoint=from;leg.toEndpoint=to;leg.routeMetadata={multimodalResolution:{version:1,selected:'train',selectedCandidateId:'fixture:train',candidates,rejected:[]}};
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',initial));const legId=cloud.legs[0]!.id;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{if(method==='GET')return {status:200,body:{trip:cloud}};const candidate=requireReadableTripDocument(trip);if(candidate.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud,conflictReason:'cloud-changed',error:'Changed'}};cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}}}});
 try{await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.getByRole('button',{name:'Change transport mode',exact:true}).first().click();await view.page.getByRole('button',{name:/Road.*6h 30/}).first().click({timeout:5000});
 for(let i=0;i<50&&!cloud.brief.decisionSelections?.transportByLeg[legId];i++)await view.page.waitForTimeout(100);const selected=cloud.brief.decisionSelections?.transportByLeg[legId];assert.ok(selected&&typeof selected!=='string');assert.equal(selected.mode,'road');
 await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.getByText('Your choice',{exact:true}).waitFor({timeout:5000});assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
