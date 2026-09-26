import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const browserTestsEnabled = process.env.MORROVIA_ROUTE_PREVIEW_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3000";

test("homepage and Routes previews keep origin scroll, detail starts at top, and actions hand off directly", { skip: !browserTestsEnabled, timeout: 60_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("**/api/easyt/public-routes/**", async (route: { request: () => { url: () => string }; fulfill: (options: { status: number; json: unknown }) => Promise<void> }) => {
      const key = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
      const detail = publicRouteDetailFor(decodeURIComponent(key));
      if (!detail) return route.fulfill({ status: 404, json: { error: "missing fixture" } });
      return route.fulfill({ status: 200, json: { draft: detail.planDraft } });
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const homepageCard = page.getByRole("button", { name: /Preview route: Japan/ }).first();
    await homepageCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const originScroll = await page.evaluate(() => window.scrollY);
    await homepageCard.click();
    const modal = page.getByRole("dialog", { name: "japan" });
    await modal.waitFor();
    assert.match(await modal.locator("h2").innerText(), /Japan/);
    assert.equal(await modal.evaluate((element: Element) => (element as HTMLDialogElement).matches(":modal")), true, "the shared preview uses the browser modal layer");
    await page.screenshot({ path: "/tmp/morrovia-batch-10d-home-preview-desktop.png" });
    await modal.getByRole("button", { name: "Close route preview" }).click();
    await modal.waitFor({ state: "detached" });
    assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - originScroll) <= 2, "modal close restores homepage scroll");

    await homepageCard.click();
    const useModal = page.getByRole("dialog").getByRole("link", { name: "Use this route" });
    await useModal.click();
    await page.waitForURL(/\/journey\/new\?inspire=japan-south-korea/);
    await page.goBack();
    await page.waitForURL(`${baseUrl}/`);
    assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - originScroll) <= 2, "Back from Builder returns to the same homepage context");

    await homepageCard.click();
    const reopened = page.getByRole("dialog");
    await reopened.waitFor();
    await reopened.getByRole("link", { name: "View full route" }).click();
    await page.waitForURL(/\/journey\/routes\/japan-south-korea$/);
    await page.getByRole("link", { name: "Use this route" }).first().waitFor();
    assert.ok(await page.evaluate(() => window.scrollY) <= 2, "full Route Detail opens at the top");
    await page.screenshot({ path: "/tmp/morrovia-batch-10d-route-detail-desktop.png", fullPage: true });
    const detailUseRoute = page.locator('a[href*="inspire=japan-south-korea"]').first();
    await detailUseRoute.scrollIntoViewIfNeeded();
    await detailUseRoute.click({ timeout: 8_000 });
    await page.waitForURL(/\/journey\/new\?inspire=japan-south-korea/);
    await page.goBack();
    await page.waitForURL(/\/journey\/routes\/japan-south-korea$/);
    assert.ok(await page.evaluate(() => window.scrollY) <= 2, "browser Back returns to the detail route without a modal history loop");
    await page.goBack();
    await page.waitForURL(`${baseUrl}/`);
    assert.ok(await page.evaluate(() => window.scrollY) <= 2, "browser Back returns to the homepage without a mid-page anchor jump");

    await page.goto(`${baseUrl}/journey/discover`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("Routes are temporarily unavailable") || Boolean(document.querySelector('button[aria-label^="Preview "]')));
    const listingCards = page.getByRole("button", { name: /Preview/ });
    if (await listingCards.count()) {
      await page.getByRole("searchbox", { name: "Search routes" }).fill("Japan");
      await listingCards.first().click();
      const listingModal = page.getByRole("dialog");
      await listingModal.waitFor();
      assert.match(await listingModal.locator("h2").innerText(), /Japan/);
      await page.screenshot({ path: "/tmp/morrovia-batch-10d-routes-preview-desktop.png" });
      await listingModal.getByRole("button", { name: "Close route preview" }).click();
      await listingModal.waitFor({ state: "detached" });
      assert.match(new URL(page.url()).pathname, /\/journey\/discover$/);
    } else {
      assert.match(await page.locator("body").innerText(), /Routes are temporarily unavailable/);
    }

    await page.close();
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.route("**/api/easyt/public-routes/**", async (route: { request: () => { url: () => string }; fulfill: (options: { status: number; json: unknown }) => Promise<void> }) => {
      const key = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
      const detail = publicRouteDetailFor(decodeURIComponent(key));
      if (!detail) return route.fulfill({ status: 404, json: { error: "missing fixture" } });
      return route.fulfill({ status: 200, json: { draft: detail.planDraft } });
    });
    await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const mobileCard = mobile.getByRole("button", { name: /Preview route: Japan/ }).first();
    await mobileCard.scrollIntoViewIfNeeded();
    await mobileCard.click();
    const mobileModal = mobile.getByRole("dialog");
    await mobileModal.waitFor();
    await mobile.screenshot({ path: "/tmp/morrovia-batch-10d-home-preview-mobile.png" });
    await mobileModal.getByRole("button", { name: "Close route preview" }).click();
    await mobileModal.waitFor({ state: "detached" });
    await mobile.goto(`${baseUrl}/journey/discover`, { waitUntil: "domcontentloaded" });
    await mobile.waitForFunction(() => document.body.innerText.includes("Routes are temporarily unavailable") || Boolean(document.querySelector('button[aria-label^="Preview "]')));
    const mobileListingCards = mobile.getByRole("button", { name: /Preview/ });
    if (await mobileListingCards.count()) {
      await mobile.getByRole("searchbox", { name: "Search routes" }).fill("Japan");
      await mobileListingCards.first().click();
      await mobile.getByRole("dialog").waitFor();
      await mobile.screenshot({ path: "/tmp/morrovia-batch-10d-routes-preview-mobile.png" });
      await mobile.getByRole("button", { name: "Close route preview" }).click();
    }
    await mobile.goto(`${baseUrl}/journey/routes/japan-south-korea`, { waitUntil: "domcontentloaded" });
    await mobile.getByRole("link", { name: "Use this route" }).first().waitFor();
    await mobile.screenshot({ path: "/tmp/morrovia-batch-10d-route-detail-mobile.png", fullPage: true });
    await mobile.close();
  } finally {
    await browser.close();
  }
});
