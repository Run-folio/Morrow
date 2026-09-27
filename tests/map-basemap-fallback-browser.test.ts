import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_MAP_FALLBACK_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";

test("a provider failure before initial map load keeps canonical Builder stop markers interactive through fallback and Retry", { skip: !enabled, timeout: 90_000 }, async () => {
  const trip = tripFromBuilder({
    id: "trip-51515151-5151-4151-8151-515151515151",
    origin: "London",
    stops: [
      { id: "canonical-kanazawa", name: "Kanazawa", country: "Japan", coordinates: [136.6562, 36.5613] },
      { id: "canonical-kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
      { id: "canonical-osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937] },
    ],
    startDate: "2027-04-01", endDate: "2027-04-12", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid", draft: [],
  });
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "map-basemap-fallback-browser", now: "2026-09-27T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));

  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript((entries: [string, string][]) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    }, [...values.entries()]);
    let blockDetail = true;
    let releaseInitialRequest: () => void = () => {};
    const heldInitialRequest = new Promise<void>((resolve) => { releaseInitialRequest = resolve; });
    await page.route("https://tiles.openfreemap.org/**", async (route: { abort: () => Promise<void>; continue: () => Promise<void> }) => {
      if (blockDetail) {
        await heldInitialRequest;
        await route.abort();
      }
      else await route.continue();
    });
    await page.goto(`${baseUrl}/journey/new?trip=${trip.id}&recover=1`, { waitUntil: "domcontentloaded" });
    const route = page.locator("[data-builder-route-workspace]");
    await route.waitFor();
    const map = route.locator(".planner-map");
    await map.waitFor();
    const osaka = map.getByRole("button", { name: "Show Osaka, final destination", exact: true });
    try {
      assert.equal(await map.getAttribute("data-basemap-status"), "loading", "the detailed request is still pending before initial load");
      await osaka.waitFor({ timeout: 3_000 });
    } finally {
      releaseInitialRequest();
    }
    await page.waitForFunction(() => document.querySelector("[data-builder-route-workspace] .planner-map")?.getAttribute("data-basemap-status") === "fallback");
    assert.equal(await map.locator("[data-map-stop-id='canonical-osaka']").count(), 1);
    assert.equal(await map.locator(".planner-map__stop").count(), 3);
    await osaka.click();
    const osakaRow = route.locator("[data-builder-stop-index='2']");
    assert.equal(await osakaRow.getAttribute("aria-selected"), "true", "Osaka pin selects the canonical Osaka row on fallback");
    await route.locator("[data-builder-stop-index='1']").click();
    await osakaRow.click();
    assert.equal(await osaka.getAttribute("aria-pressed"), "true", "Osaka row selects the same map pin");

    blockDetail = false;
    await map.getByRole("button", { name: "Try detailed map again" }).click();
    await page.waitForFunction(() => document.querySelector("[data-builder-route-workspace] .planner-map")?.getAttribute("data-basemap-status") === "detailed", undefined, { timeout: 20_000 });
    assert.equal(await map.locator("[data-map-stop-id='canonical-osaka']").count(), 1, "retry does not duplicate Osaka");
    assert.equal(await map.locator(".planner-map__stop").count(), 3);
    await osaka.click();
    assert.equal(await osakaRow.getAttribute("aria-selected"), "true");
    await page.close();
  } finally {
    await browser.close();
  }
});
