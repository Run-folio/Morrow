import { isEasyTTrip, tripIntentForTrip, type EasyTTrip } from "./trip.ts";
import {
  canonicalTripRevisionCanReplace,
  EasyTTripSaveConflictError,
  requestTripUpdate,
  tripSyncAuthError,
  type TripSaveConflictReason,
} from "./trip-continuity.ts";
import {
  canonicalTripForOwner,
  requestTripPromotion,
  tripBuildDocumentsCanonicalEquivalent,
  type TripPromotionConflictReason,
} from "./trip-promotion.ts";
import {
  EasyTTripPersistenceError,
  tripPersistenceFailureCategory,
  type TripPersistenceOperation,
} from "./trip-persistence-error.ts";

export { EasyTTripSaveConflictError } from "./trip-continuity.ts";
export { EasyTTripAuthError } from "./trip-continuity.ts";

/**
 * The v1 slot mixed canonical cloud data with unsynced edits. Keep the key only
 * for copy-first migration; new code must never write or implicitly clear it.
 */
export const EASYT_ACTIVE_TRIP_KEY = "easyt:active-trip:v1";
export const EASYT_ACTIVE_TRIP_CHANGE_EVENT = "easyt-active-trip-change";
export const EASYT_TRIP_STORAGE_CHANGE_EVENT = "easyt-trip-storage-change";
export const EASYT_BEFORE_NEW_TRIP_EVENT = "easyt-before-new-trip";
export const EASYT_LAST_OWNER_CHANGE_EVENT = "easyt-last-owner-change";
export const EASYT_TRIP_CACHE_PREFIX = "easyt:trip-cache:v2:";
export const EASYT_TRIP_RECOVERY_PREFIX = "easyt:trip-recovery:v2:";
export const EASYT_CURRENT_TRIP_PREFIX = "easyt:current-trip:v2:";
export const EASYT_LAST_OWNER_KEY = "easyt:last-owner:v1";
const LEGACY_JOURNEY_PLAN_KEY = "journey:planned-trip";

export type TripRecoveryState = "pending" | "network" | "auth" | "conflict" | "validation" | "repository" | "unknown";
export type TripRecoveryConflictReason = TripSaveConflictReason | TripPromotionConflictReason;

export type EasyTBrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export type TripRecoveryRecord = {
  version: 2;
  ownerId: string | null;
  tripId: string;
  trip: EasyTTrip;
  state: TripRecoveryState;
  conflictReason?: TripRecoveryConflictReason;
  writeId: string;
  savedAt: string;
};

export type TripRecoveryHandle = Pick<TripRecoveryRecord, "ownerId" | "tripId" | "writeId">;

export type TripRecoveryWriteResult = {
  stored: boolean;
  handle: TripRecoveryHandle;
  blockedByExistingRecovery: boolean;
};

export function shouldAllowNewTripNavigation(result: Pick<TripRecoveryWriteResult, "stored">) {
  return result.stored;
}

export function requestNewTripNavigation(target?: Pick<EventTarget, "dispatchEvent">) {
  const eventTarget = target ?? (typeof window !== "undefined" ? window : null);
  return eventTarget
    ? eventTarget.dispatchEvent(new Event(EASYT_BEFORE_NEW_TRIP_EVENT, { cancelable: true }))
    : true;
}

export function beginNewTripNavigationInStorage(
  storage: EasyTBrowserStorage,
  ownerId: string | null,
  target: Pick<EventTarget, "dispatchEvent">,
) {
  if (!requestNewTripNavigation(target)) return false;
  return clearCurrentTripInStorage(storage, ownerId);
}

export function beginNewTripNavigation(
  ownerId: string | null,
  target?: Pick<EventTarget, "dispatchEvent">,
) {
  const eventTarget = target ?? (typeof window !== "undefined" ? window : null);
  if (!eventTarget || !requestNewTripNavigation(eventTarget)) return false;
  const storage = browserStorage();
  if (storage) {
    const cleared = clearCurrentTripInStorage(storage, ownerId);
    if (!cleared) return false;
    dispatchTripStorageChange({ kind: "current-cleared", ownerId, tripId: null });
  }
  return true;
}

type TripCacheRecord = {
  version: 2;
  ownerId: string | null;
  tripId: string;
  trip: EasyTTrip;
  cachedAt: string;
};

type CurrentTripRecord = {
  version: 2;
  ownerId: string | null;
  tripId: string;
};

type LastOwnerRecord = {
  version: 1;
  ownerId: string;
};

export type TripStorageChange = {
  kind: "cache" | "recovery" | "resolved" | "current-cleared";
  ownerId: string | null;
  tripId: string | null;
};

function scopeToken(ownerId: string | null) {
  return ownerId === null ? "guest" : `owner-${encodeURIComponent(ownerId)}`;
}

export function tripCacheStorageKey(ownerId: string | null, tripId: string) {
  return `${EASYT_TRIP_CACHE_PREFIX}${scopeToken(ownerId)}:${encodeURIComponent(tripId)}`;
}

export function tripRecoveryStorageKey(ownerId: string | null, tripId: string, writeId?: string) {
  const documentKey = `${EASYT_TRIP_RECOVERY_PREFIX}${scopeToken(ownerId)}:${encodeURIComponent(tripId)}`;
  return writeId ? `${documentKey}:${encodeURIComponent(writeId)}` : documentKey;
}

export function currentTripStorageKey(ownerId: string | null) {
  return `${EASYT_CURRENT_TRIP_PREFIX}${scopeToken(ownerId)}`;
}

function browserStorage(): EasyTBrowserStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStored(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function safeGet(storage: EasyTBrowserStorage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeKeys(storage: EasyTBrowserStorage) {
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function isQuotaError(error: unknown) {
  if (!(error instanceof Error) && !(typeof DOMException !== "undefined" && error instanceof DOMException)) return false;
  const named = error as { name?: string; code?: number };
  return named.name === "QuotaExceededError" || named.name === "NS_ERROR_DOM_QUOTA_REACHED" || named.code === 22 || named.code === 1014;
}

function cacheTimestamp(storage: EasyTBrowserStorage, key: string) {
  const parsed = parseStored(safeGet(storage, key));
  return isTripCacheRecord(parsed) ? Date.parse(parsed.cachedAt) || 0 : 0;
}

/** Recovery writes may evict expendable clean cache entries, never recovery. */
function safeSet(storage: EasyTBrowserStorage, key: string, value: string, protectedKeys: string[] = []) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) return false;
  }

  const cacheKeys = safeKeys(storage)
    .filter((candidate) => candidate.startsWith(EASYT_TRIP_CACHE_PREFIX)
      && candidate !== key
      && !protectedKeys.includes(candidate))
    .sort((left, right) => cacheTimestamp(storage, left) - cacheTimestamp(storage, right));
  for (const cacheKey of cacheKeys) {
    try {
      storage.removeItem(cacheKey);
      storage.setItem(key, value);
      return true;
    } catch (error) {
      if (!isQuotaError(error)) return false;
    }
  }
  return false;
}

