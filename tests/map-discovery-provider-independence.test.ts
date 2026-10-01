import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = read("components/journey-map-planner-workspace.tsx");
const planWorkspace = read("components/journey-plan-workspace.tsx");
const refinement = read("components/journey-itinerary-refinement.tsx");
const finder = read("components/journey-local-finder.tsx");
const has = (source: string, pattern: RegExp, message: string) => assert.ok(pattern.test(source), message);
const lacks = (source: string, pattern: RegExp, message: string) => assert.ok(!pattern.test(source), message);

test("Google canvas selection changes one map panel without suppressing Morrovia inventory", () => {
  has(workspace, /googleCanvasActive \? <GoogleTripMapCanvas/, "Google remains the eligible basemap");
  has(workspace, /places=\{googleCanvasPlaces\}/, "Google custom pins use the displayed Morrovia result collection");
  has(workspace, /onSelectPlace=\{selectGoogleCanvasPlace\}/, "Google custom pins resolve through the parent Morrovia selection owner");
  lacks(workspace, /journey-place-enrichment\?\$\{query\}|mode: "nearby"/, "Trip Map does not fetch a competing Google Nearby inventory");
  has(workspace, /onNativePoi=\{selectGoogleNativePoi\}/, "native Google POIs retain their selection callback");

  has(workspace, /\{!selectedGooglePlaceId && shapeDayTab === "see" && customTrip \?/, "See inventory is present until a Google Place ID is selected");
  lacks(workspace, /\{!googleCanvasActive && shapeDayTab === "see"/, "See inventory is not gated by map provider");
  has(workspace, /\{!selectedGooglePlaceId && \(shapeDayTab === "stay" \|\| shapeDayTab === "eat"\)/, "Stay and Eat inventory is present until a Google Place ID is selected");
  lacks(workspace, /\{!googleCanvasActive && \(shapeDayTab === "stay" \|\| shapeDayTab === "eat"\)/, "Stay and Eat inventory is not gated by map provider");
  has(workspace, /const selectedPlaceDetail = selectedRecommendationDetail \?\? selectedGoogleRecommendationDetail/, "Google and Morrovia results share one detail projection");
  has(workspace, /const showShellContext = Boolean\([\s\S]*?hasExplicitMapContext/, "the single parent-owned map context opens for the exact selected place");
  has(workspace, /<section className=\{`\$\{styles\.mapContextPanel\}/, "the parent renders one selected-place context panel");
});

test("Google selected-place details keep enrichment identity, save and day actions", () => {
  has(workspace, /selectedGoogleDetailForPlace\(selectedGooglePlaceId, selectedGoogleDetail\)/, "detail remains keyed by exact Place ID");
  has(workspace, /onSelectPlace=\{selectGoogleCanvasPlace\}/, "Morrovia result markers use the shared map-result selection owner");
  has(workspace, /onSelectSavedReference=\{selectGoogleSavedReference\}/, "saved references keep their existing selector");
  has(workspace, /savedReferences=\{savedGoogleReferences\}/, "saved Place ID references remain reachable from the existing Plan inventory");
  has(planWorkspace, /savedReferences\.map\(\(reference\)/, "Plan renders every saved reference without moving it into finder inventory");
  has(planWorkspace, /onSelectSavedReference\(reference\.id, reference\.placeId\)/, "saved reference selection keeps its exact reference and Place ID");
  has(workspace, /onClose=\{\(\) => \{\s*if \(selectedGooglePlaceId\) \{\s*setWorkspacePlaceSelection\(\{ kind: "none" \}\)/, "closing the shared Google detail clears only selection and restores discovery state");
  has(workspace, /onClick=\{addSelectedGooglePlaceToDay\}/, "existing Add to Day action remains");
  has(workspace, /onClick=\{saveSelectedGooglePlace\}/, "existing Save for later action remains");
  has(workspace, /selectedGoogleDetailForPlace\(selectedGooglePlaceId, selectedGoogleDetail\)/, "details remain scoped to selected Place ID");
  has(workspace, /selectedGoogleDetail\.providerPlaceId !== selectedGooglePlaceId/, "rich media requires exact verified Google Place identity");
  has(workspace, /mode=reviews&\$\{query\}/, "selected Google reviews enrich the shared card automatically");
  has(workspace, /mode=photo&\$\{query\}/, "selected Google photo enriches the shared card automatically");
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
