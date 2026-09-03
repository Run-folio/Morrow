import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  EASYT_ACTIVE_TRIP_KEY,
  beginNewTripNavigationInStorage,
  canUseHydratedTripScope,
  cacheCanonicalTripWithRecoveryToStorage,
  cacheCanonicalTripToStorage,
  claimGuestTripRecoveryForOwnerInStorage,
  clearCurrentTripInStorage,
  currentTripStorageKey,
  discardTripRecoveryInStorage,
  forgetRememberedOwnerInStorage,
  loadActiveTripFromStorage,
  loadCachedTripFromStorage,
  loadCurrentTripIdFromStorage,
  loadCurrentTripRecoveryFromStorage,
  loadLocalTripFromStorage,
  loadRememberedOwnerFromStorage,
  loadRequestedTrip,
  loadTripFromEasyT,
  loadTripRecoveryFromStorage,
  markTripRecoveryStateInStorage,
  ownerIdForBrowserRecovery,
  rememberLastOwnerInStorage,
  resolveCanonicalEquivalentTripRecoveryInStorage,
  resolveTripRecoveryInStorage,
  saveTripRecoveryToStorage,
  saveTripRecoveryToEasyT,
  shouldAllowNewTripNavigation,
  tripCacheStorageKey,
  tripRecoveryStorageKey,
  tripForRecoveryScope,
  tripRecoveryMatchesCanonical,
  tripDocumentsCanonicalEquivalent,
  tripStorageEventMatches,
  type EasyTBrowserStorage,
} from "../lib/easyt/storage.ts";
import { canonicalTripRevisionCanReplace, canApplyCanonicalCopilotChange, tripConflictResolutionActions, tripEditorSyncAction } from "../lib/easyt/trip-continuity.ts";
import { applyResolvedTripCopilotAction, type ResolvedTripCopilotAction } from "../lib/easyt/trip-copilot-actions.ts";
import {
  applyTripCopilotPreview,
  TripCopilotApplyError,
  type TripCopilotApplyDependencies,
  type TripCopilotPreviewRecord,
} from "../lib/easyt/trip-copilot-apply.ts";
import { tripCopilotMutationHash, tripCopilotStateHash } from "../lib/easyt/trip-copilot-state.ts";
import { canonicalTripForOwner, canPromoteTripForOwner } from "../lib/easyt/trip-promotion.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { NIKKO_ROUTE_FIXTURE } from "./fixtures/prebeta-place-trip-state.ts";

function browserTrip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-40404040-4040-4040-8040-404040404040",
    ownerId: "owner-a",
    title: "Device recovery",
    status: "draft",
    startDate: "2026-12-01",
    endDate: "2026-12-08",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Keep the unsynced edit",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
    },
    stops: [],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-08-23T10:00:00.000Z",
    updatedAt: "2026-08-23T11:00:00.000Z",
    ...overrides,
  };
}

function quotaError() {
  const error = new Error("Browser storage quota exceeded");
  error.name = "QuotaExceededError";
  return error;
}

class MemoryBrowserStorage implements EasyTBrowserStorage {
  protected readonly values = new Map<string, string>();
  blockGet = false;
  blockSet = false;
  blockRemove = false;
  blockKeys = false;
  quotaOnSet: ((key: string, value: string) => boolean) | null = null;
  onRemove: ((key: string) => void) | null = null;

  get length() {
    if (this.blockKeys) throw new Error("Storage access blocked");
    return this.values.size;
  }

  getItem(key: string) {
    if (this.blockGet) throw new Error("Storage access blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.blockSet) throw new Error("Storage access blocked");
    if (this.quotaOnSet?.(key, value)) throw quotaError();
    this.values.set(key, value);
  }

  removeItem(key: string) {
    if (this.blockRemove) throw new Error("Storage access blocked");
    this.onRemove?.(key);
    this.values.delete(key);
  }

  key(index: number) {
    if (this.blockKeys) throw new Error("Storage access blocked");
    return [...this.values.keys()][index] ?? null;
  }

  seed(key: string, value: string) {
    this.values.set(key, value);
  }

  peek(key: string) {
    return this.values.get(key) ?? null;
  }
}

test("Open cloud copy and canonical TripShell caching preserve the sole dirty recovery", () => {
  const storage = new MemoryBrowserStorage();
  const dirty = browserTrip({ title: "Unsynced device route" });
  const cloud = browserTrip({
    title: "Canonical cloud route",
    updatedAt: "2026-08-23T12:00:00.000Z",
  });
  const recovery = saveTripRecoveryToStorage(storage, dirty, {
    ownerId: "owner-a",
    state: "conflict",
    writeId: "dirty-write",
    now: "2026-08-23T12:05:00.000Z",
  });

  assert.equal(recovery.stored, true);
  assert.equal(cacheCanonicalTripToStorage(storage, cloud, "2026-08-23T12:06:00.000Z"), true);
  assert.notEqual(
    tripRecoveryStorageKey("owner-a", dirty.id),
    tripCacheStorageKey("owner-a", cloud.id),
  );

  const retained = loadTripRecoveryFromStorage(storage, dirty.id, "owner-a");
  assert.equal(retained?.trip.title, "Unsynced device route");
  assert.equal(retained?.trip.id, dirty.id);
  assert.equal(retained?.trip.updatedAt, "2026-08-23T11:00:00.000Z");
  assert.equal(retained?.state, "conflict");
  assert.equal(loadCachedTripFromStorage(storage, cloud.id, "owner-a")?.title, "Canonical cloud route");
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), dirty.id);

  const actions = tripConflictResolutionActions(dirty.id);
  assert.deepEqual(actions, {
    cloudHref: `/journey/${encodeURIComponent(dirty.id)}`,
    deviceHref: `/journey/plan?trip=${encodeURIComponent(dirty.id)}&save=1&recover=1`,
    openCloudLabel: "Open cloud copy",
    openDeviceLabel: "Open device copy",
    discardDeviceLabel: "Discard device copy",
  });
  // The canonical CTA flow can surface discard, but dismissal is not consent.
  assert.equal(discardTripRecoveryInStorage(storage, retained!, false), false);
  assert.equal(loadTripRecoveryFromStorage(storage, dirty.id, "owner-a")?.writeId, "dirty-write");
  assert.equal(tripEditorSyncAction({
    hasCloudConflict: true,
    hasDeviceRecoveryIssue: true,
    authInterrupted: false,
  }), "reload-cloud", "a later local edit must not replace the conflict CTA");
});

test("canonical cache advances to a newer acknowledgement and rejects delayed rollback or stay resurrection", () => {
  const storage = new MemoryBrowserStorage();
  const withStay = browserTrip({
    title: "R2 with imported stay",
    updatedAt: "2026-08-23T12:00:00.000Z",
    brief: {
      ...browserTrip().brief,
      bookings: [{ id: "stay-rome", type: "stay", title: "Hotel Artemide", date: "2026-12-01", confirmation: "••••1234", url: "https://www.booking.com/hotel/it/artemide.html" }],
    },
  });
  const removed = browserTrip({
    title: "R3 stay removed",
    updatedAt: "2026-08-23T12:01:00.000Z",
  });
  const newer = browserTrip({
    title: "R4 manual title edit",
    updatedAt: "2026-08-23T12:02:00.000Z",
  });

  assert.equal(cacheCanonicalTripToStorage(storage, withStay), true);
  assert.equal(cacheCanonicalTripToStorage(storage, removed), true);
  assert.equal(cacheCanonicalTripToStorage(storage, withStay), false, "a delayed R2 callback cannot replace R3");
  assert.equal(loadCachedTripFromStorage(storage, removed.id, "owner-a")?.brief.bookings, undefined);
  assert.equal(cacheCanonicalTripToStorage(storage, newer), true);
  assert.equal(loadCachedTripFromStorage(storage, newer.id, "owner-a")?.title, "R4 manual title edit");

  assert.equal(canonicalTripRevisionCanReplace(removed, newer), true);
  assert.equal(canonicalTripRevisionCanReplace(newer, removed), false);
  assert.equal(canonicalTripRevisionCanReplace(newer, { ...newer, ownerId: "owner-b" }), false);
  assert.equal(canonicalTripRevisionCanReplace(
    { ...removed, updatedAt: "opaque-r3" },
    { ...newer, updatedAt: "opaque-r4" },
  ), false, "unknown revision formats fail closed instead of guessing freshness");
});

test("canonical-derived editing cannot replace recovery without its exact handle, while the opened device copy can", () => {
  const storage = new MemoryBrowserStorage();
  const first = browserTrip({ id: "trip-lineage", title: "First device edit" });
  const firstWrite = saveTripRecoveryToStorage(storage, first, { writeId: "lineage-1" });
  assert.equal(firstWrite.stored, true);

  const cloudDerived = browserTrip({ id: first.id, title: "Edit made from canonical cloud view" });
  const blocked = saveTripRecoveryToStorage(storage, cloudDerived, { writeId: "lineage-cloud" });
  assert.equal(blocked.stored, false);
  assert.equal(blocked.blockedByExistingRecovery, true);
  assert.equal(loadTripRecoveryFromStorage(storage, first.id, "owner-a")?.trip.title, "First device edit");

  const deviceContinuation = saveTripRecoveryToStorage(
    storage,
    { ...first, title: "Second device edit" },
    { writeId: "lineage-2", replace: firstWrite.handle },
  );
  assert.equal(deviceContinuation.stored, true);
  assert.equal(deviceContinuation.blockedByExistingRecovery, false);
  assert.equal(loadTripRecoveryFromStorage(storage, first.id, "owner-a")?.trip.title, "Second device edit");
});

