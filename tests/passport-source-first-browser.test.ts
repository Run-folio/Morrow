import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import type { Browser, Page } from "playwright";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as typeof import("playwright");
const enabled = process.env.MORROVIA_PASSPORT_BROWSER_TESTS === "1";
const base = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3105";
const artifactDir = process.env.MORROVIA_PASSPORT_ARTIFACT_DIR;
if (enabled && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname)) {
  throw new Error("Passport browser tests may target only a local app.");
}

async function captureFromTop(page: Page, path: string) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.screenshot({ path, fullPage: true });
}

test("Passport shows one honest fallback and scoped, sourced pilot answers at 390 and 1440", { skip: !enabled, timeout: 120_000 }, async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width === 390, hasTouch: width === 390 });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/journey/passport`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Reject optional" }).click();
      assert.equal(await page.locator('a[href="/journey/passport"]').count(), 2);
      await page.locator("#passport-nationality").selectOption("GB");
      await page.locator("#passport-destination").selectOption("KZ");
      if (width === 390) await page.getByRole("button", { name: "Check requirements" }).tap();
      else {
        await page.getByRole("button", { name: "Check requirements" }).focus();
        await page.keyboard.press("Enter");
      }
      await page.getByText("Full British citizen passport · tourism").waitFor();
      assert.match(await page.getByText("Up to 30 days per visit; no more than 90 days in any 180-day period").innerText(), /30 days/);
      await page.getByText("5 October 2026").waitFor();
      assert.equal(await page.getByText(/review due|2026-11-04/i).count(), 0);
      assert.equal(await page.getByRole("link", { name: "View official source" }).count(), 1);
      assert.match(await page.getByRole("link", { name: "View official source" }).first().getAttribute("href") ?? "", /gov\.uk\/foreign-travel-advice\/kazakhstan/);
      if (artifactDir) {
        mkdirSync(artifactDir, { recursive: true });
        await captureFromTop(page, `${artifactDir}/verified-${width}.png`);
      }

      await page.locator("#passport-nationality").selectOption("GT");
      await page.locator("#passport-destination").selectOption("AU");
      await page.getByRole("button", { name: "Check requirements" }).click();
      await page.getByText("We have not verified the current requirement for this passport.", { exact: false }).waitFor();
      assert.equal(await page.getByText("We have not verified the current requirement for this passport.", { exact: false }).count(), 1);
      assert.equal(await page.getByRole("link", { name: "View official source" }).count(), 1);
      assert.equal(await page.getByText(/e-visa|permitted stay/i).count(), 0);
      assert.equal(await page.locator("#passport-nationality").inputValue(), "GT");
      assert.match(await page.getByRole("link", { name: "View official source" }).getAttribute("href") ?? "", /immi\.homeaffairs\.gov\.au/);
      if (artifactDir) {
        await captureFromTop(page, `${artifactDir}/unverified-${width}.png`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