function safeRemove(storage: EasyTBrowserStorage, key: string) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isLastOwnerRecord(value: unknown): value is LastOwnerRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LastOwnerRecord>;
  return record.version === 1 && typeof record.ownerId === "string" && record.ownerId.length > 0;
}

/**
 * This is only an offline address hint. It grants no server authority and is
 * replaced whenever a live authenticated session identifies another owner.
 */
export function rememberLastOwnerInStorage(storage: EasyTBrowserStorage, ownerId: string) {
  if (!ownerId) return false;
  try {
    storage.setItem(EASYT_LAST_OWNER_KEY, JSON.stringify({ version: 1, ownerId } satisfies LastOwnerRecord));
    return true;
  } catch {
    // Never evict an offline trip just to retain this optional address hint.
    return false;
  }
}

export function loadRememberedOwnerFromStorage(storage: EasyTBrowserStorage) {
  const record = parseStored(safeGet(storage, EASYT_LAST_OWNER_KEY));
  return isLastOwnerRecord(record) ? record.ownerId : null;
}

export function forgetRememberedOwnerInStorage(storage: EasyTBrowserStorage) {
  return safeRemove(storage, EASYT_LAST_OWNER_KEY);
}

export function ownerIdForBrowserRecovery({
  authenticatedOwnerId,
  sessionPending,
  browserOffline,
  rememberedOwnerId,
}: {
  authenticatedOwnerId: string | null;
  sessionPending: boolean;
  browserOffline: boolean;
  rememberedOwnerId: string | null;
}) {
  if (authenticatedOwnerId) return authenticatedOwnerId;
  // A remembered scope is deliberately unavailable during an unresolved
  // online session. This prevents an A document flashing while B is loading.
  if (sessionPending || !browserOffline) return null;
  return rememberedOwnerId;
}

/** The trip body may be unowned; its browser document scope is still authoritative. */
export function canUseHydratedTripScope(
  hydratedOwnerId: string | null | undefined,
  activeOwnerId: string | null,
) {
  return hydratedOwnerId !== undefined && hydratedOwnerId === activeOwnerId;
}

function recoveryScopeAcceptsTrip(ownerId: string | null, trip: EasyTTrip) {
  return !trip.ownerId || trip.ownerId === ownerId;
}

function isTripRecoveryRecord(value: unknown): value is TripRecoveryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<TripRecoveryRecord>;
  return record.version === 2
    && (typeof record.ownerId === "string" || record.ownerId === null)
    && typeof record.tripId === "string"
    && typeof record.writeId === "string"
    && typeof record.savedAt === "string"
    && (record.state === "pending" || record.state === "network" || record.state === "auth" || record.state === "conflict"
      || record.state === "validation" || record.state === "repository" || record.state === "unknown")
    && (record.conflictReason === undefined
      || record.conflictReason === "cloud-changed"
      || record.conflictReason === "cloud-newer"
      || record.conflictReason === "cloud-different"
      || record.conflictReason === "cloud-deleted")
    && isEasyTTrip(record.trip)
    && record.trip.id === record.tripId
    && recoveryScopeAcceptsTrip(record.ownerId, record.trip);
}

function isTripCacheRecord(value: unknown): value is TripCacheRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<TripCacheRecord>;
  return record.version === 2
    && (typeof record.ownerId === "string" || record.ownerId === null)
    && typeof record.tripId === "string"
    && typeof record.cachedAt === "string"
    && isEasyTTrip(record.trip)
    && record.trip.id === record.tripId
    && record.trip.ownerId === record.ownerId;
}

function isCurrentTripRecord(value: unknown): value is CurrentTripRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CurrentTripRecord>;
  return record.version === 2
    && (typeof record.ownerId === "string" || record.ownerId === null)
    && typeof record.tripId === "string";
}

function generatedWriteId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function setCurrentTripInStorage(
  storage: EasyTBrowserStorage,
  ownerId: string | null,
  tripId: string,
  protectedKeys: string[] = [],
) {
  const record: CurrentTripRecord = { version: 2, ownerId, tripId };
  return safeSet(storage, currentTripStorageKey(ownerId), JSON.stringify(record), protectedKeys);
}

export function loadCurrentTripIdFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const parsed = parseStored(safeGet(storage, currentTripStorageKey(ownerId)));
  return isCurrentTripRecord(parsed) && parsed.ownerId === ownerId ? parsed.tripId : null;
}

export function loadTripRecoveryFromStorage(
  storage: EasyTBrowserStorage,
  tripId: string,
  ownerId: string | null,
) {
  return listTripRecoveryVersionsFromStorage(storage, tripId, ownerId)[0] ?? null;
}

function listTripRecoveryVersionsFromStorage(
  storage: EasyTBrowserStorage,
  tripId: string,
  ownerId: string | null,
) {
  const documentKey = tripRecoveryStorageKey(ownerId, tripId);
  return safeKeys(storage)
    .filter((key) => key === documentKey || key.startsWith(`${documentKey}:`))
    .map((key) => parseStored(safeGet(storage, key)))
    .filter((value): value is TripRecoveryRecord => isTripRecoveryRecord(value)
      && value.ownerId === ownerId
      && value.tripId === tripId)
    .sort((left, right) => {
      const savedDifference = (Date.parse(right.savedAt) || 0) - (Date.parse(left.savedAt) || 0);
      return savedDifference || right.writeId.localeCompare(left.writeId);
    });
}

function recoveryRecordKey(storage: EasyTBrowserStorage, handle: TripRecoveryHandle) {
  const immutableKey = tripRecoveryStorageKey(handle.ownerId, handle.tripId, handle.writeId);
  const immutable = parseStored(safeGet(storage, immutableKey));
  if (isTripRecoveryRecord(immutable)
    && immutable.ownerId === handle.ownerId
    && immutable.tripId === handle.tripId
    && immutable.writeId === handle.writeId) return immutableKey;

  // Read v2 records written before recoveries moved to immutable write keys.
  const legacyV2Key = tripRecoveryStorageKey(handle.ownerId, handle.tripId);
  const legacyV2 = parseStored(safeGet(storage, legacyV2Key));
  return isTripRecoveryRecord(legacyV2)
    && legacyV2.ownerId === handle.ownerId
    && legacyV2.tripId === handle.tripId
    && legacyV2.writeId === handle.writeId
    ? legacyV2Key
    : null;
}

function recoveryRecordForHandle(storage: EasyTBrowserStorage, handle: TripRecoveryHandle) {
  const key = recoveryRecordKey(storage, handle);
  if (!key) return null;
  const record = parseStored(safeGet(storage, key));
  return isTripRecoveryRecord(record)
    && record.ownerId === handle.ownerId
    && record.tripId === handle.tripId
    && record.writeId === handle.writeId
    ? record
    : null;
}

