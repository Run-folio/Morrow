import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {accountNormalization,transferResponse,proveSuccessfulContract} from './helpers/successful-transfer-fixture.ts';
const deployed='00adb52f96d20870b145d9efe4efbb8a315d34bb';
const sourceRevision=process.env.MORROVIA_REORDER_SOURCE??'candidate',surface='table-drag';
assert.ok(['deployed','candidate'].includes(sourceRevision));assert.ok(['menu','table-drag'].includes(surface));
const sourceEvidence:any[]=[];
const root=fileURLToPath(new URL('../',import.meta.url));
function sourceText(file:string){const path=root+file;const text=sourceRevision==='deployed'?execFileSync('git',['show',deployed+':'+file],{cwd:root,encoding:'utf8'}):readFileSync(path,'utf8');sourceEvidence.push({file,sha256:createHash('sha256').update(text).digest('hex')});return text;}

import {fileURLToPath} from 'node:url';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {jsonbObjectOrder} from './fixtures/save-reopen-trip.ts';
import type {EasyTTrip} from '../lib/easyt/trip.ts';

// Observation seams plus one completion barrier at an existing native paired-write
// asynchronous read. Real storage, guards, scheduler and UI handlers remain intact.
function sources(){
 const overrides=new Map<string,string>();
 const edit=(file:string,changes:Array<[string,string]>)=>{
  const path=fileURLToPath(new URL('../'+file,import.meta.url));let source=sourceText(file);
  for(const [from,to] of changes){assert.equal(source.split(from).length,2,'unique anchor '+file+': '+from.slice(0,70));source=source.replace(from,to);}
  overrides.set(path,source);
 };
 edit('app/journey/new/trip-builder.tsx',[
  ['"use client";',`"use client";
  const __rapid = (window as any).__rapidReorder = {
    trace:[] as any[], snapshots:[] as any[], current:null as any, active:null as any,
    mounts:0,retires:0, orderSequences:[] as number[], handles:new Map<string,number>(),
    handle(h:any){if(!h?.writeId)return null;const key=JSON.stringify([h.ownerId,h.tripId,h.writeId]);if(!this.handles.has(key))this.handles.set(key,this.handles.size+1);return this.handles.get(key);},
    shape(trip:any){return {stops:trip.stops.map((s:any)=>s.id),ordered:[...trip.brief.intent!.route!.orderedStopIds],
      intents:trip.brief.intent.route.destinations.map((d:any)=>({id:d.id,kind:d.kind,resolution:d.resolution,stopIds:[...d.stopIds]}))};},
    snapshot(s:any){const next={...this.shape(s.trip),acceptedRevision:s.acceptedRevision,inputRevision:s.inputRevision,
      saveState:s.saveState,canonicalSaveState:s.canonicalSaveState,error:s.error?.category??null};
      if(JSON.stringify(next)!==JSON.stringify(this.current))this.snapshots.push(next);this.current=next;}
  };`],
  ['const result=await acknowledgeTripBuildSave(reviewed,canonical,handle,{isCurrent:guard?.isCurrent??(()=>builderMountedRef.current&&activeBrowserOwnerIdRef.current===handle.ownerId)});',
   `const p=(window as any).__rapidReorder;
    p.trace.push({kind:'ack-start',handle:p.handle(handle),canonical:p.shape(canonical)});
    const result=await acknowledgeTripBuildSave(reviewed,canonical,handle,{isCurrent:guard?.isCurrent??(()=>builderMountedRef.current&&activeBrowserOwnerIdRef.current===handle.ownerId)});
    p.trace.push({kind:'ack-result',handle:p.handle(handle),outcome:result.outcome});`],
 ]);
 edit('app/journey/new/use-builder-edit-session.ts',[
  ['session = created;', 'session = created; (window as any).__rapidReorder.mounts++;'],
  ['const publish = () => { if (isCurrent()) setMounted({ scope, session: created, snapshot: created.getSnapshot() }); };',
   'const publish = () => { if (isCurrent()) { (window as any).__rapidReorder.snapshot(created.getSnapshot()); setMounted({ scope, session: created, snapshot: created.getSnapshot() }); } };'],
  ['return () => { active = false; unsubscribe?.(); session?.dispose(); };',
   'return () => { (window as any).__rapidReorder.retires++; active = false; unsubscribe?.(); session?.dispose(); };'],
 ]);
 edit('lib/easyt/trip-builder-async-edit-session.ts',[
  ["if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };\n    // A preceding projection", `const p=(window as any).__rapidReorder;
    if(edits.some(edit=>edit.kind==='order')){p.orderSequences.push(command.sequence);p.trace.push({kind:'order-issued',command:p.orderSequences.length===1?'A':p.orderSequences.length===2?'B':'unexpected',proposed:edits.filter(e=>e.kind==='order').map(e=>e.stopIds),sequence:command.sequence,expectedInputRevision,inputRevision,devicePending,accountInFlight:Boolean(inFlight)});}
    if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };
    // A preceding projection`],
  ['try { result = await options.saveRecovery(frozen, metadata); }', `try {
      const p=(window as any).__rapidReorder;
      const commandIndex=p.orderSequences.indexOf(continuation?.command?.sequence);
      const origin=continuation?.projectionOnly?'projection':commandIndex===0?'A':commandIndex===1?'B':'authored-other';
      p.active={origin,sequence:continuation?.command?.sequence};
      p.trace.push({kind:'write-start',...p.active,predecessor:p.handle(metadata.replace),acceptedRevision,inputRevision,shape:p.shape(frozen)});
      result = await options.saveRecovery(frozen, metadata);
      p.trace.push({kind:'write-result',...p.active,handle:p.handle(result.handle),stored:result.stored,blocked:result.blockedByExistingRecovery,
        projectionDeferred:result.projectionDeferred,writeAttempted:result.writeAttempted,readback:result.readbackConfirmed,pointer:result.pointerAcknowledged,
        failureReason:result.failureReason,failureBoundary:result.failureBoundary});p.active=null;
    }`],
  ["if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected',", `if(scopeMatches&&result.blockedByExistingRecovery)(window as any).__rapidReorder.trace.push({kind:'protected-branch',projection:Boolean(continuation?.projectionOnly),sequence:continuation?.command?.sequence,acceptedRevision,inputRevision,scopeMatches});
        if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected',`],
  ["if (command.disposition === 'issued') command.disposition = !result.ok && result.reason === 'stale-source' ? 'retired' : 'refused';", `if (command.disposition === 'issued') command.disposition = !result.ok && result.reason === 'stale-source' ? 'retired' : 'refused';
      const p=(window as any).__rapidReorder;
      if(p.orderSequences.includes(command.sequence))p.trace.push({kind:'order-finished',sequence:command.sequence,disposition:command.disposition,ok:result.ok,reason:result.ok?null:result.reason});`],
 ]);
 edit('lib/easyt/persistence-outcome.ts',[
  ['export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) {',
   `export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) {
    const p=(window as any).__rapidReorder;p?.trace.push({kind:'lower-refusal',...p.active,check,writeAttempted,readReason});`],
 ]);
 edit('lib/easyt/two-store-trip-persistence.ts',[
  ['const ready=await domain.read(tripId);',`const ready=await domain.read(tripId);
   const p=(window as any).__rapidReorder;
   if(p?.deviceBarrier?.armed&&p.active?.origin==='A'){
    const b=p.deviceBarrier;b.armed=false;b.entered=true;
    p.trace.push({kind:'native-paired-completion-held',sequence:p.active.sequence,predecessor:p.handle(options.replace),
      handle:p.handle(nativeResult.handle),bodyStored:nativeResult.stored,readKind:ready.kind,
      candidate:p.shape(trip),accepted:p.current});
    await new Promise<void>(resolve=>{b.release=resolve;});
    p.trace.push({kind:'native-paired-completion-released',sequence:p.active?.sequence,accepted:p.current});
   }`],
 ]);
 return overrides;
}
const city=(id:string,name:string,country:string,coordinates:number[])=>({name,country,canonicalPlaceId:id,providerId:'fixture:'+id,coordinates,kind:'city',placeType:'city',routability:'direct_destination'});
const andorra={...city('fixture:andorra','Andorra la Vella','Andorra',[1.5218,42.5063]),label:'Andorra la Vella, Andorra',matchQuality:'exact',rankScore:200};

