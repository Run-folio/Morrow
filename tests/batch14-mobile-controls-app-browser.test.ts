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
const enabled=process.env.MORROVIA_MOBILE_CONTROLS_BROWSER_TESTS==='1',base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3102';
const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR??'/tmp/morrovia-mobile-controls';
const homepageKey='easyt-private:guest:homepage-input';
if(enabled){const url=new URL(base);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Mobile regression tests require a disposable local app');}
function tripFixture(){
 const trip=canonicalRouteFixture();trip.ownerId=null;trip.id='mobile-controls-fixture';trip.status='planned';
 trip.brief.bookings=[];trip.brief.manualNightStopIds=[];
 trip.endDate='2027-01-02';trip.brief.intent!.timing.durationDays=85;
 let offset=0;
 for(const [index,stop] of trip.stops.entries()){
  stop.nights=[78,3,3][index]!;
  if(index===2)stop.name='Hiroshima · Miyajima and the Seto Inland Sea';
  const date=(n:number)=>new Date(Date.parse(trip.startDate+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  stop.arrivalDate=date(offset);offset+=stop.nights;stop.departureDate=date(offset);
  trip.brief.nightAllocations![stop.id]=stop.nights;
  const intent=trip.brief.intent!.route!.destinations[index]!;intent.requestedNights=stop.nights;intent.sourceText=stop.name;intent.selectedPlace!.name=stop.name;
 }
 return prepareTripDocumentForWrite(trip);
}
async function evidence(name:string,width:number,run:(page:Page,context:BrowserContext)=>Promise<void>){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors:string[]=[];
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));mkdirSync(artifacts,{recursive:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.addInitScript(({key,consent})=>localStorage.setItem(key,JSON.stringify(consent)),{key:PRIVACY_CONSENT_STORAGE_KEY,consent:createPrivacyConsentRecord({analytics:false,affiliateTracking:false},'2026-10-09T21:48:00Z')});
 await context.route('https://**/*',route=>route.abort());
 await context.route('**/api/auth/**',route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
 try{await run(page,context);assert.deepEqual(errors,[]);await context.tracing.stop();}
 catch(error){await page.screenshot({path:`${artifacts}/${name}-failure.png`,fullPage:true}).catch(()=>{});await context.tracing.stop({path:`${artifacts}/${name}.zip`});throw error;}
 finally{await context.close();await browser.close();}
}
async function seedTrip(page:Page){
 const trip=tripFixture();
 await page.addInitScript(trip=>{
  if(sessionStorage.getItem('mobile-fixture-seeded'))return;sessionStorage.setItem('mobile-fixture-seeded','1');
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
for(const width of [320,360,390,430])test(`mobile night targets and large values stay separate at ${width}px and 200% text`,{skip:!enabled,timeout:45000},()=>evidence(`nights-${width}`,width,async page=>{
 await builder(page);const failures:string[]=[],measurements=[];
 for(const zoom of [1,2]){
  if(zoom===2)await page.evaluate(()=>{
   // Text-only zoom approximation: double each existing font and line height,
   // leaving the viewport, layout and touch-target pixels unchanged.
   const nodes=[...document.querySelectorAll<HTMLElement>('[data-builder-route-workspace] *')].map(element=>({element,font:getComputedStyle(element).fontSize,line:getComputedStyle(element).lineHeight}));
   for(const {element,font,line} of nodes){element.style.fontSize=`${parseFloat(font)*2}px`;if(line!=='normal')element.style.lineHeight=`${parseFloat(line)*2}px`;}
  });
  const rows=await page.locator('[data-builder-stop-id]').evaluateAll(rows=>rows.map(row=>{
   const buttons=[...row.querySelectorAll<HTMLButtonElement>('button')].filter(button=>/one night/.test(button.getAttribute('aria-label')??''));
   const control=buttons[0]!.parentElement!,number=control.querySelector('strong')!,rect=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
   return {name:row.getAttribute('data-builder-stop-id'),row:rect(row),control:rect(control),minus:rect(buttons[0]!),number:rect(number),plus:rect(buttons[1]!),value:number.textContent,cells:[...row.querySelectorAll(':scope > [role="cell"]')].map(rect),actions:[...row.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(rect)};
  }));
  const overflow=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}));measurements.push({zoom,rows,overflow});
  await page.locator('[data-builder-route-workspace]').scrollIntoViewIfNeeded();await screenshot(page,`nights-${width}-text-${zoom}`);
  for(const row of rows){
   if(row.minus.width<44||row.minus.height<44||row.plus.width<44||row.plus.height<44)failures.push(`${zoom}x ${row.name} undersized target`);
   if(overlap(row.minus,row.number)||overlap(row.number,row.plus)||overlap(row.minus,row.plus))failures.push(`${zoom}x ${row.name} overlapping night control`);
   if(row.cells.some((cell,i)=>row.cells.slice(i+1).some(other=>overlap(cell,other))))failures.push(`${zoom}x ${row.name} table cells overlap`);
   if(row.actions.some(action=>action.x<row.row.x-1||action.x+action.width>row.row.x+row.row.width+1))failures.push(`${zoom}x ${row.name} row action leaves table`);
   if(row.plus.x+row.plus.width>row.row.x+row.row.width+1||row.minus.x<row.row.x-1)failures.push(`${zoom}x ${row.name} control leaves row`);
  }
  if(overflow.page>overflow.viewport+1)failures.push(`${zoom}x page overflows`);
 }
 writeFileSync(`${artifacts}/nights-${width}.json`,JSON.stringify(measurements,null,2));assert.deepEqual(failures,[]);
}));
for(const width of [320,360,390,430])test(`homepage fresh Return and persisted One way survive mobile tabs and hydration ${width}px`,{skip:!enabled,timeout:45000},()=>evidence(`home-type-${width}`,width,async (page,context)=>{
 await context.route('**/api/auth/**',async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.fulfill({status:200,contentType:'application/json',body:'null'});});
 await page.addInitScript(()=>{
  const states:Array<{pressed:string|null;disabled:boolean}>=[];
  (window as unknown as {__freshTypeHydration:typeof states}).__freshTypeHydration=states;
  new MutationObserver(()=>{
   const button=[...document.querySelectorAll<HTMLButtonElement>('[data-homepage-trip-type] button')].find(b=>b.textContent==='Return to start');
   if(!button)return;const state={pressed:button.getAttribute('aria-pressed'),disabled:button.disabled};
   if(JSON.stringify(states.at(-1))!==JSON.stringify(state))states.push(state);
  }).observe(document,{subtree:true,childList:true,attributes:true});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});const observations=[];
 for(const tab of ['Plan with stops','Describe my trip']){
  await page.getByRole('tab',{name:tab,exact:true}).click();const button=page.getByRole('button',{name:'Return to start',exact:true});
  assert.equal(await button.getAttribute('aria-pressed'),'true','fresh storage has Return selected');
  const style=await button.evaluate(element=>{const s=getComputedStyle(element);return {color:s.color,background:s.backgroundColor,opacity:s.opacity}});observations.push({tab,style});
  const luminance=(color:string)=>color.match(/\d+(?:\.\d+)?/g)!.slice(0,3).map(Number).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0);
  const [bright,dark]=[luminance(style.color),luminance(style.background)].sort((a,b)=>b-a);assert.ok((bright!+.05)/(dark!+.05)>=4.5);assert.equal(style.opacity,'1');
  await screenshot(page,`home-fresh-${width}-${tab.replaceAll(' ','-')}`);
 }
 const hydration=await page.evaluate(()=>(window as unknown as {__freshTypeHydration:Array<{pressed:string|null;disabled:boolean}>}).__freshTypeHydration);assert.ok(hydration.length>0);assert.ok(hydration.every(state=>state.pressed==='true'),'fresh Return stays selected through session hydration');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Return to start',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Return to start',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'One way',exact:true}).click();
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)??'null')?.snapshot?.tripType?.value==='one_way',homepageKey);
 const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).snapshot,homepageKey);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='One way'&&b.getAttribute('aria-pressed')==='true'));
 for(const tab of ['Plan with stops','Describe my trip']){await page.getByRole('tab',{name:tab,exact:true}).click();assert.equal(await page.getByRole('button',{name:'One way',exact:true}).getAttribute('aria-pressed'),'true');await screenshot(page,`home-restored-${width}-${tab.replaceAll(' ','-')}`);}
 const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).snapshot,homepageKey);assert.deepEqual(after.tripType,before.tripType);assert.deepEqual(after.journeyEnd,before.journeyEnd);
 writeFileSync(`${artifacts}/home-type-${width}.json`,JSON.stringify({observations,hydration,preservedType:after.tripType},null,2));
}));
for(const width of [320,360,390,430,1440])test(`itinerary viewport default preserves explicit view and day links ${width}px`,{skip:!enabled,timeout:60000},()=>evidence(`view-${width}`,width,async page=>{
 const trip=await seedTrip(page),url=`${base}/journey/${trip.id}/itinerary?recovery=1`;
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip itinerary',exact:true}).waitFor();
 const expected=width<=700?'Day by day':'Calendar';await page.waitForFunction(name=>[...document.querySelectorAll('button')].some(b=>b.textContent===name&&b.getAttribute('aria-pressed')==='true'),expected,{timeout:5000});
 await screenshot(page,`itinerary-default-${width}`);
 await page.setViewportSize({width:width<=700?1440:390,height:900});assert.equal(await page.getByRole('button',{name:expected,exact:true}).getAttribute('aria-pressed'),'true','resize keeps current view');
 await page.setViewportSize({width,height:900});
 await page.getByRole('button',{name:expected==='Calendar'?'Day by day':'Calendar',exact:true}).click();const chosen=expected==='Calendar'?'Day by day':'Calendar';
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(name=>[...document.querySelectorAll('button')].some(b=>b.textContent===name&&b.getAttribute('aria-pressed')==='true'),chosen);
 await screenshot(page,`itinerary-explicit-${width}`);
 await page.goto(url+'&day=2',{waitUntil:'domcontentloaded'});await page.locator('section[aria-label="Day 2 planner"]').waitFor();assert.equal(await page.getByRole('button',{name:'Day by day',exact:true}).getAttribute('aria-pressed'),'true');
 await page.goto(url+'&day=2&itineraryView=calendar',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Calendar'&&b.getAttribute('aria-pressed')==='true'));await screenshot(page,`itinerary-day-explicit-calendar-${width}`);
}));
test('Builder success notice stays clear of CTA and restarts dismissal for repeated edits',{skip:!enabled,timeout:45000},()=>evidence('toast-lifecycle',320,async page=>{
 await builder(page);const plus=page.getByRole('button',{name:/Add one night to Tokyo/});await plus.click();const notice=page.locator('[data-variant="toast"]');await notice.waitFor();await page.mouse.move(0,0);
 const boxes={notice:await notice.boundingBox(),cta:await page.getByRole('button',{name:/^Build trip/}).boundingBox()};await screenshot(page,'toast-before-dismiss');writeFileSync(`${artifacts}/toast-bounds.json`,JSON.stringify(boxes,null,2));
 const failures=[];if(boxes.notice&&boxes.cta&&overlap(boxes.notice,boxes.cta))failures.push('success notice overlaps bottom CTA');
 await page.waitForTimeout(4500);await plus.click();await page.mouse.move(0,0);await page.waitForTimeout(1800);if(await notice.count()!==1)failures.push('old timer dismissed new receipt');
 await notice.waitFor({state:'hidden',timeout:5000}).catch(()=>failures.push('success notice never auto-dismisses'));
 await plus.click();await notice.waitFor();await page.getByRole('button',{name:'Dismiss Trip updated',exact:true}).click();assert.equal(await notice.count(),0);
 const beforeUndo=await plus.getAttribute('aria-label');
 await page.getByRole('button',{name:/Remove one night from Tokyo/}).click();await notice.waitFor();await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await notice.count(),0);assert.equal(await plus.getAttribute('aria-label'),beforeUndo,'Undo restores the latest receipt');
 assert.deepEqual(failures,[]);
}));