export function loadCachedTripFromStorage(
  storage: EasyTBrowserStorage,
  tripId: string,
  ownerId: string | null,
) {
  const parsed = parseStored(safeGet(storage, tripCacheStorageKey(ownerId, tripId)));
  return isTripCacheRecord(parsed) && parsed.ownerId === ownerId && parsed.tripId === tripId ? parsed.trip : null;
}

export function listTripRecoveriesFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const prefix = `${EASYT_TRIP_RECOVERY_PREFIX}${scopeToken(ownerId)}:`;
  const records = safeKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => parseStored(safeGet(storage, key)))
    .filter((value): value is TripRecoveryRecord => isTripRecoveryRecord(value) && value.ownerId === ownerId)
    .sort((left, right) => (Date.parse(right.savedAt) || 0) - (Date.parse(left.savedAt) || 0));
  const newestByTrip = new Map<string, TripRecoveryRecord>();
  for (const record of records) {
    if (!newestByTrip.has(record.tripId)) newestByTrip.set(record.tripId, record);
  }
  return [...newestByTrip.values()];
}

function listCachedTripsFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const prefix = `${EASYT_TRIP_CACHE_PREFIX}${scopeToken(ownerId)}:`;
  return safeKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => parseStored(safeGet(storage, key)))
    .filter((value): value is TripCacheRecord => isTripCacheRecord(value) && value.ownerId === ownerId)
    .sort((left, right) => (Date.parse(right.cachedAt) || 0) - (Date.parse(left.cachedAt) || 0));
}

function nextRecoverySavedAt(existing: TripRecoveryRecord | null, requested?: string) {
  const candidate = requested ? Date.parse(requested) : Date.now();
  const previous = existing ? Date.parse(existing.savedAt) : Number.NaN;
  const next = Number.isFinite(candidate) ? candidate : Date.now();
  return new Date(Number.isFinite(previous) && previous >= next ? previous + 1 : next).toISOString();
}

function sameRecoveryDocument(left: EasyTTrip, right: EasyTTrip) {
  if (JSON.stringify(left) === JSON.stringify(right)) return true;
  // An ownerless builder document has no canonical cloud revision yet.
  // React may reconstruct the same durable trip while an async Build is in
  // flight; a fresh local updatedAt alone is not a new traveller edit and must
  // not invalidate the write ID waiting for acknowledgement.
  if (left.ownerId !== null || right.ownerId !== null) return false;
  const { updatedAt: _leftUpdatedAt, ...leftDocument } = left;
  const { updatedAt: _rightUpdatedAt, ...rightDocument } = right;
  return JSON.stringify(leftDocument) === JSON.stringify(rightDocument);
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function sortedById<T extends { id: string }>(items: T[] | undefined) {
  return items ? [...items].sort((left, right) => left.id.localeCompare(right.id)) : undefined;
}

function nonEmptyArray<T>(items: T[] | null | undefined) {
  return items?.length ? items : undefined;
}

function nonEmptyRecord<T>(record: Record<string | number, T> | null | undefined) {
  if (!record) return undefined;
  const entries = Object.entries(record).filter(([, value]) => !Array.isArray(value) || value.length > 0);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function nonEmptyScheduleLocks(locks: TripRecoveryRecord["trip"]["brief"]["scheduleLocks"]) {
  if (!locks?.stopIds.length && !Object.keys(locks?.arrivalDates ?? {}).length) return undefined;
  return locks;
}

function nonEmptyDecisionSelections(selections: TripRecoveryRecord["trip"]["brief"]["decisionSelections"]) {
  if (!selections?.routeOrder && !Object.keys(selections?.transportByLeg ?? {}).length) return undefined;
  return selections;
}

function authoredActivitySchedule(trip: EasyTTrip) {
  const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const entries = trip.planItems.flatMap((day) => {
    const authoredTitles = new Set([
      ...(trip.brief.customActivities?.[day.dayNumber] ?? []),
      ...(trip.brief.itineraryIdeas ?? []).filter((idea) => idea.dayId === day.id).map((idea) => idea.title),
    ].map(normalized));
    return day.notes.flatMap((title, order) => authoredTitles.has(normalized(title)) ? [{
      dayId: day.id,
      title,
      order,
      dayPart: day.noteDayParts?.[order] ?? null,
    }] : []);
  });
  return entries.length ? entries : undefined;
}

/**
 * The recovery boundary protects deliberate traveller decisions, not every
 * field returned by planners and providers. Keep this projection explicit so
 * adding transient metadata to EasyTTrip cannot silently create conflicts.
 *
 * Itinerary edits participate through dayNotes/customActivities; planItems are
 * generated from the route and those authored values and are intentionally
 * excluded as a second source of truth.
 */
function travellerAuthoredTripDocument(trip: EasyTTrip) {
  const brief = trip.brief;
  const originIdentity = `${brief.origin.trim().toLocaleLowerCase()}|${(brief.originCountry ?? "").trim().toLocaleLowerCase()}`;
  return {
    schemaVersion: trip.schemaVersion,
    id: trip.id,
    ownerId: trip.ownerId,
    title: trip.title,
    status: trip.status,
    archivedFromStatus: trip.archivedFromStatus,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travellers: trip.travellers,
    currency: trip.currency,
    brief: {
      originIdentity,
      journeyEnd: brief.journeyEnd,
      mustDo: brief.mustDo,
      pace: brief.pace,
      hotelChanges: brief.hotelChanges,
      budgetBand: brief.budgetBand,
      selectedPlaces: nonEmptyRecord(brief.selectedPlaces) ?? {},
      dayAllocations: nonEmptyRecord(brief.dayAllocations),
      nightAllocations: nonEmptyRecord(brief.nightAllocations),
      manualNightStopIds: brief.manualNightStopIds?.length ? [...brief.manualNightStopIds].sort() : undefined,
      dayNotes: nonEmptyRecord(brief.dayNotes),
      customActivities: nonEmptyRecord(brief.customActivities),
      activitySchedule: authoredActivitySchedule(trip),
      itineraryIdeas: sortedById(nonEmptyArray(brief.itineraryIdeas)),
      mapPins: sortedById(nonEmptyArray(brief.mapPins)),
      bookings: sortedById(nonEmptyArray(brief.bookings)),
      checklist: sortedById(nonEmptyArray(brief.checklist)),
      intent: brief.intent,
      scheduleLocks: nonEmptyScheduleLocks(brief.scheduleLocks),
      decisionSelections: nonEmptyDecisionSelections(brief.decisionSelections),
    },
    stops: [...trip.stops].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)).map((stop) => ({
      id: stop.id,
      identity: `${stop.name.trim().toLocaleLowerCase()}|${stop.country.trim().toLocaleLowerCase()}`,
      order: stop.order,
      nights: stop.nights,
    })),
  };
}

/**
 * Compare the traveller-authored trip state after applying the repository's
 * canonical owner/ID normalization. Generated legs, itinerary rows, route
 * assessments and recommendations can be rebuilt from that state and must not
 * manufacture a second device edit immediately after a successful save.
 */
