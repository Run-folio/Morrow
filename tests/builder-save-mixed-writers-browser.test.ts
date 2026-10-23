import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBuilder, builderBrowserTestsEnabled } from './helpers/builder-render.ts';
import { selectedStopsHomepageInput } from './fixtures/homepage-dual-entry.ts';
import { selectedTransferPlace } from './fixtures/accepted-transfer-place.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { jsonbObjectOrder, saveReopenTripFixture } from './fixtures/save-reopen-trip.ts';
import type { EasyTTrip } from '../lib/easyt/trip.ts';
import {tripRecoveryStorageKey,tripDocumentsCanonicalEquivalent} from '../lib/easyt/storage.ts';

const publicTown={name:'Hirayu Onsen',label:'Hirayu Onsen, Takayama, Gifu, Japan',country:'Japan',region:'Gifu',locality:'Takayama',canonicalPlaceId:'open-world:photon:N:2481035449',providerId:'photon:N:2481035449',coordinates:[137.5536701,36.1914892],kind:'town',placeType:'town',routability:'direct_destination',matchQuality:'exact',rankScore:200};
const scenic=(name:string,type:string,id:string)=>({name,label:name+', Guizhou, China',country:'China',region:'Guizhou',canonicalPlaceId:'open-world:fixture:'+id,providerId:'fixture:'+id,coordinates:[108.7255,27.8904],kind:type,placeType:type,routability:'planning_area',matchQuality:'exact',rankScore:200});

