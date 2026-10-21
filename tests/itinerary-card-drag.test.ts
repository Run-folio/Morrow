import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { defaultTripIntent, legacyItineraryIdeas, type EasyTTrip, type ItineraryIdea } from "../lib/easyt/trip.ts";
import { scheduleItineraryIdeaWithUndo, scheduleItineraryIdeaAtPositionWithUndo, placeItineraryActivity } from "../lib/easyt/itinerary-activity-placement.ts";
import { isFullDayActivity } from "../lib/easyt/itinerary-schedule-awareness.ts";
import { composeItineraryDayForPlanning } from "../lib/easyt/itinerary-day-part-intent.ts";

const root = new URL("../", import.meta.url);
const rich = readFileSync(new URL("components/easyt/rich-itinerary-day-planner.tsx", root), "utf8");
const workspace = readFileSync(new URL("components/easyt/trip-itinerary-workspace.tsx", root), "utf8");
const element = (type: unknown, props: Record<string, any>, ...children: unknown[]) => ({ type, props: { ...props, children } });

function banner(scope: Record<string, unknown>) {
  const ast = ts.createSourceFile("planner.tsx", rich, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(ast) === "copy.fullDayDropIntent")) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, "the full-day prompt exists");
  const js = ts.transpileModule(`return (${found.getText(ast)});`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("scope", `with(scope) { ${js} }`)({ React: { createElement: element }, styles: {}, copy: {}, dropTarget: null, setDropTarget: () => {}, dragActive: true, draggedFullDay: true, ...scope });
}

function event(extra = {}) {
  return { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
}

test("the actual full-day banner accepts dragover and invokes exactly one day-level drop", () => {
  let drops = 0;
  const target = banner({ onFullDayDrop: () => drops++ });
  assert.equal(typeof target.props.onDragOver, "function", "visible banner must accept native drops");
  const over = event(); target.props.onDragOver(over); assert.equal(over.prevented, true);
  const drop = event(); target.props.onDrop(drop); assert.equal(drop.prevented, true); assert.equal(drop.stopped, true);
  assert.equal(drops, 1);
});

test("the full-day target never accepts an inactive or ineligible drag", () => {
  for (const state of [{ dragActive: false }, { draggedFullDay: false }, { onFullDayDrop: undefined }]) {
    let drops = 0;
    const target = banner({ onFullDayDrop: () => drops++, ...state });
    assert.equal(typeof target.props.onDragOver, "function");
    const over = event(); target.props.onDragOver(over); assert.equal(over.prevented, false);
    target.props.onDrop(event()); assert.equal(drops, 0);
  }
});

function card(enabled = true) {
  const path = new URL("components/easyt/itinerary-draggable-card.tsx", root);
  assert.ok(existsSync(path), "card surfaces need the shared guarded native drag behavior");
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => name === "react" ? { useRef: (value: unknown) => ({ current: value }) } : { jsx: (type: unknown, props: Record<string, any>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, any>) => ({ type, props }) }, exports);
  const calls: string[] = [];
  const rendered = exports.default({ draggable: enabled, onDragStart: () => calls.push("start"), onDragEnd: () => calls.push("end"), children: "Activity" });
  return { props: rendered.props, calls };
}

// Minimal element ancestry implements only the DOM selector contract consumed by the handlers.
function origin(control: string | null, surface = false) {
  const interactive = control ? { matches: (selector: string) => surface && selector.includes("data-itinerary-drag-surface") } : null;
  return { closest: (selector: string) => selector.includes("button") ? interactive : null };
}

test("card text starts a native drag only after dragstart, leaving normal clicks untouched", () => {
  const { props, calls } = card();
  const pointer = event({ target: origin(null), pointerType: "mouse", button: 0 });
  props.onPointerDownCapture(pointer);
  assert.equal(pointer.prevented, false); assert.deepEqual(calls, []);
  const click = event({ detail: 1 }); props.onClickCapture(click); assert.equal(click.prevented, false);
  props.onDragStart(event({ target: origin(null) })); assert.deepEqual(calls, ["start"]);
  props.onDragEnd(event()); assert.deepEqual(calls, ["start", "end"]);
});

test("action buttons, links, inputs, selects and menus never start a card drag", () => {
  for (const control of ["button", "a", "input", "select", "textarea", "summary", "menuitem"]) {
    const { props, calls } = card();
    props.onPointerDownCapture(event({ target: origin(control), pointerType: "mouse", button: 0 }));
    const drag = event({ target: origin(null) }); props.onDragStart(drag);
    assert.equal(drag.prevented, true, control); assert.deepEqual(calls, []);
  }
});

test("primary card detail surfaces support drag without stealing their ordinary click", () => {
  const { props, calls } = card();
  props.onPointerDownCapture(event({ target: origin("button", true), pointerType: "mouse", button: 0 }));
  props.onDragStart(event({ target: origin(null) })); assert.deepEqual(calls, ["start"]);
  const afterDrag = event({ detail: 1 }); props.onClickCapture(afterDrag); assert.equal(afterDrag.prevented, true);
  const keyboard = event({ detail: 0 }); props.onClickCapture(keyboard); assert.equal(keyboard.prevented, false);
  props.onPointerDownCapture(event({ target: origin("button", true), pointerType: "mouse", button: 0 }));
  const nextClick = event({ detail: 1 }); props.onClickCapture(nextClick); assert.equal(nextClick.prevented, false);
});

