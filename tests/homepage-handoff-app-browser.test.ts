import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const enabled = process.env.MORROVIA_HOMEPAGE_HANDOFF_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3000";

type BrowserRoute = { fulfill: (response: { status: number; contentType?: string; body: string }) => Promise<void>; request: () => { postDataJSON: () => { brief: string } } };
async function stubLocalApis(page: { route: (url: string, handler: (route: BrowserRoute) => Promise<void>) => Promise<void> }) {
  await page.route("**/api/auth/get-session", (route: BrowserRoute) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route("**/api/journey-capture", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(captureJourneyBrief(route.request().postDataJSON().brief)) }));
  await page.route("**/api/journey-geocode?**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [], result: null }) }));
}

test("unchanged homepage resume keeps the exact guest recovery through reload and refuses a copied link", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext();
  const copied = await browser.newContext();
  try {
    const page = await context.newPage();
    // All persistence/provider endpoints are fixtures; no account or provider call escapes.
    const isolate = async (target: typeof page) => {
      await target.route("**/api/**", (route: BrowserRoute) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
      await stubLocalApis(target);
    };
    await isolate(page);
    await page.goto(baseUrl);
    await page.getByRole("combobox", { name: "Destination", exact: true }).fill("Madrid");
    await page.getByRole("option", { name: /Madrid.*Spain/ }).first().click();
    await page.getByRole("button", { name: "Add destination" }).click();
    await page.getByRole("combobox", { name: "Destination", exact: true }).fill("Lisbon");
    await page.getByRole("option", { name: /Lisbon.*Portugal/ }).first().click();
    await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.waitForURL(/\btrip=.*recover=1/);
    await page.getByText("Saved on this device", { exact: true }).first().waitFor();
    const tripId = new URL(page.url()).searchParams.get("trip");
    const read = () => page.evaluate((id: string) => Object.keys(localStorage)
      .filter(key => key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`))
      .map(key => JSON.parse(localStorage.getItem(key)!)), tripId);
    const before = await read();
    assert.equal(before.length, 1);
    await page.reload();
    await page.getByText("Saved on this device", { exact: true }).first().waitFor();
    await page.goto(baseUrl);
    await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.waitForURL(/\/journey\/new\?/);
    assert.equal(new URL(page.url()).searchParams.get("recover"), "1", "owned receipt resume must retain recovery entry");
    assert.equal(new URL(page.url()).searchParams.get("trip"), tripId);
    await page.getByText("Saved on this device", { exact: true }).first().waitFor();
    await page.reload();
    await page.getByText("Saved on this device", { exact: true }).first().waitFor();
    const after = await read();
    assert.equal(after.length, 1, "resuming must not clone a second document");
    assert.equal(after[0].tripId, before[0].tripId);
    assert.equal(after[0].ownerId, before[0].ownerId);
    assert.deepEqual(after[0].trip.stops, before[0].trip.stops);
    assert.deepEqual(after[0].trip.planItems, before[0].trip.planItems);
    assert.deepEqual(after[0].trip.brief.intent, before[0].trip.brief.intent);
    const other = await copied.newPage();
    await isolate(other);
    await other.goto(`${baseUrl}/journey/new?trip=${encodeURIComponent(tripId!)}&recover=1`);
    await other.getByText(/This trip is not available to the current browser account/).waitFor();
    assert.equal(await other.locator('[data-builder-edit-session="active"]').count(), 0);
  } finally { await context.close(); await copied.close(); await browser.close(); }
});

test("a homepage preservation error announces failure without a success icon", { skip: !enabled, timeout: 40_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route("**/api/**", (route: BrowserRoute) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await stubLocalApis(page);
    await page.goto(baseUrl);
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "easyt-private:guest:homepage-input") throw new DOMException("synthetic", "SecurityError");
        return set.call(this, key, value);
      };
    });
    await page.getByRole("combobox", { name: "Destination", exact: true }).fill("Madrid");
    await page.getByRole("option", { name: /Madrid.*Spain/ }).first().click();
    await page.getByText("We couldn't save this trip input on this device.", { exact: true }).waitFor();
    const notice = page.getByRole("alert").filter({ hasText: "We couldn't save this trip input" });
    assert.equal(await notice.count(), 1);
    assert.equal(await notice.locator("svg.lucide-check").count(), 0);
    assert.equal(await notice.locator("svg.lucide-circle-alert").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  } finally { await context.close(); await browser.close(); }
});

test("a fresh guest can start another Describe trip after a durable unrelated trip", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await stubLocalApis(page);
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

test("Homepage destination chips have one Add owner and hand off selected places", { skip: !enabled, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const width of [390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      try {
        const page = await context.newPage();
    await stubLocalApis(page);
        await page.goto(baseUrl);
        const add = page.getByRole("button", { name: "Add destination" });
        assert.equal(await add.count(), 1);
        await page.getByRole("combobox", { name: "Destination", exact: true }).fill("Madrid");
        await page.getByRole("option", { name: /Madrid.*Spain/ }).first().click();
        await add.click();
        assert.equal(await page.getByRole("combobox").count(), 2);
        await page.getByRole("combobox", { name: "Destination", exact: true }).fill("Lisbon");
        await page.getByRole("option", { name: /Lisbon.*Portugal/ }).first().click();
        const destinationField = page.locator('[data-home-destination-field]');
        assert.equal(await destinationField.count(), 1, "destination tags and Add must share one field");
        assert.equal(await destinationField.locator('[data-home-destination-entry]').count(), 2);
        assert.equal(await destinationField.getByRole("button", { name: "Add destination" }).count(), 1);
        const frame = await destinationField.evaluate((element: HTMLElement) => ({
          border: parseFloat(getComputedStyle(element).borderTopWidth),
          radius: parseFloat(getComputedStyle(element).borderTopLeftRadius),
        }));
        assert.ok(frame.border > 0 && frame.radius > 0, "the shared field has one visible rounded boundary");
        if (width >= 1440) {
          const firstTag = await destinationField.locator('[data-home-destination-entry]').first().boundingBox();
          const action = await add.boundingBox();
          assert.ok(firstTag && action);
          assert.ok(Math.abs(firstTag.y + firstTag.height / 2 - action.y - action.height / 2) <= 1,
            "desktop Add destination stays inline with the tags");
        }
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
    await stubLocalApis(page);
    await page.goto(baseUrl);
    const add = page.getByRole("button", { name: "Add destination" });
    const choose = async (index: number, name: string, country: string) => {
      await page.getByRole("combobox", { name: "Destination", exact: true }).fill(name);
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

test("Return replacement preserves a known finish until explicit confirmation", { skip: !enabled, timeout: 40_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await stubLocalApis(page);
    await page.route("**/api/auth/get-session", (route: BrowserRoute) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
    await page.addInitScript(() => localStorage.setItem("easyt-private:guest:homepage-input", JSON.stringify({ snapshot: {
      version: 1, ownerId: null, revision: 0, mode: "stops", entries: [], prompt: "",
      dates: { state: "untouched" }, budget: { state: "untouched" }, interests: { state: "untouched" }, travellers: { state: "untouched" },
      origin: { state: "untouched" }, tripType: { state: "selected", value: "one_way" },
      journeyEnd: { state: "selected", value: { mode: "explicit", place: { name: "Rome", canonicalPlaceId: "rome" } } },
    } })));
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "Return to start", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const beforeCancel = await page.evaluate(() => localStorage.getItem("easyt-private:guest:homepage-input"));
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("easyt-private:guest:homepage-input")), beforeCancel);
    await page.getByRole("button", { name: "Return to start", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null")?.snapshot.tripType.value === "return_to_start");
    const accepted = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
    assert.deepEqual(accepted.snapshot.journeyEnd.value, { mode: "same_as_start" });
    assert.ok(accepted.snapshot.routeReview);
  } finally { await context.close(); await browser.close(); }
});

test("homepage preflight blocks partial origin and unclear type without capture or reservation", { skip: !enabled, timeout: 40_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await stubLocalApis(page);
    let captures = 0;
    await page.route("**/api/journey-capture", async (route: BrowserRoute) => { captures++; await route.fulfill({ status: 503, body: "{}" }); });
    await page.goto(baseUrl);
    await page.getByRole("tab", { name: "Describe my trip", exact: true }).click();
    const prompt = page.getByRole("textbox", { name: "Start your plan", exact: true });
    await prompt.fill("Tokyo and Kyoto 5 nights");
    await page.getByRole("combobox", { name: "Start from", exact: true }).fill("Lond");
    await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.getByText("Select your starting place from the results.", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(captures, 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null")?.receipt), undefined);
    await page.getByRole("combobox", { name: "Start from", exact: true }).fill("");
    await prompt.fill("Maybe a one-way trip through Japan");
    await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.getByText("Review how your trip ends. Choose and confirm the trip type.", { exact: true }).first().waitFor();
    assert.equal(captures, 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("easyt-home-trip-draft")), null);
  } finally { await context.close(); await browser.close(); }
});

test("homepage domain review reloads, returns preserved input and accepts Return once", { skip: !enabled, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await stubLocalApis(page);
    let captures = 0;
    await page.route("**/api/journey-capture", async (route: BrowserRoute) => {
      captures++;
      const capture = captureJourneyBrief(route.request().postDataJSON().brief);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...capture, journeyEnd: { mode: "explicit", place: { name: "Rome", canonicalPlaceId: "rome" } } }) });
    });
    await page.goto(baseUrl);
    await page.getByRole("tab", { name: "Describe my trip", exact: true }).click();
    const source = "Tokyo 3 nights, Kyoto 2 nights, Rome 3 nights";
    await page.getByRole("textbox", { name: "Start your plan", exact: true }).fill(source);
    await page.getByRole("button", { name: "Return to start", exact: true }).click();
    await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.waitForURL(/\/journey\/new\?/);
    await page.getByText("Review how your trip ends. Edit your trip idea to continue.", { exact: true }).waitFor();
    const blocked = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
    assert.equal(blocked.review.receipt.frozenSnapshot.prompt, source);
    assert.equal(blocked.review.phase, "blocked");
    assert.equal(await page.getByRole("button", { name: "Try again", exact: true }).count(), 0);
    await page.reload();
    await page.getByText("Review how your trip ends. Edit your trip idea to continue.", { exact: true }).waitFor();
    assert.equal(captures, 1);
    await page.getByRole("button", { name: "Edit trip idea", exact: true }).click();
    await page.waitForURL(baseUrl + "/");
    assert.equal(await page.getByRole("textbox", { name: "Start your plan", exact: true }).inputValue(), source);
    assert.equal(await page.evaluate(() => localStorage.getItem("easyt-home-trip-draft")), null);
    await page.getByRole("button", { name: "Return to start", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.waitForURL(/\btrip=/);
    const result = await page.evaluate(() => ({
      input: JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"),
      recovery: Object.keys(localStorage).filter(key => key.startsWith("easyt:trip-recovery:v2:guest:")).map(key => JSON.parse(localStorage.getItem(key)!)),
    }));
    assert.equal(captures, 2);
    assert.notEqual(result.input.receipt.handoffId, blocked.receipt.handoffId);
    assert.equal(result.input.review, undefined);
    assert.equal(new Set(result.recovery.map((record: { tripId: string }) => record.tripId)).size, 1);
    assert.equal(result.recovery[0].trip.brief.intent.route.tripType, "return_to_start");
    assert.deepEqual(result.recovery[0].trip.brief.intent.route.journeyEnd, { mode: "same_as_start" });
    assert.deepEqual(result.recovery[0].trip.brief.intent.route.destinations.map((intent: { requestedNights: number }) => intent.requestedNights), [3, 2, 3]);
    await page.reload();
    assert.equal(captures, 2);
    await page.goto(baseUrl);
    await page.getByRole("textbox", { name: "Start your plan", exact: true }).fill(source + ", finish in Madrid");
    await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.getByText("Review how your trip ends. Choose and confirm the trip type.", { exact: true }).first().waitFor();
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(captures, 2);
    const later = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
    assert.equal(later.snapshot.routeReview, undefined);
  } finally { await context.close(); await browser.close(); }
});

test("malformed intake review stays visible and preserves original recovery bytes", { skip: !enabled, timeout: 40_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await stubLocalApis(page);
    const original = JSON.stringify({ snapshot: { version: 1, ownerId: null, revision: 0, mode: "describe", prompt: "Keep my original Tokyo draft", entries: [], dates: { state: "untouched" }, budget: { state: "untouched" }, interests: { state: "untouched" }, travellers: { state: "untouched" }, origin: { state: "untouched" }, journeyEnd: { state: "untouched" } }, review: { version: 99 } });
    await page.addInitScript((value: string) => localStorage.setItem("easyt-private:guest:homepage-input", value), original);
    await page.goto(baseUrl);
    await page.getByText("We couldn't restore this trip input. Your saved recovery copy is still on this device.", { exact: true }).waitFor();
    assert.equal(await page.locator("#start-building").getByRole("button", { name: "Plan my trip", exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("easyt-private:guest:homepage-input")), original);
  } finally { await context.close(); await browser.close(); }
});