export function tripDocumentsCanonicalEquivalent(
  localTrip: EasyTTrip,
  canonicalTrip: EasyTTrip,
  ownerId = canonicalTrip.ownerId,
) {
  if (!ownerId || localTrip.id !== canonicalTrip.id) return false;
  const normalizedLocal = canonicalTripForOwner(ownerId, localTrip, canonicalTrip.updatedAt);
  const normalizedCanonical = canonicalTripForOwner(ownerId, canonicalTrip, canonicalTrip.updatedAt);
  return JSON.stringify(stableJsonValue(travellerAuthoredTripDocument(normalizedLocal)))
    === JSON.stringify(stableJsonValue(travellerAuthoredTripDocument(normalizedCanonical)));
}

/**
 * A recovery is redundant only when its traveller-authored state matches the
 * canonical cloud document. Owner assignment and stop-reference namespacing
 * are normalized through the repository's own canonicalization function.
 */
export function tripRecoveryMatchesCanonical(
  recovery: Pick<TripRecoveryRecord, "ownerId" | "tripId" | "trip">,
  canonicalTrip: EasyTTrip,
) {
  if (!canonicalTrip.ownerId
    || recovery.ownerId !== canonicalTrip.ownerId
    || recovery.tripId !== canonicalTrip.id
    || recovery.trip.id !== canonicalTrip.id
    || (recovery.trip.ownerId !== null && recovery.trip.ownerId !== canonicalTrip.ownerId)) return false;
  return tripDocumentsCanonicalEquivalent(recovery.trip, canonicalTrip);
}

function writeTripRecoveryToStorage(
  storage: EasyTBrowserStorage,
  trip: EasyTTrip,
  options: {
    ownerId?: string | null;
    state?: TripRecoveryState;
    writeId?: string;
    now?: string;
    replace?: TripRecoveryHandle;
  } = {},
): TripRecoveryWriteResult {
  const ownerId = options.ownerId === undefined ? trip.ownerId : options.ownerId;
  const writeId = options.writeId ?? generatedWriteId();
  const handle = { ownerId, tripId: trip.id, writeId };
  if (!recoveryScopeAcceptsTrip(ownerId, trip)) return { stored: false, handle, blockedByExistingRecovery: false };
  const existing = loadTripRecoveryFromStorage(storage, trip.id, ownerId);
  if (existing) {
    // A render/autosave of the same durable document is not a new edit. Build
    // waits for an acknowledgement keyed to this write ID; rotating it for a
    // render-equivalent autosave would turn a successful canonical response
    // into a false stale-write result.
    if (sameRecoveryDocument(existing.trip, trip)) {
      setCurrentTripInStorage(storage, ownerId, trip.id, [tripRecoveryStorageKey(ownerId, trip.id)]);
      return { stored: true, handle: existing, blockedByExistingRecovery: false };
    }
    const expected = options.replace;
    const replacingExactWrite = expected?.ownerId === ownerId
      && expected.tripId === trip.id
      && expected.writeId === existing.writeId;
    if (!replacingExactWrite) {
      // Any different document must prove it was opened from this exact
      // recovery before replacing it; a canonical cloud view never has that
      // handle.
      return { stored: false, handle: existing, blockedByExistingRecovery: true };
    }
  }
  const record: TripRecoveryRecord = {
    version: 2,
    ownerId,
    tripId: trip.id,
    trip,
    state: options.state ?? "pending",
    writeId,
    savedAt: nextRecoverySavedAt(existing, options.now),
  };
  // Each write has an immutable key. An ACK or status update can therefore
  // touch only the exact write it was given, even if another tab writes in the
  // middle of the operation.
  const recoveryKey = tripRecoveryStorageKey(ownerId, trip.id, writeId);
  const stored = safeSet(storage, recoveryKey, JSON.stringify(record));
  if (stored) {
    setCurrentTripInStorage(storage, ownerId, trip.id, [recoveryKey]);
    if (existing && options.replace) {
      const replacedKey = recoveryRecordKey(storage, options.replace);
      if (replacedKey && replacedKey !== recoveryKey) safeRemove(storage, replacedKey);
    }
  }
  return { stored, handle, blockedByExistingRecovery: false };
}

export function saveTripRecoveryToStorage(
  storage: EasyTBrowserStorage,
  trip: EasyTTrip,
  options: {
    ownerId?: string | null;
    state?: TripRecoveryState;
    writeId?: string;
    now?: string;
    replace?: TripRecoveryHandle;
  } = {},
): TripRecoveryWriteResult {
  const ownerId = options.ownerId === undefined ? trip.ownerId : options.ownerId;
  migrateLegacyTripFromStorage(storage, ownerId);
  return writeTripRecoveryToStorage(storage, trip, options);
}

function writeCanonicalTripCacheToStorage(
  storage: EasyTBrowserStorage,
  trip: EasyTTrip,
  now = new Date().toISOString(),
) {
  const ownerId = trip.ownerId;
  migrateLegacyTripFromStorage(storage, ownerId);
  const current = loadCachedTripFromStorage(storage, trip.id, ownerId);
  if (current && !canonicalTripRevisionCanReplace(current, trip)) return false;
  const record: TripCacheRecord = { version: 2, ownerId, tripId: trip.id, trip, cachedAt: now };
  const cacheKey = tripCacheStorageKey(ownerId, trip.id);
  const stored = safeSet(storage, cacheKey, JSON.stringify(record));
  if (stored) setCurrentTripInStorage(storage, ownerId, trip.id, [cacheKey]);
  return stored;
}

export function cacheCanonicalTripWithRecoveryToStorage(
  storage: EasyTBrowserStorage,
  trip: EasyTTrip,
  resolvedRecovery?: TripRecoveryHandle,
  now = new Date().toISOString(),
) {
  const previousCanonical = loadCachedTripFromStorage(storage, trip.id, trip.ownerId);
  const stored = writeCanonicalTripCacheToStorage(storage, trip, now);
  const recoveryRecord = resolvedRecovery ? recoveryRecordForHandle(storage, resolvedRecovery) : null;
  const acknowledgedRecovery = Boolean(resolvedRecovery
    && recoveryRecord
    && recoveryRecord.writeId === resolvedRecovery.writeId
    && trip.id === resolvedRecovery.tripId
    && (resolvedRecovery.ownerId === null
      ? recoveryRecord.trip.ownerId === null
      : trip.ownerId === resolvedRecovery.ownerId));
  const currentRecovery = acknowledgedRecovery
    ? recoveryRecord
    : loadTripRecoveryFromStorage(storage, trip.id, trip.ownerId);
  // A canonical response may legitimately move A -> B (for example Luna Apply
  // or another cloud writer). A device snapshot equal to the previously cached
  // A contains no unique work, so it is safe to retire after B is durable.
  // A snapshot that differs from both A and B remains untouched.
  const redundantRecovery = Boolean(currentRecovery && (
    tripRecoveryMatchesCanonical(currentRecovery, trip)
      || (previousCanonical && tripRecoveryMatchesCanonical(currentRecovery, previousCanonical))
  ));
  const recoveryResolved = stored && currentRecovery && (acknowledgedRecovery || redundantRecovery)
    ? resolveTripRecoveryInStorage(storage, currentRecovery)
    : false;
  return { stored, recoveryResolved };
}

