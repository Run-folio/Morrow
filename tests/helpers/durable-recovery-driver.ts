import type { RecoveryDomainDriver, RecoveryDomainState, RecoveryDomainDecision, RecoveryScope } from '../../lib/easyt/durable-recovery-store.ts';

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
    return [...this.heads].filter(([key]) => key.startsWith(prefix)).map(([key, raw]) => ({ key, raw }));
  }
  run<T>(scope: RecoveryScope, writeId: string | null, mode: 'readonly' | 'readwrite', decide: (state: RecoveryDomainState) => RecoveryDomainDecision<T>): Promise<T> {
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
        acknowledgementRaw: key ? this.acknowledgements.get(key) : undefined });
      if (mode === 'readonly' && (decision.headRaw !== undefined || decision.generationRaw !== undefined || decision.acknowledgementRaw !== undefined || decision.currentRaw !== undefined)) throw new Error('Readonly mutation');
      if (decision.generationRaw !== undefined && (key === null || this.generations.has(key))) throw new DOMException('Immutable generation exists', 'ConstraintError');
      if (decision.acknowledgementRaw !== undefined && (key === null || this.acknowledgements.has(key))) throw new DOMException('Immutable ACK exists', 'ConstraintError');
      // Apply all changes only after the decision and immutable checks succeed.
      if (decision.generationRaw !== undefined) this.generations.set(key!, decision.generationRaw);
      if (decision.headRaw !== undefined) this.heads.set(scopeKey, decision.headRaw);
      if (decision.currentRaw !== undefined) this.heads.set(JSON.stringify([scope.ownerId]), decision.currentRaw);
      if (decision.acknowledgementRaw !== undefined) this.acknowledgements.set(key!, decision.acknowledgementRaw);
      if (mode === 'readwrite') this.afterCommit?.();
      return decision.value;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
