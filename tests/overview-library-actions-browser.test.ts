import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY} from '../lib/privacy-consent.ts';

const enabled=process.env.MORROVIA_OVERVIEW_BROWSER_TESTS==='1',base=process.env.MORROVIA_STORYBOOK_URL??'http://127.0.0.1:3182';
const require=createRequire(import.meta.url),runtime=process.env.MORROVIA_PLAYWRIGHT_MODULE??`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const prefix='morrovia-05-product-patterns-trip-workspace-overview--';
async function open(story:string,width:number){
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'only isolated local Storybook fixtures');
  const {chromium}=require(runtime),browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},serviceWorkers:'block'}),page=await context.newPage();
  const writes:string[]=[],errors:string[]=[];page.setDefaultTimeout(15000);page.on('pageerror',(e:Error)=>errors.push(e.message));
  await context.route('**/*',async(route:any)=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==new URL(base).origin)return route.abort();
    if(url.pathname.startsWith('/api/')){if(!['GET','HEAD'].includes(request.method()))writes.push(`${request.method()} ${url.pathname}`);return route.fulfill({status:503,contentType:'application/json',body:'{"error":"isolated read-only fixture"}'});}
    return route.continue();
  });
  await context.addInitScript(({key,value}:{key:string;value:string})=>{localStorage.setItem(key,value);localStorage.setItem('overview-fixture-control','preserve');},{key:PRIVACY_CONSENT_STORAGE_KEY,value:JSON.stringify(createPrivacyConsentRecord({analytics:false,affiliateTracking:false}))});
  await page.goto(`${base}/iframe.html?id=${prefix}${story}&viewMode=story`,{waitUntil:'domcontentloaded'});
  const capture=async(name:string)=>{const dir=process.env.MORROVIA_OVERVIEW_SCREENSHOTS;if(!dir)return;mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/${name}-${width}.png`,fullPage:true});};
  return{page,writes,capture,async close(){try{assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'opening or cancelling a menu/dialog must issue no account mutation');assert.equal(await page.evaluate(()=>localStorage.getItem('overview-fixture-control')),'preserve');}finally{await browser.close();}}};
}

for(const width of [390,1440])test(`${width}px Overview has one short identity,retained route detail and safe account dialogs`,{skip:!enabled,timeout:60000},async()=>{
  const h=await open('library-actions-owner',width);try{
    await h.page.getByRole('heading',{name:'China & Japan',exact:true}).waitFor();
    assert.equal(await h.page.locator('p[class*="routeSummary"]').count(),0);
    assert.equal(await h.page.locator('#trip-shell-title').locator('..').locator('dl').count(),1);
    await h.page.getByRole('heading',{name:'Your route',exact:true}).waitFor();await h.capture('overview');
    await h.page.getByRole('button',{name:'More',exact:true}).click();
    assert.deepEqual(await h.page.getByRole('menuitem').allTextContents(),['Rename trip','Show me around','Gift this trip','Duplicate','Archive','Delete']);
    await h.page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#workspace-more-menu button:nth-of-type(3)')?.disabled);
    assert.equal(await h.page.getByRole('menuitem',{name:'Gift this trip',exact:true}).isEnabled(),true);await h.capture('overview-menu');
    await h.page.getByRole('menuitem',{name:'Gift this trip',exact:true}).click();
    await h.page.getByRole('dialog',{name:'Share China & Japan',exact:true}).waitFor();
    await h.page.getByRole('button',{name:'Close gift dialog',exact:true}).click();
    await h.page.getByRole('button',{name:'More',exact:true}).click();await h.page.getByRole('menuitem',{name:'Delete',exact:true}).click();
    const dialog=h.page.getByRole('dialog');await dialog.waitFor();await dialog.getByText('This action cannot be undone in Morrovia.',{exact:true}).waitFor();await h.capture('delete-confirmation');
    await dialog.getByRole('button',{name:'Keep trip',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }finally{await h.close();}
});

test('guest Overview keeps Rename/tour without exposing account actions',{skip:!enabled,timeout:45000},async()=>{
  const h=await open('library-actions-guest',390);try{await h.page.getByRole('heading',{name:'China & Japan',exact:true}).waitFor();await h.page.getByRole('button',{name:'More',exact:true}).click();assert.deepEqual(await h.page.getByRole('menuitem').allTextContents(),['Rename trip','Show me around']);await h.capture('guest-menu');}finally{await h.close();}
});
for(const [story,title]of [['authored-identity','Our spring adventure'],['ambiguous-legacy-identity','London Gatwick → Beijing → Shanghai → Tokyo']]as const)for(const width of [390,1440])test(`${width}px ${story} preserves its exact saved identity`,{skip:!enabled,timeout:45000},async()=>{
  const h=await open(story,width);try{await h.page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await h.page.locator('p[class*="routeSummary"]').count(),0);await h.capture(story);}finally{await h.close();}
});
test('other workspace header retains route context and its existing More actions',{skip:!enabled,timeout:45000},async()=>{
  const h=await open('other-workspace-route-context',1440);try{await h.page.getByRole('heading',{name:'China & Japan',exact:true}).waitFor();await h.page.locator('p[class*="routeSummary"]').waitFor();assert.match(await h.page.locator('p[class*="routeSummary"]').innerText(),/London Gatwick.*Beijing.*Shanghai.*Tokyo/);await h.page.getByRole('button',{name:'More',exact:true}).click();assert.deepEqual(await h.page.getByRole('menuitem').allTextContents(),['Rename trip','Show me around']);await h.capture('other-workspace');}finally{await h.close();}
});