test("canonical caching resolves only the same owner, trip, and recovery write", () => {
  const storage = new MemoryBrowserStorage();
  const pending = browserTrip({ id: "trip-resolution-boundary", title: "Pending A edit" });
  const recovery = saveTripRecoveryToStorage(storage, pending, { writeId: "resolution-write" });
  assert.equal(recovery.stored, true);

  const wrongTrip = cacheCanonicalTripWithRecoveryToStorage(
    storage,
    browserTrip({ id: "trip-other-canonical", title: "Wrong trip" }),
    recovery.handle,
  );
  assert.equal(wrongTrip.stored, true);
  assert.equal(wrongTrip.recoveryResolved, false);
  assert.ok(loadTripRecoveryFromStorage(storage, pending.id, "owner-a"));

  const wrongOwner = cacheCanonicalTripWithRecoveryToStorage(
    storage,
    browserTrip({ id: pending.id, ownerId: "owner-b", title: "Wrong owner" }),
    recovery.handle,
  );
  assert.equal(wrongOwner.stored, true);
  assert.equal(wrongOwner.recoveryResolved, false);
  assert.ok(loadTripRecoveryFromStorage(storage, pending.id, "owner-a"));

  const exact = cacheCanonicalTripWithRecoveryToStorage(storage, pending, recovery.handle);
  assert.equal(exact.stored, true);
  assert.equal(exact.recoveryResolved, true);
  assert.equal(loadTripRecoveryFromStorage(storage, pending.id, "owner-a"), null);
});

test("hydration resolves a stranded Build recovery only when its server-normalized document is canonical-equivalent", () => {
  const ownerId = "owner-a";
  const local = browserTrip({
    id: "trip-stranded-build",
    ownerId: null,
    status: "planned",
    brief: {
      origin: "London",
      mustDo: "Keep this exact plan",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: { lisbon: ["Alfama"] },
      decisionSelections: { routeOrder: "entered", transportByLeg: {} },
    },
    stops: [{
      id: "lisbon", order: 0, name: "Lisbon", country: "Portugal",
      latitude: 38.72, longitude: -9.14, arrivalDate: "2026-12-01",
      departureDate: "2026-12-08", nights: 7,
    }],
    planItems: [{
      id: "day-1", stopId: "lisbon", dayNumber: 1, date: "2026-12-01",
      type: "activity", title: "Alfama", reason: "Requested", notes: [],
      startsAt: null, endsAt: null, bookingUrl: null, latitude: 38.71, longitude: -9.13,
    }],
  });
  const storage = new MemoryBrowserStorage();
  saveTripRecoveryToStorage(storage, local, {
    ownerId,
    writeId: "stranded-build-write",
  });
  const normalized = canonicalTripForOwner(ownerId, local, "2026-08-23T12:00:00.000Z");
  // JSONB responses do not promise object-key insertion order. Rebuild the
  // same document in a different order to exercise semantic comparison.
  const canonical: EasyTTrip = {
    updatedAt: normalized.updatedAt,
    createdAt: normalized.createdAt,
    recommendations: normalized.recommendations,
    planItems: normalized.planItems,
    legs: normalized.legs,
    stops: normalized.stops,
    brief: normalized.brief,
    currency: normalized.currency,
    travellers: normalized.travellers,
    endDate: normalized.endDate,
    startDate: normalized.startDate,
    status: normalized.status,
    title: normalized.title,
    ownerId: normalized.ownerId,
    id: normalized.id,
    schemaVersion: normalized.schemaVersion,
  };

  assert.notEqual(JSON.stringify(canonical), JSON.stringify(normalized), "the fixture must differ in key order");
  const storedRecovery = loadTripRecoveryFromStorage(storage, local.id, ownerId)!;
  assert.equal(tripRecoveryMatchesCanonical(storedRecovery, canonical), true);
  const result = resolveCanonicalEquivalentTripRecoveryInStorage(storage, canonical, storedRecovery);

  assert.deepEqual(result, { equivalent: true, stored: true, recoveryResolved: true });
  assert.equal(loadTripRecoveryFromStorage(storage, local.id, ownerId), null);
  assert.deepEqual(loadCachedTripFromStorage(storage, local.id, ownerId), canonical);
});

test("hydration preserves a same-ID recovery with meaningful traveller edits", () => {
  const ownerId = "owner-a";
  const local = browserTrip({ id: "trip-meaningful-local", ownerId: null, status: "planned", title: "My newer route" });
  const cloud = canonicalTripForOwner(ownerId, { ...local, title: "Cloud route" }, "2026-08-23T12:00:00.000Z");
  const storage = new MemoryBrowserStorage();
  saveTripRecoveryToStorage(storage, local, { ownerId, writeId: "meaningful-write" });
  const recovery = loadTripRecoveryFromStorage(storage, local.id, ownerId)!;

  assert.equal(tripRecoveryMatchesCanonical(recovery, cloud), false);
  assert.deepEqual(
    resolveCanonicalEquivalentTripRecoveryInStorage(storage, cloud, recovery),
    { equivalent: false, stored: false, recoveryResolved: false },
  );
  assert.equal(loadTripRecoveryFromStorage(storage, local.id, ownerId)?.trip.title, "My newer route");
  assert.equal(loadCachedTripFromStorage(storage, local.id, ownerId), null);
});

test("derived planner rebuilds do not create a false cloud/device conflict", () => {
  const local = browserTrip({
    ownerId: null,
    brief: { ...browserTrip().brief, routeAssessment: undefined, cascadeStatus: { conflicts: [], affectedBookingIds: [], affectedPlanItemCount: 0 } },
    legs: [{ id: "local-leg", fromStopId: "a", toStopId: "b", mode: "unknown", distanceKm: null, durationMinutes: null, provider: null, routeMetadata: { planningEstimate: true } }],
    planItems: [],
    recommendations: [],
  });
  const canonical = canonicalTripForOwner("owner-a", {
    ...local,
    brief: { ...local.brief, routeAssessment: { route: { state: "insufficient-data", currentStopIds: [], recommendedStopIds: [], currentTransferMinutes: null, recommendedTransferMinutes: null, improvementMinutes: null, reasons: [], tradeoffs: [], summary: "Generated later" }, durations: {}, comfortableDays: 0, shortfallDays: 0 } },
    legs: [],
    planItems: [{ id: "generated", stopId: "unassigned", dayNumber: 1, date: local.startDate, type: "open", title: "Generated", reason: "Derived", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    recommendations: [{ id: "generated", rule: "derived", severity: "warning", message: "Generated", evidence: "Derived", affectedDays: [], confidence: "medium", checkedAt: local.updatedAt, proposedChange: null, status: "open" }],
  }, "2026-08-23T12:00:00.000Z");

  assert.equal(tripDocumentsCanonicalEquivalent(local, canonical), true);
  assert.equal(tripDocumentsCanonicalEquivalent({ ...local, brief: { ...local.brief, mustDo: "A real traveller edit" } }, canonical), false);
});

test("canonical refresh retires an aligned or stale baseline snapshot without relying on updatedAt", () => {
  const storage = new MemoryBrowserStorage();
  const cloudA = browserTrip({ id: "trip-stale-baseline", travellers: 2 });
  assert.equal(cacheCanonicalTripToStorage(storage, cloudA), true);
  const snapshot = saveTripRecoveryToStorage(storage, { ...cloudA, updatedAt: "2026-08-23T11:30:00.000Z" }, {
    writeId: "stale-baseline",
  });
  assert.equal(snapshot.stored, true);

  const cloudB = { ...cloudA, travellers: 3, updatedAt: "2026-08-23T12:00:00.000Z" };
  const refreshed = cacheCanonicalTripWithRecoveryToStorage(storage, cloudB);

  assert.deepEqual(refreshed, { stored: true, recoveryResolved: true });
  assert.equal(loadTripRecoveryFromStorage(storage, cloudA.id, "owner-a"), null);
  assert.deepEqual(loadCachedTripFromStorage(storage, cloudA.id, "owner-a"), cloudB);
});

test("canonical Luna Apply is available only when a recovery is a separate preserved device document", () => {
  const base = {
    hasUnsavedChanges: false,
    hasCloudConflict: false,
    hasDeviceRecoveryIssue: true,
    cloudCopyHasPreservedRecovery: true,
    authInterrupted: false,
  };
  assert.equal(canApplyCanonicalCopilotChange(base), true);
  assert.equal(canApplyCanonicalCopilotChange({ ...base, cloudCopyHasPreservedRecovery: false }), false);
  assert.equal(canApplyCanonicalCopilotChange({ ...base, hasUnsavedChanges: true }), false);
  assert.equal(canApplyCanonicalCopilotChange({ ...base, hasCloudConflict: true }), false);
  assert.equal(canApplyCanonicalCopilotChange({ ...base, authInterrupted: true }), false);
});

test("successful Add pin save acknowledges the canonical map pin and refresh stays conflict-free", () => {
  const storage = new MemoryBrowserStorage();
  const cloud = browserTrip({ id: "trip-pin-ack", brief: { ...browserTrip().brief, mapPins: [] } });
  cacheCanonicalTripToStorage(storage, cloud);
  const pin = { id: "pin-cafe", title: "Morning cafe", category: "restaurant" as const, dayNumber: 2, latitude: 48.8566, longitude: 2.3522 };
  const local = { ...cloud, brief: { ...cloud.brief, mapPins: [pin] } };
  const recovery = saveTripRecoveryToStorage(storage, local, { writeId: "pin-save" });
  const canonical = { ...local, updatedAt: "2026-08-23T12:00:00.000Z" };

  assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, canonical, recovery.handle), { stored: true, recoveryResolved: true });
  assert.equal(loadTripRecoveryFromStorage(storage, cloud.id, "owner-a"), null);
  assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, canonical), { stored: true, recoveryResolved: false });
  assert.equal(loadTripRecoveryFromStorage(storage, cloud.id, "owner-a"), null);
});

