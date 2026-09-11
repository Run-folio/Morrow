import assert from "node:assert/strict";
import test from "node:test";

import { resolveTripTransferJourneys } from "../lib/easyt/multimodal-transfer-resolution.ts";
import {
  cacheCanonicalTripWithRecoveryToStorage,
  loadTripRecoveryFromStorage,
  saveTripRecoveryToEasyT,
  saveTripRecoveryToStorage,
  saveTripToEasyT,
  type EasyTBrowserStorage,
} from "../lib/easyt/storage.ts";
import { decideExistingTripUpdate, nextTripUpdatedAt } from "../lib/easyt/trip-continuity.ts";
import { normalizedLegEndpoints } from "../lib/easyt/trip-persistence.ts";
import { canonicalTripForOwner, tripBuildDocumentsCanonicalEquivalent } from "../lib/easyt/trip-promotion.ts";
import { isEasyTTrip, tripFromBuilder, type EasyTTrip, type TripStop } from "../lib/easyt/trip.ts";
import { EasyTTripPersistenceError } from "../lib/easyt/trip-persistence-error.ts";

class MemoryStorage implements EasyTBrowserStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

type PlaceFixture = {
  id: string;
  name: string;
  country: string;
  coordinates: [number, number];
  nights: number;
};

type RouteFixture = {
  id: string;
  origin: PlaceFixture;
  stops: PlaceFixture[];
  startDate: string;
  endDate: string;
};

const london: PlaceFixture = {
  id: "london",
  name: "London",
  country: "United Kingdom",
  coordinates: [-0.1276, 51.5072],
  nights: 0,
};

const fixtures: RouteFixture[] = [
  {
    id: "fixture-a-us-west",
    origin: london,
    startDate: "2026-10-01",
    endDate: "2026-10-22",
    stops: [
      { id: "san-francisco", name: "San Francisco", country: "United States", coordinates: [-122.4194, 37.7749], nights: 4 },
      { id: "los-angeles", name: "Los Angeles", country: "United States", coordinates: [-118.2437, 34.0522], nights: 4 },
      { id: "las-vegas", name: "Las Vegas", country: "United States", coordinates: [-115.1398, 36.1699], nights: 3 },
      { id: "joshua-tree", name: "Joshua Tree", country: "United States", coordinates: [-116.319, 34.1347], nights: 3 },
      { id: "yosemite-valley", name: "Yosemite Valley", country: "United States", coordinates: [-119.5383, 37.7456], nights: 7 },
    ],
  },
  {
    id: "fixture-b-southern-africa",
    origin: london,
    startDate: "2026-11-01",
    endDate: "2026-11-25",
    stops: [
      { id: "cape-town", name: "Cape Town", country: "South Africa", coordinates: [18.4241, -33.9249], nights: 5 },
      { id: "stellenbosch", name: "Stellenbosch", country: "South Africa", coordinates: [18.8602, -33.9321], nights: 3 },
      { id: "johannesburg", name: "Johannesburg", country: "South Africa", coordinates: [28.0473, -26.2041], nights: 3 },
      { id: "hoedspruit", name: "Hoedspruit", country: "South Africa", coordinates: [30.9547, -24.351], nights: 5 },
      { id: "maputo", name: "Maputo", country: "Mozambique", coordinates: [32.5732, -25.9692], nights: 4 },
      { id: "eswatini", name: "Mbabane", country: "Eswatini", coordinates: [31.1367, -26.3054], nights: 4 },
    ],
  },
  {
    id: "fixture-c-europe",
    origin: london,
    startDate: "2026-12-01",
    endDate: "2026-12-09",
    stops: [
      { id: "paris", name: "Paris", country: "France", coordinates: [2.3522, 48.8566], nights: 4 },
      { id: "amsterdam", name: "Amsterdam", country: "Netherlands", coordinates: [4.9041, 52.3676], nights: 4 },
    ],
  },
];

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

