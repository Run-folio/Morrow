import assert from "node:assert/strict";
import test from "node:test";

import { createAbortableEffectScope } from "../lib/easyt/abortable-effect.ts";
import {
  insertItineraryActivity,
  itineraryActivityProtection,
  moveItineraryActivity,
  removeItineraryActivity,
  renameItineraryActivity,
  selectedItineraryDayNumber,
} from "../lib/easyt/itinerary-mutations.ts";
import { itineraryDayMapContext, itinerarySuggestionCandidates, type ItineraryDiscoveryPlace } from "../lib/easyt/itinerary-day-context.ts";
import { createTripMutationPersistenceQueue } from "../lib/easyt/trip-mutation-persistence.ts";
import { saveTripRecoveryToEasyT, type TripRecoveryHandle } from "../lib/easyt/storage.ts";
import type { EasyTTrip, PlanItem } from "../lib/easyt/trip.ts";

function planItem(dayNumber: number, stopId: string, overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: `gauntlet-day-${dayNumber}`,
    stopId,
    dayNumber,
    date: `2026-10-${String(dayNumber).padStart(2, "0")}`,
    type: "activity",
    title: `Day ${dayNumber}`,
    reason: "Keep the day coherent.",
    notes: ["Generated anchor"],
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    latitude: null,
    longitude: null,
    image: null,
    ...overrides,
  };
}

function gauntletTrip(): EasyTTrip {
  const longName = "Museo Nacional de Arqueología, Antropología e Historia del Perú with an intentionally long traveller-facing place name";
  const days = Array.from({ length: 24 }, (_, index) => planItem(index + 1, index < 8 ? "rome" : index < 16 ? "athens" : "partial"));
  days[0] = planItem(1, "rome", { title: "Normal Rome day", notes: ["Colosseum", "Sunset walk"] });
  days[1] = planItem(2, "rome", { type: "open", title: "Free day", notes: [] });
  days[2] = planItem(3, "rome", { title: "Dense Rome day", notes: Array.from({ length: 14 }, (_, index) => `Activity ${index + 1}`) });
  days[3] = planItem(4, "athens", { type: "transport", title: "Travel to Athens", notes: ["Allow time for the airport transfer"] });
  days[4] = planItem(5, "athens", { title: "Booked day", notes: ["Booked Acropolis entry"] });
  days[5] = planItem(6, "athens", { type: "stay", title: "Accommodation day", notes: [] });
  days[6] = planItem(7, "partial", { title: "Activities without accommodation", notes: ["Neighbourhood walk"] });
  days[7] = planItem(8, "partial", { type: "open", title: longName, reason: "", notes: ["Details to confirm"], image: null });
  return {
    schemaVersion: 1,
    id: "itinerary-final-gauntlet",
    ownerId: "owner-gauntlet",
    title: "Rome, Athens and a partial stop",
    status: "planned",
    startDate: "2026-10-01",
    endDate: "2026-10-24",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      originCoordinates: [-0.1276, 51.5072],
      mustDo: "Colosseum",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      customActivities: { 1: ["Sunset walk"], 5: ["Booked Acropolis entry"] },
      dayNotes: {},
      mapPins: [{ id: "rome-hotel", title: "Hotel Roma", category: "stay", dayNumber: 1, longitude: 12.49, latitude: 41.9 }],
      bookings: [
        { id: "stay-rome", type: "stay", title: "Hotel Roma", date: "2026-10-01", confirmation: "REAL-REF-1", url: null },
        { id: "acropolis", type: "reservation", title: "Booked Acropolis entry", date: "2026-10-05", confirmation: null, url: null },
        { id: "stay-athens", type: "stay", title: "Athens stay", date: "2026-10-04", confirmation: null, url: null },
      ],
    },
    stops: [
      { id: "rome", order: 0, name: "Rome", country: "Italy", latitude: 41.9028, longitude: 12.4964, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
      { id: "athens", order: 1, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-10-04", departureDate: "2026-10-08", nights: 4 },
      { id: "partial", order: 2, name: "A very long unresolved destination name without mapped coordinates", country: "", latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: null },
    ],
    legs: [
      { id: "rome-athens", fromStopId: "rome", toStopId: "athens", mode: "flight", distanceKm: 1050, durationMinutes: 230, doorToDoorMinutes: 390, provider: "Saved carrier", routeMetadata: {}, classification: "international", provenance: "planning_estimate" },
      { id: "athens-partial", fromStopId: "athens", toStopId: "partial", mode: "unknown", distanceKm: null, durationMinutes: null, provider: null, routeMetadata: {}, classification: "intercity", provenance: "unknown" },
    ],
    planItems: days,
    recommendations: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "revision-1",
  };
}

function handle(writeId: string): TripRecoveryHandle {
  return { ownerId: "owner-gauntlet", tripId: "itinerary-final-gauntlet", writeId };
}

test("gauntlet fixtures preserve normal, travel, empty, dense, locked, stay-only, untimed, partial, long-name, image and coordinate edge cases", () => {
  const trip = gauntletTrip();
  assert.equal(trip.planItems.length, 24);
  assert.equal(trip.planItems[1]?.notes.length, 0);
  assert.equal(trip.planItems[2]?.notes.length, 14);
  assert.equal(trip.planItems[3]?.type, "transport");
  assert.equal(trip.planItems[5]?.type, "stay");
  assert.equal(trip.planItems[6]?.notes.length, 1);
  assert.equal(trip.planItems.every((day) => day.startsAt === null && day.endsAt === null), true);
  assert.equal(trip.planItems[7]?.title.length! > 90, true);
  assert.equal(trip.planItems[7]?.image, null);
  assert.equal(trip.stops[2]?.latitude, null);
  assert.equal(itineraryActivityProtection(trip, { dayNumber: 5, noteIndex: 0 }).reason, "booking");

  for (const day of trip.planItems) {
    const context = itineraryDayMapContext(trip, day, null);
    assert.equal(context.pins.every((pin) => Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)), true);
  }
});