export function cacheCanonicalTripToStorage(
  storage: EasyTBrowserStorage,
  trip: EasyTTrip,
  now = new Date().toISOString(),
) {
  return cacheCanonicalTripWithRecoveryToStorage(storage, trip, undefined, now).stored;
}

/** Resolve a stranded recovery only after proving it is the canonical document. */
export function resolveCanonicalEquivalentTripRecoveryInStorage(
  storage: EasyTBrowserStorage,
  canonicalTrip: EasyTTrip,
  recovery: TripRecoveryRecord,
) {
  const equivalent = tripRecoveryMatchesCanonical(recovery, canonicalTrip);
  if (!equivalent) return { equivalent, stored: false, recoveryResolved: false };
  return {
    equivalent,
    ...cacheCanonicalTripWithRecoveryToStorage(storage, canonicalTrip, recovery),
  };
}

/** Update status only while this is still the exact pending write. */
export function markTripRecoveryStateInStorage(
  storage: EasyTBrowserStorage,
  handle: TripRecoveryHandle,
  state: TripRecoveryState,
  conflictReason?: TripRecoveryConflictReason,
) {
  const current = loadTripRecoveryFromStorage(storage, handle.tripId, handle.ownerId);
  if (!current || current.writeId !== handle.writeId) return false;
  const key = recoveryRecordKey(storage, handle);
  return key ? safeSet(storage, key, JSON.stringify({
    ...current,
    state,
    conflictReason: state === "conflict" ? conflictReason : undefined,
  })) : false;
}

export type TripCloudMutation = "archive" | "restore" | "delete";

/** Keep the clean cache aligned with dashboard mutations without consuming pending edits. */
export function reconcileTripCloudMutationInStorage(
  storage: EasyTBrowserStorage,
  ownerId: string,
  tripId: string,
  mutation: TripCloudMutation,
  canonicalTrip?: EasyTTrip,
) {
  const recovery = loadTripRecoveryFromStorage(storage, tripId, ownerId);
  if (mutation === "delete") {
    const cacheRemoved = safeRemove(storage, tripCacheStorageKey(ownerId, tripId));
    if (recovery) markTripRecoveryStateInStorage(storage, recovery, "conflict", "cloud-deleted");
    if (loadCurrentTripIdFromStorage(storage, ownerId) === tripId && !recovery) {
      safeRemove(storage, currentTripStorageKey(ownerId));
    }
    return { cacheUpdated: cacheRemoved, recoveryQuarantined: Boolean(recovery) };
  }
  if (!canonicalTrip || canonicalTrip.id !== tripId || canonicalTrip.ownerId !== ownerId) {
    return { cacheUpdated: false, recoveryQuarantined: false };
  }
  const shouldCacheCanonical = Boolean(loadCachedTripFromStorage(storage, tripId, ownerId) || recovery);
  const cacheUpdated = shouldCacheCanonical ? cacheCanonicalTripToStorage(storage, canonicalTrip) : false;
  const remainingRecovery = recovery ? loadTripRecoveryFromStorage(storage, tripId, ownerId) : null;
  if (remainingRecovery) markTripRecoveryStateInStorage(storage, remainingRecovery, "conflict", "cloud-changed");
  return { cacheUpdated, recoveryQuarantined: Boolean(remainingRecovery) };
}

/** Remove only the recovery version acknowledged by a successful cloud save. */
export function resolveTripRecoveryInStorage(storage: EasyTBrowserStorage, handle: TripRecoveryHandle) {
  const key = recoveryRecordKey(storage, handle);
  if (!key || !safeRemove(storage, key)) return false;
  const currentId = loadCurrentTripIdFromStorage(storage, handle.ownerId);
  if (currentId === handle.tripId
    && !loadTripRecoveryFromStorage(storage, handle.tripId, handle.ownerId)
    && !loadCachedTripFromStorage(storage, handle.tripId, handle.ownerId)) {
    safeRemove(storage, currentTripStorageKey(handle.ownerId));
  }
  return true;
}

export function discardTripRecoveryInStorage(
  storage: EasyTBrowserStorage,
  handle: TripRecoveryHandle,
  confirmed: boolean,
) {
  if (!confirmed) return false;
  return resolveTripRecoveryInStorage(storage, handle);
}

export function clearCurrentTripInStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  return safeRemove(storage, currentTripStorageKey(ownerId));
}

function migrateLegacyTripFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const legacy = parseStored(safeGet(storage, EASYT_ACTIVE_TRIP_KEY));
  if (!isEasyTTrip(legacy)) return null;
  if (legacy.ownerId && legacy.ownerId !== ownerId) return null;
  const scopeOwnerId = legacy.ownerId ?? ownerId;
  const migrated = writeTripRecoveryToStorage(storage, legacy, {
    ownerId: scopeOwnerId,
    state: "pending",
    writeId: `legacy-${generatedWriteId()}`,
  });
  if (migrated.stored) safeRemove(storage, EASYT_ACTIVE_TRIP_KEY);
  return legacy;
}

export function loadCurrentTripRecoveryFromStorage(
  storage: EasyTBrowserStorage,
  ownerId: string | null,
) {
  // Run the copy-first v1 migration before a newer clean-cache pointer can
  // hide the only pending document left by an earlier release.
  migrateLegacyTripFromStorage(storage, ownerId);
  const currentId = loadCurrentTripIdFromStorage(storage, ownerId);
  const current = currentId ? loadTripRecoveryFromStorage(storage, currentId, ownerId) : null;
  if (current) return current;
  const latest = listTripRecoveriesFromStorage(storage, ownerId)[0] ?? null;
  if (latest) return latest;
  return null;
}

export function loadLocalTripFromStorage(
  storage: EasyTBrowserStorage,
  tripId: string,
  ownerId: string | null,
  options: { recoveryOnly?: boolean } = {},
) {
  const legacy = migrateLegacyTripFromStorage(storage, ownerId);
  const recovery = loadTripRecoveryFromStorage(storage, tripId, ownerId);
  if (recovery) return recovery.trip;
  // A failed copy-first migration remains readable, but never shadows a newer
  // owner-scoped v2 recovery for the same document.
  if (legacy?.id === tripId && (legacy.ownerId === ownerId || legacy.ownerId === null)) {
    return legacy;
  }
  if (options.recoveryOnly) return null;
  const cached = loadCachedTripFromStorage(storage, tripId, ownerId);
  if (cached) return cached;
  return null;
}

