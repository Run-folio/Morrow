import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as schedule from "../lib/easyt/itinerary-schedule-awareness.ts";
import type { ComposedItineraryActivity } from "../lib/easyt/itinerary-day-composition.ts";

const planner = readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
type Element = { type: any; props: Record<string, any> };
const element = (type: unknown, props: Record<string, any>, ...children: unknown[]) => ({ type, props: { ...props, children } });
const elements = (node: any): Element[] => !node || typeof node !== "object" ? []
  : Array.isArray(node) ? node.flatMap(elements) : node.props ? [node, ...elements(node.props.children)] : [];
const text = (node: any): string => typeof node === "string" ? node
  : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
const transpile = (code: string) => ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const activity = (changes: Partial<ComposedItineraryActivity> = {}): ComposedItineraryActivity => ({
  id: "activity-1", title: "Nishiki Market", category: "activity", booking: null,
  source: "itinerary-idea", dayPart: "morning", noteIndex: 0, dayPartEditable: true,
  placeId: "nishiki", ...changes,
});

// Execute the actual planner/row JSX with the existing domain timing helpers.
// Only React scheduling and visual leaves are substituted; no DOM or browser runs.
function render(item = activity(), props: Record<string, any> = {}) {
  const body = planner.slice(planner.indexOf("function copyFor("))
    .replace("export default function RichItineraryDayPlanner", "function RichItineraryDayPlanner");
  const scope = { ...schedule, React: { createElement: element },
    dayPartLabels: { en: { morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening" }, es: {} },
    itineraryPlanningParts: ["morning", "afternoon", "evening"],
    useId: () => "activity-menu", useRef: (value: unknown) => ({ current: value }),
    useState: (value: unknown) => [value, () => {}], useEffect() {},
    styles: new Proxy({}, { get: (_, key) => String(key) }),
    EasyTButton: "button", EasyTSelect: "select", EasyTField: "input",
    ItineraryActivityIdentity: "identity", ItineraryDraggableCard: "article",
    ...Object.fromEntries(["ArrowDown", "ArrowUp", "AlertTriangle", "BedDouble", "CalendarDays", "CalendarRange", "CirclePlus", "Clock3", "GripVertical", "MoreHorizontal", "Route", "Trash2"].map(name => [name, name])),
  };
  const component = new Function("scope", `with(scope){${transpile(body + "\nreturn RichItineraryDayPlanner;")}}`)(scope);
  const planned = { morning: [], midday: [], afternoon: [], evening: [], ...(item.dayPart ? { [item.dayPart]: [item] } : {}) };
  const tree = component({ composition: {
    day: { id: "day-2", dayNumber: 2 }, context: { date: "2026-11-02", destination: "Kyoto" },
    planned, unslotted: item.dayPart ? [] : [item], transfers: [],
    tonight: { state: "not-organised", destination: "Kyoto" }, ideas: { unscheduledCount: 0 },
  }, showHeader: false, showTonight: false, ...props });
  const row = elements(tree).find(node => node.type?.name === "ActivityRow");
  return row ? elements(row.type(row.props)) : [];
}

for (const [label, changes] of [
  ["scheduled", { dayPart: "morning" }],
  ["unslotted", { dayPart: null }],
  ["full-day", { dayPart: null, providerMetadata: { duration: { fixedMinutes: 540 }, provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-10-21T12:00:00.000Z" } } }],
] as const) test(`the ${label} row menu removes exactly its activity and closes before invoking the callback`, () => {
  const item = activity(changes), calls: ComposedItineraryActivity[] = [];
  let focused = false;
  const menu = { open: true, querySelector: () => ({ focus() { focused = true; } }) };
  const nodes = render(item, { onRemoveActivity: (value: ComposedItineraryActivity) => {
    assert.equal(menu.open, false); assert.equal(focused, true); calls.push(value);
  } });
  const remove = nodes.find(node => node.type === "button" && text(node) === "Remove");
  assert.ok(remove, "the existing ellipsis menu needs its Remove action");
  assert.equal(remove.props.disabled, false);
  remove.props.onClick({ currentTarget: { closest: () => menu } });
  assert.deepEqual(calls, [item]);
  assert.ok(nodes.some(node => node.type === "details" && elements(node).includes(remove)));
});

test("the menu localises Remove and disables it during the activity mutation", () => {
  const nodes = render(activity(), { language: "es", pendingActivityId: "activity-1", onRemoveActivity() {} });
  const remove = nodes.find(node => node.type === "button" && text(node) === "Eliminar");
  assert.ok(remove); assert.equal(remove.props.disabled, true);
});

test("unavailable callbacks and protected rows never expose Remove", () => {
  for (const [item, props] of [
    [activity(), {}],
    [activity({ booking: { id: "booking", type: "reservation", title: "Booked", date: null, confirmation: "BOOKED", url: null } }), { onRemoveActivity() {} }],
    [activity({ source: "generated-activity" }), { onRemoveActivity() {} }],
    [activity({ source: "day-note" }), { onRemoveActivity() {} }],
  ] as const) assert.equal(render(item, props).some(node => node.type === "button" && text(node) === "Remove"), false);
});

const ast = ts.createSourceFile("workspace.tsx", workspace, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function removalHandler() {
  let declaration: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "removeComposedActivity") declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration?.initializer, "the menu and detail must share the existing removal handler");
  const calls = { ideas: [] as string[], targets: [] as unknown[], notices: [] as string[], mutations: [] as string[], closes: 0 };
  let current = true;
  const scope = { active: { dayNumber: 2 }, copy: { activityRemoved: "Activity removed" },
    captureActionScope: () => () => current,
    mutateCurrentTrip: async (update: (trip: unknown) => unknown, key: string) => { calls.mutations.push(key); update({}); return true; },
    removeItineraryIdea: (trip: unknown, id: string) => { calls.ideas.push(id); return trip; },
    closeSelectedDetail: () => { calls.closes++; }, setNotice: (notice: string) => calls.notices.push(notice),
    setRemoveTarget: (target: unknown) => calls.targets.push(target), setRemoveError: () => {},
  };
  const remove = new Function("scope", `with(scope){${transpile("return (" + declaration.initializer.getText(ast) + ");")}}`)(scope);
  return { remove, calls, retire: () => { current = false; } };
}

test("authored menu removal opens the existing confirmation without writing", async () => {
  const view = removalHandler();
  await view.remove(activity({ source: "authored-activity", noteIndex: 3 }));
  assert.deepEqual(view.calls.targets, [{ dayNumber: 2, noteIndex: 3, title: "Nishiki Market" }]);
  assert.deepEqual(view.calls.mutations, []);
  assert.match(workspace, /onConfirm=\{confirmRemoveActivity\}/);
});

for (const source of ["itinerary-idea", "google-place-reference"] as const) test(`${source} menu removal retains the existing identity and mutation key`, async () => {
  const view = removalHandler(); await view.remove(activity({ source }));
  assert.deepEqual(view.calls.ideas, ["activity-1"]);
  assert.deepEqual(view.calls.mutations, ["itinerary-idea-remove-activity-1"]);
  assert.deepEqual(view.calls.targets, []); assert.equal(view.calls.closes, 1);
  assert.deepEqual(view.calls.notices, ["Activity removed"]);
});

test("retired idea removal does not publish stale detail or notice changes", async () => {
  const view = removalHandler(); view.retire(); await view.remove(activity());
  assert.equal(view.calls.closes, 0); assert.deepEqual(view.calls.notices, []);
});

test("the live menu and detail both use the same removal callback", () => {
  const handler = () => {}, item = activity();
  const scope = { removeComposedActivity: handler, selectedRecommendation: null, selectedActivity: item };
  const props = new Map<string, unknown>();
  function visit(node: ts.Node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ["RichItineraryDayPlanner", "ItineraryItemDetail"].includes(node.tagName.getText(ast))) {
      for (const prop of node.attributes.properties) if (ts.isJsxAttribute(prop)
        && ["onRemoveActivity", "onRemove"].includes(prop.name.getText(ast))
        && prop.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        props.set(node.tagName.getText(ast), new Function("scope", `with(scope){${transpile("return (" + prop.initializer.expression.getText(ast) + ");")}}`)(scope));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(props.get("RichItineraryDayPlanner"), handler);
  let removed: unknown;
  scope.removeComposedActivity = (value?: unknown) => { removed = value; };
  (props.get("ItineraryItemDetail") as () => void)();
  assert.equal(removed, item);
});

test("live workspace pending keys disable each removing row before its device write completes", () => {
  let pendingExpression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === "RichItineraryDayPlanner") {
      for (const prop of node.attributes.properties) if (ts.isJsxAttribute(prop) && prop.name.getText(ast) === "isActivityPending"
        && prop.initializer && ts.isJsxExpression(prop.initializer)) pendingExpression = prop.initializer.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(pendingExpression, "the production planner must observe the actual removal pending keys");
  const pendingKeys = new Set(["itinerary-idea-remove-activity-1", "itinerary-idea-remove-activity-2"]);
  const scope = { dayPending: false, mutation: { isPending: (key: string) => pendingKeys.has(key) } };
  const isActivityPending = new Function("scope", `with(scope){${transpile("return (" + pendingExpression.getText(ast) + ");")}}`)(scope);
  for (const id of ["activity-1", "activity-2", "activity-3"]) {
    const item = activity({ id });
    const remove = render(item, { isActivityPending, onRemoveActivity() {} }).find(node => node.type === "button" && text(node) === "Remove");
    assert.ok(remove); assert.equal(remove.props.disabled, pendingKeys.has(`itinerary-idea-remove-${id}`));
  }
  scope.dayPending = true;
  assert.equal(isActivityPending(activity({ source: "authored-activity" })), true, "authored confirmation retains the existing day mutation key");
});
