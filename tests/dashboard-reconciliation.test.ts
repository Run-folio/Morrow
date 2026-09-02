import assert from "node:assert/strict";
import test from "node:test";

import { conflictHasCloudCopy, nextTripUpdatedAt } from "../lib/easyt/trip-continuity.ts";
import {
  EasyTTripSaveConflictError,
  cacheCanonicalTripWithRecoveryToStorage,
  cacheCanonicalTripToStorage,
  canUseHydratedTripScope,
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
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { tripBuildDocumentsCanonicalEquivalent } from "../lib/easyt/trip-promotion.ts";
import { EasyTTripPersistenceError } from "../lib/easyt/trip-persistence-error.ts";
import { firstTripWorkspaceHref } from "../lib/easyt/trip-workspace-links.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

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

test("the first authenticated Build trip promotes its ID before it performs the planned save", async () => {
  const built = trip({ ownerId: null, status: "planned", title: "First authenticated build" });
  const recovery = saveTripRecoveryToStorage(new MemoryStorage(), built, {
    ownerId: "owner-a",
    writeId: "first-build",
  });
  const promoted = { ...built, ownerId: "owner-a", status: "draft" as const };
  const planned = { ...promoted, status: "planned" as const, updatedAt: "2026-08-20T12:00:00.000Z" };
  const requests: Array<{ endpoint: string; method: string; body: EasyTTrip }> = [];

  const saved = await saveTripRecoveryToEasyT(built, recovery.handle, async (input, init) => {
    const body = JSON.parse(String(init?.body)) as EasyTTrip;
    requests.push({ endpoint: String(input), method: String(init?.method), body });
    if (requests.length === 1) {
      return response({ trip: promoted, outcome: "promoted" }, 201);
    }
    return response({ trip: planned });
  });

  assert.deepEqual(requests.map(({ endpoint, method }) => ({ endpoint, method })), [
    { endpoint: `/api/easyt/trips/${encodeURIComponent(built.id)}/promote`, method: "POST" },
    { endpoint: `/api/easyt/trips/${encodeURIComponent(built.id)}`, method: "PUT" },
  ]);
  assert.equal(requests[0]?.body.ownerId, null);
  assert.equal(requests[0]?.body.status, "draft");
  assert.equal(requests[1]?.body.ownerId, "owner-a");
  assert.equal(requests[1]?.body.status, "planned");
  assert.deepEqual(saved, planned);
});

test("a clean-browser Build acknowledges the normalized canonical trip before dashboard hydration", async () => {
  const storage = new MemoryStorage();
  const ownerId = "owner-a";
  const draft = trip({
    id: "trip-clean-browser-build",
    ownerId: null,
    status: "draft",
    title: "Clean browser Build",
    brief: {
      origin: "London",
      mustDo: "Visit Senso-ji",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: { tokyo: ["Senso-ji"] },
      decisionSelections: { routeOrder: "entered", transportByLeg: {} },
    },
    stops: [{
      id: "tokyo", order: 0, name: "Tokyo", country: "Japan",
      latitude: 35.68, longitude: 139.76,
      arrivalDate: "2026-11-01", departureDate: "2026-11-08", nights: 7,
    }],
    legs: [],
    planItems: [{
      id: "day-1", stopId: "tokyo", dayNumber: 1, date: "2026-11-01",
      type: "activity", title: "Senso-ji", reason: "Requested", notes: [],
      startsAt: null, endsAt: null, bookingUrl: null, latitude: 35.71, longitude: 139.8,
    }],
  });
  const initialRecovery = saveTripRecoveryToStorage(storage, draft, {
    ownerId,
    writeId: "draft-write",
  });
  const plannedLocal = { ...draft, status: "planned" as const };
  const buildRecovery = saveTripRecoveryToStorage(storage, plannedLocal, {
    ownerId,
    writeId: "build-write",
    replace: initialRecovery.handle,
  });

  const cloudTrips = new Map<string, EasyTTrip>();
  const requestSequence: Array<{
    endpoint: string;
    method: string;
    requestStatus: EasyTTrip["status"];
    requestOwnerId: string | null;
    requestRevision: string;
    recoveryWriteId: string | undefined;
  }> = [];
  const request: typeof fetch = async (input, init) => {
    const endpoint = String(input);
    const body = JSON.parse(String(init?.body)) as EasyTTrip;
    requestSequence.push({
      endpoint,
      method: String(init?.method),
      requestStatus: body.status,
      requestOwnerId: body.ownerId,
      requestRevision: body.updatedAt,
      recoveryWriteId: loadTripRecoveryFromStorage(storage, body.id, ownerId)?.writeId,
    });

    if (endpoint.endsWith("/promote")) {
      assert.equal(cloudTrips.has(body.id), false);
      const promoted = canonicalTripForOwner(ownerId, body);
      cloudTrips.set(promoted.id, promoted);
      return response({ trip: promoted, outcome: "promoted" }, 201);
    }

    const current = cloudTrips.get(body.id);
    assert.ok(current);
    assert.equal(body.updatedAt, current.updatedAt, "PUT must use the promotion response revision");
    const planned = canonicalTripForOwner(
      ownerId,
      body,
      nextTripUpdatedAt(body.updatedAt, new Date("2026-08-20T12:00:00.000Z")),
    );
    cloudTrips.set(planned.id, planned);

    // Reproduce the actual browser ordering: a save-state render reconstructs
    // the same ownerless planned document with a fresh local timestamp while
    // the canonical planned response is still in flight.
    const rerenderedPlannedLocal = {
      ...plannedLocal,
      updatedAt: "2026-08-20T11:00:00.450Z",
    };
    const autosave = saveTripRecoveryToStorage(storage, rerenderedPlannedLocal, {
      ownerId,
      writeId: "delayed-autosave",
      replace: buildRecovery.handle,
    });
    assert.equal(autosave.handle.writeId, buildRecovery.handle.writeId);
    return response({ trip: planned });
  };

  const canonical = await saveTripRecoveryToEasyT(plannedLocal, buildRecovery.handle, request);
  const recoveryBeforeAcknowledgement = loadTripRecoveryFromStorage(storage, canonical.id, ownerId);
  assert.equal(recoveryBeforeAcknowledgement?.writeId, buildRecovery.handle.writeId);
  const acknowledgement = cacheCanonicalTripWithRecoveryToStorage(storage, canonical, buildRecovery.handle);
  const dashboardRecovery = loadCurrentTripRecoveryFromStorage(storage, ownerId);

  assert.deepEqual(requestSequence.map(({ endpoint, method, requestStatus, requestOwnerId, recoveryWriteId }) => ({
    endpoint, method, requestStatus, requestOwnerId, recoveryWriteId,
  })), [
    {
      endpoint: `/api/easyt/trips/${encodeURIComponent(draft.id)}/promote`,
      method: "POST",
      requestStatus: "draft",
      requestOwnerId: null,
      recoveryWriteId: "build-write",
    },
    {
      endpoint: `/api/easyt/trips/${encodeURIComponent(draft.id)}`,
      method: "PUT",
      requestStatus: "planned",
      requestOwnerId: ownerId,
      recoveryWriteId: "build-write",
    },
  ]);
  assert.equal(requestSequence[0]?.requestRevision, draft.updatedAt);
  assert.equal(requestSequence[1]?.requestRevision, draft.updatedAt);
  assert.equal(canonical.updatedAt, "2026-08-20T12:00:00.000Z");
  assert.equal(canonical.ownerId, ownerId);
  assert.equal(canonical.status, "planned");
  assert.equal(canonical.stops[0]?.id, `${draft.id}-stop-tokyo`, "the test includes server-normalized stop identities");
  assert.equal(acknowledgement.stored, true);
  assert.equal(acknowledgement.recoveryResolved, true);
  assert.equal(loadTripRecoveryFromStorage(storage, canonical.id, ownerId), null);
  assert.equal(dashboardRecovery, null, "dashboard hydration must have no local copy to classify as a conflict");
  assert.equal(cloudTrips.size, 1);
  assert.deepEqual(cloudTrips.get(canonical.id), canonical);
  assert.equal(canUseHydratedTripScope(ownerId, ownerId), true);
  assert.equal(firstTripWorkspaceHref(canonical.id), `/journey/${encodeURIComponent(canonical.id)}?created=1`);
});

test("a failed first Build retry reuses its promoted ID and retries the planned save", async () => {
  const built = trip({ ownerId: null, status: "planned", title: "Retry first build" });
  const recovery = saveTripRecoveryToStorage(new MemoryStorage(), built, {
    ownerId: "owner-a",
    writeId: "retry-first-build",
  });
  const promoted = { ...built, ownerId: "owner-a", status: "draft" as const };
  const planned = { ...promoted, status: "planned" as const, updatedAt: "2026-08-20T12:00:00.000Z" };
  const requests: Array<{ endpoint: string; method: string }> = [];
  let attempt = 0;
  const request: typeof fetch = async (input, init) => {
    requests.push({ endpoint: String(input), method: String(init?.method) });
    if (requests.length === 1) return response({ trip: promoted, outcome: "promoted" }, 201);
    if (requests.length === 2) throw new TypeError("network unavailable");
    attempt += 1;
    if (attempt === 1) return response({ trip: promoted, outcome: "already-canonical" });
    return response({ trip: planned });
  };

  await assert.rejects(() => saveTripRecoveryToEasyT(built, recovery.handle, request), /network unavailable/i);
  const saved = await saveTripRecoveryToEasyT(built, recovery.handle, request);

  assert.deepEqual(requests, [
    { endpoint: `/api/easyt/trips/${encodeURIComponent(built.id)}/promote`, method: "POST" },
    { endpoint: `/api/easyt/trips/${encodeURIComponent(built.id)}`, method: "PUT" },
    { endpoint: `/api/easyt/trips/${encodeURIComponent(built.id)}/promote`, method: "POST" },
    { endpoint: `/api/easyt/trips/${encodeURIComponent(built.id)}`, method: "PUT" },
  ]);
  assert.equal(saved.id, built.id);
  assert.equal(saved.ownerId, "owner-a");
  assert.equal(saved.status, "planned");
});

test("a retry after the planned write committed acknowledges that exact canonical document", async () => {
  const built = trip({ ownerId: null, status: "planned", title: "Committed before response loss" });
  const recovery = saveTripRecoveryToStorage(new MemoryStorage(), built, {
    ownerId: "owner-a",
    writeId: "after-write-loss",
  });
  const promoted = canonicalTripForOwner("owner-a", { ...built, status: "draft" });
  const planned = canonicalTripForOwner("owner-a", { ...promoted, status: "planned" }, "2026-08-20T12:00:00.000Z");
  let requestNumber = 0;
  const request: typeof fetch = async (input) => {
    requestNumber += 1;
    if (requestNumber === 1) return response({ trip: promoted, outcome: "promoted" }, 201);
    if (requestNumber === 2) throw new TypeError("response lost after commit");
    assert.match(String(input), /\/promote$/);
    return response({ trip: planned, outcome: "conflict", conflictReason: "cloud-newer", error: "already planned" }, 409);
  };

  await assert.rejects(() => saveTripRecoveryToEasyT(built, recovery.handle, request), /response lost/i);
  const acknowledged = await saveTripRecoveryToEasyT(built, recovery.handle, request);
  assert.deepEqual(acknowledged, planned);
  assert.equal(requestNumber, 3, "the exact committed document needs no duplicate PUT");
});

test("a concurrent exact planned save conflict is an idempotent Build acknowledgement", async () => {
  const built = trip({ ownerId: null, status: "planned", title: "Double click" });
  const recovery = saveTripRecoveryToStorage(new MemoryStorage(), built, { ownerId: "owner-a", writeId: "double-build" });
  const promoted = canonicalTripForOwner("owner-a", { ...built, status: "draft" });
  const planned = canonicalTripForOwner("owner-a", { ...promoted, status: "planned" }, "2026-08-20T12:00:00.000Z");
  let requestNumber = 0;
  const acknowledged = await saveTripRecoveryToEasyT(built, recovery.handle, async () => {
    requestNumber += 1;
    return requestNumber === 1
      ? response({ trip: promoted, outcome: "already-canonical" })
      : response({ trip: planned, conflictReason: "cloud-changed", error: "changed" }, 409);
  });
  assert.deepEqual(acknowledged, planned);
  assert.equal(requestNumber, 2);
});

test("an existing account draft acknowledges an exact save that committed before its response was lost", async () => {
  const pending = trip({ ownerId: "owner-a", status: "planned", title: "Existing Builder edit" });
  const recovery = saveTripRecoveryToStorage(new MemoryStorage(), pending, { writeId: "owned-after-write" });
  const canonical = canonicalTripForOwner("owner-a", pending, "2026-08-20T12:00:00.000Z");
  const acknowledged = await saveTripRecoveryToEasyT(pending, recovery.handle, async () => response({
    trip: canonical,
    conflictReason: "cloud-changed",
    error: "changed",
  }, 409));
  assert.deepEqual(acknowledged, canonical);
});

test("Build equivalence covers semantic selections and canonical legs", () => {
  const structured = extractStructuredTripBrief("Belize and Tikal for nature.");
  const reviewed = trip({
    ownerId: null,
    status: "planned",
    brief: {
      ...trip().brief,
      intent: { ...defaultTripIntent({ travellers: 2 }), preferences: { ...defaultTripIntent({ travellers: 2 }).preferences, interests: ["nature"] } },
      structuredBrief: mergeStructuredTripBrief(structured, { placeSelections: [{ mentionId: "belize", kind: "base", selectedCanonicalPlaceId: "caye-caulker", selectedName: "Caye Caulker", routeStopId: "caye", provenance: { id: "test", label: "Test selection", kind: "builder", supports: "Traveller selected the base." } }] }),
    },
    stops: [{ id: "caye", order: 0, name: "Caye Caulker", country: "Belize", latitude: 17.74, longitude: -88.02, arrivalDate: "2026-11-01", departureDate: "2026-11-08", nights: 7 }],
    legs: [{ id: "arrival", fromStopId: "trip-dashboard-reconcile-origin", toStopId: "caye", fromEndpoint: { kind: "origin", id: "trip-dashboard-reconcile-origin", name: "London", coordinates: [-0.1276, 51.5072] }, toEndpoint: { kind: "stop", id: "caye", name: "Caye Caulker", country: "Belize", coordinates: [-88.02, 17.74] }, classification: "arrival", mode: "flight", distanceKm: 8300, durationMinutes: 900, provider: null, routeMetadata: {}, warnings: [] }],
  });
  const canonical = canonicalTripForOwner("owner-a", reviewed, "2026-08-20T12:00:00.000Z");
  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, canonical, "owner-a"), true);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, { ...canonical, legs: [] }, "owner-a"), false);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, { ...canonical, brief: { ...canonical.brief, structuredBrief: undefined } }, "owner-a"), false);
});

