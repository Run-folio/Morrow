import assert from "node:assert/strict";
import test from "node:test";

import { buildBookingReadiness } from "../lib/easyt/booking-readiness.ts";
import { tripHealth, tripHealthSummary } from "../lib/easyt/review.ts";
import {
  deriveItineraryCoverage,
  deriveTripDateFacts,
  incomingLegForPlanItem,
  stableStopDateRange,
  transferSeverity,
  tripVisibleFacts,
} from "../lib/easyt/trip-facts.ts";
import { deriveTripPrepTasks } from "../lib/easyt/trip-prep.ts";
import { reviewTripQuality } from "../lib/easyt/trip-quality.ts";
import { hostileEmptyTrip, hostileNoDrivingTrip, hostileTripFixture, hostileUnknownTransportTrip } from "./fixtures/hostile-trip-facts.ts";

const emptyProfile = { nationalities: [], residenceCountry: "", passportExpiryMonth: "" };

test("empty plans derive a stable empty state instead of indexing a missing day", () => {
  const facts = tripVisibleFacts(hostileEmptyTrip());
  assert.equal(facts.days.length, 0);
  assert.equal(facts.transitions.length, 0);
  assert.deepEqual(facts.itinerary, {
    state: "empty",
    plannedDays: 0,
    expectedDays: 4,
    missingDays: 4,
    percent: 0,
    label: "0 of 4 days planned",
  });
});

test("missing, malformed and reversed dates remain unknown or invalid on every shared boundary", () => {
  for (const [startDate, endDate, state, label] of [
    ["", "", "unknown", "Dates to confirm"],
    ["2026-02-31", "2026-03-04", "invalid", "Dates need review"],
    ["2026-09-04", "2026-09-01", "invalid", "Dates need review"],
  ] as const) {
    const trip = hostileTripFixture({ startDate, endDate });
    const facts = deriveTripDateFacts(trip);
    assert.equal(facts.state, state);
    assert.equal(facts.durationDays, null);
    assert.equal(facts.rangeLabel, label);
    assert.equal(deriveItineraryCoverage(trip).expectedDays, null);
    assert.equal(reviewTripQuality({ startDate, endDate, stops: [], mentions: [] }).find((item) => item.id === "dates")?.state, state === "invalid" ? "needs-attention" : "missing");
    assert.equal(buildBookingReadiness(trip).some((action) => action.category === "accommodation" || action.category === "flight"), false);
    assert.equal(stableStopDateRange(trip.stops[0], trip), null);
    assert.equal(deriveTripPrepTasks({ trip, profile: emptyProfile, bookingActions: [], readinessCards: [] })[0]?.id, "trip-dates");
  }
});

test("a repeated stop uses the adjacent visit's exact inbound leg", () => {
  const trip = hostileTripFixture();
  assert.equal(incomingLegForPlanItem(trip, trip.planItems[1])?.id, "a-b");
  assert.equal(incomingLegForPlanItem(trip, trip.planItems[3])?.id, "c-b");
  assert.deepEqual(tripVisibleFacts(trip).transitions.map((item) => item.inboundLeg?.id ?? null), [null, "a-b", "b-c", "c-b"]);
});

test("unknown transport stays unknown and is not replaced by a road estimate", () => {
  const trip = hostileUnknownTransportTrip();
  const inbound = incomingLegForPlanItem(trip, trip.planItems[1]);
  assert.equal(inbound?.mode, "unknown");
  assert.equal(inbound?.durationMinutes, null);
  assert.equal(tripHealth(trip).isReady, false);
  assert.equal(tripHealth(trip).issues.some((issue) => issue.rule === "connection-confidence"), true);
});

test("no-driving remains blocking and suppresses Prep driving guidance", () => {
  const trip = hostileNoDrivingTrip();
  assert.equal(tripHealth(trip).issues.some((issue) => issue.rule === "post-generation-transport-restriction-conflict" && issue.severity === "critical"), true);
  const tasks = deriveTripPrepTasks({
    trip,
    profile: emptyProfile,
    bookingActions: [],
    readinessCards: [{ id: "driving", priority: "useful", title: "If you plan to drive", detail: "Driving guidance" }],
  });
  assert.equal(tasks.some((task) => task.id === "driving-readiness"), false);
});

test("five-to-nine-hour transfers warn and ten hours is critical", () => {
  assert.equal(transferSeverity(299), "normal");
  assert.equal(transferSeverity(300), "warning");
  assert.equal(transferSeverity(539), "warning");
  assert.equal(transferSeverity(540), "warning");
  assert.equal(transferSeverity(599), "warning");
  assert.equal(transferSeverity(600), "critical");
  assert.equal(transferSeverity(null), "unknown");
});

test("coverage counts represented days rather than duplicate itinerary rows", () => {
  const trip = hostileTripFixture();
  trip.planItems.push({ ...trip.planItems[1], id: "duplicate-day-2" });
  const coverage = deriveItineraryCoverage(trip);
  assert.equal(coverage.plannedDays, 4);
  assert.equal(coverage.state, "complete");
  assert.equal(coverage.percent, 100);

  trip.planItems[2] = { ...trip.planItems[2], date: "2026-02-31" };
  assert.deepEqual(deriveItineraryCoverage(trip), {
    state: "partial",
    plannedDays: 3,
    expectedDays: 4,
    missingDays: 1,
    percent: 75,
    label: "3 of 4 days planned",
  });
});

test("missing nights remain unknown rather than becoming a zero-night stop", () => {
  const trip = hostileTripFixture();
  trip.stops[1] = { ...trip.stops[1], nights: null };
  const health = tripHealth(trip);
  assert.equal(health.issues.some((issue) => issue.rule === "stay-duration-confidence"), true);
  assert.equal(health.issues.some((issue) => issue.rule === "short-stop-heavy-transfer" && issue.affectedDays.includes(2)), false);
  assert.equal(health.isReady, false);
});

test("Trip Health summary is the single count, status and copy projection used by visible surfaces", () => {
  const trip = hostileUnknownTransportTrip();
  const summary = tripHealthSummary(trip);
  const openIssues = summary.health.issues.filter((issue) => issue.status === "open");
  assert.equal(summary.issueCount, openIssues.length);
  assert.equal(summary.health.openIssueCount, openIssues.length);
  assert.equal(summary.status, "needs-review");
  assert.equal(summary.headline, `${openIssues.length} ${openIssues.length === 1 ? "thing" : "things"} to review`);
});
