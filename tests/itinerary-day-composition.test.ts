import assert from "node:assert/strict";
import test from "node:test";

import { composeItineraryDay, fallbackItineraryDayPart } from "../lib/easyt/itinerary-day-composition.ts";
import { placeItineraryActivity, preferredItineraryDayPart } from "../lib/easyt/itinerary-activity-placement.ts";
import {
  assignItineraryIdeaDayPart,
  itineraryIdeaForPlace,
  reconcileItineraryIdeas,
  scheduleItineraryIdea,
} from "../lib/easyt/itinerary-ideas.ts";
import { assignItineraryActivityDayPart } from "../lib/easyt/itinerary-mutations.ts";
import { reconcileAuthoredDayState } from "../lib/easyt/trip-authored-day-state.ts";
import { canonicalTripForOwner, duplicateTripDocument } from "../lib/easyt/trip-promotion.ts";
import { replanTripAfterDayOrder } from "../lib/easyt/trip-replan.ts";
import { loadLocalTripFromStorage, saveTripRecoveryToStorage, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
import { defaultTripIntent, type EasyTTrip, type PlanItem } from "../lib/easyt/trip.ts";

class MemoryStorage implements EasyTBrowserStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

class FailingStorage implements EasyTBrowserStorage {
  get length() { return 0; }
  getItem() { return null; }
  setItem() { throw new Error("storage unavailable"); }
  removeItem() {}
  key() { return null; }
}

function day(id: string, stopId: string, dayNumber: number, date: string, notes: string[] = []): PlanItem {
  return {
    id, stopId, dayNumber, date, type: dayNumber === 1 || dayNumber === 3 ? "arrival" : "activity",
    title: dayNumber === 3 ? "Travel to Kyoto" : `Day in ${stopId}`,
    reason: "Keep the day coherent.", notes, startsAt: null, endsAt: null,
    bookingUrl: null, latitude: null, longitude: null,
  };
}

function tripFixture(): EasyTTrip {
  const intent = defaultTripIntent({ stopIds: ["tokyo", "kyoto"], durationDays: 4 });
  return {
    schemaVersion: 1,
    id: "rich-days",
    ownerId: null,
    title: "Tokyo and Kyoto",
    status: "draft",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    travellers: 2,
    currency: "GBP",
    brief: {
      origin: "London",
      originCountry: "United Kingdom",
      mustDo: "Kyoto temples",
      pace: "slow",
      hotelChanges: "few",
      budgetBand: "mid",
      selectedPlaces: {},
      bookings: [{ id: "stay-kyoto", type: "stay", title: "Machiya in Gion", date: "2026-10-03", confirmation: "STAY-1", url: null }],
      intent,
    },
    stops: [
      { id: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 },
      { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-03", departureDate: "2026-10-04", nights: 1 },
    ],
    legs: [
      { id: "arrival-tokyo", fromStopId: "rich-days-origin", toStopId: "tokyo", mode: "flight", distanceKm: null, durationMinutes: null, provider: null, routeMetadata: {}, classification: "arrival", provenance: "unknown", confidence: "unknown", scheduleNeedsChecking: true },
      { id: "tokyo-kyoto", fromStopId: "tokyo", toStopId: "kyoto", mode: "train", distanceKm: 450, durationMinutes: 190, doorToDoorMinutes: 240, provider: "Planning estimate", routeMetadata: {}, classification: "intercity", provenance: "planning_estimate", confidence: "medium", scheduleNeedsChecking: true },
      { id: "depart-kyoto", fromStopId: "kyoto", toStopId: "rich-days-origin", mode: "flight", distanceKm: null, durationMinutes: null, provider: null, routeMetadata: {}, classification: "departure", provenance: "unknown", confidence: "unknown", scheduleNeedsChecking: true },
    ],
    planItems: [
      day("tokyo-1", "tokyo", 1, "2026-10-01", ["Keep the arrival day flexible"]),
      day("tokyo-2", "tokyo", 2, "2026-10-02", ["Meiji Shrine"]),
      day("kyoto-3", "kyoto", 3, "2026-10-03", ["Tokyo → Kyoto", "Morrovia planning estimate: about 4h door to door; check current schedules.", "Kiyomizu-dera", "Keep dinner flexible"]),
      day("kyoto-4", "kyoto", 4, "2026-10-04", []),
    ],
    recommendations: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

function place(id: string, title: string) {
  return { id, title, area: "Kyoto", type: "Culture", tags: ["Culture"], description: title, coordinates: [135.77, 35.01] as [number, number] };
}

test("optional canonical dayPart supports every broad period and clear without changing day identity", () => {
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("kiyomizu", "Kiyomizu-dera"), reasons: ["destination-significance"] });
  const unslotted = scheduleItineraryIdea(source, idea, "kyoto-3");
  assert.equal(unslotted.brief.itineraryIdeas?.[0]?.dayPart, null);

  let changed = assignItineraryIdeaDayPart(unslotted, idea.id, "morning");
  assert.equal(changed.brief.itineraryIdeas?.[0]?.dayPart, "morning");
  changed = assignItineraryIdeaDayPart(changed, idea.id, "midday");
  assert.equal(changed.brief.itineraryIdeas?.[0]?.dayPart, "midday");
  changed = assignItineraryIdeaDayPart(changed, idea.id, "afternoon");
  assert.equal(changed.brief.itineraryIdeas?.[0]?.dayPart, "afternoon");
  changed = assignItineraryIdeaDayPart(changed, idea.id, "evening");
  assert.equal(changed.brief.itineraryIdeas?.[0]?.dayPart, "evening");
  changed = assignItineraryIdeaDayPart(changed, idea.id, null);
  assert.equal(changed.brief.itineraryIdeas?.[0]?.dayPart, null);
  assert.equal(changed.brief.itineraryIdeas?.[0]?.dayId, "kyoto-3");
});

test("unscheduled, scheduled-unslotted, and scheduled-slotted remain distinct canonical states", () => {
  const source = tripFixture();
  const savedIdea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("gion", "Gion"), reasons: ["destination-significance"] });
  const unscheduled = { ...source, brief: { ...source.brief, itineraryIdeas: [savedIdea] } };
  assert.equal(unscheduled.brief.itineraryIdeas?.[0]?.dayId, undefined);

  const unslotted = scheduleItineraryIdea(unscheduled, savedIdea, "kyoto-3");
  assert.equal(unslotted.brief.itineraryIdeas?.[0]?.dayId, "kyoto-3");
  assert.equal(unslotted.brief.itineraryIdeas?.[0]?.dayPart, null);

  const slotted = assignItineraryIdeaDayPart(unslotted, savedIdea.id, "evening");
  assert.equal(slotted.brief.itineraryIdeas?.[0]?.dayPart, "evening");
});

