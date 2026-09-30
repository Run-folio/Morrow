import assert from "node:assert/strict";
import test from "node:test";
import { resolveGooglePlaceReference } from "../lib/easyt/google-place-reference-lifecycle.ts";
import { googlePlaceEnrichmentProvider } from "../lib/easyt/google-place-enrichment.server.ts";
import type { GooglePlaceReference } from "../lib/easyt/trip.ts";
import { composeItineraryDay } from "../lib/easyt/itinerary-day-composition.ts";
import { projectPersistedMapResults } from "../lib/easyt/map-result-selection.ts";
import { saveGooglePlaceReference, scheduleGooglePlaceReference } from "../lib/easyt/itinerary-ideas.ts";
import { defaultTripIntent, type EasyTTrip } from "../lib/easyt/trip.ts";

const now = new Date("2026-09-28T12:00:00.000Z");
const recent: GooglePlaceReference = { provider: "google", placeId: "ChIJtokyo-1", lastResolvedAt: "2026-09-27T12:00:00.000Z" };
const old: GooglePlaceReference = { ...recent, lastResolvedAt: "2024-09-27T12:00:00.000Z" };
const detail = { providerPlaceId: "ChIJtokyo-1", name: "Temporary Google name", coordinates: [139.7, 35.7] as [number, number], mapsUrl: "https://www.google.com/maps/place/ChIJtokyo-1" };

test("recent reference resolves transient detail without an ID refresh", async () => {
  let refreshes = 0;
  const result = await resolveGooglePlaceReference(recent, {
    refreshPlaceId: async () => { refreshes++; return "ChIJtokyo-1"; },
    details: async () => detail,
  }, now);
  assert.equal(refreshes, 0);
  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.equal(result.detail.name, detail.name);
  assert.deepEqual(result.refreshedReference, recent);
});

test("old reference uses ID-only refresh and persists freshness, not provider facts", async () => {
  const calls: string[] = [];
  const provider = googlePlaceEnrichmentProvider("secret", async (url, init) => {
    calls.push((init?.headers as Record<string, string>)["X-Goog-FieldMask"]);
    assert.match(String(url), /places\/ChIJtokyo-1$/);
    return calls.length === 1 ? Response.json({ id: "ChIJtokyo-1" }) : Response.json({ id: "ChIJtokyo-1", displayName: { text: "Transient museum" }, location: { latitude: 35.7, longitude: 139.7 }, googleMapsUri: "https://www.google.com/maps/place/ChIJtokyo-1" });
  });
  const result = await resolveGooglePlaceReference(old, provider, now);
  assert.equal(calls[0], "id");
  assert.match(calls[1] ?? "", /displayName/);
  assert.equal(calls.length, 2);
  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.deepEqual(result.refreshedReference, { provider: "google", placeId: "ChIJtokyo-1", lastResolvedAt: now.toISOString() });
  assert.equal(JSON.stringify(result.refreshedReference).includes("museum"), false);
});

test("invalid or obsolete ID keeps exact reference for retry/reselection; no name rematch", async () => {
  for (const reason of ["INVALID_REQUEST", "NOT_FOUND"] as const) {
    const result = await resolveGooglePlaceReference(old, {
      refreshPlaceId: async () => { throw new Error(reason); },
      details: async () => { throw new Error("details must not run"); },
    }, now);
    assert.deepEqual(result, { status: "unavailable", reason: reason === "INVALID_REQUEST" ? "invalid" : "not-found", reference: old });
  }
});

test("provider failure and unexpected ID change retain original saved identity", async () => {
  const failed = await resolveGooglePlaceReference(old, { refreshPlaceId: async () => { throw new Error("places_http_429"); }, details: async () => detail }, now);
  assert.deepEqual(failed, { status: "unavailable", reason: "provider-failure", reference: old });
  const changed = await resolveGooglePlaceReference(old, { refreshPlaceId: async () => "OtherPlaceId", details: async () => detail }, now);
  assert.deepEqual(changed, { status: "unavailable", reason: "not-found", reference: old });
});

test("scheduled reference is visible as neutral itinerary content and cannot leak into MapLibre", () => {
  const trip: EasyTTrip = {
    schemaVersion: 1, id: "lifecycle-trip", ownerId: null, title: "Tokyo", status: "draft",
    startDate: "2026-10-01", endDate: "2026-10-01", travellers: 2, currency: "GBP",
    brief: { origin: "Tokyo", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: defaultTripIntent({ stopIds: ["tokyo-a"], durationDays: 1 }) },
    stops: [{ id: "tokyo-a", order: 0, name: "Tokyo", country: "Japan", latitude: 35.7, longitude: 139.7, nights: 1, arrivalDate: null, departureDate: null }], legs: [],
    planItems: [{ id: "day-1", stopId: "tokyo-a", dayNumber: 1, date: "2026-10-01", type: "activity", title: "Explore", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    recommendations: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
  const saved = saveGooglePlaceReference(trip, { stopId: "tokyo-a", placeId: "ChIJtokyo-1", category: "activity" });
  const scheduled = scheduleGooglePlaceReference(saved, saved.brief.itineraryIdeas![0]!.id, "day-1", "afternoon");
  const day = composeItineraryDay(scheduled, "day-1")!;
  assert.equal(day.planned.afternoon.length, 1);
  assert.equal(day.planned.afternoon[0]?.source, "google-place-reference");
  assert.equal(day.planned.afternoon[0]?.title, "Saved Google place");
  assert.equal(day.planned.afternoon[0]?.mapPinId, undefined);
  assert.equal(day.planned.afternoon[0]?.placeId, undefined);
  assert.deepEqual(projectPersistedMapResults(scheduled).results, []);
});
