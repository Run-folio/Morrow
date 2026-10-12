import { readTripDocument } from './trip-document.ts';
import { tripRecoveryStorageKey, EASYT_ACTIVE_TRIP_KEY } from './storage.ts';
import { tripBuildDocumentsCanonicalEquivalent } from './trip-promotion.ts';
import type { TripRecoveryRecord } from './storage.ts';
import { decodeEntryEnvelope, decodeEntryHead, entryHeadKey, isEntryScope, sameEntryScope,
  type RecoveryEntryRequest, type RecoveryEntryState, type RecoveryEntryMutation, type RecoveryEntryScope } from './durable-entry-protocol.ts';

/** Recovery-domain protocol. No implicit browser access. */
export type RecoveryScope = { ownerId: string | null; tripId: string };
export type RecoveryHandle = RecoveryScope & { version: 1; backend: 'indexeddb'; writeId: string };
export type NativeRecoveryPointer = RecoveryScope & { version: 1; backend: 'local-storage'; source: 'recovery' | 'cache'; writeId: string | null; nativePointerRaw: string; documentDigest: string };
export type ClearedRecoveryPointer = {version:1;backend:'cleared';ownerId:string|null;nativePointerRaw:string|null};
export type RecoveryCurrent = RecoveryHandle | NativeRecoveryPointer | ClearedRecoveryPointer;
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
    /** Exact older native navigation observed at admission; no locator write is required. */
    nativePointerRaw?: string | null;
    /** Paired local claim proof; never a credential or an account ACK. */
    claim?: { source: RecoveryHandle; claimId: string };
  };
};
export type RecoveryFailureReason = 'quota' | 'security' | 'unavailable' | 'blocked' | 'abort' | 'schema' | 'corrupt' | 'readback' | 'unknown';
export type CommitStatus = 'not-started' | 'not-committed' | 'unconfirmed' | 'committed';
export type RecoveryFailure = { kind: 'failure'; reason: RecoveryFailureReason; commitStatus: CommitStatus; cause?: RecoveryFailureReason };
export type RecoveryConflict = { kind: 'protected-conflict'; reason: 'scope' | 'operation-changed' | 'admission' | 'head-changed' | 'immutable-collision' | 'ack-mismatch'; commitStatus: CommitStatus };
export type RecoveryCommitResult = RecoveryFailure | RecoveryConflict | { kind: 'verified'; handle: RecoveryHandle; raw: string; commitStatus: 'committed' };
export type TrustedAccountAck = { version: 1; handle: RecoveryHandle; rawRecovery: string; canonicalRaw: string };
export type RecoveryReadResult = RecoveryFailure | RecoveryConflict | { kind: 'ready'; envelope: RecoveryEnvelope | null; acknowledgement: TrustedAccountAck | null; current?: RecoveryCurrent };
export type RecoveryAckResult = RecoveryFailure | RecoveryConflict | { kind: 'journaled'; handle: RecoveryHandle; headMatches: boolean; accountAckMatchesCandidate: true };
export type RecoveryListResult = RecoveryFailure | RecoveryConflict | { kind: 'ready'; recoveries: { envelope: RecoveryEnvelope; acknowledgement: TrustedAccountAck | null }[] };

export type RecoveryDomainState = { headRaw: unknown; headGenerationRaw: unknown; generationRaw: unknown; acknowledgementRaw: unknown; currentRaw: unknown; entries: RecoveryEntryState[] };
export type RecoveryDomainDecision<T> = { value: T; headRaw?: string; generationRaw?: string; acknowledgementRaw?: string; currentRaw?: string; entryWrites?: RecoveryEntryMutation[] };
/** Explicit guest-to-owner exception. Generic run/runEntry remain same-owner. */
export type RecoveryClaimRequest = { sourceHandle: RecoveryHandle; targetHandle: RecoveryHandle;
  sourceEntries: RecoveryEntryRequest[]; targetEntries: RecoveryEntryRequest[] };
export type RecoveryClaimState = { source: RecoveryDomainState; target: RecoveryDomainState };
export type RecoveryClaimDecision<T> = { value: T; targetGenerationRaw?: string; targetHeadRaw?: string; targetCurrentRaw?: string;
  sourceEntryWrites?: RecoveryEntryMutation[]; targetEntryWrites?: RecoveryEntryMutation[] };
