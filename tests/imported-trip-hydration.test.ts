import assert from "node:assert/strict";
import test from "node:test";
import { buildSpreadsheetImportProposal, canonicalTripFromSpreadsheetProposal, parseDelimitedText } from "../lib/easyt/spreadsheet-import.ts";
import { buildImportedDatedDays, repairEligibleSpreadsheetV1Trip, importedLegacyRepairContextAllows } from "../lib/easyt/imported-trip-hydration.ts";
import { tripRouteDisplayEndpoints, tripRouteDisplayLabel } from "../lib/easyt/trip-legs.ts";
import { itineraryCalendarDays, itineraryCalendarWeeks, itineraryCalendarNightBands } from "../lib/easyt/itinerary-calendar.ts";
import { exploreDestinationOptions, exploreDiscoveryRequestKey } from "../lib/easyt/explore.ts";
import { tripReadinessSummary } from "../lib/easyt/trip-readiness-summary.ts";
import { deriveOverviewReadinessCategories } from "../lib/easyt/trip-overview-readiness.ts";
import { overviewStopImage } from "../lib/easyt/trip-overview-imagery.ts";
import { personalRoutePresentation } from "../lib/easyt/personal-route.ts";
import { deriveItineraryCoverage } from "../lib/easyt/trip-facts.ts";
import { philippinesImportCsv } from "./fixtures/spreadsheet-import.ts";
import { cacheCanonicalTripWithRecoveryToStorage, loadTripRecoveryFromStorage, saveTripRecoveryToEasyT, saveTripRecoveryToStorage, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
import { resolveTripTransferJourneys } from "../lib/easyt/multimodal-transfer-resolution.ts";
import { canonicalTripForOwner, tripBuildDocumentsCanonicalEquivalent } from "../lib/easyt/trip-promotion.ts";

const proposal = buildSpreadsheetImportProposal(parseDelimitedText(philippinesImportCsv));
const trip = canonicalTripFromSpreadsheetProposal({
  id: "trip-philippines", proposal,
  origin: { canonicalPlaceId: "place:manila", name: "Manila", country: "Philippines", coordinates: [120.98, 14.6] },
  places: proposal.stops.map((stop, index) => ({
    sourceStopId: stop.id,
    canonicalPlaceId: `place:${stop.name.toLowerCase().replaceAll(" ", "-")}`,
    name: stop.name,
    country: "Philippines",
    coordinates: [120 + index, 14 + index] as [number, number],
  })),
});

test("Philippines reviewed import survives server promotion without invented transfers", async () => {
  const request = structuredClone(trip);
  const resolved = await resolveTripTransferJourneys(request);
  const saved = canonicalTripForOwner("owner-a", resolved);
  assert.deepEqual(resolved.legs, request.legs);
  assert.deepEqual(saved.stops.map((stop) => stop.name), ["Manila", "El Nido", "Bohol", "Siquijor", "Cebu City", "Manila"]);
  assert.equal(saved.planItems.length, 21);
  assert.equal(saved.brief.bookings?.length ?? 0, 0);
  assert.ok(saved.legs.every((leg) => leg.mode === "unknown"
    && leg.durationMinutes === null
    && leg.headlineMinutes === null
    && leg.doorToDoorMinutes === null
    && leg.provenance === "unknown"
    && leg.routeMetadata.source === "spreadsheet-import-unconfirmed"
    && leg.routeMetadata.roadFallbackEligible === false));
  assert.equal(tripBuildDocumentsCanonicalEquivalent(request, saved, "owner-a"), true);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(request, { ...saved, updatedAt: "2026-10-01T00:00:00.000Z" }, "owner-a"), true);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(request, {
    ...saved, legs: saved.legs.map((leg, index) => index === 2 ? { ...leg, mode: "road", durationMinutes: 165 } : leg),
  }, "owner-a"), false);
});

test("eligible planning leg resolves while an explicit traveller transport choice remains authoritative", async () => {
  const baseline = trip.legs[2]!;
  const eligible = { ...baseline, routeMetadata: { ...baseline.routeMetadata, source: "morrovia-planner", roadFallbackEligible: true } };
  const resolved = await resolveTripTransferJourneys({ ...trip, legs: [eligible] });
  assert.notEqual(resolved.legs[0]?.mode, "unknown");
  const chosen = { ...baseline, mode: "ferry" as const, durationMinutes: 90, routeMetadata: { ...baseline.routeMetadata, source: "traveller-authored", userConfirmed: true } };
  const preserved = await resolveTripTransferJourneys({ ...trip, legs: [chosen] });
  assert.deepEqual(preserved.legs[0], chosen);
});

