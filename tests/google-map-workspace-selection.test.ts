import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  selectedGoogleDetailForPlace,
  googleDiscoveryScopeKey,
  googleSavedReferenceSelection,
  shouldApplyGoogleDiscoveryResult,
} from "../lib/easyt/google-map-workspace-selection.ts";
import { googleCanvasPlacesForMapResults } from "../lib/easyt/google-map-result-projection.ts";
import { nativeGooglePoiSelection } from "../lib/easyt/map-workspace-selection.ts";

const parent = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const child = readFileSync(new URL("../components/easyt/map-place-enrichment.tsx", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");

test("the displayed Morrovia row and custom pin keep one stop-scoped identity while native POIs keep their exact Place ID", () => {
  const result = {
    selectionId: "result:stay:tokyo-return:hotel-42", sourceId: "hotel-42", stopId: "tokyo-return", dayNumber: 8, dayPart: null,
    name: "Hotel Tokyo", coordinates: [139.7, 35.68] as [number, number], kind: "stay" as const, state: "result" as const,
    address: "Tokyo", category: "Hotel", mapsUrl: "https://maps.example.test",
  };
  const pin = googleCanvasPlacesForMapResults([result])[0]!;
  assert.equal(pin.id, result.selectionId);
  assert.equal(pin.sourceId, result.sourceId);
  assert.equal(pin.stopId, result.stopId);
  const native = nativeGooglePoiSelection("ChIJunfetched", "tokyo-return", "day-8");
  assert.deepEqual(native, { kind: "google", placeId: "ChIJunfetched", stopId: "tokyo-return", dayId: "day-8" });
  assert.notEqual(native.placeId, pin.id, "a native POI never aliases the Morrovia result by name");
  assert.match(parent, /mapResults\.find\(\(candidate\) => candidate\.selectionId === placeId\)[\s\S]*selectMapResult\(result\)/);
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

test("production Map stories exercise native place detail, saved references and provider failure", () => {
  assert.match(stories, /const googleFixture = \{[\s\S]*detailsById/);
  assert.match(stories, /GooglePlacesEnrichmentNoMedia/);
  assert.match(stories, /GooglePlacesEnrichmentUnavailable/);
});
