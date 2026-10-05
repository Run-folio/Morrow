import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const enabled = process.env.MORROVIA_HOMEPAGE_START_ONLY_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3000";
const screenshotDirectory = process.env.MORROVIA_SCREENSHOT_DIR;

test("Homepage start-only dates remain an unconfirmed suggestion through Builder reload", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl);
    const reject = page.getByRole("button", { name: "Reject optional" });
    if (await reject.isVisible()) await reject.click();
    await page.getByRole("tab", { name: "Describe my trip" }).click();
    await page.getByRole("textbox", { name: "Start your plan" }).fill("Tokyo and Kyoto");
    await page.getByRole("button", { name: /Travel dates/ }).click();
    const picker = page.getByRole("dialog", { name: /Travel dates/ });
    await picker.getByRole("textbox", { name: "YYYY-MM-DD" }).fill("2026-11-10");
    await picker.getByRole("textbox", { name: "YYYY-MM-DD" }).press("Enter");
    await picker.getByRole("button", { name: "Close" }).click();
    assert.match(await page.getByRole("button", { name: /Travel dates/ }).innerText(), /From 10 Nov 2026/);
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: `${screenshotDirectory}/homepage-start-only-390.png` });
    }
    await page.getByRole("button", { name: "Plan my trip" }).first().click();
    await page.waitForURL(/\/journey\/new\?/);
    await page.getByText("Only your start date is set.", { exact: false }).waitFor();
    assert.match(await page.locator("body").innerText(), /Nov 10, 2026[\s\S]*Nov 16, 2026/);
    assert.equal(await page.getByRole("button", { name: /Build trip/ }).isDisabled(), true);
    await page.waitForFunction(() => Object.values(localStorage).some((value) => value.includes('"endDateIsSuggestion":true')));
    if (screenshotDirectory) {
      await page.screenshot({ path: `${screenshotDirectory}/builder-start-only-suggestion-390.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: `${screenshotDirectory}/builder-start-only-suggestion-1440.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.reload();
    await page.getByText("Only your start date is set.", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Build trip/ }).isDisabled(), true);
    await page.getByRole("button", { name: "Accept suggested dates" }).click();
    await page.getByText("Only your start date is set.", { exact: false }).waitFor({ state: "hidden" });
    await page.waitForFunction(() => Object.values(localStorage).some((value) => value.includes('"endDateIsSuggestion":false')));
    await page.reload();
    await page.getByRole("button", { name: /Build trip/ }).waitFor();
    assert.equal(await page.getByText("Only your start date is set.", { exact: false }).count(), 0);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("Homepage start plus a stated two-week duration derives the exact end", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl);
    const reject = page.getByRole("button", { name: "Reject optional" });
    if (await reject.isVisible()) await reject.click();
    await page.getByRole("tab", { name: "Describe my trip" }).click();
    await page.getByRole("textbox", { name: "Start your plan" }).fill("Kazakhstan, Uzbekistan, Kyrgyzstan, 2 weeks");
    await page.getByRole("button", { name: /Travel dates/ }).click();
    const picker = page.getByRole("dialog", { name: /Travel dates/ });
    await picker.getByRole("textbox", { name: "YYYY-MM-DD" }).fill("2026-11-10");
    await picker.getByRole("textbox", { name: "YYYY-MM-DD" }).press("Enter");
    await picker.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Plan my trip" }).first().click();
    await page.waitForURL(/\/journey\/new\?/);
    await page.getByText("Nov 23, 2026").waitFor();
    assert.equal(await page.getByText("Only your start date is set.", { exact: false }).count(), 0);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/builder-start-plus-two-weeks-390.png`, fullPage: true });
    await page.reload();
    await page.getByText("Nov 23, 2026").waitFor();
    assert.equal(await page.getByText("Only your start date is set.", { exact: false }).count(), 0);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("Homepage complete dates stay authoritative through Builder reload", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl);
    const reject = page.getByRole("button", { name: "Reject optional" });
    if (await reject.isVisible()) await reject.click();
    await page.getByRole("tab", { name: "Describe my trip" }).click();
    await page.getByRole("textbox", { name: "Start your plan" }).fill("Tokyo and Kyoto for two weeks");
    await page.getByRole("button", { name: /Travel dates/ }).click();
    const picker = page.getByRole("dialog", { name: /Travel dates/ });
    const typedDate = picker.getByRole("textbox", { name: "YYYY-MM-DD" });
    await typedDate.fill("2026-11-10");
    await typedDate.press("Enter");
    await typedDate.fill("2026-11-27");
    await typedDate.press("Enter");
    if (await picker.isVisible()) await picker.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => {
      const dates = JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null")?.snapshot?.dates;
      return dates?.value?.start === "2026-11-10" && dates.value.end === "2026-11-27";
    });
    const selected = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null")?.snapshot?.dates);
    assert.deepEqual(selected?.value, { start: "2026-11-10", end: "2026-11-27" });
    await page.getByRole("button", { name: "Plan my trip" }).first().click();
    await page.waitForURL(/\/journey\/new\?/);
    await page.getByText("Nov 27, 2026").waitFor();
    assert.equal(await page.getByText("Only your start date is set.", { exact: false }).count(), 0);
    await page.reload();
    await page.getByText("Nov 27, 2026").waitFor();
    assert.equal(await page.getByText("Only your start date is set.", { exact: false }).count(), 0);
  } finally {
    await context.close();
    await browser.close();
  }
});
