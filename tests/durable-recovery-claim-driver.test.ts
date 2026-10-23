import assert from 'node:assert/strict';
import test from 'node:test';
import { openIndexedDbRecoveryDriver } from '../lib/easyt/durable-recovery-indexeddb.ts';
import { recoveryCurrentKey, recoveryGenerationKey, recoveryScopeKey,
  type RecoveryClaimRequest, type RecoveryClaimDecision, type RecoveryDomainDriver } from '../lib/easyt/durable-recovery-domain.ts';
import { entryGenerationKey, entryHeadKey, type RecoveryEntryScope, type RecoveryEntryMutation } from '../lib/easyt/durable-entry-protocol.ts';
import { MemoryRecoveryDriver } from './helpers/durable-recovery-driver.ts';
import { IndexedDbModel } from './helpers/recovery-indexeddb-model.ts';
import { envelope, rawEnvelope } from './helpers/durable-recovery-fixture.ts';

function entry(scope: RecoveryEntryScope, writeId: string, payload = 'exact opaque metadata'): RecoveryEntryMutation {
  const handle = { ...scope, version: 1, backend: 'indexeddb-entry', writeId };
  return { scope, writeId, headRaw: JSON.stringify(handle),
    raw: JSON.stringify({ version: 1, handle, parent: null, raw: payload, legacyRaw: null, retainedPreviousRaw: null }) };
}
function fixture() {
  const source = envelope('guest-write', null), target = envelope('claimed-write', 'owner-a');
  const sourceInput = entry({ ownerId: null, kind: 'builder-input', tripId: source.handle.tripId }, 'guest-input', 'guest raw  ');
  const sourceHome = entry({ ownerId: null, kind: 'homepage', tripId: null }, 'guest-home');
  const sourceLifecycle = entry({ ownerId: null, kind: 'recovery-lifecycle', tripId: source.handle.tripId }, 'guest-live');
  const targetLifecycle = entry({ ownerId: 'owner-a', kind: 'recovery-lifecycle', tripId: source.handle.tripId }, 'owner-live');
  const sourceProof = entry({ ownerId: null, kind: 'recovery-claim', tripId: source.handle.tripId }, 'guest-proof');
  const targetProof = entry({ ownerId: 'owner-a', kind: 'recovery-claim', tripId: source.handle.tripId }, 'owner-proof');
  const targetInput = entry({ ...sourceInput.scope, ownerId: 'owner-a' }, 'owner-input', 'rebound raw  ');
  const targetHome = entry({ ...sourceHome.scope, ownerId: 'owner-a' }, 'owner-home');
  const request: RecoveryClaimRequest = { sourceHandle: source.handle, targetHandle: target.handle,
    sourceEntries: [sourceInput, sourceHome, sourceLifecycle, sourceProof].map(({scope,writeId}) => ({ scope, writeId })),
    targetEntries: [targetInput, targetHome, targetLifecycle, targetProof].map(({scope,writeId}) => ({ scope, writeId })) };
  const decision: RecoveryClaimDecision<string> = { value: 'committed', targetGenerationRaw: rawEnvelope(target),
    targetHeadRaw: JSON.stringify(target.handle), targetCurrentRaw: JSON.stringify(target.handle),
    sourceEntryWrites: [sourceProof], targetEntryWrites: [targetInput, targetHome, targetProof] };
  return { source, target, sourceInput, sourceHome, sourceLifecycle, targetLifecycle, sourceProof, targetProof, targetInput, targetHome, request, decision };
}
async function setup(native: boolean) {
  const model = native ? new IndexedDbModel() : null, memory = native ? null : new MemoryRecoveryDriver();
  const driver: RecoveryDomainDriver = model ? await openIndexedDbRecoveryDriver(model.factory()) : memory!;
  const maps = () => model ? model.data : new Map([['generations',memory!.generations],['heads',memory!.heads],['acknowledgements',memory!.acknowledgements]]);
  const seed = fixture(), heads = maps().get('heads')!, generations = maps().get('generations')!;
  heads.set(recoveryScopeKey(seed.source.handle), JSON.stringify(seed.source.handle));
  heads.set(recoveryCurrentKey(null), JSON.stringify(seed.source.handle));
  generations.set(recoveryGenerationKey(seed.source.handle, seed.source.handle.writeId), rawEnvelope(seed.source));
  for (const row of [seed.sourceInput, seed.sourceHome, seed.sourceLifecycle, seed.targetLifecycle]) {
    heads.set(entryHeadKey(row.scope), row.headRaw); generations.set(entryGenerationKey(row.scope,row.writeId),row.raw);
  }
  const run: NonNullable<RecoveryDomainDriver['runClaim']> = (...args) => {
    assert.equal(typeof driver.runClaim, 'function', 'dedicated claim transaction must exist');
    return driver.runClaim!(...args);
  };
  return { driver, model, memory, maps, ...seed, run };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

for (const native of [true, false]) {
  const label = native ? 'native adapter model' : 'memory contract model';
  test(`${label}: independent receipt participates only in a read-only paired-scope witness`,async()=>{
    const s=await setup(native),receipt=entry({ownerId:'owner-a',kind:'trip-receipt',tripId:s.source.handle.tripId},'historical-receipt');
    s.maps().get('heads')!.set(entryHeadKey(receipt.scope),receipt.headRaw);s.maps().get('generations')!.set(entryGenerationKey(receipt.scope,receipt.writeId),receipt.raw);
    const request=structuredClone(s.request);request.targetEntries.push({scope:receipt.scope,writeId:null});const before=structuredClone(s.maps());
    const result=await s.run(request,'readonly',state=>({value:state.target.entries.at(-1)?.headGenerationRaw}));assert.equal(result,receipt.raw);
    await assert.rejects(s.run(request,'readwrite',()=>({value:true,targetEntryWrites:[receipt]})));
    assert.deepEqual(s.maps(),before);s.driver.close?.();
  });
  test(`${label}: claim snapshot binds both canonical heads, current pointers and metadata generations`, async () => {
    const s = await setup(native);
    const snapshot = await s.run(s.request, 'readonly', state => ({ value: state }));
    assert.equal(snapshot.source.headRaw, JSON.stringify(s.source.handle));
    assert.equal(snapshot.source.currentRaw, JSON.stringify(s.source.handle));
    assert.equal(snapshot.source.generationRaw, rawEnvelope(s.source));
    assert.equal(snapshot.source.entries[0].headGenerationRaw, s.sourceInput.raw);
    assert.equal(snapshot.source.entries[2].generationRaw, s.sourceLifecycle.raw);
    assert.equal(snapshot.target.entries[2].headGenerationRaw, s.targetLifecycle.raw);
    assert.equal(snapshot.target.headRaw, undefined); assert.equal(snapshot.target.generationRaw, undefined);
    s.driver.close?.();
  });
  test(`${label}: reservation is metadata only and final paired writes reopen without changing guest data`, async () => {
    const s = await setup(native), before = structuredClone(s.maps());
    const pending = entry(s.targetProof.scope, 'pending-proof', 'non-authorizing pending fence');
    const pendingRequest = structuredClone(s.request); pendingRequest.targetEntries[3].writeId = pending.writeId;
    assert.equal(await s.run(pendingRequest, 'readwrite', () => ({ value: 'pending', targetEntryWrites: [pending] })), 'pending');
    assert.equal(s.maps().get('heads')!.get(recoveryScopeKey(s.target.handle)), undefined);
    const snapshot = await s.run(s.request, 'readonly', state => ({ value: state }));
    assert.equal(snapshot.target.entries[3].headGenerationRaw, pending.raw);
    assert.equal(snapshot.target.entries[3].generationRaw, undefined);
    assert.equal(await s.run(s.request, 'readwrite', () => s.decision), 'committed');
    const readback = await s.run(s.request, 'readonly', state => ({ value: state }));
    assert.equal(readback.target.generationRaw, rawEnvelope(s.target));
    assert.equal(readback.target.currentRaw, JSON.stringify(s.target.handle));
    assert.equal(readback.source.entries[3].generationRaw, s.sourceProof.raw);
    assert.equal(readback.target.entries[3].generationRaw, s.targetProof.raw);
    for (const [store, values] of before) for (const [key, raw] of values) assert.equal(s.maps().get(store)!.get(key), raw);
    assert.equal(s.maps().get('acknowledgements')!.size, 0); s.driver.close?.();
  });
  test(`${label}: rejects foreign scopes, unknown kinds, duplicate slots and unbound write identities before decide`, async () => {
    const s = await setup(native), before = structuredClone(s.maps());
    for (const change of [
      r => { r.sourceHandle.ownerId = 'owner-a'; }, r => { r.targetHandle.ownerId = null; },
      r => { r.targetHandle.tripId = 'foreign-trip'; }, r => { r.targetHandle.ownerId = ' '; },
      r => { r.sourceEntries[0].scope.ownerId = 'foreign'; }, r => { r.targetEntries[0].scope.tripId = 'foreign-trip'; },
      r => { r.targetEntries[0].scope.kind = 'arbitrary'; }, r => { r.targetEntries[0].writeId = ''; },
      r => { r.targetEntries.push(structuredClone(r.targetEntries[0])); },
    ] as ((r: any) => void)[]) {
      const request = structuredClone(s.request); change(request); let called = false;
      await assert.rejects(s.run(request, 'readwrite', () => { called = true; return s.decision; }));
      assert.equal(called, false); assert.deepEqual(s.maps(), before);
    }
    s.driver.close?.();
  });
  test(`${label}: rejects forbidden source changes, unbound target changes and malformed bound payloads atomically`, async () => {
    const s = await setup(native), before = structuredClone(s.maps());
    for (const change of [
      d => { d.sourceHeadRaw = JSON.stringify(s.target.handle); },
      d => { d.sourceCurrentRaw = JSON.stringify(s.target.handle); },
      d => { d.sourceGenerationRaw = rawEnvelope(s.target); },
      d => { d.acknowledgementRaw = 'account authority'; },
      d => { d.sourceEntryWrites = [s.sourceInput]; },
      d => { d.sourceEntryWrites = [s.sourceLifecycle]; },
      d => { d.targetEntryWrites = [s.targetLifecycle]; },
      d => { d.targetEntryWrites[0].scope.ownerId = 'owner-b'; },
      d => { d.targetEntryWrites[0].writeId = 'unrequested'; },
      d => { d.targetEntryWrites[0].raw = s.sourceInput.raw; },
      d => { d.targetEntryWrites[0].headRaw = s.sourceInput.headRaw; },
      d => { d.targetEntryWrites.push(structuredClone(d.targetEntryWrites[0])); },
      d => { d.targetGenerationRaw = rawEnvelope(s.source); },
      d => { d.targetHeadRaw = JSON.stringify(s.source.handle); },
      d => { d.targetCurrentRaw = JSON.stringify(s.source.handle); },
      d => { delete d.targetCurrentRaw; },
    ] as ((d: any) => void)[]) {
      const decision = structuredClone(s.decision); change(decision);
      await assert.rejects(s.run(s.request, 'readwrite', () => decision)); assert.deepEqual(s.maps(), before);
    }
    s.driver.close?.();
  });
  test(`${label}: readonly and async decisions cannot perform a claim`, async () => {
    const s = await setup(native), before = structuredClone(s.maps());
    await assert.rejects(s.run(s.request, 'readonly', () => s.decision));
    await assert.rejects(s.run(s.request, 'readwrite', (() => Promise.resolve(s.decision)) as any));
    assert.deepEqual(s.maps(), before); s.driver.close?.();
  });
  test(`${label}: immutable collision retains all prior canonical and receipt bytes`, async () => {
    const s = await setup(native);
    s.maps().get('generations')!.set(entryGenerationKey(s.sourceProof.scope,s.sourceProof.writeId),'prior immutable proof');
    const before = structuredClone(s.maps()); await assert.rejects(s.run(s.request,'readwrite',()=>s.decision));
    assert.deepEqual(s.maps(),before); s.driver.close?.();
  });
  test(`${label}: request binding is frozen before an asynchronous caller mutation`, async () => {
    const s = await setup(native), request = structuredClone(s.request);
    const pending = s.run(request, 'readonly', state => ({value:state}));
    request.sourceHandle.ownerId = 'foreign'; request.targetEntries[0].scope.ownerId = 'foreign';
    const read = await pending; assert.equal(read.source.generationRaw,rawEnvelope(s.source));
    assert.equal(read.target.entries[2].generationRaw,s.targetLifecycle.raw); s.driver.close?.();
  });
}

test('native claim waits for complete and verifies exact bytes through a separate readonly transaction', async () => {
  const s = await setup(true), before = structuredClone(s.maps()); s.model!.holdCompletion = true;
  let done = false; const pending = s.run(s.request,'readwrite',()=>s.decision).then(value=>{done=true;return value;});
  await turn(); assert.equal(done,false); assert.deepEqual(s.maps(),before);
  assert(s.model!.pendingCompletion); s.model!.holdCompletion=false; s.model!.pendingCompletion!();
  assert.equal(await pending,'committed');
  const read = await s.run(s.request,'readonly',state=>({value:state}));
  assert.equal(read.target.generationRaw,s.decision.targetGenerationRaw); assert.equal(read.target.entries[0].generationRaw,s.targetInput.raw);
  assert.equal(read.source.entries[3].generationRaw,s.sourceProof.raw); s.driver.close?.();
});
test('native claim add or pointer request quota aborts every staged mutation and preserves first cause', async () => {
  for (const failed of ['canonical','source-proof','target-proof','target-input','target-home','heads']) {
    const s = await setup(true), before = structuredClone(s.maps());
    if(failed==='heads')s.model!.failAddStore='heads';
    else s.model!.failAddKeyPrefix=failed==='canonical'?recoveryGenerationKey(s.target.handle,s.target.handle.writeId):
      entryGenerationKey((failed==='source-proof'?s.sourceProof:failed==='target-proof'?s.targetProof:failed==='target-input'?s.targetInput:s.targetHome).scope,
        (failed==='source-proof'?s.sourceProof:failed==='target-proof'?s.targetProof:failed==='target-input'?s.targetInput:s.targetHome).writeId);
    await assert.rejects(s.run(s.request,'readwrite',()=>s.decision),(error:any)=>error.reason==='quota'&&error.commitStatus==='not-committed');
    assert.deepEqual(s.maps(),before); s.driver.close?.();
  }
});
test('native claim refuses unavailable strict durability before staging writes', async () => {
  const s = await setup(true), before = structuredClone(s.maps()); s.model!.strictSupported=false;
  await assert.rejects(s.run(s.request,'readwrite',()=>s.decision),(error:any)=>error.reason==='unavailable');
  assert.deepEqual(s.maps(),before); s.driver.close?.();
});

for (const native of [true, false]) {
  const label = native ? 'native adapter model' : 'memory contract model';
  test(`${label}: claim-head listing finds only this owner's pending fences without a canonical generation`, async () => {
    const s = await setup(native);
    assert.equal(typeof s.driver.listClaimHeads,'function','scoped claim-head enumeration must exist');
    await s.run(s.request,'readwrite',()=>({value:'reserved',targetEntryWrites:[s.targetProof]}));
    const heads=s.maps().get('heads')!;
    heads.set(entryHeadKey(s.sourceProof.scope),s.sourceProof.headRaw);
    heads.set('["entry","owner-a-other","recovery-claim","synthetic-trip"]','foreign unsupported data');
    heads.set('["entry","owner-a","future-kind","synthetic-trip"]','unrelated future data');
    const before=structuredClone(s.maps());
    assert.equal(heads.has(recoveryScopeKey(s.target.handle)),false);
    assert.deepEqual(await s.driver.listClaimHeads!('owner-a'),[{key:entryHeadKey(s.targetProof.scope),raw:s.targetProof.headRaw}]);
    assert.deepEqual(await s.driver.listClaimHeads!(null),[{key:entryHeadKey(s.sourceProof.scope),raw:s.sourceProof.headRaw}]);
    assert.deepEqual(await s.driver.listClaimHeads!('owner-b'),[]);
    assert.deepEqual(s.maps(),before); s.driver.close?.();
  });
  test(`${label}: malformed matching claim rows fail closed instead of disappearing from enumeration`, async () => {
    const s=await setup(native); assert.equal(typeof s.driver.listClaimHeads,'function');
    for(const [key,raw] of [
      ['["entry","owner-a","recovery-claim"]',s.targetProof.headRaw],
      ['["entry","owner-a","recovery-claim",null]',s.targetProof.headRaw],
      ['["entry","owner-a","recovery-claim"," "]',s.targetProof.headRaw],
      ['["entry","owner-a","recovery-claim","synthetic-trip","extra"]',s.targetProof.headRaw],
      ['["entry","owner-a","recovery-claim",',s.targetProof.headRaw],
      [entryHeadKey(s.targetProof.scope),'{broken'],
      [entryHeadKey(s.targetProof.scope),s.sourceProof.headRaw],
      [entryHeadKey(s.targetProof.scope),JSON.stringify({...JSON.parse(s.targetProof.headRaw),version:9})],
      [entryHeadKey(s.targetProof.scope),undefined],
    ] as [string,unknown][]) {
      const heads=s.maps().get('heads')!; heads.set(key,raw); const before=structuredClone(s.maps());
      await assert.rejects(s.driver.listClaimHeads!('owner-a')); assert.deepEqual(s.maps(),before); heads.delete(key);
    }
    s.driver.close?.();
  });
  test(`${label}: claim-head listing rejects invalid owner arguments and non-string database keys without writes`, async () => {
    const s=await setup(native); assert.equal(typeof s.driver.listClaimHeads,'function');
    const before=structuredClone(s.maps());
    for(const owner of ['', ' ', undefined, 42]) await assert.rejects(s.driver.listClaimHeads!(owner as any));
    assert.deepEqual(s.maps(),before);
    s.maps().get('heads')!.set(42 as any,'bad typed key'); const withBadKey=structuredClone(s.maps());
    await assert.rejects(s.driver.listClaimHeads!('owner-a')); assert.deepEqual(s.maps(),withBadKey); s.driver.close?.();
  });
}
