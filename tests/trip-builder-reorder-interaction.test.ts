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
  assert.deepEqual(source, ["a", "b", "c"]);
  assert.equal(moveOccurrenceId(source, "missing", 0), null);
  assert.equal(moveOccurrenceId(source, "b", 3), null);
});

test("drag, keyboard and menu share one preview and commit boundary", () => {
  const hook = readFileSync(new URL("../app/journey/new/use-builder-stop-reorder.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/journey/new/trip-builder-route-workspace.tsx", import.meta.url), "utf8");

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
    const source = view.page.getByRole("button", { name: new RegExp(`^Reorder ${initial[0]}, stop`) });
    assert.equal(await source.getAttribute("draggable"), "true");
    assert.equal(await source.isEnabled(), true);
    const dragEnterAccepted = await view.page.evaluate(() => {
      const source = document.querySelector<HTMLElement>('[data-builder-stop-index="0"] button[draggable="true"]');
      const target = document.querySelector<HTMLElement>('[data-builder-stop-index="2"]');
      if (!source || !target) throw new Error("Expected draggable source and target rows");
      const transfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const accepted = !target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
      return accepted;
    });
    assert.equal(dragEnterAccepted, true, "the row must accept a fast pointer drag before dragover fires");
    const reordered = await names();
    assert.equal(reordered[2], initial[0], JSON.stringify({ initial, reordered }));
    assert.deepEqual([...reordered].sort(), [...initial].sort());
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
