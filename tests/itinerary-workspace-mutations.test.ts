import assert from "node:assert/strict";
import test from "node:test";

import {
  addItineraryDayNote,
  assignItineraryActivityDayPart,
  insertItineraryActivity,
  itineraryActivityProtection,
  moveItineraryActivity,
  removeItineraryActivity,
  renameItineraryActivity,
  selectedItineraryDayNumber,
} from "../lib/easyt/itinerary-mutations.ts";
import { createTripMutationPersistenceQueue } from "../lib/easyt/trip-mutation-persistence.ts";
import {
  loadLocalTripFromStorage,
  saveTripRecoveryToEasyT,
  saveTripRecoveryToStorage,
  type EasyTBrowserStorage,
  type TripRecoveryHandle,
} from "../lib/easyt/storage.ts";
import { EasyTTripSaveConflictError } from "../lib/easyt/trip-continuity.ts";
import type { EasyTTrip, PlanItem } from "../lib/easyt/trip.ts";

class MemoryStorage implements EasyTBrowserStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function day(dayNumber: number, notes: string[]): PlanItem {
  return {
    id: `day-${dayNumber}`,
    stopId: dayNumber === 1 ? "rome" : "athens",
    dayNumber,
    date: `2026-08-${String(26 + dayNumber).padStart(2, "0")}`,
    type: "activity",
    title: dayNumber === 1 ? "Rome" : "Athens",
    reason: "Keep the day coherent.",
    notes,
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    latitude: null,
    longitude: null,
  };
}

function itineraryTrip(overrides: Partial<EasyTTrip> = {}): EasyTTrip {
  return {
    schemaVersion: 1,
    id: "trip-itinerary-mutations",
    ownerId: "owner-a",
    title: "Rome and Athens",
    status: "planned",
    startDate: "2026-08-27",
    endDate: "2026-08-28",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      mustDo: "Colosseum",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      customActivities: { 1: ["Evening passeggiata"] },
      dayNotes: {},
      mapPins: [],
      bookings: [],
    },
    stops: [
      { id: "rome", order: 0, name: "Rome", country: "Italy", latitude: 41.9028, longitude: 12.4964, arrivalDate: "2026-08-27", departureDate: "2026-08-28", nights: 1 },
      { id: "athens", order: 1, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2026-08-28", departureDate: "2026-08-29", nights: 1 },
    ],
    legs: [],
    planItems: [day(1, ["Colosseum", "Evening passeggiata"]), day(2, ["Acropolis"])],
    recommendations: [],
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "revision-1",
    ...overrides,
  };
}

function handle(writeId: string): TripRecoveryHandle {
  return { ownerId: "owner-a", tripId: "trip-itinerary-mutations", writeId };
}

test("Itinerary adds an activity at the requested canonical position and adds a day note without inventing time", () => {
  const base = itineraryTrip();
  const activity = insertItineraryActivity(base, 1, 1, "Lunch in Monti");
  assert.equal(activity.changed, true);
  assert.deepEqual(activity.trip.planItems[0]?.notes, ["Colosseum", "Lunch in Monti", "Evening passeggiata"]);
  assert.deepEqual(activity.trip.brief.customActivities?.[1], ["Evening passeggiata", "Lunch in Monti"]);
  assert.equal(activity.trip.planItems[0]?.startsAt, null);
  assert.equal(base.planItems[0]?.notes.includes("Lunch in Monti"), false, "the canonical input is immutable");

  const note = addItineraryDayNote(activity.trip, 1, "Book timed entry");
  assert.deepEqual(note.trip.brief.dayNotes?.[1], ["Book timed entry"]);
});

test("Itinerary edits, reorders, and removes only unambiguous authored activities", () => {
  const base = itineraryTrip();
  const renamed = renameItineraryActivity(base, { dayNumber: 1, noteIndex: 1, title: "Evening passeggiata" }, "Dinner in Trastevere");
  assert.equal(renamed.changed, true);
  assert.deepEqual(renamed.trip.brief.customActivities?.[1], ["Dinner in Trastevere"]);
  assert.deepEqual(renamed.trip.planItems[0]?.notes, ["Colosseum", "Dinner in Trastevere"]);

  const moved = moveItineraryActivity(renamed.trip, { dayNumber: 1, noteIndex: 1, title: "Dinner in Trastevere" }, 0);
  assert.deepEqual(moved.trip.planItems[0]?.notes, ["Dinner in Trastevere", "Colosseum"]);

  const removed = removeItineraryActivity(moved.trip, { dayNumber: 1, noteIndex: 0, title: "Dinner in Trastevere" });
  assert.equal(removed.changed, true);
  assert.deepEqual(removed.trip.planItems[0]?.notes, ["Colosseum"]);
  assert.deepEqual(removed.trip.brief.customActivities?.[1], []);
});

