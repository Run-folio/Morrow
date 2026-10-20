// Supported callers only. No raw database-map rewrites or broader owner reads.
import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,accepted,copies,coldRead} from './helpers/idb-projection-boundary.mjs';
import {createDurableBuilderInputPersistence} from '../lib/easyt/builder-input-persistence.ts';
import {createRecoveryClaimCoordinator} from '../lib/easyt/recovery-domain-claim.ts';
import {RECOVERY_DOMAIN_CLAIM_ENABLED} from '../lib/easyt/recovery-domain-policy.ts';
import {invalidateBrowserRecoveryScope} from '../lib/easyt/browser-recovery-persistence.ts';
import {updateBuilderInputDraft,builderInputDraftKey} from '../lib/easyt/trip-builder-input-draft.ts';
import {tripRecoveryStorageKey} from '../lib/easyt/storage.ts';
import {RecoveryDomainError} from '../lib/easyt/durable-recovery-error.ts';

const runProjection=async h=>{await h.run();await h.session.waitForDeviceWrites();return h.trace.writes.filter(w=>w.projection).at(-1)?.result;};
const scope=h=>({ownerId:h.session.getSnapshot().browserOwnerId,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
function inputSnapshot(h){const trip=h.session.getSnapshot().trip;return {native:h.storage.getItem(builderInputDraftKey(trip.ownerId,trip.id)),
 heads:[...h.model.data.get('heads')].filter(([key])=>{const p=JSON.parse(key);return p[0]==='entry'&&p[2]==='builder-input';}),
 generations:[...h.model.data.get('generations')].filter(([key])=>{const p=JSON.parse(key);return p[0]==='entry'&&p[2]==='builder-input';})};}
function ancestorsRetained(h,before){for(const [key,raw] of before.domain.get('generations'))assert.equal(h.model.data.get('generations').get(key),raw);}
async function ordinaryReplacement(h){
 const snapshot=h.session.getSnapshot(),trip={...structuredClone(snapshot.trip),title:'Accepted edit from another caller'},id='other-caller-body';
 const prepared=await createDurableBuilderInputPersistence(h.storage,h.driver,{trip,...scope(h)}).prepare(snapshot.draft,id+':input');assert.equal(prepared.ok,true);
 const result=await h.broker(()=>true).save(trip,{replace:snapshot.recovery,expectedRecoverySource:snapshot.trip,canonicalBase:snapshot.trip,writeId:id,
  entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:trip.ownerId,tripId:trip.id,writeId:id},input:prepared.input,receipt:null}});
 assert.equal(result.stored,true);return trip;
}
async function inputChange(h,restore=false){
 const {trip,draft}=h.session.getSnapshot(),ctx={trip,...scope(h)};
 let next=updateBuilderInputDraft(draft,trip,{kind:'destination-add'},'Other caller unaccepted input',ctx.ownerId);
 const writer=createDurableBuilderInputPersistence(h.storage,h.driver,ctx);assert.equal((await writer.write(next)).ok,true);
 if(restore){next=updateBuilderInputDraft(next,trip,{kind:'destination-add'},draft.fields.find(field=>field.binding.kind==='destination-add')?.raw??'',ctx.ownerId);assert.equal((await writer.write(next)).ok,true);}
}
async function explicitPrototypeClaim(h){
 const trip=h.session.getSnapshot().trip,prefix=tripRecoveryStorageKey('claim-target',trip.id);
 const storage={get length(){return h.storage.length;},key:i=>h.storage.key(i),getItem:key=>h.storage.getItem(key),removeItem:key=>h.storage.removeItem(key),
  setItem:(key,raw)=>{if(key.startsWith(prefix))throw new DOMException('Synthetic claim target quota','QuotaExceededError');h.storage.setItem(key,raw);}};
 // The product activation remains false. This exercises the existing dedicated
 // coordinator's local prototype so a future activation cannot bypass the fence.
 const result=await createRecoveryClaimCoordinator(storage,h.driver,{ownerId:'claim-target',isCurrent:()=>true,enabled:true}).claim(trip.id);
 assert.equal(result.kind,'verified',JSON.stringify(result));
}

