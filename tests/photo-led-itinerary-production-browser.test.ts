import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {photoLedItineraryTrip} from './fixtures/photo-led-itinerary.ts';
import {saveTripRecoveryToStorage} from '../lib/easyt/storage.ts';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';
import type {Page,Route} from 'playwright';

const enabled=process.env.MORROVIA_PHOTO_PRODUCTION_BROWSER_TESTS==='1';
const base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:4187';
if(enabled&&!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('This qualification targets only an isolated local app');
const require=createRequire(import.meta.url);

test('built production itinerary renders reviewed photos, keeps bottom navigation and persists in-place rename', {skip:!enabled,timeout:90_000}, async()=>{
 const {chromium}=require(process.env.MORROVIA_PLAYWRIGHT_MODULE??`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const trip=photoLedItineraryTrip(),values=new Map<string,string>();
 const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 assert.equal(saveTripRecoveryToStorage(storage,trip,{writeId:'local-production-qualification'}).stored,true);
 values.set(PRIVACY_CONSENT_STORAGE_KEY,JSON.stringify(createPrivacyConsentRecord({analytics:false,affiliateTracking:false})));
 const page:Page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.route('**/*',(route:Route)=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await page.addInitScript((entries:[string,string][])=>{
    if(sessionStorage.getItem('photo-production-qualification-seeded'))return;
    sessionStorage.setItem('photo-production-qualification-seeded','1');
    for(const[k,v]of entries)if(!localStorage.getItem(k))localStorage.setItem(k,v);
  },[...values.entries()]);
  await page.goto(`${base}/journey/${trip.id}/itinerary?day=4`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Skip workspace guide',exact:true}).click({timeout:2500}).catch(()=>{});
  await page.getByRole('heading',{name:'Japan',level:1,exact:true}).waitFor();
  await page.locator('[data-itinerary-photo="day"] img').waitFor();
  await page.getByRole('button',{name:'Calendar',exact:true}).click();
  assert.equal(await page.locator('#itinerary-calendar [data-itinerary-photo]').count(),7);
  assert.equal(await page.locator('#itinerary-calendar article').count(),7);
  mkdirSync('output/playwright',{recursive:true});
  await page.screenshot({path:'output/playwright/production-photo-calendar-1440.png',fullPage:true});
  await page.setViewportSize({width:390,height:1000});
  await page.getByRole('button',{name:'Day by day',exact:true}).click();
  await page.getByRole('heading',{name:'Tokyo → Kyoto',exact:true}).waitFor();
  const nav=page.getByRole('navigation',{name:'Trip workspace',exact:true});
  assert.equal(await nav.getByRole('link',{name:'Itinerary',exact:true}).getAttribute('aria-current'),'page');
  assert.deepEqual(await nav.locator('a,button').allTextContents(),['Overview','Itinerary','Map','Transport','More']);
  await page.getByRole('button',{name:'Trip menu',exact:true}).click();
  await page.getByRole('menuitem',{name:'Rename trip',exact:true}).click();
  const name=page.locator('#trip-shell-title').getByRole('textbox',{name:'Trip name',exact:true});
  await name.fill('Japan qualification route');await name.press('Enter');
  await page.getByRole('heading',{name:'Japan qualification route',level:1,exact:true}).waitFor();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Japan qualification route',level:1,exact:true}).waitFor();
  await page.locator('section[aria-label="Day 4 planner"]').waitFor();
  await page.getByRole('heading',{name:'Tokyo → Kyoto',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.images].some(img=>img.closest('[data-itinerary-photo="day"]')&&img.complete&&img.naturalWidth>0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'output/playwright/production-photo-agenda-390.png',fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
