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
    assert.equal(await page.getByRole("button", { name: "Close selected place details" }).count(), 0, "the chevron owns mobile sheet collapse");
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
    assert.match(await page.locator("button[aria-controls='map-contextual-sheet-content']").getAttribute("aria-label") ?? "", /Haveli Dharampura/);
  } finally {
    await browser.close();
  }
});

test("mobile full-screen Map orders global actions before stops and gives the selected entity one clear sheet heading", { skip: !enabled, timeout: 60_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${storybook}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-map--mobile-390-selected-detail-open&viewMode=story`, { waitUntil: "domcontentloaded" });
    await page.locator("section[data-recommendation-detail-kind]").waitFor();
    await page.waitForFunction(() => {
      const status = document.querySelector(".planner-map")?.getAttribute("data-basemap-status");
      return status !== null && status !== undefined && status !== "loading";
    }, undefined, { timeout: 15_000 });

    const sheetToggle = page.locator("button[aria-controls='map-contextual-sheet-content']");
    await sheetToggle.waitFor({ state: "visible" });
    assert.match(await sheetToggle.getAttribute("aria-label") ?? "", /Collapse Haveli Dharampura details/);
    assert.equal(await page.locator(".mapContextEyebrow").isVisible().catch(() => false), false, "generic selected-place kicker is hidden in the mobile sheet");
    assert.equal(await page.getByRole("button", { name: "Close selected place details" }).count(), 0, "the mobile detail has no redundant clear/close control");
    assert.equal(await page.locator("section[data-recommendation-detail-kind] header > span").isVisible().catch(() => false), false, "the embedded detail does not repeat its category/title header");
    await page.screenshot({ path: "/tmp/batch-10h-map-selected-expanded-390.png", fullPage: false });

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => {
        const actions = document.querySelector<HTMLElement>("[data-map-route-reset]")?.parentElement;
        const track = document.querySelector<HTMLElement>("[data-route-stop-navigation]");
        const first = track?.querySelector<HTMLElement>("button");
        const actionBounds = actions?.getBoundingClientRect();
        const trackBounds = track?.getBoundingClientRect();
        const firstBounds = first?.getBoundingClientRect();
        return {
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          actionTop: actionBounds?.top ?? Infinity,
          trackTop: trackBounds?.top ?? -Infinity,
          actionsRight: actionBounds?.right ?? Infinity,
          firstLeft: firstBounds?.left ?? -Infinity,
          trackClientWidth: track?.clientWidth ?? 0,
          trackScrollWidth: track?.scrollWidth ?? 0,
          actionTargets: [...(actions?.querySelectorAll<HTMLElement>(":scope > button, :scope > a, :scope > details > summary") ?? [])].map((element) => {
            const bounds = element.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height };
          }),
        };
      });
      await page.screenshot({ path: `/tmp/batch-10h-map-header-${width}.png`, fullPage: false });
      assert.ok(layout.actionTop < layout.trackTop, `${width}px global actions precede the stop navigation`);
      assert.ok(layout.actionsRight <= width + 1, `${width}px global actions fit within the viewport`);
      assert.ok(layout.actionTargets.length >= 2, `${width}px has whole-route, return, and More actions`);
      assert.ok(layout.actionTargets.every((target: { left: number; right: number; width: number; height: number }) => target.left >= -1 && target.right <= width + 1 && target.width >= 40 && target.height >= 40), `${width}px global actions remain in-view touch targets`);
      assert.ok(layout.firstLeft >= -1, `${width}px first stop chip is not clipped`);
      assert.equal(layout.document > layout.viewport + 1, false, `${width}px has no horizontal document overflow`);
      assert.ok(layout.trackScrollWidth >= layout.trackClientWidth, `${width}px stop rail can scroll when needed`);
      const lastChipFits = await page.locator("[data-route-stop-navigation]").evaluate((element: Element) => {
        const track = element as HTMLElement;
        const last = track.querySelectorAll("button").item(track.querySelectorAll("button").length - 1);
        if (!last) return false;
        track.scrollLeft = track.scrollWidth;
        const bounds = last.getBoundingClientRect();
        const trackBounds = track.getBoundingClientRect();
        const fits = bounds.left >= trackBounds.left - 1 && bounds.right <= trackBounds.right + 1;
        track.scrollLeft = 0;
        return fits;
      });
      assert.equal(lastChipFits, true, `${width}px last stop chip can be reached without document scrolling`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await sheetToggle.click();
    await page.locator("#map-contextual-sheet[data-mobile-drawer-state='collapsed']").waitFor();
    assert.match(await sheetToggle.getAttribute("aria-label") ?? "", /Expand Haveli Dharampura details/, "collapsing retains the selected entity");
    await page.screenshot({ path: "/tmp/batch-10h-map-selected-collapsed-390.png", fullPage: false });

    await sheetToggle.click();
    await page.locator("#map-contextual-sheet[data-mobile-drawer-state='open']").waitFor();
    await page.locator("[data-route-stop-navigation] button").filter({ hasText: "Agra" }).first().click();
    assert.match(await sheetToggle.getAttribute("aria-label") ?? "", /Collapse Agra details/);
    assert.equal(await page.locator("section[data-recommendation-detail-kind]").count(), 0, "choosing another stop replaces the local-place detail");
    await page.getByRole("button", { name: "Whole route" }).click();
    assert.equal(await page.locator("[data-mobile-drawer-state='collapsed']").count(), 1, "Whole route remains a working global map action");
    const more = page.locator("summary[aria-label='Trip actions']");
    await more.waitFor({ state: "visible" });
    await more.click();
    assert.equal(await more.evaluate((element: Element) => (element.parentElement as HTMLDetailsElement).open), true);

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.goto(`${storybook}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-map--composition-hotel-selected-no-provider-image&viewMode=story`, { waitUntil: "domcontentloaded" });
    await desktop.locator("section[data-recommendation-detail-kind]").waitFor();
    await desktop.getByRole("button", { name: "Close selected place details" }).waitFor({ state: "visible" });
    assert.equal(await desktop.locator("section[data-recommendation-detail-kind] header > span").isVisible(), true, "desktop retains its selected-detail header");
    const desktopLayout = await desktop.evaluate(() => {
      const actions = document.querySelector<HTMLElement>("[data-map-route-reset]")?.parentElement?.getBoundingClientRect();
      const track = document.querySelector<HTMLElement>("[data-route-stop-navigation]")?.getBoundingClientRect();
      return { actionsLeft: actions?.left ?? -Infinity, trackRight: track?.right ?? Infinity };
    });
    assert.ok(desktopLayout.actionsLeft >= desktopLayout.trackRight - 1, "desktop keeps stop navigation visually before Map actions");
    await desktop.close();
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
