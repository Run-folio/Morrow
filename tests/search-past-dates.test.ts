import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { emptyHomepageInput } from "./fixtures/homepage-dual-entry.ts";
import { homepagePreflightIssues, homepageSnapshotForStopSubmission, type HomepageInputSnapshot } from "../lib/easyt/home-trip-handoff.ts";
import { todayLocalIso, addLocalDays } from "../lib/easyt/local-date.ts";
import { homepageSearchDateIssue, searchDateIssueMessage } from "../lib/easyt/search-dates.ts";

const source = readFileSync(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("home.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submit: ts.ArrowFunction | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "submit" && node.initializer && ts.isArrowFunction(node.initializer)) submit = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(submit);
const script = ts.transpileModule(`const submit = ${submit.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

/** Execute the production Search continuation; reservations are observable boundaries. */
async function search(snapshot: HomepageInputSnapshot, typedDraft: Partial<Record<"start" | "end", string>> = {}) {
  const before = JSON.stringify(snapshot);
  const seen = { reservations: 0, hrefs: [] as string[], errors: [] as string[] };
  const scope = {
    inputBlocked: false, homepageReadyRef: { current: true }, sessionPendingRef: { current: false }, ownerIdRef: { current: null },
    snapshotRef: { current: snapshot }, submitInFlightRef: { current: false }, submissionGenerationRef: { current: 0 }, mountedRef: { current: true },
    homepageSnapshotForStopSubmission, homepageSearchDateIssue, searchDateIssueMessage, updateSnapshot: () => {}, dateTypedDraftRef: { current: typedDraft },
    performance: { now: () => 1 }, trackEvent: () => {}, setLoading: () => {}, language: "en",
    setCaptureError: (value: string) => seen.errors.push(value),
    readDurableHomepageState: async () => ({ kind: "ready", storedInput: { snapshot } }),
    homepageSemanticInputFingerprint: () => "same", storedInputRef: { current: { snapshot } },
    homepagePreflightIssues: (input: HomepageInputSnapshot) => homepagePreflightIssues(input).filter(issue => issue.field === "dates"), issueMessage: () => "Review your trip details before continuing.", evidenceFor: () => undefined, projectHomepageInput: () => ({ ok: true }), travelProfile: null,
    window: { localStorage: {} }, document: { getElementById: () => null }, generatedId: (prefix: string) => prefix,
    reservePendingDescribeHandoff: async () => { seen.reservations++; return { ok: true, stored: { snapshot }, receipt: { handoffId: "handoff" }, href: "/journey/new" }; },
    requestNewTripNavigationAsync: async () => true, markPlanningMilestone: () => {}, reportPersistenceOutcome: () => {},
    router: { push: (href: string) => seen.hrefs.push(href) },
  };
  await new Function("scope", `with(scope) { ${script} return submit; }`)(scope)();
  assert.equal(JSON.stringify(snapshot), before, "validation must retain the traveller's dates");
  return seen;
}

const selected = (start: string, end = ""): HomepageInputSnapshot => ({ ...emptyHomepageInput(), dates: { state: "selected", value: { start, end } } });

test("Search blocks yesterday from restored input before reserving or navigating", async () => {
  const seen = await search(selected(addLocalDays(todayLocalIso(), -1), todayLocalIso()));
  assert.equal(seen.reservations, 0);
  assert.deepEqual(seen.hrefs, []);
  assert.match(seen.errors.at(-1) ?? "", /today or later/i);
});

test("Search blocks unaccepted typed past dates instead of using the previous valid range", async () => {
  const seen = await search(selected(todayLocalIso(), addLocalDays(todayLocalIso(), 7)), { start: addLocalDays(todayLocalIso(), -1) });
  assert.equal(seen.reservations, 0);
  assert.match(seen.errors.at(-1) ?? "", /today or later/i);
});

test("Search rejects reversed ranges with a clear date message", async () => {
  const seen = await search(selected(addLocalDays(todayLocalIso(), 3), todayLocalIso()));
  assert.equal(seen.reservations, 0);
  assert.match(seen.errors.at(-1) ?? "", /end date.*start date/i);
});

test("Search accepts today, equal endpoints, future ranges, open dates and start-only dates", async () => {
  for (const snapshot of [selected(todayLocalIso()), selected(todayLocalIso(), todayLocalIso()), selected(addLocalDays(todayLocalIso(), 3), addLocalDays(todayLocalIso(), 10)), emptyHomepageInput(), { ...emptyHomepageInput(), dates: { state: "cleared" as const } }]) {
    const seen = await search(snapshot);
    assert.equal(seen.reservations, 1);
    assert.deepEqual(seen.errors.filter(Boolean), []);
  }
});

test("Search blocks a malformed typed date and requires applying valid typed text", async () => {
  for (const [raw, message] of [["2026-02-30", /valid date/i], [addLocalDays(todayLocalIso(), 5), /apply.*date/i]] as const) {
    const seen = await search(selected(todayLocalIso()), { start: raw });
    assert.equal(seen.reservations, 0);
    assert.match(seen.errors.at(-1) ?? "", message);
  }
});

test("Search reevaluates restored dates against the current local day after midnight", () => {
  const snapshot = selected("2026-10-21", "2026-10-24");
  assert.equal(homepageSearchDateIssue(snapshot, {}, new Date(2026, 9, 21, 23, 59)), null);
  assert.equal(homepageSearchDateIssue(snapshot, {}, new Date(2026, 9, 22, 0, 1)), "past");
});

test("Search uses the traveller's local today on both sides of the UTC date boundary", () => {
  const helper = new URL("../lib/easyt/search-dates.ts", import.meta.url).href;
  const program = `import assert from 'node:assert/strict'; import {homepageSearchDateIssue} from ${JSON.stringify(helper)};
    const today = process.env.EXPECTED_TODAY;
    const snapshot = {dates:{state:'selected',value:{start:today,end:today}}};
    assert.equal(homepageSearchDateIssue(snapshot,{},new Date(process.env.CLOCK_INSTANT)),null);
    const yesterday = new Date(today+'T12:00:00'); yesterday.setDate(yesterday.getDate()-1);
    snapshot.dates.value.start = [yesterday.getFullYear(),String(yesterday.getMonth()+1).padStart(2,'0'),String(yesterday.getDate()).padStart(2,'0')].join('-');
    assert.equal(homepageSearchDateIssue(snapshot,{},new Date(process.env.CLOCK_INSTANT)),'past');`;
  for (const [TZ, CLOCK_INSTANT, EXPECTED_TODAY] of [
    ["America/Los_Angeles", "2026-10-21T00:30:00Z", "2026-10-20"],
    ["Pacific/Kiritimati", "2026-10-21T23:30:00Z", "2026-10-22"],
    ["America/New_York", "2026-11-01T05:30:00Z", "2026-11-01"],
  ]) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8", env: { ...process.env, TZ, CLOCK_INSTANT, EXPECTED_TODAY } });
    assert.equal(result.status, 0, `${TZ}: ${result.stderr}`);
  }
});

test("typing a Search date retires an in-flight continuation before publishing the raw draft", () => {
  let callback: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "onDateTypedDraftChange") callback = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(callback);
  const body = ts.transpileModule(`const callback = ${callback.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let retired = false;
  let draft: unknown;
  const bindings = { cancelSubmission: () => { retired = true; }, dateTypedDraftRef: { current: {} }, setCaptureError: () => {}, updateDateTypedDraft: (next: unknown) => { assert.equal(retired, true); draft = next; } };
  new Function("scope", `with(scope) { ${body} return callback; }`)(bindings)("start", "2020-01-01");
  assert.deepEqual(draft, { start: "2020-01-01" });
});
