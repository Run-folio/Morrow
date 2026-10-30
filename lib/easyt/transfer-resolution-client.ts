import type { TripLeg } from './trip.ts';
import type { TransferAssessment } from './planning-evidence-state.ts';
import { transferAssessmentForLeg } from './planning-evidence-presentation.ts';
import { preservedTransferFacts } from './geographic-binding.ts';
import { authoredContentKey } from './trip-retained-authored-content.ts';

// Contract-tested against the API guard and its independent resolver limit.
const MAX_LEGS = 8;
const MAX_BODY_BYTES = 100_000;

export type TransferResolutionClientResult =
  | { ok: false; reason: 'invalid-input' }
  | { ok: true; legs: TripLeg[]; assessments: TransferAssessment[]; failedLegIds: string[] };

/** A request may settle without a usable result. Never complete work for an
 * uncompleted assessment or a result belonging to different endpoint inputs. */
export function completedTransferResolutionLeg(expected: TripLeg, payload: TransferResolutionClientResult): TripLeg | undefined {
  if (!payload.ok || payload.failedLegIds.includes(expected.id)) return undefined;
  const assessment = transferAssessmentForLeg(payload.assessments, expected.id);
  const matches = payload.legs.filter(leg => leg.id === expected.id);
  const leg = matches[0];
  if (matches.length !== 1 || leg.fromStopId !== expected.fromStopId || leg.toStopId !== expected.toStopId
    || authoredContentKey(leg.fromEndpoint) !== authoredContentKey(expected.fromEndpoint)
    || authoredContentKey(leg.toEndpoint) !== authoredContentKey(expected.toEndpoint)) return undefined;
  // The resolver can preserve existing authored or already-resolved transport
  // without a new lookup. Require the whole input back unchanged; unknown new
  // planning work and an explicitly failed/unattempted request remain failures.
  const retainedInput = preservedTransferFacts(expected) || expected.mode !== 'unknown'
    || expected.routeMetadata.source === 'spreadsheet-import-unconfirmed' && expected.routeMetadata.roadFallbackEligible === false;
  const preserved = assessment?.retrieval === 'not-attempted' && assessment.reason === undefined
    && retainedInput && authoredContentKey(leg) === authoredContentKey(expected);
  return assessment?.retrieval === 'completed' || preserved ? leg : undefined;
}

function exactIds(values: unknown, ids: readonly string[], field: string): values is Record<string, unknown>[] {
  if (!Array.isArray(values) || values.length !== ids.length) return false;
  const found = values.map(value => value && typeof value === 'object' ? value[field] : undefined);
  return new Set(found).size === ids.length && found.every(id => typeof id === 'string' && ids.includes(id));
}

/** One immutable, single-pass operation. Owns HTTP envelopes, never canonical adoption. */
export async function requestCanonicalTransferResolution(
  input: readonly TripLeg[], signal: AbortSignal,
): Promise<TransferResolutionClientResult> {
  signal.throwIfAborted();
  if (input.some(leg => !leg || typeof leg.id !== 'string' || !leg.id.length)
    || new Set(input.map(leg => leg.id)).size !== input.length) return { ok: false, reason: 'invalid-input' };

  const encoder = new TextEncoder();
  let snapshot: TripLeg[], encoded: string[];
  try {
    snapshot = structuredClone(input) as TripLeg[];
    encoded = snapshot.map(leg => JSON.stringify(leg));
  } catch { return { ok: false, reason: 'invalid-input' }; }
  const batches: { legs: TripLeg[]; body: string }[] = [];
  const failed = new Set<string>();
  const envelopeBytes = encoder.encode('{"legs":[]}').byteLength;
  let members: TripLeg[] = [], parts: string[] = [], bytes = envelopeBytes;
  const flush = () => {
    if (members.length) batches.push({ legs: members, body: '{"legs":[' + parts.join(',') + ']}' });
    members = []; parts = []; bytes = envelopeBytes;
  };
  for (const [index, leg] of snapshot.entries()) {
    const body = encoded[index]!, size = encoder.encode(body).byteLength;
    if (size + envelopeBytes > MAX_BODY_BYTES) { failed.add(leg.id); continue; }
    if (members.length === MAX_LEGS || bytes + size + (members.length ? 1 : 0) > MAX_BODY_BYTES) flush();
    bytes += size + (members.length ? 1 : 0);
    members.push(leg); parts.push(body);
  }
  flush();

  const returned = new Map<string, TripLeg>(), assessments: TransferAssessment[] = [];
  for (const batch of batches) {
    signal.throwIfAborted();
    try {
      const response = await fetch('/api/journey-transfer-resolution', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: batch.body, cache: 'no-store', signal,
      });
      signal.throwIfAborted();
      if (!response.ok) throw new Error('Transfer assessment unavailable');
      const payload: unknown = await response.json();
      signal.throwIfAborted();
      const value = payload as { legs?: unknown; assessments?: unknown } | null;
      const ids = batch.legs.map(leg => leg.id);
      if (!value || !exactIds(value.legs, ids, 'id') || !exactIds(value.assessments, ids, 'legId')
        || !ids.every(id => transferAssessmentForLeg(value.assessments, id))) throw new Error('Invalid transfer assessment');
      for (const id of ids) {
        returned.set(id, value.legs.find(leg => leg.id === id) as unknown as TripLeg);
        assessments.push({ legId: id, state: transferAssessmentForLeg(value.assessments, id)! });
      }
    } catch (error) {
      signal.throwIfAborted();
      for (const leg of batch.legs) failed.add(leg.id);
    }
  }
  signal.throwIfAborted();
  return { ok: true, legs: snapshot.map(leg => returned.get(leg.id) ?? leg), assessments,
    failedLegIds: snapshot.filter(leg => failed.has(leg.id)).map(leg => leg.id) };
}
