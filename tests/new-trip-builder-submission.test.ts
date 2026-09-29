import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectHomepageInput, initialHandoffRouteStops, homepageReceiptForProjection, readHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { createLatestJourneyCaptureRequestGate } from "../lib/easyt/journey-capture-client.ts";
import { selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";
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
  assert.match(builderSource, /createPendingIntakeReceipt\(snapshot/);
  assert.match(starterSource, /onSubmit\(submitted\)/);
  assert.doesNotMatch(starterSource, /commitHomepageHandoff|beginNewTripNavigation|router\.push|HOME_TRIP_DRAFT_KEY/);
});

test("direct intake stays resumable until canonical device recovery is acknowledged", () => {
  const source = builder();
  assert.match(source, /pendingNewTripReceiptRef\.current = \{ snapshot, receipt, draft:/);
  assert.match(source, /JSON\.stringify\(\{ snapshot \}\)/);
  assert.match(source, /if \(recovery\.stored\) \{[\s\S]*const pendingReceipt = pendingNewTripReceiptRef\.current/);
  assert.match(source, /homepageHandoffMatchesTrip\(pendingReceipt\.draft, trip\)/);
  assert.match(source, /window\.localStorage\.setItem\(inputKey, JSON\.stringify\(completedInput\)\)/);
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
  const view = await renderBuilder({ captureDelayMs: 1500 });
  try {
    await view.page.getByRole("tab", { name: "Describe my trip" }).click();
    await view.page.locator("textarea").first().fill("Tokyo and Kyoto in Japan for one week.");
    await view.page.getByRole("button", { name: "Plan my trip" }).click();
    await view.page.getByText("Tokyo and Kyoto in Japan for one week.").waitFor();
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