export function loadActiveTripFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const legacy = migrateLegacyTripFromStorage(storage, ownerId);
  // If quota or blocked storage prevented the copy, keep the v1 recovery
  // visible instead of allowing a newer clean pointer to shadow it.
  if (legacy && safeGet(storage, EASYT_ACTIVE_TRIP_KEY)) {
    const scopedOwner = legacy.ownerId ?? ownerId;
    const newerRecovery = loadTripRecoveryFromStorage(storage, legacy.id, scopedOwner);
    if (!newerRecovery) return legacy;
  }
  const currentId = loadCurrentTripIdFromStorage(storage, ownerId);
  if (currentId) {
    const current = loadLocalTripFromStorage(storage, currentId, ownerId);
    if (current) return current;
  }
  const recovery = listTripRecoveriesFromStorage(storage, ownerId)[0]?.trip;
  if (recovery) return recovery;
  const cached = listCachedTripsFromStorage(storage, ownerId)[0]?.trip;
  if (cached) return cached;
  return null;
}

function dispatchTripStorageChange(detail: TripStorageChange, trip?: EasyTTrip) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EASYT_TRIP_STORAGE_CHANGE_EVENT, { detail }));
    if (detail.kind === "recovery" && trip) {
      window.dispatchEvent(new CustomEvent(EASYT_ACTIVE_TRIP_CHANGE_EVENT, { detail: trip }));
    }
  } catch {
    // Storage remains durable even when a restricted browser blocks events.
  }
}

export function tripStorageEventMatches(
  key: string | null,
  ownerId: string | null,
  tripId: string,
) {
  const recoveryKey = tripRecoveryStorageKey(ownerId, tripId);
  return key === recoveryKey
    || Boolean(key?.startsWith(`${recoveryKey}:`))
    || key === tripCacheStorageKey(ownerId, tripId)
    || key === currentTripStorageKey(ownerId);
}

export function subscribeToTripStorage(
  ownerId: string | null,
  tripId: string,
  listener: (change: TripStorageChange) => void,
) {
  if (typeof window === "undefined") return () => undefined;
  const onSameDocument = (event: Event) => {
    const detail = (event as CustomEvent<TripStorageChange>).detail;
    if (detail?.ownerId === ownerId && (detail.tripId === tripId || detail.tripId === null)) listener(detail);
  };
  const onOtherDocument = (event: StorageEvent) => {
    if (tripStorageEventMatches(event.key, ownerId, tripId)) {
      listener({ kind: event.key?.startsWith(EASYT_TRIP_RECOVERY_PREFIX) ? "recovery" : "cache", ownerId, tripId });
    }
  };
  window.addEventListener(EASYT_TRIP_STORAGE_CHANGE_EVENT, onSameDocument);
  window.addEventListener("storage", onOtherDocument);
  return () => {
    window.removeEventListener(EASYT_TRIP_STORAGE_CHANGE_EVENT, onSameDocument);
    window.removeEventListener("storage", onOtherDocument);
  };
}

export function loadActiveTrip(ownerId: string | null = null): EasyTTrip | null {
  const storage = browserStorage();
  return storage ? loadActiveTripFromStorage(storage, ownerId) : null;
}

export function rememberLastOwner(ownerId: string) {
  const storage = browserStorage();
  const remembered = storage ? rememberLastOwnerInStorage(storage, ownerId) : false;
  if (remembered && typeof window !== "undefined") window.dispatchEvent(new Event(EASYT_LAST_OWNER_CHANGE_EVENT));
  return remembered;
}

export function loadRememberedOwner() {
  const storage = browserStorage();
  return storage ? loadRememberedOwnerFromStorage(storage) : null;
}

export function forgetRememberedOwner() {
  const storage = browserStorage();
  const forgotten = storage ? forgetRememberedOwnerInStorage(storage) : false;
  if (forgotten && typeof window !== "undefined") window.dispatchEvent(new Event(EASYT_LAST_OWNER_CHANGE_EVENT));
  return forgotten;
}

export function loadTripRecovery(tripId: string, ownerId: string | null) {
  const storage = browserStorage();
  return storage ? loadTripRecoveryFromStorage(storage, tripId, ownerId) : null;
}

export function loadLocalTrip(
  tripId: string,
  ownerId: string | null,
  options: { recoveryOnly?: boolean } = {},
) {
  const storage = browserStorage();
  return storage ? loadLocalTripFromStorage(storage, tripId, ownerId, options) : null;
}

export function loadCurrentTripRecovery(ownerId: string | null) {
  const storage = browserStorage();
  return storage ? loadCurrentTripRecoveryFromStorage(storage, ownerId) : null;
}

export function claimGuestTripRecoveryForOwnerInStorage(
  storage: EasyTBrowserStorage,
  tripId: string,
  ownerId: string,
) {
  const guest = loadTripRecoveryFromStorage(storage, tripId, null);
  if (!guest) return null;

  const ownerRecovery = loadTripRecoveryFromStorage(storage, tripId, ownerId);
  if (ownerRecovery) {
    if (JSON.stringify(ownerRecovery.trip) !== JSON.stringify(guest.trip)) {
      return { stored: false, handle: ownerRecovery as TripRecoveryHandle, blockedByExistingRecovery: true, guestResolved: false };
    }
    const guestResolved = resolveTripRecoveryInStorage(storage, guest);
    return { stored: true, handle: ownerRecovery as TripRecoveryHandle, blockedByExistingRecovery: false, guestResolved };
  }

  const claimed = writeTripRecoveryToStorage(storage, guest.trip, {
    ownerId,
    state: guest.state,
  });
  const guestResolved = claimed.stored && resolveTripRecoveryInStorage(storage, guest);
  return { ...claimed, guestResolved };
}

/** Claim is explicit to the signed-in recovery flow; account-wide readers never inspect guest records. */
export function claimGuestTripRecoveryForOwner(tripId: string, ownerId: string) {
  const storage = browserStorage();
  if (!storage) return null;
  const claimed = claimGuestTripRecoveryForOwnerInStorage(storage, tripId, ownerId);
  if (claimed?.stored) {
    dispatchTripStorageChange({ kind: "recovery", ownerId, tripId });
    if (claimed.guestResolved) dispatchTripStorageChange({ kind: "resolved", ownerId: null, tripId });
  }
  return claimed;
}

export function saveTripRecovery(
  trip: EasyTTrip,
  options: { ownerId?: string | null; state?: TripRecoveryState; replace?: TripRecoveryHandle } = {},
) {
  const storage = browserStorage();
  const ownerId = options.ownerId === undefined ? trip.ownerId : options.ownerId;
  const fallback = {
    stored: false,
    handle: { ownerId, tripId: trip.id, writeId: generatedWriteId() },
    blockedByExistingRecovery: false,
  };
  if (!storage) return fallback;
  const result = saveTripRecoveryToStorage(storage, trip, options);
  if (result.stored) dispatchTripStorageChange({ kind: "recovery", ownerId: result.handle.ownerId, tripId: trip.id }, trip);
  return result;
}

