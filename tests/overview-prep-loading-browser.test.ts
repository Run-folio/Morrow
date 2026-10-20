import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";

import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { requireReadableTripDocument } from "../lib/easyt/trip-document.ts";
import { canonicalRouteFixture } from "./fixtures/batch14-route-documents.ts";
import { renderBuilder } from "./helpers/builder-render.ts";

const enabled = process.env.MORROVIA_OVERVIEW_PREP_BROWSER_TESTS === "1";
const artifacts = process.env.MORROVIA_BROWSER_ARTIFACT_DIR;
const fixture = () => requireReadableTripDocument(canonicalTripForOwner("owner-a", canonicalRouteFixture()));
const guidance = (path: string) => ({ status: 200, body: path.endsWith("booking-readiness") ? { actions: [] } : { cards: [] } });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

for (const width of [390, 1440]) test(`${width}px practical checkbox refresh stays visually quiet while account saving remains visible`, { skip: !enabled, timeout: 30_000 }, async () => {
  let cloud = fixture();
  const writes: unknown[] = [];
  const refresh = deferred(), refreshStarted = deferred(), save = deferred();
  let holdRefresh = false;
  const view = await renderBuilder({
    path: `/journey/${cloud.id}`, ownerId: "owner-a", shellCanonicalTrip: cloud,
    seedRecovery: false, styled: true, liveOverviewPrep: true,
    prepRequest: async ({ path }) => {
      if (holdRefresh) { refreshStarted.resolve(); await refresh.promise; }
      return guidance(path);
    },
    accountRequest: async ({ method, trip }) => {
      if (method !== "GET") {
        writes.push(trip); await save.promise;
        cloud = requireReadableTripDocument({ ...trip as object, updatedAt: "2026-10-20T12:00:00.000Z" });
      }
      return { status: 200, body: { trip: cloud } };
    },
  });
  try {
    const { page } = view;
    page.setDefaultTimeout(5_000);
    await page.setViewportSize({ width, height: 1000 });
    const section = page.locator("#before-you-go");
    await section.locator('[aria-busy="true"]').waitFor({ state: "hidden" });
    const card = section.locator('[data-prep-kind="insurance"]');
    await card.scrollIntoViewIfNeeded();
    const before = await card.boundingBox();
    holdRefresh = true;
    await card.getByRole("checkbox").focus();
    await page.keyboard.press("Space");
    await refreshStarted.promise;
    await page.getByText("Saving to your account…", { exact: true }).waitFor();
    const loading = section.getByRole("status").filter({ hasText: "Checking practical tasks" });
    await loading.waitFor();
    const loadingBounds = await loading.evaluate((element: HTMLElement) => {
      const rect = element.parentElement!.getBoundingClientRect();
      return { width: rect.width, height: rect.height, text: element.innerText, busy: element.getAttribute("aria-busy") };
    });
    if (artifacts) {
      mkdirSync(artifacts, { recursive: true });
      await section.screenshot({ path: `${artifacts}/checkbox-refresh-${width}.png` });
      writeFileSync(`${artifacts}/checkbox-refresh-${width}.json`, JSON.stringify({ loadingBounds, before, during: await card.boundingBox(), accessibility: await section.ariaSnapshot() }, null, 2));
    }
    assert.equal(loadingBounds.busy, "true", "assistive technology retains the background busy state");
    assert.ok(loadingBounds.width <= 1 && loadingBounds.height <= 1, `background guidance must not insert a visible panel: ${JSON.stringify(loadingBounds)}`);
    assert.match(await section.ariaSnapshot(), /status:[\s\S]*Checking practical tasks/, "background status remains in the accessibility tree");
    assert.deepEqual(await card.boundingBox(), before, "refreshing guidance must not move the practical cards");
    assert.equal(await section.getByRole("checkbox").count(), 4);
    assert.equal(await card.getByRole("checkbox").getAttribute("aria-checked"), "true");
    assert.equal(await card.getByRole("checkbox").isDisabled(), true, "the existing pending-save guard remains active");
    refresh.resolve(); save.resolve();
    await page.getByText("Saved to your account", { exact: true }).waitFor();
    await section.locator('[aria-busy="true"]').waitFor({ state: "detached" });
    assert.equal(writes.length, 1);
    assert.equal(cloud.brief.checklist?.find((item) => item.id === "overview-prep-insurance")?.complete, true);
    await page.reload();
    assert.equal(await section.locator('[data-prep-kind="insurance"]').getByRole("checkbox").getAttribute("aria-checked"), "true");
    assert.equal(writes.length, 1, "reopening the acknowledged fixture performs no new account write");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(view.errors, []);
  } finally { refresh.resolve(); save.resolve(); await view.close(); }
});

