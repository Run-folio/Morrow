import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { messySpreadsheetCsv, philippinesImportCsv } from "./fixtures/spreadsheet-import.ts";

const enabled = process.env.MORROVIA_IMPORT_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_IMPORT_BROWSER_BASE_URL;
const evidenceDir = process.env.MORROVIA_IMPORT_BROWSER_EVIDENCE_DIR;
const require = createRequire(import.meta.url);
const browserRuntime = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;

const places: Record<string, [number, number]> = {
  Manila: [120.9842, 14.5995],
  "El Nido": [119.395, 11.1784],
  Bohol: [124.145, 9.85],
  Siquijor: [123.514, 9.2],
  "Cebu City": [123.8854, 10.3157],
  Tokyo: [139.6917, 35.6895],
  Kyoto: [135.7681, 35.0116],
};

test("Philippines import stays dated and usable across the real guest workspaces", { skip: !enabled }, async () => {
  assert.ok(baseUrl, "Set MORROVIA_IMPORT_BROWSER_BASE_URL to the local app under test");
  const { chromium } = require(browserRuntime);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 430, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error: Error) => errors.push(error.message));
      const assertNoOverflow = async (view: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(overflow, false, `${width}px ${view} page overflow`);
      };
      await page.route("**/api/journey-geocode?**", async (route: any) => {
        const url = new URL(route.request().url());
        const name = url.searchParams.get("place") ?? "";
        const coordinates = places[name];
        const result = coordinates ? { name, country: "Philippines", countryCode: "PH", canonicalPlaceId: `place:${name.toLowerCase().replaceAll(" ", "-")}`, coordinates, kind: "city" } : null;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, candidates: result ? [result] : [] }) });
      });
      await page.goto(`${baseUrl}/journey/new/import`);
      const rejectCookies = page.getByRole("button", { name: "Reject optional" });
      if (await rejectCookies.isVisible()) await rejectCookies.click();
      await page.getByText("Paste table", { exact: true }).click();
      await page.getByRole("textbox", { name: "Spreadsheet rows" }).fill(philippinesImportCsv);
      await page.getByRole("button", { name: "Review pasted table" }).click();
      await page.getByRole("heading", { name: "Review your trip" }).waitFor();
      await page.getByText("6 stops · 20 nights · 0 stays · 0 journeys · 0 activities").waitFor();
      await page.getByText("IMPORT READY").waitFor();
      await assertNoOverflow("import review");
      if (evidenceDir) {
        await mkdir(evidenceDir, { recursive: true });
        await page.screenshot({ path: join(evidenceDir, `${width}-import-review.png`), fullPage: true });
      }
      const create = page.getByRole("button", { name: "Create trip" });
      assert.equal(await create.count(), 1);
      await create.dblclick({ delay: 50 });
      await page.waitForURL(/\/journey\/trip-[^/]+/);
      const tripPath = new URL(page.url()).pathname;
      const recoveryCount = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("easyt:trip-recovery:v2:")).length);
      assert.equal(recoveryCount, 1, "Rapid Create activation keeps one recoverable trip");
      await page.getByRole("region", { name: "Trip overview" }).waitFor();
      const skipGuide = page.getByRole("button", { name: "Skip workspace guide" });
      if (await skipGuide.isVisible()) await skipGuide.click();
      if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${width}-overview.png`), fullPage: true });
      await assertNoOverflow("Overview");
      assert.ok(await page.getByText("Manila → El Nido → Bohol → Siquijor → Cebu City → Manila", { exact: true }).count() > 0, "The shared route omits only the equivalent origin/first-stop label");
      await page.goto(`${baseUrl}${tripPath}/itinerary`);
      await page.getByRole("region", { name: "Trip itinerary" }).waitFor();
      if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${width}-itinerary.png`), fullPage: true });
      await assertNoOverflow("Itinerary");
      assert.equal(await page.getByText("This itinerary does not have any planned days yet.").count(), 0);
      await page.getByText("21 days").first().waitFor();
      const nextDay = page.getByRole("button", { name: "Next day" });
      await nextDay.focus();
      await page.keyboard.press("Enter");
      await page.getByText(/Day 02/i).first().waitFor();
      await page.getByRole("button", { name: "Calendar" }).click();
      await page.locator("#itinerary-calendar").waitFor();
      if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${width}-calendar.png`), fullPage: true });
      await assertNoOverflow("Calendar");
      await page.goto(`${baseUrl}${tripPath}/explore`);
      await page.getByRole("region", { name: "Explore recommendations" }).waitFor();
      if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${width}-explore.png`), fullPage: true });
      await assertNoOverflow("Explore");
      await page.goto(`${baseUrl}${tripPath}/stay`);
      await page.getByRole("region", { name: /Stay planning for Manila/ }).waitFor();
      if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${width}-stay.png`), fullPage: true });
      await assertNoOverflow("Stay");
      await page.goto(`${baseUrl}${tripPath}/transport`);
      await page.getByRole("heading", { name: /Your transport/ }).waitFor();
      assert.equal(await page.getByText(/Road · ~21h/).count(), 0);
      if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${width}-transport.png`), fullPage: true });
      await assertNoOverflow("Transport");
      await page.goto(`${baseUrl}${tripPath}/map`);
      await page.getByText("Whole route", { exact: true }).first().waitFor();
      if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${width}-map.png`), fullPage: true });
      await assertNoOverflow("Map");
      await page.reload();
      await page.getByText("Whole route", { exact: true }).first().waitFor();
      assert.equal(errors.length, 0, errors.join("; "));
      await assertNoOverflow("Map reload");
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test("less-structured import with alias headers still creates ordinary dated days", { skip: !enabled }, async () => {
  assert.ok(baseUrl);
  const { chromium } = require(browserRuntime);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  try {
    const page = await context.newPage();
    await page.route("**/api/journey-geocode?**", async (route: any) => {
      const name = new URL(route.request().url()).searchParams.get("place") ?? "";
      const coordinates = places[name];
      const result = coordinates ? { name, country: "Japan", countryCode: "JP", canonicalPlaceId: `place:${name.toLowerCase()}`, coordinates, kind: "city" } : null;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, candidates: result ? [result] : [] }) });
    });
    await page.goto(`${baseUrl}/journey/new/import`);
    const rejectCookies = page.getByRole("button", { name: "Reject optional" });
    if (await rejectCookies.isVisible()) await rejectCookies.click();
    await page.getByText("Paste table", { exact: true }).click();
    await page.getByRole("textbox", { name: "Spreadsheet rows" }).fill(messySpreadsheetCsv);
    await page.getByRole("button", { name: "Review pasted table" }).click();
    await page.getByRole("heading", { name: "Review your trip" }).waitFor();
    await page.getByRole("textbox", { name: "Starting city or airport" }).fill("Tokyo");
    await page.getByRole("button", { name: "Check place" }).click();
    await page.getByText("IMPORT READY").waitFor();
    await page.getByRole("button", { name: "Create trip" }).click();
    await page.waitForURL(/\/journey\/trip-[^/]+/);
    const path = new URL(page.url()).pathname;
    await page.goto(`${baseUrl}${path}/itinerary`);
    await page.getByRole("region", { name: "Trip itinerary" }).waitFor();
    await page.getByText("9 days").first().waitFor();
    assert.equal(await page.getByText("This itinerary does not have any planned days yet.").count(), 0);
  } finally {
    await context.close();
    await browser.close();
  }
});
