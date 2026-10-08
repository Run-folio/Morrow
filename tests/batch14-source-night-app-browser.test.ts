import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url),runtime=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const enabled=process.env.MORROVIA_CORE_JOURNEY_BROWSER_TESTS==='1',base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3102';
if(enabled)assert(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Local app verification only');
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-source-night-resolution.json',import.meta.url),'utf8'));
const fold=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const london={name:'City of London',country:'United Kingdom',canonicalPlaceId:'open-world:nominatim:relation:51800',coordinates:[-0.0919983,51.5156177],placeType:'city'};
for(const fixture of fixtures)test(`${fixture.case} actual source clarification creates a bound night commitment and survives Build/reload`,{skip:!enabled,timeout:90000},async()=>{
 const {chromium}=require(existsSync(runtime)?runtime:'playwright') as typeof import('playwright');const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));const prompt=fixture.trip.brief.structuredBrief.source.rawPrompt;
 const sources=fixture.selections.map((s:any)=>({name:s.place.name,country:s.place.country,canonicalPlaceId:s.place.canonicalPlaceId,coordinates:s.place.coordinates,placeType:s.mention.placeType}));
 const others=fixture.trip.stops.filter((s:any)=>s.canonicalPlaceId&&s.latitude!==null&&s.longitude!==null).map((s:any)=>({name:s.name,country:s.country,canonicalPlaceId:s.canonicalPlaceId,coordinates:[s.longitude,s.latitude],placeType:'city'}));
 try{
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url());let body:unknown,status=200;
   if(url.pathname.includes('/auth/'))body=null;
   else if(url.pathname==='/api/journey-capture'){assert.equal(route.request().postDataJSON().brief,prompt);body=fixture.capture;}
   else if(url.pathname==='/api/journey-geocode'){
    const query=fold(url.searchParams.get('place')??'');const choices=[london,...others,...(url.searchParams.has('intent')?sources:[])].filter(p=>query&&(fold(p.name).includes(query)||query.includes(fold(p.name))));body={candidates:choices,result:choices[0]??null};
   }else if(url.pathname==='/api/journey-transfer-resolution')body={legs:route.request().postDataJSON().legs};
   else {status=404;body={error:'Unavailable external boundary'};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();
  if(await page.getByRole('button',{name:'Reject optional',exact:true}).count())await page.getByRole('button',{name:'Reject optional',exact:true}).click();
  const origin=page.getByRole('combobox',{name:'Start from',exact:true});await origin.fill('City of London');await page.getByRole('option').filter({hasText:'City of London'}).first().click();
  await page.getByRole('button',{name:'One way',exact:true}).click();await page.getByRole('textbox',{name:'Start your plan',exact:true}).fill(prompt);await page.getByRole('button',{name:'Plan my trip',exact:true}).first().click();
  await page.waitForURL(/\/journey\/new\?.*\btrip=/,{waitUntil:'domcontentloaded'});const id=new URL(page.url()).searchParams.get('trip')!;assert(id);await page.locator('[data-builder-route-workspace]').waitFor();
  if(await page.getByText('SKIP WORKSPACE GUIDE',{exact:true}).isVisible().catch(()=>false))await page.getByText('SKIP WORKSPACE GUIDE',{exact:true}).click();
  const read=()=>page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:v2:guest:')).map(k=>JSON.parse(localStorage.getItem(k)!)).filter(v=>v.tripId===id).sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0]?.trip,id);
  await page.waitForFunction(({id,sources})=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:v2:guest:')).map(k=>JSON.parse(localStorage.getItem(k)!)).some(v=>v.tripId===id&&sources.every((name:string)=>v.trip.brief.intent.route.destinations.some((i:any)=>i.sourceText===name))),{id,sources:fixture.selections.map((s:any)=>s.mention.sourceText)});
  const initial=await read();assert(initial);const ids=initial.brief.intent.route.destinations.map((i:any)=>i.id);
  for(const choice of fixture.selections){
   const source=initial.brief.intent.route.destinations.find((i:any)=>fold(i.sourceText)===fold(choice.mention.sourceText));assert(source);
   let dialog=page.getByRole('dialog').last();const matches=()=>dialog.evaluate((el,name)=>{const key=el.getAttribute('aria-describedby');return key?document.getElementById(key)?.textContent===name:false;},source.sourceText);
   if(await dialog.isVisible().catch(()=>false)&&!await matches())await dialog.getByRole('button',{name:'Finish later',exact:true}).click();
   if(!await dialog.isVisible().catch(()=>false))await page.getByRole('button',{name:new RegExp('^Choose place.*'+source.sourceText,'i')}).first().click();
   await dialog.waitFor();assert(await matches(),'Clarification must target the original source');
   const specific=dialog.getByRole('button').filter({hasText:/Search.*specific|Search for a place/i});if(!await dialog.getByRole('combobox').first().isVisible().catch(()=>false))await specific.first().click();
   await dialog.getByRole('combobox').first().fill(choice.place.name);const option=page.getByRole('option').filter({hasText:choice.place.name}).filter({hasText:choice.place.country});await option.first().click();
   await page.waitForFunction(({id,iid})=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:v2:guest:')).map(k=>JSON.parse(localStorage.getItem(k)!)).some(v=>v.tripId===id&&v.trip.brief.intent.route.destinations.some((i:any)=>i.id===iid&&i.resolution==='resolved'&&i.stopIds.length)),{id,iid:source.id});
   const trip=await read(),intent=trip.brief.intent.route.destinations.find((i:any)=>i.id===source.id),sid=intent.stopIds[0];assert.equal(intent.requestedNights,choice.nights);
   assert(trip.brief.intent.hardConstraints.fixedCommitments.some((c:any)=>c.stopId===sid&&c.fixedNights===choice.nights),'Accepted source-night commitment must be bound before Build');
  }
  if(await page.getByRole('dialog').last().isVisible().catch(()=>false))await page.getByRole('dialog').last().getByRole('button',{name:'Finish later',exact:true}).click();
  const resolved=await read();assert.deepEqual(resolved.brief.intent.route.destinations.map((i:any)=>i.id),ids);const stays=resolved.stops.map((s:any)=>[s.id,s.canonicalPlaceId,s.nights]);
  const build=page.getByRole('button',{name:/^Build trip/}).last();assert(await build.isEnabled(),'Strict Build must accept the complete bound route');await build.click();await page.waitForURL(/\/journey\/trip-[^/]+\?created=1/,{waitUntil:'domcontentloaded'});
  await page.goto(`${base}/journey/new?trip=${id}&recover=1`,{waitUntil:'domcontentloaded'});await page.locator('[data-builder-route-workspace]').waitFor();await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-builder-route-workspace]').waitFor();
  const restored=await read();assert.deepEqual(restored.stops.map((s:any)=>[s.id,s.canonicalPlaceId,s.nights]),stays);
  assert.deepEqual(restored.brief.intent.route.destinations.map((i:any)=>i.id),ids);
  for(const choice of fixture.selections){const source=initial.brief.intent.route.destinations.find((i:any)=>fold(i.sourceText)===fold(choice.mention.sourceText)),intent=restored.brief.intent.route.destinations.find((i:any)=>i.id===source.id);assert.equal(intent.requestedNights,choice.nights);assert(restored.brief.intent.hardConstraints.fixedCommitments.some((c:any)=>c.stopId===intent.stopIds[0]&&c.fixedNights===choice.nights));}
  assert.deepEqual(errors,[]);
  const artifact=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifact){mkdirSync(artifact,{recursive:true});writeFileSync(`${artifact}/${fixture.case}.json`,JSON.stringify({case:fixture.case,initial,trip:await read(),errors},null,2)+'\n');await page.screenshot({path:`${artifact}/${fixture.case}.png`,fullPage:true});}
 }catch(error){
  const artifact=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifact){mkdirSync(artifact,{recursive:true});writeFileSync(`${artifact}/${fixture.case}-failure.json`,JSON.stringify({url:page.url(),error:String(error),errors,body:await page.locator('body').innerText().catch(()=>''),recovery:await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')).map(k=>JSON.parse(localStorage.getItem(k)!))).catch(()=>[])},null,2)+'\n');await page.screenshot({path:`${artifact}/${fixture.case}-failure.png`,fullPage:true}).catch(()=>{});}
  throw error;
 }finally{await browser.close();}
});
