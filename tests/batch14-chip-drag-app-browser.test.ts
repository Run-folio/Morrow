import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {existsSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';
const require=createRequire(import.meta.url),runtime=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const enabled=process.env.MORROVIA_CORE_JOURNEY_BROWSER_TESTS==='1',base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3101';
if(enabled){const url=new URL(base);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('This regression requires a local app.');}
for(const width of [1440,390])test(`real mouse chip drag preserves occurrence identity and authored content at ${width}px`,{skip:!enabled,timeout:60000},async()=>{
 const {chromium}=require(existsSync(runtime)?runtime:'playwright') as typeof import('playwright');const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width,height:900}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const trip=requireReadableTripDocument(canonicalRouteFixture());trip.ownerId=null;
 trip.stops[2]={...trip.stops[2],name:trip.stops[0].name,country:trip.stops[0].country,canonicalPlaceId:trip.stops[0].canonicalPlaceId,latitude:trip.stops[0].latitude,longitude:trip.stops[0].longitude};
 trip.brief.intent.route.destinations[2].selectedPlace={...trip.brief.intent.route.destinations[0].selectedPlace!};
 trip.planItems[0].notes=['Keep this authored activity'];
 try{
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:PRIVACY_CONSENT_STORAGE_KEY,value:JSON.stringify(createPrivacyConsentRecord({analytics:false,affiliateTracking:false},'2026-10-08T12:00:00.000Z'))});
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({status:path.includes('/auth/')?200:path==='/api/journey-transfer-resolution'?200:404,contentType:'application/json',body:JSON.stringify(path.includes('/auth/')?null:path==='/api/journey-transfer-resolution'?{legs:route.request().postDataJSON().legs}:{error:'Fixture boundary unavailable'})});});
 await page.route('https://tiles.openfreemap.org/**',route=>route.abort());
 await page.addInitScript(value=>{localStorage.setItem(`easyt:trip-recovery:v2:guest:${encodeURIComponent(value.id)}:chip-fixture`,JSON.stringify({version:2,ownerId:null,tripId:value.id,trip:value,state:'pending',writeId:'chip-fixture',savedAt:'2026-10-08T12:00:00.000Z'}));},trip);
 await page.goto(`${base}/journey/new?trip=${trip.id}&recover=1`,{waitUntil:'domcontentloaded'});const top=page.locator('[data-builder-top-controls]');await top.waitFor();
 if(await page.getByRole('button',{name:'Reject optional',exact:true}).count())await page.getByRole('button',{name:'Reject optional',exact:true}).click();
 const chips=top.locator('[data-destination-intent-id]'),initial=trip.brief.intent.route.destinations.map(i=>i.id);
 assert.deepEqual(await chips.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-destination-intent-id'))),initial);
 await chips.nth(2).scrollIntoViewIfNeeded();const source=await chips.nth(2).locator('[draggable="true"]').boundingBox(),target=await chips.nth(1).boundingBox();assert.ok(source&&target);
 await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();for(let step=1;step<=12;step++){await page.mouse.move(source.x+source.width/2+(target.x+target.width/2-source.x-source.width/2)*step/12,source.y+source.height/2+(target.y+target.height/2-source.y-source.height/2)*step/12);await page.waitForTimeout(50)}await page.mouse.up();
 const expected=[initial[0],initial[2],initial[1]];
 await page.waitForFunction(ids=>JSON.stringify(Array.from(document.querySelectorAll('[data-builder-top-controls] [data-destination-intent-id]')).map(n=>n.getAttribute('data-destination-intent-id')))===JSON.stringify(ids),expected);
 await page.waitForFunction(({id,stopId})=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>{try{return JSON.parse(localStorage.getItem(k)!).trip.brief.intent.route.orderedStopIds[1]===stopId}catch{return false}}),{id:trip.id,stopId:trip.stops[2].id});
 const read=()=>page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).map(k=>JSON.parse(localStorage.getItem(k)!)).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||b.writeId.localeCompare(a.writeId))[0].trip,trip.id);
 const saved=await read();assert.equal(saved.brief.intent.route.orderAuthority,'manual');assert.deepEqual(saved.brief.intent.route.orderedStopIds,[trip.stops[0].id,trip.stops[2].id,trip.stops[1].id]);assert.equal(saved.stops.filter((s:{canonicalPlaceId:string})=>s.canonicalPlaceId===trip.stops[0].canonicalPlaceId).length,2);assert.ok(saved.planItems.some((d:{notes:string[]})=>d.notes.includes('Keep this authored activity')));
 await page.reload();await top.waitFor();assert.deepEqual(await chips.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-destination-intent-id'))),expected);
 const cancel=chips.nth(0).locator('[draggable="true"]');await cancel.focus();await cancel.press('Space');await cancel.press('ArrowRight');await cancel.press('Escape');assert.deepEqual(await chips.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-destination-intent-id'))),expected,'Escape cancels the preview');
 await top.locator('summary').first().click();await top.getByRole('combobox',{name:'Pace',exact:true}).selectOption('relaxed');await top.getByRole('button',{name:'Flights',exact:true}).click();
 const artifact=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifact){mkdirSync(artifact,{recursive:true});await top.screenshot({path:`${artifact}/builder-${width}.png`});}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`no horizontal overflow at ${width}px`);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