/** @deprecated Use saveTripRecovery for local edits and cacheCanonicalTrip for cloud data. */
export function saveActiveTrip(trip: EasyTTrip) {
  return saveTripRecovery(trip);
}

export function markTripRecoveryState(handle: TripRecoveryHandle, state: TripRecoveryState, conflictReason?: TripRecoveryConflictReason) {
  const storage = browserStorage();
  if (!storage) return false;
  const marked = markTripRecoveryStateInStorage(storage, handle, state, conflictReason);
  if (marked) dispatchTripStorageChange({ kind: "recovery", ownerId: handle.ownerId, tripId: handle.tripId });
  return marked;
}

export function reconcileTripCloudMutation(ownerId: string, tripId: string, mutation: TripCloudMutation, canonicalTrip?: EasyTTrip) {
  const storage = browserStorage();
  if (!storage) return { cacheUpdated: false, recoveryQuarantined: false };
  const result = reconcileTripCloudMutationInStorage(storage, ownerId, tripId, mutation, canonicalTrip);
  if (result.cacheUpdated) dispatchTripStorageChange({ kind: "cache", ownerId, tripId });
  else if (mutation === "delete") dispatchTripStorageChange({ kind: "current-cleared", ownerId, tripId });
  if (result.recoveryQuarantined) dispatchTripStorageChange({ kind: "recovery", ownerId, tripId });
  return result;
}

export function cacheCanonicalTrip(trip: EasyTTrip, resolvedRecovery?: TripRecoveryHandle) {
  const storage = browserStorage();
  if (!storage) return { stored: false, recoveryResolved: false };
  const recoveryBeforeCache = resolvedRecovery
    ?? loadTripRecoveryFromStorage(storage, trip.id, trip.ownerId)
    ?? undefined;
  const { stored, recoveryResolved } = cacheCanonicalTripWithRecoveryToStorage(storage, trip, resolvedRecovery);
  if (stored) dispatchTripStorageChange({ kind: "cache", ownerId: trip.ownerId, tripId: trip.id });
  if (recoveryResolved && recoveryBeforeCache) {
    dispatchTripStorageChange({ kind: "resolved", ownerId: recoveryBeforeCache.ownerId, tripId: recoveryBeforeCache.tripId });
  }
  return { stored, recoveryResolved };
}

export function resolveCanonicalEquivalentTripRecovery(
  canonicalTrip: EasyTTrip,
  recovery: TripRecoveryRecord,
) {
  const storage = browserStorage();
  if (!storage) return { equivalent: tripRecoveryMatchesCanonical(recovery, canonicalTrip), stored: false, recoveryResolved: false };
  const result = resolveCanonicalEquivalentTripRecoveryInStorage(storage, canonicalTrip, recovery);
  if (result.stored) dispatchTripStorageChange({ kind: "cache", ownerId: canonicalTrip.ownerId, tripId: canonicalTrip.id });
  if (result.recoveryResolved) {
    dispatchTripStorageChange({ kind: "resolved", ownerId: recovery.ownerId, tripId: recovery.tripId });
  }
  return result;
}

export function discardTripRecovery(handle: TripRecoveryHandle, confirmed: boolean) {
  const storage = browserStorage();
  if (!storage) return false;
  const discarded = discardTripRecoveryInStorage(storage, handle, confirmed);
  if (discarded) dispatchTripStorageChange({ kind: "resolved", ownerId: handle.ownerId, tripId: handle.tripId });
  return discarded;
}

/**
 * Bind an unclaimed trip body to the owner scope that made the recovery
 * addressable. This makes an account switch fail closed at the API boundary:
 * account B cannot promote a document recovered from account A's scope.
 */
export function tripForRecoveryScope(trip: EasyTTrip, recovery: TripRecoveryHandle) {
  if (trip.id !== recovery.tripId) return null;
  if (recovery.ownerId === null) return trip.ownerId === null ? trip : null;
  if (trip.ownerId && trip.ownerId !== recovery.ownerId) return null;
  return trip.ownerId === recovery.ownerId ? trip : { ...trip, ownerId: recovery.ownerId };
}

function cloudPersistenceError(
  response: Response,
  payload: { error?: string; category?: unknown } | null,
  operation: TripPersistenceOperation,
) {
  return new EasyTTripPersistenceError({
    message: payload?.error || "Morrovia could not save this trip.",
    category: tripPersistenceFailureCategory(response.status, payload?.category),
    status: response.status,
    operation,
  });
}

export async function saveTripToEasyT(trip: EasyTTrip, request: typeof fetch = fetch): Promise<EasyTTrip> {
  if (!trip.ownerId) return (await promoteTripToEasyT(trip, request)).trip;
  const response = await requestTripUpdate(trip, request);
  const payload = await response.json().catch(() => null) as {
    trip?: unknown;
    conflictReason?: TripSaveConflictReason;
    error?: string;
    category?: unknown;
  } | null;
  const authError = tripSyncAuthError(response.status, payload?.error);
  if (authError) throw authError;
  if (response.status === 409 && payload && isEasyTTrip(payload.trip) && payload.conflictReason) {
    throw new EasyTTripSaveConflictError(
      payload.error || "This trip changed in the cloud.",
      payload.trip,
      payload.conflictReason,
    );
  }
  if (!response.ok) {
    throw cloudPersistenceError(response, payload, "update");
  }
  if (!payload || !isEasyTTrip(payload.trip)) {
    throw new EasyTTripPersistenceError({
      message: "Morrovia returned an invalid saved trip.",
      category: "validation",
      status: response.status,
      operation: "update",
    });
  }
  return payload.trip;
}

export async function saveTripRecoveryToEasyT(
  trip: EasyTTrip,
  recovery: TripRecoveryHandle,
  request: typeof fetch = fetch,
) {
  const scopedTrip = tripForRecoveryScope(trip, recovery);
  if (!scopedTrip) throw new Error("Trip recovery ownership mismatch.");
  if (trip.ownerId === null) {
    // Promotion remains an insert-only draft boundary. Building a new trip
    // produces a planned document, so first claim its exact ID as a draft,
    // then make the normal revision-checked transition to planned. This keeps
    // an authenticated first save from being mistaken for an update to a row
    // that does not exist yet.
    if (trip.status !== "draft" && trip.status !== "planned") {
      throw new Error("Only an ownerless draft or newly built trip can be promoted.");
    }
    let promoted: EasyTTrip;
    try {
      promoted = (await promoteTripToEasyT({ ...trip, status: "draft" }, request)).trip;
    } catch (error) {
      // The planned CAS may have committed even when its response was lost.
      // A retry of that exact reviewed document must acknowledge the existing
      // canonical row rather than manufacture a false promotion conflict.
      if (trip.status === "planned"
        && error instanceof EasyTTripPromotionConflictError
        && tripBuildDocumentsCanonicalEquivalent(trip, error.canonicalTrip, recovery.ownerId)) {
        return error.canonicalTrip;
      }
      throw error;
    }
    if (trip.status === "draft") return promoted;
    try {
      return await saveTripToEasyT({ ...promoted, status: trip.status }, request);
    } catch (error) {
      // Concurrent double-clicks share one trip ID and one CAS baseline. If
      // another request saved the exact reviewed planned state first, its
      // conflict document is a successful idempotent acknowledgement.
      if (error instanceof EasyTTripSaveConflictError
        && tripBuildDocumentsCanonicalEquivalent(trip, error.canonicalTrip, recovery.ownerId)) {
        return error.canonicalTrip;
      }
      throw error;
    }
  }
  try {
    return await saveTripToEasyT(scopedTrip, request);
  } catch (error) {
    // The same lost-response rule applies when Builder is editing an existing
    // account draft: an exact canonical conflict proves the write committed.
    if (error instanceof EasyTTripSaveConflictError
      && tripBuildDocumentsCanonicalEquivalent(scopedTrip, error.canonicalTrip, recovery.ownerId)) {
      return error.canonicalTrip;
    }
    throw error;
  }
}

