import { decodeDomainHead, decodeDomainCurrent, decodeRecoveryEnvelope, decodeTrustedAccountAck, isDomainHandle, isRecoveryScope, recoveryScopeKey,
  sameDomainHandle, sameRecoveryScope, type RecoveryDomainDriver, type RecoveryScope, type RecoveryHandle,
  type RecoveryCommitResult, type RecoveryReadResult, type RecoveryAckResult, type RecoveryListResult, type RecoveryFailureReason,
  type RecoveryFailure, type RecoveryConflict, type CommitStatus, type DecodeFailure, type RecoveryEnvelope,
  type RecoveryDomainState } from './durable-recovery-domain.ts';
export type * from './durable-recovery-domain.ts';
export { openIndexedDbRecoveryDriver } from './durable-recovery-indexeddb.ts';
import { RecoveryDomainError, recoveryErrorReason } from './durable-recovery-error.ts';
export { RecoveryDomainError, recoveryErrorReason } from './durable-recovery-error.ts';
const failure = (reason: RecoveryFailureReason, commitStatus: CommitStatus = 'not-started'): RecoveryFailure => ({ kind: 'failure', reason, commitStatus });
const conflict = (reason: RecoveryConflict['reason'], commitStatus: CommitStatus = 'not-started'): RecoveryConflict => ({ kind: 'protected-conflict', reason, commitStatus });
const decodeFailure = (decoded: DecodeFailure, status: CommitStatus) => decoded.kind === 'scope' ? conflict('scope', status) : failure(decoded.kind, status);
function stateHead(state: RecoveryDomainState, scope: RecoveryScope): { kind: 'valid'; head: RecoveryHandle | null; envelope: RecoveryEnvelope | null } | RecoveryFailure | RecoveryConflict {
  const pointer = decodeDomainCurrent(state.currentRaw, scope.ownerId); if (pointer.kind !== 'readable') return decodeFailure(pointer, 'not-committed');
  const head = decodeDomainHead(state.headRaw, scope); if (head.kind !== 'readable') return decodeFailure(head, 'not-committed');
  if (head.value === null) {
    if (state.headGenerationRaw !== undefined) return failure('corrupt', 'not-committed');
    return { kind: 'valid', head: null, envelope: null };
  }
  const generation = decodeRecoveryEnvelope(state.headGenerationRaw, scope);
  if (generation.kind !== 'readable') return decodeFailure(generation, 'not-committed');
  if (!sameDomainHandle(head.value, generation.value.handle)) return conflict('scope', 'not-committed');
  return { kind: 'valid', head: head.value, envelope: generation.value };
}

/** `isCurrent` belongs to the frozen caller operation (owner/input revision).
 * Verified device bytes are not app receipt acceptance or an account ACK.
 * No operation deletes a generation, LS value, or advances application state. */