test("guidance failure and retry remain visible without changing practical choices", { skip: !enabled, timeout: 30_000 }, async () => {
  const cloud = fixture();
  let fail = true, writes = 0;
  const view = await renderBuilder({
    path: `/journey/${cloud.id}`, ownerId: "owner-a", shellCanonicalTrip: cloud,
    seedRecovery: false, styled: true, liveOverviewPrep: true,
    prepRequest: ({ path }) => fail ? { status: 503, body: { error: "Synthetic guidance failure" } } : guidance(path),
    accountRequest: () => { writes++; return { status: 200, body: { trip: cloud } }; },
  });
  try {
    const section = view.page.locator("#before-you-go");
    await section.getByText("Some guidance is unavailable", { exact: true }).waitFor();
    assert.equal(await section.getByRole("checkbox").count(), 4);
    assert.ok((await section.getByRole("button", { name: "Try again", exact: true }).boundingBox())!.height > 1);
    if (artifacts) { mkdirSync(artifacts, { recursive: true }); await section.screenshot({ path: `${artifacts}/guidance-unavailable.png` }); }
    fail = false;
    await section.getByRole("button", { name: "Try again", exact: true }).click();
    await section.getByText("Some guidance is unavailable", { exact: true }).waitFor({ state: "hidden" });
    await section.locator('[aria-busy="true"]').waitFor({ state: "detached" });
    assert.equal(writes, 0, "background guidance retries do not save the trip");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

for (const failure of ["save-error", "conflict", "offline"] as const) test(`practical checkbox retains ${failure} feedback and the durable edit`, { skip: !enabled, timeout: 30_000 }, async () => {
  const cloud = fixture();
  let writes = 0;
  const view = await renderBuilder({
    path: `/journey/${cloud.id}`, ownerId: "owner-a", shellCanonicalTrip: cloud,
    seedRecovery: false, styled: true, liveOverviewPrep: true,
    prepRequest: ({ path }) => guidance(path),
    accountRequest: ({ method }) => {
      if (method === "GET") return { status: 200, body: { trip: cloud } };
      writes++;
      return failure === "conflict"
        ? { status: 409, body: { trip: { ...cloud, updatedAt: "2026-10-20T12:00:00.000Z" }, conflictReason: "cloud-changed" } }
        : { status: 503, body: { error: "Synthetic save failure" } };
    },
  });
  try {
    const { page } = view;
    page.setDefaultTimeout(5_000);
    await page.locator('#before-you-go [aria-busy="true"]').waitFor({ state: "hidden" });
    if (failure === "offline") await page.context().setOffline(true);
    await page.locator('[data-prep-kind="insurance"]').getByRole("checkbox").click();
    await page.getByText("Couldn't save to your account", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Discard device copy", exact: true }).waitFor();
    if (artifacts) { mkdirSync(artifacts, { recursive: true }); await page.screenshot({ path: `${artifacts}/${failure}.png`, fullPage: true }); }
    const retained = await page.evaluate((id: string) => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:") && key.includes(id))
      .map((key) => JSON.parse(localStorage.getItem(key)!)), cloud.id);
    assert.ok(retained.some((record: any) => record.trip.brief.checklist?.some((item: any) => item.id === "overview-prep-insurance" && item.complete)), "failed account saves keep the explicit edit durably on the device");
    assert.equal(writes, failure === "offline" ? 0 : 1);
    assert.equal(cloud.brief.checklist?.some((item) => item.id === "overview-prep-insurance"), false);
    assert.deepEqual(view.errors, []);
  } finally { await view.page.context().setOffline(false); await view.close(); }
});
