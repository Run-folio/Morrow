import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { formatTripNights } from "../lib/easyt/trip-facts.ts";
import { transferTimingLabel } from "../lib/easyt/transfer-timing-label.ts";
import { overviewPlanningCardText } from "../lib/easyt/trip-overview-readiness.ts";
import { hostileTripFixture } from "./fixtures/hostile-trip-facts.ts";

function componentFunction(file: string, name: string, scope: Record<string, unknown>) {
  const src = ts.createSourceFile(file, readFileSync(`components/easyt/${file}`, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = src.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration);
  return runInNewContext(ts.transpile(declaration.getText(src) + "\n" + name + ";"), scope) as (...args: unknown[]) => string;
}

test("starter distinguishes unknown, one and zero nights on the actual location label", () => {
  const label = componentFunction("trip-starter.tsx", "locationLabel", {
    formatTripNights, stayWorkspaceContext: () => ({ dateLabel: "6 Nov" }),
  });
  assert.equal(label({}, { name: "Kyoto", nights: null }), "Kyoto · 6 Nov · Nights to confirm");
  assert.equal(label({}, { name: "Kyoto", nights: 1 }), "Kyoto · 6 Nov · 1 night");
  assert.equal(label({}, { name: "Kyoto", nights: 0 }), "Kyoto · 6 Nov · 0 nights");
});

test("Overview flight timing identifies the calculation as door to door", () => {
  const label = componentFunction("trip-overview-workspace.tsx", "conciseTransferLabel", { transferTimingLabel });
  assert.equal(label({ mode: "flight", doorToDoorMinutes: 480, durationMinutes: 300 }), "Flight · ~8h door to door");
  assert.equal(label({ mode: "flight", doorToDoorMinutes: null, durationMinutes: 300 }), "Flight · ~5h travel estimate");
  assert.equal(label({ mode: "flight", doorToDoorMinutes: null, durationMinutes: null }), "Transfer to confirm");
});

test("Overview guidance says what needs checking, not how progress works", () => {
  const trip = hostileTripFixture();
  assert.equal(overviewPlanningCardText(trip, { id: "accommodation", percent: null, status: "needs-review", label: "", detail: "" }, "en").detail, "Confirm overnight stops");
  assert.equal(overviewPlanningCardText(trip, { id: "transport", percent: null, status: "needs-review", label: "", detail: "" }, "en").detail, "Confirm transfers");
  assert.equal(overviewPlanningCardText(trip, { id: "transport", percent: null, status: "needs-review", label: "", detail: "" }, "es").detail, "Confirma los traslados");
});
