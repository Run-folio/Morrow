import assert from 'node:assert/strict';
import test from 'node:test';
import { createTwoStoreTripPersistence } from '../lib/easyt/two-store-trip-persistence.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { envelope, canonicalAck } from './helpers/durable-recovery-fixture.ts';
import { saveTripRecoveryToStorage, tripRecoveryStorageKey, currentTripStorageKey, EASYT_ACTIVE_TRIP_KEY, type EasyTBrowserStorage } from '../lib/easyt/storage.ts';
import { createRecoveryDomainStore } from '../lib/easyt/durable-recovery-store.ts';
import { createBuilderInputDraft, builderInputDraftKey } from '../lib/easyt/trip-builder-input-draft.ts';
import { createTwoStoreEntryPersistence } from '../lib/easyt/two-store-entry-persistence.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {prepareIntakeAcknowledgement,createDurableHomepagePersistence} from '../lib/easyt/homepage-persistence.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {createPendingIntakeReceipt,HOME_TRIP_DRAFT_KEY} from '../lib/easyt/home-trip-handoff.ts';
import {createDurableBuilderInputPersistence} from '../lib/easyt/builder-input-persistence.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';

class SyntheticStorage implements EasyTBrowserStorage {
  values = new Map<string, string>(); limit = Infinity; refusal: 'quota' | 'security' | 'silent' | null = null;
  blockedKey: string | null = null;
  get length() { return this.values.size; } key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) {
    if(k===this.blockedKey)throw new DOMException('Synthetic only','SecurityError');
    if (this.refusal === 'security') throw new DOMException('Synthetic only', 'SecurityError'); if (this.refusal === 'silent') return;
    const size = [...this.values].reduce((n, [key, val]) => n + (key === k ? 0 : 2 * (key.length + val.length)), 0) + 2 * (k.length + v.length);
    if (this.refusal === 'quota' || size > this.limit) throw new DOMException('Synthetic only', 'QuotaExceededError'); this.values.set(k, v);
  }
  removeItem(k: string) { this.values.delete(k); }
}
const trip = (writeId = 'candidate', ownerId: string | null = null) => JSON.parse(envelope(writeId, ownerId).rawRecovery).trip;
const ctx = (ownerId: string | null = null) => ({ ownerId, isCurrent: () => true, overflowEnabled: true, accountOverflowQualified: true });

test('matched 76 raw copies: 77th native quota enters domain, cold read needs no LS locator and all prior bytes stay exact', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver();
  for (let i = 0; i < 76; i++) {
    const candidate = { ...trip('retained-' + i), id: 'retained-' + i, retainedSyntheticText: '' };
    const key = tripRecoveryStorageKey(null, candidate.id, 'prior-' + i), record = { version: 2, ownerId: null, tripId: candidate.id, writeId: 'prior-' + i,
      trip: candidate, state: 'pending', savedAt: '2026-10-12T00:00:00.000Z' };
    const units = (136294 - 2 * (key.length + JSON.stringify(record).length)) / 2; candidate.retainedSyntheticText = 'x'.repeat(units);
    ls.values.set(key, JSON.stringify(record));
  }
  ls.limit = 10 * 1024 * 1024; const before = [...ls.values], candidate = { ...trip(), retainedSyntheticText: 'x'.repeat(70000) };
  const result = await createTwoStoreTripPersistence(ls, driver, ctx()).save(candidate, { newTripOrClone: true, writeId: 'overflow-77' });
  assert.equal(result.stored, true); assert.deepEqual([...ls.values], before); assert.equal(driver.generations.size, 1);
  const reopened = await createTwoStoreTripPersistence(ls, driver, ctx()).read(candidate.id); assert.equal(reopened.kind, 'found');
  if (reopened.kind === 'found') assert.deepEqual(reopened.trip, candidate);
});

test('even a successful LS setter must await the domain barrier; existing sole domain copy blocks unobserved raw replacement', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(), value = envelope('domain', null);
  await createRecoveryDomainStore(driver, { ownerId: null, isCurrent: () => true }).commit({ raw: JSON.stringify(value), expectedHead: null, admission: 'native-setter-quota' });
  const result = await createTwoStoreTripPersistence(ls, driver, ctx()).save(trip('unobserved'), { newTripOrClone: true });
  assert.equal(result.stored, false); assert.equal(result.blockedByExistingRecovery, true); assert.equal(ls.values.size, 0);
});

