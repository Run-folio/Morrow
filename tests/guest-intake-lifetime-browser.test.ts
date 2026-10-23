import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {builderBundle,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {tripReceiptStorageKey,homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {cacheCanonicalTripToStorage,saveTripRecoveryToStorage,currentTripStorageKey,tripCacheStorageKey} from '../lib/easyt/storage.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import type {EasyTTrip} from '../lib/easyt/trip.ts';

// No HTTP listener or real host: Playwright fulfills every request in memory.
// Actual Home, Builder, resolver, browser localStorage and IndexedDB execute;
// framework/auth/account boundaries are controlled, with no OAuth/SQL claim.
for(const scenario of ['another-guest-intake','edited-before-sign-in','interrupted-checkpoint-reload','curated-route','confirmed-import','import-receipt-reload','curated-reservation-readback','signed-in-import','signed-in-curated'] as const) test(`actual guest workspace reload: ${scenario}`,
  {skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
  const baseline=process.env.MORROVIA_GUEST_INTAKE_BASELINE_DIR;
  const overrides=baseline?new Map(await Promise.all(['lib/easyt/durable-recovery-domain.ts','lib/easyt/durable-recovery-store.ts','lib/easyt/recovery-claim-inputs.ts','lib/easyt/storage.ts','lib/easyt/trip-receipt-persistence.ts','lib/easyt/two-store-trip-persistence.ts','app/journey/new/trip-builder.tsx'].map(async name=>[
    resolve(name),await readFile(resolve(baseline,name),'utf8')] as const))):undefined;
  const {script}=await builderBundle(false,overrides),origin='https://guest-intake-fixture.invalid';
  const browser=await chromium.launch({headless:true,executablePath:process.env.MORROVIA_BUILDER_BROWSER_EXECUTABLE});
  const context=await browser.newContext({serviceWorkers:'block'}),errors:string[]=[],writes:string[]=[],accountReads:string[]=[];
  const old=homeRecoveryFixture('owner-a'),accounts=new Map<string,EasyTTrip>([[old.trip.id,old.trip]]);
  const originalAccount=new Map<string,string>([old.native[0]!]);
  const syntheticStorage={get length(){return originalAccount.size;},key:(i:number)=>[...originalAccount.keys()][i]??null,
    getItem:(k:string)=>originalAccount.get(k)??null,setItem:(k:string,v:string)=>{originalAccount.set(k,v);},removeItem:(k:string)=>{originalAccount.delete(k);}};
  cacheCanonicalTripToStorage(syntheticStorage,old.trip);
  saveTripRecoveryToStorage(syntheticStorage,{...old.trip,title:'Separate protected history'},{ownerId:'owner-a',state:'conflict',writeId:'old-history'});
  const candidates=Object.fromEntries([['Tokyo',[139.6917,35.6895]],['Takayama',[137.2535,36.1458]],['Kanazawa',[136.6562,36.5613]],['Kyoto',[135.7681,35.0116]],['Osaka',[135.5023,34.6937]]].map(([name,coordinates])=>[String(name),{
    name,country:'Japan',coordinates,canonicalPlaceId:String(name).toLowerCase(),providerId:'fixture:'+String(name).toLowerCase(),kind:'city',placeType:'city',routability:'direct_destination',matchQuality:'exact',rankScore:200}]));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){await route.abort();return;}
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.startsWith('/api/easyt/trips')){
      if(request.method()==='GET'){const id=decodeURIComponent(url.pathname.split('/').at(-1)!);accountReads.push(id);await json(accounts.has(id)?{trip:accounts.get(id)}:{error:'Not found'},accounts.has(id)?200:404);return;}
      const submitted=request.postDataJSON() as EasyTTrip;
      assert.equal(request.headers()['x-morrovia-expected-owner'],'owner-a');
      const canonical=canonicalTripForOwner('owner-a',submitted);writes.push(submitted.id);accounts.set(submitted.id,canonical);
      await json({trip:canonical,outcome:'promoted'},201);return;
    }
    if(url.pathname==='/api/journey-transfer-resolution'){const legs=request.postDataJSON().legs as Array<{id:string}>;await json({legs,assessments:legs.map(leg=>({legId:leg.id,state:{retrieval:'completed',evidence:'conditional',retryable:false}}))});return;}
    if(url.pathname==='/api/journey-geocode') {const q=(url.searchParams.get('place')??'').split(',')[0]!.trim(),candidate=candidates[q];await json({candidates:candidate?[candidate]:[],result:candidate??null});return;}
    if(url.pathname.startsWith('/api/')){await json({error:'Controlled unavailable boundary'},503);return;}
    if(url.pathname==='/journey/login'){
      await route.fulfill({contentType:'text/html; charset=utf-8',body:`<button id="complete">Complete simulated sign in</button><script>document.getElementById('complete').onclick=()=>{sessionStorage.setItem('fixture-owner','owner-a');location.assign(new URLSearchParams(location.search).get('next'))}</script>`});return;
    }
    await route.fulfill({contentType:'text/html; charset=utf-8',body:`<div id="root"></div><script>${script.replaceAll('</script>','<\\/script>')}</script>`});
  });
  await context.addInitScript(()=>{
    const w=window as Window&{__BUILDER_TEST_OWNER__?:string;__BUILDER_TEST_FORCE_RESOLVER__?:boolean};
    w.__BUILDER_TEST_OWNER__=sessionStorage.getItem('fixture-owner')??undefined;w.__BUILDER_TEST_FORCE_RESOLVER__=true;
  });
  const page=await context.newPage();page.setDefaultTimeout(9000);page.on('pageerror',error=>errors.push(error.message));
  async function openHome(target:typeof page,places:Array<[string,string]>) {
    const snapshot=selectedStopsHomepageInput(null,places);snapshot.dates={state:'selected',value:{start:'2027-03-02',end:'2027-03-23'}};
    snapshot.tripType={state:'selected',value:'one_way'};snapshot.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};
    // Seed the synthetic Home form only before its first mounted render.
    await target.addInitScript(({key,snapshot})=>{if(location.pathname==='/'&&!sessionStorage.getItem('home-fixture-seeded')){
      sessionStorage.setItem('home-fixture-seeded','1');localStorage.setItem(key,JSON.stringify({snapshot}));}}, {key:homepageInputStorageKey(null),snapshot});
    await target.goto(origin+'/');await target.getByRole('button',{name:'Plan my trip',exact:true}).click();
    if(scenario==='interrupted-checkpoint-reload'){
      await target.waitForFunction(()=>sessionStorage.getItem('fixture-receipt-interrupted')==='1');
      assert.equal(await target.locator('[data-builder-edit-session="active"]').count(),0,'failed checkpoint must not mount an editor');
      await target.reload();
    }
    await target.locator('[data-builder-edit-session="active"]').waitFor();
  }
  if(scenario==='interrupted-checkpoint-reload'||scenario==='import-receipt-reload')await page.addInitScript((prefix:string)=>{
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key:string,value:string){
      if(this===localStorage&&key.startsWith(prefix)&&sessionStorage.getItem('fixture-receipt-interrupted')!=='1'){
        set.call(sessionStorage,'fixture-receipt-interrupted','1');throw new DOMException('Synthetic initial receipt refusal','SecurityError');
      }
      return set.call(this,key,value);
    };
  },tripReceiptStorageKey(null,'__fixture__').split('__fixture__')[0]!);
  try{
    const provenanceProducer=scenario==='curated-route'||scenario==='confirmed-import'||scenario==='import-receipt-reload'||scenario==='curated-reservation-readback'||scenario==='signed-in-import'||scenario==='signed-in-curated';
    if(provenanceProducer) {
      await page.addInitScript(entries=>{if(!sessionStorage.getItem('prior-home-seeded')){sessionStorage.setItem('prior-home-seeded','1');for(const [key,raw]of entries)localStorage.setItem(key,raw)}},homeRecoveryFixture().native);
      if(scenario==='curated-reservation-readback')await page.addInitScript(()=>{
        const get=Storage.prototype.getItem,set=Storage.prototype.setItem;let justWritten:string|null=null;
        Storage.prototype.setItem=function(k,v){set.call(this,k,v);if(this===localStorage&&k.includes(':trip-creation:')&&!get.call(sessionStorage,'creation-readback-failed'))justWritten=k;};
        Storage.prototype.getItem=function(k){if(this===localStorage&&k===justWritten){justWritten=null;set.call(sessionStorage,'creation-readback-failed','1');throw new DOMException('Synthetic readback failure','SecurityError')}return get.call(this,k);};
      });
      if(scenario.startsWith('signed-in'))await page.addInitScript(entries=>{sessionStorage.setItem('fixture-owner','owner-a');(window as Window&{__BUILDER_TEST_OWNER__?:string}).__BUILDER_TEST_OWNER__='owner-a';if(!sessionStorage.getItem('account-history-seeded')){sessionStorage.setItem('account-history-seeded','1');for(const [key,raw]of entries)localStorage.setItem(key,raw)}},[...originalAccount]);
      if(scenario.includes('curated')){
        await page.goto(origin+'/journey/new?inspire=japan-slow');
        if(scenario==='curated-reservation-readback'){
          await page.waitForFunction(()=>sessionStorage.getItem('creation-readback-failed')==='1');
          assert.ok(new URL(page.url()).searchParams.get('creation'),'locator survives unconfirmed reservation');await page.reload();
        }
        await page.locator('[data-builder-edit-session="active"]').waitFor();
      } else {
        await page.goto(origin+'/journey/new/import');await page.getByText('Paste table',{exact:true}).click();
        await page.getByRole('textbox',{name:'Spreadsheet rows'}).fill('Journey origin,Destination,Country,Arrival date,Departure date\nTokyo,Tokyo,Japan,2027-03-02,2027-03-12\nTokyo,Kyoto,Japan,2027-03-12,2027-03-23');
        await page.getByRole('button',{name:'Review pasted table'}).click();await page.getByText('IMPORT READY',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Create trip',exact:true}).click();
        if(scenario==='import-receipt-reload'){
          await page.waitForFunction(()=>sessionStorage.getItem('fixture-receipt-interrupted')==='1');
          await page.reload();await page.getByRole('link',{name:'Continue reviewed trip',exact:true}).click();
          await page.locator('[data-builder-edit-session="active"]').waitFor();
        }else await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
      }
    } else await openHome(page,[['tokyo','Tokyo'],['takayama','Takayama'],['kanazawa','Kanazawa']]);
    if(scenario==='interrupted-checkpoint-reload'){
      const id=new URL(page.url()).searchParams.get('trip')??await page.evaluate(()=>{
        const raw=localStorage.getItem('easyt-private:guest:homepage-input');return raw?JSON.parse(raw).receipt?.tripId:null;
      });
      assert.ok(id);assert.notEqual(await page.evaluate(key=>localStorage.getItem(key),tripReceiptStorageKey(null,id)),null,'reload must complete the exact interrupted receipt before permitting edits');
      t.diagnostic('Native receipt interruption and plain Home reload completed before editor ownership; location re-confirmation is outside this case');
      return;
    }
    if(!scenario.startsWith('signed-in'))await page.evaluate(entries=>{for(const [key,raw]of entries)localStorage.setItem(key,raw);},[...originalAccount]);
    if(scenario==='edited-before-sign-in'){
      await page.getByLabel('Actions for Kanazawa',{exact:true}).click();
      await page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Earlier',exact:true}).last().click();
      await page.getByText('Saved on this device',{exact:true}).first().waitFor();
    }
    if(scenario!=='confirmed-import'&&scenario!=='signed-in-import')await page.getByRole('button',{name:/^Build trip/}).click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
    const id=decodeURIComponent(new URL(page.url()).pathname.split('/')[2]!);
    assert.notEqual(id,old.trip.id);
    if(scenario.startsWith('signed-in')){
      assert.equal(accounts.get(id)?.ownerId,'owner-a','exact account response, not a transient saved=1 label');
      assert.equal(await page.getByText('Device changes need review',{exact:true}).count(),0);
      assert.ok(writes.length>0&&writes.every(value=>value===id));assert.deepEqual(accounts.get(old.trip.id),old.trip);
      const saved=structuredClone(accounts.get(id));assert.ok(saved);await page.reload();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
      assert.equal(new URL(page.url()).pathname.split('/')[2],id);assert.deepEqual(accounts.get(id),saved);assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).trip,tripCacheStorageKey('owner-a',id)),saved,'cold reopen retains the exact acknowledged account body');assert.deepEqual(errors,[]);return;
    }
    if(scenario==='another-guest-intake'){
      const second=await context.newPage();second.setDefaultTimeout(9000);
      await openHome(second,[['kyoto','Kyoto'],['osaka','Osaka']]);
      await second.getByRole('button',{name:/^Build trip/}).click();await second.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
      assert.notEqual(new URL(second.url()).pathname,new URL(page.url()).pathname);
    }
    const expectedStops=await page.evaluate(id=>{const rows=Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:v2:')).map(k=>{try{return JSON.parse(localStorage.getItem(k)!)}catch{return null}}).filter(v=>v?.trip?.id===id);return rows[0]?.trip.stops.map((s:{name:string})=>s.name);},id);assert.ok(expectedStops);
    const before=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
    await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();
    await page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();
    await page.waitForFunction(()=>/Saved to your account|Device changes need review|Device save incomplete/.test(document.body.innerText));
    const refusal=await page.getByText('Device changes need review',{exact:true}).count();
    if(refusal){
      assert.deepEqual(writes,[],'mismatch occurs before any account request');
      assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(before)),before,'refusal preserves original bytes');
    }
    assert.equal(refusal,0,(await page.locator('body').innerText()).slice(-1800));
    assert.equal(await page.getByText('Device save incomplete',{exact:true}).count(),0);
    assert.ok(writes.length>0&&writes.every(value=>value===id));assert.deepEqual(accounts.get(old.trip.id),old.trip);
    assert.deepEqual(accounts.get(id)!.stops.map(s=>s.name),expectedStops);
    const preserved=Object.fromEntries(Object.entries(before).filter(([key])=>key!==currentTripStorageKey('owner-a')&&!key.startsWith('morrovia:workspace-orientation:')));
    assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(preserved)),preserved);
    await page.reload();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
    assert.equal(decodeURIComponent(new URL(page.url()).pathname.split('/')[2]!),id);assert.deepEqual(errors,[]);
    t.diagnostic(JSON.stringify({scenario,nativeIndexedDb:true,realComponents:true,authAndAccount:'controlled',externalRequests:0,originalCopiesPreserved:true}));
  }catch(error){t.diagnostic(JSON.stringify({errors,body:(await page.locator('body').innerText()).slice(-2500)}));throw error;}finally{await browser.close();}
});
