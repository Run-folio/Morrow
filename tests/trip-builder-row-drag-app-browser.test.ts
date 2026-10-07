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

const stopInputs = [
  { id: "windhoek-start", name: "Windhoek", country: "Namibia", coordinates: [17.0832, -22.5609] as [number, number] },
  { id: "sossusvlei", name: "Sossusvlei", country: "Namibia", coordinates: [15.2939, -24.7464] as [number, number] },
  { id: "swakopmund", name: "Swakopmund", country: "Namibia", coordinates: [14.5266, -22.6784] as [number, number] },
  { id: "damaraland", name: "Damaraland", country: "Namibia", coordinates: [14.9, -20.7] as [number, number] },
  { id: "etosha", name: "Etosha", country: "Namibia", coordinates: [16.0, -18.8] as [number, number] },
  { id: "waterberg", name: "Waterberg", country: "Namibia", coordinates: [17.4, -20.5] as [number, number] },
  { id: "windhoek-end", name: "Windhoek", country: "Namibia", coordinates: [17.0832, -22.5609] as [number, number] },
];

for (const width of [1440, 1024, 390]) test(`real mouse drags Namibia table stop 4 above stop 2 by occurrence ID at ${width}px`, { skip: !enabled, timeout: 90_000 }, async () => {
  const trip = tripFromBuilder({
    id: "trip-12340000-0000-4000-8000-000000000012", origin: "Windhoek", stops: stopInputs,
    startDate: "2026-10-02", endDate: "2026-10-15", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid",
    nightAllocations: { "windhoek-start": 1, sossusvlei: 2, swakopmund: 2, damaraland: 2, etosha: 3, waterberg: 2, "windhoek-end": 1 }, draft: [],
  });
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/api/**',async(route:{request():{url():string;postDataJSON():{legs?:unknown[]}};fulfill(input:{status:number;contentType:string;body:string}):Promise<void>})=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(path==='/api/journey-transfer-resolution')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({legs:request.postDataJSON().legs??[]})});
      return route.fulfill({status:path.includes('/auth/')?200:404,contentType:'application/json',body:JSON.stringify(path.includes('/auth/')?{session:null,user:null}:{error:'Fixture boundary unavailable'})});
    });
    await page.addInitScript((value: typeof trip) => {
      localStorage.setItem(`easyt:trip-recovery:v2:guest:${encodeURIComponent(value.id)}:builder-drag-fixture`, JSON.stringify({
        version: 2, ownerId: null, tripId: value.id, trip: value, state: "pending", writeId: "builder-drag-fixture", savedAt: "2026-10-02T12:00:00.000Z",
      }));
    }, trip);
    await page.goto(`${baseUrl}/journey/new?trip=${trip.id}&recover=1`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-builder-edit-session="active"]').waitFor();
    const route = page.locator("[data-builder-route-workspace]");
    await route.waitFor();
    const rows = route.locator("[data-builder-stop-index]");
    const names = () => rows.evaluateAll((items: Element[]) => items.map((row) => row.querySelector('[role="cell"] strong')?.textContent?.trim()));
    const chipIds = () => page.locator('[role="listitem"][data-builder-stop-id]').evaluateAll((chips: HTMLElement[]) => chips.map((chip) => chip.dataset.builderStopId));
    assert.deepEqual(await names(), stopInputs.map((stop) => stop.name));
    assert.deepEqual(await chipIds(), stopInputs.map((stop) => stop.id));

    const grip = route.getByRole("button", { name: "Reorder Damaraland, stop 4" });
    await grip.scrollIntoViewIfNeeded();
    const source = await grip.boundingBox();
    const target = await rows.nth(1).boundingBox();
    assert.ok(source && target);
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 12; step += 1) {
      const fraction = step / 12;
      await page.mouse.move(source.x + source.width / 2,
        source.y + source.height / 2 + (target.y + target.height / 2 - source.y - source.height / 2) * fraction);
      await page.waitForTimeout(50);
    }
    assert.deepEqual(await names(), ["Windhoek", "Damaraland", "Sossusvlei", "Swakopmund", "Etosha", "Waterberg", "Windhoek"], "the table previews the proposed route before drop");
    await page.mouse.up();

    assert.deepEqual(await names(), ["Windhoek", "Damaraland", "Sossusvlei", "Swakopmund", "Etosha", "Waterberg", "Windhoek"]);
    assert.deepEqual(await chipIds(), ["windhoek-start", "damaraland", "sossusvlei", "swakopmund", "etosha", "waterberg", "windhoek-end"]);
    assert.match(await rows.nth(2).innerText(), /From Damaraland/, "transfer relationships rebuild from the new order");
    assert.equal(await rows.nth(1).getByRole("button", { name: /Remove one night from Damaraland; 2 nights currently/ }).count(), 1,
      "night allocation stays with the moved occurrence");

    if (width === 1440) {
      const finalWindhoek = route.getByRole("button", { name: "Reorder Windhoek, stop 7" });
      await finalWindhoek.scrollIntoViewIfNeeded();
      const duplicateSource = await finalWindhoek.boundingBox();
      const duplicateTarget = await rows.nth(5).boundingBox();
      assert.ok(duplicateSource && duplicateTarget);
      await page.mouse.move(duplicateSource.x + duplicateSource.width / 2, duplicateSource.y + duplicateSource.height / 2);
      await page.mouse.down();
      for (let step = 1; step <= 12; step += 1) {
        await page.mouse.move(duplicateSource.x + duplicateSource.width / 2,
          duplicateSource.y + duplicateSource.height / 2 + (duplicateTarget.y + duplicateTarget.height / 2 - duplicateSource.y - duplicateSource.height / 2) * step / 12);
        await page.waitForTimeout(50);
      }
      await page.mouse.up();
      assert.deepEqual(await chipIds(), ["windhoek-start", "damaraland", "sossusvlei", "swakopmund", "etosha", "windhoek-end", "waterberg"],
        "moving the final Windhoek preserves both distinct occurrence IDs");

      const orderBeforeCancelledDrag = await chipIds();
      const cancelledGrip = route.getByRole("button", { name: "Reorder Etosha, stop 5" });
      await cancelledGrip.scrollIntoViewIfNeeded();
      const cancelledSource = await cancelledGrip.boundingBox();
      assert.ok(cancelledSource);
      await page.mouse.move(cancelledSource.x + cancelledSource.width / 2, cancelledSource.y + cancelledSource.height / 2);
      await page.mouse.down();
      await page.mouse.move(10, cancelledSource.y - 90, { steps: 12 });
      await page.mouse.up();
      assert.deepEqual(await chipIds(), orderBeforeCancelledDrag, "dropping without a row target leaves the canonical order unchanged");
      assert.deepEqual(await names(), ["Windhoek", "Damaraland", "Sossusvlei", "Swakopmund", "Etosha", "Windhoek", "Waterberg"],
        "cancelled drag restores the table preview to canonical order");

    }
    const acceptedOrder=await chipIds();
    await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.deepEqual(await chipIds(),acceptedOrder,'manual occurrence order survives device recovery reload');
  } finally { await browser.close(); }
});
