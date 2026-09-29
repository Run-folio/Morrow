import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectHomepageInput, initialHandoffRouteStops, homepageReceiptForProjection, readHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { createLatestJourneyCaptureRequestGate } from "../lib/easyt/journey-capture-client.ts";
import { selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";

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
  assert.match(starterSource, /requestJourneyCapture/);
  assert.match(starterSource, /captureRequestGateRef/);
  assert.doesNotMatch(starterSource, /commitHomepageHandoff|beginNewTripNavigation|router\.push|HOME_TRIP_DRAFT_KEY/);
});

test("direct intake stays resumable until canonical device recovery is acknowledged", () => {
  const source = builder();
  assert.match(source, /pendingNewTripReceiptRef\.current = \{ snapshot, receipt \}/);
  assert.match(source, /JSON\.stringify\(\{ snapshot \}\)/);
  assert.match(source, /if \(recovery\.stored\) \{[\s\S]*const pendingReceipt = pendingNewTripReceiptRef\.current/);
  assert.match(source, /JSON\.stringify\(pendingNewTripReceiptRef\.current\)/);
});

test("missing handoff draft checks the reserved trip before declaring the receipt unavailable", () => {
  const source = builder();
  const preflight = source.indexOf("const existingRecovery = loadTripRecovery(reservedId, activeOwnerId)");
  const decision = source.indexOf("const entry = resolveNewTripEntryState({", preflight);
  assert.ok(preflight > 0);
  assert.ok(decision > preflight);
  assert.match(source.slice(decision, decision + 350), /reservedTripId: existingTrip\?\.id/);
});
