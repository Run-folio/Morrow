import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { moveOccurrenceId } from "../app/journey/new/use-builder-stop-reorder.ts";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";

const browserTest = (name: string, run: () => Promise<void>) => test(name, { skip: !builderBrowserTestsEnabled, timeout: 20_000 }, run);

test("moves stable occurrence IDs without mutating the source", () => {
  const source = ["a", "b", "c"];
  assert.deepEqual(moveOccurrenceId(source, "b", 0), ["b", "a", "c"]);
  assert.deepEqual(moveOccurrenceId(source, "a", 1), ["b", "a", "c"], "first should move to the middle");
  assert.deepEqual(moveOccurrenceId(source, "b", 2), ["a", "c", "b"], "middle should move to the end");
  assert.deepEqual(moveOccurrenceId(source, "c", 0), ["c", "a", "b"], "last should move to the front");
  assert.deepEqual(source, ["a", "b", "c"]);
  assert.equal(moveOccurrenceId(source, "missing", 0), null);
  assert.equal(moveOccurrenceId(source, "b", 3), null);
});

test("drag, keyboard and menu share one preview and commit boundary", () => {
  const hook = readFileSync(new URL("../app/journey/new/use-builder-stop-reorder.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/journey/new/trip-builder-route-workspace.tsx", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");

  assert.match(hook, /builderStopOrderFingerprint\(stopIds\)/,
    "a gesture must capture the occurrence-order source it started from");
  assert.match(hook, /publishPreview\(result\.ids\)/);
  assert.match(hook, /onCommit\(ids, source\)/,
    "drag and menu must share one commit callback");
  assert.match(hook, /event\.key === "Escape"/);
  assert.match(hook, /event\.key === "ArrowUp" \|\| event\.key === "ArrowLeft"/);
  assert.match(hook, /event\.key === "ArrowDown" \|\| event\.key === "ArrowRight"/);
  assert.doesNotMatch(hook, /saveTrip|saveRecovery|persist/,
    "the interaction layer must never own persistence");

  assert.match(workspace, /aria-label=\{`Reorder \$\{stop\.name\}, stop \$\{index \+ 1\}`\}/);
  assert.match(workspace, />Move stop</);
  assert.match(workspace, /moveFromMenu\(stop\.id, index - 1\)/);
  assert.match(workspace, /moveFromMenu\(stop\.id, index \+ 1\)/);
  assert.match(workspace, /onPreviewOrder/);
  assert.match(workspace, /onCommitOrder/);
  assert.match(workspace, /isDragging \? styles\.builderRouteRowDragging/,
    "the canonical dragged occurrence should receive pickup feedback");
  assert.match(workspace, /isDropTarget \? styles\.builderRouteDropTarget/,
    "the validated preview position should own the row insertion marker");
  assert.match(builder, /dragTargetId === stop\.id \? styles\.handoffStopDropTarget/,
    "stop pills should expose their current valid insertion target");
  assert.match(styles, /\.builderRouteRowDragging\{[^}]*box-shadow:/,
    "route rows should visibly lift on pickup");
  assert.match(styles, /\.builderRouteDropTarget:before\{[^}]*height:2px/,
    "the intended route-row insertion position should span the row");
  assert.match(styles, /\.handoffStopDropTarget:before\s*\{[^}]*width:\s*2px/,
    "compact stop pills should show an insertion marker between pills");
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.builderRouteRow[^{]*\{transition:none\}/,
    "reorder feedback must respect reduced-motion preferences");
});

browserTest("keyboard and menu reorder the same canonical route exactly once", async () => {
  const draft = routePlannerPayload(publicRouteDetailFor("morocco-rail")!.planDraft);
  draft.structuredBrief = { ...draft.structuredBrief!, hardConstraints: [] };
  const view = await renderBuilder({ query: "?homeDraft=1", draft });
  try {
    view.page.setDefaultTimeout(3_000);
    const routeNames = async () => view.page.locator("[data-builder-stop-index]").evaluateAll((rows: Element[]) => rows.map((row) => row.querySelector('[role="cell"] strong')?.textContent ?? ""));
    const initial = await routeNames();
    const first = initial[0];
    const grip = view.page.getByRole("button", { name: new RegExp(`^Reorder ${first}, stop`) });
    await grip.focus();
    await grip.press("Space");
    await grip.press("ArrowDown");
    await grip.press("Space");
    const afterKeyboard = await routeNames();
    assert.equal(afterKeyboard[1], first);

    await view.page.locator(`summary[aria-label="Actions for ${first}"]`).click();
    await view.page.getByRole("button", { name: "Earlier" }).click();
    assert.deepEqual(await routeNames(), initial);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

browserTest("native pointer drag commits the occurrence selected at dragstart", async () => {
  const draft = routePlannerPayload(publicRouteDetailFor("morocco-rail")!.planDraft);
  draft.structuredBrief = { ...draft.structuredBrief!, hardConstraints: [] };
  const view = await renderBuilder({ query: "?homeDraft=1", draft });
  try {
    view.page.setDefaultTimeout(3_000);
    const rows = view.page.locator("[data-builder-stop-index]");
    const names = async () => rows.evaluateAll((items: Element[]) => items.map((row) => row.querySelector('[role="cell"] strong')?.textContent ?? ""));
    const initial = await names();
    const drag = (sourceIndex: number, targetIndex: number) => view.page.evaluate(({ sourceIndex, targetIndex }: { sourceIndex: number; targetIndex: number }) => {
      const source = document.querySelector<HTMLElement>(`[data-builder-stop-index="${sourceIndex}"] button[draggable="true"]`);
      const target = document.querySelector<HTMLElement>(`[data-builder-stop-index="${targetIndex}"]`);
      if (!source || !target) throw new Error("Expected draggable source and target rows");
      const transfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const accepted = !target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
      return accepted;
    }, { sourceIndex, targetIndex });

    assert.equal(await drag(0, 1), true, "first to middle should accept dragenter before dragover");
    assert.deepEqual(await names(), [initial[1], initial[0], ...initial.slice(2)]);
    assert.equal(await drag(1, initial.length - 1), true, "middle to last should remain a valid target");
    assert.deepEqual(await names(), [...initial.slice(1), initial[0]]);
    assert.equal(await drag(initial.length - 1, 0), true, "last to first should remain a valid target");
    assert.deepEqual(await names(), initial);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

browserTest("homepage stop pills reorder first, middle and last occurrences", async () => {
  const { sourceRouteKey: _sourceRouteKey, ...draft } = routePlannerPayload(publicRouteDetailFor("morocco-rail")!.planDraft);
  draft.structuredBrief = { ...draft.structuredBrief!, hardConstraints: [] };
  const view = await renderBuilder({ query: "?homeDraft=1", draft });
  try {
    view.page.setDefaultTimeout(3_000);
    await view.page.getByRole("button", { name: "Add stop" }).click();
    const pills = view.page.locator('[role="listitem"][draggable="true"]');
    const names = () => pills.evaluateAll((items: Element[]) => items.map((item) => item.querySelector("span")?.textContent ?? ""));
    const initial = await names();
    assert.equal(initial.length, 3);
    const drag = (sourceIndex: number, targetIndex: number) => view.page.evaluate(({ sourceIndex, targetIndex }: { sourceIndex: number; targetIndex: number }) => {
      const items = document.querySelectorAll<HTMLElement>('[role="listitem"][draggable="true"]');
      const source = items[sourceIndex];
      const target = items[targetIndex];
      if (!source || !target) throw new Error("Expected draggable source and target stop pills");
      const transfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const accepted = !target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
      return accepted;
    }, { sourceIndex, targetIndex });

    assert.equal(await drag(0, 1), true);
    assert.deepEqual(await names(), [initial[1], initial[0], initial[2]]);
    assert.equal(await drag(1, 2), true);
    assert.deepEqual(await names(), [initial[1], initial[2], initial[0]]);
    assert.equal(await drag(2, 0), true);
    assert.deepEqual(await names(), initial);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
