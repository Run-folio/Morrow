import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  googleDiscoveryScopeKey,
  googlePlaceSelectionForScope,
  shouldApplyGoogleDiscoveryResult,
} from "../lib/easyt/google-map-workspace-selection.ts";

const parent = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const child = readFileSync(new URL("../components/easyt/map-place-enrichment.tsx", import.meta.url), "utf8");

test("native POI, list row and custom marker select the same exact provider ID and canonical day", () => {
  const scope = { stopId: "tokyo-return", dayId: "day-8", category: "see" as const };
  const native = googlePlaceSelectionForScope("ChIJunfetched", scope);
  const list = googlePlaceSelectionForScope("ChIJunfetched", scope);
  const marker = googlePlaceSelectionForScope("ChIJunfetched", scope);
  assert.deepEqual(native, list);
  assert.deepEqual(list, marker);
  assert.deepEqual(native, { kind: "google", placeId: "ChIJunfetched", stopId: "tokyo-return", dayId: "day-8" });
});

test("same-name occurrences and categories have separate cached result scopes", () => {
  assert.notEqual(googleDiscoveryScopeKey("tokyo-first", "see"), googleDiscoveryScopeKey("tokyo-return", "see"));
  assert.notEqual(googleDiscoveryScopeKey("tokyo-return", "see"), googleDiscoveryScopeKey("tokyo-return", "eat"));
  assert.equal(googleDiscoveryScopeKey("tokyo-return", "see"), googleDiscoveryScopeKey("tokyo-return", "see"));
  assert.equal(shouldApplyGoogleDiscoveryResult("tokyo-return:see", "tokyo-return:see"), true);
  assert.equal(shouldApplyGoogleDiscoveryResult("tokyo-first:see", "tokyo-return:see"), false);
});

test("the integrated map has one parent-owned category, selection, and detail path", () => {
  assert.match(parent, /createLatestGoogleDetailRequest/);
  assert.match(parent, /GoogleTripMapCanvas/);
  assert.match(parent, /MapPlaceEnrichment/);
  assert.doesNotMatch(parent, /Explore with Google Maps|Back to day planning/);
  assert.doesNotMatch(child, /useState|See.*Eat.*Stay.*Practical/);
  assert.match(child, /onSelectPlace/);
  assert.match(child, /onBackToPlaces/);
  assert.equal((parent.match(/id="map-contextual-sheet"/g) ?? []).length, 1);
});