test("Luna preview is inert and confirmed Apply rebases an unchanged device baseline", () => {
  const storage = new MemoryBrowserStorage();
  const stop = { id: "rome", order: 0, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.5, arrivalDate: "2026-12-01", departureDate: "2026-12-03", nights: 2 };
  const cloudA = browserTrip({ id: "trip-luna-reconcile", stops: [stop] });
  cacheCanonicalTripToStorage(storage, cloudA);
  const recovery = saveTripRecoveryToStorage(storage, cloudA, { writeId: "pre-luna-baseline" });
  assert.equal(recovery.stored, true);

  // Preview has no persistence side effect.
  assert.deepEqual(loadTripRecoveryFromStorage(storage, cloudA.id, "owner-a")?.trip.stops[0].nights, 2);
  assert.deepEqual(loadCachedTripFromStorage(storage, cloudA.id, "owner-a")?.stops[0].nights, 2);

  const cloudB = { ...cloudA, stops: [{ ...stop, nights: 3 }], updatedAt: "2026-08-23T12:00:00.000Z" };
  assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, cloudB), { stored: true, recoveryResolved: true });
  assert.equal(loadTripRecoveryFromStorage(storage, cloudA.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, cloudA.id, "owner-a")?.stops[0].nights, 3);
});

test("a real local edit remains recoverable when cloud is unchanged or independently newer", () => {
  const storage = new MemoryBrowserStorage();
  const cloudA = browserTrip({ id: "trip-real-divergence", travellers: 2 });
  cacheCanonicalTripToStorage(storage, cloudA);
  const localB = { ...cloudA, brief: { ...cloudA.brief, mustDo: "Protect my unsynced museum booking" } };
  const recovery = saveTripRecoveryToStorage(storage, localB, { writeId: "real-local-edit" });
  assert.equal(recovery.stored, true);

  assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, cloudA), { stored: true, recoveryResolved: false });
  assert.equal(loadLocalTripFromStorage(storage, cloudA.id, "owner-a")?.brief.mustDo, "Protect my unsynced museum booking");

  const cloudC = { ...cloudA, travellers: 3, updatedAt: "2026-08-23T12:30:00.000Z" };
  assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, cloudC), { stored: true, recoveryResolved: false });
  assert.equal(loadTripRecoveryFromStorage(storage, cloudA.id, "owner-a")?.trip.brief.mustDo, "Protect my unsynced museum booking");
  assert.equal(loadCachedTripFromStorage(storage, cloudA.id, "owner-a")?.travellers, 3);

  assert.equal(discardTripRecoveryInStorage(storage, recovery.handle, true), true);
  assert.equal(loadTripRecoveryFromStorage(storage, cloudA.id, "owner-a"), null);
  assert.equal(loadLocalTripFromStorage(storage, cloudA.id, "owner-a")?.travellers, 3);
});

test("canonical Luna Apply and stale control preserve a separate owner-scoped recovery across tabs and reload", async () => {
  const storage = new MemoryBrowserStorage();
  const cloudR7 = browserTrip({
    id: "trip-luna-recovery-cross-tab",
    title: "Canonical account trip",
    updatedAt: "2026-08-23T17:07:00.000Z",
    brief: { ...browserTrip().brief, mustDo: "Canonical museum plan", pace: "slow" },
  });
  assert.equal(cacheCanonicalTripToStorage(storage, cloudR7), true);

  // Tab B creates material traveller work while its canonical save is unavailable.
  const dirtyDevice = {
    ...cloudR7,
    brief: { ...cloudR7.brief, mustDo: "Unsynced specialist museum booking" },
  };
  const dirtyWrite = saveTripRecoveryToStorage(storage, dirtyDevice, {
    ownerId: "owner-a",
    state: "network",
    writeId: "tab-b-dirty-r7",
    now: "2026-08-23T17:07:30.000Z",
  });
  assert.equal(dirtyWrite.stored, true);
  assert.equal(loadCachedTripFromStorage(storage, cloudR7.id, "owner-a")?.updatedAt, cloudR7.updatedAt);
  assert.equal(loadTripRecoveryFromStorage(storage, cloudR7.id, "owner-a")?.trip.brief.mustDo, "Unsynced specialist museum booking");
  assert.equal(loadTripRecoveryFromStorage(storage, cloudR7.id, "owner-b"), null);

  const action: ResolvedTripCopilotAction = {
    action: "set_trip_preference",
    preference: "budget",
    value: "high",
  };
  const previewResult = applyResolvedTripCopilotAction(cloudR7, action);
  let preview: TripCopilotPreviewRecord = {
    previewId: "11111111-1111-4111-8111-111111111111",
    ownerId: "owner-a",
    tripId: cloudR7.id,
    actionType: action.action,
    action,
    baseUpdatedAt: cloudR7.updatedAt,
    baseHash: tripCopilotStateHash(cloudR7),
    expectedHash: tripCopilotMutationHash(previewResult),
    status: "pending",
    expiresAt: "2026-08-23T18:00:00.000Z",
    resultTrip: null,
  };
  let canonical = structuredClone(cloudR7);
  let saveCount = 0;
  const dependencies: TripCopilotApplyDependencies = {
    async getPreview(ownerId, tripId, previewId) {
      return preview.ownerId === ownerId && preview.tripId === tripId && preview.previewId === previewId
        ? structuredClone(preview)
        : null;
    },
    async claimPreview(ownerId, tripId, previewId) {
      if (preview.ownerId !== ownerId || preview.tripId !== tripId || preview.previewId !== previewId) return "missing";
      if (preview.status !== "pending") return preview.status;
      preview.status = "applying";
      return "claimed";
    },
    async getTrip(ownerId, tripId) {
      return canonical.ownerId === ownerId && canonical.id === tripId ? structuredClone(canonical) : null;
    },
    async saveTrip(ownerId, candidate) {
      assert.equal(ownerId, "owner-a");
      assert.equal(candidate.updatedAt, cloudR7.updatedAt, "Luna submits the exact canonical R7 CAS token");
      saveCount += 1;
      canonical = { ...structuredClone(candidate), updatedAt: "2026-08-23T17:08:00.000Z" };
      return structuredClone(canonical);
    },
    async completePreview(_ownerId, _tripId, _previewId, trip) {
      preview = { ...preview, status: "applied", resultTrip: structuredClone(trip) };
    },
    async markPreviewStale() { preview = { ...preview, status: "stale" }; },
    async releasePreview() { preview = { ...preview, status: "pending" }; },
  };
  const input = {
    ownerId: "owner-a",
    tripId: cloudR7.id,
    previewId: preview.previewId,
    expectedAction: action.action,
    now: new Date("2026-08-23T17:30:00.000Z"),
  } as const;

  // Tab A's preview is inert and is checked only against canonical R7.
  assert.equal(canonical.updatedAt, cloudR7.updatedAt);
  assert.equal(loadTripRecoveryFromStorage(storage, cloudR7.id, "owner-a")?.writeId, dirtyWrite.handle.writeId);
  const firstApply = await applyTripCopilotPreview(input, dependencies);
  assert.equal(firstApply.idempotent, false);
  assert.equal(firstApply.trip.updatedAt, "2026-08-23T17:08:00.000Z");
  assert.equal(firstApply.trip.brief.budgetBand, "high");
  assert.equal(firstApply.trip.brief.mustDo, "Canonical museum plan", "device work is not silently merged");
  assert.equal(firstApply.trip.id, cloudR7.id);
  assert.equal(saveCount, 1);

  const reconciled = cacheCanonicalTripWithRecoveryToStorage(storage, firstApply.trip);
  assert.deepEqual(reconciled, { stored: true, recoveryResolved: false });
  assert.equal(loadCachedTripFromStorage(storage, cloudR7.id, "owner-a")?.updatedAt, firstApply.trip.updatedAt);
  assert.equal(loadTripRecoveryFromStorage(storage, cloudR7.id, "owner-a")?.writeId, dirtyWrite.handle.writeId);
  assert.equal(loadTripRecoveryFromStorage(storage, cloudR7.id, "owner-a")?.trip.brief.mustDo, "Unsynced specialist museum booking");

  const repeated = await applyTripCopilotPreview(input, dependencies);
  assert.equal(repeated.idempotent, true);
  assert.equal(saveCount, 1, "repeated Apply never advances the cloud twice");
  await assert.rejects(
    applyTripCopilotPreview({ ...input, ownerId: "owner-b" }, dependencies),
    (error: unknown) => error instanceof TripCopilotApplyError && error.code === "not-found",
  );

  // A reload/reopen still resolves the dirty device document separately from clean cloud R8.
  assert.equal(loadLocalTripFromStorage(storage, cloudR7.id, "owner-a")?.brief.mustDo, "Unsynced specialist museum booking");
  assert.equal(loadCachedTripFromStorage(storage, cloudR7.id, "owner-a")?.brief.budgetBand, "high");

  // A real canonical mutation moves R8 -> R9; the old R8 preview must reject.
  const staleAction: ResolvedTripCopilotAction = {
    action: "set_trip_preference",
    preference: "pace",
    value: "packed",
  };
  const cloudR8 = structuredClone(canonical);
  const staleCandidate = applyResolvedTripCopilotAction(cloudR8, staleAction);
  preview = {
    previewId: "22222222-2222-4222-8222-222222222222",
    ownerId: "owner-a",
    tripId: cloudR8.id,
    actionType: staleAction.action,
    action: staleAction,
    baseUpdatedAt: cloudR8.updatedAt,
    baseHash: tripCopilotStateHash(cloudR8),
    expectedHash: tripCopilotMutationHash(staleCandidate),
    status: "pending",
    expiresAt: "2026-08-23T18:00:00.000Z",
    resultTrip: null,
  };
  canonical = { ...cloudR8, travellers: 3, updatedAt: "2026-08-23T17:09:00.000Z" };
  assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, canonical), { stored: true, recoveryResolved: false });
  await assert.rejects(
    applyTripCopilotPreview({
      ownerId: "owner-a",
      tripId: cloudR8.id,
      previewId: preview.previewId,
      expectedAction: staleAction.action,
      now: new Date("2026-08-23T17:30:00.000Z"),
    }, dependencies),
    (error: unknown) => error instanceof TripCopilotApplyError && error.code === "stale",
  );
  assert.equal(saveCount, 1);
  assert.equal(canonical.updatedAt, "2026-08-23T17:09:00.000Z");
  assert.equal(canonical.travellers, 3);
  assert.notEqual(canonical.brief.pace, "full");
  assert.equal(loadTripRecoveryFromStorage(storage, cloudR7.id, "owner-a")?.writeId, dirtyWrite.handle.writeId);
});

