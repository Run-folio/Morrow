import assert from "node:assert/strict";
import test from "node:test";

import { conflictHasCloudCopy } from "../lib/easyt/trip-continuity.ts";
import {
  EasyTTripSaveConflictError,
  cacheCanonicalTripToStorage,
  currentTripStorageKey,
  loadCachedTripFromStorage,
  loadCurrentTripIdFromStorage,
  loadCurrentTripRecoveryFromStorage,
  loadTripRecoveryFromStorage,
  promoteTripToEasyT,
  reconcileTripCloudMutationInStorage,
  saveTripToEasyT,
  saveTripRecoveryToEasyT,
  saveTripRecoveryToStorage,
  type EasyTBrowserStorage,
} from "../lib/easyt/storage.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

class MemoryStorage implements EasyTBrowserStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function trip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-dashboard-reconcile",
    ownerId: "owner-a",
    title: "Revision-aware dashboard trip",
    status: "draft",
    startDate: "2026-11-01",
    endDate: "2026-11-08",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops: [], legs: [], planItems: [], recommendations: [],
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T11:00:00.000Z",
    ...overrides,
  };
}

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("only an ownerless draft uses insert-only promotion", async () => {
  const draft = trip({ ownerId: null });
  let endpoint = "";
  const result = await promoteTripToEasyT(draft, async (input) => {
    endpoint = String(input);
    return response({ trip: { ...draft, ownerId: "owner-a" }, outcome: "promoted" }, 201);
  });
  assert.match(endpoint, /\/promote$/);
  assert.equal(result.outcome, "promoted");
  await assert.rejects(() => promoteTripToEasyT(trip(), async () => response({})), /ownerless draft/i);
  await assert.rejects(() => promoteTripToEasyT(trip({ ownerId: null, status: "planned" }), async () => response({})), /ownerless draft/i);
});

test("a clean owned cache is a no-op because it is not a pending edit", () => {
  const storage = new MemoryStorage();
  assert.equal(cacheCanonicalTripToStorage(storage, trip()), true);
  assert.equal(loadCurrentTripRecoveryFromStorage(storage, "owner-a"), null);
});

test("an archive action for a never-opened row does not create browser current state", () => {
  const storage = new MemoryStorage();
  const archived = trip({ status: "archived", updatedAt: "2026-08-20T12:00:00.000Z" });
  const result = reconcileTripCloudMutationInStorage(storage, "owner-a", archived.id, "archive", archived);
  assert.equal(result.cacheUpdated, false);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), null);
});

test("an owned pending edit with a matching revision uses the CAS save path", async () => {
  const storage = new MemoryStorage();
  const pending = trip({ title: "Pending edit" });
  const recovery = saveTripRecoveryToStorage(storage, pending, { writeId: "owned-save" });
  let endpoint = "";
  let method = "";
  const saved = await saveTripRecoveryToEasyT(pending, recovery.handle, async (input, init) => {
    endpoint = String(input);
    method = String(init?.method);
    return response({ trip: { ...pending, updatedAt: "2026-08-20T12:00:00.000Z" } });
  });
  assert.equal(endpoint, `/api/easyt/trips/${encodeURIComponent(pending.id)}`);
  assert.equal(method, "PUT");
  assert.equal(saved.updatedAt, "2026-08-20T12:00:00.000Z");
});

test("an owned 404 never falls through to insert-only promotion", async () => {
  const owned = trip();
  const endpoints: string[] = [];
  await assert.rejects(() => saveTripToEasyT(owned, async (input) => {
    endpoints.push(String(input));
    return response({ error: "Trip not found." }, 404);
  }), /not found/i);
  assert.deepEqual(endpoints, [`/api/easyt/trips/${encodeURIComponent(owned.id)}`]);
});

test("a stale owned edit preserves the cloud conflict reason", async () => {
  const pending = trip({ title: "Stale edit" });
  const cloud = trip({ title: "Cloud edit", updatedAt: "2026-08-20T12:00:00.000Z" });
  const storage = new MemoryStorage();
  const recovery = saveTripRecoveryToStorage(storage, pending, { writeId: "stale-save" });
  await assert.rejects(
    () => saveTripRecoveryToEasyT(pending, recovery.handle, async () => response({ trip: cloud, conflictReason: "cloud-changed", error: "changed" }, 409)),
    (error: unknown) => error instanceof EasyTTripSaveConflictError && error.reason === "cloud-changed",
  );
});

test("open then archive, restore and delete updates or removes clean cache without false recovery", () => {
  const storage = new MemoryStorage();
  const opened = trip();
  cacheCanonicalTripToStorage(storage, opened);
  const archived = trip({ status: "archived", updatedAt: "2026-08-20T12:00:00.000Z" });
  reconcileTripCloudMutationInStorage(storage, "owner-a", opened.id, "archive", archived);
  assert.deepEqual(loadCachedTripFromStorage(storage, opened.id, "owner-a"), archived);
  assert.equal(loadCurrentTripRecoveryFromStorage(storage, "owner-a"), null);
  const restored = trip({ status: "draft", updatedAt: "2026-08-20T13:00:00.000Z" });
  reconcileTripCloudMutationInStorage(storage, "owner-a", opened.id, "restore", restored);
  assert.deepEqual(loadCachedTripFromStorage(storage, opened.id, "owner-a"), restored);
  assert.equal(loadCurrentTripRecoveryFromStorage(storage, "owner-a"), null);
  reconcileTripCloudMutationInStorage(storage, "owner-a", opened.id, "delete");
  assert.equal(loadCachedTripFromStorage(storage, opened.id, "owner-a"), null);
  assert.equal(loadCurrentTripIdFromStorage(storage, "owner-a"), null);
  assert.equal(storage.getItem(currentTripStorageKey("owner-a")), null);
});

test("delete quarantines pending edits as deleted-specific recovery with no cloud action", () => {
  const storage = new MemoryStorage();
  const pending = trip({ title: "Keep this device edit" });
  cacheCanonicalTripToStorage(storage, trip());
  saveTripRecoveryToStorage(storage, pending, { writeId: "delete-recovery" });
  const result = reconcileTripCloudMutationInStorage(storage, "owner-a", pending.id, "delete");
  const recovery = loadTripRecoveryFromStorage(storage, pending.id, "owner-a");
  assert.equal(result.recoveryQuarantined, true);
  assert.equal(loadCachedTripFromStorage(storage, pending.id, "owner-a"), null);
  assert.equal(recovery?.state, "conflict");
  assert.equal(recovery?.conflictReason, "cloud-deleted");
  assert.equal(recovery?.trip.title, "Keep this device edit");
  assert.equal(conflictHasCloudCopy(recovery?.conflictReason), false);
});
