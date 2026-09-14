import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyTripRecovery,
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
    ownerId: "owner-a",
    tripId: recoveryTrip.id,
    trip: recoveryTrip,
    state,
    writeId: "write-a",
    savedAt: "2026-09-14T08:00:00.000Z",
  };
}

const currentWrite: TripRecoveryHandle = { ownerId: "owner-a", tripId: "trip-recovery-classification", writeId: "write-a" };

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
  assert.doesNotMatch(persistence, /if \(divergentRecovery\) \{[\s\S]{0,160}setSaveState\("error"\)/);
  assert.match(dashboard, /recoveryIssues\[trip\.id\]/);
  assert.match(dashboard, /tripRecoveryIsAwaitingCanonicalSave\(recovery\)/);
  assert.match(dashboard, /listTripRecoveries\(ownerId\)/);
  assert.match(dashboard, /has device changes to review/);
  assert.doesNotMatch(dashboard, /Cloud copy kept safe/);
});
