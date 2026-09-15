import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyTripRecovery,
  loadTripRecoveryFromStorage,
  saveTripRecoveryToStorage,
  type EasyTBrowserStorage,
  type TripRecoveryHandle,
  type TripRecoveryRecord,
} from "../lib/easyt/storage.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function trip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-recovery-classification",
    ownerId: "owner-a",
    title: "Cloud title",
    status: "planned",
    startDate: "2026-09-14",
    endDate: "2026-09-16",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops: [],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "revision-a",
    ...overrides,
  };
}

function recovery(recoveryTrip: EasyTTrip, state: TripRecoveryRecord["state"] = "pending"): TripRecoveryRecord {
  return {
    version: 2,
    ownerId: recoveryTrip.ownerId,
    tripId: recoveryTrip.id,
    trip: recoveryTrip,
    state,
    writeId: "write-a",
    savedAt: "2026-09-14T08:00:00.000Z",
  };
}

const currentWrite: TripRecoveryHandle = { ownerId: "owner-a", tripId: "trip-recovery-classification", writeId: "write-a" };

class MemoryStorage implements EasyTBrowserStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

test("clean canonical trip has no recovery state", () => {
  assert.equal(classifyTripRecovery({ recovery: null, canonicalTrip: trip() }), "clean");
});

test("only the mounted owner's exact pending handle is a current save", () => {
  assert.equal(classifyTripRecovery({ recovery: recovery(trip()), canonicalTrip: trip(), currentWrite }), "pending-current-save");
});

test("the exact mounted failed write is a current save failure", () => {
  assert.equal(classifyTripRecovery({ recovery: recovery(trip({ title: "Failed edit" }), "network"), canonicalTrip: trip(), currentWrite }), "current-save-failed");
});

test("the same failed record becomes historical after reload", () => {
  assert.equal(classifyTripRecovery({ recovery: recovery(trip({ title: "Failed edit" }), "network"), canonicalTrip: trip() }), "genuine-divergence");
});

test("canonical-equivalent recovery is safe to reconcile", () => {
  assert.equal(classifyTripRecovery({ recovery: recovery(trip({ updatedAt: "device-time" })), canonicalTrip: trip({ updatedAt: "cloud-time" }) }), "equivalent");
});

test("the exact ownerless recovery is the active local document after reload", () => {
  const guest = trip({ ownerId: null, title: "Guest trip" });
  assert.equal(classifyTripRecovery({ recovery: recovery(guest), canonicalTrip: guest }), "active-local-document");
  assert.equal(classifyTripRecovery({
    recovery: recovery(guest),
    canonicalTrip: { ...guest, updatedAt: "render-only-timestamp" },
  }), "active-local-document");
});

test("a different ownerless recovery remains protected as genuine divergence", () => {
  const active = trip({ ownerId: null, title: "Active guest trip" });
  const separate = trip({ ownerId: null, title: "Separate guest edit" });
  assert.equal(classifyTripRecovery({ recovery: recovery(separate), canonicalTrip: active }), "genuine-divergence");
});

test("the active ownerless recovery handle permits the next exactly-once local edit", () => {
  const storage = new MemoryStorage();
  const guest = trip({ ownerId: null, title: "Guest trip" });
  const first = saveTripRecoveryToStorage(storage, guest, { ownerId: null, writeId: "guest-a" });
  const loaded = loadTripRecoveryFromStorage(storage, guest.id, null);
  assert.ok(loaded);
  assert.equal(classifyTripRecovery({ recovery: loaded, canonicalTrip: guest }), "active-local-document");

  const edited = { ...guest, title: "Guest trip edited", updatedAt: "revision-b" };
  const second = saveTripRecoveryToStorage(storage, edited, {
    ownerId: null,
    replace: first.handle,
    writeId: "guest-b",
  });

  assert.equal(second.stored, true);
  assert.equal(second.blockedByExistingRecovery, false);
  assert.equal(loadTripRecoveryFromStorage(storage, guest.id, null)?.trip.title, "Guest trip edited");
});

test("a prior canonical snapshot is historical-superseded only through semantic comparison", () => {
  const previous = trip({ title: "Previous cloud title", updatedAt: "revision-a" });
  const current = trip({ title: "Current cloud title", updatedAt: "revision-b" });
  assert.equal(classifyTripRecovery({ recovery: recovery(previous), canonicalTrip: current, previousCanonicalTrip: previous }), "historical-superseded");
});

test("a newer timestamp alone never discards unique traveller edits", () => {
  const device = trip({ title: "Unique device title", updatedAt: "revision-z" });
  assert.equal(classifyTripRecovery({ recovery: recovery(device), canonicalTrip: trip({ updatedAt: "revision-a" }) }), "genuine-divergence");
});

test("save header and dashboard source keep historical recovery separate and trip-scoped", () => {
  const persistence = readFileSync(new URL("../components/easyt/use-trip-mutation-persistence.ts", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/journey/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
  assert.match(persistence, /setHistoricalRecovery\(divergentRecovery\)/);
  assert.match(persistence, /activeLocalRecovery \? recovery : null/);
  assert.match(persistence, /setSaveState\(activeLocalRecovery \? "device" : "idle"\)/);
  assert.match(persistence, /if \(conflictRef\.current\) \{[\s\S]{0,180}setFailure\("recovery"\)[\s\S]{0,180}setHistoricalRecovery\(true\)[\s\S]{0,180}setSaveState\("error"\)/);
  assert.doesNotMatch(persistence, /if \(divergentRecovery\) \{[\s\S]{0,160}setSaveState\("error"\)/);
  assert.match(dashboard, /recoveryIssues\[trip\.id\]/);
  assert.match(dashboard, /tripRecoveryIsAwaitingCanonicalSave\(recovery\)/);
  assert.match(dashboard, /listTripRecoveries\(ownerId\)/);
  assert.match(dashboard, /classifyTripRecovery\(\{[\s\S]{0,180}previousCanonicalTrip: loadCachedTrip\(recovery\.tripId, ownerId\)/);
  assert.match(dashboard, /classification === "equivalent"\) resolveCanonicalEquivalentTripRecovery/);
  assert.match(dashboard, /classification === "historical-superseded"\) cacheCanonicalTrip\(canonicalTrip\)/);
  assert.match(dashboard, /has device changes to review/);
  assert.doesNotMatch(dashboard, /Cloud copy kept safe/);
});

test("dashboard groups detached recoveries behind one calm disclosure while keeping each review path", () => {
  const dashboard = readFileSync(new URL("../app/journey/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
  const stories = readFileSync(new URL("../app/journey/dashboard/dashboard-client.stories.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /\$\{orphanRecoveryIssues\.length\} protected device copies are available/);
  assert.match(dashboard, /setShowDetachedRecoveries\(\(shown\) => !shown\)/);
  assert.match(dashboard, /orphanRecoveryIssues\.map\(\(issue\) => <article key=\{issue\.tripId\}>/);
  assert.match(dashboard, /recovery\.conflictReason === "cloud-deleted"/);
  assert.match(stories, /export const DashboardDetachedRecoveriesGrouped/);
});
