import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_BATCH10I_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_STORYBOOK_URL ?? "http://127.0.0.1:6006";
const story = (surface: string) => `${baseUrl}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-${surface}&viewMode=story`;

test("Batch 10I mobile Explore omits empty result media while preserving sourced images", { skip: !enabled, timeout: 90_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const width of [320, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(story("explore--mobile-390-missing-image"), { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Open details for San Blas" }).click({ position: { x: 16, y: 16 } });
      const noImageCards = page.locator('[data-image-state="compact-none"]');
      assert.ok(await noImageCards.count() >= 1, "image-less Explore cards omit their media region");
      assert.equal(await noImageCards.locator('[class*="cardImage"]').count(), 0);
      const detail = page.locator('[data-recommendation-detail-kind="activity"]');
      await detail.waitFor();
      assert.equal(await detail.locator('[class*="heroFallback"]').count(), 0, "image-less Explore detail omits empty hero treatment");
      assert.ok(await detail.getByRole("heading", { name: "San Blas" }).isVisible());
      const saveAction = detail.getByRole("button", { name: "Save for later" });
      assert.ok(await saveAction.isVisible(), "primary detail action remains visible");
      const actionBox = await saveAction.boundingBox();
      assert.ok(actionBox && actionBox.y >= 0 && actionBox.y + actionBox.height <= 844, "primary action remains reachable inside the mobile viewport");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
      if (width === 390) await page.screenshot({ path: "/tmp/batch-10i-explore-no-image-390.png", fullPage: true });
      await page.close();
    }

    const imagePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await imagePage.goto(story("explore--selected-detail"), { waitUntil: "domcontentloaded" });
    const imageDetail = imagePage.locator('[data-recommendation-detail-kind="activity"]');
    await imageDetail.waitFor();
    await imageDetail.locator("img").waitFor();
    assert.equal(await imageDetail.locator('[class*="heroFallback"]').count(), 0, "image-backed Explore detail keeps its real image without fallback");
    assert.equal(await imagePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
    await imagePage.screenshot({ path: "/tmp/batch-10i-explore-image-390.png", fullPage: true });
    await imagePage.close();

    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktopPage.goto(story("explore--missing-image"), { waitUntil: "domcontentloaded" });
    await desktopPage.getByRole("button", { name: "Open details for San Blas" }).click({ position: { x: 16, y: 16 } });
    const desktopDetail = desktopPage.locator('[data-recommendation-detail-kind="activity"]');
    await desktopDetail.waitFor();
    assert.equal(await desktopDetail.locator('[class*="heroFallback"]').count(), 0);
    assert.ok(await desktopDetail.getByRole("heading", { name: "San Blas" }).isVisible());
    assert.equal(await desktopPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
    await desktopPage.screenshot({ path: "/tmp/batch-10i-explore-no-image-desktop-1440.png", fullPage: true });
    await desktopPage.close();
  } finally {
    await browser.close();
  }
});

test("Batch 10I long-trip day navigation remains usable without horizontal overflow", { skip: !enabled, timeout: 90_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const width of [320, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(story("itinerary--long-trip-late-day"), { waitUntil: "domcontentloaded" });
      const selector = page.getByLabel("Jump to date / destination");
      await selector.waitFor();
      assert.equal(await selector.evaluate((element: HTMLSelectElement) => element.tagName), "SELECT", "current day navigation is the shared native select");
      assert.ok(await selector.isVisible());
      if (width === 390) await page.screenshot({ path: "/tmp/batch-10i-day-selector-closed-390.png", fullPage: true });
      await selector.click();
      if (width === 390) await page.screenshot({ path: "/tmp/batch-10i-day-selector-open-390.png", fullPage: true });
      await selector.selectOption({ index: 0 });
      await selector.selectOption({ index: 1 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
