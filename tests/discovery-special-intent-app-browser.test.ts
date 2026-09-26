import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_BATCH10G_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3000";
type StoredTrip = { stops: Array<{ id: string; canonicalPlaceId?: string; name: string }>; brief: { structuredBrief?: {
  placeSelections?: Array<{ kind: string; mentionId: string; relationshipType?: string; routeStopId?: string }>;
  completedPlanningAreaMentionIds?: string[];
} } };

test("real Taj Mahal Discovery commits Agra and completes the visit before opening Builder", { skip: !enabled, timeout: 90_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(({ key, value }: { key: string; value: string }) => window.localStorage.setItem(key, value), {
      key: PRIVACY_CONSENT_STORAGE_KEY,
      value: JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })),
    });
    await page.goto(`${baseUrl}/journey/new`, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "TELL US ABOUT YOUR TRIP" }).fill("Taj Mahal");
    await page.getByRole("button", { name: /Plan my trip/ }).click();
    await page.getByRole("button", { name: "Continue shaping your route" }).waitFor();
    await page.getByRole("button", { name: "Continue shaping your route" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Choose a base", exact: true }).waitFor();
    assert.equal(await dialog.getByText("Stay in Agra", { exact: true }).count(), 1);
    assert.equal(await dialog.locator('[data-discovery-card="true"]').count(), 1);
    await dialog.getByText("Stay in Agra", { exact: true }).click();
    await dialog.getByRole("button", { name: "Add to trip", exact: true }).click();
    await dialog.waitFor({ state: "detached", timeout: 15_000 });

    const trip = await page.evaluate(() => {
      return Object.keys(localStorage)
        .filter(key => key.startsWith("easyt:trip-recovery:v2:"))
        .map(key => { try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip as StoredTrip | undefined; } catch { return undefined; } })
        .filter((value): value is StoredTrip => Boolean(value))
        .sort((a, b) => b.stops.length - a.stops.length)[0] ?? null;
    }) as StoredTrip | null;
    assert.ok(trip, "the normal Builder trip is saved to browser recovery");
    assert.deepEqual(trip.stops.map(stop => stop.canonicalPlaceId), ["agra"], "Agra is the sole canonical overnight stop");
    assert.equal(trip.stops.some(stop => stop.name === "Taj Mahal"), false, "the attraction is not fabricated as an overnight stop");
    assert.equal(trip.brief.structuredBrief?.placeSelections?.filter(selection => selection.mentionId === "place-taj-mahal-0" && selection.kind === "visit" && selection.routeStopId === trip.stops[0]?.id).length, 1,
      "the Taj Mahal visit relationship is committed once");
    assert.ok(trip.brief.structuredBrief?.completedPlanningAreaMentionIds?.includes("place-taj-mahal-0"), "the original intent is marked complete");
    await page.locator("[data-builder-route-workspace] [data-builder-stop-index]").waitFor();
    await page.screenshot({ path: "/tmp/batch-10g-taj-mahal-builder-production-desktop.png", fullPage: false });
    await page.close();
  } finally {
    await browser.close();
  }
});
