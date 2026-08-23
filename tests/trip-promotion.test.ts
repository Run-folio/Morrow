import assert from "node:assert/strict";
import test from "node:test";

import {
  canPromoteTripForOwner,
  canonicalTripForOwner,
  decideExistingTripPromotion,
  requestTripPromotion,
  tripPromotionConflictReason,
} from "../lib/easyt/trip-promotion.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function localTrip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-10101010-1010-4010-8010-101010101010",
    ownerId: null,
    title: "London to Tokyo",
    status: "draft",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: { tokyo: ["Senso-ji"] },
    },
    stops: [{ id: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.76, arrivalDate: "2026-10-01", departureDate: "2026-10-05", nights: 4 }],
    legs: [{ id: "leg-1", fromStopId: "tokyo", toStopId: "tokyo", mode: "train", distanceKm: 0, durationMinutes: 0, provider: null, routeMetadata: {} }],
    planItems: [{ id: "day-1", stopId: "tokyo", dayNumber: 1, date: "2026-10-01", type: "activity", title: "Senso-ji", reason: "Requested", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: 35.71, longitude: 139.8 }],
    recommendations: [],
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T11:00:00.000Z",
    ...overrides,
  };
}

test("local-only promotion claims the exact canonical trip ID and preserves edits", () => {
  const local = localTrip();
  const canonical = canonicalTripForOwner("owner-a", local);

  assert.equal(canonical.id, local.id);
  assert.equal(canonical.ownerId, "owner-a");
  assert.equal(canonical.updatedAt, local.updatedAt);
  assert.deepEqual(canonical.brief.selectedPlaces, { [`${local.id}-stop-tokyo`]: ["Senso-ji"] });
  assert.equal(canonical.stops[0].id, `${local.id}-stop-tokyo`);
  assert.equal(canonical.planItems[0].stopId, canonical.stops[0].id);
  assert.equal(canonical.legs[0].fromStopId, canonical.stops[0].id);
});

test("repeated promotion canonicalization is idempotent and creates no new ID", () => {
  const first = canonicalTripForOwner("owner-a", localTrip());
  const retry = canonicalTripForOwner("owner-a", first);
  assert.deepEqual(retry, first);
  assert.equal(retry.id, "trip-10101010-1010-4010-8010-101010101010");
  assert.deepEqual(
    decideExistingTripPromotion(first, retry, { exactMatch: true }),
    { outcome: "already-canonical" },
  );
});

test("promotion accepts an unclaimed or same-owner local trip and rejects another owner", () => {
  assert.equal(canPromoteTripForOwner(localTrip(), "owner-a"), true);
  assert.equal(canPromoteTripForOwner(localTrip({ ownerId: "owner-a" }), "owner-a"), true);
  assert.equal(canPromoteTripForOwner(localTrip({ ownerId: "owner-b" }), "owner-a"), false);
});

test("stale local state is classified as a newer-cloud conflict", () => {
  const local = localTrip({ updatedAt: "2026-08-20T11:00:00.000Z" });
  const cloud = localTrip({ ownerId: "owner-a", title: "Newer cloud edit", updatedAt: "2026-08-21T11:00:00.000Z" });
  assert.equal(tripPromotionConflictReason(local, cloud), "cloud-newer");
  assert.deepEqual(
    decideExistingTripPromotion(local, cloud, { exactMatch: false }),
    { outcome: "conflict", conflictReason: "cloud-newer" },
  );
  assert.equal(tripPromotionConflictReason(cloud, local), "cloud-different");
  assert.equal(tripPromotionConflictReason(local, cloud, true), "cloud-deleted");
});

test("promotion sends one exact-ID insert request and propagates network failure for recovery", async () => {
  const local = localTrip();
  let requestCount = 0;
  const request: typeof fetch = async (input, init) => {
    requestCount += 1;
    assert.equal(input, `/api/easyt/trips/${encodeURIComponent(local.id)}/promote`);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), local);
    throw new TypeError("network unavailable");
  };

  await assert.rejects(() => requestTripPromotion(local, request), /network unavailable/);
  assert.equal(requestCount, 1);
});
