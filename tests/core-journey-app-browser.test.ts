import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import type { BrowserContext, Page } from "playwright";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright")) as typeof import("playwright");
const enabled = process.env.MORROVIA_CORE_JOURNEY_BROWSER_TESTS === "1";
const base = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";
if (enabled) {
  const target = new URL(base);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
    throw new Error("Tier 1 browser tests may target only a local HTTP app; hosted staging and production are excluded.");
  }
}
const artifacts = process.env.MORROVIA_BROWSER_ARTIFACT_DIR ?? "/tmp/morrovia-core-journey";
const consent = JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false }, "2026-10-05T12:00:00.000Z"));

const places = {
  Madrid: { canonicalPlaceId: "madrid", name: "Madrid", country: "Spain", countryCode: "ES", coordinates: [-3.7038, 40.4168] },
  Lisbon: { canonicalPlaceId: "lisbon", name: "Lisbon", country: "Portugal", countryCode: "PT", coordinates: [-9.1393, 38.7223] },
  Porto: { canonicalPlaceId: "porto", name: "Porto", country: "Portugal", countryCode: "PT", coordinates: [-8.6291, 41.1579] },
  London: { canonicalPlaceId: "london", name: "London", country: "United Kingdom", countryCode: "GB", coordinates: [-0.1278, 51.5074] },
  Paris: { canonicalPlaceId: "paris", name: "Paris", country: "France", countryCode: "FR", coordinates: [2.3522, 48.8566] },
  Agra: { canonicalPlaceId: "agra", name: "Agra", country: "India", countryCode: "IN", coordinates: [78.0081, 27.1767] },
} as const;

async function installDeterministicBoundaries(context: BrowserContext) {
  await context.addInitScript(({ key, value }: { key: string; value: string }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: PRIVACY_CONSENT_STORAGE_KEY, value: consent });
  await context.route("**/api/journey-geocode?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("place")?.toLowerCase() ?? "";
    const match = Object.entries(places).find(([name]) => query.includes(name.toLowerCase()))?.[1];
    const candidate = match ? { ...match, providerId: `core-fixture:${match.canonicalPlaceId}`, providerSourceLabel: "Core journey fixture", kind: "city", placeType: "city", routability: "direct_destination", matchQuality: "exact", rankScore: 200 } : null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: candidate ? [candidate] : [] }) });
  });
  // The bundled fallback style still mounts the real MapLibre canvas and markers.
  await context.route("https://tiles.openfreemap.org/**", (route) => route.abort());
}