test("semantic comparison ignores canonical/provider metadata but protects every editable recovery field", () => {
  const base = browserTrip({
    id: "trip-semantic-fields",
    stops: [{ id: "rome", order: 0, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.5, arrivalDate: "2026-12-01", departureDate: "2026-12-03", nights: 2 }],
    brief: {
      ...browserTrip().brief,
      dayNotes: { 1: ["Call the hotel"] },
      customActivities: { 2: ["Evening walk"] },
      mapPins: [{ id: "pin-1", title: "Dinner", category: "restaurant", dayNumber: 2, latitude: 1, longitude: 2 }],
      bookings: [{ id: "stay-1", type: "stay", title: "Hotel", date: "2026-12-01", confirmation: null, url: null }],
      checklist: [{ id: "passport", label: "Passport", complete: true }],
    },
  });
  const metadataOnly = {
    ...base,
    createdAt: "2026-08-23T09:00:00.000Z",
    updatedAt: "2026-08-23T12:00:00.000Z",
    brief: {
      ...base.brief,
      originCanonicalPlaceId: "canonical-london",
      originProviderId: "provider-refresh",
      originCoordinates: [-0.12, 51.5] as [number, number],
      routeAssessment: { route: { state: "insufficient-data" as const, currentStopIds: [], recommendedStopIds: [], currentTransferMinutes: null, recommendedTransferMinutes: null, improvementMinutes: null, reasons: [], tradeoffs: [], summary: "Recalculated" }, durations: {}, comfortableDays: 0, shortfallDays: 0 },
    },
    stops: [{ ...base.stops[0], canonicalPlaceId: "canonical-rome", providerId: "provider-rome", latitude: 41.901, longitude: 12.501 }],
  };
  assert.equal(tripDocumentsCanonicalEquivalent(base, metadataOnly), true);

  const meaningfulVariants: EasyTTrip[] = [
    { ...base, startDate: "2026-12-02" },
    { ...base, travellers: 3 },
    { ...base, brief: { ...base.brief, dayNotes: { 1: ["Changed note"] } } },
    { ...base, brief: { ...base.brief, customActivities: { 2: ["Changed activity"] } } },
    { ...base, brief: { ...base.brief, mapPins: [] } },
    { ...base, brief: { ...base.brief, mapPins: [{ ...base.brief.mapPins![0], longitude: 3 }] } },
    { ...base, brief: { ...base.brief, bookings: [] } },
    { ...base, brief: { ...base.brief, checklist: [] } },
  ];
  meaningfulVariants.forEach((variant) => assert.equal(tripDocumentsCanonicalEquivalent(variant, base), false));
});

test("semantic comparison treats absent and empty optional authored collections as equivalent", () => {
  const absent = browserTrip({ id: "trip-semantic-empty-defaults" });
  const empty = {
    ...absent,
    brief: {
      ...absent.brief,
      selectedPlaces: { unused: [] },
      dayAllocations: {},
      nightAllocations: {},
      dayNotes: { 1: [] },
      customActivities: {},
      mapPins: [],
      bookings: [],
      checklist: [],
      scheduleLocks: { stopIds: [], arrivalDates: {} },
      decisionSelections: { transportByLeg: {} },
    },
  };

  assert.equal(tripDocumentsCanonicalEquivalent(absent, empty), true);
  assert.equal(tripDocumentsCanonicalEquivalent({ ...absent, brief: { ...absent.brief, mapPins: undefined } }, absent), true);
  assert.equal(
    tripDocumentsCanonicalEquivalent(
      { ...absent, brief: { ...absent.brief, mapPins: null } } as unknown as EasyTTrip,
      absent,
    ),
    true,
  );

  const orderedStops = [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.86, longitude: 2.35, arrivalDate: null, departureDate: null, nights: 2 },
    { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.5, arrivalDate: null, departureDate: null, nights: 3 },
  ];
  const route = { ...absent, stops: orderedStops };
  const reordered = { ...route, stops: [{ ...orderedStops[1], order: 0 }, { ...orderedStops[0], order: 1 }] };
  const allocated = { ...route, brief: { ...route.brief, dayAllocations: { paris: 2, rome: 3 } } };
  const reallocated = { ...allocated, brief: { ...allocated.brief, dayAllocations: { paris: 3, rome: 2 } } };
  const orderedNotes = { ...route, brief: { ...route.brief, dayNotes: { 1: ["Museum", "Dinner"] } } };
  const reorderedNotes = { ...orderedNotes, brief: { ...orderedNotes.brief, dayNotes: { 1: ["Dinner", "Museum"] } } };

  assert.equal(tripDocumentsCanonicalEquivalent(route, reordered), false);
  assert.equal(tripDocumentsCanonicalEquivalent(allocated, reallocated), false);
  assert.equal(tripDocumentsCanonicalEquivalent(orderedNotes, reorderedNotes), false);
});

test("the Nikko save, Map reopen and reload sequence converges while a later traveller edit remains protected", () => {
  const ownerId = "owner-a";
  const local = browserTrip({
    id: "trip-nikko-reconciliation",
    ownerId: null,
    status: "planned",
    stops: NIKKO_ROUTE_FIXTURE.map((stop, order) => ({
      id: stop.id,
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: "canonicalPlaceId" in stop ? stop.canonicalPlaceId : undefined,
      longitude: stop.coordinates[0],
      latitude: stop.coordinates[1],
      order,
      arrivalDate: `2026-12-${String(order + 1).padStart(2, "0")}`,
      departureDate: `2026-12-${String(order + 2).padStart(2, "0")}`,
      nights: 1,
    })),
  });
  const storage = new MemoryBrowserStorage();
  const write = saveTripRecoveryToStorage(storage, local, { ownerId, writeId: "nikko-build" });
  const canonical = canonicalTripForOwner(ownerId, { ...local, legs: [], recommendations: [] }, "2026-08-23T12:00:00.000Z");
  const recovery = loadTripRecoveryFromStorage(storage, local.id, ownerId)!;

  assert.equal(tripRecoveryMatchesCanonical(recovery, canonical), true);
  assert.deepEqual(resolveCanonicalEquivalentTripRecoveryInStorage(storage, canonical, recovery), { equivalent: true, stored: true, recoveryResolved: true });
  assert.equal(loadTripRecoveryFromStorage(storage, local.id, ownerId), null);
  assert.equal(loadCachedTripFromStorage(storage, local.id, ownerId)?.stops.at(-1)?.canonicalPlaceId, "nikko");

  const genuineEdit = { ...canonical, brief: { ...canonical.brief, mustDo: "Spend an extra quiet morning in Nikko" } };
  const editWrite = saveTripRecoveryToStorage(storage, genuineEdit, { ownerId, writeId: "nikko-real-edit" });
  assert.equal(write.stored, true);
  assert.equal(editWrite.stored, true);
  const dirty = loadTripRecoveryFromStorage(storage, local.id, ownerId)!;
  assert.equal(tripRecoveryMatchesCanonical(dirty, canonical), false);
  assert.deepEqual(resolveCanonicalEquivalentTripRecoveryInStorage(storage, canonical, dirty), { equivalent: false, stored: false, recoveryResolved: false });
  assert.equal(loadTripRecoveryFromStorage(storage, local.id, ownerId)?.trip.brief.mustDo, "Spend an extra quiet morning in Nikko");
});

