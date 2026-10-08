import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {existsSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
const require=createRequire(import.meta.url);
const runtime=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const enabled=process.env.MORROVIA_CORE_JOURNEY_BROWSER_TESTS==='1';
const base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3101';
if(enabled){const url=new URL(base);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('This regression requires a local app.');}

test('homepage route fields share one rounded boundary and type toggles without a false confirmation',{skip:!enabled,timeout:60000},async()=>{
 const {chromium}=require(existsSync(runtime)?runtime:'playwright') as typeof import('playwright');const browser=await chromium.launch({headless:true});
 const context=await browser.newContext();const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:PRIVACY_CONSENT_STORAGE_KEY,value:JSON.stringify(createPrivacyConsentRecord({analytics:false,affiliateTracking:false},'2026-10-08T12:00:00.000Z'))});
 await page.route('**/api/auth/get-session',route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
 await page.goto(base,{waitUntil:'domcontentloaded'});const origin=page.getByRole('combobox',{name:'Start from',exact:true});await origin.waitFor();
 if(await page.getByRole('button',{name:'Reject optional',exact:true}).count())await page.getByRole('button',{name:'Reject optional',exact:true}).click();
 const group=origin.locator('xpath=ancestor::*[@data-home-route-fields]');assert.equal(await group.count(),1,'origin and destination have one connected owner');
 assert.equal(await group.getByRole('combobox',{name:'Destination',exact:true}).count(),1);
 for(const width of [1440,768,430,390]){
  await page.setViewportSize({width,height:900});
  const appearance=await group.evaluate(el=>{const c=getComputedStyle(el);return {border:parseFloat(c.borderTopWidth),radius:parseFloat(c.borderTopLeftRadius),cols:c.gridTemplateColumns}});assert.ok(appearance.border>0&&appearance.radius>0);
  const inner=await origin.evaluate(el=>parseFloat(getComputedStyle(el).borderTopWidth));assert.equal(inner,0,'origin uses the shared boundary');
  assert.equal(await page.locator('[data-home-destination-field]').evaluate(el=>parseFloat(getComputedStyle(el).borderTopWidth)),0,'destination uses the shared boundary');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`no horizontal overflow at ${width}px`);
  const route=await group.boundingBox();const type=await page.getByRole('group',{name:'Trip type',exact:true}).boundingBox();assert.ok(route&&type);assert.ok(type.y+type.height<=route.y+1&&route.y-type.y-type.height<=16,'type is attached above its fields');
 }
 await page.getByRole('button',{name:'Return to start',exact:true}).click();await page.getByRole('button',{name:'One way',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('button',{name:'One way',exact:true}).getAttribute('aria-pressed'),'true');
 await page.reload();await origin.waitFor();assert.equal(await page.getByRole('button',{name:'One way',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Return to start',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
 const artifact=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifact){mkdirSync(artifact,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:`${artifact}/homepage-${width}.png`});}}
 assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close()}
});

for(const width of [1440,390])test(`populated homepage hard reload keeps selected chips closed without interaction at ${width}px`,{skip:!enabled,timeout:30000},async()=>{
 const {chromium}=require(existsSync(runtime)?runtime:'playwright') as typeof import('playwright');const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width,height:1100}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const key='easyt-private:guest:homepage-input',snapshot=JSON.parse(JSON.stringify({...emptyHomepageInput(),revision:7,
  entries:['Japan','China'].map((name,index)=>({id:`destination-${index+1}`,text:name,selection:{canonicalPlaceId:`country:${name.toLowerCase()}`,name,label:name,country:name,placeType:'country',routability:'planning_area',provenance:[{id:'fixture',kind:'canonical',label:name,supports:'Synthetic country planning area'}]}})),originInput:'Hong Kong',origin:{state:'selected',value:{name:'Hong Kong',canonicalPlaceId:'hong-kong',country:'Hong Kong',coordinates:[114.1694,22.3193]}},
  dates:{state:'selected',value:{start:'2026-10-15',end:'2026-10-29'}},tripType:{state:'selected',value:'return_to_start'},journeyEnd:{state:'selected',value:{mode:'same_as_start'}},travellers:{state:'selected',value:2},budget:{state:'selected',value:'mid'}}));
 try{
  await page.addInitScript(({key,snapshot,consentKey,consent})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({snapshot}));localStorage.setItem(consentKey,consent)},
   {key,snapshot,consentKey:PRIVACY_CONSENT_STORAGE_KEY,consent:JSON.stringify(createPrivacyConsentRecord({analytics:false,affiliateTracking:false},'2026-10-08T12:00:00.000Z'))});
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).pathname.includes('/auth/')?null:{candidates:[],result:null})}));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  for(let load=0;load<2;load++){
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{const input=document.querySelector('[data-homepage-origin] input');return input instanceof HTMLInputElement&&input.value==='Hong Kong'});
   await page.waitForFunction(()=>{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent?.trim()==='Add destination');return button&&!button.disabled});
   assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key),{snapshot});
   const artifact=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifact&&load){mkdirSync(artifact,{recursive:true});await page.screenshot({path:`${artifact}/homepage-restored-no-interaction-${width}.png`});}
   assert.equal(await page.getByRole('combobox',{name:'Destination',exact:true}).count(),0,'restored selected entries must be chips without Escape, blur or Edit');
   assert.equal(await page.getByRole('button',{name:/^Edit Japan/}).count(),1);assert.equal(await page.getByRole('button',{name:/^Edit China/}).count(),1);
   assert.equal(await page.getByRole('button',{name:'Add destination',exact:true}).count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }
  await page.getByRole('button',{name:/^Edit Japan/}).click();const draft=page.getByRole('combobox',{name:'Destination',exact:true});await draft.fill('  Japan unfinished  ');
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)!).snapshot.entries[0].text==='  Japan unfinished  ',key);
  const authored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);assert.equal(authored.snapshot.entries[0].selection,null);assert.equal(authored.snapshot.entries[0].id,'destination-1');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{const input=document.querySelector('[data-homepage-origin] input');return input instanceof HTMLInputElement&&input.value==='Hong Kong'});
  assert.equal(await draft.inputValue(),'  Japan unfinished  ');assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key),authored);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
