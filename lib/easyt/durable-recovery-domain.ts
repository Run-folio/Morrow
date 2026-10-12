import { readTripDocument } from './trip-document.ts';
import { tripRecoveryStorageKey } from './storage.ts';
import { tripBuildDocumentsCanonicalEquivalent } from './trip-promotion.ts';
import type { TripRecoveryRecord } from './storage.ts';

/** Recovery-domain protocol. No implicit browser access. */
export type RecoveryScope = { ownerId: string | null; tripId: string };
export type RecoveryHandle = RecoveryScope & { version: 1; backend: 'indexeddb'; writeId: string };
export type LegacyRecoverySource = { key: string; raw: string };
export type RecoveryEnvelope = {
  version: 1;
  handle: RecoveryHandle;
  parent: RecoveryHandle | null;
  rawRecovery: string;
  legacySources: LegacyRecoverySource[];
  /** Opaque bytes need the existing input/receipt codecs at the app adapter.
   * This protocol verifies their bound identity and exact retention only. */
  entry: {
    pointer: RecoveryHandle;
    input: (RecoveryScope & { inputRevision: number; raw: string }) | null;
    receipt: (RecoveryScope & { operationId: string; raw: string }) | null;
  };
};
export type RecoveryFailureReason = 'quota' | 'security' | 'unavailable' | 'blocked' | 'abort' | 'schema' | 'corrupt' | 'readback' | 'unknown';
export type CommitStatus = 'not-started' | 'not-committed' | 'unconfirmed' | 'committed';
export type RecoveryFailure = { kind: 'failure'; reason: RecoveryFailureReason; commitStatus: CommitStatus; cause?: RecoveryFailureReason };
export type RecoveryConflict = { kind: 'protected-conflict'; reason: 'scope' | 'operation-changed' | 'admission' | 'head-changed' | 'immutable-collision' | 'ack-mismatch'; commitStatus: CommitStatus };
export type RecoveryCommitResult = RecoveryFailure | RecoveryConflict | { kind: 'verified'; handle: RecoveryHandle; raw: string; commitStatus: 'committed' };
export type TrustedAccountAck = { version: 1; handle: RecoveryHandle; rawRecovery: string; canonicalRaw: string };
export type RecoveryReadResult = RecoveryFailure | RecoveryConflict | { kind: 'ready'; envelope: RecoveryEnvelope | null; acknowledgement: TrustedAccountAck | null };
export type RecoveryAckResult = RecoveryFailure | RecoveryConflict | { kind: 'journaled'; handle: RecoveryHandle; headMatches: boolean; accountAckMatchesCandidate: true };
export type RecoveryListResult = RecoveryFailure | RecoveryConflict | { kind: 'ready'; recoveries: { envelope: RecoveryEnvelope; acknowledgement: TrustedAccountAck | null }[] };

export type RecoveryDomainState = { headRaw: unknown; headGenerationRaw: unknown; generationRaw: unknown; acknowledgementRaw: unknown; currentRaw: unknown };
export type RecoveryDomainDecision<T> = { value: T; headRaw?: string; generationRaw?: string; acknowledgementRaw?: string; currentRaw?: string };
/** `run` must serialize readwrite transactions for a scope, atomically commit
 * every returned mutation, use add-only generations/ACKs, and resolve only
 * after completion. Decision callbacks are synchronous, never awaited. */
export interface RecoveryDomainDriver {
  run<T>(scope: RecoveryScope, writeId: string | null, mode: 'readonly' | 'readwrite', decide: (state: RecoveryDomainState) => RecoveryDomainDecision<T>): Promise<T>;
  readCurrent(ownerId: string | null): Promise<unknown>;
  listHeads(ownerId: string | null): Promise<{ key: string; raw: unknown }[]>;
  close?(): void;
}

