import assert from 'node:assert/strict';
import test from 'node:test';
import {workspaceRefusalDiagnostic, workspaceRefusalSupportCode, guestSourceObservation} from '../lib/easyt/workspace-recovery-diagnostic.ts';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {BrowserRecoveryReadError,saveTripRecoveryToStorage,saveExplicitGuestTripForOwnerInStorage} from '../lib/easyt/storage.ts';
import {entryHeadKey} from '../lib/easyt/durable-entry-protocol.ts';

for(const fault of ['missing-trip','unavailable-trip','input','homepage','current-operation'])test(`real source guard reports ${fault} without writes or an account request`,async()=>{
  const f=homeRecoveryFixture(),values=new Map(f.native),driver=new MemoryRecoveryDriver();let current=true,writes=0,requests=0;
  const storage={get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,
    setItem:(k:string,v:string)=>{writes++;values.set(k,v)},removeItem:(k:string)=>{writes++;values.delete(k)}};
  if(fault!=='missing-trip')assert.equal(saveTripRecoveryToStorage(storage,{...f.trip,status:'planned'},{ownerId:null,writeId:'synthetic-source'}).stored,true);
  if(fault==='input'||fault==='homepage')driver.heads.set(entryHeadKey({ownerId:null,kind:fault==='input'?'builder-input':'homepage',tripId:fault==='input'?f.trip.id:null}),'INVALID-SYNTHETIC-HEAD');
  if(fault==='unavailable-trip')driver.fail=Error('PRIVATE-ERROR-CONTENT');
  if(fault==='current-operation') {
    const runEntry=driver.runEntry.bind(driver);
    driver.runEntry=(async(...args:Parameters<typeof driver.runEntry>)=>{const result=await runEntry(...args);if(args[0].kind==='homepage')current=false;return result;}) as typeof driver.runEntry;
  }
  const nativeBefore=[...values],headsBefore=[...driver.heads],generationsBefore=[...driver.generations],acksBefore=[...driver.acknowledgements],writesBefore=writes;
  await assert.rejects(saveExplicitGuestTripForOwnerInStorage(storage,driver,{ownerId:'synthetic-owner',isCurrent:()=>current,overflowEnabled:true,accountOverflowQualified:true},f.trip.id,
    async()=>{requests++;throw Error('Account boundary must not run');}),error=>{
    assert.ok(error instanceof BrowserRecoveryReadError);assert.equal(error.kind,'protected');assert.equal(error.reason,'guest-source-not-ready');
    const expected=fault==='missing-trip'?{slot:'trip',readKind:'missing'}:fault==='unavailable-trip'?{slot:'trip',readKind:'unavailable'}
      :fault==='current-operation'?{slot:'current-operation',readKind:'not-current'}:{slot:fault,readKind:'protected'};
    assert.deepEqual(error.sourceObservation,expected);
    assert.deepEqual(workspaceRefusalDiagnostic('explicit-save',error),{phase:'explicit-save',code:'guest-source-not-ready',source:expected});return true;
  });
  assert.deepEqual([...values],nativeBefore);assert.deepEqual([...driver.heads],headsBefore);assert.deepEqual([...driver.generations],generationsBefore);assert.deepEqual([...driver.acknowledgements],acksBefore);
  assert.equal(writes,writesBefore);assert.equal(requests,0);
});

test('closed refusal packet retains only the approved phase and reason', () => {
  assert.deepEqual(workspaceRefusalDiagnostic('explicit-save', {kind:'protected',reason:'homepage-trip-mismatch',tripId:'PRIVATE',stack:'PRIVATE'}),
    {phase:'explicit-save',code:'homepage-trip-mismatch'});
  assert.deepEqual(workspaceRefusalDiagnostic('guest-read', {kind:'protected',reason:'PRIVATE-TRIP-ID'}), {phase:'guest-read',code:'other-protected'});
  assert.deepEqual(workspaceRefusalDiagnostic('owner-workspace-read', new Error('PRIVATE')), {phase:'owner-workspace-read',code:'unavailable'});
  assert.deepEqual(workspaceRefusalDiagnostic('PRIVATE', {kind:'protected',reason:'schema'}), {phase:'owner-workspace-read',code:'schema'});
});