test('a real second-document stale canonical cache preserves rapid Builder inverse edits until ordered ACKs',
 {skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
 let account=saveReopenTripFixture(),writes=0,conflicts=0,release!:()=>void,started!:()=>void;
 const initial=structuredClone(account),held=new Promise<void>(done=>{release=done}),begin=new Promise<void>(done=>{started=done});
 const h=await renderBuilder({initialTrip:initial,seedRecovery:false,ownerId:'owner-a',query:'?trip='+initial.id,forceResolver:true,offlineOnly:true,
  accountRequest:async({method,trip})=>{
   if(method==='GET')return {status:200,body:{trip:jsonbObjectOrder(account)}};
   const submitted=requireReadableTripDocument(trip);if(submitted.updatedAt!==account.updatedAt){conflicts++;return {status:409,body:{trip:jsonbObjectOrder(account),error:'Synthetic conflict',conflictReason:'cloud-changed'}};}
   account=canonicalTripForOwner('owner-a',submitted,nextTripUpdatedAt(account.updatedAt));writes++;if(writes===1){started();await held;}return {status:200,body:{trip:jsonbObjectOrder(account)}};
  }});
 const page=h.page,prefix=tripRecoveryStorageKey('owner-a',initial.id),nights=initial.stops.find(s=>s.name==='Flores')!.nights!;
 try{
  await page.locator('[data-builder-edit-session="active"]').waitFor();
  await page.getByRole('button',{name:/^Add one night to Flores/}).click();await begin;
  await page.getByRole('button',{name:/^Remove one night from Flores/}).click();
  await page.waitForFunction(({prefix,nights}:{prefix:string;nights:number})=>{const raw=Object.keys(localStorage).filter(key=>key.startsWith(prefix+':')).map(key=>localStorage.getItem(key)).filter(Boolean);return raw.length===1&&JSON.parse(raw[0]!).trip.stops.find((s:any)=>s.name==='Flores').nights===nights;},{prefix,nights});
  await page.waitForTimeout(500); // let the owned inverse enter the serialized account queue
  const pendingInverse=await page.evaluate((prefix:string)=>Object.keys(localStorage).filter(key=>key.startsWith(prefix+':')).map(key=>JSON.parse(localStorage.getItem(key)!)),prefix);
  assert.equal(pendingInverse.length,1);assert.deepEqual(pendingInverse[0].trip.stops.map((stop:any)=>[stop.id,stop.nights]),initial.stops.map(stop=>[stop.id,stop.nights]));
  const origin=new URL(page.url()).origin,second=await page.context().newPage();await second.route('**/*',async(route:any)=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await second.addInitScript((trip:EasyTTrip)=>{(window as any).__BUILDER_TEST_OWNER__='owner-a';(window as any).__BUILDER_TEST_CANONICAL_TRIP__=trip;},initial);
  await second.addInitScript((prefix:string)=>{(window as any).__recoveryOperations=[];for(const method of ['setItem','removeItem'] as const){const original=Storage.prototype[method];(Storage.prototype as any)[method]=function(key:string,...args:string[]){if(key.startsWith(prefix+':'))(window as any).__recoveryOperations.push(method);return (original as any).call(this,key,...args);};}},prefix);
  await second.goto(origin+'/journey/'+initial.id);await second.getByRole('region',{name:'Trip overview',exact:true}).waitFor();await second.waitForTimeout(180);
  assert.deepEqual(await second.evaluate(()=>(window as any).__recoveryOperations),[],'the second document has no authority to publish or retire the pending inverse');
  const remaining=await page.evaluate((prefix:string)=>Object.keys(localStorage).filter(key=>key.startsWith(prefix+':')).map(key=>JSON.parse(localStorage.getItem(key)!)),prefix);
  assert.equal(remaining.length,1);assert.equal(tripDocumentsCanonicalEquivalent(remaining[0].trip,pendingInverse[0].trip),true,'owned projection may replace its own handle, but the complete traveller inverse and manual allocation intent must remain');
  await page.getByRole('button',{name:/^Add one night to Flores/}).click();
  await page.waitForFunction(({prefix,nights}:{prefix:string;nights:number})=>Object.keys(localStorage).filter(key=>key.startsWith(prefix+':')).some(key=>JSON.parse(localStorage.getItem(key)!).trip.stops.find((s:any)=>s.name==='Flores').nights===nights+1),{prefix,nights});
  assert.equal(await page.getByText('Another device recovery is protected. Reopen it before editing.',{exact:true}).count(),0);assert.equal(writes,1);
  // The existing Builder keeps one latest pending job while a save is held.
  // The user's third edit explicitly supersedes the still-unsent inverse.
  release();for(let i=0;i<160&&writes<2;i++)await page.waitForTimeout(30);
  await page.getByText('Saved to your account',{exact:true}).first().waitFor();assert.equal(writes,2);assert.equal(conflicts,0);assert.equal(account.stops.find(s=>s.name==='Flores')!.nights,nights+1);
  assert.deepEqual(account.stops.map(s=>s.id),initial.stops.map(s=>s.id));await second.close();
  t.diagnostic(JSON.stringify({realReactAndIndexedDb:true,realDocuments:2,rapidInverseEdits:3,orderedAccountWrites:writes,supersededUnsentInverseCoalesced:true,conflicts,realOAuthOrSql:false}));
 }finally{release?.();await h.close();}
});

test('guest Overview sign-in then real dashboard, Builder and workspace writers preserve sequential edits under strict account CAS',
 {skip:!builderBrowserTestsEnabled,timeout:120000},async t=>{
  const snapshot=selectedStopsHomepageInput(null,[['tokyo','Tokyo'],['kanazawa','Kanazawa'],['takayama','Takayama']]);
  snapshot.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};
  snapshot.tripType={state:'selected',value:'one_way'};snapshot.dates={state:'selected',value:{start:'2027-03-02',end:'2027-03-23'}};
  let account:EasyTTrip|null=null,casConflicts=0;const current=():EasyTTrip=>{assert.ok(account);return account as EasyTTrip;};const writes:Array<{method:string,stops:number}> = [],milestones:string[]=[];
  const h=await renderBuilder({path:'/',storedInput:{snapshot:structuredClone(snapshot)},seedRecovery:false,forceResolver:true,simulatedSignIn:true,offlineOnly:true,
   dashboardTrips:()=>account?[structuredClone(account)]:[],
   geocodeCandidates:{
    Tokyo:[{name:'Tokyo',country:'Japan',canonicalPlaceId:'tokyo',providerId:'fixture:tokyo',coordinates:[139.6917,35.6895],kind:'city',placeType:'city',routability:'direct_destination'}],
    Kanazawa:[{name:'Kanazawa',country:'Japan',canonicalPlaceId:'kanazawa',providerId:'fixture:kanazawa',coordinates:[136.6562,36.5613],kind:'city',placeType:'city',routability:'direct_destination'}],
    Takayama:[{name:'Takayama',country:'Japan',canonicalPlaceId:'takayama',providerId:'fixture:takayama',coordinates:[137.2535,36.1458],kind:'city',placeType:'city',routability:'direct_destination'}],
    Hirayu:[publicTown], 'Hirayu Onsen':[publicTown],
    Fanjingshan:[scenic('Fanjingshan','natural_area','fanjingshan')],
    'Fanjingshan National Nature Reserve':[scenic('Fanjingshan National Nature Reserve','region','fanjingshan-reserve')],
   },nearbyCandidates:[],nearbyStatus:'empty',
   accountRequest:({method,trip})=>{
    if(method==='GET')return account?{status:200,body:{trip:jsonbObjectOrder(account)}}:{status:404,body:{error:'Trip not found'}};
    const submitted=requireReadableTripDocument(trip);
    if(method!=='POST'&&(!account||submitted.updatedAt!==account.updatedAt)){casConflicts++;return {status:409,body:{error:'Synthetic account revision conflict',trip:jsonbObjectOrder(account),conflictReason:'cloud-changed'}};}
    account=requireReadableTripDocument(canonicalTripForOwner('owner-a',account?.status==='planned'&&submitted.status==='draft'?{...submitted,status:'planned'}:submitted,nextTripUpdatedAt(account?.updatedAt??submitted.updatedAt)));
    writes.push({method,stops:account.stops.length});return {status:method==='POST'?201:200,body:{trip:jsonbObjectOrder(account),outcome:method==='POST'?'promoted':'updated'}};
   }});
  const page=h.page;page.setDefaultTimeout(7000);
  const until=async(check:()=>boolean,label:string)=>{for(let i=0;i<120&&!check();i++)await page.waitForTimeout(50);assert.ok(check(),label);};
  const noRefusal=async(label:string)=>{assert.equal(await page.getByText('Another device recovery is protected. Reopen it before editing.',{exact:true}).count(),0,label);assert.equal(casConflicts,0,label);};
  const saved=async()=>{await page.getByText('Saved to your account',{exact:true}).first().waitFor();await noRefusal('account ACK remains current');};
  try{
   await page.getByRole('button',{name:'Plan my trip',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();
   await page.getByRole('button',{name:/^Build trip/}).click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();milestones.push('guest-build-overview');
   await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();await page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();await saved();milestones.push('explicit-sign-in-account-ack');
   assert.ok(account);const tripId=current().id,origin=new URL(page.url()).origin,base=origin+'/journey/'+encodeURIComponent(tripId);
   await page.goto(origin+'/journey/dashboard');await page.getByRole('link',{name:'Continue trip',exact:true}).click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();milestones.push('actual-dashboard-reopen');
   await page.getByRole('link',{name:'Edit trip brief',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();
   const before=current().stops.map(s=>s.name),count=writes.length;
   await page.getByLabel('Actions for Takayama',{exact:true}).click();await page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Earlier',exact:true}).last().click();
   await until(()=>writes.length>count&&current().stops[1]!.name==='Takayama','reorder must receive actual account ACK');await saved();assert.notDeepEqual(current().stops.map(s=>s.name),before);milestones.push('reorder-ack');
   const add=async(query:string,name:string,area=false)=>{
    const n=writes.length;await page.getByRole('button',{name:'Add destination',exact:true}).click();await page.getByRole('combobox',{name:'Add a stop',exact:true}).fill(query);
    await page.getByRole('option',{name:new RegExp('^'+name)}).first().click();
    if(area)await page.getByRole('dialog').waitFor();
    await until(()=>writes.length>n,'add must reach account boundary: '+name);await noRefusal(name);return n;
   };
   await add('Hirayu','Hirayu Onsen');await until(()=>current().stops.some(s=>s.canonicalPlaceId===publicTown.canonicalPlaceId),'selected Hirayu identity reaches account');await saved();milestones.push('city-add-ack');
   await add('Fanjingshan','Fanjingshan',true);await page.getByRole('dialog').getByRole('button',{name:'Finish later',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await saved();milestones.push('scenic-add-defer-ack');
   await add('Fanjingshan National Nature Reserve','Fanjingshan National Nature Reserve',true);await page.getByRole('dialog').getByRole('button',{name:'Close Discovery',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await saved();milestones.push('reserve-add-close-ack');
   const input=structuredClone(requireReadableTripDocument(current()).brief.intent.route.destinations);assert.ok(input.some(i=>i.sourceText==='Fanjingshan'));assert.ok(input.some(i=>i.sourceText==='Fanjingshan National Nature Reserve'));
   await page.goto(base);await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();await page.reload();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
   await page.getByRole('navigation',{name:'Trip workspace'}).getByRole('link',{name:'Itinerary',exact:true}).click();await page.getByRole('navigation',{name:'Trip workspace'}).waitFor();
   await page.goto(base);await page.getByRole('link',{name:'Edit trip brief',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();await noRefusal('after mixed workspace caches');milestones.push('workspace-cache-navigation-builder-reopen');
   const n=writes.length;await page.getByRole('button',{name:/^Add one night to Tokyo/}).click();await until(()=>writes.length>n,'night change receives ACK after reopen');await saved();milestones.push('nights-after-reopen-ack');
   const m=writes.length;await page.getByLabel('Actions for Takayama',{exact:true}).click();await page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Later',exact:true}).last().click();await until(()=>writes.length>m,'second reorder receives ACK');await saved();
   await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();await noRefusal('cold Builder reload');milestones.push('second-reorder-ack-reload');
   assert.ok(current().stops.some(s=>s.canonicalPlaceId===publicTown.canonicalPlaceId));assert.equal(current().stops.some(s=>s.name==='Fanjingshan'||s.name==='Fanjingshan National Nature Reserve'),false,'broad/scenic intent must not leak into overnight stops');assert.deepEqual(h.errors,[]);
   t.diagnostic(JSON.stringify({realReactAndIndexedDb:true,controlledAuth:true,strictSyntheticAccountCas:true,realOAuthOrSql:false,externalRequestsBlocked:true,milestones,accountWrites:writes.length,casConflicts}));
  }catch(error){t.diagnostic(JSON.stringify({milestones,writes,casConflicts,pathname:new URL(page.url()).pathname}));t.diagnostic((await page.locator('body').innerText()).slice(-4500));throw error;}
  finally{await h.close();}
 });

test('lost account response across workspace navigation and explicit recovery reopen preserves the acknowledged edit',
 {skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
  let account=saveReopenTripFixture(),writes=0,conflicts=0,release!:()=>void;
  const responseGate=new Promise<void>(resolve=>{release=resolve;});const milestones:string[]=[];let phase='initial-builder';const requestTrace:Array<{phase:string,method:string,matches:boolean}> = [];
  const h=await renderBuilder({initialTrip:account,seedRecovery:false,ownerId:'owner-a',query:'?trip='+encodeURIComponent(account.id),forceResolver:true,offlineOnly:true,dashboardTrips:()=>[structuredClone(account)],
   accountRequest:async({method,trip})=>{
    if(method==='GET')return {status:200,body:{trip:jsonbObjectOrder(account)}};
    const submitted=requireReadableTripDocument(trip);requestTrace.push({phase,method,matches:submitted.updatedAt===account.updatedAt});if(submitted.updatedAt!==account.updatedAt){conflicts++;return {status:409,body:{error:'Synthetic account revision conflict',trip:jsonbObjectOrder(account),conflictReason:'cloud-changed'}};}
    account=requireReadableTripDocument(canonicalTripForOwner('owner-a',account.status==='planned'&&submitted.status==='draft'?{...submitted,status:'planned'}:submitted,nextTripUpdatedAt(account.updatedAt)));writes++;if(writes===1)await responseGate;return {status:200,body:{trip:jsonbObjectOrder(account)}};
   }});
  const page=h.page;page.setDefaultTimeout(7000);
  const until=async(check:()=>boolean,label:string)=>{for(let i=0;i<120&&!check();i++)await page.waitForTimeout(50);assert.ok(check(),label);};
  try{
   await page.locator('[data-builder-edit-session="active"]').waitFor();const before=account.stops[0]!.nights!;
   await page.getByRole('button',{name:/^Add one night to Flores/}).click();await until(()=>writes===1,'held account response must follow committed edit');assert.equal(account.stops[0]!.nights,before+1);milestones.push('server-commit-response-held');
   const origin=new URL(page.url()).origin,base=origin+'/journey/'+encodeURIComponent(account.id);
   phase='workspace-navigation';await page.goto(base);release();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();await page.getByRole('status').getByText('Saved to your account',{exact:true}).first().waitFor();assert.equal(await page.getByRole('alert').getByText('Cloud copy kept safe',{exact:true}).count(),0);milestones.push('workspace-resolves-committed-account');
   await page.goto(origin+'/journey/dashboard');await page.getByRole('link',{name:'Continue trip',exact:true}).click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
   phase='recovery-reopen';await page.goto(origin+'/journey/new?trip='+encodeURIComponent(account.id)+'&recover=1');await page.locator('[data-builder-edit-session="active"]').waitFor();milestones.push('explicit-recovery-reopen');
   assert.equal(await page.getByText('Another device recovery is protected. Reopen it before editing.',{exact:true}).count(),0);
   phase='night-edit';const n=writes;await page.getByRole('button',{name:/^Add one night to Flores/}).click();await until(()=>writes>n,'next mutation must receive current account ACK');await page.getByText('Saved to your account',{exact:true}).first().waitFor();
   phase='reorder';const m=writes;await page.getByLabel('Actions for David',{exact:true}).click();await page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Earlier',exact:true}).last().click();await until(()=>writes>m,'reorder after recovered ACK must save');
   await page.getByText('Saved to your account',{exact:true}).first().waitFor();await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();assert.equal(conflicts,1,'lost ACK retries one stale CAS which the exact canonical response acknowledges');assert.deepEqual(requestTrace.filter(r=>!r.matches),[{phase:'workspace-navigation',method:'PUT',matches:false}]);assert.equal(account.stops.find(s=>s.name==='Flores')!.nights,before+2);milestones.push('nights-reorder-ack-reload');assert.deepEqual(h.errors,[]);
   t.diagnostic(JSON.stringify({realReactAndIndexedDb:true,controlledAuth:true,strictSyntheticAccountCas:true,realOAuthOrSql:false,externalRequestsBlocked:true,milestones,accountWrites:writes,conflicts}));
  }catch(error){t.diagnostic(JSON.stringify({milestones,writes,conflicts,requestTrace,pathname:new URL(page.url()).pathname}));t.diagnostic((await page.locator('body').innerText()).slice(-4500));throw error;}finally{release();await h.close();}
 });
