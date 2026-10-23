import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {createTripReceiptPersistence,completedTripReceipt} from '../lib/easyt/trip-receipt-persistence.ts';
import {tripReceiptStorageKey,homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {createTwoStoreEntryPersistence} from '../lib/easyt/two-store-entry-persistence.ts';
import {tripRecoveryStorageKey} from '../lib/easyt/storage.ts';
import {createDurableHomepagePersistence} from '../lib/easyt/homepage-persistence.ts';
import {createRecoveryDomainStore} from '../lib/easyt/durable-recovery-store.ts';

function fixture(){
 const source=homeRecoveryFixture('owner-a'),values=new Map<string,string>();
 const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,
  setItem:(k:string,raw:string)=>{values.set(k,raw)},removeItem:(k:string)=>{values.delete(k)}};
 const raw=JSON.stringify({version:1,inputRaw:source.native[0]![1],draftRaw:source.native[1]![1]});
 return {...source,values,storage,raw,driver:new MemoryRecoveryDriver(),context:{ownerId:'owner-a',tripId:source.trip.id,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true}};
}

test('completed receipt validates owner, trip and semantic proof without granting pending intent',()=>{
 const f=fixture();assert.ok(completedTripReceipt(f.raw,'owner-a',f.trip.id));
 assert.equal(completedTripReceipt(f.raw,'owner-b',f.trip.id),null);assert.equal(completedTripReceipt(f.raw,'owner-a','different-trip'),null);
 for(const mutation of ['semantic','legacy','pending','review','draft-trip','draft-semantic']){
  const bundle=JSON.parse(f.raw),input=JSON.parse(bundle.inputRaw);
  if(mutation==='semantic')input.snapshot.travellers={state:'selected',value:4};
  if(mutation==='legacy')delete input.receipt.semanticInputFingerprint;
  if(mutation==='pending')input.receipt.version=2;
  if(mutation==='review')input.review={};
  if(mutation.startsWith('draft-')){const draft=JSON.parse(bundle.draftRaw);if(mutation==='draft-trip')draft.homepage.receipt.tripId='another-trip';else draft.homepage.receipt.semanticInputFingerprint='different-semantic-proof';bundle.draftRaw=JSON.stringify(draft);}
  bundle.inputRaw=JSON.stringify(input);assert.equal(completedTripReceipt(JSON.stringify(bundle),'owner-a',f.trip.id),null,mutation);
 }
});

test('legacy trip without receipt remains readable and reading never migrates storage',async()=>{
 const f=fixture(),before=[...f.values];
 const receipt=await createTripReceiptPersistence(f.storage,f.driver,f.context).read();
 assert.equal(receipt.kind,'ready');if(receipt.kind==='ready')assert.equal(receipt.raw,null);assert.deepEqual([...f.values],before);
});

test('paired completed receipt survives native acknowledgement and later trip edit without touching Home',async()=>{
 const f=fixture(),homeKey=homepageInputStorageKey('owner-a');f.values.set(homeKey,'Unrelated Home must stay exact');
 const adapter=createTripReceiptPersistence(f.storage,f.driver,f.context),prepared=await adapter.prepare(f.raw,'receipt-first');assert.equal(prepared.ok,true);if(!prepared.ok)return;
 const tripStore=createTwoStoreTripPersistence(f.storage,f.driver,f.context);
 const saved=await tripStore.save(f.trip,{newTripOrClone:true,writeId:'body-first',entries:[prepared.entry],
  entry:{pointer:{version:1,backend:'indexeddb',ownerId:'owner-a',tripId:f.trip.id,writeId:'body-first'},input:null,receipt:prepared.receipt}});
 const receiptRead=await adapter.read();
 assert.equal(saved.stored,true,JSON.stringify({saved,receiptKind:receiptRead.kind,reason:'reason'in receiptRead?receiptRead.reason:null,keys:[...f.values.keys()]}));assert.equal(saved.receiptAcknowledged,true);
 assert.equal((await adapter.read()).kind,'ready');assert.equal(f.storage.getItem(tripReceiptStorageKey('owner-a',f.trip.id)),f.raw);
 assert.equal((await tripStore.acknowledge(f.trip,f.trip,saved.handle)).outcome,'acknowledged');
 assert.equal(f.storage.getItem(tripReceiptStorageKey('owner-a',f.trip.id)),f.raw);
 const edited={...f.trip,title:'Later traveller title'},later=await tripStore.save(edited,{canonicalBase:f.trip,expectedRecoverySource:f.trip,writeId:'later-edit'});
 assert.equal(later.stored,true);const reopened=await adapter.read();assert.equal(reopened.kind,'ready');if(reopened.kind==='ready')assert.equal(reopened.raw,f.raw);
 assert.equal(f.storage.getItem(homeKey),'Unrelated Home must stay exact');
});

test('same-trip receipt divergence and changed receipt source refuse without replacing bytes',async()=>{
 const f=fixture(),adapter=createTripReceiptPersistence(f.storage,f.driver,f.context);
 const key=tripReceiptStorageKey('owner-a',f.trip.id);f.values.set(key,f.raw);
 const other=JSON.parse(f.raw),input=JSON.parse(other.inputRaw);input.receipt.handoffId='different-handoff';other.inputRaw=JSON.stringify(input);other.draftRaw=null;
 assert.equal((await adapter.prepare(JSON.stringify(other),'another')).ok,false);assert.equal(f.values.get(key),f.raw);
 const prepared=await adapter.prepare(f.raw,'same');assert.equal(prepared.ok,true);
 f.values.set(key,'malformed concurrent write');assert.equal((await adapter.read()).kind,'protected');
});

