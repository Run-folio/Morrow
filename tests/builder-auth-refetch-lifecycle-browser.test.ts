import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {saveReopenTripFixture} from './fixtures/save-reopen-trip.ts';

const baseline='00adb52f96d20870b145d9efe4efbb8a315d34bb';
const revision=process.env.MORROVIA_AUTH_SOURCE??'candidate';
assert.ok(['deployed','candidate'].includes(revision));
const writeBoundary=process.env.MORROVIA_AUTH_WRITE_BOUNDARY??'after';
assert.ok(['before','after'].includes(writeBoundary));
const retentionFault=process.env.MORROVIA_AUTH_RETENTION_FAULT??'none';
assert.ok(['none','quota','readback'].includes(retentionFault));
if(retentionFault!=='none')assert.ok(revision==='candidate'&&writeBoundary==='before');
const root=fileURLToPath(new URL('../',import.meta.url));
const hashes:Array<{file:string;sha256:string}>=[];
function overrides(){
 hashes.length=0;const result=new Map<string,string>();
 const edit=(file:string,changes:Array<[string,string]>)=>{
  let source=revision==='deployed'?execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'}):readFileSync(root+file,'utf8');
  hashes.push({file,sha256:createHash('sha256').update(source).digest('hex')});
  for(const [from,to] of changes){assert.equal(source.split(from).length,2,'unique observation anchor: '+file+' '+from.slice(0,50));source=source.replace(from,to);}
  result.set(root+file,source);
 };
 edit('app/journey/new/trip-builder.tsx',[
  ['"use client";',`"use client";
   const __authLife=(window as any).__authLife={mounts:0,retires:0,reads:[] as any[],states:[] as any[],snapshot:null as any,phase:'baseline',holdDraft:false,draftHeld:false,draftCompletion:null as any,releaseDraft:null as any};`],
  ['writeDraft: (trip, draft, owner, guard) => writeDurableBuilderInputDraft(trip, draft, owner, guard?.isCurrent, builderInitialOverflowRef.current),',
   `writeDraft: async (trip, draft, owner, guard) => {
     const result=await writeDurableBuilderInputDraft(trip, draft, owner, guard?.isCurrent, builderInitialOverflowRef.current);
     if(__authLife.holdDraft&&${JSON.stringify(writeBoundary)}==='after'){__authLife.holdDraft=false;__authLife.draftHeld=true;await new Promise<void>(resolve=>{__authLife.releaseDraft=resolve;});
       __authLife.draftCompletion={stored:result.ok,current:guard?.isCurrent()??null};}
     if(${JSON.stringify(writeBoundary)}==='before')__authLife.draftCompletion={stored:result.ok,current:guard?.isCurrent()??null};
     return result;
   },`],
  ['builderEditSessionRef.current = mountedBuilder?.session ?? null;',`builderEditSessionRef.current = mountedBuilder?.session ?? null;
   const state={phase:__authLife.phase,pending:sessionPending,authenticated:Boolean(authenticatedOwnerId),owner:activeBrowserOwnerId===null?'guest':activeBrowserOwnerId==='owner-a'?'A':'other',
    hydratedMatches:hydratedOwnerScopeRef.current===activeBrowserOwnerId,entryCurrent:builderEntrySessionRef.current?.isCurrent()??null,seedPresent:Boolean(builderSeed),mounted:Boolean(mountedBuilder)};
   if(JSON.stringify(state)!==JSON.stringify(__authLife.states.at(-1)))__authLife.states.push(state);`],
 ]);
 edit('app/journey/new/use-builder-edit-session.ts',[
  ['session = created;','session = created; (window as any).__authLife.mounts++;'],
  ['const publish = () => { if (isCurrent()) setMounted({ scope, session: created, snapshot: created.getSnapshot() }); };',`const publish = () => { if (isCurrent()) { const s=created.getSnapshot();(window as any).__authLife.snapshot={error:s.error,order:s.trip.stops.map(x=>x.id),inputRevision:s.inputRevision,hasTypedIntent:s.draft.fields.some(f=>f.raw==='  retained unfinished synthetic origin  ')};setMounted({ scope, session: created, snapshot:s }); } };`],
  ['return () => { active = false; unsubscribe?.(); session?.dispose(); };','return () => { (window as any).__authLife.retires++; (window as any).__authLife.retiredHasTypedIntent=session?.getSnapshot().draft.fields.some(f=>f.raw==="  retained unfinished synthetic origin  ")??false; active = false; unsubscribe?.(); session?.dispose(); };'],
 ]);
 edit('lib/easyt/builder-input-persistence.ts',[
  ['const before = await trips.read(trip.id);',`const before = await trips.read(trip.id);
    const p=(window as any).__authLife;
    if(${JSON.stringify(writeBoundary)}==='before'&&p.holdDraft){p.holdDraft=false;p.draftHeld=true;p.prewriteReadKind=before.kind;
      await new Promise<void>(resolve=>{p.releaseDraft=resolve;});}`],
  ['const state=await trips.read(trip.id);',`const state=await trips.read(trip.id);if(!forWrite)(window as any).__authLife.reads.push({phase:(window as any).__authLife.phase,kind:state.kind,reason:'reason' in state?state.reason:null,current:context.isCurrent()});`],
 ]);
 // The second unpublished application file must also come from the selected revision.
 edit('lib/easyt/two-store-trip-persistence.ts',[]);
 result.set('fixture:auth',`import {createAuthClient} from 'better-auth/react';
  const real=createAuthClient();
  export const authClient={...real,useSession(){const value=real.useSession();window.__authRefetch=value.refetch;return value;}};`);
 return result;
}