test('source categories are closed and confined to the combined source guard', () => {
  const source=guestSourceObservation('homepage','protected');
  assert.deepEqual(workspaceRefusalDiagnostic('explicit-save',{kind:'protected',reason:'guest-source-not-ready',sourceObservation:{...source,raw:'PRIVATE'}}),
    {phase:'explicit-save',code:'guest-source-not-ready',source:{slot:'homepage',readKind:'protected'}});
  assert.equal(guestSourceObservation('PRIVATE','PRIVATE'),undefined);
  assert.equal(workspaceRefusalDiagnostic('explicit-save',{kind:'protected',reason:'destination-exists',sourceObservation:source}).source,undefined);
  assert.equal(workspaceRefusalDiagnostic('explicit-save',{kind:'protected',reason:'guest-source-not-ready',sourceObservation:{slot:'homepage',readKind:'PRIVATE'}}).source,undefined);
});

test('hostile errors and getters cannot leak or break diagnostic capture', () => {
  for(const key of ['kind','reason','sourceObservation']) {
    const error={kind:'protected',reason:'guest-source-not-ready',sourceObservation:{slot:'trip',readKind:'missing'}};
    Object.defineProperty(error,key,{get(){throw Error('PRIVATE');}});
    const packet=workspaceRefusalDiagnostic('explicit-save',error);
    assert.ok(!JSON.stringify(packet).includes('PRIVATE'));
  }
  assert.equal(guestSourceObservation({toString(){throw Error('PRIVATE')}},'missing'),undefined);
});

test('diagnostic capture and formatting have no storage, telemetry, console or network sink',t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),env=process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
  const originalFetch=globalThis.fetch,info=console.info,warn=console.warn,error=console.error;let accesses=0;
  const forbidden=()=>{accesses++;throw Error('Forbidden diagnostic side effect')};
  const target={location:{origin:'https://staging.morrovia.com'},dispatchEvent:forbidden};
  for(const key of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(target,key,{get:forbidden});
  Object.defineProperty(globalThis,'window',{configurable:true,value:target});
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='1';globalThis.fetch=forbidden;console.info=forbidden;console.warn=forbidden;console.error=forbidden;
  t.after(()=>{globalThis.fetch=originalFetch;console.info=info;console.warn=warn;console.error=error;
    if(env===undefined)delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS=env;
    if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');});
  const packet=workspaceRefusalDiagnostic('explicit-save',new BrowserRecoveryReadError('protected','guest-source-not-ready',{slot:'homepage',readKind:'protected'}));
  assert.equal(workspaceRefusalSupportCode(packet),'explicit-save / guest-source-not-ready / homepage:protected');
  assert.equal(accesses,0);
});

test('support code requires the existing build opt-in AND exact HTTPS staging origin', t => {
  const env=process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;
  const windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  t.after(()=>{if(env===undefined)delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS=env;
    if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else Reflect.deleteProperty(globalThis,'window');});
  const packet=workspaceRefusalDiagnostic('explicit-save',{kind:'protected',reason:'guest-source-not-ready',sourceObservation:{slot:'input',readKind:'protected'}});
  for(const origin of ['https://morrovia.com','http://staging.morrovia.com','http://localhost:3000','https://staging.morrovia.com.evil.test']) {
    Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin}}});
    process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='1';assert.equal(workspaceRefusalSupportCode(packet),null);
  }
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://staging.morrovia.com'}}});
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='0';assert.equal(workspaceRefusalSupportCode(packet),null);
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='1';assert.equal(workspaceRefusalSupportCode(packet),'explicit-save / guest-source-not-ready / input:protected');
  assert.ok(!workspaceRefusalSupportCode({...packet,code:'PRIVATE'} as any)?.includes('PRIVATE'));
});