async function withEvidence(name: string, run: (page: Page, context: BrowserContext) => Promise<void>) {
  const browser = await chromium.launch({ headless: true, ...(process.env.MORROVIA_BROWSER_CHANNEL ? { channel: process.env.MORROVIA_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    await installDeterministicBoundaries(context);
    await run(page, context);
    await context.tracing.stop();
  } catch (error) {
    mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true }).catch(() => {});
    await context.tracing.stop({ path: `${artifacts}/${name}.zip` }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function recoveryTrip(page: Page, tripId: string) {
  return page.evaluate((id) => {
    const records = Object.keys(localStorage).filter((key) => key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`));
    return records.map((key) => {
      try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip; } catch { return null; }
    }).find((trip) => trip?.id === id) ?? null;
  }, tripId) as Promise<{ id: string; stops: Array<{ id: string; name: string; canonicalPlaceId?: string; nights?: number }>; planItems: Array<{ dayNumber: number; stopId: string; notes: string[] }>; brief: { dayNotes?: Record<number, string[]>; intent?: { route?: { origin?: { canonicalPlaceId?: string } } } } } | null>;
}

test("Tier 1 guest journey keeps three canonical stops and edits through Build and recovery", { skip: !enabled, timeout: 180_000 }, async () => withEvidence("guest-core-journey", async (page) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Start from", exact: true }).fill("Paris");
  await page.getByRole("option", { name: /Paris.*France/ }).first().click();
  const choose = async (name: string, country: string) => {
    await page.getByRole("combobox", { name: "Destination", exact: true }).fill(name);
    await page.getByRole("option", { name: new RegExp(`${name}.*${country}`) }).first().click();
  };
  await choose("Madrid", "Spain");
  for (const [name, country] of [["Lisbon", "Portugal"], ["Porto", "Portugal"]] as const) {
    await page.getByRole("button", { name: "Add destination", exact: true }).click();
    await choose(name, country);
  }
  await page.getByRole("button", { name: "Plan my trip" }).first().click();
  await page.waitForURL(/\/journey\/new\?/);
  const homepage = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
  assert.deepEqual(homepage.snapshot.entries.map((entry: { selection: { canonicalPlaceId: string } }) => entry.selection.canonicalPlaceId), ["madrid", "lisbon", "porto"]);
  assert.equal(homepage.receipt.version, 1);
  const builder = page.locator("[data-builder-route-workspace]");
  await builder.waitFor({ state: "visible", timeout: 20_000 });
  const rows = builder.locator("[data-builder-stop-index]");
  assert.deepEqual(await rows.evaluateAll((items) => items.map((row) => row.querySelector("[role='cell'] strong")?.textContent)), ["Madrid", "Lisbon", "Porto"]);
  const nights = await rows.evaluateAll((items) => items.map((row) => Number(row.querySelector('[aria-label^="Add one night"]')?.getAttribute("aria-label")?.match(/; (\d+) nights/)?.[1])));
  assert.equal(nights.length, 3);
  assert.ok(nights.every((night) => night > 0));
  const draftTripId = new URL(page.url()).searchParams.get("trip");
  assert.ok(draftTripId);
  await page.waitForFunction((id) => Object.keys(localStorage)
    .filter((key) => key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`))
    .some((key) => {
      try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip?.brief?.intent?.route?.origin?.canonicalPlaceId === "paris"; }
      catch { return false; }
    }), draftTripId);
  const initialDraft = await recoveryTrip(page, draftTripId);
  assert.equal(initialDraft?.brief.intent?.route?.origin?.canonicalPlaceId, "paris");
  await page.getByRole("combobox", { name: "Start from" }).fill("London");
  await page.getByRole("option", { name: /London.*United Kingdom/ }).first().click();
  await page.waitForFunction((id) => Object.keys(localStorage)
    .filter((key) => key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`))
    .some((key) => {
      try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip?.brief?.intent?.route?.origin?.canonicalPlaceId === "london"; }
      catch { return false; }
    }), draftTripId);
  await page.getByRole("button", { name: /Build trip/ }).click();
  await page.waitForURL(/\/journey\/trip-[^/]+\?created=1/, { timeout: 20_000 });
  const tripId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByRole("region", { name: "Trip overview" }).waitFor({ state: "visible", timeout: 20_000 });
  const built = await recoveryTrip(page, tripId);
  assert.ok(built, "Build leaves a recoverable guest trip on this device");
  assert.equal(built.brief.intent?.route?.origin?.canonicalPlaceId, "london", "Build preserves the accepted Builder origin edit");
  assert.deepEqual(built.stops.map((stop) => stop.canonicalPlaceId), ["madrid", "lisbon", "porto"]);
  assert.deepEqual(built.stops.map((stop) => stop.nights), nights);
  assert.equal(built.stops.some((stop) => stop.name === "London"), false);

  await page.goto(`${base}/journey/${tripId}/itinerary`, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Trip itinerary" }).waitFor();
  await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 2_000 }).catch(() => {});
  const planner = page.locator("section[aria-label='Day 1 planner']");
  await planner.waitFor();
  await planner.getByRole("button", { name: /Add plan to .* morning/i }).click();
  const dialog = page.getByRole("dialog", { name: /Add to morning on Day 1/i });
  await dialog.getByRole("textbox", { name: "Add your own", exact: true }).fill("Morning walk fixture");
  await dialog.getByRole("button", { name: "Add to Morning" }).click();
  await planner.locator('[data-day-part="morning"]').getByText("Morning walk fixture", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Add day note" }).fill("Remember train tickets fixture");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByText("Remember train tickets fixture", { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("section[aria-label='Day 1 planner']").waitFor();
  const recovered = await recoveryTrip(page, tripId);
  assert.ok(recovered);
  assert.equal(recovered.brief.intent?.route?.origin?.canonicalPlaceId, "london", "Hard reload recovers the edited origin");
  const firstDay = recovered.planItems.find((day) => day.dayNumber === 1);
  assert.ok(firstDay);
  assert.equal(firstDay.notes.filter((note) => note === "Morning walk fixture").length, 1);
  assert.equal(recovered.brief.dayNotes?.[1]?.filter((note) => note === "Remember train tickets fixture").length, 1);

  await page.goto(`${base}/journey/${tripId}/map`, { waitUntil: "domcontentloaded" });
  const map = page.locator(".planner-map").first();
  await map.waitFor({ timeout: 20_000 });
  await map.locator("canvas.maplibregl-canvas").waitFor();
  await map.locator(".planner-map__stop").first().waitFor();
  const marker = map.locator(".planner-map__stop").first();
  const before = await marker.boundingBox();
  const canvas = await map.locator("canvas.maplibregl-canvas").boundingBox();
  assert.ok(before && canvas);
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 70, canvas.y + canvas.height / 2 + 35, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(({ x, y }) => {
    const rect = document.querySelector(".planner-map .planner-map__stop")?.getBoundingClientRect();
    return Boolean(rect && (Math.abs(rect.x - x) > 5 || Math.abs(rect.y - y) > 5));
  }, { x: before.x, y: before.y }, { timeout: 5_000 });
  for (const width of [390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await map.locator("canvas.maplibregl-canvas").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Map horizontal overflow at ${width}px`);
  }

  await page.goto(`${base}/journey/${tripId}/prep`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`${base}/journey/${tripId}`);
  await page.getByRole("region", { name: "Trip overview" }).waitFor();
  await page.getByRole("heading", { name: /Practical prep|Before you go/i }).first().waitFor();
  for (const width of [390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/journey/${tripId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("region", { name: "Trip overview" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `horizontal overflow at ${width}px`);
  }
  assert.deepEqual(pageErrors, []);
}));

test("Tier 1 Discovery resolves a landmark as a visit with a canonical overnight base", { skip: !enabled, timeout: 90_000 }, async () => withEvidence("guest-discovery", async (page) => {
  await page.goto(`${base}/journey/new`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Describe my trip" }).click();
  await page.getByPlaceholder("Where would you like to go, for how long?").fill("Taj Mahal");
  await page.getByRole("button", { name: /Plan my trip/ }).click();
  await page.getByRole("button", { name: "Continue shaping your route" }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue shaping your route" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Choose a base", exact: true }).waitFor();
  await dialog.getByText("Stay in Agra", { exact: true }).click();
  await dialog.getByRole("button", { name: "Add to trip", exact: true }).click();
  await dialog.waitFor({ state: "detached", timeout: 15_000 });
  await page.locator("[data-builder-route-workspace] [data-builder-stop-index]").first().waitFor();
  assert.equal(await page.locator("[data-builder-route-workspace] [data-builder-stop-index]").first().innerText().then((text) => text.includes("Agra")), true);
  const discovered = await page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith("easyt:trip-recovery:v2:guest:"))
    .map((key) => { try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip; } catch { return null; } })
    .find((trip) => trip?.stops?.some((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId === "agra")) ?? null) as {
      stops: Array<{ id: string; name: string; canonicalPlaceId?: string }>;
      brief: { structuredBrief?: { placeSelections?: Array<{ kind: string; mentionId: string; routeStopId?: string }>; completedPlanningAreaMentionIds?: string[] } };
    } | null;
  assert.ok(discovered);
  assert.deepEqual(discovered.stops.map((stop) => stop.canonicalPlaceId), ["agra"]);
  assert.equal(discovered.stops.some((stop) => stop.name === "Taj Mahal"), false);
  assert.equal(discovered.brief.structuredBrief?.placeSelections?.filter((selection) => selection.kind === "visit" && selection.mentionId === "place-taj-mahal-0" && selection.routeStopId === discovered.stops[0]?.id).length, 1);
}));
