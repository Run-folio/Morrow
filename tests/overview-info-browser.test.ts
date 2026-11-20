import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderBuilder } from "./helpers/builder-render.ts";

const enabled = process.env.MORROVIA_OVERVIEW_INFO_BROWSER_TESTS === "1";
const sourceOverrides = new Map([[fileURLToPath(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url)), `
  import { OverviewInfo } from "@/components/easyt/overview-info";
  import { TriangleAlert } from "lucide-react";
  export default function Fixture() {
    return <main id="start-building" style={{width: "min(100%, 400px)", padding: 16}}>
      <div style={{display: "flex", justifyContent: "end", marginTop: 80, overflow: "hidden", paddingBlock: 12}}>
        <OverviewInfo label="About First">First pieces of information that explain the displayed fact.</OverviewInfo>
        <OverviewInfo icon={TriangleAlert} label="Check transfer timing: Giza to Cairo">Second pieces of information, presented without losing the anchor.</OverviewInfo>
      </div>
      <p>Outside content</p>
    </main>;
  }
`]]);

test("Overview info supports keyboard focus, Escape without reopening, hover travel and one bubble at a time", { skip: !enabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({ path: "/", styled: true, offlineOnly: true, sourceOverrides });
  try {
    const { page } = view;
    await page.setViewportSize({ width: 1440, height: 900 });
    const first = page.getByRole("button", { name: "About First", exact: true });
    const second = page.getByRole("button", { name: "Check transfer timing: Giza to Cairo", exact: true });
    const tooltip = page.getByRole("tooltip");
    await page.keyboard.press("Tab");
    assert.equal(await first.evaluate((node: HTMLElement) => node === document.activeElement), true);
    await tooltip.filter({ hasText: "First pieces" }).waitFor();
    await page.keyboard.press("Escape");
    await tooltip.waitFor({ state: "detached" });
    assert.equal(await first.evaluate((node: HTMLElement) => node === document.activeElement), true);
    assert.equal(await first.getAttribute("aria-expanded"), "false");
    await page.keyboard.press("Tab");
    await tooltip.filter({ hasText: "Second pieces" }).waitFor();
    await first.hover();
    await tooltip.filter({ hasText: "First pieces" }).waitFor();
    assert.equal(await tooltip.count(), 1);
    await tooltip.hover();
    await page.waitForTimeout(200);
    assert.equal(await tooltip.isVisible(), true, "pointer may move onto the tooltip");
    // The portal can cover the paragraph below this artificial 400px-wide fixture.
    // This viewport corner is outside both the trigger and the 8px-inset portal.
    await page.mouse.click(2, 2);
    await tooltip.waitFor({ state: "detached" });
    assert.equal(await second.getAttribute("aria-expanded"), "false");
  } finally { await view.close(); }
});

test("touch toggles one portal safely inside a 320px viewport", { skip: !enabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({ path: "/", styled: true, offlineOnly: true, sourceOverrides });
  try {
    const browser = view.page.context().browser()!;
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 320, height: 640 } });
    try {
      const page = await context.newPage();
      await page.goto(view.page.url());
      const second = page.getByRole("button", { name: "Check transfer timing: Giza to Cairo", exact: true });
      await second.tap();
      const tooltip = page.getByRole("tooltip");
      const b = await tooltip.boundingBox();
      assert.ok(b && b.x >= 0 && b.x + b.width <= 320 && b.y >= 0 && b.y + b.height <= 640);
      assert.equal(await tooltip.evaluate((node: HTMLElement) => node.parentElement === document.body), true);
      await second.tap();
      await tooltip.waitFor({ state: "detached" });
      await second.tap();
      await tooltip.waitFor();
      await page.getByRole("button", { name: "About First", exact: true }).tap();
      await tooltip.filter({ hasText: "First pieces" }).waitFor();
      assert.equal(await tooltip.count(), 1);
    } finally { await context.close(); }
  } finally { await view.close(); }
});