for(const width of [320,360,390,430])test(`Builder notice clears measured footer under safe area and 200% text ${width}px`,{skip:!enabled,timeout:30000},()=>evidence(`toast-geometry-${width}`,width,async page=>{
 await builder(page);await page.getByRole('button',{name:/Add one night to Tokyo/}).click();const notice=page.locator('[data-variant="toast"]');await notice.waitFor();
 await page.evaluate(()=>{
  document.querySelector<HTMLElement>('[data-builder-root]')!.style.setProperty('--morrovia-mobile-dock-offset','32px');
  const footer=[...document.querySelectorAll('button')].find(button=>button.textContent?.startsWith('Build trip'))!.parentElement!.parentElement!;
  const elements=[...footer.querySelectorAll<HTMLElement>('*'),...document.querySelectorAll<HTMLElement>('[data-variant="toast"] *')].map(element=>({element,font:getComputedStyle(element).fontSize,line:getComputedStyle(element).lineHeight}));
  for(const {element,font,line} of elements){element.style.fontSize=`${parseFloat(font)*2}px`;if(line!=='normal')element.style.lineHeight=`${parseFloat(line)*2}px`;}
 });
 await page.waitForTimeout(100);
 const geometry=await page.getByRole('button',{name:/^Build trip/}).evaluate(button=>{
  const rect=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
  const footer=button.parentElement!.parentElement!,notice=document.querySelector('[data-variant="toast"]')!,r=button.getBoundingClientRect();
  return {cta:rect(button),footer:rect(footer),notice:rect(notice),targetClear:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),viewport:innerWidth,page:document.documentElement.scrollWidth};
 });
 writeFileSync(`${artifacts}/toast-geometry-${width}.json`,JSON.stringify(geometry,null,2));await screenshot(page,`toast-safe-area-text-${width}`);
 assert.ok(geometry.notice.y+geometry.notice.height<=geometry.footer.y-8,'toast clears the complete measured footer');assert.equal(geometry.targetClear,true);assert.ok(geometry.page<=geometry.viewport+1);
}));
test('Builder save failure remains visible after success notice expires',{skip:!enabled,timeout:30000},()=>evidence('save-error-persistent',390,async page=>{
 await builder(page);
 await page.evaluate(()=>{
  const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key.startsWith('easyt:trip-recovery:'))throw new DOMException('Synthetic device quota failure','QuotaExceededError');return set.call(this,key,value);};
 });
 await page.getByRole('button',{name:/Add one night to Tokyo/}).click();
 const error=page.getByText('The accepted edit could not safely replace this device recovery.',{exact:true});await error.waitFor();
 await page.mouse.move(0,0);await page.waitForTimeout(6500);assert.equal(await error.isVisible(),true,'error is separate from temporary success');
 assert.ok(await page.locator('[data-state="error"]').count()>0);await screenshot(page,'save-error-after-toast');
}));
