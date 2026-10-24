import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const root=new URL('../',import.meta.url);
registerHooks({load(url,context,next){
 if(url!==new URL('lib/easyt/browser-recovery-persistence.ts',root).href)return next(url,context);
 return {format:'module',shortCircuit:true,source:`
export const browserRecoveryStorage=()=>globalThis.__handover.storage;
export const browserRecoveryDriver=async()=>globalThis.__handover.driver;
export const browserRecoveryGuard=guard=>()=>globalThis.__handover.active&&(!guard||guard());
export const broadcastRecoveryChange=()=>{};
export const invalidateBrowserRecoveryScope=()=>{globalThis.__handover.active=false;};
export class BrowserRecoveryReadError extends Error {constructor(kind,reason){super(reason);this.kind=kind;this.reason=reason;}}
export async function browserTripPersistence(ownerId,guard){const {createTwoStoreTripPersistence}=await import('${new URL('lib/easyt/two-store-trip-persistence.ts',root).href}');return createTwoStoreTripPersistence(browserRecoveryStorage(),await browserRecoveryDriver(),{ownerId,isCurrent:browserRecoveryGuard(guard),overflowEnabled:true,accountOverflowQualified:true});}
`};}});
const {homeRecoveryFixture}=await import('./helpers/home-recovery-fixture.ts');
const {MemoryRecoveryDriver}=await import('./helpers/durable-recovery-driver.ts');
const {IndexedDbModel}=await import('./helpers/recovery-indexeddb-model.ts');
const {openIndexedDbRecoveryDriver}=await import('../lib/easyt/durable-recovery-indexeddb.ts');
const {saveTripRecovery,loadTripRecovery,currentTripStorageKey,tripRecoveryStorageKey}=await import('../lib/easyt/storage.ts');
const {tripReceiptStorageKey}=await import('../lib/easyt/private-browser-context.ts');
const {createTripCreationToken}=await import('../lib/easyt/trip-creation-provenance.ts');
const {createTwoStoreTripPersistence}=await import('../lib/easyt/two-store-trip-persistence.ts');
async function fixture(t,{ownerId=null,realDriver=false,fullQuota=false,legacyDuringReceipt=null,beforeB=null,interruptReceipt=true,expectBody=true}={}){
 const values=new Map(),model=realDriver?new IndexedDbModel():null;
 const f={values,active:true,receiptFault:false,driver:model?await openIndexedDbRecoveryDriver(model.factory()):new MemoryRecoveryDriver()};
 f.storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem(k){if(f.receiptFault&&k===f.receiptKey&&values.has(k))throw new DOMException('Synthetic receipt readback','SecurityError');return values.get(k)??null},setItem(k,v){if(f.fullQuota)throw new DOMException('Synthetic full native quota','QuotaExceededError');values.set(k,v);if(k===f.receiptKey&&legacyDuringReceipt){if(legacyDuringReceipt==='A-then-B')values.set(currentTripStorageKey(ownerId),JSON.stringify({version:2,ownerId,tripId:f.a.id}));values.set(currentTripStorageKey(ownerId),JSON.stringify({version:2,ownerId,tripId:f.b.id}));}},removeItem:k=>values.delete(k)};
 globalThis.__handover=f;const win=Object.getOwnPropertyDescriptor(globalThis,'window');globalThis.window={localStorage:f.storage,dispatchEvent(){}};
 t.after(()=>{f.driver.close?.();if(win)Object.defineProperty(globalThis,'window',win);else delete globalThis.window});
 t.mock.method(globalThis,'fetch',()=>assert.fail('No network in navigation handover test'));
 const base=homeRecoveryFixture().trip;f.a={...base,id:'handover-A',ownerId};f.b={...base,id:'handover-B',ownerId};
 f.context={ownerId,isCurrent:()=>f.active,overflowEnabled:true,accountOverflowQualified:true};f.broker=()=>createTwoStoreTripPersistence(f.storage,f.driver,f.context);
 assert.equal((await saveTripRecovery(f.a,{ownerId,newTripOrClone:true})).stored,true);
 f.prior=[...values].filter(([k])=>k!==currentTripStorageKey(ownerId));
 f.token=createTripCreationToken(f.b,ownerId,'spreadsheet-import','handover-operation');f.receiptKey=tripReceiptStorageKey(ownerId,f.b.id);
 f.retry=()=>saveTripRecovery(f.b,{ownerId,newTripOrClone:true,creation:f.token});
 beforeB?.(f);f.fullQuota=fullQuota;f.receiptFault=interruptReceipt&&!legacyDuringReceipt;f.first=await f.retry();f.receiptFault=false;
 assert.equal(f.first.stored,fullQuota);assert.equal(Boolean(await loadTripRecovery(f.b.id,ownerId)),expectBody,'only an admitted body can be retained');
 for(const [k,v] of f.prior)assert.equal(values.get(k),v,'A and prior evidence remain exact');
 f.retained=[...values].filter(([k])=>k!==currentTripStorageKey(ownerId));
 f.restart=async()=>{if(model){f.driver.close();f.driver=await openIndexedDbRecoveryDriver(model.factory())}globalThis.__handover={...f};};
 return f;
}
for(const realDriver of [false,true])test(`receipt interruption finishes only its reserved handover after cold ${realDriver?'IndexedDB adapter':'facade'} restart`,async t=>{
 const f=await fixture(t,{realDriver});await f.restart();const retry=await f.retry();
 assert.equal(retry.stored,true);assert.equal(retry.pointerAcknowledged,true);assert.equal(retry.receiptAcknowledged,true);
 assert.equal((await f.broker().current()).trip.id,f.b.id);assert.deepEqual([...f.values].filter(([k])=>k!==currentTripStorageKey(null)),f.retained);
 const pointer=await f.driver.readCurrent(null),native=f.values.get(currentTripStorageKey(null));
 const duplicates=await Promise.all([f.retry(),f.retry()]);assert.ok(duplicates.every(r=>r.stored&&r.pointerAcknowledged));
 assert.equal(await f.driver.readCurrent(null),pointer);assert.equal(f.values.get(currentTripStorageKey(null)),native);
});
for(const action of ['later-trip','clear','legacy-same-target','legacy-A-then-B'])test(`interrupted handover preserves ${action} navigation`,async t=>{
 const f=await fixture(t);
 if(action==='later-trip')assert.equal((await saveTripRecovery({...f.a,id:'handover-C'},{ownerId:null,newTripOrClone:true})).stored,true);
 else if(action==='clear')assert.equal(await f.broker().clearCurrent(),true);
 else{const key=currentTripStorageKey(null);if(action==='legacy-A-then-B')f.values.set(key,JSON.stringify({version:2,ownerId:null,tripId:f.a.id}));f.values.set(key,JSON.stringify({version:2,ownerId:null,tripId:f.b.id}));}
 const before=new Map(f.values),pointer=await f.driver.readCurrent(null);
 assert.equal((await f.retry()).stored,false);assert.deepEqual(f.values,before);assert.equal(await f.driver.readCurrent(null),pointer);
});
test('interrupted owner A handover cannot be completed by B or retired A, and remains recoverable for A',async t=>{
 const f=await fixture(t,{ownerId:'owner-A'}),before=new Map(f.values),pointer=await f.driver.readCurrent('owner-A');
 assert.equal((await saveTripRecovery(f.b,{ownerId:'owner-B',newTripOrClone:true,creation:f.token})).stored,false);
 f.active=false;assert.equal((await f.retry()).stored,false);f.active=true;
 assert.deepEqual(f.values,before);assert.equal(await f.driver.readCurrent('owner-A'),pointer);
 assert.equal((await f.retry()).stored,true);assert.equal(await f.driver.readCurrent('owner-B'),undefined);
});
for(const change of ['owner','schema','digest','extra-field'])test(`malformed ${change} handover witness cannot supply continuation authority`,async t=>{
 const f=await fixture(t),key=[...f.driver.generations.keys()].find(k=>JSON.parse(k)[2]==='creation-navigation');
 assert.ok(key);const entry=JSON.parse(f.driver.generations.get(key)),pointer=JSON.parse(entry.raw);
 if(change==='owner')pointer.ownerId='foreign';if(change==='schema')pointer.version=99;if(change==='digest')pointer.creationDigest='0'.repeat(64);if(change==='extra-field')pointer.unrecognized=true;
 entry.raw=JSON.stringify(pointer);f.driver.generations.set(key,JSON.stringify(entry));
 const before=new Map(f.values),domain=new Map(f.driver.heads),generations=new Map(f.driver.generations);
 assert.equal((await f.retry()).stored,false);assert.deepEqual(f.values,before);assert.deepEqual(f.driver.heads,domain);assert.deepEqual(f.driver.generations,generations);
});
for(const change of ['clear','native','witness','receipt','retire'])test(`handover completion CAS protects ${change} changed inside transaction`,async t=>{
 const f=await fixture(t),run=f.driver.run.bind(f.driver);let injected=false;
 f.driver.run=(scope,writeId,mode,decide,entries)=>run(scope,writeId,mode,state=>{
  if(mode==='readwrite'&&scope.tripId===f.b.id&&!injected){injected=true;
   if(change==='clear'){const raw=JSON.stringify({version:1,backend:'cleared',ownerId:null,nativePointerRaw:f.values.get(currentTripStorageKey(null))});f.driver.heads.set(JSON.stringify([null]),raw);state={...state,currentRaw:raw};}
   if(change==='native')f.values.set(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:'later-trip'}));
   if(change==='witness'){const key=[...f.driver.generations.keys()].find(k=>JSON.parse(k)[2]==='creation-navigation');f.driver.generations.set(key,'corrupt retained witness');state={...state,entries:state.entries.map((row,i)=>i===state.entries.length-1?{...row,headGenerationRaw:'corrupt retained witness',generationRaw:'corrupt retained witness'}:row)};}
   if(change==='receipt')f.values.set(f.receiptKey,'changed receipt');
   if(change==='retire')f.active=false;
  }
  return decide(state);
 },entries);
 const before=new Map(f.values),domain=await f.driver.readCurrent(null);assert.equal((await f.retry()).stored,false);assert.equal(injected,true);
 for(const [k,v] of before)if(!(change==='native'&&k===currentTripStorageKey(null))&&!(change==='receipt'&&k===f.receiptKey))assert.equal(f.values.get(k),v);
 if(change!=='clear')assert.equal(await f.driver.readCurrent(null),domain);
});
test('witness-free historical interrupted creation remains protected without inventing a new attempt',async t=>{
 const f=await fixture(t);for(const map of [f.driver.heads,f.driver.generations])for(const key of map.keys())if(JSON.parse(key)[2]==='creation-navigation')map.delete(key);
 f.values.set(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:f.b.id}));
 const before=new Map(f.values),domain=await f.driver.readCurrent(null),generations=new Map(f.driver.generations);
 assert.equal((await f.retry()).stored,false);assert.deepEqual(f.values,before);assert.equal(await f.driver.readCurrent(null),domain);assert.deepEqual(f.driver.generations,generations);
});

