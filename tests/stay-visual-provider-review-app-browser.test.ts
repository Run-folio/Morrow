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
const capture = process.env.MORROVIA_STAY_REVIEW_CAPTURE;

test("live mapped Stay remains property-true, stop-scoped and durable across product widths", { skip: !base || process.env.MORROVIA_LIVE_STAY_REVIEW !== "1", timeout: 180_000 }, async () => {
  const stops = [
    { id: "kyoto-first", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] },
    { id: "osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937] as [number, number] },
    { id: "kyoto-return", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] },
  ];
  const trip = tripFromBuilder({
    id: "trip-38638713-3863-4863-8863-386387130001", origin: "Tokyo", stops,
    startDate: "2027-03-03", endDate: "2027-03-10", picks: {}, mustDo: "",
    pace: "slow", hotels: "few", budget: "mid",
    draft: buildCredibleItinerary({ origin: "Tokyo", stops, startDate: "2027-03-03", allocations: { "kyoto-first": 2, osaka: 2, "kyoto-return": 2 }, picks: {}, places: {} }),
    nightAllocations: { "kyoto-first": 2, osaka: 2, "kyoto-return": 2 },
  });
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); }, removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "stay-live-review", now: "2026-10-05T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript((entries: [string, string][]) => { for (const [key, value] of entries) localStorage.setItem(key, value); }, [...values.entries()]);
      const responsePromise = page.waitForResponse((response: any) => response.url().includes("/api/journey-local-search?") && response.url().includes("kind=stay") && response.url().includes("mapPresentation=maplibre"));
      await page.goto(`${base}/journey/${trip.id}/stay?stop=kyoto-first`, { waitUntil: "domcontentloaded" });
      await page.getByText("Saved on this device").waitFor({ timeout: 20_000 });
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const payload = await response.json();
      assert.equal(payload.source, "OpenStreetMap");
      assert.equal(payload.searchStatus, "ready");
      assert.ok(payload.places.length > 0);
      assert.ok(payload.places.every((place: { provider: string; availability: string; price?: unknown }) => place.provider === "openstreetmap" && place.availability === "check" && !place.price));
      const first = payload.places[0] as { id: string; name: string };
      const card = page.getByRole("article").filter({ has: page.getByRole("button", { name: `Open details for ${first.name}` }) });
      await card.waitFor({ state: "visible", timeout: 20_000 });
      await page.getByRole("region", { name: "Stay map" }).getByText("Opening detailed map").waitFor({ state: "hidden", timeout: 30_000 });
      assert.match(await card.innerText(), /Availability to check/);
      assert.doesNotMatch(await card.innerText(), /for your dates|Current availability found/);
      if (capture) await page.screenshot({ path: `${capture}/stay-live-${width}-list-map.png`, fullPage: true });
      await card.getByRole("button", { name: `Open details for ${first.name}` }).click();
      const detail = page.locator('[data-recommendation-detail-kind="accommodation"]');
      await detail.getByText(first.name, { exact: true }).waitFor();
      assert.match(await detail.innerText(), /OpenStreetMap/);
      assert.match(await detail.innerText(), /Not checked/);
      assert.match(await detail.innerText(), /Opening it does not choose or book this stay/);
      const outbound = detail.locator('a[data-affiliate-provider="trip.com"]');
      assert.equal(await outbound.getAttribute("target"), "_blank");
      assert.match(await outbound.getAttribute("rel") ?? "", /sponsored.*noopener.*noreferrer/);
      assert.doesNotMatch(await outbound.getAttribute("href") ?? "", new RegExp(encodeURIComponent(first.name), "i"), "the current partner link is generic, not an exact-property handoff");
      if (capture) await page.screenshot({ path: `${capture}/stay-live-${width}-detail.png`, fullPage: true });
      await page.getByRole("button", { name: `Close details for ${first.name}` }).click();
      await card.getByRole("button", { name: "Choose stay" }).click();
      await card.getByText("Chosen", { exact: true }).first().waitFor();
      if (capture) await page.screenshot({ path: `${capture}/stay-live-${width}-chosen.png`, fullPage: true });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("article").filter({ has: page.getByRole("button", { name: `Open details for ${first.name}` }) }).getByText("Chosen", { exact: true }).first().waitFor({ timeout: 20_000 });
      const entries = await page.evaluate(() => Object.entries(localStorage)) as [string, string][];
      const saved = loadTripRecoveryFromStorage({
        get length() { return entries.length; }, key(index: number) { return entries[index]?.[0] ?? null; },
        getItem(key: string) { return entries.find(([storedKey]) => storedKey === key)?.[1] ?? null; }, setItem() {}, removeItem() {},
      }, trip.id, null)?.trip;
      assert.ok(saved);
      assert.equal(saved.brief.bookings?.find((booking) => booking.id === "stay-kyoto-first")?.title, first.name);
      assert.equal(saved.brief.bookings?.find((booking) => booking.id === "stay-kyoto-first")?.confirmation, null);
      assert.equal(saved.brief.bookings?.some((booking) => booking.id === "stay-kyoto-return"), false);
      assert.equal(saved.brief.mapPins?.filter((pin) => pin.category === "stay" && pin.title === first.name).length, 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow at ${width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
});
