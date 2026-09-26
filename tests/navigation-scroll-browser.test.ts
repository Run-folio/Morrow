import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import test from "node:test";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const browserTestsEnabled = process.env.MORROVIA_NAVIGATION_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3000";

function browserStorage() {
  const values = new Map<string, string>();
  return {
    values,
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

function seedTrip(id: string) {
  const trip = tripFromBuilder({
    id,
    origin: "London",
    stops: [
      { id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
      { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
    ],
    startDate: "2027-04-01",
    endDate: "2027-04-10",
    picks: {},
    mustDo: "",
    pace: "slow",
    hotels: "few",
    budget: "mid",
    draft: [],
  });
  const storage = browserStorage();
  saveTripRecoveryToStorage(storage, trip, { writeId: "navigation-scroll-fixture", now: "2026-09-25T12:00:00.000Z" });
  return { trip, entries: [...storage.values.entries()] };
}

test("real navigation starts new pages at the top and retains browser history and contextual map targets", { skip: !browserTestsEnabled, timeout: 45_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await mobile.waitForTimeout(700);
    await mobile.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await mobile.locator('summary[aria-label="Open navigation"]').click();
    await mobile.getByRole("link", { name: "Routes", exact: true }).click();
    await mobile.waitForURL(/\/journey\/discover/);
    await mobile.waitForTimeout(700);
    assert.ok(await mobile.evaluate(() => window.scrollY <= 2), "Home → Routes starts at the top on mobile");
    await mobile.goBack();
    await mobile.waitForURL(`${baseUrl}/`);
    await mobile.goForward();
    await mobile.waitForURL(/\/journey\/discover/);
    await mobile.waitForTimeout(300);
    assert.ok(await mobile.evaluate(() => window.scrollY <= 2), "Forward navigation returns to the route page at its own saved top position");
    await mobile.close();

    const { trip, entries } = seedTrip("trip-40404040-4040-4040-8040-404040404063");
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.addInitScript((items: [string, string][]) => {
      for (const [key, value] of items) window.localStorage.setItem(key, value);
    }, entries);
    await desktop.goto(`${baseUrl}/journey/${trip.id}`, { waitUntil: "domcontentloaded" });
    await desktop.getByRole("heading", { name: /Japan/ }).waitFor();
    await desktop.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await desktop.getByRole("link", { name: "Route", exact: true }).click();
    await desktop.waitForURL(/\/journey\/my-routes\//);
    await desktop.waitForTimeout(1_500);
    assert.ok(await desktop.evaluate(() => window.scrollY <= 2), "Trip → Route remains at the top after route-map hydration");
    await desktop.getByRole("link", { name: /See the whole route/i }).first().click();
    await desktop.waitForFunction(() => location.hash === "#route-map" && window.scrollY > 200);
    assert.equal(await desktop.evaluate(() => location.hash), "#route-map", "contextual map targeting remains available");
    await desktop.goBack();
    await desktop.waitForURL(new RegExp(`/journey/${trip.id}$`));
    await desktop.goForward();
    await desktop.waitForURL(/\/journey\/my-routes\//);
    await desktop.waitForTimeout(1_200);
    assert.equal(await desktop.evaluate(() => location.hash), "#route-map", "browser Forward restores the contextual map target");
    assert.ok(await desktop.evaluate(() => window.scrollY > 200), "browser Forward restores the map position");
    await desktop.close();
  } finally {
    await browser.close();
  }
});