test("the full direct-edit sequence keeps the input canonical document immutable and protected rows intact", () => {
  const canonical = gauntletTrip();
  const emptyAdded = insertItineraryActivity(canonical, 2, 0, "First flexible activity");
  const between = insertItineraryActivity(emptyAdded.trip, 1, 1, "Lunch near the Forum");
  const afterFinal = insertItineraryActivity(between.trip, 1, between.trip.planItems[0]!.notes.length, "After-dinner gelato");
  const renamed = renameItineraryActivity(afterFinal.trip, { dayNumber: 1, noteIndex: 1, title: "Lunch near the Forum" }, "Lunch in Monti");
  const moved = moveItineraryActivity(renamed.trip, { dayNumber: 1, noteIndex: 1, title: "Lunch in Monti" }, 0);
  const newlyAddedIndex = moved.trip.planItems[0]!.notes.indexOf("After-dinner gelato");
  const removedNew = removeItineraryActivity(moved.trip, { dayNumber: 1, noteIndex: newlyAddedIndex, title: "After-dinner gelato" });
  const sunsetIndex = removedNew.trip.planItems[0]!.notes.indexOf("Sunset walk");
  const removedExisting = removeItineraryActivity(removedNew.trip, { dayNumber: 1, noteIndex: sunsetIndex, title: "Sunset walk" });
  const lockedAttempt = removeItineraryActivity(removedExisting.trip, { dayNumber: 5, noteIndex: 0, title: "Booked Acropolis entry" });

  assert.deepEqual(canonical.planItems[1]?.notes, []);
  assert.deepEqual(emptyAdded.trip.planItems[1]?.notes, ["First flexible activity"]);
  assert.equal(lockedAttempt.changed, false);
  assert.equal(lockedAttempt.trip.planItems[4]?.notes.includes("Booked Acropolis entry"), true);
  assert.equal(lockedAttempt.trip.planItems[0]?.notes.includes("Lunch in Monti"), true);
  assert.equal(lockedAttempt.trip.planItems[0]?.notes.includes("After-dinner gelato"), false);
  assert.equal(lockedAttempt.trip.planItems[0]?.notes.includes("Sunset walk"), false);
  assert.equal(selectedItineraryDayNumber(lockedAttempt.trip, 20), 20);
});

test("missing coordinates and a cancelled or failed discovery provider cannot change the canonical trip", () => {
  const canonical = gauntletTrip();
  const partialDay = canonical.planItems[7]!;
  const invalid: ItineraryDiscoveryPlace[] = [{ id: "missing-coordinates", title: "Partial idea", area: "Unknown", type: "Culture", tags: [], description: "Provider returned invalid coordinates", coordinates: [Number.NaN, Number.NaN] }];
  assert.deepEqual(itinerarySuggestionCandidates(canonical, partialDay, invalid), []);

  const scope = createAbortableEffectScope("Itinerary gauntlet provider");
  let committed = false;
  scope.dispose();
  scope.commit(() => { committed = true; });
  assert.equal(committed, false);
  assert.equal(scope.isCancellation(scope.signal.reason), true);
  assert.equal(canonical.planItems[7], partialDay);
});

test("an authenticated canonical save submits the owner revision and accepts only the returned revision", async () => {
  const canonical = gauntletTrip();
  const edited = insertItineraryActivity(canonical, 2, 0, "First flexible activity").trip;
  const submissions: EasyTTrip[] = [];
  const request: typeof fetch = async (_input, init) => {
    const submitted = JSON.parse(String(init?.body)) as EasyTTrip;
    submissions.push(submitted);
    return new Response(JSON.stringify({ trip: { ...submitted, updatedAt: "revision-2" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const queue = createTripMutationPersistenceQueue((trip, recovery) => saveTripRecoveryToEasyT(trip, recovery, request));
  queue.reset(canonical);
  const saved = await queue.enqueue(edited, handle("account-save"));

  assert.equal(submissions.length, 1);
  assert.equal(submissions[0]?.ownerId, "owner-gauntlet");
  assert.equal(submissions[0]?.updatedAt, "revision-1");
  assert.equal(saved.updatedAt, "revision-2");
  assert.equal(saved.planItems[1]?.notes.includes("First flexible activity"), true);
  assert.equal(canonical.planItems[1]?.notes.length, 0);
});
