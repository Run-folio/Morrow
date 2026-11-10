import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = ts.createSourceFile("trip-starter.tsx", readFileSync(new URL("../components/easyt/trip-starter.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actualCallbacks() {
  let schedule: ts.ArrowFunction | undefined;
  let changeDay: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "schedule" && node.initializer && ts.isArrowFunction(node.initializer)) schedule = node.initializer;
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const attrs = node.attributes.properties;
      if (node.tagName.getText(source) === "EasyTSelect" && attrs.some(a => ts.isJsxAttribute(a) && a.name.getText(source) === "label" && a.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text === "Day")) {
        const attr = attrs.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === "onChange") as ts.JsxAttribute;
        if (attr.initializer && ts.isJsxExpression(attr.initializer)) changeDay = attr.initializer.expression;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(schedule); assert.ok(changeDay);
  return { schedule: schedule.getText(source), changeDay: changeDay.getText(source) };
}

test("accepted Day A scheduling does not dismiss a newer Day B choice", async () => {
  const callbacks = actualCallbacks();
  const originalIdea = { id: "activity" };
  let visibleIdea: unknown = originalIdea;
  let visibleDay = "day-a";
  let resolve!: (accepted: boolean) => void;
  const accepted = new Promise<boolean>(done => { resolve = done; });
  const savedDays: string[] = [];
  const context = {
    idea: originalIdea, dayId: "day-a", scheduleScope: { current: 0 },
    isGooglePlaceReferenceIdea: () => false, stopIsCurrent: () => true,
    scheduleItineraryIdea: (trip: object, _idea: object, day: string) => { savedDays.push(day); return trip; },
    mutation: { mutateTrip: (update: (trip: object) => object) => { update({}); return accepted; } },
    setIdea: (value: unknown) => { visibleIdea = value; }, setDayId: (value: string) => { visibleDay = value; },
  };
  const schedule = runInNewContext(`(${callbacks.schedule})`, context) as () => Promise<void>;
  const changeDay = runInNewContext(`(${callbacks.changeDay})`, context) as (event: { target: { value: string } }) => void;
  const pending = schedule();
  changeDay({ target: { value: "day-b" } });
  resolve(true); await pending;
  assert.deepEqual(savedDays, ["day-a"], "the accepted write remains bound to the submitted day");
  assert.equal(visibleIdea, originalIdea, "a newly edited choice remains open");
  assert.equal(visibleDay, "day-b");
});
