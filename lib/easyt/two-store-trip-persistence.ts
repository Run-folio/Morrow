import type { EasyTTrip } from './trip.ts';
import { loadCachedTripFromStorage, saveTripRecoveryToStorage, acknowledgeTripBuildSaveInStorage, markTripRecoveryStateInStorage,discardTripRecoveryInStorage,tripRecoveryStorageKey, tripCacheStorageKey, currentTripStorageKey, EASYT_ACTIVE_TRIP_KEY, samePersistedTripDocument,
  type TripBuildSaveAcknowledgement, type EasyTBrowserStorage, type TripRecoveryHandle, type TripRecoveryRecord, type TripRecoveryWriteResult } from './storage.ts';
import { decodeRawRecovery, decodeRecoveryEnvelope, decodeRecoverySource, decodeDomainCurrent, sameDomainHandle, type NativeRecoveryPointer, type RecoveryDomainDriver, type RecoveryEnvelope, type RecoveryReadResult, type RecoveryHandle } from './durable-recovery-domain.ts';
import { tripBuildDocumentsCanonicalEquivalent } from './trip-promotion.ts';
import { createRecoveryDomainStore } from './durable-recovery-store.ts';
import { resolveRecoveryProvenance } from './recovery-provenance.ts';
import { prepareTripDocumentForWrite } from './trip-document.ts';
import type { RecoveryEntryWrite } from './durable-entry-protocol.ts';
import { sameEntryHandle } from './durable-entry-protocol.ts';
import { prepareEntryWrite, createRecoveryEntryStore } from './durable-entry-store.ts';
import { createTwoStoreEntryPersistence } from './two-store-entry-persistence.ts';
import { builderInputDraftKey, readBuilderInputDraft } from './trip-builder-input-draft.ts';
import { requireReadableTripDocument } from './trip-document.ts';
import {createDurableHomepagePersistence,decodeHomepageBundle} from './homepage-persistence.ts';
import type {PreparedEntryWrite} from './durable-entry-store.ts';
import {createRecoveryLifecycle} from './recovery-domain-lifecycle.ts';
import {readRecoveryClaimBarrier,readOwnerRecoveryClaimBarrier,recoveryClaimTripIds} from './recovery-domain-claim.ts';
import {commitAcceptedRouteProjection,routeProjectionInputKey} from './trip-route-intent.ts';

export type TwoStoreRead = { kind: 'found'; trip: EasyTTrip; recovery: TripRecoveryRecord | null; domain: Extract<RecoveryReadResult, { kind: 'ready' }> | null }
  | { kind: 'missing'; currentCleared?: true } | { kind: 'protected'; reason: string } | { kind: 'unavailable'; reason: string };
export type TwoStoreList = { kind: 'ready'; recoveries: TripRecoveryRecord[] } | { kind: 'protected' | 'unavailable'; reason: string };
export type TwoStoreContext = { ownerId: string | null; isCurrent: () => boolean; overflowEnabled: boolean; accountOverflowQualified: boolean };
export type TwoStoreSaveOptions = { replace?: TripRecoveryHandle; state?: TripRecoveryRecord['state']; writeId?: string; now?: string;
  projectionOnly?: { acceptedRevision: number; inputRevision: number };
  newTripOrClone?: boolean; entry?: RecoveryEnvelope['entry']; entries?: RecoveryEntryWrite[]; canonicalBase?: EasyTTrip; expectedRecoverySource?: EasyTTrip };