test('raw divergence against an unacknowledged domain branch is preserved and blocks supported selection/writing', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(), value = envelope('domain', null);
  await createRecoveryDomainStore(driver, { ownerId: null, isCurrent: () => true }).commit({ raw: JSON.stringify(value), expectedHead: null, admission: 'native-setter-quota' });
  saveTripRecoveryToStorage(ls, trip('old-tab'), { ownerId: null, writeId: 'old-raw' }); const before = [...ls.values];
  const broker = createTwoStoreTripPersistence(ls, driver, ctx()); assert.equal((await broker.read(value.handle.tripId)).kind, 'protected');
  assert.equal((await broker.save(trip('new'), { newTripOrClone: true })).stored, false); assert.deepEqual([...ls.values], before); assert.equal(driver.generations.size, 1);
});

test('unavailable DB cannot authorize an LS write or turn a readable LS document into authoritative absence', async () => {
  const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(); driver.fail = new DOMException('Synthetic denial', 'SecurityError');
  const result = await createTwoStoreTripPersistence(ls, driver, ctx()).save(trip(), { newTripOrClone: true });
  assert.equal(result.stored, false); assert.equal(ls.values.size, 0); assert.equal((await createTwoStoreTripPersistence(ls, driver, ctx()).read(trip().id)).kind, 'unavailable');
});

test('security/silent refusal and held activation/account eligibility cannot admit a first domain copy', async () => {
  for (const mode of ['security', 'silent', 'disabled', 'account', 'existing-trip'] as const) {
    const ls = new SyntheticStorage(), driver = new MemoryRecoveryDriver(), ownerId = mode === 'account' ? 'owner-a' : null;
    ls.refusal = mode === 'security' || mode === 'silent' ? mode : 'quota';
    const context = { ...ctx(ownerId), overflowEnabled: mode !== 'disabled', accountOverflowQualified: mode !== 'account' };
    assert.equal((await createTwoStoreTripPersistence(ls, driver, context).save(trip('candidate', ownerId), { newTripOrClone: mode !== 'existing-trip' })).stored, false);
    assert.equal(driver.generations.size, 0);
  }
});

