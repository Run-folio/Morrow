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
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_MAP_DETAIL_CLOSE_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";

const stop = { id: "split", name: "Split", country: "Croatia", coordinates: [16.4402, 43.5081] as [number, number] };
const picks = { split: ["Diocletian's Palace"] };
const draft = buildCredibleItinerary({
  origin: "Split",
  stops: [stop],
  startDate: "2026-10-04",
  allocations: { split: 2 },
  picks,
  places: { split: [{ title: "Diocletian's Palace", area: "Split", type: "Culture", cost: 0, tags: ["Culture"], description: "Historic site in Split.", coordinates: [16.4402, 43.5081] }] },
});
const trip = tripFromBuilder({
  id: "trip-375c105e-3750-4750-8750-000000000390",
  origin: "Split",
  stops: [stop],
  startDate: "2026-10-04",
  endDate: "2026-10-06",
  picks,
  mustDo: "",
  pace: "slow",
  hotels: "few",
  budget: "mid",
  draft,
  nightAllocations: { split: 2 },
});

async function openSelectedSeeDetail() {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "selected-detail-close-fixture", now: "2026-10-04T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));

  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await page.addInitScript((entries: [string, string][]) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, [...values.entries()]);

  const handoff = new URLSearchParams({
    stop: "split",
    mode: "see",
    result: "result:see:split:qa-ghost-place-375-close-test",
    targetId: "qa-ghost-place-375-close-test",
    targetName: "Diocletian's Palace",
    targetLng: "16.4402",
    targetLat: "43.5081",
    targetKind: "see",
    targetAddress: "Split, Croatia",
    targetCategory: "Activity",
    targetProvider: "openstreetmap",
  });
  await page.goto(`${baseUrl}/journey/${trip.id}/map?${handoff}`, { waitUntil: "domcontentloaded" });
  await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
  const detail = page.locator('[class*="mapPlaceDetail"]');
  await detail.waitFor({ state: "visible", timeout: 20_000 });
  const close = page.getByRole("button", { name: "Close details for Diocletian's Palace" });
  await close.waitFor({ state: "visible", timeout: 10_000 });
  return { browser, page, detail, close };
}

test("390px selected Map detail close target receives pointer input", { skip: !enabled, timeout: 90_000 }, async () => {
  const { browser, page, detail, close } = await openSelectedSeeDetail();
  try {
    const initialDrawerState = await page.locator("#map-contextual-sheet").getAttribute("data-mobile-drawer-state");
    const hit = await close.evaluate((button: HTMLElement) => {
      const rect = button.getBoundingClientRect();
      const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { targetIsButton: center === button || Boolean(center && button.contains(center)) };
    });
    assert.equal(hit.targetIsButton, true, "the close control center must hit the close control or one of its children");

    const box = await close.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, "close control keeps a 44px hit target");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await detail.waitFor({ state: "detached", timeout: 5_000 });
    assert.equal(await page.locator("#map-contextual-sheet").getAttribute("data-mobile-drawer-state"), initialDrawerState,
      "closing selected detail must not collapse or otherwise change the map sheet state");
  } finally {
    await browser.close();
  }
});

test("390px selected Map detail remains keyboard closable", { skip: !enabled, timeout: 90_000 }, async () => {
  const { browser, page, detail, close } = await openSelectedSeeDetail();
  try {
    await close.press("Enter");
    await detail.waitFor({ state: "detached", timeout: 5_000 });
  } finally {
    await browser.close();
  }
});
