import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const storybookUrl = process.env.MORROVIA_STORYBOOK_URL;
const screenshotDirectory = process.env.MORROVIA_SCREENSHOT_DIR;

test("Calendar shows one arrival marker for a day without a projected transfer", { skip: !storybookUrl, timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${storybookUrl}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-itinerary--calendar-attributed-photo&viewMode=story`);
    const firstDay = page.locator('article[class*="calendarDay"]').first();
    await firstDay.waitFor();
    const select = firstDay.locator('button[class*="calendarDaySelect"]');
    assert.match(await select.innerText(), /Tokyo/);
    assert.equal(await select.locator("small").count(), 0, "arrival day type must not duplicate the arrival marker");
    assert.equal((await select.locator("em").innerText()).trim(), "Arrival");
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: `${screenshotDirectory}/calendar-arrival-1440.png` });
    }
  } finally {
    await browser.close();
  }
});

test("Calendar shows the real arrival transfer without a generic arrival marker", { skip: !storybookUrl, timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${storybookUrl}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-itinerary--calendar-real-arrival-transfer&viewMode=story`);
    const firstDay = page.locator('article[class*="calendarDay"]').first();
    await firstDay.waitFor();
    const select = firstDay.locator('button[class*="calendarDaySelect"]');
    assert.match(await select.innerText(), /Tokyo/);
    assert.equal(await select.locator("small").count(), 0);
    assert.equal(await select.locator("em").count(), 0);
    assert.match(await firstDay.locator("li").first().innerText(), /London → Tokyo[\s\S]*Transfer/);
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: `${screenshotDirectory}/calendar-real-arrival-transfer-1440.png` });
    }
  } finally {
    await browser.close();
  }
});