function builderTrip(fixture: RouteFixture, status: EasyTTrip["status"] = "draft") {
  return tripFromBuilder({
    id: fixture.id,
    origin: fixture.origin.name,
    originCanonicalPlaceId: fixture.origin.id,
    originCountry: fixture.origin.country,
    originCoordinates: fixture.origin.coordinates,
    journeyEnd: { mode: "same_as_start" },
    stops: fixture.stops.map(({ nights: _nights, ...stop }) => ({ ...stop, canonicalPlaceId: stop.id })),
    startDate: fixture.startDate,
    endDate: fixture.endDate,
    picks: {},
    mustDo: "Preserve the reviewed route and realistic transfer sequence.",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: Object.fromEntries(fixture.stops.map((stop) => [stop.id, stop.nights])),
    draft: [],
    status: status === "planned" ? "planned" : "draft",
  });
}

function editedTrip(
  canonical: EasyTTrip,
  fixture: RouteFixture,
  stops: PlaceFixture[],
  status: "draft" | "planned",
) {
  const rebuilt = builderTrip({ ...fixture, stops }, status);
  return {
    ...rebuilt,
    ownerId: canonical.ownerId,
    createdAt: canonical.createdAt,
    updatedAt: canonical.updatedAt,
  };
}

class AccountPersistenceHarness {
  readonly rows = new Map<string, EasyTTrip>();
  readonly normalized = new Map<string, { stopIds: string[]; legIds: string[] }>();
  readonly requests: Array<{ ownerId: string | null; method: string; path: string; status: number }> = [];
  private revision = new Date("2026-09-11T12:00:00.000Z");

  request(ownerId: string | null): typeof fetch {
    return async (input, init) => {
      const path = String(input);
      const method = String(init?.method ?? "GET");
      const respond = (body: unknown, status: number) => {
        this.requests.push({ ownerId, method, path, status });
        return jsonResponse(body, status);
      };
      if (!ownerId) return respond({ error: "Unauthorized", category: "authentication" }, 401);

      const match = path.match(/^\/api\/easyt\/trips\/([^/]+)(\/promote)?$/);
      if (!match) return respond({ error: "Not found." }, 404);
      const tripId = decodeURIComponent(match[1]!);
      const promotion = Boolean(match[2]);

      if (method === "GET") {
        const row = this.rows.get(tripId);
        return row?.ownerId === ownerId
          ? respond({ trip: structuredClone(row) }, 200)
          : respond({ error: "Trip not found." }, 404);
      }

      const body: unknown = JSON.parse(String(init?.body));
      if (!isEasyTTrip(body) || body.id !== tripId) {
        return respond({ error: "Invalid EasyT trip document.", category: "validation" }, 400);
      }

      if (promotion && method === "POST") {
        if (body.ownerId !== null || body.status !== "draft") {
          return respond({ error: "This trip is not available to the current account.", category: "authentication" }, 403);
        }
        const routed = await resolveTripTransferJourneys(body);
        const candidate = canonicalTripForOwner(ownerId, routed);
        const existing = this.rows.get(tripId);
        if (existing) {
          if (existing.ownerId === ownerId && JSON.stringify(existing) === JSON.stringify(candidate)) {
            return respond({ trip: structuredClone(existing), outcome: "already-canonical" }, 200);
          }
          return respond({ trip: structuredClone(existing), outcome: "conflict", conflictReason: "cloud-different", category: "conflict", error: "A different cloud copy already exists." }, 409);
        }
        this.write(candidate);
        return respond({ trip: structuredClone(candidate), outcome: "promoted" }, 201);
      }

      if (!promotion && method === "PUT") {
        const existing = this.rows.get(tripId);
        if (!existing) return respond({ error: "Trip not found." }, 404);
        if (body.ownerId !== ownerId || existing.ownerId !== ownerId) {
          return respond({ error: "This trip is not available to the current account.", category: "authentication" }, 403);
        }
        const decision = decideExistingTripUpdate(ownerId, body, existing);
        if (decision.outcome !== "save") {
          return respond({ trip: structuredClone(existing), conflictReason: "cloud-changed", category: "conflict", error: "This trip changed on another device." }, 409);
        }
        this.revision = new Date(this.revision.getTime() + 1_000);
        const routed = await resolveTripTransferJourneys(body);
        const saved = canonicalTripForOwner(
          ownerId,
          { ...routed, status: existing.status === "planned" && body.status === "draft" ? "planned" : body.status },
          nextTripUpdatedAt(body.updatedAt, this.revision),
        );
        this.write(saved);
        return respond({ trip: structuredClone(saved) }, 200);
      }

      return respond({ error: "Unsupported request." }, 405);
    };
  }

