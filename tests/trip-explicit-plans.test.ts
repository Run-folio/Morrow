import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { defaultTripIntent, isEasyTTrip, tripFromBuilder } from "../lib/easyt/trip.ts";
import {
  explicitVisitDayOptions,
  explicitVisitIntentsForTrip,
  fixedCommitmentPlansForTrip,
  removeExplicitVisitIntent,
  removeFixedCommitment,
  scheduleExplicitVisitIntent,
} from "../lib/easyt/trip-explicit-plans.ts";

const stops = [
  { id: "los-angeles", name: "Los Angeles", country: "United States", canonicalPlaceId: "los-angeles", coordinates: [-118.2437, 34.0522] as [number, number] },
  { id: "denver", name: "Denver", country: "United States", canonicalPlaceId: "denver", coordinates: [-104.9903, 39.7392] as [number, number] },
  { id: "mexico-city", name: "Mexico City", country: "Mexico", canonicalPlaceId: "mexico-city", coordinates: [-99.1332, 19.4326] as [number, number] },
  { id: "tulum", name: "Tulum", country: "Mexico", canonicalPlaceId: "tulum", coordinates: [-87.4654, 20.2114] as [number, number] },
  { id: "cancun", name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619] as [number, number] },
];

function regressionTrip() {
  const prompt = "Los angeles denver mexico city tulum and cancun with a visit to chitchen itza";
  const captured = captureJourneyBrief(prompt);
  const commitment = { label: "Oaxaca", date: "2026-09-30", commitmentType: "fixed-date" as const, place: { name: "Oaxaca", canonicalPlaceId: "oaxaca-city", country: "Mexico", coordinates: [-96.7266, 17.0732] as [number, number] } };
  const structuredBrief = mergeStructuredTripBrief(captured.structuredBrief, { fixedCommitments: [commitment] });
  const intent = defaultTripIntent({ travellers: 2, durationDays: 15, stopIds: stops.map((stop) => stop.id) });
  intent.hardConstraints.fixedCommitments = [{ id: "fixed-oaxaca", ...commitment }];
  return tripFromBuilder({
    id: "explicit-plans-regression", origin: "London", originCoordinates: [-0.1276, 51.5072], stops,
    startDate: "2026-09-22", endDate: "2026-10-06", picks: {}, mustDo: prompt, pace: "slow", hotels: "few", budget: "mid",
    nightAllocations: { "los-angeles": 2, denver: 2, "mexico-city": 3, tulum: 3, cancun: 4 },
    draft: Array.from({ length: 15 }, (_, index) => {
      const stop = stops[Math.min(4, Math.floor(index / 3))]!;
      return { number: String(index + 1).padStart(2, "0"), date: new Date(Date.UTC(2026, 8, 22 + index)).toISOString().slice(0, 10), destination: stop.name, title: index % 3 === 0 ? `Arrive in ${stop.name}` : `Explore ${stop.name}`, reason: "Regression fixture", items: [] };
    }), intent, structuredBrief,
  });
}

test("finished trip surfaces the explicit Chichén Itzá visit without making it an overnight base", () => {
  const trip = regressionTrip();
  const visits = explicitVisitIntentsForTrip(trip);
  assert.equal(visits.length, 1);
  assert.equal(visits[0]?.name, "Chichén Itzá");
  assert.deepEqual(visits[0]?.bases.map(({ stop }) => stop.name), ["Tulum", "Cancún"]);
  assert.equal(trip.stops.some((stop) => stop.name === "Chichén Itzá"), false);
  assert.ok(explicitVisitDayOptions(trip, visits[0]!).every(({ day }) => day.stopId === "tulum" || day.stopId === "cancun"));
});

