import assert from "node:assert/strict";
import test from "node:test";

import { createTripMutationPersistenceQueue, mergeTripMutationDocuments } from "../lib/easyt/trip-mutation-persistence.ts";
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { prepareAcceptedBuilderEdit } from '../lib/easyt/trip-builder-edit.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { prepareBuilderNecessaryProjection } from '../lib/easyt/trip-builder-reconciliation.ts';
import { reconcileBuilderDependencies } from '../lib/easyt/trip-builder-reconciliation.ts';
import { a17TripFixture } from './fixtures/batch14-a17-trip.ts';
import { prepareBuilderHandlerEdit } from '../lib/easyt/trip-builder-handler-contract.ts';
import type { CanonicalEasyTTrip } from '../lib/easyt/trip.ts';
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

function withTravellers(before: CanonicalEasyTTrip, travellers: number) {
  const edited = prepareAcceptedBuilderEdit(before, { kind: 'travellers', travellers }, builderDocumentFingerprint(before));
  assert.ok(edited.ok);
  const projected = prepareBuilderNecessaryProjection(before, edited.trip, edited.scope);
  assert.ok(projected.ok);
  return projected.trip;
}

// JSONB readback can reorder object keys without changing the acknowledged values.
function jsonbReadback<T>(value: T): T {
  if (Array.isArray(value)) return value.map(jsonbReadback) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, jsonbReadback(item)])) as T;
  return value;
}

test('A17 completed necessary certificate saves after a semantically equivalent JSONB ACK',async()=>{
 const base=a17TripFixture(),removal=prepareBuilderHandlerEdit(base,{kind:'remove-destination',intentId:'intent:hue'},builderDocumentFingerprint(base));assert.ok(removal.ok);
 const a=removal.trip,b=requireReadableTripDocument(reconcileBuilderDependencies(a,a.brief.cascadeStatus!.routeReconciliation!.residual).trip);
 assert.deepEqual(b.brief.intent.route.orderedStopIds,a.brief.intent.route.orderedStopIds);assert.notEqual(b.brief.intent.route.projectionInputKey,a.brief.intent.route.projectionInputKey);
 let release!:(trip:EasyTTrip)=>void;const held=new Promise<EasyTTrip>(resolve=>{release=resolve}),submitted:EasyTTrip[]=[];
 const queue=createTripMutationPersistenceQueue(async trip=>{submitted.push(trip);return submitted.length===1?held:{...trip,updatedAt:'completed-revision'}});queue.reset(base);
 const first=queue.enqueue(a,{ownerId:a.ownerId,tripId:a.id,writeId:'a17-A'});await Promise.resolve();
 const second=queue.enqueue(b,{ownerId:b.ownerId,tripId:b.id,writeId:'a17-B'},a);release(jsonbReadback({...a,updatedAt:'ack-revision'}));await first;const saved=await second;
 assert.equal(submitted.length,2);assert.equal(submitted[1].updatedAt,'ack-revision');assert.equal(saved.brief.intent!.route!.projectionInputKey,b.brief.intent.route.projectionInputKey);
 assert.deepEqual(saved.stops.map(stop=>stop.nights),[3,4,3]);
 const concurrent=structuredClone(a);concurrent.brief.intent.route.origin={name:'Paris',country:'France',canonicalPlaceId:'paris',coordinates:[2.35,48.85]};
 assert.throws(()=>mergeTripMutationDocuments(a,b,concurrent),EasyTTripSaveConflictError,'actual origin changes still conflict atomically');
 const changedOrder=structuredClone(a);changedOrder.stops.reverse().forEach((stop,index)=>stop.order=index);changedOrder.brief.intent.route.orderedStopIds=changedOrder.stops.map(stop=>stop.id);
 assert.throws(()=>mergeTripMutationDocuments(a,b,changedOrder),EasyTTripSaveConflictError,'array order is authoritative');
});

test('A08 held equivalent ACK permits the inverse to durably save current dependent work once', async () => {
  const base = requireReadableTripDocument(canonicalRouteFixture());
  const a = withTravellers(base, 3);
  const b = withTravellers(a, 2);
  let release!: (trip: EasyTTrip) => void;
  const held = new Promise<EasyTTrip>(resolve => { release = resolve; });
  const submitted: EasyTTrip[] = [];
  const queue = createTripMutationPersistenceQueue(async trip => {
    requireReadableTripDocument(JSON.parse(JSON.stringify(trip)));
    submitted.push(structuredClone(trip));
    return submitted.length === 1 ? held : { ...trip, updatedAt: 'revision-3' };
  });
  queue.reset(base);
  const first = queue.enqueue(a, { ...handle('a'), tripId: base.id });
  const inverse = queue.enqueue(b, { ...handle('b'), tripId: base.id }, a);
  await Promise.resolve();
  release(jsonbReadback({ ...a, updatedAt: 'revision-2' }));
  await first;
  const saved = await inverse;
  assert.equal(submitted.length, 2);
  assert.equal(saved.travellers, 2);
  assert.equal(submitted[1]!.updatedAt, 'revision-2');
  assert.deepEqual(saved.brief.cascadeStatus?.routeReconciliation, b.brief.cascadeStatus?.routeReconciliation);
});

