import assert from "node:assert/strict";
import test from "node:test";

import { mapPlanAgendaForDay, mapPlanDaysForStop } from "../lib/easyt/map-plan-agenda.ts";
import type { EasyTTrip, PlanItem } from "../lib/easyt/trip.ts";

const day = (id: string, stopId: string, dayNumber: number, date: string, notes: string[], noteDayParts?: PlanItem["noteDayParts"]): PlanItem => ({
  id, stopId, dayNumber, date, type: dayNumber === 3 ? "transport" : "activity",
  title: dayNumber === 3 ? "Train to Kyoto" : `Day ${dayNumber}`,
  reason: "Keep the day coherent.", notes, noteDayParts,
  startsAt: dayNumber === 3 ? "08:15" : null, endsAt: null, bookingUrl: null,
  latitude: null, longitude: null,
});

function tripFixture(): EasyTTrip {
  return {
    schemaVersion: 1, id: "map-plan", ownerId: null, title: "Tokyo and Kyoto", status: "draft",
    startDate: "2026-10-01", endDate: "2026-10-04", travellers: 2, currency: "GBP",
    brief: {
      origin: "Tokyo", mustDo: "Kyoto temples", pace: "slow", hotelChanges: "few", budgetBand: "mid",
      selectedPlaces: {}, bookings: [],
      itineraryIdeas: [{
        id: "gion-walk", stopId: "kyoto-a", placeId: "gion", title: "Gion lantern walk", category: "activity",
        coordinates: [135.775, 35.003], area: "Gion", placeType: "Neighbourhood", source: "destination-highlight",
        reasons: ["destination-significance"], dayId: "kyoto-a-3", dayPart: "afternoon",
      }],
    },
    stops: [
      { id: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 },
      { id: "kyoto-a", order: 1, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-03", departureDate: "2026-10-04", nights: 1 },
      { id: "kyoto-return", order: 2, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2026-10-05", departureDate: "2026-10-06", nights: 1 },
    ],
    legs: [{
      id: "tokyo-kyoto", fromStopId: "tokyo", toStopId: "kyoto-a", mode: "train", distanceKm: 450,
      durationMinutes: 190, doorToDoorMinutes: 240, provider: "Long generated planning estimate that should not be a row",
      routeMetadata: { planningEstimate: true }, classification: "intercity", provenance: "planning_estimate",
      confidence: "medium", scheduleNeedsChecking: true,
    }],
    planItems: [
      day("tokyo-1", "tokyo", 1, "2026-10-01", []),
      day("tokyo-2", "tokyo", 2, "2026-10-02", []),
      day("kyoto-a-3", "kyoto-a", 3, "2026-10-03", ["Tokyo → Kyoto", "Morrovia planning estimate: allow about four hours door to door; compare current rail timetables before booking."], [null, null]),
      day("kyoto-a-4", "kyoto-a", 4, "2026-10-04", ["Nishiki Market"], [null]),
      day("kyoto-return-5", "kyoto-return", 5, "2026-10-05", []),
    ],
    recommendations: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

test("multi-day navigation is stop-local and repeat stops retain distinct identity", () => {
  const trip = tripFixture();
  assert.deepEqual(mapPlanDaysForStop(trip, "kyoto-a").map((item) => item.id), ["kyoto-a-3", "kyoto-a-4"]);
  assert.deepEqual(mapPlanDaysForStop(trip, "kyoto-return").map((item) => item.id), ["kyoto-return-5"]);
});

test("agenda projects a compact transfer and removes duplicated planning prose", () => {
  const agenda = mapPlanAgendaForDay(tripFixture(), "kyoto-a-3");
  assert.ok(agenda);
  const transfer = agenda.items.find((item) => item.kind === "transfer");
  assert.deepEqual(transfer, {
    id: "tokyo-kyoto", kind: "transfer", title: "Tokyo → Kyoto", scheduleLabel: "08:15",
    metadata: "4h", detail: "Planning estimate · check current schedules", mapSelectionId: null, transferMode: "train",
  });
  assert.equal(agenda.items.some((item) => item.title.includes("compare current rail")), false);
});

test("explicit schedule intent and trustworthy map identity survive without fabricated times", () => {
  const agenda = mapPlanAgendaForDay(tripFixture(), "kyoto-a-3");
  const activity = agenda?.items.find((item) => item.id === "gion-walk");
  assert.equal(activity?.scheduleLabel, "Afternoon");
  assert.equal(activity?.mapSelectionId, "idea:gion-walk");
  assert.equal(activity?.metadata, "Gion");
});

test("unslotted rows remain untimed and suppress a misleading free-time action", () => {
  const agenda = mapPlanAgendaForDay(tripFixture(), "kyoto-a-4");
  assert.equal(agenda?.items.find((item) => item.title === "Nishiki Market")?.scheduleLabel, null);
  assert.equal(agenda?.freeTime, null);
});

test("a genuinely open period creates one bounded nearby action", () => {
  const trip = tripFixture();
  const open = { ...trip, planItems: trip.planItems.map((item) => item.id === "tokyo-2" ? { ...item, notes: [] } : item) };
  assert.equal(mapPlanAgendaForDay(open, "tokyo-2")?.freeTime, "afternoon");
});