/** `run` must serialize readwrite transactions for a scope, atomically commit
 * every returned mutation, use add-only generations/ACKs, and resolve only
 * after completion. Decision callbacks are synchronous, never awaited. */
export interface RecoveryDomainDriver {
  run<T>(scope: RecoveryScope, writeId: string | null, mode: 'readonly' | 'readwrite', decide: (state: RecoveryDomainState) => RecoveryDomainDecision<T>, entries?: RecoveryEntryRequest[]): Promise<T>;
  runEntry<T>(scope: RecoveryEntryScope, writeId: string | null, mode: 'readonly' | 'readwrite', decide: (state: RecoveryEntryState) => { value: T; mutation?: RecoveryEntryMutation }): Promise<T>;
  runClaim?<T>(request: RecoveryClaimRequest, mode: 'readonly' | 'readwrite', decide: (state: RecoveryClaimState) => RecoveryClaimDecision<T>): Promise<T>;
  readCurrent(ownerId: string | null): Promise<unknown>;
  listHeads(ownerId: string | null): Promise<{ key: string; raw: unknown }[]>;
  listClaimHeads?(ownerId: string | null): Promise<{ key: string; raw: unknown }[]>;
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
/** Snapshot before any await; reject requests outside the two fixed scopes. */
export function snapshotRecoveryClaimRequest(request: RecoveryClaimRequest): RecoveryClaimRequest {
  if (!record(request) || !keys(request, ['sourceHandle', 'targetHandle', 'sourceEntries', 'targetEntries'])
    || !isDomainHandle(request.sourceHandle) || !isDomainHandle(request.targetHandle)
    || request.sourceHandle.ownerId !== null || !text(request.targetHandle.ownerId)
    || request.sourceHandle.tripId !== request.targetHandle.tripId) throw new TypeError('Invalid claim scopes');
  const entries = (rows: RecoveryEntryRequest[], scope: RecoveryScope) => {
    if (!Array.isArray(rows)) throw new TypeError('Invalid claim entries');
    const seen = new Set<string>();
    return rows.map(row => {
      if (!record(row) || !keys(row, ['scope', 'writeId']) || !isEntryScope(row.scope)
        || !keys(row.scope, ['ownerId', 'kind', 'tripId']) || row.scope.ownerId !== scope.ownerId
        || !['homepage', 'builder-input', 'recovery-lifecycle', 'recovery-claim'].includes(row.scope.kind)
        || (row.scope.kind === 'homepage' ? row.scope.tripId !== null : row.scope.tripId !== scope.tripId)
        || !(row.writeId === null || text(row.writeId))) throw new TypeError('Unbound claim entry');
      const key = entryHeadKey(row.scope);
      if (seen.has(key)) throw new TypeError('Duplicate claim entry'); seen.add(key);
      return { scope: { ...row.scope }, writeId: row.writeId };
    });
  };
  return { sourceHandle: { ...request.sourceHandle }, targetHandle: { ...request.targetHandle },
    sourceEntries: entries(request.sourceEntries, request.sourceHandle), targetEntries: entries(request.targetEntries, request.targetHandle) };
}
/** Driver boundary only: the coordinator owns lifecycle/native-byte/parent CAS
 * and payload meaning. All mutations are validated before any request is queued. */
export function assertRecoveryClaimDecision(request: RecoveryClaimRequest, mode: 'readonly' | 'readwrite', decision: unknown): asserts decision is RecoveryClaimDecision<unknown> {
  if (!record(decision) || 'then' in decision || !('value' in decision)
    || Object.keys(decision).some(key => !['value', 'targetGenerationRaw', 'targetHeadRaw', 'targetCurrentRaw', 'sourceEntryWrites', 'targetEntryWrites'].includes(key))) throw new TypeError('Invalid claim decision');
  const canonicalCount = ['targetGenerationRaw', 'targetHeadRaw', 'targetCurrentRaw'].filter(key => decision[key] !== undefined).length;
  if (canonicalCount !== 0 && canonicalCount !== 3) throw new TypeError('Incomplete target claim generation');
  const mutations = (value: unknown, requested: RecoveryEntryRequest[], source: boolean): RecoveryEntryMutation[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new TypeError('Invalid claim mutations');
    const seen = new Set<string>();
    return value.map(row => {
      if (!record(row) || !keys(row, ['scope', 'writeId', 'raw', 'headRaw']) || !isEntryScope(row.scope) || !text(row.writeId)
        || typeof row.raw !== 'string' || typeof row.headRaw !== 'string'
        || row.scope.kind === 'recovery-lifecycle' || source && row.scope.kind !== 'recovery-claim'
        || !requested.some(item => sameEntryScope(item.scope, row.scope as RecoveryEntryScope) && item.writeId === row.writeId)) throw new TypeError('Unbound claim mutation');
      const key = entryHeadKey(row.scope);
      if (seen.has(key)) throw new TypeError('Duplicate claim mutation'); seen.add(key);
      const head = decodeEntryHead(row.headRaw, row.scope), envelope = decodeEntryEnvelope(row.raw, row.scope);
      if (head.kind !== 'readable' || !head.value || head.value.writeId !== row.writeId
        || envelope.kind !== 'readable' || envelope.value.handle.writeId !== row.writeId) throw new TypeError('Mismatched claim entry identity');
      return row as RecoveryEntryMutation;
    });
  };
  const source = mutations(decision.sourceEntryWrites, request.sourceEntries, true), target = mutations(decision.targetEntryWrites, request.targetEntries, false);
  if (mode !== 'readwrite' && (canonicalCount || source.length || target.length)) throw new TypeError('Readonly claim mutation');
  if (canonicalCount) {
    const generation = decodeRecoveryEnvelope(decision.targetGenerationRaw, request.targetHandle);
    const head = decodeDomainHead(decision.targetHeadRaw, request.targetHandle), current = decodeDomainHead(decision.targetCurrentRaw, request.targetHandle);
    if (generation.kind !== 'readable' || !sameDomainHandle(generation.value.handle, request.targetHandle)
      || head.kind !== 'readable' || !sameDomainHandle(head.value, request.targetHandle)
      || current.kind !== 'readable' || !sameDomainHandle(current.value, request.targetHandle)
      || source.length !== 1 || !target.some(row => row.scope.kind === 'recovery-claim')) throw new TypeError('Unbound target claim generation');
  } else if (source.length || target.some(row => row.scope.kind !== 'recovery-claim')) throw new TypeError('Reservation may only append a target claim fence');
}
export type DecodeFailure = { kind: 'scope' | 'schema' | 'corrupt' };
export type DomainDecode<T> = DecodeFailure | { kind: 'readable'; value: T };
/** Enumerating a pending fence must not require a canonical head. Malformed
 * rows in this owner's claim namespace fail closed; other namespaces are ignored. */
export function decodeClaimHeadRow(key: unknown, raw: unknown, ownerId: string | null): DomainDecode<{ key: string; raw: unknown } | null> {
  if (!owner(ownerId)) return { kind: 'scope' };
  if (typeof key !== 'string') return { kind: 'schema' };
  let tuple: unknown;
  try { tuple = JSON.parse(key); }
  catch {
    const prefix = JSON.stringify(['entry', ownerId, 'recovery-claim']).slice(0,-1);
    return key.startsWith(prefix) ? { kind: 'schema' } : { kind: 'readable', value: null };
  }
  if (!Array.isArray(tuple) || tuple[0] !== 'entry' || tuple[1] !== ownerId || tuple[2] !== 'recovery-claim') return { kind: 'readable', value: null };
  if (tuple.length !== 4 || !text(tuple[3])) return { kind: 'schema' };
  const head = decodeEntryHead(raw, { ownerId, kind: 'recovery-claim', tripId: tuple[3] });
  if(key!==entryHeadKey({ownerId,kind:'recovery-claim',tripId:tuple[3]}))return {kind:'schema'};
  if (head.kind !== 'readable') return head;
  return head.value ? { kind: 'readable', value: { key, raw } } : { kind: 'corrupt' };
}
export function decodeDomainHead(raw: unknown, scope: RecoveryScope): DomainDecode<RecoveryHandle | null> {
  if (raw === undefined) return { kind: 'readable', value: null };
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (record(value) && value.version !== 1) return { kind: 'schema' };
    if (!isDomainHandle(value)) return { kind: 'corrupt' };
    return sameRecoveryScope(value, scope) ? { kind: 'readable', value } : { kind: 'scope' };
  } catch { return { kind: 'corrupt' }; }
}
export function decodeDomainCurrent(raw: unknown, ownerId: string | null): DomainDecode<RecoveryCurrent | null> {
  if (raw === undefined) return { kind: 'readable', value: null };
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!record(value)) return { kind: 'corrupt' };
    if(value.backend==='cleared') {
      if(value.version!==1)return {kind:'schema'};
      if(!keys(value,['version','backend','ownerId','nativePointerRaw'])||!owner(value.ownerId)||!(value.nativePointerRaw===null||typeof value.nativePointerRaw==='string'))return {kind:'corrupt'};
      return value.ownerId===ownerId?{kind:'readable',value:value as ClearedRecoveryPointer}:{kind:'scope'};
    }
    if(typeof value.tripId!=='string')return {kind:'corrupt'};
    if (value.backend === 'local-storage') {
      if (value.version !== 1) return { kind: 'schema' };
      if (!isRecoveryScope(value) || !keys(value, ['version','backend','source','ownerId','tripId','writeId','nativePointerRaw','documentDigest'])
        || !(value.source === 'recovery' && text(value.writeId) || value.source === 'cache' && value.writeId === null)
        || typeof value.nativePointerRaw !== 'string' || typeof value.documentDigest !== 'string'
        || !/^[a-f0-9]{64}$/.test(value.documentDigest)) return { kind: 'corrupt' };
      return value.ownerId === ownerId ? { kind: 'readable', value: value as NativeRecoveryPointer } : { kind: 'scope' };
    }
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
  if (value.key === EASYT_ACTIVE_TRIP_KEY) {
    const source = decodeRecoverySource({ key: value.key, raw: value.raw }, scope);
    return source.kind === 'readable' ? { kind: 'readable', value: { key: value.key, raw: value.raw } } : source;
  }
  const recovery = decodeRawRecovery(value.raw, scope); if (recovery.kind !== 'readable') return recovery;
  const base = tripRecoveryStorageKey(scope.ownerId, scope.tripId);
  if (value.key !== base && value.key !== tripRecoveryStorageKey(scope.ownerId, scope.tripId, recovery.value.writeId)) return { kind: 'scope' };
  return { kind: 'readable', value: { key: value.key, raw: value.raw } };
}
/** The retained v1 body is addressed explicitly and never rewritten during read. */
export function decodeRecoverySource(source: LegacyRecoverySource, scope: RecoveryScope): DomainDecode<TripRecoveryRecord> {
  if (source.key !== EASYT_ACTIVE_TRIP_KEY) return decodeRawRecovery(source.raw, scope);
  try {
    const decoded = readTripDocument(JSON.parse(source.raw));
    if (decoded.kind !== 'readable') return { kind: decoded.kind === 'unsupported' ? 'schema' : 'corrupt' };
    if (decoded.trip.id !== scope.tripId || decoded.trip.ownerId !== null && decoded.trip.ownerId !== scope.ownerId) return { kind: 'scope' };
    return { kind: 'readable', value: { version: 2, ...scope, writeId: 'legacy-source', trip: decoded.trip, savedAt: decoded.trip.updatedAt, state: 'pending' } };
  } catch { return { kind: 'corrupt' }; }
}
export function decodeRecoveryEnvelope(raw: unknown, scope: RecoveryScope): DomainDecode<RecoveryEnvelope> {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!record(value)) return { kind: 'corrupt' };
    if (value.version !== 1) return { kind: 'schema' };
    if (!keys(value, ['version', 'handle', 'parent', 'rawRecovery', 'legacySources', 'entry']) || !isDomainHandle(value.handle)
      || !(value.parent === null || isDomainHandle(value.parent)) || !Array.isArray(value.legacySources)
      || !record(value.entry) || !keys(value.entry, ['pointer', 'input', 'receipt', ...('nativePointerRaw' in value.entry ? ['nativePointerRaw'] : []), ...('claim' in value.entry ? ['claim'] : [])])
      || 'nativePointerRaw' in value.entry && value.entry.nativePointerRaw !== null && typeof value.entry.nativePointerRaw !== 'string'
      || !isDomainHandle(value.entry.pointer)) return { kind: 'corrupt' };
    const handle = value.handle;
    if ('claim' in value.entry) {
      const claim = value.entry.claim;
      if (!record(claim) || !keys(claim, ['source', 'claimId']) || !isDomainHandle(claim.source)
        || claim.source.ownerId !== null || claim.source.tripId !== handle.tripId || handle.ownerId === null || !text(claim.claimId)) return { kind: 'scope' };
    }
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