test("day composition groups explicit periods and deterministically places legacy rows without an unslotted lane", () => {
  let source = tripFixture();
  for (const [id, title, part] of [
    ["fushimi", "Fushimi Inari", "morning"],
    ["kiyomizu", "Kiyomizu-dera", "afternoon"],
    ["gion", "Dinner in Gion", "evening"],
    ["market", "Nishiki Market", null],
  ] as const) {
    const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place(id, title), reasons: ["destination-significance"] });
    source = scheduleItineraryIdea(source, idea, "kyoto-3", part);
  }

  const composition = composeItineraryDay(source, "kyoto-3");
  assert.ok(composition);
  assert.deepEqual(composition.planned.morning.map((item) => item.title), ["Fushimi Inari"]);
  assert.deepEqual(composition.planned.midday.map((item) => item.title), ["Keep dinner flexible"]);
  assert.deepEqual(composition.planned.afternoon.map((item) => item.title), ["Kiyomizu-dera"]);
  assert.deepEqual(composition.planned.evening.map((item) => item.title), ["Dinner in Gion", "Nishiki Market"]);
  assert.deepEqual(composition.unslotted, []);
  assert.deepEqual(composition.freeDayParts, []);
  assert.equal(composition.planned.midday[0]?.dayPartEditable, false);
  assert.equal(Object.values(composition.planned).flat().filter((item) => item.title === "Kiyomizu-dera").length, 1, "the mapped Phase 1 note is not duplicated");

  const partial = composeItineraryDay(scheduleItineraryIdea(tripFixture(), itineraryIdeaForPlace({ stopId: "kyoto", place: place("gion", "Dinner in Gion"), reasons: ["destination-significance"] }), "kyoto-3", "evening"), "kyoto-3");
  assert.deepEqual(partial?.freeDayParts, ["midday"]);
});

