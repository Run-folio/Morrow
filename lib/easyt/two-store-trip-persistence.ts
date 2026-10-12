import type { EasyTTrip } from './trip.ts';
import { loadCachedTripFromStorage, saveTripRecoveryToStorage, tripRecoveryStorageKey,
  type EasyTBrowserStorage, type TripRecoveryHandle, type TripRecoveryRecord, type TripRecoveryWriteResult } from './storage.ts';
import { decodeRawRecovery, sameDomainHandle, type RecoveryDomainDriver, type RecoveryEnvelope, type RecoveryReadResult, type RecoveryHandle } from './durable-recovery-domain.ts';
import { createRecoveryDomainStore } from './durable-recovery-store.ts';
import { resolveRecoveryProvenance } from './recovery-provenance.ts';
import { prepareTripDocumentForWrite } from './trip-document.ts';
import type { RecoveryEntryWrite } from './durable-entry-protocol.ts';

export type TwoStoreRead = { kind: 'found'; trip: EasyTTrip; recovery: TripRecoveryRecord | null; domain: Extract<RecoveryReadResult, { kind: 'ready' }> | null }
  | { kind: 'missing' } | { kind: 'protected'; reason: string } | { kind: 'unavailable'; reason: string };
export type TwoStoreContext = { ownerId: string | null; isCurrent: () => boolean; overflowEnabled: boolean; accountOverflowQualified: boolean };
export type TwoStoreSaveOptions = { replace?: TripRecoveryHandle; state?: TripRecoveryRecord['state']; writeId?: string; now?: string;
  newTripOrClone?: boolean; entry?: RecoveryEnvelope['entry']; entries?: RecoveryEntryWrite[]; canonicalBase?: EasyTTrip };