for(const scenario of retentionFault!=='none'?['owner-switch']:revision==='candidate'?['same-owner','owner-switch']:['same-owner'])
test('auth refetch preserves owner-scoped Builder: '+revision+' / '+scenario+' / '+writeBoundary+' first write / '+retentionFault,{skip:!builderBrowserTestsEnabled,timeout:60000},async t=>{
 const trip=saveReopenTripFixture();
 let authMode:'owner'|'signed-out'|'held'|'other'='owner',release:()=>void=()=>{},heldRequest=false;

 const held=new Promise<void>(resolve=>{release=resolve;});
 let accountWrites=0,authRequests=0;
 const view=await renderBuilder({initialTrip:trip,seedRecovery:false,ownerId:'owner-a',query:'?trip='+trip.id,offlineOnly:true,sourceOverrides:overrides(),
  authSessionRequest:async()=>{authRequests++;if(authMode==='held'){heldRequest=true;await held;}
   return {status:200,body:authMode==='owner'||authMode==='other'?{user:{id:authMode==='other'?'owner-b':'owner-a',name:'Synthetic traveller',email:'fixture@example.invalid'},session:{id:'synthetic-session',userId:authMode==='other'?'owner-b':'owner-a',expiresAt:'2099-01-01T00:00:00.000Z'}}:null};},
  accountRequest:({method})=>{if(method!=='GET')accountWrites++;return authMode==='other'?{status:404,body:{error:'Trip not found'}}:{status:200,body:{trip}};},
 });
 const durableSnapshot=()=>view.page.evaluate(async()=>{
  const native=Object.fromEntries(Object.keys(localStorage).sort().filter(k=>k.includes('trip')||k.includes('builder')).map(k=>[k,localStorage.getItem(k)]));
  const domain:Record<string,unknown>={};
  for(const info of await indexedDB.databases()){
   if(!info.name)continue;
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(info.name!);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   try{for(const store of Array.from(db.objectStoreNames)){domain[info.name+'/'+store]=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}}finally{db.close();}
  }
  return {native,domain};
 });
 try{
  await view.page.route('**/journey/dashboard',(route:any)=>route.fulfill({status:200,contentType:'text/html',body:'<p>Isolated quarantine destination</p>'}));
  await view.page.evaluate(()=>window.addEventListener('beforeunload',()=>sessionStorage.setItem('auth-lifecycle-evidence',JSON.stringify((window as any).__authLife))));
  await view.page.waitForFunction(()=>(window as any).__authLife.mounts===1&&(window as any).__authLife.snapshot?.error===null);
  const beforeInput=await durableSnapshot();
  // Actual UI raw edit establishes a non-empty durable draft without a canonical account mutation.
  await view.page.evaluate(()=>{(window as any).__authLife.holdDraft=true;});
  await view.page.locator('#builder-origin').getByRole('combobox').first().fill('  retained unfinished synthetic origin  ');
  if(writeBoundary==='after')await view.page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.includes('builder-input')&&localStorage.getItem(k)?.includes('retained unfinished synthetic origin')));
  await view.page.waitForFunction(()=>(window as any).__authLife.draftHeld);
  const before=await durableSnapshot(),initialUrl=view.page.url();
  if(writeBoundary==='before'){
   assert.deepEqual(before,beforeInput,'barrier precedes the first draft write; no storage bytes manufactured');
   assert.equal(await view.page.evaluate(()=>(window as any).__authLife.snapshot.hasTypedIntent),true,'actual handler accepted the displayed raw intent in memory');
  }
  if(retentionFault!=='none')await view.page.evaluate((fault:string)=>{
   const set=Storage.prototype.setItem,get=Storage.prototype.getItem,prefix='easyt:interrupted-builder-input:v1:';
   Storage.prototype.setItem=function(key,value){if(fault==='quota'&&key.startsWith(prefix))throw new DOMException('synthetic quota','QuotaExceededError');return set.call(this,key,value);};
   Storage.prototype.getItem=function(key){return fault==='readback'&&key.startsWith(prefix)?null:get.call(this,key);};
   (window as any).__restoreRetentionStorage=()=>{Storage.prototype.setItem=set;Storage.prototype.getItem=get;};
  },retentionFault);
  let intentRecovered:boolean|undefined;
  authMode='signed-out';
  await view.page.evaluate(async()=>{(window as any).__authLife.phase='settled-signout';await (window as any).__authRefetch();});
  await view.page.waitForFunction(()=>(window as any).__authLife.states.some((s:any)=>s.phase==='settled-signout'&&!s.authenticated&&!s.pending&&s.owner==='A'));
  assert.equal(await view.page.evaluate(()=>(window as any).__authLife.mounts),1,'settled sign-out alone retains the mounted owner scope');
  authMode='held';
  await view.page.evaluate(()=>{(window as any).__authLife.phase='pending-refetch';void (window as any).__authRefetch();});
  await view.page.waitForFunction(()=>(window as any).__authLife.retires===1&&(window as any).__authLife.states.some((s:any)=>s.phase==='pending-refetch'&&s.pending&&s.owner==='guest'&&s.entryCurrent===false));
  assert.ok(heldRequest,'real SDK request is pending after React effect cleanup');
  const pendingStored=await durableSnapshot();
  assert.deepEqual(pendingStored.domain,before.domain,'pending auth preserves every existing IndexedDB record');
  for(const key of Object.keys(before.native))assert.equal(pendingStored.native[key],before.native[key],'pending auth preserves existing bytes: '+key);
  const capturedKeys=Object.keys(pendingStored.native).filter(key=>!Object.hasOwn(before.native,key));
  if(retentionFault!=='none'){
   assert.equal(capturedKeys.length,retentionFault==='quota'?0:1,'failed versus uncertain physical write');
   assert.equal(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).count(),0,'pending auth hides A recovery');
   await view.page.evaluate(()=>(window as any).__authLife.releaseDraft());
   await view.page.waitForFunction(()=>(window as any).__authLife.draftCompletion?.current===false);
   authMode='other';release();
   await view.page.waitForFunction(()=>(window as any).__authLife.states.some((s:any)=>s.owner==='other'&&!s.pending));
   assert.equal(view.page.url(),initialUrl,'failed retention must prevent automatic destructive navigation');
   assert.equal(await view.page.getByText('They are not saved. Keep this tab open.',{exact:true}).count(),1);
   assert.equal(await view.page.getByRole('textbox').count(),0,'B has no A inputs or review values');
   assert.equal(await view.page.locator('[data-builder-edit-session="active"]').count(),0);
   const interrupted=await view.page.evaluate(()=>(window as any).__authLife);
   assert.deepEqual(interrupted.draftCompletion,{stored:false,current:false});
   authMode='owner';await view.page.evaluate(async()=>{await (window as any).__authRefetch();});
   await view.page.getByText('Review edit 1',{exact:true}).click();
   assert.equal(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue(),'  retained unfinished synthetic origin  ','original owner retains the memory-only copy');
   assert.equal(await view.page.getByText('They could not be saved. Keep this tab open.',{exact:true}).count(),1);
   await view.page.evaluate(()=>(window as any).__restoreRetentionStorage());
   const physicalBefore=await view.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:interrupted-builder-input:v1:')));
   await view.page.getByRole('button',{name:'Save recovery copy',exact:true}).click();
   await view.page.getByText('Interrupted edits on this device',{exact:true}).waitFor();
   const physicalAfter=await view.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:interrupted-builder-input:v1:')));
   assert.equal(physicalAfter.length,1);if(retentionFault==='readback')assert.deepEqual(physicalAfter,physicalBefore,'retry resolves the same uncertain capture');
   await view.page.reload();await view.page.getByText('Review edit 1',{exact:true}).click();
   assert.equal(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue(),'  retained unfinished synthetic origin  ','explicit successful retry survives fresh page');
   const final=await durableSnapshot();assert.deepEqual(final.domain,before.domain);
   for(const key of Object.keys(before.native)){
    if(key.startsWith('easyt:trip-cache:')){const {cachedAt:unused,...oldRecord}=JSON.parse(before.native[key]!);const {cachedAt:unused2,...newRecord}=JSON.parse(final.native[key]!);assert.deepEqual(newRecord,oldRecord);}
    else assert.equal(final.native[key],before.native[key],'existing record retained');
   }
   assert.equal(accountWrites,0);assert.deepEqual(view.errors,[]);
   t.diagnostic(JSON.stringify({revision,scenario,writeBoundary,retentionFault,hashes,accountWrites,staleCompletion:interrupted.draftCompletion,ownerIsolation:true,explicitRetryReopened:true,existingRecordsPreserved:true}));
   return;
  }

  if(revision==='candidate'){
   assert.equal(capturedKeys.length,1,'one passive interrupted-input capture');
   assert.ok(capturedKeys[0].startsWith('easyt:interrupted-builder-input:v1:'));
   const capture=JSON.parse(pendingStored.native[capturedKeys[0]]!);
   assert.equal(capture.ownerId,'owner-a');assert.equal(capture.tripId,trip.id);
   assert.ok(capture.draft.fields.some((field:any)=>field.raw==='  retained unfinished synthetic origin  '));
  }else assert.equal(capturedKeys.length,0);
  assert.equal(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).count(),0,'pending auth does not display owner A recovery text');
  assert.equal(await view.page.locator('[data-builder-edit-session="active"]').count(),0,'pending auth has no active editor');
  if(scenario==='owner-switch'){
   await view.page.evaluate(()=>(window as any).__authLife.releaseDraft());
   await view.page.waitForFunction(()=>(window as any).__authLife.draftCompletion?.current===false);
  }
  await view.page.evaluate(()=>{(window as any).__authLife.phase='refetch-settled';});
  authMode=scenario==='owner-switch'?'other':'signed-out';release();
  if(revision==='deployed'){
   await view.page.waitForFunction(()=>(window as any).__authLife.mounts===2&&(window as any).__authLife.snapshot?.error?.message==='The input draft could not be read safely.');
  }else if(scenario==='same-owner'){
   await view.page.waitForFunction(()=>(window as any).__authLife.mounts===2&&(window as any).__authLife.snapshot?.error===null);
   await view.page.getByText('Review edit 1',{exact:true}).click();
   intentRecovered=(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue())==='  retained unfinished synthetic origin  ';
   assert.equal(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).getAttribute('readonly'),'');
   assert.equal((await view.page.locator('#builder-origin').getByRole('combobox').first().inputValue())==='  retained unfinished synthetic origin  ',writeBoundary==='after','passive capture never seeds the active editor');
   const current=await view.page.evaluate(()=>JSON.stringify((window as any).__authLife.snapshot));
   await view.page.evaluate(()=>(window as any).__authLife.releaseDraft());
   await view.page.waitForFunction(()=>(window as any).__authLife.draftCompletion?.current===false);
   assert.equal(await view.page.evaluate(()=>JSON.stringify((window as any).__authLife.snapshot)),current,'old completion cannot publish into new session');
  }else{
   await view.page.waitForFunction(()=>location.pathname==='/journey/dashboard'&&document.body.textContent?.includes('Isolated quarantine destination'));
   assert.equal(await view.page.locator('[data-builder-edit-session="active"]').count(),0,'B cannot mount A editor');
  }
  const evidence=await view.page.evaluate(()=>(window as any).__authLife??JSON.parse(sessionStorage.getItem('auth-lifecycle-evidence')!));
  if(revision==='deployed')assert.ok(evidence.reads.some((r:any)=>r.phase==='refetch-settled'&&r.kind==='protected'&&r.reason==='operation-changed'&&r.current===false));
  else assert.ok(!evidence.reads.some((r:any)=>r.kind==='protected'),'retired seeds must never start another input read');
  if(scenario==='same-owner')assert.equal(view.page.url(),initialUrl,'no navigation or query identity change');
  assert.equal(await view.page.getByText('The input draft could not be read safely.',{exact:true}).count(),revision==='deployed'?1:0);
  if(scenario==='owner-switch'&&writeBoundary==='before'){
   assert.ok(!await view.page.locator('body').innerText().then((s:string)=>s.includes('retained unfinished synthetic origin')),'B never displays A raw input');
   authMode='owner';await view.page.goto(initialUrl);
   await view.page.waitForFunction(()=>(window as any).__authLife.mounts===1&&(window as any).__authLife.snapshot?.error===null);
   await view.page.getByText('Review edit 1',{exact:true}).click();
   intentRecovered=(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue())==='  retained unfinished synthetic origin  ';
   assert.equal(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).getAttribute('readonly'),'');
   assert.equal((await view.page.locator('#builder-origin').getByRole('combobox').first().inputValue())==='  retained unfinished synthetic origin  ',false,'passive capture never seeds the active editor');
  }
  if(revision==='candidate'&&scenario==='same-owner'){
   authMode='owner';await view.page.reload();
   await view.page.waitForFunction(()=>(window as any).__authLife.mounts===1&&(window as any).__authLife.snapshot?.error===null);
   await view.page.getByText('Review edit 1',{exact:true}).click();
   assert.equal(await view.page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue(),'  retained unfinished synthetic origin  ','verified copy survives a fresh page lifetime');
  }
  const after=await durableSnapshot();
  assert.deepEqual(after.domain,before.domain,'all IndexedDB records preserved');
  assert.deepEqual(Object.keys(after.native),[...Object.keys(before.native),...capturedKeys].sort(),'only the isolated capture was added');
  const cacheRefreshes:string[]=[];
  for(const key of Object.keys(before.native)){
   if(key.startsWith('easyt:trip-cache:')&&after.native[key]!==before.native[key]){
    const {cachedAt:oldTime,...oldRecord}=JSON.parse(before.native[key]!);const {cachedAt:newTime,...newRecord}=JSON.parse(after.native[key]!);
    assert.equal(typeof oldTime,'string');assert.equal(typeof newTime,'string');
    assert.deepEqual(newRecord,oldRecord,'only clean-cache cachedAt may change on exact-trip hydration');cacheRefreshes.push(key);
   }else assert.equal(after.native[key],before.native[key],'draft/recovery/pointer bytes preserved: '+key);
  }
  if(revision==='candidate')assert.deepEqual(evidence.draftCompletion,{stored:writeBoundary==='after',current:false},'real completed write remains stale after retirement');
  assert.equal(accountWrites,0);assert.deepEqual(view.errors,[]);
  t.diagnostic(JSON.stringify({revision,scenario,writeBoundary,intentRecovered,baseline,hashes,authRequests,accountWrites,evidence,cacheRefreshes,draftsPreserved:true,nativeRecords:Object.keys(before.native).length,domainStores:Object.keys(before.domain).length}));
  if(revision==='candidate'&&(scenario==='same-owner'||writeBoundary==='before'))assert.equal(intentRecovered,true,'typed raw intent must survive the auth interruption and return to its owner');
 }catch(error){t.diagnostic(JSON.stringify(await view.page.evaluate(()=>({life:(window as any).__authLife,labels:Array.from(document.querySelectorAll('textarea')).map(x=>({id:x.id,labels:Array.from(x.labels??[]).map(l=>l.textContent)}))})).catch(()=>({}))));throw error;}finally{release();await view.page.evaluate(()=>(window as any).__authLife?.releaseDraft?.()).catch(()=>{});await view.close();}
});
