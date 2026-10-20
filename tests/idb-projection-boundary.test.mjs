// Prospective projection requirements. Production admission is deliberately unchanged.
// With production imports, IDB negatives stop at categorical deferral and the
// positive control stays red. The test-only candidate path qualifies admission.
import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,accepted,copies,retained,coldRead} from './helpers/idb-projection-boundary.mjs';
import {builderInputDraftKey} from '../lib/easyt/trip-builder-input-draft.ts';
import {entryHeadKey} from '../lib/easyt/durable-entry-protocol.ts';

function inputCopies(h){
 const {ownerId,id:tripId}=h.session.getSnapshot().trip;
 const scope={ownerId,tripId,kind:'builder-input'};
 return {native:h.storage.getItem(builderInputDraftKey(ownerId,tripId)),head:h.model.data.get('heads').get(entryHeadKey(scope)),
  generations:[...h.model.data.get('generations')].filter(([key])=>{const p=JSON.parse(key);return p[0]==='entry'&&p[1]===ownerId&&p[2]==='builder-input'&&p[3]===tripId;})};
}
async function runRoute(h){await h.run();await h.session.waitForDeviceWrites();return h.trace.writes.filter(w=>w.projection).at(-1);}

test('RED: existing IDB body and unchanged IDB input complete and cold-reopen without rewriting input',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');
 try{
  await accepted(h);const beforeInput=inputCopies(h),originals=structuredClone(h.model.data.get('generations'));
  const result=await runRoute(h);
  assert.deepEqual(inputCopies(h),beforeInput,'input bytes, revision envelope, provenance and head must remain exact');
  for(const [key,raw] of originals)assert.equal(h.model.data.get('generations').get(key),raw,'every ancestor must remain immutable');
  assert.equal(result.result.stored,true,'eligible IDB route projection should be durably accepted');
  assert.equal(h.session.getSnapshot().pendingUnits.filter(u=>u.kind!=='recommendation').length,0);
  const cold=await coldRead(h);
  assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,h.session.getSnapshot().trip);
  assert.equal(h.trace.accountWrites,0);
 }finally{h.close();}
});

test('control: native route completion keeps authored input exact',{timeout:15000},async()=>{
 const h=await harness('native');try{await accepted(h);const before=inputCopies(h);assert.equal((await runRoute(h)).result.stored,true);
  assert.deepEqual(inputCopies(h),before);const cold=await coldRead(h);assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,h.session.getSnapshot().trip);assert.equal(h.trace.accountWrites,0);}finally{h.close();}
});
test('control: ordinary authored IDB edits retain ancestors and cold-reopen',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{const original=structuredClone(h.model.data.get('generations'));await accepted(h);
  assert.equal(h.trace.writes.length,2);assert(h.trace.writes.every(w=>w.result.stored));
  for(const [key,raw] of original)assert.equal(h.model.data.get('generations').get(key),raw);
  const cold=await coldRead(h);assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,h.session.getSnapshot().trip);
  assert.equal(h.trace.accountWrites,0);}finally{h.close();}
});
test('mixed native-body/IDB-input remains deferred on two deliberate attempts',{timeout:15000},async()=>{
 const h=await harness('indexeddb-input');try{await accepted(h);const before=copies(h);const first=await runRoute(h);
  assert.equal(first.result.projectionDeferred,true);assert.equal(first.result.writeAttempted,false);await retained(h,before);
  await h.session.resumeNecessaryWork();await h.session.waitForDeviceWrites();assert.equal(h.trace.providerCalls,2);await retained(h,before);
  const retry=h.trace.writes.filter(w=>w.projection).at(-1);assert.equal(retry.result.projectionDeferred,true);assert.equal(retry.result.writeAttempted,false);
 }finally{h.close();}
});

const forbidden={
 'authored title':({trip})=>{trip.title='Injected authored title';},
 'authored stop nights':({trip})=>{trip.stops[0].nights++;},
 'authored preferences':({trip})=>{trip.brief.intent.preferences.transportModes=['drive'];},
 'authored brief':({trip})=>{trip.brief.mustDo='Injected authored brief';},
 'forged marker':({trip})=>{trip.brief.intent.route.projectionInputKey='forged';},
 'marker bound to different input':({trip})=>{trip.brief.intent.route.destinations[0].sourceText+=' changed';},
 'stale mounted handle':({options})=>{options.replace.writeId='older-mounted-generation';},
 'changed frozen source':({options})=>{options.expectedRecoverySource.title='Other authored source';},
 'foreign source owner':({options})=>{options.expectedRecoverySource.ownerId='other-owner';},
 'foreign candidate owner':({trip})=>{trip.ownerId='other-owner';},
 'input revision mismatch':({options})=>{options.projectionOnly.inputRevision++;},
 'input metadata revision mismatch':({options})=>{options.entry.input.inputRevision++;},
 'missing bound input metadata':({options})=>{options.entry.input=null;},
 'corrupt input envelope':({options})=>{options.entries[0].raw='{broken';},
};
for(const mode of ['native','indexeddb-body'])for(const [name,change] of Object.entries(forbidden))test(`${mode}: rejects ${name} without changing any durable copy`,{timeout:15000},async()=>{
 const h=await harness(mode);try{
  await accepted(h);const before=copies(h);let injected=false;
  h.control.beforeProjectionSave=async state=>{injected=true;change(state);};
  const result=await runRoute(h);assert.equal(injected,true,'the hostile candidate must reach the real broker');
  assert.equal(result.result.stored,false,'forbidden candidate must not be admitted');assert.equal(result.result.writeAttempted,false);
  await retained(h,before);
 }finally{h.close();}
});

