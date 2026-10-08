import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {existsSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';
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