for(const realDriver of [false,true])test(`full native quota retains creation via atomic ${realDriver?'real-adapter':'model'} IDB checkpoint without a locator write`,async t=>{
 const f=await fixture(t,{fullQuota:true,realDriver});assert.equal(f.first.handle.backend,'indexeddb');assert.equal(f.first.pointerAcknowledged,true);
 const native=new Map(f.values);await f.restart();assert.equal((await f.retry()).stored,true);assert.deepEqual(f.values,native);
 assert.equal((await f.broker().current()).trip.id,f.b.id);assert.equal(JSON.parse(f.values.get(currentTripStorageKey(null))).tripId,f.a.id);
});
for(const legacyDuringReceipt of ['same-B','A-then-B'])test(`first-call creation refuses legacy ${legacyDuringReceipt} navigation during receipt persistence`,async t=>{
 const f=await fixture(t,{legacyDuringReceipt});assert.equal(f.first.stored,false);assert.equal(JSON.parse(await f.driver.readCurrent(null)).backend,'creation-handover');
 const before=new Map(f.values),pointer=await f.driver.readCurrent(null);assert.equal((await f.retry()).stored,false);assert.deepEqual(f.values,before);assert.equal(await f.driver.readCurrent(null),pointer);
});

test('a source arriving during the final navigation await is retained without adding receipt authority',async t=>{
 let injected=false;
 const f=await fixture(t,{interruptReceipt:false,beforeB(f){const read=f.driver.readCurrent.bind(f.driver);let pendingReads=0;
  f.driver.readCurrent=async owner=>{const raw=await read(owner);
   if(raw&&JSON.parse(raw).backend==='creation-handover'&&++pendingReads===3){
    injected=true;const body={version:2,ownerId:null,tripId:f.b.id,writeId:f.token.initialWriteId,trip:f.b,state:'conflict',savedAt:'2026-10-24T00:00:00.000Z'};
    f.values.set(tripRecoveryStorageKey(null,f.b.id,f.token.initialWriteId),JSON.stringify(body));
   }return raw;};
 }});
 assert.equal(injected,true);assert.equal(f.values.has(f.receiptKey),false);assert.equal((await loadTripRecovery(f.b.id,null)).state,'conflict');
});
for(const failure of ['security','silent','quota-after-change'])test(`native marker ${failure} cannot gain IDB fallback or saved authority`,async t=>{
 const f=await fixture(t,{expectBody:false,beforeB(f){const set=f.storage.setItem;
  f.storage.setItem=(key,raw)=>{if(key===currentTripStorageKey(null)){
   if(failure==='silent')return;
   if(failure==='quota-after-change'){f.values.set(key,JSON.stringify({version:2,ownerId:null,tripId:'later-intent'}));throw new DOMException('Changed before quota','QuotaExceededError');}
   throw new DOMException('Synthetic native marker denied','SecurityError');
  }return set(key,raw);};
 }});
 assert.equal(f.first.stored,false);assert.equal(f.first.handle.backend,undefined);assert.equal(f.driver.heads.has(JSON.stringify([null,f.b.id])),false);
 assert.equal(JSON.parse(await f.driver.readCurrent(null)).tripId,f.a.id);
});
test('lost admission acknowledgement is inspected on retry and does not duplicate the witness',async t=>{
 const f=await fixture(t,{expectBody:false,beforeB(f){f.driver.afterCommit=()=>{
  const raw=f.driver.heads.get(JSON.stringify([null]));if(raw&&JSON.parse(raw).backend==='creation-handover'){f.driver.afterCommit=null;throw new Error('Synthetic lost admission ACK');}
 };}});
 const key=[...f.driver.generations.keys()].find(k=>JSON.parse(k)[2]==='creation-navigation');assert.ok(key);const witness=f.driver.generations.get(key);
 assert.equal((await f.retry()).stored,true);assert.equal(f.driver.generations.get(key),witness);assert.equal([...f.driver.generations.keys()].filter(k=>JSON.parse(k)[2]==='creation-navigation').length,1);
});
