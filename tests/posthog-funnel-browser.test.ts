import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const base = process.env.MORROVIA_STAY_STORYBOOK_URL;

test("Stay choice and outbound click emit only after analytics opt-in", { skip: !base, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const analytics of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      const record = createPrivacyConsentRecord({ analytics, affiliateTracking: !analytics }, "2026-10-05T12:00:00.000Z");
      await page.addInitScript(({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
        (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls = [];
        (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
          (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.push(args);
        };
        document.addEventListener("click", (event) => {
          if ((event.target as Element).closest("a[data-affiliate-provider]")) event.preventDefault();
        }, true);
      }, { key: PRIVACY_CONSENT_STORAGE_KEY, value: JSON.stringify(record) });
      await page.goto(`${base}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-stay--tokyo-three-night-stay&viewMode=story`);
      const card = page.getByRole("article").filter({ hasText: "City Inn" });
      await card.getByRole("button", { name: "Choose stay" }).click();
      await card.getByText("Chosen", { exact: true }).first().waitFor();
      await card.getByRole("button", { name: "Open details for City Inn" }).click();
      await page.getByRole("link", { name: /Check accommodation on Trip.com/ }).click();
      const calls = await page.evaluate(() => (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls ?? []) as unknown[][];
      const funnel = calls.filter((call) => call[1] === "stay_chosen" || call[1] === "affiliate_click");
      assert.deepEqual(funnel.map((call) => call[1]), analytics ? ["stay_chosen", "affiliate_click"] : []);
      if (analytics) {
        const properties = funnel.map((call) => call[2] as Record<string, unknown>);
        assert.equal(properties[0]?.trip_id, "storybook-tokyo-return");
        assert.equal(properties[1]?.placement, "stay_workspace_detail");
        assert.equal(properties[1]?.workspace_view, "stay");
        assert.equal(JSON.stringify(properties).includes("City Inn"), false);
        assert.equal(JSON.stringify(properties).includes("https://"), false);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("direct itinerary slot additions emit once after acceptance and only with analytics consent", { skip: !base, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const analytics of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      const record = createPrivacyConsentRecord({ analytics, affiliateTracking: !analytics }, "2026-10-05T12:00:00.000Z");
      await page.addInitScript(({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
        (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls = [];
        (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
          (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.push(args);
        };
      }, { key: PRIVACY_CONSENT_STORAGE_KEY, value: JSON.stringify(record) });
      await page.goto(`${base}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-itinerary--default&viewMode=story`);
      await page.getByRole("button", { name: /Add plan to .* morning/i }).click();
      const dialog = page.getByRole("dialog", { name: /Add to morning on Day 1/i });
      await dialog.getByRole("textbox", { name: "Add your own", exact: true }).fill("Private morning plan");
      await dialog.getByRole("button", { name: "Add to Morning" }).click();
      await page.getByText("Private morning plan", { exact: true }).first().waitFor();
      const calls = await page.evaluate(() => (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls ?? []) as unknown[][];
      const added = calls.filter((call) => call[1] === "itinerary_item_added");
      assert.equal(added.length, analytics ? 1 : 0);
      if (analytics) {
        const payload = added[0]?.[2] as Record<string, unknown>;
        assert.equal(payload.source, "manual");
        assert.equal(payload.item_kind, "activity");
        assert.equal(JSON.stringify(payload).includes("Private morning plan"), false);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
