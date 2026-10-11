import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderBuilder} from './helpers/builder-render.ts';
import {loadLocalTripFromStorage} from '../lib/easyt/storage.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {acceptedA12OccurrenceTrip} from './fixtures/batch14-accepted-occurrence.ts';
import {geographicallyReady,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {originPlaceFromBrief} from '../lib/easyt/journey-endpoints.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-occurrence.json',import.meta.url),'utf8'));
const fold=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
for(const {mode,currentInputs} of [{mode:'fresh',currentInputs:true},{mode:'reload',currentInputs:true},{mode:'promoted',currentInputs:true},{mode:'fresh',currentInputs:false}] as const)test(currentInputs?`A12 mounted successive Como then Verona clarification retains source positions and nights: ${mode}`:'A12 historical unverified provider points remain blocked after ordinary clarification and reload',{skip:!enabled,timeout:30000},async()=>{
 const source=currentInputs?acceptedA12OccurrenceTrip(fixtures.A12.trip):requireReadableTripDocument(structuredClone(fixtures.A12.trip));let cloud=mode==='promoted'?requireReadableTripDocument(canonicalTripForOwner('owner-a',source)):source;const initial=structuredClone(cloud),id=initial.id;
 const view=await renderBuilder({initialTrip:initial,query:`?trip=${id}${mode==='promoted'?'':'&recover=1'}`,geocodeCandidates:fixtures.A12.geocodeCandidates,...(mode==='promoted'?{seedRecovery:false,ownerId:'owner-a',accountRequest:({method,trip}:{method:string;trip:unknown})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};const next=requireReadableTripDocument(trip);assert.equal(next.updatedAt,cloud.updatedAt);cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',next,nextTripUpdatedAt(cloud.updatedAt)));return {status:200,body:{trip:cloud}};
 }}:{})});
 view.page.setDefaultTimeout(5000);
 const read=async()=>{
  if(mode==='promoted')return structuredClone(cloud);
  const records=await view.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)!]))) as Record<string,string>;
  return requireReadableTripDocument(loadLocalTripFromStorage({getItem:key=>records[key]??null,setItem:(key,value)=>{records[key]=value},removeItem:key=>{delete records[key]},key:index=>Object.keys(records)[index]??null,get length(){return Object.keys(records).length}},id,null));
 };
 async function choose(source:string,name:string){
  const dialog=view.page.getByRole('dialog').last();
  const matches=async()=>await dialog.isVisible().catch(()=>false)&&await dialog.evaluate((el:HTMLElement,wanted:string)=>{const key=el.getAttribute('aria-describedby');return key?document.getElementById(key)?.textContent===wanted:false;},source);
  if(await dialog.isVisible().catch(()=>false)&&!await matches()){await dialog.getByRole('button',{name:'Finish later',exact:true}).click();await dialog.waitFor({state:'hidden'});}
  if(!await matches())await view.page.getByRole('button',{name:new RegExp('^Choose place.*'+source,'i')}).first().click();
  await dialog.waitFor();assert(await matches(),'Normal clarification must target '+source);
  if(!await dialog.getByRole('combobox').first().isVisible().catch(()=>false))await dialog.getByRole('button').filter({hasText:/Search.*specific|Search for a place/i}).first().click();
  await dialog.getByRole('combobox').first().fill(name);await view.page.getByRole('option').filter({hasText:name}).filter({hasText:'Italy'}).first().click();
  for(let attempt=0;attempt<50;attempt++){const trip=await read();if(trip?.brief.intent.route.destinations.some(i=>i.sourceText===source&&i.resolution==='resolved'&&i.stopIds.length))break;await view.page.waitForTimeout(100);}
  assert((await read())?.brief.intent.route.destinations.some(i=>i.sourceText===source&&i.resolution==='resolved'&&i.stopIds.length),'Normal source choice must bind '+source);
  if(mode==='promoted')await view.page.getByText('Saved to your account',{exact:true}).waitFor();
  if(await matches()){
   const done=dialog.getByRole('button',{name:/^Finish shaping route|^Done with |^Add to trip|^Add places|^Add \d+ place/}).last();
   if(await done.isVisible().catch(()=>false)&&await done.isEnabled())await done.click();
  }
 }
 try{
  await view.page.locator('[data-builder-edit-session="active"]').waitFor();
  await choose('Lake Como','Como');const accepted=await read();assert(accepted);
  const lake=accepted.brief.intent.route.destinations.find(i=>i.sourceText==='Lake Como');assert(lake,'Accepted Lake Como intent must exist');assert.equal(lake.requestedNights,4);assert.equal(lake.stopIds.length,1);
  const como=accepted.stops.find(s=>s.id===lake.stopIds[0]);assert(como,'Accepted Como stay must exist');assert.equal(como.nights,4);const oldIds=accepted.stops.map(s=>s.id);
  if(mode==='reload'){if(await view.page.getByRole('dialog').last().isVisible().catch(()=>false))await view.page.getByRole('dialog').last().getByRole('button',{name:'Finish later',exact:true}).click();await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();assert.deepEqual((await read()).stops.map(s=>s.id),oldIds);}
  await choose('Verona','Verona');const resolved=await read();
  assert.deepEqual(resolved.stops.map(s=>fold(s.name)),['milan','como','verona','venice'],'Resolving Verona must follow the existing Lake Como occurrence despite its new canonical label');
  assert.deepEqual(resolved.stops.map(s=>s.nights),[2,4,2,3]);assert.deepEqual(resolved.stops.filter(s=>oldIds.includes(s.id)).map(s=>s.id),oldIds);
  assert.equal(resolved.stops[1].id,como.id);assert.equal(resolved.brief.intent.route.orderAuthority,initial.brief.intent.route.orderAuthority);
  for(const [source,nights] of [['Lake Como',4],['Verona',2]] as const){const i=resolved.brief.intent.route.destinations.find(d=>d.sourceText===source);assert(i,'Accepted source intent must exist: '+source);assert.equal(i.requestedNights,nights);assert(resolved.brief.intent.hardConstraints.fixedCommitments.some(c=>c.stopId===i.stopIds[0]&&c.fixedNights===nights));}
  if(await view.page.getByRole('dialog').last().isVisible().catch(()=>false))await view.page.getByRole('dialog').last().getByRole('button',{name:'Finish later',exact:true}).click();
  const build=view.page.getByRole('button',{name:/^Build trip/}).last();
  if(!currentInputs){
   const signature=resolved.stops.map(s=>[s.id,s.canonicalPlaceId,s.nights]);
   assert.equal(await build.isEnabled(),false,'Resolving siblings cannot silently qualify old provider points');
   assert.match(await build.locator('..').innerText(),/Confirm the location of Milan, Venice before building/);
   assert.deepEqual(resolved.stops.filter(s=>!geographicallyReady(stopGeographicPlace(s))).map(s=>s.name),['Milan','Venice']);
   assert.equal(geographicallyReady(originPlaceFromBrief(resolved.brief),'endpoint'),false);
   await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();
   assert.equal(await build.isEnabled(),false);
   assert.deepEqual((await read()).stops.map(s=>[s.id,s.canonicalPlaceId,s.nights]),signature);
   assert.deepEqual(view.errors,[]);return;
  }
  assert(await build.isEnabled(),'Complete bound A12 route must be buildable');await build.click();await view.page.waitForURL(/\/journey\/trip-[^/]+\?created=1/);await view.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  const built=await read(),signature=built.stops.map(s=>[s.id,s.canonicalPlaceId,s.nights]);assert.deepEqual(built.stops.map(s=>s.nights),[2,4,2,3]);assert.deepEqual(built.stops.map(s=>fold(s.name)),['milan','como','verona','venice']);
  await view.page.goto(`${new URL(view.page.url()).origin}/journey/new?trip=${id}&recover=1`);await view.page.locator('[data-builder-edit-session="active"]').waitFor();await view.page.reload();await view.page.locator('[data-builder-edit-session="active"]').waitFor();assert.deepEqual((await read()).stops.map(s=>[s.id,s.canonicalPlaceId,s.nights]),signature);
  for(const suffix of ['', '/itinerary']){await view.page.goto(`${new URL(view.page.url()).origin}/journey/${id}${suffix}`);await view.page.getByRole('region',{name:suffix?'Trip itinerary':'Trip overview',exact:true}).waitFor();assert.deepEqual((await read()).stops.map(s=>[s.id,s.canonicalPlaceId,s.nights]),signature);}
  assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
