import {decodeCreationReceipt,decodeTripCreationToken,validCreationReceiptRebind,type CreationReceiptRebind} from './trip-creation-provenance.ts';
import {prepareTripDocumentForWrite} from './trip-document.ts';
import {decodeRawRecovery,decodeRecoverySource} from './durable-recovery-domain.ts';
import { decodeDomainHead, decodeDomainCurrent, decodeRecoveryEnvelope, decodeTrustedAccountAck, isDomainHandle, isRecoveryScope, recoveryScopeKey,
  sameDomainHandle, sameRecoveryScope, type RecoveryDomainDriver, type RecoveryScope, type RecoveryHandle,
  type RecoveryCommitResult, type RecoveryReadResult, type RecoveryAckResult, type RecoveryListResult, type RecoveryFailureReason,
  type RecoveryFailure, type RecoveryConflict, type CommitStatus, type DecodeFailure, type RecoveryEnvelope,
  type RecoveryDomainState } from './durable-recovery-domain.ts';
export type * from './durable-recovery-domain.ts';
export { openIndexedDbRecoveryDriver } from './durable-recovery-indexeddb.ts';
import { RecoveryDomainError, recoveryErrorReason } from './durable-recovery-error.ts';
export { RecoveryDomainError, recoveryErrorReason } from './durable-recovery-error.ts';
import { entryHeadKey, decodeEntryEnvelope, type RecoveryEntryScope, type RecoveryEntryWrite, type RecoveryEntryMutation } from './durable-entry-protocol.ts';
import { prepareEntryWrite, decideEntryWrite, verifyEntryWrite, type PreparedEntryWrite } from './durable-entry-store.ts';
import { homepageInputMatchesTripReceipt } from './trip-receipt-persistence.ts';
const failure = (reason: RecoveryFailureReason, commitStatus: CommitStatus = 'not-started'): RecoveryFailure => ({ kind: 'failure', reason, commitStatus });
const conflict = (reason: RecoveryConflict['reason'], commitStatus: CommitStatus = 'not-started'): RecoveryConflict => ({ kind: 'protected-conflict', reason, commitStatus });
const decodeFailure = (decoded: DecodeFailure, status: CommitStatus) => decoded.kind === 'scope' ? conflict('scope', status) : failure(decoded.kind, status);
type ProjectionFence = { sourceRaw: string; currentRaw: unknown; entries: {scope: RecoveryEntryScope; raw: string | null}[] };
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
          if (!head.value || head.value.backend !== 'indexeddb' || row.key !== recoveryScopeKey(head.value)) return failure('corrupt');
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
        if (head.value.backend === 'creation-handover') return conflict('operation-changed');
        if (head.value.backend === 'cleared') return active() ? {kind:'ready',envelope:null,acknowledgement:null,current:head.value}:conflict('operation-changed');
        if (head.value.backend === 'local-storage') return active() ? { kind: 'ready', envelope: null, acknowledgement: null, current: head.value } : conflict('operation-changed');
        const read = await this.read(head.value.tripId); if (read.kind !== 'ready') return read;
        if (!read.envelope || !sameDomainHandle(read.envelope.handle, head.value) || await driver.readCurrent(ownerId) !== raw) return conflict('head-changed');
        return active() ? { ...read, current: head.value } : conflict('operation-changed');
      } catch (error) { return failure(recoveryErrorReason(error)); }
    },
    async commit(input: { raw: string; expectedHead: RecoveryHandle | null; admission: 'native-setter-quota' | 'existing-domain'; entries?: RecoveryEntryWrite[]; projectionFence?: ProjectionFence;navigationFence?:{currentRaw:unknown;witness?:{entry:import('./durable-entry-protocol.ts').RecoveryEntryRequest;entryRaw:string};isCurrent:()=>boolean};creationReceiptRebind?:CreationReceiptRebind }): Promise<RecoveryCommitResult> {
      if (!active()) return conflict('operation-changed');
      if (input.admission !== 'native-setter-quota' && !(input.admission === 'existing-domain' && input.expectedHead !== null)) return conflict('admission');
      let parsed: unknown; try { parsed = JSON.parse(input.raw); } catch { return failure('corrupt'); }
      if (!parsed || typeof parsed !== 'object' || !('handle' in parsed) || !isDomainHandle(parsed.handle)) return failure('corrupt');
      const scope = scopeFor(parsed.handle.tripId), decoded = decodeRecoveryEnvelope(input.raw, scope);
      if (decoded.kind !== 'readable') return decodeFailure(decoded, 'not-started');
      const candidate = decoded.value, raw = input.raw;
      const creationRebind=input.creationReceiptRebind?structuredClone(input.creationReceiptRebind):undefined;
      const navigationFence=input.navigationFence?{...input.navigationFence,witness:input.navigationFence.witness?structuredClone(input.navigationFence.witness):undefined}:undefined;
      if(navigationFence&&decodeDomainCurrent(navigationFence.currentRaw,ownerId).kind!=='readable')return conflict('scope');
      const navigationWitness=navigationFence?.witness;
      if(navigationWitness){
        const entry=decodeEntryEnvelope(navigationWitness.entryRaw,navigationWitness.entry.scope),pointer=decodeDomainCurrent(navigationFence!.currentRaw,ownerId);
        if(navigationWitness.entry.scope.kind!=='creation-navigation'||navigationWitness.entry.scope.ownerId!==ownerId||navigationWitness.entry.scope.tripId!==scope.tripId
          ||entry.kind!=='readable'||entry.value.raw!==navigationFence!.currentRaw||entry.value.handle.writeId!==navigationWitness.entry.writeId
          ||pointer.kind!=='readable'||pointer.value?.backend!=='creation-handover'||pointer.value.tripId!==scope.tripId
          ||pointer.value.writeId!==candidate.handle.writeId||pointer.value.attemptId!==navigationWitness.entry.writeId)return conflict('scope');
      }
      let fence: ProjectionFence | undefined;
      try { fence = input.projectionFence ? structuredClone(input.projectionFence) : undefined; } catch { return conflict('scope'); }
      const expected = input.expectedHead === null ? null : isDomainHandle(input.expectedHead) ? { ...input.expectedHead } : undefined;
      if (expected === undefined || expected && !sameRecoveryScope(expected, scope) || !sameDomainHandle(candidate.parent, expected)) return conflict('scope');
      if (fence) {
        const source = decodeRecoveryEnvelope(fence.sourceRaw, scope), seen = new Set<string>();
        if (input.admission !== 'existing-domain' || !expected || source.kind !== 'readable' || !sameDomainHandle(source.value.handle, expected)
          || !Array.isArray(fence.entries)) return conflict('scope');
        for (const entry of fence.entries) {
          if (entry.scope.ownerId !== ownerId || entry.scope.tripId !== scope.tripId || !['recovery-lifecycle','recovery-claim'].includes(entry.scope.kind)
            || seen.has(entryHeadKey(entry.scope)) || entry.raw !== null && decodeEntryEnvelope(entry.raw, entry.scope).kind !== 'readable') return conflict('scope');
          seen.add(entryHeadKey(entry.scope));
        }
      }
      if (input.entries !== undefined && !Array.isArray(input.entries)) return failure('corrupt');
      const preparedEntries: PreparedEntryWrite[] = [], seenEntries = new Set<string>();
      for (const entry of input.entries ?? []) {
        const prepared = prepareEntryWrite(entry, ownerId); if (prepared.kind !== 'prepared') return prepared;
        if(prepared.scope.kind==='recovery-lifecycle'||prepared.scope.kind==='recovery-claim'||prepared.scope.kind==='browser-owner'||prepared.scope.kind==='creation-navigation')return conflict('admission');
        const key = entryHeadKey(prepared.scope);
        if (seenEntries.has(key) || (prepared.scope.kind === 'builder-input'||prepared.scope.kind==='trip-receipt'||prepared.scope.kind==='trip-creation') && prepared.scope.tripId !== candidate.handle.tripId) return conflict('scope');
        const requiredRaw = prepared.scope.kind === 'builder-input' ? candidate.entry.input?.raw ?? null : prepared.scope.kind==='trip-creation'
          ?decodeCreationReceipt(candidate.entry.receipt?.raw??'',scope.ownerId,scope.tripId)?.reservationRaw??null:candidate.entry.receipt?.raw ?? null;
        if(prepared.scope.kind==='trip-creation'&&!decodeTripCreationToken(prepared.envelope.raw??'',scope.ownerId,scope.tripId))return conflict('scope');
        if (requiredRaw !== prepared.envelope.raw && (prepared.scope.kind!=='homepage'||requiredRaw===null||prepared.envelope.raw===null
          ||!homepageInputMatchesTripReceipt(prepared.envelope.raw,requiredRaw,ownerId,scope.tripId)
          ||!(input.entries??[]).some(value=>{const paired=prepareEntryWrite(value,ownerId);return paired.kind==='prepared'
            &&paired.scope.kind==='trip-receipt'&&paired.scope.tripId===scope.tripId&&paired.envelope.raw===requiredRaw;})))return conflict('scope');
        seenEntries.add(key); preparedEntries.push(prepared);
      }
      const entryRequests = [...preparedEntries.map(entry => ({ scope: entry.scope, writeId: entry.envelope.handle.writeId })),
        ...(fence?.entries ?? []).map(entry => ({scope: entry.scope, writeId: null})),...(navigationWitness?[navigationWitness.entry]:[])];
      const unchangedMetadata = (state: RecoveryDomainState) => (fence?.entries ?? []).every((entry,index) => {
        const observed = state.entries[preparedEntries.length + index];
        if (!observed) return false;
        if (entry.raw === null) return observed.headRaw === undefined && observed.headGenerationRaw === undefined && observed.generationRaw === undefined;
        const decoded = decodeEntryEnvelope(entry.raw, entry.scope);
        return decoded.kind === 'readable' && observed.headRaw === JSON.stringify(decoded.value.handle)
          && observed.headGenerationRaw === entry.raw && observed.generationRaw === entry.raw;
      });
      try {
        const committed = await driver.run<RecoveryCommitResult | { kind: 'committed' }>(scope, candidate.handle.writeId, 'readwrite', state => {
          if (!active()) return { value: conflict('operation-changed', 'not-committed') };
          if(navigationFence&&(state.currentRaw!==navigationFence.currentRaw||!navigationFence.isCurrent()))return {value:conflict('operation-changed','not-committed')};
          if(navigationWitness){
            const row=state.entries.at(-1),entry=JSON.parse(navigationWitness.entryRaw);
            if(row?.headRaw!==JSON.stringify(entry.handle)||row.headGenerationRaw!==navigationWitness.entryRaw||row.generationRaw!==navigationWitness.entryRaw)
              return {value:conflict('operation-changed','not-committed')};
          }
          const existing = stateHead(state, scope); if (existing.kind !== 'valid') return { value: existing };
          if (fence && (state.headGenerationRaw !== fence.sourceRaw || state.currentRaw !== fence.currentRaw || !unchangedMetadata(state)))
            return {value: conflict('head-changed','not-committed')};
          // Only the dedicated paired transaction may introduce a claim.
          // Later generic edits must retain that exact ancestry pointer.
          if(JSON.stringify(candidate.entry.claim)!==JSON.stringify(existing.envelope?.entry.claim))return {value:conflict('admission','not-committed')};
          const creation=candidate.entry.receipt&&decodeCreationReceipt(candidate.entry.receipt.raw,ownerId,scope.tripId);
          if(creation&&candidate.entry.receipt?.raw!==existing.envelope?.entry.receipt?.raw) {
            const token=decodeTripCreationToken(creation.reservationRaw,ownerId,scope.tripId);
            const body=decodeRawRecovery(candidate.rawRecovery,scope);
            const reservation=preparedEntries.find(entry=>entry.scope.kind==='trip-creation');
            const completed=preparedEntries.find(entry=>entry.scope.kind==='trip-receipt');
            const exactInitial=(value:ReturnType<typeof decodeRawRecovery>)=>Boolean(token&&value.kind==='readable'
              &&value.value.writeId===token.initialWriteId&&JSON.stringify(prepareTripDocumentForWrite(value.value.trip))===token.initialTripRaw);
            const fresh=token&&body.kind==='readable'&&candidate.handle.writeId===token.initialWriteId&&exactInitial(body)
              &&(!existing.envelope||exactInitial(decodeRawRecovery(existing.envelope.rawRecovery,scope)))
              &&candidate.legacySources.every(source=>exactInitial(decodeRecoverySource(source,scope)))
              &&reservation?.envelope.raw===creation.reservationRaw&&reservation.envelope.retainedPreviousRaw===creation.reservationRaw
              &&completed?.envelope.raw===candidate.entry.receipt!.raw;
            if(!fresh&&!(creationRebind&&body.kind==='readable'&&validCreationReceiptRebind(creationRebind,candidate.entry.receipt!.raw,body.value.trip,ownerId)))
              return {value:conflict('admission','not-committed')};
          }
          const entryWrites: RecoveryEntryMutation[] = [];
          for (const [index, entry] of preparedEntries.entries()) {
            const decision = decideEntryWrite(entry, state.entries[index]); if (decision.kind !== 'write') return { value: decision };
            if (fence && decision.mutation) return {value: conflict('admission','not-committed')};
            if (decision.mutation) entryWrites.push(decision.mutation);
          }
          if (state.generationRaw !== undefined) {
            if (state.generationRaw !== raw) return { value: conflict('immutable-collision', 'not-committed') };
            if (!sameDomainHandle(existing.head, candidate.handle)) return { value: conflict('head-changed', 'not-committed') };
            return { value: { kind: 'committed' }, entryWrites };
          }
          if (!sameDomainHandle(existing.head, expected)) return { value: conflict('head-changed', 'not-committed') };
          return { value: { kind: 'committed' }, generationRaw: raw, headRaw: JSON.stringify(candidate.handle), currentRaw: JSON.stringify(candidate.handle), entryWrites };
        }, entryRequests);
        if (committed.kind !== 'committed') return committed;
      } catch (error) {
        return failure(recoveryErrorReason(error), error instanceof RecoveryDomainError ? error.commitStatus : 'unconfirmed');
      }
      if (!active()) return conflict('operation-changed', 'committed');
      try {
        const verified = await driver.run<RecoveryCommitResult>(scope, candidate.handle.writeId, 'readonly', state => {
          if (state.generationRaw !== raw) return { value: failure('readback', 'committed') };
          const head = stateHead(state, scope); if (head.kind !== 'valid') return { value: { ...head, commitStatus: 'committed' } };
          if (fence && !unchangedMetadata(state)) return {value: conflict('head-changed','committed')};
          if (!sameDomainHandle(head.head, candidate.handle)) return { value: conflict('head-changed', 'committed') };
          const pointer = decodeDomainCurrent(state.currentRaw, ownerId);
          if (pointer.kind !== 'readable' || pointer.value?.backend !== 'indexeddb' || !sameDomainHandle(pointer.value, candidate.handle)) return { value: conflict('head-changed', 'committed') };
          for (const [index, entry] of preparedEntries.entries()) {
            const refused = verifyEntryWrite(entry, state.entries[index]); if (refused) return { value: refused };
          }
          return { value: { kind: 'verified', handle: candidate.handle, raw, commitStatus: 'committed' } };
        }, entryRequests);
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
