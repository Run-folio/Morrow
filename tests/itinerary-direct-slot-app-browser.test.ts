import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { loadTripRecoveryFromStorage, saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const base = process.env.MORROVIA_BASE_URL;

test("real Itinerary direct slot planning persists Morning and Evening across reload and day navigation", { skip: !base, timeout: 90_000 }, async () => {
  const stop = { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] };
  const trip = tripFromBuilder({
    id: "trip-38600000-3860-4860-8860-386000000001", origin: "Tokyo", stops: [stop],
    startDate: "2026-10-04", endDate: "2026-10-06", picks: {}, mustDo: "",
    pace: "slow", hotels: "few", budget: "mid",
    draft: buildCredibleItinerary({ origin: "Tokyo", stops: [stop], startDate: "2026-10-04", allocations: { kyoto: 2 }, picks: {}, places: {} }),
    nightAllocations: { kyoto: 2 },
  });
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "ticket-386-fixture", now: "2026-10-04T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((entries: [string, string][]) => {
      for (const [key, value] of entries) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, [...values.entries()]);
    await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    const planner = page.locator('section[aria-label="Day 2 planner"]');
    await planner.waitFor({ state: "visible", timeout: 20_000 });
    await page.getByText("Saved on this device").waitFor();
    assert.deepEqual(await planner.locator("section[data-day-part]").evaluateAll((sections: HTMLElement[]) => sections.map((section) => section.dataset.dayPart)), ["morning", "afternoon", "evening"]);
    for (const [part, title] of [["morning", "Kyoto breakfast"], ["evening", "Kyoto night walk"]] as const) {
      await planner.getByRole("button", { name: new RegExp(`Add plan to .* ${part}`, "i") }).click();
      const dialog = page.getByRole("dialog", { name: new RegExp(`Add to ${part} on Day 2`, "i") });
      if (part === "evening") {
        await dialog.getByRole("button", { name: "Close Add panel" }).click();
        await page.getByLabel("Jump to date / destination").selectOption({ index: 0 });
        await page.getByLabel("Jump to date / destination").selectOption({ index: 1 });
        assert.equal(await dialog.count(), 0);
        await planner.getByRole("button", { name: /Add plan to .* evening/i }).click();
      }
      await dialog.getByRole("textbox", { name: "Add your own", exact: true }).fill(title);
      await dialog.getByRole("button", { name: `Add to ${part[0]!.toUpperCase()}${part.slice(1)}` }).click();
      await planner.locator(`section[data-day-part="${part}"]`).getByText(title, { exact: true }).waitFor();
      await page.waitForFunction((dayPart: string) => document.activeElement?.getAttribute("aria-label")?.endsWith(` ${dayPart}`), part);
      assert.equal(await planner.getByRole("button", { name: new RegExp(`Add plan to .* ${part}`, "i") }).evaluate((button: HTMLButtonElement) => document.activeElement === button), true);
    }
    await page.getByLabel("Jump to date / destination").selectOption({ index: 0 });
    assert.equal(await page.locator('section[aria-label="Day 1 planner"]').getByText("Kyoto breakfast", { exact: true }).count(), 0);
    await page.getByLabel("Jump to date / destination").selectOption({ index: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('section[aria-label="Day 2 planner"]').waitFor();
    assert.equal(await page.locator('section[data-day-part="morning"]').getByText("Kyoto breakfast", { exact: true }).count(), 1);
    assert.equal(await page.locator('section[data-day-part="evening"]').getByText("Kyoto night walk", { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: "/tmp/morrovia-386-real-app-390.png", fullPage: true });
    const entries = await page.evaluate(() => Object.entries(localStorage)) as [string, string][];
    const persisted = loadTripRecoveryFromStorage({
      get length() { return entries.length; },
      key(index: number) { return entries[index]?.[0] ?? null; },
      getItem(key: string) { return entries.find(([storedKey]) => storedKey === key)?.[1] ?? null; },
      setItem() {}, removeItem() {},
    }, trip.id, null)?.trip;
    const day = persisted?.planItems.find((item) => item.dayNumber === 2);
    assert.ok(day);
    assert.equal(day.notes.filter((note) => note === "Kyoto breakfast").length, 1);
    assert.equal(day.noteDayParts?.[day.notes.indexOf("Kyoto breakfast")], "morning");
    assert.equal(day.noteDayParts?.[day.notes.indexOf("Kyoto night walk")], "evening");
    assert.equal(day.startsAt, null);
  } finally { await browser.close(); }
});
