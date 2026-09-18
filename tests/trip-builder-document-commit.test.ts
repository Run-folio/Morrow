import assert from "node:assert/strict";
import test from "node:test";

import {
  builderDetailsFingerprint,
  builderDocumentFingerprint,
  prepareBuilderDocumentCommit,
} from "../lib/easyt/trip-builder-document-commit.ts";
import { tripFromBuilder, type BuilderTripInput } from "../lib/easyt/trip.ts";

function fixtureTrip(overrides: Partial<BuilderTripInput> = {}) {
  const stops: BuilderTripInput["stops"] = [
    { id: "tokyo-1", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo" },
    { id: "kyoto-1", name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto" },
  ];
  return tripFromBuilder({
    id: "builder-document-commit",
    origin: "London",
    originCountry: "United Kingdom",
    originCanonicalPlaceId: "london",
    journeyEnd: { mode: "unknown" },
    stops,
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    nightAllocations: Object.fromEntries(stops.map((stop) => [stop.id, 1])),
    draft: [],
    ...overrides,
  });
}

test("accepts one complete valid next document", () => {
  const current = fixtureTrip({
    journeyEnd: { mode: "same_as_start" },
    stops: [{ id: "busan-1", name: "Busan", country: "South Korea", canonicalPlaceId: "busan" }],
    nightAllocations: { "busan-1": 2 },
  });
  const proposed = { ...current, travellers: 4 };
  const result = prepareBuilderDocumentCommit({
    current,
    proposed,
    expectedFingerprint: builderDocumentFingerprint(current),
    validate: () => true,
  });
  assert.deepEqual(result, { ok: true, document: proposed });
});

test("rejects stale and invalid drafts without returning a partial document", () => {
  const current = fixtureTrip();
  const proposed = { ...current, travellers: 4 };
  assert.deepEqual(
    prepareBuilderDocumentCommit({ current, proposed, expectedFingerprint: "stale", validate: () => true }),
    { ok: false, reason: "stale-source" },
  );
  assert.deepEqual(
    prepareBuilderDocumentCommit({
      current,
      proposed,
      expectedFingerprint: builderDocumentFingerprint(current),
      validate: () => false,
    }),
    { ok: false, reason: "invalid-document" },
  );
});

test("fingerprint covers editable fields but ignores timestamps and derived legs", () => {
  const current = fixtureTrip();
  const timestampOnly = { ...current, updatedAt: "2099-01-01T00:00:00.000Z", legs: [] };
  assert.equal(builderDocumentFingerprint(timestampOnly), builderDocumentFingerprint(current));
  assert.notEqual(builderDocumentFingerprint({ ...current, travellers: 3 }), builderDocumentFingerprint(current));
  assert.notEqual(builderDocumentFingerprint({
    ...current,
    stops: [...current.stops].reverse().map((stop, order) => ({ ...stop, order })),
  }), builderDocumentFingerprint(current));
});

test("details CAS ignores background route enrichment but rejects newer details", () => {
  const current = fixtureTrip();
  const backgroundEnriched = {
    ...current,
    stops: current.stops.map((stop) => ({ ...stop, providerId: `provider:${stop.id}`, latitude: 1, longitude: 2 })),
  };
  assert.equal(builderDetailsFingerprint(backgroundEnriched), builderDetailsFingerprint(current));
  assert.notEqual(builderDetailsFingerprint({ ...current, travellers: 3 }), builderDetailsFingerprint(current));
  assert.notEqual(builderDetailsFingerprint({
    ...current,
    brief: { ...current.brief, journeyEnd: { mode: "same_as_start" } },
  }), builderDetailsFingerprint(current));
});

test("keeps endpoints out of night-bearing stops", () => {
  const proposed = fixtureTrip({
    journeyEnd: { mode: "explicit", place: { name: "Busan", canonicalPlaceId: "busan" } },
    stops: [{ id: "seoul-1", name: "Seoul", country: "South Korea", canonicalPlaceId: "seoul" }],
    nightAllocations: { "seoul-1": 2 },
  });
  const result = prepareBuilderDocumentCommit({
    current: proposed,
    proposed,
    expectedFingerprint: builderDocumentFingerprint(proposed),
    validate: () => true,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.document.stops.map((stop) => stop.name), ["Seoul"]);
});
