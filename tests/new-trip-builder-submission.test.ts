import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectHomepageInput, initialHandoffRouteStops, homepageReceiptForProjection, homepageSemanticInputFingerprint, readHomepageInput, reserveDirectDescribeIntake } from "../lib/easyt/home-trip-handoff.ts";
import { createLatestJourneyCaptureRequestGate } from "../lib/easyt/journey-capture-client.ts";
import { emptyHomepageInput, selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
import { homepageInputStorageKey } from "../lib/easyt/private-browser-context.ts";

const builder = () => readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
const starter = () => readFileSync(new URL("../app/journey/new/new-trip-starter.tsx", import.meta.url), "utf8");

test("structured New trip projection preserves ordered repeated canonical occurrences", () => {
  const snapshot = selectedStopsHomepageInput("owner-a", [["tokyo-first", "Tokyo"], ["kyoto", "Kyoto"], ["tokyo-last", "Tokyo"]]);
  const projection = projectHomepageInput({ snapshot, profile: null, handoffId: "new-a" });
  assert.equal(projection.ok, true);
  if (!projection.ok) throw new Error("projection failed");
  const ids = projection.draft.homepage?.occurrenceMentionIds;
  assert.deepEqual(Object.keys(ids ?? {}), ["tokyo-first", "kyoto", "tokyo-last"]);
  const stops = initialHandoffRouteStops(projection.draft.locationMentions ?? [], projection.draft.destinations ?? [], { mode: "unknown" });
  assert.equal(stops.length, 3);
  assert.notEqual(stops[0]?.id, stops[2]?.id);
  const receipt = homepageReceiptForProjection(snapshot, projection.draft, "trip-new");
  assert.equal(receipt.tripId, "trip-new");
  assert.deepEqual(readHomepageInput({ snapshot, receipt }, "owner-a")?.receipt, receipt);
});

test("latest request gate rejects late capture after an edit or second submit", () => {
  const gate = createLatestJourneyCaptureRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  gate.cancel();
  assert.equal(second.isCurrent(), false);
});

test("New trip submits into the mounted Builder without a second navigation or persistence owner", () => {
  const builderSource = builder();
  const starterSource = starter();
  assert.match(builderSource, /applyNewTripIntake/);
  assert.match(builderSource, /projectHomepageInput\(\{ snapshot/);
  assert.match(builderSource, /homepageReceiptForProjection\(snapshot, projected\.draft, tripId\)/);
  assert.match(builderSource, /<NewTripStarter/);
  assert.doesNotMatch(starterSource, /requestJourneyCapture|captureRequestGateRef/);
  assert.match(builderSource, /reserveDirectDescribeIntake\(/);
  assert.match(starterSource, /onSubmit\(submitted\)/);
  assert.doesNotMatch(starterSource, /commitHomepageHandoff|beginNewTripNavigation|HOME_TRIP_DRAFT_KEY|router\.push\(["']\/journey\/new["']/);
});

test("two direct New Trip Describe tabs cannot reserve different trips for the same intake", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let tail = Promise.resolve();
  const lock = async <T,>(_key: string, run: () => Promise<T>): Promise<T> => {
    const prior = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try { return await run(); } finally { release(); }
  };
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  const submit = (tripId: string) => reserveDirectDescribeIntake({ storage, snapshot, tripId, handoffId: `new-${tripId}`, lock });
  const [first, second] = await Promise.all([submit("trip-one"), submit("trip-two")]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(second.receipt.tripId, first.receipt.tripId);
    assert.equal(second.receipt.handoffId, first.receipt.handoffId);
  }
  assert.equal(readHomepageInput(JSON.parse(values.get(homepageInputStorageKey("owner-a"))!), "owner-a")?.receipt?.tripId, "trip-one");
  const current = JSON.parse(values.get(homepageInputStorageKey("owner-a"))!);
  values.set("easyt-home-trip-draft", JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: current.receipt }));
  assert.deepEqual(await submit("trip-one"), { ok: false, reason: "reserved" }, "Homepage's pending envelope cannot be consumed by direct New Trip");
});

test("a deliberate fresh New Trip submission can start after an earlier receipt completed", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  values.set(homepageInputStorageKey("owner-a"), JSON.stringify({ snapshot, receipt: {
    version: 1, ownerId: "owner-a", handoffId: "completed-old", tripId: "old-trip",
    inputFingerprint: "prior-projection", semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot),
  } }));
  const result = await reserveDirectDescribeIntake({
    storage, snapshot, tripId: "fresh-trip", handoffId: "fresh-handoff",
    lock: async <T,>(_key: string, run: () => Promise<T>) => run(),
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.receipt.tripId, "fresh-trip");
});

test("direct intake stays resumable until canonical device recovery is acknowledged", () => {
  const source = builder();
  assert.match(source, /pendingNewTripReceiptRef\.current = \{ snapshot, receipt, draft:/);
  assert.match(source, /persistEditableHomepageInput\(\{ storage: window\.localStorage, snapshot/);
  assert.match(source, /if \(recovery\.stored\) \{[\s\S]*const pendingReceipt = pendingNewTripReceiptRef\.current/);
  assert.match(source, /homepageHandoffMatchesTrip\(pendingReceipt\.draft, trip\)/);
  assert.match(source, /acknowledgePendingIntakeReceipt\(\{[\s\S]*pending: pendingReceipt\.pending/);
  assert.match(source, /return \{ \.\.\.recovery, stored: false \};[\s\S]*const durableUrl/);
  const recoveryWrite = source.indexOf("const recovery = saveTripRecovery(trip");
  const receiptCompletion = source.indexOf("acknowledgePendingIntakeReceipt({", recoveryWrite);
  assert.ok(recoveryWrite > 0 && receiptCompletion > recoveryWrite);
  assert.doesNotMatch(source, /window\.localStorage\.setItem\(inputKey, JSON\.stringify\(completedInput\)\)/);
});

test("missing handoff draft checks the reserved trip before declaring the receipt unavailable", () => {
  const source = builder();
  const preflight = source.indexOf("const existingRecovery = loadTripRecovery(reservedId, activeOwnerId)");
  const decision = source.indexOf("const entry = resolveNewTripEntryState({", preflight);
  assert.ok(preflight > 0);
  assert.ok(decision > preflight);
  assert.match(source.slice(decision, decision + 350), /reservedTripId: existingTrip\?\.id/);
});

test("direct Describe submission records one pending receipt in mounted Builder before capture completes", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const view = await renderBuilder({ captureDelayMs: 5000 });
  try {
    await view.page.getByRole("tab", { name: "Describe my trip" }).click();
    await view.page.locator("textarea").first().fill("Tokyo and Kyoto in Japan for one week.");
    await view.page.getByRole("button", { name: "Plan my trip" }).click();
    await view.page.getByText("Tokyo and Kyoto in Japan for one week.").waitFor();
    await view.page.waitForFunction((key: string) => JSON.parse(localStorage.getItem(key) ?? "null")?.receipt?.version === 2,
      homepageInputStorageKey(null));
    const pending = await view.page.evaluate((key: string) => {
      const record = JSON.parse(localStorage.getItem(key) ?? "null");
      return { receipt: record?.receipt, href: location.pathname + location.search, handoff: localStorage.getItem("easyt-home-trip-draft") };
    }, homepageInputStorageKey(null));
    assert.equal(pending.receipt?.version, 2);
    assert.equal(pending.href, "/journey/new");
    assert.equal(pending.handoff, null);
    await view.page.getByText("Your route — Nights per stop:").waitFor({ timeout: 20_000 });
    assert.equal(view.captureRequests(), 1);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("two mounted direct New Trip tabs adopt one pending Describe reservation", { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ captureDelayMs: 6000 });
  const [second] = await Promise.all([
    view.page.waitForEvent("popup"),
    view.page.evaluate(() => { window.open("/journey/new", "_blank"); }),
  ]);
  try {
    await second.locator('[data-builder-root="true"]:not([aria-busy="true"])').waitFor();
    for (const page of [view.page, second]) {
      await page.getByRole("tab", { name: "Describe my trip" }).click();
      await page.locator("textarea").first().fill("Tokyo and Kyoto in Japan for one week.");
    }
    await Promise.all([view.page, second].map((page) => page.getByRole("button", { name: "Plan my trip" }).click()));
    await Promise.all([view.page, second].map((page) => page.getByText("Tokyo and Kyoto in Japan for one week.").waitFor()));
    const ids = await Promise.all([view.page, second].map((page) => page.evaluate((key: string) => {
      const record = JSON.parse(localStorage.getItem(key) ?? "null");
      return record?.receipt?.tripId ?? null;
    }, homepageInputStorageKey(null))));
    assert.ok(ids[0]);
    assert.deepEqual(ids, [ids[0], ids[0]]);
    assert.deepEqual(view.errors, []);
  } finally { await second.close(); await view.close(); }
});
