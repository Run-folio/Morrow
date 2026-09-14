import assert from "node:assert/strict";
import test from "node:test";

import { itineraryIdeaForActivityInventory } from "../lib/easyt/activity-inventory.ts";
import { composeItineraryDay } from "../lib/easyt/itinerary-day-composition.ts";
import { removeItineraryIdea, scheduleItineraryIdea } from "../lib/easyt/itinerary-ideas.ts";
import {
  activityDayPartFit,
  activityDurationLabel,
  activityStartTimeLabel,
  isFullDayActivity,
  itineraryScheduleWarnings,
} from "../lib/easyt/itinerary-schedule-awareness.ts";
import type { EasyTTrip, ItineraryIdea } from "../lib/easyt/trip.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";

function providerIdea(id: string, title: string, duration?: { fixedMinutes?: number; fromMinutes?: number; toMinutes?: number }): ItineraryIdea {
  return itineraryIdeaForActivityInventory("tokyo", {
    provider: "viator",
    source: "viator",
    providerProductId: id,
    title,
    destination: { canonicalPlaceId: "place:tokyo", label: "Tokyo" },
    ...(duration ? { duration } : {}),
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-09-13T12:00:00.000Z" },
  });
}

function scheduled(ideas: ItineraryIdea[]) {
  let trip = tripCopilotFixture();
  trip = { ...trip, planItems: trip.planItems.map((day) => day.id === "japan-day-2" ? { ...day, notes: [] } : day) };
  for (const idea of ideas) trip = scheduleItineraryIdea(trip, idea, "japan-day-2", "afternoon");
  return composeItineraryDay(trip, "japan-day-2")!;
}

test("provider duration stays truthful across fixed, range, one-sided and unknown evidence", () => {
  assert.equal(activityDurationLabel({ fixedMinutes: 600 }), "10h");
  assert.equal(activityDurationLabel({ fromMinutes: 480, toMinutes: 600 }), "8h–10h");
  assert.equal(activityDurationLabel({ fromMinutes: 480 }), "From 8h");
  assert.equal(activityDurationLabel(undefined), null);
  assert.equal(activityDurationLabel({ fromMinutes: 600, toMinutes: 480 }), null);
  assert.equal(isFullDayActivity({ fixedMinutes: 600 }), true);
  assert.equal(isFullDayActivity({ fromMinutes: 480, toMinutes: 600 }), true);
  assert.equal(isFullDayActivity({ fromMinutes: 360, toMinutes: 480 }), false, "a broad range is not converted into an invented midpoint");
  assert.equal(activityStartTimeLabel("08:30"), "08:30");
  assert.equal(activityStartTimeLabel("morning"), null);
});

test("broad day-part fit distinguishes short, medium, full-day and unknown duration evidence", () => {
  assert.equal(activityDayPartFit({ fixedMinutes: 120 }), "slot");
  assert.equal(activityDayPartFit({ fromMinutes: 240, toMinutes: 300 }), "slot");
  assert.equal(activityDayPartFit({ fixedMinutes: 360 }), "extended");
  assert.equal(activityDayPartFit({ fixedMinutes: 660 }), "full-day");
  assert.equal(activityDayPartFit({ fromMinutes: 480, toMinutes: 720 }), "full-day");
  assert.equal(activityDayPartFit(undefined), "unknown");
  assert.equal(activityDayPartFit({ toMinutes: 720 }), "unknown", "an unknown minimum is not fabricated into a precise fit");
});

test("exact overlap warns only when canonical start and fixed duration are both known", () => {
  const museum = { ...providerIdea("museum", "Museum", { fixedMinutes: 120 }), startsAt: "14:00" };
  const coffee = { ...providerIdea("coffee", "Coffee", { fixedMinutes: 60 }), startsAt: "15:00" };
  const overlap = itineraryScheduleWarnings(scheduled([museum, coffee]));
  assert.equal(overlap.some((warning) => warning.kind === "exact-overlap"), true);

  const laterCoffee = { ...coffee, startsAt: "16:00" };
  const nonOverlap = itineraryScheduleWarnings(scheduled([museum, laterCoffee]));
  assert.equal(nonOverlap.some((warning) => warning.kind === "exact-overlap"), false);

  const unknown = itineraryScheduleWarnings(scheduled([providerIdea("unknown-a", "Untimed A"), providerIdea("unknown-b", "Untimed B")]));
  assert.deepEqual(unknown, []);
});

test("a sourced full-day experience warns beside a substantial plan without blocking scheduling", () => {
  const composition = scheduled([
    providerIdea("full-day", "Long day tour", { fixedMinutes: 600 }),
    providerIdea("museum", "Museum visit", { fixedMinutes: 90 }),
  ]);
  assert.equal(composition.planned.afternoon.length, 2, "both activities remain scheduled in the occupied container");
  assert.equal(itineraryScheduleWarnings(composition).some((warning) => warning.kind === "long-duration" && warning.message.includes("10h")), true);
  const cleared = scheduled([providerIdea("full-day", "Long day tour", { fixedMinutes: 600 })]);
  assert.equal(itineraryScheduleWarnings(cleared).some((warning) => warning.kind === "long-duration"), false);
});

test("duration, provenance and optional exact time survive scheduling and JSON persistence", () => {
  const idea = { ...providerIdea("range", "Range tour", { fromMinutes: 480, toMinutes: 600 }), startsAt: "08:30" };
  const trip = scheduleItineraryIdea(tripCopilotFixture(), idea, "japan-day-2", "morning");
  const reloaded = JSON.parse(JSON.stringify(trip)) as EasyTTrip;
  const stored = reloaded.brief.itineraryIdeas?.find((candidate) => candidate.id === idea.id);
  assert.deepEqual(stored?.providerMetadata?.duration, { fromMinutes: 480, toMinutes: 600 });
  assert.equal(stored?.providerMetadata?.provenance.provider, "viator");
  assert.equal(stored?.startsAt, "08:30");
  assert.equal(composeItineraryDay(reloaded, "japan-day-2")?.planned.morning[0]?.startsAt, "08:30");
});

test("adding three activities to one daypart appends deterministically and removing one preserves siblings", () => {
  const ideas = [
    providerIdea("first", "First activity"),
    providerIdea("second", "Second activity"),
    providerIdea("third", "Third activity"),
  ];
  let trip = tripCopilotFixture();
  trip = { ...trip, planItems: trip.planItems.map((day) => day.id === "japan-day-2" ? { ...day, notes: [] } : day) };
  for (const idea of ideas) trip = scheduleItineraryIdea(trip, idea, "japan-day-2", "afternoon");
  const reloaded = JSON.parse(JSON.stringify(trip)) as EasyTTrip;
  assert.deepEqual(composeItineraryDay(reloaded, "japan-day-2")?.planned.afternoon.map((activity) => activity.title), ideas.map((idea) => idea.title));
  const removed = removeItineraryIdea(reloaded, ideas[1]!.id);
  assert.deepEqual(composeItineraryDay(removed, "japan-day-2")?.planned.afternoon.map((activity) => activity.title), ["First activity", "Third activity"]);
});
