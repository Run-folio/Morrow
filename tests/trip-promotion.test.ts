import assert from "node:assert/strict";
import test from "node:test";

import {
  canPromoteTripForOwner,
  canonicalTripForOwner,
  decideExistingTripPromotion,
  requestTripPromotion,
  tripPromotionConflictReason,
} from "../lib/easyt/trip-promotion.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
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

function placeAwareBrief(routeStopId: string) {
  const base = extractStructuredTripBrief("Patagonia, Tierra del Fuego and Rapa Nui.");
  const patagonia = base.placeMentions?.find((mention) => mention.canonicalPlaceId === "patagonia");
  const rapaNui = base.placeMentions?.find((mention) => mention.canonicalPlaceId === "rapa-nui");
  assert.ok(patagonia);
  assert.ok(rapaNui);
  const option = base.placeIssues?.find((issue) => issue.mentionId === patagonia.mentionId)?.options
    .find((candidate) => candidate.label === "El Calafate");
  assert.ok(option);
  assert.ok(option.provenance[0]);
  return mergeStructuredTripBrief(base, {
    destinations: [{
      id: routeStopId,
      name: option.label,
      canonicalPlaceId: option.canonicalPlaceId,
      placeMentionId: patagonia.mentionId,
      placeType: option.placeType,
      resolutionStatus: "resolved",
      routability: "direct_destination",
    }],
    placeSelections: [{
      mentionId: patagonia.mentionId,
      kind: "base",
      selectedCanonicalPlaceId: option.canonicalPlaceId,
      selectedName: option.label,
      routeStopId,
      provenance: option.provenance[0],
    }],
    removedPlaceMentionIds: [rapaNui.mentionId],
  });
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

test("promotion and JSON persistence preserve place intelligence while remapping only route IDs", () => {
  const source = localTrip();
  const structuredBrief = placeAwareBrief("patagonia-base");
  const local: EasyTTrip = {
    ...source,
    brief: { ...source.brief, selectedPlaces: { "patagonia-base": [] }, structuredBrief },
    stops: [{
      id: "patagonia-base", order: 0, name: "El Calafate", country: "Argentina",
      latitude: -50.3379, longitude: -72.2648, arrivalDate: "2026-10-01", departureDate: "2026-10-05", nights: 4,
    }],
    legs: [],
    planItems: [{ ...source.planItems[0], stopId: "patagonia-base" }],
  };
  const canonical = canonicalTripForOwner("owner-a", local);
  const routeStopId = `${local.id}-stop-patagonia-base`;
  const canonicalBrief = canonical.brief.structuredBrief;
  assert.ok(canonicalBrief);

  assert.equal(canonicalBrief.destinations.find((destination) => destination.name === "El Calafate")?.id, routeStopId);
  assert.equal(
    canonicalBrief.destinations.find((destination) => destination.name === "El Calafate")?.canonicalPlaceId,
    structuredBrief.destinations.find((destination) => destination.name === "El Calafate")?.canonicalPlaceId,
  );
  assert.deepEqual(canonicalBrief.placeMentions, structuredBrief.placeMentions);
  assert.deepEqual(canonicalBrief.placeIssues, structuredBrief.placeIssues);
  assert.deepEqual(canonicalBrief.removedPlaceMentionIds, structuredBrief.removedPlaceMentionIds);
  assert.equal(canonicalBrief.placeSelections?.[0]?.routeStopId, routeStopId);
  assert.equal(canonicalBrief.placeSelections?.[0]?.selectedCanonicalPlaceId, structuredBrief.placeSelections?.[0]?.selectedCanonicalPlaceId);

  const persisted = JSON.parse(JSON.stringify(canonical)) as EasyTTrip;
  assert.deepEqual(persisted.brief.structuredBrief, JSON.parse(JSON.stringify(canonicalBrief)));
  assert.deepEqual(persisted.brief.structuredBrief?.placeMentions, JSON.parse(JSON.stringify(canonicalBrief.placeMentions)));
  assert.deepEqual(persisted.brief.structuredBrief?.placeIssues, JSON.parse(JSON.stringify(canonicalBrief.placeIssues)));
  assert.deepEqual(persisted.brief.structuredBrief?.placeSelections, JSON.parse(JSON.stringify(canonicalBrief.placeSelections)));
  assert.deepEqual(persisted.brief.structuredBrief?.removedPlaceMentionIds, canonicalBrief.removedPlaceMentionIds);
  assert.notEqual(
    persisted.brief.structuredBrief?.destinations.find((destination) => destination.name === "El Calafate")?.id,
    persisted.brief.structuredBrief?.destinations.find((destination) => destination.name === "El Calafate")?.canonicalPlaceId,
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