export type EasyTTripPromotion = {
  trip: EasyTTrip;
  outcome: "promoted" | "already-canonical";
};

export class EasyTTripPromotionConflictError extends Error {
  readonly canonicalTrip: EasyTTrip;
  readonly reason: TripPromotionConflictReason;

  constructor(message: string, canonicalTrip: EasyTTrip, reason: TripPromotionConflictReason) {
    super(message);
    this.name = "EasyTTripPromotionConflictError";
    this.canonicalTrip = canonicalTrip;
    this.reason = reason;
  }
}

/** Insert-only local-to-cloud boundary. Existing cloud state is never updated. */
export async function promoteTripToEasyT(trip: EasyTTrip, request: typeof fetch = fetch): Promise<EasyTTripPromotion> {
  if (trip.ownerId !== null || trip.status !== "draft") {
    throw new Error("Only an ownerless draft can be promoted.");
  }
  const response = await requestTripPromotion(trip, request);
  const payload = await response.json().catch(() => null) as {
    trip?: unknown;
    outcome?: "promoted" | "already-canonical" | "conflict";
    conflictReason?: TripPromotionConflictReason;
    error?: string;
    category?: unknown;
  } | null;

  const authError = tripSyncAuthError(response.status, payload?.error);
  if (authError) throw authError;

  if (response.status === 409 && payload && isEasyTTrip(payload.trip) && payload.conflictReason) {
    throw new EasyTTripPromotionConflictError(
      payload.error || "A cloud copy already exists.",
      payload.trip,
      payload.conflictReason,
    );
  }
  if (!response.ok) {
    throw cloudPersistenceError(response, payload, "promotion");
  }
  if (!payload || !isEasyTTrip(payload.trip)
    || (payload.outcome !== "promoted" && payload.outcome !== "already-canonical")) {
    throw new EasyTTripPersistenceError({
      message: "Morrovia returned an invalid promoted trip.",
      category: "validation",
      status: response.status,
      operation: "promotion",
    });
  }
  return { trip: payload.trip, outcome: payload.outcome };
}

type TripCloudLoadResult =
  | { kind: "found"; trip: EasyTTrip }
  | { kind: "missing" }
  | { kind: "unavailable" };

async function loadTripFromEasyTResult(tripId: string): Promise<TripCloudLoadResult> {
  const response = await fetch(`/api/easyt/trips/${encodeURIComponent(tripId)}`, { cache: "no-store" });
  // A 404/401 is a definitive access boundary, not an offline condition. Do
  // not reveal a stale browser cache after a deletion or owner-scoped 404.
  if (response.status === 404 || response.status === 401) return { kind: "missing" };
  if (!response.ok) return { kind: "unavailable" };
  const payload = await response.json() as { trip: EasyTTrip };
  if (!isEasyTTrip(payload.trip) || payload.trip.id !== tripId) return { kind: "missing" };
  // A verified API response is safe to keep for an offline reopen. This clean
  // cache write never touches a pending recovery for the same owner and trip.
  cacheCanonicalTrip(payload.trip);
  return { kind: "found", trip: payload.trip };
}

export async function loadTripFromEasyT(tripId: string): Promise<EasyTTrip | null> {
  const result = await loadTripFromEasyTResult(tripId);
  if (result.kind === "unavailable") throw new Error("Morrovia cloud load failed.");
  if (result.kind !== "found") return null;
  // Every authoritative cloud load crosses the same reconciliation boundary.
  // This retires an equivalent/stale baseline snapshot before a workspace can
  // mistake it for unsynced work, while unique local edits remain preserved.
  cacheCanonicalTrip(result.trip);
  return result.trip;
}

/**
 * Resolve a trip opened by URL using the same cloud-first, active-trip fallback
 * used by the legacy planner. Newly-shaped trips exist locally until the
 * account migration/save completes, while persisted trips remain owner-checked
 * by the API above.
 */
export async function loadRequestedTrip(tripId: string, ownerId: string | null = null): Promise<EasyTTrip | null> {
  try {
    const cloud = await loadTripFromEasyTResult(tripId);
    if (cloud.kind === "found") return cloud.trip;
    if (cloud.kind === "missing") return null;
  } catch {
    // The exact active local document remains usable if cloud loading is
    // temporarily unavailable, matching the established planner behaviour.
  }

  const storage = browserStorage();
  return storage
    ? loadLocalTripFromStorage(storage, tripId, ownerId)
    : null;
}

/** @deprecated New Map Plans read the canonical EasyT document directly. */
export function saveJourneyPlanBridge(trip: EasyTTrip) {
  if (typeof window === "undefined") return;
  const duration = Math.max(1, Math.round((+new Date(`${trip.endDate}T00:00:00`) - +new Date(`${trip.startDate}T00:00:00`)) / 86400000) + 1);
  const pickDetails = Object.fromEntries(trip.stops.map((stop) => [
    stop.id,
    trip.planItems
      .filter((item) => item.stopId === stop.id && item.type === "activity")
      .map((item) => ({
        id: item.id,
        title: item.title,
        area: stop.name,
        type: "Activity",
        duration: "Flexible",
        description: item.reason,
        country: stop.country,
      })),
  ]));
  const brief = {
    origin: trip.brief.origin,
    destinations: trip.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      country: stop.country,
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
      kind: "place",
    })),
    startDate: trip.startDate,
    duration: String(duration),
    travellers: String(trip.travellers),
    interests: tripIntentForTrip(trip).preferences.interests,
    picks: trip.brief.selectedPlaces,
    pickDetails,
  };
  window.localStorage.setItem(LEGACY_JOURNEY_PLAN_KEY, JSON.stringify({ brief }));
}

/** Start a different view without deleting any clean or pending document. */
export function clearActiveTrip(ownerId: string | null = null) {
  const storage = browserStorage();
  if (!storage) return false;
  const cleared = clearCurrentTripInStorage(storage, ownerId);
  if (cleared) dispatchTripStorageChange({ kind: "current-cleared", ownerId, tripId: null });
  return cleared;
}
