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
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {jsonbObjectOrder} from './fixtures/save-reopen-trip.ts';
import {tripFromBuilder,type EasyTTrip} from '../lib/easyt/trip.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {projectBuilderCalendar} from '../lib/easyt/trip-builder-calendar.ts';

// Observation-only source seams: scheduler, persistence guards and all actual
// UI handlers remain intact. Only synthetic HTTP response delivery is gated.
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
    origins:new Map<number,string>(),queueSequence:0,mergeJob:null as any,activeAccount:null as any,revisions:new Map<string,number>(),
    revision(value:any){if(value===undefined||value===null)return null;if(!this.revisions.has(value))this.revisions.set(value,this.revisions.size+1);return this.revisions.get(value);},
    handle(h:any){if(!h?.writeId)return null;const key=JSON.stringify([h.ownerId,h.tripId,h.writeId]);if(!this.handles.has(key))this.handles.set(key,this.handles.size+1);return this.handles.get(key);},
    shape(trip:any){return {stops:trip.stops.map((s:any)=>s.id),ordered:[...trip.brief.intent.route.orderedStopIds],
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
  ['currentJob.submitted = requireReadableTripDocument(document);',`currentJob.submitted = requireReadableTripDocument(document);
   const p=(window as any).__rapidReorder;p.activeAccount={handle:p.handle(handle),origin:p.origins.get(p.handle(handle))??'initial',acceptedRevision:currentJob.acceptedRevision};`],
  ['const category = tripRecoveryStateForPersistenceError(cause);',`const p=(window as any).__rapidReorder;p.trace.push({kind:'save-error',name:(cause as any).name,message:(cause as any).message,reason:(cause as any).reason,submittedAbsent:job.submitted===undefined,hasAuthoredFrom:Boolean(job.authoredFrom),hasLastAck:Boolean(acknowledgedCanonical),jobFromRevisionEqual:job.trip.updatedAt===job.authoredFrom?.updatedAt,errorLastAckRevisionEqual:(cause as any).canonicalTrip?.updatedAt===acknowledgedCanonical?.updatedAt,errorJobRevisionEqual:(cause as any).canonicalTrip?.updatedAt===job.trip.updatedAt,latestAccepted:job.acceptedRevision===acceptedRevision,handle:p.handle(job.handle),origin:p.origins.get(p.handle(job.handle))});
      const category = tripRecoveryStateForPersistenceError(cause);`],
  ["if (!active() || expectedInputRevision !== inputRevision) return { ok: false as const, reason: 'stale-source' as const };\n    // A preceding projection", `const p=(window as any).__rapidReorder;
    if(edits.some(edit=>edit.kind==='order')){p.orderSequences.push(command.sequence);p.trace.push({kind:'order-issued',command:p.orderSequences.length===1?'A':p.orderSequences.length===2?'B':'unexpected',sequence:command.sequence,expectedInputRevision,inputRevision,devicePending,accountInFlight:Boolean(inFlight)});}
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
        failureReason:result.failureReason,failureBoundary:result.failureBoundary});if(result.stored)p.origins.set(p.handle(result.handle),origin);p.active=null;
    }`],
  ["if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected',", `if(scopeMatches&&result.blockedByExistingRecovery)(window as any).__rapidReorder.trace.push({kind:'protected-branch',projection:Boolean(continuation?.projectionOnly),sequence:continuation?.command?.sequence,acceptedRevision,inputRevision,scopeMatches});
        if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected',`],
  ["if (command.disposition === 'issued') command.disposition = !result.ok && result.reason === 'stale-source' ? 'retired' : 'refused';", `if (command.disposition === 'issued') command.disposition = !result.ok && result.reason === 'stale-source' ? 'retired' : 'refused';
      const p=(window as any).__rapidReorder;
      if(p.orderSequences.includes(command.sequence))p.trace.push({kind:'order-finished',sequence:command.sequence,disposition:command.disposition,ok:result.ok,reason:result.ok?null:result.reason});`],
 ]);
 edit('lib/easyt/trip-mutation-persistence.ts',[
  ['type JsonObject = Record<string, unknown>;',`type JsonObject = Record<string, unknown>;
   function changedPaths(a:any,b:any,path=''):string[]{
    if(authoredContentKey(a)===authoredContentKey(b))return [];
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(key=>changedPaths(a[key],b[key],path?path+'.'+key:key));
    return [path||'(root)'];
   }`],
  ['precedingAuthored = authored;',`precedingAuthored = authored;
   const p=(window as any).__rapidReorder;const diagnostic={id:++p.queueSequence,handle:p.handle(recovery),origin:p.origins.get(p.handle(recovery))??'initial',
    followsLocalEdit:Boolean(followsLocalEdit),baseSource:followsLocalEdit?'prior-authored':authoredBase?'revision-map':'unknown',
    authoredRevision:p.revision(authored.updatedAt),fromRevision:p.revision(authoredFrom?.updatedAt),baseRevision:p.revision(authoredBase?.updatedAt)};
   p.trace.push({kind:'queue-enqueue',...diagnostic});`],
  ['const submitted = canRebase',`p.mergeJob=diagnostic;p.trace.push({kind:'queue-rebase',...diagnostic,canRebase:Boolean(canRebase),canonicalRevision:p.revision(latestCanonical?.updatedAt)});
        const submitted = canRebase`],
  ['const saved = await persist(submitted, recovery);',`p.trace.push({kind:'queue-dispatch',...diagnostic});
        const saved = await persist(submitted, recovery);`],
  ['tail = request.catch(() => null);',`tail = request.catch((cause) => {p.trace.push({kind:'queue-error',...diagnostic,name:cause.name,message:cause.message,reason:cause.reason});return null;});`],
  ['const authoredPairChanged = !authoredLeg || authoredLeg.fromStopId !== baseLeg.fromStopId || authoredLeg.toStopId !== baseLeg.toStopId;',`const authoredPairChanged = !authoredLeg || authoredLeg.fromStopId !== baseLeg.fromStopId || authoredLeg.toStopId !== baseLeg.toStopId;
   const p=(window as any).__rapidReorder;p.trace.push({kind:'leg-guard',job:p.mergeJob?.id,origin:p.mergeJob?.origin,leg:baseLeg.id,
    authoredExists:Boolean(authoredLeg),canonicalExists:Boolean(canonicalLeg),canonicalPairChanged:pairChanged,authoredPairChanged,
    canonicalChanges:changedPaths(baseLeg,canonicalLeg),authoredChanges:changedPaths(baseLeg,authoredLeg),
    exactPredicate:Boolean(canonicalLeg&&authoredContentKey(canonicalLeg)!==authoredContentKey(baseLeg)&&authoredPairChanged)});`],
 ]);
 edit('lib/easyt/persistence-outcome.ts',[
  ['export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) {',
   `export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) {
    const p=(window as any).__rapidReorder;p?.trace.push({kind:'lower-refusal',...p.active,check,writeAttempted,readReason});`],
 ]);
 overrides.set(root+'lib/easyt/two-store-trip-persistence.ts',sourceText('lib/easyt/two-store-trip-persistence.ts'));
 return overrides;
}
const city=(id:string,name:string,country:string,coordinates:number[])=>({name,country,canonicalPlaceId:id,providerId:'fixture:'+id,coordinates,kind:'city',placeType:'city',routability:'direct_destination'});
const andorra={...city('fixture:andorra','Andorra la Vella','Andorra',[1.5218,42.5063]),label:'Andorra la Vella, Andorra',matchQuality:'exact',rankScore:200};