test("Build equivalence accepts only marked repository transfer enrichment", () => {
  const reviewed = trip({
    ownerId: null,
    status: "planned",
    legs: [{
      id: "planner-leg",
      fromStopId: "trip-dashboard-reconcile-origin",
      toStopId: "stop-a",
      fromEndpoint: { kind: "origin", id: "trip-dashboard-reconcile-origin", name: "London", coordinates: [-0.1276, 51.5072] },
      toEndpoint: { kind: "stop", id: "stop-a", name: "Paris", country: "France", coordinates: [2.3522, 48.8566] },
      classification: "arrival",
      mode: "flight",
      distanceKm: 344,
      durationMinutes: 240,
      provider: "Morrovia planner",
      routeMetadata: { source: "morrovia-planner", transportConstraints: { preferredModes: ["train"] } },
      warnings: [],
    }],
  });
  const base = canonicalTripForOwner("owner-a", reviewed, "2026-08-20T12:00:00.000Z");
  const enrichedLeg = {
    ...base.legs[0]!,
    mode: "train" as const,
    durationMinutes: 180,
    headlineMinutes: 180,
    doorToDoorMinutes: 180,
    provider: "Canonical rail evidence",
    provenance: "planning_estimate" as const,
    confidence: "high" as const,
    scheduleNeedsChecking: true,
    segments: [{
      id: "london:paris:train:0",
      mode: "train" as const,
      fromEndpoint: base.legs[0]!.fromEndpoint!,
      toEndpoint: base.legs[0]!.toEndpoint!,
      distanceKm: 344,
      durationMinutes: 180,
      provider: "Canonical rail evidence",
      provenance: "planning_estimate" as const,
      confidence: "high" as const,
      scheduleNeedsChecking: true,
    }],
    routeMetadata: {
      transportConstraints: { preferredModes: ["train"] },
      source: "multimodal-resolver",
      planningEstimate: true,
      roadFallbackEligible: false,
      transferImpact: { usableDayLoss: 0.25 },
      multimodalResolution: { version: 1, selected: "train", candidates: [], rejected: [] },
    },
  };
  const enriched = { ...base, legs: [enrichedLeg] };

  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, enriched, "owner-a"), true);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, {
    ...enriched,
    legs: [{ ...enrichedLeg, toEndpoint: { ...enrichedLeg.toEndpoint!, name: "Lyon" } }],
  }, "owner-a"), false);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, {
    ...enriched,
    legs: [{ ...enrichedLeg, routeMetadata: { ...enrichedLeg.routeMetadata, transportConstraints: { preferredModes: ["flight"] } } }],
  }, "owner-a"), false);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(reviewed, {
    ...base,
    legs: [{ ...enrichedLeg, routeMetadata: { ...enrichedLeg.routeMetadata, source: "unmarked-rewrite" } }],
  }, "owner-a"), false);
});

test("HTTP save failures retain safe category, status and operation", async () => {
  const owned = trip();
  await assert.rejects(
    () => saveTripToEasyT(owned, async () => response({ error: "Morrovia could not save this trip right now.", category: "repository" }, 500)),
    (error: unknown) => error instanceof EasyTTripPersistenceError
      && error.category === "repository" && error.status === 500 && error.operation === "update",
  );
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
