import type { RecoveryDomainDriver, RecoveryDomainState, RecoveryDomainDecision, RecoveryScope } from '../../lib/easyt/durable-recovery-store.ts';
import { decodeDomainHead, decodeClaimHeadRow, isRecoveryScope, snapshotRecoveryClaimRequest, assertRecoveryClaimDecision,
  type RecoveryClaimRequest, type RecoveryClaimState, type RecoveryClaimDecision } from '../../lib/easyt/durable-recovery-domain.ts';
import { RecoveryDomainError } from '../../lib/easyt/durable-recovery-error.ts';
import { decodeEntryHead, entryHeadKey, entryGenerationKey, type RecoveryEntryRequest, type RecoveryEntryScope, type RecoveryEntryState, type RecoveryEntryMutation } from '../../lib/easyt/durable-entry-protocol.ts';

/** Transaction contract model only: no claim of native IndexedDB durability. */
export class MemoryRecoveryDriver implements RecoveryDomainDriver {
  generations = new Map<string, unknown>();
  heads = new Map<string, unknown>();
  acknowledgements = new Map<string, unknown>();
  transactions = 0;
  fail: Error | null = null;
  afterCommit: (() => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  scopeKey(scope: RecoveryScope) { return JSON.stringify([scope.ownerId, scope.tripId]); }
  key(scope: RecoveryScope, writeId: string) { return JSON.stringify([scope.ownerId, scope.tripId, writeId]); }
  async readCurrent(ownerId: string | null) { return this.heads.get(JSON.stringify([ownerId])); }
  async listHeads(ownerId: string | null) {
    const prefix = `${JSON.stringify([ownerId]).slice(0, -1)},`;
    return [...this.heads].filter(([key]) => key.startsWith(prefix) && JSON.parse(key).length === 2).map(([key, raw]) => ({ key, raw }));
  }
  listClaimHeads(ownerId: string | null): Promise<{key:string;raw:unknown}[]> {
    if (!isRecoveryScope({ownerId,tripId:'claim-list'})) return Promise.reject(new RecoveryDomainError('security','not-started'));
    const operation = this.queue.then(() => {
      this.transactions++; if (this.fail) throw this.fail;
      const rows: {key:string;raw:unknown}[] = [];
      for (const [key,raw] of this.heads) {
        const row = decodeClaimHeadRow(key,raw,ownerId);
        if (row.kind !== 'readable') throw new RecoveryDomainError(row.kind === 'scope' ? 'security' : row.kind,'not-started');
        if (row.value) rows.push(row.value);
      }
      return rows;
    });
    this.queue = operation.catch(() => undefined); return operation;
  }
  runEntry<T>(scope: RecoveryEntryScope, writeId: string | null, mode: 'readonly' | 'readwrite', decide: (state: RecoveryEntryState) => { value: T; mutation?: RecoveryEntryMutation }): Promise<T> {
    return this.run({ ownerId: scope.ownerId, tripId: 'model-entry-only' }, null, mode, state => {
      const result = decide(state.entries[0]); return { value: result.value, ...(result.mutation ? { entryWrites: [result.mutation] } : {}) };
    }, [{ scope, writeId }]);
  }
  runClaim<T>(input: RecoveryClaimRequest, mode: 'readonly' | 'readwrite', decide: (state: RecoveryClaimState) => RecoveryClaimDecision<T>): Promise<T> {
    let request: RecoveryClaimRequest;
    try {
      request = snapshotRecoveryClaimRequest(input);
      if (mode !== 'readonly' && mode !== 'readwrite') throw new TypeError('Invalid claim mode');
    } catch { return Promise.reject(new RecoveryDomainError('security', 'not-started')); }
    const operation = this.queue.then(() => {
      this.transactions++; if (this.fail) throw this.fail;
      const read = (handle: RecoveryClaimRequest['sourceHandle'], entries: RecoveryEntryRequest[]): RecoveryDomainState => {
        const headRaw = this.heads.get(this.scopeKey(handle)), decoded = decodeDomainHead(headRaw, handle);
        const head = decoded.kind === 'readable' ? decoded.value : null;
        return { headRaw, generationRaw: this.generations.get(this.key(handle,handle.writeId)),
          headGenerationRaw: head ? this.generations.get(this.key(handle,head.writeId)) : undefined,
          acknowledgementRaw: this.acknowledgements.get(this.key(handle,handle.writeId)), currentRaw: this.heads.get(JSON.stringify([handle.ownerId])),
          entries: entries.map(item => {
            const raw = this.heads.get(entryHeadKey(item.scope)), decoded = decodeEntryHead(raw,item.scope);
            const head = decoded.kind === 'readable' ? decoded.value : null, selected = item.writeId ?? head?.writeId;
            return { headRaw: raw, headGenerationRaw: head ? this.generations.get(entryGenerationKey(item.scope,head.writeId)) : undefined,
              generationRaw: selected ? this.generations.get(entryGenerationKey(item.scope,selected)) : undefined };
          }) };
      };
      const decision = decide({ source: read(request.sourceHandle,request.sourceEntries), target: read(request.targetHandle,request.targetEntries) });
      assertRecoveryClaimDecision(request,mode,decision);
      const targetKey = this.key(request.targetHandle,request.targetHandle.writeId);
      const mutations = [...decision.sourceEntryWrites ?? [], ...decision.targetEntryWrites ?? []];
      if (decision.targetGenerationRaw !== undefined && this.generations.has(targetKey)) throw new DOMException('Immutable generation exists','ConstraintError');
      for (const row of mutations) if (this.generations.has(entryGenerationKey(row.scope,row.writeId))) throw new DOMException('Immutable entry exists','ConstraintError');
      // Every scope/identity/collision check precedes all mutations, matching the native transaction.
      if (decision.targetGenerationRaw !== undefined) {
        this.generations.set(targetKey,decision.targetGenerationRaw);
        this.heads.set(this.scopeKey(request.targetHandle),decision.targetHeadRaw);
        this.heads.set(JSON.stringify([request.targetHandle.ownerId]),decision.targetCurrentRaw);
      }
      for (const row of mutations) {
        this.generations.set(entryGenerationKey(row.scope,row.writeId),row.raw); this.heads.set(entryHeadKey(row.scope),row.headRaw);
      }
      if (mode === 'readwrite') this.afterCommit?.();
      return decision.value;
    });
    this.queue = operation.catch(() => undefined); return operation;
  }
  run<T>(scope: RecoveryScope, writeId: string | null, mode: 'readonly' | 'readwrite', decide: (state: RecoveryDomainState) => RecoveryDomainDecision<T>, requested: RecoveryEntryRequest[] = []): Promise<T> {
    const operation = this.queue.then(() => {
      this.transactions++;
      if (this.fail) throw this.fail;
      const scopeKey = this.scopeKey(scope);
      const headRaw = this.heads.get(scopeKey);
      let headWriteId: string | null = null;
      if (typeof headRaw === 'string') {
        try { headWriteId = JSON.parse(headRaw).writeId; } catch { /* Store validates corrupt head. */ }
      }
      let selected = writeId;
      if (selected === null && typeof headRaw === 'string') {
        try { selected = JSON.parse(headRaw).writeId; } catch { /* Corrupt head is validated by store. */ }
      }
      const key = typeof selected === 'string' ? this.key(scope, selected) : null;
      const decision = decide({ headRaw, generationRaw: key ? this.generations.get(key) : undefined,
        headGenerationRaw: headWriteId ? this.generations.get(this.key(scope, headWriteId)) : undefined,
        currentRaw: this.heads.get(JSON.stringify([scope.ownerId])),
        entries: requested.map(item => {
          const headRaw = this.heads.get(entryHeadKey(item.scope)), decoded = decodeEntryHead(headRaw, item.scope);
          const head = decoded.kind === 'readable' ? decoded.value : null, selected = item.writeId ?? head?.writeId;
          return { headRaw, generationRaw: selected ? this.generations.get(entryGenerationKey(item.scope, selected)) : undefined,
            headGenerationRaw: head ? this.generations.get(entryGenerationKey(item.scope, head.writeId)) : undefined };
        }),
        acknowledgementRaw: key ? this.acknowledgements.get(key) : undefined });
      if (mode === 'readonly' && (decision.headRaw !== undefined || decision.generationRaw !== undefined || decision.acknowledgementRaw !== undefined || decision.currentRaw !== undefined || decision.entryWrites?.length)) throw new Error('Readonly mutation');
      if (decision.generationRaw !== undefined && (key === null || this.generations.has(key))) throw new DOMException('Immutable generation exists', 'ConstraintError');
      if (decision.acknowledgementRaw !== undefined && (key === null || this.acknowledgements.has(key))) throw new DOMException('Immutable ACK exists', 'ConstraintError');
      for (const entry of decision.entryWrites ?? []) if (this.generations.has(entryGenerationKey(entry.scope, entry.writeId))) throw new DOMException('Immutable entry exists', 'ConstraintError');
      // Apply all changes only after the decision and immutable checks succeed.
      if (decision.generationRaw !== undefined) this.generations.set(key!, decision.generationRaw);
      if (decision.headRaw !== undefined) this.heads.set(scopeKey, decision.headRaw);
      if (decision.currentRaw !== undefined) this.heads.set(JSON.stringify([scope.ownerId]), decision.currentRaw);
      if (decision.acknowledgementRaw !== undefined) this.acknowledgements.set(key!, decision.acknowledgementRaw);
      for (const entry of decision.entryWrites ?? []) {
        this.generations.set(entryGenerationKey(entry.scope, entry.writeId), entry.raw); this.heads.set(entryHeadKey(entry.scope), entry.headRaw);
      }
      if (mode === 'readwrite') this.afterCommit?.();
      return decision.value;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
