import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {saveExplicitGuestTripForOwnerInStorage,saveTripRecoveryToStorage} from '../lib/easyt/storage.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {jsonbObjectOrder} from './fixtures/save-reopen-trip.ts';
import {builderNightsCommand,prepareBuilderHandlerEdits} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';

test('signed-in creation and explicit guest handover admit the same first cold edit while preserving a guest source',async()=>{
 const ownerId='owner-a';
 const context={ownerId,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true};
 const f=homeRecoveryFixture();
 const input={...f.trip,status:'planned' as const};
 const results=[];
 for(const origin of ['signed-first','guest-then-explicit-save'] as const){
  const bytes=new Map(origin==='signed-first'?[]:f.native);
  const storage={get length(){return bytes.size;},key:(index:number)=>[...bytes.keys()][index]??null,
   getItem:(key:string)=>bytes.get(key)??null,setItem:(key:string,value:string)=>{bytes.set(key,value);},removeItem:(key:string)=>{bytes.delete(key);}};
  const driver=new MemoryRecoveryDriver();
  const broker=()=>createTwoStoreTripPersistence(storage,driver,context);
  const trace:string[]=[];
  let opened;
  let sourceBytes:Array<[string,string]>=[];
  if(origin==='signed-first'){
   const ownerInput={...input,ownerId};
   const initial=await broker().save(ownerInput,{writeId:'signed-first-create',newTripOrClone:true});
   assert.equal(initial.stored,true);
   opened=canonicalTripForOwner(ownerId,ownerInput);
   trace.push('owner-device-save','owner-account-ack');
   assert.equal((await broker().acknowledge(ownerInput,opened,initial.handle)).outcome,'acknowledged');
  } else {
   assert.equal(saveTripRecoveryToStorage(storage,input,{ownerId:null,writeId:'guest-source'}).stored,true);
   sourceBytes=[...bytes];trace.push('guest-device-save');
   // Merely changing the session owner exposes no account copy of the guest input.
   assert.equal((await broker().read(input.id)).kind,'missing');
   const saved=await saveExplicitGuestTripForOwnerInStorage(storage,driver,context,input.id,async(_url,init)=>{
    trace.push(init!.method!);
    const body=JSON.parse(init!.body as string);
    return Response.json({trip:canonicalTripForOwner(ownerId,body),outcome:'promoted'},{status:201});
   });
   assert.equal(saved.accountAcknowledged,true);assert.equal(saved.deviceComplete,true);
   opened=saved.trip;
   assert.deepEqual(trace,['guest-device-save','POST','PUT']);
  }
  const reopened=await broker().read(input.id);assert.equal(reopened.kind,'found');
  if(reopened.kind!=='found') throw Error('Expected cold account trip read');
  assert.deepEqual(reopened.trip,JSON.parse(JSON.stringify(opened)),"cold device read matches the acknowledged account document");
  assert.equal(reopened.recovery,null,"account acknowledgement is not pending recovery");
  const base=prepareTripDocumentForWrite(jsonbObjectOrder(reopened.trip));
  const firstStop=base.stops[0];
  assert.ok(firstStop && firstStop.nights!==null, "cold account read retains the authored first-stop nights");
  const nights=firstStop.nights+1;
  const command=builderNightsCommand(base,firstStop.id,nights);assert.ok(command);
  const edit=prepareBuilderHandlerEdits(base,[command],builderDocumentFingerprint(base));assert.ok(edit.ok);
  const write=await broker().save(edit.trip,{canonicalBase:base,writeId:'post-reopen-nights'});
  assert.equal(write.stored,true,`${origin} cold edit may not report a save conflict`);
  const canonical=prepareTripDocumentForWrite(jsonbObjectOrder({...edit.trip,updatedAt:nextTripUpdatedAt(base.updatedAt)}));
  assert.equal((await broker().acknowledge(edit.trip,canonical,write.handle)).outcome,'acknowledged');
  const final=await broker().read(input.id);assert.equal(final.kind,'found');
  if(final.kind!=='found') throw Error('Expected second cold account trip read');
  assert.equal(final.trip.stops[0]!.nights,nights);
  results.push(final.trip.stops.map(({id,name,nights})=>({id,name,nights})));
  for(const [key,raw] of sourceBytes) assert.equal(storage.getItem(key),raw,'guest source survives ownership and edit byte-for-byte');
 }
 assert.deepEqual(results[0],results[1],'both origins converge on identical stop identities and night allocations');
});
