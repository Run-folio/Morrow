import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {createTripCreationToken,decodeTripCreationToken,creationReceiptRaw,decodeCreationReceipt,prepareTripCreationCheckpoint} from '../lib/easyt/trip-creation-provenance.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {tripRecoveryStorageKey} from '../lib/easyt/storage.ts';
import {tripCreationStorageKey,tripReceiptStorageKey} from '../lib/easyt/private-browser-context.ts';
import {createTripReceiptPersistence} from '../lib/easyt/trip-receipt-persistence.ts';
import {createRecoveryDomainStore} from '../lib/easyt/durable-recovery-store.ts';
import {envelope} from './helpers/durable-recovery-fixture.ts';
import {readReservedTripCreation,validCreationReceiptRebind} from '../lib/easyt/trip-creation-provenance.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';

function fixture(quota:'body'|'receipt'|'reservation'|null=null) {
  const trip=homeRecoveryFixture().trip,values=new Map<string,string>(),driver=new MemoryRecoveryDriver();
  const blocked=quota==='body'?tripRecoveryStorageKey(null,trip.id):quota==='receipt'?tripReceiptStorageKey(null,trip.id):quota==='reservation'?tripCreationStorageKey(null,trip.id):null;
  const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,raw:string)=>{if(blocked&&key.startsWith(blocked))throw new DOMException('Synthetic quota','QuotaExceededError');values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
  const context={ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true};
  const token=createTripCreationToken(trip,null,'spreadsheet-import','retry-operation'),broker=createTwoStoreTripPersistence(storage,driver,context);
  const checkpoint=async()=>{
    const prepared=await prepareTripCreationCheckpoint(storage,driver,context,trip,token);assert.equal(prepared.ok,true);
    return broker.save(trip,{creation:token,newTripOrClone:true,writeId:token.initialWriteId,replace:prepared.replacement,expectedRecoverySource:prepared.expectedRecoverySource,
      entries:prepared.entries,entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:trip.id,writeId:token.initialWriteId},input:null,receipt:prepared.receipt}});
  };
  return {trip,values,driver,storage,context,token,broker,checkpoint};
}
for(const quota of [null,'body','receipt','reservation'] as const)test(`exact creation retry is idempotent after ${quota??'native'} completion`,async()=>{
  const f=fixture(quota);assert.equal((await f.checkpoint()).stored,true);
  const before={values:new Map(f.values),generations:new Map(f.driver.generations)};
  const retry=await f.checkpoint();assert.equal(retry.stored,true);assert.equal(retry.receiptAcknowledged,true);
  assert.deepEqual(f.values,before.values,'retry must not rewrite body timestamps or pointers');assert.deepEqual(f.driver.generations,before.generations);
});
test('generic receipt pairing cannot mint creation provenance for an existing trip',async()=>{
  const f=fixture();const body=await f.broker.save(f.trip,{newTripOrClone:true});assert.equal(body.stored,true);
  const receipt=await createTripReceiptPersistence(f.storage,f.driver,{...f.context,tripId:f.trip.id}).prepare(creationReceiptRaw(f.token,null),'forged-completion');assert.equal(receipt.ok,true);
  const before=new Map(f.values);
  const result=await f.broker.save(f.trip,{replace:body.handle,canonicalBase:f.trip,entries:[receipt.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:f.trip.id,writeId:'generic'},input:null,receipt:receipt.receipt}});
  assert.equal(result.stored,false);assert.deepEqual(f.values,before);
});
test('direct domain commit cannot attach a fresh creation receipt to old identity',async()=>{
  const driver=new MemoryRecoveryDriver(),context={ownerId:null,isCurrent:()=>true},domain=createRecoveryDomainStore(driver,context);
  const first=envelope('legacy',null);first.entry.input=null;first.entry.receipt=null;
  assert.equal((await domain.commit({raw:JSON.stringify(first),expectedHead:null,admission:'native-setter-quota'})).kind,'verified');
  const candidate=envelope('next',null,first.handle),trip=JSON.parse(candidate.rawRecovery).trip;
  const f=fixture(),token=createTripCreationToken(trip,null,'curated-route','retro');
  const receipt=await createTripReceiptPersistence(f.storage,driver,{...f.context,tripId:trip.id}).prepare(creationReceiptRaw(token,null),'retro-completed');assert.equal(receipt.ok,true);
  candidate.entry.input=null;candidate.entry.receipt=receipt.receipt;
  const before=new Map(driver.generations);
  assert.equal((await domain.commit({raw:JSON.stringify(candidate),expectedHead:first.handle,admission:'existing-domain',entries:[receipt.entry]})).kind,'protected-conflict');
  assert.deepEqual(driver.generations,before);
});
test('verified reservation exposes continuation before later preparation fails',async()=>{
  const f=fixture();let notified=false;
  const prepared=await prepareTripCreationCheckpoint(f.storage,f.driver,f.context,f.trip,f.token,()=>{notified=true;f.driver.fail=new Error('Synthetic unavailable');});
  assert.equal(prepared.ok,false);assert.equal(notified,true);f.driver.fail=null;
  assert.equal((await readReservedTripCreation(f.storage,f.driver,f.context,f.trip.id,f.token.operationId))?.trip.id,f.trip.id);
  assert.equal((await f.checkpoint()).stored,true);
});
test('competing operations and owner switches cannot replace the reservation or grant completion',async()=>{
  const f=fixture();assert.equal((await prepareTripCreationCheckpoint(f.storage,f.driver,f.context,f.trip,f.token)).ok,true);
  const before=new Map(f.values),other=createTripCreationToken(f.trip,null,'curated-route','competing');
  assert.equal((await prepareTripCreationCheckpoint(f.storage,f.driver,f.context,f.trip,other)).ok,false);assert.deepEqual(f.values,before);
  const switched={...f.context,isCurrent:()=>false};
  assert.equal((await prepareTripCreationCheckpoint(f.storage,f.driver,switched,f.trip,f.token)).ok,false);assert.deepEqual(f.values,before);
  assert.equal(await readReservedTripCreation(f.storage,f.driver,{...f.context,ownerId:'foreign'},f.trip.id,f.token.operationId),null);
});
test('account rebind accepts only the exact canonical ACK and retained guest source',()=>{
  const f=fixture(),canonical=canonicalTripForOwner('owner-a',f.trip),raw=creationReceiptRaw(f.token,'owner-a');
  const binding={guestReservationRaw:JSON.stringify(f.token),guestReceiptRaw:creationReceiptRaw(f.token,null),
    submittedRecoveryRaw:JSON.stringify({version:2,ownerId:null,tripId:f.trip.id,writeId:f.token.initialWriteId,trip:f.trip,state:'pending',savedAt:'2026-10-23T00:00:00.000Z'}),canonicalRaw:JSON.stringify(canonical)};
  assert.equal(validCreationReceiptRebind(binding,raw,canonical,'owner-a'),true);
  for(const field of Object.keys(binding))assert.equal(validCreationReceiptRebind({...binding,[field]:'{}'},raw,canonical,'owner-a'),false,field);
  for(const owner of [null,'foreign'])assert.equal(validCreationReceiptRebind(binding,raw,canonical,owner),false);
  for(const change of [{id:'foreign-trip'},{title:'unacknowledged edit'}])assert.equal(validCreationReceiptRebind(binding,raw,{...canonical,...change},'owner-a'),false);
  const edited={...canonical,title:'changed ACK and target'};
  assert.equal(validCreationReceiptRebind({...binding,canonicalRaw:JSON.stringify(edited)},raw,edited,'owner-a'),false);
});

