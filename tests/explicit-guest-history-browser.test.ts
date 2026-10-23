import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {saveTripRecoveryToStorage,cacheCanonicalTripToStorage,EASYT_ACTIVE_TRIP_KEY,currentTripStorageKey} from '../lib/easyt/storage.ts';
import {builderInputDraftKey,createBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import type {EasyTTrip} from '../lib/easyt/trip.ts';
import {saveReopenTripFixture,jsonbObjectOrder} from './fixtures/save-reopen-trip.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';

test('existing account history and another trip tab must not block a distinct guest Overview sign-in save',
 {skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
 const old=homeRecoveryFixture('owner-a'),values=new Map([old.native[0]!]);
 const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,
  getItem:(key:string)=>values.get(key)??null,setItem:(key:string,raw:string)=>{values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
 assert.equal(cacheCanonicalTripToStorage(storage,old.trip),true);
 assert.equal(saveTripRecoveryToStorage(storage,{...old.trip,title:'Separate protected account edits'},
  {ownerId:'owner-a',writeId:'existing-account-history',state:'conflict'}).stored,true);
 storage.setItem(builderInputDraftKey('owner-a',old.trip.id),JSON.stringify(createBuilderInputDraft(old.trip)));
 const snapshot=selectedStopsHomepageInput(null,[['tokyo','Tokyo'],['takayama','Takayama'],['kanazawa','Kanazawa']]);
 snapshot.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};
 snapshot.tripType={state:'selected',value:'one_way'};snapshot.dates={state:'selected',value:{start:'2027-03-02',end:'2027-03-23'}};
 const accounts=new Map<string,EasyTTrip>([[old.trip.id,old.trip]]),writes:Array<{id:string;method:string}>=[];
 const h=await renderBuilder({path:'/',storedInput:{snapshot},seedRecovery:false,forceResolver:true,simulatedSignIn:true,offlineOnly:true,
  geocodeCandidates:Object.fromEntries([
   ['Tokyo',[139.6917,35.6895]],['Takayama',[137.2535,36.1458]],['Kanazawa',[136.6562,36.5613]],
  ].map(([name,coordinates])=>[String(name),[{name,country:'Japan',coordinates,canonicalPlaceId:String(name).toLowerCase(),providerId:'history-fixture:'+String(name).toLowerCase(),kind:'city',placeType:'city',routability:'direct_destination',matchQuality:'exact',rankScore:200}]])),
  dashboardTrips:()=>[...accounts.values()],accountRequest:({method,path,trip})=>{
   const submitted=trip as EasyTTrip|undefined,id=method==='POST'?submitted!.id:decodeURIComponent(path.split('/').at(-1)!);
   if(method==='GET')return accounts.has(id)?{status:200,body:{trip:accounts.get(id)}}:{status:404,body:{error:'Trip not found'}};
   assert.equal(submitted!.id,id);writes.push({id,method});
   const canonical=canonicalTripForOwner('owner-a',submitted!);accounts.set(id,canonical);
   return {status:method==='POST'?201:200,body:{trip:canonical,outcome:'promoted'}};
  }});
 const page=h.page;page.setDefaultTimeout(7000);
 try{
  await page.evaluate((entries:Array<[string,string]>)=>{for(const [key,raw] of entries)localStorage.setItem(key,raw);},[...values]);
  const origin=new URL(page.url()).origin;
  // A separate isolated tab holds the older account route. All external
  // requests are blocked; this is not a user-owned browser or real OAuth/SQL.
  const second=await page.context().newPage();
  await second.route('**/*',async(route:any)=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await second.addInitScript(()=>{sessionStorage.setItem('builder-fixture-owner','owner-a');(window as Window&{__BUILDER_TEST_OWNER__?:string}).__BUILDER_TEST_OWNER__='owner-a';});
  await second.goto(origin+'/journey/'+encodeURIComponent(old.trip.id));
  await second.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  await page.getByRole('button',{name:'Plan my trip',exact:true}).click();
  await page.locator('[data-builder-edit-session="active"]').waitFor();
  await page.getByRole('button',{name:/^Build trip/}).click();
  await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  const newId=decodeURIComponent(new URL(page.url()).pathname.split('/')[2]!);assert.notEqual(newId,old.trip.id);
  const before=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])));
  await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();
  await page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();
  await page.waitForFunction(()=>/Saved to your account|Device changes need review/.test(document.body.innerText));
  const refusal=await page.getByText('Device changes need review',{exact:true}).count();
  if(refusal){
   const after=await page.evaluate((keys:string[])=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(before));
   assert.deepEqual(after,before,'refusal must preserve every preexisting guest and account byte');
   assert.deepEqual(writes,[],'history collision occurs before the account request');
  }
  t.diagnostic(JSON.stringify({realReactAndIndexedDb:true,controlledAuth:true,realOAuthOrSql:false,externalRequestsBlocked:true,simultaneousTabs:2,refusal:refusal>0,accountWrites:writes.length,requestedIdentityPreserved:!writes.some(w=>w.id!==newId)}));
  assert.equal(refusal,0,'completed history for a different trip must not refuse the new explicit save');
  assert.equal(await page.getByText('Device save incomplete',{exact:true}).count(),0,'a remote-only workaround must not pass complete-save acceptance');
  const preservedBefore=Object.fromEntries(Object.entries(before).filter(([key])=>key!==currentTripStorageKey('owner-a')&&!key.startsWith('morrovia:workspace-orientation:')));
  const afterSuccess=await page.evaluate((keys:string[])=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(preservedBefore));
  assert.deepEqual(afterSuccess,preservedBefore,'successful promotion must also preserve all original guest/account input; the current-trip navigation pointer may advance');
  assert.ok(accounts.has(newId));assert.deepEqual(accounts.get(old.trip.id),old.trip);
  await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  await second.close();
 }catch(error){t.diagnostic(JSON.stringify({writes}));t.diagnostic((await page.locator('body').innerText()).slice(-5500));throw error;}finally{await h.close();}
});

