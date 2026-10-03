import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_AUTHENTICATED_WORKSPACE_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";

test("canonical account trip never leaves stale route content after rapid sibling navigation", { skip: !enabled, timeout: 120_000 }, async () => {
  const email = process.env.MORROVIA_BROWSER_TEST_EMAIL ?? (process.env.STAGING_TEST_PASSWORD_A ? "test-user-a@morrovia-staging.test" : undefined);
  const password = process.env.MORROVIA_BROWSER_TEST_PASSWORD ?? process.env.STAGING_TEST_PASSWORD_A;
  assert.ok(email && password, "provide a dedicated authenticated browser-test account");
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const rscDelayMs = Number(process.env.MORROVIA_WORKSPACE_RSC_DELAY_MS ?? 0);
    if (rscDelayMs > 0) await page.route(/_rsc=/, async (route: { continue: () => Promise<void> }) => {
      await new Promise((resolve) => setTimeout(resolve, rscDelayMs));
      await route.continue();
    });
    const trace: Array<Record<string, unknown>> = [];
    const note = (kind: string, fields: Record<string, unknown>) => trace.push({ at: Date.now(), kind, ...fields });
    page.on("request", (request: { url: () => string }) => {
      if (request.url().includes("_rsc=") && request.url().includes("/journey/trip-")) note("request", { url: request.url() });
    });
    page.on("response", (response: { url: () => string; status: () => number; finished: () => Promise<unknown> }) => {
      if (!response.url().includes("_rsc=") || !response.url().includes("/journey/trip-")) return;
      note("response", { url: response.url(), status: response.status() });
      void response.finished().then(() => note("response-finished", { url: response.url() })).catch(() => {});
    });
    page.on("requestfailed", (request: { url: () => string; failure: () => { errorText: string } | null }) => {
      if (request.url().includes("_rsc=") && request.url().includes("/journey/trip-")) note("requestfailed", { url: request.url(), error: request.failure()?.errorText });
    });
    page.on("pageerror", (error: Error) => note("pageerror", { error: error.message }));
    page.on("console", (message: { type: () => string; text: () => string }) => {
      if (message.type() === "error") note("console-error", { error: message.text() });
    });

    const signIn = await page.request.post(`${baseUrl}/api/auth/sign-in/email`, {
      headers: { origin: baseUrl }, data: { email, password },
    });
    assert.equal(signIn.status(), 200, "test account signs in through the real auth endpoint");
    const tripsResponse = await page.request.get(`${baseUrl}/api/easyt/trips`);
    assert.equal(tripsResponse.status(), 200, "test account can read its canonical trips");
    const { trips } = await tripsResponse.json() as { trips: Array<{ id: string; ownerId: string }> };
    const tripId = process.env.MORROVIA_BROWSER_TEST_TRIP_ID ?? trips[0]?.id;
    assert.ok(tripId && trips.some((trip) => trip.id === tripId && trip.ownerId), "fixture must be a canonical trip owned by the signed-in account");
    const prefix = `/journey/${tripId}`;
    await page.goto(`${baseUrl}${prefix}`);
    const navigation = page.getByRole("navigation", { name: "Trip workspace" });
    await page.getByRole("region", { name: "Trip overview", exact: true }).waitFor();
    await page.evaluate(() => {
      const current = () => [
        document.querySelector('[aria-label="Trip overview"]') && "Trip overview",
        document.querySelector('[aria-label="Journey summary"]') && "Your transport",
        document.querySelector('[aria-label^="Stay planning"]') && "Stay planning",
        document.querySelector('[aria-label="Trip itinerary"]') && "Trip itinerary",
        document.querySelector('[aria-label="Explore recommendations"]') && "Explore recommendations",
      ].filter((name): name is string => Boolean(name));
      const records: Array<{ at: number; regions: string[]; pathname: string; active: string | null }> = [];
      const record = () => records.push({ at: Date.now(), regions: current(), pathname: location.pathname,
        active: document.querySelector('[aria-label="Trip workspace"] [aria-current="page"]')?.textContent?.trim() ?? null });
      record();
      new MutationObserver(record).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "aria-label"] });
      Object.assign(window, { __morroviaNavigationTrace: records });
    });
    const click = async (label: string) => {
      note("click", { label, before: new URL(page.url()).pathname });
      await navigation.getByRole("link", { name: label, exact: true }).click();
      note("clicked", { label, after: new URL(page.url()).pathname });
    };
    const snapshot = async () => page.evaluate(() => ({
      pathname: location.pathname,
      active: document.querySelector('[aria-label="Trip workspace"] [aria-current="page"]')?.textContent?.trim() ?? null,
      regions: [
        document.querySelector('[aria-label="Trip overview"]') && "Trip overview",
        document.querySelector('[aria-label="Journey summary"]') && "Your transport",
        document.querySelector('[aria-label^="Stay planning"]') && "Stay planning",
        document.querySelector('[aria-label="Trip itinerary"]') && "Trip itinerary",
        document.querySelector('[aria-label="Explore recommendations"]') && "Explore recommendations",
      ].filter(Boolean),
      mounts: (window as Window & { __morroviaNavigationTrace?: unknown }).__morroviaNavigationTrace,
    }));
    const assertWorkspace = async (label: string, suffix: string, region: string, settleMs = 150) => {
      await page.waitForURL((url: URL) => url.pathname === `${prefix}${suffix}`);
      try { await page.waitForFunction((expected: string) => {
        const selectors: Record<string, string> = {
          "Trip overview": '[aria-label="Trip overview"]',
          "Your transport": '[aria-label="Journey summary"]',
          "Stay planning": '[aria-label^="Stay planning"]',
          "Trip itinerary": '[aria-label="Trip itinerary"]',
          "Explore recommendations": '[aria-label="Explore recommendations"]',
        };
        return Boolean(document.querySelector(selectors[expected]));
      }, region, { timeout: 10_000 }); } catch {
        throw new Error(`${label} child did not mount: ${JSON.stringify({ state: await snapshot(), trace: trace.slice(-30) })}`);
      }
      await page.waitForTimeout(settleMs);
      const state = await snapshot();
      assert.equal(state.pathname, `${prefix}${suffix}`, JSON.stringify({ label, state, trace }));
      assert.equal(state.active, label, JSON.stringify({ label, state, trace }));
      assert.deepEqual(state.regions, [region], JSON.stringify({ label, state, trace: trace.slice(-30) }));
    };

    await click("Transport");
    await assertWorkspace("Transport", "/transport", "Your transport");
    await click("Stay");
    await assertWorkspace("Stay", "/stay", "Stay planning");
    await click("Itinerary");
    await assertWorkspace("Itinerary", "/itinerary", "Trip itinerary");
    await click("Overview");
    await assertWorkspace("Overview", "", "Trip overview");
    await click("Explore");
    await assertWorkspace("Explore", "/explore", "Explore recommendations");
    await click("Overview");
    await assertWorkspace("Overview", "", "Trip overview");
    for (const label of ["Transport", "Stay", "Overview", "Transport"]) await click(label);
    await assertWorkspace("Transport", "/transport", "Your transport", 2500);
    await page.goBack();
    await assertWorkspace("Overview", "", "Trip overview");
    await page.goForward();
    await assertWorkspace("Transport", "/transport", "Your transport");
    await click("Overview");
    await assertWorkspace("Overview", "", "Trip overview");
    for (const label of ["Transport", "Stay"]) await click(label);
    await assertWorkspace("Stay", "/stay", "Stay planning", 2500);
    await page.goto(`${baseUrl}${prefix}/transport?leg=unknown`);
    await assertWorkspace("Transport", "/transport", "Your transport");
    assert.equal(new URL(page.url()).searchParams.get("leg"), "unknown");
    await page.reload();
    await assertWorkspace("Transport", "/transport", "Your transport");
    await navigation.getByRole("link", { name: "Itinerary", exact: true }).focus();
    await page.keyboard.press("Enter");
    await assertWorkspace("Itinerary", "/itinerary", "Trip itinerary");
    assert.deepEqual(trace.filter((event) => event.kind === "pageerror"), []);
  } finally {
    await browser.close();
  }
});
