import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import test from 'node:test';
import type {EasyTTrip} from '../lib/easyt/trip.ts';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';

// Actual built application + CSS. No pre-opened Storybook drawer or map mock.
const enabled=process.env.MORROVIA_MOBILE_MAP_BROWSER_TESTS==='1';
const base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3100';
const shots=process.env.MORROVIA_MAP_SCREENSHOTS;
const require=createRequire(import.meta.url);
const bundled=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const runtime=process.env.MORROVIA_PLAYWRIGHT_MODULE??(existsSync(bundled)?bundled:'playwright');
// Retained synthetic trip has valid endpoint/reference bindings, not bare coordinates.
const trip=JSON.parse(readFileSync(new URL('./fixtures/mobile-map-planner-trip.json',import.meta.url),'utf8')) as EasyTTrip;
const recoveryKey=`easyt:trip-recovery:v2:guest:${trip.id}:mobile-map-regression`;
const recoveryRaw=JSON.stringify({version:2,ownerId:null,tripId:trip.id,trip,state:'pending',writeId:'mobile-map-regression',savedAt:'2026-10-17T00:00:00Z'});

async function open(width:number){
  assert.ok(['127.0.0.1','localhost','staging.morrovia.com'].includes(new URL(base).hostname),'only local or disposable staging qualification');
  const {chromium}=require(runtime),browser=await chromium.launch({channel:process.env.MORROVIA_BROWSER_CHANNEL??'chrome',headless:true});
  const context=await browser.newContext({viewport:{width,height:width<=980?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
  const errors:string[]=[];let accountWrites=0;
  // Provider ports are deterministic and free. Trip APIs never receive a write.
  await context.route('**/api/**',async(route:any)=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(path==='/api/auth/get-session'&&['127.0.0.1','localhost'].includes(url.hostname))return route.fulfill({status:200,contentType:'application/json',body:'null'});
    if(path==='/api/journey-discover')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({places:[],assessment:{retrieval:'completed',evidence:'insufficient',retryable:false,sourceCount:0}})});
    if(path==='/api/journey-local-search')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({places:[],assessment:{retrieval:'completed',evidence:'insufficient',retryable:false,sourceCount:0}})});
    if(path==='/api/journey-activity-inventory')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({activities:[],assessment:{retrieval:'completed',evidence:'insufficient',retryable:false,sourceCount:0}})});
    if(!['GET','HEAD','OPTIONS'].includes(request.method())){if(path.startsWith('/api/easyt/trips'))accountWrites++;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"read-only map fixture"}'});}
    return route.continue();
  });
  await context.addInitScript(({key,raw,consentKey,consent}:{key:string;raw:string;consentKey:string;consent:string})=>{
    if(sessionStorage.getItem('mobile-map-regression-seeded'))return;sessionStorage.setItem('mobile-map-regression-seeded','1');
    localStorage.setItem(key,raw);localStorage.setItem('mobile-map-control','preserve');localStorage.setItem(consentKey,consent);
  },{key:recoveryKey,raw:recoveryRaw,consentKey:PRIVACY_CONSENT_STORAGE_KEY,consent:JSON.stringify(createPrivacyConsentRecord({analytics:false,affiliateTracking:false}))});
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.addLocatorHandler(page.locator('[data-workspace-orientation-ui="true"][role="dialog"]'),async(dialog:any)=>dialog.getByRole('button',{name:'Skip workspace guide',exact:true}).click());
  await page.goto(`${base}/journey/${trip.id}/map`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Whole route',exact:true}).waitFor();
  const rail=page.locator('[data-route-stop-navigation]'),planner=page.locator('#shape-day-workspace'),sheet=page.locator('#map-contextual-sheet');
  return{page,rail,planner,sheet,async capture(name:string){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:`${shots}/${name}.png`,fullPage:true});writeFileSync(`${shots}/${name}.json`,JSON.stringify(await page.evaluate(()=>({width:innerWidth,view:document.querySelector('#map-contextual-sheet')?.getAttribute('data-mobile-sheet-view'),state:document.querySelector('#map-contextual-sheet')?.getAttribute('data-mobile-drawer-state')})),null,2));},async close(){try{assert.deepEqual(errors,[]);assert.equal(accountWrites,0);assert.deepEqual(await page.evaluate((key:string)=>[localStorage.getItem(key),localStorage.getItem('mobile-map-control')],recoveryKey),[recoveryRaw,'preserve']);}finally{await browser.close();}}};
}