export const recoveryScopeKey = (scope: RecoveryScope) => JSON.stringify([scope.ownerId, scope.tripId]);
export const recoveryGenerationKey = (scope: RecoveryScope, writeId: string) => JSON.stringify([scope.ownerId, scope.tripId, writeId]);
export const recoveryCurrentKey = (ownerId: string | null) => JSON.stringify([ownerId]);
export const recoveryOwnerPrefix = (ownerId: string | null) => `${JSON.stringify([ownerId]).slice(0, -1)},`;
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
const owner = (v: unknown): v is string | null => v === null || text(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join(',') === expected.sort().join(',');
export const sameRecoveryScope = (a: RecoveryScope, b: RecoveryScope) => a.ownerId === b.ownerId && a.tripId === b.tripId;
export const sameDomainHandle = (a: RecoveryHandle | null, b: RecoveryHandle | null) => a === null || b === null ? a === b
  : a.version === b.version && a.backend === b.backend && sameRecoveryScope(a, b) && a.writeId === b.writeId;
export function isRecoveryScope(value: unknown): value is Record<string, unknown> & RecoveryScope {
  return record(value) && owner(value.ownerId) && text(value.tripId);
}
export function isDomainHandle(value: unknown): value is RecoveryHandle {
  return isRecoveryScope(value) && record(value) && keys(value, ['version', 'backend', 'ownerId', 'tripId', 'writeId'])
    && value.version === 1 && value.backend === 'indexeddb' && text(value.writeId);
}
export type DecodeFailure = { kind: 'scope' | 'schema' | 'corrupt' };
export type DomainDecode<T> = DecodeFailure | { kind: 'readable'; value: T };
export function decodeDomainHead(raw: unknown, scope: RecoveryScope): DomainDecode<RecoveryHandle | null> {
  if (raw === undefined) return { kind: 'readable', value: null };
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (record(value) && value.version !== 1) return { kind: 'schema' };
    if (!isDomainHandle(value)) return { kind: 'corrupt' };
    return sameRecoveryScope(value, scope) ? { kind: 'readable', value } : { kind: 'scope' };
  } catch { return { kind: 'corrupt' }; }
}
export function decodeDomainCurrent(raw: unknown, ownerId: string | null): DomainDecode<RecoveryHandle | null> {
  if (raw === undefined) return { kind: 'readable', value: null };
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!record(value) || typeof value.tripId !== 'string') return { kind: 'corrupt' };
    return decodeDomainHead(raw, { ownerId, tripId: value.tripId });
  } catch { return { kind: 'corrupt' }; }
}
export function decodeRawRecovery(raw: unknown, scope: RecoveryScope): DomainDecode<TripRecoveryRecord> {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!record(value)) return { kind: 'corrupt' };
    if (value.version !== 2) return { kind: 'schema' };
    if (!isRecoveryScope(value) || !text(value.writeId) || !text(value.savedAt) || !Number.isFinite(Date.parse(value.savedAt))
      || !['pending', 'network', 'auth', 'conflict', 'validation', 'repository', 'unknown'].includes(String(value.state))) return { kind: 'corrupt' };
    if (!sameRecoveryScope(value, scope)) return { kind: 'scope' };
    const decoded = readTripDocument(value.trip);
    if (decoded.kind !== 'readable') return { kind: decoded.kind === 'unsupported' ? 'schema' : 'corrupt' };
    if (decoded.trip.id !== scope.tripId || (scope.ownerId === null ? decoded.trip.ownerId !== null
      : decoded.trip.ownerId !== null && decoded.trip.ownerId !== scope.ownerId)) return { kind: 'scope' };
    // Return decoded copy for validation/comparison; original raw bytes remain the storage authority.
    return { kind: 'readable', value: { ...value, trip: decoded.trip } as TripRecoveryRecord };
  } catch { return { kind: 'corrupt' }; }
}
export function decodeLegacySource(value: unknown, scope: RecoveryScope): DomainDecode<LegacyRecoverySource> {
  if (!record(value) || !keys(value, ['key', 'raw']) || typeof value.key !== 'string' || typeof value.raw !== 'string') return { kind: 'corrupt' };
  const recovery = decodeRawRecovery(value.raw, scope); if (recovery.kind !== 'readable') return recovery;
  const base = tripRecoveryStorageKey(scope.ownerId, scope.tripId);
  if (value.key !== base && value.key !== tripRecoveryStorageKey(scope.ownerId, scope.tripId, recovery.value.writeId)) return { kind: 'scope' };
  return { kind: 'readable', value: { key: value.key, raw: value.raw } };
}
export function decodeRecoveryEnvelope(raw: unknown, scope: RecoveryScope): DomainDecode<RecoveryEnvelope> {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!record(value)) return { kind: 'corrupt' };
    if (value.version !== 1) return { kind: 'schema' };
    if (!keys(value, ['version', 'handle', 'parent', 'rawRecovery', 'legacySources', 'entry']) || !isDomainHandle(value.handle)
      || !(value.parent === null || isDomainHandle(value.parent)) || !Array.isArray(value.legacySources)
      || !record(value.entry) || !keys(value.entry, ['pointer', 'input', 'receipt']) || !isDomainHandle(value.entry.pointer)) return { kind: 'corrupt' };
    const handle = value.handle;
    if (!sameRecoveryScope(handle, scope) || !sameDomainHandle(handle, value.entry.pointer)
      || value.parent !== null && (!sameRecoveryScope(value.parent as RecoveryHandle, scope) || (value.parent as RecoveryHandle).writeId === handle.writeId)) return { kind: 'scope' };
    const recovery = decodeRawRecovery(value.rawRecovery, scope); if (recovery.kind !== 'readable') return recovery;
    if (recovery.value.writeId !== handle.writeId) return { kind: 'scope' };
    const input = value.entry.input, receipt = value.entry.receipt;
    if (input !== null) {
      if (!isRecoveryScope(input) || !record(input) || !keys(input, ['ownerId', 'tripId', 'inputRevision', 'raw'])
        || !Number.isSafeInteger(input.inputRevision) || Number(input.inputRevision) < 0 || typeof input.raw !== 'string') return { kind: 'corrupt' };
      if (!sameRecoveryScope(input, scope)) return { kind: 'scope' };
    }
    if (receipt !== null) {
      if (!isRecoveryScope(receipt) || !record(receipt) || !keys(receipt, ['ownerId', 'tripId', 'operationId', 'raw'])
        || !text(receipt.operationId) || typeof receipt.raw !== 'string') return { kind: 'corrupt' };
      if (!sameRecoveryScope(receipt, scope)) return { kind: 'scope' };
    }
    const seen = new Set<string>();
    for (const source of value.legacySources) {
      const decoded = decodeLegacySource(source, scope); if (decoded.kind !== 'readable') return decoded;
      if (seen.has(decoded.value.key)) return { kind: 'corrupt' }; seen.add(decoded.value.key);
    }
    return { kind: 'readable', value: value as RecoveryEnvelope };
  } catch { return { kind: 'corrupt' }; }
}
/** Only checks an already trusted response against the exact candidate. Does
 * not create proof of a server write, fetch a document, or retire recovery. */
