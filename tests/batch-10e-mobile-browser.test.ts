import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_BATCH10E_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_STORYBOOK_URL ?? "http://127.0.0.1:6006";
const story = (id: string) => `${baseUrl}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-${id}&viewMode=story`;

test("Batch 10E mobile Itinerary and Stay keep activity identity, compact media, map markers and actions reachable", { skip: !enabled, timeout: 90_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const width of [320, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(story("stay--no-property-image-mobile-390"), { waitUntil: "domcontentloaded" });
      const detail = page.locator('[data-recommendation-detail-kind="accommodation"]');
      await detail.waitFor();
      assert.equal(await detail.locator("img").count(), 0, "no-image detail has no media element");
      const shellBox = await detail.boundingBox();
      const headingBox = await detail.locator("h2").boundingBox();
      assert.ok(shellBox && headingBox && headingBox.y - shellBox.y < 90, "property content starts immediately without a media-height gap");
      const choose = detail.getByRole("button", { name: "Choose stay" });
      await choose.scrollIntoViewIfNeeded();
      const chooseBox = await choose.boundingBox();
      assert.ok(chooseBox && chooseBox.y >= 0 && chooseBox.y + chooseBox.height <= 844, "Choose stay is reachable above the viewport edge");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
      if (width === 390) await page.screenshot({ path: "/tmp/batch-10e-stay-no-image-390.png", fullPage: true });

      await page.goto(story("stay--image-property-detail-mobile-390"), { waitUntil: "domcontentloaded" });
      const imageDetail = page.locator('[data-recommendation-detail-kind="accommodation"]');
      await imageDetail.waitFor();
      assert.equal(await imageDetail.locator("img").count(), 1, "sourced property image remains visible");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
      if (width === 390) await page.screenshot({ path: "/tmp/batch-10e-stay-image-390.png", fullPage: true });

      await page.goto(story("itinerary--generated-botanical-garden-mobile-390"), { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Day by day" }).first().waitFor();
      const editor = page.locator("details").filter({ has: page.getByText("Edit activities and order", { exact: true }) }).first();
      await editor.locator("summary").click();
      const editorText = await editor.innerText();
      assert.equal((editorText.match(/Akureyri Botanical Garden/g) ?? []).length, 1, "one real activity appears in editing controls");
      assert.doesNotMatch(editorText, /quiet walk among northern plants/);
      const context = page.locator("details").filter({ has: page.getByText(/Day context and notes/) }).first();
      await context.locator("summary").click();
      assert.match(await context.innerText(), /quiet walk among northern plants/);
      const daySelect = page.getByLabel("Jump to date / destination");
      assert.ok(await daySelect.isVisible(), "day navigation remains available");
      await daySelect.selectOption({ index: 0 });
      assert.match(await daySelect.inputValue(), /day-1/i);
      await daySelect.selectOption({ index: 1 });
      const addNote = page.getByRole("button", { name: "Add note", exact: true });
      await addNote.scrollIntoViewIfNeeded();
      const addNoteBox = await addNote.boundingBox();
      assert.ok(addNoteBox && addNoteBox.y >= 0 && addNoteBox.y + addNoteBox.height <= 844, "itinerary action is reachable");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
      if (width === 390) await page.screenshot({ path: "/tmp/batch-10e-botanical-editor-390.png", fullPage: true });

      await page.close();
    }

    const mapPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mapPage.goto(story("itinerary--crowded-day-mini-map-mobile-390"), { waitUntil: "domcontentloaded" });
    await mapPage.getByText("Day map", { exact: true }).waitFor();
    await mapPage.waitForFunction(() => document.querySelectorAll(".planner-map__pin").length >= 3);
    await mapPage.waitForFunction(() => document.querySelector(".planner-map")?.getAttribute("data-basemap-status") !== "loading");
    const markerBoxes = await mapPage.locator(".planner-map__pin").evaluateAll((elements: HTMLElement[]) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    assert.equal(await mapPage.locator(".planner-map__leg").count(), 0, "day preview omits transfer chrome");
    for (let index = 0; index < markerBoxes.length; index += 1) {
      for (const other of markerBoxes.slice(index + 1)) {
        const marker = markerBoxes[index]!;
        const overlap = Math.max(0, Math.min(marker.x + marker.width, other.x + other.width) - Math.max(marker.x, other.x))
          * Math.max(0, Math.min(marker.y + marker.height, other.y + other.height) - Math.max(marker.y, other.y));
        assert.equal(overlap, 0, "day markers remain individually readable after map camera settles");
      }
    }
    assert.match(await mapPage.getByRole("link", { name: "Open full map" }).getAttribute("href") ?? "", /\/journey\/.*\/map/);
    await mapPage.locator(".planner-map").first().screenshot({ path: "/tmp/batch-10e-day-mini-map-390.png" });
    await mapPage.goto(story("itinerary--spread-day-mini-map-mobile-390"), { waitUntil: "domcontentloaded" });
    await mapPage.waitForFunction(() => document.querySelectorAll(".planner-map__pin").length >= 2);
    await mapPage.waitForFunction(() => document.querySelector(".planner-map")?.getAttribute("data-basemap-status") !== "loading");
    await mapPage.waitForTimeout(1200); // MapLibre's camera fit animates after the basemap becomes ready.
    const allPinsFramed = await mapPage.locator(".planner-map").first().evaluate((map: HTMLElement) => {
      const frame = map.getBoundingClientRect();
      return [...map.querySelectorAll(".planner-map__pin")].every((pin) => {
        const marker = pin.getBoundingClientRect();
        const centerX = marker.x + marker.width / 2;
        const centerY = marker.y + marker.height / 2;
        return centerX > frame.left + 12 && centerX < frame.right - 12 && centerY > frame.top + 12 && centerY < frame.bottom - 12;
      });
    });
    assert.ok(allPinsFramed, "geographically spread day pins stay inside the mobile mini-map");
    await mapPage.locator(".planner-map").first().screenshot({ path: "/tmp/batch-10e-spread-day-mini-map-390.png" });
    await mapPage.close();

    const densityPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const noOverflow = () => densityPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    await densityPage.goto(`${baseUrl}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-overview--before-you-go-mobile-390&viewMode=story`);
    await densityPage.getByRole("heading", { name: "Get ready for a smoother trip" }).waitFor();
    assert.ok(await densityPage.getByText("Find stays", { exact: true }).isVisible());
    assert.ok(await noOverflow());
    await densityPage.screenshot({ path: "/tmp/batch-10e-prep-after-390.png", fullPage: true });

    await densityPage.goto(`${baseUrl}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-explicit-plans--mobile-390&viewMode=story`);
    await densityPage.getByRole("heading", { name: "Plans you asked us to keep" }).waitFor();
    assert.ok(await densityPage.getByText("Schedule in itinerary").isVisible());
    assert.ok(await densityPage.getByText("Adjust route or commitment").isVisible());
    assert.ok(await noOverflow());
    await densityPage.screenshot({ path: "/tmp/batch-10e-kept-after-390.png", fullPage: true });

    await densityPage.goto(`${baseUrl}/iframe.html?id=morrovia-04-structure-footer--mobile-390&viewMode=story`);
    const footer = densityPage.getByRole("contentinfo");
    await footer.waitFor();
    assert.equal(await footer.getByRole("link").count(), 8, "legal and navigation links remain available");
    assert.ok(await noOverflow());
    await densityPage.screenshot({ path: "/tmp/batch-10e-footer-after-390.png", fullPage: true });
    await densityPage.close();
  } finally {
    await browser.close();
  }
});
