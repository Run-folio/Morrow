import type { DiscoveryReadyChoice } from './discovery-confirmation.ts';
import type { DiscoveryReview, DiscoveryVisit } from './discovery-review.ts';
import type { EasyTTrip } from './trip.ts';

export type DiscoveryCommitPorts = {
  currentTrip(): EasyTTrip;
  addBase(choice: DiscoveryReadyChoice): Promise<boolean>;
  linkVisit(visit: DiscoveryVisit, stopId: string): Promise<boolean>;
  /** Must durably persist the latest rendered canonical document, including selections. */
  persist(): Promise<boolean>;
  /** Persist completion before closing the mention. */
  completeMention(): Promise<boolean>;
};
/** No private progress ledger: canonical stops and PlaceSelections survive reload/retry. */
export async function commitDiscoveryReview(review: DiscoveryReview, ports: DiscoveryCommitPorts) {
  const ids = [...review.bases.map(base => base.id), ...review.visits.map(visit => visit.intentId)];
  const committedIds: string[] = [];
  const result = (ok: boolean) => ({ ok, committedIds, pendingIds: ids.filter(id => !committedIds.includes(id)) });
  if (!review.canConfirm) return result(false);
  try {
    for (const base of review.bases) {
      const matches = ports.currentTrip().stops.filter(stop => stop.canonicalPlaceId === base.id);
      if (matches.length > 1 || (!matches.length && !await ports.addBase(base))) return result(false);
      if (!ports.currentTrip().stops.some(stop => stop.canonicalPlaceId === base.id) || !await ports.persist()) return result(false);
      committedIds.push(base.id);
    }
    for (const visit of review.visits) {
      const trip = ports.currentTrip();
      const stop = trip.stops.find(item => item.canonicalPlaceId === visit.baseId);
      if (!stop) return result(false);
      const linked = trip.brief.structuredBrief?.placeSelections?.some(selection => selection.mentionId === visit.intentId
        && selection.kind === 'visit' && selection.routeStopId === stop.id);
      if (!linked && !await ports.linkVisit(visit, stop.id)) return result(false);
      if (!await ports.persist()) return result(false);
      committedIds.push(visit.intentId);
    }
    return result(await ports.completeMention());
  } catch { return result(false); }
}
