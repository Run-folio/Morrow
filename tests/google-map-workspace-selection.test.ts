import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  selectedGoogleDetailForPlace,
  googleDiscoveryScopeKey,
  googlePlaceSelectionForScope,
  googleSavedReferenceSelection,
  shouldApplyGoogleDiscoveryResult,
} from "../lib/easyt/google-map-workspace-selection.ts";

const parent = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const child = readFileSync(new URL("../components/easyt/map-place-enrichment.tsx", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");

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
  assert.notEqual(googleDiscoveryScopeKey("tokyo-return", "see", [139.7, 35.6]), googleDiscoveryScopeKey("tokyo-return", "see", [139.8, 35.6]));
  assert.equal(googleDiscoveryScopeKey("tokyo-return", "see", [139.7, 35.6]), googleDiscoveryScopeKey("tokyo-return", "see", [139.7, 35.6]));
});

test("a previous selection's detail cannot render under a newer Place ID", () => {
  const oldDetail = { providerPlaceId: "place-a", name: "A" };
  assert.equal(selectedGoogleDetailForPlace("place-b", oldDetail), null);
  assert.equal(selectedGoogleDetailForPlace("place-a", oldDetail), oldDetail);
  assert.match(child, /selectedGoogleDetailForPlace\(props\.selectedPlaceId, props\.detail\)/);
  assert.match(parent, /selectedGoogleDetailForPlace\(selectedGooglePlaceId, selectedGoogleDetail\)/);
});

test("a saved reference keeps its exact canonical idea and day instead of borrowing the currently viewed day", () => {
  assert.deepEqual(googleSavedReferenceSelection("ChIJone", "tokyo-return", "idea-day-8"), {
    kind: "google", placeId: "ChIJone", stopId: "tokyo-return", dayId: null, referenceId: "idea-day-8",
  });
  assert.match(parent, /idea\.id === workspacePlaceSelection\.referenceId/);
  assert.match(parent, /const savedGoogleReferences = customTrip && selectedTripStop[\s\S]*googlePlaceReferenceIdeas\(customTrip\.brief\.itineraryIdeas\)[\s\S]*idea\.stopId === selectedTripStop\.id/);
  assert.match(parent, /<GoogleSavedReferenceList references=\{savedGoogleReferences\}/);
  assert.match(child, /onSelect\(reference\.id, reference\.placeId\)/);
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

test("production Map stories exercise distinct scoped Delhi, Agra and Jaipur provider fixtures", () => {
  assert.match(stories, /const googleFixture = \{[\s\S]*placesByScope: fixturePlacesByScope/);
  assert.match(stories, /"delhi:see"/);
  assert.match(stories, /"agra:see"/);
  assert.match(stories, /"jaipur:see"/);
  assert.match(stories, /GooglePlacesEnrichmentNoMedia/);
  assert.match(stories, /GooglePlacesEnrichmentUnavailable/);
});