test('creation proof is explicit, immutable and owner/trip/operation bound',()=>{
  const trip=homeRecoveryFixture().trip;
  const token=createTripCreationToken(trip,null,'curated-route','operation-a');
  assert.equal(decodeTripCreationToken(JSON.stringify(token),null,trip.id)?.operationId,'operation-a');
  for(const changed of [{ownerId:'foreign'},{tripId:'other'},{initialWriteId:'other'},{source:'edit'},{initialTripRaw:'{}'}])
    assert.equal(decodeTripCreationToken(JSON.stringify({...token,...changed}),null,trip.id),null);
  const raw=creationReceiptRaw(token,null);
  assert.ok(decodeCreationReceipt(raw,null,trip.id));
  assert.ok(decodeCreationReceipt(creationReceiptRaw(token,'owner-a'),'owner-a',trip.id));
  assert.equal(decodeCreationReceipt(raw,'owner-a',trip.id),null);
});

test('fresh creation requires reservation before body and does not bless existing trips',async()=>{
  const trip=homeRecoveryFixture().trip, values=new Map<string,string>(),driver=new MemoryRecoveryDriver();
  const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,
    getItem:(key:string)=>values.get(key)??null,setItem:(key:string,raw:string)=>{values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
  const context={ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true};
  const token=createTripCreationToken(trip,null,'spreadsheet-import','import-a');
  const first=await prepareTripCreationCheckpoint(storage,driver,context,trip,token);
  assert.equal(first.ok,true);assert.equal(values.has(tripRecoveryStorageKey(null,trip.id)),false);
  const other={...trip,id:'existing-no-proof'};
  assert.equal((await createTwoStoreTripPersistence(storage,driver,context).save(other,{newTripOrClone:true})).stored,true);
  const before=new Map(values);
  const refused=await prepareTripCreationCheckpoint(storage,driver,context,other,createTripCreationToken(other,null,'curated-route','retroactive'));
  assert.equal(refused.ok,false);assert.deepEqual(values,before);
});
