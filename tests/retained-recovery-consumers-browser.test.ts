import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {saveReopenTripFixture,jsonbObjectOrder} from './fixtures/save-reopen-trip.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {tripRecoveryStorageKey} from '../lib/easyt/storage.ts';
import {buildSpreadsheetImportProposal,canonicalTripFromSpreadsheetProposal,parseDelimitedText} from '../lib/easyt/spreadsheet-import.ts';
import {philippinesImportCsv} from './fixtures/spreadsheet-import.ts';
import {repairEligibleSpreadsheetV1Trip} from '../lib/easyt/imported-trip-hydration.ts';

test('real shell classification retains equivalent recovery without recursive cache events',
 {skip:!builderBrowserTestsEnabled,timeout:60000},async t=>{
 const trip=saveReopenTripFixture(),h=await renderBuilder({path:'/journey/'+trip.id,initialTrip:trip,shellCanonicalTrip:trip,ownerId:'owner-a',offlineOnly:true,mutationControls:true});
 try{
  await h.page.evaluate(()=>{(window as any).__events=0;window.addEventListener('easyt-trip-storage-change',()=>{(window as any).__events++});});
  await h.page.waitForTimeout(350);
  const events=await h.page.evaluate(()=>(window as any).__events);
  assert.ok(events<=1,'read-only equivalent classification must not continually republish the cache: '+events);
  const retained=await h.page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:')).map(key=>localStorage.getItem(key)));
  assert.ok(retained.some((raw:string|null)=>raw&&JSON.parse(raw).writeId==='browser-fixture'));
  t.diagnostic(JSON.stringify({realProvider:true,retainedRecovery:true,classificationEvents:events,realOAuthOrSql:false}));
 }finally{await h.close();}
});

test('eligible legacy import hydration cannot retry a retained equivalent save automatically',
 {skip:!builderBrowserTestsEnabled,timeout:60000},async()=>{
 const proposal=buildSpreadsheetImportProposal(parseDelimitedText(philippinesImportCsv));
 const source=canonicalTripFromSpreadsheetProposal({id:'synthetic-retained-import',proposal,origin:{name:'Manila',country:'Philippines',canonicalPlaceId:'manila',coordinates:[120.98,14.6]},
  places:proposal.stops.map((stop,index)=>({sourceStopId:stop.id,canonicalPlaceId:'fixture:'+stop.id,name:stop.name,country:'Philippines',coordinates:[120+index,14+index]}))});
 const trip=canonicalTripForOwner('owner-a',{...source,planItems:[],legs:source.legs.map(leg=>({...leg,mode:'road',durationMinutes:165,provider:'Planning estimate',provenance:'planning_estimate',routeMetadata:{source:'morrovia-planner',planningEstimate:true}}))});
 assert.ok(repairEligibleSpreadsheetV1Trip(trip).planItems.length>0,'control must be eligible for automatic legacy repair');let writes=0;
 const h=await renderBuilder({path:'/journey/'+trip.id,initialTrip:trip,shellCanonicalTrip:trip,ownerId:'owner-a',offlineOnly:true,expectSeedAccountSave:true,
  accountRequest:({method})=>{if(method!=='GET')writes++;return {status:200,body:{trip:jsonbObjectOrder(trip)}};}});
 try{await h.page.waitForTimeout(500);assert.equal(writes,0,'automatic repair cannot obtain explicit-mutation retry authority');
  const raw=await h.page.evaluate((key:string)=>localStorage.getItem(key),tripRecoveryStorageKey('owner-a',trip.id,'browser-fixture'));assert.ok(raw);assert.equal(JSON.parse(raw).trip.planItems.length,0);
 }finally{await h.close();}
});