test("legacy fallback is balanced and monotonic for one, two, three, four, and many items", () => {
  assert.deepEqual([fallbackItineraryDayPart(0, 1)], ["morning"]);
  assert.deepEqual(Array.from({ length: 2 }, (_, index) => fallbackItineraryDayPart(index, 2)), ["morning", "evening"]);
  assert.deepEqual(Array.from({ length: 3 }, (_, index) => fallbackItineraryDayPart(index, 3)), ["morning", "afternoon", "evening"]);
  assert.deepEqual(Array.from({ length: 4 }, (_, index) => fallbackItineraryDayPart(index, 4)), ["morning", "midday", "afternoon", "evening"]);
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => fallbackItineraryDayPart(index, 8)), [
    "morning", "morning", "midday", "midday", "afternoon", "afternoon", "evening", "evening",
  ]);
});

test("an unambiguous authored activity can be slotted, moved to midday, and cleared without inventing a time", () => {
  const base = tripFixture();
  const source: EasyTTrip = {
    ...base,
    brief: { ...base.brief, customActivities: { 3: ["Tea in Higashiyama"] } },
    planItems: base.planItems.map((item) => item.id === "kyoto-3"
      ? { ...item, notes: [...item.notes, "Tea in Higashiyama"] }
      : item),
  };
  const location = { dayNumber: 3, noteIndex: source.planItems[2]!.notes.length - 1, title: "Tea in Higashiyama" };

  const midday = assignItineraryActivityDayPart(source, location, "midday");
  assert.equal(midday.changed, true);
  assert.equal(midday.trip.planItems[2]?.noteDayParts?.[location.noteIndex], "midday");
  assert.deepEqual(composeItineraryDay(midday.trip, "kyoto-3")?.planned.midday.map((item) => item.title), ["Tea in Higashiyama"]);

  const cleared = assignItineraryActivityDayPart(midday.trip, location, null);
  assert.equal(cleared.changed, true);
  assert.equal(cleared.trip.planItems[2]?.noteDayParts?.[location.noteIndex], null);
  const clearedComposition = composeItineraryDay(cleared.trip, "kyoto-3");
  assert.equal(clearedComposition?.unslotted.length, 0);
  assert.equal(Object.values(clearedComposition!.planned).flat().some((item) => item.title === "Tea in Higashiyama"), true);
});

test("authored note dayparts survive planner reconciliation on the same canonical stop", () => {
  const base = tripFixture();
  const before: EasyTTrip = {
    ...base,
    brief: { ...base.brief, customActivities: { 3: ["Tea in Higashiyama"] } },
    planItems: base.planItems.map((item) => item.id === "kyoto-3" ? {
      ...item,
      notes: [...item.notes, "Tea in Higashiyama"],
      noteDayParts: [...item.notes.map(() => null), "midday"],
    } : item),
  };
  const regenerated: EasyTTrip = {
    ...base,
    planItems: base.planItems.map((item) => item.id === "kyoto-3" ? { ...item, notes: ["Generated anchor"] } : item),
  };
  const reconciled = reconcileAuthoredDayState(before, regenerated);
  const day = reconciled.planItems.find((item) => item.id === "kyoto-3")!;
  const index = day.notes.indexOf("Tea in Higashiyama");
  assert.equal(index >= 0, true);
  assert.equal(day.noteDayParts?.[index], "midday");
});

