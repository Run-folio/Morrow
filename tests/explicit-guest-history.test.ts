import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {saveTripRecoveryToStorage,saveExplicitGuestTripForOwnerInStorage,cacheCanonicalTripToStorage,currentTripStorageKey} from '../lib/easyt/storage.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {homepageReceiptForProjection,homepageHandoffMatchesTrip,HOME_TRIP_DRAFT_KEY} from '../lib/easyt/home-trip-handoff.ts';
import {builderInputDraftKey,createBuilderInputDraft,updateBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {createDurableHomepagePersistence} from '../lib/easyt/homepage-persistence.ts';
import {completedTripReceipt} from '../lib/easyt/trip-receipt-persistence.ts';
import {createPendingIntakeReceipt} from '../lib/easyt/home-trip-handoff.ts';

function document(ownerId:string|null,id:string){
  const source=homeRecoveryFixture(ownerId),trip={...source.trip,id,status:'planned' as const};
  const draft=structuredClone(source.draft);draft.handoffId='synthetic-handoff-'+id;
  const receipt=homepageReceiptForProjection(source.snapshot,draft,id);draft.homepage!.receipt=receipt;
  assert.equal(homepageHandoffMatchesTrip(draft,trip),true);
  return {trip,draft,stored:{snapshot:source.snapshot,receipt}};
}
function fixture(withAccountHistory:boolean){
  const values=new Map<string,string>(),storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,
    getItem:(key:string)=>values.get(key)??null,setItem:(key:string,raw:string)=>{values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
  const old=document('synthetic-owner','synthetic-old-account-trip');
  if(withAccountHistory){
    values.set(homepageInputStorageKey('synthetic-owner'),JSON.stringify(old.stored));
    assert.equal(cacheCanonicalTripToStorage(storage,old.trip),true);
    assert.equal(saveTripRecoveryToStorage(storage,{...old.trip,title:'Separate protected old account work'},
      {ownerId:'synthetic-owner',writeId:'synthetic-protected-old',state:'conflict'}).stored,true);
    values.set(builderInputDraftKey('synthetic-owner',old.trip.id),JSON.stringify(createBuilderInputDraft(old.trip)));
  }
  const guest=document(null,'synthetic-new-guest-trip');
  values.set(homepageInputStorageKey(null),JSON.stringify(guest.stored));values.set(HOME_TRIP_DRAFT_KEY,JSON.stringify(guest.draft));
  assert.equal(saveTripRecoveryToStorage(storage,guest.trip,{ownerId:null,writeId:'synthetic-new-guest'}).stored,true);
  values.set(builderInputDraftKey(null,guest.trip.id),JSON.stringify(createBuilderInputDraft(guest.trip)));
  const before=new Map(values),calls:Array<{method:string|undefined;id:string;ownerHeader:string|null}>=[];
  const request:typeof fetch=async(_url,init)=>{const trip=JSON.parse(init!.body as string);calls.push({method:init?.method,id:trip.id,ownerHeader:new Headers(init?.headers).get('x-morrovia-expected-owner')});
    return Response.json({trip:canonicalTripForOwner('synthetic-owner',trip),outcome:'promoted'},{status:201});};
  return {values,storage,old,guest,before,calls,request,driver:new MemoryRecoveryDriver(),context:{ownerId:'synthetic-owner',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true}};
}

test('history control: clean account destination saves the requested guest identity',async()=>{
  const f=fixture(false),result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.trip.id,f.request);
  assert.equal(result.accountAcknowledged,true);assert.equal(result.trip.id,f.guest.trip.id);assert.equal(result.deviceComplete,true);
  assert.ok(f.calls.length>0);for(const call of f.calls){assert.equal(call.id,f.guest.trip.id);assert.equal(call.ownerHeader,'synthetic-owner');}
});

test('new guest save with unrelated completed account history preserves both identities and every old branch',async()=>{
  const f=fixture(true);
  const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.trip.id,f.request);
  assert.equal(result.accountAcknowledged,true);assert.equal(result.trip.id,f.guest.trip.id);assert.notEqual(result.trip.id,f.old.trip.id);
  assert.equal(result.deviceComplete,true,'account success alone is insufficient for complete local continuation');
  assert.ok(f.calls.length>0);for(const call of f.calls){assert.equal(call.id,f.guest.trip.id);assert.equal(call.ownerHeader,'synthetic-owner');}
  for(const [key,raw] of f.before)if(key!==currentTripStorageKey('synthetic-owner'))assert.equal(f.values.get(key),raw,'preexisting account and guest records remain exact');
});

