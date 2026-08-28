import assert from "node:assert/strict";
import test from "node:test";

import { createTripMutationPersistenceQueue } from "../lib/easyt/trip-mutation-persistence.ts";
import { EasyTTripSaveConflictError } from "../lib/easyt/trip-continuity.ts";
import { saveTripRecoveryToEasyT, type TripRecoveryHandle } from "../lib/easyt/storage.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

function mapTrip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-map-mutations",
    ownerId: "owner-a",
    title: "Map trip",
    status: "planned",
    startDate: "2026-08-27",
    endDate: "2026-08-30",
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
    createdAt: "2026-08-27T08:00:00.000Z",
    updatedAt: "revision-1",
    ...overrides,
  };
}

function handle(writeId: string): TripRecoveryHandle {
  return { ownerId: "owner-a", tripId: "trip-map-mutations", writeId };
}

test("sequential Map mutations use the preceding account revision without losing authored state", async () => {
  const first = mapTrip({
    brief: { ...mapTrip().brief, customActivities: { 1: ["First restaurant"] } },
  });
  const second = mapTrip({
    brief: { ...mapTrip().brief, customActivities: { 1: ["First restaurant", "Second restaurant"] } },
  });
  const submitted: EasyTTrip[] = [];
  let releaseFirst: ((trip: EasyTTrip) => void) | undefined;
  const firstResponse = new Promise<EasyTTrip>((resolve) => { releaseFirst = resolve; });
  const queue = createTripMutationPersistenceQueue(async (trip) => {
    submitted.push(structuredClone(trip));
    if (submitted.length === 1) return firstResponse;
    return { ...trip, updatedAt: "revision-3" };
  });
  queue.reset(mapTrip());

  const firstSave = queue.enqueue(first, handle("write-1"));
  const secondSave = queue.enqueue(second, handle("write-2"));
  await Promise.resolve();
  assert.equal(submitted.length, 1, "the second account write must wait for the first CAS result");
  assert.equal(submitted[0]?.updatedAt, "revision-1");

  releaseFirst?.({ ...first, updatedAt: "revision-2" });
  await firstSave;
  const saved = await secondSave;

  assert.equal(submitted.length, 2);
  assert.equal(submitted[1]?.updatedAt, "revision-2");
  assert.deepEqual(submitted[1]?.brief.customActivities?.[1], ["First restaurant", "Second restaurant"]);
  assert.equal(saved.updatedAt, "revision-3");
});

test("a stale tab still receives the repository conflict instead of borrowing another tab's revision", async () => {
  const base = mapTrip();
  let canonical = base;
  let revision = 1;
  const request: typeof fetch = async (_input, init) => {
    const submitted = JSON.parse(String(init?.body)) as EasyTTrip;
    if (submitted.updatedAt !== canonical.updatedAt) {
      return new Response(JSON.stringify({
        error: "This trip changed on another device.",
        category: "conflict",
        trip: canonical,
        conflictReason: "cloud-changed",
      }), { status: 409, headers: { "content-type": "application/json" } });
    }
    revision += 1;
    canonical = { ...submitted, updatedAt: `revision-${revision}` };
    return new Response(JSON.stringify({ trip: canonical }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const tabA = createTripMutationPersistenceQueue((trip, recovery) => saveTripRecoveryToEasyT(trip, recovery, request));
  const tabB = createTripMutationPersistenceQueue((trip, recovery) => saveTripRecoveryToEasyT(trip, recovery, request));
  tabA.reset(base);
  tabB.reset(base);

  const savedByA = await tabA.enqueue({ ...base, title: "Tab A edit" }, handle("tab-a"));
  assert.equal(savedByA.updatedAt, "revision-2");
  await assert.rejects(
    () => tabB.enqueue({ ...base, title: "Incompatible Tab B edit" }, handle("tab-b")),
    (error: unknown) => error instanceof EasyTTripSaveConflictError
      && error.canonicalTrip.title === "Tab A edit"
      && error.reason === "cloud-changed",
  );
  assert.equal(canonical.title, "Tab A edit");
});
