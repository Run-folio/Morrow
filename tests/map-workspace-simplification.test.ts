import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const plan = readFileSync(new URL("../components/journey-plan-workspace.tsx", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");
const journeyStyles = readFileSync(new URL("../app/journey/journey.module.css", import.meta.url), "utf8");

function finderMarkup() {
  const start = workspace.indexOf("{showFinderDock ? <aside id=\"shape-day-workspace\"");
  const end = workspace.indexOf("</aside> : null}", start);
  assert.ok(start >= 0 && end > start, "the canonical Map finder remains owned by JourneyMapPlannerWorkspace");
  return workspace.slice(start, end);
}

test("Map finder leads with the selected destination and keeps issue inventory out of the workspace header", () => {
  const finder = finderMarkup();
  assert.match(finder, /<h2[^>]*>\{selected\.city\}<\/h2>/);
  assert.doesNotMatch(finder, /Shape the day/);
  assert.doesNotMatch(finder, /Trip status|tripIssueCount/);
  assert.match(finder, /tab === "plan" \? "Plan" : tab === "stay" \? "Stay" : tab === "eat" \? "Eat" : "See"/);
});

test("saved Google references are disclosed in the existing Plan workspace instead of as a second finder inventory", () => {
  assert.match(plan, /savedReferences\??:/);
  assert.match(plan, /Saved for later/);
  assert.match(workspace, /<PlanWorkspace[\s\S]*?savedReferences=\{savedGoogleReferences\}/);
  assert.match(workspace, /googleCanvasActive=\{googleCanvasActive\}/);
  assert.match(plan, /googleCanvasActive[\s\S]*?mapsUrl[\s\S]*?Open in Google Maps/);
  assert.match(plan, /className=\{styles\.mapPlanSavedReferenceLink\}/);
  assert.match(plan, /styles\.mapPlanSavedReferences/);
  assert.match(journeyStyles, /\.shapeDayPlan \.mapPlanSavedReferences>li\{[^}]*display:block/);
  assert.match(journeyStyles, /\.shapeDayPlan \.mapPlanSavedReferenceLink\{[^}]*display:flex[^}]*width:100%/);
  assert.match(stories, /MapPlanSavedGoogleReferenceMapLibre/);
  assert.doesNotMatch(workspace, /\{googleCanvasActive && !selectedGooglePlaceId && shapeDayTab !== "plan" \? <GoogleSavedReferenceList/);
});

test("selected Google and Morrovia results share one selected-place card owner", () => {
  assert.match(workspace, /const selectedPlaceDetail = selectedRecommendationDetail \?\? selectedGoogleRecommendationDetail/);
  assert.match(workspace, /<ItineraryItemDetail[\s\S]*?detail=\{selectedPlaceDetail\}/);
  assert.doesNotMatch(workspace, /compactMapHeader[\s\S]{0,120}detail=\{selectedPlaceDetail\}/);
  assert.doesNotMatch(workspace, /<MapPlaceEnrichment/);
  assert.match(workspace, /selectedGoogleRecommendationDetail[\s\S]*currentGoogleDetail/);
});

test("Google place media loads from deliberate selection, not a second manual content control", () => {
  assert.doesNotMatch(workspace, /Load photos and reviews/);
  assert.match(workspace, /useEffect\(\(\) => \{ setGoogleMediaRequestedPlaceId\(selectedGooglePlaceId\); \}, \[selectedGooglePlaceId\]\)/);
});

test("native POI and saved-reference selection reveal the one selected-place sheet on mobile", () => {
  const nativeSelection = workspace.slice(workspace.indexOf("const selectGoogleNativePoi ="), workspace.indexOf("const selectGoogleCanvasPlace ="));
  const savedSelection = workspace.slice(workspace.indexOf("const selectGoogleSavedReference ="), workspace.indexOf("const selectMapPlanDay ="));
  assert.match(nativeSelection, /setMobileShapeDayOpen\(false\)/);
  assert.match(savedSelection, /setMobileShapeDayOpen\(false\)/);
});
