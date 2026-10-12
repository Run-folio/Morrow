import { decodeLegacySource, decodeRecoverySource, decodeRecoveryEnvelope, isRecoveryScope,
  type LegacyRecoverySource, type RecoveryEnvelope, type RecoveryReadResult, type RecoveryScope } from './durable-recovery-domain.ts';

export type LegacyRecoverySnapshot = { kind: 'ready' | 'unavailable'; copies: LegacyRecoverySource[] };
export type RecoveryProvenanceInput = { scope: RecoveryScope; legacy: LegacyRecoverySnapshot; domain: RecoveryReadResult };
export type RecoveryResolution = {
  kind: 'not-ready' | 'protected-conflict' | 'empty' | 'local-storage' | 'indexeddb';
  reason?: 'scope' | 'corrupt' | 'schema' | 'divergence' | 'ambiguous-legacy' | 'missing-provenance';
  preserved: { legacy: LegacyRecoverySource[]; domain: RecoveryEnvelope | null };
  source?: LegacyRecoverySource;
  envelope?: RecoveryEnvelope;
};
export function resolveRecoveryProvenance(input: RecoveryProvenanceInput): RecoveryResolution {
  const preserved = { legacy: input.legacy.copies.map(copy => ({ ...copy })), domain: input.domain.kind === 'ready' ? input.domain.envelope : null };
  const protectedResult = (reason: NonNullable<RecoveryResolution['reason']>): RecoveryResolution => ({ kind: 'protected-conflict', reason, preserved });
  if (!isRecoveryScope(input.scope)) return protectedResult('scope');
  // A failed store read is not an authoritative absence, even if LS is usable.
  if (input.legacy.kind !== 'ready' || input.domain.kind !== 'ready') return { kind: 'not-ready', preserved };
  const observed = new Map<string, string>();
  for (const source of preserved.legacy) {
    const decoded = decodeLegacySource(source, input.scope);
    if (decoded.kind !== 'readable') return protectedResult(decoded.kind);
    if (observed.has(source.key)) return protectedResult('ambiguous-legacy');
    observed.set(source.key, source.raw);
  }
  if (preserved.domain === null) {
    if (preserved.legacy.length === 0) return { kind: 'empty', preserved };
    // Multiple physical generations need explicit ancestry, not guessed recency.
    const canonicalCopies = preserved.legacy.filter(source => source.key !== 'easyt:active-trip:v1');
    const first = canonicalCopies[0] ?? preserved.legacy[0];
    const decoded = decodeRecoverySource(first, input.scope);
    const legacyAncestor = decoded.kind === 'readable' ? decoded.value.legacySourceRaw : undefined;
    if (preserved.legacy.some(source => source.raw !== first.raw && !(source.key === 'easyt:active-trip:v1' && source.raw === legacyAncestor))) return protectedResult('ambiguous-legacy');
    return { kind: 'local-storage', source: { ...first }, preserved };
  }
  let decoded;
  try { decoded = decodeRecoveryEnvelope(JSON.stringify(preserved.domain), input.scope); }
  catch { return protectedResult('corrupt'); }
  if (decoded.kind !== 'readable') return protectedResult(decoded.kind);
  const candidate = decoded.value;
  const baseline = new Map(candidate.legacySources.map(source => [source.key, source.raw]));
  for (const [key, raw] of baseline) {
    if (!observed.has(key)) return protectedResult('missing-provenance');
    if (observed.get(key) !== raw) return protectedResult('divergence');
  }
  for (const [key, raw] of observed) {
    if (baseline.get(key) === raw) continue;
    // Exact same-generation mirror is not new ancestry and does not acknowledge
    // a pointer/receipt. The selected domain retains its own bound metadata.
    const copy = decodeLegacySource({ key, raw }, input.scope);
    if (copy.kind !== 'readable' || raw !== candidate.rawRecovery) return protectedResult('divergence');
  }
  return { kind: 'indexeddb', envelope: candidate, preserved };
}
