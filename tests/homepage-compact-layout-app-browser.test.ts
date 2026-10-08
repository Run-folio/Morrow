import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';
const require=createRequire(import.meta.url),{chromium}=require(`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
const enabled=process.env.MORROVIA_HOMEPAGE_COMPACT_BROWSER_TESTS==='1',base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3152';
const key='easyt-private:guest:homepage-input';
function snapshot(){return {version:1,ownerId:null,revision:1,mode:'stops',entries:[{id:'visit:madrid',text:'Madrid',selection:{name:'Madrid',label:'Madrid, Spain',country:'Spain',canonicalPlaceId:'place:madrid',placeType:'city',coordinates:[-3.7038,40.4168],provenance:[{id:"fixture:madrid",kind:"canonical",label:"Madrid",supports:"Synthetic canonical fixture"}]}}],prompt:'Madrid then Lisbon, 2 weeks',originInput:'London',origin:{state:'selected',value:{name:'London',country:'United Kingdom',canonicalPlaceId:'place:london',coordinates:[-.1276,51.5072]}},dates:{state:'selected',value:{start:'2026-10-15',end:'2026-10-29'}},tripType:{state:'selected',value:'return_to_start'},journeyEnd:{state:'selected',value:{mode:'same_as_start'}},budget:{state:'selected',value:'mid'},travellers:{state:'selected',value:2},interests:{state:'selected',value:['nature']}}}
async function fixture(width:number){
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width,height:1000}}),errors:string[]=[],requests:string[]=[];
 page.setDefaultTimeout(10000);page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.addInitScript(({key,s,consentKey,consent}:any)=>{if(sessionStorage.getItem('seeded-compact'))return;sessionStorage.setItem('seeded-compact','1');localStorage.setItem(key,JSON.stringify({snapshot:s}));localStorage.setItem(consentKey,JSON.stringify(consent))},{key,s:snapshot(),consentKey:PRIVACY_CONSENT_STORAGE_KEY,consent:createPrivacyConsentRecord({analytics:false,affiliateTracking:false},'2026-10-08T12:00:00Z')});
 await page.route('**/api/**',async(route:any)=>{const path=new URL(route.request().url()).pathname;requests.push(path);await route.fulfill({status:path.includes('/auth/')?200:404,contentType:'application/json',body:JSON.stringify(path.includes('/auth/')?null:{error:'Isolated layout fixture'})})});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('combobox',{name:'Start from',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('[data-homepage-origin] input')?.value==='London');
 const stored=()=>page.evaluate((k:string)=>JSON.parse(localStorage.getItem(k)!).snapshot,key);
 return {page,errors,requests,stored,close:()=>browser.close()};
}
for(const width of [1440,390])test(`compact homepage tabs preserve origin, endpoints, dates and occurrence drafts through reload at ${width}`,{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(width);try{
  const before=await h.stored(),form=h.page.locator('#start-building');
  await h.page.getByRole('tab',{name:'Describe my trip'}).click();
  assert.equal(await form.getByRole('combobox',{name:'Start from',exact:true}).count(),0);
  await h.page.getByRole('textbox',{name:'Start your plan'}).fill('Madrid then Lisbon, keep this exact order, 2 weeks');
  await h.page.reload();await h.page.getByRole('textbox',{name:'Start your plan'}).waitFor();
  assert.equal(await form.getByRole('combobox',{name:'Start from',exact:true}).count(),0);
  assert.equal(await h.page.getByRole('textbox',{name:'Start your plan'}).inputValue(),'Madrid then Lisbon, keep this exact order, 2 weeks');
  const described=await h.stored();for(const field of ['origin','originInput','entries','dates','tripType','journeyEnd','budget','travellers','interests'])assert.deepEqual(described[field],before[field],field);
  if(width===1440){const tabs=await form.getByRole('tablist').boundingBox(),type=await form.getByRole('group',{name:'Trip type',exact:true}).boundingBox();assert.ok(tabs&&type);assert.ok(type.x>=tabs.x+tabs.width);assert.ok(Math.abs(type.y-tabs.y)<15);const panel=await form.locator('[data-home-route-fields]').boundingBox(),prompt=await form.getByRole('tabpanel').boundingBox();assert.ok(panel&&prompt);assert.ok(prompt.width>=panel.width-3)}
  await h.page.getByRole('tab',{name:'Plan with stops'}).click();
  assert.equal(await h.page.getByRole('combobox',{name:'Start from',exact:true}).inputValue(),'London');
  assert.equal(await h.page.getByRole('button',{name:'Edit Madrid',exact:true}).count(),1);
  assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
test('hidden partial origin reveals the existing editor, preserves the prompt and creates no handoff',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(390);try{
  await h.page.getByRole('combobox',{name:'Start from',exact:true}).fill('Lon partial');
  await h.page.getByRole('tab',{name:'Describe my trip'}).click();
  await h.page.getByRole('textbox',{name:'Start your plan'}).fill('Madrid and Lisbon, two weeks');
  await h.page.locator('#start-building').getByRole('button',{name:'Plan my trip',exact:true}).click();
  const origin=h.page.getByRole('combobox',{name:'Start from',exact:true});await origin.waitFor();await h.page.waitForFunction(()=>document.querySelector('[data-homepage-origin] input')===document.activeElement);
  assert.equal(await h.page.getByRole('tab',{name:'Plan with stops'}).getAttribute('aria-selected'),'true');
  assert.equal(await origin.inputValue(),'Lon partial');assert.equal(await origin.evaluate((node:Element)=>document.activeElement===node),true);
  const saved=await h.stored();assert.equal(saved.prompt,'Madrid and Lisbon, two weeks');assert.equal(saved.entries[0].id,'visit:madrid');
  assert.equal(h.requests.includes('/api/journey-capture'),false);
  const reservation=await h.page.evaluate((k:string)=>({receipt:JSON.parse(localStorage.getItem(k)!).receipt,recoveries:Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:'))}),key);
  assert.equal(reservation.receipt,undefined);assert.deepEqual(reservation.recoveries,[]);assert.equal(new URL(h.page.url()).pathname,'/');
  assert.ok(await h.page.getByRole('alert').count()>0);assert.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
