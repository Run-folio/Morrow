import type { RecoveryDomainDriver, RecoveryFailure, RecoveryConflict, CommitStatus } from './durable-recovery-domain.ts';
import { decodeEntryEnvelope, decodeEntryHead, isEntryHandle, sameEntryScope, sameEntryHandle,
  type RecoveryEntryEnvelope, type RecoveryEntryHandle, type RecoveryEntryScope, type RecoveryEntryWrite,
  type RecoveryEntryState, type RecoveryEntryMutation } from './durable-entry-protocol.ts';
import { RecoveryDomainError, recoveryErrorReason } from './durable-recovery-error.ts';

export type RecoveryEntryResult = RecoveryFailure | RecoveryConflict | { kind: 'ready'; envelope: RecoveryEntryEnvelope | null }
  | { kind: 'verified'; handle: RecoveryEntryHandle; raw: string };
const failure = (reason: RecoveryFailure['reason'], commitStatus: CommitStatus = 'not-started'): RecoveryFailure => ({ kind: 'failure', reason, commitStatus });
const conflict = (reason: RecoveryConflict['reason'], commitStatus: CommitStatus = 'not-started'): RecoveryConflict => ({ kind: 'protected-conflict', reason, commitStatus });
const invalid = (reason: 'scope' | 'schema' | 'corrupt', status: CommitStatus = 'not-started') => reason === 'scope' ? conflict('scope', status) : failure(reason, status);
export type PreparedEntryWrite = { kind: 'prepared'; scope: RecoveryEntryScope; envelope: RecoveryEntryEnvelope; raw: string; expected: RecoveryEntryHandle | null };
export function prepareEntryWrite(input: RecoveryEntryWrite, ownerId: string | null): PreparedEntryWrite | RecoveryFailure | RecoveryConflict {
  let value: unknown; try { value = JSON.parse(input.raw); } catch { return failure('corrupt'); }
  if (!value || typeof value !== 'object' || !('handle' in value) || !isEntryHandle(value.handle)) return failure('corrupt');
  const scope: RecoveryEntryScope = { ownerId, kind: value.handle.kind, tripId: value.handle.tripId };
  const decoded = decodeEntryEnvelope(input.raw, scope); if (decoded.kind !== 'readable') return invalid(decoded.kind);
  const expected = input.expectedHead === null ? null : isEntryHandle(input.expectedHead) ? { ...input.expectedHead } : undefined;
  if (expected === undefined || expected && !sameEntryScope(expected, scope) || !sameEntryHandle(expected, decoded.value.parent)) return conflict('scope');
  if (input.admission !== 'native-setter-quota' && !(input.admission === 'existing-domain' && expected !== null)) return conflict('admission');
  return { kind: 'prepared', scope, envelope: decoded.value, raw: input.raw, expected };
}
export function entryHead(state: RecoveryEntryState, scope: RecoveryEntryScope) {
  const head = decodeEntryHead(state.headRaw, scope); if (head.kind !== 'readable') return invalid(head.kind);
  if (head.value === null) return state.headGenerationRaw === undefined ? { kind: 'valid' as const, handle: null, envelope: null } : failure('corrupt');
  const envelope = decodeEntryEnvelope(state.headGenerationRaw, scope); if (envelope.kind !== 'readable') return invalid(envelope.kind);
  if (!sameEntryHandle(head.value, envelope.value.handle)) return conflict('scope');
  return { kind: 'valid' as const, handle: head.value, envelope: envelope.value };
}
export function decideEntryWrite(prepared: PreparedEntryWrite, state: RecoveryEntryState): { kind: 'write'; mutation?: RecoveryEntryMutation } | RecoveryFailure | RecoveryConflict {
  if (!state) return failure('corrupt');
  const current = entryHead(state, prepared.scope); if (current.kind !== 'valid') return current;
  if (state.generationRaw !== undefined) {
    if (state.generationRaw !== prepared.raw) return conflict('immutable-collision', 'not-committed');
    return sameEntryHandle(current.handle, prepared.envelope.handle) ? { kind: 'write' } : conflict('head-changed', 'not-committed');
  }
  if (!sameEntryHandle(current.handle, prepared.expected)) return conflict('head-changed', 'not-committed');
  return { kind: 'write', mutation: { scope: prepared.scope, writeId: prepared.envelope.handle.writeId, raw: prepared.raw, headRaw: JSON.stringify(prepared.envelope.handle) } };
}
export function verifyEntryWrite(prepared: PreparedEntryWrite, state: RecoveryEntryState): RecoveryFailure | RecoveryConflict | null {
  if (!state || state.generationRaw !== prepared.raw) return failure('readback', 'committed');
  const current = entryHead(state, prepared.scope); if (current.kind !== 'valid') return { ...current, commitStatus: 'committed' };
  return sameEntryHandle(current.handle, prepared.envelope.handle) ? null : conflict('head-changed', 'committed');
}
export function createRecoveryEntryStore(driver: RecoveryDomainDriver, context: { ownerId: string | null; isCurrent: () => boolean }) {
  const ownerId = context.ownerId, current = context.isCurrent;
  const active = () => { try { return current() === true; } catch { return false; } };
  return {
    async read(scope: RecoveryEntryScope): Promise<RecoveryEntryResult> {
      if (!active()) return conflict('operation-changed'); if (scope.ownerId !== ownerId) return conflict('scope');
      try {
        const result = await driver.runEntry<RecoveryEntryResult>({ ...scope }, null, 'readonly', state => {
          const head = entryHead(state, scope); if (head.kind !== 'valid') return { value: head };
          if (head.envelope && state.generationRaw !== state.headGenerationRaw) return { value: failure('corrupt') };
          return { value: { kind: 'ready', envelope: head.envelope } };
        });
        return active() ? result : conflict('operation-changed');
      } catch (error) { return failure(recoveryErrorReason(error)); }
    },
    async commit(input: RecoveryEntryWrite): Promise<RecoveryEntryResult> {
      if (!active()) return conflict('operation-changed'); const prepared = prepareEntryWrite(input, ownerId);
      if (prepared.kind !== 'prepared') return prepared;
      if(prepared.scope.kind==='recovery-lifecycle'||prepared.scope.kind==='recovery-claim')return conflict('admission');
      try {
        const result = await driver.runEntry<RecoveryEntryResult | { kind: 'committed' }>(prepared.scope, prepared.envelope.handle.writeId, 'readwrite', state => {
          if (!active()) return { value: conflict('operation-changed', 'not-committed') };
          const decision = decideEntryWrite(prepared, state); if (decision.kind !== 'write') return { value: decision };
          return { value: { kind: 'committed' }, ...(decision.mutation ? { mutation: decision.mutation } : {}) };
        });
        if (result.kind !== 'committed') return result;
      } catch (error) { return failure(recoveryErrorReason(error), error instanceof RecoveryDomainError ? error.commitStatus : 'unconfirmed'); }
      try {
        const result = await driver.runEntry<RecoveryEntryResult>(prepared.scope, prepared.envelope.handle.writeId, 'readonly', state => {
          const refused = verifyEntryWrite(prepared, state);
          return { value: refused ?? { kind: 'verified', handle: prepared.envelope.handle, raw: prepared.raw } };
        });
        return active() ? result : conflict('operation-changed', 'committed');
      } catch (error) { return { ...failure('readback', 'committed'), cause: recoveryErrorReason(error) }; }
    },
  };
}