for(const race of ['body','input','input-away-back','mark-auth','discard','clear-current','other-trip','claim-prototype','owner-away-back','unmount'])
 test(`supported ${race} transition after projection capture preserves the accepted branch`,{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{
  await accepted(h);const acceptedTrip=h.session.getSnapshot().trip,run=h.driver.run.bind(h.driver);let target=null,injected=false,afterTransition;
  h.control.beforeProjectionSave=async({options})=>{target=options.writeId;};
  h.driver.run=async(s,id,mode,decide,entries)=>{
   if(id===target&&mode==='readwrite'&&!injected){injected=true;
    if(race==='body')await ordinaryReplacement(h);
    if(race==='input'||race==='input-away-back')await inputChange(h,race==='input-away-back');
    if(race==='mark-auth')assert.equal(await h.broker(()=>true).mark(h.session.getSnapshot().recovery,'auth'),true);
    if(race==='discard')assert.equal(await h.broker(()=>true).discard(h.session.getSnapshot().recovery,true),true);
    if(race==='clear-current')assert.equal(await h.broker(()=>true).clearCurrent(),true);
    if(race==='other-trip'){const trip={...structuredClone(acceptedTrip),id:'another-synthetic-trip',title:'Another synthetic trip'};assert.equal((await h.broker(()=>true).save(trip,{newTripOrClone:true,writeId:'other-trip-seed'})).stored,true);}
    if(race==='claim-prototype')await explicitPrototypeClaim(h);
    if(race==='owner-away-back'){h.setOwner('other-owner');invalidateBrowserRecoveryScope();h.setOwner(null);invalidateBrowserRecoveryScope();}
    if(race==='unmount')h.session.dispose();
    afterTransition=copies(h);
   }
   return run(s,id,mode,decide,entries);
  };
  const result=await runProjection(h);
  assert.equal(injected,true,'positive admission must reach the real transaction boundary before this race is qualified');
  assert.equal(result.stored,false);assert.equal(result.writeAttempted,true);assert.notEqual(result.projectionDeferred,true);
  assert.deepEqual(copies(h),afterTransition,'the stale attempt must not overwrite the supported transition');
  assert.deepEqual(h.session.getSnapshot().trip,acceptedTrip);assert.equal(h.trace.accountWrites,0);
  if(race==='discard')assert.equal((await coldRead(h)).kind,'missing');
  else{const cold=await coldRead(h);assert.equal(cold.kind,'found');if(race==='body')assert.equal(cold.trip.title,'Accepted edit from another caller');}
 }finally{h.close();}
});

for(const ownerId of [null,'isolated-account'])test(`eligible ${ownerId??'guest'} IDB completion cold-opens exact input and leaves every ancestor`,{timeout:15000},async()=>{
 const h=await harness('indexeddb-body',ownerId);try{await accepted(h);const before=copies(h),input=inputSnapshot(h);const result=await runProjection(h);
  assert.equal(result.stored,true);assert.equal(result.writeAttempted,true);assert.equal(result.readbackConfirmed,true);assert.equal(result.pointerAcknowledged,true);
  assert.deepEqual(inputSnapshot(h),input);ancestorsRetained(h,before);const cold=await coldRead(h);assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,h.session.getSnapshot().trip);
  assert.equal(h.session.getSnapshot().pendingUnits.filter(unit=>unit.kind!=='recommendation').length,0);assert.equal(h.trace.accountWrites,0);
 }finally{h.close();}
});

test('held production claim changes no copy and does not block an eligible projection',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{await accepted(h);h.control.beforeProjectionSave=async()=>{const before=copies(h);
  const result=await createRecoveryClaimCoordinator(h.storage,h.driver,{ownerId:'claim-target',isCurrent:()=>true,enabled:RECOVERY_DOMAIN_CLAIM_ENABLED}).claim(h.session.getSnapshot().trip.id);
  assert.equal(result.kind,'held');assert.equal(result.reason,'claim-activation-held');assert.deepEqual(copies(h),before);
 };assert.equal((await runProjection(h)).stored,true);assert.equal(h.trace.accountWrites,0);}finally{h.close();}
});

test('post-commit readback uncertainty retains the candidate and cannot claim no-write deferral',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{await accepted(h);const before=copies(h),input=inputSnapshot(h),run=h.driver.run.bind(h.driver);let target=null,blocked=true;
  h.control.beforeProjectionSave=async({options})=>{target=options.writeId;};
  h.driver.run=(s,id,mode,decide,entries)=>target!==null&&id===target&&mode==='readonly'&&blocked?Promise.reject(new RecoveryDomainError('security','not-started')):run(s,id,mode,decide,entries);
  const result=await runProjection(h);assert.equal(result.stored,false);assert.equal(result.writeAttempted,true);assert.equal(result.recoveryCommitted,true);assert.equal(result.readbackConfirmed,false);assert.notEqual(result.projectionDeferred,true);
  assert.deepEqual(h.session.getSnapshot().trip,before.trip);assert.deepEqual(inputSnapshot(h),input);ancestorsRetained(h,before);assert.equal(h.trace.accountWrites,0);
  blocked=false;const cold=await coldRead(h);assert.equal(cold.kind,'found');assert.equal(cold.recovery.writeId,target);
  const retained=copies(h);await h.session.resumeNecessaryWork();await h.session.waitForDeviceWrites();assert.deepEqual(copies(h),retained,'retry cannot overwrite a committed generation from its stale source');
 }finally{h.close();}
});

