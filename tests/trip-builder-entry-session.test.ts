import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuilderEntrySession } from '../lib/easyt/trip-builder-entry-session.ts';
import { createAsyncBuilderEditSession } from '../lib/easyt/trip-builder-async-edit-session.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { homeRecoveryFixture } from './helpers/home-recovery-fixture.ts';
import { createBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';

function gate<T>() { let resolve!:(value:T)=>void;return {promise:new Promise<T>(yes=>{resolve=yes}),resolve}; }
function fixture(receipt:unknown=null, document=homeRecoveryFixture(null).trip) {
  const candidate=requireReadableTripDocument(document);
  const handle={ownerId:null,tripId:candidate.id,writeId:'verified-write',backend:'indexeddb' as const};
  let current=true;
  const entry=createBuilderEntrySession({key:'generation-a',ownerId:null,candidate,receipt,initialCanonical:null,openedRecovery:null,isCurrent:()=>current});
  const result={stored:true,handle,blockedByExistingRecovery:false,receiptAcknowledged:true,pointerAcknowledged:true};
  const recovery={...handle,trip:structuredClone(candidate),state:'pending' as const,savedAt:'2026-10-13T00:00:00.000Z',version:2 as const};
  return {candidate,handle,entry,result,recovery,retireScope(){current=false}};
}
for (const boundary of ['recoveryDurable','readbackConfirmed','pointerAcknowledged','receiptAcknowledged'] as const) test(`entry rejects explicit ${boundary}=false before readback or handoff`,async()=>{
  const f=fixture({handoff:'exact'});let reads=0;
  const result=await f.entry.checkpoint(async()=>({...f.result,[boundary]:false}));
  assert.equal(result.stored,false);
  assert.equal(await f.entry.verifyReadback(async()=>{reads++;return f.recovery as any}),false);
  assert.equal(reads,0);assert.equal(f.entry.claimSeed(),null);
});
for(const mismatch of ['owner','trip','write','backend','body'] as const) test(`entry rejects ${mismatch} readback rather than adopting physical bytes`,async()=>{
  const f=fixture();await f.entry.checkpoint(async()=>f.result);
  const recovery={...f.recovery,...(mismatch==='owner'?{ownerId:'foreign'}:mismatch==='trip'?{tripId:'foreign'}:mismatch==='write'?{writeId:'foreign'}:mismatch==='backend'?{backend:'localStorage'}:{trip:{...f.candidate,brief:{...f.candidate.brief,mustDo:'newer source'}}})};
  assert.equal(await f.entry.verifyReadback(async()=>recovery as any),false);assert.equal(f.entry.claimSeed(),null);
});
test('entry freezes source and receipt and transfers once only after real async editor draft initialization completes',async()=>{
  const receipt={revision:7},f=fixture(receipt),write=gate<any>(),read=gate<any>(),draft=gate<any>();let writers=0,readers=0;
  receipt.revision=8;f.candidate.brief.mustDo='later recomputation';
  const checkpoint=f.entry.checkpoint(async(candidate,frozen)=>{writers++;assert.notEqual(candidate.brief.mustDo,f.candidate.brief.mustDo);assert.deepEqual(frozen,{revision:7});return write.promise});
  const joined=f.entry.checkpoint(async()=>{writers++;return f.result});assert.equal(writers,1);assert.equal(f.entry.claimSeed(),null);
  write.resolve(f.result);assert.equal((await checkpoint).stored,true);await joined;
  const readback=f.entry.verifyReadback(async()=>{readers++;return read.promise});
  assert.equal(f.entry.claimSeed(),null);read.resolve(f.recovery);assert.equal(await readback,true);assert.equal(readers,1);
  const seed=f.entry.claimSeed()!;assert.ok(seed);assert.equal(f.entry.claimSeed(),null);
  let ready=false;
  const initializing=createAsyncBuilderEditSession({...seed,getOwnerId:()=>null,readDraft:()=>draft.promise,
    writeDraft:async()=>({ok:true} as any),saveRecovery:async()=>f.result,
    acknowledgeRecovery:async()=>({outcome:'acknowledged'} as any),markRecoveryState:async()=>true,
    persistAccount:async trip=>trip,reconcile:async()=>null as any,now:()=> '2026-10-13T00:00:00.000Z',schedule:()=>()=>{}}).then(session=>{ready=true;return session});
  await Promise.resolve();assert.equal(ready,false);assert.equal(f.entry.phase,'ready');assert.equal(f.entry.ownsSession({},null),false);
  draft.resolve({kind:"readable",draft:createBuilderInputDraft(seed.initialTrip,0,null)});const session=await initializing;
  assert.equal(f.entry.handoff(session,session.getSnapshot()),true);assert.equal(f.entry.phase,'handed-off');
  assert.equal(f.entry.handoff(session,session.getSnapshot()),false);assert.equal(f.entry.ownsSession(session,null),true);
  f.retireScope();assert.equal(f.entry.ownsSession(session,null),false);session.dispose();
});
for(const point of ['write','readback','ready'] as const)test(`entry lifetime retirement at ${point} cannot mount or confer feedback authority`,async()=>{
  const f=fixture(),write=gate<any>(),read=gate<any>();
  const saving=f.entry.checkpoint(()=>write.promise);
  if(point==='write')f.retireScope();write.resolve(f.result);await saving;
  const reading=f.entry.verifyReadback(()=>read.promise);
  if(point==='readback')f.retireScope();read.resolve(f.recovery);await reading;
  if(point==='ready')f.retireScope();assert.equal(f.entry.claimSeed(),null);
  assert.equal(f.entry.ownsSession({},null),false);
});
test('canonical source with no opened exact handle refuses an arbitrary newer local recovery',async()=>{
  const f=fixture();const entry=createBuilderEntrySession({key:'account-canonical',ownerId:null,candidate:f.candidate,receipt:null,initialCanonical:f.candidate,openedRecovery:null,isCurrent:()=>true});
  assert.equal(await entry.verifyReadback(async()=>f.recovery as any),false);assert.equal(entry.claimSeed(),null);
});

test('actual initialization scheduler holds actor work until exact session handoff commits',async()=>{
  const {readFileSync}=await import('node:fs');const {default:ts}=await import('typescript');
  const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
  const tree=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
  function visit(node:import('typescript').Node){if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==='schedule'&&node.initializer.getText(tree).includes('window.setTimeout'))expression=node.initializer.getText(tree);ts.forEachChild(node,visit)}visit(tree);assert.ok(expression);
  const {prepareAcceptedBuilderEdit}=await import('../lib/easyt/trip-builder-edit.ts');
  const {builderDocumentFingerprint}=await import('../lib/easyt/trip-builder-document-commit.ts');
  const {prepareBuilderNecessaryProjection}=await import('../lib/easyt/trip-builder-reconciliation.ts');
  const before=requireReadableTripDocument(homeRecoveryFixture(null).trip);
  const edited=prepareAcceptedBuilderEdit(before,{kind:'origin',place:{name:'Paris',canonicalPlaceId:'paris',country:'France',coordinates:[2.35,48.85]}},builderDocumentFingerprint(before));assert.ok(edited.ok);
  const projected=prepareBuilderNecessaryProjection(before,edited.trip,edited.scope);assert.ok(projected.ok);
  const f=fixture(null,projected.trip);await f.entry.checkpoint(async()=>f.result);await f.entry.verifyReadback(async()=>f.recovery);const seed=f.entry.claimSeed()!;
  const timers:Array<{callback:()=>void,active:boolean}>=[];const bindings={builderEntrySessionRef:{current:f.entry},builderSeed:{entryKey:f.entry.key},
    window:{setTimeout(callback:()=>void){const timer={callback,active:true};timers.push(timer);return timer},clearTimeout(timer:{active:boolean}){timer.active=false}}};
  const schedule=new Function('scope',`with(scope){${ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(bindings);
  let requests=0;
  const session=await createAsyncBuilderEditSession({...seed,getOwnerId:()=>null,readDraft:async()=>({kind:'empty'}),
    writeDraft:async()=>({ok:true} as any),saveRecovery:async()=>f.result,acknowledgeRecovery:async()=>({outcome:'acknowledged'} as any),markRecoveryState:async()=>true,
    persistAccount:async trip=>trip,reconcile:async request=>{requests++;return {...request,results:request.dispatched.map(unit=>({...unit,phase:'failed' as const,reason:'unavailable'})),legs:[]}},
    now:()=> '2026-10-13T00:00:00.000Z',schedule});
  assert.ok(timers.length>0,'representative seed must schedule actual pending actor work');
  for(const timer of [...timers])if(timer.active)timer.callback();await Promise.resolve();
  assert.equal(requests,0,'actor work cannot rotate the accepted seed before handoff');
  assert.equal(f.entry.handoff(session,session.getSnapshot()),true);
  f.entry.releaseScheduledWork(session,null);await Promise.resolve();assert.equal(requests,1,'mounted owner releases scheduled actor work');
  session.dispose();
});