for(const race of ['new-handle','changed-handle-body','owner-cycle','response-failure','competing-account'] as const)
test(`retained preflight ${race} preserves branches and never applies a stale new edit`,
 {skip:!builderBrowserTestsEnabled,timeout:60000},async t=>{
 let account=saveReopenTripFixture(),requests=0,release!:()=>void,started!:()=>void;
 const held=new Promise<void>(done=>{release=done}),begin=new Promise<void>(done=>{started=done}),initial=structuredClone(account);
 const key=tripRecoveryStorageKey('owner-a',account.id,'browser-fixture');
 const h=await renderBuilder({path:'/journey/'+account.id,initialTrip:account,shellCanonicalTrip:account,ownerId:'owner-a',offlineOnly:true,mutationControls:true,mutationOnly:race==='owner-cycle',
  accountRequest:async({method,trip})=>{
   if(method==='GET')return {status:200,body:{trip:jsonbObjectOrder(account)}};
   requests++;const submitted=requireReadableTripDocument(trip);started();await held;
   if(race==='response-failure')return {status:503,body:{error:'Synthetic response unavailable'}};
   if(submitted.updatedAt!==account.updatedAt)return {status:409,body:{trip:jsonbObjectOrder(account),error:'Synthetic conflict',conflictReason:'cloud-changed'}};
   account=canonicalTripForOwner('owner-a',submitted,nextTripUpdatedAt(account.updatedAt));return {status:200,body:{trip:jsonbObjectOrder(account)}};
  }});
 try{
  await h.page.waitForTimeout(100);assert.equal(requests,0);
  const original=await h.page.evaluate((key:string)=>localStorage.getItem(key),key);assert.ok(original);
  await h.page.getByRole('button',{name:'Apply synthetic title edit',exact:true}).click();await begin;
  if(race==='owner-cycle'){
   for(const owner of ['owner-b','owner-a']){await h.page.evaluate((owner:string)=>{(window as any).__BUILDER_TEST_OWNER__=owner;window.dispatchEvent(new Event('builder-test-owner'));},owner);await h.page.waitForTimeout(80);}
  }else if(race==='competing-account')account={...account,title:'Other account document',updatedAt:nextTripUpdatedAt(account.updatedAt)};
  else if(race==='new-handle'||race==='changed-handle-body'){
   const other=await h.page.context().newPage();await other.route('**/*',async(route:any)=>new URL(route.request().url()).origin===new URL(h.page.url()).origin?route.continue():route.abort());
   // A separate real document changes only the synthetic retained branch.
   await other.goto(new URL(h.page.url()).origin+'/journey/login?next=/');
   await other.evaluate(({key,race}:{key:string;race:string})=>{const record=JSON.parse(localStorage.getItem(key)!);record.trip.title='Protected concurrent document';
    const target=race==='new-handle'?key.replace(/browser-fixture$/,'concurrent-document'):key;
    if(race==='new-handle')record.writeId='concurrent-document';localStorage.setItem(target,JSON.stringify(record));},{key,race});
   await other.close();
  }
  release();await h.page.waitForTimeout(500);
  assert.equal(requests,1,'no new edit may be submitted after a failed/stale preflight');
  assert.notEqual(account.title,initial.title+' edited');
  const retained=await h.page.evaluate((prefix:string)=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith(prefix)).map(key=>[key,localStorage.getItem(key)])),tripRecoveryStorageKey('owner-a',initial.id));
  if(race==='new-handle'){assert.equal(retained[key],original);assert.ok(Object.values(retained).some((raw:any)=>JSON.parse(raw).trip.title==='Protected concurrent document'));}
  else if(race==='changed-handle-body')assert.equal(JSON.parse(retained[key]).trip.title,'Protected concurrent document');
  else assert.equal(retained[key],original,'unacknowledged source must remain exact');
  assert.equal(await h.page.locator('[data-save-state="saved"]').count(),0,'no stale success status');
  if(race==='owner-cycle')assert.equal(await h.page.locator('[data-save-state="saving"]').count(),0,'the new owner generation cannot retain an abandoned saving label');
  t.diagnostic(JSON.stringify({race,realDocuments:race==='new-handle'||race==='changed-handle-body'?2:1,requests,branches:Object.keys(retained).length,realOAuthOrSql:false}));
 }finally{release?.();await h.close();}
});

