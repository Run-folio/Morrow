import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {extractStructuredTripBrief} from '../lib/easyt/structured-trip-brief.ts';
import {PLACE_INTELLIGENCE_PARSER_VERSION} from '../lib/easyt/place-intelligence.ts';
const require=createRequire(import.meta.url),runtime=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const enabled=process.env.MORROVIA_CORE_JOURNEY_BROWSER_TESTS==='1',base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3102';
if(enabled)assert(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Local verification only');
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-initial-intake-capture.json',import.meta.url),'utf8'));
const fold=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const places=[{name:'City of London',country:'United Kingdom',canonicalPlaceId:'open-world:nominatim:relation:51800',coordinates:[-0.0919983,51.5156177]},
 {name:'San José',country:'Costa Rica',canonicalPlaceId:'open-world:nominatim:relation:19827540',coordinates:[-84.0796683,9.9327373]},
 {name:'Granada',country:'Nicaragua',canonicalPlaceId:'open-world:photon:R:5745675',coordinates:[-85.9535387,11.930367]},
 {name:'León',country:'Nicaragua',canonicalPlaceId:'open-world:nominatim:relation:18466957',coordinates:[-86.8789,12.435]},
 {name:'Bangkok',country:'Thailand',canonicalPlaceId:'bangkok',coordinates:[100.5018,13.7563]},
 {name:'Chiang Mai',country:'Thailand',canonicalPlaceId:'chiang-mai',coordinates:[98.9817,18.7061]},
 {name:'Krabi',country:'Thailand',canonicalPlaceId:'krabi',coordinates:[98.9103,8.0863]}];
for(const f of fixtures)test(`${f.case} literal Homepage intake, exact occurrence/context contract and recovery`,{skip:!enabled,timeout:90000},async()=>{
 const {chromium}=require(existsSync(runtime)?runtime:'playwright') as typeof import('playwright'),browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],states:Record<string,any>={};page.on('pageerror',e=>errors.push(e.message));
 let id='',originalCaptureRequests=0;
 const read=()=>page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:v2:guest:')).map(k=>JSON.parse(localStorage.getItem(k)!)).filter(r=>r.tripId===id).sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0]?.trip,id);
 const until=async(condition:(t:any)=>boolean)=>{for(let i=0;i<100;i++){const t=await read();if(t&&condition(t))return t;await page.waitForTimeout(100);}assert(condition(await read()),'Accepted canonical state did not arrive');return read();};
 try{
  // Keep actual raw/source mentions and run the production constraint extractor.
  // This models the corrected capture boundary without seeding a trip or storage.
  const capture=structuredClone(f.capture);capture.structuredBrief=extractStructuredTripBrief(f.prompt,capture.parserVersion,{version:1,parserVersion:PLACE_INTELLIGENCE_PARSER_VERSION,sequenceKind:'ordered',mentions:capture.mentions,issues:capture.structuredBrief.placeIssues??[]});
  await page.route('**/api/**',async route=>{const u=new URL(route.request().url());let body:unknown,status=200;
   if(u.pathname.includes('/auth/'))body=null;
   else if(u.pathname==='/api/journey-capture'){if(route.request().postDataJSON().brief===f.prompt){originalCaptureRequests++;body=capture;}else{status=404;body={error:'Unavailable suggestion boundary'};}}
   else if(u.pathname==='/api/journey-geocode'){
    const q=fold(u.searchParams.get('place')??'');const candidates=places.filter(p=>q&&(fold(p.name).includes(q)||q.includes(fold(p.name)))&&(f.case!=='A15'||u.searchParams.has('intent')||p.country!=='Nicaragua')).map(p=>({...p,placeType:p.name==='Granada'?'town':'city'}));body={candidates,result:candidates[0]??null};
   }else if(u.pathname==='/api/journey-transfer-resolution')body={legs:route.request().postDataJSON().legs};
   else {status=404;body={error:'External fixture boundary unavailable'};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();
  if(await page.getByRole('button',{name:'Reject optional',exact:true}).count())await page.getByRole('button',{name:'Reject optional',exact:true}).click();
  const start=f.case==='A15'?'San José':'City of London';await page.getByRole('combobox',{name:'Start from',exact:true}).fill(start);await page.getByRole('option').filter({hasText:start}).first().click();
  await page.getByRole('button',{name:'One way',exact:true}).click();await page.getByRole('textbox',{name:'Start your plan',exact:true}).fill(f.prompt);await page.getByRole('button',{name:'Plan my trip',exact:true}).first().click();
  await page.waitForURL(/\/journey\/new\?.*\btrip=/,{waitUntil:'domcontentloaded'});id=new URL(page.url()).searchParams.get('trip')!;assert(id);
  await page.getByText('Saved on this device',{exact:true}).first().waitFor();
  states.initial=await until(t=>t.brief.intent.route.destinations.length>0);assert.equal(originalCaptureRequests,1,'Exactly one original literal capture is submitted');
  states.acknowledgement=await page.evaluate(()=>({input:JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null'),handoff:JSON.parse(localStorage.getItem('easyt-home-trip-draft')??'null')}));
  const receipt=states.acknowledgement.input?.receipt;assert.equal(receipt?.version,1,'The original intake receipt must be durably completed');assert.equal(receipt.ownerId,null);assert.equal(receipt.tripId,id);assert.deepEqual(states.acknowledgement.handoff?.homepage?.receipt,receipt,'Both durable receipt owners must acknowledge the same handoff');assert.equal(states.acknowledgement.handoff.handoffId,receipt.handoffId);
  if(await page.getByText('SKIP WORKSPACE GUIDE',{exact:true}).isVisible().catch(()=>false))await page.getByText('SKIP WORKSPACE GUIDE',{exact:true}).click();
  if(f.case==='A16'){
   await page.locator('[data-builder-route-workspace]').waitFor();const initial=await until(t=>t.stops.length===4);
   assert.deepEqual(initial.stops.map((s:any)=>s.nights),[2,4,3,1],'Original requested night quantities must be bound before editing');
   assert.equal(initial.brief.intent.route.orderAuthority,'explicit');const beforeIds=initial.stops.map((s:any)=>s.id),first=initial.stops[0],final=initial.stops[3];assert.notEqual(first.id,final.id);assert.equal(first.canonicalPlaceId,final.canonicalPlaceId);
   const build=page.getByRole('button',{name:/^Build trip/}).last();assert(await build.isEnabled());await build.click();await page.waitForURL(/\/journey\/trip-[^/]+\?created=1/,{waitUntil:'domcontentloaded'});
   await page.goto(`${base}/journey/new?trip=${id}&recover=1`,{waitUntil:'domcontentloaded'});await page.locator('[data-builder-route-workspace]').waitFor();
   const finalRow=page.locator(`[data-builder-stop-id="${final.id}"]`);const add=finalRow.getByRole('button',{name:/^Add one night to/});assert(await add.isEnabled());await add.click();
   states.finalOnly=await until(t=>t.stops[3]?.id===final.id&&t.stops[3]?.nights===2);assert.equal(states.finalOnly.stops[0].nights,2);assert.deepEqual(states.finalOnly.stops.map((s:any)=>s.id),beforeIds);
   const firstRow=page.locator(`[data-builder-stop-id="${first.id}"]`);await firstRow.locator('summary').click();await firstRow.getByRole('button',{name:'Remove stop',exact:true}).click();
   const dialog=page.getByRole('dialog').last();if(await dialog.isVisible().catch(()=>false))await dialog.getByRole('button').filter({hasText:/^Remove/}).last().click();
   states.removed=await until(t=>t.stops.length===3&&!t.stops.some((s:any)=>s.id===first.id));assert.deepEqual(states.removed.stops.map((s:any)=>s.id),beforeIds.slice(1));assert.equal(states.removed.stops.at(-1).nights,2);
  }else{
   assert(!states.initial.brief.intent.route.destinations.some((i:any)=>i.sourceText==='Costa Rica'),'Origin country qualifier must not require a second base');
   const normal=await Promise.race([page.getByRole('dialog').last().waitFor().then(()=>true),page.getByRole('button',{name:'Open device copy',exact:true}).waitFor().then(()=>false)]);assert(normal,'Fresh A15 must mount the normal clarification flow without a recovery detour');
   for(const name of ['Granada','León']){
    const source=states.initial.brief.intent.route.destinations.find((i:any)=>i.sourceText===name);assert(source);let dialog=page.getByRole('dialog').last();
    const matches=()=>dialog.evaluate((el,name)=>{const k=el.getAttribute('aria-describedby');return k?document.getElementById(k)?.textContent===name:false;},name);
    if(await dialog.isVisible().catch(()=>false)&&!await matches()){await dialog.getByRole('button',{name:'Finish later',exact:true}).click();await dialog.waitFor({state:'hidden'});}
    if(!await dialog.isVisible().catch(()=>false))await page.getByRole('button',{name:new RegExp('^Choose place.*'+name,'i')}).first().click();await dialog.waitFor();await page.waitForFunction(name=>[...document.querySelectorAll('[role=dialog][aria-describedby]')].some(el=>document.getElementById(el.getAttribute('aria-describedby')!)?.textContent===name),name);assert(await matches());
    const combo=dialog.getByRole('combobox').first();if(!await combo.isVisible().catch(()=>false))await dialog.getByRole('button').filter({hasText:/Search.*specific|Search for a place/i}).first().click();
    await combo.fill(name);await page.getByRole('option').filter({hasText:name}).filter({hasText:'Nicaragua'}).first().click();await until(t=>t.brief.intent.route.destinations.find((i:any)=>i.id===source.id)?.resolution==='resolved');
   }
   states.selected=await until(t=>t.stops.length===2&&t.brief.intent.route.origin?.country==='Costa Rica');
   assert.deepEqual(states.selected.stops.map((s:any)=>s.country),['Nicaragua','Nicaragua']);assert.equal(states.selected.brief.intent.route.journeyEnd.place.country,'Guatemala');
   assert(states.selected.brief.intent.route.destinations.every((i:any)=>i.requestedNights===null));assert.equal(states.selected.brief.intent.hardConstraints.fixedCommitments.length,0);
   assert.equal(states.selected.stops[1].nights??0,0,'No unspecified León nights may be invented');assert(!await page.getByRole('button',{name:/^Build trip/}).last().isEnabled(),'Positive-night review stays required');
  }
  if(f.case==='A16')await page.goto(`${base}/journey/new?trip=${id}&recover=1`,{waitUntil:'domcontentloaded'});await page.locator('[data-builder-route-workspace]').waitFor();await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-builder-route-workspace]').waitFor();states.reloaded=await read();
  const accepted=f.case==='A16'?states.removed:states.selected;assert.deepEqual(states.reloaded.stops.map((s:any)=>[s.id,s.canonicalPlaceId,s.nights]),accepted.stops.map((s:any)=>[s.id,s.canonicalPlaceId,s.nights]));assert.deepEqual(states.reloaded.brief.intent.route.destinations,accepted.brief.intent.route.destinations);assert.deepEqual(errors,[]);
  assert(!await page.getByRole('button',{name:'Open device copy',exact:true}).isVisible().catch(()=>false),'No false device-copy conflict after accepted edits');
  const dir=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${f.case}.json`,JSON.stringify({case:f.case,source:f.prompt,states,errors},null,2)+'\n');await page.screenshot({path:`${dir}/${f.case}.png`,fullPage:true});}
 }catch(error){const dir=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${f.case}-failure.json`,JSON.stringify({url:page.url(),error:String(error),states,current:await read().catch(()=>null),body:await page.locator('body').innerText().catch(()=>''),errors},null,2)+'\n');await page.screenshot({path:`${dir}/${f.case}-failure.png`,fullPage:true}).catch(()=>{});}throw error;
 }finally{await browser.close();}
});