test("an owner-scoped unclaimed recovery survives A to B to A switching without becoming accessible to B", () => {
  const storage = new MemoryBrowserStorage();
  const ownerATrip = browserTrip({ id: "trip-owner-a", ownerId: null, title: "A unsynced" });
  const ownerBTrip = browserTrip({ id: "trip-owner-b", ownerId: "owner-b", title: "B cloud" });

  const recovery = saveTripRecoveryToStorage(storage, ownerATrip, {
    ownerId: "owner-a",
    writeId: "owner-a-write",
  });
  assert.equal(recovery.stored, true);
  assert.equal(cacheCanonicalTripToStorage(storage, ownerBTrip), true);

  assert.equal(loadLocalTripFromStorage(storage, ownerATrip.id, "owner-b"), null);
  assert.equal(loadTripRecoveryFromStorage(storage, ownerATrip.id, "owner-b"), null);
  assert.equal(loadActiveTripFromStorage(storage, "owner-b")?.id, ownerBTrip.id);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-b"), ownerBTrip.id);

  const reopenedForA = loadActiveTripFromStorage(storage, "owner-a");
  assert.equal(reopenedForA?.id, ownerATrip.id);
  assert.equal(reopenedForA?.title, "A unsynced");
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), ownerATrip.id);
});

test("cold offline owner selection reopens only the last verified account and A to B replacement fails closed", () => {
  const storage = new MemoryBrowserStorage();
  const ownerATrip = browserTrip({ id: "trip-owner-a-offline", ownerId: null, title: "A offline recovery" });
  const ownerBTrip = browserTrip({ id: "trip-owner-b-offline", ownerId: "owner-b", title: "B offline cache" });
  const ownerARecovery = saveTripRecoveryToStorage(storage, ownerATrip, {
    ownerId: "owner-a",
    writeId: "owner-a-offline-write",
  });
  assert.equal(ownerARecovery.stored, true);
  assert.equal(cacheCanonicalTripToStorage(storage, ownerBTrip), true);

  assert.equal(rememberLastOwnerInStorage(storage, "owner-a"), true);
  const rememberedA = loadRememberedOwnerFromStorage(storage);
  const offlineA = ownerIdForBrowserRecovery({
    authenticatedOwnerId: null,
    sessionPending: false,
    browserOffline: true,
    rememberedOwnerId: rememberedA,
  });
  assert.equal(offlineA, "owner-a");
  assert.equal(loadLocalTripFromStorage(storage, ownerATrip.id, offlineA)?.title, "A offline recovery");
  assert.equal(ownerIdForBrowserRecovery({ authenticatedOwnerId: null, sessionPending: true, browserOffline: true, rememberedOwnerId: rememberedA }), null);
  assert.equal(ownerIdForBrowserRecovery({ authenticatedOwnerId: null, sessionPending: false, browserOffline: false, rememberedOwnerId: rememberedA }), null);
  const liveB = ownerIdForBrowserRecovery({
    authenticatedOwnerId: "owner-b",
    sessionPending: true,
    browserOffline: true,
    rememberedOwnerId: rememberedA,
  });
  assert.equal(liveB, "owner-b", "a live account must override the stale offline address hint immediately");
  assert.equal(canUseHydratedTripScope("owner-a", liveB), false, "A must be quarantined during the B render, before effects run");

  assert.equal(rememberLastOwnerInStorage(storage, "owner-b"), true);
  const offlineB = ownerIdForBrowserRecovery({
    authenticatedOwnerId: null,
    sessionPending: false,
    browserOffline: true,
    rememberedOwnerId: loadRememberedOwnerFromStorage(storage),
  });
  assert.equal(offlineB, "owner-b");
  assert.equal(loadLocalTripFromStorage(storage, ownerATrip.id, offlineB), null);
  assert.equal(loadLocalTripFromStorage(storage, ownerBTrip.id, offlineB)?.title, "B offline cache");
  assert.equal(canUseHydratedTripScope("owner-a", offlineB), false);
  assert.equal(canUseHydratedTripScope("owner-b", offlineB), true);

  const ownerBoundBody = tripForRecoveryScope(ownerATrip, ownerARecovery.handle);
  assert.equal(ownerBoundBody?.ownerId, "owner-a");
  assert.equal(canPromoteTripForOwner(ownerBoundBody!, "owner-b"), false);
  assert.equal(canPromoteTripForOwner(ownerBoundBody!, "owner-a"), false, "owner binding routes this recovery through revision-aware save, never promotion");
  assert.equal(canUseHydratedTripScope(ownerARecovery.handle.ownerId, "owner-b"), false);

  assert.equal(forgetRememberedOwnerInStorage(storage), true);
  assert.equal(loadRememberedOwnerFromStorage(storage), null);
  assert.equal(ownerIdForBrowserRecovery({ authenticatedOwnerId: null, sessionPending: false, browserOffline: true, rememberedOwnerId: null }), null);
});

test("an owner-scoped unclaimed recovery is owner-bound before any network request", async () => {
  const trip = browserTrip({ id: "trip-owner-bound-request", ownerId: null });
  const handle = { ownerId: "owner-a", tripId: trip.id, writeId: "owner-bound-write" };
  let requestedBody: EasyTTrip | null = null;
  const request: typeof fetch = async (_input, init) => {
    requestedBody = JSON.parse(String(init?.body)) as EasyTTrip;
    return new Response(JSON.stringify({ error: "Trip ownership mismatch." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(() => saveTripRecoveryToEasyT(trip, handle, request), /ownership mismatch/i);
  assert.ok(requestedBody);
  assert.equal((requestedBody as EasyTTrip).ownerId, null, "promotion keeps an ownerless draft ownerless until the repository claims it");
  assert.equal(trip.ownerId, null, "binding must not mutate the recovery body");
});

test("a guest recovery is explicitly claimed by A and is not readable when the browser switches to B", () => {
  const storage = new MemoryBrowserStorage();
  const guestTrip = browserTrip({ id: "trip-guest-claim", ownerId: null, title: "Guest work" });
  assert.equal(saveTripRecoveryToStorage(storage, guestTrip, { ownerId: null, writeId: "guest-write" }).stored, true);

  const claimed = claimGuestTripRecoveryForOwnerInStorage(storage, guestTrip.id, "owner-a");
  assert.equal(claimed?.stored, true);
  assert.equal(claimed?.guestResolved, true);
  assert.equal(loadTripRecoveryFromStorage(storage, guestTrip.id, null), null);
  assert.equal(loadTripRecoveryFromStorage(storage, guestTrip.id, "owner-a")?.trip.title, "Guest work");
  assert.equal(loadTripRecoveryFromStorage(storage, guestTrip.id, "owner-b"), null);
  assert.equal(loadActiveTripFromStorage(storage, "owner-b"), null);
  assert.equal(loadActiveTripFromStorage(storage, "owner-a")?.id, guestTrip.id);
});

test("claiming a guest recovery never deletes a newer guest write interleaved by another tab", () => {
  const storage = new MemoryBrowserStorage();
  const guestTrip = browserTrip({ id: "trip-guest-interleave", ownerId: null, title: "Guest edit being claimed" });
  const guestWrite = saveTripRecoveryToStorage(storage, guestTrip, {
    ownerId: null,
    writeId: "guest-claim-1",
    now: "2026-08-23T13:10:00.000Z",
  });
  let injected = false;
  storage.onRemove = (key) => {
    if (injected || key !== tripRecoveryStorageKey(null, guestTrip.id, guestWrite.handle.writeId)) return;
    injected = true;
    const newer = saveTripRecoveryToStorage(
      storage,
      { ...guestTrip, title: "Newer guest edit from another tab" },
      { ownerId: null, writeId: "guest-claim-2", now: "2026-08-23T13:11:00.000Z", replace: guestWrite.handle },
    );
    assert.equal(newer.stored, true);
  };

  const claimed = claimGuestTripRecoveryForOwnerInStorage(storage, guestTrip.id, "owner-a");
  storage.onRemove = null;
  assert.equal(claimed?.stored, true);
  assert.equal(loadTripRecoveryFromStorage(storage, guestTrip.id, "owner-a")?.trip.title, "Guest edit being claimed");
  assert.equal(loadTripRecoveryFromStorage(storage, guestTrip.id, null)?.trip.title, "Newer guest edit from another tab");
  assert.equal(loadActiveTripFromStorage(storage, "owner-b"), null);
});

test("offline local resolution is exact, owner-scoped, and preserves recovery before clean cache", () => {
  const storage = new MemoryBrowserStorage();
  const tripId = "trip-offline";
  const dirty = browserTrip({ id: tripId, title: "Offline device edit" });
  const cached = browserTrip({
    id: tripId,
    title: "Offline canonical cache",
    updatedAt: "2026-08-23T13:00:00.000Z",
  });

  assert.equal(cacheCanonicalTripToStorage(storage, cached), true);
  assert.equal(saveTripRecoveryToStorage(storage, dirty, { writeId: "offline-write" }).stored, true);
  assert.equal(loadLocalTripFromStorage(storage, tripId, "owner-a")?.title, "Offline device edit");
  assert.equal(loadLocalTripFromStorage(storage, tripId, "owner-a", { recoveryOnly: true })?.title, "Offline device edit");
  assert.equal(loadCachedTripFromStorage(storage, tripId, "owner-a")?.title, "Offline canonical cache");
  assert.equal(loadLocalTripFromStorage(storage, "trip-other", "owner-a"), null);
  assert.equal(loadLocalTripFromStorage(storage, tripId, "owner-b"), null);
});

test("exact recovery remains visible when another trip owns the current pointer", () => {
  const storage = new MemoryBrowserStorage();
  const recoveryTrip = browserTrip({ id: "trip-exact-recovery", title: "Exact device recovery" });
  const currentTrip = browserTrip({ id: "trip-current-clean", title: "Different current cloud trip" });

  assert.equal(saveTripRecoveryToStorage(storage, recoveryTrip, { writeId: "exact-recovery-write" }).stored, true);
  assert.equal(cacheCanonicalTripToStorage(storage, currentTrip), true);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), currentTrip.id);
  assert.equal(loadActiveTripFromStorage(storage, "owner-a")?.id, currentTrip.id);
  assert.equal(loadTripRecoveryFromStorage(storage, recoveryTrip.id, "owner-a")?.trip.title, "Exact device recovery");
  assert.equal(loadLocalTripFromStorage(storage, recoveryTrip.id, "owner-a")?.title, "Exact device recovery");
});

test("loadRequestedTrip falls back to the exact cached document when the cloud request is offline", async (context) => {
  const storage = new MemoryBrowserStorage();
  const cached = browserTrip({ id: "trip-requested-offline", title: "Cached for offline reopen" });
  assert.equal(cacheCanonicalTripToStorage(storage, cached), true);

  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });

  assert.equal((await loadRequestedTrip(cached.id, "owner-a"))?.id, cached.id);
  assert.equal(await loadRequestedTrip("trip-wrong", "owner-a"), null);
  assert.equal(await loadRequestedTrip(cached.id, "owner-b"), null);
});

