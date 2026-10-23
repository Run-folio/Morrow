import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {createTripReceiptPersistence} from '../lib/easyt/trip-receipt-persistence.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {homepageInputStorageKey,tripReceiptStorageKey} from '../lib/easyt/private-browser-context.ts';
import {createTripCreationToken,prepareTripCreationCheckpoint,createTripCreationPersistence} from '../lib/easyt/trip-creation-provenance.ts';
import {tripRecoveryStorageKey} from '../lib/easyt/storage.ts';

// Explicit local qualification against preserved, unchanged source snapshots.
// No Git/network access, installed runtime changes, or owner browser data.
const roots=(process.env.MORROVIA_P0_COMPAT_BASE_DIRS??'').split(':').filter(Boolean);
test('older reader, writer and rollback preserve independent completed receipts', {skip:roots.length===0},async t=>{
 for(const root of roots)for(const overflow of [false,true])await t.test(`${root.split('/').at(-1)} / ${overflow?'IDB':'native'}`,async()=>{
  const source=homeRecoveryFixture('owner-a'),values=new Map<string,string>();
  const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,
   setItem:(key:string,raw:string)=>{if(overflow&&key.startsWith(tripRecoveryStorageKey('owner-a',source.trip.id)))throw new DOMException('Synthetic body quota','QuotaExceededError');values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
  const context={ownerId:'owner-a',tripId:source.trip.id,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true},driver=new MemoryRecoveryDriver();
  const raw=JSON.stringify({version:1,inputRaw:source.native[0][1],draftRaw:source.native[1][1]}),homeKey=homepageInputStorageKey('owner-a');values.set(homeKey,'Unrelated existing Home bytes');
  const receipts=createTripReceiptPersistence(storage,driver,context),prepared=await receipts.prepare(raw,'compat-receipt');assert.equal(prepared.ok,true);if(!prepared.ok)return;
  const current=createTwoStoreTripPersistence(storage,driver,context),saved=await current.save(source.trip,{newTripOrClone:true,writeId:'compat-body',entries:[prepared.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:'owner-a',tripId:source.trip.id,writeId:'compat-body'},input:null,receipt:prepared.receipt}});assert.equal(saved.stored,true);
  assert.equal((await current.acknowledge(source.trip,source.trip,saved.handle)).outcome,'acknowledged');
  const old=await import(pathToFileURL(resolve(root,'lib/easyt/two-store-trip-persistence.ts')).href),older=old.createTwoStoreTripPersistence(storage,driver,context);
  const read=await older.read(source.trip.id);assert.equal(read.kind,'found');assert.equal(read.recovery,null);
  const edited={...read.trip,title:'Explicit edit by older writer'},write=await older.save(edited,{canonicalBase:read.trip,expectedRecoverySource:read.trip,writeId:'older-body'});assert.equal(write.stored,true);
  assert.equal((await older.acknowledge(edited,edited,write.handle)).outcome,'acknowledged');
  const reopened=await createTripReceiptPersistence(storage,driver,context).read();assert.equal(reopened.kind,'ready');if(reopened.kind==='ready')assert.equal(reopened.raw,raw);
  const body=await current.read(source.trip.id);assert.equal(body.kind,'found');if(body.kind==='found')assert.equal(body.trip.title,edited.title);
  assert.equal(values.get(homeKey),'Unrelated existing Home bytes');
  assert.equal(values.get(tripReceiptStorageKey('owner-a',source.trip.id)),overflow?undefined:raw);
 });
});

for(const ownerId of [null,'owner-a'])test(`older code preserves explicit creation provenance for ${ownerId??'guest'}`,{skip:roots.length===0},async t=>{
 for(const root of roots)for(const overflow of [false,true])await t.test(`${root.split('/').at(-1)} / ${overflow?'IDB':'native'}`,async()=>{
  const trip=homeRecoveryFixture(ownerId).trip,values=new Map<string,string>(),driver=new MemoryRecoveryDriver();
  const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,
   setItem:(k:string,v:string)=>{if(overflow&&k.startsWith(tripRecoveryStorageKey(ownerId,trip.id)))throw new DOMException('Synthetic quota','QuotaExceededError');values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
  const context={ownerId,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true},token=createTripCreationToken(trip,ownerId,'curated-route','compat-create');
  const prepared=await prepareTripCreationCheckpoint(storage,driver,context,trip,token);assert.equal(prepared.ok,true);if(!prepared.ok)return;
  const broker=createTwoStoreTripPersistence(storage,driver,context),first=await broker.save(trip,{creation:token,writeId:token.initialWriteId,newTripOrClone:true,entries:prepared.entries,
   entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId:trip.id,writeId:token.initialWriteId},input:null,receipt:prepared.receipt}});assert.equal(first.stored,true);
  if(ownerId)assert.equal((await broker.acknowledge(trip,trip,first.handle)).outcome,'acknowledged');
  const immutable=await createTripReceiptPersistence(storage,driver,{...context,tripId:trip.id}).read(),reservation=await createTripCreationPersistence(storage,driver,{...context,tripId:trip.id}).read();
  const originalGenerations=new Map(driver.generations),originalNative=new Map(values);
  const older=(await import(pathToFileURL(resolve(root,'lib/easyt/two-store-trip-persistence.ts')).href)).createTwoStoreTripPersistence(storage,driver,context);
  const read=await older.read(trip.id);assert.equal(read.kind,'found');
  const edited={...read.trip,title:'Explicit older-client edit'},write=await older.save(edited,{replace:read.recovery??undefined,canonicalBase:read.trip,expectedRecoverySource:read.trip,writeId:'older-edit'});
  if(write.stored&&ownerId)assert.equal((await older.acknowledge(edited,edited,write.handle)).outcome,'acknowledged');
  for(const [key,raw]of originalGenerations)assert.equal(driver.generations.get(key),raw,'old generation retained');
  assert.deepEqual(await createTripReceiptPersistence(storage,driver,{...context,tripId:trip.id}).read(),immutable);
  assert.deepEqual(await createTripCreationPersistence(storage,driver,{...context,tripId:trip.id}).read(),reservation);
  const reopened=await broker.read(trip.id);assert.equal(reopened.kind,'found');if(reopened.kind==='found')assert.equal(reopened.trip.title,write.stored?edited.title:trip.title);
  if(!write.stored)assert.deepEqual(values,originalNative,'refusal retains every byte');
  t.diagnostic(`older edit ${write.stored?'accepted':'safely refused'}; both provenance records retained`);
 });
});