test("uncertain Philippines import acknowledgement retries the same account trip", async () => {
  const values = new Map<string, string>();
  const storage: EasyTBrowserStorage = {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null,
  };
  const recovery = saveTripRecoveryToStorage(storage, trip, { ownerId: "owner-a", writeId: "philippines-create" });
  assert.equal(recovery.stored, true);
  let stored: typeof trip | null = null;
  let inserts = 0;
  const request: typeof fetch = async (_input, init) => {
    const incoming = JSON.parse(String(init?.body)) as typeof trip;
    const candidate = canonicalTripForOwner("owner-a", await resolveTripTransferJourneys(incoming));
    const response = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (init?.method === "POST") {
      if (stored) return response({ trip: stored, outcome: "conflict", conflictReason: "cloud-different", category: "conflict", error: "Existing trip" }, 409);
      stored = candidate;
      inserts += 1;
      return response({ trip: stored, outcome: "promoted" }, 201);
    }
    if (stored?.status === "draft") {
      stored = { ...candidate, updatedAt: "2026-10-01T00:00:00.000Z" };
      return response({ trip: stored }, 200);
    }
    return response({ trip: stored, category: "conflict", conflictReason: "cloud-changed", error: "Existing trip" }, 409);
  };
  const first = await saveTripRecoveryToEasyT(trip, recovery.handle, request);
  const retry = await saveTripRecoveryToEasyT(trip, recovery.handle, request);
  assert.equal(inserts, 1);
  assert.deepEqual(retry, first);
  assert.deepEqual(stored, first);
  assert.equal(tripBuildDocumentsCanonicalEquivalent(trip, first, "owner-a"), true);
});

test("pure imported projection creates 21 stable dated days with final Manila departure-day ownership", () => {
  const input = { tripId: trip.id, startDate: trip.startDate!, endDate: trip.endDate!, stops: trip.stops, activities: [] };
  const first = buildImportedDatedDays(input);
  const second = buildImportedDatedDays(input);
  assert.equal(first.planItems.length, 21);
  assert.deepEqual(first.planItems.map((item) => item.date), Array.from({ length: 21 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 11, 11 + index));
    return date.toISOString().slice(0, 10);
  }));
  assert.deepEqual(first.planItems.map((item) => item.dayNumber), Array.from({ length: 21 }, (_, index) => index + 1));
  assert.deepEqual(first.planItems.map((item) => item.stopId), [
    ...Array(2).fill(trip.stops[0].id), ...Array(5).fill(trip.stops[1].id),
    ...Array(4).fill(trip.stops[2].id), ...Array(5).fill(trip.stops[3].id),
    ...Array(3).fill(trip.stops[4].id), ...Array(2).fill(trip.stops[5].id),
  ]);
  assert.equal(first.planItems[20].date, "2026-12-31");
  assert.equal(first.planItems[20].stopId, trip.stops[5].id);
  assert.ok(first.planItems.every((item) => item.type === "open" && item.notes.length === 0));
  assert.deepEqual(first, second);
});

test("shared route label hides only equivalent origin and first stop", () => {
  assert.equal(tripRouteDisplayLabel(trip), "Manila → El Nido → Bohol → Siquijor → Cebu City → Manila");
  assert.equal(trip.stops.length, 6);
  assert.notEqual(trip.stops[0].id, trip.stops[5].id);
  const distinctOrigin = { ...trip, brief: { ...trip.brief, originCanonicalPlaceId: "place:other-manila", originCoordinates: [121.5, 14.6] as [number, number] } };
  assert.equal(tripRouteDisplayLabel(distinctOrigin), "Manila → Manila → El Nido → Bohol → Siquijor → Cebu City → Manila");
  const adjacentRepeat = { ...trip, stops: [trip.stops[0], { ...trip.stops[0], id: "adjacent-repeat", order: 0.5 }, ...trip.stops.slice(1)] };
  assert.equal(tripRouteDisplayLabel(adjacentRepeat), "Manila → Manila → El Nido → Bohol → Siquijor → Cebu City → Manila");
});