test("arrival, departure, unknown timing, and overnight stay context remain truthful with no fake exact times", () => {
  const source = tripFixture();
  const firstArrival = composeItineraryDay(source, "tokyo-1");
  const transferArrival = composeItineraryDay(source, "kyoto-3");
  const finalDeparture = composeItineraryDay(source, "kyoto-4");

  assert.equal(firstArrival?.transfers[0]?.direction, "arriving");
  assert.equal(firstArrival?.transfers[0]?.durationMinutes, null);
  assert.equal(transferArrival?.transfers.some((transfer) => transfer.id === "tokyo-kyoto" && transfer.direction === "arriving"), true);
  assert.equal(transferArrival?.tonight.state, "booked");
  assert.equal(transferArrival?.tonight.booking?.title, "Machiya in Gion");
  assert.equal(finalDeparture?.transfers.some((transfer) => transfer.id === "depart-kyoto" && transfer.direction === "departing"), true);
  assert.equal(finalDeparture?.tonight.state, "no-overnight");
  assert.doesNotMatch(JSON.stringify([firstArrival, transferArrival, finalDeparture]), /\b(?:09:00|13:00|18:00)\b/);
});

test("specific-day period intent survives JSON reload, a day move, stop reorder, and canonical owner promotion", () => {
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("fushimi", "Fushimi Inari"), reasons: ["destination-significance"] });
  const scheduled = scheduleItineraryIdea(source, idea, "kyoto-3", "afternoon");
  const reloaded = JSON.parse(JSON.stringify(scheduled)) as EasyTTrip;
  assert.equal(reloaded.brief.itineraryIdeas?.[0]?.dayPart, "afternoon");

  const movedDay = scheduleItineraryIdea(reloaded, idea, "kyoto-4");
  assert.equal(movedDay.brief.itineraryIdeas?.[0]?.dayPart, "afternoon");
  assert.equal(movedDay.brief.itineraryIdeas?.[0]?.dayId, "kyoto-4");

  const replanned = replanTripAfterDayOrder(scheduled, [scheduled.planItems[2]!, scheduled.planItems[3]!, scheduled.planItems[0]!, scheduled.planItems[1]!]);
  assert.equal(replanned.state, "recalculated");
  if (replanned.state === "recalculated") {
    assert.equal(replanned.trip.brief.itineraryIdeas?.[0]?.dayPart, "afternoon");
    assert.equal(replanned.trip.brief.itineraryIdeas?.[0]?.dayId, "kyoto-3");
  }

  const promoted = canonicalTripForOwner("owner-a", scheduled);
  assert.equal(promoted.brief.itineraryIdeas?.[0]?.stopId, `${scheduled.id}-stop-kyoto`);
  assert.equal(promoted.brief.itineraryIdeas?.[0]?.dayPart, "afternoon");
});

test("add to day, assign afternoon, save, and device reload retains the same stable item and period", () => {
  const storage = new MemoryStorage();
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("kiyomizu", "Kiyomizu-dera"), reasons: ["destination-significance"] });
  const afternoon = scheduleItineraryIdea(source, idea, "kyoto-3", "afternoon");
  const stored = saveTripRecoveryToStorage(storage, afternoon, { ownerId: null, writeId: "day-part-write" });
  assert.equal(stored.stored, true);

  const reloaded = loadLocalTripFromStorage(storage, source.id, null);
  const reloadedIdea = reloaded?.brief.itineraryIdeas?.find((candidate) => candidate.id === idea.id);
  assert.equal(reloadedIdea?.dayId, "kyoto-3");
  assert.equal(reloadedIdea?.dayPart, "afternoon");
});

