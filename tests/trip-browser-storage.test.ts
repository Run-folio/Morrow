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
  resolveTripRecoveryInStorage,
  saveTripRecoveryToStorage,
  saveTripRecoveryToEasyT,
  shouldAllowNewTripNavigation,
  tripCacheStorageKey,
  tripRecoveryStorageKey,
  tripForRecoveryScope,
  tripStorageEventMatches,
  type EasyTBrowserStorage,
} from "../lib/easyt/storage.ts";
import { tripConflictResolutionActions, tripEditorSyncAction } from "../lib/easyt/trip-continuity.ts";
import { canPromoteTripForOwner } from "../lib/easyt/trip-promotion.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

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

  // This is the builder's delayed 450 ms autosave firing while the same
  // promotion/update request is still in flight.
  const autosave = saveTripRecoveryToStorage(storage, planned, {
    ownerId: "owner-a",
    writeId: "autosave-write",
    replace: buildWrite.handle,
  });

  assert.equal(autosave.stored, true);
  assert.equal(autosave.handle.ownerId, buildWrite.handle.ownerId);
  assert.equal(autosave.handle.tripId, buildWrite.handle.tripId);
  assert.equal(autosave.handle.writeId, buildWrite.handle.writeId);
  assert.equal(loadTripRecoveryFromStorage(storage, planned.id, "owner-a")?.writeId, "build-write");
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

test("a quota-blocked current pointer cannot evict the canonical cache that makes recovery resolution safe", () => {
  const storage = new MemoryBrowserStorage();
  const trip = browserTrip({ id: "trip-pointer-quota" });
  const recovery = saveTripRecoveryToStorage(storage, trip, { writeId: "pointer-recovery" });
  assert.equal(recovery.stored, true);
  storage.quotaOnSet = (key) => key === currentTripStorageKey("owner-a");

  assert.equal(cacheCanonicalTripToStorage(storage, trip), true);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), trip.id);
  assert.equal(loadCachedTripFromStorage(storage, trip.id, "owner-a")?.id, trip.id);
  assert.equal(resolveTripRecoveryInStorage(storage, recovery.handle), true);
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

test("service worker reopens the query-based planner shell from cache while offline", async () => {
  const source = readFileSync(new URL("../public/easyt-sw.js", import.meta.url), "utf8");
  const listeners = new Map<string, (event: unknown) => void>();
  const plannerShell = '<!doctype html><div>offline planner shell</div><link rel="stylesheet" href="/_next/static/css/planner.css"><script src="/_next/static/chunks/planner.js"></script>';
  const cachedResponses = new Map([
    ["/journey/home", '<!doctype html><script src="/_next/static/chunks/home.js"></script>'],
    ["/journey/plan", plannerShell],
  ]);
  const addedAssets: string[] = [];
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
    put: async () => undefined,
  };
  const serviceWorkerGlobal = {
    location: { origin: "https://morrovia.test" },
    clients: { claim: () => undefined },
    skipWaiting: () => undefined,
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
  };
  runInNewContext(source, {
    self: serviceWorkerGlobal,
    caches: {
      open: async () => cache,
      keys: async () => ["easyt-public-shell-v2"],
      delete: async () => true,
    },
    fetch: async () => {
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
  assert.deepEqual(addedAssets.sort(), [
    "/_next/static/chunks/home.js",
    "/_next/static/chunks/planner.js",
    "/_next/static/css/planner.css",
  ]);

  let responsePromise: Promise<Response> | null = null;
  const handler = listeners.get("fetch");
  assert.ok(handler);
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
});
