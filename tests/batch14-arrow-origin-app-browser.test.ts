import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';

const require=createRequire(import.meta.url),runtime=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const enabled=process.env.MORROVIA_CORE_JOURNEY_BROWSER_TESTS==='1',base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3102';
if(enabled){const url=new URL(base);assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Deterministic local app test only');}
const prompt='Bangkok → Siem Reap → Hội An → Hanoi';
const london={name:'City of London',country:'United Kingdom',canonicalPlaceId:'open-world:nominatim:relation:51800',coordinates:[-0.0919983,51.5156177],placeType:'city'};
const places=[london,{name:'Bangkok',country:'Thailand',canonicalPlaceId:'bangkok',coordinates:[100.5018,13.7563],placeType:'city'},
 {name:'Siem Reap',country:'Cambodia',canonicalPlaceId:'siem-reap',coordinates:[103.855,13.363],placeType:'city'},
 {name:'Hoi An',country:'Vietnam',canonicalPlaceId:'hoi-an',coordinates:[108.338,15.88],placeType:'town'},
 {name:'Hanoi',country:'Vietnam',canonicalPlaceId:'hanoi',coordinates:[105.834,21.028],placeType:'city'}];
const fold=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();

for(const sequence of ['origin then prompt','prompt then origin'])test(`real homepage arrow stays preserve shared origin: ${sequence}`,{skip:!enabled,timeout:60000},async()=>{
 const {chromium}=require(existsSync(runtime)?runtime:'playwright') as typeof import('playwright');const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  // Only external/auth/provider boundaries are fixtures; all input, projection,
  // pending handoff, persistence and Builder rendering use the production app.
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());let status=200,body:unknown;
   if(url.pathname.includes('/auth/'))body=null;
   else if(url.pathname==='/api/journey-capture')body=captureJourneyBrief(route.request().postDataJSON().brief);
   else if(url.pathname==='/api/journey-geocode'){
    const query=fold(url.searchParams.get('q')??'');const candidates=places.filter(place=>query.includes(fold(place.name))||fold(place.name).includes(query));body={candidates,result:candidates[0]??null};
   }else if(url.pathname==='/api/journey-transfer-resolution')body={legs:route.request().postDataJSON().legs};
   else {status=404;body={error:'Local fixture boundary unavailable'};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();
  if(await page.getByRole('button',{name:'Reject optional',exact:true}).count())await page.getByRole('button',{name:'Reject optional',exact:true}).click();
  await page.getByRole('button',{name:'One way',exact:true}).click();
  const origin=page.getByRole('combobox',{name:'Start from',exact:true}),description=page.getByRole('textbox',{name:'Start your plan',exact:true});
  const selectOrigin=async()=>{await origin.fill('City of London');await page.getByRole('option').filter({hasText:'City of London'}).first().click();};
  if(sequence==='origin then prompt'){await selectOrigin();await description.fill(prompt);}else{await description.fill(prompt);await selectOrigin();}
  assert.match(await origin.inputValue(),/City of London/,'Shared origin remains visible before submission');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')!).snapshot.origin.state==='selected');
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')!).snapshot);
  assert.equal(snapshot.origin.value.canonicalPlaceId,london.canonicalPlaceId);assert.equal(snapshot.prompt,prompt);
  await page.getByRole('button',{name:'Plan my trip',exact:true}).first().click();await page.waitForURL(/\/journey\/new\?.*\btrip=/,{waitUntil:'domcontentloaded'});
  const id=new URL(page.url()).searchParams.get('trip');assert(id);const workspace=page.locator('[data-builder-route-workspace]');await workspace.waitFor();
  const rows=page.locator('[data-builder-stop-index]');await page.waitForFunction(()=>document.querySelectorAll('[data-builder-stop-index]').length===4);
  const read=()=>page.evaluate(id=>Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:guest:')).map(key=>JSON.parse(localStorage.getItem(key)!)).filter(value=>value.tripId===id).sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0].trip,id);
  const trip=await read();assert.equal(trip.brief.intent.route.origin.canonicalPlaceId,london.canonicalPlaceId);
  assert.deepEqual(trip.stops.map((stop:{name:string})=>stop.name),['Bangkok','Siem Reap','Hoi An','Hanoi']);assert.equal(trip.brief.intent.route.orderAuthority,'explicit');assert.equal(trip.brief.intent.route.journeyEnd.mode,'unknown');
  assert.equal(trip.brief.intent.route.destinations.length,4);const ids=trip.stops.map((stop:{id:string})=>stop.id);
  await page.reload({waitUntil:'domcontentloaded'});await workspace.waitFor();await page.waitForFunction(()=>document.querySelectorAll('[data-builder-stop-index]').length===4);
  assert.deepEqual(await rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-builder-stop-id'))),ids);assert.equal((await read()).brief.intent.route.origin.canonicalPlaceId,london.canonicalPlaceId);
  const artifact=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifact){mkdirSync(artifact,{recursive:true});const name=sequence.replaceAll(' ','-');writeFileSync(`${artifact}/${name}.json`,JSON.stringify({sequence,homepageSnapshot:snapshot,trip:await read(),errors},null,2)+'\n');await page.screenshot({path:`${artifact}/${name}.png`,fullPage:true});}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
