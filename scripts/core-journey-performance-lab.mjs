import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3333";
const output = process.env.MORROVIA_PERF_OUTPUT ?? "/tmp/morrovia-performance-lab.json";
const consent = JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false }, "2026-10-05T12:00:00.000Z"));
const places = {
  madrid: { name: "Madrid", country: "Spain", countryCode: "ES", coordinates: [-3.7038, 40.4168] },
  lisbon: { name: "Lisbon", country: "Portugal", countryCode: "PT", coordinates: [-9.1393, 38.7223] },
  porto: { name: "Porto", country: "Portugal", countryCode: "PT", coordinates: [-8.6291, 41.1579] },
  london: { name: "London", country: "United Kingdom", countryCode: "GB", coordinates: [-0.1278, 51.5074] },
};

async function setup(context, storage = []) {
  storage = [[PRIVACY_CONSENT_STORAGE_KEY, consent], ...storage];
  await context.addInitScript((entries) => {
    for (const [key, value] of entries) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    window.__morroviaLcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__morroviaLcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  }, storage);
  await context.route("**/api/journey-geocode?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("place")?.toLowerCase() ?? "";
    const match = Object.entries(places).find(([name]) => query.includes(name));
    const candidate = match ? {
      canonicalPlaceId: match[0], ...match[1], providerId: `core-fixture:${match[0]}`,
      providerSourceLabel: "Core journey fixture", kind: "city", placeType: "city",
      routability: "direct_destination", matchQuality: "exact", rankScore: 200,
    } : null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: candidate ? [candidate] : [] }) });
  });
  await context.route("https://tiles.openfreemap.org/**", (route) => route.abort());
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const seedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setup(seedContext);
  const seed = await seedContext.newPage();
  await seed.goto(base, { waitUntil: "domcontentloaded" });
  await seed.getByRole("button", { name: /Where do you want to go/ }).click();
  const choose = async (index, name, country) => {
    await seed.getByRole("combobox").nth(index).fill(name);
    await seed.getByRole("option", { name: new RegExp(`${name}.*${country}`) }).first().click();
  };
  await choose(0, "Madrid", "Spain");
  for (const [index, name, country] of [[1, "Lisbon", "Portugal"], [2, "Porto", "Portugal"]]) {
    await seed.getByRole("button", { name: "Add another stop" }).click();
    await choose(index, name, country);
  }
  await seed.getByRole("button", { name: "Plan my trip" }).first().click();
  await seed.waitForURL(/\/journey\/new\?/);
  const builderPath = new URL(seed.url()).pathname + new URL(seed.url()).search;
  await seed.locator("[data-builder-route-workspace]").waitFor();
  await seed.getByRole("combobox", { name: "Starting from" }).fill("London");
  await seed.getByRole("option", { name: /London.*United Kingdom/ }).first().click();
  await seed.getByRole("button", { name: "Save changes" }).click();
  await seed.getByRole("button", { name: /Build trip/ }).click();
  await seed.waitForURL(/\/journey\/trip-[^/]+\?created=1/, { timeout: 30000 });
  const tripId = new URL(seed.url()).pathname.split("/")[2];
  await seed.getByRole("region", { name: "Trip overview" }).waitFor();
  const storage = await seed.evaluate(() => Object.entries(localStorage));
  if (process.env.MORROVIA_PROFILE_FIXTURE === "1") storage.push(["easyt-private:guest:travel-readiness-profile", JSON.stringify({ nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2030-12" })]);
  await seedContext.close();

  const routes = [
    ["homepage", "/", "body"],
    ["builder", builderPath, "[data-builder-route-workspace]"],
    ["overview", `/journey/${tripId}`, '[aria-label="Trip overview"]'],
    ["itinerary", `/journey/${tripId}/itinerary`, '[aria-label="Trip itinerary"]'],
    ["map", `/journey/${tripId}/map`, ".planner-map canvas.maplibregl-canvas"],
    ["stay", `/journey/${tripId}/stay`, "body"],
  ];
  const results = [];
  for (const [name, pathname, readySelector] of routes) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setup(context, storage);
    const page = await context.newPage();
    const requests = [];
    const readinessStarts = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/journey-readiness")) readinessStarts.push(request.url());
    });
    page.on("requestfinished", async (request) => {
      const response = await request.response();
      const sizes = await request.sizes().catch(() => null);
      requests.push({ url: request.url(), type: request.resourceType(), status: response?.status() ?? null, bytes: sizes?.responseBodySize ?? 0 });
    });
    const started = Date.now();
    await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded" });
    await page.locator(readySelector).first().waitFor({ state: "visible", timeout: 20000 });
    const readyMs = Date.now() - started;
    await page.waitForTimeout(1200);
    const timing = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      return { dclMs: entry?.domContentLoadedEventEnd ?? null, loadMs: entry?.loadEventEnd ?? null, lcpMs: window.__morroviaLcp ?? null, overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth) };
    });
    const local = requests.filter((request) => request.url.startsWith(base));
    const total = (items) => items.reduce((sum, item) => sum + item.bytes, 0);
    if (process.env.MORROVIA_ASSERT_SINGLE_READINESS === "1" && name === "overview") {
      assert.equal(readinessStarts.length, 1, "stored traveller profile should trigger one readiness request");
    }
    if (process.env.MORROVIA_ASSERT_DEFERRED_MAP === "1" && (name === "overview" || name === "itinerary")) {
      const preview = page.locator("[data-map-preview]").first();
      if (await preview.count()) {
        assert.equal(await preview.locator("canvas.maplibregl-canvas").count(), 0, `${name} map loaded before its below-fold preview entered the viewport`);
        if (await preview.isVisible()) {
          await preview.scrollIntoViewIfNeeded();
          await preview.locator("canvas.maplibregl-canvas").waitFor({ timeout: 10000 });
        }
      }
    }
    if (process.env.MORROVIA_PERF_VISUAL_DIR && (name === "overview" || name === "itinerary")) {
      mkdirSync(process.env.MORROVIA_PERF_VISUAL_DIR, { recursive: true });
      for (const width of [390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} overflows at ${width}px`);
        await page.screenshot({ path: `${process.env.MORROVIA_PERF_VISUAL_DIR}/${name}-${width}.png`, fullPage: true });
      }
    }
    results.push({ name, pathname, readyMs, ...timing, requests: requests.length, localRequests: local.length, readinessStarts: readinessStarts.length, localJsBytes: total(local.filter((item) => item.type === "script")), largestScripts: local.filter((item) => item.type === "script").sort((a, b) => b.bytes - a.bytes).slice(0, 6).map(({ url, bytes }) => ({ file: new URL(url).pathname.split("/").at(-1), bytes })), localImageBytes: total(local.filter((item) => item.type === "image")), remoteImageBytes: total(requests.filter((item) => item.type === "image" && !item.url.startsWith(base))), localTotalBytes: total(local) });
    await context.close();
  }
  const report = { base, viewport: { width: 390, height: 844 }, fixture: "Madrid → Lisbon → Porto; London origin; OpenFreeMap tile fallback", generatedAt: new Date().toISOString(), results };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
