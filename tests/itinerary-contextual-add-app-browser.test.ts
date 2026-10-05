import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const base = process.env.MORROVIA_BASE_URL;

test("contextual Add uses daypart, discovery and restaurant results with durable canonical scheduling", { skip: !base, timeout: 120_000 }, async () => {
  const stop = { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] };
  const trip = tripFromBuilder({
    id: "trip-38700000-3870-4870-8870-387000000001", origin: "Tokyo", stops: [stop],
    startDate: "2026-10-04", endDate: "2026-10-06", picks: {}, mustDo: "",
    pace: "slow", hotels: "few", budget: "mid",
    draft: buildCredibleItinerary({ origin: "Tokyo", stops: [stop], startDate: "2026-10-04", allocations: { kyoto: 2 }, picks: {}, places: {} }),
    nightAllocations: { kyoto: 2 },
  });
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); }, removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "ticket-387-fixture", now: "2026-10-04T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript((entries: [string, string][]) => { for (const [key, value] of entries) if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [...values.entries()]);
      await page.route("**/api/journey-discover?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [
        { id: "kyoto-museum", title: "Kyoto Museum", area: "Central Kyoto", type: "Museum", tags: ["Culture"], description: "A museum of Kyoto art and history.", coordinates: [135.77, 35.01], qualityScore: 18 },
        { id: "kyoto-garden", title: "Kyoto Garden", area: "Central Kyoto", type: "Garden", tags: ["Nature"], description: "A public garden with walking paths.", coordinates: [135.76, 35.02], qualityScore: 17 },
      ] }) }));
      await page.route("**/api/journey-local-search?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [
        { id: "kyoto-restaurant", name: "Kyoto Supper", address: "Gion, Kyoto", category: "Restaurant", coordinates: [135.775, 35.004], mapsUrl: "https://maps.google.com/?q=Kyoto+Supper", provider: "openstreetmap" },
      ] }) }));
      await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
      await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
      const planner = page.locator('section[aria-label="Day 2 planner"]');
      await planner.waitFor({ state: "visible", timeout: 20_000 });
      const afternoonAdd = planner.getByRole("button", { name: /Add plan to .* afternoon/i });
      await afternoonAdd.click();
      const afternoon = page.getByRole("dialog", { name: "Add to Afternoon on Day 2" });
      await afternoon.getByText("Kyoto Museum", { exact: true }).waitFor();
      await afternoon.getByRole("button", { name: "Culture" }).click();
      await page.waitForFunction(() => document.querySelector('dialog[open] button[aria-pressed="true"]')?.textContent?.includes("Culture"));
      assert.equal(await afternoon.getByRole("button", { name: "Culture" }).getAttribute("aria-pressed"), "true");
      assert.equal(await afternoon.getByText("Kyoto Garden", { exact: true }).count(), 0);
      if (width === 390) await page.screenshot({ path: "/tmp/morrovia-387-contextual-add-390.png" });
      const addMuseum = afternoon.getByRole("button", { name: "Add Kyoto Museum to Afternoon on Day 2" });
      assert.equal(await addMuseum.count(), 1, "the result action names its item and destination");
      await addMuseum.click();
      await planner.locator('section[data-day-part="afternoon"]').getByText("Kyoto Museum", { exact: true }).waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Add plan to"));
      assert.equal(await afternoonAdd.evaluate((button: HTMLButtonElement) => document.activeElement === button), true, "focus returns to the originating slot after adding");
      await afternoonAdd.click();
      const reopened = page.getByRole("dialog", { name: "Add to Afternoon on Day 2" });
      assert.equal(await reopened.getByText("Kyoto Museum", { exact: true }).count(), 0);
      await reopened.getByRole("button", { name: "Save Kyoto Garden for later" }).waitFor();
      assert.equal(await reopened.getByRole("button", { name: "Save Kyoto Garden for later" }).count(), 1, "Save names its item");
      await reopened.getByRole("button", { name: "Save Kyoto Garden for later" }).click();
      await reopened.locator('[data-add-result-id="kyoto-garden"]').getByText("Saved for later").waitFor();
      await reopened.getByRole("button", { name: "Close Add panel" }).click();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Add plan to"));
      assert.equal(await afternoonAdd.evaluate((button: HTMLButtonElement) => document.activeElement === button), true, "focus returns to the originating slot after close");
      if (width === 390 || width === 1440) {
        await afternoonAdd.click();
        const escapeDialog = page.getByRole("dialog", { name: "Add to Afternoon on Day 2" });
        await escapeDialog.waitFor({ state: "visible" });
        await page.waitForFunction(() => document.activeElement?.hasAttribute("data-add-search"));
        for (let step = 0; step < 12; step += 1) {
          await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]'))), true, "Tab stays inside the Add dialog");
        }
        for (let step = 0; step < 12; step += 1) {
          await page.keyboard.press("Shift+Tab");
          assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]'))), true, "Shift+Tab stays inside the Add dialog");
        }
        await page.keyboard.press("Escape");
        await escapeDialog.waitFor({ state: "hidden" });
        assert.equal(await afternoonAdd.evaluate((button: HTMLButtonElement) => document.activeElement === button), true, "Escape returns focus to the slot");
        await afternoonAdd.click();
        const backdropDialog = page.getByRole("dialog", { name: "Add to Afternoon on Day 2" });
        await backdropDialog.waitFor({ state: "visible" });
        await page.mouse.click(2, 2);
        await backdropDialog.waitFor({ state: "hidden" });
        assert.equal(await afternoonAdd.evaluate((button: HTMLButtonElement) => document.activeElement === button), true, "backdrop dismissal returns focus to the slot");
      }
      await planner.getByRole("button", { name: /Add plan to .* evening/i }).click();
      const evening = page.getByRole("dialog", { name: "Add to Evening on Day 2" });
      await evening.getByText("Kyoto Supper", { exact: true }).waitFor({ timeout: 5_000 }).catch(async (error: unknown) => { console.error(await evening.innerText()); throw error; });
      await evening.getByRole("button", { name: "Add Kyoto Supper to Evening on Day 2" }).click();
      await planner.locator('section[data-day-part="evening"]').getByText("Kyoto Supper", { exact: true }).waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('section[data-day-part="afternoon"]').getByText("Kyoto Museum", { exact: true }).waitFor();
      await page.locator('section[data-day-part="evening"]').getByText("Kyoto Supper", { exact: true }).waitFor();
      await page.locator('section[aria-label="Day 2 planner"]').getByRole("button", { name: /Add plan to .* afternoon/i }).click();
      await page.getByRole("dialog", { name: "Add to Afternoon on Day 2" }).locator('[data-add-result-id="kyoto-garden"]').getByText("Saved for later").waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow at ${width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
});
