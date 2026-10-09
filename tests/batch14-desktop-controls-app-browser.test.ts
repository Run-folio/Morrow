import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import type {Page,BrowserContext} from 'playwright';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';
const require=createRequire(import.meta.url),bundled=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const {chromium}=require(existsSync(bundled)?bundled:'playwright') as typeof import('playwright');
const enabled=process.env.MORROVIA_DESKTOP_CONTROLS_BROWSER_TESTS==='1',base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3105';
const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR??'/tmp/morrovia-mobile-controls';
const homepageKey='easyt-private:guest:homepage-input';
if(enabled){const url=new URL(base);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Mobile regression tests require a disposable local app');}
function tripFixture(){
 const trip=canonicalRouteFixture();trip.ownerId=null;trip.id='desktop-controls-fixture';trip.status='planned';trip.brief.bookings=[];
 const places=[{name:'Madrid',country:'Spain',canonicalPlaceId:'madrid',coordinates:[-3.7038,40.4168]},{name:'Lisbon',country:'Portugal',canonicalPlaceId:'lisbon',coordinates:[-9.1393,38.7223]},{name:'Porto',country:'Portugal',canonicalPlaceId:'porto',coordinates:[-8.6291,41.1579]}];
 trip.brief.origin='London';trip.brief.originCoordinates=[-.1278,51.5074];trip.brief.originCountry='United Kingdom';trip.brief.originCanonicalPlaceId='london';trip.brief.intent!.route!.origin={name:'London',country:'United Kingdom',canonicalPlaceId:'london',coordinates:[-.1278,51.5074]};
 trip.stops.forEach((stop,i)=>{Object.assign(stop,places[i],{longitude:places[i]!.coordinates[0],latitude:places[i]!.coordinates[1]});trip.brief.intent!.route!.destinations[i]!.selectedPlace={...places[i]!,coordinates:places[i]!.coordinates as [number,number]};});
 return prepareTripDocumentForWrite(trip);
}
async function evidence(name:string,width:number,run:(page:Page,context:BrowserContext)=>Promise<void>){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors:string[]=[];
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));mkdirSync(artifacts,{recursive:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.addInitScript(({key,consent})=>{localStorage.setItem(key,JSON.stringify(consent));localStorage.setItem('morrovia:workspace-orientation:seen:guest','1');},{key:PRIVACY_CONSENT_STORAGE_KEY,consent:createPrivacyConsentRecord({analytics:false,affiliateTracking:false},'2026-10-09T21:48:00Z')});
 await context.route('https://**/*',route=>route.abort());
 await context.route('**/api/auth/**',route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
 try{await run(page,context);assert.deepEqual(errors,[]);await context.tracing.stop();}
 catch(error){await page.screenshot({path:`${artifacts}/${name}-failure.png`,fullPage:true}).catch(()=>{});await context.tracing.stop({path:`${artifacts}/${name}.zip`});throw error;}
 finally{await context.close();await browser.close();}
}
async function seedTrip(page:Page){
 const trip=tripFixture();
 await page.addInitScript(trip=>{
  if(sessionStorage.getItem('desktop-fixture-seeded'))return;sessionStorage.setItem('desktop-fixture-seeded','1');
  const writeId='mobile-seed';localStorage.setItem(`easyt:trip-recovery:v2:guest:${encodeURIComponent(trip.id)}:${writeId}`,JSON.stringify({version:2,ownerId:null,tripId:trip.id,trip,state:'pending',writeId,savedAt:'2026-10-09T21:48:00Z'}));
 },trip);
 return trip;
}
async function builder(page:Page){const trip=await seedTrip(page);await page.goto(`${base}/journey/new?trip=${trip.id}&recovery=1`,{waitUntil:'domcontentloaded'});await page.locator('[data-builder-route-workspace]').waitFor();return trip;}
async function screenshot(page:Page,name:string){
 await page.screenshot({path:`${artifacts}/${name}.png`,fullPage:true});
 const focus=name.startsWith('home-')?page.locator('#start-building'):name.startsWith('nights-')?page.locator('[data-builder-route-workspace]'):null;
 if(focus)await focus.screenshot({path:`${artifacts}/${name}-detail.png`});
}
function overlap(a:{x:number;y:number;width:number;height:number},b:typeof a){return a.x<b.x+b.width-.5&&a.x+a.width>b.x+.5&&a.y<b.y+b.height-.5&&a.y+a.height>b.y+.5;}

for(const width of [390,1440])test(`Days default and shared Calendar rail add/save/reload ${width}`,{skip:!enabled,timeout:60000},()=>evidence(`rail-${width}`,width,async page=>{
 const trip=await seedTrip(page);await page.goto(`${base}/journey/${trip.id}/itinerary?recovery=1`,{waitUntil:'domcontentloaded'});
 await page.locator('section[aria-label="Day 1 planner"]').waitFor();assert.equal(await page.getByRole('button',{name:'Day by day',exact:true}).getAttribute('aria-pressed'),'true');
 const rail=page.getByRole('complementary',{name:'Selected day planning context',exact:true});
 for(const view of ['Day by day','Calendar']){
  await page.getByRole('button',{name:view,exact:true}).click();await rail.getByRole('region',{name:'Day map',exact:true}).waitFor();await rail.getByText('Suggestions for this day',{exact:true}).waitFor();
  if(width===1440){const r=await rail.boundingBox(),main=await page.getByRole('region',{name:'Trip itinerary',exact:true}).boundingBox();assert.ok(r&&main&&r.x>main.x+main.width/2,'context stays on right');}
  await rail.getByRole('button',{name:'Add activity',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Add your own',{exact:true}).fill(`Manual ${view} fixture`);await dialog.getByRole('button',{name:'Add to Morning',exact:true}).click();await dialog.waitFor({state:'hidden'});await screenshot(page,`rail-${view.replaceAll(' ','-')}-${width}`);
 }
 await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.getByRole('button',{name:'Calendar',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Day by day',exact:true}).click();await page.getByText('Manual Calendar fixture',{exact:true}).first().waitFor();await page.getByText('Manual Day by day fixture',{exact:true}).first().waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,`rail-final-${width}`);
}));
test('Overview entire preview opens existing full map with keyboard',{skip:!enabled,timeout:30000},()=>evidence('overview-map',1440,async page=>{
 const trip=await seedTrip(page);await page.goto(`${base}/journey/${trip.id}?recovery=1`,{waitUntil:'domcontentloaded'});
 const preview=page.getByRole('region',{name:'Journey map',exact:true}),link=preview.getByRole('link',{name:'Open Journey map',exact:true});await link.waitFor();const frame=await link.boundingBox();assert.ok(frame&&frame.width>200&&frame.height>200);
 await link.click({position:{x:frame.width*.8,y:frame.height*.6}});await page.waitForURL(`**/journey/${trip.id}/map**`);await page.goto(`${base}/journey/${trip.id}?recovery=1`);await link.focus();await page.keyboard.press('Enter');await page.waitForURL(`**/journey/${trip.id}/map**`);assert.ok(new URL(page.url()).searchParams.get('returnTo')?.includes(trip.id));await screenshot(page,'overview-map-open');
}));
for(const width of [390,1440])test(`device notice is brief, truthful and once per trip session ${width}`,{skip:!enabled,timeout:30000},()=>evidence(`device-notice-${width}`,width,async page=>{
 const trip=await seedTrip(page);await page.goto(`${base}/journey/${trip.id}?recovery=1`,{waitUntil:'domcontentloaded'});
 const toast=page.locator('[data-variant="toast"]').filter({hasText:'Saved on this device'});await toast.waitFor();assert.equal(await page.getByText('Keep this trip and continue planning on another device.',{exact:true}).count(),0);await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).waitFor();
 const bounds=await toast.boundingBox();assert.ok(bounds&&bounds.y+bounds.height<=900-12,'toast stays inside the viewport');
 const fixedControls=await page.locator('button,a').evaluateAll(elements=>elements.filter(e=>e.checkVisibility()&&!e.closest('[data-variant="toast"]')).filter(e=>{let p:Element|null=e;while(p){if(getComputedStyle(p).position==='fixed')return true;p=p.parentElement;}return false;}).map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));assert.ok(bounds&&fixedControls.every(control=>!overlap(bounds,control)),'notice clears every visible fixed action');await page.mouse.move(0,0);await toast.waitFor({state:'hidden',timeout:8000});await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).waitFor();assert.equal(await toast.count(),0);await page.getByRole('navigation',{name:'Trip workspace',exact:true}).getByRole('link',{name:'Itinerary',exact:true}).click();await page.getByRole('region',{name:'Trip itinerary',exact:true}).waitFor();assert.equal(await toast.count(),0,'workspace navigation does not repeat the notice');await screenshot(page,`device-nudge-${width}`);
}));
test('Builder camera allows real drag and zoom without route edits',{skip:!enabled,timeout:45000},()=>evidence('builder-camera',1440,async page=>{
 const trip=await builder(page),map=page.locator('[data-builder-route-workspace] .planner-map'),marker=map.locator('.planner-map__stop').first();await marker.waitFor();await map.scrollIntoViewIfNeeded();await map.getByRole('button',{name:'Zoom in',exact:true}).waitFor();await page.waitForTimeout(700);
 const before=await marker.boundingBox();assert.ok(before);const recoveryBefore=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')).map(k=>[k,localStorage.getItem(k)])));
 const point=await map.locator('canvas').evaluate(canvas=>{const r=canvas.getBoundingClientRect();for(const fy of [.65,.5,.8,.35])for(const fx of [.6,.4,.75,.2]){const x=r.x+r.width*fx,y=r.y+r.height*fy;if(y<innerHeight-50&&y>50&&document.elementFromPoint(x,y)===canvas)return{x,y};}return null;});assert.ok(point,'pan starts on visible blank canvas');
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+70,point.y+30,{steps:8});await page.mouse.up();
 await page.waitForFunction(({x,y})=>{const r=document.querySelector('[data-builder-route-workspace] .planner-map__stop')?.getBoundingClientRect();return Boolean(r&&(Math.abs(r.x-x)>10||Math.abs(r.y-y)>10));},{x:before.x,y:before.y},{timeout:3000});
 const spacing=()=>map.locator('.planner-map__stop').evaluateAll(markers=>{const a=markers[0]!.getBoundingClientRect(),b=markers[1]!.getBoundingClientRect();return Math.hypot(a.x-b.x,a.y-b.y);});
 const panSpacing=await spacing();await map.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(500);const zoomSpacing=await spacing();assert.ok(zoomSpacing>panSpacing*1.2,'zoom control changes camera scale');
 const wheelPoint=await map.locator('canvas').evaluate(canvas=>{const r=canvas.getBoundingClientRect();return{x:r.x+r.width*.6,y:r.y+r.height*.6};});await page.mouse.move(wheelPoint.x,wheelPoint.y);await page.mouse.wheel(0,-250);await page.waitForTimeout(500);assert.ok(await spacing()>zoomSpacing*1.1,'wheel changes camera scale');
 writeFileSync(`${artifacts}/builder-camera-geometry.json`,JSON.stringify({point,before,panSpacing,zoomSpacing,wheelSpacing:await spacing()},null,2));
 const recoveryAfter=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')).map(k=>[k,localStorage.getItem(k)])));assert.deepEqual(recoveryAfter,recoveryBefore,'camera changes do not mutate any device recovery copy');
 const saved=await page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')).map(k=>JSON.parse(localStorage.getItem(k)!)).find(r=>r.tripId===id)?.trip,trip.id);assert.deepEqual(saved.stops.map((s:any)=>[s.id,s.nights]),trip.stops.map(s=>[s.id,s.nights]));await screenshot(page,'builder-pan-zoom');
}));

test('Calendar selected-day summary stays close to the week with a long shared rail',{skip:!enabled,timeout:30000},()=>evidence('calendar-vertical-layout',1440,async page=>{
 const trip=await seedTrip(page);await page.goto(`${base}/journey/${trip.id}/itinerary?recovery=1&itineraryView=calendar`,{waitUntil:'domcontentloaded'});const panel=page.getByRole('region',{name:'Day 1: Madrid',exact:true});await panel.waitFor();
 const heading=page.getByRole('heading',{name:/^Week of/}).first(),week=heading.locator('..'),summary=await panel.boundingBox(),cells=await week.locator('article').first().boundingBox();assert.ok(summary&&cells);assert.ok(summary.y<cells.y+cells.height+50,'selected day follows the visible week without a large empty row');assert.ok(cells.height<400,'context rail does not stretch calendar cells');
 await screenshot(page,'calendar-compact-week');
}));
test('Overview frame link preserves native map attribution disclosure',{skip:!enabled,timeout:30000},()=>evidence('overview-attribution',1440,async page=>{
 const trip=await seedTrip(page);await page.goto(`${base}/journey/${trip.id}?recovery=1`,{waitUntil:'domcontentloaded'});const preview=page.getByRole('region',{name:'Journey map',exact:true});await preview.scrollIntoViewIfNeeded();const button=preview.locator('.maplibregl-ctrl-attrib-button');await button.waitFor();await page.waitForTimeout(6000);assert.equal(await preview.locator('.maplibregl-ctrl-attrib').evaluate(el=>el.classList.contains('maplibregl-compact-show')),false);
 await button.click({timeout:3000});assert.equal(new URL(page.url()).pathname,`/journey/${trip.id}`);assert.equal(await preview.locator('.maplibregl-ctrl-attrib').evaluate(el=>el.classList.contains('maplibregl-compact-show')),true);await screenshot(page,'overview-credits-disclosure');
}));
