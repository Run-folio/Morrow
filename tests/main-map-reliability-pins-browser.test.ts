import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_MAIN_MAP_STORY_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_STORYBOOK_URL ?? "http://127.0.0.1:6011";
const screenshotDir = process.env.MORROVIA_MAIN_MAP_SCREENSHOTS;
const storyPrefix = "morrovia-05-product-patterns-trip-workspace-map--local-";

test("main Map finder and persisted pins remain usable across responsive review states", { skip: !enabled, timeout: 180_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
    const states = [
      { name: "siem-reap-stay", marker: "Riverside Guesthouse, result" },
      { name: "hoi-an-eat", marker: "Riverside Kitchen, result" },
      { name: "hoi-an-stay", marker: "Old Town Guesthouse, result" },
      { name: "hoi-an-unavailable", status: /couldn’t load places here right now/i },
      { name: "hoi-an-empty", status: /No places found nearby/i },
      { name: "hanoi-planned", marker: "Temple of Literature, Planned" },
    ];
    for (const width of [390, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 900 } });
      try {
        for (const state of states) {
          await page.goto(`${baseUrl}/iframe.html?id=${storyPrefix}${state.name}&viewMode=story`, { waitUntil: "domcontentloaded" });
          await page.locator(".planner-map").waitFor();
          await page.waitForFunction(() => {
            const status = document.querySelector(".planner-map")?.getAttribute("data-basemap-status");
            return status === "detailed" || status === "fallback";
          }, undefined, { timeout: 15_000 });
          if (state.marker) {
            const marker = page.getByRole("button", { name: `Show ${state.marker}` });
            await marker.waitFor();
            const box = await marker.boundingBox();
            assert.ok(box && box.width >= 44 && box.height >= 44, `${state.name} ${width}px marker hit target`);
          }
          if (state.status) await page.getByText(state.status).waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${state.name} ${width}px horizontal overflow`);
          if (state.name === "hanoi-planned") {
            assert.equal(await page.locator(".planner-map__local-place.is-scheduled").count(), 2);
            assert.equal(await page.locator(".planner-map__local-place.is-saved").count(), 1);
            const temple = page.getByRole("button", { name: "Show Temple of Literature, Planned" });
            const palace = page.getByRole("button", { name: "Show Presidential Palace, Planned" });
            await palace.focus();
            await page.keyboard.press("Enter");
            assert.equal(await palace.getAttribute("aria-pressed"), "true");
            assert.equal(await temple.getAttribute("aria-pressed"), "false");
            assert.equal(await page.locator(".planner-map__local-place").count(), 3, "selection does not duplicate pins");
          }
          if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/${state.name}-${width}.png` });
        }
      } finally {
        await page.close();
      }
    }
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.goto(`${baseUrl}/iframe.html?id=${storyPrefix}hoi-an-retry&viewMode=story`, { waitUntil: "domcontentloaded" });
        const retry = page.getByRole("button", { name: "Try again" });
        await retry.waitFor();
        assert.equal(await page.locator(".planner-map__local-place").count(), 0, "failed search shows no fabricated result");
        await retry.click();
        const marker = page.getByRole("button", { name: "Show Old Town Kitchen, result" });
        await marker.waitFor();
        assert.equal(await page.locator(".planner-map__local-place").count(), 1);
        assert.equal(await retry.count(), 0, "recovery clears the failed state");
        if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/hoi-an-retry-success-${width}.png` });
      } finally {
        await page.close();
      }
    }
    for (const width of [390, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 900 } });
      try {
        await page.goto(`${baseUrl}/iframe.html?id=${storyPrefix}hanoi-plan&viewMode=story`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Show Presidential Palace on the map" }).click();
        const palace = page.getByRole("button", { name: "Show Presidential Palace, Planned" });
        assert.equal(await palace.getAttribute("aria-pressed"), "true", `${width}px Palace card selects its canonical pin`);
        assert.equal(await page.locator(".planner-map__local-place").count(), 3);
        if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/hanoi-palace-card-${width}.png` });
        await page.goto(`${baseUrl}/iframe.html?id=${storyPrefix}hanoi-plan&viewMode=story`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Show Temple of Literature on the map" }).click();
        assert.equal(await page.getByRole("button", { name: "Show Temple of Literature, Planned" }).getAttribute("aria-pressed"), "true", `${width}px Temple card selects its canonical pin`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