function changedPaths(a:any,b:any,path=''):string[]{
 const stable=(x:any):string=>Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
 if(stable(a)===stable(b))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(k=>changedPaths(a[k],b[k],path?path+'.'+k:k));
 return [path||'(root)'];
}

test('projection ACK overlaps actual table reorder at queue merge: '+sourceRevision,{skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
 const contract=await proveSuccessfulContract();
 const place=(id:string,name:string,country:string,coordinates:[number,number])=>{const v=acceptedGeographicPlace({name,country,coordinates,canonicalPlaceId:'fixture:'+id},{name,country,coordinates,canonicalPlaceId:'fixture:'+id,providerId:'fixture:'+id,placeType:'city',routability:'direct_destination'},'endpoint');assert.ok(v);return v as typeof v & {country:string};};
 const origin=place('gatwick','London Gatwick Airport','United Kingdom',[-.1903,51.1537]);
 const stops=[{...place('paris','Paris','France',[2.3522,48.8566]),id:'paris',nights:5},{...place('madrid','Madrid','Spain',[-3.7038,40.4168]),id:'madrid',nights:5},{...place('barcelona','Barcelona','Spain',[2.1734,41.3851]),id:'barcelona',nights:4}];
 const seed=tripFromBuilder({id:'synthetic-projection-rebase',origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,journeyEnd:{mode:'same_as_start'},stops,startDate:'2027-11-10',endDate:'2027-11-24',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',nightAllocations:{paris:5,madrid:5,barcelona:4},draft:[]});seed.brief.intent.route.origin=origin;
 const baseline=await accountNormalization(canonicalTripForOwner('owner-a',{...projectBuilderCalendar(seed,seed).trip,status:'planned'}),'GET');requireReadableTripDocument(baseline);
 let account:EasyTTrip|null=structuredClone(baseline),page:any=null,conflicts=0,holdTransfer=false,heldTransfer=false,armProjectionAck=false,heldProjectionAck=false,armAuthoredAck=false,heldAuthoredAck=false;
 let releaseTransfer=()=>{},releaseAck=()=>{},releaseAuthoredAck=()=>{};const transferGate=new Promise<void>(resolve=>{releaseTransfer=resolve;}),ackGate=new Promise<void>(resolve=>{releaseAck=resolve;}),authoredAckGate=new Promise<void>(resolve=>{releaseAuthoredAck=resolve;});
 const writes:any[]=[],transfers:any[]=[],milestones:string[]=[];
 const h=await renderBuilder({query:'?trip='+baseline.id,initialTrip:baseline,ownerId:'owner-a',seedRecovery:false,forceResolver:true,offlineOnly:true,sourceOverrides:sources(),
  geocodeCandidates:{Paris:[city('paris','Paris','France',[2.3522,48.8566])],Madrid:[city('madrid','Madrid','Spain',[-3.7038,40.4168])],Barcelona:[city('barcelona','Barcelona','Spain',[2.1734,41.3851])],Andorra:[andorra],'Andorra la Vella':[andorra]},
  transferRequest:async({legs})=>{const response=await transferResponse(legs);assert.equal(response.status,200);transfers.push({completed:response.body.assessments.filter((a:any)=>a.state.retrieval==='completed').length,changed:response.body.legs.filter((leg:any,i:number)=>changedPaths(legs[i],leg).length>0).length});
   if(holdTransfer){heldTransfer=true;await transferGate;}return response;},
  accountRequest:async({method,trip})=>{
   if(method==='GET')return account?{status:200,body:{trip:jsonbObjectOrder(await accountNormalization(account,'GET'))}}:{status:404,body:{error:'Trip not found'}};
   const submitted=requireReadableTripDocument(trip),matches=method==='POST'?account===null:Boolean(account&&submitted.updatedAt===account.updatedAt);
   if(!matches){conflicts++;return {status:409,body:{error:'Synthetic revision conflict',trip:account,conflictReason:'cloud-changed'}};}
   const normalized=await accountNormalization(submitted,method as 'POST'|'PUT');account=account?.status==='planned'&&normalized.status==='draft'?{...normalized,status:'planned'}:normalized;
   const provenance=page?await page.evaluate(()=>(window as any).__rapidReorder?.activeAccount):null;
   const record={index:writes.length+1,method,provenance,changes:submitted.legs.map(leg=>({leg:leg.id,fields:changedPaths(leg,account!.legs.find(l=>l.id===leg.id))})).filter(x=>x.fields.length),released:false};writes.push(record);
   const body={trip:jsonbObjectOrder(account),outcome:method==='POST'?'promoted':'updated'};
   if(armAuthoredAck&&method==='PUT'&&provenance?.origin==='A'&&!heldAuthoredAck){heldAuthoredAck=true;await authoredAckGate;}
   if(armProjectionAck&&method==='PUT'&&provenance?.origin==='projection'&&!heldProjectionAck){heldProjectionAck=true;await ackGate;}
   record.released=true;return {status:method==='POST'?201:200,body};
  },
 });page=h.page;page.setDefaultTimeout(8000);
 const until=async(check:()=>boolean,label:string)=>{for(let i=0;i<200&&!check();i++)await page.waitForTimeout(50);assert.ok(check(),label);};
 const evidence=()=>page.evaluate(()=>{const p=(window as any).__rapidReorder;return {trace:p.trace,current:p.current,mounts:p.mounts,retires:p.retires};});
 const saved=async()=>{await page.getByText('Saved to your account',{exact:true}).first().waitFor();assert.equal(conflicts,0);};
 const drag=async(from:number,to:number)=>{
  const count=await page.evaluate(()=>(window as any).__rapidReorder.orderSequences.length);
  await page.evaluate(({from,to}:{from:number;to:number})=>{const source=document.querySelector(`[data-builder-stop-index="${from}"] button[draggable="true"]`),target=document.querySelector(`[data-builder-stop-index="${to}"]`);if(!source||!target)throw Error('Missing route-table drag surface');const dataTransfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer}));for(const type of ['dragenter','dragover','drop'])target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer}));source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));},{from,to});
  await page.waitForFunction((before:number)=>{const p=(window as any).__rapidReorder;return p.orderSequences.length>before&&p.trace.some((x:any)=>x.kind==='order-finished'&&x.sequence===p.orderSequences[before]);},count);
  const e=await evidence(),finished=e.trace.find((x:any)=>x.kind==='order-finished'&&x.sequence===e.trace.filter((x:any)=>x.kind==='order-issued')[count]?.sequence);assert.equal(finished?.ok,true,'actual table reorder accepted locally');
 };
 try{
  await page.locator('[data-builder-edit-session="active"]').waitFor();await saved();milestones.push('signed-in-saved-account-reopened');
  // Both gates delay real HTTP response delivery only. The first ACK stays
  // held until projection commits against the real authored recovery handle.
  holdTransfer=true;armAuthoredAck=true;await drag(2,1);
  await until(()=>heldTransfer,'first reorder projection response naturally in flight');
  await until(()=>heldAuthoredAck,'authored reorder ACK held');milestones.push('authored-A-ack-held');
  armProjectionAck=true;holdTransfer=false;releaseTransfer();
  await page.waitForFunction(()=>{const p=(window as any).__rapidReorder;return p.trace.some((x:any)=>x.kind==='write-result'&&x.origin==='projection'&&x.stored===true);});
  const durableProjection=await evidence(),projectionStart=durableProjection.trace.find((x:any)=>x.kind==='write-start'&&x.origin==='projection');
  assert.ok(projectionStart?.predecessor,'projection uses genuine authored recovery predecessor');milestones.push('projection-P-durable-before-A-ack');
  releaseAuthoredAck();await until(()=>heldProjectionAck,'successful projection-only account ACK held');milestones.push('projection-P-ack-held');
  const pre=await evidence(),initial=pre.current.stops;assert.equal(initial.length,3);const expected=[initial[0],initial[2],initial[1]];
  await drag(1,2);await page.waitForFunction((order:string[])=>JSON.stringify((window as any).__rapidReorder.current.stops)===JSON.stringify(order),expected);milestones.push('reorder-R-durable-before-P-ack');
  const atRelease=await evidence();assert.equal(atRelease.current.error,null);releaseAck();
  await page.waitForFunction(()=>{const p=(window as any).__rapidReorder;return p.trace.some((x:any)=>x.kind==='save-error')||p.current.canonicalSaveState==='cloud';});
  const final=await evidence(),failure=final.trace.find((x:any)=>x.kind==='save-error');
  const guardChecks=final.trace.filter((x:any)=>x.kind==='leg-guard'),exactFailures=guardChecks.filter((x:any)=>x.exactPredicate);
  t.diagnostic(JSON.stringify({sourceRevision,sourceEvidence,contract,milestones,writes,transfers,guardChecks,exactFailures,...final,conflicts,realScheduler:true,syntheticDataOnly:true}));
  assert.equal(conflicts,0);assert.deepEqual(h.errors,[]);assert.equal(failure,undefined,'own successful projection ACK must not turn the next local route edit into a transport conflict');
  assert.deepEqual(final.current.stops,expected);assert.ok(guardChecks.length>0,'real queue merge guard observed');assert.ok(transfers.some(x=>x.completed>0&&x.changed>0));
 }catch(error){t.diagnostic(JSON.stringify({sourceRevision,sourceEvidence,milestones,writes,transfers,...await evidence(),conflicts,pageErrors:h.errors,body:(await page.locator('body').innerText()).slice(0,1500)}));throw error;}
 finally{holdTransfer=false;armProjectionAck=false;releaseTransfer();releaseAuthoredAck();releaseAck();await h.close();}
});