test("loadRequestedTrip does not use a local cache after a definitive cloud 404", async (context) => {
  const storage = new MemoryBrowserStorage();
  const cached = browserTrip({ id: "trip-requested-deleted", title: "Stale local copy" });
  assert.equal(cacheCanonicalTripToStorage(storage, cached), true);

  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Trip not found." }), { status: 404 });
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });

  assert.equal(await loadRequestedTrip(cached.id, "owner-a"), null);
});

test("offline requested-trip composition returns dirty recovery ahead of the same clean cache", async (context) => {
  const storage = new MemoryBrowserStorage();
  const tripId = "trip-requested-dirty-offline";
  const clean = browserTrip({ id: tripId, title: "Clean cached cloud revision" });
  const dirty = browserTrip({ id: tripId, title: "Dirty device revision" });
  assert.equal(cacheCanonicalTripToStorage(storage, clean), true);
  assert.equal(saveTripRecoveryToStorage(storage, dirty, { writeId: "requested-dirty" }).stored, true);

  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  globalThis.fetch = async () => { throw new TypeError("network unavailable"); };
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });

  assert.equal((await loadRequestedTrip(tripId, "owner-a"))?.title, "Dirty device revision");
  assert.equal(await loadRequestedTrip(tripId, "owner-b"), null);
});

test("a cloud response for a different trip ID is rejected and never cached", async (context) => {
  const storage = new MemoryBrowserStorage();
  const requestedId = "trip-requested-id";
  const wrongTrip = browserTrip({ id: "trip-wrong-response" });
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  globalThis.fetch = async () => new Response(JSON.stringify({ trip: wrongTrip }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });

  assert.equal(await loadTripFromEasyT(requestedId), null);
  assert.equal(loadCachedTripFromStorage(storage, wrongTrip.id, "owner-a"), null);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), null);
});

test("New trip synchronously preserves the latest edit, cancels when storage is blocked, and requires explicit discard", () => {
  const storage = new MemoryBrowserStorage();
  const dirty = browserTrip({ id: "trip-before-new" });
  const cached = browserTrip({ id: dirty.id, title: "Clean cloud copy" });
  const firstWrite = saveTripRecoveryToStorage(storage, dirty, { writeId: "new-trip-write" });
  assert.equal(firstWrite.stored, true);
  assert.equal(cacheCanonicalTripToStorage(storage, cached), true);

  const navigationTarget = new EventTarget();
  navigationTarget.addEventListener("easyt-before-new-trip", () => {
    const latest = saveTripRecoveryToStorage(
      storage,
      { ...dirty, title: "Latest edit flushed before navigation" },
      { writeId: "new-trip-latest", replace: firstWrite.handle },
    );
    assert.equal(shouldAllowNewTripNavigation(latest), true);
  });
  assert.equal(beginNewTripNavigationInStorage(storage, "owner-a", navigationTarget), true);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), null);
  assert.equal(loadTripRecoveryFromStorage(storage, dirty.id, "owner-a")?.trip.title, "Latest edit flushed before navigation");
  assert.equal(loadCachedTripFromStorage(storage, dirty.id, "owner-a")?.id, dirty.id);

  const blockedStorage = new MemoryBrowserStorage();
  const blockedTrip = browserTrip({ id: "trip-blocked-before-new", title: "Previously durable edit" });
  const blockedWrite = saveTripRecoveryToStorage(blockedStorage, blockedTrip, { writeId: "blocked-before-new" });
  const blockedPointer = loadCurrentTripIdFromStorage(blockedStorage, "owner-a");
  const blockedTarget = new EventTarget();
  blockedTarget.addEventListener("easyt-before-new-trip", (event) => {
    blockedStorage.blockSet = true;
    const latest = saveTripRecoveryToStorage(
      blockedStorage,
      { ...blockedTrip, title: "In-memory edit that could not flush" },
      { writeId: "blocked-latest", replace: blockedWrite.handle },
    );
    if (!shouldAllowNewTripNavigation(latest)) event.preventDefault();
  });
  assert.equal(beginNewTripNavigationInStorage(blockedStorage, "owner-a", blockedTarget), false);
  blockedStorage.blockSet = false;
  assert.equal(loadCurrentTripIdFromStorage(blockedStorage, "owner-a"), blockedPointer);
  assert.equal(loadTripRecoveryFromStorage(blockedStorage, blockedTrip.id, "owner-a")?.trip.title, "Previously durable edit");

  blockedStorage.blockRemove = true;
  assert.equal(beginNewTripNavigationInStorage(blockedStorage, "owner-a", new EventTarget()), false);
  blockedStorage.blockRemove = false;
  assert.equal(loadCurrentTripIdFromStorage(blockedStorage, "owner-a"), blockedPointer);

  const recoveryToDiscard = loadTripRecoveryFromStorage(storage, dirty.id, "owner-a");
  assert.ok(recoveryToDiscard);
  assert.equal(discardTripRecoveryInStorage(storage, recoveryToDiscard, false), false);
  assert.equal(loadTripRecoveryFromStorage(storage, dirty.id, "owner-a")?.trip.id, dirty.id);
  assert.equal(discardTripRecoveryInStorage(storage, recoveryToDiscard, true), true);
  assert.equal(loadTripRecoveryFromStorage(storage, dirty.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, dirty.id, "owner-a")?.id, dirty.id);
});

test("confirmed discard removes only the version shown in the prompt and preserves an interleaved newer edit", () => {
  const storage = new MemoryBrowserStorage();
  const first = browserTrip({ id: "trip-discard-cas", title: "Version shown in discard prompt" });
  const shown = saveTripRecoveryToStorage(storage, first, {
    writeId: "discard-shown",
    now: "2026-08-23T14:05:00.000Z",
  });
  let injected = false;
  storage.onRemove = (key) => {
    if (injected || key !== tripRecoveryStorageKey("owner-a", first.id, shown.handle.writeId)) return;
    injected = true;
    const newer = saveTripRecoveryToStorage(
      storage,
      { ...first, title: "Newer edit while confirmation was open" },
      { writeId: "discard-newer", now: "2026-08-23T14:06:00.000Z", replace: shown.handle },
    );
    assert.equal(newer.stored, true);
  };

  assert.equal(discardTripRecoveryInStorage(storage, shown.handle, true), true);
  storage.onRemove = null;
  assert.equal(loadTripRecoveryFromStorage(storage, first.id, "owner-a")?.trip.title, "Newer edit while confirmation was open");
});

test("only the matching successful write can resolve recovery and an older ACK cannot delete a newer write", () => {
  const storage = new MemoryBrowserStorage();
  const first = browserTrip({ id: "trip-write-order", title: "First local write" });
  const newer = browserTrip({ id: first.id, title: "Newer local write" });
  const firstResult = saveTripRecoveryToStorage(storage, first, {
    writeId: "write-1",
    now: "2026-08-23T14:00:00.000Z",
  });
  const newerResult = saveTripRecoveryToStorage(storage, newer, {
    writeId: "write-2",
    now: "2026-08-23T14:01:00.000Z",
    replace: firstResult.handle,
  });

  assert.equal(markTripRecoveryStateInStorage(storage, firstResult.handle, "conflict"), false);
  assert.equal(resolveTripRecoveryInStorage(storage, firstResult.handle), false);
  assert.equal(loadTripRecoveryFromStorage(storage, first.id, "owner-a")?.trip.title, "Newer local write");

  assert.equal(cacheCanonicalTripToStorage(storage, browserTrip({ id: first.id, title: "Acknowledged cloud" })), true);
  assert.equal(resolveTripRecoveryInStorage(storage, newerResult.handle), true);
  assert.equal(loadTripRecoveryFromStorage(storage, first.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, first.id, "owner-a")?.title, "Acknowledged cloud");
});

