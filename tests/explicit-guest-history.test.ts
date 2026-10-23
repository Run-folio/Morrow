import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {saveTripRecoveryToStorage,saveExplicitGuestTripForOwnerInStorage,cacheCanonicalTripToStorage,currentTripStorageKey} from '../lib/easyt/storage.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {homepageReceiptForProjection,homepageHandoffMatchesTrip,HOME_TRIP_DRAFT_KEY} from '../lib/easyt/home-trip-handoff.ts';
import {builderInputDraftKey,createBuilderInputDraft,updateBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';

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