test("Overview route projection keeps overnight occurrences while hiding only an equivalent origin", () => {
  const canonicalBefore = structuredClone(trip);
  assert.deepEqual(tripRouteDisplayEndpoints(trip).map((endpoint) => endpoint.name), ["Manila", "El Nido", "Bohol", "Siquijor", "Cebu City", "Manila"]);
  assert.deepEqual(tripRouteDisplayEndpoints(trip).filter((endpoint) => endpoint.kind === "stop").map((endpoint) => endpoint.id), trip.stops.map((stop) => stop.id));
  assert.equal(tripRouteDisplayEndpoints(trip)[0]?.id, trip.stops[0]?.id);
  const otherManila = { ...trip, brief: { ...trip.brief, originCanonicalPlaceId: "place:other-manila", originCoordinates: [121.5, 14.6] as [number, number] } };
  assert.equal(tripRouteDisplayEndpoints(otherManila).length, 7);
  assert.equal(tripRouteDisplayEndpoints(otherManila)[0]?.kind, "origin");
  assert.deepEqual(trip, canonicalBefore);
});

test("hydrated import enters existing calendar, Explore, route and image projections", () => {
  const hydrated = { ...trip, planItems: buildImportedDatedDays({ tripId: trip.id, startDate: trip.startDate!, endDate: trip.endDate!, stops: trip.stops, activities: [] }).planItems };
  const calendar = itineraryCalendarDays(hydrated);
  assert.equal(calendar.length, 21);
  assert.equal(calendar[20].stop?.id, hydrated.stops[5].id);
  assert.equal(calendar.filter((day) => day.items.some((item) => item.kind === "activity")).length, 0);
  assert.equal(itineraryCalendarWeeks(hydrated).flatMap(itineraryCalendarNightBands).reduce((total, band) => total + band.span, 0), 20);
  const destinations = exploreDestinationOptions(hydrated);
  assert.deepEqual(destinations.map((option) => option.id), hydrated.stops.map((stop) => stop.id));
  const request = JSON.parse(exploreDiscoveryRequestKey(hydrated));
  assert.deepEqual(request.stops.map((stop: { id: string }) => stop.id), hydrated.stops.map((stop) => stop.id));
  assert.equal(personalRoutePresentation(hydrated).stops.length, 6);
  assert.equal(overviewStopImage(hydrated, hydrated.stops[0])?.src, overviewStopImage(trip, trip.stops[0])?.src);
});

test("21 structural import days do not claim a fully planned itinerary", () => {
  const hydrated = { ...trip, planItems: buildImportedDatedDays({ tripId: trip.id, startDate: trip.startDate!, endDate: trip.endDate!, stops: trip.stops, activities: [] }).planItems };
  const itinerary = tripReadinessSummary(hydrated).signals.find((signal) => signal.id === "itinerary")!;
  assert.equal(itinerary.complete, false);
  assert.match(itinerary.label, /outline|activities|time free/i);
  assert.match(deriveItineraryCoverage(hydrated).label, /outline/i);
  const overview = deriveOverviewReadinessCategories({ trip: hydrated, prepTasks: [], providerStatus: "unavailable" }).find((item) => item.id === "itinerary")!;
  assert.equal(overview.status, "in-progress");
});

test("eligible legacy spreadsheet import repairs once without changing identity or notes", () => {
  const old = {
    ...trip, ownerId: "owner-a", planItems: [],
    legs: trip.legs.map((leg) => ({ ...leg, mode: "road" as const, durationMinutes: 165, provider: "Planning estimate", provenance: "planning_estimate" as const, routeMetadata: { source: "morrovia-planner", planningEstimate: true } })),
  };
  const repaired = repairEligibleSpreadsheetV1Trip(old);
  assert.equal(repaired.id, old.id);
  assert.equal(repaired.ownerId, old.ownerId);
  assert.deepEqual(repaired.stops, old.stops);
  assert.deepEqual(repaired.brief.dayNotes, old.brief.dayNotes);
  assert.deepEqual(repaired.brief.bookings, old.brief.bookings);
  assert.equal(repaired.planItems.length, 21);
  assert.equal(repaired.planItems[20].stopId, old.stops[5].id);
  assert.ok(repaired.legs.every((leg) => leg.mode === "unknown" && leg.durationMinutes === null));
  assert.equal(repairEligibleSpreadsheetV1Trip(repaired), repaired);
});