test("builder autosave reuses the Build write ID for the same planned document", () => {
  const storage = new MemoryBrowserStorage();
  const draft = browserTrip({
    id: "trip-build-autosave",
    ownerId: null,
    title: "Build request waiting for cloud acknowledgement",
  });
  const draftWrite = saveTripRecoveryToStorage(storage, draft, {
    ownerId: "owner-a",
    writeId: "draft-write",
  });
  const planned = { ...draft, status: "planned" as const };
  const buildWrite = saveTripRecoveryToStorage(storage, planned, {
    ownerId: "owner-a",
    writeId: "build-write",
    replace: draftWrite.handle,
  });

  // This is the builder's delayed 450 ms autosave after a save-state render
  // reconstructed the same ownerless document with a fresh local timestamp.
  const rerenderedPlanned = { ...planned, updatedAt: "2026-08-23T11:00:00.450Z" };
  const autosave = saveTripRecoveryToStorage(storage, rerenderedPlanned, {
    ownerId: "owner-a",
    writeId: "autosave-write",
    replace: buildWrite.handle,
  });

  assert.equal(autosave.stored, true);
  assert.equal(autosave.handle.ownerId, buildWrite.handle.ownerId);
  assert.equal(autosave.handle.tripId, buildWrite.handle.tripId);
  assert.equal(autosave.handle.writeId, buildWrite.handle.writeId);
  assert.equal(loadTripRecoveryFromStorage(storage, planned.id, "owner-a")?.writeId, "build-write");
  assert.equal(loadTripRecoveryFromStorage(storage, planned.id, "owner-a")?.trip.updatedAt, planned.updatedAt);
  const acknowledged = cacheCanonicalTripWithRecoveryToStorage(
    storage,
    { ...planned, ownerId: "owner-a", updatedAt: "2026-08-23T12:00:00.000Z" },
    buildWrite.handle,
  );
  assert.equal(acknowledged.stored, true);
  assert.equal(acknowledged.recoveryResolved, true);
  assert.equal(loadTripRecoveryFromStorage(storage, planned.id, "owner-a"), null);
});

test("a cross-tab write interleaved inside an older ACK cleanup remains recoverable", () => {
  const storage = new MemoryBrowserStorage();
  const first = browserTrip({ id: "trip-interleaved", title: "First tab edit" });
  const firstWrite = saveTripRecoveryToStorage(storage, first, {
    writeId: "interleave-1",
    now: "2026-08-23T14:10:00.000Z",
  });
  assert.equal(firstWrite.stored, true);

  let injected = false;
  storage.onRemove = (key) => {
    if (injected || key !== tripRecoveryStorageKey("owner-a", first.id, firstWrite.handle.writeId)) return;
    injected = true;
    const newer = saveTripRecoveryToStorage(
      storage,
      { ...first, title: "Second tab edit" },
      { writeId: "interleave-2", now: "2026-08-23T14:11:00.000Z", replace: firstWrite.handle },
    );
    assert.equal(newer.stored, true);
  };

  assert.equal(resolveTripRecoveryInStorage(storage, firstWrite.handle), true);
  storage.onRemove = null;
  assert.equal(loadTripRecoveryFromStorage(storage, first.id, "owner-a")?.trip.title, "Second tab edit");
  assert.equal(loadTripRecoveryFromStorage(storage, first.id, "owner-a")?.writeId, "interleave-2");
});

test("quota recovery writes evict the oldest clean cache but never another recovery", () => {
  const storage = new MemoryBrowserStorage();
  const oldCache = browserTrip({ id: "trip-old-cache", title: "Old expendable cache" });
  const newCache = browserTrip({ id: "trip-new-cache", title: "Newer cache" });
  const protectedRecovery = browserTrip({ id: "trip-protected-recovery", title: "Protected recovery" });
  const target = browserTrip({ id: "trip-quota-target", title: "Must survive quota" });
  assert.equal(cacheCanonicalTripToStorage(storage, oldCache, "2026-08-23T10:00:00.000Z"), true);
  assert.equal(cacheCanonicalTripToStorage(storage, newCache, "2026-08-23T11:00:00.000Z"), true);
  assert.equal(saveTripRecoveryToStorage(storage, protectedRecovery, { writeId: "protected" }).stored, true);

  const oldCacheKey = tripCacheStorageKey("owner-a", oldCache.id);
  const targetKey = tripRecoveryStorageKey("owner-a", target.id, "quota-target");
  storage.quotaOnSet = (key) => key === targetKey && storage.peek(oldCacheKey) !== null;
  const result = saveTripRecoveryToStorage(storage, target, { writeId: "quota-target" });

  assert.equal(result.stored, true);
  assert.equal(loadCachedTripFromStorage(storage, oldCache.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, newCache.id, "owner-a")?.id, newCache.id);
  assert.equal(loadTripRecoveryFromStorage(storage, protectedRecovery.id, "owner-a")?.trip.id, protectedRecovery.id);
  assert.equal(loadTripRecoveryFromStorage(storage, target.id, "owner-a")?.trip.id, target.id);
});

test("quota exhaustion reports failure after clean eviction and leaves the prior recovery intact", () => {
  const storage = new MemoryBrowserStorage();
  const trip = browserTrip({ id: "trip-quota-failure", title: "Previously safe edit" });
  const clean = browserTrip({ id: "trip-expendable", title: "Expendable cache" });
  const safeWrite = saveTripRecoveryToStorage(storage, trip, { writeId: "safe-write" });
  assert.equal(safeWrite.stored, true);
  assert.equal(cacheCanonicalTripToStorage(storage, clean), true);

  storage.quotaOnSet = () => true;
  const replacement = saveTripRecoveryToStorage(
    storage,
    { ...trip, title: "Could not be persisted" },
    { writeId: "failed-write", replace: safeWrite.handle },
  );

  assert.equal(replacement.stored, false);
  assert.equal(loadCachedTripFromStorage(storage, clean.id, "owner-a"), null);
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-a")?.trip.title, "Previously safe edit");
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-a")?.writeId, "safe-write");
});

test("a quota-blocked current pointer still allows an equivalent recovery to reconcile", () => {
  const storage = new MemoryBrowserStorage();
  const trip = browserTrip({ id: "trip-pointer-quota" });
  const recovery = saveTripRecoveryToStorage(storage, trip, { writeId: "pointer-recovery" });
  assert.equal(recovery.stored, true);
  storage.quotaOnSet = (key) => key === currentTripStorageKey("owner-a");

  assert.equal(cacheCanonicalTripToStorage(storage, trip), true);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), trip.id);
  assert.equal(loadCachedTripFromStorage(storage, trip.id, "owner-a")?.id, trip.id);
  assert.equal(resolveTripRecoveryInStorage(storage, recovery.handle), false);
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, trip.id, "owner-a")?.id, trip.id);
});

test("a failed canonical cache write cannot acknowledge or resolve the matching recovery", () => {
  const storage = new MemoryBrowserStorage();
  const dirty = browserTrip({ id: "trip-cache-ack-quota", title: "Only durable recovery" });
  const recovery = saveTripRecoveryToStorage(storage, dirty, { writeId: "cache-ack-recovery" });
  assert.equal(recovery.stored, true);
  const cacheKey = tripCacheStorageKey("owner-a", dirty.id);
  storage.quotaOnSet = (key) => key === cacheKey;

  const result = cacheCanonicalTripWithRecoveryToStorage(
    storage,
    { ...dirty, title: "Cloud ACK without durable cache" },
    recovery.handle,
  );
  assert.equal(result.stored, false);
  assert.equal(result.recoveryResolved, false);
  assert.equal(loadTripRecoveryFromStorage(storage, dirty.id, "owner-a")?.trip.title, "Only durable recovery");
  assert.equal(loadCachedTripFromStorage(storage, dirty.id, "owner-a"), null);
});

test("blocked browser storage fails closed without exposing, discarding, or claiming a safe write", () => {
  const storage = new MemoryBrowserStorage();
  const trip = browserTrip({ id: "trip-blocked", title: "Previously durable recovery" });
  const safeWrite = saveTripRecoveryToStorage(storage, trip, { writeId: "safe-before-block" });
  assert.equal(safeWrite.stored, true);
  storage.blockGet = true;
  storage.blockSet = true;
  storage.blockRemove = true;
  storage.blockKeys = true;

  assert.equal(saveTripRecoveryToStorage(
    storage,
    { ...trip, title: "Newest edit could not be stored" },
    { writeId: "blocked-write", replace: safeWrite.handle },
  ).stored, false);
  assert.equal(cacheCanonicalTripToStorage(storage, trip), false);
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, trip.id, "owner-a"), null);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), null);
  assert.equal(loadActiveTripFromStorage(storage, "owner-a"), null);
  assert.equal(discardTripRecoveryInStorage(storage, safeWrite.handle, true), false);
  assert.equal(clearCurrentTripInStorage(storage, "owner-a"), false);
  storage.blockGet = false;
  storage.blockSet = false;
  storage.blockRemove = false;
  storage.blockKeys = false;
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-a")?.trip.title, "Previously durable recovery");
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), trip.id);
});

test("legacy migration copies recovery before deleting v1 and retains v1 when the copy fails", () => {
  const trip = browserTrip({ id: "trip-legacy" });
  const storage = new MemoryBrowserStorage();
  storage.seed(EASYT_ACTIVE_TRIP_KEY, JSON.stringify(trip));

  assert.equal(loadActiveTripFromStorage(storage, "owner-a")?.id, trip.id);
  assert.equal(storage.peek(EASYT_ACTIVE_TRIP_KEY), null);
  assert.equal(loadTripRecoveryFromStorage(storage, trip.id, "owner-a")?.trip.id, trip.id);

  const quotaStorage = new MemoryBrowserStorage();
  quotaStorage.seed(EASYT_ACTIVE_TRIP_KEY, JSON.stringify(trip));
  quotaStorage.quotaOnSet = () => true;
  assert.equal(loadActiveTripFromStorage(quotaStorage, "owner-a")?.id, trip.id);
  assert.equal(quotaStorage.peek(EASYT_ACTIVE_TRIP_KEY), JSON.stringify(trip));
  assert.equal(loadTripRecoveryFromStorage(quotaStorage, trip.id, "owner-a"), null);
});

