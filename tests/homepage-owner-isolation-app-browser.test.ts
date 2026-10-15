import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync} from 'node:fs';
import {chromium,type Page} from 'playwright';
import {createPendingIntakeReceipt,HOME_TRIP_DRAFT_KEY} from '../lib/easyt/home-trip-handoff.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {emptyHomepageInput,selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';

const enabled=process.env.MORROVIA_OWNER_ISOLATION_BROWSER_TESTS==='1';
const base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3117';
if(enabled&&(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname)||new URL(base).protocol!=='http:'))throw new Error('Synthetic owner-isolation tests require a local HTTP app');
const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR??'/tmp/morrovia-priority1-browser';
const foreignOwner='synthetic-foreign-owner';
const foreignSnapshot={...emptyHomepageInput(foreignOwner),mode:'describe' as const,prompt:'Synthetic foreign pending journey'};
const foreignReceipt=createPendingIntakeReceipt(foreignSnapshot,{handoffId:'synthetic-foreign-handoff',tripId:'synthetic-foreign-trip'});
const foreignInput=JSON.stringify({snapshot:foreignSnapshot,receipt:foreignReceipt});
const foreignDraft=JSON.stringify({version:2,phase:'pending-interpretation',receipt:foreignReceipt});

async function isolatedPage(ownerId:string|null,selected=false) {
  const browser=await chromium.launch({channel:process.env.MORROVIA_BROWSER_CHANNEL??'chrome',headless:true});
  const context=await browser.newContext();
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==new URL(base).origin)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    let body:unknown={},status=503;
    if(url.pathname==='/api/auth/get-session'){
      status=200;body=ownerId?{user:{id:ownerId,name:'Synthetic QA',email:'qa@example.test',emailVerified:true,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'},
        session:{id:'synthetic-session',userId:ownerId,expiresAt:'2030-01-01T00:00:00Z',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'}}:null;
    }else if(url.pathname==='/api/journey-transfer-resolution'){
      status=200;body={legs:route.request().postDataJSON().legs};
    }
    return route.fulfill({status,json:body});
  });
  const current=selected?JSON.stringify({snapshot:selectedStopsHomepageInput(ownerId)}):null;
  await context.addInitScript(({foreignKey,foreignInput,foreignDraft,sharedKey,currentKey,current})=>{
    // Only these disposable test contexts are seeded; reloads preserve edits.
    if(localStorage.getItem('synthetic-owner-fixture')!==null)return;
    localStorage.setItem(foreignKey,foreignInput);localStorage.setItem(sharedKey,foreignDraft);
    if(current!==null)localStorage.setItem(currentKey,current);
    localStorage.setItem('synthetic-owner-fixture','seeded');
  },{foreignKey:homepageInputStorageKey(foreignOwner),foreignInput,foreignDraft,sharedKey:HOME_TRIP_DRAFT_KEY,currentKey:homepageInputStorageKey(ownerId),current});
  return {page:await context.newPage(),close:()=>browser.close()};
}
async function retained(page:Page) {
  const actual=await page.evaluate(({foreignKey,sharedKey})=>[localStorage.getItem(foreignKey),localStorage.getItem(sharedKey)],
    {foreignKey:homepageInputStorageKey(foreignOwner),sharedKey:HOME_TRIP_DRAFT_KEY});
  assert.deepEqual(actual,[foreignInput,foreignDraft],'foreign input and pending envelope must remain byte-identical');
}
for(const ownerId of [null,'synthetic-current-owner']) {
  test(`compiled Homepage and queryless New allow ${ownerId?'signed-in':'guest'} search beside a foreign pending envelope`,{skip:!enabled,timeout:45000},async()=>{
    const {page,close}=await isolatedPage(ownerId);
    try {
      await page.goto(base);
      const destination=page.getByRole('combobox',{name:'Destination',exact:true});
      await destination.waitFor();await destination.fill('Madrid');
      await page.getByRole('option',{name:/Madrid.*Spain/}).first().click();
      await page.waitForFunction(({key,ownerId})=>{
        const stored=JSON.parse(localStorage.getItem(key)??'null');
        return stored?.snapshot.ownerId===ownerId&&stored.snapshot.entries.some((entry:{selection?:{name:string}})=>entry.selection?.name==='Madrid');
      },{key:homepageInputStorageKey(ownerId),ownerId});
      assert.equal(await page.getByText("We couldn't restore this trip input. Keep this tab open and try again.",{exact:true}).count(),0);
      await retained(page);mkdirSync(artifacts,{recursive:true});
      await page.screenshot({path:`${artifacts}/${ownerId?'signed-in':'guest'}-homepage.png`});
      await page.goto(base+'/journey/new');
      // New uses the existing collapsed destination editor; open it first.
      await page.getByRole('button',{name:/Where do you want to go\?/}).click();
      await page.getByRole('button',{name:'Add destination',exact:true}).click();
      await page.getByRole('combobox',{name:'Destination',exact:true}).fill('Lisbon');
      await page.waitForFunction(({key,ownerId})=>{
        const stored=JSON.parse(localStorage.getItem(key)??'null');
        return stored?.snapshot.ownerId===ownerId&&stored.snapshot.entries.some((entry:{text:string})=>entry.text==='Lisbon');
      },{key:homepageInputStorageKey(ownerId),ownerId});
      assert.equal(await page.getByText(/This trip is not available to the current browser account/).count(),0);
      await retained(page);await page.screenshot({path:`${artifacts}/${ownerId?'signed-in':'guest'}-new.png`});
    }catch(error){
      mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${ownerId?'signed-in':'guest'}-failure.png`});
      console.error('Synthetic New-page controls',await page.evaluate(()=>({headings:[...document.querySelectorAll('h1,h2')].map(el=>el.textContent),
        buttons:[...document.querySelectorAll('button')].map(el=>({name:el.getAttribute('aria-label')??el.textContent,disabled:el.disabled})),
        protected:document.body.innerText.includes('not available to the current browser account')})));
      throw error;
    }finally{await close();}
  });
}
test('compiled Homepage submission opens and reloads its own Builder while the foreign pending copy stays unchanged',{skip:!enabled,timeout:60000},async()=>{
  const {page,close}=await isolatedPage(null,true);
  try {
    await page.goto(base);
    await page.locator('#start-building').getByRole('button',{name:'Plan my trip',exact:true}).click();
    await page.waitForURL(/\/journey\/new\?/);
    await page.locator('[data-builder-edit-session="active"]').waitFor();
    await page.getByText('Saved on this device',{exact:true}).first().waitFor();await retained(page);
    await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();await retained(page);
    mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/guest-builder-reopen.png`});
  }finally{await close();}
});