  private write(trip: EasyTTrip) {
    const stopIds = trip.stops.map((stop) => stop.id);
    assert.equal(new Set(stopIds).size, stopIds.length, "a write must not duplicate normalized stops");
    const legIds = trip.legs.map((leg) => leg.id);
    assert.equal(new Set(legIds).size, legIds.length, "a write must not duplicate normalized legs");
    for (const leg of trip.legs) {
      const endpoint = normalizedLegEndpoints(trip.id, leg);
      assert.ok(endpoint.fromEndpointKind === "origin" || endpoint.fromEndpointKind === "stop");
      assert.ok(endpoint.toEndpointKind === "origin" || endpoint.toEndpointKind === "stop" || endpoint.toEndpointKind === "end");
      assert.equal(endpoint.fromEndpointKind === "stop", endpoint.fromStopId !== null);
      assert.equal(endpoint.toEndpointKind === "stop", endpoint.toStopId !== null);
      if (endpoint.fromStopId) assert.ok(stopIds.includes(endpoint.fromStopId), "from-stop FK must resolve inside the canonical trip");
      if (endpoint.toStopId) assert.ok(stopIds.includes(endpoint.toStopId), "to-stop FK must resolve inside the canonical trip");
    }
    this.rows.set(trip.id, structuredClone(trip));
    this.normalized.set(trip.id, { stopIds, legIds });
  }
}

async function loadTrip(request: typeof fetch, tripId: string) {
  const response = await request(`/api/easyt/trips/${encodeURIComponent(tripId)}`);
  const payload = await response.json() as { trip?: unknown };
  return { response, trip: isEasyTTrip(payload.trip) ? payload.trip : null };
}

