import { confirmedAttractionVisitSelection, isConfirmedAttractionVisitSelection } from "./place-intelligence.ts";
import type { DiscoveryReadyChoice } from './discovery-confirmation.ts';
import type { DiscoveryReview, DiscoveryVisit } from './discovery-review.ts';
import type { EasyTTrip } from './trip.ts';

export type DiscoveryCommitPorts = {
  currentTrip(): EasyTTrip;
  /** Existing Builder Add owner: create/reuse the stop AND ensure its mention selection. */
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
      const hasSelection = () => ports.currentTrip().brief.structuredBrief?.placeSelections?.some(selection =>
        selection.mentionId === review.mentionId && selection.selectedCanonicalPlaceId === base.id
        && ports.currentTrip().stops.some(stop => stop.id === selection.routeStopId && stop.canonicalPlaceId === base.id)
        && (selection.kind === "base" || selection.kind === "visit"));
      // Add also owns mention-to-stop selection. An existing occurrence alone
      // must not resolve a planning parent or count as durable progress.
      if (matches.length > 1 || (!hasSelection() && !await ports.addBase(base))) return result(false);
      if (!hasSelection() || !await ports.persist()) return result(false);
      committedIds.push(base.id);
    }
    for (const visit of review.visits) {
      const trip = ports.currentTrip();
      const stop = trip.stops.find(item => item.canonicalPlaceId === visit.baseId);
      if (!stop) return result(false);
      const expected = confirmedAttractionVisitSelection({ mentionId: visit.intentId, canonicalName: visit.name }, visit.proposal,
        { routeStopId: stop.id, canonicalPlaceId: stop.canonicalPlaceId, name: stop.name, country: stop.country });
      const isConfirmed = () => ports.currentTrip().brief.structuredBrief?.placeSelections?.some(selection =>
        isConfirmedAttractionVisitSelection(selection, expected));
      if (!isConfirmed() && !await ports.linkVisit(visit, stop.id)) return result(false);
      if (!isConfirmed() || !await ports.persist()) return result(false);
      committedIds.push(visit.intentId);
    }
    return result(await ports.completeMention());
  } catch { return result(false); }
}

/** Completion uses the same render/mutation and persistence owners as the actions.
 * Restore only completion fields on false/throw; durable stop/visit progress remains. */
export async function completeDiscoveryMention(ports: {
  stage(): void;
  rollback(): void;
  persist(): Promise<boolean>;
}): Promise<boolean> {
  let stored = false;
  try {
    ports.stage();
    stored = await ports.persist();
    return stored;
  } catch { return false; }
  finally { if (!stored) ports.rollback(); }
}