test('started native transaction decision abort is an attempted write with exact originals retained',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{await accepted(h);const before=copies(h),run=h.driver.run.bind(h.driver);let target=null,started=0;
  h.control.beforeProjectionSave=async({options})=>{target=options.writeId;};
  h.driver.run=(s,id,mode,decide,entries)=>id===target&&mode==='readwrite'?(started++,run(s,id,mode,()=>{throw new DOMException('Synthetic transaction decision abort','AbortError');},entries)):run(s,id,mode,decide,entries);
  const result=await runProjection(h);assert.equal(started,1);assert.equal(result.stored,false);assert.equal(result.writeAttempted,true);assert.notEqual(result.projectionDeferred,true);assert.deepEqual(copies(h),before);
  assert.equal((await coldRead(h)).kind,'found');assert.equal(h.trace.accountWrites,0);
 }finally{h.close();}
});

test('delayed response after actual navigation disposal never reaches projection persistence',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');let release;h.control.gate=new Promise(resolve=>{release=resolve;});
 try{await accepted(h);await h.run();assert.equal(await h.broker(()=>true).clearCurrent(),true);h.session.dispose();const before=copies(h);release();
  for(let i=0;i<60;i++)await new Promise(resolve=>setImmediate(resolve));await h.session.waitForDeviceWrites();
  assert.deepEqual(copies(h),before);assert.equal(h.trace.writes.filter(write=>write.projection).length,0);assert.equal(h.trace.accountWrites,0);
 }finally{release();h.close();}
});

for(const ownerId of [null,'isolated-account'])for(const navigation of ['clear-current','other-trip'])
 test(`earlier supported ${navigation} for ${ownerId??'guest'} cannot be adopted by optional projection or replay`,{timeout:15000},async()=>{
 const h=await harness('indexeddb-body',ownerId);try{
  await accepted(h);let afterNavigation,injected=false;
  h.control.beforeProjectionSave=async()=>{
   injected=true;
   if(navigation==='clear-current')assert.equal(await h.broker(()=>true).clearCurrent(),true);
   else {const trip={...structuredClone(h.session.getSnapshot().trip),id:'earlier-other-synthetic-trip',title:'Another synthetic trip'};
    assert.equal((await h.broker(()=>true).save(trip,{newTripOrClone:true,writeId:'earlier-other-trip'})).stored,true);}
   afterNavigation=copies(h);
  };
  const result=await runProjection(h);assert.equal(injected,true);assert.equal(result.stored,false);
  assert.equal(result.writeAttempted,false);assert.deepEqual(copies(h),afterNavigation);
  const frozen=h.trace.candidates.at(-1);
  const replay=await h.broker(()=>true).save(frozen.trip,structuredClone(frozen.options));
  assert.equal(replay.stored,false);assert.equal(replay.writeAttempted,false);assert.deepEqual(copies(h),afterNavigation);
  const current=await h.broker(()=>true).current();
  if(navigation==='clear-current'){assert.equal(current.kind,'missing');assert.equal(current.currentCleared,true);}
  else {assert.equal(current.kind,'found');assert.equal(current.trip.id,'earlier-other-synthetic-trip');}
  assert.equal((await coldRead(h)).kind,'found');assert.equal(h.trace.accountWrites,0);
 }finally{h.close();}
});

for(const status of ['not-started','unconfirmed-before-commit','unconfirmed-after-commit'])
 test(`projection preserves transaction outcome ${status} without accepting or rolling back uncertain bytes`,{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{
  await accepted(h);const before=copies(h),run=h.driver.run.bind(h.driver);let target=null,reached=0,afterCommit;
  h.control.beforeProjectionSave=async({options})=>{target=options.writeId;};
  h.driver.run=async(s,id,mode,decide,entries)=>{
   if(target!==null&&id===target&&mode==='readwrite'){
    reached++;
    if(status==='unconfirmed-after-commit'){await run(s,id,mode,decide,entries);afterCommit=copies(h);}
    throw new RecoveryDomainError('unavailable',status==='not-started'?'not-started':'unconfirmed');
   }
   return run(s,id,mode,decide,entries);
  };
  const result=await runProjection(h);assert.equal(reached,1);assert.equal(result.stored,false);
  assert.equal(result.writeAttempted,status!=='not-started');
  assert.equal(result.recoveryCommitted,status==='not-started'?false:undefined,'unknown commit status must not become a definitive negative');
  assert.notEqual(result.projectionDeferred,true);assert.equal(result.readbackConfirmed,false);
  assert.deepEqual(copies(h),afterCommit??before);assert.equal(h.trace.accountWrites,0);
  h.driver.run=run;
  const cold=await coldRead(h);assert.equal(cold.kind,'found');
  assert.deepEqual(cold.trip,status==='unconfirmed-after-commit'?h.trace.candidates.at(-1).trip:before.trip);
  const retained=copies(h),frozen=h.trace.candidates.at(-1);
  if(status==='unconfirmed-after-commit'){
   assert.equal((await h.broker(()=>true).save(frozen.trip,structuredClone(frozen.options))).stored,false);
   assert.deepEqual(copies(h),retained,'an uncertain committed candidate is retained, never rolled back by stale replay');
  }
 }finally{h.close();}
});
