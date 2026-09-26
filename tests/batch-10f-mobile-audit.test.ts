import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_BATCH10F_BROWSER_TESTS === "1";
const storybook = process.env.MORROVIA_STORYBOOK_URL ?? "http://127.0.0.1:6006";

test("mobile full-screen Map keeps a no-image selection compact and the map visible", { skip: !enabled, timeout: 45_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${storybook}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-map--composition-hotel-selected-no-provider-image&viewMode=story`, { waitUntil: "domcontentloaded" });
    const detail = page.locator("section[data-recommendation-detail-kind]");
    await detail.waitFor();
    await page.waitForFunction(() => {
      const status = document.querySelector(".planner-map")?.getAttribute("data-basemap-status");
      return status !== null && status !== undefined && status !== "loading";
    }, undefined, { timeout: 15_000 });
    await page.getByRole("button", { name: "Close selected place details" }).waitFor({ state: "visible" });
    await page.screenshot({ path: "/tmp/batch-10f-map-selected-no-image-390.png", fullPage: false });

    const state = await page.evaluate(() => {
      const map = document.querySelector<HTMLElement>(".planner-map");
      const drawer = document.querySelector<HTMLElement>("[class*='mapContextualSurface']");
      const detail = document.querySelector<HTMLElement>("section[data-recommendation-detail-kind]");
      const rect = (element: HTMLElement | null) => {
        const bounds = element?.getBoundingClientRect();
        return bounds ? { top: bounds.top, bottom: bounds.bottom, height: bounds.height } : null;
      };
      const scrollOwners = [...document.querySelectorAll<HTMLElement>("[class*='mapContextualSurface'], [class*='mobileMapSheetBody'], [aria-label='Selected map context'], section[data-recommendation-detail-kind]")]
        .filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY));
      return {
        map: rect(map), drawer: rect(drawer), detail: rect(detail),
        mapViewport: map && drawer ? Math.max(0, drawer.getBoundingClientRect().top - map.getBoundingClientRect().top) : 0,
        hasHero: Boolean(detail?.querySelector("[class*='hero']")),
        scrollOwnerCount: scrollOwners.length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    assert.ok(state.map, "the full-screen map remains rendered");
    assert.equal(state.hasHero, false, "a no-image detail has no placeholder media region");
    assert.ok(state.mapViewport >= 220, `meaningful map area remains visible: ${state.mapViewport}px`);
    assert.equal(state.scrollOwnerCount, 1, "the map drawer body owns detail scrolling");
    assert.equal(state.horizontalOverflow, false);

    const drawerBody = page.locator("[class*='mobileMapSheetBody']");
    await drawerBody.evaluate((element: HTMLElement) => { element.scrollTop = element.scrollHeight; });
    await page.getByRole("button", { name: "Save stay for Delhi" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close selected place details" }).waitFor({ state: "visible" });
  } finally {
    await browser.close();
  }
});

test("long itinerary warning wraps inside planned activity cards at narrow widths", { skip: !enabled, timeout: 45_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    await page.goto(`${storybook}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-itinerary-rich-day-planner--full-day-experience-warning&viewMode=story`, { waitUntil: "domcontentloaded" });
    const warning = page.getByRole("status").filter({ hasText: "This is a 10h experience" }).first();
    await warning.waitFor();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.screenshot({ path: `/tmp/batch-10f-warning-${width}.png`, fullPage: true });
      const state = await page.evaluate(() => {
        const warning = [...document.querySelectorAll<HTMLElement>("[role='status']")].find((element) => element.textContent?.includes("This is a 10h experience"));
        const bounds = warning?.getBoundingClientRect();
        return {
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          warningWidth: warning?.clientWidth ?? 0,
          warningScrollWidth: warning?.scrollWidth ?? 0,
          warningHeight: warning?.clientHeight ?? 0,
          warningRight: bounds?.right ?? Infinity,
          hasPlannedActivity: document.body.innerText.includes("Kyoto and Nara full-day experience"),
          hasSecondActivity: document.body.innerText.includes("Evening theatre"),
        };
      });
      assert.equal(state.document > state.viewport + 1, false, `${width}px has no horizontal document overflow`);
      assert.ok(state.warningRight <= width + 1, `${width}px warning stays within the viewport`);
      assert.ok(state.warningScrollWidth <= state.warningWidth + 1, `${width}px warning text wraps within its banner`);
      assert.equal(state.hasPlannedActivity, true, `${width}px preserves the planned full-day activity`);
      assert.equal(state.hasSecondActivity, true, `${width}px preserves the other planned activity`);
    }
  } finally {
    await browser.close();
  }
});
