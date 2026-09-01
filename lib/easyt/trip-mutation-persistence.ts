import type { EasyTTrip } from "./trip";
import type { TripRecoveryHandle } from "./storage";

type PersistTripMutation = (trip: EasyTTrip, recovery: TripRecoveryHandle) => Promise<EasyTTrip>;

type JsonObject = Record<string, unknown>;

function sameTripDocument(left: EasyTTrip, right: EasyTTrip) {
  return left.id === right.id && left.ownerId === right.ownerId;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function keyedArray(items: unknown[]): items is Array<JsonObject & { id: string }> {
  return items.every((item) => isObject(item) && typeof item.id === "string");
}

/**
 * Merge one editor's authored document onto the latest acknowledged canonical
 * document using the exact canonical revision that the edit was based on.
 *
 * This is deliberately a three-way merge rather than an `updatedAt` rewrite:
 * unchanged paths inherit the preceding save, authored paths keep the latest
 * local value, and stable-ID arrays retain independent additions. A revision
 * that is not known to this queue is never rebased and must reach repository
 * CAS unchanged.
 */
function mergeAuthoredDocument(base: unknown, authored: unknown, canonical: unknown): unknown {
  if (jsonEqual(authored, base)) return structuredClone(canonical);
  if (jsonEqual(canonical, base) || jsonEqual(authored, canonical)) return structuredClone(authored);

  if (Array.isArray(base) && Array.isArray(authored) && Array.isArray(canonical)) {
    if (keyedArray(base) && keyedArray(authored) && keyedArray(canonical)) {
      const baseById = new Map(base.map((item) => [item.id, item]));
      const authoredById = new Map(authored.map((item) => [item.id, item]));
      const canonicalById = new Map(canonical.map((item) => [item.id, item]));
      const removedIds = new Set(base.filter((item) => !authoredById.has(item.id)).map((item) => item.id));
      const order = [
        ...authored.map((item) => item.id),
        ...canonical.map((item) => item.id).filter((id) => !authoredById.has(id) && !removedIds.has(id)),
      ];
      return order.map((id) => {
        const authoredItem = authoredById.get(id);
        const canonicalItem = canonicalById.get(id);
        const baseItem = baseById.get(id);
        if (!authoredItem) return structuredClone(canonicalItem);
        if (!baseItem || !canonicalItem) return structuredClone(authoredItem);
        return mergeAuthoredDocument(baseItem, authoredItem, canonicalItem);
      });
    }

    const removed = base.filter((item) => !authored.some((candidate) => jsonEqual(candidate, item)));
    const additions = authored.filter((item) => !base.some((candidate) => jsonEqual(candidate, item)));
    return [
      ...canonical.filter((item) => !removed.some((candidate) => jsonEqual(candidate, item))),
      ...additions.filter((item) => !canonical.some((candidate) => jsonEqual(candidate, item))),
    ].map((item) => structuredClone(item));
  }

  if (isObject(base) && isObject(authored) && isObject(canonical)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(authored), ...Object.keys(canonical)]);
    const merged: JsonObject = {};
    for (const key of keys) {
      if (!(key in authored) && key in base) continue;
      if (!(key in authored)) {
        merged[key] = structuredClone(canonical[key]);
        continue;
      }
      merged[key] = mergeAuthoredDocument(base[key], authored[key], canonical[key]);
    }
    return merged;
  }

  return structuredClone(authored);
}

/**
 * Serialize edits made by one open trip document. Each queued edit is rebased
 * from its known canonical revision onto the preceding successful account
 * write without replacing unrelated fields. A different tab (or an unknown
 * revision) still submits its own stale token and is rejected by repository
 * CAS as before.
 */
export function createTripMutationPersistenceQueue(persist: PersistTripMutation) {
  let tail: Promise<EasyTTrip | null> = Promise.resolve(null);
  let generation = 0;
  const canonicalByRevision = new Map<string, EasyTTrip>();

  return {
    enqueue(trip: EasyTTrip, recovery: TripRecoveryHandle) {
      const requestGeneration = generation;
      const authored = structuredClone(trip);
      const authoredBase = canonicalByRevision.get(authored.updatedAt);
      const request = tail.then(async (latestCanonical) => {
        const canRebase = authoredBase
          && latestCanonical
          && sameTripDocument(authoredBase, authored)
          && sameTripDocument(latestCanonical, authored);
        const submitted = canRebase
          ? mergeAuthoredDocument(authoredBase, authored, latestCanonical) as EasyTTrip
          : authored;
        if (canRebase) submitted.updatedAt = latestCanonical.updatedAt;
        const saved = await persist(submitted, recovery);
        if (requestGeneration === generation) canonicalByRevision.set(saved.updatedAt, structuredClone(saved));
        return saved;
      });
      tail = request.catch(() => null);
      return request;
    },
    reset(canonicalTrip: EasyTTrip | null = null) {
      generation += 1;
      canonicalByRevision.clear();
      if (canonicalTrip) canonicalByRevision.set(canonicalTrip.updatedAt, structuredClone(canonicalTrip));
      tail = Promise.resolve(canonicalTrip);
    },
  };
}
