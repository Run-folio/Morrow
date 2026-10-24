import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';

// Only browser storage access is substituted. The facade, preparation, broker,
// proof codecs and Builder consumer are production code. No network is allowed.
const root=new URL('../',import.meta.url);
registerHooks({load(url,context,nextLoad){
  if(url!==new URL('lib/easyt/browser-recovery-persistence.ts',root).href)return nextLoad(url,context);
  return {format:'module',shortCircuit:true,source:`
export class BrowserRecoveryReadError extends Error {constructor(kind,reason){super(reason);this.kind=kind;this.reason=reason;}}
export const browserRecoveryStorage=()=>globalThis.__creationRetry.storage;
export const browserRecoveryDriver=async()=>globalThis.__creationRetry.driver;
export const browserRecoveryGuard=guard=>()=>globalThis.__creationRetry.current&&(!guard||guard());
export const invalidateBrowserRecoveryScope=()=>{globalThis.__creationRetry.current=false;};
export const broadcastRecoveryChange=()=>{};
export async function browserTripPersistence(ownerId,guard){const {createTwoStoreTripPersistence}=await import('${new URL('lib/easyt/two-store-trip-persistence.ts',root).href}');return createTwoStoreTripPersistence(browserRecoveryStorage(),await browserRecoveryDriver(),{ownerId,isCurrent:browserRecoveryGuard(guard),overflowEnabled:true,accountOverflowQualified:true});}
`};
}});
const {homeRecoveryFixture}=await import('./helpers/home-recovery-fixture.ts');
const {MemoryRecoveryDriver}=await import('./helpers/durable-recovery-driver.ts');
const {saveTripRecovery,loadTripRecovery,currentTripStorageKey,tripRecoveryStorageKey}=await import('../lib/easyt/storage.ts');
const {createTripCreationToken}=await import('../lib/easyt/trip-creation-provenance.ts');
const {createBuilderEntrySession}=await import('../lib/easyt/trip-builder-entry-session.ts');

async function fixture(t,kind='native',pointerFault=false){
  t.mock.method(globalThis,'fetch',()=>{assert.fail('No network calls in creation retry qualification');});
  const trip=homeRecoveryFixture().trip,values=new Map(),driver=new MemoryRecoveryDriver();
  const pointerKey=currentTripStorageKey(null),bodyPrefix=tripRecoveryStorageKey(null,trip.id);
  const f={current:true,pointerFault,readbackFault:false,values,driver,trip,pointerKey,bodyPrefix,raw:null};
  f.storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,
    getItem(k){if(f.readbackFault&&k===pointerKey)throw new Error('Synthetic pointer readback refusal');return values.get(k)??null;},
    setItem(k,v){
      if(f.pointerFault&&k===pointerKey)throw new DOMException('Synthetic pointer refusal','SecurityError');
      if(kind==='idb'&&k.startsWith(bodyPrefix))throw new DOMException('Synthetic body quota','QuotaExceededError');
      values.set(k,v);
    },removeItem:k=>values.delete(k)};
  globalThis.__creationRetry=f;
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:f.storage,dispatchEvent(){}}});
  t.after(()=>{if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;});
  const token=createTripCreationToken(trip,null,'manual-builder','pointer-retry:'+kind);
  f.token=token;
  f.entry=()=>createBuilderEntrySession({key:'explicit-retry',ownerId:null,candidate:f.trip,receipt:null,creation:token,initialCanonical:null,openedRecovery:null,isCurrent:()=>f.current});
  f.save=async(candidate,_receipt,isCurrent)=>f.raw=await saveTripRecovery(candidate,{ownerId:null,newTripOrClone:true,creation:token,isCurrent});
  f.first=await f.entry().checkpoint(f.save);
  assert.equal(f.first.stored,!pointerFault);
  f.pointerFault=false;
  f.bodySnapshot=()=>({native:[...values].filter(([k])=>k!==pointerKey),generations:new Map(driver.generations)});
  f.retained=f.bodySnapshot();
  return f;
}

for(const [kind,fault] of [['native',false],['native',true],['idb',false]])test(`real creation facade retry installs Builder seed after ${kind}${fault?' recovered pointer failure':' success'}`,async t=>{
  const f=await fixture(t,kind,fault),entry=f.entry();
  const frozen=JSON.parse(JSON.stringify(f.trip));
  f.trip.brief.routeAssessment={summary:'Later optional advisory recomputation'};
  const result=await entry.checkpoint(f.save);
  assert.equal(result.stored,true,'exact retry must produce a usable checkpoint');
  assert.equal(result.pointerAcknowledged,true);
  assert.equal(result.receiptAcknowledged,true);
  assert.equal(result.handle.writeId,f.token.initialWriteId,'creation identity is retained');
  assert.equal(await entry.verifyReadback(loadTripRecovery),true);
  assert.deepEqual(entry.claimSeed().initialTrip,frozen,'advisory render cannot replace the frozen creation source');
  f.trip=frozen;
  if(fault) {
    // Navigation admission now precedes the body: a refused marker setter must
    // retain the reservation, but cannot claim it already wrote a body.
    assert.equal(f.first.recoveryDurable===true,false);
    for(const [key,raw] of f.retained.native)assert.equal(f.values.get(key),raw,'prior evidence stays byte-exact');
    for(const [key,raw] of f.retained.generations)assert.equal(f.driver.generations.get(key),raw);
  }else assert.deepEqual(f.bodySnapshot(),f.retained,'retry must not rewrite body, reservation, receipt or immutable generations');
  const navigation={native:f.values.get(f.pointerKey),domain:await f.driver.readCurrent(null)};
  assert.equal((await f.entry().checkpoint(f.save)).stored,true,'repeated retry is idempotent');
  assert.deepEqual({native:f.values.get(f.pointerKey),domain:await f.driver.readCurrent(null)},navigation);
});