const nestedFields={
 assessment:trip=>{trip.brief.routeAssessment={...trip.brief.routeAssessment,retainedDiagnosticPayload:{text:'unchanged nested projection value'}};},
 reconciliation:trip=>{trip.brief.cascadeStatus.routeReconciliation.retainedDiagnosticPayload={text:'unchanged nested projection value'};},
 leg:trip=>{trip.legs[0].retainedDiagnosticPayload={text:'unchanged nested projection value'};},
};
for(const [field,extend] of Object.entries(nestedFields))test(`IDB projection has native nested ${field} preservation parity without changing authored content`,{timeout:15000},async()=>{
 const outcomes=[];
 for(const mode of ['native','indexeddb-body']){
  const h=await harness(mode);try{await accepted(h);const authored=structuredClone(h.session.getSnapshot().trip),inputBefore=inputCopies(h);
   h.control.beforeProjectionSave=async({trip})=>{extend(trip);};const result=await runRoute(h);
   assert.equal(result.result.stored,true,mode+' should retain its existing projection subtree contract');
   const cold=await coldRead(h);assert.equal(cold.kind,'found');const trip=cold.trip;assert.equal(trip.title,authored.title);assert.deepEqual(trip.stops,authored.stops);
   assert.equal(trip.brief.mustDo,authored.brief.mustDo);assert.deepEqual(trip.brief.intent.preferences,authored.brief.intent.preferences);
   assert.deepEqual(inputCopies(h),inputBefore);outcomes.push(field==='assessment'?trip.brief.routeAssessment.retainedDiagnosticPayload:field==='reconciliation'?trip.brief.cascadeStatus.routeReconciliation.retainedDiagnosticPayload:trip.legs[0].retainedDiagnosticPayload);
   assert.equal(h.trace.accountWrites,0);
  }finally{h.close();}
 }
 assert.deepEqual(outcomes,[{text:'unchanged nested projection value'},{text:'unchanged nested projection value'}]);
});

for(const retirement of ['input','owner','dispose'])test(`existing IDB projection retires after ${retirement} changes during provider work`,{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');let release;h.control.gate=new Promise(resolve=>{release=resolve;});
 try{await accepted(h);await h.run();
  if(retirement==='input')await h.session.updateDraft({binding:{kind:'destination-add'},raw:'newer authored input'});
  if(retirement==='owner')h.rotate();if(retirement==='dispose')h.session.dispose();
  const before=copies(h);release();await h.session.waitForDeviceWrites();for(let i=0;i<50;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(copies(h),before);assert.equal(h.trace.writes.filter(w=>w.projection).length,0);assert.equal(h.trace.accountWrites,0);
 }finally{release();h.close();}
});

for(const nextOwner of [null,'another-isolated-owner'])test(`signed-in IDB worker retires after ${nextOwner===null?'signout':'account switch'}`,{timeout:15000},async()=>{
 const h=await harness('indexeddb-body','isolated-owner');let release;h.control.gate=new Promise(resolve=>{release=resolve;});
 try{await accepted(h);await h.run();h.setOwner(nextOwner);const before=copies(h);release();
  for(let i=0;i<50;i++)await new Promise(resolve=>setImmediate(resolve));await h.session.waitForDeviceWrites();
  assert.deepEqual(copies(h),before);assert.equal(h.trace.writes.filter(w=>w.projection).length,0);assert.equal(h.trace.accountWrites,0);
 }finally{release();h.close();}
});

test('prewrite driver unavailability refuses without issuing a write and preserves all copies',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{await accepted(h);const before=copies(h),run=h.driver.run.bind(h.driver);let armed=false,writes=0;
  h.control.beforeProjectionSave=async()=>{armed=true;};
  h.driver.run=(scope,id,mode,decide,entries)=>{if(armed){if(mode==='readwrite')writes++;return Promise.reject(new DOMException('Synthetic prewrite unavailable','InvalidStateError'));}return run(scope,id,mode,decide,entries);};
  const result=await runRoute(h);armed=false;assert.equal(writes,0);assert.equal(result.result.stored,false);assert.equal(result.result.writeAttempted,false);await retained(h,before);
 }finally{h.close();}
});

test('RED: eligible IDB projection that starts then aborts must report writeAttempted, never no-write deferral',{timeout:15000},async()=>{
 const h=await harness('indexeddb-body');try{await accepted(h);const before=copies(h),run=h.driver.run.bind(h.driver);let targetId=null,started=0;
  h.control.beforeProjectionSave=async({options})=>{targetId=options.writeId;h.model.failAddStore='generations';};
  h.driver.run=(scope,id,mode,decide,entries)=>{if(id===targetId&&mode==='readwrite')started++;return run(scope,id,mode,decide,entries);};
  const result=await runRoute(h);h.model.failAddStore=null;
  assert.equal(started,1,'this fence cannot be qualified while categorical admission prevents the transaction');
  assert.equal(result.result.stored,false);assert.equal(result.result.writeAttempted,true);assert.notEqual(result.result.projectionDeferred,true);await retained(h,before);
 }finally{h.close();}
});
