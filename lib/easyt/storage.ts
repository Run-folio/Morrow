import { requireReadableTripDocument, prepareTripDocumentForWrite, TripDocumentReadError } from "./trip-document.ts";
import { recoveryPersistenceOutcome, reportPersistenceOutcome, reportQaPersistenceBoundary, type PersistenceOutcome, type PersistenceFailureBoundary } from "./persistence-outcome.ts";
import { legacyItineraryIdeas } from "./trip.ts";
import { tripIntentForTrip, type EasyTTrip } from "./trip.ts";
import { normalizeLegacyGeneratedDayContext } from "./itinerary-generated-context.ts";
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

import { browserTripPersistence, browserRecoveryDriver, browserRecoveryStorage, browserRecoveryGuard,
  BrowserRecoveryReadError, broadcastRecoveryChange, invalidateBrowserRecoveryScope } from './browser-recovery-persistence.ts';
import { createDurableBuilderInputPersistence } from './builder-input-persistence.ts';
import type { BuilderInputDraft } from './trip-builder-input-draft.ts';
import {prepareIntakeAcknowledgement,type RecoveryIntakeAcknowledgement} from './homepage-persistence.ts';
import {RECOVERY_DOMAIN_OVERFLOW_ENABLED,RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED,RECOVERY_DOMAIN_CLAIM_ENABLED} from './recovery-domain-policy.ts';
import {createRecoveryClaimCoordinator} from './recovery-domain-claim.ts';
export { BrowserRecoveryReadError } from './browser-recovery-persistence.ts';

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
export const EASYT_NEW_TRIP_INPUT_CHANGE_EVENT = "easyt-new-trip-input-change";
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
  /** Exact retained legacy source present when this immutable write began. */
  legacySourceRaw?: string;
  /** Derived by the supported physical-store reader, never inferred from raw JSON. */
  backend?: 'indexeddb';
};

export type TripRecoveryHandle = Pick<TripRecoveryRecord, "ownerId" | "tripId" | "writeId" | "backend">;

export type TripRecoveryClassification =
  | "clean"
  | "pending-current-save"
  | "current-save-failed"
  | "active-local-document"
  | "equivalent"
  | "historical-superseded"
  | "genuine-divergence";

export type TripRecoveryWriteResult = {
  /** Optional projection declined before any setter; no durability acknowledgement. */
  projectionDeferred?: boolean;
  stored: boolean;
  handle: TripRecoveryHandle;
  blockedByExistingRecovery: boolean;
  failureReason?: "device-unavailable" | "protected-recovery" | "scope-mismatch" | "receipt-incomplete" | "pointer-incomplete" | "unknown";
  /** Recovery acceptance and the navigation pointer are distinct acknowledgements. */
  pointerAcknowledged?: boolean;
  receiptAcknowledged?: boolean;
  nativeFailure?: "quota" | "security" | "unavailable" | "unknown";
  /** Transaction retention alone does not prove independent recovery readback. */
  recoveryCommitted?: boolean;
  recoveryDurable?: boolean;
  outcome?: PersistenceOutcome;
  writeAttempted?: boolean;
  readbackConfirmed?: boolean;
  failureBoundary?: PersistenceFailureBoundary;
};

const expectedCanonicalSaveRecoveries = new Set<string>();

function recoveryHandleKey(handle: TripRecoveryHandle) {
  return JSON.stringify([handle.ownerId, handle.tripId, handle.writeId]);
}

/**
 * True only for the exact recovery write currently owned by an authenticated
 * save in this document. The expectation is deliberately process-local: after
 * a reload, an unacknowledged pending record is historical recovery and must
 * remain actionable.
 */
export function tripRecoveryIsAwaitingCanonicalSave(recovery: TripRecoveryRecord) {
  return recovery.state === "pending"
    && expectedCanonicalSaveRecoveries.has(recoveryHandleKey(recovery));
}

/** Register an existing durable write when its authenticated save begins. */
export function expectCanonicalSave(handle: TripRecoveryHandle) {
  expectedCanonicalSaveRecoveries.add(recoveryHandleKey(handle));
}

function finishExpectedCanonicalSave(handle: TripRecoveryHandle) {
  return expectedCanonicalSaveRecoveries.delete(recoveryHandleKey(handle));
}

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
  const currentTripId = loadCurrentTripIdFromStorage(storage, ownerId);
  if (currentTripId && !loadLocalTripFromStorage(storage, currentTripId, ownerId)) return false;
  return clearCurrentTripInStorage(storage, ownerId);
}

export type NewTripNavigationRecoveryAcknowledgement = {sourceHref:string;tripId:string};
export type NewTripNavigationPreservation = boolean | {accepted:true;recoveryNavigation:NewTripNavigationRecoveryAcknowledgement};

export async function beginNewTripNavigation(ownerId:string|null,target?:Pick<EventTarget,"dispatchEvent">,
  isCurrent?:(acknowledgements?:readonly NewTripNavigationRecoveryAcknowledgement[])=>boolean) {
  // Preserve the caller/owner boundary across the listener await, rather
  // than starting a fresh authority epoch after preservation has finished.
  let acknowledgements:readonly NewTripNavigationRecoveryAcknowledgement[]=[];
  const guard=browserRecoveryGuard(()=>!isCurrent||isCurrent(acknowledgements)===true);
  const eventTarget=target??(typeof window!=="undefined"?window:null);if(!eventTarget)return false;
  if(!guard())return false;
  const preservation=await collectNewTripNavigationPreservation(eventTarget);
  if(!preservation.accepted)return false;
  acknowledgements=preservation.acknowledgements;
  if(!guard())return false;
  try {
    const cleared=await (await browserTripPersistence(ownerId,guard)).clearCurrent();
    if(!guard())return false;
    if(cleared)dispatchTripStorageChange({kind:"current-cleared",ownerId,tripId:null});
    return cleared;
  }catch{return false;}
}

export function deferNewTripNavigation(event:Event,preservation:Promise<NewTripNavigationPreservation>) {
  const detail=(event as CustomEvent<{waitUntil?:(pending:Promise<NewTripNavigationPreservation>)=>void}>).detail;
  if(typeof detail?.waitUntil==='function')detail.waitUntil(preservation);
  else {event.preventDefault();void preservation.catch(()=>false);}
}
export async function requestNewTripNavigationAsync(target:Pick<EventTarget,"dispatchEvent">) {
  return (await collectNewTripNavigationPreservation(target)).accepted;
}
async function collectNewTripNavigationPreservation(target:Pick<EventTarget,"dispatchEvent">) {
  const pending:Promise<NewTripNavigationPreservation>[]=[];
  const refused={accepted:false,acknowledgements:[] as NewTripNavigationRecoveryAcknowledgement[]};
  try {
    const detail={waitUntil:(preservation:Promise<NewTripNavigationPreservation>)=>{pending.push(Promise.resolve(preservation).catch(()=>false));}};
    const accepted=target.dispatchEvent(new CustomEvent(EASYT_BEFORE_NEW_TRIP_EVENT,{cancelable:true,detail}));
    if(!accepted)return refused;
    const acknowledgements:NewTripNavigationRecoveryAcknowledgement[]=[],bySource=new Map<string,string>();
    for(const value of await Promise.all(pending)) {
      if(value===true)continue;
      if(!value||typeof value!=="object"||value.accepted!==true)return refused;
      const ack=value.recoveryNavigation;
      if(!ack||typeof ack.sourceHref!=="string"||!ack.sourceHref||typeof ack.tripId!=="string"||!ack.tripId.trim())return refused;
      if(bySource.has(ack.sourceHref)&&bySource.get(ack.sourceHref)!==ack.tripId)return refused;
      bySource.set(ack.sourceHref,ack.tripId);
      acknowledgements.push({sourceHref:ack.sourceHref,tripId:ack.tripId});
    }
    return {accepted:true,acknowledgements};
  }catch{return refused;}
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

/** Native refusal never authorizes implicit cache eviction. The async broker
 * may admit a proven source to IDB after actual quota; every old copy stays. */
function safeSet(storage: EasyTBrowserStorage, key: string, value: string, _protectedKeys: string[] = [], onFailure?: (error: unknown) => void,
  onDiagnosticOperation?: (operation: "setter" | "cleanup", accepted: boolean) => void) {
  const observe=(accepted:boolean)=>{try{onDiagnosticOperation?.("setter",accepted);}catch{/* Observer cannot affect persistence. */}};
  try { storage.setItem(key, value); observe(true); return true; }
  catch (error) { onFailure?.(error); observe(false); return false; }
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
    && record.trip !== undefined
    && Boolean(requireReadableTripDocument(record.trip))
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
    && record.trip !== undefined
    && Boolean(requireReadableTripDocument(record.trip))
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
    .map((record) => ({ ...record, trip: normalizeLegacyGeneratedDayContext(requireReadableTripDocument(record.trip)) }))
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
  return isTripCacheRecord(parsed) && parsed.ownerId === ownerId && parsed.tripId === tripId ? normalizeLegacyGeneratedDayContext(requireReadableTripDocument(parsed.trip)) : null;
}

export function listTripRecoveriesFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const prefix = `${EASYT_TRIP_RECOVERY_PREFIX}${scopeToken(ownerId)}:`;
  const records = safeKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => parseStored(safeGet(storage, key)))
    .filter((value): value is TripRecoveryRecord => isTripRecoveryRecord(value) && value.ownerId === ownerId)
    .map((record) => ({ ...record, trip: normalizeLegacyGeneratedDayContext(requireReadableTripDocument(record.trip)) }))
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
    .map((record) => ({ ...record, trip: normalizeLegacyGeneratedDayContext(requireReadableTripDocument(record.trip)) }))
    .sort((left, right) => (Date.parse(right.cachedAt) || 0) - (Date.parse(left.cachedAt) || 0));
}

