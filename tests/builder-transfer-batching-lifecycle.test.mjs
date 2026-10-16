import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {actualWorker,realApiGuard} from './helpers/transfer-client-callers.mjs';
import {createAsyncBuilderEditSession} from '../lib/easyt/trip-builder-async-edit-session.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {createDurableBuilderInputPersistence} from '../lib/easyt/builder-input-persistence.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {tripRecoveryStorageKey,currentTripStorageKey} from '../lib/easyt/storage.ts';
import {transportAssessmentSummary} from '../lib/easyt/itinerary-transport-agenda.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
const captured=JSON.parse(fs.readFileSync(new URL('fixtures/connection-nine-leg-edit.json',import.meta.url)));
class MemoryStorage {values=new Map();get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}removeItem(k){this.values.delete(k);}}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function harness(source=captured){
 const storage=new MemoryStorage(),driver=new MemoryRecoveryDriver(),trip=requireReadableTripDocument(structuredClone(source));
 for(const u of trip.brief.cascadeStatus.routeReconciliation.residual)if(u.kind==='leg')u.phase='pending';
 let owner=null,writes=0;const original={version:2,ownerId:null,tripId:trip.id,writeId:'source',state:'pending',savedAt:trip.updatedAt,trip};
 storage.setItem(tripRecoveryStorageKey(null,trip.id,'source'),JSON.stringify(original));storage.setItem(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:trip.id}));
 const context=isCurrent=>({ownerId:null,isCurrent,overflowEnabled:false,accountOverflowQualified:false});
 const read=()=>createTwoStoreTripPersistence(storage,driver,context(()=>true)).read(trip.id);
 const options={initialTrip:trip,initialRecovery:original,getOwnerId:()=>owner,readDraft:(t)=>createDurableBuilderInputPersistence(storage,driver,{trip:t,...context(()=>true)}).read(),
 writeDraft:(t,d,_o,g)=>createDurableBuilderInputPersistence(storage,driver,{trip:t,...context(g.isCurrent)}).write(d),
 saveRecovery:async(t,m)=>{const id='batch-write-'+(++writes),ctx=context(m.isCurrent),prepared=await createDurableBuilderInputPersistence(storage,driver,{trip:t,...ctx}).prepare(m.draft,id+':input');assert.ok(prepared.ok);return createTwoStoreTripPersistence(storage,driver,ctx).save(t,{replace:m.replace,state:m.state,canonicalBase:m.canonicalBase,expectedRecoverySource:m.expectedRecoverySource,projectionOnly:m.projectionOnly,writeId:id,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:t.id,writeId:id},input:prepared.input,receipt:null}});},
 acknowledgeRecovery:()=>{throw Error('Unexpected account ACK');},persistAccount:()=>{throw Error('Unexpected account write');},
 reconcile:actualWorker(),now:()=> '2026-10-15T21:00:00.000Z',schedule:()=>()=>{}};
 const session=await createAsyncBuilderEditSession(options);return {session,options,storage,driver,read,get writes(){return writes;},rotate(){owner='owner-b';}};
}
function strictApi(t,transform){const api=realApiGuard(),calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{const body=String(options.body),input=JSON.parse(body).legs;assert.ok(input.length<=8);assert.ok(Buffer.byteLength(body)<=100000);calls.push(input.map(l=>l.id));const response=await api(new Request('http://fixture.invalid'+url,{method:'POST',headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))},body}));return transform?transform(response,calls.length,input):response;});return calls;}

