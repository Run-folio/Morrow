import type { EasyTTrip } from "./trip";
import type { TripRecoveryHandle } from "./storage";

type PersistTripMutation = (trip: EasyTTrip, recovery: TripRecoveryHandle) => Promise<EasyTTrip>;

function sameTripDocument(left: EasyTTrip, right: EasyTTrip) {
  return left.id === right.id && left.ownerId === right.ownerId;
}

/**
 * Serialize edits made by one open trip document. Each queued edit keeps its
 * authored body, but uses the revision returned by the preceding successful
 * account write as its compare-and-swap token. A different tab still submits
 * its own stale token and is rejected by the repository as before.
 */
export function createTripMutationPersistenceQueue(persist: PersistTripMutation) {
  let tail: Promise<EasyTTrip | null> = Promise.resolve(null);

  return {
    enqueue(trip: EasyTTrip, recovery: TripRecoveryHandle) {
      const request = tail.then((latestCanonical) => persist(
        latestCanonical && sameTripDocument(latestCanonical, trip)
          ? { ...trip, updatedAt: latestCanonical.updatedAt }
          : trip,
        recovery,
      ));
      tail = request.catch(() => null);
      return request;
    },
    reset(canonicalTrip: EasyTTrip | null = null) {
      tail = Promise.resolve(canonicalTrip);
    },
  };
}
