import assert from "node:assert/strict";
import test from "node:test";
import type { EasyTTrip, TripRecommendation } from "../lib/easyt/trip.ts";

const trip = {
  id: "trip-route-checks",
  legs: [{ id: "tokyo-kyoto" }, { id: "kyoto-tokyo-return" }],
  planItems: [{ stopId: "kyoto", dayNumber: 2 }],
} as EasyTTrip;

const issue = (rule: string, message: string, legId?: string): TripRecommendation => ({
  id: `issue-${rule}`, rule, severity: "warning", message, evidence: "", affectedDays: [2],
  confidence: "high", checkedAt: "2026-09-27T00:00:00Z", status: "open",
  proposedChange: legId ? { action: "resolve-leg", legId } : null,
});

test("Overview combines transfer checks into one truthful Transport review while retaining the long-road fact", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts").catch(() => null);
  assert.ok(api, "Overview issue presentation must exist");
  const integrity = issue("route-integrity", "2 transfers need checking before Morrovia can assess the full route.");
  const road = issue("driving-load", "5h 30m of estimated road travel may dominate this transfer day.", "kyoto-tokyo-return");
  const presented = api.presentOverviewIssues(trip, [integrity, road], [
    { legId: "tokyo-kyoto", message: "Check rail" },
    { legId: "kyoto-tokyo-return", message: "Check road" },
  ]);
  assert.equal(presented.length, 1);
  assert.equal(presented[0]?.title, "2 transfers need checking");
  assert.deepEqual(presented[0]?.details, ["5h 30m of estimated road travel may dominate this transfer day."]);
  assert.equal(presented[0]?.actionLabel, "Review transfers");
  assert.equal(presented[0]?.href, "/journey/trip-route-checks/transport?leg=tokyo-kyoto&review=tokyo-kyoto&review=kyoto-tokyo-return");
});

test("Overview focuses one exact leg, leaves unrelated route warnings distinct, and omits healthy reassurance", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts").catch(() => null);
  assert.ok(api, "Overview issue presentation must exist");
  assert.deepEqual(api.presentOverviewIssues(trip, [], []), []);
  const one = api.presentOverviewIssues(trip, [issue("missing-logistics", "One connection needs an estimate.", "kyoto-tokyo-return")], []);
  assert.equal(one[0]?.href, "/journey/trip-route-checks/transport?leg=kyoto-tokyo-return");
  const roadOnly = api.presentOverviewIssues(trip, [issue("driving-load", "5h 30m of estimated road travel may dominate this transfer day.", "tokyo-kyoto")], []);
  assert.equal(roadOnly.length, 1);
  assert.equal(roadOnly[0]?.actionLabel, "Review transfers");
  const mixed = api.presentOverviewIssues(trip, [
    issue("driving-load", "Long transfer.", "tokyo-kyoto"),
    issue("travel-day-impact", "Travel leaves less than a day in Kyoto."),
  ], []);
  assert.equal(mixed.length, 2);
  assert.equal(mixed[1]?.actionLabel, "Review timing");
  assert.equal(mixed[1]?.href, "/journey/trip-route-checks/itinerary?day=2");
});

test("Overview never infers a leg from a place name or keeps an ID absent from the trip", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts").catch(() => null);
  assert.ok(api, "Overview issue presentation must exist");
  const unknown = api.presentOverviewIssues(trip, [issue("connection-confidence", "Connection into Tokyo needs checking.", "not-in-trip")], []);
  assert.equal(unknown[0]?.href, "/journey/trip-route-checks/transport");
  assert.deepEqual(unknown[0]?.reviewLegIds, []);
});

test("route-integrity count subsumes repeated generic connection copy without losing the distinct road risk", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const presented = api.presentOverviewIssues(trip, [
    issue("route-integrity", "2 transfers need checking before Morrovia can assess the full route."),
    issue("missing-logistics", "At least one connection still needs a confirmed route estimate before the plan is travel-ready.", "tokyo-kyoto"),
    issue("connection-confidence", "The connection into Kyoto still needs a travel mode before Morrovia can judge the day realistically.", "tokyo-kyoto"),
    issue("driving-load", "5h 30m of estimated road travel may dominate this transfer day.", "kyoto-tokyo-return"),
  ], [{ legId: "tokyo-kyoto", message: "Unknown mode" }, { legId: "kyoto-tokyo-return", message: "Long road" }]);
  assert.deepEqual(presented[0]?.details, ["5h 30m of estimated road travel may dominate this transfer day."]);
  assert.deepEqual(presented[0]?.reviewLegIds, ["tokyo-kyoto", "kyoto-tokyo-return"]);
});