test('actual session and two-store broker persist nine-leg batches once, then order, Build and fresh-reader reopen',async t=>{
 const h=await harness(),calls=strictApi(t),before=h.session.getSnapshot().trip;
 try{
  await h.session.updateDraft({binding:{kind:'destination-add'},raw:'  preserve this unfinished stop  '});
  await h.session.resumeNecessaryWork();const first=h.session.getSnapshot();assert.equal(h.writes,1,'batches must not write incrementally');assert.equal(calls.length,2);
  assert.equal(first.pendingUnits.some(u=>u.kind==='leg'),false);
  for(const [from,to]of [['Busan','Seoul'],['Osaka','Hiroshima']])assert.ok(first.trip.legs.some(l=>l.fromEndpoint.name===from&&l.toEndpoint.name===to&&l.mode==='train'));
  assert.deepEqual(first.trip.stops,before.stops);assert.deepEqual(first.trip.planItems,before.planItems);assert.deepEqual(first.trip.bookings,before.bookings);assert.equal(first.draft.fields[0].raw,'  preserve this unfinished stop  ');
  for(let i=0;i<2;i++){const ids=h.session.getSnapshot().trip.stops.map(s=>s.id).reverse();const accepted=await h.session.accept({kind:'order',stopIds:ids,source:'drag'},h.session.getSnapshot().inputRevision);assert.ok(accepted.ok);await h.session.resumeNecessaryWork();}
  const barrier=h.session.captureCommandBarrier();assert.ok((await barrier.wait()).ok);const built=await h.session.accept({kind:'build-status'},h.session.getSnapshot().inputRevision);assert.ok(built.ok);assert.equal(h.session.getSnapshot().trip.status,'planned');
  const read=await h.read();assert.equal(read.kind,'found');assert.deepEqual(read.trip,h.session.getSnapshot().trip);
  const reopened=await createAsyncBuilderEditSession({...h.options,initialTrip:read.trip,initialRecovery:read.recovery});try{assert.deepEqual(reopened.getSnapshot().trip.legs,read.trip.legs);assert.equal(reopened.getSnapshot().draft.fields[0].raw,'  preserve this unfinished stop  ');}finally{reopened.dispose();}
 }finally{h.session.dispose();}
});
for(const interruption of ['raw','owner','order'])test(`a delayed second batch cannot persist after ${interruption} changes current scope`,async t=>{
 const h=await harness(),entered=deferred(),release=deferred();strictApi(t,async(response,n)=>{if(n===2){entered.resolve();await release.promise;}return response;});
 try{const pending=h.session.resumeNecessaryWork();await entered.promise;assert.equal(h.writes,0);
  if(interruption==='raw')await h.session.updateDraft({binding:{kind:'destination-add'},raw:'new input during batch'});
  else if(interruption==='owner')h.rotate();
  else assert.ok((await h.session.accept({kind:'order',stopIds:h.session.getSnapshot().trip.stops.map(s=>s.id).reverse()},h.session.getSnapshot().inputRevision)).ok);
  const writes=h.writes,trip=h.session.getSnapshot().trip;release.resolve();await pending;assert.equal(h.writes,writes);assert.deepEqual(h.session.getSnapshot().trip,trip);
 }finally{release.resolve();h.session.dispose();}
});
test('correct-ID semantic corruption rejects the aggregate without any canonical write',async t=>{const h=await harness();strictApi(t,async(response,n)=>{const p=await response.json();if(n===1)p.legs[0].fromEndpoint={...p.legs[0].fromEndpoint,id:'foreign',name:'Foreign origin'};return Response.json(p);});try{const before=h.session.getSnapshot().trip;await h.session.resumeNecessaryWork();assert.equal(h.writes,0);assert.deepEqual(h.session.getSnapshot().trip,before);assert.equal((await h.read()).kind,'found');}finally{h.session.dispose();}});

const africa=JSON.parse(fs.readFileSync(new URL('fixtures/connection-africa-six-leg.json',import.meta.url)));
const africaBefore=JSON.parse(fs.readFileSync(new URL('fixtures/connection-africa-before-order.json',import.meta.url)));
for(const boundary of ['budget-edit','fresh-reopen'])test(`insufficient Africa estimates cannot strengthen after ${boundary}`,async t=>{
 const h=await harness(africaBefore);strictApi(t);
 try{
  const order=africa.stops.map(s=>h.session.getSnapshot().trip.stops.find(old=>old.name===s.name).id);assert.ok((await h.session.accept({kind:'order',stopIds:order,source:'route-check'},h.session.getSnapshot().inputRevision)).ok);
  await h.session.resumeNecessaryWork();const assessed=h.session.getSnapshot(),legs=structuredClone(assessed.trip.legs);
  assert.equal(assessed.transferAssessments.length,6);assert.match(transportAssessmentSummary(assessed.trip,'en',assessed.transferAssessments).label,/0 of 6 transfers.*4 need checking.*2 could not be checked/);
  if(boundary==='budget-edit'){
   assert.ok((await h.session.accept({kind:'budget',budget:'high'},assessed.inputRevision)).ok);const changed=h.session.getSnapshot();
   assert.deepEqual(changed.trip.legs,legs);assert.deepEqual(changed.transferAssessments,[]);
   assert.match(transportAssessmentSummary(changed.trip,'en',changed.transferAssessments).label,/0 of 6 transfers.*4 need checking.*2 could not be checked/);
  }else{
   const read=await h.read();assert.equal(read.kind,'found');const reopened=await createAsyncBuilderEditSession({...h.options,initialTrip:read.trip,initialRecovery:read.recovery});
   try{const state=reopened.getSnapshot();assert.deepEqual(state.trip.legs,legs);assert.deepEqual(state.transferAssessments,[]);
    assert.match(transportAssessmentSummary(state.trip,'en',state.transferAssessments).label,/0 of 6 transfers.*4 need checking.*2 could not be checked/);
   }finally{reopened.dispose();}
  }
 }finally{h.session.dispose();}
});
