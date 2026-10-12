import { prepareTripDocumentForWrite } from '../../lib/easyt/trip-document.ts';
import { canonicalRouteFixture } from '../fixtures/batch14-route-documents.ts';
import type { RecoveryEnvelope, RecoveryHandle } from '../../lib/easyt/durable-recovery-store.ts';

export function envelope(writeId = 'write-1', ownerId: string | null = 'owner-a', parent: RecoveryHandle | null = null): RecoveryEnvelope {
  const trip = prepareTripDocumentForWrite({ ...canonicalRouteFixture(), id: 'synthetic-trip', ownerId, title: writeId });
  const handle: RecoveryHandle = { version: 1, backend: 'indexeddb', ownerId, tripId: trip.id, writeId };
  return { version: 1, handle, parent, legacySources: [],
    rawRecovery: JSON.stringify({ version: 2, ownerId, tripId: trip.id, writeId, trip, state: 'pending', savedAt: '2026-10-12T00:00:00.000Z' }),
    entry: { pointer: { ...handle }, input: { ownerId, tripId: trip.id, inputRevision: 3, raw: 'raw typed input, including whitespace  ' },
      receipt: { ownerId, tripId: trip.id, operationId: 'synthetic-intake', raw: 'frozen receipt bytes' } } };
}
export const rawEnvelope = (value: RecoveryEnvelope) => JSON.stringify(value);
export function canonicalAck(value: RecoveryEnvelope) {
  const trip = JSON.parse(value.rawRecovery).trip;
  return JSON.stringify({ ...trip, updatedAt: '2026-10-12T00:01:00.000Z' });
}
