import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {renderBuilder} from './helpers/builder-render.ts';
import {selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {currentTripStorageKey} from '../lib/easyt/storage.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {tripBuildDocumentsCanonicalEquivalent} from '../lib/easyt/trip-promotion.ts';
import {accountNormalization,transferResponse,proveSuccessfulContract} from './helpers/successful-transfer-fixture.ts';
import {jsonbObjectOrder} from './fixtures/save-reopen-trip.ts';
const root=new URL('../',import.meta.url).pathname;
const evidence:any={candidate:'9cd6779 + frozen 12-file presentation delta',syntheticOnly:true,externalRequestsBlocked:true,auth:'controlled sessionStorage transitions; not real OAuth/logout UI',milestones:[],requests:[],refusals:[],sources:[],result:'running'};
const overrides=new Map<string,string>();
const file='components/easyt/trip-shell-resolver.tsx';let source=readFileSync(root+file,'utf8');evidence.sources.push({file,sha256:createHash('sha256').update(source).digest('hex')});
const anchor='diagnostic: workspaceRefusalDiagnostic(refusalPhase,error instanceof BrowserRecoveryReadError ? error : null)';assert.equal(source.split(anchor).length,2);
source=source.replace(anchor,'diagnostic: ((packet)=>{((window as any).__sessionRefusals??=[]).push(packet);return packet;})(workspaceRefusalDiagnostic(refusalPhase,error instanceof BrowserRecoveryReadError ? error : null))');overrides.set(root+file,source);
test('completed owner Home survives signout, repeated guest promotion and date reopen in one browser context', {timeout:120000},async()=>{
 evidence.contract=await proveSuccessfulContract();const accounts=new Map<string,any>();let h:any;
 const snapshot=(owner:string|null)=>{const s=selectedStopsHomepageInput(owner,[['tokyo','Tokyo'],['kyoto','Kyoto']]);s.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};s.tripType={state:'selected',value:'return_to_start'};s.dates={state:'selected',value:{start:'2027-11-10',end:'2027-11-24'}};return s;};
 try{
 h=await renderBuilder({path:'/',browserName:process.env.COMPLETED_HOME_BROWSER==='webkit'?'webkit':'chromium',seedRecovery:false,forceResolver:true,simulatedSignIn:true,offlineOnly:true,sourceOverrides:overrides,
  geocodeCandidates:Object.fromEntries([['Tokyo',[139.6917,35.6895]],['Kyoto',[135.7681,35.0116]],['Hiroshima',[132.4553,34.3853]]].map(([name,coordinates])=>[name,[{name,country:'Japan',canonicalPlaceId:String(name).toLowerCase(),providerId:'fixture:'+String(name).toLowerCase(),coordinates,kind:'city',placeType:'city',routability:'direct_destination'}]])),
  transferRequest:async({legs}:any)=>transferResponse(legs),dashboardTrips:()=>[...accounts.values()],
  accountRequest:async({method,path,trip}:any)=>{
   const id=method==='POST'?trip.id:decodeURIComponent(path.split('/').at(-1));const previous=accounts.get(id);
   if(method==='GET'){evidence.requests.push({method,status:previous?200:404});return previous?{status:200,body:{trip:jsonbObjectOrder(await accountNormalization(previous,'GET'))}}:{status:404,body:{error:'not-found'}};}
   const submitted=requireReadableTripDocument(trip);let canonical=await accountNormalization(submitted,method);let outcome=method==='POST'?'promoted':'updated';
   if(previous&&method==='POST'){
    if(!isDeepStrictEqual(jsonbObjectOrder(canonical),jsonbObjectOrder(previous))){evidence.requests.push({method,status:409});return {status:409,body:{trip:previous,outcome:'conflict',conflictReason:'cloud-different'}};}
    canonical=previous;outcome='already-canonical';
   }else if(previous&&submitted.updatedAt!==previous.updatedAt){evidence.requests.push({method,status:409});return {status:409,body:{trip:previous,conflictReason:'cloud-changed'}};}
   accounts.set(id,canonical);const status=method==='POST'?201:200;evidence.requests.push({method,status});return {status,body:{trip:jsonbObjectOrder(canonical),outcome}};
  }});
 const page=h.page;page.setDefaultTimeout(8000);const origin=new URL(page.url()).origin;
 // Optional imagery is outside this save fixture: respond with the supported
 // no-result contract rather than leaving a request alive across navigation.
 await page.addInitScript(()=>{const realFetch=window.fetch.bind(window);window.fetch=(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
   return url.origin===location.origin&&url.pathname==='/api/journey-route-image'&&(!init?.method||init.method==='GET')
     ?Promise.resolve(Response.json({image:null,candidates:[],reason:'no-result',configured:false})):realFetch(input,init);
 };});
 // Seed two independent synthetic pre-existing search forms once, never on navigation.
 await page.evaluate(({accountKey,guestKey,account,guest}:any)=>{localStorage.setItem(accountKey,JSON.stringify({snapshot:account}));localStorage.setItem(guestKey,JSON.stringify({snapshot:guest}));sessionStorage.setItem('builder-fixture-owner','owner-a');},{accountKey:homepageInputStorageKey('owner-a'),guestKey:homepageInputStorageKey(null),account:snapshot('owner-a'),guest:snapshot(null)});
 const readBytes=()=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
 const checkWarning=async(label:string)=>{const warning=await page.getByText('Device changes need review',{exact:true}).count(),incomplete=await page.getByText('Device save incomplete',{exact:true}).count();const packets=await page.evaluate(()=>(window as any).__sessionRefusals??[]);evidence.refusals.push(...packets);evidence.milestones.push({label,warning,incomplete});return {warning,incomplete};};
 const overview=async()=>{await page.getByRole('button',{name:/^Build trip/}).click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();return decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);};
 await page.goto(origin+'/');await page.getByRole('button',{name:'Plan my trip',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();const accountId=await overview();assert.ok(accounts.has(accountId),'account ACK is recorded even if ordinary owned Overview has no sync banner');assert.deepEqual(await checkWarning('signed-in-created-overview'),{warning:0,incomplete:0});
 await page.getByRole('link',{name:'Edit trip brief',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();const beforeWrites=evidence.requests.filter((x:any)=>x.method==='PUT').length;await page.getByRole('button',{name:/Add one night to Tokyo/}).click();await page.waitForFunction(()=>document.body.innerText.includes('Saved to your account'));for(let i=0;i<120&&evidence.requests.filter((x:any)=>x.method==='PUT').length===beforeWrites;i++)await page.waitForTimeout(50);assert.ok(evidence.requests.filter((x:any)=>x.method==='PUT').length>beforeWrites);await page.getByText('Saved to your account',{exact:true}).first().waitFor();evidence.milestones.push('signed-in-trip-created-edited-acknowledged');const accountSaved=structuredClone(accounts.get(accountId));
 const guestIds:string[]=[];
 for(let attempt=0;attempt<2;attempt++){
  await page.evaluate(()=>sessionStorage.removeItem('builder-fixture-owner'));await page.goto(origin+'/');await page.getByRole('button',{name:/^Edit Tokyo/}).waitFor();await page.getByRole('button',{name:/^Edit Kyoto/}).waitFor();evidence.milestones.push({label:'guest-home-retains-search',attempt});
  if(attempt){await page.getByRole('button',{name:/^Edit Kyoto/}).click();await page.getByRole('combobox',{name:'Destination',exact:true}).fill('Hiroshima');await page.getByRole('option',{name:/^Hiroshima/}).first().click();}
  await page.getByRole('button',{name:'Plan my trip',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();const guestId=await overview();assert.notEqual(guestId,accountId);assert.ok(!guestIds.includes(guestId),'changed Home selection must reserve distinct trip');guestIds.push(guestId);
  const before=await readBytes();await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();await page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();await page.waitForFunction(()=>/Saved to your account|Device changes need review|Device save incomplete/.test(document.body.innerText));const observed=await checkWarning('guest-promotion-'+attempt);
  const preserved=Object.keys(before).filter(k=>k!==currentTripStorageKey('owner-a')&&!k.startsWith('morrovia:workspace-orientation:'));const after=await readBytes();for(const key of preserved)assert.equal(after[key],before[key],'pre-existing branch retained: '+key);assert.deepEqual(accounts.get(accountId),accountSaved,'previous account trip unchanged');
  assert.equal(observed.warning,0,'unexpected protected workspace refusal');assert.equal(observed.incomplete,0,'unexpected incomplete device continuation');assert.ok(accounts.has(guestId));await page.goto(origin+'/journey/dashboard');await page.locator('a[href="/journey/'+guestId+'"]').first().click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname.split('/')[2],guestId);assert.deepEqual(await checkWarning('guest-reopen-'+attempt),{warning:0,incomplete:0});
  await page.getByRole('link',{name:'Edit trip brief',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();
  await page.getByRole('button',{name:/Travel dates/}).click();await page.locator('button[data-date="2027-11-11"]').click();await page.locator('button[data-date="2027-11-25"]').click();
  for(let i=0;i<160&&(accounts.get(guestId)?.startDate!=='2027-11-11'||accounts.get(guestId)?.endDate!=='2027-11-25');i++)await page.waitForTimeout(50);
  assert.deepEqual([accounts.get(guestId)?.startDate,accounts.get(guestId)?.endDate],['2027-11-11','2027-11-25']);await page.getByText('Saved to your account',{exact:true}).first().waitFor();
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();await page.getByRole('button',{name:/Travel dates/}).click();
  assert.equal(await page.locator('button[data-date="2027-11-11"]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('button[data-date="2027-11-25"]').getAttribute('aria-selected'),'true');await page.keyboard.press('Escape');evidence.milestones.push('both-dates-saved-reopened-'+attempt);
 }
 assert.deepEqual(h.errors,[]);evidence.result='pass';
 }catch(error){evidence.result='fail';evidence.failure=String(error);if(h){evidence.refusals.push(...await h.page.evaluate(()=>(window as any).__sessionRefusals??[]).catch(()=>[]));evidence.visible=await h.page.locator('body').innerText().catch(()=>null);evidence.errors=h.errors;}throw error;
 }finally{if(h)await h.close();evidence.resourcesClosed=true;if(process.env.COMPLETED_HOME_EVIDENCE)writeFileSync(process.env.COMPLETED_HOME_EVIDENCE,JSON.stringify(evidence,null,2)+'\n');}
});