test('already-signed-in edits preserve unrelated completed account history with another trip tab',
 {skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
 const old=homeRecoveryFixture('owner-a'),values=new Map([old.native[0]!]);
 const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,
  getItem:(key:string)=>values.get(key)??null,setItem:(key:string,raw:string)=>{values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
 assert.equal(cacheCanonicalTripToStorage(storage,old.trip),true);
 assert.equal(saveTripRecoveryToStorage(storage,{...old.trip,title:'Separate protected account edits'},
  {ownerId:'owner-a',writeId:'existing-account-history',state:'conflict'}).stored,true);
 storage.setItem(builderInputDraftKey('owner-a',old.trip.id),JSON.stringify(createBuilderInputDraft(old.trip)));
 const target=saveReopenTripFixture(),accounts=new Map<string,EasyTTrip>([[old.trip.id,old.trip],[target.id,target]]);
 const writes:Array<{id:string;method:string}>=[];let conflicts=0;
 const current=()=>accounts.get(target.id)!;
 const h=await renderBuilder({initialTrip:target,seedRecovery:false,ownerId:'owner-a',forceResolver:true,offlineOnly:true,
  query:'?trip='+encodeURIComponent(target.id),dashboardTrips:()=>[...accounts.values()],
  geocodeCandidates:{'Guatemala City':[{name:'Guatemala City',country:'Guatemala',coordinates:[-90.5069,14.6349],canonicalPlaceId:'guatemala-city',providerId:'history-fixture:guatemala-city',kind:'city',placeType:'city',routability:'direct_destination',matchQuality:'exact',rankScore:200}]},
  accountRequest:({method,path,trip})=>{
   const id=decodeURIComponent(path.split('/').at(-1)!);
   if(method==='GET')return accounts.has(id)?{status:200,body:{trip:jsonbObjectOrder(accounts.get(id))}}:{status:404,body:{error:'Trip not found'}};
   const submitted=trip as EasyTTrip;assert.equal(submitted.id,id);const previous=accounts.get(id);
   if(method!=='POST'&&submitted.updatedAt!==previous?.updatedAt){conflicts++;return {status:409,body:{error:'Synthetic revision conflict',trip:jsonbObjectOrder(previous),conflictReason:'cloud-changed'}};}
   writes.push({id,method});const canonical=canonicalTripForOwner('owner-a',submitted,nextTripUpdatedAt(previous?.updatedAt??submitted.updatedAt));
   accounts.set(id,canonical);return {status:method==='POST'?201:200,body:{trip:jsonbObjectOrder(canonical),outcome:'updated'}};
  }});
 const page=h.page;page.setDefaultTimeout(7000);const milestones:string[]=[];
 const until=async(check:()=>boolean,label:string)=>{for(let i=0;i<120&&!check();i++)await page.waitForTimeout(50);assert.ok(check(),label);};
 const saved=async()=>{await page.getByText('Saved to your account',{exact:true}).first().waitFor();assert.equal(await page.getByText('Another device recovery is protected. Reopen it before editing.',{exact:true}).count(),0);};
 try{
  await page.locator('[data-builder-edit-session="active"]').waitFor();
  await page.evaluate((entries:Array<[string,string]>)=>{for(const [key,raw] of entries)localStorage.setItem(key,raw);},[...values]);
  const origin=new URL(page.url()).origin,second=await page.context().newPage();
  await second.route('**/*',async(route:any)=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await second.addInitScript(()=>{(window as Window&{__BUILDER_TEST_OWNER__?:string}).__BUILDER_TEST_OWNER__='owner-a';});
  await second.goto(origin+'/journey/'+encodeURIComponent(old.trip.id));await second.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  const p=writes.length;await page.getByRole('button',{name:'Add destination',exact:true}).click();await page.getByRole('combobox',{name:'Add a stop',exact:true}).fill('Guatemala City');
  await page.getByRole('option',{name:/^Guatemala City/}).first().click();
  await until(()=>writes.length>p&&current().stops.some(s=>s.name==='Guatemala City'),'same-country city add must reach current account');await saved();milestones.push('city-add-ack');
  const m=writes.length;await page.getByLabel('Actions for David',{exact:true}).click();await page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Earlier',exact:true}).last().click();
  await until(()=>writes.length>m,'reorder must reach current account');await saved();milestones.push('reorder-ack');
  const initialNights=current().stops.find(s=>s.name==='Flores')!.nights!,n=writes.length;
  await page.getByRole('button',{name:/^Add one night to Flores/}).click();
  await until(()=>writes.length>n,'night change must reach current account');await saved();assert.equal(current().stops.find(s=>s.name==='Flores')!.nights,initialNights+1);milestones.push('nights-add-ack');
  const beforeAntigua=current().stops.find(s=>s.name==='Antigua Guatemala')!.nights!,q=writes.length;
  await page.getByRole('button',{name:/^Remove one night from Antigua Guatemala/}).click();
  await until(()=>writes.length>q,'night reallocation must reach current account');await saved();assert.equal(current().stops.find(s=>s.name==='Antigua Guatemala')!.nights,beforeAntigua-1);milestones.push('nights-reallocated-ack');
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();assert.equal(await page.getByText('Another device recovery is protected. Reopen it before editing.',{exact:true}).count(),0);milestones.push('reload');
  const preserved=[...values].filter(([key])=>key!==EASYT_ACTIVE_TRIP_KEY&&key!==currentTripStorageKey('owner-a'));
  const after=await page.evaluate((keys:string[])=>keys.map(key=>[key,localStorage.getItem(key)]),preserved.map(([key])=>key));
  assert.deepEqual(after,preserved,'unrelated account trip, conflict branch, input and completed Home receipt stay exact');
  assert.deepEqual(accounts.get(old.trip.id),old.trip);assert.equal(conflicts,0);assert.ok(writes.every(w=>w.id===target.id));assert.deepEqual(h.errors,[]);
  t.diagnostic(JSON.stringify({realReactAndIndexedDb:true,controlledAuth:true,realOAuthOrSql:false,externalRequestsBlocked:true,simultaneousTabs:2,milestones,accountWrites:writes.length,conflicts}));
 }catch(error){t.diagnostic(JSON.stringify({milestones,writes,conflicts}));t.diagnostic((await page.locator('body').innerText()).slice(-5500));throw error;}finally{await h.close();}
});
