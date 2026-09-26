import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";
import { saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_BATCH10E_APP_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";

test("real mobile itinerary opens the full map and returns to the same trip", { skip: !enabled, timeout: 90_000 }, async () => {
  const stop = { id: "akureyri", name: "Akureyri", country: "Iceland", coordinates: [-18.0907, 65.6885] as [number, number] };
  const trip = tripFromBuilder({
    id: "trip-10e010e0-10e0-40e0-80e0-10e010e010e0", origin: "London", stops: [stop],
    startDate: "2026-10-01", endDate: "2026-10-02", picks: { akureyri: ["Akureyri Botanical Garden"] },
    mustDo: "Nature", pace: "slow", hotels: "few", budget: "mid",
    draft: buildCredibleItinerary({
      origin: "London", stops: [stop], startDate: "2026-10-01", allocations: { akureyri: 2 },
      picks: { akureyri: ["Akureyri Botanical Garden"] },
      places: { akureyri: [{ title: "Akureyri Botanical Garden", area: "Akureyri", type: "Nature", cost: 0, tags: ["Nature"], description: "A quiet walk among northern plants.", coordinates: [-18.101, 65.677] }] },
    }),
  });
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "batch-10e-map", now: "2026-09-26T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((entries: [string, string][]) => {
      for (const [key, value] of entries) window.localStorage.setItem(key, value);
    }, [...values.entries()]);
    await page.goto(`${baseUrl}/journey/${trip.id}/itinerary`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Day by day" }).first().waitFor();
    await page.getByLabel("Jump to date / destination").selectOption({ index: 1 });
    await page.getByRole("link", { name: "Open full map" }).click();
    await page.waitForURL(new RegExp(`/journey/${trip.id}/map`));
    await page.locator(".planner-map").first().waitFor();
    await page.waitForFunction(() => document.querySelector(".planner-map")?.getAttribute("data-basemap-status") !== "loading");
    assert.ok(await page.locator(".planner-map").first().isVisible(), "full map is displayed");
    await page.screenshot({ path: "/tmp/batch-10e-full-map-390.png", fullPage: false });
    await page.getByRole("button", { name: "Back to trip" }).click();
    await page.waitForURL(new RegExp(`/journey/${trip.id}/itinerary`));
    await page.getByRole("heading", { name: "Day by day" }).first().waitFor();
    assert.ok(await page.getByText("Akureyri Botanical Garden").first().isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
    await page.close();
  } finally {
    await browser.close();
  }
});