test("touch scrolling, secondary pointers, and nonmovable cards cannot initiate native activity drag", () => {
  for (const [enabled, pointerType, button] of [[true, "touch", 0], [true, "pen", 0], [true, "mouse", 2], [false, "mouse", 0]] as const) {
    const { props, calls } = card(enabled);
    const pointer = event({ target: origin(null), pointerType, button }); props.onPointerDownCapture(pointer);
    assert.equal(pointer.prevented, false);
    const drag = event({ target: origin(null) }); props.onDragStart(drag);
    assert.equal(drag.prevented, true); assert.deepEqual(calls, []);
  }
});

test("scheduled, saved, suggested and legacy planned cards reuse the same guarded surface", () => {
  assert.match(rich, /<ItineraryDraggableCard[^>]*data-itinerary-activity-id/);
  assert.match(workspace, /<ItineraryDraggableCard[\s\S]{0,500}role="listitem"/);
  assert.match(workspace, /<ItineraryDraggableCard[^>]*data-itinerary-suggestion-id/);
  assert.match(workspace, /<ItineraryDraggableCard[^>]*data-itinerary-item/);
  assert.match(workspace, /onFullDayDrop=\{\(\) => dropPlannerItem\(null, 0\)\}/);
});

test("the banner routes the production handler through canonical full-day storage, deduplication and refusal", async () => {
  const idea: ItineraryIdea = { id: "golden-circle", stopId: "reykjavik", placeId: "golden-circle", title: "Golden Circle 11h", category: "activity", source: "destination-highlight", reasons: ["destination-significance"], providerMetadata: { duration: { fixedMinutes: 660 }, provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-10-21T00:00:00Z" } } };
  const source: EasyTTrip = {
    schemaVersion: 1, id: "offline-drag-fixture", ownerId: null, title: "Offline fixture", status: "draft", startDate: "2026-10-21", endDate: "2026-10-22", travellers: 2, currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, intent: defaultTripIntent({ stopIds: ["reykjavik"], durationDays: 2 }) },
    stops: [{ id: "reykjavik", order: 0, name: "Reykjavík", country: "Iceland", latitude: 64.1, longitude: -21.9, arrivalDate: "2026-10-21", departureDate: "2026-10-22", nights: 1 }], legs: [],
    planItems: [{ id: "day-a", stopId: "reykjavik", dayNumber: 1, date: "2026-10-21", type: "activity", title: "Reykjavík", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }], recommendations: [], createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z",
  };
  const start = workspace.indexOf("  const dropPlannerItem ="), end = workspace.indexOf("  const changeActivityDayPart =", start);
  const code = ts.transpileModule(workspace.slice(start, end) + "\nreturn dropPlannerItem;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const accept of [true, false]) {
    let current = source, notices = 0, receipts = 0;
    const dragRef: { current: unknown } = { current: null };
    const scope = {
      captureActionScope: () => () => true, plannerDragRef: dragRef, plannerDrag: null, clearPlannerDrag: () => { dragRef.current = null; }, setPlannerError: () => {}, isFullDayActivity,
      scheduleItineraryIdeaWithUndo, scheduleItineraryIdeaAtPositionWithUndo, placeItineraryActivity,
      mutateCurrentTrip: async (update: (trip: EasyTTrip) => EasyTTrip) => { const next = update(current); if (!accept || next === current) return false; current = next; return true; },
      newlyScheduledItineraryIdea: () => false, active: source.planItems[0], language: "en", copy: {},
      setUndoReceipt: () => receipts++, setNotice: () => notices++, addedFullDayNotice: () => "Full-day", fullDayPlacementLabel: () => "Full-day",
    };
    const drop = new Function("scope", `with(scope) { ${code} }`)(scope);
    for (let i = 0; i < 2; i++) {
      dragRef.current = { kind: "suggestion", idea };
      let completed: Promise<unknown> | undefined;
      banner({ onFullDayDrop: () => { completed = drop(null, 0); } }).props.onDrop(event());
      await completed;
    }
    if (accept) {
      const items = legacyItineraryIdeas(current.brief.itineraryIdeas);
      assert.equal(items.length, 1); assert.equal(items[0].dayPart, null); assert.equal(items[0].dayId, "day-a");
      const composed = composeItineraryDayForPlanning(current, "day-a")!;
      assert.equal(composed.unslotted.filter(item => item.id === idea.id).length, 1);
      assert.equal(Object.values(composed.planned).flat().some(item => item.id === idea.id), false);
      assert.equal(receipts, 1);
    } else {
      assert.equal(current, source); assert.equal(notices, 0); assert.equal(receipts, 0);
    }
  }
});