test("explicit dayparts stay aligned through add, reorder, remove, and recovery reload", () => {
  const storage = new MemoryStorage();
  const base = itineraryTrip();
  const added = insertItineraryActivity(base, 1, 1, "Lunch in Monti", "midday");
  assert.equal(added.trip.planItems[0]?.noteDayParts?.[1], "midday");

  const evening = assignItineraryActivityDayPart(added.trip, {
    dayNumber: 1,
    noteIndex: 2,
    title: "Evening passeggiata",
  }, "evening");
  const moved = moveItineraryActivity(evening.trip, {
    dayNumber: 1,
    noteIndex: 1,
    title: "Lunch in Monti",
  }, 3);
  assert.deepEqual(moved.trip.planItems[0]?.notes, ["Colosseum", "Evening passeggiata", "Lunch in Monti"]);
  assert.deepEqual(moved.trip.planItems[0]?.noteDayParts, [null, "evening", "midday"]);

  const stored = saveTripRecoveryToStorage(storage, moved.trip, { ownerId: "owner-a", writeId: "dayparts" });
  assert.equal(stored.stored, true);
  const reloaded = loadLocalTripFromStorage(storage, base.id, "owner-a")!;
  assert.deepEqual(reloaded.planItems[0]?.noteDayParts, [null, "evening", "midday"]);

  const removed = removeItineraryActivity(reloaded, { dayNumber: 1, noteIndex: 2, title: "Lunch in Monti" });
  assert.deepEqual(removed.trip.planItems[0]?.noteDayParts, [null, "evening"]);
});

test("booking, mapped-place, generated, duplicate, and stale-location rows remain protected", () => {
  const base = itineraryTrip();
  assert.equal(itineraryActivityProtection(base, { dayNumber: 1, noteIndex: 0 }).reason, "generated");

  const booked = itineraryTrip({ brief: { ...base.brief, bookings: [{ id: "dinner", type: "reservation", title: "Evening passeggiata", date: "2026-08-27", confirmation: null, url: null }] } });
  assert.equal(itineraryActivityProtection(booked, { dayNumber: 1, noteIndex: 1 }).reason, "booking");
  assert.deepEqual(removeItineraryActivity(booked, { dayNumber: 1, noteIndex: 1 }).trip, booked);

  const mapped = itineraryTrip({ brief: { ...base.brief, mapPins: [{ id: "walk", title: "Evening passeggiata", category: "activity", dayNumber: 1, latitude: 41.9, longitude: 12.49 }] } });
  assert.equal(itineraryActivityProtection(mapped, { dayNumber: 1, noteIndex: 1 }).reason, "mapped-place");

  const duplicate = itineraryTrip({
    brief: { ...base.brief, customActivities: { 1: ["Evening passeggiata", "Evening passeggiata"] } },
    planItems: [day(1, ["Evening passeggiata", "Evening passeggiata"]), day(2, ["Acropolis"])],
  });
  assert.equal(itineraryActivityProtection(duplicate, { dayNumber: 1, noteIndex: 0 }).reason, "ambiguous");
  assert.equal(itineraryActivityProtection(base, { dayNumber: 1, noteIndex: 1, title: "A stale title" }).reason, "missing");
});