function nextRecoverySavedAt(existing: TripRecoveryRecord | null, requested?: string) {
  const candidate = requested ? Date.parse(requested) : Date.now();
  const previous = existing ? Date.parse(existing.savedAt) : Number.NaN;
  const next = Number.isFinite(candidate) ? candidate : Date.now();
  return new Date(Number.isFinite(previous) && previous >= next ? previous + 1 : next).toISOString();
}

export function sameRecoveryDocument(left: EasyTTrip, right: EasyTTrip) {
  left = prepareTripDocumentForWrite(left);
  right = prepareTripDocumentForWrite(right);
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

/** Complete persisted JSON equality, including revision and generated state.
 * Object property order is representational; arrays and every value remain exact.
 * Raw recovery/provenance bytes must still use their existing byte comparisons. */
export function samePersistedTripDocument(left: EasyTTrip, right: EasyTTrip) {
  return JSON.stringify(stableJsonValue(prepareTripDocumentForWrite(left)))
    === JSON.stringify(stableJsonValue(prepareTripDocumentForWrite(right)));
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
      ...(legacyItineraryIdeas(trip.brief.itineraryIdeas)).filter((idea) => idea.dayId === day.id).map((idea) => idea.title),
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

function travellerStructuredIntent(trip: EasyTTrip) {
  const structured = trip.brief.structuredBrief;
  if (!structured) return undefined;
  return {
    destinations: structured.destinations.map(({ id, name, canonicalPlaceId, placeMentionId, role, priority }) => ({ id, name, canonicalPlaceId, placeMentionId, role, priority })),
    mustVisit: structured.mustVisit.map(({ id, name, canonicalPlaceId, placeMentionId, role, priority }) => ({ id, name, canonicalPlaceId, placeMentionId, role, priority })),
    hardConstraints: structured.hardConstraints,
    placeMentions: (structured.placeMentions ?? []).map(({ mentionId, sourceText, canonicalName, canonicalPlaceId, parentCountries, coordinates, routability, directlyRoutable, requiresBaseSelection, isAnchor, role }) => ({ mentionId, sourceText, canonicalName, canonicalPlaceId, parentCountries, coordinates, routability, directlyRoutable, requiresBaseSelection, isAnchor, role })),
    placeSelections: structured.placeSelections,
    discoveryDraftByMentionId: nonEmptyRecord(structured.discoveryDraftByMentionId),
    countryDiscoveryChoices: structured.countryDiscoveryChoices && Object.keys(structured.countryDiscoveryChoices).length
      ? structured.countryDiscoveryChoices : undefined,
    completedPlanningAreaMentionIds: [...(structured.completedPlanningAreaMentionIds ?? [])].sort(),
    removedPlaceMentionIds: [...(structured.removedPlaceMentionIds ?? [])].sort(),
  };
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
function travellerRouteIntent(trip: EasyTTrip) {
  const intent = trip.brief.intent;
  if (!intent?.route) return intent;
  const identity = (place: typeof intent.route.origin) => place ? {
    name: place.name.trim().toLocaleLowerCase(), country: (place.country ?? "").trim().toLocaleLowerCase(),
  } : null;
  const { projectionInputKey: _key, ...route } = intent.route;
  return { ...intent, route: {
    ...route, origin: identity(route.origin),
    journeyEnd: route.journeyEnd.mode === "explicit" ? { mode: "explicit", place: identity(route.journeyEnd.place) } : route.journeyEnd,
    destinations: route.destinations.map(({ selectedPlace, resolution, ...destination }) => ({
      ...destination, selectedPlace: identity(selectedPlace),
      // Provider enrichment can resolve an already-bound stay. Unbound failure
      // and planning-area states remain recovery-relevant.
      resolution: destination.stopIds.length && selectedPlace ? "bound" : resolution,
    })),
  } };
}

function travellerAuthoredTripDocument(trip: EasyTTrip, compareCalendarIdentity: boolean) {
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
    // Canonical containers own stable identities, even when their guidance is
    // regenerated. Legacy planner rows retain their existing rebuild tolerance.
    calendar: compareCalendarIdentity
      ? sortedById(trip.planItems)?.map(({ id, stopId, dayNumber, date }) => ({ id, stopId, dayNumber, date }))
      : undefined,
    brief: {
      originIdentity,
      customTitle: brief.customTitle,
      journeyEnd: brief.journeyEnd,
      mustDo: brief.mustDo,
      pace: brief.pace,
      hotelChanges: brief.hotelChanges,
      budgetBand: brief.budgetBand,
      budgetPreference: brief.budgetPreference,
      selectedPlaces: nonEmptyRecord(brief.selectedPlaces) ?? {},
      dayAllocations: nonEmptyRecord(brief.dayAllocations),
      nightAllocations: nonEmptyRecord(brief.nightAllocations),
      manualNightStopIds: brief.manualNightStopIds?.length ? [...brief.manualNightStopIds].sort() : undefined,
      dayNotes: nonEmptyRecord(brief.dayNotes),
      customActivities: nonEmptyRecord(brief.customActivities),
      activitySchedule: authoredActivitySchedule(trip),
      itineraryIdeas: sortedById(nonEmptyArray(brief.itineraryIdeas)),
      structuredIntent: travellerStructuredIntent(trip),
      mapPins: sortedById(nonEmptyArray(brief.mapPins)),
      bookings: sortedById(nonEmptyArray(brief.bookings)),
      checklist: sortedById(nonEmptyArray(brief.checklist)),
      intent: travellerRouteIntent(trip),
      scheduleLocks: nonEmptyScheduleLocks(brief.scheduleLocks),
      decisionSelections: nonEmptyDecisionSelections(brief.decisionSelections),
      // Calendar identity and historical source payloads are durable work.
      // A same-route cloud read cannot acknowledge a newer counter or snapshot.
      builderCalendarGeneration: brief.builderCalendarGeneration,
      retainedAuthoredContent: brief.retainedAuthoredContent,
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
 * canonical owner/ID normalization. Generated legs, itinerary guidance, route
 * assessments and recommendations can be rebuilt from that state and must not
 * manufacture a second device edit immediately after a successful save.
 * Canonical calendar identities, generations and retained snapshots must match.
 */
export function tripDocumentsCanonicalEquivalent(
  localTrip: EasyTTrip,
  canonicalTrip: EasyTTrip,
  ownerId = canonicalTrip.ownerId,
) {
  if (!ownerId || localTrip.id !== canonicalTrip.id) return false;
  // Decide before write preparation upgrades a legacy representation to v2.
  const compareCalendarIdentity = localTrip.schemaVersion === 2 && canonicalTrip.schemaVersion === 2;
  const normalizedLocal = canonicalTripForOwner(ownerId, localTrip, canonicalTrip.updatedAt);
  const normalizedCanonical = canonicalTripForOwner(ownerId, canonicalTrip, canonicalTrip.updatedAt);
  return JSON.stringify(stableJsonValue(travellerAuthoredTripDocument(normalizedLocal, compareCalendarIdentity)))
    === JSON.stringify(stableJsonValue(travellerAuthoredTripDocument(normalizedCanonical, compareCalendarIdentity)));
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

function recoveryHandlesMatch(left: TripRecoveryHandle, right: TripRecoveryHandle) {
  return left.ownerId === right.ownerId
    && left.tripId === right.tripId
    && left.writeId === right.writeId;
}

/**
 * Classify recovery separately from the current save indicator. A durable
 * record is a current save only while this mounted document owns its exact
 * write handle; after reload it is historical recovery, regardless of the
 * persisted failure label. Timestamp ordering is deliberately not used.
 */
export function classifyTripRecovery({
  recovery,
  canonicalTrip,
  previousCanonicalTrip,
  currentWrite,
}: {
  recovery: TripRecoveryRecord | null;
  canonicalTrip: EasyTTrip;
  previousCanonicalTrip?: EasyTTrip | null;
  currentWrite?: TripRecoveryHandle | null;
}): TripRecoveryClassification {
  if (!recovery) return "clean";
  if (currentWrite && recoveryHandlesMatch(recovery, currentWrite)) {
    return recovery.state === "pending" ? "pending-current-save" : "current-save-failed";
  }
  // An ownerless trip has no separate canonical cloud document. When the
  // resolver reopened this exact durable guest recovery, it is the active
  // local document and its write handle must remain available for subsequent
  // edits. A different guest document is still genuine divergence and remains
  // protected below.
  if (recovery.ownerId === null
    && canonicalTrip.ownerId === null
    && recovery.tripId === canonicalTrip.id
    && recovery.trip.id === canonicalTrip.id
    && recovery.trip.ownerId === null
    && sameRecoveryDocument(recovery.trip, canonicalTrip)) {
    return "active-local-document";
  }
  if (tripRecoveryMatchesCanonical(recovery, canonicalTrip)) return "equivalent";
  if (previousCanonicalTrip && tripRecoveryMatchesCanonical(recovery, previousCanonicalTrip)) {
    return "historical-superseded";
  }
  return "genuine-divergence";
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
    /** The async broker retires a predecessor only after all required metadata verifies. */
    deferRetirement?: boolean;
  } = {},
): TripRecoveryWriteResult {
  try { trip = prepareTripDocumentForWrite(trip); }
  catch (error) { reportQaPersistenceBoundary("recovery-preparation", "recovery-candidate", {accepted:false,writeAttempted:false}); throw error; }
  reportQaPersistenceBoundary("recovery-preparation", "recovery-candidate", {accepted:true,writeAttempted:false});
  const ownerId = options.ownerId === undefined ? trip.ownerId : options.ownerId;
  const writeId = options.writeId ?? generatedWriteId();
  const handle = { ownerId, tripId: trip.id, writeId };
  if (!recoveryScopeAcceptsTrip(ownerId, trip)) { reportQaPersistenceBoundary("recovery-preparation", "recovery-scope", {accepted:false,scopeMatches:false,writeAttempted:false}); return { stored: false, handle, blockedByExistingRecovery: true, failureReason: "scope-mismatch", writeAttempted: false, failureBoundary: "entry-scope" }; }
  reportQaPersistenceBoundary("recovery-preparation", "recovery-scope", {accepted:true,scopeMatches:true,writeAttempted:false});
  const existing = loadTripRecoveryFromStorage(storage, trip.id, ownerId);
  if (existing) {
    // A render/autosave of the same durable document is not a new edit. Build
    // waits for an acknowledgement keyed to this write ID; rotating it for a
    // render-equivalent autosave would turn a successful canonical response
    // into a false stale-write result.
    if (sameRecoveryDocument(existing.trip, trip)) {
      reportQaPersistenceBoundary("recovery-preparation", "recovery-replacement", {accepted:true,writeBranch:"exact-reuse",writeAttempted:false});
      setCurrentTripInStorage(storage, ownerId, trip.id, [tripRecoveryStorageKey(ownerId, trip.id)]);
      const pointerAcknowledged = loadCurrentTripIdFromStorage(storage, ownerId) === trip.id;
      return { stored: true, handle: existing, blockedByExistingRecovery: false, pointerAcknowledged, writeAttempted: true,
        ...(!pointerAcknowledged ? { failureReason: "pointer-incomplete" as const } : {}) };
    }
    const expected = options.replace;
    const replacingExactWrite = expected?.ownerId === ownerId
      && expected.tripId === trip.id
      && expected.writeId === existing.writeId;
    if (!replacingExactWrite) {
      reportQaPersistenceBoundary("recovery-preparation", "recovery-replacement", {accepted:false,writeAttempted:false});
      // Any different document must prove it was opened from this exact
      // recovery before replacing it; a canonical cloud view never has that
      // handle.
      return { stored: false, handle: existing, blockedByExistingRecovery: true, failureReason: "protected-recovery", writeAttempted: false, failureBoundary: "protected-recovery" };
    }
  }
  reportQaPersistenceBoundary("recovery-preparation", "recovery-replacement", {accepted:true,writeBranch:"new-write",writeAttempted:false});
  const record: TripRecoveryRecord = {
    version: 2,
    ownerId,
    tripId: trip.id,
    trip,
    state: options.state ?? "pending",
    writeId,
    savedAt: nextRecoverySavedAt(existing, options.now),
  };
  const legacy = migrateLegacyTripFromStorage(storage, ownerId);
  if (legacy?.id === trip.id) record.legacySourceRaw = safeGet(storage, EASYT_ACTIVE_TRIP_KEY) ?? undefined;
  // Each write has an immutable key. An ACK or status update can therefore
  // touch only the exact write it was given, even if another tab writes in the
  // middle of the operation.
  const recoveryKey = tripRecoveryStorageKey(ownerId, trip.id, writeId);
  let nativeFailure: TripRecoveryWriteResult["nativeFailure"];
  let initialSetterFailure: TripRecoveryWriteResult["nativeFailure"], setterFailure: TripRecoveryWriteResult["nativeFailure"], cleanupFailure: TripRecoveryWriteResult["nativeFailure"];
  let sawSetter = false, setterRetried = false;
  let failedOperation: "setter" | "cleanup" | undefined;
  const bytes = JSON.stringify(record);
  const written = safeSet(storage, recoveryKey, bytes, [], error => {
    const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
    nativeFailure = isQuotaError(error) ? "quota" : name === "SecurityError" ? "security" : name === "InvalidStateError" ? "unavailable" : "unknown";
  }, (operation, accepted) => {
    if (operation === "setter") {
      if (!sawSetter) initialSetterFailure = accepted ? undefined : nativeFailure;
      else setterRetried = true;
      sawSetter = true;
      setterFailure = accepted ? undefined : nativeFailure;
      if (accepted) failedOperation = undefined;
    } else cleanupFailure = accepted ? undefined : nativeFailure;
    if (!accepted) failedOperation = operation;
    reportQaPersistenceBoundary("native-write", operation === "setter" ? "recovery-write" : "recovery-cleanup", {phase:"probe",accepted,operation,
      writeAttempted:operation === "setter",writeAccepted:operation === "setter" ? accepted : undefined,
      nativeFailure:accepted ? undefined : nativeFailure,initialSetterFailure,setterFailure,cleanupFailure,failedOperation,setterRetried,writeBranch:"new-write"});
  });
  // A quota retry that succeeds is no longer a rejected native write.
  if (written) nativeFailure = undefined;
  reportQaPersistenceBoundary("native-write", "recovery-write", {accepted:written,operation:"write-result",writeAttempted:true,writeAccepted:written,writeBranch:"new-write",
    nativeFailure:setterFailure,initialSetterFailure,setterFailure,cleanupFailure,failedOperation,setterRetried});
  const readbackConfirmed = written ? safeGet(storage, recoveryKey) === bytes : undefined;
  if (written) reportQaPersistenceBoundary("native-write", "recovery-readback", {accepted:readbackConfirmed,writeAttempted:true,writeAccepted:true,readbackConfirmed,readbackKind:"recovery",writeBranch:"new-write"});
  const stored = written && readbackConfirmed === true;
  let pointerAcknowledged = false;
  if (stored) {
    setCurrentTripInStorage(storage, ownerId, trip.id, [recoveryKey]);
    pointerAcknowledged = loadCurrentTripIdFromStorage(storage, ownerId) === trip.id;
    if (pointerAcknowledged && existing && options.replace && !options.deferRetirement) {
      const replacedKey = recoveryRecordKey(storage, options.replace);
      if (replacedKey && replacedKey !== recoveryKey) safeRemove(storage, replacedKey);
    }
  }
  return { stored, handle, blockedByExistingRecovery: false, pointerAcknowledged, writeAttempted: true,
    ...(readbackConfirmed !== undefined ? { readbackConfirmed } : {}),
    ...(!stored ? { failureBoundary: written ? "recovery-readback" as const : "recovery-write" as const } : {}),
    ...(!stored ? { failureReason: nativeFailure ? "device-unavailable" as const : "unknown" as const, ...(nativeFailure ? { nativeFailure } : {}) }
      : !pointerAcknowledged ? { failureReason: "pointer-incomplete" as const } : {}) };
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
    deferRetirement?: boolean;
  } = {},
): TripRecoveryWriteResult {
  const ownerId = options.ownerId === undefined ? trip.ownerId : options.ownerId;
  migrateLegacyTripFromStorage(storage, ownerId);
  const result = writeTripRecoveryToStorage(storage, normalizeLegacyGeneratedDayContext(trip), options);
  return { ...result, recoveryDurable: result.stored, outcome: recoveryPersistenceOutcome(result) };
}

function writeCanonicalTripCacheToStorage(
  storage: EasyTBrowserStorage,
  trip: EasyTTrip,
  now = new Date().toISOString(),
) {
  trip = normalizeLegacyGeneratedDayContext(prepareTripDocumentForWrite(trip));
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
  trip = prepareTripDocumentForWrite(trip);
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
  // An in-flight inverse can equal the previous canonical document while the
  // preceding Add is being acknowledged. Keep that newer recovery until its
  // own save resolves; historical snapshots may still be retired as before.
  const rawRecovery = currentRecovery ? recoveryRecordForHandle(storage, currentRecovery) : null;
  // Representation-only read migration is not a durable acknowledgement.
  const sameDocumentVersion = rawRecovery?.trip.schemaVersion === trip.schemaVersion;
  const redundantRecovery = Boolean(currentRecovery && sameDocumentVersion && (
    tripRecoveryMatchesCanonical(currentRecovery, trip)
      || (previousCanonical
        && !tripRecoveryIsAwaitingCanonicalSave(currentRecovery)
        && tripRecoveryMatchesCanonical(currentRecovery, previousCanonical))
  ));
  const recoveryResolved = stored && currentRecovery && (acknowledgedRecovery || redundantRecovery)
    ? resolveTripRecoveryInStorage(storage, currentRecovery)
    : false;
  // Only the exact successful write may acknowledge the legacy source it
  // observed. Keep its bytes, and never hide a later old-client edit.
  if (stored && acknowledgedRecovery && recoveryRecord?.legacySourceRaw
    && safeGet(storage, EASYT_ACTIVE_TRIP_KEY) === recoveryRecord.legacySourceRaw) {
    const sourceOwnerId = (parseStored(recoveryRecord.legacySourceRaw) as { ownerId?: unknown } | null)?.ownerId;
    safeSet(storage, `${EASYT_ACTIVE_TRIP_KEY}:acknowledged`, JSON.stringify({ ownerId: trip.ownerId, sourceOwnerId, tripId: trip.id, source: recoveryRecord.legacySourceRaw }));
  }
  return { stored, recoveryResolved };
}

export type TripBuildSaveAcknowledgement = {
  outcome: "acknowledged" | "device-newer" | "invalid-canonical" | "storage-failed";
  remainingRecovery: TripRecoveryRecord | null;
  /** Exact trusted account response remains true when optional cache persistence fails. */
  accountAcknowledged?: boolean;
  cacheStored?: boolean;
  deviceOutcome?: PersistenceOutcome;
};

/**
 * Accept an authoritative Builder save without confusing a later provider-only
 * reconstruction with a second traveller edit. The cache boundary already
 * retires a recovery only when its traveller-authored state is canonical-
 * equivalent; a genuinely newer device edit therefore remains recoverable.
 */
export function acknowledgeTripBuildSaveInStorage(
  storage: EasyTBrowserStorage,
  reviewedTrip: EasyTTrip,
  canonicalTrip: EasyTTrip,
  submittedRecovery: TripRecoveryHandle,
): TripBuildSaveAcknowledgement {
  if (canonicalTrip.id !== submittedRecovery.tripId
    || canonicalTrip.ownerId !== submittedRecovery.ownerId
    || !tripBuildDocumentsCanonicalEquivalent(
      reviewedTrip,
      canonicalTrip,
      submittedRecovery.ownerId,
    )) {
    return {
      outcome: "invalid-canonical",
      remainingRecovery: loadTripRecoveryFromStorage(
        storage,
        submittedRecovery.tripId,
        submittedRecovery.ownerId,
      ),
    };
  }

  const cached = cacheCanonicalTripWithRecoveryToStorage(
    storage,
    canonicalTrip,
    submittedRecovery,
  );
  const remainingRecovery = loadTripRecoveryFromStorage(
    storage,
    canonicalTrip.id,
    canonicalTrip.ownerId,
  );
  if (!cached.stored) return { outcome: "storage-failed", remainingRecovery };
  return {
    outcome: remainingRecovery ? "device-newer" : "acknowledged",
    remainingRecovery,
  };
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

/** Retain the legacy bytes; reading never creates or acknowledges a write. */
function migrateLegacyTripFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const raw = safeGet(storage, EASYT_ACTIVE_TRIP_KEY);
  const value = parseStored(raw);
  if (!value || typeof value !== "object") return null;
  const sourceOwner = (value as { ownerId?: unknown }).ownerId;
  if (sourceOwner && sourceOwner !== ownerId) return null;
  const acknowledgement = parseStored(safeGet(storage, `${EASYT_ACTIVE_TRIP_KEY}:acknowledged`)) as { ownerId?: unknown; sourceOwnerId?: unknown; tripId?: unknown; source?: unknown } | null;
  // A promoted guest source has been consumed by its acknowledged owner;
  // it must not reappear as a guest draft for the next signed-in account.
  if (acknowledgement && (acknowledgement.ownerId === ownerId || acknowledgement.sourceOwnerId === null)
    && acknowledgement.tripId === (value as { id?: unknown }).id && acknowledgement.source === raw) return null;
  return requireReadableTripDocument(value);
}

function legacyRecoveryFromStorage(storage: EasyTBrowserStorage, ownerId: string | null): TripRecoveryRecord | null {
  const trip = migrateLegacyTripFromStorage(storage, ownerId);
  return trip ? { version: 2, ownerId: trip.ownerId ?? ownerId, tripId: trip.id,
    trip, state: "pending", writeId: "legacy-source", savedAt: trip.updatedAt } : null;
}

export function loadCurrentTripRecoveryFromStorage(
  storage: EasyTBrowserStorage,
  ownerId: string | null,
) {
  // Preserve an unacknowledged legacy source without writing during reads.
  migrateLegacyTripFromStorage(storage, ownerId);
  const currentId = loadCurrentTripIdFromStorage(storage, ownerId);
  const current = currentId ? loadTripRecoveryFromStorage(storage, currentId, ownerId) : null;
  if (current) return current;
  const latest = listTripRecoveriesFromStorage(storage, ownerId)[0] ?? null;
  if (latest) return latest;
  return legacyRecoveryFromStorage(storage, ownerId);
}

/** A queryless new Builder visit may resume only the draft this owner left current. */
export function loadCurrentDraftRecoveryFromStorage(storage: EasyTBrowserStorage, ownerId: string | null) {
  const currentId = loadCurrentTripIdFromStorage(storage, ownerId);
  const recovery = currentId ? loadTripRecoveryFromStorage(storage, currentId, ownerId) : null;
  return recovery?.trip.status === "draft" ? recovery : null;
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
  // Unacknowledged legacy input remains recovery; an exact save ACK allows
  // the canonical cache to become authoritative without deleting its source.
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
  // Keep unacknowledged legacy input visible until its exact save succeeds.
  if (legacy && safeGet(storage, EASYT_ACTIVE_TRIP_KEY)) {
    const scopedOwner = legacy.ownerId ?? ownerId;
    const newerRecovery = loadTripRecoveryFromStorage(storage, legacy.id, scopedOwner);
    return newerRecovery?.trip ?? legacy;
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
    broadcastRecoveryChange(detail);
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
  if(tripId==='')return key===currentTripStorageKey(ownerId)||Boolean(key?.startsWith(tripRecoveryStorageKey(ownerId,'')))||Boolean(key?.startsWith(tripCacheStorageKey(ownerId,'')));
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
    if (detail?.ownerId === ownerId && (tripId==='' || detail.tripId === tripId || detail.tripId === null)) listener(detail);
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

export async function loadActiveTrip(ownerId:string|null=null):Promise<EasyTTrip|null> {
  if(typeof window==='undefined')return null;
  const broker=await browserTripPersistence(ownerId),current=await broker.current();
  if(current.kind==='protected'||current.kind==='unavailable')throw new BrowserRecoveryReadError(current.kind,current.reason);
  if(current.kind==='found')return current.trip;
  if(current.currentCleared)return null;
  const listed=await broker.list();if(listed.kind!=='ready')throw new BrowserRecoveryReadError(listed.kind,listed.reason);
  if(listed.recoveries.some(record=>record.backend==='indexeddb'))throw new BrowserRecoveryReadError('protected','current-unconfirmed');
  const legacy=loadActiveTripFromStorage(browserRecoveryStorage(),ownerId);
  return legacy?loadLocalTrip(legacy.id,ownerId):null;
}

let ownerAddressSequence = 0;
let requestedAddress: string | null | undefined;
let pendingAddress: Promise<boolean> | null = null;
function writeRememberedAddress(ownerId: string | null): Promise<boolean> {
  if (requestedAddress === ownerId && pendingAddress) return pendingAddress;
  if (requestedAddress !== ownerId) invalidateBrowserRecoveryScope();
  requestedAddress = ownerId;
  const sequence = ++ownerAddressSequence;
  const current = () => sequence === ownerAddressSequence;
  const work = async () => {
    try {
      const { createDurableOwnerAddress } = await import('./durable-owner-address.ts');
      const result = await createDurableOwnerAddress(browserRecoveryStorage(), await browserRecoveryDriver(), current).write(ownerId);
      if (result.kind !== 'verified' || !current()) return false;
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(EASYT_LAST_OWNER_CHANGE_EVENT));
      return true;
    } catch { return false; }
  };
  const promise = work(); pendingAddress = promise;
  void promise.finally(() => { if (pendingAddress === promise) pendingAddress = null; });
  return promise;
}
export function rememberLastOwner(ownerId: string) { return writeRememberedAddress(ownerId); }
export async function loadRememberedOwner(): Promise<string | null> {
  const sequence = ownerAddressSequence;
  try {
    const { createDurableOwnerAddress } = await import('./durable-owner-address.ts');
    const result = await createDurableOwnerAddress(browserRecoveryStorage(), await browserRecoveryDriver(), () => sequence === ownerAddressSequence).read();
    return sequence === ownerAddressSequence && result.kind === 'ready' ? result.ownerId : null;
  } catch { return null; }
}
export function forgetRememberedOwner() {
  // Retire pending address writes synchronously. Clearing this noncredential
  // native hint preserves the existing sign-out fence, never any trip bytes.
  ownerAddressSequence++; invalidateBrowserRecoveryScope(); requestedAddress = undefined;
  const storage = browserStorage(); if (storage) forgetRememberedOwnerInStorage(storage);
  return writeRememberedAddress(null);
}
/** Subscribers cannot install an older async result after another refresh or unmount. */
export function observeRememberedOwner(publish: (owner: string | null) => void, ready?: () => void) {
  let active = true, revision = 0;
  return {
    refresh: () => { const requested = ++revision; void loadRememberedOwner().then(owner => {
      if (!active || requested !== revision) return; publish(owner); ready?.();
    }); },
    dispose: () => { active = false; revision++; },
  };
}

/** One protected broker observation: an acknowledged document may have no pending recovery. */
export async function loadTripWorkspaceDocument(tripId:string,ownerId:string|null):Promise<{trip:EasyTTrip;recovery:TripRecoveryRecord|null}|null> {
  if(typeof window==='undefined')return null;
  const read=await (await browserTripPersistence(ownerId)).read(tripId);
  if(read.kind==='protected'||read.kind==='unavailable')throw new BrowserRecoveryReadError(read.kind,read.reason);
  return read.kind==='found'?{trip:read.trip,recovery:read.recovery}:null;
}

export async function loadTripRecovery(tripId:string,ownerId:string|null):Promise<TripRecoveryRecord|null> {
  if(typeof window==='undefined')return null;
  const read=await (await browserTripPersistence(ownerId)).read(tripId);
  if(read.kind==='protected'||read.kind==='unavailable')throw new BrowserRecoveryReadError(read.kind,read.reason);
  return read.kind==='found'?read.recovery:null;
}

/** Read only the last acknowledged cloud document for this owner and trip. */
export async function loadCachedTrip(tripId:string,ownerId:string|null):Promise<EasyTTrip|null> {
  if(typeof window==='undefined')return null;
  const read=await (await browserTripPersistence(ownerId)).cached(tripId);
  if(read.kind==='protected'||read.kind==='unavailable')throw new BrowserRecoveryReadError(read.kind,read.reason);
  return read.kind==='found'?read.trip:null;
}

export async function loadLocalTrip(tripId:string,ownerId:string|null,options:{recoveryOnly?:boolean}={}):Promise<EasyTTrip|null> {
  if(typeof window==='undefined')return null;
  const read=await (await browserTripPersistence(ownerId)).read(tripId);
  if(read.kind==='protected'||read.kind==='unavailable')throw new BrowserRecoveryReadError(read.kind,read.reason);
  return read.kind==='found'&&(!options.recoveryOnly||read.recovery)?read.trip:null;
}

export async function loadCurrentTripRecovery(ownerId:string|null):Promise<TripRecoveryRecord|null> {
  if(typeof window==='undefined')return null;
  const broker=await browserTripPersistence(ownerId),read=await broker.current();
  if(read.kind==='protected'||read.kind==='unavailable')throw new BrowserRecoveryReadError(read.kind,read.reason);
  if(read.kind==='found')return read.recovery;
  if(read.currentCleared)return null;
  const listed=await broker.list();if(listed.kind!=='ready')throw new BrowserRecoveryReadError(listed.kind,listed.reason);
  if(listed.recoveries.length>1)throw new BrowserRecoveryReadError('protected','current-unconfirmed');
  if(listed.recoveries.length===1)return listed.recoveries[0];
  const old=loadCurrentTripRecoveryFromStorage(browserRecoveryStorage(),ownerId);
  return old?loadTripRecovery(old.tripId,ownerId):null;
}

export async function loadCurrentDraftRecovery(ownerId:string|null):Promise<TripRecoveryRecord|null> {
  if(typeof window==='undefined')return null;
  const read=await (await browserTripPersistence(ownerId)).current();
  if(read.kind==='protected'||read.kind==='unavailable')throw new BrowserRecoveryReadError(read.kind,read.reason);
  return read.kind==='found'&&read.recovery?.trip.status==='draft'?read.recovery:null;
}

/** List every newest trip-scoped recovery for this exact owner. */
export async function listTripRecoveries(ownerId:string|null):Promise<TripRecoveryRecord[]> {
  if(typeof window==='undefined')return [];
  const read=await (await browserTripPersistence(ownerId)).list();
  if(read.kind!=='ready')throw new BrowserRecoveryReadError(read.kind,read.reason);
  return read.recoveries;
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
export async function claimGuestTripRecoveryForOwner(tripId:string,ownerId:string) {
  const guard=browserRecoveryGuard();
  const storage=browserStorage();if(!storage)return null;
  try {
    const guestBroker=await browserTripPersistence(null,guard),ownerBroker=await browserTripPersistence(ownerId,guard);
    const guest=await guestBroker.read(tripId),owned=await ownerBroker.read(tripId);
    if(guest.kind==='missing')return null;
    const fallback={stored:false,handle:{ownerId,tripId,writeId:guest.kind==='found'?guest.recovery?.writeId??generatedWriteId():generatedWriteId()},blockedByExistingRecovery:true,guestResolved:false};
    if(guest.kind!=='found'||owned.kind==='protected'||owned.kind==='unavailable')return fallback;
    if(guest.domain?.envelope||owned.kind==='found'&&owned.domain?.envelope) {
      const result=await createRecoveryClaimCoordinator(storage,await browserRecoveryDriver(),{
        ownerId,isCurrent:guard,enabled:RECOVERY_DOMAIN_CLAIM_ENABLED}).claim(tripId);
      if(result.kind!=='verified')return {...fallback,claimHeldReason:result.reason};
      dispatchTripStorageChange({kind:'recovery',ownerId,tripId});
      return {stored:true,handle:result.handle,blockedByExistingRecovery:false,guestResolved:false};
    }
    // The historical two-step native claim retires source bytes and cannot
    // prove the full metadata transfer. This eligibility path stays held.
    return {...fallback,claimHeldReason:'native-guest-claim-unqualified',failureReason:'receipt-incomplete' as const,outcome:'receipt-incomplete' as const};
  }catch{return {stored:false,handle:{ownerId,tripId,writeId:generatedWriteId()},blockedByExistingRecovery:true,guestResolved:false};}
}

export async function saveExplicitGuestTripForOwnerInStorage(storage:EasyTBrowserStorage,driver:import('./durable-recovery-domain.ts').RecoveryDomainDriver,context:{ownerId:string;isCurrent:()=>boolean;overflowEnabled:boolean;accountOverflowQualified:boolean},tripId:string,request:typeof fetch=fetch) {
  const {createTwoStoreTripPersistence}=await import('./two-store-trip-persistence.ts');
  const {createTwoStoreEntryPersistence}=await import('./two-store-entry-persistence.ts');
  const {createDurableHomepagePersistence,decodeHomepageBundle}=await import('./homepage-persistence.ts');
  const {builderInputDraftKey,readBuilderInputDraft,remapBuilderInputDraftIdentity}=await import('./trip-builder-input-draft.ts');
  const {homepageInputStorageKey,homepageDraftStorageKey}=await import('./private-browser-context.ts');
  const {HOME_TRIP_DRAFT_KEY}=await import('./home-trip-handoff.ts');
  const {rebindGuestSaveInputs}=await import('./recovery-claim-inputs.ts');
  const {canonicalTripStopIdentityMap}=await import('./trip-promotion.ts');
  const active=()=>context.isCurrent()===true,ownerId=context.ownerId;
  if(!ownerId.trim()||!active())throw new BrowserRecoveryReadError('protected','operation-changed');
  const guestContext={...context,ownerId:null},guestStore=createTwoStoreTripPersistence(storage,driver,guestContext),ownedStore=createTwoStoreTripPersistence(storage,driver,context);
  const inputStore=createTwoStoreEntryPersistence(storage,driver,{...guestContext,scope:{ownerId:null,kind:'builder-input',tripId},key:builderInputDraftKey(null,tripId),validate:raw=>raw===null||typeof raw==='string'});
  const guestHome=createDurableHomepagePersistence(storage,driver,guestContext),ownerHome=createDurableHomepagePersistence(storage,driver,context);
  const nativeWitness=()=>{
    const prefix=tripRecoveryStorageKey(null,tripId),keys=[builderInputDraftKey(null,tripId),homepageInputStorageKey(null),homepageDraftStorageKey(null),HOME_TRIP_DRAFT_KEY,tripCacheStorageKey(null,tripId),EASYT_ACTIVE_TRIP_KEY];
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&(key===prefix||key.startsWith(prefix+':')))keys.push(key);}
    return JSON.stringify([...new Set(keys)].sort().map(key=>[key,storage.getItem(key)]));
  };
  const observe=async()=>{
    const native=nativeWitness();
    const body=await guestStore.read(tripId),input=await inputStore.read(),home=await guestHome.read();
    if(!active()||body.kind!=='found'||!body.recovery||body.trip.ownerId!==null||body.recovery.state==='conflict'||input.kind!=='ready'||home.kind!=='ready')throw new BrowserRecoveryReadError('protected','guest-source-not-ready');
    if(native!==nativeWitness())throw new BrowserRecoveryReadError('protected','guest-native-changed');
    return {body,input,home,native};
  };
  const ownerCacheKey=tripCacheStorageKey(ownerId,tripId);let ownerCacheWitness=storage.getItem(ownerCacheKey);
  const source=await observe(),sourceKey=JSON.stringify(source),owned=await ownedStore.read(tripId),destinationHome=await ownerHome.read();
  if((owned.kind!=='missing'&&(owned.kind!=='found'||!tripBuildDocumentsCanonicalEquivalent(source.body.trip,owned.trip,ownerId)))||destinationHome.kind!=='ready'||destinationHome.draft)throw new BrowserRecoveryReadError('protected','destination-exists');
  const targetInput=createTwoStoreEntryPersistence(storage,driver,{...context,scope:{ownerId,kind:'builder-input',tripId},key:builderInputDraftKey(ownerId,tripId),validate:raw=>raw===null||typeof raw==='string'});
  const targetInputBefore=await targetInput.read();
  if(targetInputBefore.kind!=='ready')throw new BrowserRecoveryReadError('protected','destination-input-exists');
  const trip=requireReadableTripDocument(source.body.trip),domain=source.body.domain?.envelope;
  const prepared=rebindGuestSaveInputs({trip,input:domain?.entry.input??null,receipt:domain?.entry.receipt??null},source.input.raw,source.home.raw,ownerId);
  if(prepared.kind!=='ready')throw new BrowserRecoveryReadError('protected',prepared.reason);
  const prospective=requireReadableTripDocument(canonicalTripForOwner(ownerId,trip));
  const desiredInput=prepared.builderRaw===null?null:JSON.stringify(remapBuilderInputDraftIdentity(JSON.parse(prepared.builderRaw),requireReadableTripDocument({...trip,ownerId}),prospective,canonicalTripStopIdentityMap(trip),ownerId));
  const desiredHome=prepared.homepageRaw===null?null:decodeHomepageBundle(prepared.homepageRaw,ownerId);
  if(targetInputBefore.raw!==null&&targetInputBefore.raw!==desiredInput||destinationHome.storedInput&&destinationHome.inputRaw!==desiredHome?.bundle.inputRaw)throw new BrowserRecoveryReadError('protected','destination-input-exists');

  if(JSON.stringify(await observe())!==sourceKey)throw new BrowserRecoveryReadError('protected','guest-source-changed');
  // Bind the authenticated destination on the server as well as at readback.
  // A changed browser account must never promote this submission into that account.
  const scopedRequest:typeof fetch=async(url,init)=>{
    if(!active())throw new BrowserRecoveryReadError('protected','operation-changed');
    const headers=new Headers(init?.headers);headers.set('x-morrovia-expected-owner',ownerId);
    return request(url,{...init,headers});
  };
  const canonical=await saveTripRecoveryToEasyT(trip,{...source.body.recovery!,ownerId},scopedRequest);
  if(canonical.ownerId!==ownerId||canonical.id!==tripId||!tripBuildDocumentsCanonicalEquivalent(trip,canonical,ownerId))throw new BrowserRecoveryReadError('protected','account-ack-mismatch');
  // Account ACK and local continuation are separate. Every guest byte remains
  // protected even if scope/source changes or device persistence fails now.
  try {
  if(!active()||JSON.stringify(await observe())!==sourceKey)return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
  const currentOwned=await ownedStore.read(tripId),currentHome=await ownerHome.read(),currentInput=await targetInput.read();
  if(JSON.stringify(currentOwned)!==JSON.stringify(owned)||currentHome.kind!=='ready'||currentHome.raw!==destinationHome.raw||JSON.stringify(currentInput)!==JSON.stringify(targetInputBefore))return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
  const writeId=generatedWriteId(),entries:import('./durable-entry-protocol.ts').RecoveryEntryWrite[]=[];
  let input:import('./durable-recovery-domain.ts').RecoveryEnvelope['entry']['input']=null;
  if(prepared.builderRaw!==null){
    const rebound=remapBuilderInputDraftIdentity(JSON.parse(prepared.builderRaw),requireReadableTripDocument({...trip,ownerId}),requireReadableTripDocument(canonical),canonicalTripStopIdentityMap(trip),ownerId);
    const staged=await createDurableBuilderInputPersistence(storage,driver,{...context,trip:requireReadableTripDocument(canonical)}).prepare(rebound,writeId+':input');
    if(!staged.ok)return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
    const envelope=JSON.parse(staged.entry.raw);
    if(envelope.retainedPreviousRaw!==targetInputBefore.raw||JSON.stringify(staged.entry.expectedHead)!==JSON.stringify(targetInputBefore.envelope?.handle??null))return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
    entries.push(staged.entry);input=staged.input;
  }
  let receipt:import('./durable-recovery-domain.ts').RecoveryEnvelope['entry']['receipt']=null;
  if(prepared.homepageRaw!==null&&prepared.receipt){
    const bundle=decodeHomepageBundle(prepared.homepageRaw,ownerId)!;
    // Never replace the shared HOME slot. Its foreign raw bytes remain a
    // CAS witness, while only the account-scoped completed input is copied.
    const staged=await ownerHome.prepare(async stage=>{stage.setItem(homepageInputStorageKey(ownerId),bundle.bundle.inputRaw!);},writeId+':home');
    if(staged.kind!=='prepared')return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
    const envelope=JSON.parse(staged.entry.raw);
    if(envelope.retainedPreviousRaw!==destinationHome.raw||envelope.legacyRaw!==destinationHome.legacyRaw||JSON.stringify(staged.entry.expectedHead)!==JSON.stringify(destinationHome.envelope?.handle??null))return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
    entries.push(staged.entry);receipt={...prepared.receipt,raw:staged.raw};
  }
  if(JSON.stringify(await observe())!==sourceKey)return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
  const stillCurrent=()=>active()&&nativeWitness()===source.native&&storage.getItem(ownerCacheKey)===ownerCacheWitness;
  const saved=await createTwoStoreTripPersistence(storage,driver,{...context,isCurrent:stillCurrent}).save(canonical,{newTripOrClone:owned.kind==='missing',...(owned.kind==='found'?{canonicalBase:owned.trip,expectedRecoverySource:owned.trip,...(owned.recovery?{replace:owned.recovery}:{})}:{}),writeId,entries,entry:{pointer:{version:1,backend:'indexeddb',ownerId,tripId,writeId},input,receipt}});
  if(!saved.stored||!active())return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
  if(!stillCurrent())return {trip:canonical,accountAcknowledged:true,deviceComplete:false};
  const acknowledgedStorage:EasyTBrowserStorage={get length(){return storage.length},key:index=>storage.key(index),getItem:key=>storage.getItem(key),removeItem:key=>storage.removeItem(key),setItem(key,raw){
    if(key===ownerCacheKey&&(!stillCurrent()||storage.getItem(key)!==ownerCacheWitness))throw new Error('Account cache changed');
    storage.setItem(key,raw);if(key===ownerCacheKey)ownerCacheWitness=raw;
  }};
  const acknowledged=await createTwoStoreTripPersistence(acknowledgedStorage,driver,{...context,isCurrent:stillCurrent}).acknowledge(canonical,canonical,saved.handle);
  const sourceUnchanged=active()&&JSON.stringify(await observe())===sourceKey;
  return {trip:canonical,accountAcknowledged:true,deviceComplete:sourceUnchanged&&acknowledged.outcome==='acknowledged'&&(!acknowledged.deviceOutcome||acknowledged.deviceOutcome==='device-confirmed'||acknowledged.deviceOutcome==='account-acknowledged')};
  }catch{return {trip:canonical,accountAcknowledged:true,deviceComplete:false};}
}

/** Explicit saved=1 continuation only; ordinary account readers never inspect guest scope. */
export async function saveExplicitGuestTripForOwner(tripId:string,ownerId:string,isCurrent:()=>boolean) {
  return saveExplicitGuestTripForOwnerInStorage(browserRecoveryStorage(),await browserRecoveryDriver(),{ownerId,isCurrent:browserRecoveryGuard(isCurrent),overflowEnabled:RECOVERY_DOMAIN_OVERFLOW_ENABLED,accountOverflowQualified:RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED},tripId);
}

export async function saveTripRecovery(trip:EasyTTrip,options:{ownerId?:string|null;state?:TripRecoveryState;replace?:TripRecoveryHandle;accountSavePending?:boolean;
  isCurrent?:()=>boolean;newTripOrClone?:boolean;canonicalBase?:EasyTTrip;expectedRecoverySource?:EasyTTrip;draft?:BuilderInputDraft;intake?:RecoveryIntakeAcknowledgement;projectionOnly?:{acceptedRevision:number;inputRevision:number};}={}):Promise<TripRecoveryWriteResult> {
  const candidate=prepareTripDocumentForWrite(structuredClone(trip)),ownerId=options.ownerId===undefined?candidate.ownerId:options.ownerId;
  const guard=browserRecoveryGuard(options.isCurrent),writeId=generatedWriteId();
  const fallback:TripRecoveryWriteResult={stored:false,handle:{ownerId,tripId:candidate.id,writeId},blockedByExistingRecovery:false,failureReason:'unknown',writeAttempted:false,outcome:'unknown'};
  const frozen={projectionOnly:options.projectionOnly?structuredClone(options.projectionOnly):undefined,state:options.state,replace:options.replace?structuredClone(options.replace):undefined,canonicalBase:options.canonicalBase?structuredClone(options.canonicalBase):undefined,
    expectedRecoverySource:options.expectedRecoverySource?structuredClone(options.expectedRecoverySource):undefined,
    draft:options.draft?structuredClone(options.draft):undefined,intake:options.intake?structuredClone(options.intake):undefined,newTripOrClone:options.newTripOrClone===true,accountSavePending:options.accountSavePending===true};
  try {
    let storage:EasyTBrowserStorage;
    try {storage=browserRecoveryStorage();}
    catch(error){reportQaPersistenceBoundary('recovery-preparation','recovery-storage-access',{accepted:false,writeAttempted:false});throw error;}
    const driver=await browserRecoveryDriver();
    const entries:import('./durable-entry-protocol.ts').RecoveryEntryWrite[]=[];
    const entry:import('./durable-recovery-domain.ts').RecoveryEnvelope['entry']={pointer:{version:1,backend:'indexeddb',ownerId,tripId:candidate.id,writeId},input:null,receipt:null};
    if(frozen.draft){
      const input=createDurableBuilderInputPersistence(storage,driver,{trip:requireReadableTripDocument(candidate),ownerId,isCurrent:guard,
        overflowEnabled:RECOVERY_DOMAIN_OVERFLOW_ENABLED,accountOverflowQualified:RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED});
      const prepared=await input.prepare(frozen.draft,writeId+':input');
      if(!prepared.ok)return {...fallback,...(frozen.projectionOnly?{projectionDeferred:true}:{}),blockedByExistingRecovery:prepared.reason==='protected',failureReason:prepared.reason==='protected'?'protected-recovery':'unknown',outcome:prepared.reason==='protected'?'protected-conflict':'unknown'};
      entries.push(prepared.entry);entry.input=prepared.input;
    }
    if(frozen.intake){
      const prepared=await prepareIntakeAcknowledgement(storage,driver,{ownerId,isCurrent:guard,overflowEnabled:RECOVERY_DOMAIN_OVERFLOW_ENABLED,
        accountOverflowQualified:RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED},frozen.intake,candidate,writeId+':intake');
      if(!prepared.ok)return {...fallback,blockedByExistingRecovery:prepared.reason==='protected',failureReason:prepared.reason==='protected'?'protected-recovery':'unknown',outcome:prepared.reason==='protected'?'protected-conflict':'unknown'};
      entries.push(prepared.entry);entry.receipt=prepared.receipt;
    }
    const result=await (await browserTripPersistence(ownerId,guard)).save(candidate,{...frozen,writeId,...(entries.length?{entries,entry}:{})});
    reportPersistenceOutcome('device-recovery',result);
    if(result.stored&&guard()){
      if(frozen.accountSavePending)expectCanonicalSave(result.handle);
      dispatchTripStorageChange({kind:'recovery',ownerId:result.handle.ownerId,tripId:candidate.id},candidate);
    }
    return guard()?result:{...result,stored:false,outcome:'unknown',failureReason:'unknown'};
  }catch(error){
    const result=error instanceof BrowserRecoveryReadError&&error.kind==='protected'?{...fallback,blockedByExistingRecovery:true,failureReason:'protected-recovery' as const,outcome:'protected-conflict' as const}:fallback;
    reportPersistenceOutcome('device-recovery',result);return result;
  }
}

/** @deprecated Use saveTripRecovery for local edits and cacheCanonicalTrip for cloud data. */
export function saveActiveTrip(trip: EasyTTrip) {
  return saveTripRecovery(trip);
}

export async function markTripRecoveryState(handle:TripRecoveryHandle,state:TripRecoveryState,conflictReason?:TripRecoveryConflictReason) {
  const storage=browserStorage();if(!storage){finishExpectedCanonicalSave(handle);return false;}
  try {
    const marked=await (await browserTripPersistence(handle.ownerId)).mark(handle,state,conflictReason),finished=finishExpectedCanonicalSave(handle);
    if(marked||finished)dispatchTripStorageChange({kind:'recovery',ownerId:handle.ownerId,tripId:handle.tripId});return marked;
  }catch{finishExpectedCanonicalSave(handle);return false;}
}

export async function reconcileTripCloudMutation(ownerId:string,tripId:string,mutation:TripCloudMutation,canonicalTrip?:EasyTTrip) {
  const storage=browserStorage(),fallback={cacheUpdated:false,recoveryQuarantined:false};if(!storage)return fallback;
  try {
    const guarded=await (await browserTripPersistence(ownerId)).native(tripId,()=>reconcileTripCloudMutationInStorage(storage,ownerId,tripId,mutation,canonicalTrip));
    if(guarded.kind!=='done')return fallback;const result=guarded.value;
    if(result.cacheUpdated)dispatchTripStorageChange({kind:'cache',ownerId,tripId});
    if(result.recoveryQuarantined)dispatchTripStorageChange({kind:'recovery',ownerId,tripId});return result;
  }catch{return fallback;}
}

export async function cacheCanonicalTrip(trip:EasyTTrip,resolvedRecovery?:TripRecoveryHandle) {
  const storage=browserStorage(),fallback={stored:false,recoveryResolved:false};if(!storage)return fallback;
  try {
    const canonical=prepareTripDocumentForWrite(structuredClone(trip));
    const guarded=await (await browserTripPersistence(canonical.ownerId)).native(canonical.id,()=>cacheCanonicalTripWithRecoveryToStorage(storage,canonical,resolvedRecovery));
    if(resolvedRecovery)finishExpectedCanonicalSave(resolvedRecovery);
    if(guarded.kind!=='done')return fallback;const result=guarded.value;
    if(result.stored)dispatchTripStorageChange({kind:'cache',ownerId:canonical.ownerId,tripId:canonical.id});
    if(result.recoveryResolved&&resolvedRecovery)dispatchTripStorageChange({kind:'resolved',ownerId:resolvedRecovery.ownerId,tripId:resolvedRecovery.tripId});return result;
  }catch{return fallback;}
}

export async function acknowledgeTripBuildSave(reviewedTrip:EasyTTrip,canonicalTrip:EasyTTrip,submittedRecovery:TripRecoveryHandle,context?:{isCurrent:()=>boolean}):Promise<TripBuildSaveAcknowledgement> {
  const reviewed=prepareTripDocumentForWrite(structuredClone(reviewedTrip)),canonical=prepareTripDocumentForWrite(structuredClone(canonicalTrip)),handle={...submittedRecovery};
  try {
    const result=await (await browserTripPersistence(handle.ownerId,context?.isCurrent)).acknowledge(reviewed,canonical,handle);
    finishExpectedCanonicalSave(handle);
    if(result.accountAcknowledged)dispatchTripStorageChange({kind:result.outcome==='acknowledged'?'resolved':'recovery',ownerId:handle.ownerId,tripId:handle.tripId});
    return result;
  }catch{return {outcome:'storage-failed',remainingRecovery:null,accountAcknowledged:canonical.ownerId===handle.ownerId&&canonical.id===handle.tripId&&tripBuildDocumentsCanonicalEquivalent(reviewed,canonical,handle.ownerId),cacheStored:false,deviceOutcome:'unknown'};}
}

export async function resolveCanonicalEquivalentTripRecovery(canonicalTrip:EasyTTrip,recovery:TripRecoveryRecord) {
  const storage=browserStorage(),fallback={equivalent:tripRecoveryMatchesCanonical(recovery,canonicalTrip),stored:false,recoveryResolved:false};if(!storage)return fallback;
  try {
    const guarded=await (await browserTripPersistence(recovery.ownerId)).native(recovery.tripId,()=>resolveCanonicalEquivalentTripRecoveryInStorage(storage,canonicalTrip,recovery));
    if(guarded.kind!=='done')return fallback;const result=guarded.value;
    if(result.stored)dispatchTripStorageChange({kind:'cache',ownerId:canonicalTrip.ownerId,tripId:canonicalTrip.id});
    if(result.recoveryResolved)dispatchTripStorageChange({kind:'resolved',ownerId:recovery.ownerId,tripId:recovery.tripId});return result;
  }catch{return fallback;}
}

export async function discardTripRecovery(handle:TripRecoveryHandle,confirmed:boolean) {
  const storage=browserStorage();if(!storage||!confirmed)return false;
  try {
    const discarded=await (await browserTripPersistence(handle.ownerId)).discard(handle,confirmed);
    if(discarded){finishExpectedCanonicalSave(handle);dispatchTripStorageChange({kind:'resolved',ownerId:handle.ownerId,tripId:handle.tripId});}return discarded;
  }catch{return false;}
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
  if (response.status === 409 && payload?.trip && payload.conflictReason) {
    throw new EasyTTripSaveConflictError(
      payload.error || "This trip changed in the cloud.",
      requireReadableTripDocument(payload.trip),
      payload.conflictReason,
    );
  }
  if (!response.ok) {
    throw cloudPersistenceError(response, payload, "update");
  }
  if (!payload?.trip) {
    throw new EasyTTripPersistenceError({
      message: "Morrovia returned an invalid saved trip.",
      category: "validation",
      status: response.status,
      operation: "update",
    });
  }
  return requireReadableTripDocument(payload.trip);
}

export async function saveTripRecoveryToEasyT(
  trip: EasyTTrip,
  recovery: TripRecoveryHandle,
  request: typeof fetch = fetch,
) {
  const scopedTrip = tripForRecoveryScope(trip, recovery);
  if (!scopedTrip) throw new Error("Trip recovery ownership mismatch.");
  // Recovery scope is the user's explicit destination. Pin both promotion and
  // subsequent CAS so a cookie/session rotation cannot write another account.
  const scopedRequest: typeof fetch = recovery.ownerId === null ? request : (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-morrovia-expected-owner', recovery.ownerId!);
    return request(url, {...init, headers});
  };
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
      promoted = (await promoteTripToEasyT({ ...trip, status: "draft" }, scopedRequest)).trip;
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
    if (promoted.id !== trip.id || recovery.ownerId !== null && promoted.ownerId !== recovery.ownerId) {
      throw new EasyTTripPersistenceError({category:'validation',status:200,operation:'promotion',message:'Canonical promotion ownership mismatch.'});
    }
    if (trip.status === "draft") return promoted;
    try {
      return await saveTripToEasyT({ ...promoted, status: trip.status }, scopedRequest);
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
    return await saveTripToEasyT(scopedTrip, scopedRequest);
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

  if (response.status === 409 && payload?.trip && payload.conflictReason) {
    throw new EasyTTripPromotionConflictError(
      payload.error || "A cloud copy already exists.",
      requireReadableTripDocument(payload.trip),
      payload.conflictReason,
    );
  }
  if (!response.ok) {
    throw cloudPersistenceError(response, payload, "promotion");
  }
  if (!payload?.trip
    || (payload.outcome !== "promoted" && payload.outcome !== "already-canonical")) {
    throw new EasyTTripPersistenceError({
      message: "Morrovia returned an invalid promoted trip.",
      category: "validation",
      status: response.status,
      operation: "promotion",
    });
  }
  return { trip: requireReadableTripDocument(payload.trip), outcome: payload.outcome };
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
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { code?: string } | null;
    if (error?.code === "unsupported_trip_version" || error?.code === "invalid_trip_document") throw new TripDocumentReadError(error.code);
    return { kind: "unavailable" };
  }
  const payload = await response.json() as { trip: EasyTTrip };
  payload.trip = requireReadableTripDocument(payload.trip);
  if (payload.trip.id !== tripId) throw new TripDocumentReadError("invalid_trip_document");
  // A verified API response is safe to keep for an offline reopen. This clean
  // cache write never touches a pending recovery for the same owner and trip.
  await cacheCanonicalTrip(payload.trip);
  return { kind: "found", trip: normalizeLegacyGeneratedDayContext(payload.trip) };
}

export async function loadTripFromEasyT(tripId: string): Promise<EasyTTrip | null> {
  const result = await loadTripFromEasyTResult(tripId);
  if (result.kind === "unavailable") throw new Error("Morrovia cloud load failed.");
  if (result.kind !== "found") return null;
  // Every authoritative cloud load crosses the same reconciliation boundary.
  // This retires an equivalent/stale baseline snapshot before a workspace can
  // mistake it for unsynced work, while unique local edits remain preserved.
  await cacheCanonicalTrip(result.trip);
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
  } catch (error) {
    if (error instanceof TripDocumentReadError) throw error;
    // The exact active local document remains usable if cloud loading is
    // temporarily unavailable, matching the established planner behaviour.
  }

  const storage = browserStorage();
  return storage ? await loadLocalTrip(tripId,ownerId) : null;
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
export async function clearActiveTrip(ownerId:string|null=null) {
  try {const cleared=await (await browserTripPersistence(ownerId)).clearCurrent();if(cleared)dispatchTripStorageChange({kind:'current-cleared',ownerId,tripId:null});return cleared;}catch{return false;}
}
