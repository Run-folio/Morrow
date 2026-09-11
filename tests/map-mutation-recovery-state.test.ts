import assert from "node:assert/strict";
import test from "node:test";

import { createTripMutationPersistenceQueue } from "../lib/easyt/trip-mutation-persistence.ts";
import {
  cacheCanonicalTrip,
  cacheCanonicalTripToStorage,
  EasyTTripSaveConflictError,
  loadCachedTripFromStorage,
  loadTripRecovery,
  loadTripRecoveryFromStorage,
  markTripRecoveryState,
  saveTripRecovery,
  saveTripRecoveryToEasyT,
  saveTripRecoveryToStorage,
  subscribeToTripStorage,
  tripRecoveryIsAwaitingCanonicalSave,
  type EasyTBrowserStorage,
  type TripRecoveryHandle,
} from "../lib/easyt/storage.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

class MemoryBrowserStorage implements EasyTBrowserStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function mapTrip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-map-recovery-state",
    ownerId: "owner-a",
    title: "Map recovery trip",
    status: "planned",
    startDate: "2026-09-11",
    endDate: "2026-09-15",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Eat locally",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      customActivities: {},
      mapPins: [],
    },
    stops: [],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-09-11T08:00:00.000Z",
    updatedAt: "revision-1",
    ...overrides,
  };
}

function installBrowser(storage: MemoryBrowserStorage) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget() as EventTarget & { localStorage: MemoryBrowserStorage };
  target.localStorage = storage;
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

function observeRecoveryWarning(trip: EasyTTrip) {
  const warningStates: boolean[] = [];
  const unsubscribe = subscribeToTripStorage(trip.ownerId, trip.id, () => {
    const recovery = loadTripRecovery(trip.id, trip.ownerId);
    warningStates.push(Boolean(recovery && !tripRecoveryIsAwaitingCanonicalSave(recovery)));
  });
  return { warningStates, unsubscribe };
}

test("a delayed successful authenticated Map save never presents its exact safe recovery as a conflict", async (t) => {
  const storage = new MemoryBrowserStorage();
  const restoreBrowser = installBrowser(storage);
  const base = mapTrip();
  const edited = mapTrip({ brief: { ...base.brief, customActivities: { 1: ["Night market"] } } });
  cacheCanonicalTripToStorage(storage, base);
  const observed = observeRecoveryWarning(base);
  t.after(() => { observed.unsubscribe(); restoreBrowser(); });

  let releaseSave: ((trip: EasyTTrip) => void) | undefined;
  const delayedSave = new Promise<EasyTTrip>((resolve) => { releaseSave = resolve; });
  const queue = createTripMutationPersistenceQueue(async () => delayedSave);
  queue.reset(base);
  const recovery = saveTripRecovery(edited, { ownerId: "owner-a", accountSavePending: true });
  assert.equal(recovery.stored, true);
  assert.ok(loadTripRecovery(base.id, "owner-a"), "device-safe write exists before the account ACK");
  assert.equal(tripRecoveryIsAwaitingCanonicalSave(loadTripRecovery(base.id, "owner-a")!), true);
  assert.deepEqual(observed.warningStates, [false]);

  const saving = queue.enqueue(edited, recovery.handle).then((saved) => {
    cacheCanonicalTrip(saved, recovery.handle);
    return saved;
  });
  await Promise.resolve();
  assert.deepEqual(observed.warningStates, [false], "the intentionally delayed save remains normal pending state");

  releaseSave?.({ ...edited, updatedAt: "revision-2" });
  const saved = await saving;
  assert.equal(saved.updatedAt, "revision-2");
  assert.equal(loadTripRecovery(base.id, "owner-a"), null);
  assert.equal(loadCachedTripFromStorage(storage, base.id, "owner-a")?.updatedAt, "revision-2");
  assert.equal(observed.warningStates.includes(true), false);
});

test("a failed authenticated Map save preserves the device copy and makes recovery actionable", async (t) => {
  const storage = new MemoryBrowserStorage();
  const restoreBrowser = installBrowser(storage);
  const base = mapTrip();
  const edited = { ...base, title: "Offline Map edit" };
  const observed = observeRecoveryWarning(base);
  t.after(() => { observed.unsubscribe(); restoreBrowser(); });
  const recovery = saveTripRecovery(edited, { ownerId: "owner-a", accountSavePending: true });

  await assert.rejects(async () => {
    try {
      throw new TypeError("network unavailable");
    } catch (error) {
      markTripRecoveryState(recovery.handle, "network");
      throw error;
    }
  });

  const remaining = loadTripRecovery(base.id, "owner-a");
  assert.equal(remaining?.trip.title, "Offline Map edit");
  assert.equal(remaining?.state, "network");
  assert.equal(tripRecoveryIsAwaitingCanonicalSave(remaining!), false);
  assert.equal(observed.warningStates.at(-1), true);
});

