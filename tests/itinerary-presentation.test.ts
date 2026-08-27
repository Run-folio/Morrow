import assert from "node:assert/strict";
import test from "node:test";

import { itineraryNotesForDisplay } from "../lib/easyt/itinerary-presentation.ts";
import type { EasyTTrip, PlanItem, TripLeg } from "../lib/easyt/trip.ts";

test("a transfer summary removes only repeated generated route and estimate rows", () => {
  const leg = { fromStopId: "cusco", toStopId: "valley", durationMinutes: 57 } as TripLeg;
  const trip = { stops: [{ id: "cusco", name: "Cusco" }, { id: "valley", name: "Sacred Valley" }] } as Pick<EasyTTrip, "stops">;
  const day = {
    notes: [
      "Cusco → Sacred Valley",
      "Estimated door-to-door: about 0h 57m",
      "Check in, take a short walk nearby and keep dinner easy",
    ],
  } as Pick<PlanItem, "notes">;
  assert.deepEqual(itineraryNotesForDisplay(day, leg, trip), ["Check in, take a short walk nearby and keep dinner easy"]);
});

test("ordinary itinerary notes remain untouched without an incoming leg", () => {
  const notes = ["Keep the afternoon flexible"];
  assert.deepEqual(itineraryNotesForDisplay({ notes }, null, { stops: [] }), notes);
});

test("an unknown canonical leg suppresses a stale generated duration note", () => {
  const leg = {
    fromStopId: "flores",
    toStopId: "san-ignacio",
    durationMinutes: null,
    fromEndpoint: { name: "Flores" },
    toEndpoint: { name: "San Ignacio" },
  } as TripLeg;
  const notes = ["Flores → San Ignacio", "Estimated door-to-door: about 4h 15m", "Check current border details"];
  assert.deepEqual(itineraryNotesForDisplay({ notes }, leg, { stops: [] }), ["Check current border details"]);
});