test('dependent-work merge retains completion and terminal evidence for the current inverse basis', () => {
  const base = requireReadableTripDocument(canonicalRouteFixture());
  const a = withTravellers(base, 3);
  const b = withTravellers(a, 2);
  const units = b.brief.cascadeStatus!.routeReconciliation!.residual;
  units.shift(); // One B subject completed before A was acknowledged.
  units[0] = { ...units[0]!, phase: 'failed', reason: 'unavailable' };
  units[1] = { ...units[1]!, phase: 'conflict', reason: 'protected-date' };
  const canonical = jsonbReadback({ ...a, title: 'Independent accepted title', updatedAt: 'revision-2' });
  const merged = requireReadableTripDocument(JSON.parse(JSON.stringify(mergeTripMutationDocuments(a, b, canonical))));
  assert.equal(merged.title, canonical.title);
  assert.deepEqual(merged.brief.cascadeStatus?.routeReconciliation, b.brief.cascadeStatus?.routeReconciliation);
});

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

test("a queued edit authored from the same base cannot erase a preceding disjoint edit", async () => {
  const base = mapTrip();
  const first = mapTrip({
    brief: { ...base.brief, customActivities: { 1: ["First restaurant"] } },
  });
  const second = mapTrip({
    title: "A separately authored title",
  });
  const submitted: EasyTTrip[] = [];
  let releaseFirst: ((trip: EasyTTrip) => void) | undefined;
  const firstResponse = new Promise<EasyTTrip>((resolve) => { releaseFirst = resolve; });
  const queue = createTripMutationPersistenceQueue(async (trip) => {
    submitted.push(structuredClone(trip));
    if (submitted.length === 1) return firstResponse;
    return { ...trip, updatedAt: "revision-3" };
  });
  queue.reset(base);

  const firstSave = queue.enqueue(first, handle("write-disjoint-1"));
  const secondSave = queue.enqueue(second, handle("write-disjoint-2"));
  await Promise.resolve();
  releaseFirst?.({ ...first, updatedAt: "revision-2" });
  await firstSave;
  const saved = await secondSave;

  assert.equal(submitted[1]?.updatedAt, "revision-2");
  assert.equal(submitted[1]?.title, "A separately authored title");
  assert.deepEqual(submitted[1]?.brief.customActivities?.[1], ["First restaurant"]);
  assert.deepEqual(saved.brief.customActivities?.[1], ["First restaurant"]);
});

test("independent queued additions to the same authored array are merged without duplication", async () => {
  const base = mapTrip({ brief: { ...mapTrip().brief, customActivities: { 1: ["Market"] } } });
  const first = mapTrip({ brief: { ...base.brief, customActivities: { 1: ["Market", "Cafe"] } } });
  const second = mapTrip({ brief: { ...base.brief, customActivities: { 1: ["Market", "Museum"] } } });
  let canonical = base;
  let revision = 1;
  const queue = createTripMutationPersistenceQueue(async (trip) => {
    revision += 1;
    canonical = { ...structuredClone(trip), updatedAt: `revision-${revision}` };
    return canonical;
  });
  queue.reset(base);

  await Promise.all([
    queue.enqueue(first, handle("write-array-1")),
    queue.enqueue(second, handle("write-array-2")),
  ]);

  assert.deepEqual(canonical.brief.customActivities?.[1], ["Market", "Cafe", "Museum"]);
  assert.equal(new Set(canonical.brief.customActivities?.[1]).size, 3);
});

test("an unknown revision is never borrowed from this queue", async () => {
  const base = mapTrip();
  const submitted: EasyTTrip[] = [];
  const queue = createTripMutationPersistenceQueue(async (trip) => {
    submitted.push(structuredClone(trip));
    return { ...trip, updatedAt: "revision-server" };
  });
  queue.reset(base);

  await queue.enqueue({ ...base, updatedAt: "revision-from-another-tab", title: "Unknown base" }, handle("unknown-revision"));
  assert.equal(submitted[0]?.updatedAt, "revision-from-another-tab");
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
