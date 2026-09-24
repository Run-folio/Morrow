import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accommodationProgress } from "../lib/easyt/accommodation.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const dashboardSource = readFileSync(new URL("../app/journey/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
const cardSource = dashboardSource.split("export function TripCard(")[1];

test("Dashboard cards derive their stay line without evaluating full trip health", () => {
  assert.ok(cardSource, "TripCard must remain the Dashboard card owner");
  assert.match(cardSource, /accommodationProgress\(trip\)/);
  assert.doesNotMatch(cardSource, /tripReadinessSummary\(trip\)/);
  assert.doesNotMatch(dashboardSource, /import\s*\{\s*tripReadinessSummary\s*\}/);
});

test("the card's existing stay count remains available from canonical accommodation facts", () => {
  const trip = {
    schemaVersion: 1, id: "dashboard-stays", ownerId: "owner", title: "Stays", status: "planned",
    startDate: "2026-10-01", endDate: "2026-10-04", travellers: 2, currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, bookings: [{ id: "stay-paris", type: "stay", title: "Paris stay", date: "2026-10-01", confirmation: null, url: null }] },
    stops: [
      { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-03", nights: 2 },
      { id: "brussels", order: 1, name: "Brussels", country: "Belgium", latitude: 50.85, longitude: 4.35, arrivalDate: "2026-10-03", departureDate: "2026-10-04", nights: 1 },
    ], legs: [], planItems: [], recommendations: [], createdAt: "2026-09-01", updatedAt: "2026-09-01",
  } as EasyTTrip;
  const stays = accommodationProgress(trip);
  assert.equal(`${stays.sortedCount} of ${stays.stops.length} stays sorted`, "1 of 2 stays sorted");
});