for(const action of ['no-op','external-ack'] as const)test(`retained ${action} continuation settles truthful state and permits the next edit`,
 {skip:!builderBrowserTestsEnabled,timeout:60000},async()=>{
 let account=saveReopenTripFixture(),writes=0;
 const h=await renderBuilder({path:'/journey/'+account.id,initialTrip:account,shellCanonicalTrip:account,ownerId:'owner-a',offlineOnly:true,mutationControls:true,mutationOnly:true,
  accountRequest:({method,trip})=>{
   if(method==='GET')return {status:200,body:{trip:jsonbObjectOrder(account)}};
   const submitted=requireReadableTripDocument(trip);assert.equal(submitted.updatedAt,account.updatedAt);writes++;
   account=canonicalTripForOwner('owner-a',submitted,nextTripUpdatedAt(account.updatedAt));return {status:200,body:{trip:jsonbObjectOrder(account)}};
  }});
 try{
  await h.page.waitForTimeout(80);assert.equal(writes,0);
  await h.page.getByRole('button',{name:action==='no-op'?'No-op synthetic edit':'Acknowledge via separate fixture path',exact:true}).click();
  await h.page.locator('[data-save-state="saved"]').waitFor({timeout:7000});assert.equal(writes,1);
  await h.page.getByRole('button',{name:'Apply synthetic title edit',exact:true}).click();
  for(let i=0;i<80&&writes<2;i++)await h.page.waitForTimeout(25);
  await h.page.locator('[data-save-state="saved"]').waitFor({timeout:7000});assert.equal(writes,2,'settled canonical adoption must not retry the obsolete retained source');
  assert.equal(account.title,saveReopenTripFixture().title+' edited');assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('explicit workspace edit obtains an exact retained-recovery account ACK before saving the new content',
 {skip:!builderBrowserTestsEnabled,timeout:60000},async t=>{
 let account=saveReopenTripFixture(),writes:Array<{title:string;revision:string}>=[],conflicts=0;
 const initial=structuredClone(account),h=await renderBuilder({path:'/journey/'+account.id,initialTrip:account,shellCanonicalTrip:account,ownerId:'owner-a',offlineOnly:true,mutationControls:true,
  accountRequest:({method,trip})=>{
   if(method==='GET')return {status:200,body:{trip:jsonbObjectOrder(account)}};
   const submitted=requireReadableTripDocument(trip);
   if(submitted.updatedAt!==account.updatedAt){conflicts++;return {status:409,body:{trip:jsonbObjectOrder(account),error:'Synthetic conflict',conflictReason:'cloud-changed'}};}
   writes.push({title:submitted.title,revision:submitted.updatedAt});account=canonicalTripForOwner('owner-a',submitted,nextTripUpdatedAt(account.updatedAt));
   return {status:200,body:{trip:jsonbObjectOrder(account)}};
  }});
 try{
  await h.page.waitForTimeout(150);assert.equal(writes.length,0,'hydration/classification may not resubmit a recovery');
  await h.page.getByRole('button',{name:'Apply synthetic title edit',exact:true}).click();
  await h.page.locator('[data-save-state="saved"]').waitFor({timeout:7000});
  assert.equal(writes.length,2,'one exact retained submission ACK, then the explicit edit');
  assert.equal(writes[0].title,initial.title);assert.equal(writes[1].title,initial.title+' edited');
  assert.notEqual(writes[0].revision,writes[1].revision);assert.equal(conflicts,0);
  assert.deepEqual(account.stops,JSON.parse(JSON.stringify(initial.stops)));assert.deepEqual(account.planItems,JSON.parse(JSON.stringify(initial.planItems)));assert.equal(account.title,initial.title+' edited');
  const retained=await h.page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:')));
  assert.deepEqual(retained,[],'only exact acknowledged writes may retire');assert.deepEqual(h.errors,[]);
  t.diagnostic(JSON.stringify({realProvider:true,explicitContinuation:true,accountWrites:writes.length,conflicts,realOAuthOrSql:false}));
 }catch(error){t.diagnostic(JSON.stringify({writes,conflicts}));t.diagnostic((await h.page.locator('body').innerText()).slice(-1800));throw error;}
 finally{await h.close();}
});
