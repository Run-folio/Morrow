import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as localDates from "../lib/easyt/local-date.ts";

type Element = { type: string | ((props: Record<string, unknown>) => Element); props: Record<string, any> };
const require = createRequire(import.meta.url);
const pickerSource = readFileSync(new URL("../components/easyt/morrovia-date-picker.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(pickerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;

/** Render the production picker with inert DOM effects and a controlled local clock. */
function renderPicker(props: Record<string, unknown>, clock = { now: new Date(2026, 9, 21, 12) }, stateOverrides: Record<number, unknown> = {}) {
  let stateIndex = 0;
  const exports: Record<string, any> = {};
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    react: {
      useState: (initial: unknown) => { const index = stateIndex++; return [index in stateOverrides ? stateOverrides[index] : typeof initial === "function" ? initial() : initial, () => {}]; },
      useEffect: () => {}, useId: () => "id", useRef: (current: unknown) => ({ current }), useMemo: (compute: () => unknown) => compute(),
    },
    "react-dom": { createPortal: () => { throw new Error("No browser portal in this fixture"); } },
    "lucide-react": {},
    "@/lib/easyt/local-date": { ...localDates, todayLocalIso: () => localDates.todayLocalIso(clock.now) },
    "./morrovia-date-picker.module.css": { default: {} },
    "./morrovia-planner-field": { plannerFieldButtonClassName: "planner", MorroviaPlannerFieldContent: "span" },
  };
  new Function("require", "exports", "window", compiled)((id: string) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports, { requestAnimationFrame: () => {} });
  const tree = exports.MorroviaDatePicker({ mode: "range", startLabel: "Start", endLabel: "End", startValue: "2026-10-21", endValue: "", defaultOpen: true, onChange: () => {}, ...props }) as Element;
  const elements: Element[] = [];
  function walk(value: any) {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object" || !("props" in value)) return;
    if (typeof value.type === "function") { walk(value.type(value.props)); return; }
    elements.push(value);
    walk(value.props.children);
  }
  walk(tree);
  return elements;
}

test("Search picker disables yesterday while today is selectable", () => {
  const elements = renderPicker({ minToday: true });
  assert.equal(elements.find(element => element.props["data-date"] === "2026-10-20")?.props.disabled, true);
  assert.equal(elements.find(element => element.props["data-date"] === "2026-10-21")?.props.disabled, false);
});

test("Search picker rechecks local today when a previously enabled day is picked after midnight", () => {
  const clock = { now: new Date(2026, 9, 21, 23, 59) }, selected: unknown[] = [];
  const today = renderPicker({ minToday: true, onChange: (value: unknown) => selected.push(value) }, clock).find(element => element.props["data-date"] === "2026-10-21")!;
  assert.equal(today.props.disabled, false);
  clock.now = new Date(2026, 9, 22, 0, 1);
  today.props.onClick();
  assert.deepEqual(selected, []);
});

test("the shared picker still permits historical trip dates unless Search opts in", () => {
  const selected: unknown[] = [];
  const yesterday = renderPicker({ onChange: (value: unknown) => selected.push(value) }).find(element => element.props["data-date"] === "2026-10-20")!;
  assert.equal(yesterday.props.disabled, false);
  yesterday.props.onClick();
  assert.deepEqual(selected, [{ start: "2026-10-20", end: "" }]);
});

test('complete-range mode does not submit a partial start selection',()=>{
 const selected:unknown[]=[];const e=renderPicker({commitRangeOnEnd:true,endValue:'2026-10-28',onChange:(range:unknown)=>selected.push(range)});
 e.find(x=>x.props['data-date']==='2026-10-22')!.props.onClick();assert.deepEqual(selected,[]);
});
test('complete-range end uses the local selected start while canonical props are unchanged',()=>{
 const selected:unknown[]=[];const e=renderPicker({commitRangeOnEnd:true,endValue:'2026-10-28',onChange:(range:unknown)=>selected.push(range)},undefined,{2:'end',6:{start:'2026-10-22',end:'2026-10-28'}});
 e.find(x=>x.props['data-date']==='2026-10-29')!.props.onClick();assert.deepEqual(selected,[{start:'2026-10-22',end:'2026-10-29'}]);
});
test('closing a partial complete-range selection makes no submission',()=>{
 const selected:unknown[]=[];const e=renderPicker({commitRangeOnEnd:true,endValue:'2026-10-28',onChange:(range:unknown)=>selected.push(range)},undefined,{2:'end',6:{start:'2026-10-22',end:'2026-10-28'}});
 e.find(x=>x.props['aria-label']==='Close calendar')!.props.onClick();assert.deepEqual(selected,[]);
});
test('complete-range trigger is busy until its submitted range settles',()=>{
 const e=renderPicker({commitRangeOnEnd:true,endValue:'2026-10-28',defaultOpen:false},undefined,{6:{start:'2026-10-22',end:'2026-10-29'},7:true});
 assert.ok(e.filter(x=>x.props['aria-haspopup']==='dialog').every(x=>x.props.disabled===true));
 assert.ok(e.some(x=>x.props['aria-busy']===true));
});

test('complete-range end permits a valid range before the original start',()=>{
 const selected:unknown[]=[];const e=renderPicker({commitRangeOnEnd:true,endValue:'2026-10-28',onChange:(range:unknown)=>selected.push(range)},undefined,{2:'end',6:{start:'2026-10-18',end:'2026-10-28'}});
 const end=e.find(x=>x.props['data-date']==='2026-10-20')!;assert.equal(end.props.disabled,false);end.props.onClick();
 assert.deepEqual(selected,[{start:'2026-10-18',end:'2026-10-20'}]);
});