test("night reduction remaps to a surviving same-stop day, fails closed to saved when none survives, and stop removal leaves no orphan", () => {
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("fushimi", "Fushimi Inari"), reasons: ["destination-significance"] });
  const scheduled = scheduleItineraryIdea(source, idea, "kyoto-3", "morning");

  const oneKyotoDay = reconcileAuthoredDayState(scheduled, {
    ...scheduled,
    planItems: scheduled.planItems.filter((item) => item.id !== "kyoto-3"),
  });
  assert.equal(oneKyotoDay.brief.itineraryIdeas?.[0]?.dayId, "kyoto-4");
  assert.equal(oneKyotoDay.brief.itineraryIdeas?.[0]?.dayPart, "morning");

  const noKyotoDay = reconcileAuthoredDayState(scheduled, {
    ...scheduled,
    planItems: scheduled.planItems.filter((item) => item.stopId !== "kyoto"),
  });
  assert.equal(noKyotoDay.brief.itineraryIdeas?.[0]?.dayId, undefined);
  assert.equal(noKyotoDay.brief.itineraryIdeas?.[0]?.dayPart, undefined);

  const removedStop = reconcileItineraryIdeas({
    ...scheduled,
    stops: scheduled.stops.filter((stop) => stop.id !== "kyoto"),
    planItems: scheduled.planItems.filter((item) => item.stopId !== "kyoto"),
  });
  assert.deepEqual(removedStop.brief.itineraryIdeas, []);
});

test("trip duplication remaps the scheduled day identity while preserving dayPart", () => {
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("fushimi", "Fushimi Inari"), reasons: ["destination-significance"] });
  const scheduled = scheduleItineraryIdea(source, idea, "kyoto-3", "morning");
  let sequence = 0;
  const duplicate = duplicateTripDocument(scheduled, {
    id: "rich-days-copy",
    now: "2026-08-31T00:00:00.000Z",
    nextId: () => String(++sequence),
  });

  const copiedIdea = duplicate.brief.itineraryIdeas?.[0];
  assert.equal(copiedIdea?.dayPart, "morning");
  assert.equal(duplicate.planItems.some((item) => item.id === copiedIdea?.dayId), true);
  assert.notEqual(copiedIdea?.dayId, "kyoto-3");
});

test("automatic Add to Day chooses a deterministic suitable available period without inventing a time", () => {
  const source = tripFixture();
  const attraction = itineraryIdeaForPlace({ stopId: "kyoto", place: place("garden", "Shosei-en Garden"), reasons: ["destination-significance"] });
  const food = itineraryIdeaForPlace({ stopId: "kyoto", place: { ...place("market", "Nishiki Market"), type: "Food", tags: ["Food"] }, reasons: ["interest-relevance"] });

  assert.equal(preferredItineraryDayPart(source, "kyoto-4", attraction.category), "morning");
  assert.equal(preferredItineraryDayPart(source, "kyoto-4", food.category), "midday");
  const scheduled = scheduleItineraryIdea(source, attraction, "kyoto-4", preferredItineraryDayPart(source, "kyoto-4", attraction.category));
  assert.equal(scheduled.brief.itineraryIdeas?.find((idea) => idea.id === attraction.id)?.dayPart, "morning");
  assert.equal(composeItineraryDay(scheduled, "kyoto-4")?.planned.morning[0]?.id, attraction.id);
});

test("suggestion metadata and stable identity survive scheduling and JSON reload", () => {
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({
    stopId: "kyoto",
    place: { ...place("cathedral", "Kyoto Cathedral"), image: "/cathedral.jpg", sourceUrl: "https://example.test/cathedral", description: "A compact cultural stop." },
    reasons: ["destination-significance"],
  });
  const scheduled = scheduleItineraryIdea(source, idea, "kyoto-4", "afternoon");
  const reloaded = JSON.parse(JSON.stringify(scheduled)) as EasyTTrip;
  const stored = reloaded.brief.itineraryIdeas?.find((candidate) => candidate.id === idea.id);
  assert.equal(stored?.id, idea.id);
  assert.equal(stored?.image, "/cathedral.jpg");
  assert.equal(stored?.sourceUrl, "https://example.test/cathedral");
  assert.equal(stored?.area, "Kyoto");
  assert.equal(stored?.placeType, "Culture");
  assert.equal(stored?.description, "A compact cultural stop.");
  assert.equal(composeItineraryDay(reloaded, "kyoto-4")?.planned.afternoon[0]?.image, "/cathedral.jpg");
});

