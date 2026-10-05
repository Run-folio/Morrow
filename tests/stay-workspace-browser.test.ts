import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const base = process.env.MORROVIA_STAY_STORYBOOK_URL;

test("Stay map and property detail stay usable from shortlist to chosen state at product widths", { skip: !base, timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${base}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-stay--tokyo-three-night-stay&viewMode=story`);
      const map = page.getByRole("region", { name: "Stay map" });
      const card = page.getByRole("article").filter({ hasText: "City Inn" });
      const open = card.getByRole("button", { name: "Open details for City Inn" });
      await map.waitFor();
      await card.waitFor();
      const mapBox = await map.boundingBox();
      const cardBox = await card.boundingBox();
      assert.ok(mapBox && cardBox);
      if (width <= 900) assert.ok(mapBox.y < cardBox.y, `map should precede cards at ${width}px`);
      else assert.ok(mapBox.x > cardBox.x, "desktop map stays in the rail");
      await open.click();
      if (width <= 900) {
        const sheet = page.getByRole("dialog", { name: "City Inn" });
        await sheet.waitFor();
        await sheet.getByRole("button", { name: "Close details for City Inn" }).click();
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open details for City Inn");
        assert.equal(await open.evaluate((button: HTMLButtonElement) => document.activeElement === button), true);
      } else {
        await page.locator('[data-recommendation-detail-kind="accommodation"]').getByText("City Inn", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Close details for City Inn" }).click();
      }
      const pin = map.getByRole("button", { name: "Show City Inn" });
      await pin.click();
      await page.locator('[data-recommendation-detail-kind="accommodation"]').getByText("City Inn", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Close details for City Inn" }).click();
      try {
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Show City Inn", undefined, { timeout: 2000 });
      } catch {
        assert.fail(`pin focus did not return at ${width}px: ${await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName)}`);
      }
      await card.getByRole("button", { name: "Choose stay" }).click();
      await card.getByText("Chosen", { exact: true }).first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `horizontal overflow at ${width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("empty Stay state does not direct travellers to an absent provider action", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.goto(`${base}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-stay--empty-stay-search&viewMode=story`);
    const empty = page.getByText("No stay options found").locator("..");
    await empty.waitFor();
    assert.doesNotMatch(await empty.innerText(), /check the booking provider directly/i);
    const workspace = page.getByRole("region", { name: "Stay planning for Tokyo" });
    const bounds = await workspace.boundingBox();
    assert.ok(bounds && bounds.height < 500, "an empty Stay state should not reserve the full map-and-shortlist height");
  } finally { await browser.close(); }
});

test("legacy Google reference opens Morrovia's map with an accurate label", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.goto(`${base}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-stay--saved-google-stay-reference&viewMode=story`);
    const reference = page.getByRole("region", { name: "Saved Google stays" });
    await reference.waitFor();
    const link = reference.getByRole("link", { name: "View on map" });
    assert.match(await link.getAttribute("href") ?? "", /\/journey\/storybook-tokyo-return\/map/);
    assert.equal(await reference.getByRole("link", { name: /Google map/ }).count(), 0);
  } finally { await browser.close(); }
});
