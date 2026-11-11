import type { LaunchAnalyticsEventMap } from '../analytics.ts';
import type { TripBuildSaveAcknowledgement } from './storage.ts';
import type { EasyTTrip } from './trip.ts';

/** Optional measurement only: never author persistence, retain content or affect ACK delivery. */
export function createBuilderSaveAcknowledgementTracker(dependencies: {
  hasConsent: () => boolean;
  emit: (properties: LaunchAnalyticsEventMap['trip_save_acknowledged']) => void;
}) {
  // Mount-local deduplication; no analytics keys are written to device storage.
  const recorded = new Set<string>();
  return (ack: Pick<TripBuildSaveAcknowledgement, 'accountAcknowledged' | 'outcome'>,
    trip: Pick<EasyTTrip, 'id' | 'ownerId' | 'updatedAt'>,
    scope: { ownerId: string | null; isCurrent: boolean }) => {
    try {
      if (ack.accountAcknowledged !== true || ack.outcome === 'invalid-canonical'
        || !scope.isCurrent || !trip.ownerId || trip.ownerId !== scope.ownerId || !dependencies.hasConsent()) return;
      const key = JSON.stringify([trip.ownerId, trip.id, trip.updatedAt]);
      if (recorded.has(key)) return;
      recorded.add(key);
      dependencies.emit({ trip_id: trip.id, trip_source: 'builder' });
    } catch { /* Vendor or consent failures must not affect the acknowledged save. */ }
  };
}
