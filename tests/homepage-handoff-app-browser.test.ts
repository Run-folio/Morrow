import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const enabled = process.env.MORROVIA_HOMEPAGE_HANDOFF_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3000";

test("a fresh guest can start another Describe trip after a durable unrelated trip", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const submitPrompt = async (prompt: string) => {
      await page.goto(baseUrl);
      await page.getByRole("tab", { name: "Describe my trip" }).click();
      await page.getByRole("textbox", { name: "Start your plan" }).fill(prompt);
      await page.getByRole("button", { name: "Plan my trip" }).first().click();
      await page.waitForURL(/\/journey\/new\?/);
      await page.waitForURL(/\btrip=/);
      return new URL(page.url()).searchParams.get("trip");
    };
    const firstTrip = await submitPrompt("wales 5 weeks june");
    assert.ok(firstTrip);
    const secondTrip = await submitPrompt("scotland 2 weeks july");
    assert.ok(secondTrip);
    assert.notEqual(secondTrip, firstTrip);
    const state = await page.evaluate(() => ({
      input: JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"),
      recoveryKeys: Object.keys(localStorage).filter((key) => key.startsWith("easyt:trip-recovery:v2:guest:")),
    }));
    assert.equal(state.input.snapshot.prompt, "scotland 2 weeks july");
    assert.ok(state.recoveryKeys.some((key: string) => key.includes(firstTrip)));
    assert.ok(state.recoveryKeys.some((key: string) => key.includes(secondTrip)));
    await page.reload();
    assert.equal(new URL(page.url()).searchParams.get("trip"), secondTrip);
    assert.doesNotMatch(await page.locator("body").innerText(), /not available to the current browser account|couldn't preserve your current work/i);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("Homepage Stops Add control stays in the header and hands off selected places", { skip: !enabled, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const width of [390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      try {
        const page = await context.newPage();
        await page.goto(baseUrl);
        await page.getByRole("button", { name: /Where do you want to go/ }).click();
        const add = page.getByRole("button", { name: "Add another stop" });
        assert.equal(await add.evaluate((element: HTMLElement) => element.parentElement?.className.includes("destinationHeader")), true);
        await page.getByRole("combobox").first().fill("Madrid");
        await page.getByRole("option", { name: /Madrid.*Spain/ }).first().click();
        await add.click();
        assert.equal(await page.getByRole("combobox").count(), 2);
        await page.getByRole("combobox").nth(1).fill("Lisbon");
        await page.getByRole("option", { name: /Lisbon.*Portugal/ }).first().click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
        await page.getByRole("button", { name: "Plan my trip" }).first().click();
        await page.waitForURL(/\/journey\/new\?/);
        const state = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
        assert.deepEqual(state.snapshot.entries.map((entry: { selection: { name: string } }) => entry.selection.name), ["Madrid", "Lisbon"]);
        assert.equal(state.receipt.ownerId, null);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("a guest can add a selected stop after a completed Stops handoff", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.getByRole("button", { name: /Where do you want to go/ }).click();
    const add = page.getByRole("button", { name: "Add another stop" });
    const choose = async (index: number, name: string, country: string) => {
      await page.getByRole("combobox").nth(index).fill(name);
      await page.getByRole("option", { name: new RegExp(`${name}.*${country}`) }).first().click();
    };
    await choose(0, "Madrid", "Spain");
    await add.click();
    await choose(1, "Lisbon", "Portugal");
    await page.getByRole("button", { name: "Plan my trip" }).first().click();
    await page.waitForURL(/\/journey\/new\?/);
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
    assert.equal(first.receipt.version, 1);
    assert.deepEqual(first.snapshot.entries.map((entry: { selection: { name: string } }) => entry.selection.name), ["Madrid", "Lisbon"]);
    await page.goto(baseUrl);
    await page.getByRole("button", { name: /Where do you want to go/ }).click();
    await add.click();
    await choose(2, "Porto", "Portugal");
    await page.getByRole("button", { name: "Plan my trip" }).first().click();
    await page.waitForURL(/\/journey\/new\?/);
    const second = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
    assert.deepEqual(second.snapshot.entries.map((entry: { selection: { name: string } }) => entry.selection.name), ["Madrid", "Lisbon", "Porto"]);
    assert.notEqual(second.receipt.tripId, first.receipt.tripId);
    assert.notEqual(second.receipt.handoffId, first.receipt.handoffId);
    assert.doesNotMatch(await page.locator("body").innerText(), /couldn't preserve your current work/i);
  } finally {
    await context.close();
    await browser.close();
  }
});
