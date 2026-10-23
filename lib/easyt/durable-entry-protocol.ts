/** Scoped opaque bytes. App adapters must validate the existing input/receipt
 * codecs before interpreting payloads; storage retention is not receipt ACK. */
export type RecoveryEntryScope = { ownerId: string | null; kind: 'homepage' | 'builder-input' | 'trip-receipt' | 'recovery-lifecycle' | 'recovery-claim' | 'browser-owner'; tripId: string | null };
export type RecoveryEntryHandle = RecoveryEntryScope & { version: 1; backend: 'indexeddb-entry'; writeId: string };
export type RecoveryEntryEnvelope = { version: 1; handle: RecoveryEntryHandle; parent: RecoveryEntryHandle | null;
  raw: string | null; legacyRaw: string | null; retainedPreviousRaw: string | null };
export type RecoveryEntryRequest = { scope: RecoveryEntryScope; writeId: string | null };
export type RecoveryEntryState = { headRaw: unknown; headGenerationRaw: unknown; generationRaw: unknown };
export type RecoveryEntryMutation = { scope: RecoveryEntryScope; writeId: string; raw: string; headRaw: string };
export type RecoveryEntryWrite = { raw: string; expectedHead: RecoveryEntryHandle | null; admission: 'native-setter-quota' | 'existing-domain' };
export type EntryDecode<T> = { kind: 'readable'; value: T } | { kind: 'scope' | 'corrupt' | 'schema' };

const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
export const entryHeadKey = (s: RecoveryEntryScope) => JSON.stringify(['entry', s.ownerId, s.kind, s.tripId]);
export const entryGenerationKey = (s: RecoveryEntryScope, writeId: string) => JSON.stringify(['entry', s.ownerId, s.kind, s.tripId, writeId]);
export const sameEntryScope = (a: RecoveryEntryScope, b: RecoveryEntryScope) => a.ownerId === b.ownerId && a.kind === b.kind && a.tripId === b.tripId;
export const sameEntryHandle = (a: RecoveryEntryHandle | null, b: RecoveryEntryHandle | null) => a === null || b === null ? a === b : sameEntryScope(a, b) && a.writeId === b.writeId;
export function isEntryScope(v: unknown): v is Record<string, unknown> & RecoveryEntryScope {
  return object(v) && (v.ownerId === null || text(v.ownerId))
    && (v.kind === 'browser-owner' ? v.tripId === null && v.ownerId === null : v.kind === 'homepage' ? v.tripId === null : (v.kind === 'builder-input'||v.kind==='trip-receipt'||v.kind==='recovery-lifecycle'||v.kind==='recovery-claim') && text(v.tripId));
}
export function isEntryHandle(v: unknown): v is RecoveryEntryHandle {
  return isEntryScope(v) && v.version === 1 && v.backend === 'indexeddb-entry' && text(v.writeId)
    && Object.keys(v).sort().join(',') === 'backend,kind,ownerId,tripId,version,writeId';
}
export function decodeEntryHead(raw: unknown, scope: RecoveryEntryScope): EntryDecode<RecoveryEntryHandle | null> {
  if (raw === undefined) return { kind: 'readable', value: null };
  try {
    const v: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (object(v) && v.version !== 1) return { kind: 'schema' };
    if (!isEntryHandle(v)) return { kind: 'corrupt' };
    return sameEntryScope(v, scope) ? { kind: 'readable', value: v } : { kind: 'scope' };
  } catch { return { kind: 'corrupt' }; }
}
export function decodeEntryEnvelope(raw: unknown, scope: RecoveryEntryScope): EntryDecode<RecoveryEntryEnvelope> {
  try {
    const v: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!object(v)) return { kind: 'corrupt' };
    if (v.version !== 1) return { kind: 'schema' };
    if (Object.keys(v).sort().join(',') !== 'handle,legacyRaw,parent,raw,retainedPreviousRaw,version' || !isEntryHandle(v.handle)
      || !(v.parent === null || isEntryHandle(v.parent)) || ![v.raw, v.legacyRaw, v.retainedPreviousRaw].every(x => x === null || typeof x === 'string')) return { kind: 'corrupt' };
    if (!sameEntryScope(v.handle, scope) || v.parent !== null && (!sameEntryScope(v.parent as RecoveryEntryHandle, scope)
      || (v.parent as RecoveryEntryHandle).writeId === v.handle.writeId)) return { kind: 'scope' };
    return { kind: 'readable', value: v as RecoveryEntryEnvelope };
  } catch { return { kind: 'corrupt' }; }
}