test('cold current/list discover domain-only trip despite an unchanged older native pointer without copying a locator',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver();
  const prior={...trip('prior'),id:'prior-trip'};saveTripRecoveryToStorage(ls,prior,{ownerId:null,writeId:'prior'});
  ls.refusal='quota';const before=[...ls.values];
  assert.equal((await createTwoStoreTripPersistence(ls,driver,ctx()).save(trip(),{newTripOrClone:true,writeId:'sole'})).stored,true);
  const cold=createTwoStoreTripPersistence(ls,driver,ctx()),current=await cold.current();
  assert.equal(current.kind,'found');if(current.kind==='found')assert.equal(current.recovery?.writeId,'sole');
  const listed=await cold.list();assert.equal(listed.kind,'ready');if(listed.kind==='ready')assert.deepEqual(new Set(listed.recoveries.map(r=>r.tripId)),new Set([prior.id,trip().id]));
  assert.deepEqual([...ls.values],before);
});
test('unexplained different native navigation after domain commit is a protected current selection',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver();ls.refusal='quota';
  await createTwoStoreTripPersistence(ls,driver,ctx()).save(trip(),{newTripOrClone:true});
  ls.values.set(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:'old-tab-trip'}));
  assert.equal((await createTwoStoreTripPersistence(ls,driver,ctx()).current()).kind,'protected');
  assert.equal((await createTwoStoreTripPersistence(ls,driver,ctx()).read(trip().id)).kind,'found');
});
test('queryless new Builder does not select an arbitrary recovery without an acknowledged current pointer',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver();saveTripRecoveryToStorage(ls,trip(),{ownerId:null});
  ls.values.delete(currentTripStorageKey(null));assert.equal((await createTwoStoreTripPersistence(ls,driver,ctx()).current()).kind,'missing');
});
test('v1 source fallback retains observed raw bytes and protects a later old-reader change',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),prior=trip('legacy');ls.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify(prior));ls.refusal='quota';
  const broker=createTwoStoreTripPersistence(ls,driver,ctx());assert.equal((await broker.read(prior.id)).kind,'found');
  const updated={...prior,title:'new owned clone source'};
  assert.equal((await broker.save(updated,{newTripOrClone:true,writeId:'domain'})).stored,true);
  assert.equal((await broker.read(prior.id)).kind,'found');
  ls.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify({...prior,title:'old tab diverged'}));
  assert.equal((await broker.read(prior.id)).kind,'protected');assert.equal(driver.generations.size,1);
});
test('supported native save after an overflow trip advances scoped navigation without deleting its domain copy',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver();ls.refusal='quota';
  const broker=createTwoStoreTripPersistence(ls,driver,ctx());await broker.save(trip(),{newTripOrClone:true,writeId:'domain'});
  ls.refusal=null;const next={...trip('next'),id:'next-native'};
  assert.equal((await broker.save(next,{newTripOrClone:true,writeId:'native'})).stored,true);
  const current=await broker.current();assert.equal(current.kind,'found');if(current.kind==='found')assert.equal(current.trip.id,next.id);
  assert.equal(driver.generations.size,1);assert.equal((await broker.read(trip().id)).kind,'found');
  ls.values.set(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:'old-tab-trip'}));
  assert.equal((await broker.current()).kind,'protected');
});
test('exact domain account ACK does not depend on optional native cache space and a later edit remains the head',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),broker=createTwoStoreTripPersistence(ls,driver,ctx('owner-a'));
  ls.refusal='quota';const original=trip('first','owner-a'),first=await broker.save(original,{newTripOrClone:true,writeId:'first'});assert.equal(first.stored,true);
  const next={...original,title:'later edit'},second=await broker.save(next,{replace:first.handle,writeId:'second'});assert.equal(second.stored,true);
  const canonical=JSON.parse(canonicalAck(envelope('first','owner-a')));const before=[...driver.generations],rawBefore=[...ls.values];
  const ack=await broker.acknowledge(original,canonical,first.handle);
  assert.equal(ack.accountAcknowledged,true);assert.equal(ack.outcome,'device-newer');assert.equal(ack.cacheStored,false);
  const reopened=await broker.read(original.id);assert.equal(reopened.kind,'found');if(reopened.kind==='found')assert.equal(reopened.recovery?.writeId,'second');
  assert.deepEqual([...driver.generations],before);assert.deepEqual([...ls.values],rawBefore);assert.equal(driver.acknowledgements.size,1);
});
test('native cache failure cannot turn a verified exact account response into a failed account write',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),broker=createTwoStoreTripPersistence(ls,driver,ctx('owner-a'));
  const original=trip('first','owner-a'),first=await broker.save(original,{newTripOrClone:true,writeId:'first'});assert.equal(first.stored,true);
  const before=[...ls.values];ls.refusal='quota';const canonical={...original,updatedAt:'2026-10-12T00:01:00.000Z'};
  const ack=await broker.acknowledge(original,canonical,first.handle);
  assert.equal(ack.accountAcknowledged,true);assert.equal(ack.cacheStored,false);assert.equal(ack.outcome,'storage-failed');
  assert.deepEqual([...ls.values],before);assert.equal((await broker.read(original.id)).kind,'found');
});
test('same native document reuses the actual write handle when acknowledging current navigation',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),broker=createTwoStoreTripPersistence(ls,driver,ctx());
  const first=await broker.save(trip(),{writeId:'first'}),again=await broker.save(trip(),{writeId:'unused'});
  assert.equal(first.stored,true);assert.equal(again.stored,true);assert.equal(again.handle.writeId,'first');
  assert.equal((await broker.current()).kind,'found');
});
test('failed raw-input completion retains the exact native predecessor and refuses canonical acceptance',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),broker=createTwoStoreTripPersistence(ls,driver,ctx());
  const source=trip(),first=await broker.save(source,{writeId:'first'}),priorRaw=ls.values.get(tripRecoveryStorageKey(null,source.id,'first'));
  const key=builderInputDraftKey(null,source.id),raw=JSON.stringify(createBuilderInputDraft(source,1));
  const entry=await createTwoStoreEntryPersistence(ls,driver,{scope:{ownerId:null,kind:'builder-input',tripId:source.id},key,isCurrent:()=>true,
    overflowEnabled:true,accountOverflowQualified:false,validate:()=>true}).prepareForDomain(raw,'input');
  assert.ok('raw' in entry);if(!('raw' in entry))return;
  ls.blockedKey=key;
  const result=await broker.save({...source,title:'next'},{replace:first.handle,writeId:'next',entries:[entry],
    entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:source.id,writeId:'next'},input:{ownerId:null,tripId:source.id,inputRevision:1,raw},receipt:null}});
  assert.equal(result.stored,false);assert.equal(ls.values.get(tripRecoveryStorageKey(null,source.id,'first')),priorRaw);
  assert.equal(ls.values.has(tripRecoveryStorageKey(null,source.id,'next')),true);assert.equal(driver.generations.size,0);
});
test('native canonical acceptance awaits exact semantic intake completion and acknowledges the frozen receipt',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),fixture=homeRecoveryFixture();for(const [key,raw] of fixture.native)ls.values.set(key,raw);
  const prepared=await prepareIntakeAcknowledgement(ls,driver,ctx(),fixture.intake,fixture.trip,'home-entry');assert.equal(prepared.ok,true);if(!prepared.ok)return;
  const result=await createTwoStoreTripPersistence(ls,driver,ctx()).save(fixture.trip,{newTripOrClone:true,writeId:'canonical',entries:[prepared.entry],
    entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:fixture.trip.id,writeId:'canonical'},input:null,receipt:prepared.receipt}});
  assert.equal(result.stored,true);assert.equal(result.receiptAcknowledged,true);
  const reopened=await createDurableHomepagePersistence(ls,driver,ctx()).read();assert.equal(reopened.kind,'ready');if(reopened.kind==='ready')assert.deepEqual(reopened.draft,fixture.draft);
});
test('canonical quota commits full recovery and consumed intake atomically while all observed native bytes stay exact',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),fixture=homeRecoveryFixture();
  for(let i=0;i<76;i++) {
    const candidate={...trip('retained-'+i),id:'retained-'+i,retainedSyntheticText:''},key=tripRecoveryStorageKey(null,candidate.id,'prior-'+i);
    const record={version:2,ownerId:null,tripId:candidate.id,writeId:'prior-'+i,trip:candidate,state:'pending',savedAt:'2026-10-12T00:00:00.000Z'};
    candidate.retainedSyntheticText='x'.repeat((136294-2*(key.length+JSON.stringify(record).length))/2);ls.values.set(key,JSON.stringify(record));
  }
  const pending=createPendingIntakeReceipt(fixture.snapshot,{handoffId:fixture.intake.completed.handoffId,tripId:fixture.trip.id});
  ls.values.set(homepageInputStorageKey(null),JSON.stringify({snapshot:fixture.snapshot,receipt:pending}));
  ls.values.set(HOME_TRIP_DRAFT_KEY,JSON.stringify({version:2,phase:'pending-interpretation',receipt:pending}));
  ls.limit=10*1024*1024;const nativeBefore=[...ls.values],candidate={...fixture.trip,retainedSyntheticText:'x'.repeat(70000)};
  const prepared=await prepareIntakeAcknowledgement(ls,driver,ctx(),{...fixture.intake,pending},candidate,'home-entry');assert.equal(prepared.ok,true);if(!prepared.ok)return;
  const result=await createTwoStoreTripPersistence(ls,driver,ctx()).save(candidate,{newTripOrClone:true,writeId:'canonical',entries:[prepared.entry],
    entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:fixture.trip.id,writeId:'canonical'},input:null,receipt:prepared.receipt}});
  assert.equal(result.stored,true);assert.equal(result.receiptAcknowledged,true);assert.equal(driver.generations.size,2);assert.deepEqual([...ls.values],nativeBefore);
  const cold=await createDurableHomepagePersistence(ls,driver,ctx()).read();assert.equal(cold.kind,'ready');if(cold.kind==='ready'){assert.equal(cold.storedInput?.receipt?.version,1);assert.deepEqual(cold.draft,fixture.draft);}
});
test('a competing native receipt after domain commit retains committed bytes but cannot accept navigation/receipt completion',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),fixture=homeRecoveryFixture();for(const [key,raw] of fixture.native)ls.values.set(key,raw);ls.refusal='quota';
  const prepared=await prepareIntakeAcknowledgement(ls,driver,ctx(),fixture.intake,fixture.trip,'home-entry');assert.equal(prepared.ok,true);if(!prepared.ok)return;
  driver.afterCommit=()=>ls.values.set(homepageInputStorageKey(null),JSON.stringify({snapshot:{...fixture.snapshot,revision:1,prompt:'old raw changed'}}));
  const result=await createTwoStoreTripPersistence(ls,driver,ctx()).save(fixture.trip,{newTripOrClone:true,writeId:'canonical',entries:[prepared.entry],
    entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:fixture.trip.id,writeId:'canonical'},input:null,receipt:prepared.receipt}});
  assert.equal(result.stored,false);assert.equal(result.blockedByExistingRecovery,true);assert.equal(driver.generations.size,2);
});

