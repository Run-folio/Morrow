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
  assert.equal(mixed[1]?.actionLabel, "Review route");
  assert.equal(mixed[1]?.href, "/journey/trip-route-checks/map?returnTo=%2Fjourney%2Ftrip-route-checks");
});

test("Overview retains all distinct route findings in severity order for one disclosure", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const findings = [
    issue("trip-end-mismatch", "The final stop ends on 2026-10-02, not at the end of the trip."),
    issue("travel-day-impact", "Travel leaves only 1.25 usable days in Kyoto."),
    issue("route-backtracking", "This route doubles back between stops."),
    { ...issue("trip-dates", "Review the trip dates before relying on this plan."), severity: "critical" as const },
    issue("stay-duration-confidence", "At least one stop still needs a confirmed number of nights."),
  ];
  const presented = api.presentOverviewIssues(trip, findings, []);
  assert.equal(presented.length, 5);
  assert.equal(presented[0]?.severity, "critical");
  assert.deepEqual(new Set(presented.map((item) => item.id)), new Set(findings.map((item) => item.id)));
  assert.ok(presented.every((item) => item.href.includes("/map?")), "route findings use the existing route review owner");
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

test("one Route check preserves one concise finding and avoids a duplicate primary action", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const issues = api.presentOverviewIssues(trip, [issue("route-integrity", "The saved route does not yet represent the complete journey from its origin.")], []);
  const summary = api.presentRouteCheckSummary(issues, issues[0]!.href);
  assert.deepEqual(summary.visible.map((finding: { text: string }) => finding.text), ["Journey origin isn’t fully represented"]);
  assert.equal(summary.remaining.length, 0);
  assert.deepEqual(summary.actions, []);
});

test("transport checks stay together and mixed route/transport review keeps distinct destinations", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const issues = api.presentOverviewIssues(trip, [
    issue("route-integrity", "2 transfers need checking before Morrovia can assess the full route."),
    issue("driving-load", "5h 30m of estimated road travel may dominate this transfer day.", "kyoto-tokyo-return"),
    issue("travel-day-impact", "Travel leaves only 1.25 usable days in Kyoto."),
  ], [{ legId: "tokyo-kyoto", message: "Unknown mode" }]);
  const summary = api.presentRouteCheckSummary(issues, issues.find((item: { actionLabel: string }) => item.actionLabel === "Review route")!.href);
  assert.deepEqual(summary.visible.map((finding: { text: string }) => finding.text), [
    "2 transfers need checking", "5h 30m of estimated road travel may dominate this transfer day.", "Kyoto has only 1.25 usable days",
  ]);
  assert.deepEqual(summary.actions.map((action: { label: string }) => action.label), ["Review transfers"]);
  assert.match(summary.actions[0]!.href, /\/transport\?leg=tokyo-kyoto/);
});

test("four or more findings reveal all through disclosure and keep all critical findings visible", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const warnings = [
    issue("trip-end-mismatch", "The final stop ends on 2026-10-02, not at the end of the trip."),
    issue("travel-day-impact", "Travel leaves only 1.25 usable days in Kyoto."),
    issue("route-backtracking", "This route doubles back between stops."),
    issue("stay-duration-confidence", "At least one stop still needs a confirmed number of nights."),
    issue("trip-pace", "The trip pace needs review."),
  ];
  const summary = api.presentRouteCheckSummary(api.presentOverviewIssues(trip, warnings, []), "");
  assert.equal(summary.visible.length, 3);
  assert.equal(summary.remaining.length, 2);
  assert.equal(summary.visible.length + summary.remaining.length, 5);
  const critical = warnings.map((item) => ({ ...item, severity: "critical" as const }));
  const criticalSummary = api.presentRouteCheckSummary(api.presentOverviewIssues(trip, critical, []), "");
  assert.equal(criticalSummary.visible.length, 5);
  assert.equal(criticalSummary.remaining.length, 0);
});

test("combined transport summary keeps each finding's own severity", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const issues = api.presentOverviewIssues(trip, [
    issue("route-integrity", "2 transfers need checking before Morrovia can assess the full route."),
    { ...issue("driving-load", "5h 30m of estimated road travel may dominate this transfer day.", "kyoto-tokyo-return"), severity: "critical" as const },
  ], [{ legId: "tokyo-kyoto", message: "Unknown mode" }]);
  const summary = api.presentRouteCheckSummary(issues, "");
  assert.deepEqual(summary.visible.map((finding: { severity: string; text: string }) => [finding.severity, finding.text]), [
    ["critical", "5h 30m of estimated road travel may dominate this transfer day."],
    ["warning", "2 transfers need checking"],
  ]);
});

test("Overview counts distinct affected canonical legs rather than integrity findings", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const oneLegTrip = { ...trip, legs: [{ id: "tokyo-kyoto" }] } as EasyTTrip;
  const presented = api.presentOverviewIssues(oneLegTrip, [
    issue("route-integrity", "3 transfers need checking before Morrovia can assess the full route."),
  ], [
    { legId: "tokyo-kyoto", message: "Both endpoints need validated coordinates." },
    { legId: "tokyo-kyoto", message: "The saved transfer has a warning." },
    { legId: "tokyo-kyoto", message: "Transfer time needs checking." },
  ]);
  assert.equal(presented[0]?.title, "1 transfer needs checking");
  assert.deepEqual(presented[0]?.reviewLegIds, ["tokyo-kyoto"]);
});

test("Overview counts separate leg occurrences and omits transfer counts without an affected canonical leg", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const repeatedPlaceLegs = { ...trip, legs: [{ id: "manila-first-el-nido" }, { id: "cebu-manila-final" }] } as EasyTTrip;
  const twoLegs = api.presentOverviewIssues(repeatedPlaceLegs, [
    issue("route-integrity", "2 transfers need checking before Morrovia can assess the full route."),
  ], [
    { legId: "manila-first-el-nido", message: "The first Manila occurrence needs coordinates." },
    { legId: "manila-first-el-nido", message: "The El Nido occurrence needs coordinates." },
    { legId: "cebu-manila-final", message: "The final Manila occurrence needs a transfer time." },
  ]);
  assert.equal(twoLegs[0]?.title, "2 transfers need checking");
  assert.deepEqual(twoLegs[0]?.reviewLegIds, ["manila-first-el-nido", "cebu-manila-final"]);

  const empty = api.presentOverviewIssues({ ...trip, legs: [] } as EasyTTrip, [
    issue("route-integrity", "3 transfers need checking before Morrovia can assess the full route."),
  ], [{ legId: null, message: "The canonical route endpoint count does not match." }]);
  assert.deepEqual(empty, []);
});

test("Overview does not count resolved transport findings", async () => {
  const api = await import("../lib/easyt/trip-overview-issues.ts");
  const resolved = { ...issue("missing-logistics", "This transfer needs a confirmed time.", "tokyo-kyoto"), status: "applied" as const };
  assert.deepEqual(api.presentOverviewIssues(trip, [resolved], []), []);
});
