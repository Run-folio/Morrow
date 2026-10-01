import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = read("components/journey-map-planner-workspace.tsx");
const refinement = read("components/journey-itinerary-refinement.tsx");
const finder = read("components/journey-local-finder.tsx");
const enrichment = read("components/easyt/map-place-enrichment.tsx");
const has = (source: string, pattern: RegExp, message: string) => assert.ok(pattern.test(source), message);
const lacks = (source: string, pattern: RegExp, message: string) => assert.ok(!pattern.test(source), message);

test("Google canvas selection changes one map panel without suppressing Morrovia inventory", () => {
  has(workspace, /googleCanvasActive \? <GoogleTripMapCanvas/, "Google remains the eligible basemap");
  has(workspace, /places=\{googleDiscoveryCategory \? \(googleNearby\?\.places/, "Nearby Google results remain map-selectable");
  has(workspace, /onNativePoi=\{selectGoogleNativePoi\}/, "native Google POIs retain their selection callback");

  has(workspace, /\{!selectedGooglePlaceId && shapeDayTab === "see" && customTrip \?/, "See inventory is present until a Google Place ID is selected");
  lacks(workspace, /\{!googleCanvasActive && shapeDayTab === "see"/, "See inventory is not gated by map provider");
  has(workspace, /\{!selectedGooglePlaceId && \(shapeDayTab === "stay" \|\| shapeDayTab === "eat"\)/, "Stay and Eat inventory is present until a Google Place ID is selected");
  lacks(workspace, /\{!googleCanvasActive && \(shapeDayTab === "stay" \|\| shapeDayTab === "eat"\)/, "Stay and Eat inventory is not gated by map provider");
  has(workspace, /\{googleCanvasActive && selectedGooglePlaceId && shapeDayTab !== "plan" && selectedTripStop \?/, "Google detail occupies the shared panel only after Google selection");
  has(workspace, /showShellContext && !selectedGooglePlaceId \? <section className=\{`\$\{styles\.mapContextPanel\}/, "the separate route context card does not duplicate Google place detail");
});

test("Google selected-place details keep enrichment identity, save and day actions", () => {
  has(workspace, /selectedGoogleDetailForPlace\(selectedGooglePlaceId, selectedGoogleDetail\)/, "detail remains keyed by exact Place ID");
  has(workspace, /onSelectPlace=\{selectGoogleDiscoveryPlace\}/, "nearby map markers use the Google selection owner");
  has(workspace, /onSelectSavedReference=\{selectGoogleSavedReference\}/, "saved references keep their existing selector");
  has(workspace, /<GoogleSavedReferenceList/, "saved Place ID references remain reachable from Morrovia inventory");
  has(workspace, /onBackToPlaces=\{\(\) => setWorkspacePlaceSelection\(\{ kind: "none" \}\)\}/, "Back to places restores discovery state");
  has(workspace, /onClick=\{addSelectedGooglePlaceToDay\}/, "existing Add to Day action remains");
  has(workspace, /onClick=\{saveSelectedGooglePlace\}/, "existing Save for later action remains");
  has(enrichment, /selectedGoogleDetailForPlace\(props\.selectedPlaceId, props\.detail\)/, "details remain scoped to selected Place ID");
  has(enrichment, /onRequestMedia/, "photo and review enrichment remains available");
});

test("Google map See and Stay retain Morrovia provider and affiliate owners", () => {
  has(refinement, /<LiveActivityInventory/, "live activity inventory remains owned by See");
  has(refinement, /<MorroviaAffiliateLink action=\{experienceAction\}/, "See partner handoff remains");
  has(refinement, /\{affiliateDisclosure\}/, "See affiliate disclosure remains");
  has(workspace, /activityAction=\{activityAction\}/, "map See receives its configured affiliate action");
  has(finder, /journey-accommodation-search/, "Stay commercial inventory remains available");
  has(finder, /getAccommodationBookingUrl/, "Stay partner action owner remains");
  has(finder, /compactAffiliateDisclosure/, "Stay affiliate disclosure remains");
  has(workspace, /mapPresentation="maplibre"/, "local finder keeps the existing provider eligibility boundary");
});
