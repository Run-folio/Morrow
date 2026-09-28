import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { homepageSemanticInputFingerprint, type StoredHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { resumableNewTripSnapshot } from "../app/journey/new/new-trip-entry-state.ts";
import { emptyHomepageInput, selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";

const source = () => readFileSync(new URL("../app/journey/new/new-trip-starter.tsx", import.meta.url), "utf8");
const builderSource = () => readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");

test("New trip restores both inactive mode inputs and canonical repeated occurrences", () => {
  const snapshot = {
    ...selectedStopsHomepageInput("owner-a", [["tokyo-first", "Tokyo"], ["kyoto", "Kyoto"], ["tokyo-last", "Tokyo"]]),
    prompt: "Two weeks in Japan", dates: { state: "cleared" as const },
    interests: { state: "selected" as const, value: [] },
  };
  const stored: StoredHomepageInput = { snapshot };
  assert.deepEqual(resumableNewTripSnapshot(stored), snapshot);
  assert.deepEqual(snapshot.entries.map((entry) => entry.id), ["tokyo-first", "kyoto", "tokyo-last"]);
  assert.equal(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, prompt: "inactive changed" }));
  assert.equal(resumableNewTripSnapshot({ snapshot: { ...snapshot, ownerId: "owner-b" } })?.ownerId, "owner-b");
});

test("New trip uses production capture, destination and endpoint controls with owner scoped intake", () => {
  const implementation = source();
  assert.match(implementation, /<MorroviaTripCapture/);
  assert.match(implementation, /<HomeDestinationEditor/);
  assert.match(implementation, /<JourneyEndpointsEditor/);
  assert.match(implementation, /homepageInputStorageKey\(ownerId\)/);
  assert.match(implementation, /readHomepageInput/);
  assert.match(implementation, /resumableNewTripSnapshot/);
  assert.doesNotMatch(implementation, /commitHomepageHandoff|beginNewTripNavigation|router\.push/);
});

test("New trip persists edited intake without carrying a completed receipt", () => {
  const implementation = source();
  assert.match(implementation, /JSON\.stringify\(\{ snapshot: next \}\)/);
  assert.match(implementation, /onSubmit\(submitted/);
  assert.doesNotMatch(implementation, /receipt:\s*stored\.receipt/);
  assert.equal(emptyHomepageInput("owner-a").mode, "stops");
});

test("fresh-only Builder composition has one New trip heading and no duplicate first-place editor", () => {
  const builder = builderSource();
  assert.match(builder, /entryKind === "fresh"[\s\S]*<NewTripStarter/);
  assert.match(builder, /language === "es" \? "Nuevo viaje" : "New trip"/);
  assert.match(builder, /entryKind !== "fresh"[\s\S]*styles\.firstPlaceEntry/);
  assert.match(builder, /href="\/journey\/new\/import"/);
});
