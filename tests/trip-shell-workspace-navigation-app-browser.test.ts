import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import test from "node:test";
import { tripFromBuilder } from "../lib/easyt/trip.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_WORKSPACE_APP_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";

const trip = tripFromBuilder({
  id: "trip-12340000-0000-4000-8000-000000000013", origin: "Windhoek",
  stops: [
    { id: "windhoek", name: "Windhoek", country: "Namibia", coordinates: [17.0832, -22.5609] },
    { id: "sossusvlei", name: "Sossusvlei", country: "Namibia", coordinates: [15.2939, -24.7464] },
    { id: "swakopmund", name: "Swakopmund", country: "Namibia", coordinates: [14.5266, -22.6784] },
  ],
  startDate: "2026-10-02", endDate: "2026-10-09", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid",
  nightAllocations: { windhoek: 1, sossusvlei: 3, swakopmund: 3 }, draft: [],
});

const workspaces = [
  { label: "Overview", suffix: "", region: "Trip overview" },
  { label: "Itinerary", suffix: "/itinerary", region: "Trip itinerary" },
  { label: "Explore", suffix: "/explore", region: "Explore recommendations" },
  { label: "Stay", suffix: "/stay", region: "Stay planning for Windhoek" },
  { label: "Transport", suffix: "/transport", region: "Your transport" },
] as const;

test("TripShell sibling navigation replaces route content as well as URL and active tab", { skip: !enabled, timeout: 120_000 }, async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    // Production sibling transitions can overlap while a dynamic RSC response
    // is pending. Delay those responses to exercise the real App Router race.
    await page.route(/_rsc=/, async (route: { continue: () => Promise<void> }) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    const pageErrors: string[] = [];
    const routeRequests: string[] = [];
    const routeResponses: string[] = [];
    const routeFailures: string[] = [];
    const prefix = `/journey/${trip.id}`;
    page.on("pageerror", (error: Error) => pageErrors.push(error.message));
    page.on("request", (request: { url: () => string }) => { if (request.url().includes("_rsc=")) routeRequests.push(request.url()); });
    page.on("response", (response: { url: () => string; status: () => number }) => { if (response.url().includes("_rsc=") && response.url().includes(prefix)) routeResponses.push(`${response.status()} ${response.url()}`); });
    page.on("requestfailed", (request: { url: () => string; failure: () => { errorText: string } | null }) => { if (request.url().includes("_rsc=") && request.url().includes(prefix)) routeFailures.push(`${request.failure()?.errorText} ${request.url()}`); });
    await page.addInitScript((value: typeof trip) => {
      localStorage.setItem(`easyt:trip-recovery:v2:guest:${encodeURIComponent(value.id)}:workspace-navigation-fixture`, JSON.stringify({
        version: 2, ownerId: null, tripId: value.id, trip: value, state: "pending", writeId: "workspace-navigation-fixture", savedAt: "2026-10-02T12:00:00.000Z",
      }));
    }, trip);
    await page.goto(`${baseUrl}${prefix}`);
    const navigation = page.getByRole("navigation", { name: "Trip workspace" });
    const visibleWorkspace = () => Promise.all(workspaces.map(async ({ region }) => ({ region, count: await page.getByRole("region", { name: region, exact: true }).count() })));
    await page.getByRole("region", { name: "Trip overview" }).waitFor();
    const visit = async (label: typeof workspaces[number]["label"]) => {
      const target = workspaces.find((workspace) => workspace.label === label)!;
      await navigation.getByRole("link", { name: label }).click();
      await page.waitForURL(`${baseUrl}${prefix}${target.suffix}`);
      try {
        await page.getByRole("region", { name: target.region, exact: true }).waitFor({ state: "visible", timeout: 8000 });
      } catch {
        throw new Error(`${label} content did not mount: ${JSON.stringify({ url: page.url(), regions: await page.locator('[role="region"]').evaluateAll((items: Element[]) => items.map((item) => item.getAttribute('aria-label'))), headings: await page.locator('h2').allTextContents(), routeRequests, pageErrors })}`);
      }
      assert.deepEqual((await visibleWorkspace()).filter(({ count }) => count > 0).map(({ region }) => region), [target.region],
        `${label} URL must never retain another workspace's content`);
      assert.equal(await navigation.getByRole("link", { name: label }).getAttribute("aria-current"), "page");
    };
    for (const label of ["Transport", "Overview", "Itinerary", "Overview", "Explore", "Overview", "Stay", "Overview", "Transport", "Stay", "Itinerary", "Transport", "Overview"] as const) await visit(label);
    await page.goBack();
    await page.getByRole("region", { name: "Your transport" }).waitFor({ state: "visible", timeout: 8000 });
    await page.goBack();
    await page.getByRole("region", { name: "Trip itinerary" }).waitFor({ state: "visible", timeout: 8000 });
    await page.goForward();
    await page.getByRole("region", { name: "Your transport" }).waitFor({ state: "visible", timeout: 8000 });
    await page.goForward();
    await page.getByRole("region", { name: "Trip overview" }).waitFor({ state: "visible", timeout: 8000 });
    for (let index = 0; index < 20; index += 1) {
      await navigation.getByRole("link", { name: "Transport" }).click();
      await navigation.getByRole("link", { name: "Overview" }).click();
    }
    await navigation.getByRole("link", { name: "Transport" }).click();
    await page.waitForURL(`${baseUrl}${prefix}/transport`);
    try {
      await page.getByRole("region", { name: "Your transport" }).waitFor({ state: "visible", timeout: 8000 });
    } catch {
      throw new Error(`stress transition stalled: ${JSON.stringify({ url: page.url(), regions: await page.locator('[role="region"]').evaluateAll((items: Element[]) => items.map((item) => item.getAttribute('aria-label'))), headings: await page.locator('h2').allTextContents(), routeRequests: routeRequests.slice(-8), routeResponses: routeResponses.slice(-8), routeFailures: routeFailures.slice(-8), pageErrors })}`);
    }
    assert.equal(await page.getByRole("region", { name: "Trip overview" }).count(), 0);
    await page.goto(`${baseUrl}${prefix}/transport?leg=unknown`);
    await page.getByRole("region", { name: "Your transport" }).waitFor({ state: "visible", timeout: 8000 });
    assert.equal(new URL(page.url()).searchParams.get("leg"), "unknown");
    assert.deepEqual(pageErrors, []);
    assert.ok(routeRequests.length > 0, "sibling navigation requests App Router payloads");
  } finally { await browser.close(); }
});