test("legacy repair refuses partial, authored, ambiguous or confirmed state", () => {
  const old = { ...trip, planItems: [] };
  const noMarker = { ...old, brief: { ...old.brief, capturedIntent: undefined } };
  const partial = { ...old, planItems: [trip.planItems[0]] };
  const authored = { ...old, brief: { ...old.brief, customActivities: { 2: ["Traveller dinner"] } } };
  const scheduled = { ...old, brief: { ...old.brief, itineraryIdeas: [{ id: "saved-idea", stopId: old.stops[0].id, placeId: "place", title: "Market", category: "activity" as const, source: "personalised-recommendation" as const, reasons: [], dayId: "old-day" }] } };
  const ambiguous = { ...old, stops: old.stops.map((stop, index) => index === 1 ? { ...stop, arrivalDate: "2026-12-14" } : stop) };
  const confirmed = { ...old, legs: old.legs.map((leg, index) => index === 0 ? { ...leg, mode: "road" as const, routeMetadata: { source: "morrovia-planner", planningEstimate: true, userConfirmed: true } } : leg) };
  const booked = { ...old, brief: { ...old.brief, bookings: [{ id: "ticket", type: "transport" as const, title: "Booked crossing", date: "2026-12-13", endDate: null, confirmation: "ABC", url: null, location: null, notes: [] }] } };
  const duplicateOccurrence = { ...old, stops: old.stops.map((stop, index) => index === 5 ? { ...stop, id: old.stops[0].id } : stop) };
  for (const candidate of [noMarker, partial, authored, scheduled, ambiguous, confirmed, booked, duplicateOccurrence]) {
    assert.equal(repairEligibleSpreadsheetV1Trip(candidate), candidate);
  }
});

test("legacy repair waits for exact owner, classified recovery and quiet save state", () => {
  const context = { tripId: trip.id, ownerId: "owner-a", updatedAt: trip.updatedAt, sessionOwnerId: "owner-a", sessionPending: false, ownerBoundary: "current", recoveryClassifiedFor: `${trip.id}:owner-a:${trip.updatedAt}`, hasPendingSaves: false, historicalRecovery: false, saveState: "idle", visibleDeviceRecovery: false } as const;
  assert.equal(importedLegacyRepairContextAllows(context), true);
  assert.equal(importedLegacyRepairContextAllows({ ...context, sessionOwnerId: "owner-b" }), false);
  assert.equal(importedLegacyRepairContextAllows({ ...context, sessionPending: true }), false);
  assert.equal(importedLegacyRepairContextAllows({ ...context, ownerBoundary: "mismatch" }), false);
  assert.equal(importedLegacyRepairContextAllows({ ...context, recoveryClassifiedFor: null }), false);
  assert.equal(importedLegacyRepairContextAllows({ ...context, hasPendingSaves: true }), false);
  assert.equal(importedLegacyRepairContextAllows({ ...context, historicalRecovery: true }), false);
  assert.equal(importedLegacyRepairContextAllows({ ...context, visibleDeviceRecovery: true }), false);
  assert.equal(importedLegacyRepairContextAllows({ ...context, saveState: "error" }), false);
});

test("legacy repair acknowledgement resolves only its exact write and keeps a newer device edit", () => {
  const values = new Map<string, string>();
  const storage: EasyTBrowserStorage = {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null,
  };
  const old = { ...trip, ownerId: "owner-a", planItems: [] };
  const repaired = repairEligibleSpreadsheetV1Trip(old);
  const repairWrite = saveTripRecoveryToStorage(storage, repaired, { ownerId: "owner-a", writeId: "repair-1" });
  assert.equal(repairWrite.stored, true);
  const newer = { ...repaired, brief: { ...repaired.brief, customTitle: "My Philippines trip" } };
  const newerWrite = saveTripRecoveryToStorage(storage, newer, { ownerId: "owner-a", writeId: "user-edit-2", replace: repairWrite.handle });
  assert.equal(newerWrite.stored, true);
  const ack = cacheCanonicalTripWithRecoveryToStorage(storage, { ...repaired, updatedAt: "2026-09-30T00:00:00.000Z" }, repairWrite.handle);
  assert.equal(ack.stored, true);
  assert.equal(loadTripRecoveryFromStorage(storage, old.id, "owner-a")?.writeId, newerWrite.handle.writeId);
  assert.equal(loadTripRecoveryFromStorage(storage, old.id, "owner-a")?.trip.brief.customTitle, "My Philippines trip");
});