test("a stale Map CAS remains a conflict and cannot overwrite the cloud trip", async (t) => {
  const storage = new MemoryBrowserStorage();
  const restoreBrowser = installBrowser(storage);
  const stale = mapTrip();
  const cloud = { ...stale, title: "Cloud edit from another tab", updatedAt: "revision-2" };
  const local = { ...stale, title: "Stale local Map edit" };
  cacheCanonicalTripToStorage(storage, cloud);
  const observed = observeRecoveryWarning(stale);
  t.after(() => { observed.unsubscribe(); restoreBrowser(); });
  const recovery = saveTripRecovery(local, { ownerId: "owner-a", accountSavePending: true });
  const request: typeof fetch = async () => new Response(JSON.stringify({
    error: "This trip changed on another device.",
    category: "conflict",
    trip: cloud,
    conflictReason: "cloud-changed",
  }), { status: 409, headers: { "content-type": "application/json" } });

  await assert.rejects(
    async () => {
      try {
        await saveTripRecoveryToEasyT(local, recovery.handle, request);
      } catch (error) {
        markTripRecoveryState(recovery.handle, "conflict", "cloud-changed");
        throw error;
      }
    },
    (error: unknown) => error instanceof EasyTTripSaveConflictError,
  );
  assert.equal(loadCachedTripFromStorage(storage, stale.id, "owner-a")?.title, cloud.title);
  assert.equal(loadTripRecovery(stale.id, "owner-a")?.trip.title, local.title);
  assert.equal(loadTripRecovery(stale.id, "owner-a")?.state, "conflict");
  assert.equal(observed.warningStates.at(-1), true);
});

test("rapid Map mutations serialize coherent revisions without transient warnings or lost fields", async (t) => {
  const storage = new MemoryBrowserStorage();
  const restoreBrowser = installBrowser(storage);
  const base = mapTrip();
  cacheCanonicalTripToStorage(storage, base);
  const observed = observeRecoveryWarning(base);
  t.after(() => { observed.unsubscribe(); restoreBrowser(); });
  let canonical = base;
  let revision = 1;
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let requestCount = 0;
  const queue = createTripMutationPersistenceQueue(async (submitted) => {
    requestCount += 1;
    if (requestCount === 1) await firstGate;
    revision += 1;
    canonical = { ...structuredClone(submitted), updatedAt: `revision-${revision}` };
    return canonical;
  });
  queue.reset(base);

  const restaurant = mapTrip({ brief: { ...base.brief, customActivities: { 1: ["Cafe"] } } });
  const stay = mapTrip({ brief: { ...restaurant.brief, selectedPlaces: { stay: ["Ryokan"] } } });
  const activity = mapTrip({ brief: { ...stay.brief, mapPins: [{ id: "museum", title: "Museum", category: "activity", dayNumber: 1, latitude: 35.6, longitude: 139.7 }] } });
  let prior: TripRecoveryHandle | undefined;
  const saves = [restaurant, stay, activity].map((trip) => {
    const recovery = saveTripRecovery(trip, { ownerId: "owner-a", replace: prior, accountSavePending: true });
    assert.equal(recovery.stored, true);
    prior = recovery.handle;
    return queue.enqueue(trip, recovery.handle).then((saved) => {
      cacheCanonicalTrip(saved, recovery.handle);
      return saved;
    });
  });
  await Promise.resolve();
  assert.equal(requestCount, 1);
  assert.equal(observed.warningStates.includes(true), false);
  releaseFirst?.();
  await Promise.all(saves);

  assert.equal(canonical.updatedAt, "revision-4");
  assert.deepEqual(canonical.brief.customActivities?.[1], ["Cafe"]);
  assert.deepEqual(canonical.brief.selectedPlaces.stay, ["Ryokan"]);
  assert.equal(canonical.brief.mapPins?.filter((pin) => pin.id === "museum").length, 1);
  assert.equal(loadTripRecovery(base.id, "owner-a"), null);
  assert.equal(observed.warningStates.includes(true), false);
});

test("successful reload is clean, while historical and other-owner recovery remain distinct", async (t) => {
  const storage = new MemoryBrowserStorage();
  const restoreBrowser = installBrowser(storage);
  t.after(restoreBrowser);
  const base = mapTrip();
  const edited = { ...base, title: "Canonical Map result" };
  const recovery = saveTripRecovery(edited, { ownerId: "owner-a", accountSavePending: true });
  cacheCanonicalTrip({ ...edited, updatedAt: "revision-2" }, recovery.handle);
  assert.equal(loadTripRecovery(base.id, "owner-a"), null, "a reopen has one canonical result and no stale banner record");

  const historical = { ...edited, title: "Historical unsynced work", updatedAt: "revision-2" };
  saveTripRecoveryToStorage(storage, historical, { ownerId: "owner-a", writeId: "historical-write" });
  const historicalRecord = loadTripRecoveryFromStorage(storage, base.id, "owner-a");
  assert.ok(historicalRecord);
  assert.equal(tripRecoveryIsAwaitingCanonicalSave(historicalRecord), false, "a pending record after reload is not mistaken for an active request");
  assert.equal(loadTripRecoveryFromStorage(storage, base.id, "owner-b"), null, "owner scope cannot see another account's recovery");
});
