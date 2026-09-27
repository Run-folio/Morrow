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

async function waitForHomepageHydration(page: any) {
  const describe = page.getByRole("tab", { name: "Describe my trip" });
  await describe.waitFor();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await describe.click();
    if (await describe.getAttribute("aria-selected") === "true") return;
    await page.waitForTimeout(250);
  }
  assert.fail("The homepage trip-capture tab never became interactive");
}

test("premade homepage cards navigate to canonical Route Detail while hydration bundles are unavailable", { skip: !browserTestsEnabled, timeout: 45_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      try {
        const page = await context.newPage();
        await page.route("**/_next/static/chunks/**", (route: { abort: () => Promise<void> }) => route.abort());
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        const card = page.getByRole("link", { name: /Preview route: Japan/ }).first();
        await card.waitFor();
        assert.equal(await card.getAttribute("href"), "/journey/routes/japan-south-korea");
        if (viewport.width === 1440) {
          await card.focus();
          await page.keyboard.press("Enter");
        } else {
          await card.click();
        }
        await page.waitForURL(`${baseUrl}/journey/routes/japan-south-korea`);
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("homepage and Routes previews keep native link behavior, origin scroll, and direct Builder handoff", { skip: !browserTestsEnabled, timeout: 120_000 }, async () => {
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
    await waitForHomepageHydration(page);
    const homepageCard = page.getByRole("link", { name: /Preview route: Japan/ }).first();
    await homepageCard.scrollIntoViewIfNeeded();
    assert.equal(await homepageCard.getAttribute("href"), "/journey/routes/japan-south-korea");
    const originScroll = await page.evaluate(() => window.scrollY);
    await homepageCard.click();
    const modal = page.getByRole("dialog", { name: "japan" });
    await modal.waitFor();
    assert.equal(page.url(), `${baseUrl}/`, "ordinary click opens the preview without navigation");
    assert.match(await modal.locator("h2").innerText(), /Japan/);
    assert.equal(await modal.evaluate((element: Element) => (element as HTMLDialogElement).matches(":modal")), true, "the shared preview uses the browser modal layer");
    await page.screenshot({ path: "/tmp/morrovia-batch-10d-home-preview-desktop.png" });
    await modal.getByRole("button", { name: "Close route preview" }).click();
    await modal.waitFor({ state: "detached" });
    assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - originScroll) <= 2, "modal close restores homepage scroll");

    const [commandTab] = await Promise.all([
      page.context().waitForEvent("page"),
      homepageCard.click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] }),
    ]);
    await commandTab.waitForURL(/\/journey\/routes\/japan-south-korea$/);
    await commandTab.close();
    const [middleTab] = await Promise.all([
      page.context().waitForEvent("page"),
      homepageCard.click({ button: "middle" }),
    ]);
    await middleTab.waitForURL(/\/journey\/routes\/japan-south-korea$/);
    await middleTab.close();
    await homepageCard.click({ modifiers: ["Control"] });
    assert.equal(page.url(), `${baseUrl}/`, "modified clicks leave the homepage in place");
    assert.equal(await page.getByRole("dialog").count(), 0, "modified clicks do not open the preview");

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
    await waitForHomepageHydration(mobile);
    const mobileCard = mobile.getByRole("link", { name: /Preview route: Japan/ }).first();
    await mobileCard.scrollIntoViewIfNeeded();
    await mobileCard.click();
    const mobileModal = mobile.getByRole("dialog");
    await mobileModal.waitFor();
    assert.equal(mobile.url(), `${baseUrl}/`);
    await mobile.screenshot({ path: "/tmp/morrovia-batch-10d-home-preview-mobile.png" });
    await mobileModal.getByRole("button", { name: "Close route preview" }).click();
    await mobileModal.waitFor({ state: "detached" });
    await mobileCard.click();
    await mobile.getByRole("dialog").getByRole("link", { name: "Use this route" }).click();
    await mobile.waitForURL(/\/journey\/new\?inspire=japan-south-korea/);
    await mobile.goBack();
    await mobile.waitForURL(`${baseUrl}/`);
    await mobileCard.click();
    await mobile.getByRole("dialog").getByRole("link", { name: "View full route" }).click();
    await mobile.waitForURL(/\/journey\/routes\/japan-south-korea$/);
    assert.ok(await mobile.evaluate(() => window.scrollY) <= 2, "mobile Route Detail opens at top");
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
