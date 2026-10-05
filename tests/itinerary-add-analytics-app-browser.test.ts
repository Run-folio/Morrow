import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { EASYT_TRIP_RECOVERY_PREFIX, loadTripRecoveryFromStorage, saveTripRecoveryToStorage } from "../lib/easyt/storage.ts";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const base = process.env.MORROVIA_BASE_URL;

const stop = { id: "kyoto", name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto", coordinates: [135.7681, 35.0116] as [number, number] };
const trip = tripFromBuilder({
  id: "trip-analytics-0000-4000-8000-000000000001", origin: "Tokyo", stops: [stop],
  startDate: "2026-10-04", endDate: "2026-10-06", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid",
  draft: buildCredibleItinerary({ origin: "Tokyo", stops: [stop], startDate: "2026-10-04", allocations: { kyoto: 2 }, picks: {}, places: {} }),
  nightAllocations: { kyoto: 2 },
});

function seededStorage() {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); }, removeItem(key: string) { values.delete(key); },
  };
  assert.equal(saveTripRecoveryToStorage(storage, trip, { writeId: "analytics-fixture", now: "2026-10-05T12:00:00.000Z" }).stored, true);
  values.set(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false })));
  return [...values.entries()];
}

async function addedCalls(page: any) {
  return await page.evaluate(() => (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.filter((call) => call[1] === "itinerary_item_added") ?? []) as unknown[][];
}

test("real app counts accepted manual, suggestion, Viator fixture and Food adds once with safe payloads", { skip: !base, timeout: 180_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.addInitScript(({ entries, prefix }: { entries: [string, string][]; prefix: string }) => {
      for (const [key, value] of entries) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      (window as typeof window & { __analyticsCalls?: unknown[][]; __failNextRecovery?: boolean }).__analyticsCalls = [];
      (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
        (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.push(args);
      };
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        const local = window as typeof window & { __failNextRecovery?: boolean };
        if (key.startsWith(prefix) && local.__failNextRecovery) {
          local.__failNextRecovery = false;
          throw new DOMException("Fixture write failure", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    }, { entries: seededStorage(), prefix: EASYT_TRIP_RECOVERY_PREFIX });
    await page.route("**/api/journey-discover?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [
      { id: "kyoto-museum", title: "Private Museum", area: "Kyoto", type: "Museum", tags: ["Culture"], description: "A museum.", coordinates: [135.77, 35.01], qualityScore: 18 },
      { id: "kyoto-garden", title: "Private Garden", area: "Kyoto", type: "Garden", tags: ["Nature"], description: "A garden.", coordinates: [135.76, 35.02], qualityScore: 17 },
    ] }) }));
    await page.route("**/api/journey-activity-inventory", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activities: [
      { provider: "viator", source: "viator", providerProductId: "FIXTURE-KYOTO-1", title: "Fixture Kyoto walk", destination: { canonicalPlaceId: "kyoto", label: "Kyoto" }, tags: ["culture"], duration: { fixedMinutes: 120 }, productUrl: "https://www.viator.com/tours/Kyoto/fixture", provenance: { kind: "live_provider_search", provider: "viator", checkedAt: "2026-10-05T12:00:00.000Z" } },
    ] }) }));
    await page.route("**/api/journey-local-search?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [
      { id: "osm-kyoto-restaurant", name: "Private Supper", address: "Kyoto", category: "Restaurant", coordinates: [135.775, 35.004], mapsUrl: "https://www.openstreetmap.org/node/123", provider: "openstreetmap" },
    ] }) }));
    await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    const planner = page.locator('section[aria-label="Day 2 planner"]');
    await planner.waitFor({ state: "visible", timeout: 20_000 });

    // Consent off: the canonical item persists, with no deferred analytics to replay.
    await planner.getByRole("button", { name: /Add plan to .* morning/i }).click();
    let dialog = page.getByRole("dialog", { name: "Add to Morning on Day 2" });
    await dialog.getByRole("textbox", { name: "Add your own" }).fill("Private morning plan");
    await dialog.getByRole("button", { name: "Add to Morning" }).click();
    await planner.getByText("Private morning plan", { exact: true }).waitFor();
    assert.equal((await addedCalls(page)).length, 0);
    await page.evaluate((key: string) => localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), analytics: true })), PRIVACY_CONSENT_STORAGE_KEY);

    // A failed recovery write leaves the draft retryable and emits nothing.
    await planner.getByRole("button", { name: /Add plan to .* morning/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Morning on Day 2" });
    await dialog.getByRole("textbox", { name: "Add your own" }).fill("Private retry plan");
    await page.evaluate(() => { (window as typeof window & { __failNextRecovery?: boolean }).__failNextRecovery = true; });
    await dialog.getByRole("button", { name: "Add to Morning" }).click();
    assert.equal((await addedCalls(page)).length, 0);
    assert.equal(await planner.getByText("Private retry plan", { exact: true }).count(), 0, "failed recovery cannot change canonical UI");
    await dialog.getByText(/could not be stored safely/i).waitFor();
    await dialog.getByRole("button", { name: "Add to Morning" }).click();
    await planner.getByText("Private retry plan", { exact: true }).waitFor();
    assert.equal((await addedCalls(page)).length, 1);

    // The same manual title is a canonical no-op, including after a repeated click.
    await planner.getByRole("button", { name: /Add plan to .* morning/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Morning on Day 2" });
    await dialog.getByRole("textbox", { name: "Add your own" }).fill("Private retry plan");
    await dialog.getByRole("button", { name: "Add to Morning" }).click();
    assert.equal((await addedCalls(page)).length, 1);
    await dialog.getByRole("button", { name: "Close Add panel" }).click();

    await planner.getByRole("button", { name: /Add plan to .* afternoon/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Afternoon on Day 2" });
    await dialog.getByRole("button", { name: "Add Private Museum to Afternoon on Day 2" }).click();
    await planner.getByText("Private Museum", { exact: true }).waitFor();
    await planner.getByRole("button", { name: /Add plan to .* afternoon/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Afternoon on Day 2" });
    await dialog.getByRole("button", { name: "Tours" }).click();
    await dialog.getByRole("button", { name: "Add Fixture Kyoto walk to Afternoon on Day 2" }).click();
    await planner.getByText("Fixture Kyoto walk", { exact: true }).waitFor();
    await planner.getByRole("button", { name: /Add plan to .* evening/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Evening on Day 2" });
    await dialog.getByRole("button", { name: "Food & drink" }).click();
    await dialog.getByRole("button", { name: "Add Private Supper to Evening on Day 2" }).click();
    await planner.getByText("Private Supper", { exact: true }).waitFor();

    await planner.getByRole("button", { name: /Add plan to .* afternoon/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Afternoon on Day 2" });
    await dialog.getByRole("button", { name: "Save Private Garden for later" }).click();
    assert.equal((await addedCalls(page)).length, 4, "saving for later is not scheduling");
    await dialog.getByRole("button", { name: "Add Private Garden to Afternoon on Day 2" }).click();
    await planner.getByText("Private Garden", { exact: true }).waitFor();
    await dialog.waitFor({ state: "hidden" });

    const calls = await addedCalls(page);
    assert.deepEqual(calls.map((call) => (call[2] as Record<string, unknown>).source), ["manual", "suggestion", "viator", "food_place", "suggestion"]);
    assert.deepEqual(calls.map((call) => (call[2] as Record<string, unknown>).item_kind), ["activity", "activity", "activity", "restaurant", "activity"]);
    for (const call of calls) {
      const payload = call[2] as Record<string, unknown>;
      assert.equal(payload.trip_id, trip.id);
      assert.equal(payload.stop_id, "kyoto");
      assert.deepEqual(Object.keys(payload).sort(), ["environment", "item_kind", "page_path", "source", "stop_id", "trip_id"]);
      assert.doesNotMatch(JSON.stringify(payload), /Private|Fixture|viator\.com|openstreetmap\.org|https?:/i);
    }
    const distinct = await page.evaluate(() => (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.map((call) => call[1]) ?? []) as string[];
    assert.equal(distinct.filter((name) => name === "attraction_selected").length, 4, "only the four distinct suggested/place choices retain selection semantics");
    assert.equal(distinct.filter((name) => name === "affiliate_click" || name === "affiliate_link_clicked").length, 0, "planning a provider result is not outbound booking");

    await page.evaluate(() => { (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag = () => { throw new Error("Fixture analytics failure"); }; });
    await planner.getByRole("button", { name: /Add plan to .* morning/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Morning on Day 2" });
    await dialog.getByRole("textbox", { name: "Add your own" }).fill("No telemetry plan");
    await dialog.getByRole("button", { name: "Add to Morning" }).click();
    await planner.getByText("No telemetry plan", { exact: true }).waitFor();
    assert.equal((await addedCalls(page)).length, 5, "analytics failure cannot undo canonical persistence");

    const museum = planner.locator('[data-itinerary-activity-id]').filter({ hasText: "Private Museum" });
    await museum.getByLabel("Organise Private Museum").click();
    await museum.getByRole("button", { name: "Move to another day" }).click();
    await page.getByRole("button", { name: "Move activity", exact: true }).click();
    assert.equal((await addedCalls(page)).length, 5, "moving a scheduled idea is not a new add");

    const entries = await page.evaluate(() => Object.entries(localStorage)) as [string, string][];
    const stored = loadTripRecoveryFromStorage({
      get length() { return entries.length; }, key(index: number) { return entries[index]?.[0] ?? null; },
      getItem(key: string) { return entries.find(([storedKey]) => storedKey === key)?.[1] ?? null; }, setItem() {}, removeItem() {},
    }, trip.id, null)?.trip;
    const day = stored?.planItems.find((item) => item.dayNumber === 2);
    assert.ok(day);
    assert.ok(day.notes.includes("Private morning plan"));
    assert.ok(day.notes.includes("No telemetry plan"));
    assert.equal(day.notes.filter((note) => note === "Private retry plan").length, 1);
    assert.ok(stored?.brief.itineraryIdeas?.some((idea) => idea.source !== "google-place-reference" && idea.title === "Private Museum" && idea.dayId !== day.id));
    assert.ok(stored?.brief.itineraryIdeas?.some((idea) => idea.source !== "google-place-reference" && idea.provider === "viator" && idea.dayId === day.id));
    assert.ok(stored?.brief.itineraryIdeas?.some((idea) => idea.source !== "google-place-reference" && idea.title === "Private Supper" && idea.dayId === day.id));
    assert.ok(stored?.brief.itineraryIdeas?.some((idea) => idea.source !== "google-place-reference" && idea.title === "Private Garden" && idea.dayId === day.id));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Jump to date / destination").selectOption({ index: 1 });
    await page.locator('section[aria-label="Day 2 planner"]').getByText("Private Supper", { exact: true }).waitFor();
    assert.equal((await addedCalls(page)).length, 0, "hydration and reload never replay adds");
  } finally { await browser.close(); }
});

test("live OpenStreetMap Food search emits one add only after its mapped result is scheduled", { skip: !base || process.env.MORROVIA_LIVE_FOOD_ANALYTICS !== "1", timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const entries = seededStorage().map(([key, value]) => key === PRIVACY_CONSENT_STORAGE_KEY
      ? [key, JSON.stringify(createPrivacyConsentRecord({ analytics: true, affiliateTracking: false }))] as [string, string]
      : [key, value] as [string, string]);
    await page.addInitScript((initial: [string, string][]) => {
      for (const [key, value] of initial) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls = [];
      (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
        (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.push(args);
      };
    }, entries);
    await page.route("**/api/journey-discover?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) }));
    await page.route("**/api/journey-activity-inventory", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activities: [] }) }));
    await page.route("**/api/journey-local-search?*", (route: any) => {
      const url = new URL(route.request().url());
      url.searchParams.set("mapPresentation", "maplibre");
      return route.continue({ url: url.toString() });
    });
    await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    const planner = page.locator('section[aria-label="Day 2 planner"]');
    await planner.waitFor({ state: "visible", timeout: 20_000 });
    const responsePromise = page.waitForResponse((response: any) => response.url().includes("/api/journey-local-search?") && response.url().includes("mapPresentation=maplibre"));
    await planner.getByRole("button", { name: /Add plan to .* evening/i }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.equal(payload.source, "OpenStreetMap");
    assert.equal(payload.searchStatus, "ready");
    assert.ok(payload.places.length > 0);
    const dialog = page.getByRole("dialog", { name: "Add to Evening on Day 2" });
    const result = dialog.locator("article[data-add-result-id]").first();
    await result.waitFor({ state: "visible", timeout: 20_000 });
    const id = await result.getAttribute("data-add-result-id");
    const title = await result.locator("strong").innerText();
    assert.ok(payload.places.some((place: { id: string; name: string; provider: string }) => place.id === id && place.name === title && place.provider === "openstreetmap"));
    assert.equal((await addedCalls(page)).length, 0, "viewing a provider result is not an add");
    await result.getByRole("button", { name: `Add ${title} to Evening on Day 2` }).click();
    await planner.getByText(title, { exact: true }).waitFor();
    const calls = await addedCalls(page);
    assert.equal(calls.length, 1);
    assert.equal((calls[0]?.[2] as Record<string, unknown>).source, "food_place");
    assert.equal((calls[0]?.[2] as Record<string, unknown>).item_kind, "restaurant");
    assert.equal(JSON.stringify(calls[0]).includes(title), false);
  } finally { await browser.close(); }
});

test("Explore's separate scheduling owner emits one itinerary add after canonical acceptance", { skip: !base, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    const entries = seededStorage().map(([key, value]) => key === PRIVACY_CONSENT_STORAGE_KEY
      ? [key, JSON.stringify(createPrivacyConsentRecord({ analytics: true, affiliateTracking: false }))] as [string, string]
      : [key, value] as [string, string]);
    await page.addInitScript((initial: [string, string][]) => {
      for (const [key, value] of initial) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls = [];
      (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
        (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.push(args);
      };
    }, entries);
    await page.route("**/api/journey-discover?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [
      { id: "explore-museum", title: "Private Explore Museum", area: "Kyoto", type: "Museum", tags: ["Culture"], description: "A museum.", coordinates: [135.77, 35.01], qualityScore: 18 },
    ] }) }));
    await page.route("**/api/journey-day-trips?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) }));
    await page.route("**/api/journey-local-search?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) }));
    await page.route("**/api/journey-activity-inventory", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activities: [] }) }));
    await page.goto(`${base}/journey/${trip.id}/explore?stop=kyoto&day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    const card = page.locator("article[data-explore-card]").filter({ hasText: "Private Explore Museum" });
    await card.waitFor({ state: "visible", timeout: 20_000 });
    assert.equal((await addedCalls(page)).length, 0);
    await card.getByRole("button", { name: "Add to Day 2" }).click();
    await card.getByText("Added to Day 2").waitFor();
    const calls = await addedCalls(page);
    assert.equal(calls.length, 1);
    assert.equal((calls[0]?.[2] as Record<string, unknown>).source, "suggestion");
    assert.equal((calls[0]?.[2] as Record<string, unknown>).item_kind, "activity");
    assert.equal(JSON.stringify(calls[0]).includes("Private Explore Museum"), false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("article[data-explore-card]").filter({ hasText: "Private Explore Museum" }).getByText("Added to Day 2").waitFor();
    assert.equal((await addedCalls(page)).length, 0);
  } finally { await browser.close(); }
});

test("cancelled Add and failed provider searches emit no itinerary add", { skip: !base, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const entries = seededStorage().map(([key, value]) => key === PRIVACY_CONSENT_STORAGE_KEY
      ? [key, JSON.stringify(createPrivacyConsentRecord({ analytics: true, affiliateTracking: false }))] as [string, string]
      : [key, value] as [string, string]);
    await page.addInitScript((initial: [string, string][]) => {
      for (const [key, value] of initial) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls = [];
      (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
        (window as typeof window & { __analyticsCalls?: unknown[][] }).__analyticsCalls?.push(args);
      };
    }, entries);
    await page.route("**/api/journey-discover?*", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: [] }) }));
    await page.route("**/api/journey-activity-inventory", (route: any) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "fixture provider unavailable" }) }));
    await page.route("**/api/journey-local-search?*", (route: any) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "fixture provider unavailable" }) }));
    await page.goto(`${base}/journey/${trip.id}/itinerary?day=2`, { waitUntil: "domcontentloaded" });
    await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 3_000 }).catch(() => {});
    const planner = page.locator('section[aria-label="Day 2 planner"]');
    await planner.waitFor({ state: "visible", timeout: 20_000 });
    await planner.getByRole("button", { name: /Add plan to .* evening/i }).click();
    let dialog = page.getByRole("dialog", { name: "Add to Evening on Day 2" });
    await dialog.getByRole("button", { name: "Close Add panel" }).click();
    assert.equal((await addedCalls(page)).length, 0);
    await planner.getByRole("button", { name: /Add plan to .* evening/i }).click();
    dialog = page.getByRole("dialog", { name: "Add to Evening on Day 2" });
    await dialog.getByRole("button", { name: "Tours" }).click();
    await dialog.getByRole("button", { name: "Food & drink" }).click();
    await dialog.getByText(/Food ideas are unavailable right now/i).waitFor();
    assert.equal((await addedCalls(page)).length, 0);
  } finally { await browser.close(); }
});
