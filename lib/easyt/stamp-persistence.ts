import type { StampStatus, StampStatusRecord } from "./stamps.ts";

export type StampTextRecord = Record<string, string>;
export type StampRecords = { statuses: StampStatusRecord; memories: StampTextRecord; photos: StampTextRecord };
export type StampDirtyRecords = { statuses: string[]; memories: string[]; photos: string[] };

export const emptyStampDirtyRecords = (): StampDirtyRecords => ({ statuses: [], memories: [], photos: [] });

const unique = (values: string[]) => [...new Set(values)];

export function markStampDirty(dirty: StampDirtyRecords, field: keyof StampDirtyRecords, countryId: string): StampDirtyRecords {
  return { ...dirty, [field]: unique([...dirty[field], countryId]) };
}

/** Retain unsynced browser-authored fields while replacing clean cache with verified cloud state. */
export function mergeRemoteStamps(remote: StampRecords, local: StampRecords, dirty: StampDirtyRecords): StampRecords {
  const merge = (field: keyof StampDirtyRecords, remoteValues: Record<string, string>, localValues: Record<string, string>) => {
    const next: Record<string, string> = { ...remoteValues };
    for (const countryId of dirty[field]) {
      if (countryId in localValues) next[countryId] = localValues[countryId];
      else delete next[countryId];
    }
    return next;
  };
  return {
    statuses: merge("statuses", remote.statuses, local.statuses) as StampStatusRecord,
    memories: merge("memories", remote.memories, local.memories),
    photos: merge("photos", remote.photos, local.photos),
  };
}

/** Guest content only fills empty account fields after the traveller explicitly opts in. */
export function mergeGuestStamps(remote: StampRecords, guest: StampRecords): StampRecords {
  const fill = (account: Record<string, string>, local: Record<string, string>) => {
    const next: Record<string, string> = { ...account };
    for (const [countryId, value] of Object.entries(local)) if (!(countryId in next)) next[countryId] = value;
    return next;
  };
  return { statuses: fill(remote.statuses, guest.statuses) as StampStatusRecord, memories: fill(remote.memories, guest.memories), photos: fill(remote.photos, guest.photos) };
}

export function stampRecordHasContent(records: StampRecords) {
  return Boolean(Object.keys(records.statuses).length || Object.keys(records.memories).length || Object.keys(records.photos).length);
}

export function clearSyncedStampDirty(dirty: StampDirtyRecords, successful: Partial<StampDirtyRecords>): StampDirtyRecords {
  const clear = (field: keyof StampDirtyRecords) => new Set(successful[field] ?? []);
  return {
    statuses: dirty.statuses.filter((id) => !clear("statuses").has(id)),
    memories: dirty.memories.filter((id) => !clear("memories").has(id)),
    photos: dirty.photos.filter((id) => !clear("photos").has(id)),
  };
}
