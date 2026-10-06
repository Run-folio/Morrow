import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_MAP_DRAG_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3218";
const screenshotDir = process.env.MORROVIA_MAP_DRAG_SCREENSHOTS;

const places = [
  ["bukhara", "Bukhara", "Uzbekistan", 64.4207, 39.7747],
  ["samarkand", "Samarkand", "Uzbekistan", 66.9597, 39.6542],
  ["tashkent", "Tashkent", "Uzbekistan", 69.2401, 41.2995],
  ["almaty", "Almaty", "Kazakhstan", 76.886, 43.2389],
  ["bishkek", "Bishkek City", "Kyrgyzstan", 74.5698, 42.8746],
  ["dushanbe", "Dushanbe", "Tajikistan", 68.787, 38.5598],
] as const;

function fixtureStorage() {
  const stops = places.map(([id, name, country, longitude, latitude]) => ({ id, name, country, coordinates: [longitude, latitude] as [number, number] }));
  const allocations = Object.fromEntries(stops.map(({ id }) => [id, 2]));
  const draft = buildCredibleItinerary({ origin: "Madrid", stops, startDate: "2026-10-06", allocations, picks: {}, places: {} });
  const trip = tripFromBuilder({
    id: "trip-8893d9df-3820-457e-aea1-934d3c231919",
    origin: "Madrid", stops, startDate: "2026-10-06", endDate: "2026-10-18", picks: {}, mustDo: "",
    pace: "slow", hotels: "few", budget: "mid", draft, nightAllocations: allocations,
  });
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "desktop-map-drag-regression", now: "2026-10-05T18:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));
  return { trip, values: [...values.entries()] };
}

test("desktop map pan follows the whole mouse gesture on a six-stop route", { skip: !enabled, timeout: 60_000 }, async () => {
  const { trip, values } = fixtureStorage();
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const deviceScaleFactor of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor });
      try {
        await page.addInitScript((entries: [string, string][]) => {
          for (const [key, value] of entries) localStorage.setItem(key, value);
        }, values);
        await page.goto(`${baseUrl}/journey/${trip.id}/map`, { waitUntil: "domcontentloaded" });
        await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 2_000 }).catch(() => {});
        const map = page.locator(".planner-map").first();
        await map.locator("canvas.maplibregl-canvas").waitFor();
        await map.locator(".planner-map__stop").first().waitFor();
        await page.waitForFunction(() => ["detailed", "fallback"].includes(document.querySelector(".planner-map")?.getAttribute("data-basemap-status") ?? ""));
        await page.waitForTimeout(600);
        assert.equal(await map.locator(".planner-map__stop").count(), 6);
        const canvas = await map.locator("canvas.maplibregl-canvas").boundingBox();
        assert.ok(canvas);
        const x = canvas.x + canvas.width * 0.7;
        const y = canvas.y + canvas.height / 2;
        assert.equal(await page.evaluate(({ x, y }: { x: number; y: number }) => document.elementFromPoint(x, y)?.tagName, { x, y }), "CANVAS");
        const marker = map.locator(".planner-map__stop").first();
        const before = await marker.boundingBox();
        assert.ok(before);
        if (screenshotDir && deviceScaleFactor === 1) {
          mkdirSync(screenshotDir, { recursive: true });
          await page.screenshot({ path: `${screenshotDir}/before.png` });
        }
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let step = 1; step <= 12; step += 1) {
          await page.mouse.move(x + step * 10, y + step * 5);
          await page.waitForTimeout(25);
        }
        await page.mouse.up();
        await page.waitForTimeout(350);
        const after = await marker.boundingBox();
        assert.ok(after);
        if (screenshotDir && deviceScaleFactor === 1) await page.screenshot({ path: `${screenshotDir}/after.png` });
        assert.ok(after.x - before.x >= 90, `${deviceScaleFactor}x: 120px mouse drag moved marker ${after.x - before.x}px`);
        assert.ok(after.y - before.y >= 40, `${deviceScaleFactor}x: 60px mouse drag moved marker ${after.y - before.y}px`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