for (const fixture of fixtures) {
  test(`${fixture.id} completes signed-in create, route/nights Build, reload, retry and isolation`, async () => {
    const harness = new AccountPersistenceHarness();
    const storage = new MemoryStorage();
    const ownerARequest = harness.request("owner-a");
    const draft = builderTrip(fixture);
    const createRecovery = saveTripRecoveryToStorage(storage, draft, { ownerId: "owner-a", writeId: `${fixture.id}-create` });

    const created = await saveTripRecoveryToEasyT(draft, createRecovery.handle, ownerARequest);
    assert.equal(created.id, fixture.id);
    assert.equal(created.ownerId, "owner-a");
    assert.equal(created.status, "draft");
    assert.ok(loadTripRecoveryFromStorage(storage, fixture.id, "owner-a"), "device recovery remains until canonical acknowledgement");
    const repeatedPromotion = await saveTripRecoveryToEasyT(draft, createRecovery.handle, ownerARequest);
    assert.deepEqual(repeatedPromotion, created, "repeated guest promotion resolves to the sole canonical account trip");
    assert.equal(harness.rows.size, 1);
    assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, created, createRecovery.handle), { stored: true, recoveryResolved: true });
    assert.equal(loadTripRecoveryFromStorage(storage, fixture.id, "owner-a"), null);

    const reordered = [fixture.stops[0]!, fixture.stops[2] ?? fixture.stops[1]!, fixture.stops[1]!, ...fixture.stops.slice(3)]
      .filter((stop, index, values) => values.indexOf(stop) === index)
      .map((stop, index) => index === 0 ? { ...stop, nights: stop.nights + 1 } : stop);
    const build = editedTrip(created, fixture, reordered, "planned");
    const buildRecovery = saveTripRecoveryToStorage(storage, build, { ownerId: "owner-a", writeId: `${fixture.id}-build` });
    const built = await saveTripRecoveryToEasyT(build, buildRecovery.handle, ownerARequest);
    assert.equal(built.status, "planned");
    assert.equal(tripBuildDocumentsCanonicalEquivalent(build, built, "owner-a"), true);
    assert.deepEqual(built.stops.map((stop) => stop.name), reordered.map((stop) => stop.name));
    assert.deepEqual(built.stops.map((stop) => stop.nights), reordered.map((stop) => stop.nights));
    assert.equal(built.legs[0]?.fromEndpoint?.kind, "origin");
    assert.equal(built.legs.at(-1)?.toEndpoint?.kind, "end");
    assert.equal(built.legs.at(-1)?.toEndpoint?.canonicalPlaceId, "london");
    assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, built, buildRecovery.handle), { stored: true, recoveryResolved: true });

    const firstReload = await loadTrip(ownerARequest, fixture.id);
    assert.equal(firstReload.response.status, 200);
    assert.deepEqual(firstReload.trip, built);

    const laterStops = reordered.map((stop, index) => index === reordered.length - 1 ? { ...stop, nights: stop.nights + 1 } : stop);
    const laterEdit = editedTrip(built, fixture, laterStops, "planned");
    const laterRecovery = saveTripRecoveryToStorage(storage, laterEdit, { ownerId: "owner-a", writeId: `${fixture.id}-later` });
    const latest = await saveTripRecoveryToEasyT(laterEdit, laterRecovery.handle, ownerARequest);
    const countsAfterFirstWrite = structuredClone(harness.normalized.get(fixture.id));
    const repeated = await saveTripRecoveryToEasyT(laterEdit, laterRecovery.handle, ownerARequest);
    assert.deepEqual(repeated, latest, "a repeated ambiguous write is acknowledged from the canonical conflict document");
    assert.deepEqual(harness.normalized.get(fixture.id), countsAfterFirstWrite);
    assert.equal(harness.rows.size, 1);
    assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage, latest, laterRecovery.handle), { stored: true, recoveryResolved: true });

    const secondReload = await loadTrip(ownerARequest, fixture.id);
    assert.equal(secondReload.response.status, 200);
    assert.deepEqual(secondReload.trip, latest);
    assert.deepEqual(secondReload.trip?.stops.map((stop: TripStop) => stop.nights), laterStops.map((stop) => stop.nights));

    const ownerBRead = await loadTrip(harness.request("owner-b"), fixture.id);
    assert.equal(ownerBRead.response.status, 404);
    await assert.rejects(
      () => saveTripToEasyT({ ...latest, ownerId: "owner-b" }, harness.request("owner-b")),
      (error: unknown) => error instanceof EasyTTripPersistenceError
        && error.category === "authentication" && error.status === 403,
    );
    const signedOutRead = await loadTrip(harness.request(null), fixture.id);
    assert.equal(signedOutRead.response.status, 401);
    await assert.rejects(() => saveTripToEasyT(latest, harness.request(null)), /session expired/i);
    assert.equal(
      JSON.stringify(harness.rows.get(fixture.id)),
      JSON.stringify(latest),
      "failed cross-account and signed-out writes leave canonical state untouched",
    );
    assert.deepEqual(harness.requests.map(({ ownerId, method, path, status }) => ({
      ownerId,
      method,
      boundary: path.endsWith("/promote") ? "promote" : "trip",
      status,
    })), [
      { ownerId: "owner-a", method: "POST", boundary: "promote", status: 201 },
      { ownerId: "owner-a", method: "POST", boundary: "promote", status: 200 },
      { ownerId: "owner-a", method: "PUT", boundary: "trip", status: 200 },
      { ownerId: "owner-a", method: "GET", boundary: "trip", status: 200 },
      { ownerId: "owner-a", method: "PUT", boundary: "trip", status: 200 },
      { ownerId: "owner-a", method: "PUT", boundary: "trip", status: 409 },
      { ownerId: "owner-a", method: "GET", boundary: "trip", status: 200 },
      { ownerId: "owner-b", method: "GET", boundary: "trip", status: 404 },
      { ownerId: "owner-b", method: "PUT", boundary: "trip", status: 403 },
      { ownerId: null, method: "GET", boundary: "trip", status: 401 },
      { ownerId: null, method: "PUT", boundary: "trip", status: 401 },
    ]);

    const guestStorage = new MemoryStorage();
    const guestEdit = builderTrip({ ...fixture, id: `${fixture.id}-guest-device` });
    const guestRecovery = saveTripRecoveryToStorage(guestStorage, guestEdit, { ownerId: null, writeId: `${fixture.id}-guest` });
    assert.equal(guestRecovery.stored, true);
    assert.equal(
      JSON.stringify(loadTripRecoveryFromStorage(guestStorage, guestEdit.id, null)?.trip),
      JSON.stringify(guestEdit),
    );
  });
}