test('prepared native paired input cannot overwrite a competing newer raw input revision',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),source=trip();
  const old=createBuilderInputDraft(source,0),attempt=createBuilderInputDraft(source,1),newer=createBuilderInputDraft(source,2),key=builderInputDraftKey(null,source.id);
  ls.values.set(key,JSON.stringify(old));
  const prepared=await createTwoStoreEntryPersistence(ls,driver,{scope:{ownerId:null,kind:'builder-input',tripId:source.id},key,isCurrent:()=>true,
    overflowEnabled:true,accountOverflowQualified:false,validate:()=>true}).prepareForDomain(JSON.stringify(attempt),'input');
  assert.ok('raw' in prepared);if(!('raw' in prepared))return;
  ls.values.set(key,JSON.stringify(newer));
  const result=await createTwoStoreTripPersistence(ls,driver,ctx()).save(source,{newTripOrClone:true,writeId:'canonical',entries:[prepared],
    entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:source.id,writeId:'canonical'},input:{ownerId:null,tripId:source.id,inputRevision:1,raw:JSON.stringify(attempt)},receipt:null}});
  assert.equal(result.stored,false);assert.equal(result.blockedByExistingRecovery,true);assert.equal(ls.getItem(key),JSON.stringify(newer));
});
test('an established domain transaction failure cannot fabricate a native setter failure',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),value=envelope('domain',null);
  await createRecoveryDomainStore(driver,{ownerId:null,isCurrent:()=>true}).commit({raw:JSON.stringify(value),expectedHead:null,admission:'native-setter-quota'});
  const run=driver.run.bind(driver);driver.run=(scope,writeId,mode,decide,entries)=>mode==='readwrite'?Promise.reject(new DOMException('Synthetic domain quota only','QuotaExceededError')):run(scope,writeId,mode,decide,entries);
  const result=await createTwoStoreTripPersistence(ls,driver,ctx()).save(trip(),{replace:{...value.handle},writeId:'continuation'});
  assert.equal(result.stored,false);assert.equal(result.nativeFailure,undefined);assert.equal(result.outcome,'unknown');assert.equal(result.recoveryDurable,false);assert.equal(ls.values.size,0);
});
test('committed domain bytes without independent readback are retained but cannot be reported as verified recovery',async()=>{
  const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver();ls.refusal='quota';driver.afterCommit=()=>{driver.fail=new DOMException('Synthetic readback refusal','SecurityError')};
  const result=await createTwoStoreTripPersistence(ls,driver,ctx()).save(trip(),{newTripOrClone:true,writeId:'committed'});
  assert.equal(result.stored,false);assert.equal(result.recoveryDurable,false);assert.equal(result.recoveryCommitted,true);assert.equal(driver.generations.size,1);
});
test('Builder input serialization cannot bless a newer raw revision during prepare or write barriers',async()=>{
  for(const {operation,readAt} of [{operation:'prepare',readAt:2},{operation:'write',readAt:2},{operation:'write',readAt:6}] as const) {
    const ls=new SyntheticStorage(),driver=new MemoryRecoveryDriver(),source=requireReadableTripDocument(trip()),key=builderInputDraftKey(null,source.id);
    const old=createBuilderInputDraft(source,0),attempt=createBuilderInputDraft(source,1),newer=createBuilderInputDraft(source,2);
    ls.values.set(key,JSON.stringify(old));let reads=0;
    const get=ls.getItem.bind(ls);ls.getItem=k=>{const raw=get(k);if(k===key&&++reads===readAt)queueMicrotask(()=>ls.values.set(key,JSON.stringify(newer)));return raw};
    const store=createDurableBuilderInputPersistence(ls,driver,{...ctx(),trip:source});
    const result=operation==='prepare'?await store.prepare(attempt,'input'):await store.write(attempt);
    assert.equal(result.ok,false,operation);assert.equal(ls.values.get(key),JSON.stringify(newer),operation);
  }
});