export function decodeTrustedAccountAck(raw: unknown, scope: RecoveryScope): DomainDecode<TrustedAccountAck> {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!record(value) || value.version !== 1) return { kind: record(value) ? 'schema' : 'corrupt' };
    if (!keys(value, ['version', 'handle', 'rawRecovery', 'canonicalRaw']) || !isDomainHandle(value.handle) || typeof value.canonicalRaw !== 'string') return { kind: 'corrupt' };
    if (scope.ownerId === null || !sameRecoveryScope(value.handle, scope)) return { kind: 'scope' };
    const recovery = decodeRawRecovery(value.rawRecovery, scope); if (recovery.kind !== 'readable') return recovery;
    if (recovery.value.writeId !== value.handle.writeId) return { kind: 'scope' };
    const canonical = readTripDocument(JSON.parse(value.canonicalRaw));
    if (canonical.kind !== 'readable') return { kind: canonical.kind === 'unsupported' ? 'schema' : 'corrupt' };
    if (canonical.trip.ownerId !== scope.ownerId || canonical.trip.id !== scope.tripId
      || !tripBuildDocumentsCanonicalEquivalent(recovery.value.trip, canonical.trip, scope.ownerId)) return { kind: 'scope' };
    return { kind: 'readable', value: value as TrustedAccountAck };
  } catch { return { kind: 'corrupt' }; }
}