test("add/remove survives navigation and reload through the canonical recovery document while selection stays valid", () => {
  const storage = new MemoryStorage();
  const base = itineraryTrip();
  const added = insertItineraryActivity(base, 2, 1, "Anafiotika walk").trip;
  const stored = saveTripRecoveryToStorage(storage, added, { ownerId: "owner-a", writeId: "add-write" });
  assert.equal(stored.stored, true);

  const afterNavigation = loadLocalTripFromStorage(storage, base.id, "owner-a");
  assert.deepEqual(afterNavigation?.planItems[1]?.notes, ["Acropolis", "Anafiotika walk"]);
  assert.equal(selectedItineraryDayNumber(afterNavigation!, 2), 2);

  const removed = removeItineraryActivity(afterNavigation!, { dayNumber: 2, noteIndex: 1, title: "Anafiotika walk" }).trip;
  assert.equal(saveTripRecoveryToStorage(storage, removed, { ownerId: "owner-a", replace: stored.handle, writeId: "remove-write" }).stored, true);
  const afterReload = loadLocalTripFromStorage(storage, base.id, "owner-a");
  assert.deepEqual(afterReload?.planItems[1]?.notes, ["Acropolis"]);
  assert.equal(selectedItineraryDayNumber(afterReload!, 2), 2);
});

test("a failed account mutation leaves the canonical account trip unchanged", async () => {
  const canonical = itineraryTrip();
  const edited = insertItineraryActivity(canonical, 1, 1, "Lunch in Monti").trip;
  const queue = createTripMutationPersistenceQueue(async () => { throw new Error("network unavailable"); });
  queue.reset(canonical);
  await assert.rejects(() => queue.enqueue(edited, handle("failed-write")), /network unavailable/);
  assert.deepEqual(canonical.planItems[0]?.notes, ["Colosseum", "Evening passeggiata"]);
  assert.equal(canonical.updatedAt, "revision-1");
});

test("Itinerary keeps stale revisions fail-closed through the shared CAS path", async () => {
  const base = itineraryTrip();
  let canonical = base;
  let revision = 1;
  const request: typeof fetch = async (_input, init) => {
    const submitted = JSON.parse(String(init?.body)) as EasyTTrip;
    if (submitted.updatedAt !== canonical.updatedAt) {
      return new Response(JSON.stringify({ error: "changed", category: "conflict", trip: canonical, conflictReason: "cloud-changed" }), { status: 409, headers: { "content-type": "application/json" } });
    }
    revision += 1;
    canonical = { ...submitted, updatedAt: `revision-${revision}` };
    return new Response(JSON.stringify({ trip: canonical }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const firstTab = createTripMutationPersistenceQueue((trip, recovery) => saveTripRecoveryToEasyT(trip, recovery, request));
  const staleTab = createTripMutationPersistenceQueue((trip, recovery) => saveTripRecoveryToEasyT(trip, recovery, request));
  firstTab.reset(base);
  staleTab.reset(base);

  await firstTab.enqueue(insertItineraryActivity(base, 1, 1, "Lunch in Monti").trip, handle("tab-a"));
  await assert.rejects(
    () => staleTab.enqueue(insertItineraryActivity(base, 1, 1, "Vatican Museums").trip, handle("tab-b")),
    (error: unknown) => error instanceof EasyTTripSaveConflictError && error.reason === "cloud-changed",
  );
  assert.equal(canonical.planItems[0]?.notes.includes("Lunch in Monti"), true);
  assert.equal(canonical.planItems[0]?.notes.includes("Vatican Museums"), false);
});

test("multiple rapid Itinerary edits serialize and retain both authored changes", async () => {
  const base = itineraryTrip();
  const first = insertItineraryActivity(base, 1, 1, "Lunch in Monti").trip;
  const second = insertItineraryActivity(first, 1, 2, "Vatican Museums").trip;
  let releaseFirst: ((trip: EasyTTrip) => void) | undefined;
  const firstResponse = new Promise<EasyTTrip>((resolve) => { releaseFirst = resolve; });
  const submissions: EasyTTrip[] = [];
  const queue = createTripMutationPersistenceQueue(async (trip) => {
    submissions.push(structuredClone(trip));
    if (submissions.length === 1) return firstResponse;
    return { ...trip, updatedAt: "revision-3" };
  });
  queue.reset(base);
  const firstSave = queue.enqueue(first, handle("rapid-1"));
  const secondSave = queue.enqueue(second, handle("rapid-2"));
  await Promise.resolve();
  assert.equal(submissions.length, 1);
  releaseFirst?.({ ...first, updatedAt: "revision-2" });
  await firstSave;
  const saved = await secondSave;
  assert.equal(submissions[1]?.updatedAt, "revision-2");
  assert.equal(saved.planItems[0]?.notes.includes("Lunch in Monti"), true);
  assert.equal(saved.planItems[0]?.notes.includes("Vatican Museums"), true);
});
