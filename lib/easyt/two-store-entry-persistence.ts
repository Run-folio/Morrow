import type { EasyTBrowserStorage } from './storage.ts';
import type { RecoveryDomainDriver } from './durable-recovery-domain.ts';
import type { RecoveryEntryScope, RecoveryEntryWrite, RecoveryEntryEnvelope } from './durable-entry-protocol.ts';
import { createRecoveryEntryStore, prepareEntryWrite } from './durable-entry-store.ts';
import {sameEntryHandle} from './durable-entry-protocol.ts';
import { recoveryErrorReason } from './durable-recovery-error.ts';

export type TwoStoreEntryRead = { kind: 'ready'; raw: string | null; envelope: RecoveryEntryEnvelope | null; legacyRaw: string | null }
  | { kind: 'protected' | 'unavailable'; reason: string };
export type TwoStoreEntryWrite = { kind: 'verified'; backend: 'local-storage' | 'indexeddb-entry' }
  | { kind: 'protected' | 'unavailable' | 'failure'; reason: string; committed?: boolean };
export function createTwoStoreEntryPersistence(storage: EasyTBrowserStorage, driver: RecoveryDomainDriver, context: {
  scope: RecoveryEntryScope; key: string; isCurrent: () => boolean; overflowEnabled: boolean; accountOverflowQualified: boolean;
  validate: (raw: string | null) => boolean;
}) {
  const scope = Object.freeze({ ...context.scope }), key = context.key;
  const active = () => { try { return context.isCurrent() === true; } catch { return false; } };
  const valid = (raw: string | null) => { try { return context.validate(raw) === true; } catch { return false; } };
  const entries = createRecoveryEntryStore(driver, { ownerId: scope.ownerId, isCurrent: active });
  const protectedResult = (reason: string): TwoStoreEntryWrite => ({ kind: 'protected', reason });
  async function read(): Promise<TwoStoreEntryRead> {
    if (!active()) return { kind: 'protected', reason: 'operation-changed' };
    const domain = await entries.read(scope);
    if (domain.kind !== 'ready') return { kind: domain.kind === 'protected-conflict' || domain.kind === 'failure' && ['schema', 'corrupt'].includes(domain.reason)
      ? 'protected' : 'unavailable', reason: domain.kind === 'verified' ? 'unknown' : domain.reason };
    try {
      const legacyRaw = storage.getItem(key);
      if (!active()) return { kind: 'protected', reason: 'operation-changed' };
      if (legacyRaw !== storage.getItem(key)) return { kind: 'protected', reason: 'native-changed' };
      if (!valid(legacyRaw) || domain.envelope && !valid(domain.envelope.raw)) return { kind: 'protected', reason: 'payload' };
      const envelope = domain.envelope;
      // Only observed ancestor bytes or an exact mirror explain the old store.
      // Deletion/semantic equivalence/recency cannot select a winning branch.
      if (envelope && legacyRaw !== envelope.legacyRaw && legacyRaw !== envelope.raw) return { kind: 'protected', reason: 'native-divergence' };
      return { kind: 'ready', raw: envelope ? envelope.raw : legacyRaw, envelope, legacyRaw };
    } catch { return { kind: 'unavailable', reason: 'native-read-unknown' }; }
  }
  function candidate(raw: string | null, writeId: string, state: Extract<TwoStoreEntryRead, { kind: 'ready' }>): RecoveryEntryWrite {
    const envelope: RecoveryEntryEnvelope = { version: 1,
      handle: { ...scope, version: 1, backend: 'indexeddb-entry', writeId }, parent: state.envelope?.handle ?? null,
      raw, legacyRaw: state.envelope?.legacyRaw ?? state.legacyRaw, retainedPreviousRaw: state.raw };
    return { raw: JSON.stringify(envelope), expectedHead: envelope.parent, admission: envelope.parent ? 'existing-domain' : 'native-setter-quota' };
  }
  return {
    read,
    async save(raw: string | null, options: { allowInitialOverflow?: boolean; writeId?: string; expected?:RecoveryEntryWrite } = {}): Promise<TwoStoreEntryWrite> {
      if (!valid(raw)) return protectedResult('payload');
      const writeId = options.writeId ?? globalThis.crypto.randomUUID(), allowInitialOverflow = options.allowInitialOverflow === true;
      const expected=options.expected?structuredClone(options.expected):undefined;
      const state = await read(); if (state.kind !== 'ready') return state;
      if(expected) {
        const prepared=prepareEntryWrite(expected,scope.ownerId);
        if(prepared.kind!=='prepared'||prepared.scope.kind!==scope.kind||prepared.scope.tripId!==scope.tripId
          ||prepared.envelope.handle.writeId!==writeId||prepared.envelope.raw!==raw
          ||!sameEntryHandle(expected.expectedHead,state.envelope?.handle??null)
          ||prepared.envelope.legacyRaw!==(state.envelope?.legacyRaw??state.legacyRaw)
          ||prepared.envelope.retainedPreviousRaw!==state.raw)return protectedResult('preparation-changed');
      }
      if (!state.envelope) {
        // Clearing is a retained domain tombstone, never automatic native deletion.
        if (raw === null) return protectedResult('admission');
        try {
          if(!active()||storage.getItem(key)!==state.legacyRaw)return protectedResult('preparation-changed');
          storage.setItem(key, raw);
          const after = await read();
          if (after.kind !== 'ready') return after;
          if (!active() || after.envelope || after.raw !== raw) return protectedResult('native-readback');
          return { kind: 'verified', backend: 'local-storage' };
        } catch (error) {
          const reason = recoveryErrorReason(error);
          if (reason !== 'quota' || !allowInitialOverflow) return { kind: 'failure', reason };
          try { if (storage.getItem(key) !== state.legacyRaw) return protectedResult('native-changed'); }
          catch { return { kind: 'unavailable', reason: 'native-read-unknown' }; }
        }
      }
      if (!context.overflowEnabled || scope.ownerId !== null && !context.accountOverflowQualified) return { kind: 'failure', reason: 'overflow-held' };
      const committed = await entries.commit(candidate(raw, writeId, state));
      if (committed.kind !== 'verified') return { kind: committed.kind === 'protected-conflict' ? 'protected' : 'failure',
        reason: committed.kind === 'ready' ? 'unknown' : committed.reason, committed: 'commitStatus' in committed && committed.commitStatus === 'committed' };
      const after = await read();
      if (after.kind !== 'ready') return { ...after, committed: true };
      if (!active() || after.envelope?.handle.writeId !== writeId || after.raw !== raw) return { kind: 'protected', reason: 'head-changed', committed: true };
      return { kind: 'verified', backend: 'indexeddb-entry' };
    },
    async prepareForDomain(raw: string | null, writeId: string, observed?:Extract<TwoStoreEntryRead,{kind:'ready'}>): Promise<RecoveryEntryWrite | TwoStoreEntryWrite> {
      if (!valid(raw)) return protectedResult('payload');
      const expected=observed?structuredClone(observed):undefined;
      const state = await read();
      if(state.kind!=='ready')return state;
      if(expected&&(expected.raw!==state.raw||expected.legacyRaw!==state.legacyRaw
        ||!sameEntryHandle(expected.envelope?.handle??null,state.envelope?.handle??null)))return protectedResult('preparation-changed');
      return candidate(raw,writeId,state);
    },
  };
}