test('generic native entry writer cannot overwrite or clear an independent completed receipt',async()=>{
 const f=fixture(),key=tripReceiptStorageKey('owner-a',f.trip.id);f.values.set(key,f.raw);
 const other=JSON.parse(f.raw),input=JSON.parse(other.inputRaw);input.receipt.handoffId='different-handoff';other.inputRaw=JSON.stringify(input);other.draftRaw=null;
 const adapter=createTwoStoreEntryPersistence(f.storage,f.driver,{...f.context,scope:{ownerId:'owner-a',tripId:f.trip.id,kind:'trip-receipt'},key,
  validate:raw=>raw===null||Boolean(completedTripReceipt(raw,'owner-a',f.trip.id))});
 assert.equal((await adapter.save(JSON.stringify(other))).kind,'protected');assert.equal(f.values.get(key),f.raw);
 assert.equal((await adapter.save(null)).kind,'protected');assert.equal(f.values.get(key),f.raw);
 assert.equal((await adapter.save(f.raw)).kind,'verified');assert.equal(f.values.get(key),f.raw);
});

for(const quota of ['body','receipt'] as const)test(`genuine ${quota} quota preserves the paired receipt through ACK and cold reopen`,async()=>{
 const f=fixture(),key=tripReceiptStorageKey('owner-a',f.trip.id),homeKey=homepageInputStorageKey('owner-a');
 f.values.set(homeKey,'Existing owner Home bytes');const adapter=createTripReceiptPersistence(f.storage,f.driver,f.context);
 const prepared=await adapter.prepare(f.raw,'quota-'+quota+':receipt');assert.equal(prepared.ok,true);if(!prepared.ok)return;
 const set=f.storage.setItem;f.storage.setItem=(name,raw)=>{if(quota==='body'?name.startsWith(tripRecoveryStorageKey('owner-a',f.trip.id)):name===key)throw new DOMException('Synthetic quota','QuotaExceededError');set(name,raw);};
 const store=createTwoStoreTripPersistence(f.storage,f.driver,f.context),writeId='quota-'+quota;
 const saved=await store.save(f.trip,{newTripOrClone:true,writeId,entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:'owner-a',tripId:f.trip.id,writeId},input:null,receipt:prepared.receipt}});
 assert.equal(saved.stored,true,JSON.stringify(saved));assert.equal(saved.receiptAcknowledged,true);
 const before=await adapter.read();assert.equal(before.kind,'ready');if(before.kind==='ready')assert.equal(before.raw,f.raw);
 assert.equal((await store.acknowledge(f.trip,f.trip,saved.handle)).outcome,'acknowledged');
 const cold=await createTripReceiptPersistence(f.storage,f.driver,f.context).read();assert.equal(cold.kind,'ready');if(cold.kind==='ready')assert.equal(cold.raw,f.raw);
 assert.equal(f.values.get(homeKey),'Existing owner Home bytes');
});

for(const boundary of ['broker','domain'] as const)for(const corruption of ['different-input','missing-pair'] as const)
test(`${boundary} refuses historical receipt/Home exception with ${corruption} without writes`,async()=>{
 const f=fixture(),receipt=await createTripReceiptPersistence(f.storage,f.driver,f.context).prepare(f.raw,'paired-receipt');
 assert.equal(receipt.ok,true);if(!receipt.ok)return;
 const homeBundle=JSON.parse(f.raw);homeBundle.draftRaw=null;
 if(corruption==='different-input')homeBundle.inputRaw=JSON.stringify(JSON.parse(homeBundle.inputRaw),null,2);
 const home=await createDurableHomepagePersistence(f.storage,f.driver,f.context).prepare(async staged=>{staged.setItem(homepageInputStorageKey('owner-a'),homeBundle.inputRaw);},'paired-home');
 assert.equal(home.kind,'prepared');if(home.kind!=='prepared')return;
 const entries=corruption==='missing-pair'?[home.entry]:[home.entry,receipt.entry];
 const handle={version:1 as const,backend:'indexeddb' as const,ownerId:'owner-a',tripId:f.trip.id,writeId:'paired-body'};
 const entry={pointer:handle,input:null,receipt:receipt.receipt};
 const before=[...f.values];
 if(boundary==='broker'){
  const result=await createTwoStoreTripPersistence(f.storage,f.driver,f.context).save(f.trip,{newTripOrClone:true,writeId:handle.writeId,entries,entry});
  assert.equal(result.stored,false);assert.equal(result.blockedByExistingRecovery,true);
 }else{
  const raw=JSON.stringify({version:1,handle,parent:null,legacySources:[],entry,
   rawRecovery:JSON.stringify({version:2,ownerId:'owner-a',tripId:f.trip.id,writeId:handle.writeId,trip:f.trip,state:'pending',savedAt:'2026-10-23T00:00:00.000Z'})});
  const result=await createRecoveryDomainStore(f.driver,f.context).commit({raw,expectedHead:null,admission:'native-setter-quota',entries});
  assert.equal(result.kind,'protected-conflict');
 }
 assert.deepEqual([...f.values],before);assert.equal(f.driver.generations.size,0);assert.equal(f.driver.heads.size,0);
});
