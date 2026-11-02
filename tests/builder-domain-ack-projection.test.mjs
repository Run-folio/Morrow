import assert from 'node:assert/strict';
import test from 'node:test';
import {tripFromBuilder} from '../lib/easyt/trip.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {tripRecoveryStorageKey,currentTripStorageKey} from '../lib/easyt/storage.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {createDurableBuilderInputPersistence} from '../lib/easyt/builder-input-persistence.ts';
import {createBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {createAsyncBuilderEditSession} from '../lib/easyt/trip-builder-async-edit-session.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {createRecoveryEntryStore} from '../lib/easyt/durable-entry-store.ts';
import {entryHeadKey,entryGenerationKey} from '../lib/easyt/durable-entry-protocol.ts';
import {createRecoveryLifecycle} from '../lib/easyt/recovery-domain-lifecycle.ts';
import {createRecoveryDomainStore,openIndexedDbRecoveryDriver} from '../lib/easyt/durable-recovery-store.ts';
import {IndexedDbModel} from './helpers/recovery-indexeddb-model.ts';
import {envelope,canonicalAck} from './helpers/durable-recovery-fixture.ts';

const owner='ack-projection-owner';
function fixture(){
 const place=(name,country,coordinates)=>{const p=acceptedGeographicPlace({name,country,coordinates},{name,country,coordinates,providerId:'fixture:'+name,canonicalPlaceId:'fixture:'+name,placeType:'city',routability:'direct_destination'},'endpoint');assert.ok(p);return p;};
 const origin=place('Paris','France',[2.3522,48.8566]);
 const stops=[{...place('Madrid','Spain',[-3.7038,40.4168]),id:'madrid',nights:2},{...place('Lisbon','Portugal',[-9.1393,38.7223]),id:'lisbon',nights:4}];
 const trip=tripFromBuilder({id:'ack-projection-trip',origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,journeyEnd:{mode:'same_as_start'},stops,startDate:'2026-10-31',endDate:'2026-11-06',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',nightAllocations:{madrid:2,lisbon:4},draft:[]});
 trip.brief.intent.route.origin=origin;
 return requireReadableTripDocument(canonicalTripForOwner(owner,{...trip,status:'planned'}));
}
const bytes=h=>JSON.stringify([[...h.values],[...h.driver.heads],[...h.driver.generations],[...h.driver.acknowledgements]]);
async function harness(target='indexeddb'){
 const values=new Map(),driver=new MemoryRecoveryDriver();let sequence=0,currentOwner=owner;
 const context={ownerId:owner,isCurrent:()=>currentOwner===owner,overflowEnabled:true,accountOverflowQualified:true};
 const storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(target==='indexeddb'&&k.startsWith(tripRecoveryStorageKey(owner,'ack-projection-trip')))throw new DOMException('Synthetic quota','QuotaExceededError');values.set(k,v);},removeItem:k=>values.delete(k)};
 const broker=createTwoStoreTripPersistence(storage,driver,context),input=t=>createDurableBuilderInputPersistence(storage,driver,{...context,trip:t});
 const attempts=[];let fault=null,commitFault=null,projectionInFlight=false,afterFault=null,latest;
 const run=driver.run.bind(driver);
 driver.run=async(...args)=>{
  if(projectionInFlight&&args[2]==='readwrite'&&args[1]?.startsWith('edit:')&&commitFault){const change=commitFault;commitFault=null;await change();afterFault=bytes({values,driver});}
  return run(...args);
 };
 const save=async(t,m,id)=>{const p=await input(t).prepare(m.draft,id+':input');assert.equal(p.ok,true);
  if(m.projectionOnly&&fault){const change=fault;fault=null;await change();afterFault=bytes({values,driver});}
  projectionInFlight=Boolean(m.projectionOnly);
  const r=await createTwoStoreTripPersistence(storage,driver,{...context,isCurrent:()=>context.isCurrent()&&(m.isCurrent?.()??true)}).save(t,{...m,isCurrent:undefined,writeId:id,entries:[p.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:owner,tripId:t.id,writeId:id},input:p.input,receipt:null}});
  projectionInFlight=false;
  attempts.push({projection:Boolean(m.projectionOnly),result:r,metadata:m});return r;
 };
 const initial=fixture(),first=await save(initial,{newTripOrClone:true,draft:createBuilderInputDraft(initial,0,owner)},'initial');assert.equal(first.stored,true);
 latest={...initial,updatedAt:nextTripUpdatedAt(initial.updatedAt)};assert.equal((await broker.acknowledge(initial,latest,first.handle)).outcome,'acknowledged');
 const create=async()=>createAsyncBuilderEditSession({initialTrip:latest,initialCanonicalTrip:latest,getOwnerId:()=>currentOwner,
  readAcknowledgedProjection:t=>broker.readProjectionPredecessor?.(t),readDraft:t=>input(t).read(),writeDraft:(t,d)=>input(t).write(d),
  saveRecovery:(t,m)=>save(t,m,'edit:'+ ++sequence),acknowledgeRecovery:(reviewed,canonical,handle)=>broker.acknowledge(reviewed,canonical,handle),
  persistAccount:async t=>latest=requireReadableTripDocument(canonicalTripForOwner(owner,t,nextTripUpdatedAt(t.updatedAt))),
  reconcile:async request=>({...request,results:request.dispatched.map(unit=>({...unit,phase:'complete'})),legs:request.trip.legs.filter(leg=>request.dispatched.some(unit=>unit.kind==='leg'&&unit.targetId===leg.id))}),
  now:()=> '2026-11-02T21:20:00.000Z',schedule:()=>()=>{}});
 let session=await create();
 return {values,driver,storage,broker,attempts,get session(){return session},get latest(){return latest},get afterFault(){return afterFault},
  fault(change){fault=change;},commitFault(change){commitFault=change;},setOwner(value){currentOwner=value;},async cold(){session.dispose();const read=await broker.read(latest.id);assert.equal(read.kind,'found');assert.equal(read.recovery,null);latest=requireReadableTripDocument(read.trip);session=await create();},
  async author(){const before=session.getSnapshot(),stop=before.trip.stops[0],intent=before.trip.brief.intent.route.destinations.find(d=>d.stopIds.includes(stop.id));const r=await session.accept({kind:'nights',stopId:stop.id,intentId:intent.id,nights:1},before.inputRevision);assert.equal(r.ok,true);assert.equal(await session.flush(),true);assert.equal(session.getSnapshot().recovery,null);},
 };
}
for(const [target,cold] of [['native',false],['indexeddb',false],['indexeddb',true]])test(`account ACK allows necessary completion: ${target}, cold=${cold}`,async()=>{
 const h=await harness(target);try{await h.author();if(cold)await h.cold();const prior=[...h.driver.generations];
  await h.session.resumeNecessaryWork();const after=h.session.getSnapshot();assert.equal(after.routeWorkBlocked,false,JSON.stringify(h.attempts.map(a=>({projection:a.projection,witness:a.metadata.projectionOnly?.acknowledged?.backend,result:a.result}))));assert.equal(after.pendingUnits.filter(unit=>unit.kind!=='recommendation').length,0);
  assert.equal(h.attempts.at(-1).projection,true);assert.equal(h.attempts.at(-1).result.stored,true);
  for(const [key,raw] of prior)assert.equal(h.driver.generations.get(key),raw,'prior recovery generations remain exact');
  assert.equal(await h.session.flush(),true);const reopened=await h.broker.read(after.trip.id);assert.equal(reopened.kind,'found');assert.equal(reopened.recovery,null);assert.deepEqual(reopened.trip.stops.map(s=>s.nights),[1,4]);
 }finally{h.session.dispose();}
});
async function changeInputHead(h){
 const scope={ownerId:owner,tripId:h.latest.id,kind:'builder-input'},raw=h.driver.heads.get(entryHeadKey(scope)),handle=JSON.parse(raw);
 const input=JSON.parse(h.driver.generations.get(entryGenerationKey(scope,handle.writeId)));
 const fork={...input,handle:{...input.handle,writeId:'same-payload-fork'},parent:input.handle,retainedPreviousRaw:input.raw};
 assert.equal((await createRecoveryEntryStore(h.driver,{ownerId:owner,isCurrent:()=>true}).commit({raw:JSON.stringify(fork),expectedHead:input.handle,admission:'existing-domain'})).kind,'verified');
}
async function addMetadata(h,kind){
 const scope={ownerId:owner,tripId:h.latest.id},head=JSON.parse(h.driver.heads.get(h.driver.scopeKey(scope))),body=JSON.parse(h.driver.generations.get(h.driver.key(scope,head.writeId)));
 if(kind==='lifecycle'){assert.equal(await createRecoveryLifecycle(h.driver,{ownerId:owner,isCurrent:()=>true}).write(body,{state:'pending'}),true);return;}
 const entry={version:1,handle:{version:1,backend:'indexeddb-entry',...scope,kind:'recovery-claim',writeId:'concurrent-claim'},parent:null,legacyRaw:null,retainedPreviousRaw:null,raw:'A concurrent claim slot is not absent'};
 // Dedicated claim transactions own this protected slot; the generic entry setter correctly refuses it.
 // Inject an opaque concurrent slot at the driver boundary to prove absence is fenced.
 await h.driver.runEntry(entry.handle,null,'readwrite',()=>({value:null,mutation:{scope:entry.handle,writeId:entry.handle.writeId,raw:JSON.stringify(entry),headRaw:JSON.stringify(entry.handle)}}));
}
for(const [when,mode] of [['before','input-fork'],['before','lifecycle'],['before','claim'],['commit','input-fork'],['commit','lifecycle'],['commit','claim'],['commit','ack-change']])test(`ACK fence preserves concurrent ${mode} at ${when}`,async()=>{
 const h=await harness();try{await h.author();const mutate=async()=>{
  if(mode==='input-fork')await changeInputHead(h);
  else if(mode==='lifecycle'||mode==='claim')await addMetadata(h,mode);
  else {const scope={ownerId:owner,tripId:h.latest.id},head=JSON.parse(h.driver.heads.get(h.driver.scopeKey(scope))),key=h.driver.key(scope,head.writeId);h.driver.acknowledgements.delete(key);}
 };if(when==='commit')h.commitFault(mutate);else h.fault(mutate);
 await h.session.resumeNecessaryWork();assert.equal(h.attempts.at(-1).result.stored,false);assert.ok(h.afterFault);assert.equal(bytes(h),h.afterFault,'concurrent proof/input generations remain unchanged by rejected completion');
 }finally{h.session.dispose();}
});
test('cold proof refuses pre-existing divergent native navigation and foreign canonical values',async()=>{
 const h=await harness();try{await h.author();h.values.set(currentTripStorageKey(owner),JSON.stringify({version:2,ownerId:owner,tripId:'other-trip'}));const before=bytes(h);
  assert.equal(await h.broker.readProjectionPredecessor(h.latest),undefined);assert.equal(bytes(h),before);
  assert.equal(await h.broker.readProjectionPredecessor({...h.latest,ownerId:'foreign'}),undefined);
  assert.equal(await h.broker.readProjectionPredecessor({...h.latest,title:'Different canonical document'}),undefined);
 }finally{h.session.dispose();}
});
test('owner rotation cannot use a retained ACK capability',async()=>{
 const h=await harness();try{await h.author();const before=bytes(h),count=h.attempts.length;h.setOwner('other-owner');await h.session.resumeNecessaryWork();assert.equal(h.attempts.length,count);assert.equal(bytes(h),before);}finally{h.session.dispose();}
});
test('native adapter reads the old head ACK atomically while committing a new generation',async()=>{
 const model=new IndexedDbModel(),driver=await openIndexedDbRecoveryDriver(model.factory()),context={ownerId:'owner-a',isCurrent:()=>true},store=createRecoveryDomainStore(driver,context);
 try{const first=envelope('old'),raw=JSON.stringify(first);assert.equal((await store.commit({raw,expectedHead:null,admission:'native-setter-quota'})).kind,'verified');
  assert.equal((await store.recordTrustedAccountAck({handle:first.handle,rawRecovery:first.rawRecovery,canonicalRaw:canonicalAck(first)})).kind,'journaled');
  const observed=await driver.run(first.handle,'next','readonly',state=>({value:{selected:state.acknowledgementRaw,head:state.headAcknowledgementRaw}}));assert.equal(observed.selected,undefined);assert.equal(typeof observed.head,'string');
  const next=envelope('next','owner-a',first.handle);const result=await store.commit({raw:JSON.stringify(next),expectedHead:first.handle,admission:'existing-domain',projectionFence:{sourceRaw:raw,currentRaw:JSON.stringify(first.handle),acknowledgementRaw:observed.head,entries:[]}});assert.equal(result.kind,'verified');
  const after=await driver.run(first.handle,null,'readonly',state=>({value:state.headAcknowledgementRaw}));assert.equal(after,undefined,'readback must not mistake the prior ACK for a new-generation ACK');
 }finally{driver.close?.();}
});
for(const mode of ['missing-ack','changed-ack','newer-head','other-navigation','cleared-navigation','native-pointer'])test(`ACK continuation refuses ${mode} without writes`,async()=>{
 const h=await harness();try{await h.author();h.fault(async()=>{
  const scope={ownerId:owner,tripId:h.latest.id},head=JSON.parse(h.driver.heads.get(h.driver.scopeKey(scope))),key=h.driver.key(scope,head.writeId);
  if(mode==='missing-ack')h.driver.acknowledgements.delete(key);
  if(mode==='changed-ack'){const ack=JSON.parse(h.driver.acknowledgements.get(key));ack.canonicalRaw=JSON.stringify({...JSON.parse(ack.canonicalRaw),title:'Distinct canonical decision'});h.driver.acknowledgements.set(key,JSON.stringify(ack));}
  if(mode==='newer-head')assert.equal((await h.broker.save({...h.latest,title:'A newer device decision'},{canonicalBase:h.latest,writeId:'newer'})).stored,true);
  if(mode==='other-navigation')h.driver.heads.set(JSON.stringify([owner]),JSON.stringify({...head,tripId:'other-trip'}));
  if(mode==='cleared-navigation')h.driver.heads.set(JSON.stringify([owner]),JSON.stringify({version:1,backend:'cleared',ownerId:owner,nativePointerRaw:null}));
  if(mode==='native-pointer')h.values.set(currentTripStorageKey(owner),JSON.stringify({version:2,ownerId:owner,tripId:'other-trip'}));
 });await h.session.resumeNecessaryWork();assert.equal(h.attempts.at(-1).projection,true);assert.equal(h.attempts.at(-1).result.stored,false);assert.equal(h.attempts.at(-1).result.writeAttempted,false);assert.equal(bytes(h),h.afterFault);
 }finally{h.session.dispose();}
});