export function createRecoveryDomainStore(driver: RecoveryDomainDriver, context: { ownerId: string | null; isCurrent: () => boolean }) {
  const ownerId = context.ownerId, current = context.isCurrent;
  const active = () => { try { return current() === true; } catch { return false; } };
  const scopeFor = (tripId: string): RecoveryScope => ({ ownerId, tripId });
  if (!isRecoveryScope(scopeFor('scope-check')) || typeof current !== 'function') throw new TypeError('Invalid recovery context');
  return {
    async list(): Promise<RecoveryListResult> {
      if (!active()) return conflict('operation-changed');
      try {
        const heads = await driver.listHeads(ownerId), recoveries: Extract<RecoveryListResult, { kind: 'ready' }>['recoveries'] = [];
        for (const row of heads) {
          const head = decodeDomainCurrent(row.raw, ownerId); if (head.kind !== 'readable') return decodeFailure(head, 'not-started');
          if (!head.value || row.key !== recoveryScopeKey(head.value)) return failure('corrupt');
          const read = await this.read(head.value.tripId); if (read.kind !== 'ready') return read;
          if (!read.envelope || !sameDomainHandle(read.envelope.handle, head.value)) return conflict('head-changed');
          recoveries.push({ envelope: read.envelope, acknowledgement: read.acknowledgement });
        }
        return active() ? { kind: 'ready', recoveries } : conflict('operation-changed');
      } catch (error) { return failure(recoveryErrorReason(error)); }
    },
    async current(): Promise<RecoveryReadResult> {
      if (!active()) return conflict('operation-changed');
      try {
        const raw = await driver.readCurrent(ownerId), head = decodeDomainCurrent(raw, ownerId);
        if (head.kind !== 'readable') return decodeFailure(head, 'not-started');
        if (!head.value) return active() ? { kind: 'ready', envelope: null, acknowledgement: null } : conflict('operation-changed');
        const read = await this.read(head.value.tripId); if (read.kind !== 'ready') return read;
        if (!read.envelope || !sameDomainHandle(read.envelope.handle, head.value) || await driver.readCurrent(ownerId) !== raw) return conflict('head-changed');
        return active() ? read : conflict('operation-changed');
      } catch (error) { return failure(recoveryErrorReason(error)); }
    },
    async commit(input: { raw: string; expectedHead: RecoveryHandle | null; admission: 'native-setter-quota' }): Promise<RecoveryCommitResult> {
      if (!active()) return conflict('operation-changed');
      if (input.admission !== 'native-setter-quota') return conflict('admission');
      let parsed: unknown; try { parsed = JSON.parse(input.raw); } catch { return failure('corrupt'); }
      if (!parsed || typeof parsed !== 'object' || !('handle' in parsed) || !isDomainHandle(parsed.handle)) return failure('corrupt');
      const scope = scopeFor(parsed.handle.tripId), decoded = decodeRecoveryEnvelope(input.raw, scope);
      if (decoded.kind !== 'readable') return decodeFailure(decoded, 'not-started');
      const candidate = decoded.value, raw = input.raw;
      const expected = input.expectedHead === null ? null : isDomainHandle(input.expectedHead) ? { ...input.expectedHead } : undefined;
      if (expected === undefined || expected && !sameRecoveryScope(expected, scope) || !sameDomainHandle(candidate.parent, expected)) return conflict('scope');
      try {
        const committed = await driver.run<RecoveryCommitResult | { kind: 'committed' }>(scope, candidate.handle.writeId, 'readwrite', state => {
          if (!active()) return { value: conflict('operation-changed', 'not-committed') };
          const existing = stateHead(state, scope); if (existing.kind !== 'valid') return { value: existing };
          if (state.generationRaw !== undefined) {
            if (state.generationRaw !== raw) return { value: conflict('immutable-collision', 'not-committed') };
            if (!sameDomainHandle(existing.head, candidate.handle)) return { value: conflict('head-changed', 'not-committed') };
            return { value: { kind: 'committed' } };
          }
          if (!sameDomainHandle(existing.head, expected)) return { value: conflict('head-changed', 'not-committed') };
          return { value: { kind: 'committed' }, generationRaw: raw, headRaw: JSON.stringify(candidate.handle), currentRaw: JSON.stringify(candidate.handle) };
        });
        if (committed.kind !== 'committed') return committed;
      } catch (error) {
        return failure(recoveryErrorReason(error), error instanceof RecoveryDomainError ? error.commitStatus : 'unconfirmed');
      }
      if (!active()) return conflict('operation-changed', 'committed');
      try {
        const verified = await driver.run<RecoveryCommitResult>(scope, candidate.handle.writeId, 'readonly', state => {
          if (state.generationRaw !== raw) return { value: failure('readback', 'committed') };
          const head = stateHead(state, scope); if (head.kind !== 'valid') return { value: { ...head, commitStatus: 'committed' } };
          if (!sameDomainHandle(head.head, candidate.handle)) return { value: conflict('head-changed', 'committed') };
          const pointer = decodeDomainCurrent(state.currentRaw, ownerId);
          if (pointer.kind !== 'readable' || !sameDomainHandle(pointer.value, candidate.handle)) return { value: conflict('head-changed', 'committed') };
          return { value: { kind: 'verified', handle: candidate.handle, raw, commitStatus: 'committed' } };
        });
        return active() ? verified : conflict('operation-changed', 'committed');
      } catch (error) { return { ...failure('readback', 'committed'), cause: recoveryErrorReason(error) }; }
    },
    async read(tripId: string): Promise<RecoveryReadResult> {
      const scope = scopeFor(tripId); if (!active()) return conflict('operation-changed');
      if (!isRecoveryScope(scope)) return conflict('scope');
      try {
        const result = await driver.run<RecoveryReadResult>(scope, null, 'readonly', state => {
          const head = stateHead(state, scope); if (head.kind !== 'valid') return { value: head };
          if (!head.envelope) return { value: { kind: 'ready', envelope: null, acknowledgement: null } };
          if (state.generationRaw !== state.headGenerationRaw) return { value: failure('corrupt') };
          if (state.acknowledgementRaw === undefined) return { value: { kind: 'ready', envelope: head.envelope, acknowledgement: null } };
          const ack = decodeTrustedAccountAck(state.acknowledgementRaw, scope);
          if (ack.kind !== 'readable') return { value: decodeFailure(ack, 'not-started') };
          if (!sameDomainHandle(ack.value.handle, head.head) || ack.value.rawRecovery !== head.envelope.rawRecovery) return { value: conflict('ack-mismatch') };
          return { value: { kind: 'ready', envelope: head.envelope, acknowledgement: ack.value } };
        });
        return active() ? result : conflict('operation-changed');
      } catch (error) { return failure(recoveryErrorReason(error)); }
    },
    async recordTrustedAccountAck(input: { handle: RecoveryHandle; rawRecovery: string; canonicalRaw: string }): Promise<RecoveryAckResult> {
      if (!active()) return conflict('operation-changed');
      if (!isDomainHandle(input.handle)) return conflict('scope');
      const scope = scopeFor(input.handle.tripId);
      // Snapshot all mutable caller objects before the first await.
      const raw = JSON.stringify({ version: 1, handle: { ...input.handle }, rawRecovery: input.rawRecovery, canonicalRaw: input.canonicalRaw });
      const decoded = decodeTrustedAccountAck(raw, scope); if (decoded.kind !== 'readable') return decodeFailure(decoded, 'not-started');
      const ack = decoded.value;
      try {
        const result = await driver.run<RecoveryAckResult | { kind: 'committed' }>(scope, ack.handle.writeId, 'readwrite', state => {
          if (!active()) return { value: conflict('operation-changed', 'not-committed') };
          const head = stateHead(state, scope); if (head.kind !== 'valid') return { value: head };
          const generation = decodeRecoveryEnvelope(state.generationRaw, scope);
          if (generation.kind !== 'readable') return { value: decodeFailure(generation, 'not-committed') };
          if (!sameDomainHandle(generation.value.handle, ack.handle) || generation.value.rawRecovery !== ack.rawRecovery) return { value: conflict('ack-mismatch', 'not-committed') };
          if (state.acknowledgementRaw !== undefined && state.acknowledgementRaw !== raw) return { value: conflict('ack-mismatch', 'not-committed') };
          return { value: { kind: 'committed' }, ...(state.acknowledgementRaw === undefined ? { acknowledgementRaw: raw } : {}) };
        });
        if (result.kind !== 'committed') return result;
      } catch (error) { return failure(recoveryErrorReason(error), error instanceof RecoveryDomainError ? error.commitStatus : 'unconfirmed'); }
      try {
        const result = await driver.run<RecoveryAckResult>(scope, ack.handle.writeId, 'readonly', state => {
          const head = stateHead(state, scope); if (head.kind !== 'valid') return { value: { ...head, commitStatus: 'committed' } };
          const generation = decodeRecoveryEnvelope(state.generationRaw, scope);
          if (state.acknowledgementRaw !== raw || generation.kind !== 'readable' || generation.value.rawRecovery !== ack.rawRecovery
            || !sameDomainHandle(generation.value.handle, ack.handle)) return { value: failure('readback', 'committed') };
          return { value: { kind: 'journaled', handle: ack.handle, headMatches: sameDomainHandle(head.head, ack.handle), accountAckMatchesCandidate: true } };
        });
        return active() ? result : conflict('operation-changed', 'committed');
      } catch (error) { return { ...failure('readback', 'committed'), cause: recoveryErrorReason(error) }; }
    },
  };
}