for(const kind of ['native','idb'])for(const change of ['foreign-native','foreign-domain','newer-domain','cleared-domain','retired','changed-body'])test(`creation retry protects ${change} after ${kind} success`,async t=>{
  const f=await fixture(t,kind);
  if(change==='foreign-native')f.values.set(f.pointerKey,JSON.stringify({version:2,ownerId:null,tripId:'other-trip'}));
  if(change==='foreign-domain')f.driver.heads.set(JSON.stringify([null]),JSON.stringify({version:1,backend:'indexeddb',ownerId:null,tripId:'later-other-trip',writeId:'later-navigation'}));
  if(change==='newer-domain')f.driver.heads.set(JSON.stringify([null]),JSON.stringify({version:1,backend:'indexeddb',ownerId:null,tripId:f.trip.id,writeId:'newer-write'}));
  if(change==='cleared-domain')f.driver.heads.set(JSON.stringify([null]),JSON.stringify({version:1,backend:'cleared',ownerId:null,nativePointerRaw:f.values.get(f.pointerKey)??null}));
  if(change==='retired')f.current=false;
  if(change==='changed-body'){
    if(kind==='native'){const key=[...f.values.keys()].find(k=>k.startsWith(f.bodyPrefix)),body=JSON.parse(f.values.get(key));body.trip.title='Another writer';f.values.set(key,JSON.stringify(body));}
    else {const key=f.driver.key({ownerId:null,tripId:f.trip.id},f.token.initialWriteId),envelope=JSON.parse(f.driver.generations.get(key)),body=JSON.parse(envelope.rawRecovery);body.trip.title='Another writer';envelope.rawRecovery=JSON.stringify(body);f.driver.generations.set(key,JSON.stringify(envelope));}
  }
  const before={values:new Map(f.values),heads:new Map(f.driver.heads),generations:new Map(f.driver.generations)};
  const entry=f.entry();assert.equal((await entry.checkpoint(f.save)).stored,false);
  assert.equal(entry.claimSeed(),null);
  assert.deepEqual({values:f.values,heads:f.driver.heads,generations:f.driver.generations},before,'refused retry must preserve divergent state');
});

for(const fault of ['setter','readback','current-cas','source-race','owner-race'])test(`incomplete native creation retry refuses ${fault}`,async t=>{
  const f=await fixture(t,'native',true);
  if(fault==='setter')f.pointerFault=true;
  if(fault==='readback')f.readbackFault=true;
  if(['current-cas','source-race','owner-race'].includes(fault)){
    const run=f.driver.run.bind(f.driver);let injected=false;
    f.driver.run=(scope,writeId,mode,decide,entries)=>run(scope,writeId,mode,state=>{
      if(mode==='readwrite'&&scope.tripId===f.trip.id&&!injected){
        injected=true;
        if(fault==='current-cas'){const raw=JSON.stringify({version:1,backend:'cleared',ownerId:null,nativePointerRaw:null});f.driver.heads.set(JSON.stringify([null]),raw);state={...state,currentRaw:raw};}
        if(fault==='source-race'){const key=tripRecoveryStorageKey(null,f.trip.id,'concurrent');const body={version:2,ownerId:null,tripId:f.trip.id,writeId:'concurrent',trip:{...f.trip,title:'Concurrent body'},state:'pending',savedAt:'2026-10-24T00:00:00.000Z'};f.values.set(key,JSON.stringify(body));}
        if(fault==='owner-race')f.current=false;
      }
      return decide(state);
    },entries);
  }
  const result=await f.entry().checkpoint(f.save);
  assert.equal(result.stored,false,'incomplete or invalidated navigation must not be accepted');
  if(fault!=='source-race')assert.deepEqual(f.bodySnapshot(),f.retained);
  else assert.equal(JSON.parse([...f.values].find(([k])=>k.startsWith(f.bodyPrefix))[1]).trip.title,'Concurrent body');
});

for(const kind of ['native','idb'])test(`creation retry refuses receipt change during final navigation read after ${kind}`,async t=>{
 const f=await fixture(t,kind),read=f.driver.readCurrent.bind(f.driver);let calls=0;
 const {tripReceiptStorageKey}=await import('../lib/easyt/private-browser-context.ts');
 const key=tripReceiptStorageKey(null,f.trip.id);
 f.driver.readCurrent=async owner=>{const raw=await read(owner);if(++calls===2)f.values.set(key,'changed proof');return raw;};
 assert.equal((await f.entry().checkpoint(f.save)).stored,false,'changed proof must not receive a save acknowledgement');
 assert.equal(f.values.get(key),'changed proof');
});
