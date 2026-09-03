import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EasyTTripAuthError,
  requestTripUpdate,
  tripSyncAuthError,
  tripSyncRecoveryPath,
  tripSyncSignInPath,
} from "../lib/easyt/trip-continuity.ts";
import { requestedTripMatch } from "../lib/easyt/trip-id-resolution.ts";
import { requestTripPromotion } from "../lib/easyt/trip-promotion.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function recoveryTrip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-30303030-3030-4030-8030-303030303030",
    ownerId: "owner-a",
    title: "Recovery trip",
    status: "draft",
    startDate: "2026-12-01",
    endDate: "2026-12-08",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Keep the local edit",
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

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("session expiry returns a typed interruption without changing the local edit", async () => {
  const local = recoveryTrip({ title: "Unsynced local edit" });
  const before = structuredClone(local);
  const request: typeof fetch = async () => jsonResponse({ error: "Unauthorized" }, 401);

  const response = await requestTripUpdate(local, request);
  const payload = await response.json() as { error?: string };
  const error = tripSyncAuthError(response.status, payload.error);
  assert.ok(error instanceof EasyTTripAuthError);
  assert.deepEqual(local, before);
  assert.equal(requestedTripMatch(local.id, local, "owner-a"), local);
});

test("failed network save can retry to one canonical cloud document with the same ID", async () => {
  const local = recoveryTrip({ title: "Edited while connection was down" });
  const canonical = { ...local, updatedAt: "2026-08-23T12:00:00.000Z" };
  let attempts = 0;
  const request: typeof fetch = async (_input, init) => {
    attempts += 1;
    assert.equal(JSON.parse(String(init?.body)).id, local.id);
    if (attempts === 1) throw new TypeError("network unavailable");
    return jsonResponse({ trip: canonical }, 200);
  };

  await assert.rejects(() => requestTripUpdate(local, request), /network unavailable/);
  assert.equal(local.title, "Edited while connection was down");
  const response = await requestTripUpdate(local, request);
  const payload = await response.json() as { trip: EasyTTrip };
  const saved = payload.trip;
  assert.equal(saved.id, local.id);
  assert.equal(saved.updatedAt, canonical.updatedAt);
  assert.equal(attempts, 2);
});

test("local-only recovery and repeated promotion retry never create another trip ID", async () => {
  const local = recoveryTrip({ ownerId: null });
  const canonical = { ...local, ownerId: "owner-a" };
  const insertedIds = new Set<string>();
  let attempts = 0;
  const request: typeof fetch = async (_input, init) => {
    attempts += 1;
    const body = JSON.parse(String(init?.body)) as EasyTTrip;
    assert.equal(body.id, local.id);
    if (attempts === 1) throw new TypeError("network unavailable");
    insertedIds.add(body.id);
    return jsonResponse({
      trip: canonical,
      outcome: attempts === 2 ? "promoted" : "already-canonical",
    }, attempts === 2 ? 201 : 200);
  };

  await assert.rejects(() => requestTripPromotion(local, request), /network unavailable/);
  const promoted = await requestTripPromotion(local, request);
  assert.equal(((await promoted.json()) as { trip: EasyTTrip }).trip.id, local.id);
  const repeated = await requestTripPromotion(local, request);
  assert.equal(((await repeated.json()) as { trip: EasyTTrip }).trip.id, local.id);
  assert.deepEqual([...insertedIds], [local.id]);
});

test("refresh and account transitions recover only for the exact owner", () => {
  const local = recoveryTrip();
  assert.equal(requestedTripMatch(local.id, local, "owner-a"), local);
  assert.equal(requestedTripMatch(local.id, local), null);
  assert.equal(requestedTripMatch(local.id, local, "owner-b"), null);

  const unclaimed = recoveryTrip({ ownerId: null });
  assert.equal(requestedTripMatch(unclaimed.id, unclaimed, "owner-a"), unclaimed);
});

test("sign-in recovery returns to the exact planner document and requests one retry", () => {
  const id = "trip-recovery with spaces";
  const target = tripSyncRecoveryPath(id);
  assert.equal(target, "/journey/plan?trip=trip-recovery%20with%20spaces&save=1&recover=1");
  assert.equal(tripSyncSignInPath(id), `/journey/login?next=${encodeURIComponent(target)}`);
});

test("the trip workspace waits for authenticated saved intent, then uses the recovery-aware persistence path", () => {
  const resolver = readFileSync(new URL("../components/easyt/trip-shell-resolver.tsx", import.meta.url), "utf8");
  assert.match(
    resolver,
    /if \(ownerId && searchParams\.get\("saved"\) === "1"\) claimGuestTripRecoveryForOwner\(tripId, ownerId\);[\s\S]*loadTripRecovery\(tripId, ownerId \?\? null\)/,
    "guest recovery must remain untouched until both the saved intent and authenticated owner are present",
  );
  assert.match(resolver, /saveTripRecoveryToEasyT\(localTrip, recovery\)/);
  assert.doesNotMatch(resolver, /promoteTripToEasyT\(localTrip\)/);
  assert.doesNotMatch(resolver, /setTimeout\(/, "auth readiness must be state-driven, not delay-driven");
});
