import assert from "node:assert/strict";
import test from "node:test";

import {
  decideExistingTripUpdate,
  EasyTTripSaveConflictError,
  nextTripUpdatedAt,
  requestTripUpdate,
} from "../lib/easyt/trip-continuity.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { requestedTripMatch } from "../lib/easyt/trip-id-resolution.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function cloudTrip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-20202020-2020-4020-8020-202020202020",
    ownerId: "owner-a",
    title: "Tokyo and Kyoto",
    status: "draft",
    startDate: "2026-11-01",
    endDate: "2026-11-08",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Food and neighbourhoods",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
    },
    stops: [],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T11:00:00.000Z",
    ...overrides,
  };
}

test("two browsers use one revision and the second stale save cannot replace the first", () => {
  const original = cloudTrip();
  const browserA = { ...original, title: "Tokyo, Kyoto and Osaka" };
  const browserB = { ...original, title: "Tokyo and Hokkaido" };

  assert.deepEqual(decideExistingTripUpdate("owner-a", browserA, original), { outcome: "save" });
  const savedA = canonicalTripForOwner(
    "owner-a",
    browserA,
    nextTripUpdatedAt(original.updatedAt, new Date("2026-08-20T12:00:00.000Z")),
  );
  assert.equal(savedA.id, original.id);
  assert.equal(savedA.title, browserA.title);
  assert.deepEqual(
    decideExistingTripUpdate("owner-a", browserB, savedA),
    { outcome: "conflict", conflictReason: "cloud-changed" },
  );
  assert.equal(savedA.title, "Tokyo, Kyoto and Osaka");
});

test("edit, save, refresh and reopen preserve the canonical ID and returned revision", () => {
  const opened = cloudTrip();
  const edited = { ...opened, brief: { ...opened.brief, mustDo: "Add a tea ceremony" } };
  const reopened = canonicalTripForOwner(
    "owner-a",
    edited,
    nextTripUpdatedAt(opened.updatedAt, new Date("2026-08-20T12:30:00.000Z")),
  );

  assert.equal(reopened.id, opened.id);
  assert.notEqual(reopened.updatedAt, opened.updatedAt);
  assert.equal(requestedTripMatch(reopened.id, reopened, "owner-a"), reopened);
  assert.equal(requestedTripMatch(reopened.id, null, "owner-a"), null);
});

test("owner and deletion checks fail closed without exposing or recreating a trip", () => {
  const trip = cloudTrip();
  assert.deepEqual(
    decideExistingTripUpdate("owner-b", { ...trip, ownerId: "owner-b" }, trip),
    { outcome: "forbidden" },
  );
  assert.deepEqual(
    decideExistingTripUpdate("owner-a", trip, trip, true),
    { outcome: "conflict", conflictReason: "cloud-deleted" },
  );
  assert.equal(requestedTripMatch(trip.id, trip), null);
  assert.equal(requestedTripMatch(trip.id, trip, "owner-b"), null);
});

test("updatedAt always advances and remains usable as an opaque compare-and-swap token", () => {
  assert.equal(
    nextTripUpdatedAt("2027-01-01T00:00:00.000Z", new Date("2026-01-01T00:00:00.000Z")),
    "2027-01-01T00:00:00.001Z",
  );
});

test("cloud update targets the exact deep-link document and exposes network failure for retry", async () => {
  const trip = cloudTrip();
  let requestCount = 0;
  const request: typeof fetch = async (input, init) => {
    requestCount += 1;
    assert.equal(input, `/api/easyt/trips/${encodeURIComponent(trip.id)}`);
    assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body)), trip);
    throw new TypeError("network unavailable");
  };

  await assert.rejects(() => requestTripUpdate(trip, request), /network unavailable/);
  assert.equal(requestCount, 1);
});

test("save conflicts carry only the same owner's canonical recovery document", () => {
  const canonical = cloudTrip({ title: "Saved on the other device" });
  const error = new EasyTTripSaveConflictError(
    "This trip changed on another device.",
    canonical,
    "cloud-changed",
  );
  assert.equal(error.canonicalTrip, canonical);
  assert.equal(error.reason, "cloud-changed");
});
