import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { insertItineraryActivity } from "../lib/easyt/itinerary-mutations.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { loadTripRecoveryFromStorage, saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const base = process.env.MORROVIA_BASE_URL;

function fixture() {
  const stops = [
    { id: "kyoto-first", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] },
    { id: "osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937] as [number, number] },
    { id: "kyoto-return", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] },
  ];
  let trip = tripFromBuilder({
    id: "trip-38638700-3863-4863-8863-386387000001", origin: "Tokyo", stops,
    startDate: "2026-10-04", endDate: "2026-10-10", picks: {}, mustDo: "",
    pace: "slow", hotels: "few", budget: "mid",
    draft: buildCredibleItinerary({ origin: "Tokyo", stops, startDate: "2026-10-04", allocations: { "kyoto-first": 2, osaka: 2, "kyoto-return": 2 }, picks: {}, places: {} }),
    nightAllocations: { "kyoto-first": 2, osaka: 2, "kyoto-return": 2 },
  });
  for (const [title, part] of [["Legacy lunch", "midday"], ["Morning garden", "morning"], ["Afternoon museum", "afternoon"], ["Evening stroll", "evening"]] as const) {
    const result = insertItineraryActivity(trip, 2, trip.planItems.find((day) => day.dayNumber === 2)!.notes.length, title, part);
    assert.equal(result.changed, true);
    trip = result.trip;
  }
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); }, removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "combined-fixture", now: "2026-10-04T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));
  return { trip, values };
}