test('second drag while first paired device completion is pending: '+sourceRevision+' / '+surface,
 {skip:!builderBrowserTestsEnabled,timeout:120000},async t=>{
 const contract=await proveSuccessfulContract();
 const transfers:any[]=[];
 const snapshot=selectedStopsHomepageInput(null,[['paris','Paris'],['madrid','Madrid'],['barcelona','Barcelona']]);
 snapshot.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};
 snapshot.tripType={state:'selected',value:'return_to_start'};
 snapshot.dates={state:'selected',value:{start:'2027-11-10',end:'2027-11-24'}};
 let account:EasyTTrip|null=null,conflicts=0;
 const writes:any[]=[],checkpoints:any[]=[],milestones:string[]=[];
 const current=():EasyTTrip=>{assert.ok(account);return account;};
 const accountShape=(trip:EasyTTrip)=>({stops:trip.stops.map(s=>s.id),ordered:[...trip.brief.intent!.route!.orderedStopIds]});
 const h=await renderBuilder({path:'/',storedInput:{snapshot},seedRecovery:false,forceResolver:true,simulatedSignIn:true,offlineOnly:true,sourceOverrides:sources(),
  geocodeCandidates:{Paris:[city('paris','Paris','France',[2.3522,48.8566])],Madrid:[city('madrid','Madrid','Spain',[-3.7038,40.4168])],Barcelona:[city('barcelona','Barcelona','Spain',[2.1734,41.3851])],Andorra:[andorra],'Andorra la Vella':[andorra]},
  transferRequest:async({legs})=>{const result=await transferResponse(legs);assert.equal(result.status,200);const body=result.body;
   transfers.push({legs:legs.length,completed:body.assessments.filter((a:any)=>a.state.retrieval==='completed').length,
    states:body.assessments.map((a:any)=>a.state.retrieval),changed:body.legs.filter((l:any,i:number)=>JSON.stringify(l)!==JSON.stringify(legs[i])).length});return result;},
  accountRequest:async({method,trip})=>{
   if(method==='GET')return account?{status:200,body:{trip:jsonbObjectOrder(await accountNormalization(account,'GET'))}}:{status:404,body:{error:'Trip not found'}};
   const submitted=requireReadableTripDocument(trip);
   const revisionMatches=method==='POST'?account===null:Boolean(account&&submitted.updatedAt===account.updatedAt);
   if(!revisionMatches){conflicts++;return {status:409,body:{error:'Synthetic revision conflict',trip:account?jsonbObjectOrder(account):null,conflictReason:'cloud-changed'}};}
   const normalized=await accountNormalization(submitted,method as 'POST'|'PUT');
   account=account?.status==='planned'&&normalized.status==='draft'?{...normalized,status:'planned'}:normalized;
   const response={status:method==='POST'?201:200,body:{trip:jsonbObjectOrder(account),outcome:method==='POST'?'promoted':'updated'}};
   const record={method,revisionMatches,revisionAlias:writes.length+1,shape:accountShape(account),normalizedLegChanges:account.legs.filter((leg,i)=>JSON.stringify(leg)!==JSON.stringify(submitted.legs[i])).length,responseReleased:false};writes.push(record);
   record.responseReleased=true;return response;
  },
 });
 const page=h.page;page.setDefaultTimeout(8000);
 const until=async(check:()=>boolean,label:string)=>{for(let i=0;i<160&&!check();i++)await page.waitForTimeout(50);assert.ok(check(),label);};
 const saved=async()=>{await page.getByText('Saved to your account',{exact:true}).first().waitFor();assert.equal(conflicts,0);};
 const evidence=()=>page.evaluate(()=>{const p=(window as any).__rapidReorder;return {trace:p.trace,snapshots:p.snapshots,current:p.current,mounts:p.mounts,retires:p.retires};});
 const checkpoint=async(label:string,expected:string[])=>{
  // Read DOM after the canonical render has caught up, but never require an ACK
  // that is still intentionally held. Actual IDs stay local to this fixture.
  await page.waitForFunction((ids:string[])=>JSON.stringify([...document.querySelectorAll('[data-builder-route-workspace] [data-builder-stop-id]')].map(n=>n.getAttribute('data-builder-stop-id')))===JSON.stringify(ids),expected);
  const state=await page.evaluate(()=>{
   const p=(window as any).__rapidReorder,s=p.current;
   const top=[...document.querySelectorAll('[data-builder-top-controls] [data-destination-intent-id]')].map(n=>n.getAttribute('data-destination-intent-id'));
   const table=[...document.querySelectorAll('[data-builder-route-workspace] [data-builder-stop-id]')].map(n=>n.getAttribute('data-builder-stop-id'));
   const eligible=s.intents.length===s.ordered.length&&s.intents.every((i:any)=>i.kind==='overnight_place'&&i.resolution==='resolved'&&i.stopIds.length===1)
     &&new Set(s.intents.map((i:any)=>i.stopIds[0])).size===s.ordered.length&&s.intents.every((i:any)=>s.ordered.includes(i.stopIds[0]));
   return {top:top.map(id=>s.intents.find((i:any)=>i.id===id)?.stopIds[0]),table,eligible,snapshot:s};
  });
  checkpoints.push({label,...state,account:accountShape(current())});
  assert.equal(state.eligible,true,label+': require one-to-one top display');
  for(const order of [state.top,state.table,state.snapshot.stops,state.snapshot.ordered])assert.deepEqual(order,expected,label+': representations remain coherent');
 };
 const move=async(name:string,direction:'Earlier'|'Later')=>{
  if(surface==='table-drag'){
   const from=name==='Andorra la Vella'?3:1,to=2;
   await page.evaluate(({from,to}:{from:number;to:number})=>{
    const source=document.querySelector(`[data-builder-stop-index="${from}"] button[draggable="true"]`),target=document.querySelector(`[data-builder-stop-index="${to}"]`);
    if(!source||!target)throw Error('Missing actual route drag surface');const dataTransfer=new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer}));
    for(const type of ['dragenter','dragover','drop'])target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer}));
    source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
   },{from,to});return;
  }
  await page.getByLabel('Actions for '+name,{exact:true}).click();
  await page.getByLabel('Actions for '+name,{exact:true}).locator('..').getByRole('button',{name:direction,exact:true}).click();
 };
 try{
  await page.getByRole('button',{name:'Plan my trip',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();
  await page.getByRole('button',{name:/^Build trip/}).click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();await page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();await saved();
  await page.getByRole('link',{name:'Edit trip brief',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();
  const beforeAdd=writes.length;await page.getByRole('button',{name:'Add destination',exact:true}).click();await page.getByRole('combobox',{name:'Add a stop',exact:true}).fill('Andorra');await page.getByRole('option',{name:/^Andorra la Vella/}).first().click();
  await page.getByRole('group',{name:'Review destination',exact:true}).getByRole('button',{name:'Add Andorra la Vella',exact:true}).click();
  await until(()=>writes.length>beforeAdd&&current().stops.some(s=>s.name==='Andorra la Vella'),'added stop account baseline');await saved();milestones.push('promoted-and-add-ack');
  const initial=current().stops.map(s=>s.id);assert.deepEqual(current().stops.map(s=>s.name),['Paris','Madrid','Barcelona','Andorra la Vella']);
  const a=[initial[0],initial[1],initial[3],initial[2]],b=[initial[0],initial[2],initial[1],initial[3]];
  await checkpoint('baseline',initial);
  await page.evaluate(()=>{const p=(window as any).__rapidReorder;p.trace=[];p.snapshots=[];p.orderSequences=[];});
  const lifecycle=await evidence(),baselineWriteCount=writes.length;
  await page.evaluate(()=>{(window as any).__rapidReorder.deviceBarrier={armed:true,entered:false,release:null};});
  await move('Andorra la Vella','Earlier');
  await page.waitForFunction(()=>(window as any).__rapidReorder.deviceBarrier.entered);
  await checkpoint('A-device-completion-held',initial);
  const held=await evidence(),heldWrite=held.trace.find((e:any)=>e.kind==='native-paired-completion-held');
  assert.equal(heldWrite?.bodyStored,true);assert.equal(heldWrite?.readKind,'ready');
  assert.deepEqual(heldWrite.candidate.stops,a);assert.equal(writes.length,baselineWriteCount);
  assert.equal(held.trace.some((e:any)=>e.kind==='order-finished'),false);
  milestones.push('A-native-body-written-paired-completion-pending');
  // B is built from the actually displayed original order: A has not yet been
  // accepted. Do not feed B a speculative A order or bypass the DOM handler.
  await move('Madrid','Later');
  await page.waitForFunction(()=>{const p=(window as any).__rapidReorder;return p.trace.some((e:any)=>e.kind==='order-issued'&&e.command==='B');});
  const overlapping=await evidence(),issuedB=overlapping.trace.find((e:any)=>e.kind==='order-issued'&&e.command==='B');
  assert.equal(issuedB.devicePending,1,'B must enter during the real unfinished device operation');
  assert.equal(issuedB.accountInFlight,false);assert.deepEqual(issuedB.proposed,[b]);
  assert.equal(overlapping.trace.some((e:any)=>e.kind==='order-finished'),false);
  assert.equal(overlapping.trace.some((e:any)=>e.kind==='write-start'&&e.origin==='B'),false,'B must wait before a storage write');
  await checkpoint('B-issued-awaiting-A-device-completion',initial);
  milestones.push('B-issued-with-devicePending-1');
  await page.evaluate(()=>(window as any).__rapidReorder.deviceBarrier.release());
  await page.waitForFunction(()=>{const p=(window as any).__rapidReorder;return p.trace.filter((e:any)=>e.kind==='order-finished').length===2;});
  const after=await evidence(),issuedA=after.trace.find((e:any)=>e.kind==='order-issued'&&e.command==='A');
  const finishA=after.trace.find((e:any)=>e.kind==='order-finished'&&e.sequence===issuedA.sequence),finishB=after.trace.find((e:any)=>e.kind==='order-finished'&&e.sequence===issuedB.sequence);
  assert.equal(finishA.ok,true);assert.equal(finishB.ok,false);assert.equal(finishB.reason,'stale-source');assert.equal(finishB.disposition,'retired');
  assert.equal(after.trace.some((e:any)=>e.kind==='write-start'&&e.origin==='B'),false);
  await checkpoint('A-accepted-B-retired',a);milestones.push('B-retired-before-write-on-input-revision-change');
  await page.waitForFunction(()=>{const p=(window as any).__rapidReorder;return p.current.saveState==='cloud'&&p.trace.some((e:any)=>e.kind==='ack-result'&&e.outcome==='acknowledged');});
  await checkpoint('A-account-acknowledged',a);assert.deepEqual(accountShape(current()),{stops:a,ordered:a});
  const final=await evidence();assert.equal(final.mounts,lifecycle.mounts);assert.equal(final.retires,lifecycle.retires);
  assert.equal(final.trace.filter((e:any)=>e.kind==='order-issued').length,2);
  assert.equal(final.trace.some((e:any)=>e.kind==='protected-branch'||e.kind==='lower-refusal'),false);
  const visibleFeedback={protected:await page.getByText('Another device recovery is protected. Reopen it before editing.',{exact:true}).count(),
    stale:await page.getByText('The trip changed while this edit was being checked. Review the latest trip and try again.',{exact:true}).count()};
  assert.equal(visibleFeedback.protected,0);
  assert.equal(conflicts,0);assert.deepEqual(h.errors,[]);milestones.push('A-ack-all-orders-match');
  assert.ok(transfers.some(x=>x.completed>0&&x.changed>0),'actual successful assessment changed a leg');
  t.diagnostic(JSON.stringify({sourceRevision,surface,sourceEvidence,contract,transfers,milestones,writes,checkpoints,visibleFeedback,...final,realScheduler:true,syntheticDataOnly:true}));
 }catch(error){t.diagnostic(JSON.stringify({sourceRevision,surface,sourceEvidence,contract,transfers,milestones,writes,checkpoints,...await evidence()}));throw error;}
 finally{try{await page.evaluate(()=>(window as any).__rapidReorder?.deviceBarrier?.release?.());}finally{await h.close();}}
});