test("canonical drag placement reorders within a period and moves between periods without duplication", () => {
  const base = tripFixture();
  const authored: EasyTTrip = {
    ...base,
    brief: { ...base.brief, customActivities: { 4: ["Temple walk", "Tea ceremony"] } },
    planItems: base.planItems.map((item) => item.id === "kyoto-4" ? {
      ...item,
      notes: ["Temple walk", "Tea ceremony"],
      noteDayParts: ["morning", "morning"],
    } : item),
  };
  const initial = composeItineraryDay(authored, "kyoto-4")!;
  const tea = initial.planned.morning.find((activity) => activity.title === "Tea ceremony")!;
  const reordered = placeItineraryActivity(authored, "kyoto-4", tea.id, "morning", 0);
  assert.equal(reordered.changed, true);
  assert.deepEqual(composeItineraryDay(reordered.trip, "kyoto-4")?.planned.morning.map((activity) => activity.title), ["Tea ceremony", "Temple walk"]);

  const moved = placeItineraryActivity(reordered.trip, "kyoto-4", tea.id, "afternoon", 0);
  const composition = composeItineraryDay(moved.trip, "kyoto-4")!;
  assert.equal(moved.changed, true);
  assert.deepEqual(composition.planned.morning.map((activity) => activity.title), ["Temple walk"]);
  assert.deepEqual(composition.planned.afternoon.map((activity) => activity.title), ["Tea ceremony"]);
  assert.equal(Object.values(composition.planned).flat().filter((activity) => activity.id === tea.id).length, 1);

  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("garden", "Murin-an Garden"), reasons: ["destination-significance"] });
  const scheduled = scheduleItineraryIdea(moved.trip, idea, "kyoto-4", "morning");
  const movedIdea = placeItineraryActivity(scheduled, "kyoto-4", idea.id, "evening", 0);
  const withMovedIdea = composeItineraryDay(movedIdea.trip, "kyoto-4")!;
  assert.equal(movedIdea.changed, true);
  assert.equal(withMovedIdea.planned.evening.some((activity) => activity.id === idea.id), true);
  assert.equal(Object.values(withMovedIdea.planned).flat().filter((activity) => activity.id === idea.id).length, 1);
});

test("saved ideas remain unscheduled until the canonical schedule action is used", () => {
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("garden", "Murin-an Garden"), reasons: ["destination-significance"] });
  const saved = { ...source, brief: { ...source.brief, itineraryIdeas: [idea] } };
  assert.equal(saved.brief.itineraryIdeas?.[0]?.dayId, undefined);
  assert.equal(saved.planItems.some((day) => day.notes.includes(idea.title)), false);
  const scheduled = scheduleItineraryIdea(saved, idea, "kyoto-4", "afternoon");
  assert.equal(scheduled.brief.itineraryIdeas?.[0]?.dayId, "kyoto-4");
  assert.equal(scheduled.planItems.find((day) => day.id === "kyoto-4")?.notes.filter((note) => note === idea.title).length, 1);
});

test("a failed durable write leaves the original suggestion and itinerary unchanged", () => {
  const source = tripFixture();
  const idea = itineraryIdeaForPlace({ stopId: "kyoto", place: place("garden", "Murin-an Garden"), reasons: ["destination-significance"] });
  const saved = { ...source, brief: { ...source.brief, itineraryIdeas: [idea] } };
  const scheduled = scheduleItineraryIdea(saved, idea, "kyoto-4", "afternoon");
  const write = saveTripRecoveryToStorage(new FailingStorage(), scheduled, { ownerId: null, writeId: "failed-placement" });
  assert.equal(write.stored, false);
  assert.equal(saved.brief.itineraryIdeas?.[0]?.dayId, undefined);
  assert.equal(saved.planItems.find((day) => day.id === "kyoto-4")?.notes.includes(idea.title), false);
});