export function createTwoStoreTripPersistence(storage: EasyTBrowserStorage, driver: RecoveryDomainDriver, context: TwoStoreContext) {
  const ownerId = context.ownerId, isCurrent = context.isCurrent;
  const active = () => { try { return isCurrent() === true; } catch { return false; } };
  const domain = createRecoveryDomainStore(driver, { ownerId, isCurrent: active });
  const scope = (tripId: string) => ({ ownerId, tripId });
  const nativeSources = (tripId: string) => {
    const base = tripRecoveryStorageKey(ownerId, tripId);
    const snapshot = () => {
      const copies: { key: string; raw: string }[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i); if (!key || key !== base && !key.startsWith(base + ':')) continue;
        const raw = storage.getItem(key); if (raw !== null) copies.push({ key, raw });
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
    try {
      const legacy = nativeSources(tripId), resolved = resolveRecoveryProvenance({ scope: scope(tripId), legacy: { kind: 'ready', copies: legacy }, domain: result });
      if (resolved.kind === 'not-ready') return { kind: 'unavailable' as const, reason: 'unknown' };
      if (resolved.kind === 'protected-conflict') return { kind: 'protected' as const, reason: resolved.reason ?? 'unknown' };
      return { kind: 'resolved' as const, resolved, legacy, domain: result };
    } catch { return { kind: 'unavailable' as const, reason: 'native-read-unknown' }; }
  };
  const refused = (tripId: string, writeId: string, protectedRecovery: boolean, reason: TripRecoveryWriteResult['failureReason'] = protectedRecovery ? 'protected-recovery' : 'unknown'): TripRecoveryWriteResult => ({
    stored: false, handle: { ownerId, tripId, writeId }, blockedByExistingRecovery: protectedRecovery, failureReason: reason, writeAttempted: false,
    outcome: protectedRecovery ? 'protected-conflict' : 'unknown' });
  const domainHandle = (handle: TripRecoveryHandle): RecoveryHandle => ({ version: 1, backend: 'indexeddb', ownerId: handle.ownerId, tripId: handle.tripId, writeId: handle.writeId });
  return {
    async read(tripId: string): Promise<TwoStoreRead> {
      const state = await inspect(tripId); if (state.kind !== 'resolved') return state;
      if (!active()) return { kind: 'protected', reason: 'operation-changed' };
      if (state.resolved.kind === 'indexeddb' && state.domain.envelope) {
        const record = decodeRawRecovery(state.domain.envelope.rawRecovery, scope(tripId));
        if (record.kind !== 'readable') return { kind: 'protected', reason: record.kind };
        if (state.domain.acknowledgement) return { kind: 'found', trip: prepareTripDocumentForWrite(JSON.parse(state.domain.acknowledgement.canonicalRaw)), recovery: null, domain: state.domain };
        return { kind: 'found', trip: record.value.trip, recovery: { ...record.value, backend: 'indexeddb' }, domain: state.domain };
      }
      if (state.resolved.kind === 'local-storage' && state.resolved.source) {
        const record = decodeRawRecovery(state.resolved.source.raw, scope(tripId));
        if (record.kind !== 'readable') return { kind: 'protected', reason: record.kind };
        return { kind: 'found', trip: record.value.trip, recovery: { ...record.value, backend: undefined }, domain: null };
      }
      try {
        const cached = loadCachedTripFromStorage(storage, tripId, ownerId);
        return cached ? { kind: 'found', trip: cached, recovery: null, domain: null } : { kind: 'missing' };
      } catch { return { kind: 'protected', reason: 'cache-document' }; }
    },
    async save(inputTrip: EasyTTrip, options: TwoStoreSaveOptions = {}): Promise<TripRecoveryWriteResult> {
      const writeId = options.writeId ?? globalThis.crypto.randomUUID(), tripId = inputTrip.id;
      // Caller-owned bodies/metadata must be frozen before the first async barrier.
      let trip: EasyTTrip;
      try { trip = prepareTripDocumentForWrite(structuredClone(inputTrip)); options = structuredClone(options); }
      catch { return refused(tripId, writeId, true, 'scope-mismatch'); }
      if (!active() || trip.ownerId !== null && trip.ownerId !== ownerId || ownerId === null && trip.ownerId !== null) return refused(tripId, writeId, true, 'scope-mismatch');
      const state = await inspect(tripId); if (state.kind !== 'resolved') return refused(tripId, writeId, state.kind === 'protected');
      const existing = state.domain.envelope;
      let nativeResult: TripRecoveryWriteResult | null = null;
      if (!existing) {
        if (options.replace?.backend === 'indexeddb') return refused(tripId, writeId, true);
        nativeResult = saveTripRecoveryToStorage(storage, trip, { ownerId, state: options.state, writeId, now: options.now, replace: options.replace });
        if (nativeResult.stored) {
          // A cross-store race after native success is protected, never accepted by recency.
          const after = await inspect(tripId);
          if (!active() || after.kind !== 'resolved' || after.domain.envelope) return { ...nativeResult, stored: false, blockedByExistingRecovery: true, failureReason: 'protected-recovery', outcome: 'protected-conflict' };
          return nativeResult;
        }
        if (nativeResult.nativeFailure !== 'quota' || !nativeResult.writeAttempted || !options.newTripOrClone) return nativeResult;
        try { if (JSON.stringify(nativeSources(tripId)) !== JSON.stringify(state.legacy)) return refused(tripId, writeId, true); }
        catch { return refused(tripId, writeId, false); }
      } else {
        const explicit = options.replace?.backend === 'indexeddb' && sameDomainHandle(domainHandle(options.replace), existing.handle);
        const acknowledgedBase = state.domain.acknowledgement && options.canonicalBase
          && JSON.stringify(prepareTripDocumentForWrite(options.canonicalBase)) === JSON.stringify(prepareTripDocumentForWrite(JSON.parse(state.domain.acknowledgement.canonicalRaw)));
        if (!explicit && !acknowledgedBase) return refused(tripId, writeId, true);
      }
      if (!context.overflowEnabled || ownerId !== null && !context.accountOverflowQualified) return nativeResult ?? refused(tripId, writeId, true);
      const handle: RecoveryHandle = { version: 1, backend: 'indexeddb', ownerId, tripId, writeId };
      const record: TripRecoveryRecord = { version: 2, ownerId, tripId, writeId, trip, state: options.state ?? 'pending', savedAt: options.now ?? new Date().toISOString() };
      const entry = options.entry ?? existing?.entry ?? { pointer: handle, input: null, receipt: null };
      const candidate: RecoveryEnvelope = { version: 1, handle, parent: existing?.handle ?? null, rawRecovery: JSON.stringify(record),
        legacySources: state.legacy, entry: { ...structuredClone(entry), pointer: handle } };
      const committed = await domain.commit({ raw: JSON.stringify(candidate), expectedHead: candidate.parent,
        admission: existing ? 'existing-domain' : 'native-setter-quota', entries: options.entries });
      if (committed.kind !== 'verified') return { ...refused(tripId, writeId, committed.kind === 'protected-conflict'),
        handle: { ownerId, tripId, writeId, backend: 'indexeddb' }, recoveryDurable: committed.commitStatus === 'committed',
        ...(committed.kind === 'failure' && ['quota', 'security', 'unavailable'].includes(committed.reason) ? { nativeFailure: committed.reason as 'quota' | 'security' | 'unavailable', failureReason: 'device-unavailable' as const, outcome: 'native-write-failed' as const } : {}) };
      const after = await inspect(tripId);
      if (!active() || after.kind !== 'resolved' || !after.domain.envelope || !sameDomainHandle(after.domain.envelope.handle, handle)) return { ...refused(tripId, writeId, true), recoveryDurable: true };
      return { stored: true, handle: { ownerId, tripId, writeId, backend: 'indexeddb' }, blockedByExistingRecovery: false,
        pointerAcknowledged: true, recoveryDurable: true, readbackConfirmed: true, writeAttempted: true, outcome: 'device-confirmed' };
    },
  };
}