test("legacy recovery migrates before a newer clean current pointer can hide it", () => {
  const storage = new MemoryBrowserStorage();
  const clean = browserTrip({ id: "trip-new-clean", title: "New clean cache" });
  const legacy = browserTrip({ id: "trip-old-pending", title: "Legacy unsynced recovery" });
  assert.equal(cacheCanonicalTripToStorage(storage, clean), true);
  storage.seed(EASYT_ACTIVE_TRIP_KEY, JSON.stringify(legacy));

  const recovery = loadCurrentTripRecoveryFromStorage(storage, "owner-a");
  assert.equal(recovery?.trip.id, legacy.id);
  assert.equal(recovery?.trip.title, "Legacy unsynced recovery");
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), legacy.id);
  assert.equal(loadCachedTripFromStorage(storage, clean.id, "owner-a")?.id, clean.id);
  assert.equal(storage.peek(EASYT_ACTIVE_TRIP_KEY), null);
});

test("direct canonical writes migrate v1 first and a retained v1 record never shadows newer v2 recovery", () => {
  const directStorage = new MemoryBrowserStorage();
  const legacy = browserTrip({ id: "trip-direct-legacy", title: "Legacy pending edit" });
  const cloud = browserTrip({ id: "trip-direct-cloud", title: "Direct cloud open" });
  directStorage.seed(EASYT_ACTIVE_TRIP_KEY, JSON.stringify(legacy));

  assert.equal(cacheCanonicalTripToStorage(directStorage, cloud), true);
  assert.equal(directStorage.peek(EASYT_ACTIVE_TRIP_KEY), null);
  assert.equal(loadTripRecoveryFromStorage(directStorage, legacy.id, "owner-a")?.trip.title, "Legacy pending edit");
  assert.equal(loadCachedTripFromStorage(directStorage, cloud.id, "owner-a")?.title, "Direct cloud open");

  const retainedStorage = new MemoryBrowserStorage();
  const newer = browserTrip({ id: "trip-retained-legacy", title: "Newer v2 recovery" });
  const newerWrite = saveTripRecoveryToStorage(retainedStorage, newer, { writeId: "newer-v2" });
  assert.equal(newerWrite.stored, true);
  retainedStorage.seed(EASYT_ACTIVE_TRIP_KEY, JSON.stringify({ ...newer, title: "Older v1 recovery" }));

  assert.equal(loadLocalTripFromStorage(retainedStorage, newer.id, "owner-a")?.title, "Newer v2 recovery");
  assert.ok(retainedStorage.peek(EASYT_ACTIVE_TRIP_KEY), "blocked migration must keep the v1 bytes");
  assert.equal(loadActiveTripFromStorage(retainedStorage, "owner-a")?.title, "Newer v2 recovery");
});

test("cross-tab storage matching is scoped to exact owner and trip keys", () => {
  const tripId = "trip-cross-tab";
  assert.equal(tripStorageEventMatches(tripRecoveryStorageKey("owner-a", tripId), "owner-a", tripId), true);
  assert.equal(tripStorageEventMatches(tripRecoveryStorageKey("owner-a", tripId, "cross-tab-write"), "owner-a", tripId), true);
  assert.equal(tripStorageEventMatches(tripCacheStorageKey("owner-a", tripId), "owner-a", tripId), true);
  assert.equal(tripStorageEventMatches(currentTripStorageKey("owner-a"), "owner-a", tripId), true);
  assert.equal(tripStorageEventMatches(tripRecoveryStorageKey("owner-a", "trip-other"), "owner-a", tripId), false);
  assert.equal(tripStorageEventMatches(tripRecoveryStorageKey("owner-b", tripId), "owner-a", tripId), false);
  assert.equal(tripStorageEventMatches(null, "owner-a", tripId), false);
});

test("service worker advances public documents online and reopens the planner shell offline", async () => {
  const source = readFileSync(new URL("../public/easyt-sw.js", import.meta.url), "utf8");
  const listeners = new Map<string, (event: unknown) => void>();
  const plannerShell = '<!doctype html><div>offline planner shell</div><link rel="stylesheet" href="/_next/static/css/planner.css"><script src="/_next/static/chunks/planner.js"></script>';
  const cachedResponses = new Map([
    ["/journey/home", '<!doctype html><script src="/_next/static/chunks/home.js"></script>'],
    ["/journey/plan", plannerShell],
  ]);
  const previousCachedResponses = new Map([
    ["/_next/static/chunks/previous-client.js", "old client dependency"],
  ]);
  const addedAssets: string[] = [];
  const deletedCaches: string[] = [];
  const cachedWrites: Array<{ key: string; body: string }> = [];
  let skipWaitingCalls = 0;
  let networkResponse: Response | null = null;
  const cache = {
    addAll: async () => undefined,
    add: async (asset: string) => { addedAssets.push(asset); },
    match: async (request: string | { url: string }, options?: { ignoreSearch?: boolean }) => {
      const raw = typeof request === "string" ? request : request.url;
      const parsed = raw.startsWith("http") ? new URL(raw) : null;
      const key = parsed
        ? `${parsed.pathname}${options?.ignoreSearch ? "" : parsed.search}`
        : raw;
      const body = cachedResponses.get(key);
      return body === undefined ? undefined : new Response(body, { status: 200 });
    },
    put: async (request: string | { url: string }, response: Response) => {
      const raw = typeof request === "string" ? request : request.url;
      cachedWrites.push({ key: raw, body: await response.text() });
    },
  };
  const serviceWorkerGlobal = {
    location: { origin: "https://morrovia.test" },
    clients: { claim: () => undefined },
    skipWaiting: () => { skipWaitingCalls += 1; },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
  };
  runInNewContext(source, {
    self: serviceWorkerGlobal,
    caches: {
      open: async () => cache,
      match: async (request: string | { url: string }) => {
        const current = await cache.match(request);
        if (current) return current;
        const raw = typeof request === "string" ? request : request.url;
        const key = raw.startsWith("http") ? new URL(raw).pathname : raw;
        const previous = previousCachedResponses.get(key);
        return previous === undefined ? undefined : new Response(previous, { status: 200 });
      },
      keys: async () => ["easyt-public-shell-v4", "easyt-public-shell-v5", "analytics-unrelated-cache"],
      delete: async (key: string) => { deletedCaches.push(key); return true; },
    },
    fetch: async () => {
      if (networkResponse) return networkResponse.clone();
      throw new TypeError("network unavailable");
    },
    URL,
    Response,
    Promise,
  });

  let installPromise: Promise<unknown> | null = null;
  const installHandler = listeners.get("install");
  assert.ok(installHandler);
  installHandler({ waitUntil: (promise: Promise<unknown>) => { installPromise = promise; } });
  assert.ok(installPromise);
  await installPromise;
  assert.equal(skipWaitingCalls, 1, "the network-first worker must take over from the cache-first release");
  assert.deepEqual(addedAssets.sort(), [
    "/_next/static/chunks/home.js",
    "/_next/static/chunks/planner.js",
    "/_next/static/css/planner.css",
  ]);

  let activatePromise: Promise<unknown> | null = null;
  const activateHandler = listeners.get("activate");
  assert.ok(activateHandler);
  activateHandler({ waitUntil: (promise: Promise<unknown>) => { activatePromise = promise; } });
  assert.ok(activatePromise);
  await activatePromise;
  assert.deepEqual(deletedCaches, ["easyt-public-shell-v4"], "activation retains one previous hashed graph for already-open clients");

  let responsePromise: Promise<Response> | null = null;
  const handler = listeners.get("fetch");
  assert.ok(handler);
  networkResponse = new Response("<!doctype html><div>current deployment shell</div>", { status: 200 });
  handler({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://morrovia.test/journey/new",
    },
    respondWith: (response: Promise<Response> | Response) => {
      responsePromise = Promise.resolve(response);
    },
  });
  assert.ok(responsePromise, "public shell navigation must be handled online");
  const currentResponse = await (responsePromise as Promise<Response>);
  assert.equal(await currentResponse.text(), "<!doctype html><div>current deployment shell</div>");
  assert.deepEqual(cachedWrites, [{ key: "/journey/new", body: "<!doctype html><div>current deployment shell</div>" }]);

  networkResponse = null;
  responsePromise = null;
  handler({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://morrovia.test/journey/plan?trip=trip-offline",
    },
    respondWith: (response: Promise<Response> | Response) => {
      responsePromise = Promise.resolve(response);
    },
  });

  assert.ok(responsePromise, "query-based planner navigation must be handled while offline");
  const response = await (responsePromise as Promise<Response>);
  assert.equal(await response.text(), plannerShell);

  responsePromise = null;
  handler({
    request: {
      method: "GET",
      mode: "no-cors",
      url: "https://morrovia.test/_next/static/chunks/previous-client.js",
    },
    respondWith: (staticResponse: Promise<Response> | Response) => {
      responsePromise = Promise.resolve(staticResponse);
    },
  });
  assert.ok(responsePromise, "an already-open old client must retain its immediately previous hashed dependency graph");
  assert.equal(await (await (responsePromise as Promise<Response>)).text(), "old client dependency");
});
