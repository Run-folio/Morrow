import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { emptyHomepageInput } from "./fixtures/homepage-dual-entry.ts";
import { homepageSnapshotForStopSubmission, type HomepageInputSnapshot } from "../lib/easyt/home-trip-handoff.ts";
import { todayLocalIso, addLocalDays } from "../lib/easyt/local-date.ts";
import { homepageSearchDateIssue, searchDateIssueMessage, type SearchDateDraft } from "../lib/easyt/search-dates.ts";

const source = readFileSync(new URL("../app/journey/new/new-trip-starter.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("new.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name: string, scope: Record<string, unknown>) {
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) expression = node.initializer;
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, `Actual ${name} callback must exist`);
  const body = ts.transpileModule(`const callback = ${expression.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("scope", `with(scope) { ${body} return callback; }`)(scope);
}
async function search(snapshot: HomepageInputSnapshot, draft: SearchDateDraft = {}, pending = false) {
  const submitted: HomepageInputSnapshot[] = [], errors: string[] = [];
  const before = JSON.stringify(snapshot);
  await callback("submit", {
    readyRef: { current: true }, pendingSubmissionRef: { current: pending ? {} : null }, submitInFlightRef: { current: false },
    snapshotRef: { current: snapshot }, ownerId: null, homepageSnapshotForStopSubmission, update: () => {},
    homepageSearchDateIssue, searchDateIssueMessage, dateTypedDraftRef: { current: draft }, language: "en", setLoading: () => {},
    setError: (value: string) => errors.push(value), onSubmit: async (value: HomepageInputSnapshot) => { submitted.push(value); },
  })();
  assert.equal(JSON.stringify(snapshot), before);
  return { submitted, errors };
}
const selected = (start: string, end = ""): HomepageInputSnapshot => ({ ...emptyHomepageInput(), dates: { state: "selected", value: { start, end } } });

test("fresh New trip intake rejects restored yesterday before passing it to Builder", async () => {
  const result = await search(selected(addLocalDays(todayLocalIso(), -1)));
  assert.equal(result.submitted.length, 0);
  assert.match(result.errors.at(-1) ?? "", /today or later/i);
});
test("fresh New trip intake rejects raw past, invalid and reversed dates", async () => {
  for (const [range, draft, message] of [
    [selected(todayLocalIso()), { start: "2020-01-01" }, /today or later/i],
    [selected(todayLocalIso()), { start: "2026-02-30" }, /valid date/i],
    [selected(addLocalDays(todayLocalIso(), 3), todayLocalIso()), {}, /end date.*start date/i],
  ] as const) {
    const result = await search(range, draft);
    assert.equal(result.submitted.length, 0);
    assert.match(result.errors.at(-1) ?? "", message);
  }
});
test("fresh New trip intake accepts today, future, flexible and start-only dates", async () => {
  for (const snapshot of [selected(todayLocalIso()), selected(todayLocalIso(), todayLocalIso()), selected(addLocalDays(todayLocalIso(), 7), addLocalDays(todayLocalIso(), 14)), emptyHomepageInput(), { ...emptyHomepageInput(), dates: { state: "cleared" as const } }]) {
    const result = await search(snapshot);
    assert.equal(result.submitted.length, 1);
    assert.deepEqual(result.errors, []);
  }
});
test("saved pending intake remains owned by the existing resume flow", async () => {
  const result = await search(selected("2020-01-01"), {}, true);
  assert.equal(result.submitted.length, 0);
  assert.deepEqual(result.errors, []);
});
test("raw New trip date edits retire navigation through the existing input update", () => {
  let retired = false;
  let draft: unknown;
  callback("onDateTypedDraftChange", {
    update: () => { retired = true; }, dateTypedDraftRef: { current: {} },
    updateDateTypedDraft: (next: unknown) => { assert.equal(retired, true); draft = next; },
  })("start", "2020-01-01");
  assert.deepEqual(draft, { start: "2020-01-01" });
});