test("requested visit schedules through the canonical itinerary activity representation and survives persistence", () => {
  const trip = regressionTrip();
  const visit = explicitVisitIntentsForTrip(trip)[0]!;
  const day = explicitVisitDayOptions(trip, visit).find(({ protectedDay }) => !protectedDay)!.day;
  const scheduled = scheduleExplicitVisitIntent(trip, visit.mentionId, day.id);
  const idea = scheduled.brief.itineraryIdeas?.find((item) => item.explicitVisitMentionId === visit.mentionId);
  assert.equal(idea?.source, "traveller-visit-intent");
  assert.equal(idea?.dayId, day.id);
  assert.ok(scheduled.planItems.find((item) => item.id === day.id)?.notes.includes("Chichén Itzá"));
  const recovered = JSON.parse(JSON.stringify(scheduled));
  assert.equal(isEasyTTrip(recovered), true);
  assert.equal(explicitVisitIntentsForTrip(recovered)[0]?.scheduledIdea?.dayId, day.id);
  const unrelatedNightEdit = { ...recovered, stops: recovered.stops.map((stop: { id: string; nights: number | null }) => stop.id === "denver" ? { ...stop, nights: (stop.nights ?? 0) + 1 } : stop) };
  assert.equal(explicitVisitIntentsForTrip(unrelatedNightEdit)[0]?.scheduledIdea?.dayId, day.id);
  const routeEdit = { ...recovered, stops: recovered.stops.filter((stop: { id: string }) => stop.id !== "tulum"), planItems: recovered.planItems.filter((item: { stopId: string }) => item.stopId !== "tulum") };
  assert.equal(explicitVisitIntentsForTrip(routeEdit)[0]?.name, "Chichén Itzá");
  assert.deepEqual(explicitVisitIntentsForTrip(routeEdit)[0]?.bases.map(({ stop }) => stop.name), ["Cancún"]);
  assert.equal(fixedCommitmentPlansForTrip(routeEdit)[0]?.displayLabel, "Oaxaca · 30 Sept 2026");
});

test("fixed commitment remains named, protected as intent, and reports its route conflict", () => {
  const trip = regressionTrip();
  const plans = fixedCommitmentPlansForTrip(trip);
  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.state, "needs-route-change");
  assert.match(plans[0]?.message ?? "", /Oaxaca · 30 Sept 2026 doesn’t fit your current route/);
  assert.equal(trip.stops.some((stop) => stop.name === "Oaxaca"), false);
  assert.equal(fixedCommitmentPlansForTrip(JSON.parse(JSON.stringify(trip)))[0]?.displayLabel, "Oaxaca · 30 Sept 2026");
});

test("explicit plans disappear only after deliberate canonical removal", () => {
  const trip = regressionTrip();
  const visit = explicitVisitIntentsForTrip(trip)[0]!;
  const day = explicitVisitDayOptions(trip, visit)[0]!.day;
  const scheduled = scheduleExplicitVisitIntent(trip, visit.mentionId, day.id);
  const withoutVisit = removeExplicitVisitIntent(scheduled, visit.mentionId);
  assert.equal(explicitVisitIntentsForTrip(withoutVisit).length, 0);
  assert.ok(withoutVisit.brief.structuredBrief?.removedPlaceMentionIds?.includes(visit.mentionId));
  assert.equal(withoutVisit.brief.itineraryIdeas?.some((item) => item.explicitVisitMentionId === visit.mentionId), false);
  const commitmentId = fixedCommitmentPlansForTrip(trip)[0]!.commitment.id;
  assert.equal(fixedCommitmentPlansForTrip(removeFixedCommitment(trip, commitmentId)).length, 0);
});

test("overview and itinerary share one explicit-plan component and existing persistence owner", () => {
  const overview = readFileSync(new URL("../components/easyt/trip-overview-workspace.tsx", import.meta.url), "utf8");
  const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/easyt/trip-explicit-plans.tsx", import.meta.url), "utf8");
  assert.match(overview, /<TripExplicitPlans trip=\{trip\} variant="overview"/);
  assert.match(itinerary, /<TripExplicitPlans/);
  assert.match(itinerary, /mutation\.mutateTrip\(\(current\) => scheduleExplicitVisitIntent/);
  assert.match(component, /You asked to visit this/);
  assert.match(component, /Add to day/);
  assert.match(component, /Fixed plan · protected/);
});