export function createTwoStoreTripPersistence(storage: EasyTBrowserStorage, driver: RecoveryDomainDriver, context: TwoStoreContext) {
  const ownerId = context.ownerId, isCurrent = context.isCurrent;
  const active = () => { try { return isCurrent() === true; } catch { return false; } };
  const domain = createRecoveryDomainStore(driver, { ownerId, isCurrent: active });
  const lifecycle=createRecoveryLifecycle(driver,{ownerId,isCurrent:active});
  const scope = (tripId: string) => ({ ownerId, tripId });
  const nativeSources = (tripId: string) => {
    const base = tripRecoveryStorageKey(ownerId, tripId);
    const snapshot = () => {
      const copies: { key: string; raw: string }[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i); if (!key || key !== base && !key.startsWith(base + ':')) continue;
        const raw = storage.getItem(key); if (raw !== null) copies.push({ key, raw });
      }
      const legacy = storage.getItem(EASYT_ACTIVE_TRIP_KEY);
      if (legacy !== null) {
        const value = JSON.parse(legacy) as { id?: unknown; ownerId?: unknown };
        const ackRaw = storage.getItem(EASYT_ACTIVE_TRIP_KEY + ':acknowledged');
        const ack = ackRaw === null ? null : JSON.parse(ackRaw) as { source?: unknown; tripId?: unknown; ownerId?: unknown; sourceOwnerId?: unknown };
        const consumed = ack?.source === legacy && ack.tripId === tripId && (ack.ownerId === ownerId || ack.sourceOwnerId === null);
        if (!consumed && value?.id === tripId && (value.ownerId === null || value.ownerId === ownerId)) copies.push({ key: EASYT_ACTIVE_TRIP_KEY, raw: legacy });
      }
      return copies.sort((a, b) => a.key.localeCompare(b.key));
    };
    const first = snapshot(); if (JSON.stringify(first) !== JSON.stringify(snapshot())) throw new Error('Unstable recovery observation');
    return first;
  };
  const inspect = async (tripId: string) => {
    const result = await domain.read(tripId);
    if (!active()) return { kind: 'protected' as const, reason: 'operation-changed' };
    if (result.kind !== 'ready') return { kind: result.kind === 'protected-conflict' || result.reason === 'schema' || result.reason === 'corrupt' ? 'protected' as const : 'unavailable' as const, reason: result.reason };
    const claim=await readRecoveryClaimBarrier(driver,storage,{ownerId,isCurrent:active},tripId,result.envelope);
    if(claim.kind!=='ready')return claim;
    try {
      let nativeCacheRaw: string | null | undefined;
      if (result.envelope?.entry.nativeCacheRaw !== undefined) {
        const raw = storage.getItem(tripCacheStorageKey(ownerId, tripId));
        nativeCacheRaw = raw;
        if (raw !== result.envelope.entry.nativeCacheRaw) {
          const cached = readNativeCache(tripId, raw);
          if (!result.acknowledgement || cached.kind !== 'found'
            || JSON.stringify(cached.trip) !== JSON.stringify(prepareTripDocumentForWrite(JSON.parse(result.acknowledgement.canonicalRaw))))
            return {kind:'protected' as const,reason:'cache-divergence'};
        }
      }
      const legacy = nativeSources(tripId), resolved = resolveRecoveryProvenance({ scope: scope(tripId), legacy: { kind: 'ready', copies: legacy }, domain: result });
      if (resolved.kind === 'not-ready') return { kind: 'unavailable' as const, reason: 'unknown' };
      if (resolved.kind === 'protected-conflict') return { kind: 'protected' as const, reason: resolved.reason ?? 'unknown' };
      const metadata=result.envelope?await lifecycle.read(result.envelope):await lifecycle.absent(tripId);
      if(metadata.kind!=='ready')return metadata;
      if(nativeCacheRaw !== undefined && storage.getItem(tripCacheStorageKey(ownerId,tripId)) !== nativeCacheRaw)return {kind:'protected' as const,reason:'cache-changed'};
      if(!active()||JSON.stringify(nativeSources(tripId))!==JSON.stringify(legacy))return {kind:'protected' as const,reason:'native-changed'};
      return { kind: 'resolved' as const, resolved, legacy, domain: result,nativeCacheRaw,lifecycle:'lifecycle' in metadata?metadata.lifecycle:null,
        lifecycleEntry:'entry' in metadata?metadata.entry:null };
    } catch { return { kind: 'unavailable' as const, reason: 'native-read-unknown' }; }
  };
  const refused = (tripId: string, writeId: string, protectedRecovery: boolean, reason: TripRecoveryWriteResult['failureReason'] = protectedRecovery ? 'protected-recovery' : 'unknown'): TripRecoveryWriteResult => ({
    stored: false, handle: { ownerId, tripId, writeId }, blockedByExistingRecovery: protectedRecovery, failureReason: reason, writeAttempted: false,
    outcome: protectedRecovery ? 'protected-conflict' : 'unknown' });
  const domainHandle = (handle: TripRecoveryHandle): RecoveryHandle => ({ version: 1, backend: 'indexeddb', ownerId: handle.ownerId, tripId: handle.tripId, writeId: handle.writeId });
  const nativePointer = () => {
    const raw = storage.getItem(currentTripStorageKey(ownerId));
    if (raw !== storage.getItem(currentTripStorageKey(ownerId))) throw new Error('Unstable current pointer');
    if (raw === null) return { raw, tripId: null };
    const value = JSON.parse(raw);
    if (!value || value.version !== 2 || value.ownerId !== ownerId || typeof value.tripId !== 'string' || !value.tripId.trim()) throw new Error('Invalid current pointer');
    return { raw, tripId: value.tripId as string };
  };
  const readNativeCache=(tripId:string, expectedRaw?:string|null):TwoStoreRead=>{
    let raw:string|null;
    try{const key=tripCacheStorageKey(ownerId,tripId);raw=storage.getItem(key);
      if((expectedRaw!==undefined&&raw!==expectedRaw)||raw!==storage.getItem(key)||!active())return {kind:'protected',reason:'cache-changed'};
    }catch{return {kind:'unavailable',reason:'cache-read-unknown'};}
    if(raw===null)return {kind:'missing'};
    try{
      const frozen:EasyTBrowserStorage={getItem:()=>raw,key:()=>null,length:0,setItem:()=>{throw new Error('Read-only cache codec')},removeItem:()=>{throw new Error('Read-only cache codec')}};
      const trip=loadCachedTripFromStorage(frozen,tripId,ownerId);
      return trip?{kind:'found',trip,recovery:null,domain:null}:{kind:'protected',reason:'cache-document'};
    }catch{return {kind:'protected',reason:'cache-document'};}
  };
  const digest = async (raw: string) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), value => value.toString(16).padStart(2, '0')).join('');
  return {
    async mark(input:TripRecoveryHandle,state:TripRecoveryRecord['state'],reason?:TripRecoveryRecord['conflictReason']){
      const handle={...input};if(handle.ownerId!==ownerId||!active())return false;
      const before=await inspect(handle.tripId);if(before.kind!=='resolved')return false;
      if(!before.domain.envelope) {
        if(handle.backend==='indexeddb')return false;
        const result=await this.native(handle.tripId,()=>markTripRecoveryStateInStorage(storage,handle,state,reason));return result.kind==='done'&&result.value;
      }
      if(handle.backend!=='indexeddb'||before.domain.acknowledgement||!sameDomainHandle(domainHandle(handle),before.domain.envelope.handle))return false;
      const guard=()=>{try{return active()&&JSON.stringify(nativeSources(handle.tripId))===JSON.stringify(before.legacy)}catch{return false}};
      if(!await createRecoveryLifecycle(driver,{ownerId,isCurrent:guard}).write(before.domain.envelope,{state,conflictReason:reason}))return false;
      const after=await inspect(handle.tripId);return active()&&after.kind==='resolved'&&after.lifecycle?.state===state
        &&sameDomainHandle(after.lifecycle.handle,domainHandle(handle));
    },
    async discard(input:TripRecoveryHandle,confirmed:boolean){
      const handle={...input};if(!confirmed||handle.ownerId!==ownerId||!active())return false;
      const before=await inspect(handle.tripId);if(before.kind!=='resolved')return false;
      if(!before.domain.envelope) {
        if(handle.backend==='indexeddb')return false;
        const result=await this.native(handle.tripId,()=>discardTripRecoveryInStorage(storage,handle,true));return result.kind==='done'&&result.value;
      }
      if(handle.backend!=='indexeddb'||!sameDomainHandle(domainHandle(handle),before.domain.envelope.handle))return false;
      let pointer:string|null;try{pointer=nativePointer().raw}catch{return false}
      const guard=()=>{try{return active()&&nativePointer().raw===pointer&&JSON.stringify(nativeSources(handle.tripId))===JSON.stringify(before.legacy)}catch{return false}};
      if(!await createRecoveryLifecycle(driver,{ownerId,isCurrent:guard}).write(before.domain.envelope,{discard:true},pointer))return false;
      const after=await inspect(handle.tripId);return active()&&after.kind==='resolved'&&after.lifecycle?.disposition==='discarded'
        &&sameDomainHandle(after.lifecycle.handle,domainHandle(handle));
    },
    async current(): Promise<TwoStoreRead> {
      const claims=await readOwnerRecoveryClaimBarrier(driver,storage,{ownerId,isCurrent:active});if(claims.kind!=='ready')return claims;
      const current = await domain.current();
      if (current.kind !== 'ready') return { kind: current.kind === 'protected-conflict' || ['schema', 'corrupt'].includes(current.reason) ? 'protected' : 'unavailable', reason: current.reason };
      try {
        const native = nativePointer();
        if (!active()) return { kind: 'protected', reason: 'operation-changed' };
        if(current.current?.backend==='cleared') {
          if(native.raw!==null&&native.raw!==current.current.nativePointerRaw)return {kind:'protected',reason:'current-divergence'};
          const after=await domain.current();
          return active()&&after.kind==='ready'&&JSON.stringify(after.current)===JSON.stringify(current.current)&&nativePointer().raw===native.raw
            ?{kind:'missing',currentCleared:true}:{kind:'protected',reason:'current-changed'};
        }
        if (current.current?.backend === 'local-storage') {
          const pointer = current.current;
          if (native.raw !== pointer.nativePointerRaw || native.tripId !== pointer.tripId) return { kind: 'protected', reason: 'current-divergence' };
          const state = await inspect(pointer.tripId); if (state.kind !== 'resolved') return state;
          if (state.domain.envelope) return { kind: 'protected', reason: 'current-divergence' };
          if (pointer.source === 'recovery') {
            if (!state.resolved.source || await digest(state.resolved.source.raw) !== pointer.documentDigest) return { kind: 'protected', reason: 'current-divergence' };
            const record = decodeRecoverySource(state.resolved.source, scope(pointer.tripId));
            if (record.kind !== 'readable' || record.value.writeId !== pointer.writeId) return { kind: 'protected', reason: 'current-divergence' };
          } else {
            const raw = storage.getItem(tripCacheStorageKey(ownerId,pointer.tripId));
            if (state.resolved.source || raw === null || await digest(raw) !== pointer.documentDigest) return { kind: 'protected', reason: 'current-divergence' };
          }
        }
        let result: TwoStoreRead;
        if (current.envelope) {
          if (native.tripId !== current.envelope.handle.tripId && native.raw !== (current.envelope.entry.nativePointerRaw ?? null)) return { kind: 'protected', reason: 'current-divergence' };
          result = await this.read(current.envelope.handle.tripId);
        } else {
          result = native.tripId ? await this.read(native.tripId) : { kind: 'missing' };
        }
        const after = await domain.current();
        if (!active() || after.kind !== 'ready' || nativePointer().raw !== native.raw || JSON.stringify(after.current ?? after.envelope?.handle ?? null) !== JSON.stringify(current.current ?? current.envelope?.handle ?? null)) return { kind: 'protected', reason: 'current-changed' };
        return result;
      } catch { return { kind: 'protected', reason: 'current-pointer' }; }
    },
    async clearCurrent():Promise<boolean> {
      try {
        const listed=await this.list();if(listed.kind!=='ready'||!active())return false;
        const expected=await driver.readCurrent(ownerId),decoded=decodeDomainCurrent(expected,ownerId);
        if(decoded.kind!=='readable'||!active())return false;
        const native=nativePointer(),raw=JSON.stringify({version:1,backend:'cleared',ownerId,nativePointerRaw:native.raw});
        const result=await driver.run(scope('__navigation__'),null,'readwrite',state=>({value:active()&&state.currentRaw===expected,
          ...(active()&&state.currentRaw===expected?{currentRaw:raw}:{})}));
        if(!result||await driver.readCurrent(ownerId)!==raw||!active()||nativePointer().raw!==native.raw)return false;
        // This is deliberate navigation acknowledgement, not recovery deletion.
        return true;
      }catch{return false;}
    },
    async list(): Promise<TwoStoreList> {
      const listed = await domain.list();
      if (listed.kind !== 'ready') return { kind: listed.kind === 'protected-conflict' || ['schema', 'corrupt'].includes(listed.reason) ? 'protected' : 'unavailable', reason: listed.reason };
      try {
        const ids = new Set(listed.recoveries.map(row => row.envelope.handle.tripId));
        const claims=await recoveryClaimTripIds(driver,ownerId);if(claims.kind!=='ready')return claims;
        for(const id of claims.tripIds)ids.add(id);
        const prefix = tripRecoveryStorageKey(ownerId, 'prefix').slice(0, -'prefix'.length);
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i); if (key?.startsWith(prefix)) ids.add(decodeURIComponent(key.slice(prefix.length).split(':')[0]));
        }
        const recoveries: TripRecoveryRecord[] = [];
        for (const id of ids) {
          const read = await this.read(id); if (read.kind === 'protected' || read.kind === 'unavailable') return read;
          if (read.kind === 'found' && read.recovery) recoveries.push(read.recovery);
        }
        return active() ? { kind: 'ready', recoveries } : { kind: 'protected', reason: 'operation-changed' };
      } catch { return { kind: 'unavailable', reason: 'native-read-unknown' }; }
    },
    async cached(tripId: string): Promise<TwoStoreRead> {
      const state = await inspect(tripId); if(state.kind !== 'resolved') return state;
      if(state.domain.acknowledgement) return {kind:'found',trip:prepareTripDocumentForWrite(JSON.parse(state.domain.acknowledgement.canonicalRaw)),recovery:null,domain:state.domain};
      return readNativeCache(tripId);
    },
    /** Every updated low-level native mutation must pass this readiness barrier. */
    async native<T>(tripId: string, operation: () => T): Promise<{kind:'done';value:T}|{kind:'protected'|'unavailable';reason:string}> {
      const before=await inspect(tripId);if(before.kind!=='resolved')return before;
      if(before.domain.envelope)return {kind:'protected',reason:'domain-operation-required'};
      if(!active())return {kind:'protected',reason:'operation-changed'};
      const value=operation(),after=await inspect(tripId);
      if(after.kind!=='resolved')return after;
      return !active()||after.domain.envelope?{kind:'protected',reason:'operation-changed'}:{kind:'done',value};
    },
    async acknowledge(reviewedInput:EasyTTrip,canonicalInput:EasyTTrip,submittedInput:TripRecoveryHandle):Promise<TripBuildSaveAcknowledgement> {
      let reviewed:EasyTTrip,canonical:EasyTTrip,submitted:TripRecoveryHandle;
      try { reviewed=prepareTripDocumentForWrite(structuredClone(reviewedInput));canonical=prepareTripDocumentForWrite(structuredClone(canonicalInput));submitted={...submittedInput}; }
      catch { return {outcome:'invalid-canonical',remainingRecovery:null,accountAcknowledged:false}; }
      if(submitted.ownerId!==ownerId||canonical.ownerId!==ownerId||canonical.id!==submitted.tripId||!tripBuildDocumentsCanonicalEquivalent(reviewed,canonical,ownerId))
        return {outcome:'invalid-canonical',remainingRecovery:null,accountAcknowledged:false};
      const observed=await this.read(submitted.tripId);
      const remaining=observed.kind==='found'?observed.recovery:null;
      if(!active())return {outcome:'storage-failed',remainingRecovery:remaining,accountAcknowledged:true,cacheStored:false,deviceOutcome:'unknown'};
      if(submitted.backend==='indexeddb') {
        let rawRecovery:string;
        try {
          const generation=await driver.run(scope(submitted.tripId),submitted.writeId,'readonly',state=>({value:decodeRecoveryEnvelope(state.generationRaw,scope(submitted.tripId))}));
          if(generation.kind!=='readable'||!sameDomainHandle(generation.value.handle,domainHandle(submitted))
            ||!tripBuildDocumentsCanonicalEquivalent(JSON.parse(generation.value.rawRecovery).trip,reviewed,ownerId))return {outcome:'invalid-canonical',remainingRecovery:remaining,accountAcknowledged:false};
          rawRecovery=generation.value.rawRecovery;
        } catch { return {outcome:'storage-failed',remainingRecovery:remaining,accountAcknowledged:true,cacheStored:false,deviceOutcome:'unknown'}; }
        const ack=await domain.recordTrustedAccountAck({handle:domainHandle(submitted),rawRecovery,canonicalRaw:JSON.stringify(canonical)});
        const after=await this.read(submitted.tripId),afterRecovery=after.kind==='found'?after.recovery:remaining;
        if(ack.kind!=='journaled'||after.kind==='protected'||after.kind==='unavailable')return {outcome:'storage-failed',remainingRecovery:afterRecovery,accountAcknowledged:true,cacheStored:false,deviceOutcome:after.kind==='protected'?'protected-conflict':'unknown'};
        return {outcome:ack.headMatches?'acknowledged':'device-newer',remainingRecovery:afterRecovery,accountAcknowledged:true,cacheStored:false};
      }
      if(observed.kind==='protected'||observed.kind==='unavailable'||observed.kind==='found'&&observed.domain?.envelope)
        return {outcome:'storage-failed',remainingRecovery:remaining,accountAcknowledged:true,cacheStored:false,deviceOutcome:observed.kind==='protected'?'protected-conflict':'unknown'};
      let beforeCurrent:unknown;
      try { beforeCurrent=await driver.readCurrent(ownerId); } catch { return {outcome:'storage-failed',remainingRecovery:remaining,accountAcknowledged:true,cacheStored:false,deviceOutcome:'unknown'}; }
      const guarded=await this.native(submitted.tripId,()=>acknowledgeTripBuildSaveInStorage(storage,reviewed,canonical,submitted));
      if(guarded.kind!=='done')return {outcome:'storage-failed',remainingRecovery:remaining,accountAcknowledged:true,cacheStored:false,deviceOutcome:guarded.kind==='protected'?'protected-conflict':'unknown'};
      const result=guarded.value;
      if(result.outcome==='acknowledged') {
        try {
          const native=nativePointer(),rawCache=storage.getItem(tripCacheStorageKey(ownerId,submitted.tripId));
          if(native.tripId===submitted.tripId&&native.raw&&rawCache!==null) {
            const pointer:NativeRecoveryPointer={version:1,backend:'local-storage',source:'cache',ownerId,tripId:submitted.tripId,writeId:null,nativePointerRaw:native.raw,documentDigest:await digest(rawCache)};
            const pointerRaw=JSON.stringify(pointer);
            const updated=await driver.run(scope(submitted.tripId),null,'readwrite',state=>({value:active()&&state.currentRaw===beforeCurrent,
              ...(active()&&state.currentRaw===beforeCurrent?{currentRaw:pointerRaw}:{})}));
            if(!updated||await driver.readCurrent(ownerId)!==pointerRaw)return {...result,accountAcknowledged:true,cacheStored:true,deviceOutcome:'pointer-incomplete'};
          }
        } catch { return {...result,accountAcknowledged:true,cacheStored:true,deviceOutcome:'pointer-incomplete'}; }
      }
      return {...result,accountAcknowledged:result.outcome!=='invalid-canonical',cacheStored:result.outcome!=='storage-failed'};
    },
    async read(tripId: string): Promise<TwoStoreRead> {
      const state = await inspect(tripId); if (state.kind !== 'resolved') return state;
      if (!active()) return { kind: 'protected', reason: 'operation-changed' };
      if (state.resolved.kind === 'indexeddb' && state.domain.envelope) {
        const record = decodeRawRecovery(state.domain.envelope.rawRecovery, scope(tripId));
        if (record.kind !== 'readable') return { kind: 'protected', reason: record.kind };
        if (state.domain.acknowledgement) return { kind: 'found', trip: prepareTripDocumentForWrite(JSON.parse(state.domain.acknowledgement.canonicalRaw)), recovery: null, domain: state.domain };
        if(state.lifecycle?.disposition==='discarded') {
          const cached=readNativeCache(tripId);
          return cached.kind==='found'?{...cached,domain:state.domain}:cached;
        }
        return { kind: 'found', trip: record.value.trip, recovery: { ...record.value, backend: 'indexeddb',
          ...(state.lifecycle?{state:state.lifecycle.state,conflictReason:state.lifecycle.conflictReason??undefined}:{}) }, domain: state.domain };
      }
      if (state.resolved.kind === 'local-storage' && state.resolved.source) {
        const record = decodeRecoverySource(state.resolved.source, scope(tripId));
        if (record.kind !== 'readable') return { kind: 'protected', reason: record.kind };
        return { kind: 'found', trip: record.value.trip, recovery: { ...record.value, backend: undefined }, domain: null };
      }
      return readNativeCache(tripId);
    },
    async save(inputTrip: EasyTTrip, options: TwoStoreSaveOptions = {}): Promise<TripRecoveryWriteResult> {
      const writeId = options.writeId ?? globalThis.crypto.randomUUID(), tripId = inputTrip.id;
      const reject = (protectedCopy: boolean, reason?: TripRecoveryWriteResult['failureReason']): TripRecoveryWriteResult => ({
        ...refused(tripId,writeId,protectedCopy,reason), ...(options.projectionOnly ? {projectionDeferred:true,writeAttempted:false} : {}) });
      // Caller-owned bodies/metadata must be frozen before the first async barrier.
      let trip: EasyTTrip;
      try { trip = prepareTripDocumentForWrite(structuredClone(inputTrip)); options = structuredClone(options); }
      catch { return reject(true, 'scope-mismatch'); }
      if (!active() || trip.ownerId !== null && trip.ownerId !== ownerId || ownerId === null && trip.ownerId !== null) return reject(true, 'scope-mismatch');
      const state = await inspect(tripId); if (state.kind !== 'resolved') return reject(state.kind === 'protected');
      if(state.lifecycle?.disposition==='discarded'&&!(state.domain.acknowledgement&&options.canonicalBase
        &&samePersistedTripDocument(options.canonicalBase,JSON.parse(state.domain.acknowledgement.canonicalRaw))))return reject(true);
      // A mounted replacement is authorized by its frozen source document, not
      // just a write ID which an older/native writer may have reused.
      const expectedRecoverySource = options.expectedRecoverySource ?? options.canonicalBase;
      if (!state.domain.envelope && options.replace && expectedRecoverySource) {
        const source = state.resolved.source;
        const decoded = source ? decodeRecoverySource(source, scope(tripId)) : null;
        if (decoded?.kind !== 'readable' || options.replace.ownerId !== ownerId || options.replace.tripId !== tripId
          || options.replace.writeId !== decoded.value.writeId
          || JSON.stringify(prepareTripDocumentForWrite(decoded.value.trip)) !== JSON.stringify(prepareTripDocumentForWrite(expectedRecoverySource))) {
          return reject(true);
        }
      }
      // Existing-trip admission requires an exact frozen source, never a
      // reused handle alone or a caller merely declaring the trip "new".
      let existingAdmission = false;
      let cacheWitness: {key: string; raw: string} | null = null;
      if (state.domain.envelope?.entry.nativeCacheRaw !== undefined) {
        // Carry the exact bytes inspect validated across its lifecycle await.
        const key = tripCacheStorageKey(ownerId, tripId), raw = state.nativeCacheRaw;
        if (raw == null || raw !== storage.getItem(key)) return reject(true);
        cacheWitness = {key, raw};
      }
      if (!state.domain.envelope && !options.newTripOrClone && expectedRecoverySource
        && expectedRecoverySource.id === tripId && expectedRecoverySource.ownerId === trip.ownerId) {
        if (state.resolved.source && options.replace) {
          const decoded = decodeRecoverySource(state.resolved.source, scope(tripId));
          existingAdmission = decoded.kind === 'readable' && options.replace.ownerId === ownerId
            && options.replace.tripId === tripId && options.replace.writeId === decoded.value.writeId
            && JSON.stringify(prepareTripDocumentForWrite(decoded.value.trip)) === JSON.stringify(prepareTripDocumentForWrite(expectedRecoverySource));
        } else if (!state.legacy.length && !options.replace) {
          const key = tripCacheStorageKey(ownerId, tripId), raw = storage.getItem(key);
          const cached = readNativeCache(tripId, raw);
          if (cached.kind === 'found' && cached.trip.ownerId === ownerId
            && JSON.stringify(cached.trip) === JSON.stringify(prepareTripDocumentForWrite(expectedRecoverySource))) {
            if (raw !== null && raw === storage.getItem(key)) { cacheWitness = {key, raw}; existingAdmission = true; }
          }
        }
      }
      const sourceStillCurrent = () => { try { return !cacheWitness || storage.getItem(cacheWitness.key) === cacheWitness.raw; } catch { return false; } };
      const requiredEntries:PreparedEntryWrite[]=[];
      for(const input of options.entries??[]) {
        const prepared=prepareEntryWrite(input,ownerId);
        if(prepared.kind!=='prepared'||prepared.envelope.raw===null)return reject(true,'scope-mismatch');
        if(prepared.scope.kind==='builder-input') {
          const read=readBuilderInputDraft({getItem:()=>prepared.envelope.raw},requireReadableTripDocument(trip),ownerId),metadata=options.entry?.input;
          if(prepared.scope.tripId!==tripId||read.kind!=='readable'||!metadata||metadata.ownerId!==ownerId||metadata.tripId!==tripId
            ||metadata.raw!==prepared.envelope.raw||metadata.inputRevision!==read.draft.inputRevision)return reject(true,'scope-mismatch');
        }else {
          const payload=decodeHomepageBundle(prepared.envelope.raw,ownerId),receipt=payload?.storedInput?.receipt,metadata=options.entry?.receipt;
          if(receipt?.version!==1||receipt.tripId!==tripId||!metadata||metadata.ownerId!==ownerId||metadata.tripId!==tripId
            ||metadata.raw!==prepared.envelope.raw||metadata.operationId!==receipt.handoffId)return reject(true,'scope-mismatch');
        }
        requiredEntries.push(prepared);
      }
      const verifyEntries=async()=>{
        for(const prepared of requiredEntries) {
          if(prepared.scope.kind==='homepage') {
            const state=await createDurableHomepagePersistence(storage,driver,{ownerId,isCurrent:active,overflowEnabled:context.overflowEnabled,accountOverflowQualified:context.accountOverflowQualified}).read();
            if(state.kind!=='ready'||state.raw!==prepared.envelope.raw)return false;
          }else {
            const key=builderInputDraftKey(ownerId,tripId),state=await createTwoStoreEntryPersistence(storage,driver,{scope:prepared.scope,key,isCurrent:active,
              overflowEnabled:context.overflowEnabled,accountOverflowQualified:context.accountOverflowQualified,validate:raw=>raw===null||readBuilderInputDraft({getItem:()=>raw},requireReadableTripDocument(trip),ownerId).kind==='readable'}).read();
            if(state.kind!=='ready'||state.raw!==prepared.envelope.raw)return false;
          }
        }
        return active();
      };
      const existing = state.domain.envelope;
      let nativePointerRaw: string | null;
      try { nativePointerRaw = nativePointer().raw; } catch { return reject(true); }
      let expectedCurrentRaw: unknown;
      try { expectedCurrentRaw = await driver.readCurrent(ownerId); if (decodeDomainCurrent(expectedCurrentRaw, ownerId).kind !== 'readable') return reject(true); }
      catch { return reject(false); }
      if (!active()) return reject(true);
      // Projection-only work retains the exact input bytes. An existing domain
      // input may advance through the same paired commit used by authored edits.
      let projectionInput: { key: string; raw: string } | null = null;
      let projectionFence: Parameters<typeof domain.commit>[0]['projectionFence'];
      if (options.projectionOnly) {
        const revision = options.projectionOnly, prepared = requiredEntries[0], source = options.expectedRecoverySource;
        if (!Number.isSafeInteger(revision.acceptedRevision) || revision.acceptedRevision < 0
          || !Number.isSafeInteger(revision.inputRevision) || revision.inputRevision < 0
          || !source || !options.replace
          || options.entry?.receipt || options.entry?.claim
          || requiredEntries.length !== 1 || prepared.scope.kind !== 'builder-input'
          || prepared.envelope.raw === null
          || prepared.envelope.raw !== prepared.envelope.retainedPreviousRaw) return reject(true);
        const before = requireReadableTripDocument(source), candidate = requireReadableTripDocument(trip);
        // Narrow whitelist: optional route legs/assessment/residuals and a guarded
        // completion marker only. All other
        // authored or derived fields must remain exact; broader projections defer.
        const comparable = structuredClone(candidate);
        comparable.legs = structuredClone(before.legs);
        comparable.brief.routeAssessment = before.brief.routeAssessment;
        if (comparable.brief.cascadeStatus && before.brief.cascadeStatus)
          comparable.brief.cascadeStatus.routeReconciliation = before.brief.cascadeStatus.routeReconciliation;
        if (candidate.brief.intent.route.projectionInputKey !== before.brief.intent.route.projectionInputKey) {
          const inputKey = routeProjectionInputKey(before);
          if (routeProjectionInputKey(candidate) !== inputKey
            || candidate.brief.intent.route.projectionInputKey !== inputKey
            || candidate.brief.cascadeStatus?.routeReconciliation?.residual.some(unit => unit.kind !== 'recommendation')
            || commitAcceptedRouteProjection(before, {basedOnInputKey:inputKey,projectedTrip:candidate,reason:'necessary_reconciliation'}).kind !== 'accepted') return reject(true);
          // Validate with the route guard, but retain the completed candidate:
          // the guard's returned document rebuilds from the prior brief.
          comparable.brief.intent.route.projectionInputKey = before.brief.intent.route.projectionInputKey;
        }
        const key = builderInputDraftKey(ownerId,tripId), raw = prepared.envelope.raw;
        const priorInput = readBuilderInputDraft({getItem:()=>raw},before,ownerId);
        const nextInput = readBuilderInputDraft({getItem:()=>raw},candidate,ownerId);
        if (JSON.stringify(comparable) !== JSON.stringify(before) || before.ownerId !== candidate.ownerId
          || priorInput.kind !== 'readable' || nextInput.kind !== 'readable'
          || priorInput.draft.inputRevision !== revision.inputRevision
          || JSON.stringify(priorInput.draft) !== JSON.stringify(nextInput.draft)
          || priorInput.draft.fields.some(field=>field.status !== 'editable')) return reject(true);
        const observed = await createTwoStoreEntryPersistence(storage,driver,{scope:prepared.scope,key,isCurrent:active,
          overflowEnabled:context.overflowEnabled,accountOverflowQualified:context.accountOverflowQualified,
          validate:value=>value !== null && readBuilderInputDraft({getItem:()=>value},before,ownerId).kind==='readable'}).read();
        if (!active() || observed.kind !== 'ready' || observed.raw !== raw) return reject(true);
        if (existing) {
          // Optional work may advance only the exact body already selected by
          // navigation. Do not adopt an earlier clear or another selected trip.
          const selected = decodeDomainCurrent(expectedCurrentRaw,ownerId);
          if (selected.kind !== 'readable' || selected.value?.backend !== 'indexeddb'
            || !sameDomainHandle(selected.value,existing.handle)) return reject(true);
          if (options.replace.backend !== 'indexeddb' || !sameDomainHandle(domainHandle(options.replace),existing.handle)
            || existing.entry.claim || !observed.envelope || !prepared.envelope.parent
            || JSON.stringify(prepared.envelope.parent) !== JSON.stringify(observed.envelope.handle)
            || observed.legacyRaw !== prepared.envelope.legacyRaw
            || existing.entry.input?.raw !== raw || existing.entry.input.inputRevision !== revision.inputRevision
            || JSON.stringify(requireReadableTripDocument(JSON.parse(existing.rawRecovery).trip)) !== JSON.stringify(before)
            || state.lifecycle && (state.lifecycle.disposition !== 'active' || state.lifecycle.state !== (options.state ?? 'pending'))) return reject(true);
          const claimScope = {ownerId,tripId,kind:'recovery-claim' as const};
          const claim = await createRecoveryEntryStore(driver,{ownerId,isCurrent:active}).read(claimScope);
          if (!active() || claim.kind !== 'ready' || claim.envelope) return reject(true);
          projectionFence = {sourceRaw:JSON.stringify(existing),currentRaw:expectedCurrentRaw,entries:[
            {scope:{ownerId,tripId,kind:'recovery-lifecycle'},raw:state.lifecycleEntry ? JSON.stringify(state.lifecycleEntry) : null},
            {scope:claimScope,raw:null}]};
          // Assert the exact existing input generation; do not create or rebind it.
          options.entries = [{raw:JSON.stringify(observed.envelope),expectedHead:observed.envelope.parent,
            admission:observed.envelope.parent?'existing-domain':'native-setter-quota'}];
          options.entry = {...structuredClone(existing.entry),pointer:options.entry!.pointer};
        } else {
          if (options.replace.backend) return reject(true);
          if (observed.envelope) {
            // Native body + domain input is a supported paired write, not a new
            // overflow admission. Pin navigation, body and immutable input head.
            const selected = decodeDomainCurrent(expectedCurrentRaw,ownerId), prior = state.resolved.source;
            if (selected.kind !== 'readable' || selected.value?.backend !== 'local-storage'
              || selected.value.source !== 'recovery' || selected.value.tripId !== tripId
              || selected.value.writeId !== options.replace.writeId
              || selected.value.nativePointerRaw !== nativePointerRaw || !prior
              || selected.value.documentDigest !== await digest(prior.raw)
              || !sameEntryHandle(prepared.envelope.parent,observed.envelope.handle)
              || observed.legacyRaw !== prepared.envelope.legacyRaw || !active()) return reject(true);
          } else {
            if (prepared.envelope.parent || prepared.envelope.raw !== prepared.envelope.legacyRaw
              || observed.legacyRaw !== raw) return reject(true);
            projectionInput = {key,raw};
          }
        }
      }
      let nativeResult: TripRecoveryWriteResult | null = null;
      let pairedPointerRaw: string | null = null;
      if (!existing) {
        if (options.replace?.backend === 'indexeddb') return reject(true);
        // No await may separate this final exact-byte check from the native
        // setter. A change during metadata/pointer preparation is not our source.
        try { if (JSON.stringify(nativeSources(tripId)) !== JSON.stringify(state.legacy)) return reject(true); }
        catch { return reject(false); }
        // Final synchronous input/source/owner check; no await before native replacement.
        if (projectionInput) {
          try { if (!active() || storage.getItem(projectionInput.key) !== projectionInput.raw
            || JSON.stringify(nativeSources(tripId)) !== JSON.stringify(state.legacy)) return reject(true); }
          catch { return reject(false); }
        }
        const paired = Boolean(options.entries?.length) && !projectionInput;
        nativeResult = saveTripRecoveryToStorage(storage, trip, { ownerId, state: options.state, writeId, now: options.now, replace: options.replace, deferRetirement:paired });
        if (nativeResult.stored) {
          if(paired) {
            // Native keys do not form an atomic transaction. Keep the prior
            // recovery physically intact until the required input is verified.
            const targetKey=tripRecoveryStorageKey(ownerId,tripId,nativeResult.handle.writeId),targetRaw=storage.getItem(targetKey);
            const expected=[...state.legacy];
            if(targetRaw!==null&&!expected.some(source=>source.key===targetKey))expected.push({key:targetKey,raw:targetRaw});
            const stable=()=>JSON.stringify(nativeSources(tripId))===JSON.stringify([...expected].sort((a,b)=>a.key.localeCompare(b.key)));
            const ready=await domain.read(tripId);
            if(!active()||ready.kind!=='ready'||ready.envelope||!stable())return {...nativeResult,stored:false,blockedByExistingRecovery:true,failureReason:'protected-recovery',outcome:'protected-conflict'};
            for(const prepared of requiredEntries) {
              const key=builderInputDraftKey(ownerId,tripId),canonical=requireReadableTripDocument(trip);
              const written=prepared.scope.kind==='homepage'
                ?await createDurableHomepagePersistence(storage,driver,{ownerId,isCurrent:active,overflowEnabled:context.overflowEnabled,accountOverflowQualified:context.accountOverflowQualified})
                  .write(prepared.envelope.raw!,{allowInitialOverflow:options.newTripOrClone===true,writeId:prepared.envelope.handle.writeId,expected:options.entries!.find(value=>value.raw===prepared.raw)})
                :await createTwoStoreEntryPersistence(storage,driver,{scope:prepared.scope,key,isCurrent:active,overflowEnabled:context.overflowEnabled,accountOverflowQualified:context.accountOverflowQualified,
                  validate:raw=>raw===null||readBuilderInputDraft({getItem:()=>raw},canonical,ownerId).kind==='readable'})
                  // The paired input has the same exact-source admission as
                  // its body. Reopening an existing trip removes the new-trip
                  // capability; it must not strand an owned body if input alone
                  // hits quota. The prepared entry still pins its prior bytes.
                  .save(prepared.envelope.raw!,{allowInitialOverflow:options.newTripOrClone===true||existingAdmission,writeId:prepared.envelope.handle.writeId,expected:options.entries!.find(value=>value.raw===prepared.raw)});
              if(written.kind!=='verified')return {...nativeResult,stored:false,failureReason:written.kind==='protected'?'protected-recovery':'receipt-incomplete',blockedByExistingRecovery:written.kind==='protected',outcome:written.kind==='protected'?'protected-conflict':'receipt-incomplete'};
            }
            const afterInputs=await domain.read(tripId);
            if(!active()||afterInputs.kind!=='ready'||afterInputs.envelope||!stable()||!await verifyEntries())return {...nativeResult,stored:false,blockedByExistingRecovery:true,failureReason:'protected-recovery',outcome:'protected-conflict'};
            // Complete navigation before retiring the exact owned predecessor.
            // With both native generations retained, provenance intentionally
            // refuses a normal read; validate the new target directly instead.
            const target=decodeRecoverySource({key:targetKey,raw:targetRaw!},scope(tripId));
            const pointer=nativePointer();
            const pointerIncomplete=():TripRecoveryWriteResult=>({...nativeResult!,stored:false,pointerAcknowledged:false,failureReason:'pointer-incomplete',outcome:'pointer-incomplete'});
            if(target.kind!=='readable'||target.value.writeId!==nativeResult.handle.writeId
              ||JSON.stringify(requireReadableTripDocument(target.value.trip))!==JSON.stringify(requireReadableTripDocument(trip))
              ||pointer.tripId!==tripId||!pointer.raw)return pointerIncomplete();
            const candidate:NativeRecoveryPointer={version:1,backend:'local-storage',source:'recovery',ownerId,tripId,
              writeId:nativeResult.handle.writeId,nativePointerRaw:pointer.raw,documentDigest:await digest(targetRaw!)};
            const raw=JSON.stringify(candidate);
            try {
              const moved=await driver.run(scope(tripId),null,'readwrite',observation=>!active()
                ||observation.currentRaw!==expectedCurrentRaw||nativePointer().raw!==pointer.raw||!stable()
                ?{value:false}:{value:true,currentRaw:raw});
              if(!moved||await driver.readCurrent(ownerId)!==raw||!active()
                ||nativePointer().raw!==pointer.raw||!stable()||!await verifyEntries())return pointerIncomplete();
              // The entry verification awaited I/O. Check navigation again,
              // then retire only the exact source synchronously below.
              if(await driver.readCurrent(ownerId)!==raw||!active()
                ||nativePointer().raw!==pointer.raw||!stable())return pointerIncomplete();
            } catch {return pointerIncomplete();}
            pairedPointerRaw=raw;
            const prior=state.resolved.source;
            if(prior&&prior.key!==EASYT_ACTIVE_TRIP_KEY&&prior.key!==targetKey&&options.replace) {
              try { if(storage.getItem(prior.key)!==prior.raw)return {...nativeResult,stored:false,blockedByExistingRecovery:true,failureReason:'protected-recovery',outcome:'protected-conflict'};storage.removeItem(prior.key); }
              catch {return {...nativeResult,stored:false,blockedByExistingRecovery:true,failureReason:'protected-recovery',outcome:'protected-conflict'};}
            }
          }
          // A cross-store race after native success is protected, never accepted by recency.
          const after = await inspect(tripId);
          if (!active() || after.kind !== 'resolved' || after.domain.envelope) return { ...nativeResult, stored: false, pointerAcknowledged:false, blockedByExistingRecovery: true, failureReason: 'protected-recovery', outcome: 'protected-conflict' };
          // An updated native writer can deliberately supersede domain navigation.
          // The old domain generation remains untouched. The compact digest pins
          // the exact native branch; it cannot recover or bless later old-tab work.
          try {
            const pointer = nativePointer(), source = after.resolved.source;
            if (pointer.tripId !== tripId || !pointer.raw || !source) return { ...nativeResult, stored:false, failureReason:'pointer-incomplete', outcome:'pointer-incomplete' };
            const candidate: NativeRecoveryPointer = {version:1,backend:'local-storage',source:'recovery',ownerId,tripId,writeId:nativeResult.handle.writeId,nativePointerRaw:pointer.raw,documentDigest:await digest(source.raw)};
            const raw = JSON.stringify(candidate);
            const moved = pairedPointerRaw !== null ? pairedPointerRaw === raw : await driver.run(scope(tripId),null,'readwrite', observation => !active() || observation.currentRaw !== expectedCurrentRaw
              ? {value:false} : {value:true,currentRaw:raw});
            const verified = moved && await driver.readCurrent(ownerId) === raw;
            const final = await inspect(tripId);
            if (!active() || !verified || nativePointer().raw !== pointer.raw || final.kind !== 'resolved' || final.domain.envelope || final.resolved.source?.raw !== source.raw)
              return {...nativeResult,stored:false,pointerAcknowledged:false,failureReason:'pointer-incomplete',outcome:'pointer-incomplete'};
          } catch { return {...nativeResult,stored:false,pointerAcknowledged:false,failureReason:'pointer-incomplete',outcome:'pointer-incomplete'}; }
          if(!await verifyEntries())return {...nativeResult,stored:false,pointerAcknowledged:false,blockedByExistingRecovery:true,failureReason:'protected-recovery',outcome:'protected-conflict'};
          return {...nativeResult,...(requiredEntries.some(value=>value.scope.kind==='homepage')?{receiptAcknowledged:true}:{})};
        }
        // A projection can replace a proven native source regardless of the
        // session's initial-overflow capability, but can never use that admission.
        if (options.projectionOnly || nativeResult.nativeFailure !== 'quota' || !nativeResult.writeAttempted || !(options.newTripOrClone || existingAdmission)) return nativeResult;
        try { if (!sourceStillCurrent() || JSON.stringify(nativeSources(tripId)) !== JSON.stringify(state.legacy)) return reject(true); }
        catch { return reject(false); }
      } else {
        const explicit = options.replace?.backend === 'indexeddb' && sameDomainHandle(domainHandle(options.replace), existing.handle);
        const acknowledgedBase = state.domain.acknowledgement && options.canonicalBase
          && samePersistedTripDocument(options.canonicalBase, JSON.parse(state.domain.acknowledgement.canonicalRaw));
        if (!explicit && !acknowledgedBase) return reject(true);
      }
      if (!context.overflowEnabled || ownerId !== null && !context.accountOverflowQualified) return nativeResult ?? reject(true);
      const handle: RecoveryHandle = { version: 1, backend: 'indexeddb', ownerId, tripId, writeId };
      const record: TripRecoveryRecord = { version: 2, ownerId, tripId, writeId, trip, state: options.state ?? 'pending', savedAt: options.now ?? new Date().toISOString() };
      if(options.entry?.nativeCacheRaw !== undefined && options.entry.nativeCacheRaw !== existing?.entry.nativeCacheRaw)return reject(true,'scope-mismatch');
      const entry = options.entry ?? existing?.entry ?? { pointer: handle, input: null, receipt: null };
      if(options.entry?.claim&&JSON.stringify(options.entry.claim)!==JSON.stringify(existing?.entry.claim))return reject(true,'scope-mismatch');
      const candidate: RecoveryEnvelope = { version: 1, handle, parent: existing?.handle ?? null, rawRecovery: JSON.stringify(record),
        legacySources: state.legacy, entry: { ...structuredClone(entry), pointer: handle, nativePointerRaw,
          ...(existing?.entry.claim?{claim:structuredClone(existing.entry.claim)}:{}),
          ...(cacheWitness?{nativeCacheRaw:cacheWitness.raw}:existing?.entry.nativeCacheRaw!==undefined?{nativeCacheRaw:existing.entry.nativeCacheRaw}:{}) } };
      const committed = await domain.commit({ raw: JSON.stringify(candidate), expectedHead: candidate.parent,
        admission: existing ? 'existing-domain' : 'native-setter-quota', entries: options.entries, projectionFence });
      if (committed.kind !== 'verified') return { ...refused(tripId,writeId,committed.kind === 'protected-conflict'),
        handle: { ownerId, tripId, writeId, backend: 'indexeddb' }, recoveryDurable:false,
        ...(projectionFence ? {
          recoveryCommitted:committed.commitStatus === 'unconfirmed' ? undefined : committed.commitStatus === 'committed',
          writeAttempted:committed.commitStatus !== 'not-started',readbackConfirmed:false,
        } : {recoveryCommitted:committed.commitStatus === 'committed',writeAttempted:true}),
        ...(committed.commitStatus==='committed'?{readbackConfirmed:false,failureBoundary:'recovery-readback' as const}:{failureBoundary:'recovery-write' as const}) };
      const after = await inspect(tripId);
      if (!active() || !sourceStillCurrent() || after.kind !== 'resolved' || !after.domain.envelope || !sameDomainHandle(after.domain.envelope.handle, handle)||!await verifyEntries()) {
        if (!projectionFence) return { ...reject(true), recoveryDurable: true };
        return { ...refused(tripId,writeId,true),handle:{ownerId,tripId,writeId,backend:'indexeddb'},writeAttempted:true,
          recoveryCommitted:true,recoveryDurable:true,readbackConfirmed:false,failureBoundary:'recovery-readback' };
      }
      return { stored: true, handle: { ownerId, tripId, writeId, backend: 'indexeddb' }, blockedByExistingRecovery: false,
        pointerAcknowledged: true, recoveryDurable: true, readbackConfirmed: true, writeAttempted: true, outcome: 'device-confirmed',
        ...(requiredEntries.some(value=>value.scope.kind==='homepage')?{receiptAcknowledged:true}:{}) };
    },
  };
}