for(const width of [390,980,981,1440])test(`${width}px ordinary Map stop selection exposes itinerary and planning tabs`,{skip:!enabled,timeout:60000},async()=>{
  const h=await open(width);try{
    await h.rail.getByRole('button',{name:/^Bogotá/}).click();
    await h.sheet.waitFor({state:'attached'});
    assert.equal(await h.planner.getByRole('tab',{name:'Plan',exact:true}).isVisible(),true,'ordinary stop entry must expose the populated planner');
    await h.planner.getByRole('region',{name:'Selected day plan',exact:true}).waitFor();
    for(const name of ['Plan','Stay','Eat','See'])assert.equal(await h.planner.getByRole('tab',{name,exact:true}).isVisible(),true);
    for(const [tab,panel] of [['Stay','Stay finder for Bogotá'],['Eat','Restaurant finder for Bogotá']]){
      await h.planner.getByRole('tab',{name:tab,exact:true}).click();await h.planner.getByRole('region',{name:panel,exact:true}).waitFor();
    }
    await h.planner.getByRole('tab',{name:'See',exact:true}).click();await h.page.getByText('No places are available for this stop yet.',{exact:true}).waitFor();
    await h.rail.getByRole('button',{name:/Cartagena/}).click();await h.planner.getByRole('heading',{name:'Cartagena',exact:true}).waitFor();
    await h.planner.getByRole('tab',{name:'Plan',exact:true}).click();await h.planner.getByRole('region',{name:'Selected day plan',exact:true}).waitFor();
    await h.capture(`map-${width}-selected`);
    if(width===390){await h.page.setViewportSize({width:981,height:1000});assert.equal(await h.planner.getByRole('tab',{name:'Plan',exact:true}).isVisible(),true);await h.page.setViewportSize({width:390,height:844});assert.equal(await h.planner.getByRole('tab',{name:'Plan',exact:true}).isVisible(),true);}
  }finally{await h.close();}
});

test('390px Map marker stop selection opens the same populated planner',{skip:!enabled,timeout:60000},async()=>{
  const h=await open(390);try{
    await h.page.locator('.planner-map').getByRole('button',{name:/^Show Bogotá,/}).click();
    await h.planner.getByRole('region',{name:'Selected day plan',exact:true}).waitFor();
    assert.equal(await h.planner.getByRole('tab',{name:'See',exact:true}).isVisible(),true);
    await h.capture('map-390-marker-entry');
  }finally{await h.close();}
});

test('390px collapsed Map planning entry receives a real tap and reopens its itinerary',{skip:!enabled,timeout:60000},async()=>{
  const h=await open(390);try{
    await h.rail.getByRole('button',{name:/^Bogotá/}).click();await h.sheet.locator('header').first().getByRole('button').click();
    await h.sheet.evaluate(async(e:HTMLElement)=>{e.getBoundingClientRect();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})));});
    const entry=h.page.getByRole('button',{name:'Open planning for Bogotá',exact:true});await entry.waitFor();
    const hit=await entry.evaluate((e:HTMLElement)=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return Boolean(hit&&e.contains(hit));});
    assert.equal(hit,true,'collapsed drawer must not cover the planning entry');
    await entry.click();await h.planner.getByRole('region',{name:'Selected day plan',exact:true}).waitFor();
    await h.sheet.locator('header').first().getByRole('button').click();await h.sheet.locator('header').first().getByRole('button').click();
    await h.planner.getByRole('region',{name:'Selected day plan',exact:true}).waitFor();await h.capture('map-390-reopened');
  }finally{await h.close();}
});