test('different same-trip account draft remains protected before any account request',async()=>{
  const f=fixture(false),key=builderInputDraftKey('synthetic-owner',f.guest.trip.id);
  const ownerTrip={...f.guest.trip,ownerId:'synthetic-owner'};
  const edited=updateBuilderInputDraft(createBuilderInputDraft(ownerTrip),ownerTrip,{kind:'origin'},'Distinct unsaved account input');
  f.values.set(key,JSON.stringify(edited));const before=new Map(f.values);
  await assert.rejects(saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.trip.id,f.request),
    (error:any)=>error.name==='BrowserRecoveryReadError'&&error.reason==='destination-input-exists');
  assert.equal(f.calls.length,0);assert.deepEqual(f.values,before);
});

async function retainedHome(f:ReturnType<typeof fixture>, mode='completed') {
  const store=createDurableHomepagePersistence(f.storage,f.driver,f.context);
  let stored:any=structuredClone(f.old.stored),draft:any=structuredClone(f.old.draft);
  if(mode==='pending'){
    const receipt=createPendingIntakeReceipt(stored.snapshot,{handoffId:'pending-owner-input',tripId:'pending-owner-trip'});
    stored={snapshot:receipt.frozenSnapshot,receipt};draft={version:2,phase:'pending-interpretation',receipt};
  } else if(mode==='same-trip') {
    const receipt=homepageReceiptForProjection(stored.snapshot,draft,f.guest.trip.id);stored.receipt=receipt;draft.homepage.receipt=receipt;
  } else if(mode==='edited-input') {
    // Home's actual typing handler clears the previous canonical selection.
    stored.snapshot.entries[0].text+=' changed after completion';stored.snapshot.entries[0].selection=null;
  }
  else if(mode==='changed-receipt') {stored.receipt.semanticInputFingerprint='different-proof';draft.homepage.receipt.semanticInputFingerprint='different-proof';}
  const raw=JSON.stringify({version:1,inputRaw:JSON.stringify(stored),draftRaw:JSON.stringify(draft)});
  const written=await store.write(raw,{writeId:'retained-owner-home'});assert.equal(written.kind,'verified','fixture uses the real Home writer');
  const state=await store.read();assert.equal(state.kind,'ready');if(state.kind!=='ready')throw Error('Fixture Home must be readable');
  return {store,state};
}

test('completed unrelated owner Home draft remains exact while explicit guest promotion completes',async()=>{
  const f=fixture(true),home=await retainedHome(f);assert.ok(home.state.draft);
  assert.ok(completedTripReceipt(home.state.raw,'synthetic-owner',f.old.trip.id));
  const before=new Map(f.values),generations=new Map(f.driver.generations);
  const result=await saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.trip.id,f.request);
  assert.equal(result.accountAcknowledged,true);assert.equal(result.deviceComplete,true);assert.equal(result.trip.id,f.guest.trip.id);
  assert.equal((await home.store.read()).kind,'ready');assert.deepEqual(await home.store.read(),home.state);
  for(const [key,raw]of before)if(key!==currentTripStorageKey('synthetic-owner'))assert.equal(f.values.get(key),raw,'old and guest bytes retained');
  for(const [key,raw]of generations)assert.equal(f.driver.generations.get(key),raw,'old immutable generations retained');
  assert.ok(f.calls.length>0&&f.calls.every(c=>c.id===f.guest.trip.id));
});

for(const mode of ['pending','same-trip','edited-input','changed-receipt'])test(`retained ${mode} owner Home stays protected without account dispatch`,async()=>{
  const f=fixture(true);await retainedHome(f,mode);const before=new Map(f.values),generations=new Map(f.driver.generations);
  await assert.rejects(saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.trip.id,f.request),(e:any)=>e.kind==='protected');
  assert.equal(f.calls.length,0);assert.deepEqual(f.values,before);assert.deepEqual(f.driver.generations,generations);
});

test('foreign owner receipt is never authority to bypass destination Home protection',async()=>{
  const f=fixture(true),home=await retainedHome(f);const key=homepageInputStorageKey('synthetic-owner');
  const stored=JSON.parse(home.state.inputRaw!);stored.receipt.ownerId='foreign-owner';f.values.set(key,JSON.stringify(stored));const before=new Map(f.values);
  await assert.rejects(saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.trip.id,f.request),(e:any)=>e.kind==='protected');
  assert.equal(f.calls.length,0);assert.deepEqual(f.values,before);
});

test('malformed owner Home remains protected without account dispatch',async()=>{
  const f=fixture(true);await retainedHome(f);f.values.set(homepageInputStorageKey('synthetic-owner'),'{unsupported');const before=new Map(f.values);
  await assert.rejects(saveExplicitGuestTripForOwnerInStorage(f.storage,f.driver,f.context,f.guest.trip.id,f.request),(e:any)=>e.kind==='protected');
  assert.equal(f.calls.length,0);assert.deepEqual(f.values,before);
});
