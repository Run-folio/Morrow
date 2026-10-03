import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import test from "node:test";
import { tripFromBuilder } from "../lib/easyt/trip.ts";

const require = createRequire(import.meta.url);
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const playwrightPath = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
const enabled = process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS === "1";
const baseUrl = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";
const stops = [
  ["windhoek-start", "Windhoek", 17.0832, -22.5609, 1],
  ["sossusvlei", "Sossusvlei", 15.2939, -24.7464, 2],
  ["swakopmund", "Swakopmund", 14.5266, -22.6784, 2],
  ["damaraland", "Damaraland", 14.9, -20.7, 2],
  ["etosha", "Etosha", 16.0, -18.8, 3],
  ["waterberg", "Waterberg", 17.4, -20.5, 2],
  ["windhoek-end", "Windhoek", 17.0832, -22.5609, 1],
] as const;

for (const width of [1440, 1024, 390]) test(`Builder selection uses blue destination marker and named card at ${width}px`, { skip: !enabled, timeout: 90_000 }, async () => {
  const trip = tripFromBuilder({ id: "trip-12340000-0000-4000-8000-000000000012", origin: "Windhoek",
    stops: stops.map(([id, name, longitude, latitude]) => ({ id, name, country: "Namibia", coordinates: [longitude, latitude] })),
    startDate: "2026-10-02", endDate: "2026-10-15", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid", draft: [],
    nightAllocations: Object.fromEntries(stops.map(([id, , , , nights]) => [id, nights])),
  });
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript((value: typeof trip) => localStorage.setItem(`easyt:trip-recovery:v2:guest:${encodeURIComponent(value.id)}:builder-map-fixture`, JSON.stringify({
      version: 2, ownerId: null, tripId: value.id, trip: value, state: "pending", writeId: "builder-map-fixture", savedAt: "2026-10-02T12:00:00.000Z",
    })), trip);
    await page.goto(`${baseUrl}/journey/new?trip=${trip.id}&recover=1`, { waitUntil: "domcontentloaded" });
    const workspace = page.locator("[data-builder-route-workspace]");
    await workspace.waitFor();
    const map = workspace.locator(".planner-map");
    await map.waitFor();
    const rows = workspace.locator("[data-builder-stop-index]");
    const marker = (id: string) => map.locator(`[data-map-stop-id="${id}"]`);
    assert.equal(await marker("sossusvlei").getAttribute("aria-pressed"), "false");
    await rows.nth(1).click();
    assert.equal(await rows.nth(1).getAttribute("aria-selected"), "true");
    assert.equal(await marker("sossusvlei").getAttribute("aria-pressed"), "true");
    assert.match(await marker("sossusvlei").locator(".planner-map__destination-card").innerText(), /Sossusvlei[\s\S]*Stop 2 · 2 nights/);
    await page.waitForTimeout(300);
    const selectedStyle = await marker("sossusvlei").evaluate((element: Element) => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color, outline: getComputedStyle(element).outlineColor }));
    assert.equal(selectedStyle.background, "rgb(48, 37, 206)", `selected background at ${width}px`);
    assert.match(selectedStyle.color, /^rgb\(25[0-5], 2[4-5][0-9], 255\)$/);
    assert.equal(selectedStyle.outline, "rgb(48, 37, 206)");
    assert.match(await marker("swakopmund").evaluate((element: Element) => getComputedStyle(element).backgroundColor), /^rgb\(25[0-5], 2[4-5][0-9], 255\)$/);

    await page.keyboard.press("Tab");
    await marker("damaraland").focus();
    assert.equal(await marker("damaraland").evaluate((element: Element) => getComputedStyle(element).outlineStyle), "solid");
    await marker("damaraland").click();
    assert.equal(await rows.nth(3).getAttribute("aria-selected"), "true");
    const damaralandActions = rows.nth(3).locator("details");
    await damaralandActions.locator("summary").click();
    await damaralandActions.getByRole("button", { name: "Earlier" }).click();
    assert.match(await rows.nth(2).innerText(), /Damaraland/);
    assert.equal(await rows.nth(2).getAttribute("aria-selected"), "true");
    assert.equal(await marker("damaraland").getAttribute("aria-pressed"), "true");
    assert.match(await marker("damaraland").locator(".planner-map__destination-card").innerText(), /Stop 3 · 2 nights/);

    await rows.nth(6).click();
    assert.equal(await marker("windhoek-end").getAttribute("aria-pressed"), "true");
    assert.equal(await marker("windhoek-start").getAttribute("aria-pressed"), "false");
    assert.match(await marker("windhoek-end").locator(".planner-map__destination-card").innerText(), /Stop 7 · 1 night/);

    const card = marker("windhoek-end").locator(".planner-map__destination-card");
    assert.equal(await card.isVisible(), true);
    const clear = await card.evaluate((element: Element) => {
      const cardRect = element.getBoundingClientRect();
      const mapRect = element.closest(".planner-map")!.getBoundingClientRect();
      const overlaps = (left: DOMRect, right: DOMRect) => left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
      const controls = [...element.closest(".planner-map")!.querySelectorAll(".maplibregl-ctrl-group,.maplibregl-ctrl-attrib")];
      return cardRect.left >= mapRect.left && cardRect.right <= mapRect.right && cardRect.top >= mapRect.top && cardRect.bottom <= mapRect.bottom
        && controls.every((control) => !overlaps(cardRect, control.getBoundingClientRect()));
    });
    assert.equal(clear, true, "the card stays within the map and clear of controls and attribution");
  } finally { await browser.close(); }
});