test("combined dayparts preserve legacy data, direct edits and repeated-stop identity at four widths", { skip: !base, timeout: 180_000 }, async () => {
  const { trip, values } = fixture();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript((entries: [string, string][]) => { for (const [key, value] of entries) localStorage.setItem(key, value); }, [...values.entries()]);
      await page.route("**/api/journey-discover?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) }));
      await page.route("**/api/journey-local-search?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) }));
      await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
      await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
      const planner = page.locator('section[aria-label="Day 2 planner"]');
      await planner.waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Saved on this device").waitFor();
      assert.deepEqual(await planner.locator("section[data-day-part]").evaluateAll((nodes: HTMLElement[]) => nodes.map((node) => node.dataset.dayPart)), ["morning", "afternoon", "evening"]);
      assert.equal(await planner.getByRole("button", { name: /Add plan to .* midday/i }).count(), 0);
      await planner.locator('section[data-day-part="afternoon"]').getByText("Legacy lunch", { exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/morrovia-386387-busy-before-${width}.png`, fullPage: true });
      const before = trip.planItems.find((day) => day.dayNumber === 2)!;
      assert.equal(before.noteDayParts?.[before.notes.indexOf("Legacy lunch")], "midday");
      await planner.getByRole("button", { name: /Add plan to .* morning/i }).click();
      const dialog = page.getByRole("dialog", { name: "Add to Morning on Day 2" });
      await dialog.waitFor({ state: "visible" });
      await page.screenshot({ path: `/tmp/morrovia-386387-add-open-${width}.png`, fullPage: true });
      await dialog.getByRole("textbox", { name: "Add your own" }).fill(`Breakfast ${width}`);
      assert.equal(await dialog.getByRole("textbox", { name: "Add your own" }).inputValue(), `Breakfast ${width}`);
      await dialog.getByRole("button", { name: "Add to Morning" }).click();
      await planner.locator('section[data-day-part="morning"]').getByText(`Breakfast ${width}`, { exact: true }).waitFor();
      if (width === 390) {
        const row = planner.locator('article[data-itinerary-activity-id]').filter({ hasText: `Breakfast ${width}` });
        await row.getByLabel(`Organise Breakfast ${width}`).click();
        await row.getByLabel(`Part of day: Breakfast ${width}`).selectOption("afternoon");
        await planner.locator('section[data-day-part="afternoon"]').getByText(`Breakfast ${width}`, { exact: true }).waitFor();
      }
      await page.screenshot({ path: `/tmp/morrovia-386387-combined-${width}.png`, fullPage: true });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('section[data-day-part="afternoon"]').getByText("Legacy lunch", { exact: true }).waitFor();
      await page.locator(`section[data-day-part="${width === 390 ? "afternoon" : "morning"}"]`).getByText(`Breakfast ${width}`, { exact: true }).waitFor();
      const entries = await page.evaluate(() => Object.entries(localStorage)) as [string, string][];
      const persisted = loadTripRecoveryFromStorage({
        get length() { return entries.length; }, key(index: number) { return entries[index]?.[0] ?? null; },
        getItem(key: string) { return entries.find(([storedKey]) => storedKey === key)?.[1] ?? null; }, setItem() {}, removeItem() {},
      }, trip.id, null)?.trip;
      const day = persisted?.planItems.find((item) => item.dayNumber === 2);
      assert.ok(day);
      assert.equal(day.noteDayParts?.[day.notes.indexOf("Legacy lunch")], "midday", "ordinary edits do not rewrite legacy part");
      assert.equal(day.notes.filter((note) => note === `Breakfast ${width}`).length, 1);
      assert.equal(day.noteDayParts?.[day.notes.indexOf(`Breakfast ${width}`)], width === 390 ? "afternoon" : "morning");
      assert.equal(day.startsAt, null);
      await page.getByLabel("Jump to date / destination").selectOption({ index: 5 });
      await page.locator('section[aria-label="Day 6 planner"]').waitFor();
      assert.equal(await page.locator('section[aria-label="Day 6 planner"]').getByText(`Breakfast ${width}`, { exact: true }).count(), 0);
      await page.locator('section[aria-label="Day 6 planner"]').getByRole("button", { name: /Add plan to .* evening/i }).click();
      const returnDialog = page.getByRole("dialog", { name: "Add to Evening on Day 6" });
      await returnDialog.getByRole("textbox", { name: "Add your own" }).fill(`Return supper ${width}`);
      await returnDialog.getByRole("button", { name: "Add to Evening" }).click();
      await page.locator('section[aria-label="Day 6 planner"] section[data-day-part="evening"]').getByText(`Return supper ${width}`, { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow at ${width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("live OpenStreetMap Food result schedules once into the selected slot with provider identity", { skip: !base || process.env.MORROVIA_LIVE_FOOD_ACCEPTANCE !== "1", timeout: 120_000 }, async () => {
  const { trip, values } = fixture();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.addInitScript((entries: [string, string][]) => { for (const [key, value] of entries) localStorage.setItem(key, value); }, [...values.entries()]);
    await page.route("**/api/journey-discover?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) }));
    await page.route("**/api/journey-local-search?*", (route: any) => {
      const url = new URL(route.request().url());
      url.searchParams.set("mapPresentation", "maplibre");
      return route.continue({ url: url.toString() });
    });
    await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    const planner = page.locator('section[aria-label="Day 2 planner"]');
    await planner.waitFor({ state: "visible", timeout: 20_000 });
    const responsePromise = page.waitForResponse((response: any) => response.url().includes("/api/journey-local-search?") && response.url().includes("mapPresentation=maplibre"));
    await planner.getByRole("button", { name: /Add plan to .* evening/i }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.equal(payload.source, "OpenStreetMap");
    assert.equal(payload.searchStatus, "ready");
    assert.ok(payload.places.length > 0, "live provider returned places");
    assert.ok(payload.places.every((place: { provider: string }) => place.provider === "openstreetmap"));
    const dialog = page.getByRole("dialog", { name: "Add to Evening on Day 2" });
    const result = dialog.locator("article[data-add-result-id]").first();
    await result.waitFor({ state: "visible", timeout: 20_000 });
    const placeId = await result.getAttribute("data-add-result-id");
    const title = await result.locator("strong").innerText();
    assert.ok(payload.places.some((place: { id: string; name: string }) => place.id === placeId && place.name === title));
    assert.match(await result.innerText(), /OpenStreetMap/);
    await result.getByRole("button", { name: `Add ${title} to Evening on Day 2` }).click();
    await planner.locator('section[data-day-part="evening"]').getByText(title, { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('section[aria-label="Day 2 planner"] section[data-day-part="evening"]').getByText(title, { exact: true }).waitFor();
    const entries = await page.evaluate(() => Object.entries(localStorage)) as [string, string][];
    const persisted = loadTripRecoveryFromStorage({
      get length() { return entries.length; }, key(index: number) { return entries[index]?.[0] ?? null; },
      getItem(key: string) { return entries.find(([storedKey]) => storedKey === key)?.[1] ?? null; }, setItem() {}, removeItem() {},
    }, trip.id, null)?.trip;
    assert.ok(persisted);
    const ideas = persisted.brief.itineraryIdeas?.filter((idea) => "placeId" in idea && idea.placeId === placeId) ?? [];
    assert.equal(ideas.length, 1, "provider place has one canonical idea");
    assert.equal(ideas[0]?.dayId, trip.planItems.find((day) => day.dayNumber === 2)?.id);
    assert.equal(ideas[0]?.dayPart, "evening");
    assert.equal(persisted.planItems.find((day) => day.dayNumber === 2)?.startsAt, null);
    assert.equal(persisted.planItems.find((day) => day.dayNumber === 6)?.notes.includes(title), false);
    await page.screenshot({ path: "/tmp/morrovia-386387-live-food-390.png", fullPage: true });
  } finally { await browser.close(); }
});

test("late discovery from the first Kyoto occurrence cannot enter the return Kyoto Add panel", { skip: !base, timeout: 90_000 }, async () => {
  const { trip, values } = fixture();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.addInitScript((entries: [string, string][]) => { for (const [key, value] of entries) localStorage.setItem(key, value); }, [...values.entries()]);
    let requestCount = 0;
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    await page.route("**/api/journey-discover?*", async (route: any) => {
      requestCount += 1;
      const first = requestCount === 1;
      if (first) await firstPending;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [{
        id: first ? "first-kyoto-only" : "return-kyoto-only", title: first ? "First Kyoto Only" : "Return Kyoto Only",
        area: "Kyoto", type: "Museum", tags: ["Culture"], description: "A verified test place.",
        coordinates: [135.77, 35.01], qualityScore: 18,
      }] }) }).catch(() => {});
    });
    await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    await page.locator('section[aria-label="Day 2 planner"]').waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector('section[aria-label="Day 2 planner"]') !== null);
    await page.getByLabel("Jump to date / destination").selectOption({ index: 5 });
    await page.locator('section[aria-label="Day 6 planner"]').waitFor({ state: "visible" });
    releaseFirst?.();
    await page.locator('section[aria-label="Day 6 planner"]').getByRole("button", { name: /Add plan to .* afternoon/i }).click();
    const dialog = page.getByRole("dialog", { name: "Add to Afternoon on Day 6" });
    await dialog.getByText("Return Kyoto Only", { exact: true }).waitFor();
    assert.equal(await dialog.getByText("First Kyoto Only", { exact: true }).count(), 0);
  } finally { await browser.close(); }
});
